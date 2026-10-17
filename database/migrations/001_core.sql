CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE areas (
  id            SERIAL PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('city','neighborhood')),
  parent_id     INT REFERENCES areas(id),
  geom          geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX areas_geom_gix ON areas USING GIST (geom);

CREATE TABLE datasets (
  id            SERIAL PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,          -- e.g. landsat_c2_l2
  source        TEXT NOT NULL,
  license       TEXT NOT NULL,
  resolution_m  REAL,
  notes         TEXT
);

CREATE TABLE processing_jobs (
  id            SERIAL PRIMARY KEY,
  kind          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
  params        JSONB NOT NULL DEFAULT '{}',
  processing_version TEXT NOT NULL,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  valid_pixels  BIGINT,
  invalid_pixels BIGINT,
  error         TEXT
);

CREATE TABLE raster_layers (
  id            SERIAL PRIMARY KEY,
  dataset_id    INT NOT NULL REFERENCES datasets(id),
  job_id        INT NOT NULL REFERENCES processing_jobs(id),
  metric        TEXT NOT NULL,                 -- ndvi, lst, ...
  unit          TEXT NOT NULL,
  observation_date DATE NOT NULL,
  crs           TEXT NOT NULL,
  uri           TEXT NOT NULL,
  published     BOOLEAN NOT NULL DEFAULT FALSE -- only true after validation
);

CREATE TABLE area_observations (
  id            BIGSERIAL PRIMARY KEY,
  area_id       INT NOT NULL REFERENCES areas(id),
  metric        TEXT NOT NULL,
  value         DOUBLE PRECISION,              -- NULL = missing, never 0
  unit          TEXT NOT NULL,
  observation_date DATE NOT NULL,
  dataset_id    INT NOT NULL REFERENCES datasets(id),
  processing_version TEXT NOT NULL,
  valid_pixel_fraction REAL CHECK (valid_pixel_fraction BETWEEN 0 AND 1),
  UNIQUE (area_id, metric, observation_date, dataset_id, processing_version)
);
CREATE INDEX obs_lookup ON area_observations (area_id, metric, observation_date);
