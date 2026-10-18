// Surface urban heat island for a city: mean daytime LST of MODIS "urban" pixels vs rural pixels within 30 km.
import { NextRequest, NextResponse, connection } from "next/server";
import { ee, initEE } from "../../../../lib/eeServer";

export const maxDuration = 30;

const cache = new Map<string, { t: number; body: any }>();
const TTL = 6 * 3600 * 1000;
const HDR = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(req: NextRequest) {
  await connection();
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });

  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.body, { headers: HDR });

  try {
    await initEE();
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 3, 1));
    const RADIUS = 30000;
    const region = ee.Geometry.Point([lon, lat]).buffer(RADIUS);

    const lc = ee.Image(ee.ImageCollection("MODIS/061/MCD12Q1").sort("system:time_start", false).first()).select("LC_Type1");
    const urban = lc.eq(13);                                   // IGBP class 13 = urban and built-up
    const excluded = lc.eq(17).or(lc.eq(0)).or(lc.eq(15));    // water, unclassified, snow/ice
    const lst = ee.ImageCollection("MODIS/061/MOD11A2").filterDate(start.toISOString(), end.toISOString())
      .map((img: any) => img.select("LST_Day_1km").updateMask(img.select("QC_Day").bitwiseAnd(3).eq(0)).multiply(0.02).subtract(273.15))
      .mean().rename("lst");
    const elev = ee.Image("USGS/SRTMGL1_003").select("elevation").rename("elev");
    const ud = elev.updateMask(urban).reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: 1000, maxPixels: 1e8 });
    const uElev = ee.Number(ee.Algorithms.If(ud.contains("elev"), ud.get("elev"), 0));
    const rural = urban.not().and(excluded.not()).and(elev.subtract(uElev).abs().lt(100)); // similar elevation to the city

    const stat = (mask: any) => lst.updateMask(mask).reduceRegion({
      reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.count(), sharedInputs: true }),
      geometry: region, scale: 1000, maxPixels: 1e8 });
    const res: any = await new Promise((resolve, reject) =>
      ee.Dictionary({ u: stat(urban), r: stat(rural) }).evaluate((r: any, e: any) => (e ? reject(new Error(String(e))) : resolve(r))));

    const nU = res.u?.lst_count ?? 0, nR = res.r?.lst_count ?? 0;
    const uC = typeof res.u?.lst_mean === "number" ? res.u.lst_mean : null;
    const rC = typeof res.r?.lst_mean === "number" ? res.r.lst_mean : null;
    const body = {
      lat, lon, radius_km: RADIUS / 1000,
      period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
      urban_c: uC === null ? null : Math.round(uC * 10) / 10, rural_c: rC === null ? null : Math.round(rC * 10) / 10,
      delta_c: uC !== null && rC !== null ? Math.round((uC - rC) * 10) / 10 : null,
      n_urban: nU, n_rural: nR,
      method: "MODIS MCD12Q1 class 13 (urban) vs all other land within 30 km at similar elevation (±100 m); MOD11A2 daytime LST, good-quality pixels, mean of the last 3 full months; 1 km pixels",
    };
    cache.set(key, { t: Date.now(), body });
    return NextResponse.json(body, { headers: HDR });
  } catch (e: any) {
    console.error("Earth Engine UHI error:", e);
    const msg = String(e?.message ?? e);
    return NextResponse.json({ error: msg.startsWith("CONFIG") ? msg : "Unable to compute the heat island." }, { status: 500 });
  }
}
