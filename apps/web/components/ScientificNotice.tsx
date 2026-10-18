"use client";

import React from "react";

export interface ScientificNoticeProps {
  city?: string;
  lstValue?: number;
  ndviRange?: string;
}

export function ScientificNotice({
  city = "Chennai",
  lstValue = 40.2,
  ndviRange = "0.14 – 0.22",
}: ScientificNoticeProps) {
  return (
    <div className="my-6 rounded-2xl border border-amber-500/25 bg-amber-950/20 p-5 text-amber-200/90 text-xs leading-relaxed backdrop-blur-md">
      <div className="flex items-center gap-2 font-semibold uppercase tracking-wider text-amber-400 mb-2">
        <span className="text-base">⚠️</span>
        <span>Scientific Distinction: Land Surface Temperature (LST) vs. Air Temperature</span>
      </div>

      <p className="mb-2">
        The temperature metrics displayed across <strong>TERRAPULSE</strong> represent{" "}
        <strong>Land Surface Temperature (LST)</strong>—the radiometric skin temperature of the Earth's surface derived from satellite thermal IR sensors (MODIS / Landsat 8/9)—rather than 2-meter ambient air temperature (T_air) measured by weather station thermometers.
      </p>

      <ul className="list-disc space-y-1.5 pl-5 text-amber-300/80">
        <li>
          <strong>Skin vs. Air Temperature Offset:</strong> Midday urban asphalt and concrete skin temperatures frequently exceed ambient air temperatures by <strong>4 °C to 12 °C</strong> due to solar irradiance absorption.
        </li>
        <li>
          <strong>{city} dashboard snapshot:</strong> the displayed surface temperature is <strong>{lstValue.toFixed(1)} °C</strong> and NDVI is <strong>{ndviRange}</strong>. Their data sources and observation windows may differ; this descriptive snapshot does not establish causation.
        </li>
      </ul>
    </div>
  );
}