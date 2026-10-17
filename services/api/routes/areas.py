import os

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/v1")

SQL = """
SELECT json_build_object(
  'type', 'FeatureCollection',
  'features', COALESCE(json_agg(json_build_object(
      'type', 'Feature', 'id', code,
      'geometry', ST_AsGeoJSON(geom)::json,
      'properties', json_build_object('id', code, 'name', name))), '[]'::json))
FROM areas
WHERE kind = %s AND parent_id = (SELECT id FROM areas WHERE code = %s)
"""


@router.get("/areas")
def areas(city: str = Query("chennai", max_length=40), kind: str = Query("hex", pattern="^(hex|neighborhood)$")):
    import psycopg  # imported lazily so unit tests run without a DB driver

    try:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn, conn.cursor() as cur:
            cur.execute(SQL, (kind, city))
            return cur.fetchone()[0]
    except KeyError:
        raise HTTPException(503, "DATABASE_URL is not configured")
    except psycopg.Error as e:
        raise HTTPException(503, f"Database unavailable: {type(e).__name__}")
