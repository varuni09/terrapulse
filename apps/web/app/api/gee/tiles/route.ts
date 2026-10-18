import { NextRequest, NextResponse, connection } from "next/server";
import { initializeEarthEngine } from "@/lib/gee";
import { imageFor, latestObservation, period, visFor } from "@/lib/gee-images";
import { isRange, type LayerId, type RangeId } from "@/lib/gee-config";

// Map ids are cached for a few hours and shared by every visitor, one per layer + time range.
// Without this, every call asks Earth Engine for a brand-new map and re-computes every tile.
const TTL_MS = 3 * 60 * 60 * 1000;
const g = globalThis as unknown as { __geeTileCache?: Map<string, { promise: Promise<string>; exp: number }> };
const cache = (g.__geeTileCache ??= new Map()); // survives hot reloads in dev

function getTileUrl(layer: LayerId, range: RangeId): Promise<string> {
  const key = `${layer}:${range}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.promise;

  const promise = (async () => {
    await initializeEarthEngine();
    const image = imageFor(layer, range);
    return new Promise<string>((resolve, reject) => {
      image.getMap(visFor(layer, range), (result: { urlFormat?: string } | null, error: unknown) => {
        if (error || !result?.urlFormat) {
          reject(error instanceof Error ? error : new Error(String(error ?? "No Earth Engine tile URL returned")));
          return;
        }
        resolve(result.urlFormat);
      });
    });
  })();

  cache.set(key, { promise, exp: Date.now() + TTL_MS }); // simultaneous requests share one getMap call
  promise.catch(() => cache.delete(key)); // never cache a failure
  return promise;
}

export async function GET(request: NextRequest) {
  // Opt in to request-time rendering. With cacheComponents, a GET handler that never reads the request
  // would otherwise be prerendered at build time and its result frozen.
  await connection();
  const sp = new URL(request.url).searchParams;
  const layer = sp.get("layer") ?? "lst";
  const rangeParam = sp.get("range") ?? "30d";

  if (layer !== "lst" && layer !== "ndvi" && layer !== "equity") {
    return NextResponse.json({ error: "layer must be lst, ndvi or equity" }, { status: 400 });
  }
  if (!isRange(rangeParam)) {
    return NextResponse.json({ error: "range must be 30d, 90d, 365d or peak" }, { status: 400 });
  }

  try {
    const tileUrl = await getTileUrl(layer, rangeParam);
    return NextResponse.json(
      {
        layer,
        range: rangeParam,
        tileUrl,
        units: layer === "ndvi" ? "NDVI" : layer === "equity" ? "risk 0-100" : "°C",
        period: period(rangeParam, layer === "ndvi" ? "ndvi" : "lst"),
        latest: await latestObservation(rangeParam).catch(() => null),
      },
      { headers: { "Cache-Control": "private, max-age=600" } }
    );
  } catch (error) {
    console.error("Earth Engine tile error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Unable to generate Earth Engine tiles.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}