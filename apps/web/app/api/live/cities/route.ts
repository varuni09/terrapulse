import { NextResponse , connection} from "next/server";
import { CITIES, type City } from "../../../../lib/cities";

/**
 * GET /api/live/cities
 *
 * Pulls live modelled surface temperature for every city in one batched request to Open-Meteo
 * (free, no API key; non-commercial use — see open-meteo.com/en/pricing for commercial terms).
 *
 *  lst     = today's PEAK surface temperature (max of the 24 hourly values, UTC day)
 *  lstNow  = surface temperature for the current hour
 *  airNow  = current air temperature at 2 m
 *
 * NDVI and heat-island values are reference figures from lib/cities.ts (not live).
 */
export const maxDuration = 20;

type OpenMeteoLocation = {
  current?: { temperature_2m?: number | null };
  hourly?: { soil_temperature_0cm?: (number | null)[] };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export async function GET() {
    await connection();
  const lat = CITIES.map((c) => c.lat.toFixed(2)).join(",");
  const lon = CITIES.map((c) => c.lon.toFixed(2)).join(",");
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m&hourly=soil_temperature_0cm&forecast_days=1&timezone=GMT";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), next: { revalidate: 600 } });
    const raw = await res.json().catch(() => null);
    if (!res.ok || !raw || raw.error) {
      throw new Error(raw?.reason ? `Open-Meteo: ${raw.reason}` : `Open-Meteo returned HTTP ${res.status}`);
    }

    const locations: OpenMeteoLocation[] = Array.isArray(raw) ? raw : [raw];
    if (locations.length !== CITIES.length) throw new Error("Unexpected response size from Open-Meteo");

    const hour = new Date().getUTCHours();
    let liveCount = 0;

    const cities: City[] = CITIES.map((base, i) => {
      const hourly = locations[i]?.hourly?.soil_temperature_0cm ?? [];
      const values = hourly.filter(isNum);
      if (values.length < 12) return { ...base, live: false };

      liveCount++;
      const now = hourly[hour];
      const air = locations[i]?.current?.temperature_2m;
      return {
        ...base,
        lst: round1(Math.max(...values)),
        lstNow: isNum(now) ? round1(now) : undefined,
        airNow: isNum(air) ? round1(air) : undefined,
        live: true,
      };
    });

    if (liveCount === 0) throw new Error("Open-Meteo returned no usable temperature data");

    return NextResponse.json(
      {
        cities,
        liveCount,
        updatedAt: new Date().toISOString(),
        source: "Open-Meteo surface model",
        note: "lst = today's peak modelled surface temperature; NDVI and heat-island values are reference figures.",
      },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Live feed unavailable" },
      { status: 502 }
    );
  }
}