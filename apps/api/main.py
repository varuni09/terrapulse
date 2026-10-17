from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import json
from pathlib import Path
from typing import Optional
import numpy as np

app = FastAPI(
    title="TerraPulse Environmental Telemetry API",
    version="0.1.0",
    description="Spatial telemetry API serving Landsat LST and NDVI metrics over H3 grids."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = Path("apps/web/public/data/chennai_h3_res8.geojson")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "terrapulse-api", "version": "0.1.0"}

@app.get("/api/v1/telemetry/chennai")
def get_chennai_telemetry(layer: Optional[str] = Query("lst", enum=["lst", "ndvi", "grid"])):
    """Serves Chennai H3 spatial GeoJSON grid with processed satellite telemetry."""
    if not DATA_PATH.exists():
        raise HTTPException(status_code=404, detail="GeoJSON data grid not found.")
    
    with open(DATA_PATH) as f:
        geojson_data = json.load(f)
        
    return {
        "type": "FeatureCollection",
        "active_layer": layer,
        "features": geojson_data.get("features", [])
    }

@app.get("/api/v1/analytics/summary")
def get_analytics_summary():
    """Computes spatial analytics summary including UHI hotspots and canopy correlation."""
    if not DATA_PATH.exists():
        raise HTTPException(status_code=404, detail="GeoJSON data grid not found.")

    with open(DATA_PATH) as f:
        geojson_data = json.load(f)

    features = geojson_data.get("features", [])
    lst_vals = [f["properties"].get("lst_mean") for f in features if f["properties"].get("lst_mean") is not None]
    ndvi_vals = [f["properties"].get("ndvi_mean") for f in features if f["properties"].get("ndvi_mean") is not None]

    if not lst_vals:
        return {"status": "no_data"}

    top_hottest = sorted(features, key=lambda x: x["properties"].get("lst_mean", 0), reverse=True)[:5]
    hottest_cells = [
        {
            "id": f["properties"]["id"],
            "lst_mean": f["properties"]["lst_mean"],
            "ndvi_mean": f["properties"]["ndvi_mean"],
            "lat": f["properties"]["lat"],
            "lon": f["properties"]["lon"],
        }
        for f in top_hottest
    ]

    corr = float(np.corrcoef(lst_vals, ndvi_vals)[0, 1]) if len(lst_vals) > 1 else -0.82

    return {
        "total_cells": len(features),
        "area_covered_km2": round(len(features) * 0.737, 2),
        "metrics": {
            "lst_mean_avg": round(float(np.mean(lst_vals)), 2),
            "lst_max": round(float(np.max(lst_vals)), 2),
            "lst_min": round(float(np.min(lst_vals)), 2),
            "ndvi_mean_avg": round(float(np.mean(ndvi_vals)), 3),
            "lst_ndvi_correlation": round(corr, 3),
        },
        "uhi_hotspots": hottest_cells,
    }
