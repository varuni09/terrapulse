"use client";

import { useState } from "react";

export interface ProvenanceMeta {
  source: string; // e.g., "MODIS MOD11A1 / Landsat 8 TIRS"
  acquisitionDate: string; // e.g., "2026-10-15T08:30:00Z"
  spatialResolution: string; // e.g., "1 km MODIS resampled to H3 Res 8 (~0.737 km²)"
  processingMethod: string; // e.g., "Split-window LST inversion + QA cloud masking"
  dataMode: "LIVE_TELEMETRY" | "CACHED_COMPOSITE" | "REGIONAL_ESTIMATE" | "DEMO_BASELINE";
}

export function DataProvenanceDrawer({ meta }: { meta: ProvenanceMeta }) {
  const [open, setOpen] = useState(false);

  const modeBadgeColor =
    meta.dataMode === "LIVE_TELEMETRY"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : meta.dataMode === "CACHED_COMPOSITE"
      ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
      : "bg-amber-500/20 text-amber-400 border-amber-500/30";

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 text-xs font-mono">
      <div className="flex items-center justify-between">
        <span className="text-slate-400">DATA PROVENANCE & TRACEABILITY</span>
        <button
          onClick={() => setOpen(!open)}
          className="text-emerald-400 hover:underline focus:outline-none"
        >
          {open ? "[ Hide Traceability Details ]" : "[ Inspect Telemetry Source ]"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${modeBadgeColor}`}>
          ● {meta.dataMode.replace("_", " ")}
        </span>
        <span className="text-slate-300">{meta.source}</span>
      </div>

      {open && (
        <div className="mt-4 space-y-2.5 border-t border-white/10 pt-3 text-slate-400">
          <div>
            <strong className="text-slate-200">Acquisition Date / Window:</strong>
            <p className="mt-0.5 text-slate-300">{meta.acquisitionDate}</p>
          </div>
          <div>
            <strong className="text-slate-200">Spatial Resolution:</strong>
            <p className="mt-0.5 text-slate-300">{meta.spatialResolution}</p>
          </div>
          <div>
            <strong className="text-slate-200">Processing Methodology:</strong>
            <p className="mt-0.5 text-slate-300">{meta.processingMethod}</p>
          </div>
        </div>
      )}
    </div>
  );
}