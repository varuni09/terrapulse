"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";

/* ───────────────────────── Fonts ───────────────────────── */

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", axes: ["opsz"], style: ["normal", "italic"] });
const body = Manrope({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

/* ───────────────────────── Data ───────────────────────── */

const STACK = [
  {
    title: "Landsat 8/9 C2 L2",
    desc: "USGS thermal infrared sensor (TIRS) surface temperature telemetry at 30m resolution.",
    input: "Thermal infrared bands",
    output: "Surface temperature rasters",
  },
  {
    title: "Uber H3 Hexagons",
    desc: "Hierarchical spatial indexing (Resolution 8) standardizing multi-sensor aggregation.",
    input: "Pixel-level measurements",
    output: "Uniform hexagonal cells",
  },
  {
    title: "PySTAC & Rasterio",
    desc: "Cloud-native geospatial data fetching and spectral extraction without intermediate downloads.",
    input: "STAC catalog queries",
    output: "Extracted spectral values",
  },
  {
    title: "FastAPI Engine",
    desc: "Asynchronous Python spatial processing microservice serving zonal metrics in milliseconds.",
    input: "Cell-level statistics",
    output: "Zonal metrics over an API",
  },
  {
    title: "Next.js 14 App Router",
    desc: "Server-side streaming, fluid client interactivity, and tailwind typography execution.",
    input: "Zonal metrics",
    output: "Interactive urban insights",
  },
];

const HEADLINE: { w: string; em?: boolean }[] = [
  { w: "Illuminating" },
  { w: "microclimates" },
  { w: "with" },
  { w: "satellite", em: true },
  { w: "intelligence.", em: true },
];

const HIGHLIGHTS: { label: string; value: number; suffix: string; prefix?: string; hint: string }[] = [
  { label: "Thermal resolution", value: 30, suffix: "m", hint: "Landsat TIRS surface temperature" },
  { label: "H3 resolution", value: 8, suffix: "", prefix: "Res ", hint: "Equal-area hexagonal cells" },
  { label: "Pipeline steps", value: 5, suffix: "", hint: "From orbit to urban planning" },
  { label: "Satellite missions", value: 2, suffix: "", hint: "Landsat 8 and Landsat 9" },
];

const MARQUEE = ["Landsat 8/9", "Uber H3", "PySTAC", "Rasterio", "FastAPI", "Next.js", "Surface temperature", "Urban heat islands", "Climate resilience"];

const STEP_MS = 6500;

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

/* ───────────────────────── Ambient layers ───────────────────────── */

function ParticleField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const mouse = { x: -9999, y: -9999 };
    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number; hue: number };
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
      const n = Math.min(90, Math.floor((w * h) / 17000));
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.5 + 0.25,
        hue: Math.random() < 0.7 ? 172 : 236,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 20000) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / 141) * 0.2;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx + Math.sin((p.y + i * 11) * 0.005) * 0.08;
        p.y += p.vy + Math.cos((p.x + i * 5) * 0.005) * 0.08;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue},85%,65%,${p.o})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        for (let j = i + 1; j < ps.length; j++) {
          const q = ps[j];
          const ax = p.x - q.x;
          const ay = p.y - q.y;
          const dd = ax * ax + ay * ay;
          if (dd < 9500) {
            ctx.strokeStyle = `hsla(${p.hue},85%,65%,${(1 - dd / 9500) * 0.13})`;
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
  }, []);
  return <canvas ref={canvas} className="abt-particles" aria-hidden />;
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

/* ── Pipeline: auto-playing, clickable stepper ── */

