"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";

/* ───────────────────────── Fonts ───────────────────────── */

const display = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--f-display" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--f-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono" });

/* ───────────────────────── Types & Data ───────────────────────── */

type Region = "Asia" | "Europe" | "Africa" | "North America" | "South America" | "Oceania";
type City = { name: string; country: string; region: Region; lat: number; lon: number; lst: number; ndvi: number; uhi: number };

const DEFAULT_CITIES: City[] = [
  { name: "Chennai", country: "India", region: "Asia", lat: 13.08, lon: 80.27, lst: 38.12, ndvi: 0.342, uhi: 3.9 },
  { name: "Delhi", country: "India", region: "Asia", lat: 28.61, lon: 77.21, lst: 44.5, ndvi: 0.18, uhi: 5.2 },
  { name: "Mumbai", country: "India", region: "Asia", lat: 19.08, lon: 72.88, lst: 39.5, ndvi: 0.27, uhi: 3.6 },
  { name: "Kolkata", country: "India", region: "Asia", lat: 22.57, lon: 88.36, lst: 40.2, ndvi: 0.25, uhi: 4.1 },
  { name: "Karachi", country: "Pakistan", region: "Asia", lat: 24.86, lon: 67.0, lst: 43.6, ndvi: 0.1, uhi: 4.4 },
  { name: "Riyadh", country: "Saudi Arabia", region: "Asia", lat: 24.71, lon: 46.68, lst: 47.8, ndvi: 0.07, uhi: 3.1 },
  { name: "Dubai", country: "UAE", region: "Asia", lat: 25.2, lon: 55.27, lst: 48.9, ndvi: 0.05, uhi: 2.8 },
  { name: "Tokyo", country: "Japan", region: "Asia", lat: 35.68, lon: 139.69, lst: 36.5, ndvi: 0.3, uhi: 4.5 },
  { name: "London", country: "United Kingdom", region: "Europe", lat: 51.51, lon: -0.13, lst: 30.0, ndvi: 0.39, uhi: 3.0 },
  { name: "New York", country: "United States", region: "North America", lat: 40.71, lon: -74.01, lst: 36.5, ndvi: 0.3, uhi: 4.4 },
];

