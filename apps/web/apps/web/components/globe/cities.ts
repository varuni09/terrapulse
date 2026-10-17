export type City = { code: string; name: string; lat: number; lon: number; live: boolean };

export const CITIES: City[] = [
  { code: "chennai", name: "Chennai", lat: 13.0827, lon: 80.2707, live: true },
  { code: "london", name: "London", lat: 51.5074, lon: -0.1278, live: true },
  { code: "new-york", name: "New York", lat: 40.7128, lon: -74.006, live: true },
  { code: "tokyo", name: "Tokyo", lat: 35.6762, lon: 139.6503, live: true },
  { code: "lagos", name: "Lagos", lat: 6.5244, lon: 3.3792, live: true },
  { code: "sao-paulo", name: "São Paulo", lat: -23.5505, lon: -46.6333, live: true },
  { code: "sydney", name: "Sydney", lat: -33.8688, lon: 151.2093, live: true },
];
