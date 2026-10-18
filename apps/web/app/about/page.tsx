"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

// ... rest of your about page code

/* ───────────────────────── Fonts ───────────────────────── */

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"], style: ["normal", "italic"] });
const body = Manrope({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

/* ───────────────────────── Author / links ───────────────────────── */

const AUTHOR = {
  name: "Varuni Lukesh Dekate",
  initials: "VD",
  linkedin: "https://www.linkedin.com/in/varuni-dekate-753a8923b",
  github: "https://github.com/varuni09/terrapulse",
  email: "dekatevaruni3@gmail.com",
};

/* ───────────────────────── Content ───────────────────────── */

const STACK = [
  {
    title: "Landsat 8/9 C2 L2",
    desc: "USGS thermal infrared sensor (TIRS) surface temperature at 30 m resolution, delivered as analysis-ready Collection 2 Level 2 products.",
    input: "Thermal infrared bands",
    output: "Surface temperature rasters",
    code: [
      "# Collection 2 Level 2 surface temperature (Kelvin)",
      "st_kelvin = st_band * 0.00341802 + 149.0",
      "lst_c = st_kelvin - 273.15",
      "# mask clouds, shadow and snow with QA_PIXEL",
      "lst_c = lst_c.where(clear_mask)",
    ],
  },
  {
    title: "Uber H3 Hexagons",
    desc: "Hierarchical spatial indexing at resolution 8 turns millions of pixels into comparable neighbourhood-scale cells.",
    input: "Pixel-level measurements",
    output: "Uniform hexagonal cells",
    code: [
      "# every pixel centre -> its res-8 hexagon",
      "cell = h3.latlng_to_cell(lat, lng, 8)",
      "# aggregate pixels per cell",
      "zonal = df.groupby('cell').agg(lst=('lst_c', 'mean'))",
    ],
  },
  {
    title: "PySTAC & Rasterio",
    desc: "Cloud-native geospatial data fetching and windowed reads, so only the pixels a city needs are ever pulled.",
    input: "STAC catalog queries",
    output: "Extracted spectral values",
    code: [
      "# find clear scenes over the city",
      "items = catalog.search(",
      "    collections=['landsat-c2-l2'], bbox=city_bbox,",
      "    query={'eo:cloud_cover': {'lt': 20}},",
      ").items()",
      "# read just the city window, no full download",
      "with rasterio.open(asset_href) as src:",
      "    data = src.read(1, window=city_window)",
    ],
  },
  {
    title: "FastAPI Engine",
    desc: "An asynchronous Python microservice that serves zonal metrics per city to the interface.",
    input: "Cell-level statistics",
    output: "Zonal metrics over an API",
    code: [
      "@app.get('/cells/{city}')",
      "async def cells(city: str):",
      "    return await zonal_metrics(city)",
    ],
  },
  {
    title: "Next.js 14 App Router",
    desc: "Server-side streaming and fluid client interactivity turn zonal metrics into the maps, rankings and simulator you see here.",
    input: "Zonal metrics",
    output: "Interactive urban insights",
    code: [
      "// server component streams the data",
      "const cells = await api.get('/cells/' + city);",
      "return <HeatMap cells={cells} />;",
    ],
  },
];

const HEADLINE: { w: string; em?: boolean }[] = [
  { w: "Illuminating" },
  { w: "microclimates" },
  { w: "with" },
  { w: "satellite", em: true },
  { w: "intelligence.", em: true },
];

const HEAD_CHARS = (() => {
  let i = 0;
  return HEADLINE.map((it) => ({ ...it, chars: it.w.split("").map((ch) => ({ ch, d: 300 + i++ * 28 })) }));
})();

const HIGHLIGHTS: { label: string; value: number; suffix: string; prefix?: string; hint: string }[] = [
  { label: "Thermal resolution", value: 30, suffix: "m", hint: "Landsat surface temperature product" },
  { label: "H3 resolution", value: 8, suffix: "", prefix: "Res ", hint: "Near-uniform hexagonal cells" },
  { label: "Pipeline steps", value: 5, suffix: "", hint: "From orbit to urban planning" },
  { label: "Satellite missions", value: 2, suffix: "", hint: "Landsat 8 and Landsat 9" },
];

const MARQUEE = ["Landsat 8/9", "Uber H3", "PySTAC", "Rasterio", "FastAPI", "Next.js", "Surface temperature", "Urban heat islands", "Climate resilience"];

const TRUST = [
  { tag: "Observed", color: "#5ff0d6", desc: "A value read directly from a satellite pixel, tied to a named product and acquisition date." },
  { tag: "Aggregated", color: "#7dd3fc", desc: "Pixels averaged into an H3 cell. The cell size and averaging method are part of the number." },
  { tag: "Modeled", color: "#c4b5fd", desc: "Scenario outputs from a simplified linear model with editable planning assumptions. Estimates, not forecasts." },
  { tag: "Sample", color: "#fbbf24", desc: "Illustrative values shown only when a live feed can't be reached, and always labelled as such." },
];

const LIMITS = [
  {
    q: "Surface temperature is not air temperature",
    a: "Satellites measure how hot the ground and rooftops are, not the air a person breathes. Surface readings swing much more than air temperature, so treat them as a map of where heat concentrates, not a forecast of how it feels.",
  },
  {
    q: "Clouds and overpass time shape what we see",
    a: "Landsat passes over in the late morning, so afternoon peaks are not captured. Cloudy scenes are masked out, and with Landsat 8 and 9 together a given spot is revisited roughly every 8 days, so some periods have gaps.",
  },
  {
    q: "30 m is delivered, not natively measured",
    a: "The Landsat thermal sensor measures at about 100 m and the Level 2 product resamples it to 30 m. Fine detail inside a street block is smoother than it looks, which is one reason TerraPulse ranks hexagonal cells rather than single pixels.",
  },
  {
    q: "The simulator is a screening tool",
    a: "Cooling from canopy, cool roofs and pavement uses a simplified linear model, and costs come from editable planning assumptions. Use it to compare options and spot trade-offs, not to promise a result.",
  },
  {
    q: "Sample data is always labelled",
    a: "If a live or satellite feed can't be reached, the interface falls back to illustrative values and says so on the page. Sample numbers are for layout and exploration only.",
  },
];

const ROADMAP = ["Ground-station validation", "Uncertainty ranges on scenarios", "Population exposure layer", "Ranked hotspot report (PDF)"];

const SECTIONS = [
  { id: "top", l: "Intro" },
  { id: "pipeline", l: "Pipeline" },
  { id: "scale", l: "Scale" },
  { id: "trust", l: "Trust" },
  { id: "limits", l: "Limits" },
  { id: "author", l: "Author" },
];

const STEP_MS = 7000;

/* ───────────────────────── Helpers ───────────────────────── */

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

/* Heat ramp: deep blue -> teal -> yellow -> orange -> red */
const STOPS: [number, number, number, number][] = [
  [0, 16, 52, 112],
  [0.32, 46, 230, 197],
  [0.58, 250, 204, 21],
  [0.8, 251, 146, 60],
  [1, 239, 68, 68],
];
function rampInto(v: number, out: Uint8ClampedArray, o: number) {
  const t = clamp(v, 0, 1);
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const k = (t - a[0]) / (b[0] - a[0]);
      out[o] = a[1] + (b[1] - a[1]) * k;
      out[o + 1] = a[2] + (b[2] - a[2]) * k;
      out[o + 2] = a[3] + (b[3] - a[3]) * k;
      out[o + 3] = 255;
      return;
    }
  }
}

