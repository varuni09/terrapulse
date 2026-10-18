"use client";

import { useTerraPulseStore } from "@/lib/store";
import { computeDefensibleScenario } from "@/lib/simulator";

export function ScenarioImpactCard({ planKey = "A" }: { planKey?: "A" | "B" }) {
  const { scenarioA, scenarioB, modelParams } = useTerraPulseStore();
  
  const levers = planKey === "A" ? scenarioA : scenarioB;
  const outcome = computeDefensibleScenario(levers, modelParams, 5);

  const baselineTemp = 39.8;
  const projectedTemp = baselineTemp - outcome.totalCoolingC;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-slate-900/90 p-7 shadow-2xl backdrop-blur-xl">
      {/* Background Glow */}
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">
            Defensible Intervention Scenario — Plan {planKey}
          </span>
          <h3 className="font-serif text-2xl font-light text-white mt-1">
            Projected Surface Relief
          </h3>
        </div>
        <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1 text-xs font-mono text-emerald-300">
          Empirical Physics Model
        </div>
      </div>

      {/* Primary Temperature Comparison Grid */}
      <div className="mt-6 grid grid-cols-3 gap-6 text-center">
        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4">
          <span className="text-xs text-slate-400 block font-sans">Baseline LST</span>
          <span className="font-mono text-3xl font-light text-slate-300 mt-1 block">
            {baselineTemp.toFixed(2)} °C
          </span>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <span className="text-xs text-emerald-400 block font-sans font-medium">Net Reduction</span>
          <span className="font-mono text-3xl font-bold text-emerald-300 mt-1 block">
            −{outcome.totalCoolingC.toFixed(2)} °C
          </span>
          <span className="text-[10px] text-slate-500 block font-mono mt-0.5">
            ±{outcome.uncertaintyC} °C error bound
          </span>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-4">
          <span className="text-xs text-slate-400 block font-sans">Projected LST</span>
          <span className="font-mono text-3xl font-light text-white mt-1 block">
            {projectedTemp.toFixed(2)} °C
          </span>
        </div>
      </div>

      {/* Breakdown by Intervention Contribution */}
      <div className="mt-6 space-y-3 font-mono text-xs border-t border-white/10 pt-5">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Tree Canopy Expansion (+{levers.treeCover}%):</span>
          <span className="text-emerald-300 font-semibold">−{outcome.canopyCoolingC.toFixed(2)} °C</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Cool Roof Retrofitting (+{levers.coolRoofs}%):</span>
          <span className="text-emerald-300 font-semibold">−{outcome.coolRoofCoolingC.toFixed(2)} °C</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Pavement Albedo Boost (+{levers.albedo}%):</span>
          <span className="text-emerald-300 font-semibold">−{outcome.albedoCoolingC.toFixed(2)} °C</span>
        </div>
      </div>

      {/* Financial & Area Impact Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 font-mono text-xs">
        <div>
          <span className="text-slate-500 block">Total Budget Needed:</span>
          <span className="text-lg font-light text-white">₹{(outcome.totalCostInr / 10000000).toFixed(2)} Cr</span>
        </div>
        <div>
          <span className="text-slate-500 block">Target Area Covered:</span>
          <span className="text-lg font-light text-white">{(outcome.areaImpactedSqm / 1000000).toFixed(2)} km²</span>
        </div>
      </div>
    </div>
  );
}