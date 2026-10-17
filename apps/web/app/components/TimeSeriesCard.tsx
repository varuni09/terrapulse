"use client";
import { useEffect, useMemo, useState } from "react";
import { extent, monthLabel, segments, yoy, type Key, type Pt } from "../../lib/series";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; series: Pt[] };
const W = 280, H = 86, L = 34, R = 8, T = 8, B = 18;

function Chart({ series, k, color, unit, label, digits }: { series: Pt[]; k: Key; color: string; unit: string; label: string; digits: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = series.map((p) => p[k]);
  const [lo, hi] = extent(vals);
  const n = series.length;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, n - 1);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const segs = segments(vals);
  const last = [...vals].map((v, i) => [v, i] as const).filter(([v]) => v !== null).pop();
  const hv = hover !== null ? series[hover] : null;
  const fmt = (v: number | null) => (v === null ? "no clear observation" : `${v.toFixed(digits)}${unit ? " " + unit : ""}`);

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between text-[10px] uppercase text-slate-400">
        <span>{label}</span>
        <span className="normal-case text-slate-300 tabular-nums">{hv ? `${monthLabel(hv.month)} · ${fmt(hv[k])}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full touch-none" role="img" aria-label={`${label} over the last ${n} months`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
        }}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`g-${k}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[lo, (lo + hi) / 2, hi].map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.07)" />
            <text x={L - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="rgba(148,163,184,.8)">{t.toFixed(digits === 0 ? 0 : 1)}</text>
          </g>
        ))}
        {series.map((p, i) => p[k] === null && <line key={i} x1={x(i)} x2={x(i)} y1={H - B - 6} y2={H - B} stroke="rgba(251,191,36,.7)" strokeWidth="1.2" />)}
        {segs.map((s, j) => s.length > 1 ? (
          <g key={j}>
            <path d={`M${x(s[0])},${H - B} ` + s.map((i) => `L${x(i)},${y(vals[i] as number)}`).join(" ") + ` L${x(s[s.length - 1])},${H - B}Z`} fill={`url(#g-${k})`} />
            <path d={s.map((i, m) => `${m ? "L" : "M"}${x(i)},${y(vals[i] as number)}`).join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ) : <circle key={j} cx={x(s[0])} cy={y(vals[s[0]] as number)} r="2" fill={color} />)}
        {last && <circle cx={x(last[1])} cy={y(last[0] as number)} r="3.2" fill={color} stroke="#04091f" strokeWidth="1.5" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgba(255,255,255,.35)" />}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="8" fill="rgba(148,163,184,.8)">{monthLabel(series[i].month)}</text>
        ))}
      </svg>
    </div>
  );
}

export default function TimeSeriesCard({ lat, lon }: { lat: number; lon: number }) {
  const [st, setSt] = useState<State>({ status: "loading" });
  useEffect(() => {
    const c = new AbortController();
    setSt({ status: "loading" });
    fetch(`/api/gee/series?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&months=24`, { signal: c.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.series) throw new Error(j?.error || `HTTP ${r.status}`);
        setSt({ status: "ok", series: j.series });
      })
      .catch((e) => { if (e?.name !== "AbortError") setSt({ status: "error", message: String(e?.message ?? e) }); });
    return () => c.abort();
  }, [lat, lon]);

  const s = st.status === "ok" ? st.series : null;
  const t = useMemo(() => (s ? yoy(s, "lst_c") : null), [s]);
  const have = s ? s.filter((p) => p.lst_c !== null || p.ndvi !== null).length : 0;

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="flex items-baseline justify-between text-[10px] uppercase text-slate-400">
        <span>Last 24 months</span><span className="text-[#7dd3fc]">Satellite</span>
      </div>
      {st.status === "loading" && <div className="mt-3 h-40 animate-pulse rounded-lg bg-white/5" />}
      {st.status === "error" && <p className="mt-2 text-[11px] text-rose-300">Time series unavailable: {st.message}</p>}
      {s && have < 3 && <p className="mt-2 text-[11px] text-slate-400">Too few clear satellite observations here (open water, ice or persistent cloud).</p>}
      {s && have >= 3 && (
        <>
          {t && (
            <p className="mt-2 text-[11px] leading-snug text-slate-300">
              Latest ({monthLabel(t.month)}): <b className="text-white">{t.value.toFixed(1)} °C</b>
              {t.delta !== null && <> · {t.delta >= 0 ? "+" : ""}{t.delta.toFixed(1)} °C vs the same month last year</>}
            </p>
          )}
          <Chart series={s} k="lst_c" color="#fdae61" unit="°C" label="Surface temperature" digits={1} />
          <Chart series={s} k="ndvi" color="#41ab5d" unit="" label="Vegetation (NDVI)" digits={2} />
          <p className="mt-2 text-[10px] leading-snug text-slate-500">
            Monthly means within about 2.5 km of the point. Amber ticks mark months with no clear observation; they are never filled in.
            Surface, not air, temperature. One year-on-year difference is not a trend.
          </p>
        </>
      )}
    </div>
  );
}
