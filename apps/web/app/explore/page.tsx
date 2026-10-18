"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Navbar from "../components/Navbar";
import AiAnalyst from "../components/AiAnalyst";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { cellArea, cellToBoundary, cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { NDVI_MAX, PALETTES, RANGES, RANGE_ORDER, equityScore, type LayerId, type RangeId } from "../../lib/gee-config";
import { LandsatProvenanceCard } from "@/components/LandsatProvenanceCard";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

/* ───────────────────────── types ───────────────────────── */

type Layer = LayerId;
type ViewMode = "cinematic" | "flat" | "street";
type Slot = "a" | "b";

type Sel = {
  lat: number;
  lon: number;
  h3Index: string;
  h3AreaKm2: number;
  lst: number | null;
  ndvi: number | null;
  equity: number | null;
  air: { temp: number; humidity: number | null; skin: number | null; time: string } | null;
  airState: "loading" | "ok" | "error";
  sampleRange?: RangeId;
  samplePeriod?: Period;
  sampleLatest?: LatestObservation | null;
  sampleNote?: string;
  name?: string;
  state: "loading" | "ok" | "nodata" | "water" | "error";
};

type Place = {
  id?: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

type Period = { start: string; end: string };
type LatestObservation = { date: string | null; source: string };
type GeeStatus = { state: "idle" | "loading" | "ready" | "throttled" | "error"; message?: string };

type EarthEngineSample = {
  latitude: number;
  longitude: number;
  data: { lst_c?: number | null; ndvi?: number | null } | null;
  status?: "ok" | "water" | "no_data";
  usedRange?: RangeId | null;
  fallback?: boolean;
  period?: Period;
  latest?: LatestObservation | null;
  note?: string;
};
type LiveGrid = {
  bounds: { west: number; east: number; south: number; north: number };
  width: number;
  height: number;
  updatedAt: string;
  points: { latitude: number; longitude: number; temperature: number | null; humidity: number | null }[];
};
type LiveGridWorkerResponse = { id: number; blob?: Blob; error?: string };
type LiveGridStatus = "idle" | "loading" | "ready" | "error" | "zoom";
type HotspotCity = { name: string; country: string; lat: number; lon: number; lst: number; airNow?: number; lstNow?: number };
type CompareStatus = "idle" | "loading" | "ready" | "error";
type DecisionExportData = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  h3AreaKm2: number;
  lst: number | null;
  ndvi: number | null;
  equity: number | null;
  sampleRange: RangeId;
  samplePeriod: Period | null;
  latest: LatestObservation | null;
};
type HotspotStatus = "loading" | "ready" | "error";
type PeriodComparison = {
  range: RangeId;
  usedRange: RangeId | null;
  lst: number | null;
  ndvi: number | null;
  period: Period | null;
  status: "ok" | "water" | "no_data";
};

/* ───────────────────────── constants ───────────────────────── */

const RAMPS = PALETTES;
const LABELS: Record<Layer, string> = { lst: "Surface temp", ndvi: "Vegetation", equity: "Heat Equity Risk" };

/**
 * No backdrop-filter here on purpose. A blur sitting on top of a WebGL canvas forces the
 * browser to re-blur the map on every single frame, which is the biggest cause of lag.
 * A slightly more opaque gradient gives the same premium glass look at almost zero cost.
 */
const GLASS =
  "bg-gradient-to-b from-[#0a1230]/95 to-[#050a22]/95 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.08)] rounded-2xl";

const GEE_SRC = "gee-src";
const GEE_LYR = "gee-layer";
const LIVE_SRC = "live-weather-src";
const LIVE_LYR = "live-weather-layer";
const LIVE_MIN_ZOOM = 3.5;
const LIVE_OPACITY = 0.92;
const GEE_MAX_ZOOM = 10;
const GEE_OPACITY = 0.85;
const FADE_MS = 450;
const MAX_AUTO_RETRIES = 3;
const HOME = { center: [78.9629, 22.0] as [number, number], zoom: 4.8, pitch: 40, bearing: -15 };
const LIVE_COLORS = ["#2c7bb6", "#4aa3ff", "#2ee6c5", "#ffd166", "#ff5a3d"];
const LIVE_TEMP_MIN = -10;
const LIVE_TEMP_MAX = 45;
const BLANK_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/* ───────────────────────── helpers ───────────────────────── */

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const riskLabel = (v: number) => (v >= 70 ? "Severe" : v >= 50 ? "High" : v >= 30 ? "Moderate" : "Low");

function ramp(t: number, cols: string[]) {
  const x = clamp(t) * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(x));
  const f = x - i;
  const a = rgb(cols[i]);
  const b = rgb(cols[i + 1]);
  return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("");
}

function legendBounds(layer: Layer, range: RangeId): [string, string] {
  if (layer === "lst") return [`${RANGES[range].lstMin}°C`, `${RANGES[range].lstMax}°C`];
  if (layer === "ndvi") return ["0.00", NDVI_MAX.toFixed(2)];
  return ["0", "100"];
}

function latestObservationLabel(latest: LatestObservation | null) {
  if (!latest?.date) return `Newest satellite image: date unavailable · ${latest?.source ?? "MODIS"}`;
  const [year, month, day] = latest.date.split("-").map(Number);
  const observedUtc = Date.UTC(year, month - 1, day);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysAgo = Math.max(0, Math.floor((todayUtc - observedUtc) / 86_400_000));
  return `Newest satellite image: ${latest.date} (${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago) · ${latest.source}`;
}

async function fetchTileUrl(layer: Layer, range: RangeId): Promise<{ url: string; period: Period; latest: LatestObservation | null }> {
  const res = await fetch(`/api/gee/tiles?layer=${layer}&range=${range}`);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    throw new Error(json?.detail || json?.error || json?.message || `HTTP ${res.status}: ${text.slice(0, 140)}`);
  }
  const url = json?.tileUrl ?? json?.urlFormat;
  if (typeof url !== "string" || !url) throw new Error("The tiles route returned no tileUrl.");
  if (!url.includes("{z}") || !url.includes("{x}") || !url.includes("{y}")) {
    throw new Error("tileUrl must contain {z}/{x}/{y} placeholders.");
  }
  return { url, period: json?.period ?? { start: "", end: "" }, latest: json?.latest ?? null };
}

