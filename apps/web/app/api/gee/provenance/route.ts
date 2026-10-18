import { NextResponse, connection } from "next/server";
import { ee, initializeEarthEngine } from "@/lib/gee";

/**
 * Real provenance + metrics for the LATEST CLEAR Landsat 8/9 pass over a point.
 * This is as recent as Earth Engine gets at 30 m: typically a few days to ~2 weeks old, never live.
 */

const SEARCH_DAYS = 90; // how far back to look for a usable scene
const MAX_CLOUD = 30; // scene-level cloud cover limit (%)
const DEFAULT = { lat: 13.0827, lon: 80.2707 }; // Chennai, used when the caller sends no coordinates

type Raw = {
  found: number;
  date?: string;
  cloud?: number | null;
  spacecraft?: string | null;
  sceneId?: string | null;
  lst?: number | null;
  ndvi?: number | null;
  valid?: number | null;
};

// Cache by ~1 km grid + radius for 30 minutes, and share in-flight requests.
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 200;
const g = globalThis as unknown as {
  __geeProvCache?: Map<string, { v: Raw; exp: number }>;
  __geeProvInflight?: Map<string, Promise<Raw>>;
};
const cache = (g.__geeProvCache ??= new Map());
const inflight = (g.__geeProvInflight ??= new Map());

/** Drop cloud, cirrus, cloud shadow (QA_PIXEL bits 1, 2, 3, 4). */
function maskClear(img: any) {
  const qa = img.select("QA_PIXEL");
  const clear = qa
    .bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 2).eq(0))
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0));
  return img.updateMask(clear);
}

function query(lat: number, lon: number, radius: number): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const point = ee.Geometry.Point([lon, lat]);
    const region = point.buffer(radius);
    const end = ee.Date(Date.now());
    const start = end.advance(-SEARCH_DAYS, "day");

    const col = ee
      .ImageCollection("LANDSAT/LC08/C02/T1_L2")
      .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
      .filterBounds(point)
      .filterDate(start, end)
      .filter(ee.Filter.lt("CLOUD_COVER", MAX_CLOUD))
      .sort("system:time_start", false); // newest first

    const latest = ee.Image(col.first());
    const clear = maskClear(latest);

    // Collection 2 Level-2 scale factors
    const lst = clear.select("ST_B10").multiply(0.00341802).add(149.0).subtract(273.15).rename("lst");
    const nir = clear.select("SR_B5").multiply(0.0000275).add(-0.2);
    const red = clear.select("SR_B4").multiply(0.0000275).add(-0.2);
    const ndvi = nir.subtract(red).divide(nir.add(red)).rename("ndvi");

    const opts = { geometry: region, scale: 30, maxPixels: 1e8, bestEffort: true };
    const stats = lst.addBands(ndvi).reduceRegion({ reducer: ee.Reducer.mean(), ...opts });
    const valid = lst.mask().reduceRegion({ reducer: ee.Reducer.mean(), ...opts }); // share of non-cloudy pixels

    const result = ee.Dictionary(
      ee.Algorithms.If(
        col.size().gt(0),
        ee.Dictionary({
          found: 1,
          date: latest.date().format("YYYY-MM-dd"),
          cloud: latest.get("CLOUD_COVER"),
          spacecraft: latest.get("SPACECRAFT_ID"),
          sceneId: latest.get("LANDSAT_PRODUCT_ID"),
          lst: stats.get("lst"),
          ndvi: stats.get("ndvi"),
          valid: valid.get("lst"),
        }),
        ee.Dictionary({ found: 0 })
      )
    );

    const timer = setTimeout(() => reject(new Error("Earth Engine took too long (25 s).")), 25_000);
    result.evaluate((res: Raw | null, err: unknown) => {
      clearTimeout(timer);
      if (err || !res) {
        reject(err instanceof Error ? err : new Error(String(err ?? "No result from Earth Engine")));
        return;
      }
      resolve(res);
    });
  });
}

const num = (n: unknown, dp: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : null;

export async function GET(request: Request) {
  // Opt in to request-time rendering. With cacheComponents, a GET handler that never reads the request
  // would otherwise be prerendered at build time and its result frozen.
  await connection();
  const sp = new URL(request.url).searchParams;
  const lat = sp.has("lat") ? Number(sp.get("lat")) : DEFAULT.lat;
  const lon = sp.has("lon") ? Number(sp.get("lon")) : DEFAULT.lon;
  const radius = Math.min(5000, Math.max(250, Number(sp.get("radius") ?? 1500) || 1500));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ success: false, error: "lat and lon must be valid coordinates" }, { status: 400 });
  }

  const key = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100},${radius}`;

  try {
    let raw: Raw;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) {
      raw = hit.v;
    } else {
      let pending = inflight.get(key);
      if (!pending) {
        pending = (async () => {
          await initializeEarthEngine();
          return query(lat, lon, radius);
        })();
        inflight.set(key, pending);
        pending.finally(() => inflight.delete(key)).catch(() => {});
      }
      raw = await pending;
      cache.set(key, { v: raw, exp: Date.now() + TTL_MS });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    }

    if (!raw.found) {
      return NextResponse.json({
        success: false,
        reason: `No Landsat 8/9 scene under ${MAX_CLOUD}% cloud in the last ${SEARCH_DAYS} days at this location.`,
        area: { lat, lon, radius_m: radius },
      });
    }

    const sat = raw.spacecraft === "LANDSAT_9" ? "Landsat 9" : "Landsat 8";
    return NextResponse.json({
      success: true,
      provenance: {
        dataset: `${sat} Collection 2 Level-2`,
        observation_date: raw.date ?? null,
        cloud_cover_percent: num(raw.cloud, 1), // whole-scene cloud cover
        spatial_resolution: "30 m (thermal resampled from 100 m)",
        processing_level: "Surface temperature and surface reflectance, cloud-masked",
        spacecraft: raw.spacecraft ?? null,
        scene_id: raw.sceneId ?? null,
        search_window_days: SEARCH_DAYS,
      },
      metrics: {
        mean_lst_celsius: num(raw.lst, 1),
        mean_ndvi: num(raw.ndvi, 3),
        valid_pixels_pct: raw.valid == null ? null : num(raw.valid * 100, 1), // clear pixels inside the area
      },
      area: { lat, lon, radius_m: radius },
    });
  } catch (error) {
    console.error("Earth Engine provenance error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: "Unable to read the latest Landsat scene.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}