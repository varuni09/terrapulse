import { NextRequest, NextResponse, connection } from "next/server";

export const maxDuration = 20;

const GRID_SIZE = 10;
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 80;

type Bounds = { west: number; east: number; south: number; north: number };
type GridPoint = { latitude: number; longitude: number; temperature: number | null; humidity: number | null };
type GridPayload = {
  bounds: Bounds;
  width: number;
  height: number;
  updatedAt: string;
  points: GridPoint[];
};
type CachedGrid = { payload: GridPayload; expiresAt: number };

type OpenMeteoLocation = {
  current?: {
    time?: string;
    temperature_2m?: number | null;
    relative_humidity_2m?: number | null;
  };
};

const globalCache = globalThis as typeof globalThis & { __liveWeatherGridCache?: Map<string, CachedGrid> };
const cache = (globalCache.__liveWeatherGridCache ??= new Map());
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function gridCoordinates(bounds: Bounds) {
  const points: { latitude: number; longitude: number }[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const latitude = bounds.north - ((bounds.north - bounds.south) * row) / (GRID_SIZE - 1);
    for (let col = 0; col < GRID_SIZE; col++) {
      const longitude = bounds.west + ((bounds.east - bounds.west) * col) / (GRID_SIZE - 1);
      points.push({ latitude, longitude });
    }
  }
  return points;
}

async function fetchGrid(bounds: Bounds): Promise<GridPayload> {
  const coordinates = gridCoordinates(bounds);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", coordinates.map((p) => p.latitude.toFixed(4)).join(","));
  url.searchParams.set("longitude", coordinates.map((p) => p.longitude.toFixed(4)).join(","));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m");
  url.searchParams.set("timezone", "GMT");

  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || (typeof body === "object" && "error" in body && body.error)) {
    const reason = typeof body === "object" && body && "reason" in body ? String(body.reason) : `HTTP ${response.status}`;
    throw new Error(`Open-Meteo weather grid failed: ${reason}`);
  }

  const locations = Array.isArray(body) ? body as OpenMeteoLocation[] : [body as OpenMeteoLocation];
  if (locations.length !== coordinates.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations; expected ${coordinates.length}`);
  }

  const points = coordinates.map((coordinate, index) => {
    const current = locations[index]?.current;
    return {
      ...coordinate,
      temperature: isFiniteNumber(current?.temperature_2m) ? current.temperature_2m : null,
      humidity: isFiniteNumber(current?.relative_humidity_2m) ? current.relative_humidity_2m : null,
    };
  });
  if (!points.some((point) => point.temperature != null)) {
    throw new Error("Open-Meteo returned no usable current air temperatures");
  }

  const validAt = locations[0]?.current?.time;
  const updatedAt = validAt
    ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(validAt) ? validAt : `${validAt}Z`).toISOString()
    : new Date().toISOString();
  return { bounds, width: GRID_SIZE, height: GRID_SIZE, updatedAt, points };
}

export async function GET(request: NextRequest) {
  await connection();
  const sp = request.nextUrl.searchParams;
  const bounds: Bounds = {
    west: Number(sp.get("west")),
    east: Number(sp.get("east")),
    south: Number(sp.get("south")),
    north: Number(sp.get("north")),
  };
  if (
    Object.values(bounds).some((value) => !Number.isFinite(value)) ||
    bounds.west < -180 || bounds.east > 180 || bounds.west >= bounds.east ||
    bounds.south < -85 || bounds.north > 85 || bounds.south >= bounds.north
  ) {
    return NextResponse.json({ error: "Valid west, east, south, and north bounds are required." }, { status: 400 });
  }

  const key = Object.values(bounds).map((value) => value.toFixed(3)).join(":");
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json(hit.payload, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
  }

  try {
    const payload = await fetchGrid(bounds);
    cache.set(key, { payload, expiresAt: Date.now() + TTL_MS });
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
  } catch (error) {
    console.error("Live weather grid error:", { bounds, error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live weather grid unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
