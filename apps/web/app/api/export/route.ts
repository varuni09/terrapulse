import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { format, data } = await req.json();

  if (format === "csv") {
    const headers = "id,name,lat,lon,lst,ndvi,uhi\n";
    const rows = (data || [])
      .map((item: any) => `${item.id || item.name},${item.name || ""},${item.lat},${item.lon},${item.lst},${item.ndvi},${item.uhi}`)
      .join("\n");

    return new NextResponse(headers + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="terrapulse_rankings.csv"',
      },
    });
  }

  if (format === "geojson") {
    const geojson = {
      type: "FeatureCollection",
      features: (data || []).map((item: any) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [item.lon, item.lat],
        },
        properties: {
          name: item.name,
          lst: item.lst,
          ndvi: item.ndvi,
          uhi: item.uhi,
        },
      })),
    };

    return new NextResponse(JSON.stringify(geojson, null, 2), {
      headers: {
        "Content-Type": "application/geo+json",
        "Content-Disposition": 'attachment; filename="terrapulse_rankings.geojson"',
      },
    });
  }

  return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
}