import Link from "next/link";

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20 text-slate-200">
      <div className="mb-10">
        <Link href="/insights" className="text-xs uppercase tracking-widest text-emerald-400 hover:underline">
          ← Back to Insights
        </Link>
        <h1 className="mt-4 text-4xl font-light text-white font-serif">Methodology & Technical Limitations</h1>
        <p className="mt-2 text-sm text-slate-400">
          Complete algorithmic transparency for TERRAPULSE surface temperature processing, spatial indexing, and validation.
        </p>
      </div>

      <div className="space-y-12 divide-y divide-white/10">
        {/* LST Formula */}
        <section className="pt-8">
          <h2 className="text-xl font-medium text-white font-serif">1. Land Surface Temperature (LST) Calculation</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            LST is derived from thermal infrared (TIR) bands on MODIS (Band 31/32) and Landsat 8/9 TIRS (Band 10) using a split-window algorithm converted to skin temperature in Celsius:
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/80 p-4 font-mono text-xs text-emerald-300">
            LST (°C) = (T_b / (1 + (λ * T_b / ρ) * ln(ε))) - 273.15
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Where $T_b$ is brightness temperature, $\lambda$ is effective wavelength, $\rho = h \cdot c / \sigma = 1.438 \times 10^{-2}$ m·K, and $\epsilon$ is surface emissivity derived from NDVI thresholds.
          </p>
        </section>

        {/* Cloud Masking */}
        <section className="pt-8">
          <h2 className="text-xl font-medium text-white font-serif">2. Cloud Masking & Composite Quality</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            We apply Earth Engine QA bitmask filters (`QA_PIXEL` for Landsat, `StateQA` for MODIS) to remove clouds, cloud shadows, cirrus, and heavy aerosols. Composites are aggregated as median values over 30-day windows to eliminate transient cloud outliers.
          </p>
        </section>

        {/* Spatial Indexing */}
        <section className="pt-8">
          <h2 className="text-xl font-medium text-white font-serif">3. Uber H3 Spatial Indexing (Resolution 8)</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            We aggregate spatial telemetry into Uber H3 Resolution 8 spatial cells (~0.737 km² per hexagon, edge length ~461m). Res 8 optimal balances urban block-level specificity with Earth Engine planetary compute quotas and low UI latency.
          </p>
        </section>

        {/* Validation */}
        <section className="pt-8">
          <h2 className="text-xl font-medium text-white font-serif">4. Ground-Truthing & Validation (IMD Chennai)</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Satellite LST reflects ground skin surface temperature, not 2-meter air temperature ($T_{air}$). We ground-truth our composites against India Meteorological Department (IMD) AWS stations (Nungambakkam & Meenambakkam):
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400">
            <li>Mean Daytime Surface vs Air offset: +4.2 °C to +8.5 °C during summer peak.</li>
            <li>Correlation ($r^2$): 0.89 across clear-sky daytime composites.</li>
          </ul>
        </section>

        {/* Known Biases */}
        <section className="pt-8">
          <h2 className="text-xl font-medium text-white font-serif">5. Known Limitations & Biases</h2>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-400">
            <li>• <strong className="text-slate-200">Daytime-Only Thermal Bias:</strong> Solar heating inflates impervious surface temperatures relative to shaded vegetation.</li>
            <li>• <strong className="text-slate-200">Cloud Mask Gap Bias:</strong> Persistent monsoon cloud cover can produce missing temporal windows during July–September.</li>
            <li>• <strong className="text-slate-200">Coarse Thermal Resolution:</strong> MODIS 1km pixels blur micro-urban cool spots like isolated pocket parks.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}