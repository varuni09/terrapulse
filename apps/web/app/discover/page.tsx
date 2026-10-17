"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

/* ═════════════════════════ Fonts ═════════════════════════ */

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"] });
const bodyFont = Manrope({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

/* ═════════════════════════ Data ═════════════════════════ */

type City = { id: string; name: string; country: string; lat: number; lon: number; home?: boolean };

const CITIES: City[] = [
  { id: "chennai", name: "Chennai", country: "India", lat: 13.0827, lon: 80.2707, home: true },
  { id: "delhi", name: "Delhi", country: "India", lat: 28.6139, lon: 77.209 },
  { id: "dubai", name: "Dubai", country: "United Arab Emirates", lat: 25.2048, lon: 55.2708 },
  { id: "singapore", name: "Singapore", country: "Singapore", lat: 1.3521, lon: 103.8198 },
  { id: "tokyo", name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503 },
  { id: "sydney", name: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093 },
  { id: "cairo", name: "Cairo", country: "Egypt", lat: 30.0444, lon: 31.2357 },
  { id: "london", name: "London", country: "United Kingdom", lat: 51.5072, lon: -0.1276 },
  { id: "lagos", name: "Lagos", country: "Nigeria", lat: 6.5244, lon: 3.3792 },
  { id: "nyc", name: "New York", country: "United States", lat: 40.7128, lon: -74.006 },
  { id: "saopaulo", name: "São Paulo", country: "Brazil", lat: -23.5505, lon: -46.6333 },
  { id: "la", name: "Los Angeles", country: "United States", lat: 34.0522, lon: -118.2437 },
];
const CITY = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<string, City>;
const HOME = CITY.chennai;
const ARC_TARGETS = ["delhi", "dubai", "singapore", "tokyo", "london", "nyc", "sydney"];

type Mode = "base" | "heat" | "green" | "cells";

const PANELS: { mode: Mode; city: string; label: string }[] = [
  { mode: "base", city: "chennai", label: "Discover" },
  { mode: "heat", city: "delhi", label: "Heat" },
  { mode: "green", city: "singapore", label: "Green" },
  { mode: "cells", city: "chennai", label: "Cells" },
];

const MODE_LABEL: Record<Mode, string> = {
  base: "Overview",
  heat: "Land surface temperature",
  green: "Vegetation (NDVI)",
  cells: "H3 cells",
};

/* ═════════════════════════ Math helpers ═════════════════════════ */

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrapPi = (a: number) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
const hash2 = (q: number, r: number) => {
  const x = Math.sin(q * 127.1 + r * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Shaded sphere lit from direction (lx, ly) in screen space (unit vector toward the sun). */
function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  cols: [string, string, string],
  lx: number,
  ly: number,
  detail?: () => void
) {
  const g = ctx.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, r * 0.08, x, y, r * 1.05);
  g.addColorStop(0, cols[0]);
  g.addColorStop(0.55, cols[1]);
  g.addColorStop(1, cols[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  if (detail) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    detail();
    ctx.restore();
  }
  const sx = x + lx * r * 0.7;
  const sy = y + ly * r * 0.7;
  const s = ctx.createRadialGradient(sx, sy, r * 0.55, sx, sy, r * 1.7);
  s.addColorStop(0, "rgba(0,0,10,0)");
  s.addColorStop(1, "rgba(0,0,10,.88)");
  ctx.fillStyle = s;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/* ═════════════════════════ Dotted Earth data ═════════════════════════ */

type Dots = {
  n: number;
  ux: Float32Array;
  uy: Float32Array;
  uz: Float32Array;
  lat: Float32Array;
  gr: Float32Array;
  rn: Float32Array;
  kind: Uint8Array;
};

const TEXTURES = [
  "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
  "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg",
];

function buildDots(img: HTMLImageElement | null): Dots {
  const N = 18000;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const TW = 720;
  const TH = 360;
  let data: Uint8ClampedArray | null = null;
  if (img) {
    try {
      const oc = document.createElement("canvas");
      oc.width = TW;
      oc.height = TH;
      const o = oc.getContext("2d");
      if (o) {
        o.drawImage(img, 0, 0, TW, TH);
        data = o.getImageData(0, 0, TW, TH).data;
      }
    } catch {
      data = null;
    }
  }
  const ux: number[] = [];
  const uy: number[] = [];
  const uz: number[] = [];
  const lat: number[] = [];
  const gr: number[] = [];
  const rn: number[] = [];
  const kind: number[] = [];
  let land = 0;
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = golden * i;
    const x = Math.cos(th) * rr;
    const z = Math.sin(th) * rr;
    const la = Math.asin(y);
    const lo = Math.atan2(x, z);
    let isLand = false;
    let g = 0;
    if (data) {
      const u = lo / TAU + 0.5;
      const v = 0.5 - la / Math.PI;
      const px = clamp(Math.floor(u * TW), 0, TW - 1);
      const py = clamp(Math.floor(v * TH), 0, TH - 1);
      const o = (py * TW + px) * 4;
      const R = data[o];
      const G = data[o + 1];
      const B = data[o + 2];
      const ocean = B > R * 1.3 + 8 && B >= G * 0.8;
      isLand = !ocean;
      g = clamp((G - Math.max(R, B) * 0.9) / 60, 0, 1);
    }
    if (isLand) land++;
    if (isLand || i % 3 === 0) {
      ux.push(x);
      uy.push(y);
      uz.push(z);
      lat.push(la);
      gr.push(g);
      rn.push(Math.random());
      kind.push(isLand ? 1 : 0);
    }
  }
  if (data) {
    const f = land / N;
    if (f < 0.12 || f > 0.5) return buildDots(null); // texture unusable → plain dot grid
  }
  return {
    n: ux.length,
    ux: Float32Array.from(ux),
    uy: Float32Array.from(uy),
    uz: Float32Array.from(uz),
    lat: Float32Array.from(lat),
    gr: Float32Array.from(gr),
    rn: Float32Array.from(rn),
    kind: Uint8Array.from(kind),
  };
}

/* ═════════════════════════ Universe (stars + planets) ═════════════════════════ */

type Star = { x: number; y: number; z: number; s: number; p: number; sp: number; c: string };
type Shoot = { x: number; y: number; vx: number; vy: number; life: number; max: number };
type PlanetDef = {
  a: number;
  tilt: number;
  rot: number;
  r: number;
  per: number;
  ph: number;
  cols: [string, string, string];
  kind?: "jupiter" | "saturn";
};

const PLANETS: PlanetDef[] = [
  { a: 1.55, tilt: 0.3, rot: -0.3, r: 4, per: 34, ph: 0.4, cols: ["#e7e1d9", "#9a9087", "#2e2a27"] },
  { a: 1.95, tilt: 0.28, rot: -0.22, r: 8, per: 52, ph: 2.2, cols: ["#ffeec4", "#e0aa62", "#5e3c1f"] },
  { a: 2.45, tilt: 0.27, rot: -0.14, r: 6.5, per: 78, ph: 4.1, cols: ["#ffbd9a", "#c4572f", "#45190d"] },
  { a: 3.0, tilt: 0.26, rot: -0.06, r: 22, per: 125, ph: 1.3, cols: ["#f3dcb8", "#c99a68", "#4d3322"], kind: "jupiter" },
  { a: 3.7, tilt: 0.27, rot: 0.04, r: 17, per: 185, ph: 3.4, cols: ["#fff0c8", "#dcb872", "#5a4522"], kind: "saturn" },
  { a: 4.5, tilt: 0.29, rot: 0.12, r: 11, per: 260, ph: 5.3, cols: ["#e3fdff", "#86d9e6", "#26636e"] },
  { a: 5.4, tilt: 0.31, rot: 0.18, r: 10, per: 350, ph: 0.2, cols: ["#aac6ff", "#4572f2", "#15266f"] },
];

function Universe({ reduced }: { reduced: boolean }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cb = backRef.current;
    const cf = frontRef.current;
    if (!cb || !cf) return;
    const b = cb.getContext("2d");
    const f = cf.getContext("2d");
    if (!b || !f) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let mx = 0.5;
    let my = 0.5;
    let smx = 0.5;
    let smy = 0.5;
    let stars: Star[] = [];
    const shoots: Shoot[] = [];
    let nextShoot = 2800;
    const t0 = performance.now();
    const palette = ["#ffffff", "#cfe4ff", "#ffe9c9", "#bffcf0"];

    const seed = () => {
      const n = clamp(Math.floor((w * h) / 4200), 220, 760);
      stars = Array.from({ length: n }, () => {
        const z = Math.pow(Math.random(), 1.6);
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          s: 0.5 + z * 1.5,
          p: Math.random() * TAU,
          sp: 0.6 + Math.random() * 2.2,
          c: palette[Math.floor(Math.random() * palette.length)],
        };
      });
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      for (const c of [cb, cf]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      seed();
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth;
      my = e.clientY / window.innerHeight;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    // direction toward the sun (top-left), screen space
    const slx = -0.72;
    const sly = -0.69;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = reduced ? 40 : (now - t0) / 1000;
      smx += (mx - smx) * 0.04;
      smy += (my - smy) * 0.04;
      const sy = window.scrollY;

      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.clearRect(0, 0, w, h);
      f.clearRect(0, 0, w, h);

      /* stars */
      for (const s of stars) {
        const par = 0.015 + s.z * 0.11;
        const x = s.x + (smx - 0.5) * -60 * s.z;
        let y = (s.y - sy * par + (smy - 0.5) * -40 * s.z) % h;
        if (y < 0) y += h;
        const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.p);
        b.globalAlpha = (0.22 + 0.78 * s.z) * tw;
        b.fillStyle = s.c;
        if (s.z > 0.85) {
          b.beginPath();
          b.arc(x, y, s.s, 0, TAU);
          b.fill();
        } else {
          b.fillRect(x, y, s.s, s.s);
        }
      }
      b.globalAlpha = 1;

      /* sun glow (top-left) */
      const sg = b.createRadialGradient(-w * 0.05, -h * 0.1, 0, -w * 0.05, -h * 0.1, Math.max(w, h) * 0.7);
      sg.addColorStop(0, "rgba(255,214,160,.26)");
      sg.addColorStop(0.3, "rgba(255,150,90,.07)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = sg;
      b.fillRect(0, 0, w, h);

      /* orbit geometry (centred on Earth) */
      const narrow = w < 1024;
      const baseR = narrow ? Math.min(w * 0.4, h * 0.3) : Math.min(h * 0.4, w * 0.29);
      const ecx = (narrow ? w * 0.5 : w * 0.69) + (smx - 0.5) * -20;
      const ecy = (narrow ? h * 0.4 : h * 0.5) + (smy - 0.5) * -14;
      const sc = Math.max(0.6, baseR / 430);

      const drawn: { z: number; fn: () => void; front: boolean }[] = [];

      for (const p of PLANETS) {
        const a = p.a * baseR;
        const bb = a * p.tilt;
        // rings: far half on the back canvas, near half on the front canvas
        b.strokeStyle = "rgba(150,200,255,.07)";
        b.lineWidth = 1;
        b.beginPath();
        b.ellipse(ecx, ecy, a, bb, p.rot, Math.PI, TAU);
        b.stroke();
        f.strokeStyle = "rgba(150,200,255,.07)";
        f.lineWidth = 1;
        f.beginPath();
        f.ellipse(ecx, ecy, a, bb, p.rot, 0, Math.PI);
        f.stroke();

        const th = p.ph + (t * TAU) / p.per;
        const ex = a * Math.cos(th);
        const ey = bb * Math.sin(th);
        const depth = Math.sin(th); // >0 near side
        const px = ecx + ex * Math.cos(p.rot) - ey * Math.sin(p.rot);
        const py = ecy + ex * Math.sin(p.rot) + ey * Math.cos(p.rot);
        const r = p.r * sc * (0.8 + 0.4 * (depth * 0.5 + 0.5));
        const front = depth > 0;
        const ctx = front ? f : b;
        const dx = -w * 0.05 - px;
        const dy = -h * 0.1 - py;
        const dl = Math.hypot(dx, dy) || 1;
        const lx = dx / dl;
        const ly = dy / dl;

        drawn.push({
          z: depth,
          front,
          fn: () => {
            if (p.kind === "saturn") {
              const ring = (fr: boolean) => {
                const layers = [
                  { k: 1.5, lw: r * 0.1, col: "rgba(225,205,165,.28)" },
                  { k: 1.72, lw: r * 0.14, col: "rgba(235,215,175,.46)" },
                  { k: 1.98, lw: r * 0.08, col: "rgba(200,180,140,.3)" },
                ];
                for (const l of layers) {
                  ctx.strokeStyle = l.col;
                  ctx.lineWidth = l.lw;
                  ctx.beginPath();
                  ctx.ellipse(px, py, r * l.k, r * l.k * 0.3, -0.38, fr ? 0 : Math.PI, fr ? Math.PI : TAU);
                  ctx.stroke();
                }
              };
              ring(false);
              drawBall(ctx, px, py, r, p.cols, lx, ly);
              ring(true);
              return;
            }
            drawBall(ctx, px, py, r, p.cols, lx, ly, () => {
              if (p.kind !== "jupiter") return;
              const bands: [number, number, string][] = [
                [-0.75, 0.1, "rgba(120,80,50,.45)"],
                [-0.5, 0.12, "rgba(250,235,210,.4)"],
                [-0.28, 0.14, "rgba(150,95,60,.55)"],
                [0, 0.1, "rgba(250,235,210,.35)"],
                [0.22, 0.14, "rgba(150,95,60,.5)"],
                [0.5, 0.12, "rgba(240,220,190,.4)"],
                [0.75, 0.1, "rgba(120,85,55,.4)"],
              ];
              for (const bd of bands) {
                ctx.fillStyle = bd[2];
                ctx.fillRect(px - r, py + bd[0] * r - bd[1] * r, r * 2, bd[1] * r * 2);
              }
              ctx.fillStyle = "rgba(190,80,50,.6)";
              ctx.beginPath();
              ctx.ellipse(px + r * 0.25, py + r * 0.3, r * 0.22, r * 0.12, 0, 0, TAU);
              ctx.fill();
            });
          },
        });
      }
      drawn.sort((p, q) => p.z - q.z).forEach((d) => d.fn());

      /* shooting stars */
      if (!reduced) {
        nextShoot -= 16;
        if (nextShoot <= 0) {
          nextShoot = 3500 + Math.random() * 5500;
          const sx = Math.random() * w * 0.9;
          const sy2 = Math.random() * h * 0.45;
          const sp = 9 + Math.random() * 6;
          shoots.push({ x: sx, y: sy2, vx: sp, vy: sp * 0.42, life: 0, max: 60 });
        }
        for (let i = shoots.length - 1; i >= 0; i--) {
          const s = shoots[i];
          s.x += s.vx;
          s.y += s.vy;
          s.life++;
          const k = 1 - s.life / s.max;
          if (k <= 0) {
            shoots.splice(i, 1);
            continue;
          }
          const g = b.createLinearGradient(s.x, s.y, s.x - s.vx * 9, s.y - s.vy * 9);
          g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
          g.addColorStop(1, "rgba(150,210,255,0)");
          b.strokeStyle = g;
          b.lineWidth = 1.4;
          b.beginPath();
          b.moveTo(s.x, s.y);
          b.lineTo(s.x - s.vx * 9, s.y - s.vy * 9);
          b.stroke();
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [reduced]);

  return (
    <>
      <canvas ref={backRef} className="pointer-events-none fixed inset-0 z-0 h-full w-full" aria-hidden />
      <canvas ref={frontRef} className="pointer-events-none fixed inset-0 z-[2] h-full w-full" aria-hidden />
    </>
  );
}

/* ═════════════════════════ Earth ═════════════════════════ */

type EarthState = {
  lam: number;
  phi: number;
  vl: number;
  vp: number;
  tl: number | null;
  tp: number;
  drag: boolean;
  lastX: number;
  lastY: number;
  moved: number;
  last: number;
  zoom: number;
  mh: number;
  mg: number;
  mc: number;
  hover: City | null;
  px: number;
  py: number;
  mx: number;
  my: number;
  ox: number;
  oy: number;
};

type EarthProps = {
  mode: Mode;
  focus: { city: City; n: number };
  onFocus: (c: City) => void;
  reduced: boolean;
  auto: boolean;
  introMs: number;
};

const HEX_N = 4;
const HEXES = (() => {
  const out: { q: number; r: number; ring: number; h: number }[] = [];
  for (let q = -HEX_N; q <= HEX_N; q++) {
    for (let r = -HEX_N; r <= HEX_N; r++) {
      const s = -q - r;
      if (Math.abs(s) > HEX_N) continue;
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      const h = clamp(hash2(q, r) * 0.6 + (1 - ring / HEX_N) * 0.5, 0, 1);
      out.push({ q, r, ring, h });
    }
  }
  return out;
})();

function Earth({ mode, focus, onFocus, reduced, auto, introMs }: EarthProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLSpanElement>(null);
  const lonRef = useRef<HTMLSpanElement>(null);
  const [hoverCity, setHoverCity] = useState<City | null>(null);

  const live = useRef({ mode, auto, reduced, onFocus, introMs, focusId: focus.city.id });
  useEffect(() => {
    live.current = { mode, auto, reduced, onFocus, introMs, focusId: focus.city.id };
  });

  const S = useRef<EarthState>({
    lam: -1.2,
    phi: 0.35,
    vl: 0,
    vp: 0,
    tl: null,
    tp: 0,
    drag: false,
    lastX: 0,
    lastY: 0,
    moved: 0,
    last: 0,
    zoom: 1,
    mh: 0,
    mg: 0,
    mc: 0,
    hover: null,
    px: -999,
    py: -999,
    mx: 0.5,
    my: 0.5,
    ox: 0,
    oy: 0,
  });

  /* fly to the focused city */
  useEffect(() => {
    const s = S.current;
    const c = focus.city;
    const go = () => {
      const tl = c.lon * D2R;
      const tp = clamp(c.lat * D2R, -1.1, 1.1);
      if (reduced) {
        s.lam = tl;
        s.phi = tp;
        s.tl = null;
      } else {
        s.tl = tl;
        s.tp = tp;
      }
      s.vl = 0;
      s.vp = 0;
      s.last = performance.now();
    };
    if (focus.n === 0) {
      const id = setTimeout(go, reduced ? 0 : introMs);
      return () => clearTimeout(id);
    }
    go();
  }, [focus, reduced, introMs]);

  /* render loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = S.current;

    let w = 1;
    let h = 1;
    let dpr = 1;
    let raf = 0;
    let alive = true;
    let frameN = 0;
    const t0 = performance.now();
    let prev = t0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(r.width, 1);
      h = Math.max(r.height, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const fam = getComputedStyle(canvas).fontFamily;

    /* dots (plain grid first, then upgraded once the texture is loaded) */
    let D = buildDots(null);
    const tryLoad = (i: number) => {
      if (i >= TEXTURES.length || !alive) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (alive) D = buildDots(img);
      };
      img.onerror = () => tryLoad(i + 1);
      img.src = TEXTURES[i];
    };
    tryLoad(0);

    /* arcs from home to other cities (precomputed unit vectors with altitude) */
    const home = {
      x: Math.cos(HOME.lat * D2R) * Math.sin(HOME.lon * D2R),
      y: Math.sin(HOME.lat * D2R),
      z: Math.cos(HOME.lat * D2R) * Math.cos(HOME.lon * D2R),
    };
    const arcs = ARC_TARGETS.map((id, idx) => {
      const c = CITY[id];
      const bx = Math.cos(c.lat * D2R) * Math.sin(c.lon * D2R);
      const by = Math.sin(c.lat * D2R);
      const bz = Math.cos(c.lat * D2R) * Math.cos(c.lon * D2R);
      const om = Math.acos(clamp(home.x * bx + home.y * by + home.z * bz, -1, 1));
      const n = 56;
      const pts: number[] = [];
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const s1 = Math.sin((1 - k) * om) / Math.sin(om);
        const s2 = Math.sin(k * om) / Math.sin(om);
        const alt = 1 + 0.32 * Math.sin(Math.PI * k) * Math.min(1, om / 1.2);
        pts.push((s1 * home.x + s2 * bx) * alt, (s1 * home.y + s2 * by) * alt, (s1 * home.z + s2 * bz) * alt);
      }
      return { n, pts, off: idx * 0.17 };
    });

    /* per-frame geometry */
    let cx = 0;
    let cy = 0;
    let R = 1;
    let cl = 1;
    let sl = 0;
    let cp = 1;
    let sp = 0;
    let X1 = 0;
    let Y2 = 0;
    let PX = 0;
    let PY = 0;
    let PZ = 0;
    const rot3 = (x: number, y: number, z: number) => {
      const x1 = x * cl - z * sl;
      const z1 = x * sl + z * cl;
      const y2 = y * cp - z1 * sp;
      const z2 = y * sp + z1 * cp;
      X1 = x1;
      Y2 = y2;
      PX = cx + R * x1;
      PY = cy - R * y2;
      PZ = z2;
    };
    const proj = (lat: number, lon: number, r: number) => {
      const c2 = Math.cos(lat);
      rot3(c2 * Math.sin(lon) * r, Math.sin(lat) * r, c2 * Math.cos(lon) * r);
    };
    const vis = () => PZ > 0.02 || X1 * X1 + Y2 * Y2 > 1.012;

    const Lx = -0.52;
    const Ly = 0.5;
    const Lz = 0.69;
    const lsx = -0.72; // screen-space direction to sun (y down)
    const lsy = -0.69;

    const hits: { c: City; x: number; y: number; z: number }[] = [];
    let curCursor = "";

    /* pointer interaction */
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      s.drag = true;
      s.moved = 0;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.vl = 0;
      s.vp = 0;
      s.tl = null;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
    };
    const move = (e: PointerEvent) => {
      const p = pos(e);
      s.px = p.x;
      s.py = p.y;
      s.mx = p.x / w;
      s.my = p.y / h;
      if (s.drag) {
        const dx = e.clientX - s.lastX;
        const dy = e.clientY - s.lastY;
        s.lastX = e.clientX;
        s.lastY = e.clientY;
        s.moved += Math.abs(dx) + Math.abs(dy);
        const k = 1 / Math.max(R, 1);
        s.lam -= dx * k;
        s.phi += dy * k;
        s.vl = -dx * k * 0.9;
        s.vp = dy * k * 0.9;
        s.last = performance.now();
      }
    };
    const up = (e: PointerEvent, cancel: boolean) => {
      if (!s.drag) return;
      s.drag = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
      if (!cancel && s.moved < 6 && s.hover) live.current.onFocus(s.hover);
    };
    const onUp = (e: PointerEvent) => up(e, false);
    const onCancel = (e: PointerEvent) => up(e, true);
    const leave = () => {
      s.px = -999;
      s.py = -999;
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", leave);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - prev) / 16.667, 0, 3);
      prev = now;
      frameN++;
      const L = live.current;
      const t = Math.max(0, (now - t0) / 1000);
      const mode = L.mode;

      /* intro */
      const ip = L.reduced ? 1 : clamp((now - t0 - L.introMs * 0.4) / 2800, 0, 1);
      const ie = 1 - Math.pow(1 - ip, 3);

      /* mode blending + camera push-in */
      s.mh += ((mode === "heat" ? 1 : 0) - s.mh) * 0.045 * dt;
      s.mg += ((mode === "green" ? 1 : 0) - s.mg) * 0.045 * dt;
      s.mc += ((mode === "cells" ? 1 : 0) - s.mc) * 0.045 * dt;
      const tz = mode === "cells" ? 1.38 : mode === "base" ? 1 : 1.06;
      s.zoom += (tz - s.zoom) * 0.05 * dt;

      /* rotation physics */
      if (!s.drag) {
        s.lam += s.vl * dt;
        s.phi += s.vp * dt;
        const dec = Math.pow(0.94, dt);
        s.vl *= dec;
        s.vp *= dec;
        if (s.tl !== null) {
          const dl = wrapPi(s.tl - s.lam);
          const dp = s.tp - s.phi;
          const k = 1 - Math.pow(1 - 0.055, dt);
          s.lam += dl * k;
          s.phi += dp * k;
          if (Math.abs(dl) < 0.0015 && Math.abs(dp) < 0.0015) s.tl = null;
        } else if (L.auto && !L.reduced && !s.hover && now - s.last > 2200) {
          s.lam += 0.0007 * dt;
        }
      }
      s.phi = clamp(s.phi, -1.25, 1.25);
      s.lam = wrapPi(s.lam);
      s.ox += ((s.mx - 0.5) * -18 - s.ox) * 0.05 * dt;
      s.oy += ((s.my - 0.5) * -12 - s.oy) * 0.05 * dt;

      /* geometry */
      const narrow = w < 1024;
      const baseR = narrow ? Math.min(w * 0.4, h * 0.3) : Math.min(h * 0.4, w * 0.29);
      cx = (narrow ? w * 0.5 : w * 0.69) + s.ox;
      cy = (narrow ? h * 0.4 : h * 0.5) + s.oy;
      R = baseR * s.zoom * lerp(0.55, 1, ie);
      cl = Math.cos(s.lam);
      sl = Math.sin(s.lam);
      cp = Math.cos(s.phi);
      sp = Math.sin(s.phi);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = ie * (narrow ? 0.6 : 1);

      const mh = s.mh;
      const mg = s.mg;
      const mc = s.mc;
      let ar = lerp(46, 255, mh);
      let ag = lerp(230, 140, mh);
      let ab = lerp(197, 70, mh);
      ar = lerp(ar, 90, mg);
      ag = lerp(ag, 255, mg);
      ab = lerp(ab, 150, mg);
      const ac = `${ar | 0},${ag | 0},${ab | 0}`;

      /* ── sun lens flare (behind everything) ── */
      {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const fx = cx - R * 1.5;
        const fy = cy - R * 1.25;
        const pulse = 0.85 + 0.15 * Math.sin(t * 1.3);
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 0.5);
        g.addColorStop(0, `rgba(255,244,220,${0.55 * pulse})`);
        g.addColorStop(0.2, `rgba(255,200,140,${0.18 * pulse})`);
        g.addColorStop(1, "rgba(255,160,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(fx - R * 0.5, fy - R * 0.5, R, R);
        const sg = ctx.createLinearGradient(fx - R * 1.3, 0, fx + R * 1.3, 0);
        sg.addColorStop(0, "rgba(150,200,255,0)");
        sg.addColorStop(0.5, `rgba(220,240,255,${0.3 * pulse})`);
        sg.addColorStop(1, "rgba(150,200,255,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(fx - R * 1.3, fy - 1.2, R * 2.6, 2.4);
        for (const k of [0.38, 0.62, 0.8]) {
          const gx = fx + (cx - fx) * k;
          const gy = fy + (cy - fy) * k;
          ctx.fillStyle = `rgba(${ac},${0.05 * pulse})`;
          ctx.beginPath();
          ctx.arc(gx, gy, R * (0.03 + k * 0.05), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      /* ── HUD rings ── */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.03);
      ctx.strokeStyle = "rgba(150,230,255,.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const rr = R * 1.13;
      for (let i = 0; i < 120; i++) {
        const a = (i * TAU) / 120;
        const len = i % 10 === 0 ? 9 : i % 5 === 0 ? 6 : 3;
        ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        ctx.lineTo(Math.cos(a) * (rr + len), Math.sin(a) * (rr + len));
      }
      ctx.stroke();
      ctx.rotate(-t * 0.07);
      ctx.setLineDash([2, 10]);
      ctx.strokeStyle = "rgba(150,230,255,.12)";
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.27, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      /* ── atmosphere ── */
      {
        const halo = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 2.3);
        halo.addColorStop(0, `rgba(${ac},.16)`);
        halo.addColorStop(1, `rgba(${ac},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 2.3, 0, TAU);
        ctx.fill();
        const g = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.4);
        g.addColorStop(0, `rgba(${ac},.6)`);
        g.addColorStop(0.2, `rgba(${ac},.22)`);
        g.addColorStop(1, `rgba(${ac},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.4, 0, TAU);
        ctx.fill();
      }

      /* ── moon (orbit + body), far half behind the globe ── */
      const ma = t * 0.22 + 1.0;
      const mr = R * 1.62;
      const inc = 0.42;
      const mxp = Math.cos(ma) * mr;
      const myp = -Math.sin(ma) * Math.sin(inc) * mr;
      const mzp = Math.sin(ma) * Math.cos(inc) * mr;
      const moonFront = mzp > 0;
      const drawOrbit = (front: boolean) => {
        ctx.strokeStyle = "rgba(180,210,255,.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const a = (front ? 0 : Math.PI) + (i / 60) * Math.PI;
          const x = cx + Math.cos(a) * mr;
          const y = cy + Math.sin(a) * Math.sin(inc) * mr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      const drawMoon = () => {
        const sz = R * 0.085 * (0.85 + 0.3 * (mzp / mr * 0.5 + 0.5));
        drawBall(ctx, cx + mxp, cy - myp, sz, ["#f4f6f9", "#9aa0ab", "#2a2e38"], lsx, lsy);
      };
      drawOrbit(false);
      if (!moonFront) drawMoon();

      /* ── sphere base ── */
      {
        const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 1.05);
        g.addColorStop(0, "#12305a");
        g.addColorStop(0.5, "#08172e");
        g.addColorStop(1, "#030813");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();
      }

      /* ── clipped surface ── */
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();

      // graticule
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = "rgba(120,200,230,.10)";
      ctx.beginPath();
      for (let lon = -180; lon < 180; lon += 30) {
        let pen = false;
        for (let lat = -90; lat <= 90; lat += 6) {
          proj(lat * D2R, lon * D2R, 1);
          if (PZ > 0) {
            if (pen) ctx.lineTo(PX, PY);
            else ctx.moveTo(PX, PY);
            pen = true;
          } else pen = false;
        }
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        let pen = false;
        for (let lon = -180; lon <= 180; lon += 6) {
          proj(lat * D2R, lon * D2R, 1);
          if (PZ > 0) {
            if (pen) ctx.lineTo(PX, PY);
            else ctx.moveTo(PX, PY);
            pen = true;
          } else pen = false;
        }
      }
      ctx.stroke();

      // dots
      const dsz = Math.max(0.7, R / 330);
      const hm = Math.max(mh, mc * 0.45);
      for (let k = 0; k < D.n; k++) {
        const x = D.ux[k];
        const y = D.uy[k];
        const z = D.uz[k];
        const x1 = x * cl - z * sl;
        const z1 = x * sl + z * cl;
        const y2 = y * cp - z1 * sp;
        const z2 = y * sp + z1 * cp;
        if (z2 <= 0.02) continue;
        const sx = cx + R * x1;
        const sy = cy - R * y2;
        const lit = x1 * Lx + y2 * Ly + z2 * Lz;
        const limb = Math.min(1, z2 * 2.4);
        if (D.kind[k] === 0) {
          const a = (0.07 + 0.16 * Math.max(lit, 0)) * limb;
          ctx.fillStyle = `rgba(70,150,210,${a.toFixed(3)})`;
          const sz = 0.75 * dsz;
          ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
          continue;
        }
        const gr = D.gr[k];
        let r = 150;
        let g = 238;
        let b = 226;
        if (hm > 0.001) {
          const hz = clamp(0.3 + 0.62 * Math.pow(Math.cos(D.lat[k]), 1.4) - 0.55 * gr + (D.rn[k] - 0.5) * 0.3, 0, 1);
          r = lerp(r, 255, hm);
          g = lerp(g, lerp(205, 70, hz), hm);
          b = lerp(b, lerp(100, 45, hz), hm);
        }
        if (mg > 0.001) {
          r = lerp(r, lerp(105, 60, gr), mg);
          g = lerp(g, lerp(150, 240, gr), mg);
          b = lerp(b, lerp(165, 120, gr), mg);
        }
        let a = (0.16 + 0.84 * Math.pow(Math.max(lit, 0), 0.7)) * limb;
        a *= 0.88 + 0.12 * Math.sin(t * 1.6 + D.rn[k] * 40);
        ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
        const sz = (0.9 + 1.0 * z2) * dsz;
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      }

      // H3-style cells around home
      if (mc > 0.01) {
        const size = 1.15;
        const lat0 = HOME.lat;
        const lon0 = HOME.lon;
        for (const hx of HEXES) {
          const ra = clamp(mc * 1.9 - hx.ring * 0.24, 0, 1);
          if (ra <= 0) continue;
          const latC = lat0 + size * 1.5 * hx.r;
          const lonC = lon0 + (size * Math.sqrt(3) * (hx.q + hx.r / 2)) / Math.cos(lat0 * D2R);
          proj(latC * D2R, lonC * D2R, 1);
          if (PZ < 0.1) continue;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ang = (60 * i - 30) * D2R;
            const la = latC + size * 0.96 * Math.sin(ang);
            const lo = lonC + (size * 0.96 * Math.cos(ang)) / Math.cos(latC * D2R);
            proj(la * D2R, lo * D2R, 1.002);
            if (i === 0) ctx.moveTo(PX, PY);
            else ctx.lineTo(PX, PY);
          }
          ctx.closePath();
          const hh = hx.h;
          const cr = hh < 0.5 ? lerp(46, 255, hh * 2) : 255;
          const cg = hh < 0.5 ? lerp(230, 190, hh * 2) : lerp(190, 70, (hh - 0.5) * 2);
          const cb = hh < 0.5 ? lerp(197, 90, hh * 2) : lerp(90, 50, (hh - 0.5) * 2);
          ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(0.32 * ra).toFixed(3)})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(150,255,235,${(0.55 * ra).toFixed(3)})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }

      // day / night terminator
      {
        const gx = cx + Lx * R * 0.55;
        const gy = cy - Ly * R * 0.55;
        const g = ctx.createRadialGradient(gx, gy, R * 0.15, gx, gy, R * 1.55);
        g.addColorStop(0, "rgba(2,6,18,0)");
        g.addColorStop(0.55, "rgba(2,6,18,.16)");
        g.addColorStop(1, "rgba(2,6,18,.82)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        const rim = ctx.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
        rim.addColorStop(0, `rgba(${ac},0)`);
        rim.addColorStop(1, `rgba(${ac},.34)`);
        ctx.fillStyle = rim;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
      ctx.restore();

      /* ── arcs ── */
      {
        const arcA = 1 - Math.max(mh, mg) * 0.8;
        if (arcA > 0.02) {
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = `rgba(255,170,90,${(0.34 * arcA).toFixed(3)})`;
          for (const a of arcs) {
            ctx.beginPath();
            let pen = false;
            for (let i = 0; i < a.n; i++) {
              rot3(a.pts[i * 3], a.pts[i * 3 + 1], a.pts[i * 3 + 2]);
              if (vis()) {
                if (pen) ctx.lineTo(PX, PY);
                else ctx.moveTo(PX, PY);
                pen = true;
              } else pen = false;
            }
            ctx.stroke();
            // travelling pulse
            const tt = (t * 0.16 + a.off) % 1;
            const fi = tt * (a.n - 1);
            const i0 = Math.floor(fi);
            const fr = fi - i0;
            const i1 = Math.min(a.n - 1, i0 + 1);
            const ix = lerp(a.pts[i0 * 3], a.pts[i1 * 3], fr);
            const iy = lerp(a.pts[i0 * 3 + 1], a.pts[i1 * 3 + 1], fr);
            const iz = lerp(a.pts[i0 * 3 + 2], a.pts[i1 * 3 + 2], fr);
            rot3(ix, iy, iz);
            if (vis()) {
              const g = ctx.createRadialGradient(PX, PY, 0, PX, PY, 8);
              g.addColorStop(0, `rgba(255,230,190,${0.95 * arcA})`);
              g.addColorStop(1, "rgba(255,160,80,0)");
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(PX, PY, 8, 0, TAU);
              ctx.fill();
            }
          }
        }
      }

      /* ── city markers ── */
      hits.length = 0;
      for (const c of CITIES) {
        proj(c.lat * D2R, c.lon * D2R, 1.0);
        if (PZ < 0.05) continue;
        hits.push({ c, x: PX, y: PY, z: PZ });
      }
      for (const hit of hits) {
        const c = hit.c;
        const isHover = s.hover === c;
        const isFocus = L.focusId === c.id;
        const baseSz = (c.home ? 4.6 : 3.2) * (R / 380 + 0.4);
        const fade = clamp(hit.z * 3, 0.15, 1);
        // pulse rings
        const ph = (((t * 0.8 + c.lat * 0.05) % 1) + 1) % 1;
        ctx.strokeStyle = `rgba(255,160,80,${(0.55 * (1 - ph) * fade).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, baseSz + ph * (c.home ? 24 : 14), 0, TAU);
        ctx.stroke();
        if (c.home) {
          const ph2 = (t * 0.8 + 0.5) % 1;
          ctx.strokeStyle = `rgba(255,160,80,${(0.4 * (1 - ph2) * fade).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(hit.x, hit.y, baseSz + ph2 * 24, 0, TAU);
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, baseSz * 4);
        g.addColorStop(0, `rgba(255,150,70,${(0.55 * fade).toFixed(3)})`);
        g.addColorStop(1, "rgba(255,150,70,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, baseSz * 4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,175,105,${fade.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, baseSz * (isHover ? 1.35 : 1), 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,240,225,${(0.9 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(hit.x, hit.y, baseSz * 0.42, 0, TAU);
        ctx.fill();
        if (isHover || isFocus || c.home) {
          ctx.font = `500 11px ${fam}`;
          ctx.fillStyle = `rgba(235,245,255,${((isHover || isFocus ? 0.95 : 0.6) * fade).toFixed(3)})`;
          ctx.fillText(c.name, hit.x + baseSz + 8, hit.y + 4);
        }
      }

      /* hover detection */
      let best: City | null = null;
      let bd = 18 * 18;
      if (!s.drag && s.px > -100) {
        for (const hit of hits) {
          if (hit.z < 0.2) continue;
          const d = (hit.x - s.px) ** 2 + (hit.y - s.py) ** 2;
          if (d < bd) {
            bd = d;
            best = hit.c;
          }
        }
      }
      if (best !== s.hover) {
        s.hover = best;
        setHoverCity(best);
      }
      const cur = s.drag ? "grabbing" : s.hover ? "pointer" : "grab";
      if (cur !== curCursor) {
        curCursor = cur;
        canvas.style.cursor = cur;
      }
      const tip = tipRef.current;
      if (tip && s.hover) {
        const hh = hits.find((q) => q.c === s.hover);
        if (hh) tip.style.transform = `translate(${hh.x + 16}px, ${hh.y - 14}px)`;
      }

      /* ── near-side moon, in front of the globe ── */
      drawOrbit(true);
      if (moonFront) drawMoon();

      /* HUD readout */
      if (frameN % 3 === 0) {
        const la = s.phi / D2R;
        const lo = wrapPi(s.lam) / D2R;
        if (latRef.current) latRef.current.textContent = `${Math.abs(la).toFixed(2)}° ${la >= 0 ? "N" : "S"}`;
        if (lonRef.current) lonRef.current.textContent = `${Math.abs(lo).toFixed(2)}° ${lo >= 0 ? "E" : "W"}`;
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="num absolute inset-0 h-full w-full"
        style={{ touchAction: "pan-y", cursor: "grab" }}
        aria-label="Interactive globe. Drag to rotate, select a marker to fly to a city."
      />
      <div
        ref={tipRef}
        className="tip pointer-events-none absolute left-0 top-0 z-10"
        style={{ opacity: hoverCity ? 1 : 0 }}
      >
        {hoverCity && (
          <div className="tip-card">
            <p className="display text-lg leading-tight text-white">{hoverCity.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">{hoverCity.country}</p>
            <p className="num mt-2 text-[11px] text-slate-300">
              {Math.abs(hoverCity.lat).toFixed(3)}° {hoverCity.lat >= 0 ? "N" : "S"} ·{" "}
              {Math.abs(hoverCity.lon).toFixed(3)}° {hoverCity.lon >= 0 ? "E" : "W"}
            </p>
            <p className="mt-2 text-[11px] text-[#5ff0d6]">
              {hoverCity.home ? "Live study area" : "Reference city"} · click to fly here
            </p>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute right-5 top-24 hidden text-right sm:block">
        <p className="text-[11px] text-slate-500">Centre of view</p>
        <p className="num mt-1 text-sm text-slate-200">
          <span ref={latRef}>13.08° N</span>
          <span className="mx-2 text-slate-600">/</span>
          <span ref={lonRef}>80.27° E</span>
        </p>
        <p className="mt-2 text-[11px] text-slate-500">
          Layer: <span className="text-[#5ff0d6]">{MODE_LABEL[mode]}</span>
        </p>
      </div>
    </div>
  );
}

/* ═════════════════════════ UI pieces ═════════════════════════ */

function Title({ text, on, className = "" }: { text: string; on: boolean; className?: string }) {
  return (
    <h2 className={`display ${className}`}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="mask">
          <span
            className="mask-in"
            style={{
              transform: on ? "none" : "translateY(112%)",
              transition: `transform 1.1s cubic-bezier(.16,1,.3,1) ${on ? i * 70 : 0}ms`,
            }}
          >
            {w}
          </span>
        </span>
      ))}
    </h2>
  );
}

function Fade({ on, delay = 350, children, className = "" }: { on: boolean; delay?: number; children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? "none" : "translateY(18px)",
        filter: on ? "none" : "blur(6px)",
        transition: `opacity 1s cubic-bezier(.16,1,.3,1) ${on ? delay : 0}ms, transform 1s cubic-bezier(.16,1,.3,1) ${on ? delay : 0}ms, filter 1s cubic-bezier(.16,1,.3,1) ${on ? delay : 0}ms`,
      }}
    >
      {children}
    </div>
  );
}

function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="inline-block"
      style={{ transition: "transform .45s cubic-bezier(.16,1,.3,1)" }}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.22}px, ${y * 0.3}px)`;
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
    >
      {children}
    </div>
  );
}

/* ═════════════════════════ Page ═════════════════════════ */

const COPY = [
  null,
  {
    title: "The surface remembers the heat.",
    body: "Satellites read land surface temperature one pixel at a time. Concrete, rail yards and bare roofs keep the day’s heat long after the sun has moved on, often running 10°C or more above shaded ground.",
    note: "Orange means hotter ground. Notice how bare land burns first.",
  },
  {
    title: "Green is the cheapest cooling.",
    body: "NDVI scores how green a pixel is, from close to 0 over concrete up toward 1 over dense canopy. The hottest cells in Chennai sit near 0.2, which is exactly where trees would help most.",
    note: "Brighter green means more vegetation.",
  },
  {
    title: "Down to a single hexagon.",
    body: "Every neighbourhood becomes a grid of H3 cells, each with its own temperature and vegetation score. Rank them, pick the worst, and test what a cooler street would change.",
    note: "Cells appear around Chennai, coloured from cool teal to hot red.",
  },
] as const;

export default function DiscoverPage() {
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [introMs, setIntroMs] = useState(0);
  const [curtain, setCurtain] = useState(false);
  const [active, setActive] = useState(0);
  const [focus, setFocus] = useState<{ city: City; n: number }>({ city: HOME, n: 0 });

  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const activeRef = useRef(0);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem("tp-discover-intro") === "1";
      if (!rm && !seen) sessionStorage.setItem("tp-discover-intro", "1");
    } catch {}
    setReduced(rm);
    if (!rm && !seen) {
      setIntroMs(2400);
      setCurtain(true);
      setTimeout(() => setCurtain(false), 4400);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    const els = panelRefs.current.filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = Number((e.target as HTMLElement).dataset.i);
          if (i === activeRef.current) return;
          activeRef.current = i;
          setActive(i);
          setFocus((prev) => ({ city: CITY[PANELS[i].city], n: prev.n + 1 }));
        });
      },
      { threshold: 0.55 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const scrollToPanel = (i: number) =>
    panelRefs.current[i]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  const flyTo = (c: City) => setFocus((p) => ({ city: c, n: p.n + 1 }));
  const mode = PANELS[active].mode;

  const headline = "Every city tells a story. Discover what lies beneath.".split(" ");

  return (
    <main
      className={`${display.variable} ${bodyFont.variable} ${mono.variable} dsc relative min-h-screen overflow-x-clip bg-[#030611] text-slate-100 ${mounted ? "is-ready" : ""}`}
      style={{ ["--intro" as string]: `${introMs}ms` }}
    >
      <style>{CSS}</style>

      {/* nebula, tinted by the active layer */}
      <div className="nebula nebula-base" aria-hidden />
      <div className="nebula nebula-heat" style={{ opacity: mode === "heat" ? 1 : 0 }} aria-hidden />
      <div className="nebula nebula-green" style={{ opacity: mode === "green" ? 1 : 0 }} aria-hidden />
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />

      {mounted && <Universe reduced={reduced} />}

      {/* cinematic curtain (first visit per session) */}
      {curtain && (
        <div className="curtain" aria-hidden>
          <div className="curtain-top" />
          <div className="curtain-bottom" />
          <div className="curtain-line" />
          <div className="curtain-mark display">
            Terrapulse
            <span>Urban heat intelligence</span>
          </div>
        </div>
      )}

      <div className="relative">
        {/* sticky stage: the Earth */}
        <div className="sticky top-0 z-[1] h-screen w-full">
          {mounted && (
            <Earth mode={mode} focus={focus} onFocus={flyTo} reduced={reduced} auto={active === 0} introMs={introMs} />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex items-center justify-center gap-3 lg:justify-end lg:pr-12">
            <span className="hidden text-xs text-slate-500 xl:block">Fly to</span>
            <div className="chips pointer-events-auto flex max-w-full gap-2 overflow-x-auto px-4 lg:max-w-[640px] lg:px-0">
              {CITIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => flyTo(c)}
                  className={`chip ${focus.city.id === c.id ? "chip-active" : ""}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* story panels over the stage */}
        <div className="pointer-events-none relative z-10 -mt-[100vh]">
          {/* hero */}
          <section
            ref={(el) => {
              panelRefs.current[0] = el;
            }}
            data-i={0}
            className="flex min-h-screen items-center px-6 pb-24 pt-28 md:px-12 lg:px-16"
          >
            <div className="relative w-full max-w-[760px] px-2 py-10 sm:px-10 sm:py-14">
              <span className="bracket bracket-tl" />
              <span className="bracket bracket-tr" />
              <span className="bracket bracket-bl" />
              <span className="bracket bracket-br" />

              <p className="hero-in" style={{ animationDelay: "calc(var(--intro) + 150ms)" }}>
                <span className="type num text-sm text-[#5ff0d6]">13.0827° N · 80.2707° E</span>
              </p>

              <h1 className="display mt-6 text-[clamp(2.5rem,6.3vw,5.8rem)] font-light leading-[1.02] tracking-[-0.02em] text-white">
                {headline.map((w, i) => (
                  <span key={i} className="mask">
                    <span
                      className="word"
                      style={{ animationDelay: `calc(var(--intro) + ${350 + i * 85}ms)` }}
                    >
                      {w}
                    </span>
                  </span>
                ))}
              </h1>

              <p
                className="hero-in mt-8 max-w-md text-[15px] leading-relaxed text-slate-400"
                style={{ animationDelay: "calc(var(--intro) + 1200ms)" }}
              >
                Drag the globe, hover a marker, or pick a city below and watch it fly there.
              </p>

              <div
                className="hero-in pointer-events-auto mt-10 flex flex-wrap items-center gap-5"
                style={{ animationDelay: "calc(var(--intro) + 1400ms)" }}
              >
                <Magnetic>
                  <Link href="/explore" className="btn-main">
                    Enter the live map
                  </Link>
                </Magnetic>
                <Magnetic>
                  <button onClick={() => scrollToPanel(1)} className="btn-ghost">
                    Explore the planet
                    <span className="btn-arrow">↓</span>
                  </button>
                </Magnetic>
              </div>
            </div>

            <div
              className="hero-in absolute bottom-8 left-6 flex items-center gap-3 text-xs text-slate-500 md:left-12 lg:left-16"
              style={{ animationDelay: "calc(var(--intro) + 1900ms)" }}
            >
              <span className="relative block h-9 w-px overflow-hidden bg-white/10">
                <span className="scroll-dot" />
              </span>
              Scroll to explore
            </div>
          </section>

          {/* layer panels */}
          {[1, 2, 3].map((i) => {
            const c = COPY[i]!;
            const on = active === i;
            return (
              <section
                key={i}
                id={i === 1 ? "planet" : undefined}
                ref={(el) => {
                  panelRefs.current[i] = el;
                }}
                data-i={i}
                className="flex min-h-screen items-center px-6 md:px-12 lg:px-16"
              >
                <div className="max-w-[520px] rounded-3xl max-lg:bg-[#030611]/55 max-lg:p-6 max-lg:backdrop-blur-sm">
                  <div className="text-sm text-[#5ff0d6]">
  <Fade on={on} delay={0}>
    Layer: {MODE_LABEL[PANELS[i].mode]}
  </Fade>
</div>
                  <Title
                    text={c.title}
                    on={on}
                    className="mt-4 text-[clamp(2.2rem,4.8vw,4.3rem)] font-light leading-[1.05] tracking-[-0.015em] text-white"
                  />
                  <Fade on={on} delay={450} className="mt-7">
                    <p className="max-w-md text-[16px] leading-[1.75] text-slate-300">{c.body}</p>
                    <p className="mt-5 flex items-center gap-3 text-[13px] text-slate-500">
                      <span className="h-px w-8 bg-[#5ff0d6]/50" />
                      {c.note}
                    </p>
                  </Fade>

                  {i === 3 && (
                    <Fade on={on} delay={700} className="pointer-events-auto mt-10">
                      <div className="flex flex-wrap items-center gap-5">
                        <Magnetic>
                          <Link href="/explore" className="btn-main">
                            Enter the live map
                          </Link>
                        </Magnetic>
                        <Magnetic>
                          <Link href="/scenarios" className="btn-ghost">
                            Run a cooling scenario
                          </Link>
                        </Magnetic>
                      </div>
                      <Link
                        href="/insights"
                        className="mt-7 inline-block text-sm text-slate-400 underline decoration-white/20 underline-offset-4 transition-colors hover:text-[#5ff0d6] hover:decoration-[#5ff0d6]/60"
                      >
                        Read the insights first
                      </Link>
                    </Fade>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* progress rail */}
      <nav
        aria-label="Sections"
        className="fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-end gap-5 md:flex"
      >
        {PANELS.map((p, i) => (
          <button key={p.label} onClick={() => scrollToPanel(i)} className="group flex items-center gap-3" aria-label={p.label}>
            <span
              className={`num text-[11px] transition-all duration-500 ${
                active === i ? "translate-x-0 text-[#5ff0d6] opacity-100" : "translate-x-2 text-slate-400 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
              }`}
            >
              {p.label}
            </span>
            <span className={`rail-dot ${active === i ? "on" : ""}`} />
          </button>
        ))}
      </nav>
    </main>
  );
}

/* ═════════════════════════ Styles ═════════════════════════ */

const CSS = `
.dsc { font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.dsc .display { font-family: var(--font-display), Georgia, serif; font-optical-sizing: auto; }
.dsc .num { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.dsc ::selection { background: rgba(46,230,197,.3); }

/* atmosphere layers */
.dsc .nebula { position: fixed; inset: -10%; z-index: 0; pointer-events: none; mix-blend-mode: screen; transition: opacity 1.8s ease; will-change: transform, opacity; }
.dsc .nebula-base { background:
  radial-gradient(40% 35% at 18% 22%, rgba(88,64,200,.20), transparent 70%),
  radial-gradient(45% 40% at 85% 75%, rgba(20,120,170,.18), transparent 70%),
  radial-gradient(30% 30% at 60% 10%, rgba(46,230,197,.08), transparent 70%);
  animation: nebula 60s ease-in-out infinite alternate; }
.dsc .nebula-heat { background:
  radial-gradient(45% 40% at 72% 50%, rgba(255,110,50,.22), transparent 70%),
  radial-gradient(35% 30% at 15% 80%, rgba(190,50,40,.14), transparent 70%);
  animation: nebula 40s ease-in-out infinite alternate-reverse; }
.dsc .nebula-green { background:
  radial-gradient(45% 40% at 72% 50%, rgba(60,230,140,.20), transparent 70%),
  radial-gradient(35% 30% at 15% 80%, rgba(20,150,120,.14), transparent 70%);
  animation: nebula 45s ease-in-out infinite alternate; }
@keyframes nebula { from { transform: translate3d(-2%, -1%, 0) scale(1) rotate(0deg); } to { transform: translate3d(2%, 2%, 0) scale(1.12) rotate(4deg); } }
.dsc .vignette { position: fixed; inset: 0; z-index: 3; pointer-events: none; background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(1,3,10,.75) 100%); }
.dsc .grain { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }

/* curtain intro */
.dsc .curtain { position: fixed; inset: 0; z-index: 80; pointer-events: none; }
.dsc .curtain-top, .dsc .curtain-bottom { position: absolute; left: 0; right: 0; height: 50.3%; background: #02040c; animation: curtainOpen 1.6s cubic-bezier(.76,0,.24,1) 1.9s forwards; }
.dsc .curtain-top { top: 0; --to: -101%; }
.dsc .curtain-bottom { bottom: 0; --to: 101%; }
@keyframes curtainOpen { to { transform: translateY(var(--to)); } }
.dsc .curtain-line { position: absolute; left: 50%; top: 50%; height: 1px; width: 0; transform: translate(-50%, -50%); background: linear-gradient(90deg, transparent, #5ff0d6, transparent); animation: lineGrow 1.4s cubic-bezier(.16,1,.3,1) .2s forwards, lineFade .5s ease 1.8s forwards; }
@keyframes lineGrow { to { width: min(520px, 70vw); } }
@keyframes lineFade { to { opacity: 0; } }
.dsc .curtain-mark { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff; font-weight: 300; font-size: clamp(1.6rem, 4vw, 2.6rem); letter-spacing: .5em; padding-left: .5em; opacity: 0; animation: markIn 2.2s ease .5s forwards; white-space: nowrap; }
.dsc .curtain-mark span { display: block; margin-top: 1rem; font-family: var(--font-body), sans-serif; font-size: .72rem; letter-spacing: .3em; color: #7a869c; }
@keyframes markIn { 0% { opacity: 0; letter-spacing: .9em; } 30% { opacity: 1; letter-spacing: .5em; } 75% { opacity: 1; } 100% { opacity: 0; } }

/* hero entrance (starts once mounted, after the curtain delay) */
.dsc .hero-in { opacity: 0; }
.dsc.is-ready .hero-in { animation: heroIn 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes heroIn { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
.dsc .mask { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: .14em; margin-bottom: -.14em; margin-right: .22em; }
.dsc .mask-in { display: inline-block; will-change: transform; }
.dsc .word { display: inline-block; transform: translateY(112%) rotate(3deg); }
.dsc.is-ready .word { animation: wordUp 1.15s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes wordUp { to { transform: none; } }

/* typewriter coordinates */
.dsc .type { display: inline-block; overflow: hidden; white-space: nowrap; width: 0; letter-spacing: .2em; border-right: 1px solid #5ff0d6; vertical-align: bottom; }
.dsc.is-ready .type { animation: typing 1.7s steps(23) calc(var(--intro) + 300ms) forwards, caret .8s step-end calc(var(--intro) + 300ms) 4; }
@keyframes typing { to { width: calc(23 * (1ch + .2em)); } }
@keyframes caret { 50% { border-color: transparent; } }

/* corner brackets draw in */
.dsc .bracket { position: absolute; width: 30px; height: 30px; border: 0 solid rgba(46,230,197,.75); opacity: 0; }
.dsc.is-ready .bracket { animation: bracketIn 1s cubic-bezier(.16,1,.3,1) calc(var(--intro) + 100ms) forwards; }
.dsc .bracket-tl { left: 0; top: 0; border-left-width: 1px; border-top-width: 1px; --fx: 10px; --fy: 10px; }
.dsc .bracket-tr { right: 0; top: 0; border-right-width: 1px; border-top-width: 1px; --fx: -10px; --fy: 10px; }
.dsc .bracket-bl { left: 0; bottom: 0; border-left-width: 1px; border-bottom-width: 1px; --fx: 10px; --fy: -10px; }
.dsc .bracket-br { right: 0; bottom: 0; border-right-width: 1px; border-bottom-width: 1px; --fx: -10px; --fy: -10px; }
@keyframes bracketIn { from { opacity: 0; transform: translate(var(--fx), var(--fy)); } to { opacity: 1; transform: none; } }

.dsc .scroll-dot { position: absolute; left: 0; top: 0; width: 1px; height: 14px; background: #5ff0d6; animation: dot 2s cubic-bezier(.65,0,.35,1) infinite; }
@keyframes dot { 0% { transform: translateY(-14px); } 100% { transform: translateY(40px); } }

/* buttons */
.dsc .btn-main { position: relative; overflow: hidden; display: inline-block; padding: 1rem 2.1rem; border-radius: 9999px; font-weight: 600; font-size: .95rem; color: #04121a;
  background: linear-gradient(135deg, #7ff5df, #2ee6c5); box-shadow: 0 12px 44px -12px rgba(46,230,197,.65); transition: box-shadow .35s, transform .35s cubic-bezier(.34,1.56,.64,1); }
.dsc .btn-main::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%); transform: translateX(-120%); transition: transform .9s cubic-bezier(.16,1,.3,1); }
.dsc .btn-main:hover { box-shadow: 0 20px 56px -10px rgba(46,230,197,.85); transform: scale(1.03); }
.dsc .btn-main:hover::after { transform: translateX(120%); }
.dsc .btn-ghost { display: inline-flex; align-items: center; gap: .6rem; padding: 1rem 1.8rem; border-radius: 9999px; font-weight: 500; font-size: .95rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,.16);
  background: rgba(255,255,255,.02); backdrop-filter: blur(8px); cursor: pointer; transition: color .3s, border-color .3s, background .3s; }
.dsc .btn-ghost:hover { color: #fff; border-color: rgba(95,240,214,.6); background: rgba(95,240,214,.06); }
.dsc .btn-arrow { display: inline-block; transition: transform .4s cubic-bezier(.34,1.56,.64,1); }
.dsc .btn-ghost:hover .btn-arrow { transform: translateY(3px); }
.dsc .btn-main:focus-visible, .dsc .btn-ghost:focus-visible, .dsc .chip:focus-visible { outline: 2px solid #5ff0d6; outline-offset: 3px; }

/* city chips */
.dsc .chips { scrollbar-width: none; mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
.dsc .chips::-webkit-scrollbar { display: none; }
.dsc .chip { flex: none; padding: .45rem .95rem; border-radius: 9999px; font-size: .78rem; color: #aab4c8; border: 1px solid rgba(255,255,255,.1); background: rgba(8,14,32,.55); backdrop-filter: blur(10px); cursor: pointer; transition: all .3s cubic-bezier(.16,1,.3,1); }
.dsc .chip:hover { color: #fff; border-color: rgba(95,240,214,.5); transform: translateY(-2px); }
.dsc .chip-active { color: #04121a; background: #5ff0d6; border-color: #5ff0d6; box-shadow: 0 0 24px rgba(46,230,197,.4); }

/* tooltip */
.dsc .tip { transition: opacity .25s ease; will-change: transform; }
.dsc .tip-card { min-width: 190px; padding: .9rem 1rem; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: linear-gradient(180deg, rgba(14,24,48,.88), rgba(6,10,24,.9)); backdrop-filter: blur(16px); box-shadow: 0 24px 60px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(46,230,197,.08) inset; }

/* progress rail */
.dsc .rail-dot { width: 7px; height: 7px; border-radius: 9999px; background: rgba(255,255,255,.22); transition: all .5s cubic-bezier(.16,1,.3,1); }
.dsc .rail-dot.on { height: 26px; background: #5ff0d6; box-shadow: 0 0 14px rgba(46,230,197,.7); }
.dsc button:hover .rail-dot:not(.on) { background: rgba(255,255,255,.55); }

@media (prefers-reduced-motion: reduce) {
  .dsc *, .dsc *::before, .dsc *::after { animation-duration: .001ms !important; animation-delay: 0ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
  .dsc .hero-in, .dsc .bracket { opacity: 1; }
  .dsc .word { transform: none; }
  .dsc .type { width: calc(23 * (1ch + .2em)); }
}
`;