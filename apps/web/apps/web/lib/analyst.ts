import { monthLabel, yoy, type Pt } from "./series";

export type Intent =
  | { kind: "compare"; places: [string, string] }
  | { kind: "uhi"; place: string }
  | { kind: "trend"; place: string }
  | { kind: "point"; place: string }
  | { kind: "help" };

const LEAD = /^(compare|how (hot|warm|green) (is|are)( it)?( in)?|what('s| is) the (temperature|heat|vegetation|ndvi|greenery) (in|of|at|for)|which is (hotter|greener)[:,]?|is)\s+/i;
const tidy = (s: string) => s.replace(LEAD, "").replace(/[?.!]+$/, "").replace(/^(the|city of)\s+/i, "").trim();

function place(t: string): string | null {
  const m = t.match(/\b(?:in|at|of|for|near|around)\s+([^?.!]+?)\s*[?.!]*$/i)
    ?? t.match(/\bhow (?:hot|warm|green)\s+(?:is|are)\s+([^?.!]+?)\s*[?.!]*$/i)
    ?? t.match(/^(?:is|are)\s+(.+?)\s+(?:getting|becoming)\b/i);
  const p = m ? tidy(m[1]) : "";
  return p.length >= 2 ? p : null;
}

export function parseIntent(text: string): Intent {
  const t = text.trim(), low = t.toLowerCase();
  if (/heat island|\buhi\b/.test(low)) { const p = place(t); return p ? { kind: "uhi", place: p } : { kind: "help" }; }
  if (/compare|\bvs\.?\b|versus|hotter than|greener than|which is (hotter|greener)/.test(low)) {
    const parts = t.split(/\s+(?:vs\.?|versus|and|or|with)\s+/i);
    if (parts.length >= 2) { const a = tidy(parts[0]), b = tidy(parts.slice(1).join(" ")); if (a.length >= 2 && b.length >= 2) return { kind: "compare", places: [a, b] }; }
  }
  if (/trend|over time|last year|warming|getting (hotter|warmer|greener)|history|changed?\b/.test(low)) { const p = place(t); return p ? { kind: "trend", place: p } : { kind: "help" }; }
  if (/\bhot\b|\bwarm\b|temperature|heat|ndvi|vegetation|green/.test(low)) { const p = place(t); return p ? { kind: "point", place: p } : { kind: "help" }; }
  return { kind: "help" };
}

export const HELP =
  "I answer from satellite data for a specific place, and I don't guess. Try: “How hot is Phoenix?”, “Compare Delhi and London”, “Heat island of Cairo”, or “Is Lagos getting greener?”";

export const ndviWord = (v: number) =>
  v < 0.1 ? "almost no vegetation (bare ground, water or built-up)" : v < 0.2 ? "very sparse vegetation" : v < 0.4 ? "sparse to moderate vegetation" : v < 0.6 ? "fairly dense vegetation" : "dense vegetation";

type Vals = { lst: number | null; ndvi: number | null };
export const SRC_POINT = "NASA MODIS via Google Earth Engine, average of composites over the last 30 days. Surface (ground skin) temperature, not air temperature.";

export function composePoint(name: string, v: Vals): string {
  if (v.lst === null && v.ndvi === null) return `There's no clear satellite reading for ${name} in the last 30 days (cloud, ice or open water).`;
  const a = v.lst !== null ? `surface temperature ${v.lst.toFixed(1)} °C` : "no clear surface temperature";
  const b = v.ndvi !== null ? `NDVI ${v.ndvi.toFixed(2)} (${ndviWord(v.ndvi)})` : "no clear vegetation reading";
  return `${name}: ${a}, ${b}.`;
}

export function composeCompare(an: string, a: Vals, bn: string, b: Vals): string {
  if (a.lst === null || b.lst === null) return `I can't compare surface temperature: ${a.lst === null ? an : bn} has no clear reading in the last 30 days.`;
  const d = a.lst - b.lst, hot = d >= 0 ? an : bn, cool = d >= 0 ? bn : an;
  const g = a.ndvi !== null && b.ndvi !== null ? ` Vegetation: ${an} ${a.ndvi.toFixed(2)} vs ${bn} ${b.ndvi.toFixed(2)}.` : "";
  return `${an} ${a.lst.toFixed(1)} °C vs ${bn} ${b.lst.toFixed(1)} °C. ${Math.abs(d) < 0.5 ? "They are within 0.5 °C of each other." : `${hot} is ${Math.abs(d).toFixed(1)} °C hotter than ${cool}.`}${g} Same 30-day window, but the two cities are in different climates and seasons.`;
}

export const SRC_TREND = "NASA MODIS (8-day LST, monthly NDVI) via Google Earth Engine, monthly means within about 2.5 km of the point.";
export function composeTrend(name: string, series: Pt[]): string {
  const ok = series.filter((p) => p.lst_c !== null);
  if (ok.length < 6) return `There are too few clear satellite months for ${name} to say anything about change over time.`;
  const t = yoy(series, "lst_c")!;
  const hi = ok.reduce((m, p) => (p.lst_c! > m.lst_c! ? p : m)), lo = ok.reduce((m, p) => (p.lst_c! < m.lst_c! ? p : m));
  const delta = t.delta === null ? "" : `, ${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(1)} °C versus ${monthLabel(series[series.findIndex((p) => p.month === t.month) - 12].month)}`;
  return `${name}: latest clear month ${monthLabel(t.month)} was ${t.value.toFixed(1)} °C${delta}. Over ${series.length} months, monthly surface temperature ranged from ${lo.lst_c!.toFixed(1)} °C (${monthLabel(lo.month)}) to ${hi.lst_c!.toFixed(1)} °C (${monthLabel(hi.month)}). Seasonal swings dominate a one-year comparison, so this is not evidence of a long-term trend.`;
}

export type Uhi = { urban_c: number | null; rural_c: number | null; delta_c: number | null; n_urban: number; n_rural: number; radius_km: number; period: { start: string; end: string } };
export function composeUhi(name: string, u: Uhi): string {
  if (u.n_urban < 10 || u.n_rural < 30 || u.delta_c === null)
    return `I can't give a reliable heat island for ${name}: MODIS (1 km pixels) found ${u.n_urban} urban and ${u.n_rural} comparison pixels within ${u.radius_km} km, which is too few.`;
  const dir = u.delta_c >= 0 ? "hotter" : "cooler";
  return `${name}: built-up areas average ${u.urban_c!.toFixed(1)} °C vs ${u.rural_c!.toFixed(1)} °C for the surrounding non-urban land, so the surface heat island is ${u.delta_c >= 0 ? "+" : ""}${u.delta_c.toFixed(1)} °C (urban is ${dir}). Daytime, ${u.period.start} to ${u.period.end}, within ${u.radius_km} km, ${u.n_urban} urban and ${u.n_rural} rural 1 km pixels. Surface, not air, temperature; this is a simplified method.`;
}
export const SRC_UHI = "NASA MODIS land cover (urban class) and daytime land-surface temperature, via Google Earth Engine; rural = non-urban land within 30 km at similar elevation.";
