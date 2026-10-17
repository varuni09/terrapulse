import { cellToLatLng } from "h3-js";

/* ───────────────────────── Types ───────────────────────── */

export type Cell = {
  id: string; // H3 index
  name: string;
  baselineLst: number; // °C, land surface temperature
  ndvi: number; // 0..1 vegetation index
  population: number; // census/WorldPop values
  vulnerability: number; // 0..1 vulnerability score
};

export type Scenario = {
  treeCover: number; // +% canopy (0-50)
  coolRoofs: number; // % of roofs retrofitted (0-100)
  albedo: number; // +% pavement albedo (0-30)
};

/* ───────────────────────── Constants ───────────────────────── */

export const DEFAULT_SCENARIO: Scenario = {
  treeCover: 15,
  coolRoofs: 30,
  albedo: 10,
};

export const SCENARIO_LIMITS = {
  treeCover: { min: 0, max: 50 },
  coolRoofs: { min: 0, max: 100 },
  albedo: { min: 0, max: 30 },
};

/* ───────────────────────── Data ───────────────────────── */

export const CELLS: Cell[] = [
  {
    id: "88618c49b9fffff",
    name: "North Port / Industrial Belt",
    baselineLst: 40.62,
    ndvi: 0.18,
    population: 42000,
    vulnerability: 0.72,
  },
  {
    id: "88618c49b1fffff",
    name: "Central Commercial Core",
    baselineLst: 40.21,
    ndvi: 0.21,
    population: 58000,
    vulnerability: 0.55,
  },
  {
    id: "88618c49b5fffff",
    name: "South Metro Junction",
    baselineLst: 38.95,
    ndvi: 0.28,
    population: 36000,
    vulnerability: 0.61,
  },
];

/* ───────────────────────── Helper Functions ───────────────────────── */

export function cooling(s: Scenario) {
  const tree = s.treeCover * 0.05;
  const roof = s.coolRoofs * 0.02;
  const albedo = s.albedo * 0.03;
  return {
    tree,
    roof,
    albedo,
    total: tree + roof + albedo,
  };
}

export function impact(cells: Cell[], s: Scenario) {
  const totalCooling = cooling(s).total;
  const totalPop = cells.reduce((acc, c) => acc + c.population, 0);

  const treesNeeded = Math.round(s.treeCover * 2500);
  const costInr = treesNeeded * 450 + s.coolRoofs * 60000 + s.albedo * 35000;
  const peopleHelped = Math.round(totalPop * Math.min(1, totalCooling / 3));
  const costPerDegreeInr = totalCooling > 0 ? costInr / totalCooling : 0;

  return {
    trees: treesNeeded,
    costInr,
    peopleHelped,
    costPerDegreeInr,
  };
}

export function priorityScore(cell: Cell): number {
  return Math.min(100, Math.round(((cell.baselineLst - 35) / 10) * 100));
}

export function formatInr(n: number): string {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}