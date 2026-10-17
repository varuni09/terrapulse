"""Load the hex grid into PostGIS `areas` (city row + hex rows).
Usage: DATABASE_URL=postgresql://... python -m pipelines.ingestion.load_areas [res]
"""
import json
import os
import sys

import psycopg

res = int(sys.argv[1]) if len(sys.argv) > 1 else 8
url = os.environ.get("DATABASE_URL", "postgresql://terrapulse:change_me@localhost:5432/terrapulse")
fc = json.load(open(f"data/boundaries/chennai_h3_res{res}.geojson"))

with psycopg.connect(url) as conn, conn.cursor() as cur:
    for f in fc["features"]:
        cur.execute(
            """INSERT INTO areas (code, name, kind, geom)
               VALUES (%s, %s, 'hex', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
               ON CONFLICT (code) DO NOTHING""",
            (f["properties"]["id"], f"H3 r{res} {f['properties']['id']}", json.dumps(f["geometry"])),
        )
    cur.execute(
        """INSERT INTO areas (code, name, kind, geom)
           SELECT 'chennai', 'Chennai', 'city', ST_Multi(ST_Union(geom)) FROM areas WHERE kind='hex'
           ON CONFLICT (code) DO NOTHING"""
    )
    cur.execute(
        """UPDATE areas SET parent_id = (SELECT id FROM areas WHERE code='chennai')
           WHERE kind='hex' AND parent_id IS NULL"""
    )
    conn.commit()
print(f"Loaded {len(fc['features'])} hex cells.")
