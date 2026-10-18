import { NextRequest, NextResponse, connection } from "next/server";
import { ee, initializeEarthEngine } from "@/lib/gee";
import { lstImage, ndviImage, period } from "@/lib/gee-images";
import { isRange, type RangeId } from "@/lib/gee-config";

type Values = { lst_c: number | null; ndvi: number | null };

// MODIS pixels are ~1 km, so points closer than ~0.01° share a value. Caching on that grid makes
// repeat clicks instant, and sharing in-flight requests stops double-clicks hitting Earth Engine twice.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const g = globalThis as unknown as {
  __geeSampleCache?: Map<string, { v: Values; exp: number }>;
  __geeSampleInflight?: Map<string, Promise<Values>>;
};
const cache = (g.__geeSampleCache ??= new Map());
const inflight = (g.__geeSampleInflight ??= new Map());

const r2 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function sampleAt(lat: number, lon: number, range: RangeId): Promise<Values> {
  return new Promise((resolve, reject) => {
    // both bands in ONE request instead of two round trips
    const image = lstImage(range).addBands(ndviImage(range));
    image
      .reduceRegion({
        reducer: ee.Reducer.first(),
        geometry: ee.Geometry.Point([lon, lat]),
        scale: 1000,
        maxPixels: 1e6,
      })
      .evaluate((res: Record<string, number | null> | null, err: unknown) => {
        if (err || !res) {
          reject(err instanceof Error ? err : new Error(String(err ?? "No result from Earth Engine")));
          return;
        }
        resolve({ lst_c: r2(res.lst), ndvi: r2(res.ndvi) });
      });
  });
}

export async function GET(request: NextRequest) {
  // Opt in to request-time rendering. With cacheComponents, a GET handler that never reads the request
  // would otherwise be prerendered at build time and its result frozen.
  await connection();
  const sp = new URL(request.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const rangeParam = sp.get("range") ?? "30d";

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat and lon must be valid coordinates" }, { status: 400 });
  }
  if (!isRange(rangeParam)) {
    return NextResponse.json({ error: "range must be 30d, 90d, 365d or peak" }, { status: 400 });
  }
  const range: RangeId = rangeParam;

  // snap to the ~1 km grid so the cache key and the sampled point agree
  const sLat = Math.round(lat * 100) / 100;
  const sLon = Math.round(lon * 100) / 100;
  const key = `${range}:${sLat},${sLon}`;

  try {
    let values: Values;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) {
      values = hit.v;
    } else {
      let pending = inflight.get(key);
      if (!pending) {
        pending = (async () => {
          await initializeEarthEngine();
          return sampleAt(sLat, sLon, range);
        })();
        inflight.set(key, pending);
        pending.finally(() => inflight.delete(key)).catch(() => {});
      }
      values = await pending;
      cache.set(key, { v: values, exp: Date.now() + TTL_MS });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    }

    const empty = values.lst_c == null && values.ndvi == null;
    return NextResponse.json(
      {
        latitude: lat,
        longitude: lon,
        range,
        period: period(range),
        data: values,
        ...(empty ? { note: "No satellite data at this location (cloud cover or open water)." } : {}),
      },
      { headers: { "Cache-Control": "private, max-age=3600" } }
    );
  } catch (error) {
    console.error("Earth Engine sample error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Unable to sample Earth Engine.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}