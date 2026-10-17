export type Pt = { month: string; lst_c: number | null; ndvi: number | null };
export type Key = "lst_c" | "ndvi";

/** Runs of consecutive non-null indices, so gaps are drawn as gaps, never interpolated. */
export function segments(vals: (number | null)[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  vals.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) { if (cur.length) out.push(cur); cur = []; }
    else cur.push(i);
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Latest valid value vs the same calendar month one year earlier (null if that month has no data). */
export function yoy(series: Pt[], key: Key) {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i][key];
    if (v === null || v === undefined) continue;
    const prior = i >= 12 ? series[i - 12][key] ?? null : null;
    return { month: series[i].month, value: v, prior, delta: prior === null ? null : v - prior };
  }
  return null;
}

export function extent(vals: (number | null)[], pad = 0.1): [number, number] {
  const v = vals.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return [0, 1];
  const lo = Math.min(...v), hi = Math.max(...v), p = (hi - lo || 1) * pad;
  return [lo - p, hi + p];
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
}