async function fetchEarthEngineSample(
  lat: number,
  lon: number,
  range: RangeId,
  signal?: AbortSignal
): Promise<EarthEngineSample> {
  const res = await fetch(
    `/api/gee/sample?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&range=${range}`,
    { signal, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Earth Engine sample failed (${res.status})`);
  return res.json();
}

async function fetchAirNow(lat: number, lon: number, signal?: AbortSignal) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,soil_temperature_0cm&timezone=auto`,
    { signal }
  );
  if (!res.ok) throw new Error(`Air temperature failed (${res.status})`);
  const d = await res.json();
  const c = d?.current;
  if (!c || typeof c.temperature_2m !== "number") throw new Error("No current weather returned");
  return {
    temp: c.temperature_2m as number,
    humidity: typeof c.relative_humidity_2m === "number" ? (c.relative_humidity_2m as number) : null,
    skin: typeof c.soil_temperature_0cm === "number" ? (c.soil_temperature_0cm as number) : null,
    time: String(c.time ?? ""),
  };
}

function updateLiveImage(map: maplibregl.Map, grid: LiveGrid, url: string) {
  const source = map.getSource(LIVE_SRC) as maplibregl.ImageSource | undefined;
  if (!source || typeof source.updateImage !== "function") return;
  source.updateImage({
    url,
    coordinates: [
      [grid.bounds.west, grid.bounds.north],
      [grid.bounds.east, grid.bounds.north],
      [grid.bounds.east, grid.bounds.south],
      [grid.bounds.west, grid.bounds.south],
    ],
  });
}

function updatedClock(value: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
}

function isHotspotCity(value: unknown): value is HotspotCity {
  if (!value || typeof value !== "object") return false;
  const city = value as Record<string, unknown>;
  return city.live === true && typeof city.name === "string" && typeof city.country === "string" &&
    typeof city.lat === "number" && Number.isFinite(city.lat) && typeof city.lon === "number" &&
    Number.isFinite(city.lon) && typeof city.lst === "number" && Number.isFinite(city.lst);
}

async function geocode(q: string): Promise<Place | null> {
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`
    );
    const d = await r.json();
    if (d.results?.length) return d.results[0];
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (d.length) return { name: d[0].display_name.split(",")[0], latitude: +d[0].lat, longitude: +d[0].lon };
  } catch {
    /* ignore */
  }
  return null;
}

/* ───────────────────────── memoized panels ─────────────────────────
   Typing in the search box or loading a sample re-renders the page. These panels only
   re-render when their own props change, so the map overlays stay cheap. */

const Legend = memo(function Legend({ layer, range, period, latest }: { layer: Layer; range: RangeId; period: Period | null; latest: LatestObservation | null }) {
  const R = RANGES[range];
  const [lo, hi] = legendBounds(layer, range);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`absolute bottom-5 left-16 z-30 max-w-[calc(100%-5rem)] p-4 md:w-[24rem] ${GLASS}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">
        <span>{LABELS[layer]}</span>
        <span className="text-[#7dd3fc]">{R.short}</span>
      </div>
      <div
        className="h-2 rounded-full transition-[background] duration-500"
        style={{ background: `linear-gradient(to right, ${RAMPS[layer].join(",")})` }}
      />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
      <div className="mt-2 text-[10px] normal-case leading-snug text-slate-500">
        {layer === "equity" ? "Hotter and barer places score higher. " : ""}
        MODIS satellite composite · {period?.start && period.end ? `${period.start} to ${period.end}` : R.blurb}. {latestObservationLabel(latest)} · satellite data are not live.
      </div>
    </motion.div>
  );
});

const LiveLegend = memo(function LiveLegend({ latest }: { latest: LatestObservation | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`absolute bottom-5 left-16 z-30 max-w-[calc(100%-5rem)] p-4 md:w-[24rem] ${GLASS}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[10px] uppercase tracking-[0.2em] text-slate-300">
        <span>Live 2 m air temperature</span><span className="text-[#7dd3fc]">°C</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${LIVE_COLORS.join(",")})` }} />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums"><span>{LIVE_TEMP_MIN}°C</span><span>{LIVE_TEMP_MAX}°C</span></div>
      <div className="mt-2 text-[10px] normal-case leading-snug text-slate-400">
        Live = Open-Meteo weather-model air temperature, not satellite. {latestObservationLabel(latest)} · satellite data are not live.
      </div>
    </motion.div>
  );
});

