-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial Grid Table (H3 Hexagonal Indexing)
CREATE TABLE IF NOT EXISTS h3_cells (
    h3_index VARCHAR(15) PRIMARY KEY,
    resolution INTEGER NOT NULL CHECK (resolution BETWEEN 0 AND 15),
    centroid GEOMETRY(Point, 4326) NOT NULL,
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    area_km2 NUMERIC(8, 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_h3_cells_geom ON h3_cells USING GIST (geom);

-- Satellite Telemetry Observations Table
CREATE TABLE IF NOT EXISTS telemetry_observations (
    id BIGSERIAL PRIMARY KEY,
    h3_index VARCHAR(15) NOT NULL REFERENCES h3_cells(h3_index) ON DELETE CASCADE,
    scene_id VARCHAR(128) NOT NULL,
    observation_date DATE NOT NULL,
    cloud_cover_pct NUMERIC(5, 2),
    lst_mean NUMERIC(5, 2),    -- Land Surface Temp (°C)
    lst_median NUMERIC(5, 2),
    lst_p90 NUMERIC(5, 2),
    ndvi_mean NUMERIC(4, 3),   -- Vegetation Index (-1.0 to 1.0)
    valid_px_pct NUMERIC(5, 2),
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cell_scene UNIQUE (h3_index, scene_id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_date ON telemetry_observations (observation_date);
CREATE INDEX IF NOT EXISTS idx_telemetry_h3 ON telemetry_observations (h3_index);
