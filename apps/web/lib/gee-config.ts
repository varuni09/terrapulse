/**
 * Shared by the server (gee-images.ts, API routes) AND the browser (Explore page).
 * Keep this file free of server-only imports.
 */

export type RangeId = "7d" | "30d" | "90d" | "365d" | "peak";
export type LayerId = "lst" | "ndvi" | "equity";

export const RANGE_ORDER: RangeId[] = ["7d", "30d", "90d", "365d", "peak"];

export const RANGES: Record<
  RangeId,
  {
    label: string;
    short: string;
    days: number;
    stat: "mean" | "peak";
    lstMin: number;
    lstMax: number;
    blurb: string;
  }
> = {
  "7d": {
    label: "Last 7 days",
    short: "7 days",
    days: 7,
    stat: "mean",
    lstMin: 24,
    lstMax: 46,
    blurb: "Average of the freshest daily passes (cloud gaps are common)",
  },
  "30d": {
    label: "Last 30 days",
    short: "30 days",
    days: 30,
    stat: "mean",
    lstMin: 24,
    lstMax: 46,
    blurb: "Average of the daily passes over the last month",
  },
  "90d": {
    label: "Last 3 months",
    short: "3 months",
    days: 90,
    stat: "mean",
    lstMin: 24,
    lstMax: 46,
    blurb: "Average over the last three months",
  },
  "365d": {
    label: "Last 12 months",
    short: "12 months",
    days: 365,
    stat: "mean",
    lstMin: 26,
    lstMax: 44,
    blurb: "Yearly average, which hides seasonal peaks",
  },
  peak: {
    label: "Peak heat (last 12 months)",
    short: "Peak heat",
    days: 365,
    stat: "peak",
    lstMin: 30,
    lstMax: 52,
    blurb: "Hottest 8-day reading per pixel (greenest reading for vegetation)",
  },
};

export const NDVI_MAX = 0.85;

/** Heat equity risk = weighted mix of how hot and how bare a place is (0–100). */
export const EQUITY_W = { heat: 0.6, bare: 0.4 } as const;

export const PALETTES: Record<LayerId, string[]> = {
  lst: ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"],
  ndvi: ["#f7fcb9", "#addd8e", "#41ab5d", "#006837"],
  equity: ["#feebe2", "#fbb4b9", "#f768a1", "#c51b8a", "#7a0177"],
};

export function isRange(v: unknown): v is RangeId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(RANGES, v);
}

const c01 = (x: number) => Math.min(1, Math.max(0, x));

/** Same formula the server uses to paint the equity tiles, so panel values match the map. */
export function equityScore(lst: number | null, ndvi: number | null, range: RangeId): number | null {
  if (lst == null || ndvi == null) return null;
  const { lstMin, lstMax } = RANGES[range];
  const t = c01((lst - lstMin) / (lstMax - lstMin));
  const v = c01(ndvi / NDVI_MAX);
  return Math.round((EQUITY_W.heat * t + EQUITY_W.bare * (1 - v)) * 100);
}