function saveBlob(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportDecisionPanel({ selectedCellData }: { selectedCellData: DecisionExportData | null }) {
  const exportCSV = () => {
    if (!selectedCellData) return;
    const csvValue = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows: [string, unknown][] = [
      ["Cell_ID", selectedCellData.id], ["Location", selectedCellData.name],
      ["Latitude", selectedCellData.lat], ["Longitude", selectedCellData.lon],
      ["Affected_Area_km2", selectedCellData.h3AreaKm2], ["Surface_Temp_C", selectedCellData.lst],
      ["NDVI", selectedCellData.ndvi], ["Heat_Equity_Risk", selectedCellData.equity],
      ["Sample_Range", selectedCellData.sampleRange],
      ["Period_Start", selectedCellData.samplePeriod?.start], ["Period_End", selectedCellData.samplePeriod?.end],
      ["Latest_Image_Date", selectedCellData.latest?.date], ["Latest_Image_Source", selectedCellData.latest?.source],
    ];
    saveBlob(`terrapulse_${selectedCellData.id}.csv`, new Blob([rows.map(([field, value]) => `${field},${csvValue(value)}`).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  };

  const exportGeoJSON = () => {
    if (!selectedCellData) return;
    const boundary = cellToBoundary(selectedCellData.id, true) as [number, number][];
    const ring = [...boundary, boundary[0]];
    const feature = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        ...selectedCellData,
        samplingMethod: "MODIS metrics sampled over a 1.5 km radius buffer centered at this H3 Res 8 cell.",
      },
    };
    saveBlob(`terrapulse_${selectedCellData.id}.geojson`, new Blob([JSON.stringify(feature, null, 2)], { type: "application/geo+json" }));
  };

  if (!selectedCellData) return null;

  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <button type="button" onClick={exportCSV} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/20">
        Export cell CSV
      </button>
      <button type="button" onClick={exportGeoJSON} className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/20">
        Export H3 GeoJSON
      </button>
      <button type="button" onClick={() => window.print()} className="col-span-2 rounded-xl border border-white/15 bg-slate-800/80 px-3 py-2 text-[10px] font-medium text-slate-200 transition hover:bg-slate-700">
        Print selected-cell report
      </button>
    </div>
  );
}

const StatusCard = memo(function StatusCard({
  gee,
  layer,
  range,
  period,
  latest,
  onRetry,
}: {
  gee: GeeStatus;
  layer: Layer;
  range: RangeId;
  period: Period | null;
  latest: LatestObservation | null;
  onRetry: () => void;
}) {
  const R = RANGES[range];
  return (
    <AnimatePresence>
      {gee.state !== "idle" && (
        <motion.div
          key={gee.state}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`absolute bottom-[8.5rem] left-16 z-30 max-w-[calc(100%-5rem)] px-4 py-2.5 text-[11px] md:max-w-[24rem] ${GLASS}`}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                gee.state === "ready"
                  ? "bg-[#2ee6c5]"
                  : gee.state === "loading" || gee.state === "throttled"
                    ? "animate-pulse bg-amber-300"
                    : "bg-rose-400"
              }`}
            />
            <div className="min-w-0">
              {gee.state === "throttled" && (
                <p className="text-amber-200">Earth Engine is rate-limiting requests. Retrying automatically…</p>
              )}
              {gee.state === "loading" && (
                <p className="text-slate-300">
                  Earth Engine · loading {LABELS[layer].toLowerCase()} ({R.short})…
                </p>
              )}
              {gee.state === "ready" && (
                <p className="text-slate-300">
                  MODIS satellite composite · {R.label}
                  {period?.start && <span className="block text-slate-500">{period.start} to {period.end}</span>}
                  <span className="block text-slate-500">{latestObservationLabel(latest)} · satellite data are not live.</span>
                </p>
              )}
              {gee.state === "error" && (
                <>
                  <p className="text-rose-300">Earth Engine layer failed</p>
                  <p className="mt-1 break-words text-slate-400">{gee.message}</p>
                  <button
                    onClick={onRetry}
                    className="mt-2 rounded-lg bg-white/10 px-2.5 py-1 font-semibold uppercase tracking-wider text-white hover:bg-white/20"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

const Inspector = memo(function Inspector({
  sel,
  range,
  onClose,
  onSelectCell,
  compareRange,
  onCompareRangeChange,
  comparison,
  compareStatus,
  onCompare,
  hotspots,
  hotspotStatus,
  onSelectHotspot,
}: {
  sel: Sel;
  range: RangeId;
  onClose: () => void;
  onSelectCell: (cellId: string) => void;
  compareRange: RangeId;
  onCompareRangeChange: (range: RangeId) => void;
  comparison: PeriodComparison | null;
  compareStatus: CompareStatus;
  onCompare: () => void;
  hotspots: HotspotCity[];
  hotspotStatus: HotspotStatus;
  onSelectHotspot: (city: HotspotCity) => void;
}) {
  const sampleRange = sel.sampleRange ?? range;
  const R = RANGES[sampleRange];
  const neighborhood = gridDisk(sel.h3Index, 1);
  const exportData: DecisionExportData = {
    id: sel.h3Index,
    name: sel.name ?? `H3 Res 8 ${sel.h3Index}`,
    lat: sel.lat,
    lon: sel.lon,
    h3AreaKm2: sel.h3AreaKm2,
    lst: sel.lst,
    ndvi: sel.ndvi,
    equity: sel.equity,
    sampleRange,
    samplePeriod: sel.samplePeriod ?? null,
    latest: sel.sampleLatest ?? null,
  };

  const bars: { key: Layer; label: string; text: string; pct: number }[] = [
    {
      key: "lst",
      label: "MODIS Surface Temp",
      text: sel.lst != null ? `${sel.lst.toFixed(1)}°C` : "—",
      pct: sel.lst != null ? (sel.lst - R.lstMin) / (R.lstMax - R.lstMin) : 0,
    },
    {
      key: "ndvi",
      label: "Vegetation (NDVI)",
      text: sel.ndvi != null ? sel.ndvi.toFixed(2) : "—",
      pct: sel.ndvi != null ? sel.ndvi / NDVI_MAX : 0,
    },
    {
      key: "equity",
      label: "Heat Equity Risk",
      text: sel.equity != null ? `${sel.equity} / 100 · ${riskLabel(sel.equity)}` : "—",
      pct: sel.equity != null ? sel.equity / 100 : 0,
    },
  ];

  const stateLine: Record<Sel["state"], { text: string; cls: string }> = {
    loading: { text: "Reading satellite data…", cls: "text-amber-300" },
    ok: { text: `MODIS · ${R.label}${sel.sampleRange && sel.sampleRange !== range ? ` (fallback from ${RANGES[range].short})` : ""}`, cls: "text-[#2ee6c5]" },
    nodata: { text: "No MODIS data in this period or longer fallback periods", cls: "text-slate-400" },
    water: { text: "Open water · satellite land metrics unavailable", cls: "text-slate-400" },
    error: { text: "Satellite request failed", cls: "text-rose-300" },
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 40, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className={`absolute right-5 top-20 z-30 max-h-[calc(100%-7rem)] w-72 overflow-y-auto p-5 ${GLASS}`}
    >
      <div className="flex items-start justify-between">
        <div className="pr-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#2ee6c5]">Location</div>
          <h4 className="mt-1 text-base leading-snug text-white" style={{ fontFamily: "var(--font-display), serif" }}>
            {sel.name ?? "Selected point"}
          </h4>
          <div className="mt-0.5 text-[10px] tabular-nums text-slate-500">
            {sel.lat.toFixed(4)}°, {sel.lon.toFixed(4)}°
          </div>
          <div className="mt-1 text-[10px] text-slate-400">H3 Res 8 · {sel.h3Index} · {sel.h3AreaKm2.toFixed(3)} km²</div>
          <label className="mt-2 block text-[10px] uppercase text-slate-500">
            Neighborhood cell
            <select value={sel.h3Index} onChange={(event) => onSelectCell(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] normal-case text-slate-200">
              {neighborhood.map((cellId) => <option key={cellId} value={cellId}>{cellId === sel.h3Index ? "Selected cell · " : "Neighbor · "}{cellId}</option>)}
            </select>
          </label>
          <div className={`mt-1 text-[10px] ${stateLine[sel.state].cls}`}>{stateLine[sel.state].text}</div>
          {sel.samplePeriod?.start && <div className="mt-1 text-[10px] text-slate-500">Composite window: {sel.samplePeriod.start} to {sel.samplePeriod.end}.</div>}
          <div className="mt-1 text-[10px] leading-snug text-slate-500">{latestObservationLabel(sel.sampleLatest ?? null)} · satellite data are not live.</div>
          {sel.sampleNote && <div className="mt-1 text-[10px] leading-snug text-slate-400">{sel.sampleNote}</div>}
        </div>
        <button onClick={onClose} className="text-slate-500 transition-colors hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {bars.map((b) => (
          <div key={b.key}>
            <div className="flex justify-between text-[10px] uppercase text-slate-400">
              <span>{b.label}</span>
              <span className="font-semibold normal-case text-white">{b.text}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width,background-color] duration-700 ease-out"
                style={{ width: `${clamp(b.pct) * 100}%`, background: ramp(clamp(b.pct), RAMPS[b.key]) }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/60 p-3 text-[11px] text-slate-400">
        <span className="mb-1 block font-semibold text-amber-400">Skin Temp (LST) Note</span>
        Surface temperature reflects ground skin radiative thermal heat, which can run 4–12 °C higher than 2m ambient air weather forecasts during daytime peak hours.
      </div>

      <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Temporal period comparison</h5>
        <div className="mt-2 flex gap-2">
          <select value={compareRange} onChange={(event) => onCompareRangeChange(event.target.value as RangeId)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-200">
            {RANGE_ORDER.map((periodRange) => <option key={periodRange} value={periodRange}>{RANGES[periodRange].label}</option>)}
          </select>
          <button type="button" disabled={compareStatus === "loading"} onClick={onCompare} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-50">
            {compareStatus === "loading" ? "Loading…" : "Compare"}
          </button>
        </div>
        {comparison && (
          <div className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Current {RANGES[sampleRange].short}: LST {sel.lst == null ? "—" : `${sel.lst.toFixed(2)}°C`}, NDVI {sel.ndvi?.toFixed(2) ?? "—"}.<br />
            {RANGES[comparison.usedRange ?? comparison.range].short}: LST {comparison.lst == null ? "—" : `${comparison.lst.toFixed(2)}°C`}, NDVI {comparison.ndvi?.toFixed(2) ?? "—"}
            {comparison.period?.start ? ` · ${comparison.period.start} to ${comparison.period.end}` : ""}.
            {comparison.status === "water" ? " This cell is classified as open water." : comparison.status === "no_data" ? " No valid satellite metrics were found for this period." : ""}
          </div>
        )}
        {compareStatus === "error" && <p role="status" className="mt-2 text-[10px] text-rose-300">Period comparison unavailable.</p>}
      </section>

      <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <h5 className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Live city hotspot ranking</h5>
        <p className="mt-1 text-[9px] text-slate-500">Daily peak modelled surface temperature · Open-Meteo</p>
        {hotspotStatus === "loading" && <p className="mt-2 text-[10px] text-slate-400">Loading live city data…</p>}
        {hotspotStatus === "error" && <p className="mt-2 text-[10px] text-rose-300">Live city ranking unavailable.</p>}
        {hotspotStatus === "ready" && hotspots.length === 0 && <p className="mt-2 text-[10px] text-slate-400">No live city temperatures available.</p>}
        <div className="mt-2 space-y-1">
          {hotspots.slice(0, 5).map((city, index) => (
            <button key={city.name} type="button" onClick={() => onSelectHotspot(city)} className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-[10px] hover:bg-white/5">
              <span className="truncate text-slate-300">{index + 1}. {city.name}</span>
              <span className="shrink-0 font-mono text-amber-200">{city.lst.toFixed(1)}°C</span>
            </button>
          ))}
        </div>
      </section>

      <ExportDecisionPanel selectedCellData={exportData} />

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex items-baseline justify-between text-[10px] uppercase text-slate-400">
          <span>Air temp right now</span>
          <span className="text-[#7dd3fc]">Live model</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-white">
          {sel.airState === "loading" && <span className="text-slate-500">Loading…</span>}
          {sel.airState === "error" && <span className="text-slate-500">Unavailable</span>}
          {sel.airState === "ok" && sel.air && (
            <>
              {sel.air.temp.toFixed(1)}°C
              {sel.air.humidity != null && (
                <span className="ml-2 text-xs font-normal text-slate-400">{sel.air.humidity}% humidity</span>
              )}
            </>
          )}
        </div>
        {sel.airState === "ok" && sel.air?.skin != null && (
          <div className="mt-2 flex items-baseline justify-between text-[10px] text-slate-400">
            <span>Modelled surface (skin)</span><span className="text-white">{sel.air.skin.toFixed(1)}°C</span>
          </div>
        )}
        <p className="mt-1 text-[10px] normal-case leading-snug text-slate-500">
          Open-Meteo weather model · air at 2 m
          {sel.air?.time ? ` · ${sel.air.time.slice(11, 16)} local` : ""}. The MODIS surface value above is a satellite composite, not live.
        </p>
      </div>
      <div className="mt-4">
        <LandsatProvenanceCard lat={sel.lat} lon={sel.lon} />
      </div>
    </motion.aside>
  );
});

/* ───────────────────────── component ───────────────────────── */

export default function ExplorePage() {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const beforeIdRef = useRef<string | undefined>(undefined);
  const urlCache = useRef<Record<string, { url: string; period: Period; latest: LatestObservation | null }>>({});
  const activeGee = useRef<string | null>(null);
  const activeSlot = useRef<Slot | null>(null);
  const pendingRef = useRef<{ slot: Slot; key: string; seq: number } | null>(null);
  const geeSeq = useRef(0);
  const sampleAbort = useRef<AbortController | null>(null);
  const reverseAbort = useRef<AbortController | null>(null);
  const retryN = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const promoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveAbort = useRef<AbortController | null>(null);
  const compareAbort = useRef<AbortController | null>(null);
  const liveMoveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const liveSequence = useRef(0);
  const liveGridRef = useRef<LiveGrid | null>(null);
  const liveModeRef = useRef(false);
  const liveWorker = useRef<Worker | null>(null);
  const liveWorkerRequests = useRef(new Map<number, { resolve: (url: string) => void; reject: (error: Error) => void }>());
  const liveWorkerSequence = useRef(0);
  const liveImageUrl = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [layer, setLayer] = useState<Layer>("lst");
  const [range, setRange] = useState<RangeId>("30d");
  const [orbit, setOrbit] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cinematic");
  const [gee, setGee] = useState<GeeStatus>({ state: "idle" });
  const [geePeriod, setGeePeriod] = useState<Period | null>(null);
  const [geeLatest, setGeeLatest] = useState<LatestObservation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveGridStatus>("idle");
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [compareRange, setCompareRange] = useState<RangeId>("90d");
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [compareStatus, setCompareStatus] = useState<CompareStatus>("idle");
  const [hotspots, setHotspots] = useState<HotspotCity[]>([]);
  const [hotspotStatus, setHotspotStatus] = useState<HotspotStatus>("loading");

  const rangeRef = useRef<RangeId>(range);
  rangeRef.current = range;
  const selRef = useRef<Sel | null>(sel);
  selRef.current = sel;
  const geeRef = useRef<GeeStatus>(gee);
  geeRef.current = gee;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/live/cities", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Live city request failed (${response.status})`);
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object" || !("cities" in payload) || !Array.isArray(payload.cities)) {
          throw new Error("Live city response did not include a city list");
        }
        const ranked = payload.cities.filter(isHotspotCity).sort((a, b) => b.lst - a.lst);
        setHotspots(ranked);
        setHotspotStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Live city hotspot ranking failed:", error);
        setHotspotStatus("error");
      }
    })();
    return () => controller.abort();
  }, []);

  /* ── layer slots: two raster layers that crossfade, so switching never flashes blank ── */

  const removeSlot = useCallback((m: maplibregl.Map, slot: Slot) => {
    const lid = `${GEE_LYR}-${slot}`;
    const sid = `${GEE_SRC}-${slot}`;
    if (m.getLayer(lid)) m.removeLayer(lid);
    if (m.getSource(sid)) m.removeSource(sid);
  }, []);

  const promote = useCallback(
    (slot: Slot, seq: number) => {
      const m = mapRef.current;
      if (!m || seq !== geeSeq.current) return;
      clearTimeout(promoteTimer.current);

      const old = activeSlot.current;
      const lid = `${GEE_LYR}-${slot}`;
      if (m.getLayer(lid)) m.setPaintProperty(lid, "raster-opacity", liveModeRef.current ? 0 : GEE_OPACITY);

      if (old && old !== slot) {
        const oldLid = `${GEE_LYR}-${old}`;
        if (m.getLayer(oldLid)) m.setPaintProperty(oldLid, "raster-opacity", 0);
        setTimeout(() => {
          const mm = mapRef.current;
          if (mm && activeSlot.current !== old && pendingRef.current?.slot !== old) removeSlot(mm, old);
        }, FADE_MS + 120);
      }

      activeSlot.current = slot;
      if (pendingRef.current) activeGee.current = pendingRef.current.key;
      pendingRef.current = null;
      retryN.current = 0;
      setGee({ state: "ready" });
    },
    [removeSlot]
  );

  const retryTiles = useCallback(() => {
    const m = mapRef.current;
    const slot = pendingRef.current?.slot ?? activeSlot.current;
    const key = pendingRef.current?.key ?? activeGee.current;
    const base = key ? urlCache.current[key]?.url : undefined;
    const src = slot ? (m?.getSource(`${GEE_SRC}-${slot}`) as any) : undefined;
    if (!m || !base || !src || typeof src.setTiles !== "function") return;
    retryN.current += 1;
    src.setTiles([`${base}${base.includes("?") ? "&" : "?"}r=${retryN.current}`]);
  }, []);

  const showGee = useCallback(
    async (l: Layer, rg: RangeId, force = false) => {
      const m = mapRef.current;
      if (!m) return;
      const key = `${l}:${rg}`;

      // Already showing this one. If something else was loading, cancel it and settle.
      if (!force && activeGee.current === key && activeSlot.current) {
        if (pendingRef.current) {
          geeSeq.current += 1;
          clearTimeout(promoteTimer.current);
          clearTimeout(retryTimer.current);
          removeSlot(m, pendingRef.current.slot);
          pendingRef.current = null;
          setGee({ state: "ready" });
        }
        return;
      }

      const seq = ++geeSeq.current;
      retryN.current = 0;
      clearTimeout(retryTimer.current);
      clearTimeout(promoteTimer.current);
      setGee({ state: "loading" });

      try {
        if (force) delete urlCache.current[key];
        let entry = urlCache.current[key];
        if (!entry) {
          entry = await fetchTileUrl(l, rg);
          urlCache.current[key] = entry;
        }
        if (seq !== geeSeq.current || mapRef.current !== m) return;

        const slot: Slot = activeSlot.current === "a" ? "b" : "a";
        removeSlot(m, slot);
        pendingRef.current = { slot, key, seq };

        m.addSource(`${GEE_SRC}-${slot}`, {
          type: "raster",
          tiles: [entry.url],
          tileSize: 512,
          maxzoom: GEE_MAX_ZOOM,
        });
        m.addLayer(
          {
            id: `${GEE_LYR}-${slot}`,
            type: "raster",
            source: `${GEE_SRC}-${slot}`,
            paint: {
              "raster-opacity": 0,
              "raster-opacity-transition": { duration: FADE_MS, delay: 0 },
              "raster-fade-duration": 0,
              "raster-resampling": "linear",
            } as any,
          },
          beforeIdRef.current
        );
        setGeePeriod(entry.period);
        setGeeLatest(entry.latest);

        // Safety net: if the "fully loaded" event never fires, reveal the layer anyway.
        promoteTimer.current = setTimeout(() => {
          if (geeRef.current.state !== "error") promote(slot, seq);
        }, 8000);
      } catch (err: any) {
        if (seq !== geeSeq.current) return;
        console.error("Earth Engine layer failed:", err);
        setGee({ state: "error", message: err?.message ?? "Unknown error" });
      }
    },
    [promote, removeSlot]
  );

  const placeMarker = useCallback((lng: number, lat: number) => {
    const m = mapRef.current;
    if (!m) return;
    markerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "tp-marker";
    el.innerHTML = "<span></span><i></i>";
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
  }, []);

  const loadPoint = useCallback((lat: number, lng: number) => {
    sampleAbort.current?.abort();
    const ctrl = new AbortController();
    sampleAbort.current = ctrl;
    const rg = rangeRef.current;
    const same = (cur: Sel | null) => !!cur && cur.lat === lat && cur.lon === lng;

    setSel((cur) => (same(cur) ? { ...cur!, state: "loading", lst: null, ndvi: null, equity: null, sampleNote: undefined } : cur));

    fetchEarthEngineSample(lat, lng, rg, ctrl.signal)
      .then((real) => {
        const lst = real.data?.lst_c ?? null;
        const ndvi = real.data?.ndvi ?? null;
        const sampleRange = real.usedRange ?? rg;
        setSel((cur) =>
          same(cur)
            ? {
                ...cur!,
                lst,
                ndvi,
                equity: equityScore(lst, ndvi, sampleRange),
                sampleRange,
                samplePeriod: real.period,
                sampleLatest: real.latest ?? null,
                sampleNote: real.note,
                state: real.status === "water" ? "water" : lst == null && ndvi == null ? "nodata" : "ok",
              }
            : cur
        );
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.error("Satellite sample failed:", err);
        setSel((cur) => (same(cur) ? { ...cur!, state: "error", sampleNote: err instanceof Error ? err.message : "Unable to read the satellite sample." } : cur));
      });

    fetchAirNow(lat, lng, ctrl.signal)
      .then((air) => setSel((cur) => (same(cur) ? { ...cur!, air, airState: "ok" } : cur)))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setSel((cur) => (same(cur) ? { ...cur!, air: null, airState: "error" } : cur));
      });
  }, []);

  const selectH3Cell = useCallback((cellId: string) => {
    const [lat, lon] = cellToLatLng(cellId);
    const h3Index = latLngToCell(lat, lon, 8);
    const map = mapRef.current;
    map?.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 9), duration: 700 });
    placeMarker(lon, lat);
    compareAbort.current?.abort();
    setComparison(null);
    setCompareStatus("idle");
    setSel({
      lat, lon, h3Index, h3AreaKm2: cellArea(h3Index, "km2"),
      lst: null, ndvi: null, equity: null, air: null, airState: "loading",
      name: `H3 Res 8 ${h3Index}`, state: "loading",
    });
    loadPoint(lat, lon);
  }, [loadPoint, placeMarker]);

  const selectHotspot = useCallback((city: HotspotCity) => {
    const map = mapRef.current;
    map?.flyTo({ center: [city.lon, city.lat], zoom: Math.max(map.getZoom(), 8), duration: 1000 });
    const h3Index = latLngToCell(city.lat, city.lon, 8);
    placeMarker(city.lon, city.lat);
    compareAbort.current?.abort();
    setComparison(null);
    setCompareStatus("idle");
    setSel({
      lat: city.lat, lon: city.lon, h3Index, h3AreaKm2: cellArea(h3Index, "km2"),
      lst: null, ndvi: null, equity: null, air: null, airState: "loading",
      name: `${city.name}, ${city.country}`, state: "loading",
    });
    loadPoint(city.lat, city.lon);
  }, [loadPoint, placeMarker]);

  const compareSelectedPeriod = useCallback(async () => {
    const selected = selRef.current;
    if (!selected) return;
    compareAbort.current?.abort();
    const controller = new AbortController();
    compareAbort.current = controller;
    setCompareStatus("loading");
    setComparison(null);
    try {
      const sample = await fetchEarthEngineSample(selected.lat, selected.lon, compareRange, controller.signal);
      if (controller.signal.aborted || selRef.current?.h3Index !== selected.h3Index) return;
      setComparison({
        range: compareRange,
        usedRange: sample.usedRange ?? null,
        lst: sample.data?.lst_c ?? null,
        ndvi: sample.data?.ndvi ?? null,
        period: sample.period ?? null,
        status: sample.status ?? "no_data",
      });
      setCompareStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Satellite period comparison failed:", error);
      setCompareStatus("error");
    }
  }, [compareRange]);

  const renderLiveGrid = useCallback((grid: LiveGrid) => {
    let worker = liveWorker.current;
    if (!worker) {
      worker = new Worker(new URL("./live-grid.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<LiveGridWorkerResponse>) => {
        const pending = liveWorkerRequests.current.get(event.data.id);
        if (!pending) return;
        liveWorkerRequests.current.delete(event.data.id);
        if (!event.data.blob) {
          pending.reject(new Error(event.data.error ?? "Weather raster rendering failed"));
          return;
        }
        pending.resolve(URL.createObjectURL(event.data.blob));
      };
      worker.onerror = (event) => {
        const error = new Error(event.message || "Weather raster worker failed");
        liveWorkerRequests.current.forEach(({ reject }) => reject(error));
        liveWorkerRequests.current.clear();
        worker?.terminate();
        liveWorker.current = null;
      };
      liveWorker.current = worker;
    }

    const id = ++liveWorkerSequence.current;
    return new Promise<string>((resolve, reject) => {
      liveWorkerRequests.current.set(id, { resolve, reject });
      worker?.postMessage({ id, grid: { width: grid.width, height: grid.height, points: grid.points } });
    });
  }, []);

  const loadLiveGrid = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !liveModeRef.current) return;
    if (map.getZoom() < LIVE_MIN_ZOOM) {
      setLiveStatus("zoom");
      if (map.getLayer(LIVE_LYR)) map.setPaintProperty(LIVE_LYR, "raster-opacity", 0);
      return;
    }

    liveAbort.current?.abort();
    const controller = new AbortController();
    liveAbort.current = controller;
    const sequence = ++liveSequence.current;
    const bounds = map.getBounds();
    const query = new URLSearchParams({
      west: String(bounds.getWest()),
      east: String(bounds.getEast()),
      south: String(bounds.getSouth()),
      north: String(bounds.getNorth()),
    });
    setLiveStatus("loading");

    try {
      const response = await fetch(`/api/live/grid?${query}`, { cache: "no-store", signal: controller.signal });
      const raw = await response.text();
      let payload: LiveGrid | { error?: string } | null = null;
      try { payload = JSON.parse(raw); } catch { /* not JSON */ }
      if (!response.ok || !payload || !("points" in payload) || !Array.isArray(payload.points)) {
        throw new Error(payload && "error" in payload ? payload.error ?? `HTTP ${response.status}` : `HTTP ${response.status}`);
      }
      const imageUrl = await renderLiveGrid(payload);
      if (sequence !== liveSequence.current || mapRef.current !== map) {
        URL.revokeObjectURL(imageUrl);
        return;
      }
      liveGridRef.current = payload;
      updateLiveImage(map, payload, imageUrl);
      const previousImageUrl = liveImageUrl.current;
      if (previousImageUrl) setTimeout(() => URL.revokeObjectURL(previousImageUrl), 10_000);
      liveImageUrl.current = imageUrl;
      setLiveUpdatedAt(payload.updatedAt);
      setLiveStatus("ready");
      if (map.getLayer(LIVE_LYR)) map.setPaintProperty(LIVE_LYR, "raster-opacity", LIVE_OPACITY);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Live weather grid request failed:", error);
      setLiveStatus("error");
      if (map.getLayer(LIVE_LYR)) map.setPaintProperty(LIVE_LYR, "raster-opacity", liveGridRef.current ? LIVE_OPACITY : 0);
    }
  }, [renderLiveGrid]);

  /* ── map setup ── */

  useEffect(() => {
    if (!box.current || mapRef.current) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const map = new maplibregl.Map({
      container: box.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: HOME.center,
      // Start pulled back and flat, then glide into place once loaded.
      zoom: reduceMotion ? HOME.zoom : 3.7,
      pitch: reduceMotion ? HOME.pitch : 0,
      bearing: reduceMotion ? HOME.bearing : 0,
      maxPitch: 70,
      renderWorldCopies: false,
      // Rendering at full retina resolution is very costly on big screens. Cap it.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      // Keep more tiles in memory so panning back and forth never refetches.
      maxTileCacheSize: 256,
      // Don't revalidate tiles that are still fresh.
      refreshExpiredTiles: false,
      fadeDuration: 120,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      const layers = map.getStyle().layers ?? [];
      const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
      beforeIdRef.current = map.getLayer("water") ? "water" : firstSymbol;

      const bounds = map.getBounds();
      map.addSource(LIVE_SRC, {
        type: "image",
        url: BLANK_IMAGE,
        coordinates: [
          [bounds.getWest(), bounds.getNorth()],
          [bounds.getEast(), bounds.getNorth()],
          [bounds.getEast(), bounds.getSouth()],
          [bounds.getWest(), bounds.getSouth()],
        ],
      });
      map.addLayer({
        id: LIVE_LYR,
        type: "raster",
        source: LIVE_SRC,
        paint: { "raster-opacity": 0, "raster-fade-duration": 0, "raster-resampling": "linear" },
      }, beforeIdRef.current);

      // Hide the busiest label layers. Fewer symbols to collide-test per frame at a tilted
      // camera means noticeably smoother panning, and none of them matter for heat analysis.
      layers.forEach((l) => {
        if (l.type === "symbol" && /poi|housenumber|roadname|waterway|aeroway|transit/i.test(l.id)) {
          map.setLayoutProperty(l.id, "visibility", "none");
        }
      });

      map.getCanvas().style.cursor = "crosshair";
      setMapReady(true);

      if (!reduceMotion) {
        map.easeTo({
          zoom: HOME.zoom,
          pitch: HOME.pitch,
          bearing: HOME.bearing,
          duration: 2600,
          easing: easeOutQuart,
        });
      }
    });

    map.on("sourcedata", (e: any) => {
      const id: unknown = e?.sourceId;
      if (typeof id !== "string" || !id.startsWith(GEE_SRC) || !e.isSourceLoaded) return;
      const p = pendingRef.current;
      if (p && id === `${GEE_SRC}-${p.slot}`) promote(p.slot, p.seq);
    });

    map.on("error", (e: any) => {
      const sid: unknown = e?.sourceId;
      if (typeof sid !== "string" || !sid.startsWith(GEE_SRC)) return;
      const err = e?.error;
      const msg: string = err?.message ?? "Tile request failed";
      const throttled = err?.status === 429 || /\b429\b/.test(msg);
      console.warn("Earth Engine tile error:", err);

      if (throttled) {
        setGee((g) => (g.state === "ready" ? g : { state: "throttled", message: msg }));
        if (retryN.current < MAX_AUTO_RETRIES) {
          clearTimeout(retryTimer.current);
          retryTimer.current = setTimeout(retryTiles, 3000 * Math.pow(2, retryN.current));
        } else {
          setGee((g) =>
            g.state === "ready"
              ? g
              : { state: "error", message: `Earth Engine keeps returning 429 (quota or rate limit). ${msg}` }
          );
        }
        return;
      }
      setGee((g) => (g.state === "loading" ? { state: "error", message: `Tiles failed to load: ${msg}` } : g));
    });

    map.on("click", async (e) => {
      const { lat, lng } = e.lngLat;
      const h3Index = latLngToCell(lat, lng, 8);
        compareAbort.current?.abort();
        setComparison(null);
        setCompareStatus("idle");
      placeMarker(lng, lat);
      setSel({
        lat,
        lon: lng,
        h3Index,
        h3AreaKm2: cellArea(h3Index, "km2"),
        lst: null,
        ndvi: null,
        equity: null,
        air: null,
        airState: "loading",
        name: "Locating…",
        state: "loading",
      });
      loadPoint(lat, lng);

      reverseAbort.current?.abort();
      const ctrl = new AbortController();
      reverseAbort.current = ctrl;
      const same = (cur: Sel | null) => !!cur && cur.lat === lat && cur.lon === lng;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lng}`, {
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error("reverse geocoding failed");
        const d = await r.json();
        const a = d.address ?? {};
        const place = a.city ?? a.town ?? a.village ?? a.suburb ?? a.county ?? a.state_district ?? d.name;
        const label = [place, a.state].filter(Boolean).join(", ") || "Open water / unnamed area";
        setSel((cur) => (same(cur) ? { ...cur!, name: label } : cur));
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setSel((cur) => (same(cur) ? { ...cur!, name: "Selected point" } : cur));
      }
    });

    mapRef.current = map;
    return () => {
      sampleAbort.current?.abort();
      reverseAbort.current?.abort();
      liveAbort.current?.abort();
      clearTimeout(liveMoveTimer.current);
      liveWorker.current?.terminate();
      liveWorker.current = null;
      liveWorkerRequests.current.forEach(({ reject }) => reject(new Error("Map closed")));
      liveWorkerRequests.current.clear();
      if (liveImageUrl.current) URL.revokeObjectURL(liveImageUrl.current);
      liveImageUrl.current = null;
      clearTimeout(retryTimer.current);
      clearTimeout(promoteTimer.current);
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      activeGee.current = null;
      activeSlot.current = null;
      pendingRef.current = null;
    };
  }, [placeMarker, retryTiles, loadPoint, promote]);

  useEffect(() => {
    if (!mapReady) return;
    showGee(layer, range);
  }, [layer, range, mapReady, showGee]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    clearTimeout(liveMoveTimer.current);

    if (!liveMode) {
      liveAbort.current?.abort();
      liveSequence.current += 1;
      if (map.getLayer(LIVE_LYR)) map.setPaintProperty(LIVE_LYR, "raster-opacity", 0);
      if (activeSlot.current) {
        const activeLayerId = `${GEE_LYR}-${activeSlot.current}`;
        if (map.getLayer(activeLayerId)) map.setPaintProperty(activeLayerId, "raster-opacity", GEE_OPACITY);
      }
      return;
    }

    for (const slot of ["a", "b"] as Slot[]) {
      const geeLayerId = `${GEE_LYR}-${slot}`;
      if (map.getLayer(geeLayerId)) map.setPaintProperty(geeLayerId, "raster-opacity", 0);
    }
    if (map.getLayer(LIVE_LYR)) {
      map.setPaintProperty(LIVE_LYR, "raster-opacity", liveGridRef.current && map.getZoom() >= LIVE_MIN_ZOOM ? LIVE_OPACITY : 0);
    }

    const schedule = () => {
      clearTimeout(liveMoveTimer.current);
      liveMoveTimer.current = setTimeout(() => void loadLiveGrid(), 400);
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadLiveGrid();
    };
    map.on("moveend", schedule);
    const interval = setInterval(refreshIfVisible, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    void loadLiveGrid();

    return () => {
      clearTimeout(liveMoveTimer.current);
      clearInterval(interval);
      map.off("moveend", schedule);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      liveAbort.current?.abort();
      liveSequence.current += 1;
    };
  }, [liveMode, loadLiveGrid, mapReady]);

  // Range changed: re-sample the selected point for the new period.
  useEffect(() => {
    const s = selRef.current;
    if (s) loadPoint(s.lat, s.lon);
  }, [range, loadPoint]);

  // Once the current layer is on screen, quietly warm the tile URLs for the other layers,
  // so switching between them only has to wait for tiles, not for a server round trip.
  useEffect(() => {
    if (gee.state !== "ready") return;
    const rg = range;
    const others = (["lst", "ndvi", "equity"] as Layer[]).filter((x) => x !== layer);
    let cancelled = false;
    const timers = others.map((l, i) =>
      setTimeout(async () => {
        const k = `${l}:${rg}`;
        if (cancelled || urlCache.current[k]) return;
        try {
          const entry = await fetchTileUrl(l, rg);
          if (!cancelled) urlCache.current[k] = entry;
        } catch {
          /* prefetch is best-effort */
        }
      }, 1500 + i * 1200)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [gee.state, layer, range]);

  // Orbit: time-based so it spins at the same speed on any refresh rate,
  // and it stops the moment the user grabs the map.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !orbit) return;
    let raf = 0;
    let last = performance.now();
    const spin = (t: number) => {
      const dt = Math.min(t - last, 50);
      last = t;
      m.setBearing(m.getBearing() + dt * 0.006);
      raf = requestAnimationFrame(spin);
    };
    const stop = () => setOrbit(false);
    m.on("dragstart", stop);
    m.on("wheel", stop);
    m.on("touchstart", stop);
    raf = requestAnimationFrame(spin);
    return () => {
      cancelAnimationFrame(raf);
      m.off("dragstart", stop);
      m.off("wheel", stop);
      m.off("touchstart", stop);
    };
  }, [orbit, mapReady]);

  /* ── search ── */

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        const r = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
          { signal: ctrl.signal }
        );
        const d = await r.json();
        setResults(d.results ?? []);
        setOpen(true);
      } catch (e: any) {
        if (e?.name !== "AbortError") setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searchQuery]);

  const goTo = (p: Place) => {
    const m = mapRef.current;
    if (!m) return;
    setOpen(false);
    setSearchError("");
    setSearchQuery([p.name, p.admin1].filter(Boolean).join(", "));
    placeMarker(p.longitude, p.latitude);
    setOrbit(false);
    m.flyTo({
      center: [p.longitude, p.latitude],
      zoom: 10.5,
      pitch: viewMode === "flat" ? 0 : viewMode === "street" ? 68 : 50,
      duration: 2600,
      essential: true,
    });
  };

  const handleAnalystFlyTo = (lat: number, lon: number, name: string) => {
    goTo({ name, latitude: lat, longitude: lon });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchError("");
    const top = (results.length && results[0]) || (await geocode(q));
    setSearching(false);
    if (top) goTo(top);
    else setSearchError("No place found");
  };

  const applyViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    const m = mapRef.current;
    if (!m) return;
    const target =
      mode === "flat" ? { pitch: 0, bearing: 0 } : mode === "cinematic" ? { pitch: 45, bearing: -20 } : { pitch: 68, bearing: 35 };
    m.easeTo({ ...target, duration: 1200, easing: easeOutQuart });
  };

  const handleReset = () => {
    setOrbit(false);
    compareAbort.current?.abort();
    setComparison(null);
    setCompareStatus("idle");
    markerRef.current?.remove();
    setSel(null);
    mapRef.current?.flyTo({ ...HOME, duration: 2500, essential: true });
  };

  const closeInspector = useCallback(() => {
    compareAbort.current?.abort();
    setComparison(null);
    setCompareStatus("idle");
    setSel(null);
    markerRef.current?.remove();
  }, []);

  const handleDive = useCallback(() => mapRef.current?.triggerRepaint(), []);
  const handleSwitchLayer = useCallback((l: Layer) => setLayer(l), []);
  const handleRetryLayer = useCallback(() => showGee(layer, range, true), [showGee, layer, range]);

  const loadingBar = gee.state === "loading" || gee.state === "throttled";

  return (
    <main
      className={`relative min-h-screen overflow-hidden bg-[#02061a] pt-16 font-mono text-slate-100 ${display.variable} ${mono.variable}`}
    >
      <style>{`
        .tp-marker { position: relative; width: 22px; height: 22px; pointer-events: none; }
        .tp-marker span { position: absolute; inset: 4px; border-radius: 9999px; border: 2px solid #2ee6c5; background: rgba(46,230,197,.28); box-shadow: 0 0 14px #2ee6c5; }
        .tp-marker i { position: absolute; inset: 0; border-radius: 9999px; border: 1px solid #2ee6c5; animation: tpPing 1.8s cubic-bezier(0,0,.2,1) infinite; }
        @keyframes tpPing { 0% { transform: scale(.6); opacity: .9; } 100% { transform: scale(2.6); opacity: 0; } }
        .tp-loadbar { position: absolute; top: 0; left: 0; right: 0; height: 2px; overflow: hidden; z-index: 40; pointer-events: none; }
        .tp-loadbar::after { content: ""; position: absolute; inset: 0; width: 40%; background: linear-gradient(90deg, transparent, #2ee6c5, #7dd3fc, transparent); animation: tpSlide 1.2s ease-in-out infinite; }
        @keyframes tpSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
        @media (prefers-reduced-motion: reduce) { .tp-marker i, .tp-loadbar::after { animation: none; } }
      `}</style>

      <Navbar />
      <div className="relative h-[calc(100vh-64px)] w-full">
        <div
          ref={box}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            opacity: mapReady ? 1 : 0,
            transition: "opacity 900ms ease",
          }}
        />
        <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(2,6,26,.6)_100%)]" />
        {loadingBar && <div className="tp-loadbar" />}

        {/* Search & Dock */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute left-5 top-5 z-30 flex flex-wrap items-center gap-3 p-2.5 ${GLASS}`}
        >
          <form onSubmit={handleSearch} className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              autoComplete="off"
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchError("");
              }}
              onFocus={() => results.length && setOpen(true)}
              placeholder="Search any city on Earth…"
              className="w-60 rounded-xl border border-white/10 bg-black/60 py-1.5 pl-3 pr-14 text-xs text-white placeholder-slate-400 transition-colors focus:border-[#2ee6c5] focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-1.5 rounded-lg bg-[#2ee6c5] px-2 py-1 text-[10px] font-bold uppercase text-[#02061a] transition hover:brightness-110 active:scale-95"
            >
              {searching ? "…" : "Go"}
            </button>

            <AnimatePresence>
              {((open && results.length > 0) || searchError) && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className={`absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden ${GLASS}`}
                >
                  {searchError && <div className="px-3 py-2 text-xs text-rose-300">{searchError}</div>}
                  {open &&
                    results.map((r, i) => (
                      <button
                        type="button"
                        key={`${r.latitude}-${r.longitude}-${i}`}
                        onClick={() => goTo(r)}
                        className="block w-full border-b border-white/5 px-3 py-2 text-left text-xs transition-colors last:border-0 hover:bg-white/10"
                      >
                        <div className="font-semibold text-white">{r.name}</div>
                        <div className="text-[10px] text-slate-400">{[r.admin1, r.country].filter(Boolean).join(", ")}</div>
                      </button>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <div className="relative flex rounded-xl bg-black/40 p-1">
            {(["lst", "ndvi", "equity"] as Layer[]).map((l) => (
              <button
                key={l}
                onClick={() => setLayer(l)}
                className={`relative z-10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  layer === l ? "text-[#02061a]" : "text-slate-400 hover:text-white"
                }`}
              >
                {layer === l && (
                  <motion.span
                    layoutId="pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-[#2ee6c5] to-[#7dd3fc]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {LABELS[l]}
              </button>
            ))}
          </div>

          <div className="relative flex items-center gap-1 rounded-xl bg-black/40 p-1">
            <span className="px-2 text-[10px] uppercase tracking-wider text-slate-500">Period</span>
            {RANGE_ORDER.map((r: RangeId) => (
              <button
                key={r}
                onClick={() => {
                  setRange(r);
                  setComparison(null);
                  setCompareStatus("idle");
                }}
                title={RANGES[r].blurb}
                className={`relative z-10 rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase transition-colors ${
                  range === r ? "text-[#02061a]" : "text-slate-400 hover:text-white"
                }`}
              >
                {range === r && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-[#7dd3fc]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {RANGES[r].short}
              </button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={liveMode}
            onClick={() => {
              const enabled = !liveModeRef.current;
              liveModeRef.current = enabled;
              setLiveMode(enabled);
            }}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              liveMode ? "border-[#2ee6c5] text-[#a8fff0]" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            Live now <span className={`h-2 w-2 rounded-full ${liveMode ? "animate-pulse bg-[#2ee6c5]" : "bg-slate-600"}`} />
          </button>
          {liveMode && (
            <div className={`flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider ${GLASS}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${liveStatus === "ready" || (liveStatus === "error" && liveUpdatedAt) ? "animate-pulse bg-[#2ee6c5]" : liveStatus === "loading" ? "animate-pulse bg-amber-300" : "bg-rose-400"}`} />
              <span className="text-slate-200">
                {liveUpdatedAt ? `LIVE · Updated ${updatedClock(liveUpdatedAt)}` : liveStatus === "zoom" ? "Zoom in for live grid" : liveStatus === "loading" ? "Loading live grid…" : liveStatus === "error" ? "Live unavailable" : "Connecting…"}
              </span>
              {liveStatus === "error" && (
                <span className="flex items-center gap-1 text-amber-200">
                  Refresh failed
                  <button type="button" onClick={() => void loadLiveGrid()} className="rounded bg-white/10 px-2 py-1 text-white hover:bg-white/20">Retry</button>
                </span>
              )}
              <button type="button" onClick={() => void loadLiveGrid()} disabled={liveStatus === "loading"} aria-label="Refresh live weather grid" title="Refresh live weather grid" className="rounded px-1.5 text-sm text-slate-300 hover:text-white disabled:opacity-40">↻</button>
            </div>
          )}

          <div className="flex gap-1 rounded-xl bg-black/40 p-1">
            {[
              ["cinematic", "🎬 3D Angle"],
              ["flat", "🗺️ Top-Down"],
              ["street", "🏙️ Horizon"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => applyViewMode(mode as ViewMode)}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase transition ${
                  viewMode === mode ? "bg-[#2ee6c5] text-[#02061a]" : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setOrbit((o) => !o)}
            className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              orbit ? "border-[#2ee6c5] text-[#2ee6c5]" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            🔄 Orbit
          </button>

          <button
            onClick={handleReset}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-white/20 active:scale-95"
          >
            🌐 Reset
          </button>
        </motion.div>

        <StatusCard gee={gee} layer={layer} range={range} period={geePeriod} latest={geeLatest} onRetry={handleRetryLayer} />

        {liveMode ? <LiveLegend latest={geeLatest} /> : <Legend layer={layer} range={range} period={geePeriod} latest={geeLatest} />}

        <AnimatePresence>
          {sel && (
            <Inspector
              key="inspector"
              sel={sel}
              range={range}
              onClose={closeInspector}
              onSelectCell={selectH3Cell}
              compareRange={compareRange}
              onCompareRangeChange={(nextRange) => {
                setCompareRange(nextRange);
                setComparison(null);
                setCompareStatus("idle");
              }}
              comparison={comparison}
              compareStatus={compareStatus}
              onCompare={compareSelectedPeriod}
              hotspots={hotspots}
              hotspotStatus={hotspotStatus}
              onSelectHotspot={selectHotspot}
            />
          )}
        </AnimatePresence>

        <AiAnalyst onFlyTo={handleAnalystFlyTo} onDiveIn={handleDive} onSwitchLayer={handleSwitchLayer} />
      </div>
    </main>
  );
}