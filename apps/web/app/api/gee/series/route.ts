// Monthly satellite time series for one point (MODIS LST + NDVI) via Earth Engine.
// Uses the same env vars as your other GEE routes: GEE_PROJECT and GEE_SERVICE_ACCOUNT_JSON.
import { NextRequest, NextResponse } from "next/server";
// @ts-ignore  (the Earth Engine node client ships no types)
import ee from "@google/earthengine";

export const maxDuration = 30;

let ready: Promise<void> | null = null;
function init(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const project = process.env.GEE_PROJECT;
    const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
    if (!project) return reject(new Error("CONFIG: missing GEE_PROJECT"));
    if (!raw) return reject(new Error("CONFIG: missing GEE_SERVICE_ACCOUNT_JSON"));
    let key: any;
    try { key = JSON.parse(raw); } catch { return reject(new Error("CONFIG: GEE_SERVICE_ACCOUNT_JSON is not valid JSON")); }
    if (typeof key.private_key === "string") key.private_key = key.private_key.replace(/\\n/g, "\n");
    ee.data.authenticateViaPrivateKey(
      key,
      () => ee.initialize(null, null, () => resolve(), (e: any) => reject(new Error("EE init: " + String(e))), null, project),
      (e: any) => reject(new Error("EE auth: " + String(e)))
    );
  }).catch((e) => { ready = null; throw e; });
  return ready;
}

const cache = new Map<string, { t: number; body: any }>();
const TTL = 6 * 3600 * 1000;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const months = Math.min(36, Math.max(6, Math.round(Number(p.get("months") ?? 24)) || 24));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return NextResponse.json({ error: "invalid_coordinates" }, { status: 400 });

  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${months}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.body, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });

  try {
    await init();
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));

    const pt = ee.Geometry.Point([lon, lat]).buffer(2500);
    const lstColl = ee.ImageCollection("MODIS/061/MOD11A2");
    const ndviColl = ee.ImageCollection("MODIS/061/MOD13A3");
    const meanOrEmpty = (coll: any, name: string) =>
      ee.Image(ee.Algorithms.If(coll.size().gt(0), coll.mean().rename(name), ee.Image.constant(0).rename(name).updateMask(ee.Image.constant(0))));

    const fc = ee.FeatureCollection(
      ee.List.sequence(0, months - 1).map((i: any) => {
        const d = ee.Date(start.getTime()).advance(i, "month");
        const next = d.advance(1, "month");
        const lst = meanOrEmpty(
          lstColl.filterDate(d, next).map((img: any) =>
            img.select("LST_Day_1km").updateMask(img.select("QC_Day").bitwiseAnd(3).eq(0)).multiply(0.02).subtract(273.15)),
          "lst");
        const nd = meanOrEmpty(ndviColl.filterDate(d, next).select("NDVI").map((img: any) => img.multiply(0.0001)), "ndvi");
        const r = lst.addBands(nd).reduceRegion({ reducer: ee.Reducer.mean(), geometry: pt, scale: 1000, maxPixels: 1e6 });
        return ee.Feature(null, { month: d.format("YYYY-MM") }).set(r);
      })
    );

    const res: any = await new Promise((resolve, reject) => fc.evaluate((r: any, e: any) => (e ? reject(new Error(String(e))) : resolve(r))));
    const series = res.features.map((f: any) => ({
      month: f.properties.month,
      lst_c: typeof f.properties.lst === "number" ? Math.round(f.properties.lst * 10) / 10 : null,
      ndvi: typeof f.properties.ndvi === "number" ? Math.round(f.properties.ndvi * 1000) / 1000 : null,
    }));
    const body = {
      lat, lon, buffer_m: 2500, series,
      source: "MODIS MOD11A2 v061 (8-day daytime LST, good-quality pixels) and MOD13A3 v061 (monthly NDVI), monthly means within 2.5 km",
    };
    cache.set(key, { t: Date.now(), body });
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (e: any) {
    console.error("Earth Engine series error:", e);
    const msg = String(e?.message ?? e);
    return NextResponse.json({ error: msg.startsWith("CONFIG") ? msg : "Unable to compute the time series." }, { status: 500 });
  }
}