const REGIONS: Region[] = ["Asia", "Europe", "Africa", "North America", "South America", "Oceania"];

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
function pearson(xs: number[], ys: number[]) {
  const mx = avg(xs), my = avg(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}
function regress(xs: number[], ys: number[]) {
  const mx = avg(xs), my = avg(ys);
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/* ───────────────────────── Colour helpers ───────────────────────── */

const TEMP_STOPS: [number, string][] = [[28, "#4aa3ff"], [33, "#2ee6c5"], [38, "#ffd166"], [43, "#ff8a3d"], [49, "#ff3b30"]];
const NDVI_STOPS: [number, string][] = [[0, "#c58a3b"], [0.15, "#dfc27d"], [0.3, "#7fc97f"], [0.45, "#1fb36b"]];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function ramp(stops: [number, string][], v: number) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, c0] = stops[i - 1], [v1, c1] = stops[i];
      const t = (v - v0) / (v1 - v0), a = hex(c0), b = hex(c1);
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(",")})`;
    }
  }
  return stops[stops.length - 1][1];
}
const tempColor = (v: number) => ramp(TEMP_STOPS, v);
const ndviColor = (v: number) => ramp(NDVI_STOPS, v);
const riskOf = (t: number) =>
  t >= 44 ? { label: "Extreme", c: "#ff3b30" } : t >= 40 ? { label: "Severe", c: "#ff8a3d" } : t >= 36 ? { label: "High", c: "#ffd166" } : { label: "Moderate", c: "#2ee6c5" };

/* ───────────────────────── Motion primitives ───────────────────────── */

const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

function Reveal({ children, delay = 0, className = "", y = 32 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function SplitHeading({
  text, className = "", accent = [], delay = 0, as: Tag = "h2",
}: { text: string; className?: string; accent?: string[]; delay?: number; as?: "h1" | "h2" | "h3" }) {
  return (
    <Tag className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="wx-mask" aria-hidden>
          <motion.span
            className={`wx-word ${accent.includes(w) ? "wx-accent" : ""}`}
            initial={{ y: "115%", rotate: 4 }}
            whileInView={{ y: 0, rotate: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 1, delay: delay + i * 0.08, ease: EASE }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

function CountUp({ value, decimals = 0, suffix = "", duration = 1.8 }: { value: number; decimals?: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });
  const [txt, setTxt] = useState((0).toFixed(decimals));
  useEffect(() => {
    if (!inView) return;
    const ctl = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setTxt(v.toFixed(decimals)) });
    return () => ctl.stop();
  }, [inView, value, decimals, duration]);
  return <span ref={ref}>{txt}{suffix}</span>;
}

function SpotlightCard({ children, className = "", glow = "255,138,61" }: { children: ReactNode; className?: string; glow?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={onMove} className={`wx-card ${className}`} style={{ "--glow": glow } as CSSProperties}>
      <div className="wx-card-in">{children}</div>
    </div>
  );
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const sx = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.3 });
  return <motion.div className="wx-progress" style={{ scaleX: sx }} />;
}

function CursorGlow() {
  const x = useMotionValue(-600), y = useMotionValue(-600);
  useEffect(() => {
    const m = (e: PointerEvent) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("pointermove", m);
    return () => window.removeEventListener("pointermove", m);
  }, [x, y]);
  const bg = useMotionTemplate`radial-gradient(460px circle at ${x}px ${y}px, rgba(255,150,90,0.08), transparent 70%)`;
  return <motion.div className="wx-cursor" style={{ background: bg }} />;
}

/* ───────────────────────── Globe ───────────────────────── */

const D = Math.PI / 180;
const LAND_URLS = [
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson",
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_land.geojson",
];

function Globe({ cities, selected, onSelect, reduced }: { cities: City[]; selected: number | null; onSelect: (i: number) => void; reduced: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const rot = useRef({ lon: 70 * D, lat: 22 * D });
  const target = useRef<{ lon: number; lat: number } | null>(null);
  const drag = useRef({ active: false, moved: false, x: 0, y: 0, last: 0 });
  const land = useRef<number[][][]>([]);
  const dots = useRef<{ i: number; x: number; y: number }[]>([]);
  const hoverRef = useRef(-1);
  const selRef = useRef<number | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const hot = useMemo(() => [...cities.keys()].sort((a, b) => cities[b].lst - cities[a].lst).slice(0, 6), [cities]);

  useEffect(() => {
    selRef.current = selected;
    if (selected != null && cities[selected]) {
      const ct = cities[selected];
      target.current = { lon: ct.lon * D, lat: Math.max(-0.9, Math.min(0.9, ct.lat * D * 0.8)) };
    } else target.current = null;
  }, [selected, cities]);

  useEffect(() => {
    let dead = false;
    (async () => {
      for (const u of LAND_URLS) {
        try {
          const r = await fetch(u);
          if (!r.ok) continue;
          const j = await r.json();
          const rings: number[][][] = [];
          for (const f of j.features) {
            const g = f.geometry;
            if (g.type === "Polygon") g.coordinates.forEach((ring: number[][]) => rings.push(ring));
            else if (g.type === "MultiPolygon") g.coordinates.forEach((poly: number[][][]) => poly.forEach((ring) => rings.push(ring)));
          }
          if (!dead) land.current = rings;
          return;
        } catch {}
      }
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;

    const render = (t: number) => {
      const w = cv.clientWidth, h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.43, cx = w / 2, cy = h / 2;
      const r = rot.current;

      if (target.current && !drag.current.active) {
        let dl = target.current.lon - r.lon;
        dl = Math.atan2(Math.sin(dl), Math.cos(dl));
        r.lon += dl * 0.06;
        r.lat += (target.current.lat - r.lat) * 0.06;
      } else if (!drag.current.active && !reduced && hoverRef.current < 0 && performance.now() - drag.current.last > 1800) {
        r.lon += 0.0016;
      }
      r.lat = Math.max(-1.2, Math.min(1.2, r.lat));

      const s0 = Math.sin(r.lat), c0 = Math.cos(r.lat);
      const proj = (lat: number, lon: number): [number, number, number] => {
        const la = lat * D, dl = lon * D - r.lon;
        const cosc = s0 * Math.sin(la) + c0 * Math.cos(la) * Math.cos(dl);
        return [Math.cos(la) * Math.sin(dl), c0 * Math.sin(la) - s0 * Math.cos(la) * Math.cos(dl), cosc];
      };
      const path = (pts: number[][], swap = false) => {
        ctx.beginPath();
        let pen = false;
        for (const p of pts) {
          const q = swap ? proj(p[0], p[1]) : proj(p[1], p[0]);
          if (q[2] > 0) {
            const X = cx + R * q[0], Y = cy - R * q[1];
            if (!pen) { ctx.moveTo(X, Y); pen = true; } else ctx.lineTo(X, Y);
          } else pen = false;
        }
        ctx.stroke();
      };

      const atm = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.38);
      atm.addColorStop(0, "rgba(255,138,61,0.22)");
      atm.addColorStop(0.45, "rgba(255,90,60,0.07)");
      atm.addColorStop(1, "rgba(255,90,60,0)");
      ctx.fillStyle = atm;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.38, 0, Math.PI * 2); ctx.fill();

      const sph = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      sph.addColorStop(0, "#14233f");
      sph.addColorStop(0.65, "#0a1226");
      sph.addColorStop(1, "#050810");
      ctx.fillStyle = sph;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(160,190,255,0.10)";
      for (let lon = -180; lon < 180; lon += 30) path(Array.from({ length: 37 }, (_, k) => [lon, -90 + k * 5]), true);
      for (let lat = -60; lat <= 60; lat += 30) path(Array.from({ length: 73 }, (_, k) => [lat, -180 + k * 5]), true);

      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(239,233,221,0.42)";
      for (const ring of land.current) path(ring);

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,190,140,0.28)";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      const found: { i: number; x: number; y: number }[] = [];
      cities.forEach((ct, i) => {
        const q = proj(ct.lat, ct.lon);
        if (q[2] <= 0.02) return;
        const X = cx + R * q[0], Y = cy - R * q[1];
        found.push({ i, x: X, y: Y });
        const col = tempColor(ct.lst);
        const rad = 2.6 + ct.uhi * 0.55;
        const isHot = hot.includes(i);
        if (isHot) {
          const ph = ((t / 1000) * 0.7 + hot.indexOf(i) * 0.31) % 1;
          ctx.strokeStyle = col;
          ctx.globalAlpha = (1 - ph) * 0.7 * q[2];
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(X, Y, rad + ph * 22, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = Math.min(1, 0.35 + q[2]);
        ctx.shadowColor = col;
        ctx.shadowBlur = 12;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(X, Y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (selRef.current === i || hoverRef.current === i) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(X, Y, rad + 5, 0, Math.PI * 2); ctx.stroke();
        }
      });
      dots.current = found;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [cities, hot, reduced]);

  const pick = (x: number, y: number) => {
    let best = -1, bd = 16 * 16, bx = 0, by = 0;
    for (const d of dots.current) {
      const dd = (d.x - x) ** 2 + (d.y - y) ** 2;
      if (dd < bd) { bd = dd; best = d.i; bx = d.x; by = d.y; }
    }
    return best >= 0 ? { i: best, x: bx, y: by } : null;
  };

  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    drag.current = { ...drag.current, active: true, moved: false, x: e.clientX, y: e.clientY };
    target.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    if (drag.current.active) {
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
      const R = Math.min(cv.clientWidth, cv.clientHeight) * 0.43;
      rot.current.lon -= dx / R;
      rot.current.lat += dy / R;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      drag.current.last = performance.now();
      return;
    }
    const rect = cv.getBoundingClientRect();
    const h = pick(e.clientX - rect.left, e.clientY - rect.top);
    const idx = h ? h.i : -1;
    if (idx !== hoverRef.current) {
      hoverRef.current = idx;
      setHover(h);
      cv.style.cursor = h ? "pointer" : "grab";
    }
  };
  const onUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    const was = drag.current;
    drag.current = { ...drag.current, active: false, last: performance.now() };
    if (!was.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      const h = pick(e.clientX - rect.left, e.clientY - rect.top);
      if (h) onSelect(h.i);
    }
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px]">
      <canvas
        ref={canvas}
        className="h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { hoverRef.current = -1; setHover(null); }}
        aria-label="Interactive globe of city surface temperatures"
      />
      <AnimatePresence>
        {hover && cities[hover.i] && (
          <motion.div
            key={hover.i}
            className="wx-tip"
            style={{ left: hover.x, top: hover.y }}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="wx-serif text-[15px] text-white">{cities[hover.i].name}</div>
            <div className="mt-0.5 flex items-center gap-3 text-[11px]">
              <span style={{ color: tempColor(cities[hover.i].lst) }}>{cities[hover.i].lst.toFixed(1)} °C</span>
              <span className="text-emerald-300">NDVI {cities[hover.i].ndvi.toFixed(2)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
        <span className="wx-hint">Drag to rotate · click a city</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Leaderboard ───────────────────────── */

type MetricKey = "lst" | "ndvi" | "uhi";
const METRICS: Record<MetricKey, { label: string; title: string; unit: string; dir: 1 | -1; get: (x: City) => number; range: [number, number]; color: (v: number) => string; dec: number }> = {
  lst: { label: "Surface temp", title: "The hottest cities", unit: "°C", dir: -1, get: (x) => x.lst, range: [28, 50], color: tempColor, dec: 1 },
  ndvi: { label: "Vegetation", title: "The least green cities", unit: "", dir: 1, get: (x) => x.ndvi, range: [0, 0.5], color: ndviColor, dec: 2 },
  uhi: { label: "Heat island", title: "The strongest heat islands", unit: "°C", dir: -1, get: (x) => x.uhi, range: [0, 6], color: (v) => tempColor(28 + (v / 6) * 21), dec: 1 },
};

function Leaderboard({ cities, selected, onSelect }: { cities: City[]; selected: number | null; onSelect: (i: number) => void }) {
  const [metric, setMetric] = useState<MetricKey>("lst");
  const [region, setRegion] = useState<Region | "All">("All");
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  const m = METRICS[metric];

  const rows = useMemo(() => {
    const list = cities.map((ct, i) => ({ ct, i })).filter(({ ct }) => region === "All" || ct.region === region);
    list.sort((a, b) => (m.get(a.ct) - m.get(b.ct)) * m.dir);
    return list.slice(0, 10);
  }, [cities, metric, region, m]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <AnimatePresence mode="wait">
          <motion.h3
            key={metric}
            className="wx-serif text-[clamp(1.6rem,3.4vw,2.6rem)] leading-tight text-white"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.35 }}
          >
            {m.title}
          </motion.h3>
        </AnimatePresence>
        <div className="wx-seg" role="tablist" aria-label="Metric">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => (
            <button key={k} role="tab" aria-selected={metric === k} onClick={() => setMetric(k)} className={metric === k ? "on" : ""}>
              {metric === k && <motion.span layoutId="seg-thumb" className="wx-seg-thumb" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative z-10">{METRICS[k].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(["All", ...REGIONS] as const).map((rg) => (
          <button key={rg} onClick={() => setRegion(rg)} className={`wx-chip ${region === rg ? "on" : ""}`}>
            {region === rg && <motion.span layoutId="chip-bg" className="wx-chip-bg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative z-10">{rg}</span>
          </button>
        ))}
      </div>

      <ul ref={ref} className="mt-8 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map(({ ct, i }, rank) => {
            const v = m.get(ct);
            const pct = Math.max(3, Math.min(100, ((v - m.range[0]) / (m.range[1] - m.range[0])) * 100));
            return (
              <motion.li
                key={ct.name}
                layout
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ type: "spring", stiffness: 300, damping: 32, delay: rank * 0.02 }}
              >
                <button onClick={() => onSelect(i)} className={`wx-row ${selected === i ? "sel" : ""}`}>
                  <span className="wx-rank">{String(rank + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 text-left">
                    <span className="wx-serif block truncate text-[1.15rem] text-white">{ct.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{ct.country}</span>
                  </span>
                  <span className="wx-track">
                    <motion.span
                      className="wx-fill"
                      style={{ background: `linear-gradient(90deg, ${m.color(m.range[0] + (m.range[1] - m.range[0]) * 0.1)}, ${m.color(v)})` }}
                      initial={{ width: 0 }}
                      animate={{ width: inView ? `${pct}%` : 0 }}
                      transition={{ duration: 1.1, ease: EASE, delay: 0.1 + rank * 0.05 }}
                    />
                  </span>
                  <span className="wx-val" style={{ color: m.color(v) }}>
                    {v.toFixed(m.dec)}
                    <span className="text-[11px] opacity-60"> {m.unit}</span>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

/* ───────────────────────── Scatter ───────────────────────── */

function Scatter({ cities, stats, selected, onSelect }: { cities: City[]; stats: any; selected: number | null; onSelect: (i: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const [hov, setHov] = useState<number | null>(null);
  const W = 820, H = 480, L = 62, Rr = 24, T = 22, B = 56;
  const X0 = 0, X1 = 0.5, Y0 = 26, Y1 = 50;
  const sx = (v: number) => L + ((v - X0) / (X1 - X0)) * (W - L - Rr);
  const sy = (v: number) => H - B - ((v - Y0) / (Y1 - Y0)) * (H - T - B);
  const line = `M ${sx(0.04)} ${sy(stats.intercept + stats.slope * 0.04)} L ${sx(0.46)} ${sy(stats.intercept + stats.slope * 0.46)}`;
  const focus = hov ?? selected;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Scatter plot of surface temperature against vegetation index for each city">
      {[26, 30, 34, 38, 42, 46, 50].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - Rr} y1={sy(v)} y2={sy(v)} className="wx-gl" />
          <text x={L - 12} y={sy(v) + 4} textAnchor="end" className="wx-ax">{v}°</text>
        </g>
      ))}
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => (
        <g key={v}>
          <line y1={T} y2={H - B} x1={sx(v)} x2={sx(v)} className="wx-gl" />
          <text x={sx(v)} y={H - B + 24} textAnchor="middle" className="wx-ax">{v.toFixed(1)}</text>
        </g>
      ))}
      <text x={(L + W - Rr) / 2} y={H - 8} textAnchor="middle" className="wx-axl">VEGETATION INDEX (NDVI) →</text>
      <text transform={`translate(16 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" className="wx-axl">SURFACE TEMP °C →</text>

      <motion.path
        d={line}
        fill="none"
        stroke="url(#wx-reg)"
        strokeWidth={2}
        strokeDasharray="6 6"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={{ duration: 1.8, delay: 0.9, ease: EASE }}
      />
      <defs>
        <linearGradient id="wx-reg" x1="0" x2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#2ee6c5" />
        </linearGradient>
      </defs>

      {cities.map((ct, i) => {
        const active = focus === i;
        return (
          <motion.g
            key={ct.name}
            initial={{ opacity: 0, scale: 0 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.15 + i * 0.03, ease: EASE }}
            style={{ transformOrigin: `${sx(ct.ndvi)}px ${sy(ct.lst)}px`, cursor: "pointer" }}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov(null)}
            onClick={() => onSelect(i)}
          >
            <circle cx={sx(ct.ndvi)} cy={sy(ct.lst)} r={18} fill="transparent" />
            <circle cx={sx(ct.ndvi)} cy={sy(ct.lst)} r={active ? 11 : 5 + ct.uhi * 0.9} fill={tempColor(ct.lst)} opacity={focus != null && !active ? 0.35 : 0.9} style={{ transition: "all .25s", filter: `drop-shadow(0 0 ${active ? 10 : 4}px ${tempColor(ct.lst)})` }} />
            {active && <circle cx={sx(ct.ndvi)} cy={sy(ct.lst)} r={16} fill="none" stroke="#fff" strokeWidth={1.2} />}
          </motion.g>
        );
      })}

      {focus != null && cities[focus] && (() => {
        const ct = cities[focus];
        const x = sx(ct.ndvi), y = sy(ct.lst);
        const right = x < W - 200;
        return (
          <g pointerEvents="none">
            <rect x={right ? x + 18 : x - 178} y={y - 30} width={160} height={46} rx={8} fill="rgba(5,8,16,0.92)" stroke="rgba(255,255,255,0.14)" />
            <text x={right ? x + 30 : x - 166} y={y - 10} className="wx-svg-t">{ct.name}</text>
            <text x={right ? x + 30 : x - 166} y={y + 7} className="wx-svg-s">{ct.lst.toFixed(1)} °C · NDVI {ct.ndvi.toFixed(2)}</text>
          </g>
        );
      })()}
    </svg>
  );
}

