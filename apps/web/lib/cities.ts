/**
 * Shared city list for the Insights page and the live-data API route.
 *
 * lst  – fallback surface temperature (°C). Replaced by LIVE values from /api/live/cities.
 * ndvi – REFERENCE vegetation index (not live). Swap for Earth Engine values when connected.
 * uhi  – REFERENCE urban-minus-rural heat-island strength in °C (not live).
 *
 * Chennai uses the means from your own pipeline (38.12 °C / 0.342 NDVI); the other cities
 * are rounded representative figures, not verified measurements.
 */

export type Region = "Asia" | "Europe" | "Africa" | "North America" | "South America" | "Oceania";

export type City = {
  name: string;
  country: string;
  region: Region;
  lat: number;
  lon: number;
  lst: number;
  ndvi: number;
  uhi: number;
  /** Surface temperature right now (live feed only) */
  lstNow?: number;
  /** Air temperature right now (live feed only) */
  airNow?: number;
  /** true when `lst` came from the live feed for this city */
  live?: boolean;
};

export const REGIONS: Region[] = ["Asia", "Europe", "Africa", "North America", "South America", "Oceania"];

const c = (name: string, country: string, region: Region, lat: number, lon: number, lst: number, ndvi: number, uhi: number): City => ({
  name, country, region, lat, lon, lst, ndvi, uhi,
});

export const CITIES: City[] = [
  c("Chennai", "India", "Asia", 13.08, 80.27, 38.12, 0.342, 3.9),
  c("Delhi", "India", "Asia", 28.61, 77.21, 44.5, 0.18, 5.2),
  c("Mumbai", "India", "Asia", 19.08, 72.88, 39.5, 0.27, 3.6),
  c("Kolkata", "India", "Asia", 22.57, 88.36, 40.2, 0.25, 4.1),
  c("Karachi", "Pakistan", "Asia", 24.86, 67.0, 43.6, 0.1, 4.4),
  c("Riyadh", "Saudi Arabia", "Asia", 24.71, 46.68, 47.8, 0.07, 3.1),
  c("Dubai", "UAE", "Asia", 25.2, 55.27, 48.9, 0.05, 2.8),
  c("Baghdad", "Iraq", "Asia", 33.31, 44.37, 47.2, 0.08, 4.8),
  c("Bangkok", "Thailand", "Asia", 13.76, 100.5, 40.1, 0.22, 4.3),
  c("Jakarta", "Indonesia", "Asia", -6.2, 106.85, 39.0, 0.24, 4.0),
  c("Singapore", "Singapore", "Asia", 1.35, 103.82, 36.0, 0.35, 3.2),
  c("Beijing", "China", "Asia", 39.9, 116.4, 39.2, 0.27, 4.6),
  c("Shanghai", "China", "Asia", 31.23, 121.47, 39.8, 0.25, 4.9),
  c("Seoul", "South Korea", "Asia", 37.57, 126.98, 35.8, 0.33, 4.2),
  c("Tokyo", "Japan", "Asia", 35.68, 139.69, 36.5, 0.3, 4.5),
  c("Istanbul", "Türkiye", "Europe", 41.01, 28.98, 37.5, 0.26, 3.7),
  c("Madrid", "Spain", "Europe", 40.42, -3.7, 40.0, 0.18, 3.9),
  c("Rome", "Italy", "Europe", 41.9, 12.5, 38.0, 0.25, 3.5),
  c("Paris", "France", "Europe", 48.86, 2.35, 32.5, 0.33, 3.8),
  c("London", "United Kingdom", "Europe", 51.51, -0.13, 30.0, 0.39, 3.0),
  c("Moscow", "Russia", "Europe", 55.76, 37.62, 31.0, 0.45, 3.3),
  c("Cairo", "Egypt", "Africa", 30.04, 31.24, 45.2, 0.09, 4.0),
  c("Lagos", "Nigeria", "Africa", 6.52, 3.38, 37.2, 0.31, 3.4),
  c("Nairobi", "Kenya", "Africa", -1.29, 36.82, 31.5, 0.38, 2.4),
  c("Johannesburg", "South Africa", "Africa", -26.2, 28.05, 34.0, 0.28, 3.1),
  c("New York", "United States", "North America", 40.71, -74.01, 36.5, 0.3, 4.4),
  c("Los Angeles", "United States", "North America", 34.05, -118.24, 41.0, 0.15, 4.0),
  c("Phoenix", "United States", "North America", 33.45, -112.07, 46.9, 0.11, 4.6),
  c("Houston", "United States", "North America", 29.76, -95.37, 40.5, 0.28, 4.2),
  c("Toronto", "Canada", "North America", 43.65, -79.38, 33.0, 0.38, 3.6),
  c("Mexico City", "Mexico", "North America", 19.43, -99.13, 37.0, 0.23, 3.3),
  c("Bogotá", "Colombia", "South America", 4.71, -74.07, 29.0, 0.4, 2.2),
  c("Lima", "Peru", "South America", -12.05, -77.04, 30.5, 0.12, 2.9),
  c("São Paulo", "Brazil", "South America", -23.55, -46.63, 35.5, 0.33, 3.9),
  c("Rio de Janeiro", "Brazil", "South America", -22.91, -43.17, 37.5, 0.31, 3.5),
  c("Buenos Aires", "Argentina", "South America", -34.6, -58.38, 36.0, 0.27, 3.4),
  c("Sydney", "Australia", "Oceania", -33.87, 151.21, 36.5, 0.34, 3.6),
  c("Melbourne", "Australia", "Oceania", -37.81, 144.96, 38.5, 0.25, 3.8),
];