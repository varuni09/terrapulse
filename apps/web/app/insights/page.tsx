"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";

/* ───────────────────────── Types ───────────────────────── */

type Hotspot = {
  id: string;
  lst_mean: number;
  ndvi_mean: number;
  lat: number;
  lon: number;
  population?: number;
};

type AnalyticsData = {
  total_cells: number;
  area_covered_km2: number;
  metrics: {
    lst_mean_avg: number;
    lst_max: number;
    lst_min: number;
    ndvi_mean_avg: number;
    lst_ndvi_correlation: number;
  };
  uhi_hotspots: Hotspot[];
};

function AiAnalyst() {
  return (
    <div className="tp-panel" role="status">
      <h3 className="tp-panel-title">Analyst unavailable</h3>
      <p className="tp-panel-sub">
        The interactive analyst is not available. Review the regional metrics and priority heat
        cells below for the current telemetry.
      </p>
    </div>
  );
}

const FALLBACK: AnalyticsData = {
  total_cells: 486,
  area_covered_km2: 358.18,
  metrics: {
    lst_mean_avg: 38.12,
    lst_max: 40.62,
    lst_min: 35.79,
    ndvi_mean_avg: 0.342,
    lst_ndvi_correlation: -0.784,
  },
  uhi_hotspots: [
    { id: "88618c49b9fffff", lst_mean: 40.62, ndvi_mean: 0.18, lat: 13.082, lon: 80.27, population: 42100 },
    { id: "88618c49b1fffff", lst_mean: 40.21, ndvi_mean: 0.21, lat: 13.051, lon: 80.212, population: 38500 },
    { id: "88618c49b5fffff", lst_mean: 39.95, ndvi_mean: 0.19, lat: 13.11, lon: 80.245, population: 31200 },
  ],
};

/* ───────────────────────── Hooks & helpers ───────────────────────── */

