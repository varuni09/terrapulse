import { ee } from "@/lib/gee";
import { EQUITY_W, NDVI_MAX, PALETTES, RANGES, type LayerId, type RangeId } from "@/lib/gee-config";

/**
 * Pre-aggregated MODIS composites: cheap for Earth Engine to render (1 km pixels, 8/16-day
 * products). Used by BOTH the tiles route and the sample route so the numbers match the map.
 */

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** Window ends ~10 days ago because MODIS products lag real time. */
export function period(range: RangeId) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 10);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - RANGES[range].days);
  return { start: iso(start), end: iso(end) };
}

function modis(collectionId: string, band: string, range: RangeId) {
  const { start, end } = period(range);
  const collection = ee.ImageCollection(collectionId).filterDate(start, end).select(band);
  return RANGES[range].stat === "peak" ? collection.max() : collection.mean();
}

/** Daytime land surface temperature in °C (MOD11A2 scale 0.02 K). */
export function lstImage(range: RangeId) {
  return modis("MODIS/061/MOD11A2", "LST_Day_1km", range)
    .multiply(0.02)
    .subtract(273.15)
    .rename("lst");
}

/** Vegetation index 0..1 (MOD13A2 scale 0.0001). */
export function ndviImage(range: RangeId) {
  return modis("MODIS/061/MOD13A2", "NDVI", range).multiply(0.0001).rename("ndvi");
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