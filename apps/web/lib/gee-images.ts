import { ee, initializeEarthEngine } from "@/lib/gee";
import { EQUITY_W, NDVI_MAX, PALETTES, RANGES, type LayerId, type RangeId } from "@/lib/gee-config";

/**
 * NASA MODIS images, cheap for Earth Engine to render (1 km pixels).
 *  - Short windows (7 and 30 days) use the DAILY land-temperature product (MOD11A1), which is only
 *    about 1-3 days behind real time. Long windows use 8-day composites (MOD11A2), which are cheaper
 *    but lag by roughly 10 days because a composite only appears once its 8 days are complete.
 *  - NDVI only exists as a 16-day product, so it always lags more and short windows look back ~35 days.
 * Used by BOTH the tiles route and the sample route so the numbers match the map.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

type Source = { id: string; band: string; label: string };

function lstSource(range: RangeId): Source {
  return range === "7d" || range === "30d"
    ? { id: "MODIS/061/MOD11A1", band: "LST_Day_1km", label: "MODIS daily (MOD11A1)" }
    : { id: "MODIS/061/MOD11A2", band: "LST_Day_1km", label: "MODIS 8-day composite (MOD11A2)" };
}
const NDVI_SOURCE: Source = { id: "MODIS/061/MOD13A2", band: "NDVI", label: "MODIS 16-day composite (MOD13A2)" };

function windowFor(range: RangeId, kind: "lst" | "ndvi") {
  const days = kind === "ndvi" ? Math.max(RANGES[range].days, 35) : RANGES[range].days;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  const endExclusive = new Date();
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1); // filterDate's end is exclusive; include today
  return { start: iso(start), endExclusive: iso(endExclusive), end: iso(new Date()) };
}

/** The date window being averaged. This is the search window, not the age of the data: see latestObservation(). */
export function period(range: RangeId, kind: "lst" | "ndvi" = "lst") {
  const w = windowFor(range, kind);
  return { start: w.start, end: w.end };
}

function collection(src: Source, range: RangeId, kind: "lst" | "ndvi") {
  const { start, endExclusive } = windowFor(range, kind);
  return ee.ImageCollection(src.id).filterDate(start, endExclusive).select(src.band);
}

function reduce(col: any, range: RangeId) {
  return RANGES[range].stat === "peak" ? col.max() : col.mean();
}

/** Daytime land surface temperature in °C (scale 0.02 K in both MOD11A1 and MOD11A2). */
export function lstImage(range: RangeId) {
  return reduce(collection(lstSource(range), range, "lst"), range).multiply(0.02).subtract(273.15).rename("lst");
}

/** Vegetation index 0..1 (MOD13A2 scale 0.0001). */
export function ndviImage(range: RangeId) {
  return reduce(collection(NDVI_SOURCE, range, "ndvi"), range).multiply(0.0001).rename("ndvi");
}

/** Heat equity risk 0..100, same formula as equityScore() in gee-config.ts. */
export function equityImage(range: RangeId) {
  const { lstMin, lstMax } = RANGES[range];
  const hot = lstImage(range).subtract(lstMin).divide(lstMax - lstMin).clamp(0, 1);
  const green = ndviImage(range).divide(NDVI_MAX).clamp(0, 1);
  const bare = ee.Image(1).subtract(green);
  return hot.multiply(EQUITY_W.heat).add(bare.multiply(EQUITY_W.bare)).multiply(100).rename("equity");
}

export function imageFor(layer: LayerId, range: RangeId) {
  if (layer === "ndvi") return ndviImage(range);
  if (layer === "equity") return equityImage(range);
  return lstImage(range);
}

/** Colour ranges match the legend on the Explore page. */
export function visFor(layer: LayerId, range: RangeId) {
  if (layer === "ndvi") return { min: 0, max: NDVI_MAX, palette: PALETTES.ndvi };
  if (layer === "equity") return { min: 0, max: 100, palette: PALETTES.equity };
  return { min: RANGES[range].lstMin, max: RANGES[range].lstMax, palette: PALETTES.lst };
}

/**
 * The date of the NEWEST satellite image actually available for this range (what you should show users
 * as "how fresh is this"), plus which product it came from. Cached for 30 minutes.
 */
const g = globalThis as unknown as { __geeLatest?: Map<string, { v: { date: string | null; source: string }; exp: number }> };
const latestCache = (g.__geeLatest ??= new Map());

export async function latestObservation(range: RangeId): Promise<{ date: string | null; source: string }> {
  const hit = latestCache.get(range);
  if (hit && hit.exp > Date.now()) return hit.v;

  await initializeEarthEngine();
  const src = lstSource(range);
  const { start, endExclusive } = windowFor(range, "lst");
  const col = ee.ImageCollection(src.id).filterDate(start, endExclusive);

  const ms = await new Promise<number | null>((resolve, reject) => {
    col.aggregate_max("system:time_start").evaluate((res: number | null, err: unknown) => {
      if (err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve(typeof res === "number" ? res : null);
    });
  });

  const v = { date: ms != null ? iso(new Date(ms)) : null, source: src.label };
  if (v.date) latestCache.set(range, { v, exp: Date.now() + 30 * 60 * 1000 });
  return v;
}