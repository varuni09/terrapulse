import { NextResponse, connection } from "next/server";
import { CITIES } from "@/lib/cities";
import { computeCityMetrics, type CitiesPayload } from "@/lib/gee-cities";

export const maxDuration = 60; // the first computation can take a while

// 12-month satellite averages barely change day to day, so keep one result for 6 hours.
// Stale data is served instantly while a refresh runs in the background.
const TTL_MS = 6 * 60 * 60 * 1000;
const g = globalThis as unknown as {
  __geeCities?: { data?: CitiesPayload; at: number; inflight?: Promise<CitiesPayload> };
};
const store = (g.__geeCities ??= { at: 0 });

function refresh(): Promise<CitiesPayload> {
  if (store.inflight) return store.inflight; // share one Earth Engine computation between callers
  store.inflight = computeCityMetrics(CITIES.map((c) => ({ name: c.name, lat: c.lat, lon: c.lon })))
    .then((data) => {
      store.data = data;
      store.at = Date.now();
      return data;
    })
    .finally(() => {
      store.inflight = undefined;
    });
  return store.inflight;
}

const headers = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

export async function GET() {
  // Opt in to request-time rendering. With cacheComponents, a GET handler that never reads the request
  // would otherwise be prerendered at build time and its result frozen.
  await connection();
  if (store.data) {
    if (Date.now() - store.at > TTL_MS) refresh().catch((e) => console.error("City refresh failed:", e));
    return NextResponse.json(store.data, { headers });
  }

  try {
    const data = await refresh();
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error("Earth Engine cities error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to compute satellite city metrics.",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}