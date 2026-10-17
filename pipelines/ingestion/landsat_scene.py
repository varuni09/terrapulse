"""Find low-cloud Landsat 8/9 scenes over the Chennai grid, compute LST + NDVI, aggregate per hex.

Usage:
  python -m pipelines.ingestion.landsat_scene --start 2024-01-01 --end 2025-12-31 --max-cloud 30 --max-scenes 3

Data: Landsat Collection 2 Level-2 via Microsoft Planetary Computer (STAC). Check current terms of use.
"""
import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import planetary_computer
import rasterio
from pystac_client import Client
from rasterio import windows
from rasterio.features import rasterize
from rasterio.warp import transform_bounds, transform_geom

from pipelines.indices.ndvi import ndvi
from pipelines.ingestion.cities import CITIES
from pipelines.preprocessing.aggregate import aggregate_by_cell
from pipelines.preprocessing.landsat import lst_celsius, qa_masks, reflectance

STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
PROCESSING_VERSION = "0.1.0"
MIN_ELIGIBLE_PIXELS = 20      # cells with fewer land pixels (e.g. mostly sea) are skipped
MIN_VALID_FRACTION = 0.5      # below this a cell's value is stored as missing


def read_band(href, bbox):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(href) as src:
            b = transform_bounds("EPSG:4326", src.crs, *bbox)
            win = windows.from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
            return src.read(1, window=win), src.window_transform(win), src.crs