/* ───────────────────────── Pinned horizontal region scroller ───────────────────────── */

function RegionScroller({ regionStats, cities, onSelect }: { regionStats: any[]; cities: City[]; onSelect: (i: number) => void }) {
  const sec = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const m = () => {
      setVh(window.innerHeight);
      if (track.current) setDist(Math.max(0, track.current.scrollWidth - window.innerWidth));
    };
    m();
    const t = setTimeout(m, 400);
    window.addEventListener("resize", m);
    return () => { clearTimeout(t); window.removeEventListener("resize", m); };
  }, []);
  const { scrollYProgress } = useScroll({ target: sec, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -dist]);
  const bar = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const maxR = Math.max(...regionStats.map((r) => r.lst || 30));

  return (
    <section ref={sec} style={{ height: dist ? dist + vh : "320vh" }} className="relative" aria-label="Regional breakdown">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
          <div className="wx-eyebrow">By region</div>
          <SplitHeading text="Six continents, six different fevers." accent={["fevers."]} className="wx-serif mt-3 text-[clamp(2rem,5vw,4rem)] leading-[1.02] text-white" />
        </div>

        <motion.div ref={track} style={{ x }} className="mt-10 flex gap-6 pl-[max(1.5rem,calc((100vw-80rem)/2+2.5rem))] pr-[10vw] will-change-transform">
          {regionStats.map((rg, k) => (
            <article key={rg.region} className="wx-region">
              <div className="flex items-start justify-between">
                <div>
                  <div className="wx-eyebrow">0{k + 1} — {rg.list.length} cities</div>
                  <h3 className="wx-serif mt-2 text-[2rem] leading-none text-white">{rg.region}</h3>
                </div>
                <div className="text-right">
                  <div className="wx-serif text-[3.4rem] leading-none" style={{ color: tempColor(rg.lst) }}>
                    <CountUp value={rg.lst} decimals={1} duration={1.4} />
                    <span className="text-[1.3rem] opacity-70">°C</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">mean surface temp</div>
                </div>
              </div>

              <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, #4aa3ff, ${tempColor(rg.lst)})` }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(rg.lst / maxR) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.3, ease: EASE }}
                />
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 text-[12px]">
                <div><div className="text-slate-500">NDVI</div><div className="mt-1 text-emerald-300">{rg.ndvi.toFixed(2)}</div></div>
                <div><div className="text-slate-500">Heat island</div><div className="mt-1 text-orange-300">+{rg.uhi.toFixed(1)}°</div></div>
                <div><div className="text-slate-500">Hottest</div><div className="mt-1 truncate text-white">{rg.list[0]?.name || "N/A"}</div></div>
              </div>

              <div className="mt-6 space-y-1.5">
                {rg.list.slice(0, 5).map((ct: City, j: number) => (
                  <button key={ct.name} onClick={() => onSelect(cities.indexOf(ct))} className="wx-mini">
                    <span className="w-28 truncate text-left text-[12px] text-slate-300">{ct.name}</span>
                    <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.span
                        className="block h-full rounded-full"
                        style={{ background: tempColor(ct.lst) }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${((ct.lst - 26) / 24) * 100}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.2 + j * 0.08, ease: EASE }}
                      />
                    </span>
                    <span className="w-12 text-right text-[12px]" style={{ color: tempColor(ct.lst) }}>{ct.lst.toFixed(1)}</span>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </motion.div>

        <div className="mx-auto mt-10 h-px w-full max-w-7xl px-6 md:px-10">
          <div className="h-px w-full bg-white/10">
            <motion.div className="h-px origin-left bg-[var(--wx-ember)]" style={{ scaleX: bar }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── City dock ───────────────────────── */

function CityDock({ city, stats, onClose }: { city: City | null; stats: any; onClose: () => void }) {
  const risk = city ? riskOf(city.lst) : null;
  const cooling = -stats.slope * 0.1;
  return (
    <AnimatePresence>
      {city && risk && (
        <motion.aside
          key={city.name}
          className="wx-dock"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="wx-eyebrow">{city.region}</div>
              <div className="wx-serif mt-1 text-[1.9rem] leading-none text-white">{city.name}</div>
              <div className="mt-1 text-[11px] text-slate-500">{city.country} · {city.lat.toFixed(2)}°, {city.lon.toFixed(2)}°</div>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-slate-500 transition hover:rotate-90 hover:text-white">✕</button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div><div className="wx-serif text-[1.8rem] leading-none" style={{ color: tempColor(city.lst) }}>{city.lst.toFixed(1)}°</div><div className="mt-1 text-[10px] text-slate-500">Surface temp</div></div>
            <div><div className="wx-serif text-[1.8rem] leading-none text-emerald-300">{city.ndvi.toFixed(2)}</div><div className="mt-1 text-[10px] text-slate-500">NDVI</div></div>
            <div><div className="wx-serif text-[1.8rem] leading-none text-orange-300">+{city.uhi.toFixed(1)}°</div><div className="mt-1 text-[10px] text-slate-500">Heat island</div></div>
          </div>
          <div className="mt-5 flex items-center gap-2 text-[11px]">
            <span className="rounded-full border px-2.5 py-1 font-bold" style={{ color: risk.c, borderColor: `${risk.c}66`, background: `${risk.c}14` }}>{risk.label} heat</span>
            <span className="text-slate-500">vs {stats.meanLst.toFixed(1)}° mean: {city.lst - stats.meanLst >= 0 ? "+" : ""}{(city.lst - stats.meanLst).toFixed(1)}°</span>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
            Across this dataset, each +0.10 NDVI goes with roughly <span className="text-white">{cooling.toFixed(1)} °C</span> cooler surfaces.
          </p>
          <Link href="/explore" className="wx-btn mt-5 w-full justify-center">Open the explorer →</Link>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function InsightsPage() {
  const reduced = !!useReducedMotion();
  const [cities, setCities] = useState<City[]>(DEFAULT_CITIES);
  const [isLive, setIsLive] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    async function loadLiveData() {
      try {
        const res = await fetch("/api/insights");
        if (res.ok) {
          const data = await res.json();
          if (data.cities && data.cities.length > 0) {
            setCities(data.cities);
            setIsLive(data.isLive ?? true);
          }
        }
      } catch {
        /* Fallback to default cities on failure */
      }
    }
    loadLiveData();
  }, []);

  const stats = useMemo(() => {
    const lst = cities.map((x) => x.lst), ndvi = cities.map((x) => x.ndvi), uhi = cities.map((x) => x.uhi);
    const hottest = cities.reduce((a, b) => (b.lst > a.lst ? b : a), cities[0]);
    const coolest = cities.reduce((a, b) => (b.lst < a.lst ? b : a), cities[0]);
    return {
      n: cities.length,
      meanLst: avg(lst),
      meanNdvi: avg(ndvi),
      meanUhi: avg(uhi),
      hottest,
      coolest,
      r: pearson(ndvi, lst),
      ...regress(ndvi, lst),
    };
  }, [cities]);

  const regionStats = useMemo(() => {
    return REGIONS.map((region) => {
      const list = cities.filter((x) => x.region === region);
      return {
        region,
        list: [...list].sort((a, b) => b.lst - a.lst),
        lst: list.length ? avg(list.map((x) => x.lst)) : 0,
        ndvi: list.length ? avg(list.map((x) => x.ndvi)) : 0,
        uhi: list.length ? avg(list.map((x) => x.uhi)) : 0,
      };
    }).filter((r) => r.list.length > 0);
  }, [cities]);

  const onSelect = useCallback((i: number) => setSel(i), []);
  const hero = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const textY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const textO = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const globeY = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const globeS = useTransform(scrollYProgress, [0, 1], [1, 1.12]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const ticker = [
    `Mean surface temp ${stats.meanLst.toFixed(1)} °C`,
    `Hottest ${stats.hottest?.name || ""} ${stats.hottest?.lst.toFixed(1) || ""} °C`,
    `Coolest ${stats.coolest?.name || ""} ${stats.coolest?.lst.toFixed(1) || ""} °C`,
    `Mean NDVI ${stats.meanNdvi.toFixed(2)}`,
    `Mean heat island +${stats.meanUhi.toFixed(1)} °C`,
    `LST / NDVI r = ${stats.r.toFixed(2)}`,
    `${stats.n} cities analyzed`,
  ];

  return (
    <main className={`wx-root ${display.variable} ${sans.variable} ${mono.variable}`}>
      <style>{css}</style>
      <ScrollProgress />
      <CursorGlow />

      <div className="wx-bg" aria-hidden>
        <div className="wx-orb wx-orb-a" />
        <div className="wx-orb wx-orb-b" />
        <div className="wx-orb wx-orb-c" />
        <div className="wx-grid" />
      </div>
      <div className="wx-grain" aria-hidden />

      {/* ─────── HERO ─────── */}
      <section ref={hero} className="relative z-10 mx-auto grid min-h-[100svh] max-w-7xl items-center gap-6 px-6 pb-16 pt-28 md:px-10 lg:grid-cols-[1.05fr_0.95fr]">
        <motion.div style={{ y: textY, opacity: textO }}>
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }} className="flex flex-wrap items-center gap-3">
            <span className="wx-badge"><span className="wx-dot" />Global edition</span>
            <span className={`wx-badge ${isLive ? "teal" : "amber"}`}>
              {isLive ? "Live Satellite Data" : "Connecting Pipeline..."}
            </span>
          </motion.div>

          <SplitHeading
            as="h1"
            text="The planet, running a fever."
            accent={["fever."]}
            delay={0.2}
            className="wx-serif mt-8 text-[clamp(2.8rem,8vw,7rem)] leading-[0.98] tracking-[-0.02em] text-white"
          />

          <motion.p
            className="mt-8 max-w-xl text-[15px] leading-[1.75] text-slate-400"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.1, ease: EASE }}
          >
            A worldwide read on urban surface heat and vegetation. {stats.n} cities measured on one shared scale.
          </motion.p>

          <motion.div className="mt-10 flex flex-wrap items-center gap-4" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 1.3, ease: EASE }}>
            <Link href="/explore" className="wx-btn wx-btn-solid">Explore the live map <span className="wx-arrow">→</span></Link>
            <a href="#leaderboard" className="wx-btn">Read the findings <span className="wx-arrow">↓</span></a>
          </motion.div>

          <motion.div className="mt-14 flex flex-wrap gap-x-12 gap-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 1.6 }}>
            <div>
              <div className="wx-serif text-[2.6rem] leading-none text-white"><CountUp value={stats.n} duration={2} /></div>
              <div className="mt-2 text-[11px] text-slate-500">Cities compared</div>
            </div>
            <div>
              <div className="wx-serif text-[2.6rem] leading-none" style={{ color: tempColor(stats.meanLst) }}><CountUp value={stats.meanLst} decimals={1} duration={2} /><span className="text-xl opacity-70">°C</span></div>
              <div className="mt-2 text-[11px] text-slate-500">Mean surface temp</div>
            </div>
            <div>
              <div className="wx-serif text-[2.6rem] leading-none text-orange-300">+<CountUp value={stats.meanUhi} decimals={1} duration={2} /><span className="text-xl opacity-70">°C</span></div>
              <div className="mt-2 text-[11px] text-slate-500">Average heat-island effect</div>
            </div>
          </motion.div>
        </motion.div>

        <motion.div style={{ y: globeY, scale: globeS }} initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1 }} transition={{ duration: 1.4, delay: 0.4, ease: EASE }}>
          <Globe cities={cities} selected={sel} onSelect={onSelect} reduced={reduced} />
        </motion.div>

        <div className="wx-scroll-cue" aria-hidden>
          <span>Scroll</span>
          <i />
        </div>
      </section>

      {/* ─────── TICKER ─────── */}
      <div className="wx-ticker relative z-10" aria-hidden>
        <div className="wx-ticker-track">
          {[0, 1].map((k) => (
            <div key={k} className="wx-ticker-set">
              {ticker.map((t) => (
                <span key={t}>{t}<i /></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-32 px-6 pb-24 pt-28 md:space-y-44 md:px-10 md:pt-40">
        {/* ─────── VITALS ─────── */}
        <section>
          <Reveal><div className="wx-eyebrow">01 — Global vitals</div></Reveal>
          <SplitHeading text="Four numbers that frame a warming urban world." accent={["warming"]} className="wx-serif mt-4 max-w-4xl text-[clamp(2rem,5vw,4rem)] leading-[1.04] text-white" />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Hottest city", v: stats.hottest?.lst || 0, d: 1, u: "°C", s: `${stats.hottest?.name || ""}, ${stats.hottest?.country || ""}`, col: "#ff3b30", g: "255,59,48" },
              { l: "Coolest city", v: stats.coolest?.lst || 0, d: 1, u: "°C", s: `${stats.coolest?.name || ""}, ${stats.coolest?.country || ""}`, col: "#4aa3ff", g: "74,163,255" },
              { l: "Spread", v: (stats.hottest?.lst || 0) - (stats.coolest?.lst || 0), d: 1, u: "°C", s: "Between hottest and coolest", col: "#ffd166", g: "255,209,102" },
              { l: "Heat vs. green", v: stats.r, d: 2, u: "", s: "LST / NDVI correlation (r)", col: "#2ee6c5", g: "46,230,197" },
            ].map((k, i) => (
              <Reveal key={k.l} delay={i * 0.09}>
                <SpotlightCard glow={k.g} className="h-full">
                  <div className="wx-eyebrow">{k.l}</div>
                  <div className="wx-serif mt-6 text-[clamp(2.6rem,5vw,3.6rem)] leading-none" style={{ color: k.col }}>
                    <CountUp value={k.v} decimals={k.d} />
                    <span className="text-2xl opacity-70">{k.u}</span>
                  </div>
                  <div className="mt-5 text-[12px] text-slate-500">{k.s}</div>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─────── LEADERBOARD ─────── */}
        <section id="leaderboard" className="scroll-mt-28">
          <Reveal><div className="wx-eyebrow">02 — Rankings</div></Reveal>
          <div className="mt-4 mb-14 max-w-3xl">
            <SplitHeading text="Rank the world by what matters to you." accent={["world"]} className="wx-serif text-[clamp(2rem,5vw,4rem)] leading-[1.04] text-white" />
          </div>
          <Leaderboard cities={cities} selected={sel} onSelect={onSelect} />
        </section>

        {/* ─────── SCATTER ─────── */}
        <section className="grid items-start gap-10 lg:grid-cols-12">
          <div className="lg:sticky lg:top-28 lg:col-span-4">
            <Reveal><div className="wx-eyebrow">03 — The pattern</div></Reveal>
            <SplitHeading text="Where there is green, there is cool." accent={["cool."]} className="wx-serif mt-4 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] text-white" />
            <Reveal delay={0.2}>
              <p className="mt-6 text-[14px] leading-[1.8] text-slate-400">
                Each dot is a city. Across this dataset the correlation is{" "}
                <span className="text-white">r = {stats.r.toFixed(2)}</span>, roughly{" "}
                <span className="text-white">{(-stats.slope * 0.1).toFixed(1)} °C</span> cooler per +0.10 NDVI.
              </p>
              <p className="mt-4 text-[12px] text-slate-500">Dot size = heat-island strength. Hover to read, click to open a city.</p>
            </Reveal>
          </div>
          <Reveal className="lg:col-span-8" delay={0.1}>
            <div className="wx-panel p-4 md:p-8">
              <Scatter cities={cities} stats={stats} selected={sel} onSelect={onSelect} />
            </div>
          </Reveal>
        </section>
      </div>

      {/* ─────── PINNED REGION SCROLLER ─────── */}
      <div className="relative z-10">
        <RegionScroller regionStats={regionStats} cities={cities} onSelect={onSelect} />
      </div>

      {/* ─────── CLOSING ─────── */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-40 pt-24 md:px-10">
        <Reveal>
          <div className="wx-cta">
            <div>
              <div className="wx-eyebrow">04 — Next</div>
              <h3 className="wx-serif mt-3 max-w-2xl text-[clamp(1.8rem,4vw,3.2rem)] leading-[1.06] text-white">
                Now see your own street, <span className="wx-accent">in satellite detail.</span>
              </h3>
              <p className="mt-4 max-w-xl text-[13px] leading-[1.8] text-slate-400">
                Drop into the explorer for block-level surface temperature and scenario testing.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/explore" className="wx-btn wx-btn-solid">Open explorer <span className="wx-arrow">→</span></Link>
              <Link href="/scenarios" className="wx-btn">Try scenarios <span className="wx-arrow">→</span></Link>
            </div>
          </div>
        </Reveal>
      </div>

      <CityDock city={sel != null ? cities[sel] : null} stats={stats} onClose={() => setSel(null)} />
    </main>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const css = `
.wx-root{--wx-ember:#ff8a3d;--wx-teal:#2ee6c5;--wx-ink:#04060c;--wx-ivory:#efe9dd;
  position:relative;min-height:100vh;background:var(--wx-ink);color:#cbd5e1;font-family:var(--f-sans),system-ui,sans-serif;overflow-x:clip;-webkit-font-smoothing:antialiased}
.wx-root *{box-sizing:border-box}
.wx-serif{font-family:var(--f-display),Georgia,serif;font-weight:380;font-variation-settings:"opsz" 144}
.wx-root .text-slate-500,.wx-root .text-slate-400{letter-spacing:.005em}
.wx-eyebrow{font-family:var(--f-mono),monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#7c8799}
.wx-root button,.wx-root .wx-row,.wx-root [class*="wx-mini"],.wx-val,.wx-rank,.wx-tip,.wx-hint,.wx-ax,.wx-axl,.wx-svg-t,.wx-svg-s{font-family:var(--f-mono),monospace}

.wx-mask{display:inline-block;overflow:hidden;vertical-align:top;padding:.04em .08em .14em 0;margin-right:.24em}
.wx-word{display:inline-block;will-change:transform}
.wx-accent{font-style:italic;background:linear-gradient(100deg,#ffb066 10%,#ff5a3c 60%,#ff2e63 100%);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}

.wx-progress{position:fixed;left:0;right:0;top:0;height:2px;transform-origin:0 50%;z-index:70;background:linear-gradient(90deg,#2ee6c5,#ffd166,#ff5a3c)}
.wx-cursor{position:fixed;inset:0;z-index:1;pointer-events:none}
.wx-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.wx-orb{position:absolute;border-radius:50%;filter:blur(110px);will-change:transform}
.wx-orb-a{width:620px;height:620px;left:-180px;top:-120px;background:radial-gradient(circle,rgba(255,110,60,.32),transparent 70%);animation:wx-a 22s ease-in-out infinite}
.wx-orb-b{width:560px;height:560px;right:-160px;top:30%;background:radial-gradient(circle,rgba(70,120,255,.26),transparent 70%);animation:wx-b 26s ease-in-out infinite}
.wx-orb-c{width:520px;height:520px;left:28%;bottom:-220px;background:radial-gradient(circle,rgba(46,230,197,.18),transparent 70%);animation:wx-a 30s ease-in-out infinite reverse}
@keyframes wx-a{0%,100%{transform:translate(0,0)}50%{transform:translate(90px,70px)}}
@keyframes wx-b{0%,100%{transform:translate(0,0)}50%{transform:translate(-100px,80px)}}
.wx-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:72px 72px;
  -webkit-mask-image:radial-gradient(ellipse at 50% 15%,#000 10%,transparent 70%);mask-image:radial-gradient(ellipse at 50% 15%,#000 10%,transparent 70%)}
.wx-grain{position:fixed;inset:0;z-index:60;pointer-events:none;opacity:.07;mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

.wx-badge{display:inline-flex;align-items:center;gap:10px;font-family:var(--f-mono),monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#a3afc2;
  border:1px solid rgba(255,255,255,.14);padding:7px 14px;border-radius:999px;background:rgba(255,255,255,.03);backdrop-filter:blur(8px)}
.wx-badge.amber{color:#ffc27a;border-color:rgba(255,194,122,.3)}
.wx-badge.teal{color:#2ee6c5;border-color:rgba(46,230,197,.3)}
.wx-dot{width:7px;height:7px;border-radius:50%;background:#2ee6c5;animation:wx-ping 1.8s infinite}
@keyframes wx-ping{0%{box-shadow:0 0 0 0 rgba(46,230,197,.6)}100%{box-shadow:0 0 0 10px rgba(46,230,197,0)}}
.wx-btn{position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;gap:10px;font-family:var(--f-mono),monospace;font-size:12px;letter-spacing:.1em;text-transform:uppercase;
  color:#efe9dd;border:1px solid rgba(255,255,255,.22);padding:13px 22px;border-radius:999px;background:rgba(255,255,255,.02);transition:color .4s,border-color .4s,box-shadow .4s}
.wx-btn::before{content:"";position:absolute;inset:0;z-index:-1;background:#efe9dd;transform:translateY(101%);transition:transform .5s cubic-bezier(.2,.8,.2,1);border-radius:inherit}
.wx-btn:hover{color:#04060c;border-color:#efe9dd}.wx-btn:hover::before{transform:none}
.wx-btn-solid{background:linear-gradient(120deg,#ff8a3d,#ff4d3d);border-color:transparent;color:#1a0a04;font-weight:700;box-shadow:0 12px 40px -12px rgba(255,100,50,.7)}
.wx-btn-solid::before{background:#fff}
.wx-arrow{display:inline-block;transition:transform .35s}.wx-btn:hover .wx-arrow{transform:translateX(4px)}

.wx-scroll-cue{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;font-family:var(--f-mono),monospace;font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#64748b}
.wx-scroll-cue i{width:1px;height:42px;background:linear-gradient(#ff8a3d,transparent);animation:wx-drip 2s ease-in-out infinite;transform-origin:top}
@keyframes wx-drip{0%{transform:scaleY(0);opacity:0}30%{opacity:1}100%{transform:scaleY(1);opacity:0}}
.wx-hint{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#64748b;background:rgba(4,6,12,.6);padding:5px 12px;border-radius:999px;backdrop-filter:blur(6px)}
.wx-tip{position:absolute;z-index:5;transform:translate(14px,-120%);pointer-events:none;padding:10px 14px;border-radius:12px;background:rgba(5,8,16,.92);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(10px);white-space:nowrap}

.wx-ticker{border-block:1px solid rgba(255,255,255,.08);background:rgba(4,6,12,.55);backdrop-filter:blur(8px);overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.wx-ticker-track{display:flex;width:max-content;animation:wx-marquee 46s linear infinite}
.wx-ticker:hover .wx-ticker-track{animation-play-state:paused}
.wx-ticker-set{display:flex;align-items:center;gap:30px;padding:18px 15px;font-family:var(--f-mono),monospace;font-size:12px;letter-spacing:.06em;color:#8b97ab;white-space:nowrap}
.wx-ticker-set span{display:inline-flex;align-items:center;gap:30px}
.wx-ticker-set i{width:5px;height:5px;border-radius:50%;background:#ff8a3d;opacity:.8}
@keyframes wx-marquee{to{transform:translateX(-50%)}}

.wx-card{--mx:50%;--my:50%;--glow:255,138,61;position:relative;border-radius:18px;padding:1px;height:100%;
  background:linear-gradient(150deg,rgba(var(--glow),.35),rgba(255,255,255,.07) 40%,rgba(255,255,255,.03));transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s}
.wx-card:hover{transform:translateY(-6px);box-shadow:0 30px 70px -30px rgba(var(--glow),.55)}
.wx-card::before{content:"";position:absolute;inset:0;border-radius:18px;opacity:0;transition:opacity .35s;background:radial-gradient(300px circle at var(--mx) var(--my),rgba(var(--glow),.5),transparent 60%)}
.wx-card:hover::before{opacity:1}
.wx-card-in{position:relative;height:100%;border-radius:17px;padding:26px;background:rgba(6,9,18,.94);overflow:hidden}
.wx-card-in::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;background:radial-gradient(360px circle at var(--mx) var(--my),rgba(var(--glow),.09),transparent 60%)}
.wx-card:hover .wx-card-in::after{opacity:1}
.wx-panel{border:1px solid rgba(255,255,255,.08);background:linear-gradient(160deg,rgba(255,255,255,.035),rgba(255,255,255,.01));border-radius:22px;backdrop-filter:blur(10px)}

.wx-seg{display:inline-flex;padding:4px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
.wx-seg button{position:relative;padding:9px 18px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8b97ab;border-radius:999px;transition:color .3s}
.wx-seg button.on{color:#04060c;font-weight:700}
.wx-seg-thumb{position:absolute;inset:0;border-radius:999px;background:linear-gradient(120deg,#ffb066,#ff7a45)}
.wx-chip{position:relative;padding:8px 16px;font-size:11px;letter-spacing:.08em;color:#8b97ab;border:1px solid rgba(255,255,255,.1);border-radius:999px;transition:color .3s,border-color .3s}
.wx-chip:hover{color:#fff;border-color:rgba(255,255,255,.3)}
.wx-chip.on{color:#fff;border-color:transparent}
.wx-chip-bg{position:absolute;inset:0;border-radius:999px;background:rgba(255,138,61,.22);border:1px solid rgba(255,138,61,.55)}

.wx-row{display:grid;width:100%;grid-template-columns:42px minmax(120px,1.1fr) 2fr 96px;align-items:center;gap:18px;padding:18px 14px;transition:background .3s,padding .35s cubic-bezier(.2,.8,.2,1)}
.wx-row:hover,.wx-row.sel{background:linear-gradient(90deg,rgba(255,138,61,.08),transparent);padding-left:24px}
.wx-rank{font-size:12px;color:#5b6678}
.wx-track{height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden}
.wx-fill{display:block;height:100%;border-radius:999px;box-shadow:0 0 16px rgba(255,138,61,.35)}
.wx-val{text-align:right;font-size:1.05rem;font-weight:700;font-variant-numeric:tabular-nums}
@media(max-width:640px){.wx-row{grid-template-columns:30px 1fr 74px}.wx-track{display:none}}

.wx-gl{stroke:rgba(255,255,255,.06);stroke-width:1}
.wx-ax{fill:#6b7789;font-size:11px}
.wx-axl{fill:#7c8799;font-size:10px;letter-spacing:.2em}
.wx-svg-t{fill:#fff;font-size:13px;font-weight:700}
.wx-svg-s{fill:#9aa6b8;font-size:11px}

.wx-region{flex:none;width:min(82vw,520px);border-radius:24px;padding:30px;border:1px solid rgba(255,255,255,.09);
  background:linear-gradient(165deg,rgba(255,255,255,.05),rgba(255,255,255,.012));backdrop-filter:blur(12px);transition:border-color .4s,transform .5s cubic-bezier(.2,.8,.2,1)}
.wx-region:hover{border-color:rgba(255,138,61,.45);transform:translateY(-6px)}
.wx-mini{display:flex;width:100%;align-items:center;gap:14px;padding:5px 0;border-radius:6px;transition:background .25s,padding .25s}
.wx-mini:hover{background:rgba(255,255,255,.04);padding-left:8px;padding-right:8px}

.wx-dock{position:fixed;z-index:65;right:20px;bottom:20px;width:min(92vw,370px);padding:24px;border-radius:22px;
  background:linear-gradient(165deg,rgba(14,20,36,.94),rgba(5,8,16,.96));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(18px);box-shadow:0 40px 100px -30px rgba(0,0,0,.9),0 0 0 1px rgba(255,138,61,.12)}

.wx-cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:36px;padding:clamp(28px,5vw,60px);border-radius:28px;border:1px solid rgba(255,255,255,.1);
  background:linear-gradient(120deg,rgba(255,138,61,.14),rgba(70,120,255,.1) 55%,rgba(46,230,197,.1));background-size:200% 200%;animation:wx-shift 14s ease infinite}
@keyframes wx-shift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}

@media (prefers-reduced-motion: reduce){
  .wx-orb,.wx-ticker-track,.wx-cta,.wx-dot,.wx-scroll-cue i{animation:none !important}
}
`;
