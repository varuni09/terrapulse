import { create } from "zustand";

export interface ScenarioLevers {
  treeCover: number; // 0 - 40 %
  coolRoofs: number; // 0 - 80 %
  albedo: number;    // 0 - 30 %
}

export interface ModelParameters {
  canopyCoeff: number;   // °C drop per 10% canopy
  albedoCoeff: number;   // °C drop per 10% reflectance
  treeCostPerSqm: number;// INR per m²
  coolRoofCostPerSqm: number; // INR per m²
}

export interface TerraPulseState {
  selectedCity: string;
  selectedWardId: string | null;
  scenarioA: ScenarioLevers;
  scenarioB: ScenarioLevers;
  modelParams: ModelParameters;
  
  // Actions
  setSelectedCity: (city: string) => void;
  setSelectedWardId: (wardId: string | null) => void;
  setScenarioA: (levers: Partial<ScenarioLevers>) => void;
  setScenarioB: (levers: Partial<ScenarioLevers>) => void;
  setModelParams: (params: Partial<ModelParameters>) => void;
}

export const useTerraPulseStore = create<TerraPulseState>((set) => ({
  selectedCity: "Chennai",
  selectedWardId: null,
  scenarioA: { treeCover: 15, coolRoofs: 30, albedo: 10 },
  scenarioB: { treeCover: 30, coolRoofs: 60, albedo: 20 },
  modelParams: {
    canopyCoeff: 0.32,
    albedoCoeff: 0.18,
    treeCostPerSqm: 380,
    coolRoofCostPerSqm: 210,
  },

  setSelectedCity: (city) => set({ selectedCity: city, selectedWardId: null }),
  setSelectedWardId: (wardId) => set({ selectedWardId: wardId }),
  setScenarioA: (levers) => set((s) => ({ scenarioA: { ...s.scenarioA, ...levers } })),
  setScenarioB: (levers) => set((s) => ({ scenarioB: { ...s.scenarioB, ...levers } })),
  setModelParams: (params) => set((s) => ({ modelParams: { ...s.modelParams, ...params } })),
}));