function Pipeline() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = STACK[active];
  const last = STACK.length - 1;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* nodes */}
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

      {/* detail */}
      <div className="mt-12">
        <Glass className="rounded-[28px] p-7 md:p-10">
          <div key={active} className="pipe-panel grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="abt-num text-xs text-[#5ff0d6]">Step 0{active + 1} // {String(STACK.length).padStart(2, "0")}</p>
              <h3 className="abt-display mt-3 text-3xl font-light text-white md:text-5xl">{step.title}</h3>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400">{step.desc}</p>
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

          {/* auto-advance timer */}
          <div className="mt-8 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              key={`${active}-timer`}
              className="pipe-timer"
              style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={() => setActive((a) => (a + 1) % STACK.length)}
            />
          </div>
          <p className="mt-3 text-[12px] text-slate-600">{paused ? "Paused. Move away to resume." : "Auto-playing. Hover to pause or click a step."}</p>
        </Glass>
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */

export default function AboutPage() {
  const progress = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const glow = useRef<HTMLDivElement>(null);

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

  let charIndex = 0;

  return (
    <main
      ref={root}
      className={`${display.variable} ${body.variable} ${mono.variable} abt relative min-h-screen overflow-x-clip bg-[#050a1c] text-slate-100`}
    >
      <style>{CSS}</style>

      <div className="fixed left-0 top-0 z-[60] h-[2px] w-full bg-transparent">
        <div ref={progress} className="h-full origin-left bg-gradient-to-r from-[#2ee6c5] via-[#7dd3fc] to-[#f87171]" style={{ transform: "scaleX(0)" }} />
      </div>

      <ParticleField />
      <CursorFollower />
      <div ref={glow} className="abt-glow" aria-hidden />
      <div className="abt-grain" aria-hidden />

      {/* ───────── Hero ───────── */}
      <section className="relative px-6 pb-24 pt-36 md:px-12">
        <div className="abt-aurora" aria-hidden>
          <div className="abt-blob abt-blob-a" />
          <div className="abt-blob abt-blob-b" />
          <div className="abt-orbit abt-orbit-1" />
          <div className="abt-orbit abt-orbit-2" />
        </div>

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
            {HEADLINE.map((item, wi) => (
              <span key={wi} className="abt-wordmask mr-[0.22em]">
                {item.w.split("").map((ch) => {
                  const d = 300 + charIndex++ * 28;
                  return (
                    <span key={charIndex} className={`abt-char ${item.em ? "abt-char-em" : ""}`} style={{ animationDelay: `${d}ms` }}>
                      {ch}
                    </span>
                  );
                })}
              </span>
            ))}
          </h1>

          <p className="abt-in mt-8 max-w-2xl text-lg leading-relaxed text-slate-400" style={{ animationDelay: "1500ms" }}>
            Terrapulse converts raw satellite thermal bands into actionable spatial insights for urban climate resilience, identifying hyper-local Urban Heat Island (UHI) risks across metropolitan areas.
          </p>

          <div className="abt-in mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: "1700ms" }}>
            <Magnetic strength={0.35}>
              <a href="#pipeline" className="abt-btn">Explore the pipeline</a>
            </Magnetic>
            <Magnetic strength={0.25}>
              <Link href="/scenarios" className="abt-btn-ghost">Launch simulator</Link>
            </Magnetic>
          </div>
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

      {/* ───────── CTA ───────── */}
      <section className="relative px-6 pb-32 md:px-12">
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
    </main>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const CSS = `
.abt { font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; scroll-behavior: smooth; }
.abt .abt-display { font-family: var(--font-display), Georgia, serif; font-optical-sizing: auto; }
.abt .abt-display em { font-style: italic; font-weight: 300; }
.abt .abt-num { font-family: var(--font-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.abt ::selection { background: rgba(46,230,197,.3); }

.abt .abt-grad { background: linear-gradient(100deg,#7dd3fc 0%,#5ff0d6 35%,#c4b5fd 70%,#7dd3fc 100%); background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; animation: abtShimmer 7s linear infinite; padding-right: .06em; }
.abt .abt-grad-num { background: linear-gradient(180deg,#fff,#9fb3d1); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes abtShimmer { to { background-position: -220% 0; } }

.abt .abt-eyebrow { display: flex; align-items: center; gap: .85rem; margin-bottom: 1.4rem; font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; color: #7f8aa3; }
.abt .abt-eyebrow .abt-num { color: #5ff0d6; letter-spacing: .05em; }
.abt .abt-eyebrow i { display: block; height: 1px; width: 44px; background: linear-gradient(90deg,#5ff0d6,transparent); }

/* ambient */
.abt .abt-particles { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .7; }
.abt .abt-grain { position: fixed; inset: 0; z-index: 50; pointer-events: none; opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
.abt .abt-glow { position: fixed; top: 0; left: 0; z-index: 1; width: 500px; height: 500px; pointer-events: none; border-radius: 9999px;
  background: radial-gradient(circle, rgba(46,230,197,.10), transparent 62%); transition: transform .25s cubic-bezier(.16,1,.3,1); will-change: transform; }
.abt .abt-dot { position: fixed; top: -3px; left: -3px; z-index: 120; width: 6px; height: 6px; border-radius: 9999px; background: #5ff0d6; pointer-events: none; box-shadow: 0 0 12px #5ff0d6; }
.abt .abt-ring { position: fixed; top: -18px; left: -18px; z-index: 119; width: 36px; height: 36px; border-radius: 9999px; pointer-events: none;
  border: 1px solid rgba(95,240,214,.55); transition: width .35s cubic-bezier(.16,1,.3,1), height .35s cubic-bezier(.16,1,.3,1), margin .35s cubic-bezier(.16,1,.3,1), background .35s; mix-blend-mode: screen; }
.abt .abt-ring.abt-ring-hot { width: 64px; height: 64px; margin: -14px 0 0 -14px; background: rgba(95,240,214,.10); border-color: rgba(95,240,214,.9); }
@media (pointer: coarse) { .abt .abt-dot, .abt .abt-ring, .abt .abt-glow { display: none; } }

.abt .abt-aurora { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.abt .abt-blob { position: absolute; border-radius: 9999px; filter: blur(110px); will-change: transform; }
.abt .abt-blob-a { width: 620px; height: 620px; left: -8%; top: -10%; background: radial-gradient(circle, rgba(46,230,197,.5), transparent 65%); opacity: .35;
  transform: translateY(calc(var(--sy,0) * -0.1px)); animation: abtDrift1 20s ease-in-out infinite; }
.abt .abt-blob-b { width: 680px; height: 680px; right: -12%; top: 4%; background: radial-gradient(circle, rgba(99,102,241,.55), transparent 65%); opacity: .3;
  transform: translateY(calc(var(--sy,0) * -0.18px)); animation: abtDrift2 24s ease-in-out infinite; }
@keyframes abtDrift1 { 0%,100% { margin: 0; } 50% { margin: 60px 0 0 90px; } }
@keyframes abtDrift2 { 0%,100% { margin: 0; } 50% { margin: 80px 70px 0 0; } }
.abt .abt-orbit { position: absolute; border-radius: 9999px; border: 1px solid rgba(255,255,255,.06); right: 8%; top: 20%; }
.abt .abt-orbit-1 { width: 520px; height: 520px; animation: abtSpin 60s linear infinite; border-top-color: rgba(95,240,214,.45); }
.abt .abt-orbit-2 { width: 360px; height: 360px; right: calc(8% + 80px); top: calc(20% + 80px); animation: abtSpin 40s linear infinite reverse; border-bottom-color: rgba(125,211,252,.45); }
@keyframes abtSpin { to { transform: rotate(360deg); } }
@media (max-width: 768px) { .abt .abt-orbit { display: none; } }

/* hero entrance */
.abt .abt-in { opacity: 0; animation: abtIn 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes abtIn { from { opacity: 0; transform: translateY(18px); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }
.abt .abt-wordmask { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: .14em; margin-bottom: -.14em; white-space: nowrap; }
.abt .abt-char { display: inline-block; transform: translateY(115%) rotate(6deg); opacity: 0; animation: abtChar 1.1s cubic-bezier(.16,1,.3,1) forwards; }
@keyframes abtChar { to { transform: none; opacity: 1; } }
.abt .abt-char-em { font-style: italic; background: linear-gradient(100deg,#7dd3fc,#5ff0d6 40%,#c4b5fd 80%); background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.abt .abt-live { position: relative; width: 8px; height: 8px; border-radius: 9999px; background: #5ff0d6; }
.abt .abt-live::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: #5ff0d6; animation: abtPing 2s cubic-bezier(0,0,.2,1) infinite; }
@keyframes abtPing { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(3.2); opacity: 0; } }

/* marquee */
.abt .abt-marquee { position: relative; z-index: 2; overflow: hidden; border-block: 1px solid rgba(255,255,255,.06); padding: 1.3rem 0;
  -webkit-mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
.abt .abt-marquee-track { display: flex; width: max-content; animation: abtMarq 40s linear infinite; }
.abt .abt-marquee:hover .abt-marquee-track { animation-play-state: paused; }
.abt .abt-marquee-set { display: flex; }
.abt .abt-marquee-item { display: inline-flex; align-items: center; gap: 2.2rem; padding-right: 2.2rem; font-size: 2rem; font-weight: 300; font-style: italic; color: rgba(226,232,240,.5); white-space: nowrap; transition: color .4s; }
.abt .abt-marquee-item:hover { color: #5ff0d6; }
.abt .abt-marquee-item b { font-style: normal; font-size: .9rem; color: #7dd3fc; font-weight: 400; }
@keyframes abtMarq { to { transform: translateX(-50%); } }

/* glass (no backdrop blur: cheaper and smoother) */
.abt .abt-glass { position: relative; isolation: isolate; background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015)), rgba(8,14,36,.72);
  border: 1px solid rgba(255,255,255,.08); box-shadow: 0 1px 0 rgba(255,255,255,.05) inset, 0 30px 60px -30px rgba(0,0,0,.6);
  transition: transform .5s cubic-bezier(.16,1,.3,1); transform-style: preserve-3d; }
.abt .abt-glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: -1; opacity: 0; transition: opacity .4s;
  background: radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(46,230,197,.12), transparent 60%); }
.abt .abt-glass::after { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0; transition: opacity .4s;
  background: radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(95,240,214,.6), transparent 60%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.abt .abt-glass:hover::before, .abt .abt-glass:hover::after { opacity: 1; }
.abt .abt-cta { background: linear-gradient(180deg, rgba(46,230,197,.09), rgba(99,102,241,.04)), rgba(8,14,36,.75); border-color: rgba(46,230,197,.22); }

/* pipeline stepper */
.abt .pipe-track { position: absolute; left: 1.6rem; right: 1.6rem; top: 1.6rem; height: 2px; background: rgba(255,255,255,.08); border-radius: 9999px; }
.abt .pipe-fill { position: absolute; left: 1.6rem; top: 1.6rem; height: 2px; max-width: calc(100% - 3.2rem); background: linear-gradient(90deg,#2ee6c5,#7dd3fc); border-radius: 9999px; box-shadow: 0 0 14px rgba(46,230,197,.6); transition: width .8s cubic-bezier(.16,1,.3,1); }
.abt .pipe-node { position: relative; display: flex; flex-direction: column; align-items: center; gap: .7rem; cursor: pointer; }
.abt .pipe-dot { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; border-radius: 9999px; font-size: .8rem; color: #94a3b8;
  background: #0a1230; border: 1px solid rgba(255,255,255,.14); transition: all .5s cubic-bezier(.34,1.56,.64,1); }
.abt .pipe-node:hover .pipe-dot { border-color: rgba(95,240,214,.7); color: #fff; transform: scale(1.08); }
.abt .pipe-node-done .pipe-dot { color: #04121a; background: #2ee6c5; border-color: #2ee6c5; }
.abt .pipe-node-active .pipe-dot { color: #04121a; background: #5ff0d6; border-color: #5ff0d6; transform: scale(1.18); box-shadow: 0 0 0 8px rgba(46,230,197,.15), 0 0 30px rgba(46,230,197,.5); }
.abt .pipe-label { font-size: .72rem; letter-spacing: .06em; color: #64748b; transition: color .3s; }
.abt .pipe-node-active .pipe-label, .abt .pipe-node:hover .pipe-label { color: #e2e8f0; }
.abt .pipe-panel { animation: abtPanel .7s cubic-bezier(.16,1,.3,1); }
@keyframes abtPanel { from { opacity: 0; transform: translateY(14px); filter: blur(5px); } to { opacity: 1; transform: none; filter: none; } }
.abt .pipe-timer { height: 100%; width: 100%; transform-origin: left; background: linear-gradient(90deg,#2ee6c5,#7dd3fc); animation-name: abtTimer; animation-timing-function: linear; animation-fill-mode: forwards; }
@keyframes abtTimer { from { transform: scaleX(0); } to { transform: scaleX(1); } }

/* in -> out flow */
.abt .flow { display: flex; align-items: center; gap: .6rem; }
.abt .flow-box { flex: 1; padding: 1rem 1.1rem; border-radius: 1rem; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); }
.abt .flow-box-out { background: rgba(46,230,197,.07); border-color: rgba(46,230,197,.3); }
.abt .flow-k { font-size: .66rem; letter-spacing: .2em; text-transform: uppercase; color: #64748b; }
.abt .flow-v { margin-top: .4rem; font-size: .88rem; line-height: 1.35; color: #e2e8f0; }
.abt .flow-wire { position: relative; width: 44px; height: 2px; flex-shrink: 0; background: rgba(255,255,255,.1); overflow: hidden; border-radius: 9999px; }
.abt .flow-pulse { position: absolute; top: 0; left: 0; width: 14px; height: 100%; background: #5ff0d6; box-shadow: 0 0 10px #5ff0d6; animation: abtFlow 1.6s cubic-bezier(.65,0,.35,1) infinite; }
.abt .flow-pulse-2 { animation-delay: .8s; }
@keyframes abtFlow { from { transform: translateX(-16px); } to { transform: translateX(46px); } }

/* buttons */
.abt .abt-magnetic { display: inline-block; transition: transform .45s cubic-bezier(.16,1,.3,1); will-change: transform; }
.abt .abt-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; padding: .95rem 2rem; border-radius: 9999px; font-weight: 700; font-size: .92rem; color: #04121a;
  background: linear-gradient(135deg, #5ff0d6, #2ee6c5); box-shadow: 0 10px 40px -10px rgba(46,230,197,.6); transition: transform .35s cubic-bezier(.34,1.56,.64,1), box-shadow .35s; }
.abt .abt-btn::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%); transform: translateX(-120%); transition: transform .8s cubic-bezier(.16,1,.3,1); }
.abt .abt-btn:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 18px 50px -10px rgba(46,230,197,.75); }
.abt .abt-btn:hover::after { transform: translateX(120%); }
.abt .abt-btn-ghost { display: inline-flex; padding: .95rem 2rem; border-radius: 9999px; font-weight: 500; font-size: .92rem; color: #cbd5e1; border: 1px solid rgba(255,255,255,.14); transition: all .3s cubic-bezier(.16,1,.3,1); }
.abt .abt-btn-ghost:hover { color: #fff; border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.04); transform: translateY(-2px); }
.abt .abt-btn:focus-visible, .abt .abt-btn-ghost:focus-visible, .abt .tab:focus-visible, .abt .pipe-node:focus-visible { outline: 2px solid #5ff0d6; outline-offset: 3px; border-radius: 9999px; }

@media (max-width: 640px) {
  .abt .pipe-dot { width: 2.6rem; height: 2.6rem; }
  .abt .pipe-track, .abt .pipe-fill { top: 1.3rem; left: 1.3rem; }
  .abt .flow { flex-direction: column; align-items: stretch; }
  .abt .flow-wire { width: 2px; height: 28px; align-self: center; }
  .abt .flow-pulse { width: 100%; height: 12px; animation-name: abtFlowV; }
}
@keyframes abtFlowV { from { transform: translateY(-14px); } to { transform: translateY(30px); } }

/* ── Premium motion polish ── */
.abt { --abt-mint: #5ff0d6; --abt-ice: #a5e7ff; --abt-lilac: #c4b5fd; }
.abt .abt-aurora { isolation: isolate; }
.abt .abt-blob-a { animation: abtDrift1 26s cubic-bezier(.45,0,.55,1) infinite alternate; }
.abt .abt-blob-b { animation: abtDrift2 31s cubic-bezier(.45,0,.55,1) infinite alternate; }
.abt .abt-orbit { opacity: .75; transform-origin: center; }
.abt .abt-orbit-1 { box-shadow: 0 0 70px rgba(95,240,214,.035), inset 0 0 70px rgba(125,211,252,.025); }
.abt .abt-orbit-2 { box-shadow: 0 0 50px rgba(196,181,253,.04); }
.abt .abt-glass { overflow: hidden; border-color: rgba(186,230,253,.11); background: linear-gradient(145deg,rgba(255,255,255,.065),rgba(255,255,255,.012) 46%),rgba(8,14,36,.78); box-shadow: 0 1px 0 rgba(255,255,255,.07) inset, 0 24px 70px -38px rgba(0,0,0,.85); }
.abt .abt-glass::before { opacity: .35; transition: opacity .45s ease; }
.abt .abt-glass:hover { border-color: rgba(95,240,214,.24); box-shadow: 0 1px 0 rgba(255,255,255,.09) inset, 0 30px 90px -42px rgba(46,230,197,.24); }
.abt .abt-glass:hover::before { opacity: 1; }
.abt .abt-display { text-wrap: balance; }
.abt .abt-grad { animation: abtShimmer 10s ease-in-out infinite alternate; }
.abt .abt-char-em { text-shadow: 0 0 34px rgba(95,240,214,.08); }
.abt .abt-btn, .abt .abt-btn-ghost { isolation: isolate; transform: translateZ(0); }
.abt .abt-btn { box-shadow: 0 8px 28px -12px rgba(46,230,197,.72), 0 1px 0 rgba(255,255,255,.35) inset; }
.abt .abt-btn:active, .abt .abt-btn-ghost:active { transform: translateY(1px) scale(.985); }
.abt .abt-btn-ghost { background: linear-gradient(135deg,rgba(255,255,255,.045),rgba(255,255,255,.012)); }
.abt .pipe-node-active .pipe-dot { animation: pipeHalo 2.8s ease-in-out infinite; }
@keyframes pipeHalo { 0%,100% { box-shadow: 0 0 0 7px rgba(46,230,197,.10),0 0 22px rgba(46,230,197,.24); } 50% { box-shadow: 0 0 0 11px rgba(46,230,197,.045),0 0 38px rgba(46,230,197,.42); } }
.abt .pipe-timer { background: linear-gradient(90deg,#2ee6c5,#7dd3fc 55%,#c4b5fd); box-shadow: 0 0 12px rgba(95,240,214,.28); }
.abt .flow-box { transition: transform .35s cubic-bezier(.16,1,.3,1), border-color .35s, background .35s; }
.abt .flow-box:hover { transform: translateY(-3px); border-color: rgba(95,240,214,.3); background: rgba(95,240,214,.055); }
.abt .flow-pulse { box-shadow: 0 0 14px rgba(95,240,214,.8); }
.abt .hex { transform-box: fill-box; transform-origin: center; }
.abt .hex:hover { stroke: rgba(255,255,255,.9); stroke-width: 1.5px; }
.abt .tab { position: relative; }
.abt .tab-active { box-shadow: 0 4px 20px -8px rgba(95,240,214,.8),0 1px 0 rgba(255,255,255,.35) inset; }
.abt .abt-marquee-item { transition: color .35s, transform .35s; }
.abt .abt-marquee-item:hover { transform: translateY(-2px); }
.abt a:focus-visible, .abt button:focus-visible { outline: 2px solid var(--abt-mint); outline-offset: 4px; }
@media (hover: hover) and (pointer: fine) {
  .abt .abt-glass[style*="perspective"] { will-change: transform; }
}
@media (max-width: 640px) {
  .abt .abt-glass { box-shadow: 0 16px 40px -28px rgba(0,0,0,.8); }
  .abt .abt-display { letter-spacing: -.035em; }
  .abt .abt-marquee-item { font-size: 1.5rem; gap: 1.25rem; padding-right: 1.25rem; }
}

@media (prefers-reduced-motion: reduce) {
  .abt *, .abt *::before, .abt *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
  .abt .abt-glow, .abt .abt-ring, .abt .abt-dot, .abt .abt-orbit { display: none; }
  .abt .abt-in, .abt .abt-char { opacity: 1; transform: none; }
  .abt .abt-marquee-track { animation: none; }
  .abt .pipe-timer { animation: none !important; transform: scaleX(0); }
}
`;