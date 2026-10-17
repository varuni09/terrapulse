// Surface urban heat island for a city: mean daytime LST of MODIS urban pixels vs rural pixels within 30 km.
import { NextRequest, NextResponse } from "next/server";
import { ee, initEE } from "../../../../lib/eeServer";

export const maxDuration = 30;

type PixelStats = { lst_count?: number; lst_mean?: number };
type EeImage = {
  select: (band: string) => EeImage;
  updateMask: (mask: unknown) => EeImage;
  bitwiseAnd: (value: number) => EeImage;
  eq: (value: number) => EeImage;
  multiply: (value: number) => EeImage;
  subtract: (value: number) => EeImage;
};

const cache = new Map<string, { t: number; body: unknown }>();
const TTL = 6 * 3600 * 1000;
const HDR = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const latValue = params.get("lat");
  const lonValue = params.get("lon");
  const lat = Number(latValue), lon = Number(lonValue);
  if (!latValue || !lonValue || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.body, { headers: HDR });

  try {
    await initEE();
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, 1));
    const radius = 30000;
    const region = ee.Geometry.Point([lon, lat]).buffer(radius);

    const landCover = ee.Image(ee.ImageCollection("MODIS/061/MCD12Q1").sort("system:time_start", false).first()).select("LC_Type1");
    const urban = landCover.eq(13);
    const excluded = landCover.eq(17).or(landCover.eq(0)).or(landCover.eq(15));
    const lst = ee.ImageCollection("MODIS/061/MOD11A2").filterDate(start.toISOString(), end.toISOString())
      .map((image: EeImage) => image.select("LST_Day_1km").updateMask(image.select("QC_Day").bitwiseAnd(3).eq(0)).multiply(0.02).subtract(273.15))
      .mean().rename("lst");
    const elevation = ee.Image("USGS/SRTMGL1_003").select("elevation").rename("elev");
    const urbanElevation = elevation.updateMask(urban).reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 1000, maxPixels: 1e8 });
    const meanUrbanElevation = ee.Number(ee.Algorithms.If(urbanElevation.contains("elev"), urbanElevation.get("elev"), 0));
    const rural = urban.not().and(excluded.not()).and(elevation.subtract(meanUrbanElevation).abs().lt(100));

    const stats = (mask: unknown) => lst.updateMask(mask).reduceRegion({
      reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.count(), sharedInputs: true }),
      geometry: region, scale: 1000, maxPixels: 1e8,
    });
    const result = await new Promise<{ u?: PixelStats; r?: PixelStats }>((resolve, reject) =>
      ee.Dictionary({ u: stats(urban), r: stats(rural) }).evaluate(
        (value: { u?: PixelStats; r?: PixelStats }, error: unknown) => (error ? reject(new Error(String(error))) : resolve(value)),
      ));

    const urbanCount = result.u?.lst_count ?? 0;
    const ruralCount = result.r?.lst_count ?? 0;
    const urbanC = typeof result.u?.lst_mean === "number" ? result.u.lst_mean : null;
    const ruralC = typeof result.r?.lst_mean === "number" ? result.r.lst_mean : null;
    const body = {
      lat, lon, radius_km: radius / 1000,
      period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
      urban_c: urbanC === null ? null : Math.round(urbanC * 10) / 10,
      rural_c: ruralC === null ? null : Math.round(ruralC * 10) / 10,
      delta_c: urbanC !== null && ruralC !== null ? Math.round((urbanC - ruralC) * 10) / 10 : null,
      n_urban: urbanCount, n_rural: ruralCount,
      method: "MODIS MCD12Q1 class 13 (urban) vs other land within 30 km at similar elevation (+/-100 m); MOD11A2 daytime LST, good-quality pixels, mean of the last 3 full months; 1 km pixels",
    };
    cache.set(key, { t: Date.now(), body });
    return NextResponse.json(body, { headers: HDR });
  } catch (error) {
    console.error("Earth Engine UHI error:", error);
    const message = String(error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message.startsWith("CONFIG") ? message : "Unable to compute the heat island." }, { status: 500 });
  }
}