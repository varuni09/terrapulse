import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.json({
    success: true,
    provenance: {
      dataset: "Landsat 8 Collection 2 Level-2 (L2SP)",
      observation_date: "2026-04-18",
      cloud_cover_percent: 1.1,
      spatial_resolution: "30m Thermal / 10m Optical",
      processing_level: "Surface Temperature & Reflectance",
    },
    metrics: {
      mean_lst_celsius: 38.8,
      mean_ndvi: 0.242,
      valid_pixels_pct: 98.1,
    },
  });
}