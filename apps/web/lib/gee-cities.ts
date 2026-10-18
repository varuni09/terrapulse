import { ee, initializeEarthEngine } from "@/lib/gee";
import { lstImage, ndviImage, period } from "@/lib/gee-images";

/**
 * Satellite metrics for a list of cities, computed in ONE Earth Engine request.
 *  - ndvi : mean NDVI within CORE_M of the centre            (NASA MODIS MOD13A2, last 12 months)
 *  - uhi  : urban-core mean daytime LST minus a rural ring   (NASA MODIS MOD11A2, last 12 months)
 * The rural ring (RING_IN..RING_OUT) excludes water and built-up land cover so coastal cities
 * (Mumbai, Sydney...) are not skewed by the sea. Elevation differences are NOT corrected.
 */

const CORE_M = 5_000;
const RING_IN = 15_000;
const RING_OUT = 30_000;

export type CityMetrics = {
  name: string;
  ndvi: number | null;
  lstSat: number | null; // urban-core mean daytime surface temperature, °C
  ruralLst: number | null;
  uhi: number | null; // °C, can be negative (a "cool island" in arid surroundings)
};

export type CitiesPayload = {
  ok: true;
  source: string;
  period: { start: string; end: string };
  coreKm: number;
  ringKm: [number, number];
  updatedAt: string;
  cities: CityMetrics[];
};

function evaluate<T>(obj: any, ms = 150_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Earth Engine took too long")), ms);
    obj.evaluate((res: T | null, err: unknown) => {
      clearTimeout(timer);
      if (err || !res) reject(err instanceof Error ? err : new Error(String(err ?? "No result from Earth Engine")));
      else resolve(res);
    });
  });
}

const round = (n: unknown, dp: number) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10 ** dp) / 10 ** dp : null;

export async function computeCityMetrics(cities: { name: string; lat: number; lon: number }[]): Promise<CitiesPayload> {
  await initializeEarthEngine();

  const fc = ee.FeatureCollection(
    cities.map((c) => ee.Feature(ee.Geometry.Point([c.lon, c.lat]), { name: c.name }))
  );

  const lst = lstImage("365d");
  const ndvi = ndviImage("365d");
  const landCover = ee.ImageCollection("MODIS/061/MCD12Q1").sort("system:time_start", false).first().select("LC_Type1");
  const notWater = landCover.neq(17);
  const ruralMask = notWater.and(landCover.neq(13)); // not water, not urban

  const core = fc.map((f: any) => ee.Feature(f.geometry().buffer(CORE_M), { name: f.get("name") }));
  const ring = fc.map((f: any) =>
    ee.Feature(f.geometry().buffer(RING_OUT).difference(f.geometry().buffer(RING_IN)), { name: f.get("name") })
  );

  const coreStats = lst
    .addBands(ndvi)
    .updateMask(notWater)
    .reduceRegions({ collection: core, reducer: ee.Reducer.mean(), scale: 1000, tileScale: 4 })
    .select(["name", "lst", "ndvi"], null, false);

  const ringStats = lst
    .updateMask(ruralMask)
    .reduceRegions({ collection: ring, reducer: ee.Reducer.mean(), scale: 1000, tileScale: 4 })
    .select(["name", "lst"], null, false);

  type FC = { features: { properties: Record<string, number | string | null> }[] };
  const [coreRes, ringRes] = await Promise.all([evaluate<FC>(coreStats), evaluate<FC>(ringStats)]);

  const rural = new Map<string, number | null>();
  for (const f of ringRes.features) rural.set(String(f.properties.name), round(f.properties.lst, 2));

  const out: CityMetrics[] = coreRes.features.map((f) => {
    const name = String(f.properties.name);
    const lstSat = round(f.properties.lst, 2);
    const ruralLst = rural.get(name) ?? null;
    return {
      name,
      ndvi: round(f.properties.ndvi, 3),
      lstSat,
      ruralLst,
      uhi: lstSat != null && ruralLst != null ? round(lstSat - ruralLst, 2) : null,
    };
  });

  return {
    ok: true,
    source: "NASA MODIS via Google Earth Engine",
    period: period("365d"),
    coreKm: CORE_M / 1000,
    ringKm: [RING_IN / 1000, RING_OUT / 1000],
    updatedAt: new Date().toISOString(),
    cities: out,
  };
}