"use client";

import { useEffect, useMemo, useState } from "react";
import type { City } from "./cities";

export type SatState = {
  ok: boolean;
  loading: boolean;
  period: { start: string; end: string } | null;
  count: number; // cities that received a satellite value
  error: string | null;
};

type Row = { name: string; ndvi: number | null; uhi: number | null };

/**
 * Fetches satellite NDVI + urban heat island per city from /api/gee/cities and merges them over
 * the cities you pass in. Until it loads (or if it fails) the original reference values stay.
 * Heat island is floored at 0 because the page presents it as an "added heat" figure; cities with a
 * satellite cool-island signal (common in arid surroundings) therefore show 0.
 */
export function useSatelliteCities(base: City[]) {
  const [rows, setRows] = useState<Record<string, Row> | null>(null);
  const [sat, setSat] = useState<SatState>({ ok: false, loading: true, period: null, count: 0, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/gee/cities", { signal: ctrl.signal });
        const raw = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(raw);
        } catch {
          /* not JSON */
        }
        if (!res.ok || !json?.ok || !Array.isArray(json.cities)) {
          throw new Error(json?.detail || json?.error || `HTTP ${res.status}`);
        }
        const map: Record<string, Row> = {};
        let count = 0;
        for (const r of json.cities as Row[]) {
          map[r.name] = r;
          if (r.ndvi != null) count++;
        }
        setRows(map);
        setSat({ ok: count > 0, loading: false, period: json.period ?? null, count, error: null });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setSat({ ok: false, loading: false, period: null, count: 0, error: e?.message ?? "Satellite data unavailable" });
      }
    })();
    return () => ctrl.abort();
  }, []);

  const cities = useMemo(() => {
    if (!rows) return base;
    return base.map((c) => {
      const r = rows[c.name];
      if (!r) return c;
      return {
        ...c,
        ndvi: r.ndvi ?? c.ndvi,
        uhi: r.uhi != null ? Math.max(0, r.uhi) : c.uhi,
      };
    });
  }, [base, rows]);

  return { cities, sat };
}