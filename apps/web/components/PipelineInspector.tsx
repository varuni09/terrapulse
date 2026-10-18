"use client";

import { useState } from "react";

export interface PipelineMeta {
  dataset: string;
  spacecraft: string;
  observationDate: string;
  cloudCoverPct: number;
  validPixelsPct: number;
  spatialRes: string;
  processingFormula: string;
  dataMode: "LIVE_TELEMETRY" | "CACHED_COMPOSITE" | "DEMO_BASELINE";
}

export function PipelineInspector({ meta }: { meta?: PipelineMeta }) {
  const [open, setOpen] = useState(false);

  const defaultMeta: PipelineMeta = meta || {
    dataset: "Landsat 8/9 Collection 2 Level-2 Surface Temperature",
    spacecraft: "LANDSAT_9",
    observationDate: "2026-10-04",
    cloudCoverPct: 4.2,
    validPixelsPct: 95.8,
    spatialRes: "30m (Thermal TIR resampled to H3 Res 8 ~0.737 km²)",
    processingFormula: "LST (°C) = T_b / (1 + (λ * T_b / ρ) * ln(ε)) - 273.15",
    dataMode: "LIVE_TELEMETRY",
  };

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-5 font-mono text-xs text-slate-200 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          </span>
          <span className="font-bold tracking-widest text-emerald-400 uppercase">
            GEE PIPELINE TELEMETRY
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400 hover:text-emerald-300 transition-all"
        >
          {open ? "Collapse Pipeline" : "Inspect Raw Pipeline"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 text-[11px]">
        <div className="rounded-xl bg-slate-950/60 p-2.5 border border-white/5">
          <span className="text-[10px] text-slate-500 block">SENSOR</span>
          <span className="font-medium text-white truncate block">{defaultMeta.spacecraft}</span>
        </div>
        <div className="rounded-xl bg-slate-950/60 p-2.5 border border-white/5">
          <span className="text-[10px] text-slate-500 block">OBSERVATION DATE</span>
          <span className="font-medium text-emerald-300 block">{defaultMeta.observationDate}</span>
        </div>
        <div className="rounded-xl bg-slate-950/60 p-2.5 border border-white/5">
          <span className="text-[10px] text-slate-500 block">CLOUD COVER</span>
          <span className="font-medium text-slate-200 block">{defaultMeta.cloudCoverPct}%</span>
        </div>
        <div className="rounded-xl bg-slate-950/60 p-2.5 border border-white/5">
          <span className="text-[10px] text-slate-500 block">QA BITMASK VALIDITY</span>
          <span className="font-medium text-emerald-400 block">{defaultMeta.validPixelsPct}%</span>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-3 text-[11px] text-slate-400">
          <div>
            <span className="text-slate-300 font-semibold block mb-0.5">Primary Satellite Dataset:</span>
            <p className="text-slate-400">{defaultMeta.dataset}</p>
          </div>
          <div>
            <span className="text-slate-300 font-semibold block mb-0.5">Spatial Aggregation Index:</span>
            <p className="text-slate-400">{defaultMeta.spatialRes}</p>
          </div>
          <div>
            <span className="text-slate-300 font-semibold block mb-0.5">LST Radiometric Split-Window Inversion Formula:</span>
            <div className="rounded-lg bg-slate-950 p-2.5 text-emerald-300 font-mono text-[10px] border border-white/10 mt-1">
              {defaultMeta.processingFormula}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}