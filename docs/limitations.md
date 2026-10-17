# Limitations
(Fill in as each module ships: cloud gaps, resolution, seasonality, etc.)

## Landsat LST / NDVI (v0.1.0)
- LST is land-surface temperature at overpass time (~10:30 local), not air temperature or daily mean.
- One scene is one moment. Seasonal and weather differences between dates are not corrected.
- Scene-wide cloud cover is only a filter; per-pixel QA masking decides what is used.
- Water pixels are excluded; coastal cells may have few eligible pixels.
- Cells with < 50% valid pixels are stored as missing, never zero.
- Landsat 8 and 9 only (same band layout); older sensors are not mixed in.
- Native TIRS resolution is 100 m (resampled to 30 m by USGS); hex cells here are ~0.8 km².
