"""H3 grid for any registered city. Usage: python -m pipelines.ingestion.make_hex_grid <city> [res]"""
import json
import sys
from pathlib import Path

import h3

from pipelines.ingestion.cities import CITIES


def build(code: str, res: int = 8) -> dict:
    s, w, n, e = CITIES[code]["bbox"]
    ring = [[w, s], [e, s], [e, n], [w, n], [w, s]]  # GeoJSON order: lon, lat
    cells = h3.geo_to_cells({"type": "Polygon", "coordinates": [ring]}, res)
    assert len(cells) < 8000, f"{len(cells)} cells is too many; shrink the bbox or lower the resolution"
    feats = []
    for c in sorted(cells):
        lat, lon = h3.cell_to_latlng(c)
        b = [[lng, la] for la, lng in h3.cell_to_boundary(c)]
        b.append(b[0])
        feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [b]},
                      "properties": {"id": c, "resolution": res, "city": code,
                                     "area_km2": round(h3.cell_area(c, unit="km^2"), 4),
                                     "lat": round(lat, 5), "lon": round(lon, 5)}})
    return {"type": "FeatureCollection", "features": feats}


if __name__ == "__main__":
    code = sys.argv[1] if len(sys.argv) > 1 else "chennai"
    res = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    fc = build(code, res)
    for out in (Path(f"data/boundaries/{code}_h3_res{res}.geojson"), Path(f"apps/web/public/data/cities/{code}/grid.geojson")):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(fc))
    print(f"{code}: {len(fc['features'])} cells")
