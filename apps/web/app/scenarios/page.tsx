"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import {
  CELLS,
  DEFAULT_SCENARIO,
  SCENARIO_LIMITS,
  cooling,
  formatInr,
  impact,
  priorityScore,
  type Cell,
  type Scenario,
} from "@/lib/terrapulse";

/* ───────────────────────── Fonts ───────────────────────── */

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"], style: ["normal", "italic"] });
const body = Manrope({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

/* ───────────────────────── Constants ───────────────────────── */

type Key = "A" | "B";

const PRESETS: { name: string; s: Scenario }[] = [
  { name: "Light touch", s: { treeCover: 8, coolRoofs: 10, albedo: 5 } },
  { name: "Balanced", s: DEFAULT_SCENARIO },
  { name: "Full program", s: { treeCover: 35, coolRoofs: 70, albedo: 22 } },
];

const MAX_RELIEF = cooling({
  treeCover: SCENARIO_LIMITS.treeCover.max,
  coolRoofs: SCENARIO_LIMITS.coolRoofs.max,
  albedo: SCENARIO_LIMITS.albedo.max,
}).total;
const SCALE_MIN = 36;
const SCALE_MAX = 41.5;
const f2 = (n: number) => n.toFixed(2);
const nf = (n: number) => Math.round(n).toLocaleString("en-IN");

const HEADLINE: { w: string; em?: boolean }[] = [
  { w: "Cool" },
  { w: "the" },
  { w: "city," },
  { w: "one" },
  { w: "cell", em: true },
  { w: "at" },
  { w: "a" },
  { w: "time." },
];

const MARQUEE = ["Tree canopy", "Cool roofs", "Pavement albedo", "H3 hex cells", "Surface temperature", "Heat relief", "Cost per degree", "People helped"];

const GRID_COLS = 18;
const GRID_ROWS = 9;
const GRID_BASE = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => {
  const x = i % GRID_COLS;
  const y = Math.floor(i / GRID_COLS);
  const v = Math.sin(x * 0.7 + 1.3) * Math.cos(y * 0.9) + Math.sin((x + y) * 0.45);
  return Math.min(1, Math.max(0.25, 0.64 + v * 0.2));
});

/* ───────────────────────── Hooks ───────────────────────── */

function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, shown };
}

function useTween(target: number, duration = 900) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(Math.max((t - start) / duration, 0), 1);
      const e = 1 - Math.pow(1 - p, 4);
      const v = a + (target - a) * e;
      from.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ───────────────────────── Ambient layers ───────────────────────── */