/* ───────────────────────── Hooks ───────────────────────── */

function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
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

function useTween(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(Math.max((t - start) / duration, 0), 1);
      const v = a + (target - a) * (1 - Math.pow(1 - p, 4));
      from.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ───────────────────────── Hero: living H3 heat field ───────────────────────── */

function HexField() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = wrap.current;
    const c = cv.current;
    if (!host || !c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const section = host.parentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const R = 28;
    const W3 = Math.sqrt(3);
    const ptr = { x: -9999, y: -9999, boost: 0 };
    let w = 0;
    let h = 0;
    let cells: { x: number; y: number; h: number; p: number }[] = [];
    let raf = 0;

    const build = () => {
      const r = host.getBoundingClientRect();
      w = r.width;
      h = r.height;
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cells = [];
      const dx = W3 * R;
      const dy = 1.5 * R;
      for (let row = 0; row * dy < h + R; row++) {
        for (let x = row % 2 ? dx / 2 : 0; x < w + dx; x += dx) {
          cells.push({ x, y: row * dy, h: 0, p: Math.random() * 6.28 });
        }
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const rad = 170;
      for (const cl of cells) {
        const amb = 0.1 + 0.07 * Math.sin(t * 0.0006 + cl.p) + 0.05 * Math.sin(cl.x * 0.006 + t * 0.0004);
        const dx = cl.x - ptr.x;
        const dy = cl.y - ptr.y;
        const d2 = dx * dx + dy * dy;
        const near = ptr.x > -999 ? Math.exp(-d2 / (2 * (rad * 0.5) ** 2)) * 0.85 : 0;
        const burst = ptr.boost * Math.exp(-d2 / (2 * rad * rad)) * 0.6;
        const tgt = amb + near + burst;
        cl.h += (tgt - cl.h) * (tgt > cl.h ? 0.2 : 0.035);
        const v = clamp(cl.h, 0, 1);
        const hue = 190 - v * 185;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const px = cl.x + R * 0.94 * Math.cos(a);
          const py = cl.y + R * 0.94 * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = `hsla(${hue},90%,52%,${0.035 + v * 0.45})`;
        ctx.fill();
        ctx.strokeStyle = `hsla(${hue},90%,62%,${0.08 + v * 0.42})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ptr.boost *= 0.94;
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
    };
    const onLeave = () => {
      ptr.x = -9999;
      ptr.y = -9999;
    };
    const onDown = (e: PointerEvent) => {
      onMove(e);
      ptr.boost = 1;
    };

    build();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(build);
    ro.observe(host);
    if (!reduce) {
      section?.addEventListener("pointermove", onMove as EventListener, { passive: true });
      section?.addEventListener("pointerleave", onLeave);
      section?.addEventListener("pointerdown", onDown as EventListener, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      section?.removeEventListener("pointermove", onMove as EventListener);
      section?.removeEventListener("pointerleave", onLeave);
      section?.removeEventListener("pointerdown", onDown as EventListener);
    };
  }, []);

  return (
    <div ref={wrap} className="hexhero" aria-hidden>
      <canvas ref={cv} />
    </div>
  );
}

/* ───────────────────────── Ambient ───────────────────────── */

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
      ring.current?.classList.toggle("abt-ring-hot", !!t?.closest?.("a,button,[data-cursor]"));
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
      <div ref={ring} className="abt-ring" aria-hidden />
      <div ref={dot} className="abt-dot" aria-hidden />
    </>
  );
}

/* ───────────────────────── UI pieces ───────────────────────── */

function Reveal({ children, delay = 0, y = 34, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
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
      el.style.transform = `perspective(1100px) rotateX(${(y / r.height - 0.5) * -6}deg) rotateY(${(x / r.width - 0.5) * 6}deg) translateZ(0)`;
    }
  };
  const leave = () => {
    if (ref.current && tilt) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onMouseMove={move} onMouseLeave={leave} className={`abt-glass ${className}`}>
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
    el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * strength}px, ${(e.clientY - (r.top + r.height / 2)) * strength}px)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <span ref={ref} onMouseMove={move} onMouseLeave={leave} className="abt-magnetic">
      {children}
    </span>
  );
}

function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="abt-eyebrow">
      <span className="abt-num">{n}</span>
      <i />
      {children}
    </p>
  );
}

function HighlightStat({ item, delay }: { item: (typeof HIGHLIGHTS)[number]; delay: number }) {
  const { ref, shown } = useInView<HTMLDivElement>(0.3);
  const v = useTween(shown ? item.value : 0, 1400);
  return (
    <Reveal delay={delay} className="h-full">
      <div ref={ref} className="h-full">
        <Glass tilt className="h-full rounded-3xl p-6">
          <p className="text-sm text-slate-500">{item.label}</p>
          <p className="abt-num abt-grad-num mt-3 text-4xl font-light">
            {item.prefix}
            {Math.round(v)}
            {item.suffix}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{item.hint}</p>
        </Glass>
      </div>
    </Reveal>
  );
}

function SideNav() {
  const [active, setActive] = useState("top");
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="sidenav" aria-label="Page sections">
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={active === s.id ? "sn-on" : ""} aria-current={active === s.id}>
          <span className="sn-label">{s.l}</span>
          <i />
        </a>
      ))}
    </nav>
  );
}

/* ───────────────────────── Pipeline ───────────────────────── */

function Pipeline() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = STACK[active];
  const last = STACK.length - 1;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(last, a + 1));
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a - 1));
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKey}
    >
      <div className="relative mx-auto max-w-4xl px-2">
        <div className="pipe-track" />
        <div className="pipe-fill" style={{ width: `${(active / last) * 100}%` }} />
        <div className="relative flex items-start justify-between">
          {STACK.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setActive(i)}
              className={`pipe-node ${i === active ? "pipe-node-active" : i < active ? "pipe-node-done" : ""}`}
              aria-label={s.title}
              aria-current={i === active}
            >
              <span className="pipe-dot abt-num">{i < active ? "✓" : `0${i + 1}`}</span>
              <span className="pipe-label hidden sm:block">{s.title.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <Glass className="rounded-[28px] p-7 md:p-10">
          <div key={active} className="pipe-panel grid grid-cols-1 items-start gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="abt-num text-xs text-[#5ff0d6]">Step 0{active + 1} // {String(STACK.length).padStart(2, "0")}</p>
              <h3 className="abt-display mt-3 text-3xl font-light text-white md:text-5xl">{step.title}</h3>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">{step.desc}</p>

              <div className="term mt-7" role="figure" aria-label={`Illustrative code for ${step.title}`}>
                <div className="term-bar">
                  <i /><i /><i />
                  <span className="abt-num">illustrative snippet</span>
                </div>
                <pre className="abt-num">
                  {step.code.map((line, i) => (
                    <span
                      key={`${active}-${i}`}
                      className={`term-line ${line.trim().startsWith("#") || line.trim().startsWith("//") ? "term-c" : ""}`}
                      style={{ animationDelay: `${120 + i * 110}ms` }}
                    >
                      {line}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="flow">
                <div className="flow-box">
                  <p className="flow-k">In</p>
                  <p className="flow-v">{step.input}</p>
                </div>
                <div className="flow-wire">
                  <span className="flow-pulse" />
                  <span className="flow-pulse flow-pulse-2" />
                </div>
                <div className="flow-box flow-box-out">
                  <p className="flow-k">Out</p>
                  <p className="flow-v">{step.output}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              key={`${active}-timer`}
              className="pipe-timer"
              style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={() => setActive((a) => (a + 1) % STACK.length)}
            />
          </div>
          <p className="mt-3 text-[12px] text-slate-600">
            {paused ? "Paused. Use ← → keys or click a step." : "Auto-playing. Hover to pause, or use the arrow keys."}
          </p>
        </Glass>
      </div>
    </div>
  );
}

/* ───────────────────────── Scale lens ───────────────────────── */

type Mode = "landsat" | "h3" | "modis";

const MODES: { id: Mode; label: string; size: string; area: string; px: string; note: string }[] = [
  {
    id: "landsat",
    label: "Landsat pixel",
    size: "30 m",
    area: "0.0009 km²",
    px: "1",
    note: "The finest view. Every pixel is its own measurement: rich in detail, but noisy and hard to rank fairly.",
  },
  {
    id: "h3",
    label: "H3 cell, res 8",
    size: "≈ 0.46 km edge",
    area: "≈ 0.74 km²",
    px: "≈ 820",
    note: "TerraPulse's working unit. Pixels are averaged into near-uniform hexagons so neighbourhoods can be compared on equal terms.",
  },
  {
    id: "modis",
    label: "MODIS pixel",
    size: "≈ 1 km",
    area: "≈ 1 km²",
    px: "≈ 1,100",
    note: "Coarse but frequent. Useful for city-scale trends and rolling composites, too blunt to see individual streets.",
  },
];

const LN = 240; // fine grid cells per side
const LSTEP = 10; // metres per fine cell, so the view is 2.4 km wide

function field(x: number, y: number) {
  const g = (cx: number, cy: number, r: number, a: number) => a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));
  let v = 0.38 + g(700, 800, 330, 0.55) + g(1700, 500, 260, 0.45) + g(1500, 1750, 380, 0.5) - g(600, 1750, 300, 0.4) - g(1900, 1300, 200, 0.3);
  v += 0.06 * Math.sin(x * 0.011) * Math.cos(y * 0.013) + 0.04 * Math.sin((x + y) * 0.02);
  return clamp(v, 0, 1);
}

const FIELD = (() => {
  const a = new Float32Array(LN * LN);
  for (let y = 0; y < LN; y++) for (let x = 0; x < LN; x++) a[y * LN + x] = field((x + 0.5) * LSTEP, (y + 0.5) * LSTEP);
  return a;
})();

function hexKey(x: number, y: number, size: number) {
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  const cx = q;
  const cz = r;
  const cy = -cx - cz;
  let rx = Math.round(cx);
  let ry = Math.round(cy);
  let rz = Math.round(cz);
  const dx = Math.abs(rx - cx);
  const dy = Math.abs(ry - cy);
  const dz = Math.abs(rz - cz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return rx * 10007 + rz;
}

function keyFor(mode: Mode, x: number, y: number) {
  if (mode === "landsat") return Math.floor(x / 30) * 1000 + Math.floor(y / 30);
  if (mode === "modis") return Math.floor((x + 350) / 1000) * 100 + Math.floor((y + 350) / 1000);
  return hexKey(x + 150, y + 100, 461);
}

function computeLens(mode: Mode) {
  const ids = new Int32Array(LN * LN);
  const index = new Map<number, number>();
  const sum: number[] = [];
  const cnt: number[] = [];
  for (let y = 0; y < LN; y++) {
    for (let x = 0; x < LN; x++) {
      const k = keyFor(mode, (x + 0.5) * LSTEP, (y + 0.5) * LSTEP);
      let id = index.get(k);
      if (id === undefined) {
        id = sum.length;
        index.set(k, id);
        sum.push(0);
        cnt.push(0);
      }
      ids[y * LN + x] = id;
      sum[id] += FIELD[y * LN + x];
      cnt[id] += 1;
    }
  }
  const vals = new Float32Array(LN * LN);
  for (let i = 0; i < vals.length; i++) vals[i] = sum[ids[i]] / cnt[ids[i]];
  return { ids, vals, count: sum.length };
}

function ScaleLens() {
  const [mode, setMode] = useState<Mode>("h3");
  const [hover, setHover] = useState<{ t: number } | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const lens = useMemo(() => computeLens(mode), [mode]);
  const meta = MODES.find((m) => m.id === mode)!;

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(LN, LN);
    const { ids, vals } = lens;
    for (let y = 0; y < LN; y++) {
      for (let x = 0; x < LN; x++) {
        const i = y * LN + x;
        const o = i * 4;
        rampInto(vals[i], img.data, o);
        const edge = mode !== "landsat" && ((x < LN - 1 && ids[i] !== ids[i + 1]) || (y < LN - 1 && ids[i] !== ids[i + LN]));
        if (edge) {
          img.data[o] = img.data[o] * 0.3 + 5 * 0.7;
          img.data[o + 1] = img.data[o + 1] * 0.3 + 10 * 0.7;
          img.data[o + 2] = img.data[o + 2] * 0.3 + 28 * 0.7;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [lens, mode]);

  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = clamp(Math.floor(((e.clientX - r.left) / r.width) * LN), 0, LN - 1);
    const y = clamp(Math.floor(((e.clientY - r.top) / r.height) * LN), 0, LN - 1);
    setHover({ t: 26 + lens.vals[y * LN + x] * 22 });
  };

  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <Glass className="rounded-[28px] p-4 md:p-5">
          <div className="lens-frame">
            <canvas
              ref={cv}
              width={LN}
              height={LN}
              className="lens-canvas"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              data-cursor
              aria-label={`Illustrative 2.4 kilometre heat field shown as ${meta.label}s`}
            />
            <div key={mode} className="lens-scan" aria-hidden />
            <div className="lens-read abt-num">
              {hover ? `≈ ${hover.t.toFixed(1)} °C` : "hover to read"}
              <small>illustrative field</small>
            </div>
            <div className="lens-scalebar abt-num" aria-hidden>
              <i /> 500 m
            </div>
          </div>
          <div className="lens-legend abt-num" aria-hidden>
            <span>cooler</span>
            <i />
            <span>hotter</span>
          </div>
        </Glass>
      </div>

      <div className="lg:col-span-6">
        <div role="group" aria-label="Grid scale" className="lens-tabs">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)} aria-pressed={mode === m.id} className={mode === m.id ? "lens-tab lens-tab-on" : "lens-tab"}>
              {m.label}
            </button>
          ))}
        </div>

        <div key={mode} className="pipe-panel mt-8">
          <h3 className="abt-display text-3xl font-light text-white md:text-4xl">{meta.label}</h3>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-400">{meta.note}</p>
          <dl className="lens-stats">
            <div>
              <dt>Cell size</dt>
              <dd className="abt-num">{meta.size}</dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd className="abt-num">{meta.area}</dd>
            </div>
            <div>
              <dt>Landsat pixels inside</dt>
              <dd className="abt-num">{meta.px}</dd>
            </div>
            <div>
              <dt>Cells in this view</dt>
              <dd className="abt-num">{lens.count.toLocaleString()}</dd>
            </div>
          </dl>
          <p className="mt-6 text-[12px] leading-relaxed text-slate-600">
            The same 2.4 km patch, redrawn at each scale. The heat field is a synthetic illustration to show how aggregation works, not real measurements.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Limits accordion ───────────────────────── */

function Limits() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lim">
      {LIMITS.map((l, i) => {
        const on = open === i;
        return (
          <div key={l.q} className={`lim-item ${on ? "lim-on" : ""}`}>
            <button className="lim-q" aria-expanded={on} aria-controls={`lim-${i}`} onClick={() => setOpen(on ? null : i)}>
              <span className="abt-num lim-n">0{i + 1}</span>
              <span className="abt-display lim-t">{l.q}</span>
              <span className="lim-plus" aria-hidden />
            </button>
            <div id={`lim-${i}`} className="lim-a" style={{ gridTemplateRows: on ? "1fr" : "0fr" }}>
              <div>
                <p>{l.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Author ───────────────────────── */

function CopyEmail() {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AUTHOR.email);
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      window.location.href = `mailto:${AUTHOR.email}`;
    }
  };
  return (
    <button onClick={copy} className="auth-link" aria-live="polite">
      <span className="auth-ico" aria-hidden>@</span>
      <span>
        <b>{done ? "Copied to clipboard" : "Email"}</b>
        <em>{AUTHOR.email}</em>
      </span>
      <span className="auth-arrow" aria-hidden>{done ? "✓" : "⧉"}</span>
    </button>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function AboutPage() {
  const [currentYear, setCurrentYear] = useState(2026);
  const progress = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
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
    const onMove = (e: globalThis.MouseEvent) => {
      if (glow.current) glow.current.style.transform = `translate3d(${e.clientX - 250}px, ${e.clientY - 250}px, 0)`;
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

  return (
    <main
      ref={root}
      className={`${display.variable} ${body.variable} ${mono.variable} abt relative min-h-screen overflow-x-clip bg-[#050a1c] text-slate-100`}
    >
      <style>{CSS}</style>

      <div className="fixed left-0 top-0 z-[60] h-[2px] w-full bg-transparent">
        <div ref={progress} className="h-full origin-left bg-gradient-to-r from-[#2ee6c5] via-[#7dd3fc] to-[#f87171]" style={{ transform: "scaleX(0)" }} />
      </div>

      <CursorFollower />
      <SideNav />
      <div ref={glow} className="abt-glow" aria-hidden />
      <div className="abt-grain" aria-hidden />

      {/* ───────── Hero ───────── */}
      <section id="top" className="relative px-6 pb-24 pt-36 md:px-12">
        <div className="abt-aurora" aria-hidden>
          <div className="abt-blob abt-blob-a" />
          <div className="abt-blob abt-blob-b" />
        </div>
        <HexField />

        <div className="relative z-10 mx-auto max-w-6xl">
          <Link href="/insights" className="abt-in group inline-flex items-center gap-2 text-sm text-[#5ff0d6]" style={{ animationDelay: "100ms" }}>
            <span className="inline-block transition-transform duration-300 group-hover:-translate-x-1">←</span>
            Diagnostics overview
          </Link>

          <p className="abt-in mt-10 inline-flex items-center gap-3 text-sm tracking-wide text-[#5ff0d6]" style={{ animationDelay: "220ms" }}>
            <span className="abt-live" />
            System architecture and mission
          </p>

          <h1 className="abt-display mt-5 max-w-5xl text-[clamp(2.6rem,7vw,6.2rem)] font-light leading-[1.02] tracking-[-0.02em] text-white">
            {HEAD_CHARS.map((item, wi) => (
              <span key={wi} className="abt-wordmask mr-[0.22em]">
                {item.chars.map((c, ci) => (
                  <span key={ci} className={`abt-char ${item.em ? "abt-char-em" : ""}`} style={{ animationDelay: `${c.d}ms` }}>
                    {c.ch}
                  </span>
                ))}
              </span>
            ))}
          </h1>

          <p className="abt-in mt-8 max-w-2xl text-lg leading-relaxed text-slate-400" style={{ animationDelay: "1500ms" }}>
            TerraPulse converts raw satellite thermal bands into actionable spatial insights for urban climate resilience, identifying hyper-local Urban Heat Island (UHI) risks across metropolitan areas.
          </p>

          <div className="abt-in mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: "1700ms" }}>
            <Magnetic strength={0.35}>
              <a href="#pipeline" className="abt-btn">Explore the pipeline</a>
            </Magnetic>
            <Magnetic strength={0.25}>
              <Link href="/scenarios" className="abt-btn-ghost">Launch simulator</Link>
            </Magnetic>
            <Magnetic strength={0.25}>
              <a href={AUTHOR.github} target="_blank" rel="noopener noreferrer" className="abt-btn-ghost">View source ↗</a>
            </Magnetic>
          </div>

          <p className="abt-in mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-slate-500" style={{ animationDelay: "1900ms" }}>
            <span>
              Built by <a href="#author" className="text-slate-300 underline decoration-[#5ff0d6]/40 underline-offset-4 transition hover:text-white hover:decoration-[#5ff0d6]">{AUTHOR.name}</a>
            </span>
            <span className="abt-num hidden text-[11px] uppercase tracking-[0.18em] text-slate-600 sm:inline">Move over the grid. Click to drop a heat burst.</span>
          </p>
        </div>
      </section>

      {/* ───────── Marquee ───────── */}
      <div className="abt-marquee" aria-hidden>
        <div className="abt-marquee-track">
          {[0, 1].map((k) => (
            <div key={k} className="abt-marquee-set">
              {MARQUEE.map((m) => (
                <span key={`${k}-${m}`} className="abt-display abt-marquee-item">
                  {m}
                  <b>✦</b>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ───────── Highlights ───────── */}
      <section className="relative px-6 py-24 md:px-12">
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map((h, i) => (
            <HighlightStat key={h.label} item={h} delay={i * 90} />
          ))}
        </div>
      </section>

      {/* ───────── Pipeline ───────── */}
      <section id="pipeline" className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="01">Methodology</Eyebrow>
            <h2 className="abt-display max-w-3xl text-4xl font-light leading-tight text-white md:text-6xl">
              The data <em className="abt-grad">pipeline.</em>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              From orbit to actionable urban planning scenarios in five steps.
            </p>
          </Reveal>

          <Reveal className="mt-14" delay={100}>
            <Pipeline />
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STACK.map((item, i) => (
              <Reveal key={item.title} delay={i * 80}>
                <Glass tilt className="h-full rounded-3xl p-7">
                  <span className="abt-num text-xs text-[#5ff0d6]">0{i + 1} //</span>
                  <h3 className="abt-display mt-3 text-xl font-normal text-white">{item.title}</h3>
                  <p className="mt-3 text-[13px] leading-relaxed text-slate-400">{item.desc}</p>
                </Glass>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Scale lens ───────── */}
      <section id="scale" className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="02">Resolution</Eyebrow>
            <h2 className="abt-display max-w-3xl text-4xl font-light leading-tight text-white md:text-6xl">
              One patch, three <em className="abt-grad">scales.</em>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              Why TerraPulse aggregates pixels into hexagons. Switch the grid and watch the same patch of city change character.
            </p>
          </Reveal>
          <Reveal className="mt-14" delay={100}>
            <ScaleLens />
          </Reveal>
        </div>
      </section>

      {/* ───────── Trust ───────── */}
      <section id="trust" className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="03">Reading the numbers</Eyebrow>
            <h2 className="abt-display max-w-3xl text-4xl font-light leading-tight text-white md:text-6xl">
              Every number gets a <em className="abt-grad">label.</em>
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">
              A temperature read from orbit and a cost estimate from a model should never look the same. These are the four kinds of value in TerraPulse.
            </p>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t, i) => (
              <Reveal key={t.tag} delay={i * 90} className="h-full">
                <Glass tilt className="trust-card h-full rounded-3xl p-7">
                  <span className="trust-chip abt-num" style={{ ["--c" as string]: t.color }}>
                    <i />
                    {t.tag}
                  </span>
                  <p className="mt-5 text-[14px] leading-relaxed text-slate-300">{t.desc}</p>
                </Glass>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Limits ───────── */}
      <section id="limits" className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Eyebrow n="04">Honest limits</Eyebrow>
            <h2 className="abt-display text-4xl font-light leading-tight text-white md:text-5xl">
              What this can, and can&apos;t, <em className="abt-grad">tell you.</em>
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">
              Satellite heat maps are powerful and easy to over-read. Here is where to be careful.
            </p>

            <p className="abt-num mt-10 text-[11px] uppercase tracking-[0.2em] text-slate-500">On the roadmap</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {ROADMAP.map((r) => (
                <span key={r} className="road-chip">{r}</span>
              ))}
            </div>
          </Reveal>

          <Reveal className="lg:col-span-7" delay={120}>
            <Limits />
          </Reveal>
        </div>
      </section>

      {/* ───────── Author ───────── */}
      <section id="author" className="relative px-6 pb-28 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="05">The maker</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <Glass className="auth rounded-[32px] p-8 md:p-14">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
                <div className="lg:col-span-6">
                  <div className="auth-mono" aria-hidden>
                    <span className="abt-display">{AUTHOR.initials}</span>
                    <i />
                    <i />
                  </div>
                  <h2 className="abt-display mt-8 text-4xl font-light leading-tight text-white md:text-5xl">
                    Built by <em className="abt-grad">{AUTHOR.name}.</em>
                  </h2>
                  <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">
                    TerraPulse is an independent project exploring how open satellite data can point cities toward the places where cooling matters most. Feedback, questions and collaboration ideas are welcome.
                  </p>
                </div>

                <div className="lg:col-span-6">
                  <div className="auth-links">
                    <a href={AUTHOR.github} target="_blank" rel="noopener noreferrer" className="auth-link">
                      <span className="auth-ico" aria-hidden>{"</>"}</span>
                      <span>
                        <b>GitHub</b>
                        <em>varuni09/terrapulse</em>
                      </span>
                      <span className="auth-arrow" aria-hidden>↗</span>
                    </a>
                    <a href={AUTHOR.linkedin} target="_blank" rel="noopener noreferrer" className="auth-link">
                      <span className="auth-ico" aria-hidden>in</span>
                      <span>
                        <b>LinkedIn</b>
                        <em>varuni-dekate</em>
                      </span>
                      <span className="auth-arrow" aria-hidden>↗</span>
                    </a>
                    <CopyEmail />
                  </div>
                </div>
              </div>
            </Glass>
          </Reveal>
        </div>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="relative px-6 pb-24 md:px-12">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Glass className="abt-cta rounded-[32px] p-10 md:p-16">
              <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <h3 className="abt-display text-3xl font-light leading-snug text-white md:text-5xl">
                    Ready to test a cooler <em className="abt-grad">city?</em>
                  </h3>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
                    Model canopy, cool roofs and reflective pavement across the hottest cells, then compare two plans side by side.
                  </p>
                </div>
                <div className="flex justify-start lg:col-span-4 lg:justify-end">
                  <Magnetic strength={0.4}>
                    <Link href="/scenarios" className="abt-btn">Launch Simulator →</Link>
                  </Magnetic>
                </div>
              </div>
            </Glass>
          </Reveal>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="relative border-t border-white/[0.06] px-6 py-10 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 text-[13px] text-slate-500 sm:flex-row sm:items-center">
          <p>© {currentYear} TerraPulse · {AUTHOR.name}</p>
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <a href={AUTHOR.github} target="_blank" rel="noopener noreferrer" className="transition hover:text-[#5ff0d6]">GitHub</a>
            <a href={AUTHOR.linkedin} target="_blank" rel="noopener noreferrer" className="transition hover:text-[#5ff0d6]">LinkedIn</a>
            <a href={`mailto:${AUTHOR.email}`} className="transition hover:text-[#5ff0d6]">Email</a>
            <span className="text-slate-600">Landsat data courtesy of the U.S. Geological Survey</span>
          </p>
        </div>
      </footer>
    </main>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const CSS = `
.abt { font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; --abt-mint: #5ff0d6; }
.abt .abt-display { font-family: var(--font-display), Georgia, serif; font-optical-sizing: auto; text-wrap: balance; }
.abt .abt-display em { font-style: italic; font-weight: 300; }
.abt .abt-num { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.abt ::selection { background: rgba(46,230,197,.3); }
.abt section[id] { scroll-margin-top: 24px; }

.abt .abt-grad { background: linear-gradient(100deg,#7dd3fc 0%,#5ff0d6 35%,#c4b5fd 70%,#7dd3fc 100%); background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; animation: abtShimmer 10s ease-in-out infinite alternate; padding-right: .06em; }
.abt .abt-grad-num { background: linear-gradient(180deg,#fff,#9fb3d1); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes abtShimmer { to { background-position: -220% 0; } }

.abt .abt-eyebrow { display: flex; align-items: center; gap: .85rem; margin-bottom: 1.4rem; font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: #7f8aa3; }
.abt .abt-eyebrow .abt-num { color: #5ff0d6; letter-spacing: .05em; }
.abt .abt-eyebrow i { display: block; height: 1px; width: 44px; background: linear-gradient(90deg,#5ff0d6,transparent); }

/* ambient */
.abt .abt-grain { position: fixed; inset: 0; z-index: 50; pointer-events: none; opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.abt .abt-glow { position: fixed; top: 0; left: 0; z-index: 1; width: 500px; height: 500px; pointer-events: none; border-radius: 9999px;
  background: radial-gradient(circle, rgba(46,230,197,.10), transparent 62%); transition: transform .25s cubic-bezier(.16,1,.3,1); will-change: transform; }
.abt .abt-dot { position: fixed; top: -3px; left: -3px; z-index: 120; width: 6px; height: 6px; border-radius: 9999px; background: #5ff0d6; pointer-events: none; box-shadow: 0 0 12px #5ff0d6; }
.abt .abt-ring { position: fixed; top: -18px; left: -18px; z-index: 119; width: 36px; height: 36px; border-radius: 9999px; pointer-events: none;
  border: 1px solid rgba(95,240,214,.55); transition: width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1), margin .35s cubic-bezier(.16,1,.3,1), background .35s; mix-blend-mode: screen; }
.abt .abt-ring.abt-ring-hot { width: 64px; height: 64px; margin: -14px 0 0 -14px; background: rgba(95,240,214,.10); border-color: rgba(95,240,214,.9); }
@media (pointer: coarse) { .abt .abt-dot, .abt .abt-ring, .abt .abt-glow { display: none; } }

.abt .abt-aurora { position: absolute; inset: 0; overflow: hidden; pointer-events: none; isolation: isolate; }
.abt .abt-blob { position: absolute; border-radius: 9999px; filter: blur(110px); will-change: transform; }
.abt .abt-blob-a { width: 620px; height: 620px; left: -8%; top: -10%; background: radial-gradient(circle, rgba(46,230,197,.5), transparent 65%); opacity: .3;
  transform: translateY(calc(var(--sy,0) * -0.1px)); animation: abtDrift1 26s cubic-bezier(.45,0,.55,1) infinite alternate; }
.abt .abt-blob-b { width: 680px; height: 680px; right: -12%; top: 4%; background: radial-gradient(circle, rgba(99,102,241,.55), transparent 65%); opacity: .26;
  transform: translateY(calc(var(--sy,0) * -0.18px)); animation: abtDrift2 31s cubic-bezier(.45,0,.55,1) infinite alternate; }
@keyframes abtDrift1 { 0% { margin: 0; } 100% { margin: 60px 0 0 90px; } }
@keyframes abtDrift2 { 0% { margin: 0; } 100% { margin: 80px 70px 0 0; } }

/* hex hero */
.abt .hexhero { position: absolute; inset: 0; z-index: 1; overflow: hidden; pointer-events: none;
  -webkit-mask: linear-gradient(180deg, #000 55%, transparent 100%); mask: linear-gradient(180deg, #000 55%, transparent 100%); }
.abt .hexhero canvas { display: block; }

/* side nav */
.abt .sidenav { position: fixed; right: 1.4rem; top: 50%; z-index: 70; display: flex; flex-direction: column; gap: .9rem; transform: translateY(-50%); }
.abt .sidenav a { display: flex; align-items: center; justify-content: flex-end; gap: .7rem; color: #64748b; }
.abt .sidenav .sn-label { font-family: var(--font-mono), monospace; font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; opacity: 0; transform: translateX(6px); transition: all .3s cubic-bezier(.16,1,.3,1); }
.abt .sidenav i { display: block; width: 8px; height: 8px; border-radius: 9999px; border: 1px solid rgba(148,163,184,.5); transition: all .35s cubic-bezier(.34,1.56,.64,1); }
.abt .sidenav a:hover .sn-label, .abt .sidenav a.sn-on .sn-label { opacity: 1; transform: none; color: #e2e8f0; }
.abt .sidenav a:hover i { border-color: #5ff0d6; }
.abt .sidenav a.sn-on i { background: #5ff0d6; border-color: #5ff0d6; transform: scale(1.5); box-shadow: 0 0 14px rgba(95,240,214,.7); }
@media (max-width: 1100px) { .abt .sidenav { display: none; } }

/* hero entrance */
.abt .abt-in { opacity: 0; animation: abtIn 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes abtIn { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
.abt .abt-wordmask { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: .14em; margin-bottom: -.14em; white-space: nowrap; }
.abt .abt-char { display: inline-block; transform: translateY(115%) rotate(6deg); opacity: 0; animation: abtChar 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes abtChar { to { transform: none; opacity: 1; } }
.abt .abt-char-em { font-style: italic; background: linear-gradient(100deg,#7dd3fc,#5ff0d6 40%,#c4b5fd 80%); background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: 0 0 34px rgba(95,240,214,.08); }
.abt .abt-live { position: relative; width: 8px; height: 8px; border-radius: 9999px; background: #5ff0d6; }
.abt .abt-live::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: #5ff0d6; animation: abtPing 2s cubic-bezier(0,0,.2,1) infinite; }
@keyframes abtPing { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(3.2); opacity: 0; } }

/* marquee */
.abt .abt-marquee { position: relative; z-index: 2; overflow: hidden; border-block: 1px solid rgba(255,255,255,.06); padding: 1.3rem 0;
  -webkit-mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
.abt .abt-marquee-track { display: flex; width: max-content; animation: abtMarq 40s linear infinite; }
.abt .abt-marquee:hover .abt-marquee-track { animation-play-state: paused; }
.abt .abt-marquee-set { display: flex; }
.abt .abt-marquee-item { display: inline-flex; align-items: center; gap: 2.2rem; padding-right: 2.2rem; font-size: 2rem; font-weight: 300; font-style: italic; color: rgba(226,232,240,.5); white-space: nowrap; transition: color .35s, transform .35s; }
.abt .abt-marquee-item:hover { color: #5ff0d6; transform: translateY(-2px); }
.abt .abt-marquee-item b { font-style: normal; font-size: .9rem; color: #7dd3fc; font-weight: 400; }
@keyframes abtMarq { to { transform: translateX(-50%); } }

/* glass */
.abt .abt-glass { position: relative; isolation: isolate; overflow: hidden; border: 1px solid rgba(186,230,253,.11);
  background: linear-gradient(145deg,rgba(255,255,255,.065),rgba(255,255,255,.012) 46%), rgba(8,14,36,.78);
  box-shadow: 0 1px 0 rgba(255,255,255,.07) inset, 0 24px 70px -38px rgba(0,0,0,.85);
  transition: transform .5s cubic-bezier(.16,1,.3,1), border-color .4s, box-shadow .4s; transform-style: preserve-3d; }
.abt .abt-glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: -1; opacity: .35; transition: opacity .45s ease;
  background: radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(46,230,197,.12), transparent 60%); }
.abt .abt-glass::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0; transition: opacity .4s;
  background: radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(95,240,214,.6), transparent 60%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.abt .abt-glass:hover { border-color: rgba(95,240,214,.24); box-shadow: 0 1px 0 rgba(255,255,255,.09) inset, 0 30px 90px -42px rgba(46,230,197,.24); }
.abt .abt-glass:hover::before { opacity: 1; }
.abt .abt-glass:hover::after { opacity: 1; }
.abt .abt-cta { background: linear-gradient(180deg, rgba(46,230,197,.09), rgba(99,102,241,.04)), rgba(8,14,36,.75); border-color: rgba(46,230,197,.22); }

/* pipeline stepper */
.abt .pipe-track { position: absolute; left: 1.6rem; right: 1.6rem; top: 1.6rem; height: 2px; background: rgba(255,255,255,.08); border-radius: 9999px; }
.abt .pipe-fill { position: absolute; left: 1.6rem; top: 1.6rem; height: 2px; max-width: calc(100% - 3.2rem); background: linear-gradient(90deg,#2ee6c5,#7dd3fc); border-radius: 9999px; box-shadow: 0 0 14px rgba(46,230,197,.6); transition: width .8s cubic-bezier(.16,1,.3,1); }
.abt .pipe-node { position: relative; display: flex; flex-direction: column; align-items: center; gap: .7rem; cursor: pointer; }
.abt .pipe-dot { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; border-radius: 9999px; font-size: .8rem; color: #94a3b8;
  background: #0a1230; border: 1px solid rgba(255,255,255,.14); transition: all .5s cubic-bezier(.34,1.56,.64,1); }
.abt .pipe-node:hover .pipe-dot { border-color: rgba(95,240,214,.7); color: #fff; transform: scale(1.08); }
.abt .pipe-node-done .pipe-dot { color: #04121a; background: #2ee6c5; border-color: #2ee6c5; }
.abt .pipe-node-active .pipe-dot { color: #04121a; background: #5ff0d6; border-color: #5ff0d6; transform: scale(1.18); animation: pipeHalo 2.8s ease-in-out infinite; }
@keyframes pipeHalo { 0%,100% { box-shadow: 0 0 0 7px rgba(46,230,197,.10),0 0 22px rgba(46,230,197,.24); } 50% { box-shadow: 0 0 0 11px rgba(46,230,197,.045),0 0 38px rgba(46,230,197,.42); } }
.abt .pipe-label { font-size: .72rem; letter-spacing: .06em; color: #64748b; transition: color .3s; }
.abt .pipe-node-active .pipe-label, .abt .pipe-node:hover .pipe-label { color: #e2e8f0; }
.abt .pipe-panel { animation: abtPanel .7s cubic-bezier(.16,1,.3,1); }
@keyframes abtPanel { from { opacity: 0; transform: translateY(14px); filter: blur(5px); } to { opacity: 1; transform: none; filter: none; } }
.abt .pipe-timer { height: 100%; width: 100%; transform-origin: left; background: linear-gradient(90deg,#2ee6c5,#7dd3fc 55%,#c4b5fd); box-shadow: 0 0 12px rgba(95,240,214,.28); animation-name: abtTimer; animation-timing-function: linear; animation-fill-mode: forwards; }
@keyframes abtTimer { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* terminal */
.abt .term { border-radius: 14px; overflow: hidden; background: rgba(3,7,20,.8); border: 1px solid rgba(255,255,255,.08); }
.abt .term-bar { display: flex; align-items: center; gap: .4rem; padding: .6rem .9rem; border-bottom: 1px solid rgba(255,255,255,.06); }
.abt .term-bar i { width: 9px; height: 9px; border-radius: 9999px; background: rgba(255,255,255,.14); }
.abt .term-bar i:nth-child(1) { background: #f87171; opacity: .7; }
.abt .term-bar i:nth-child(2) { background: #fbbf24; opacity: .7; }
.abt .term-bar i:nth-child(3) { background: #5ff0d6; opacity: .7; }
.abt .term-bar span { margin-left: auto; font-size: .66rem; letter-spacing: .12em; text-transform: uppercase; color: #475569; }
.abt .term pre { margin: 0; padding: 1rem 1.1rem 1.15rem; font-size: .78rem; line-height: 1.7; color: #cbd5e1; overflow-x: auto; white-space: pre; }
.abt .term-line { display: block; opacity: 0; animation: termIn .5s cubic-bezier(.16,1,.3,1) forwards; }
.abt .term-c { color: #64748b; }
@keyframes termIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }

/* in -> out flow */
.abt .flow { display: flex; align-items: center; gap: .6rem; }
.abt .flow-box { flex: 1; padding: 1rem 1.1rem; border-radius: 1rem; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); transition: transform .35s cubic-bezier(.16,1,.3,1), border-color .35s, background .35s; }
.abt .flow-box:hover { transform: translateY(-3px); border-color: rgba(95,240,214,.3); background: rgba(95,240,214,.055); }
.abt .flow-box-out { background: rgba(46,230,197,.07); border-color: rgba(46,230,197,.3); }
.abt .flow-k { font-size: .66rem; letter-spacing: .2em; text-transform: uppercase; color: #64748b; }
.abt .flow-v { margin-top: .4rem; font-size: .88rem; line-height: 1.35; color: #e2e8f0; }
.abt .flow-wire { position: relative; width: 44px; height: 2px; flex-shrink: 0; background: rgba(255,255,255,.1); overflow: hidden; border-radius: 9999px; }
.abt .flow-pulse { position: absolute; top: 0; left: 0; width: 14px; height: 100%; background: #5ff0d6; box-shadow: 0 0 14px rgba(95,240,214,.8); animation: abtFlow 1.6s cubic-bezier(.65,0,.35,1) infinite; }
.abt .flow-pulse-2 { animation-delay: .8s; }
@keyframes abtFlow { from { transform: translateX(-16px); } to { transform: translateX(46px); } }

/* scale lens */
.abt .lens-frame { position: relative; overflow: hidden; border-radius: 18px; aspect-ratio: 1 / 1; background: #030714; }
.abt .lens-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; cursor: crosshair; }
.abt .lens-scan { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, transparent 0%, rgba(95,240,214,.35) 50%, transparent 100%); height: 18%; animation: lensScan .9s cubic-bezier(.16,1,.3,1) forwards; opacity: 0; }
@keyframes lensScan { 0% { transform: translateY(-100%); opacity: .9; } 100% { transform: translateY(560%); opacity: 0; } }
.abt .lens-read { position: absolute; left: .8rem; top: .8rem; padding: .45rem .7rem; border-radius: 10px; font-size: .82rem; color: #e2e8f0; background: rgba(5,10,28,.78); border: 1px solid rgba(255,255,255,.1); }
.abt .lens-read small { display: block; margin-top: .1rem; font-size: .6rem; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
.abt .lens-scalebar { position: absolute; right: .8rem; bottom: .8rem; display: flex; align-items: center; gap: .5rem; font-size: .68rem; color: #e2e8f0; padding: .35rem .6rem; border-radius: 8px; background: rgba(5,10,28,.78); }
.abt .lens-scalebar i { display: block; height: 3px; width: calc(100% * 0); width: 56px; background: #e2e8f0; border-radius: 2px; }
.abt .lens-legend { display: flex; align-items: center; gap: .7rem; margin-top: .9rem; padding: 0 .3rem; font-size: .66rem; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
.abt .lens-legend i { flex: 1; height: 6px; border-radius: 9999px; background: linear-gradient(90deg, rgb(16,52,112), rgb(46,230,197), rgb(250,204,21), rgb(251,146,60), rgb(239,68,68)); }
.abt .lens-tabs { display: inline-flex; flex-wrap: wrap; gap: .4rem; padding: .35rem; border-radius: 9999px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
.abt .lens-tab { padding: .6rem 1.1rem; border-radius: 9999px; font-size: .84rem; color: #94a3b8; transition: all .3s cubic-bezier(.16,1,.3,1); }
.abt .lens-tab:hover { color: #fff; }
.abt .lens-tab-on { color: #04121a; font-weight: 700; background: linear-gradient(135deg, #5ff0d6, #2ee6c5); box-shadow: 0 4px 20px -8px rgba(95,240,214,.8), 0 1px 0 rgba(255,255,255,.35) inset; }
.abt .lens-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin-top: 2rem; border-radius: 16px; overflow: hidden; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.07); }
.abt .lens-stats > div { padding: 1.1rem 1.2rem; background: rgba(8,14,36,.9); }
.abt .lens-stats dt { font-size: .66rem; letter-spacing: .16em; text-transform: uppercase; color: #64748b; }
.abt .lens-stats dd { margin-top: .5rem; font-size: 1.35rem; font-weight: 300; color: #fff; }

/* trust */
.abt .trust-chip { display: inline-flex; align-items: center; gap: .55rem; padding: .4rem .85rem; border-radius: 9999px; font-size: .74rem; letter-spacing: .08em; text-transform: uppercase; color: var(--c);
  background: color-mix(in srgb, var(--c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); }
.abt .trust-chip i { width: 7px; height: 7px; border-radius: 9999px; background: var(--c); box-shadow: 0 0 12px var(--c); }

/* limits */
.abt .lim { display: flex; flex-direction: column; border-top: 1px solid rgba(255,255,255,.08); }
.abt .lim-item { border-bottom: 1px solid rgba(255,255,255,.08); transition: background .4s; }
.abt .lim-on { background: linear-gradient(90deg, rgba(95,240,214,.05), transparent); }
.abt .lim-q { display: flex; width: 100%; align-items: center; gap: 1.2rem; padding: 1.4rem .4rem; text-align: left; }
.abt .lim-n { font-size: .75rem; color: #5ff0d6; }
.abt .lim-t { flex: 1; font-size: 1.3rem; font-weight: 300; color: #e2e8f0; transition: color .3s, transform .35s cubic-bezier(.16,1,.3,1); }
.abt .lim-q:hover .lim-t, .abt .lim-on .lim-t { color: #fff; transform: translateX(4px); }
.abt .lim-plus { position: relative; width: 14px; height: 14px; flex-shrink: 0; }
.abt .lim-plus::before, .abt .lim-plus::after { content: ""; position: absolute; left: 0; top: 6px; width: 14px; height: 2px; background: #5ff0d6; border-radius: 2px; transition: transform .4s cubic-bezier(.16,1,.3,1); }
.abt .lim-plus::after { transform: rotate(90deg); }
.abt .lim-on .lim-plus::after { transform: rotate(0deg); }
.abt .lim-a { display: grid; transition: grid-template-rows .5s cubic-bezier(.16,1,.3,1); }
.abt .lim-a > div { overflow: hidden; }
.abt .lim-a p { padding: 0 .4rem 1.5rem 2.55rem; max-width: 40rem; font-size: .96rem; line-height: 1.75; color: #94a3b8; }
.abt .road-chip { padding: .45rem .85rem; border-radius: 9999px; font-size: .78rem; color: #cbd5e1; border: 1px dashed rgba(95,240,214,.35); background: rgba(95,240,214,.04); transition: all .3s; }
.abt .road-chip:hover { border-style: solid; color: #fff; background: rgba(95,240,214,.1); transform: translateY(-2px); }

/* author */
.abt .auth { background: linear-gradient(135deg, rgba(46,230,197,.07), rgba(99,102,241,.05)), rgba(8,14,36,.8); }
.abt .auth-mono { position: relative; display: grid; place-items: center; width: 6.5rem; height: 6.5rem; border-radius: 9999px; background: radial-gradient(circle at 30% 25%, rgba(95,240,214,.25), rgba(8,14,36,.9) 70%); border: 1px solid rgba(95,240,214,.35); }
.abt .auth-mono span { font-size: 2.2rem; font-weight: 300; font-style: italic; color: #fff; }
.abt .auth-mono i { position: absolute; inset: -10px; border-radius: 9999px; border: 1px solid rgba(95,240,214,.18); border-top-color: rgba(95,240,214,.8); animation: abtSpin 9s linear infinite; }
.abt .auth-mono i + i { inset: -22px; border-color: rgba(196,181,253,.12); border-bottom-color: rgba(196,181,253,.6); animation-duration: 14s; animation-direction: reverse; }
@keyframes abtSpin { to { transform: rotate(360deg); } }
.abt .auth-links { display: flex; flex-direction: column; gap: .8rem; }
.abt .auth-link { position: relative; display: flex; width: 100%; align-items: center; gap: 1rem; padding: 1rem 1.2rem; text-align: left; border-radius: 18px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.09); transition: all .4s cubic-bezier(.16,1,.3,1); }
.abt .auth-link:hover { transform: translateX(6px); border-color: rgba(95,240,214,.5); background: rgba(95,240,214,.07); }
.abt .auth-ico { display: grid; place-items: center; width: 2.8rem; height: 2.8rem; flex-shrink: 0; border-radius: 14px; font-family: var(--font-mono), monospace; font-size: .85rem; font-weight: 700; color: #04121a; background: linear-gradient(135deg, #5ff0d6, #7dd3fc); }
.abt .auth-link b { display: block; font-size: .95rem; font-weight: 600; color: #fff; }
.abt .auth-link em { display: block; margin-top: .15rem; font-style: normal; font-size: .82rem; color: #94a3b8; word-break: break-all; }
.abt .auth-arrow { margin-left: auto; font-size: 1.1rem; color: #5ff0d6; transition: transform .35s cubic-bezier(.34,1.56,.64,1); }
.abt .auth-link:hover .auth-arrow { transform: translate(3px,-3px) scale(1.15); }

/* buttons */
.abt .abt-magnetic { display: inline-block; transition: transform .45s cubic-bezier(.16,1,.3,1); will-change: transform; }
.abt .abt-btn { position: relative; overflow: hidden; isolation: isolate; display: inline-flex; align-items: center; padding: .95rem 2rem; border-radius: 9999px; font-weight: 700; font-size: .92rem; color: #04121a;
  background: linear-gradient(135deg, #5ff0d6, #2ee6c5); box-shadow: 0 8px 28px -12px rgba(46,230,197,.72), 0 1px 0 rgba(255,255,255,.35) inset; transition: transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .35s; }
.abt .abt-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%); transform: translateX(-120%); transition: transform .8s cubic-bezier(.16,1,.3,1); }
.abt .abt-btn:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 18px 50px -10px rgba(46,230,197,.75); }
.abt .abt-btn:hover::after { transform: translateX(120%); }
.abt .abt-btn-ghost { display: inline-flex; padding: .95rem 2rem; border-radius: 9999px; font-weight: 500; font-size: .92rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,.14);
  background: linear-gradient(135deg,rgba(255,255,255,.045),rgba(255,255,255,.012)); transition: all .3s cubic-bezier(.16,1,.3,1); }
.abt .abt-btn-ghost:hover { color: #fff; border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.06); transform: translateY(-2px); }
.abt .abt-btn:active, .abt .abt-btn-ghost:active { transform: translateY(1px) scale(.985); }
.abt a:focus-visible, .abt button:focus-visible { outline: 2px solid var(--abt-mint); outline-offset: 4px; border-radius: 12px; }

@media (max-width: 640px) {
  .abt .pipe-dot { width: 2.6rem; height: 2.6rem; }
  .abt .pipe-track, .abt .pipe-fill { top: 1.3rem; left: 1.3rem; }
  .abt .flow { flex-direction: column; align-items: stretch; }
  .abt .flow-wire { width: 2px; height: 28px; align-self: center; }
  .abt .flow-pulse { width: 100%; height: 12px; animation-name: abtFlowV; }
  .abt .abt-glass { box-shadow: 0 16px 40px -28px rgba(0,0,0,.8); }
  .abt .abt-display { letter-spacing: -.035em; }
  .abt .abt-marquee-item { font-size: 1.5rem; gap: 1.25rem; padding-right: 1.25rem; }
  .abt .lim-t { font-size: 1.1rem; }
  .abt .lim-a p { padding-left: .4rem; }
  .abt .lens-stats dd { font-size: 1.1rem; }
}
@keyframes abtFlowV { from { transform: translateY(-14px); } to { transform: translateY(30px); } }

@media (prefers-reduced-motion: reduce) {
  .abt *, .abt *::before, .abt *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
  .abt .abt-glow, .abt .abt-ring, .abt .abt-dot { display: none; }
  .abt .abt-in, .abt .abt-char, .abt .term-line { opacity: 1; transform: none; }
  .abt .abt-marquee-track { animation: none; }
  .abt .pipe-timer { animation: none !important; transform: scaleX(0); }
  .abt .lens-scan { display: none; }
}
`;