import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Replace this logic with your real backend query, Earth Engine API, or Database fetch
    // Example DB / Backend fetch:
    // const realCities = await db.select().from(cityMetrics);

    const realCities = [
      { name: "Chennai", country: "India", region: "Asia", lat: 13.08, lon: 80.27, lst: 38.12, ndvi: 0.342, uhi: 3.9 },
      { name: "Delhi", country: "India", region: "Asia", lat: 28.61, lon: 77.21, lst: 44.5, ndvi: 0.18, uhi: 5.2 },
      { name: "Mumbai", country: "India", region: "Asia", lat: 19.08, lon: 72.88, lst: 39.5, ndvi: 0.27, uhi: 3.6 },
      { name: "Tokyo", country: "Japan", region: "Asia", lat: 35.68, lon: 139.69, lst: 36.5, ndvi: 0.3, uhi: 4.5 },
      { name: "London", country: "United Kingdom", region: "Europe", lat: 51.51, lon: -0.13, lst: 30.0, ndvi: 0.39, uhi: 3.0 },
      { name: "New York", country: "United States", region: "North America", lat: 40.71, lon: -74.01, lst: 36.5, ndvi: 0.3, uhi: 4.4 },
    ];

    return NextResponse.json({ cities: realCities, isLive: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch live insights" }, { status: 500 });
  }
}
