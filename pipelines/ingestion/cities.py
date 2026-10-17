"""City registry. bbox = (south, west, north, east): APPROXIMATE, check them on the map.
months = suggested clear-sky season for Landsat scenes (my judgment; adjust per city).
A bbox must fit inside ONE Landsat scene footprint (mosaics are not supported yet)."""
CITIES = {
    "chennai":   {"name": "Chennai",   "country": "India",     "bbox": (12.83, 80.10, 13.25, 80.32),   "months": [1, 2, 3]},
    "london":    {"name": "London",    "country": "UK",        "bbox": (51.28, -0.51, 51.70, 0.33),    "months": [6, 7, 8]},
    "new-york":  {"name": "New York",  "country": "USA",       "bbox": (40.49, -74.27, 40.92, -73.70), "months": [6, 7, 8]},
    "tokyo":     {"name": "Tokyo",     "country": "Japan",     "bbox": (35.50, 139.55, 35.82, 139.92), "months": [9, 10, 11]},
    "lagos":     {"name": "Lagos",     "country": "Nigeria",   "bbox": (6.38, 3.10, 6.70, 3.65),       "months": [12, 1, 2]},
    "sao-paulo": {"name": "São Paulo", "country": "Brazil",    "bbox": (-23.80, -46.85, -23.40, -46.35), "months": [6, 7, 8]},
    "sydney":    {"name": "Sydney",    "country": "Australia", "bbox": (-34.05, 150.85, -33.65, 151.35), "months": [12, 1, 2]},
    "phoenix":   {"name": "Phoenix",   "country": "USA",       "bbox": (33.25, -112.35, 33.75, -111.75), "months": [5, 6, 9]},
}
