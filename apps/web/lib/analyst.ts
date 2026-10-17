import { monthLabel, yoy, type Pt } from "./series";

export type Intent =
  | { kind: "compare"; places: [string, string] }
  | { kind: "uhi"; place: string }
  | { kind: "trend"; place: string }
  | { kind: "point"; place: string }
  | { kind: "help" };

const LEAD = /^(compare|how (hot|warm|green) (is|are)( it)?( in)?|what('s| is) the (temperature|heat|vegetation|ndvi|greenery) (in|of|at|for)|which is (hotter|greener)[:,]?|is)\s+/i;
const tidy = (value: string) => value.replace(LEAD, "").replace(/[?.!]+$/, "").replace(/^(the|city of)\s+/i, "").trim();

function place(text: string): string | null {
  const match = text.match(/\b(?:in|at|of|for|near|around)\s+([^?.!]+?)\s*[?.!]*$/i)
    ?? text.match(/\bhow (?:hot|warm|green)\s+(?:is|are)\s+([^?.!]+?)\s*[?.!]*$/i)
    ?? text.match(/^(?:is|are)\s+(.+?)\s+(?:getting|becoming)\b/i);
  const result = match ? tidy(match[1]) : "";
  return result.length >= 2 ? result : null;
}

export function parseIntent(text: string): Intent {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (/heat island|\buhi\b/.test(lower)) {
    const city = place(trimmed);
    return city ? { kind: "uhi", place: city } : { kind: "help" };
  }
  if (/compare|\bvs\.?\b|versus|hotter than|greener than|which is (hotter|greener)/.test(lower)) {
    const parts = trimmed.split(/\s+(?:vs\.?|versus|and|or|with)\s+/i);
    if (parts.length >= 2) {
      const first = tidy(parts[0]);
      const second = tidy(parts.slice(1).join(" "));
      if (first.length >= 2 && second.length >= 2) return { kind: "compare", places: [first, second] };
    }
  }
  if (/trend|over time|last year|warming|getting (hotter|warmer|greener)|history|changed?\b/.test(lower)) {
    const city = place(trimmed);
    return city ? { kind: "trend", place: city } : { kind: "help" };
  }
  if (/\bhot\b|\bwarm\b|temperature|heat|ndvi|vegetation|green/.test(lower)) {
    const city = place(trimmed);
    return city ? { kind: "point", place: city } : { kind: "help" };
  }
  return { kind: "help" };
}

export const HELP =
  "I answer from satellite data for a specific place, and I don't guess. Try: \"How hot is Phoenix?\", \"Compare Delhi and London\", \"Heat island of Cairo\", or \"Is Lagos getting greener?\"";

export const ndviWord = (value: number) =>
  value < 0.1 ? "almost no vegetation (bare ground, water or built-up)" : value < 0.2 ? "very sparse vegetation" : value < 0.4 ? "sparse to moderate vegetation" : value < 0.6 ? "fairly dense vegetation" : "dense vegetation";

type Values = { lst: number | null; ndvi: number | null };
export const SRC_POINT = "NASA MODIS via Google Earth Engine, average of composites over the last 30 days. Surface (ground skin) temperature, not air temperature.";

export function composePoint(name: string, values: Values): string {
  if (values.lst === null && values.ndvi === null) return `There's no clear satellite reading for ${name} in the last 30 days (cloud, ice or open water).`;
  const temperature = values.lst !== null ? `surface temperature ${values.lst.toFixed(1)} °C` : "no clear surface temperature";
  const vegetation = values.ndvi !== null ? `NDVI ${values.ndvi.toFixed(2)} (${ndviWord(values.ndvi)})` : "no clear vegetation reading";
  return `${name}: ${temperature}, ${vegetation}.`;
}

export function composeCompare(firstName: string, first: Values, secondName: string, second: Values): string {
  if (first.lst === null || second.lst === null) return `I can't compare surface temperature: ${first.lst === null ? firstName : secondName} has no clear reading in the last 30 days.`;
  const difference = first.lst - second.lst;
  const hotter = difference >= 0 ? firstName : secondName;
  const cooler = difference >= 0 ? secondName : firstName;
  const vegetation = first.ndvi !== null && second.ndvi !== null ? ` Vegetation: ${firstName} ${first.ndvi.toFixed(2)} vs ${secondName} ${second.ndvi.toFixed(2)}.` : "";
  const comparison = Math.abs(difference) < 0.5 ? "They are within 0.5 °C of each other." : `${hotter} is ${Math.abs(difference).toFixed(1)} °C hotter than ${cooler}.`;
  return `${firstName} ${first.lst.toFixed(1)} °C vs ${secondName} ${second.lst.toFixed(1)} °C. ${comparison}${vegetation} Same 30-day window, but the two cities are in different climates and seasons.`;
}

export const SRC_TREND = "NASA MODIS (8-day LST, monthly NDVI) via Google Earth Engine, monthly means within about 2.5 km of the point.";
export function composeTrend(name: string, series: Pt[]): string {
  const valid = series.filter((point) => point.lst_c !== null);
  if (valid.length < 6) return `There are too few clear satellite months for ${name} to say anything about change over time.`;
  const latest = yoy(series, "lst_c")!;
  const highest = valid.reduce((current, point) => point.lst_c! > current.lst_c! ? point : current);
  const lowest = valid.reduce((current, point) => point.lst_c! < current.lst_c! ? point : current);
  const latestIndex = series.findIndex((point) => point.month === latest.month);
  const delta = latest.delta === null ? "" : `, ${latest.delta >= 0 ? "+" : ""}${latest.delta.toFixed(1)} °C versus ${monthLabel(series[latestIndex - 12].month)}`;
  return `${name}: latest clear month ${monthLabel(latest.month)} was ${latest.value.toFixed(1)} °C${delta}. Over ${series.length} months, monthly surface temperature ranged from ${lowest.lst_c!.toFixed(1)} °C (${monthLabel(lowest.month)}) to ${highest.lst_c!.toFixed(1)} °C (${monthLabel(highest.month)}). Seasonal swings dominate a one-year comparison, so this is not evidence of a long-term trend.`;
}

export type Uhi = { urban_c: number | null; rural_c: number | null; delta_c: number | null; n_urban: number; n_rural: number; radius_km: number; period: { start: string; end: string } };
export function composeUhi(name: string, result: Uhi): string {
  if (result.n_urban < 10 || result.n_rural < 30 || result.delta_c === null)
    return `I can't give a reliable heat island for ${name}: MODIS (1 km pixels) found ${result.n_urban} urban and ${result.n_rural} comparison pixels within ${result.radius_km} km, which is too few.`;
  const direction = result.delta_c >= 0 ? "hotter" : "cooler";
  return `${name}: built-up areas average ${result.urban_c!.toFixed(1)} °C vs ${result.rural_c!.toFixed(1)} °C for the surrounding non-urban land, so the surface heat island is ${result.delta_c >= 0 ? "+" : ""}${result.delta_c.toFixed(1)} °C (urban is ${direction}). Daytime, ${result.period.start} to ${result.period.end}, within ${result.radius_km} km, ${result.n_urban} urban and ${result.n_rural} rural 1 km pixels. Surface, not air, temperature; this is a simplified method.`;
}
export const SRC_UHI = "NASA MODIS land cover (urban class) and daytime land-surface temperature, via Google Earth Engine; rural = non-urban land within 30 km at similar elevation.";