function HeatField({ reliefRef }: { reliefRef: { current: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999 };
    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number };
    let ps: P[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(130, Math.floor((w * h) / 14000));
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(Math.random() * 0.4 + 0.1),
        r: Math.random() * 1.6 + 0.5,
        o: Math.random() * 0.5 + 0.3,
      }));
    };

    const draw = () => {
      const rel = reliefRef.current;
      const R = Math.round(255 + (46 - 255) * rel);
      const G = Math.round(138 + (230 - 138) * rel);
      const B = Math.round(76 + (197 - 76) * rel);
      const speed = 1 - rel * 0.65;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22000) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / 148) * 1.6;
          p.vx += (dx / d) * f * 0.12;
          p.vy += (dy / d) * f * 0.12;
        }
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + -0.002 * speed;
        p.x += p.vx * speed + Math.sin((p.y + i * 7) * 0.006) * 0.12 * speed;
        p.y += p.vy * speed;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${R},${G},${B},${p.o})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        for (let j = i + 1; j < ps.length; j++) {
          const q = ps[j];
          const ax = p.x - q.x;
          const ay = p.y - q.y;
          const dd = ax * ax + ay * ay;
          if (dd < 9000) {
            ctx.strokeStyle = `rgba(${R},${G},${B},${(1 - dd / 9000) * 0.14})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: globalThis.MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [reliefRef]);
  return <canvas ref={canvas} className="heat-field" aria-hidden />;
}

function CursorFollower() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let x = -100;
    let y = -100;
    let rx = -100;
    let ry = -100;
    let raf = 0;
    const onMove = (e: globalThis.MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    const onOver = (e: globalThis.MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const hot = !!t?.closest?.("a,button,input,[data-cursor]");
      ring.current?.classList.toggle("cursor-hot", hot);
    };
    const loop = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      raf = requestAnimationFrame(loop);
    };
    loop();
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
    };
  }, []);
  return (
    <>
      <div ref={ring} className="cursor-ring" aria-hidden />
      <div ref={dot} className="cursor-dot" aria-hidden />
    </>
  );
}

/* ───────────────────────── UI pieces ───────────────────────── */

function Reveal({ children, delay = 0, y = 36, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const { ref, shown } = useInView<HTMLDivElement>(0.12);
  const ease = "cubic-bezier(.16,1,.3,1)";
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px) scale(.985)`,
        filter: shown ? "none" : "blur(8px)",
        transition: `opacity 1s ${ease} ${delay}ms, transform 1.1s ${ease} ${delay}ms, filter 1s ${ease} ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

function Magnetic({ children, strength = 0.3 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const move = (e: MouseEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <span ref={ref} onMouseMove={move} onMouseLeave={leave} className="magnetic">
      {children}
    </span>
  );
}

function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="eyebrow">
      <span className="num">{n}</span>
      <i />
      {children}
    </p>
  );
}

function Glass({ children, className = "", tilt = false }: { children: ReactNode; className?: string; tilt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    if (tilt) {
      const rx = (y / r.height - 0.5) * -6;
      const ry = (x / r.width - 0.5) * 6;
      el.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    }
  };
  const leave = () => {
    if (ref.current && tilt) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onMouseMove={move} onMouseLeave={leave} className={`glass ${className}`}>
      {children}
    </div>
  );
}

function Slider({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  const [drag, setDrag] = useState(false);
  return (
    <div className="group">
      <div className="flex items-baseline justify-between">
        <label className="text-[15px] font-medium text-slate-100">{label}</label>
        <span className="num text-sm text-[#5ff0d6]">+{value}%</span>
      </div>
      <div className="relative mt-4">
        <span className={`bubble num ${drag ? "bubble-on" : ""}`} style={{ left: `calc(${pct}% + ${(0.5 - pct / 100) * 22}px)` }}>
          {value}%
        </span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={() => setDrag(true)}
          onPointerUp={() => setDrag(false)}
          onPointerCancel={() => setDrag(false)}
          onBlur={() => setDrag(false)}
          className="range"
          style={{ ["--p" as string]: `${pct}%` }}
          aria-label={label}
        />
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-slate-500 transition-colors group-hover:text-slate-400">{hint}</p>
    </div>
  );
}

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const shown = useTween(value, 1000);
  const frac = Math.min(shown / MAX_RELIEF, 1);
  const ang = frac * Math.PI * 2;
  return (
    <div className="relative mx-auto h-[220px] w-[220px]">
      <div className="gauge-orbit" aria-hidden />
      <svg viewBox="0 0 200 200" className="relative h-full w-full -rotate-90">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffb86b" />
            <stop offset="55%" stopColor="#5ff0d6" />
            <stop offset="100%" stopColor="#2ee6c5" />
          </linearGradient>
          <filter id="gaugeGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10" />
        {Array.from({ length: 48 }).map((_, i) => {
          const a = (i / 48) * Math.PI * 2;
          const l = i % 4 === 0 ? 86 : 89;
          const lit = i / 48 <= frac;
          return (
            <line
              key={i}
              x1={100 + Math.cos(a) * 92}
              y1={100 + Math.sin(a) * 92}
              x2={100 + Math.cos(a) * l}
              y2={100 + Math.sin(a) * l}
              stroke={lit ? "rgba(95,240,214,.7)" : "rgba(255,255,255,.18)"}
              strokeWidth={i % 4 === 0 ? 1.4 : 0.7}
              style={{ transition: "stroke .5s" }}
            />
          );
        })}
        <circle cx="100" cy="100" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} filter="url(#gaugeGlow)" opacity=".55" />
        <circle cx="100" cy="100" r={r} fill="none" stroke="url(#gaugeGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        <circle cx={100 + Math.cos(ang) * r} cy={100 + Math.sin(ang) * r} r="6" fill="#eafffb" style={{ filter: "drop-shadow(0 0 8px #5ff0d6)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] text-slate-400">{label}</span>
        <span className="num mt-1 text-5xl font-light tracking-tight text-white">−{f2(shown)}</span>
        <span className="num text-sm text-slate-400">°C average</span>
      </div>
    </div>
  );
}

function HotspotCard({ spot, dropA, dropB, index }: { spot: Cell; dropA: number; dropB: number | null; index: number }) {
  const { ref, shown } = useInView<HTMLDivElement>(0.35);
  const tA = useTween(shown ? spot.baselineLst - dropA : spot.baselineLst, 1400);
  const tB = useTween(shown && dropB !== null ? spot.baselineLst - dropB : spot.baselineLst, 1400);
  const width = (v: number) => `${Math.max(2, Math.min(100, ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100))}%`;
  const score = priorityScore(spot);
  const compare = dropB !== null;

  return (
    <Reveal delay={index * 90}>
      <div ref={ref}>
        <Glass tilt className="rounded-3xl p-6 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="display text-xl font-normal text-white md:text-2xl">{spot.name}</h3>
              <p className="num mt-1 text-[11px] text-slate-500">{spot.id}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="rounded-full border border-[#ff9a5c]/30 bg-[#ff9a5c]/10 px-3 py-1.5 text-xs text-[#ffb27e]">
                <span className="text-slate-400">Baseline </span>
                <span className="num">{f2(spot.baselineLst)}°C</span>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-400">
                Priority <span className="num text-slate-200">{score}</span>/100
              </div>
            </div>
          </div>

          <div className="relative mt-7">
            <div className="space-y-1.5">
              <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className="bar-sheen h-full rounded-full" style={{ width: width(tA), background: "linear-gradient(90deg,#2ee6c5 0%,#ffd08a 70%,#ff8a4c 100%)", boxShadow: "0 0 18px rgba(46,230,197,.45)" }} />
              </div>
              {compare && (
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="bar-sheen h-full rounded-full" style={{ width: width(tB), background: "linear-gradient(90deg,#8b7bff 0%,#c4b5fd 100%)", boxShadow: "0 0 18px rgba(139,123,255,.5)" }} />
                </div>
              )}
            </div>
            <div className="absolute -top-1.5 h-[18px] w-px bg-[#ff9a5c]/70" style={{ left: width(spot.baselineLst), height: compare ? 30 : 18 }} />
            <div className="mt-2 flex justify-between text-[11px] text-slate-600">
              <span className="num">{SCALE_MIN}°C</span>
              <span className="num">{SCALE_MAX}°C</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-6 border-t border-white/[0.06] pt-5">
            <div>
              <p className="text-xs text-slate-500">{compare ? "Plan A temperature" : "Projected surface temp"}</p>
              <p className="num mt-1 text-3xl font-light text-[#5ff0d6]">{f2(tA)}°C</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{compare ? "Plan B temperature" : "Net reduction"}</p>
              {compare ? (
                <p className="num mt-1 text-3xl font-light text-[#c4b5fd]">{f2(tB)}°C</p>
              ) : (
                <p className="num mt-1 text-3xl font-light text-white">−{f2(spot.baselineLst - tA)}°C</p>
              )}
            </div>
          </div>
        </Glass>
      </div>
    </Reveal>
  );
}

function Stat({ label, value, format, hint, delay = 0 }: { label: string; value: number; format: (n: number) => string; hint: string; delay?: number }) {
  const { ref, shown } = useInView<HTMLDivElement>(0.3);
  const v = useTween(shown ? value : 0, 1200);
  return (
    <Reveal delay={delay} className="h-full">
      <div ref={ref} className="h-full">
        <Glass tilt className="h-full rounded-3xl p-6">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="num stat-value mt-3 text-3xl font-light md:text-[2rem]">{format(v)}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{hint}</p>
        </Glass>
      </div>
    </Reveal>
  );
}

function ContributionRow({ label, value, total }: { label: string; value: number; total: number }) {
  const { ref, shown } = useInView<HTMLDivElement>(0.4);
  const share = total > 0 ? (value / total) * 100 : 0;
  const tw = useTween(shown ? share : 0, 1200);
  return (
    <div ref={ref}>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] text-slate-200">{label}</span>
        <span className="num text-sm text-slate-400">
          −{f2(value)}°C <span className="text-slate-600">·</span> <span className="text-[#5ff0d6]">{tw.toFixed(0)}%</span>
        </span>
      </div>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="bar-sheen h-full rounded-full bg-gradient-to-r from-[#2ee6c5] to-[#8af7e4]" style={{ width: `${tw}%` }} />
      </div>
    </div>
  );
}

function CityGrid({ relief }: { relief: number }) {
  const { ref, shown } = useInView<HTMLDivElement>(0.2);
  return (
    <div ref={ref} className="city-grid" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}>
      {GRID_BASE.map((b, i) => {
        const x = i % GRID_COLS;
        const y = Math.floor(i / GRID_COLS);
        const heat = Math.min(1, Math.max(0, b - relief * 0.58));
        const hue = 172 - heat * 152;
        return (
          <i
            key={i}
            className="dot"
            data-cursor
            style={{
              ["--d" as string]: `${(x + y) * 24}ms`,
              background: `hsl(${hue} 92% 58%)`,
              opacity: shown ? 0.28 + heat * 0.68 : 0,
              transform: shown ? "none" : "scale(.2)",
              boxShadow: heat > 0.68 ? `0 0 14px hsl(${hue} 95% 55% / .55)` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function ScenariosPage() {
  const [scen, setScen] = useState<Record<Key, Scenario>>({
    A: DEFAULT_SCENARIO,
    B: { treeCover: 35, coolRoofs: 70, albedo: 22 },
  });
  const [active, setActive] = useState<Key>("A");
  const [compare, setCompare] = useState(false);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);

  const root = useRef<HTMLElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const reliefRef = useRef(0);

  const cur = scen[active];
  const setField = (k: keyof Scenario, v: number) => setScen((p) => ({ ...p, [active]: { ...p[active], [k]: v } }));

  const eA = useMemo(() => cooling(scen.A), [scen.A]);
  const eB = useMemo(() => cooling(scen.B), [scen.B]);
  const iA = useMemo(() => impact(CELLS, scen.A), [scen.A]);
  const iB = useMemo(() => impact(CELLS, scen.B), [scen.B]);

  const e = active === "A" ? eA : eB;
  const imp = active === "A" ? iA : iB;
  const tempReduction = e.total;

  const avgBaseline = CELLS.reduce((s, h) => s + h.baselineLst, 0) / CELLS.length;
  const relief01 = Math.min(tempReduction / MAX_RELIEF, 1);
  const reliefTween = useTween(relief01, 1200);
  const heroRelief = useTween(tempReduction, 1200);
  reliefRef.current = reliefTween;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const start = performance.now();
    const dur = 1900;
    let raf = 0;
    let t1 = 0;
    let t2 = 0;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * 100));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        t1 = window.setTimeout(() => {
          setReady(true);
          document.body.style.overflow = "";
        }, 250);
        t2 = window.setTimeout(() => setGone(true), 1500);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (progress.current) progress.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
        root.current?.style.setProperty("--sy", String(y));
      });
    };
    const onMove = (ev: globalThis.MouseEvent) => {
      if (cursor.current) cursor.current.style.transform = `translate3d(${ev.clientX - 250}px, ${ev.clientY - 250}px, 0)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  const applyPreset = (s: Scenario) => setScen((p) => ({ ...p, [active]: { ...s } }));
  const toggleCompare = () => {
    setCompare((c) => {
      if (c) setActive("A");
      return !c;
    });
  };

  const rows: { label: string; a: number; b: number; fmt: (n: number) => string; better: "high" | "low" }[] = [
    { label: "Average cooling", a: eA.total, b: eB.total, fmt: (n) => `−${f2(n)}°C`, better: "high" },
    { label: "Total cost", a: iA.costInr, b: iB.costInr, fmt: formatInr, better: "low" },
    { label: "Cost per °C of relief", a: iA.costPerDegreeInr, b: iB.costPerDegreeInr, fmt: formatInr, better: "low" },
    { label: "Trees planted", a: iA.trees, b: iB.trees, fmt: nf, better: "high" },
    { label: "People helped", a: iA.peopleHelped, b: iB.peopleHelped, fmt: nf, better: "high" },
  ];
  const dDrop = eB.total - eA.total;
  const dCost = iB.costInr - iA.costInr;
  const cheaperPerDeg =
    iA.costPerDegreeInr > 0 && iB.costPerDegreeInr > 0 ? (iA.costPerDegreeInr <= iB.costPerDegreeInr ? "A" : "B") : null;

  let charIndex = 0;

  return (
    <main
      ref={root}
      className={`${display.variable} ${body.variable} ${mono.variable} scn ${ready ? "is-ready" : ""} relative min-h-screen overflow-x-clip bg-[#050a1c] text-slate-100`}
      style={{ ["--relief" as string]: reliefTween.toFixed(3) }}
    >
      <style>{CSS}</style>

      {/* ───────── Intro loader ───────── */}
      {!gone && (
        <div className={`loader ${ready ? "loader-out" : ""}`} aria-hidden>
          <div className="loader-glow" />
          <div className="loader-inner">
            <p className="display loader-brand">
              Terra<em>Pulse</em>
            </p>
            <p className="num loader-count">{String(count).padStart(3, "0")}</p>
            <div className="loader-line">
              <span style={{ transform: `scaleX(${count / 100})` }} />
            </div>
            <p className="loader-sub">Calibrating the heat map</p>
          </div>
        </div>
      )}

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:px-12">
        <Link href="/" className="display text-xl font-medium text-white" aria-label="TerraPulse home">
          Terra<em className="text-[#5ff0d6]">Pulse</em>
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-6 text-sm text-slate-400">
          <Link href="/insights" className="transition-colors hover:text-[#5ff0d6]">Insights</Link>
          <Link href="/scenarios" aria-current="page" className="text-[#5ff0d6]">Scenarios</Link>
        </nav>
      </header>

      <HeatField reliefRef={reliefRef} />
      <CursorFollower />

      <div className="fixed left-0 top-0 z-[60] h-[2px] w-full bg-transparent">
        <div ref={progress} className="h-full origin-left bg-gradient-to-r from-[#ff9a5c] via-[#ffd08a] to-[#2ee6c5]" style={{ transform: "scaleX(0)" }} />
      </div>
      <div ref={cursor} className="cursor-glow" aria-hidden />
      <div className="grain" aria-hidden />

      {/* ───────── Hero ───────── */}
      <section className="relative flex min-h-[94vh] flex-col justify-center px-6 pb-24 pt-32 md:px-12">
        <div className="aurora" aria-hidden>
          <div className="blob blob-heat" />
          <div className="blob blob-cool" />
          <div className="blob blob-mid" />
          <div className="orbit-ring orbit-1" />
          <div className="orbit-ring orbit-2" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <Link href="/insights" className="hero-in group inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-[#5ff0d6]" style={{ animationDelay: "100ms" }}>
            <span className="inline-block transition-transform duration-300 group-hover:-translate-x-1">←</span>
            Back to insights
          </Link>

          <p className="hero-in mt-10 inline-flex items-center gap-3 text-sm tracking-wide text-[#5ff0d6]" style={{ animationDelay: "250ms" }}>
            <span className="live-dot" />
            Urban heat island mitigation simulator
          </p>

          <h1 className="display mt-5 max-w-5xl text-[clamp(2.8rem,8vw,7rem)] font-light leading-[1] tracking-[-0.02em] text-white">
            {HEADLINE.map((item, wi) => (
              <span key={wi} className="word-mask mr-[0.22em]">
                {item.w.split("").map((ch) => {
                  const d = 350 + charIndex++ * 32;
                  return (
                    <span key={charIndex} className={`char ${item.em ? "char-em" : ""}`} style={{ animationDelay: `${d}ms` }}>
                      {ch}
                    </span>
                  );
                })}
              </span>
            ))}
          </h1>

          <p className="hero-in mt-8 max-w-xl text-lg leading-relaxed text-slate-400" style={{ animationDelay: "1500ms" }}>
            Model canopy, cool roofs and reflective pavement across the hottest H3 cells, see what it costs, and compare two plans side by side.
          </p>

          <div className="hero-in mt-12 flex flex-wrap items-center gap-x-10 gap-y-6" style={{ animationDelay: "1700ms" }}>
            <div>
              <p className="text-xs text-slate-500">Plan {active}</p>
              <p className="num text-4xl font-light text-white">−{f2(heroRelief)}°C</p>
            </div>
            <div className="hidden h-10 w-px bg-white/10 sm:block" />
            <div>
              <p className="text-xs text-slate-500">Estimated cost</p>
              <p className="num text-4xl font-light text-white">{formatInr(imp.costInr)}</p>
            </div>
            <div className="hidden h-10 w-px bg-white/10 sm:block" />
            <div>
              <p className="text-xs text-slate-500">Avg. baseline</p>
              <p className="num text-4xl font-light text-white">{f2(avgBaseline)}°C</p>
            </div>
          </div>

          <div className="hero-in mt-12" style={{ animationDelay: "1900ms" }}>
            <Magnetic strength={0.35}>
              <a href="#simulator" className="btn-primary">Start simulating</a>
            </Magnetic>
          </div>
        </div>

        <div className="hero-in absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-xs text-slate-500" style={{ animationDelay: "2100ms" }}>
          Scroll to simulate
          <span className="relative block h-10 w-px overflow-hidden bg-white/10">
            <span className="scroll-dot" />
          </span>
        </div>
      </section>

      {/* ───────── Marquee ───────── */}
      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[0, 1].map((k) => (
            <div key={k} className="marquee-set">
              {MARQUEE.map((m) => (
                <span key={`${k}-${m}`} className="display marquee-item">
                  {m}
                  <b>✦</b>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ───────── Simulator ───────── */}
      <section id="simulator" className="relative px-6 py-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="01">Simulator</Eyebrow>
            <h2 className="display max-w-2xl text-4xl font-light leading-tight text-white md:text-6xl">
              Shape the <em className="grad-text">intervention.</em>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Pick a starting point, then fine-tune each lever. Turn on compare to build a second plan and see which one earns its cost.
            </p>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-24">
                <Reveal>
                  <Glass className="rounded-[28px] p-7 md:p-9">
                    <div className="flex items-center justify-between gap-4">
                      <div className={`tabs ${compare ? "" : "tabs-off"}`}>
                        {(["A", "B"] as Key[]).map((k) => (
                          <button key={k} onClick={() => setActive(k)} disabled={!compare && k === "B"} className={`tab ${active === k ? "tab-active" : ""}`}>
                            Plan {k}
                          </button>
                        ))}
                      </div>
                      <button onClick={toggleCompare} role="switch" aria-checked={compare} className="flex items-center gap-3 text-[13px] text-slate-300">
                        Compare
                        <span className={`switch ${compare ? "switch-on" : ""}`}>
                          <span className="switch-knob" />
                        </span>
                      </button>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                      {PRESETS.map((p) => {
                        const on = p.s.treeCover === cur.treeCover && p.s.coolRoofs === cur.coolRoofs && p.s.albedo === cur.albedo;
                        return (
                          <button key={p.name} onClick={() => applyPreset(p.s)} className={`chip ${on ? "chip-active" : ""}`}>
                            {p.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-9 space-y-9">
                      <Slider label="Tree canopy expansion" hint="More shade and evapotranspiration cooling in exposed cells." value={cur.treeCover} min={SCENARIO_LIMITS.treeCover.min} max={SCENARIO_LIMITS.treeCover.max} onChange={(v) => setField("treeCover", v)} />
                      <Slider label="Cool roof retrofitting" hint="Reflects solar radiation on high-density rooftops." value={cur.coolRoofs} min={SCENARIO_LIMITS.coolRoofs.min} max={SCENARIO_LIMITS.coolRoofs.max} onChange={(v) => setField("coolRoofs", v)} />
                      <Slider label="Pavement albedo boost" hint="High-albedo sealants for roads and parking areas." value={cur.albedo} min={SCENARIO_LIMITS.albedo.min} max={SCENARIO_LIMITS.albedo.max} onChange={(v) => setField("albedo", v)} />
                    </div>

                    <div className="mt-10 border-t border-white/[0.06] pt-8">
                      <Gauge value={tempReduction} label={`Plan ${active} relief`} />
                      <p className="mx-auto mt-5 max-w-[16rem] text-center text-[13px] leading-relaxed text-slate-500">
                        Estimated average surface temperature drop across the priority cells.
                      </p>
                    </div>
                  </Glass>
                </Reveal>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-7">
              <Reveal>
                <h3 className="display text-2xl font-light text-white md:text-3xl">How each hotspot responds</h3>
                {compare && (
                  <p className="mt-3 flex items-center gap-5 text-[13px] text-slate-400">
                    <span className="flex items-center gap-2"><i className="h-1.5 w-5 rounded-full bg-[#2ee6c5]" /> Plan A</span>
                    <span className="flex items-center gap-2"><i className="h-1.5 w-5 rounded-full bg-[#a78bfa]" /> Plan B</span>
                  </p>
                )}
              </Reveal>
              {CELLS.map((spot, i) => (
                <HotspotCard key={spot.id} spot={spot} dropA={eA.total} dropB={compare ? eB.total : null} index={i} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────── City heat grid ───────── */}
      <section className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="02">The city</Eyebrow>
            <h2 className="display max-w-3xl text-4xl font-light leading-tight text-white md:text-6xl">
              Watch the heat <em className="grad-text">fade.</em>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              An illustrative heat map of the target area. Move any slider and the whole grid cools in a wave.
            </p>
          </Reveal>
          <Reveal className="mt-12" delay={100}>
            <Glass className="rounded-[28px] p-6 md:p-10">
              <CityGrid relief={reliefTween} />
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-[13px] text-slate-500">
                <span className="flex items-center gap-3">
                  <span className="num text-slate-400">Cooler</span>
                  <span className="legend-bar" />
                  <span className="num text-slate-400">Hotter</span>
                </span>
                <span>
                  Plan {active} · <span className="num text-[#5ff0d6]">−{f2(heroRelief)}°C</span> average relief
                </span>
              </div>
            </Glass>
          </Reveal>
        </div>
      </section>

      {/* ───────── Cost & impact ───────── */}
      <section className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="03">Investment</Eyebrow>
            <h2 className="display max-w-3xl text-4xl font-light leading-tight text-white md:text-6xl">
              What it would <em className="grad-text">take.</em>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Figures for Plan {active} across all {CELLS.length} target cells.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Estimated cost" value={imp.costInr} format={formatInr} hint="Planting, retrofits and sealants combined." delay={0} />
            <Stat label="Trees to plant" value={imp.trees} format={nf} hint="New trees needed to reach the canopy target." delay={90} />
            <Stat label="People helped" value={imp.peopleHelped} format={nf} hint="Residents who feel the relief, scaled by degrees cooled." delay={180} />
            <Stat label="Cost per °C" value={imp.costPerDegreeInr} format={formatInr} hint="How much each degree of relief costs." delay={270} />
          </div>

          <Reveal className="mt-6" delay={120}>
            <Glass className="rounded-3xl p-7 md:p-10">
              <p className="mb-8 text-sm text-slate-500">Where Plan {active}’s cooling comes from</p>
              <div className="space-y-8">
                <ContributionRow label="Tree canopy expansion" value={e.tree} total={e.total} />
                <ContributionRow label="Cool roof retrofitting" value={e.roof} total={e.total} />
                <ContributionRow label="Pavement albedo boost" value={e.albedo} total={e.total} />
              </div>
            </Glass>
          </Reveal>

          <Reveal delay={100}>
            <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-slate-600">
              Cost and people-helped figures use editable planning assumptions, not measured outcomes. Cooling uses a simplified linear model for exploring options.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───────── Compare ───────── */}
      <section className="relative px-6 pb-32 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="04">Compare</Eyebrow>
            <h2 className="display max-w-3xl text-4xl font-light leading-tight text-white md:text-6xl">
              Plan A against <em className="grad-text">Plan B.</em>
            </h2>
          </Reveal>

          {!compare ? (
            <Reveal delay={100} className="mt-12">
              <Glass className="rounded-3xl p-8 md:p-10">
                <p className="display max-w-lg text-2xl font-light leading-snug text-slate-300">
                  Turn on compare to set up a second plan and see the trade-off between cooling and cost.
                </p>
                <div className="mt-8">
                  <Magnetic>
                    <button onClick={toggleCompare} className="btn-primary">Start comparing</button>
                  </Magnetic>
                </div>
              </Glass>
            </Reveal>
          ) : (
            <>
              <Reveal delay={100} className="mt-12">
                <Glass className="overflow-hidden rounded-3xl">
                  <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-4 border-b border-white/[0.06] px-6 py-4 text-sm md:px-9">
                    <span className="text-slate-500">Measure</span>
                    <span className="text-[#5ff0d6]">Plan A</span>
                    <span className="text-[#c4b5fd]">Plan B</span>
                  </div>
                  {rows.map((r) => {
                    const win = r.a === r.b ? null : r.better === "high" ? (r.a > r.b ? "A" : "B") : r.a < r.b ? "A" : "B";
                    return (
                      <div key={r.label} className="row-hover grid grid-cols-[1.3fr_1fr_1fr] items-center gap-4 border-b border-white/[0.04] px-6 py-5 last:border-0 md:px-9">
                        <span className="text-[15px] text-slate-300">{r.label}</span>
                        <span className={`num flex items-center gap-2 text-lg ${win === "A" ? "text-[#5ff0d6]" : "text-slate-400"}`}>
                          {r.fmt(r.a)}
                          {win === "A" && <span className="win win-a">best</span>}
                        </span>
                        <span className={`num flex items-center gap-2 text-lg ${win === "B" ? "text-[#c4b5fd]" : "text-slate-400"}`}>
                          {r.fmt(r.b)}
                          {win === "B" && <span className="win win-b">best</span>}
                        </span>
                      </div>
                    );
                  })}
                </Glass>
              </Reveal>

              <Reveal delay={150} className="mt-8">
                <p className="display max-w-3xl text-2xl font-light leading-snug text-slate-200 md:text-3xl">
                  Plan B cools {f2(Math.abs(dDrop))}°C {dDrop >= 0 ? "more" : "less"} than Plan A and costs {formatInr(Math.abs(dCost))} {dCost >= 0 ? "more" : "less"}.
                  {cheaperPerDeg && <> Per degree of relief, Plan {cheaperPerDeg} is the cheaper one.</>}
                </p>
              </Reveal>
            </>
          )}

          <Reveal className="mt-24 text-center" delay={100}>
            <p className="display mx-auto max-w-2xl text-3xl font-light leading-snug text-slate-300 md:text-5xl">
              Found a plan worth <em className="grad-text">pursuing?</em> Check which cells need it most.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Magnetic strength={0.4}>
                <Link href="/insights" className="btn-primary">Review insights</Link>
              </Magnetic>
              <Magnetic strength={0.25}>
                <button onClick={() => applyPreset(PRESETS[1].s)} className="btn-ghost">Reset Plan {active}</button>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const CSS = `
.scn { font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
.scn .display { font-family: var(--font-display), Georgia, serif; font-optical-sizing: auto; }
.scn .display em { font-style: italic; font-weight: 300; }
.scn .num { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.scn ::selection { background: rgba(46,230,197,.3); }

.scn .grad-text { background: linear-gradient(100deg,#ffb86b 0%,#ffd9a8 28%,#5ff0d6 62%,#ffb86b 100%); background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; animation: shimmer 7s linear infinite; padding-right: .06em; }
@keyframes shimmer { to { background-position: -220% 0; } }

.scn .eyebrow { display: flex; align-items: center; gap: .85rem; margin-bottom: 1.4rem; font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: #7f8aa3; }
.scn .eyebrow .num { color: #5ff0d6; letter-spacing: .05em; }
.scn .eyebrow i { display: block; height: 1px; width: 44px; background: linear-gradient(90deg,#5ff0d6,transparent); }

.scn .heat-field { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .75; }
.scn .grain { position: fixed; inset: 0; z-index: 50; pointer-events: none; opacity: .055; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.scn .cursor-glow { position: fixed; top: 0; left: 0; z-index: 1; width: 500px; height: 500px; pointer-events: none; border-radius: 9999px;
  background: radial-gradient(circle, rgba(46,230,197,.10), transparent 62%); transition: transform .25s cubic-bezier(.16,1,.3,1); will-change: transform; }
.scn .cursor-dot { position: fixed; top: -3px; left: -3px; z-index: 120; width: 6px; height: 6px; border-radius: 9999px; background: #5ff0d6; pointer-events: none; box-shadow: 0 0 12px #5ff0d6; }
.scn .cursor-ring { position: fixed; top: -18px; left: -18px; z-index: 119; width: 36px; height: 36px; border-radius: 9999px; pointer-events: none;
  border: 1px solid rgba(95,240,214,.55); transition: width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1), margin .35s cubic-bezier(.16,1,.3,1), background .35s, border-color .35s; mix-blend-mode: screen; }
.scn .cursor-ring.cursor-hot { width: 64px; height: 64px; margin: -14px 0 0 -14px; background: rgba(95,240,214,.10); border-color: rgba(95,240,214,.9); }
@media (pointer: coarse) { .scn .cursor-dot, .scn .cursor-ring, .scn .cursor-glow { display: none; } }

.scn .aurora { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.scn .blob { position: absolute; border-radius: 9999px; filter: blur(110px); will-change: transform, opacity; }
.scn .blob-heat { width: 640px; height: 640px; left: -8%; top: -12%; background: radial-gradient(circle, #ff8a4c, transparent 65%);
  opacity: calc(.42 - var(--relief,0) * .30); transform: translateY(calc(var(--sy,0) * -0.12px)); animation: drift1 18s ease-in-out infinite; }
.scn .blob-cool { width: 720px; height: 720px; right: -12%; top: 6%; background: radial-gradient(circle, #2ee6c5, transparent 65%);
  opacity: calc(.14 + var(--relief,0) * .32); transform: translateY(calc(var(--sy,0) * -0.2px)); animation: drift2 22s ease-in-out infinite; }
.scn .blob-mid { width: 420px; height: 420px; left: 42%; bottom: -12%; background: radial-gradient(circle, #3a5bff, transparent 65%); opacity: .18; animation: drift3 26s ease-in-out infinite; }
@keyframes drift1 { 0%,100% { margin: 0; } 50% { margin: 60px 0 0 90px; } }
@keyframes drift2 { 0%,100% { margin: 0; } 50% { margin: 80px 70px 0 0; } }
@keyframes drift3 { 0%,100% { margin: 0; } 50% { margin: -50px 0 0 -80px; } }
.scn .orbit-ring { position: absolute; border-radius: 9999px; border: 1px solid rgba(255,255,255,.06); right: 8%; top: 18%; }
.scn .orbit-1 { width: 520px; height: 520px; animation: spin 60s linear infinite; border-top-color: rgba(95,240,214,.45); }
.scn .orbit-2 { width: 360px; height: 360px; right: calc(8% + 80px); top: calc(18% + 80px); animation: spin 40s linear infinite reverse; border-bottom-color: rgba(255,154,92,.45); }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 768px) { .scn .orbit-ring { display: none; } }

.scn .hero-in { opacity: 0; }
.scn.is-ready .hero-in { animation: heroIn 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes heroIn { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
.scn .word-mask { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: .14em; margin-bottom: -.14em; white-space: nowrap; }
.scn .char { display: inline-block; transform: translateY(115%) rotate(6deg); opacity: 0; }
.scn.is-ready .char { animation: charUp 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes charUp { to { transform: none; opacity: 1; } }
.scn .char-em { font-style: italic; background: linear-gradient(100deg,#ffb86b,#ffd9a8 30%,#5ff0d6 70%,#2ee6c5); background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.scn.is-ready .char-em { animation: charUp 1.1s cubic-bezier(.16,1,.3,1) forwards, shimmer 6s linear 1.6s infinite; }
.scn .scroll-dot { position: absolute; left: 0; top: 0; width: 1px; height: 14px; background: #5ff0d6; animation: dot 2s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes dot { 0% { transform: translateY(-14px); } 100% { transform: translateY(44px); } }
.scn .live-dot { position: relative; width: 8px; height: 8px; border-radius: 9999px; background: #5ff0d6; }
.scn .live-dot::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: #5ff0d6; animation: ping 2s cubic-bezier(0,0,.2,1) infinite; }
@keyframes ping { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(3.2); opacity: 0; } }

.scn .loader { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; background: #050a1c;
  transition: transform 1.2s cubic-bezier(.76,0,.24,1), border-radius 1.2s cubic-bezier(.76,0,.24,1); border-radius: 0 0 0 0; }
.scn .loader-out { transform: translateY(-100%); border-radius: 0 0 50% 50% / 0 0 14vh 14vh; }
.scn .loader-glow { position: absolute; width: 560px; height: 560px; border-radius: 9999px; filter: blur(90px);
  background: radial-gradient(circle, rgba(255,138,76,.35), rgba(46,230,197,.25) 55%, transparent 70%); animation: pulse 3s ease-in-out infinite; }
@keyframes pulse { 0%,100% { transform: scale(.9); opacity: .7; } 50% { transform: scale(1.1); opacity: 1; } }
.scn .loader-inner { position: relative; text-align: center; width: min(320px, 80vw); }
.scn .loader-brand { font-size: 2.4rem; font-weight: 300; color: #fff; letter-spacing: -.01em; }
.scn .loader-brand em { color: #5ff0d6; }
.scn .loader-count { margin-top: 1.4rem; font-size: 4.2rem; font-weight: 200; color: #fff; line-height: 1; }
.scn .loader-line { margin-top: 1.6rem; height: 1px; background: rgba(255,255,255,.12); overflow: hidden; }
.scn .loader-line span { display: block; height: 100%; transform-origin: left; background: linear-gradient(90deg,#ff9a5c,#5ff0d6); }
.scn .loader-sub { margin-top: 1rem; font-size: .72rem; letter-spacing: .24em; text-transform: uppercase; color: #6b7690; }

.scn .marquee { position: relative; z-index: 2; overflow: hidden; border-block: 1px solid rgba(255,255,255,.06); padding: 1.3rem 0;
  background: linear-gradient(180deg, rgba(255,255,255,.015), transparent);
  -webkit-mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
.scn .marquee-track { display: flex; width: max-content; animation: marq 38s linear infinite; }
.scn .marquee:hover .marquee-track { animation-play-state: paused; }
.scn .marquee-set { display: flex; }
.scn .marquee-item { display: inline-flex; align-items: center; gap: 2.2rem; padding-right: 2.2rem; font-size: 2rem; font-weight: 300; font-style: italic; color: rgba(226,232,240,.5); white-space: nowrap; transition: color .4s; }
.scn .marquee-item:hover { color: #5ff0d6; }
.scn .marquee-item b { font-style: normal; font-size: .9rem; color: #ff9a5c; font-weight: 400; }
@keyframes marq { to { transform: translateX(-50%); } }

.scn .glass { position: relative; isolation: isolate; background: linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
  border: 1px solid rgba(255,255,255,.07); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 1px 0 rgba(255,255,255,.05) inset, 0 30px 60px -30px rgba(0,0,0,.6);
  transition: transform .5s cubic-bezier(.16,1,.3,1), border-color .4s; transform-style: preserve-3d; }
.scn .glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: -1; opacity: 0; transition: opacity .4s;
  background: radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(46,230,197,.11), transparent 60%); }
.scn .glass::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0; transition: opacity .4s;
  background: radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(95,240,214,.65), transparent 60%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.scn .glass:hover::before, .scn .glass:hover::after { opacity: 1; }

.scn .range { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 9999px; outline: none; cursor: pointer; display: block;
  background: linear-gradient(90deg, #2ee6c5 var(--p), rgba(255,255,255,.09) var(--p)); transition: filter .3s; }
.scn .range:hover { filter: drop-shadow(0 0 8px rgba(46,230,197,.35)); }
.scn .range::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 9999px; background: #eafffb; border: 5px solid #2ee6c5;
  box-shadow: 0 0 0 0 rgba(46,230,197,.45), 0 4px 14px rgba(0,0,0,.5); transition: transform .25s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; }
.scn .range::-webkit-slider-thumb:hover { transform: scale(1.18); box-shadow: 0 0 0 8px rgba(46,230,197,.14), 0 4px 14px rgba(0,0,0,.5); }
.scn .range:active::-webkit-slider-thumb { transform: scale(1.3); box-shadow: 0 0 0 12px rgba(46,230,197,.18), 0 4px 14px rgba(0,0,0,.5); }
.scn .range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 9999px; background: #eafffb; border: 5px solid #2ee6c5; transition: transform .25s; }
.scn .range::-moz-range-thumb:hover { transform: scale(1.18); }
.scn .range:focus-visible { outline: 2px solid #5ff0d6; outline-offset: 8px; }
.scn .bubble { position: absolute; bottom: 26px; transform: translate(-50%, 8px) scale(.8); padding: .25rem .6rem; border-radius: 9999px; font-size: .72rem;
  color: #04121a; background: #5ff0d6; opacity: 0; pointer-events: none; transition: opacity .25s, transform .35s cubic-bezier(.34,1.56,.64,1); box-shadow: 0 6px 20px -4px rgba(46,230,197,.6); }
.scn .bubble-on { opacity: 1; transform: translate(-50%, 0) scale(1); }

.scn .gauge-orbit { position: absolute; inset: -10px; border-radius: 9999px; border: 1px dashed rgba(255,255,255,.12); animation: spin 50s linear infinite; }

.scn .bar-sheen { position: relative; overflow: hidden; }
.scn .bar-sheen::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%); transform: translateX(-120%); animation: sheen 3.6s ease-in-out infinite; }
@keyframes sheen { 0% { transform: translateX(-120%); } 60%,100% { transform: translateX(220%); } }
.scn .stat-value { background: linear-gradient(180deg,#fff,#a8b6cf); -webkit-background-clip: text; background-clip: text; color: transparent; }

.scn .city-grid { display: grid; gap: 6px; }
.scn .city-grid .dot { display: block; aspect-ratio: 1; border-radius: 32%; cursor: pointer;
  transition: background .9s ease var(--d,0ms), opacity .9s ease var(--d,0ms), box-shadow .9s ease var(--d,0ms), transform .45s cubic-bezier(.34,1.56,.64,1); }
.scn .city-grid .dot:hover { transform: scale(1.7) !important; z-index: 2; opacity: 1 !important; }
.scn .legend-bar { display: inline-block; width: 140px; height: 6px; border-radius: 9999px; background: linear-gradient(90deg, hsl(172 92% 58%), hsl(95 92% 58%), hsl(20 92% 58%)); }

.scn .chip { padding: .5rem 1rem; border-radius: 9999px; font-size: .8125rem; color: #aab4c8; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.02); transition: all .3s cubic-bezier(.16,1,.3,1); cursor: pointer; }
.scn .chip:hover { color: #fff; border-color: rgba(95,240,214,.5); transform: translateY(-1px); }
.scn .chip-active { color: #04121a; background: #5ff0d6; border-color: #5ff0d6; box-shadow: 0 0 24px rgba(46,230,197,.35); }
.scn .tabs { display: inline-flex; padding: 4px; border-radius: 9999px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); transition: opacity .4s; }
.scn .tabs-off { opacity: .55; }
.scn .tab { padding: .4rem 1rem; border-radius: 9999px; font-size: .8125rem; color: #94a3b8; transition: all .35s cubic-bezier(.16,1,.3,1); cursor: pointer; }
.scn .tab:disabled { cursor: not-allowed; }
.scn .tab-active { color: #04121a; background: #5ff0d6; }
.scn .tab-active:nth-child(2) { background: #c4b5fd; }
.scn .switch { position: relative; width: 40px; height: 22px; border-radius: 9999px; background: rgba(255,255,255,.12); transition: background .35s; }
.scn .switch-on { background: #2ee6c5; }
.scn .switch-knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 9999px; background: #fff; transition: transform .4s cubic-bezier(.34,1.56,.64,1); }
.scn .switch-on .switch-knob { transform: translateX(18px); }
.scn .row-hover { transition: background .3s; }
.scn .row-hover:hover { background: rgba(255,255,255,.025); }
.scn .win { font-family: var(--font-body), sans-serif; font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; padding: .15rem .5rem; border-radius: 9999px; animation: pop .6s cubic-bezier(.34,1.56,.64,1); }
.scn .win-a { color: #04121a; background: #5ff0d6; }
.scn .win-b { color: #1a1033; background: #c4b5fd; }
@keyframes pop { from { transform: scale(0); opacity: 0; } to { transform: none; opacity: 1; } }

.scn .magnetic { display: inline-block; transition: transform .45s cubic-bezier(.16,1,.3,1); will-change: transform; }
.scn .btn-primary { position: relative; overflow: hidden; padding: .95rem 2rem; border-radius: 9999px; font-weight: 600; font-size: .95rem; color: #04121a;
  background: linear-gradient(135deg, #5ff0d6, #2ee6c5); transition: transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .35s; box-shadow: 0 10px 40px -10px rgba(46,230,197,.6); display: inline-block; cursor: pointer; }
.scn .btn-primary::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%); transform: translateX(-120%); transition: transform .8s cubic-bezier(.16,1,.3,1); }
.scn .btn-primary:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 18px 50px -10px rgba(46,230,197,.75); }
.scn .btn-primary:hover::after { transform: translateX(120%); }
.scn .btn-ghost { padding: .95rem 2rem; border-radius: 9999px; font-weight: 500; font-size: .95rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,.14); transition: all .3s cubic-bezier(.16,1,.3,1); cursor: pointer; }
.scn .btn-ghost:hover { color: #fff; border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.04); transform: translateY(-2px); }
.scn .chip:focus-visible, .scn .tab:focus-visible, .scn .btn-primary:focus-visible, .scn .btn-ghost:focus-visible { outline: 2px solid #5ff0d6; outline-offset: 3px; }

@media (prefers-reduced-motion: reduce) {
  .scn *, .scn *::before, .scn *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .scn .cursor-glow, .scn .cursor-ring, .scn .cursor-dot, .scn .orbit-ring { display: none; }
  .scn .hero-in, .scn .char { opacity: 1; transform: none; }
  .scn .marquee-track { animation: none; }
}
`;