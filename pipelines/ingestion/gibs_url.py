"""Read NASA GIBS's own WMTS description and write public/data/world.json (tile URL for the globe layer).
Usage: python -m pipelines.ingestion.gibs_url [layer_id]
This is a coarse (~1 km) colour-mapped VISUALISATION for global context, not analysis data."""
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

CAPS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/all/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities"
DEFAULT_LAYER = "MODIS_Terra_L3_Land_Surface_Temp_8Day_Day_v6_STD"
NS = {"w": "http://www.opengis.net/wmts/1.0", "o": "http://www.opengis.net/ows/1.1"}


def parse(xml_bytes: bytes, layer_id: str, tms: str = "GoogleMapsCompatible_Level7"):
    root = ET.fromstring(xml_bytes)
    ids = []
    for lay in root.iter("{%s}Layer" % NS["w"]):
        ident = lay.findtext("o:Identifier", namespaces=NS)
        ids.append(ident)
        if ident != layer_id:
            continue
        res = next(r for r in lay.findall("w:ResourceURL", NS) if r.get("resourceType") == "tile")
        dim = lay.find("w:Dimension", NS)
        time = dim.findtext("w:Default", namespaces=NS) if dim is not None else None
        url = res.get("template")
        if time:
            url = url.replace("{Time}", time)
        url = (url.replace("{TileMatrixSet}", tms).replace("{TileMatrix}", "{z}")
                  .replace("{TileRow}", "{y}").replace("{TileCol}", "{x}"))
        return {"layer": layer_id, "tiles": url, "date": time, "maxzoom": int(tms[-1]),
                "attribution": "NASA EOSDIS GIBS · MODIS Terra land surface temperature (visualisation)"}
    lst = [i for i in ids if i and "Land_Surface_Temp" in i]
    raise SystemExit(f"Layer {layer_id!r} not found. Available LST layers:\n  " + "\n  ".join(lst[:30]))


if __name__ == "__main__":
    layer = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LAYER
    info = parse(urllib.request.urlopen(CAPS, timeout=60).read(), layer)
    out = Path("apps/web/public/data/world.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(info, indent=1))
    print("wrote", out, "\n", info["tiles"])
