"use client";

import { useState } from "react";
import Link from "next/link";
import { useTerraPulseStore } from "@/lib/store";
import { computeDefensibleScenario } from "@/lib/simulator";

interface WardData {
  id: string;
  name: string;
  popDensity: number;
  lst: number;
  ndvi: number;
  vulnerablePct: number;
}

const SAMPLE_WARDS: WardData[] = [
  { id: "CHE-W045", name: "Royapuram Ward 045", popDensity: 31000, lst: 41.1, ndvi: 0.09, vulnerablePct: 42 },
  { id: "CHE-W114", name: "T. Nagar Ward 114", popDensity: 24100, lst: 40.2, ndvi: 0.14, vulnerablePct: 28 },
  { id: "CHE-W117", name: "Velachery Ward 117", popDensity: 18500, lst: 39.5, ndvi: 0.19, vulnerablePct: 22 },
  { id: "CHE-W108", name: "Anna Nagar Ward 108", popDensity: 15200, lst: 37.8, ndvi: 0.29, vulnerablePct: 18 },
  { id: "CHE-W132", name: "Adyar Ward 132", popDensity: 11400, lst: 35.6, ndvi: 0.38, vulnerablePct: 12 },
];

export default function DecisionToolPage() {
  const { selectedCity, scenarioA, modelParams } = useTerraPulseStore();

  // Dynamic Prioritization Weights (Sum = 100%)
  const [wHeat, setWHeat] = useState(35);
  const [wVeg, setWVeg] = useState(25);
  const [wPop, setWPop] = useState(20);
  const [wVuln, setWVuln] = useState(20);

  // Calculate Weighted Vulnerability Index for each ward
  const rankedWards = SAMPLE_WARDS.map((ward) => {
    const heatScore = ((ward.lst - 30) / 15) * 100; // Normalize 30-45°C
    const vegDeficitScore = (1 - ward.ndvi) * 100;  // Higher deficit = higher score
    const popScore = (ward.popDensity / 35000) * 100;
    const vulnScore = ward.vulnerablePct * 2;

    const totalScore = Number(
      ((heatScore * wHeat + vegDeficitScore * wVeg + popScore * wPop + vulnScore * wVuln) / 100).toFixed(1)
    );

    return { ...ward, totalScore };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const scenarioOutcome = computeDefensibleScenario(scenarioA, modelParams, rankedWards.length);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 text-slate-100 print:bg-white print:text-black print:p-0">
      <div className="flex items-center justify-between border-b border-white/10 pb-6 print:border-black">
        <div>
          <Link href="/insights" className="text-xs font-mono uppercase tracking-widest text-emerald-400 hover:underline print:hidden">
            ← Back to Insights
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-light text-white print:text-black">
            Urban Heat Hotspot Prioritization & Action Plan
          </h1>
          <p className="mt-1 text-xs text-slate-400 print:text-gray-600 font-mono">
            Target Region: <strong>{selectedCity}</strong> · Observation Period: Sep 2026 – Oct 2026 · Dataset: MODIS / Landsat Hybrid Composite
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="rounded-full bg-emerald-400 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition-all print:hidden"
        >
          📄 Export PDF / Print Evidence Report
        </button>
      </div>

      {/* Prioritization Weights Controls */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-6 print:hidden">
        <h2 className="text-sm font-medium text-white mb-4">Adjust Prioritization Criteria Weights</h2>
        <div className="grid gap-6 md:grid-cols-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Surface Heat ({wHeat}%)</label>
            <input type="range" min="0" max="60" value={wHeat} onChange={(e) => setWHeat(Number(e.target.value))} className="w-full accent-emerald-400" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Vegetation Deficit ({wVeg}%)</label>
            <input type="range" min="0" max="60" value={wVeg} onChange={(e) => setWVeg(Number(e.target.value))} className="w-full accent-emerald-400" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Population Density ({wPop}%)</label>
            <input type="range" min="0" max="60" value={wPop} onChange={(e) => setWPop(Number(e.target.value))} className="w-full accent-emerald-400" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Demographic Vulnerability ({wVuln}%)</label>
            <input type="range" min="0" max="60" value={wVuln} onChange={(e) => setWVuln(Number(e.target.value))} className="w-full accent-emerald-400" />
          </div>
        </div>
      </section>

      {/* Ranked Hotspot Table */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden print:border-black print:bg-white">
        <table className="w-full text-left text-xs font-mono">
          <thead className="border-b border-white/10 bg-slate-950/80 text-slate-400 print:bg-gray-100 print:text-black">
            <tr>
              <th className="p-4">Rank</th>
              <th className="p-4">Ward / Neighborhood</th>
              <th className="p-4">Pop. Density</th>
              <th className="p-4">LST (°C)</th>
              <th className="p-4">NDVI</th>
              <th className="p-4">Prioritization Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 print:divide-gray-200">
            {rankedWards.map((ward, idx) => (
              <tr key={ward.id} className={idx === 0 ? "bg-emerald-950/20 print:bg-emerald-50" : ""}>
                <td className="p-4 font-bold text-emerald-400 print:text-black">#{idx + 1}</td>
                <td className="p-4 font-medium text-white print:text-black">{ward.name}</td>
                <td className="p-4 text-slate-300 print:text-black">{ward.popDensity.toLocaleString()} / km²</td>
                <td className="p-4 text-slate-300 print:text-black">{ward.lst.toFixed(1)} °C</td>
                <td className="p-4 text-slate-300 print:text-black">{ward.ndvi.toFixed(2)}</td>
                <td className="p-4 font-bold text-white print:text-black">{ward.totalScore} / 100</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Actionable Intervention Plan Overview */}
      <section className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-6 print:border-black print:bg-white">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-400 print:text-black mb-4">
          Recommended Actionable Intervention Plan
        </h2>
        <div className="grid gap-6 md:grid-cols-4 text-center font-mono">
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 print:border-gray-300 print:bg-white">
            <span className="text-[10px] text-slate-400 block">Projected Cooling</span>
            <span className="text-2xl font-light text-emerald-400 print:text-black">−{scenarioOutcome.totalCoolingC} °C</span>
            <span className="text-[9px] text-slate-500 block">±{scenarioOutcome.uncertaintyC} °C error</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 print:border-gray-300 print:bg-white">
            <span className="text-[10px] text-slate-400 block">Estimated Cost</span>
            <span className="text-2xl font-light text-white print:text-black">₹{(scenarioOutcome.totalCostInr / 10000000).toFixed(2)} Cr</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 print:border-gray-300 print:bg-white">
            <span className="text-[10px] text-slate-400 block">Trees to Plant</span>
            <span className="text-2xl font-light text-white print:text-black">{scenarioOutcome.treesToPlant.toLocaleString()}</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4 print:border-gray-300 print:bg-white">
            <span className="text-[10px] text-slate-400 block">Cost per °C</span>
            <span className="text-2xl font-light text-white print:text-black">₹{(scenarioOutcome.costPerDegreeInr / 100000).toFixed(1)} Lakh</span>
          </div>
        </div>
      </section>
    </main>
  );
}