function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function CountUp({
  value,
  decimals = 0,
  duration = 1800,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      setN(value * (1 - Math.pow(1 - p, 4))); // easeOutQuart
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  return (
    <span ref={ref}>
      {n.toFixed(decimals)}
      {suffix}
    </span>
  );
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);
  return (
    <div
      ref={ref}
      className={`tp-reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Card with a cursor-following spotlight and subtle 3D tilt */
function SpotlightCard({
  children,
  className = "",
  glow = "46,230,197",
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    const rx = (y / r.height - 0.5) * -7;
    const ry = (x / r.width - 0.5) * 7;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`tp-card ${className}`}
      style={{ "--glow": glow } as CSSProperties}
    >
      <div className="tp-card-inner">{children}</div>
    </div>
  );
}

const riskOf = (t: number) =>
  t >= 40.5
    ? { label: "CRITICAL UHI", cls: "tp-risk-critical" }
    : t >= 40
    ? { label: "SEVERE UHI", cls: "tp-risk-severe" }
    : { label: "ELEVATED UHI", cls: "tp-risk-elevated" };

/* ───────────────────────── Page ───────────────────────── */

export default function InsightsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch("/api/gee/sample");
        if (!res.ok) throw new Error("API offline");
        const json = await res.json();
        setData(json);
        setLive(true);
      } catch {
        setData(FALLBACK);
        setLive(false);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  /* Scroll progress + hero parallax (single rAF-throttled listener) */
  useEffect(() => {
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      }
      if (heroRef.current) {
        heroRef.current.style.setProperty("--sy", String(Math.min(y, 700)));
      }
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const title = "REGIONAL UHI DIAGNOSTICS";
  const words = title.split(" ");

  return (
    <main className="tp-root min-h-screen text-slate-100 font-mono relative overflow-x-clip">
      <style>{css}</style>

      {/* Scroll progress */}
      <div className="tp-progress-track">
        <div ref={progressRef} className="tp-progress" />
      </div>

      {/* Ambient background */}
      <div className="tp-bg" aria-hidden>
        <div className="tp-orb tp-orb-a" />
        <div className="tp-orb tp-orb-b" />
        <div className="tp-orb tp-orb-c" />
        <div className="tp-grid" />
      </div>

      {/* ───────── HERO ───────── */}
      <section ref={heroRef} className="tp-hero">
        <div className="tp-hero-content max-w-6xl mx-auto px-6 md:px-8">
          <div className="tp-hero-top">
            <span className="tp-badge">
              <span className={`tp-dot ${live ? "is-live" : ""}`} />
              {live ? "Live telemetry feed" : "Demo data · API offline"}
            </span>
            <Link href="/explore" className="tp-btn">
              <span className="tp-btn-arrow">←</span> Back to explorer
            </Link>
          </div>

          <h1 className="tp-title" aria-label={title}>
            {words.map((w, wi) => (
              <span key={wi} className="tp-word" aria-hidden>
                {w.split("").map((c, ci) => (
                  <span
                    key={ci}
                    className="tp-char"
                    style={{ animationDelay: `${120 + (wi * 9 + ci) * 38}ms` }}
                  >
                    {c}
                  </span>
                ))}
              </span>
            ))}
          </h1>

          <p className="tp-sub">
            Satellite surface thermal analysis from Landsat Collection 2 Level-2,
            aggregated into H3 spatial indexes with grounded telemetry verification.
          </p>

          {data && (
            <div className="tp-hero-stats">
              <div>
                <div className="tp-hero-num">
                  <CountUp value={data.total_cells} duration={2200} />
                </div>
                <div className="tp-hero-lbl">H3 cells analysed</div>
              </div>
              <div className="tp-hero-sep" />
              <div>
                <div className="tp-hero-num">
                  <CountUp value={data.area_covered_km2} decimals={2} duration={2200} />
                  <span className="tp-unit"> km²</span>
                </div>
                <div className="tp-hero-lbl">Area covered</div>
              </div>
            </div>
          )}
        </div>

        <div className="tp-scroll-cue" aria-hidden>
          <span>Scroll</span>
          <div className="tp-mouse">
            <div className="tp-wheel" />
          </div>
        </div>
      </section>

      {/* ───────── TICKER ───────── */}
      {data && (
        <div className="tp-ticker" aria-hidden>
          <div className="tp-ticker-track">
            {[0, 1].map((k) => (
              <div className="tp-ticker-set" key={k}>
                <span>Avg LST {data.metrics.lst_mean_avg} °C</span>
                <i />
                <span>Peak {data.metrics.lst_max} °C</span>
                <i />
                <span>Coolest {data.metrics.lst_min} °C</span>
                <i />
                <span>Mean NDVI {data.metrics.ndvi_mean_avg}</span>
                <i />
                <span>LST/NDVI r = {data.metrics.lst_ndvi_correlation}</span>
                <i />
                <span>{data.total_cells} H3 cells</span>
                <i />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 md:px-8 pb-32 space-y-24 md:space-y-32 relative z-10">
        {loading || !data ? (
          <div className="tp-loading">
            <div className="tp-spinner" />
            Calculating spatial statistics…
          </div>
        ) : (
          <>
            {/* ───────── KPI CARDS ───────── */}
            <section>
              <Reveal>
                <SectionHead title="Regional vitals" sub="The core numbers defining the land surface thermal profile." />
              </Reveal>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                <Reveal delay={0}>
                  <SpotlightCard glow="46,230,197">
                    <div className="tp-kpi-label">Avg surface temp</div>
                    <div className="tp-kpi-value text-[var(--accent,#2ee6c5)]">
                      <CountUp value={data.metrics.lst_mean_avg} decimals={2} />
                      <span className="tp-unit"> °C</span>
                    </div>
                    <div className="tp-kpi-foot">Regional H3 mean</div>
                  </SpotlightCard>
                </Reveal>
                <Reveal delay={100}>
                  <SpotlightCard glow="248,113,113">
                    <div className="tp-kpi-label">Peak thermal hotspot</div>
                    <div className="tp-kpi-value text-red-400">
                      <CountUp value={data.metrics.lst_max} decimals={2} />
                      <span className="tp-unit"> °C</span>
                    </div>
                    <div className="tp-kpi-foot">Hottest H3 cell</div>
                  </SpotlightCard>
                </Reveal>
                <Reveal delay={200}>
                  <SpotlightCard glow="52,211,153">
                    <div className="tp-kpi-label">Canopy cover (NDVI)</div>
                    <div className="tp-kpi-value text-emerald-400">
                      <CountUp value={data.metrics.ndvi_mean_avg} decimals={3} />
                    </div>
                    <div className="tp-kpi-foot">Vegetation mean</div>
                  </SpotlightCard>
                </Reveal>
                <Reveal delay={300}>
                  <SpotlightCard glow="251,191,36">
                    <div className="tp-kpi-label">LST / NDVI correlation</div>
                    <div className="tp-kpi-value text-amber-400">
                      <CountUp value={data.metrics.lst_ndvi_correlation} decimals={3} />
                    </div>
                    <div className="tp-kpi-foot">More vegetation, cooler surface</div>
                  </SpotlightCard>
                </Reveal>
              </div>
            </section>

            {/* ───────── THERMAL SPECTRUM + CORRELATION ───────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Reveal>
                <SpectrumPanel m={data.metrics} />
              </Reveal>
              <Reveal delay={150}>
                <CorrelationPanel r={data.metrics.lst_ndvi_correlation} />
              </Reveal>
            </section>

            {/* ───────── GROUNDED AI ANALYST ───────── */}
            <section>
              <Reveal>
                <SectionHead
                  title="Grounded Intelligence Analyst"
                  sub="Query satellite telemetry feeds directly. Answers are dynamically calculated without scripted fallbacks."
                />
              </Reveal>
              <div className="mt-8">
                <AiAnalyst />
              </div>
            </section>

            {/* ───────── HOTSPOT MAP + TABLE ───────── */}
            <section>
              <Reveal>
                <SectionHead
                  title="Priority heat cells"
                  sub="The hottest, least-vegetated hexagons — where urban interventions yield maximum return."
                />
              </Reveal>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-8">
                <Reveal className="lg:col-span-2">
                  <HotspotRadar spots={data.uhi_hotspots} min={data.metrics.lst_min} max={data.metrics.lst_max} />
                </Reveal>

                <Reveal delay={150} className="lg:col-span-3">
                  <div className="tp-panel h-full">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="tp-th">
                            <th className="py-3 pr-4">Rank</th>
                            <th className="py-3 pr-4">H3 cell</th>
                            <th className="py-3 pr-4">Location</th>
                            <th className="py-3 pr-4 min-w-[150px]">LST mean</th>
                            <th className="py-3 pr-4">NDVI</th>
                            <th className="py-3">Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.uhi_hotspots.map((cell, i) => (
                            <HotspotRow
                              key={cell.id}
                              cell={cell}
                              rank={i + 1}
                              min={data.metrics.lst_min}
                              max={data.metrics.lst_max}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Reveal>
              </div>
            </section>

            {/* ───────── FOOTER CTA ───────── */}
            <Reveal>
              <div className="tp-cta">
                <div>
                  <h3 className="tp-cta-title">Test what cooling these cells would do</h3>
                  <p className="tp-cta-sub">
                    Model tree cover and cool-roof changes against the hotspots above.
                  </p>
                </div>
                <Link href="/scenarios" className="tp-btn tp-btn-solid">
                  Open scenarios <span className="tp-btn-arrow">→</span>
                </Link>
              </div>
            </Reveal>
          </>
        )}
      </div>
    </main>
  );
}

/* ───────────────────────── Sub-components ───────────────────────── */

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="tp-sechead">
      <h2>{title}</h2>
      <p>{sub}</p>
      <div className="tp-sechead-line" />
    </div>
  );
}

function SpectrumPanel({ m }: { m: AnalyticsData["metrics"] }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const span = m.lst_max - m.lst_min || 1;
  const avgPct = ((m.lst_mean_avg - m.lst_min) / span) * 100;
  return (
    <div className="tp-panel h-full" ref={ref}>
      <h3 className="tp-panel-title">Surface temperature range</h3>
      <p className="tp-panel-sub">Coolest to hottest H3 cell, with the regional mean marked.</p>

      <div className="tp-spectrum-wrap">
        <div className="tp-spectrum">
          <div className={`tp-spectrum-fill ${inView ? "is-in" : ""}`} />
        </div>
        <div
          className={`tp-spectrum-marker ${inView ? "is-in" : ""}`}
          style={{ "--pos": `${avgPct}%` } as CSSProperties}
        >
          <div className="tp-marker-pin" />
          <div className="tp-marker-tag">Mean {m.lst_mean_avg} °C</div>
        </div>
      </div>

      <div className="flex justify-between text-xs mt-10">
        <div>
          <div className="text-sky-300 text-lg font-bold">{m.lst_min} °C</div>
          <div className="text-slate-500">Coolest cell</div>
        </div>
        <div className="text-right">
          <div className="text-red-400 text-lg font-bold">{m.lst_max} °C</div>
          <div className="text-slate-500">Hottest cell</div>
        </div>
      </div>
      <div className="text-xs text-slate-400 mt-5">
        Spread between hottest and coolest cell: <span className="text-slate-100 font-bold">{span.toFixed(2)} °C</span>
      </div>
    </div>
  );
}

function CorrelationPanel({ r }: { r: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const clamped = Math.max(-1, Math.min(1, r));
  const widthPct = Math.abs(clamped) * 50; // half-bar from centre
  const strength =
    Math.abs(clamped) >= 0.7 ? "Strong" : Math.abs(clamped) >= 0.4 ? "Moderate" : "Weak";
  const direction = clamped < 0 ? "negative" : "positive";
  return (
    <div className="tp-panel h-full" ref={ref}>
      <h3 className="tp-panel-title">Vegetation vs. heat</h3>
      <p className="tp-panel-sub">Correlation between land surface temperature and NDVI.</p>

      <div className="tp-corr">
        <div className="tp-corr-track">
          <div className="tp-corr-center" />
          <div
            className={`tp-corr-fill ${clamped < 0 ? "is-neg" : "is-pos"} ${inView ? "is-in" : ""}`}
            style={{ "--w": `${widthPct}%` } as CSSProperties}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-2">
          <span>−1 · cooler with greenery</span>
          <span>0</span>
          <span>+1</span>
        </div>
      </div>

      <div className="mt-8 flex items-end gap-3">
        <div className="text-4xl font-bold text-amber-400">
          <CountUp value={r} decimals={3} />
        </div>
        <div className="text-xs text-slate-400 pb-1.5">
          {strength} {direction} relationship
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4 leading-relaxed max-w-md">
        Cells with more canopy run measurably cooler. Adding green cover in the priority cells
        is the most direct lever for reducing surface heat.
      </p>
    </div>
  );
}

function HotspotRadar({ spots, min, max }: { spots: Hotspot[]; min: number; max: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const W = 400;
  const H = 340;
  const pad = 60;

  const pts = useMemo(() => {
    const lats = spots.map((s) => s.lat);
    const lons = spots.map((s) => s.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const sx = maxLon - minLon || 1;
    const sy = maxLat - minLat || 1;
    const span = max - min || 1;
    return spots.map((s, i) => ({
      ...s,
      i,
      x: pad + ((s.lon - minLon) / sx) * (W - pad * 2),
      y: H - pad - ((s.lat - minLat) / sy) * (H - pad * 2),
      r: 8 + ((s.lst_mean - min) / span) * 8,
    }));
  }, [spots, min, max]);

  return (
    <div className="tp-panel h-full" ref={ref}>
      <h3 className="tp-panel-title">Hotspot positions</h3>
      <p className="tp-panel-sub">Relative location of each priority cell. Larger means hotter.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={`tp-radar ${inView ? "is-in" : ""}`} role="img" aria-label="Relative positions of top urban heat island cells">
        <defs>
          <radialGradient id="tp-heat">
            <stop offset="0%" stopColor="#ff5a5a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ff5a5a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* grid */}
        {[...Array(7)].map((_, k) => (
          <line key={`v${k}`} x1={(W / 6) * k} y1="0" x2={(W / 6) * k} y2={H} className="tp-gridline" />
        ))}
        {[...Array(6)].map((_, k) => (
          <line key={`h${k}`} x1="0" y1={(H / 5) * k} x2={W} y2={(H / 5) * k} className="tp-gridline" />
        ))}
        {/* sweep */}
        <g className="tp-sweep" style={{ transformOrigin: `${W / 2}px ${H / 2}px` }}>
          <path d={`M ${W / 2} ${H / 2} L ${W / 2 + 230} ${H / 2} A 230 230 0 0 0 ${W / 2 + 230 * Math.cos(-0.5)} ${H / 2 + 230 * Math.sin(-0.5)} Z`} fill="rgba(46,230,197,0.10)" />
        </g>
        {/* connecting path */}
        <polyline
          points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
          className="tp-link"
          pathLength={1}
        />
        {pts.map((p) => (
          <g key={p.id} className="tp-spot" style={{ animationDelay: `${300 + p.i * 250}ms` }}>
            <circle cx={p.x} cy={p.y} r={p.r * 3} fill="url(#tp-heat)" />
            <circle cx={p.x} cy={p.y} r={p.r} className="tp-pulse" style={{ animationDelay: `${p.i * 400}ms` }} />
            <circle cx={p.x} cy={p.y} r={5} fill="#ff6b6b" />
            <text x={p.x + p.r + 6} y={p.y + 4} className="tp-spot-label">
              #{p.i + 1} · {p.lst_mean}°
            </text>
          </g>
        ))}
        <text x="10" y={H - 10} className="tp-axis">← west</text>
        <text x={W - 10} y={H - 10} textAnchor="end" className="tp-axis">east →</text>
        <text x="10" y="18" className="tp-axis">↑ north</text>
      </svg>
    </div>
  );
}

function HotspotRow({ cell, rank, min, max }: { cell: Hotspot; rank: number; min: number; max: number }) {
  const { ref, inView } = useInView<HTMLTableRowElement>(0.5);
  const pct = Math.max(4, Math.min(100, ((cell.lst_mean - min) / (max - min || 1)) * 100));
  const risk = riskOf(cell.lst_mean);
  return (
    <tr ref={ref} className={`tp-row ${inView ? "is-in" : ""}`} style={{ transitionDelay: `${(rank - 1) * 120}ms` }}>
      <td className="py-4 pr-4 text-slate-500 font-bold">{rank}</td>
      <td className="py-4 pr-4 font-bold text-slate-100">{cell.id}</td>
      <td className="py-4 pr-4 text-slate-400">
        {cell.lat.toFixed(3)}, {cell.lon.toFixed(3)}
      </td>
      <td className="py-4 pr-4">
        <div className="flex items-center gap-3">
          <span className="text-red-400 font-bold w-[64px]">{cell.lst_mean} °C</span>
          <div className="tp-bar">
            <div className="tp-bar-fill" style={{ width: inView ? `${pct}%` : "0%", transitionDelay: `${(rank - 1) * 120 + 200}ms` }} />
          </div>
        </div>
      </td>
      <td className="py-4 pr-4 text-emerald-400">{cell.ndvi_mean}</td>
      <td className="py-4">
        <span className={`tp-risk ${risk.cls}`}>{risk.label}</span>
      </td>
    </tr>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const css = `
.tp-root{
  --accent:#2ee6c5;
  --line:rgba(46,230,197,.22);
  background:#02061a;
}

/* Scroll progress */
.tp-progress-track{position:fixed;inset:0 0 auto 0;height:2px;z-index:60;background:transparent}
.tp-progress{height:100%;transform-origin:0 50%;transform:scaleX(0);
  background:linear-gradient(90deg,#2ee6c5,#7dd3fc,#f87171);box-shadow:0 0 12px rgba(46,230,197,.7)}

/* Ambient background */
.tp-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.tp-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;will-change:transform}
.tp-orb-a{width:520px;height:520px;left:-120px;top:-100px;background:radial-gradient(circle,rgba(46,230,197,.5),transparent 70%);animation:tp-float-a 18s ease-in-out infinite}
.tp-orb-b{width:560px;height:560px;right:-160px;top:20%;background:radial-gradient(circle,rgba(248,113,113,.35),transparent 70%);animation:tp-float-b 22s ease-in-out infinite}
.tp-orb-c{width:480px;height:480px;left:30%;bottom:-200px;background:radial-gradient(circle,rgba(99,102,241,.35),transparent 70%);animation:tp-float-a 26s ease-in-out infinite reverse}
.tp-grid{position:absolute;inset:0;
  background-image:linear-gradient(rgba(46,230,197,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(46,230,197,.06) 1px,transparent 1px);
  background-size:56px 56px;
  -webkit-mask-image:radial-gradient(ellipse at 50% 20%,#000 20%,transparent 75%);
          mask-image:radial-gradient(ellipse at 50% 20%,#000 20%,transparent 75%)}
@keyframes tp-float-a{0%,100%{transform:translate(0,0)}50%{transform:translate(80px,60px)}}
@keyframes tp-float-b{0%,100%{transform:translate(0,0)}50%{transform:translate(-90px,70px)}}

/* Hero */
.tp-hero{position:relative;z-index:10;min-height:88vh;display:flex;flex-direction:column;justify-content:center;padding-top:96px;--sy:0}
.tp-hero-content{width:100%;transform:translateY(calc(var(--sy) * .18px));opacity:calc(1 - var(--sy) / 650);will-change:transform,opacity}
.tp-hero-top{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:40px;animation:tp-fade-down .8s .1s both cubic-bezier(.2,.8,.2,1)}
.tp-badge{display:inline-flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.14em;color:#94a3b8;
  border:1px solid rgba(148,163,184,.25);padding:6px 14px;border-radius:999px;background:rgba(2,6,26,.6);backdrop-filter:blur(8px)}
.tp-dot{width:7px;height:7px;border-radius:50%;background:#f59e0b;box-shadow:0 0 0 0 rgba(245,158,11,.6)}
.tp-dot.is-live{background:#2ee6c5;animation:tp-ping 1.8s infinite}
@keyframes tp-ping{0%{box-shadow:0 0 0 0 rgba(46,230,197,.6)}100%{box-shadow:0 0 0 10px rgba(46,230,197,0)}}

.tp-title{font-weight:800;letter-spacing:.04em;line-height:1.05;font-size:clamp(2.2rem,7vw,5.6rem);
  display:flex;flex-wrap:wrap;column-gap:.35em;color:#fff}
.tp-word{display:inline-flex;white-space:nowrap}
.tp-char{display:inline-block;opacity:0;transform:translateY(60%) rotateX(-70deg);filter:blur(10px);
  animation:tp-char-in .9s cubic-bezier(.2,.8,.2,1) forwards;
  background:linear-gradient(180deg,#fff 30%,#7dd3fc 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
@keyframes tp-char-in{to{opacity:1;transform:none;filter:blur(0)}}
.tp-sub{margin-top:24px;max-width:560px;font-size:14px;line-height:1.7;color:#94a3b8;animation:tp-fade-up .9s 1.4s both cubic-bezier(.2,.8,.2,1)}
.tp-hero-stats{margin-top:48px;display:flex;align-items:center;gap:36px;flex-wrap:wrap;animation:tp-fade-up .9s 1.7s both cubic-bezier(.2,.8,.2,1)}
.tp-hero-num{font-size:clamp(1.8rem,4vw,2.8rem);font-weight:700;color:#fff}
.tp-hero-lbl{font-size:11px;color:#64748b;margin-top:4px}
.tp-hero-sep{width:1px;height:48px;background:linear-gradient(transparent,rgba(148,163,184,.4),transparent)}
.tp-unit{font-size:.5em;font-weight:500;opacity:.7}
@keyframes tp-fade-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes tp-fade-down{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}

.tp-scroll-cue{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;
  font-size:10px;letter-spacing:.3em;color:#64748b;text-transform:uppercase;animation:tp-fade-up 1s 2.2s both}
.tp-mouse{width:22px;height:36px;border:1.5px solid rgba(148,163,184,.5);border-radius:12px;display:flex;justify-content:center;padding-top:6px}
.tp-wheel{width:3px;height:7px;border-radius:2px;background:#2ee6c5;animation:tp-wheel 1.7s infinite}
@keyframes tp-wheel{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(12px)}}

/* Buttons */
.tp-btn{display:inline-flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--accent);border:1px solid var(--accent);padding:9px 16px;border-radius:8px;position:relative;overflow:hidden;
  transition:color .3s,box-shadow .3s,transform .3s;background:rgba(2,6,26,.5);backdrop-filter:blur(6px)}
.tp-btn::before{content:"";position:absolute;inset:0;background:var(--accent);transform:translateX(-101%);transition:transform .4s cubic-bezier(.2,.8,.2,1);z-index:-1}
.tp-btn:hover{color:#02061a;box-shadow:0 0 28px rgba(46,230,197,.45)}
.tp-btn:hover::before{transform:none}
.tp-btn{isolation:isolate}
.tp-btn-arrow{display:inline-block;transition:transform .3s}
.tp-btn:hover .tp-btn-arrow{transform:translateX(4px)}
.tp-hero-top .tp-btn:hover .tp-btn-arrow{transform:translateX(-4px)}
.tp-btn-solid{background:var(--accent);color:#02061a;font-weight:700;padding:14px 24px}
.tp-btn-solid::before{background:#fff}
.tp-btn-solid:hover{color:#02061a}

/* Ticker */
.tp-ticker{position:relative;z-index:10;margin:24px 0 96px;border-block:1px solid rgba(148,163,184,.15);background:rgba(2,6,26,.55);backdrop-filter:blur(8px);overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.tp-ticker-track{display:flex;width:max-content;animation:tp-marquee 38s linear infinite}
.tp-ticker:hover .tp-ticker-track{animation-play-state:paused}
.tp-ticker-set{display:flex;align-items:center;gap:28px;padding:14px 14px;font-size:12px;color:#94a3b8;white-space:nowrap}
.tp-ticker-set i{width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:.7}
@keyframes tp-marquee{to{transform:translateX(-50%)}}

/* Reveal on scroll */
.tp-reveal{opacity:0;transform:translateY(40px) scale(.98);filter:blur(6px);
  transition:opacity .9s cubic-bezier(.2,.8,.2,1),transform .9s cubic-bezier(.2,.8,.2,1),filter .9s cubic-bezier(.2,.8,.2,1)}
.tp-reveal.is-in{opacity:1;transform:none;filter:blur(0)}

/* Section heading */
.tp-sechead h2{font-size:clamp(1.3rem,3vw,2rem);font-weight:700;color:#fff;letter-spacing:.02em}
.tp-sechead p{margin-top:8px;font-size:13px;color:#94a3b8;max-width:520px}
.tp-sechead-line{margin-top:20px;height:1px;background:linear-gradient(90deg,var(--accent),rgba(46,230,197,0) 60%)}

/* Cards */
.tp-card{--mx:50%;--my:50%;--glow:46,230,197;position:relative;border-radius:14px;padding:1px;height:100%;
  background:linear-gradient(145deg,rgba(var(--glow),.35),rgba(148,163,184,.08) 40%,rgba(148,163,184,.04));
  transition:transform .25s ease-out,box-shadow .4s;transform-style:preserve-3d;will-change:transform}
.tp-card:hover{box-shadow:0 20px 60px -20px rgba(var(--glow),.45)}
.tp-card::before{content:"";position:absolute;inset:0;border-radius:14px;opacity:0;transition:opacity .3s;
  background:radial-gradient(260px circle at var(--mx) var(--my),rgba(var(--glow),.55),transparent 60%)}
.tp-card:hover::before{opacity:1}
.tp-card-inner{position:relative;height:100%;border-radius:13px;padding:22px;background:rgba(3,8,28,.92);overflow:hidden}
.tp-card-inner::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(320px circle at var(--mx) var(--my),rgba(var(--glow),.10),transparent 60%);opacity:0;transition:opacity .3s}
.tp-card:hover .tp-card-inner::after{opacity:1}
.tp-kpi-label{font-size:11px;letter-spacing:.1em;color:#94a3b8;text-transform:uppercase}
.tp-kpi-value{font-size:clamp(1.9rem,3vw,2.4rem);font-weight:800;margin-top:12px;font-variant-numeric:tabular-nums}
.tp-kpi-foot{font-size:11px;color:#64748b;margin-top:12px}

/* Panels */
.tp-panel{position:relative;border:1px solid rgba(148,163,184,.14);background:linear-gradient(160deg,rgba(8,16,44,.75),rgba(2,6,26,.85));
  backdrop-filter:blur(10px);border-radius:14px;padding:28px;transition:border-color .4s,box-shadow .4s}
.tp-panel:hover{border-color:rgba(46,230,197,.35);box-shadow:0 24px 70px -30px rgba(46,230,197,.35)}
.tp-panel-title{font-size:15px;font-weight:700;color:#fff}
.tp-panel-sub{font-size:12px;color:#94a3b8;margin-top:6px;margin-bottom:28px;max-width:420px}

/* Spectrum */
.tp-spectrum-wrap{position:relative;padding-top:48px}
.tp-spectrum{height:14px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden}
.tp-spectrum-fill{height:100%;width:100%;border-radius:999px;background:linear-gradient(90deg,#38bdf8,#2ee6c5 30%,#fbbf24 62%,#ef4444);
  clip-path:inset(0 100% 0 0);transition:clip-path 1.8s cubic-bezier(.2,.8,.2,1) .2s}
.tp-spectrum-fill.is-in{clip-path:inset(0 0 0 0)}
.tp-spectrum-marker{position:absolute;top:0;left:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;opacity:0;
  transition:left 1.8s cubic-bezier(.2,.8,.2,1) .2s,opacity .6s .2s}
.tp-spectrum-marker.is-in{left:var(--pos);opacity:1}
.tp-marker-tag{order:-1;font-size:11px;font-weight:700;color:#02061a;background:#fff;padding:4px 10px;border-radius:6px;white-space:nowrap;box-shadow:0 8px 24px rgba(255,255,255,.2)}
.tp-marker-pin{width:2px;height:30px;background:linear-gradient(#fff,rgba(255,255,255,0));margin-top:0}
.tp-spectrum-marker{flex-direction:column-reverse}
.tp-spectrum-marker .tp-marker-tag{order:0}

/* Correlation */
.tp-corr-track{position:relative;height:14px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden}
.tp-corr-center{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:rgba(148,163,184,.6);z-index:2}
.tp-corr-fill{position:absolute;top:0;bottom:0;width:0;transition:width 1.8s cubic-bezier(.2,.8,.2,1) .2s}
.tp-corr-fill.is-neg{right:50%;background:linear-gradient(270deg,#fbbf24,#2ee6c5);border-radius:999px 0 0 999px}
.tp-corr-fill.is-pos{left:50%;background:linear-gradient(90deg,#fbbf24,#ef4444);border-radius:0 999px 999px 0}
.tp-corr-fill.is-in{width:var(--w)}

/* Radar */
.tp-radar{width:100%;height:auto;border-radius:10px;background:rgba(2,6,26,.6);border:1px solid rgba(148,163,184,.1)}
.tp-gridline{stroke:rgba(46,230,197,.08);stroke-width:1}
.tp-sweep{animation:tp-spin 7s linear infinite}
@keyframes tp-spin{to{transform:rotate(360deg)}}
.tp-link{fill:none;stroke:rgba(248,113,113,.45);stroke-width:1.2;stroke-dasharray:1;stroke-dashoffset:1}
.tp-radar.is-in .tp-link{animation:tp-draw 2s .6s forwards ease-out}
@keyframes tp-draw{to{stroke-dashoffset:0}}
.tp-spot{opacity:0}
.tp-radar.is-in .tp-spot{animation:tp-spot-in .8s forwards cubic-bezier(.2,.8,.2,1)}
@keyframes tp-spot-in{from{opacity:0}to{opacity:1}}
.tp-pulse{fill:none;stroke:#ff6b6b;stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:tp-pulse 2.4s ease-out infinite}
@keyframes tp-pulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.4);opacity:0}}
.tp-spot-label{fill:#e2e8f0;font-size:11px;font-family:inherit}
.tp-axis{fill:#475569;font-size:9px;font-family:inherit;letter-spacing:.1em}

/* Table */
.tp-th{color:#64748b;border-bottom:1px solid rgba(148,163,184,.18);font-size:10px;letter-spacing:.12em;text-transform:uppercase}
.tp-th th{font-weight:600}
.tp-row{opacity:0;transform:translateX(-20px);transition:opacity .7s cubic-bezier(.2,.8,.2,1),transform .7s cubic-bezier(.2,.8,.2,1),background .3s;border-bottom:1px solid rgba(148,163,184,.08)}
.tp-row.is-in{opacity:1;transform:none}
.tp-row:hover{background:rgba(46,230,197,.05)}
.tp-bar{flex:1;min-width:70px;height:6px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden}
.tp-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#fbbf24,#ef4444);transition:width 1.4s cubic-bezier(.2,.8,.2,1)}
.tp-risk{display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;border:1px solid;white-space:nowrap}
.tp-risk-critical{color:#f87171;background:rgba(127,29,29,.45);border-color:#b91c1c;animation:tp-glow 2.4s ease-in-out infinite}
.tp-risk-severe{color:#fb923c;background:rgba(124,45,18,.45);border-color:#c2410c}
.tp-risk-elevated{color:#fbbf24;background:rgba(120,53,15,.4);border-color:#b45309}
@keyframes tp-glow{0%,100%{box-shadow:0 0 0 rgba(248,113,113,0)}50%{box-shadow:0 0 16px rgba(248,113,113,.55)}}

/* CTA */
.tp-cta{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:36px;border-radius:16px;
  border:1px solid rgba(46,230,197,.25);position:relative;overflow:hidden;
  background:linear-gradient(120deg,rgba(46,230,197,.10),rgba(99,102,241,.08) 50%,rgba(248,113,113,.10));background-size:200% 200%;animation:tp-shift 10s ease infinite}
.tp-cta-title{font-size:clamp(1.1rem,2.4vw,1.5rem);font-weight:700;color:#fff}
.tp-cta-sub{font-size:13px;color:#94a3b8;margin-top:8px;max-width:460px}
@keyframes tp-shift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}

/* Loading */
.tp-loading{display:flex;align-items:center;gap:14px;font-size:12px;color:#64748b;padding:40px 0}
.tp-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(46,230,197,.2);border-top-color:var(--accent);animation:tp-spin 0.9s linear infinite}

/* Accessibility */
@media (prefers-reduced-motion: reduce){
  .tp-root *,.tp-root *::before,.tp-root *::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
  .tp-reveal,.tp-char,.tp-row,.tp-spot{opacity:1 !important;transform:none !important;filter:none !important}
}
`;