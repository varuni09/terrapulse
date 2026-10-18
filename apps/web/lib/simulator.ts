import { ScenarioLevers, ModelParameters } from "./store";

export interface ScenarioOutcome {
  canopyCoolingC: number;
  coolRoofCoolingC: number;
  albedoCoolingC: number;
  totalCoolingC: number;
  uncertaintyC: number;
  totalCostInr: number;
  costPerDegreeInr: number;
  treesToPlant: number;
  areaImpactedSqm: number;
}

export function computeDefensibleScenario(
  levers: ScenarioLevers,
  params: ModelParameters,
  cellCount = 5,
  cellAreaSqm = 737000
): ScenarioOutcome {
  const totalAreaSqm = cellCount * cellAreaSqm;

  // Empirical Cooling Calculations (°C)
  const canopyCoolingC = (levers.treeCover / 10) * params.canopyCoeff;
  const coolRoofCoolingC = (levers.coolRoofs / 10) * (params.albedoCoeff * 0.8);
  const albedoCoolingC = (levers.albedo / 10) * params.albedoCoeff;
  
  const totalCoolingC = Number((canopyCoolingC + coolRoofCoolingC + albedoCoolingC).toFixed(2));
  const uncertaintyC = 0.35; // Empirical error margin

  // Cost Computations (INR)
  const treeAreaSqm = totalAreaSqm * (levers.treeCover / 100);
  const coolRoofAreaSqm = totalAreaSqm * 0.35 * (levers.coolRoofs / 100); // Assuming 35% rooftop area
  
  const treeCostInr = treeAreaSqm * params.treeCostPerSqm;
  const coolRoofCostInr = coolRoofAreaSqm * params.coolRoofCostPerSqm;
  const totalCostInr = Math.round(treeCostInr + coolRoofCostInr);
  
  const costPerDegreeInr = totalCoolingC > 0 ? Math.round(totalCostInr / totalCoolingC) : 0;
  const treesToPlant = Math.round(treeAreaSqm / 12); // ~12m² canopy per mature urban tree

  return {
    canopyCoolingC: Number(canopyCoolingC.toFixed(2)),
    coolRoofCoolingC: Number(coolRoofCoolingC.toFixed(2)),
    albedoCoolingC: Number(albedoCoolingC.toFixed(2)),
    totalCoolingC,
    uncertaintyC,
    totalCostInr,
    costPerDegreeInr,
    treesToPlant,
    areaImpactedSqm: totalAreaSqm,
  };
}