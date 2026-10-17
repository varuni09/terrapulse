import React from "react";
import AiAnalyst from "../../insights/AiAnalyst";
import AnalyticsPanel from "../../components/AnalyticsPanel";

export default function InsightsPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 md:p-12 text-slate-100">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">
            TerraPulse Intelligence Engine
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-white">
            Evidence & Grounded Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Inspect satellite-verified correlations, temperature distributions, and query the live AI analyst backed by real telemetry feeds.
          </p>
        </div>

        {/* Analytics Distribution & Metrics */}
        <AnalyticsPanel />

        {/* Grounded AI Analyst Section */}
        <div className="grid grid-cols-1 gap-8">
          <AiAnalyst />
        </div>
      </div>
    </main>
  );
}