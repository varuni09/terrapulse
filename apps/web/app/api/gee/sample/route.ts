import { NextRequest, NextResponse, connection } from "next/server";
import { ee, initializeEarthEngine } from "@/lib/gee";
import { lstImage, ndviImage, period } from "@/lib/gee-images";
import { isRange, type RangeId } from "@/lib/gee-config";

type Values = { lst_c: number | null; ndvi: number | null; water_occurrence: number | null };
type SampleResult = Values & { usedRange: RangeId | null };

// MODIS pixels are ~1 km, so points closer than ~0.01° share a value. Caching on that grid makes
// repeat clicks instant, and sharing in-flight requests stops double-clicks hitting Earth Engine twice.
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const g = globalThis as unknown as {
  __geeSampleCache?: Map<string, { v: Values; usedRange: RangeId; exp: number }>;
  __geeSampleInflight?: Map<string, Promise<SampleResult | undefined>>;
};
const cache = (g.__geeSampleCache ??= new Map());
const inflight = (g.__geeSampleInflight ??= new Map());

const r2 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function sampleAt(lat: number, lon: number, range: RangeId): Promise<Values> {
  return new Promise((resolve, reject) => {
    const waterOccurrence = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
      .select("occurrence")
      .unmask(0);
    const modisWater = ee.Image(
      ee.ImageCollection("MODIS/061/MCD12Q1").sort("system:time_start", false).first()
    ).select("LC_Type1").eq(17).multiply(100);
    const image = lstImage(range)
      .addBands(ndviImage(range))
      .addBands(waterOccurrence.max(modisWater).rename("water_occurrence"));
    const point = ee.Geometry.Point([lon, lat]);
    image
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: point.buffer(1500),
        scale: 1000,
        maxPixels: 1e5,
        bestEffort: true,
      })
      .evaluate((res: Record<string, number | null> | null, err: unknown) => {
        if (err || !res) {
          reject(err instanceof Error ? err : new Error(String(err ?? "No result from Earth Engine")));
          return;
        }
        resolve({
          lst_c: r2(res.lst),
          ndvi: r2(res.ndvi),
          water_occurrence: r2(res.water_occurrence),
        });
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
  const ranges: RangeId[] = range === "30d"
    ? ["30d", "90d", "365d"]
    : range === "90d"
      ? ["90d", "365d"]
      : range === "peak"
        ? ["peak", "365d"]
        : ["365d"];

  try {
    let values: Values | undefined;
    let usedRange: RangeId | undefined;
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) {
      const cached = hit.v as Values;
      if (cached.lst_c != null || cached.ndvi != null) {
        values = cached;
        usedRange = hit.usedRange ?? range;
      } else {
        cache.delete(key);
      }
    }

    if (!values) {
      let pending = inflight.get(key);
      if (!pending) {
        pending = (async () => {
          await initializeEarthEngine();
          let best: { values: Values; range: RangeId; score: number } | undefined;
          for (const candidate of ranges) {
            const sampled = await sampleAt(sLat, sLon, candidate);
            const score = Number(sampled.lst_c != null) + Number(sampled.ndvi != null);
            if (!best || score > best.score) best = { values: sampled, range: candidate, score };
            if (score === 2) break;
          }
          return best ? { ...best.values, usedRange: best.score > 0 ? best.range : null } : undefined;
        })();
        inflight.set(key, pending);
        pending.finally(() => inflight.delete(key)).catch(() => {});
      }
      const sampled = await pending;
      if (sampled) {
        values = { lst_c: sampled.lst_c, ndvi: sampled.ndvi, water_occurrence: sampled.water_occurrence };
        usedRange = sampled.usedRange ?? undefined;
      }
    }

    const hasData = !!values && (values.lst_c != null || values.ndvi != null);
    const water = values?.water_occurrence != null && values.water_occurrence >= 50;
    const status = hasData ? "ok" : water ? "water" : "no_data";
    const note = hasData
      ? usedRange !== range
        ? `No complete result was available for ${range}; showing the best available MODIS result for ${usedRange}.`
        : values?.lst_c == null || values?.ndvi == null
          ? `Only some metrics were available for ${usedRange}; the missing metric has no valid observation in the available periods.`
          : undefined
      : water
        ? "This location is classified as predominantly open water by the MODIS land-cover and surface-water datasets."
        : `No valid MODIS observations were found. Tried ${ranges.map((candidate) => `${candidate} (${period(candidate).start} to ${period(candidate).end})`).join(", ")}; cloud masking or a product-data gap may be responsible.`;

    if (hasData && values && usedRange) {
      cache.set(key, { v: values, usedRange, exp: Date.now() + TTL_MS });
      if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    }

    return NextResponse.json(
      {
        latitude: lat,
        longitude: lon,
        range,
        usedRange: usedRange ?? null,
        fallback: !!usedRange && usedRange !== range,
        attemptedRanges: ranges,
        period: usedRange ? period(usedRange) : period(range),
        data: values ? { lst_c: values.lst_c, ndvi: values.ndvi } : null,
        status,
        ...(note ? { note } : {}),
      },
      { headers: { "Cache-Control": hasData ? "private, max-age=3600" : "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Earth Engine sample error:", { lat, lon, range, key, error });
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Unable to sample Earth Engine.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}