import { NextRequest, NextResponse } from "next/server";
import { initializeEarthEngine } from "@/lib/gee";
import { imageFor, period, visFor } from "@/lib/gee-images";
import { isRange, type LayerId, type RangeId } from "@/lib/gee-config";

// Map ids are cached for a few hours and shared by every visitor. Without this, every call asks
// Earth Engine for a brand-new map, which discards its tile cache and re-computes every tile.
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
  const searchParams = new URL(request.url).searchParams;
  const layerParam = searchParams.get("layer") ?? "lst";
  const rangeParam = searchParams.get("range") ?? "30d";

  if (layerParam !== "lst" && layerParam !== "ndvi" && layerParam !== "equity") {
    return NextResponse.json({ error: "layer must be lst, ndvi or equity" }, { status: 400 });
  }
  if (!isRange(rangeParam)) {
    return NextResponse.json({ error: "range must be 30d, 90d, 365d or peak" }, { status: 400 });
  }

  try {
    const layer: LayerId = layerParam;
    const range: RangeId = rangeParam;
    const tileUrl = await getTileUrl(layer, range);
    return NextResponse.json(
      {
        layer,
        range,
        tileUrl,
        units: layer === "ndvi" ? "NDVI" : layer === "equity" ? "risk 0-100" : "°C",
        period: period(range),
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