def process(item, features, bbox):
    started = datetime.now(timezone.utc)
    a = item.assets
    qa, transform, crs = read_band(a["qa_pixel"].href, bbox)
    st, _, _ = read_band(a["lwir11"].href, bbox)
    red, _, _ = read_band(a["red"].href, bbox)
    nir, _, _ = read_band(a["nir08"].href, bbox)
    assert qa.shape == st.shape == red.shape == nir.shape, "bands are not on the same grid"

    m = qa_masks(qa)
    eligible = ~m["fill"] & ~m["water"]
    lst = lst_celsius(st)
    valid_lst = eligible & m["clear"] & np.isfinite(lst)
    r, n = reflectance(red), reflectance(nir)
    nd = ndvi(n, r, valid=eligible & m["clear"] & np.isfinite(r) & np.isfinite(n))
    valid_nd = np.isfinite(nd)

    shapes = [(transform_geom("EPSG:4326", crs, f["geometry"]), i) for i, f in enumerate(features)]
    ids = rasterize(shapes, out_shape=qa.shape, transform=transform, fill=-1, dtype="int32")

    nc = len(features)
    l_mean, l_med, l_p90, l_nv, n_elig = aggregate_by_cell(ids, lst, valid_lst, eligible, nc)
    v_mean, _, _, v_nv, _ = aggregate_by_cell(ids, nd, valid_nd, eligible, nc)

    date = item.datetime.date().isoformat()
    cells, rows = {}, []
    for i, f in enumerate(features):
        if n_elig[i] < MIN_ELIGIBLE_PIXELS:
            continue
        fl, fv = l_nv[i] / n_elig[i], v_nv[i] / n_elig[i]
        ok_l, ok_v = fl >= MIN_VALID_FRACTION, fv >= MIN_VALID_FRACTION
        cid = f["properties"]["id"]
        cells[cid] = {
            "lst_mean": round(float(l_mean[i]), 2) if ok_l else None,
            "lst_median": round(float(l_med[i]), 2) if ok_l else None,
            "lst_p90": round(float(l_p90[i]), 2) if ok_l else None,
            "ndvi_mean": round(float(v_mean[i]), 3) if ok_v else None,
            "valid_fraction_lst": round(float(fl), 3),
            "valid_fraction_ndvi": round(float(fv), 3),
        }
        for metric, unit, val, frac, ok in (
            ("lst_mean", "degC", l_mean[i], fl, ok_l), ("lst_p90", "degC", l_p90[i], fl, ok_l),
            ("ndvi_mean", "index", v_mean[i], fv, ok_v)):
            rows.append([cid, metric, round(float(val), 4) if ok else "", unit, date,
                         "landsat-c2-l2", PROCESSING_VERSION, round(float(frac), 4)])

    lst_vals = np.array([c["lst_mean"] for c in cells.values() if c["lst_mean"] is not None])
    nd_vals = np.array([c["ndvi_mean"] for c in cells.values() if c["ndvi_mean"] is not None])
    rng = lambda v, d: [round(float(np.percentile(v, 5)), 2), round(float(np.percentile(v, 95)), 2)] if len(v) else d
    props = item.properties
    obs = {
        "scene_id": item.id, "date": date, "platform": props.get("platform"),
        "cloud_cover_scene": props.get("eo:cloud_cover"), "processing_version": PROCESSING_VERSION,
        "ranges": {"lst": rng(lst_vals, [25, 45]), "ndvi": rng(nd_vals, [0, 0.6])},
        "cells": cells,
    }
    warnings = []
    if props.get("eo:cloud_cover", 0) > 20:
        warnings.append("Scene-wide cloud cover above 20%; per-pixel QA masking applied.")
    published = sum(c["lst_mean"] is not None for c in cells.values())
    if published < 0.5 * len(cells):
        warnings.append("Fewer than half of cells have a valid LST value.")
    manifest = {
        "scene_id": item.id, "source": "landsat-c2-l2 (Microsoft Planetary Computer)", "date": date,
        "platform": props.get("platform"), "crs": str(crs), "processing_version": PROCESSING_VERSION,
        "params": {"min_eligible_pixels": MIN_ELIGIBLE_PIXELS, "min_valid_fraction": MIN_VALID_FRACTION,
                   "bbox": bbox, "excluded": "fill, cloud, dilated cloud, cirrus, shadow, snow, water"},
        "pixels": {"total": int(qa.size), "eligible": int(eligible.sum()),
                   "valid_lst": int(valid_lst.sum()), "valid_ndvi": int(valid_nd.sum()),
                   "invalid": int(qa.size - valid_lst.sum())},
        "cells": {"with_data": len(cells), "published_lst": published},
        "started_at": started.isoformat(), "ended_at": datetime.now(timezone.utc).isoformat(),
        "status": "succeeded", "warnings": warnings,
    }
    return obs, rows, manifest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2024-01-01")
    ap.add_argument("--end", default="2025-12-31")
    ap.add_argument("--max-cloud", type=float, default=30)
    ap.add_argument("--max-scenes", type=int, default=3)
    ap.add_argument("--city", default="chennai")
    ap.add_argument("--months", default="", help="e.g. 6,7,8 (default: the city's suggested season)")
    args = ap.parse_args()

    city = args.city
    features = json.loads(Path(f"data/boundaries/{city}_h3_res8.geojson").read_text())["features"]
    xs = [x for f in features for x, _ in f["geometry"]["coordinates"][0]]
    ys = [y for f in features for _, y in f["geometry"]["coordinates"][0]]
    bbox = [min(xs), min(ys), max(xs), max(ys)]

    catalog = Client.open(STAC_URL, modifier=planetary_computer.sign_inplace)
    search = catalog.search(collections=["landsat-c2-l2"], bbox=bbox,
                            datetime=f"{args.start}/{args.end}",
                            query={"eo:cloud_cover": {"lt": args.max_cloud}})
    items = [i for i in search.items()
             if i.properties.get("platform") in ("landsat-8", "landsat-9")
             and i.bbox[0] <= bbox[0] and i.bbox[1] <= bbox[1] and i.bbox[2] >= bbox[2] and i.bbox[3] >= bbox[3]]
    months = [int(m) for m in args.months.split(",")] if args.months else CITIES.get(city, {}).get("months")
    if months:
        items = [i for i in items if i.datetime.month in months]
    if not items:
        print("No single Landsat scene covers this bbox in that season/cloud limit. Try --max-cloud 50, other --months, or a smaller bbox.")
    items.sort(key=lambda i: i.properties.get("eo:cloud_cover", 100))
    print(f"{len(items)} candidate scenes; processing up to {args.max_scenes}")

    out_web = Path(f"apps/web/public/data/cities/{city}/obs")
    out_web.mkdir(parents=True, exist_ok=True)
    index = []
    for item in items[: args.max_scenes]:
        try:
            obs, rows, manifest = process(item, features, bbox)
        except Exception as e:  # keep going; record the failure
            print(f"FAILED {item.id}: {e}")
            continue
        d = Path("data/processed") / city / item.id
        d.mkdir(parents=True, exist_ok=True)
        with open(d / "observations.csv", "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["area_code", "metric", "value", "unit", "observation_date", "dataset", "processing_version", "valid_pixel_fraction"])
            w.writerows(rows)
        (d / "manifest.json").write_text(json.dumps(manifest, indent=2))
        (out_web / f"{item.id}.json").write_text(json.dumps(obs))
        index.append({"file": f"{item.id}.json", "date": obs["date"], "scene_id": item.id,
                      "cloud_cover_scene": obs["cloud_cover_scene"],
                      "published_lst_cells": manifest["cells"]["published_lst"]})
        print(f"OK {item.id} {obs['date']} cloud={obs['cloud_cover_scene']}% lst_cells={manifest['cells']['published_lst']}")

    index.sort(key=lambda r: -r["published_lst_cells"])  # best coverage first; the map loads index[0]
    (out_web / "index.json").write_text(json.dumps(index, indent=2))


if __name__ == "__main__":
    main()
