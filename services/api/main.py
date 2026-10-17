from fastapi import FastAPI

app = FastAPI(title="TERRAPULSE API", version="0.1.0")

# Placeholder until the areas table is loaded with real boundaries.
CITIES = [
    {"code": "chennai", "name": "Chennai", "lat": 13.0827, "lon": 80.2707,
     "datasets": []},
]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/cities")
def list_cities():
    return CITIES


from services.api.routes.areas import router as areas_router  # noqa: E402

app.include_router(areas_router)
