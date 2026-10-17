"use client";

import { useEffect, useState } from "react";

type CityMetric = {
  name: string;
  country: string;
  region: string;
  lst: number;
  ndvi: number;
  uhi: number;
};

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; cities: CityMetric[] };

export default function AnalyticsPanel() {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/insights", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(result?.cities)) {
          throw new Error(result?.error || `HTTP ${response.status}`);
        }
        setState({ status: "ready", cities: result.cities });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Request failed" });
      });

    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return <div className="h-48 animate-pulse border-y border-white/10 bg-white/[0.03]" aria-label="Loading city metrics" />;
  }

  if (state.status === "error") {
    return (
      <p role="status" className="border-y border-rose-400/20 py-5 text-sm text-rose-200">
        City metrics are unavailable: {state.message}
      </p>
    );
  }

  if (state.cities.length === 0) {
    return <p className="border-y border-white/10 py-5 text-sm text-slate-400">No city metrics are available.</p>;
  }

  const hottest = state.cities.reduce((current, city) => city.lst > current.lst ? city : current);
  const greenest = state.cities.reduce((current, city) => city.ndvi > current.ndvi ? city : current);
  const meanUhi = state.cities.reduce((total, city) => total + city.uhi, 0) / state.cities.length;

  return (
    <section aria-labelledby="city-metrics-heading" className="border-y border-white/10 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="city-metrics-heading" className="text-sm font-semibold text-white">City metrics</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">Sample data · not live satellite readings</span>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="border-l-2 border-orange-400 pl-3">
          <dt className="text-xs text-slate-400">Highest surface temperature</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{hottest.lst.toFixed(1)} °C</dd>
          <dd className="text-xs text-slate-400">{hottest.name}, {hottest.country}</dd>
        </div>
        <div className="border-l-2 border-emerald-400 pl-3">
          <dt className="text-xs text-slate-400">Highest vegetation index</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{greenest.ndvi.toFixed(2)} NDVI</dd>
          <dd className="text-xs text-slate-400">{greenest.name}, {greenest.country}</dd>
        </div>
        <div className="border-l-2 border-sky-400 pl-3">
          <dt className="text-xs text-slate-400">Mean heat-island intensity</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{meanUhi.toFixed(1)} °C</dd>
          <dd className="text-xs text-slate-400">Across {state.cities.length} listed cities</dd>
        </div>
      </dl>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2 pr-4 font-medium">City</th>
              <th className="py-2 px-3 text-right font-medium">Surface temp.</th>
              <th className="py-2 px-3 text-right font-medium">NDVI</th>
              <th className="py-2 pl-3 text-right font-medium">UHI</th>
            </tr>
          </thead>
          <tbody>
            {state.cities.map((city) => (
              <tr key={`${city.name}-${city.country}`} className="border-b border-white/5 text-slate-300 last:border-0">
                <th scope="row" className="py-2.5 pr-4 font-medium text-white">{city.name}<span className="ml-2 font-normal text-slate-500">{city.country}</span></th>
                <td className="py-2.5 px-3 text-right tabular-nums">{city.lst.toFixed(1)} °C</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{city.ndvi.toFixed(2)}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">{city.uhi.toFixed(1)} °C</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}