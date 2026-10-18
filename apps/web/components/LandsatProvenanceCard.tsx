"use client";

import { useEffect, useState } from "react";

interface ProvenanceData {
  success: boolean;
  provenance?: {
    dataset: string;
    observation_date: string | null;
    cloud_cover_percent: number | null;
    spatial_resolution: string;
    processing_level: string;
    spacecraft: string | null;
    scene_id: string | null;
    search_window_days: number;
  };
  metrics?: {
    mean_lst_celsius: number | null;
    mean_ndvi: number | null;
    valid_pixels_pct: number | null;
  };
  reason?: string;
}

export function LandsatProvenanceCard({ lat, lon }: { lat: number; lon: number }) {
  const [data, setData] = useState<ProvenanceData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProvenance() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/gee/provenance?lat=${lat}&lon=${lon}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError(json.reason || "Unable to retrieve Landsat scene provenance.");
        } else {
          setData(json);
        }
      } catch (err) {
        setError("Network error fetching telemetry provenance.");
      } finally {
        setLoading(false);
      }
    }

    fetchProvenance();
  }, [lat, lon]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 text-xs font-mono text-slate-400">
        <span className="inline-block animate-pulse">🛰️ Querying Earth Engine scene metadata...</span>
      </div>
    );
  }

  if (error || !data || !data.provenance) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4 text-xs font-mono text-amber-300">
        <p className="font-semibold mb-1">⚠️ Satellite Telemetry Notice</p>
        <p className="text-slate-400">{error || "No clear Landsat pass available for this point."}</p>
      </div>
    );
  }

  const { provenance, metrics } = data;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-slate-900/90 p-4 text-xs font-mono text-slate-200">
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
        <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">
          LIVE SATELLITE PROVENANCE
        </span>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
          ● Clear Pass Verified
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
        <div>
          <span className="text-slate-400 block text-[10px]">LST Skin Temp:</span>
          <span className="font-bold text-white text-sm">
            {metrics?.mean_lst_celsius != null ? `${metrics.mean_lst_celsius} °C` : "N/A"}
          </span>
        </div>
        <div>
          <span className="text-slate-400 block text-[10px]">Vegetation (NDVI):</span>
          <span className="font-bold text-emerald-400 text-sm">
            {metrics?.mean_ndvi != null ? metrics.mean_ndvi : "N/A"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-white/10 pt-2 text-[10px] text-slate-400">
        <p>
          <strong className="text-slate-300">Sensor:</strong> {provenance.dataset} ({provenance.spacecraft})
        </p>
        <p>
          <strong className="text-slate-300">Observation Date:</strong>{" "}
          <span className="text-emerald-300">{provenance.observation_date}</span>
        </p>
        <p>
          <strong className="text-slate-300">Scene Cloud Cover:</strong> {provenance.cloud_cover_percent}%
        </p>
        <p>
          <strong className="text-slate-300">Clear Pixel Area:</strong> {metrics?.valid_pixels_pct}% valid
        </p>
        <p className="truncate text-slate-500 font-mono text-[9px] mt-1">
          Scene ID: {provenance.scene_id}
        </p>
      </div>
    </div>
  );
}