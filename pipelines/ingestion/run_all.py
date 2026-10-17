"""Run grid + Landsat for several cities, then rebuild the city registry the web app reads.
Usage: python -m pipelines.ingestion.run_all [city ...] [--max-scenes 2] [--max-cloud 30] [--start D] [--end D]"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from pipelines.ingestion.cities import CITIES

W = Path("apps/web/public/data")


def run(module, *args):
    return subprocess.run([sys.executable, "-m", module, *args]).returncode == 0


def migrate_chennai():  # earlier versions wrote to public/data/obs
    old, new = W / "obs", W / "cities/chennai/obs"
    if old.exists() and not new.exists():
        new.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(old), str(new))
        print("moved existing Chennai observations to", new)


def registry():
    out = []
    for code, c in CITIES.items():
        idx = W / f"cities/{code}/obs/index.json"
        if idx.exists() and json.loads(idx.read_text()):
            s, w, n, e = c["bbox"]
            out.append({"code": code, "name": c["name"], "country": c["country"],
                        "center": [round((w + e) / 2, 4), round((s + n) / 2, 4)], "zoom": 10.3})
    (W / "cities.json").write_text(json.dumps(out, indent=1))
    print("registry:", [c["code"] for c in out])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cities", nargs="*")
    ap.add_argument("--max-scenes", default="2")
    ap.add_argument("--max-cloud", default="30")
    ap.add_argument("--start", default="2023-01-01")
    ap.add_argument("--end", default="2025-12-31")
    a = ap.parse_args()
    migrate_chennai()
    results = {}
    for code in a.cities or list(CITIES):
        print(f"\n=== {code} ===")
        ok = run("pipelines.ingestion.make_hex_grid", code) and run(
            "pipelines.ingestion.landsat_scene", "--city", code, "--max-scenes", a.max_scenes,
            "--max-cloud", a.max_cloud, "--start", a.start, "--end", a.end)
        results[code] = "ok" if ok else "FAILED"
    registry()
    print("\nSummary:", results)
