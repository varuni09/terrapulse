"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/* ───────────────────────── Types & config ───────────────────────── */

type Cell = {
  id: string;
  area_km2: number;
  lat: number;
  lon: number;
  resolution: number;
  lst_mean?: number;
  lst_median?: number;
  lst_p90?: number;
  ndvi_mean?: number;
  valid_px_pct?: number;
};
type LayerKey = "grid" | "lst" | "ndvi";
type Place = { name: string; lat: number; lon: number; tier: 1 | 2 | 3 };

const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-dark": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "&copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
    },
    "esri-sat": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "esri-dark-layer", type: "raster", source: "esri-dark", minzoom: 0, maxzoom: 19 },
    {
      id: "esri-sat-layer", type: "raster", source: "esri-sat",
      layout: { visibility: "none" },
      paint: { "raster-brightness-max": 0.78, "raster-saturation": -0.2 },
    },
  ],
};

const API_ENDPOINT = "http://localhost:8000/api/v1/telemetry/chennai";
const FALLBACK_DATA = "/data/chennai_h3_res8.geojson";

const DATES = [
  { id: "2025-03-07", label: "07 Mar 2025 (Landsat-9)" },
  { id: "2025-01-18", label: "18 Jan 2025 (Landsat-8)" },
  { id: "2024-11-12", label: "12 Nov 2024 (Landsat-9)" },
];
const dateShort = (l: string) => l.split(" (")[0];
const dateSat = (l: string) => l.match(/\(([^)]+)\)/)?.[1] ?? "";

const HOME = { center: [80.2707, 13.0827] as [number, number], zoom: 10.3 };
const CITY = { lst: 38.12, ndvi: 0.342 };
const LST_RANGE: [number, number] = [35.79, 40.62];
const NDVI_RANGE: [number, number] = [0.1, 0.75];

/* Chennai localities (approximate centroids). Tier controls the zoom level they appear at. */
const PLACES: Place[] = [
  { name: "Chennai Central", lat: 13.0827, lon: 80.2757, tier: 1 },
  { name: "Anna Nagar", lat: 13.085, lon: 80.2101, tier: 1 },
  { name: "T. Nagar", lat: 13.0418, lon: 80.2341, tier: 1 },
  { name: "Adyar", lat: 13.0012, lon: 80.2565, tier: 1 },
  { name: "Guindy", lat: 13.0067, lon: 80.2206, tier: 1 },
  { name: "Velachery", lat: 12.9815, lon: 80.218, tier: 1 },
  { name: "Ambattur", lat: 13.1143, lon: 80.1548, tier: 1 },
  { name: "Tambaram", lat: 12.9249, lon: 80.1, tier: 1 },

  { name: "Mylapore", lat: 13.0368, lon: 80.2676, tier: 2 },
  { name: "Marina Beach", lat: 13.05, lon: 80.2824, tier: 2 },
  { name: "Egmore", lat: 13.0732, lon: 80.2609, tier: 2 },
  { name: "Nungambakkam", lat: 13.0569, lon: 80.2425, tier: 2 },
  { name: "Kodambakkam", lat: 13.0521, lon: 80.2255, tier: 2 },
  { name: "Vadapalani", lat: 13.0502, lon: 80.2121, tier: 2 },
  { name: "Koyambedu", lat: 13.0694, lon: 80.1948, tier: 2 },
  { name: "Perambur", lat: 13.1186, lon: 80.233, tier: 2 },
  { name: "Besant Nagar", lat: 13.0002, lon: 80.2668, tier: 2 },
  { name: "Thiruvanmiyur", lat: 12.983, lon: 80.2594, tier: 2 },
  { name: "Saidapet", lat: 13.0213, lon: 80.2231, tier: 2 },
  { name: "Porur", lat: 13.0382, lon: 80.1565, tier: 2 },
  { name: "Pallavaram", lat: 12.9675, lon: 80.1491, tier: 2 },
  { name: "Royapuram", lat: 13.1067, lon: 80.2954, tier: 2 },
  { name: "Sholinganallur", lat: 12.901, lon: 80.2279, tier: 2 },
  { name: "Alandur", lat: 13.0036, lon: 80.201, tier: 2 },

  { name: "Kilpauk", lat: 13.0836, lon: 80.2411, tier: 3 },
  { name: "Triplicane", lat: 13.0569, lon: 80.276, tier: 3 },
  { name: "Perungudi", lat: 12.965, lon: 80.2461, tier: 3 },
  { name: "Pallikaranai", lat: 12.934, lon: 80.214, tier: 3 },
  { name: "Chromepet", lat: 12.9516, lon: 80.1462, tier: 3 },
  { name: "Mogappair", lat: 13.085, lon: 80.17, tier: 3 },
  { name: "Madhavaram", lat: 13.1485, lon: 80.2306, tier: 3 },
  { name: "Tondiarpet", lat: 13.126, lon: 80.29, tier: 3 },
  { name: "Medavakkam", lat: 12.9226, lon: 80.1923, tier: 3 },
  { name: "Chennai Airport", lat: 12.9941, lon: 80.1709, tier: 3 },
  { name: "Poonamallee", lat: 13.0473, lon: 80.0945, tier: 3 },
  { name: "Avadi", lat: 13.1067, lon: 80.101, tier: 3 },
  { name: "Manali", lat: 13.1667, lon: 80.265, tier: 3 },
];
const TIER_MIN_ZOOM: Record<1 | 2 | 3, number> = { 1: 0, 2: 10.0, 3: 11.25 };

const LST_STOPS: [number, string][] = [
  [35.79, "#2b83ba"],
  [37.0, "#abdda4"],
  [38.5, "#fdae61"],
  [40.62, "#d7191c"],
];
const NDVI_STOPS: [number, string][] = [
  [0.1, "#a6611a"],
  [0.2, "#dfc27d"],
  [0.3, "#c7e9b4"],
  [0.45, "#41ab5d"],
  [0.6, "#238b45"],
  [0.75, "#00441b"],
];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ex = (v: unknown) => v as maplibregl.ExpressionSpecification;

const ramp = (prop: string, fallback: number, stops: [number, string][]) =>
  ex(["interpolate", ["linear"], ["coalesce", ["get", prop], fallback], ...stops.flat()]);

const gradient = (stops: [number, string][], [lo, hi]: [number, number]) =>
  `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${((v - lo) / (hi - lo)) * 100}%`).join(",")})`;

const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function colorAt(stops: [number, string][], v: number) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [v0, c0] = stops[i - 1];
      const [v1, c1] = stops[i];
      const t = (v - v0) / (v1 - v0);
      const a = hex2rgb(c0), b = hex2rgb(c1);
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(",")})`;
    }
  }
  return stops[stops.length - 1][1];
}

const baseColor = (l: LayerKey) =>
  l === "lst" ? ramp("lst_mean", 30, LST_STOPS) : l === "ndvi" ? ramp("ndvi_mean", 0.2, NDVI_STOPS) : "#3ee6c1";

const heightExpr = (l: LayerKey, g: number): unknown =>
  l === "lst"
    ? ["*", g, ["interpolate", ["linear"], ["coalesce", ["get", "lst_mean"], 35.79], 35.79, 150, 40.62, 3600]]
    : l === "ndvi"
    ? ["*", g, ["interpolate", ["linear"], ["coalesce", ["get", "ndvi_mean"], 0.1], 0.1, 150, 0.75, 3600]]
    : g * 900;

const isSel = ["boolean", ["feature-state", "selected"], false];
const isHov = ["boolean", ["feature-state", "hover"], false];

// Values are clamped: float rounding / early rAF timestamps could push them just below 0.
function setOpacity(map: maplibregl.Map, layer: LayerKey, k0: number) {
  const k = clamp01(k0);
  const base = layer === "grid" ? 0.2 : 0.62;
  map.setPaintProperty("hex-fill", "fill-opacity", [
    "case", isSel, Math.min(base + 0.3, 0.95) * k, isHov, (base + 0.18) * k, base * k,
  ]);
  map.setPaintProperty("hex-3d", "fill-extrusion-opacity", 0.9 * k);
}
function setColor(map: maplibregl.Map, layer: LayerKey) {
  const c = baseColor(layer);
  map.setPaintProperty("hex-fill", "fill-color", c);
  map.setPaintProperty("hex-3d", "fill-extrusion-color", ["case", isSel, "#ffffff", isHov, "#e9fffa", c]);
}
function setHeight(map: maplibregl.Map, layer: LayerKey, g0: number) {
  map.setPaintProperty("hex-3d", "fill-extrusion-height", heightExpr(layer, clamp01(g0)));
}

async function loadData(layer: LayerKey, dateId: string) {
  try {
    const res = await fetch(`${API_ENDPOINT}?layer=${layer}&date=${dateId}`);
    if (!res.ok) throw new Error("API non-200");
    return { geojson: await res.json(), source: "api" as const };
  } catch {
    const r = await fetch(FALLBACK_DATA);
    if (!r.ok) throw new Error("Sample data missing");
    return { geojson: await r.json(), source: "sample" as const };
  }
}
const cellsFrom = (g: { features?: { properties: Cell }[] }): Cell[] => (g.features ?? []).map((f) => f.properties);

function nearestCell(cells: Cell[], lat: number, lon: number): Cell | null {
  let best: Cell | null = null;
  let bd = Infinity;
  const kx = Math.cos((lat * Math.PI) / 180);
  for (const c of cells) {
    const dy = Number(c.lat) - lat;
    const dx = (Number(c.lon) - lon) * kx;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best && Math.sqrt(bd) < 0.025 ? best : null; // ≈ 2.7 km
}

const riskOf = (t?: number) =>
  t == null ? null
  : t >= 40.5 ? { label: "Critical heat island", c: "#f87171" }
  : t >= 40 ? { label: "Severe", c: "#fb923c" }
  : t >= 38.5 ? { label: "Elevated", c: "#fbbf24" }
  : { label: "Within normal range", c: "#2ee6c5" };

/* ───────────────────────── Small UI pieces ───────────────────────── */

function Num({ v, d }: { v: number; d: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const s = (t: number) => {
      const p = Math.max(0, Math.min((t - t0) / 900, 1));
      setN(v * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(s);
    };
    raf = requestAnimationFrame(s);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <>{n.toFixed(d)}</>;
}

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 py-1.5 text-left">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-[10px] opacity-50">{hint}</span>}
      </span>
      <span className={`ex-sw ${on ? "on" : ""}`} />
    </button>
  );
}

function PlaceLabel({ place, visible, valueText, color, active }: {
  place: Place; visible: boolean; valueText: string | null; color: string; active: boolean;
}) {
  return (
    <div className={`ex-place t${place.tier} ${visible ? "" : "is-hidden"} ${active ? "on" : ""}`}>
      <span className="ex-pdot" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      <span className="ex-ptxt">
        {place.name}
        {valueText && <b style={{ color }}>{valueText}</b>}
      </span>
    </div>
  );
}

/* ───────────────────────── Component ───────────────────────── */

export default function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selIdRef = useRef<string | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const layerRef = useRef<LayerKey>("ndvi");
  const kRef = useRef(1);
  const gRef = useRef(0);
  const tweens = useRef<Record<string, { raf: number; resolve: () => void }>>({});
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const placeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const cellsRef = useRef<Cell[]>([]);
  const placeClickRef = useRef<(p: Place) => void>(() => {});
  const dateRef = useRef(0);
  const layerFirst = useRef(true);

  const [selected, setSelected] = useState<Cell | null>(null);
  const [activeLayer, setActiveLayer] = useState<LayerKey>("ndvi");
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [coord, setCoord] = useState<[number, number] | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; cell: Cell } | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [is3D, setIs3D] = useState(false);
  const [extrudeActive, setExtrudeActive] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [showPlaces, setShowPlaces] = useState(true);
  const [basemap, setBasemap] = useState<"dark" | "sat">("dark");
  const [orbiting, setOrbiting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataSource, setDataSource] = useState<"api" | "sample" | null>(null);
  const [introVisible, setIntroVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placeEls, setPlaceEls] = useState<{ p: Place; el: HTMLDivElement }[]>([]);
  const [zoomB, setZoomB] = useState(8.5);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  /* Promise-based tween; cancelling resolves the older one */
  const tween = useCallback(
    (name: string, from: number, to: number, ms: number, onFrame: (v: number) => void) => {
      const old = tweens.current[name];
      if (old) {
        cancelAnimationFrame(old.raf);
        old.resolve();
      }
      return new Promise<void>((resolve) => {
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.max(0, Math.min((now - t0) / ms, 1));
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          onFrame(from + (to - from) * e);
          if (p < 1) tweens.current[name] = { raf: requestAnimationFrame(step), resolve };
          else {
            delete tweens.current[name];
            resolve();
          }
        };
        tweens.current[name] = { raf: requestAnimationFrame(step), resolve };
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    const m = mapRef.current;
    if (m && selIdRef.current) m.setFeatureState({ source: "hex", id: selIdRef.current }, { selected: false });
    selIdRef.current = null;
    setSelected(null);
  }, []);

  const selectCell = useCallback((p: Cell, fly = true) => {
    const m = mapRef.current;
    if (!m) return;
    if (selIdRef.current) m.setFeatureState({ source: "hex", id: selIdRef.current }, { selected: false });
    selIdRef.current = p.id;
    m.setFeatureState({ source: "hex", id: p.id }, { selected: true });
    setSelected(p);
    if (fly)
      m.flyTo({ center: [Number(p.lon), Number(p.lat)], zoom: Math.max(m.getZoom(), 11.8), duration: 1100, essential: true });
  }, []);

  const goToPlace = useCallback(
    (p: Place) => {
      const m = mapRef.current;
      if (!m) return;
      const c = nearestCell(cellsRef.current, p.lat, p.lon);
      if (c) selectCell(c, false);
      m.flyTo({ center: [p.lon, p.lat], zoom: Math.max(m.getZoom(), 12), duration: 1300, essential: true });
    },
    [selectCell]
  );
  placeClickRef.current = goToPlace;

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  /* ── Map init ── */
  useEffect(() => {
    if (!el.current) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const map = new maplibregl.Map({
      container: el.current,
      style: DARK_STYLE,
      center: HOME.center,
      zoom: 8.6,
      bearing: -25,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-right");

    const setHoverId = (id: string | null) => {
      if (hoverIdRef.current === id) return;
      if (hoverIdRef.current) map.setFeatureState({ source: "hex", id: hoverIdRef.current }, { hover: false });
      hoverIdRef.current = id;
      if (id) map.setFeatureState({ source: "hex", id }, { hover: true });
    };

    map.on("load", async () => {
      map.resize();
      let loaded;
      try {
        loaded = await loadData("ndvi", DATES[0].id);
      } catch {
        setError("Couldn't load grid data. Start the API or add /public/data/chennai_h3_res8.geojson.");
        setIntroVisible(false);
        return;
      }
      if (!mapRef.current) return;

      map.addSource("hex", { type: "geojson", data: loaded.geojson, promoteId: "id" });
      map.addLayer({ id: "hex-fill", type: "fill", source: "hex", paint: { "fill-color": "#000" } });
      map.addLayer({
        id: "hex-3d", type: "fill-extrusion", source: "hex",
        layout: { visibility: "none" },
        paint: { "fill-extrusion-color": "#000", "fill-extrusion-height": 0, "fill-extrusion-base": 0 },
      });
      map.addLayer({
        id: "hex-line", type: "line", source: "hex",
        paint: {
          "line-color": ex(["case", isHov, "#ffffff", "#3ee6c1"]),
          "line-width": ex(["case", isSel, 2.4, isHov, 1.8, 0.5]),
          "line-opacity": ex(["case", isSel, 1, isHov, 0.95, 0.5]),
        },
      });
      kRef.current = 0;
      setColor(map, "ndvi");
      setOpacity(map, "ndvi", 0);

      /* City / locality labels as HTML markers (rendered via React portals) */
      const els = PLACES.map((p) => {
        const d = document.createElement("div");
        d.className = "ex-place-root";
        d.addEventListener("click", (ev) => {
          ev.stopPropagation();
          placeClickRef.current(p);
        });
        placeMarkersRef.current.push(new maplibregl.Marker({ element: d }).setLngLat([p.lon, p.lat]).addTo(map));
        return { p, el: d };
      });
      setPlaceEls(els);
      const bucket = () => setZoomB(Math.floor(map.getZoom() * 4) / 4);
      map.on("zoom", bucket);
      bucket();

      map.on("mousemove", (e) => {
        setCoord([e.lngLat.lat, e.lngLat.lng]);
        const ls = ["hex-fill", "hex-3d"].filter((l) => map.getLayoutProperty(l, "visibility") !== "none");
        const f = ls.length ? map.queryRenderedFeatures(e.point, { layers: ls })[0] : undefined;
        map.getCanvas().style.cursor = f ? "pointer" : "";
        if (f) {
          setHoverId(String(f.id));
          setHover({ x: e.point.x, y: e.point.y, cell: f.properties as unknown as Cell });
        } else {
          setHoverId(null);
          setHover(null);
        }
      });
      map.getCanvas().addEventListener("mouseleave", () => {
        setHoverId(null);
        setHover(null);
      });
      map.on("click", (e) => {
        const ls = ["hex-fill", "hex-3d"].filter((l) => map.getLayoutProperty(l, "visibility") !== "none");
        const f = ls.length ? map.queryRenderedFeatures(e.point, { layers: ls })[0] : undefined;
        if (!f) return clearSelection();
        selectCell(f.properties as unknown as Cell);
      });

      setCells(cellsFrom(loaded.geojson));
      setDataSource(loaded.source);
      setIsLoaded(true);

      timers.push(
        setTimeout(() => {
          setIntroVisible(false);
          map.flyTo({ center: HOME.center, zoom: HOME.zoom, bearing: 0, duration: 2800, essential: true });
          tween("k", 0, 1, 2000, (k) => {
            kRef.current = k;
            setOpacity(map, layerRef.current, k);
          });
        }, 900)
      );
    });

    return () => {
      timers.forEach(clearTimeout);
      Object.values(tweens.current).forEach((t) => cancelAnimationFrame(t.raf));
      markersRef.current.forEach((m) => m.remove());
      placeMarkersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      placeMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [clearSelection, selectCell, tween]);

  /* ── Layer switch ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    if (layerFirst.current) {
      layerFirst.current = false;
      return;
    }
    (async () => {
      const prev = layerRef.current;
      await tween("k", kRef.current, 0, 220, (k) => {
        kRef.current = k;
        setOpacity(map, prev, k);
      });
      layerRef.current = activeLayer;
      setColor(map, activeLayer);
      setHeight(map, activeLayer, gRef.current);
      await tween("k", 0, 1, 450, (k) => {
        kRef.current = k;
        setOpacity(map, activeLayer, k);
      });
    })();
  }, [activeLayer, isLoaded, tween]);

  /* ── Date switch ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || dateRef.current === selectedDateIdx) return;
    dateRef.current = selectedDateIdx;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const [res] = await Promise.all([
          loadData(layerRef.current, DATES[selectedDateIdx].id),
          tween("k", kRef.current, 0, 260, (k) => {
            kRef.current = k;
            setOpacity(map, layerRef.current, k);
          }),
        ]);
        if (cancelled) return;
        (map.getSource("hex") as maplibregl.GeoJSONSource).setData(res.geojson);
        const next = cellsFrom(res.geojson);
        setCells(next);
        setDataSource(res.source);
        const keep = next.find((c) => c.id === selIdRef.current);
        if (keep) setSelected(keep);
        else clearSelection();
      } catch {
        /* keep current data on failure */
      }
      await tween("k", 0, 1, 450, (k) => {
        kRef.current = k;
        setOpacity(map, layerRef.current, k);
      });
      if (!cancelled) setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDateIdx, isLoaded, tween, clearSelection]);

  /* ── Visibility: grid toggle + 2D/3D ── */
useEffect(() => {
  const map = mapRef.current;

  // Wait until the map style is ready.
  if (!map || !map.isStyleLoaded()) return;

  const setVisibility = (layerId: string, visible: boolean) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        visible ? "visible" : "none"
      );
    }
  };

  setVisibility("hex-fill", showGrid && !extrudeActive);
  setVisibility("hex-3d", showGrid && extrudeActive);
  setVisibility("hex-line", showGrid);
}, [showGrid, extrudeActive, isLoaded]);
  /* ── Basemap ── */
useEffect(() => {
  const map = mapRef.current;

  if (!map || !map.isStyleLoaded()) return;

  const setVisibility = (layerId: string, visible: boolean) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(
        layerId,
        "visibility",
        visible ? "visible" : "none"
      );
    }
  };

  setVisibility("esri-dark-layer", basemap === "dark");
  setVisibility("esri-sat-layer", basemap === "sat");
}, [basemap, isLoaded]);
  const toggle3D = useCallback(
    async (next: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      setIs3D(next);
      if (next) {
        setExtrudeActive(true);
        map.easeTo({ pitch: 58, bearing: -22, duration: 1400 });
        await tween("g", gRef.current, 1, 1400, (g) => {
          gRef.current = g;
          setHeight(map, layerRef.current, g);
        });
      } else {
        map.easeTo({ pitch: 0, bearing: 0, duration: 1100 });
        await tween("g", gRef.current, 0, 1000, (g) => {
          gRef.current = g;
          setHeight(map, layerRef.current, g);
        });
        if (gRef.current === 0) setExtrudeActive(false);
      }
    },
    [tween]
  );

  /* ── Orbit camera ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!orbiting || !map) return;
    let raf = 0;
    const step = () => {
      map.setBearing(map.getBearing() + 0.07);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const stop = () => setOrbiting(false);
    map.on("mousedown", stop);
    map.on("touchstart", stop);
    map.on("wheel", stop);
    return () => {
      cancelAnimationFrame(raf);
      map.off("mousedown", stop);
      map.off("touchstart", stop);
      map.off("wheel", stop);
    };
  }, [orbiting]);

  /* ── Derived data ── */
  const hottest = useMemo(
    () => cells.filter((c) => c.lst_mean != null).sort((a, b) => Number(b.lst_mean) - Number(a.lst_mean)).slice(0, 5),
    [cells]
  );
  const densest = useMemo(
    () => cells.filter((c) => c.ndvi_mean != null).sort((a, b) => Number(b.ndvi_mean) - Number(a.ndvi_mean)).slice(0, 5),
    [cells]
  );
  const listCells = activeLayer === "ndvi" ? densest : hottest;

  const snapshot = useMemo(() => {
    const l = cells.filter((c) => c.lst_mean != null).map((c) => Number(c.lst_mean));
    const n = cells.filter((c) => c.ndvi_mean != null).map((c) => Number(c.ndvi_mean));
    const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    return { lst: avg(l), ndvi: avg(n), count: cells.length };
  }, [cells]);

  const placeStats = useMemo(() => PLACES.map((p) => nearestCell(cells, p.lat, p.lon)), [cells]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLACES.filter((p) => (q ? p.name.toLowerCase().includes(q) : p.tier === 1)).slice(0, 6);
  }, [query]);

  /* ── Pulsing hotspot markers ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!showPulse) return;
    hottest.slice(0, 3).forEach((c, i) => {
      const d = document.createElement("div");
      d.className = "ex-pulse";
      d.innerHTML = "<b></b><b></b><i></i>";
      const tag = document.createElement("em");
      tag.textContent = `#${i + 1} · ${Number(c.lst_mean).toFixed(1)}°`;
      d.appendChild(tag);
      d.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectCell(c);
      });
      markersRef.current.push(new maplibregl.Marker({ element: d }).setLngLat([Number(c.lon), Number(c.lat)]).addTo(map));
    });
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [showPulse, hottest, isLoaded, selectCell]);

  /* ── Selection ripple marker ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded || !selected) return;
    const d = document.createElement("div");
    d.className = "ex-sel";
    d.innerHTML = "<b></b><b></b><i></i>";
    const m = new maplibregl.Marker({ element: d }).setLngLat([Number(selected.lon), Number(selected.lat)]).addTo(map);
    return () => {
      m.remove();
    };
  }, [selected?.id, selected?.lat, selected?.lon, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Timeline playback & keyboard ── */
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setSelectedDateIdx((i) => (i + 1) % DATES.length), 4500);
    return () => clearInterval(t);
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && clearSelection();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  const resetView = () => {
    clearSelection();
    setOrbiting(false);
    mapRef.current?.flyTo({
      center: HOME.center, zoom: HOME.zoom, pitch: is3D ? 58 : 0, bearing: is3D ? -22 : 0, duration: 1600, essential: true,
    });
  };

  const pickPlace = (p: Place) => {
    goToPlace(p);
    setQuery("");
    setSearchOpen(false);
  };

  /* Legend probe */
  const probe = hover?.cell ?? selected;
  const probeVal = probe ? (activeLayer === "lst" ? probe.lst_mean : probe.ndvi_mean) : undefined;
  const [lo, hi] = activeLayer === "lst" ? LST_RANGE : NDVI_RANGE;
  const probePct = probeVal != null ? clamp01((Number(probeVal) - lo) / (hi - lo)) * 100 : null;

  const layerIdx = activeLayer === "grid" ? 0 : activeLayer === "lst" ? 1 : 2;
  const risk = riskOf(selected?.lst_mean != null ? Number(selected.lst_mean) : undefined);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-mono">
      <style>{css}</style>
      <div ref={el} style={{ width: "100vw", height: "100vh" }} className="absolute inset-0" />
      <div className="ex-vignette" />

      {/* Place labels (portals into map markers) */}
      {placeEls.map(({ p, el: host }, i) => {
        const cell = placeStats[i];
        let valueText: string | null = null;
        let color = "#2ee6c5";
        if (cell && activeLayer === "lst" && cell.lst_mean != null) {
          valueText = `${Number(cell.lst_mean).toFixed(1)}°`;
          color = colorAt(LST_STOPS, Number(cell.lst_mean));
        } else if (cell && activeLayer === "ndvi" && cell.ndvi_mean != null) {
          valueText = Number(cell.ndvi_mean).toFixed(2);
          color = colorAt(NDVI_STOPS, Number(cell.ndvi_mean));
        }
        return createPortal(
          <PlaceLabel
            place={p}
            visible={showPlaces && zoomB >= TIER_MIN_ZOOM[p.tier]}
            valueText={valueText}
            color={color}
            active={!!cell && cell.id === selected?.id}
          />,
          host,
          p.name
        );
      })}

      {/* Intro overlay */}
      <div className={`ex-intro ${introVisible ? "" : "is-out"}`}>
        <div className="ex-intro-logo">TERRAPULSE</div>
        <div className="ex-intro-bar"><i /></div>
        <div className="text-[11px] tracking-[0.3em] text-slate-500">LOADING THERMAL GRID</div>
      </div>

      {error && <div className="ex-error">{error}</div>}

      {/* Floating toolbar */}
      <div className="ex-slide-d absolute left-1/2 top-20 z-10 flex items-start gap-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults[0]) pickPlace(searchResults[0]);
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            placeholder="Search a Chennai area…"
            className="ex-search"
            aria-label="Search a Chennai area"
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="ex-glass ex-drop">
              {searchResults.map((p) => {
                const c = placeStats[PLACES.indexOf(p)];
                return (
                  <button key={p.name} onMouseDown={(e) => { e.preventDefault(); pickPlace(p); }} className="ex-drop-item">
                    <span>{p.name}</span>
                    <span className="text-[10px] opacity-60">
                      {c?.lst_mean != null ? `${Number(c.lst_mean).toFixed(1)} °C` : "outside grid"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button className="ex-tool" onClick={resetView}>⟲ Reset</button>
        <button className="ex-tool" disabled={!hottest[0]} onClick={() => hottest[0] && selectCell(hottest[0])}>◎ Hottest</button>
        <button className={`ex-tool ${orbiting ? "active" : ""}`} onClick={() => setOrbiting((o) => !o)}>
          {orbiting ? "■ Stop orbit" : "◐ Orbit"}
        </button>
      </div>

      {/* Left panel */}
      <aside className="ex-glass ex-slide-l absolute left-4 top-20 z-10 max-h-[calc(100vh-11rem)] w-72 overflow-y-auto p-4 text-xs">
        <div className="mb-3 flex items-center gap-2">
          <span className="ex-live" />
          <h2 className="font-bold tracking-[0.25em] text-[var(--accent)]">LAYERS</h2>
        </div>

        {snapshot.count > 0 && (
          <div className="ex-snap">
            <div>
              <div className="ex-snap-v text-[var(--accent)]"><Num v={snapshot.lst} d={2} />°</div>
              <div className="ex-snap-l">Mean LST</div>
            </div>
            <div>
              <div className="ex-snap-v text-emerald-400"><Num v={snapshot.ndvi} d={3} /></div>
              <div className="ex-snap-l">Mean NDVI</div>
            </div>
            <div>
              <div className="ex-snap-v text-white"><Num v={snapshot.count} d={0} /></div>
              <div className="ex-snap-l">H3 cells</div>
            </div>
          </div>
        )}

        <div className="ex-seg" style={{ "--n": 3 } as CSSProperties} role="radiogroup" aria-label="Map layer">
          <div className="ex-seg-thumb" style={{ transform: `translateX(${layerIdx * 100}%)` }} />
          {([["grid", "Grid"], ["lst", "Temperature"], ["ndvi", "Vegetation"]] as [LayerKey, string][]).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={activeLayer === k}
              className={activeLayer === k ? "on" : ""} onClick={() => setActiveLayer(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="ex-seg mt-2" style={{ "--n": 2 } as CSSProperties} role="radiogroup" aria-label="Basemap">
          <div className="ex-seg-thumb" style={{ transform: `translateX(${basemap === "dark" ? 0 : 100}%)` }} />
          {([["dark", "Dark map"], ["sat", "Satellite"]] as ["dark" | "sat", string][]).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={basemap === k} className={basemap === k ? "on" : ""} onClick={() => setBasemap(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 divide-y divide-white/5">
          <Switch on={showGrid} onChange={setShowGrid} label="H3 analysis grid" hint="Resolution 8" />
          <Switch on={is3D} onChange={toggle3D} label="3D heights" hint="Extrude cells by value" />
          <Switch on={showPlaces} onChange={setShowPlaces} label="Area names" hint="Live values per locality" />
          <Switch on={showPulse} onChange={setShowPulse} label="Pulse hotspots" hint="Three hottest cells" />
        </div>

        {activeLayer !== "grid" && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="mb-2 text-[11px] opacity-70">
              {activeLayer === "lst" ? "Land-surface temperature (°C)" : "NDVI (vegetation index)"}
            </div>
            <div className="ex-legend" style={{ background: activeLayer === "lst" ? gradient(LST_STOPS, LST_RANGE) : gradient(NDVI_STOPS, NDVI_RANGE) }}>
              {probePct != null && (
                <div className="ex-legend-mark" style={{ left: `${probePct}%` }}>
                  <span>{Number(probeVal).toFixed(activeLayer === "lst" ? 2 : 3)}</span>
                </div>
              )}
            </div>
            <div className="mt-2 flex justify-between text-[10px] opacity-60">
              <span>{activeLayer === "lst" ? "35.79 (cooler)" : "0.10 (sparse)"}</span>
              <span>{activeLayer === "lst" ? "40.62 (hotter)" : "0.75 (dense)"}</span>
            </div>
            <div className="mt-1 text-[10px] opacity-40">Hover or select a cell to place it on the scale.</div>
          </div>
        )}

        {listCells.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="mb-2 text-[11px] opacity-70">{activeLayer === "ndvi" ? "Densest canopy" : "Hottest cells"}</div>
            <div key={`${activeLayer === "ndvi"}-${selectedDateIdx}`} className="space-y-1">
              {listCells.map((c, i) => (
                <button key={c.id} className="ex-item w-full" style={{ animationDelay: `${i * 70}ms` }} onClick={() => selectCell(c)}>
                  <span className="opacity-50">#{i + 1}</span>
                  <span className="flex-1 truncate px-2 text-left">{c.id}</span>
                  <span className="font-bold" style={{ color: activeLayer === "ndvi" ? "#4ade80" : "#f87171" }}>
                    {activeLayer === "ndvi" ? Number(c.ndvi_mean).toFixed(2) : `${Number(c.lst_mean).toFixed(1)}°`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Right panel: inspector */}
      <aside
        className={`ex-glass absolute right-4 top-20 z-10 w-72 p-4 transition-all duration-500 ${
          selected ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-10 opacity-0"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)" }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold tracking-[0.25em] text-[var(--accent)]">INSPECTOR</h2>
          <button onClick={clearSelection} aria-label="Close inspector" className="text-slate-400 transition hover:rotate-90 hover:text-white">✕</button>
        </div>
        {selected && (
          <div key={selected.id} className="ex-fade space-y-3 text-xs">
            <div>
              <div className="opacity-60">Cell ID</div>
              <div className="break-all font-bold text-white">{selected.id}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="opacity-60">Area</div>{Number(selected.area_km2).toFixed(2)} km²</div>
              <div><div className="opacity-60">Centroid</div>{Number(selected.lat).toFixed(3)}, {Number(selected.lon).toFixed(3)}</div>
            </div>

            {risk && (
              <div className="rounded-md border px-2.5 py-1.5 text-[11px] font-bold"
                style={{ color: risk.c, borderColor: `${risk.c}66`, background: `${risk.c}14` }}>
                {risk.label}
              </div>
            )}

            <div className="space-y-3 border-t border-white/10 pt-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="opacity-60">LST mean</span>
                  <span className="text-base font-bold text-[var(--accent)]">
                    {selected.lst_mean != null ? <><Num v={Number(selected.lst_mean)} d={2} /> °C</> : "—"}
                  </span>
                </div>
                {selected.lst_mean != null && (
                  <>
                    <div className="ex-bar mt-1.5"><i style={{ "--w": `${clamp01((Number(selected.lst_mean) - LST_RANGE[0]) / (LST_RANGE[1] - LST_RANGE[0])) * 100}%`, background: "linear-gradient(90deg,#2b83ba,#fdae61,#d7191c)" } as CSSProperties} /></div>
                    <div className="mt-1 text-[10px] opacity-60">
                      {Number(selected.lst_mean) - CITY.lst >= 0 ? "+" : ""}
                      {(Number(selected.lst_mean) - CITY.lst).toFixed(2)} °C vs city mean
                    </div>
                  </>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="opacity-60">NDVI mean</span>
                  <span className="text-base font-bold text-emerald-400">
                    {selected.ndvi_mean != null ? <Num v={Number(selected.ndvi_mean)} d={3} /> : "—"}
                  </span>
                </div>
                {selected.ndvi_mean != null && (
                  <>
                    <div className="ex-bar mt-1.5"><i style={{ "--w": `${clamp01((Number(selected.ndvi_mean) - NDVI_RANGE[0]) / (NDVI_RANGE[1] - NDVI_RANGE[0])) * 100}%`, background: "linear-gradient(90deg,#a6611a,#41ab5d,#00441b)" } as CSSProperties} /></div>
                    <div className="mt-1 text-[10px] opacity-60">
                      {Number(selected.ndvi_mean) - CITY.ndvi >= 0 ? "+" : ""}
                      {(Number(selected.ndvi_mean) - CITY.ndvi).toFixed(3)} vs city mean
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between"><span className="opacity-60">LST median</span><span>{selected.lst_median != null ? `${selected.lst_median} °C` : "—"}</span></div>
                <div className="flex justify-between"><span className="opacity-60">LST p90</span><span>{selected.lst_p90 != null ? `${selected.lst_p90} °C` : "—"}</span></div>
                <div className="flex justify-between"><span className="opacity-60">Valid pixels</span><span>{selected.valid_px_pct != null ? `${selected.valid_px_pct}%` : "—"}</span></div>
              </div>
            </div>

            <Link href="/insights" className="ex-link">View city-wide insights →</Link>
          </div>
        )}
      </aside>

      {/* Hover tooltip */}
      {hover && (
        <div className="ex-glass ex-tip"
          style={{ left: hover.x > (typeof window !== "undefined" ? window.innerWidth : 1200) - 240 ? hover.x - 190 : hover.x + 16, top: hover.y + 16 }}>
          <div className="mb-1 truncate font-bold text-white">{hover.cell.id}</div>
          <div className="flex justify-between gap-6"><span className="opacity-60">LST</span><span className="text-[var(--accent)]">{hover.cell.lst_mean != null ? `${hover.cell.lst_mean} °C` : "—"}</span></div>
          <div className="flex justify-between gap-6"><span className="opacity-60">NDVI</span><span className="text-emerald-400">{hover.cell.ndvi_mean ?? "—"}</span></div>
          <div className="mt-1 text-[10px] opacity-40">Click to inspect</div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="ex-glass ex-slide-u absolute inset-x-4 bottom-4 z-10 flex flex-col items-center justify-between gap-2 overflow-hidden px-4 py-2.5 text-[11px] md:left-20 md:right-28 md:flex-row">
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
          <button className="ex-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause timeline" : "Play timeline"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="text-nowrap opacity-60">Observation date</span>
          {DATES.map((d, i) => (
            <button key={d.id} onClick={() => { setPlaying(false); setSelectedDateIdx(i); }}
              className={`ex-pill ${i === selectedDateIdx ? "on" : ""}`}>
              {dateShort(d.label)} <span className="opacity-60">· {dateSat(d.label)}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 self-end md:self-center">
          {busy && <span className="ex-spin" aria-label="Loading" />}
          {dataSource && <span className={`ex-src ${dataSource}`}>{dataSource === "api" ? "Live API" : "Sample data"}</span>}
          <span className="tabular-nums opacity-80">
            {coord ? `${coord[0].toFixed(4)}° N · ${coord[1].toFixed(4)}° E` : "—"}
          </span>
        </div>
        {playing && <div key={selectedDateIdx} className="ex-prog" />}
      </div>
    </div>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const css = `
.ex-glass{background:linear-gradient(160deg,rgba(8,16,44,.84),rgba(2,6,26,.9));backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border:1px solid rgba(46,230,197,.2);border-radius:14px;box-shadow:0 24px 60px -24px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.05);color:#e2e8f0}
.ex-vignette{position:absolute;inset:0;z-index:5;pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%,transparent 55%,rgba(2,6,26,.55) 100%),linear-gradient(rgba(2,6,26,.55),transparent 14%)}
.ex-slide-l{animation:ex-in-l 1s 1.6s both cubic-bezier(.2,.8,.2,1)}
.ex-slide-u{animation:ex-in-u 1s 1.9s both cubic-bezier(.2,.8,.2,1)}
.ex-slide-d{animation:ex-in-d 1s 2.1s both cubic-bezier(.2,.8,.2,1)}
@keyframes ex-in-l{from{opacity:0;transform:translateX(-36px)}to{opacity:1;transform:none}}
@keyframes ex-in-u{from{opacity:0;transform:translateY(36px)}to{opacity:1;transform:none}}
@keyframes ex-in-d{from{opacity:0;transform:translate(-50%,-20px)}to{opacity:1;transform:translate(-50%,0)}}
.ex-fade{animation:ex-fade .5s both cubic-bezier(.2,.8,.2,1)}
@keyframes ex-fade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* Intro */
.ex-intro{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
  background:radial-gradient(circle at 50% 40%,#06122e,#02061a);transition:opacity 1s .1s,visibility 1s .1s}
.ex-intro.is-out{opacity:0;visibility:hidden;pointer-events:none}
.ex-intro-logo{font-size:clamp(1.4rem,4vw,2.4rem);color:#fff;letter-spacing:.5em;padding-left:.5em;animation:ex-logo 1.5s both cubic-bezier(.2,.8,.2,1)}
@keyframes ex-logo{from{opacity:0;letter-spacing:1.2em;filter:blur(10px)}to{opacity:1;letter-spacing:.5em;filter:blur(0)}}
.ex-intro-bar{width:220px;height:2px;background:rgba(148,163,184,.2);overflow:hidden;border-radius:2px}
.ex-intro-bar i{display:block;height:100%;background:linear-gradient(90deg,#2ee6c5,#f87171);animation:ex-load 1.8s both ease-out}
@keyframes ex-load{from{width:0}to{width:100%}}
.ex-error{position:absolute;z-index:35;left:50%;top:50%;transform:translate(-50%,-50%);max-width:420px;padding:16px 20px;border-radius:12px;
  background:rgba(127,29,29,.5);border:1px solid #b91c1c;color:#fecaca;font-size:12px;text-align:center}

/* Toolbar */
.ex-tool{font-size:11px;white-space:nowrap;color:var(--accent,#2ee6c5);padding:8px 14px;border-radius:999px;border:1px solid rgba(46,230,197,.35);
  background:rgba(2,6,26,.8);backdrop-filter:blur(10px);transition:all .3s cubic-bezier(.2,.8,.2,1)}
.ex-tool:hover:not(:disabled),.ex-tool.active{background:var(--accent,#2ee6c5);color:#02061a;box-shadow:0 0 24px rgba(46,230,197,.5);transform:translateY(-2px)}
.ex-tool:disabled{opacity:.4}
.ex-search{width:210px;font-size:11px;color:#e2e8f0;padding:8px 14px;border-radius:999px;border:1px solid rgba(46,230,197,.35);
  background:rgba(2,6,26,.8);backdrop-filter:blur(10px);outline:none;transition:width .4s cubic-bezier(.2,.8,.2,1),box-shadow .3s,border-color .3s}
.ex-search:focus{width:290px;border-color:var(--accent,#2ee6c5);box-shadow:0 0 24px rgba(46,230,197,.3)}
.ex-search::placeholder{color:#64748b}
.ex-drop{position:absolute;left:0;right:0;top:calc(100% + 8px);padding:6px;animation:ex-pop .18s both}
.ex-drop-item{display:flex;width:100%;justify-content:space-between;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;font-size:11px;text-align:left;transition:background .2s,transform .2s}
.ex-drop-item:hover{background:rgba(46,230,197,.12);transform:translateX(3px)}
.ex-live{width:7px;height:7px;border-radius:50%;background:#2ee6c5;animation:ex-ping 1.8s infinite}
@keyframes ex-ping{0%{box-shadow:0 0 0 0 rgba(46,230,197,.6)}100%{box-shadow:0 0 0 10px rgba(46,230,197,0)}}

/* Snapshot */
.ex-snap{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;padding:10px;border-radius:10px;
  background:rgba(148,163,184,.06);border:1px solid rgba(148,163,184,.1)}
.ex-snap-v{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}
.ex-snap-l{font-size:9px;opacity:.55;margin-top:2px}

/* Segmented control */
.ex-seg{--n:3;position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);padding:4px;border-radius:10px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.12)}
.ex-seg-thumb{position:absolute;top:4px;bottom:4px;left:4px;width:calc((100% - 8px)/var(--n));border-radius:7px;
  background:linear-gradient(135deg,rgba(46,230,197,.3),rgba(46,230,197,.08));border:1px solid rgba(46,230,197,.5);
  box-shadow:0 0 18px rgba(46,230,197,.25);transition:transform .5s cubic-bezier(.2,.9,.3,1.1)}
.ex-seg button{position:relative;z-index:1;padding:8px 2px;font-size:11px;color:#94a3b8;transition:color .3s}
.ex-seg button.on{color:#fff;font-weight:700}

/* Switch */
.ex-sw{flex:none;width:34px;height:18px;border-radius:999px;background:rgba(148,163,184,.25);position:relative;transition:background .3s,box-shadow .3s}
.ex-sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .4s cubic-bezier(.3,1.5,.5,1)}
.ex-sw.on{background:var(--accent,#2ee6c5);box-shadow:0 0 14px rgba(46,230,197,.5)}
.ex-sw.on::after{transform:translateX(16px)}

/* Legend */
.ex-legend{position:relative;height:8px;border-radius:999px}
.ex-legend-mark{position:absolute;top:-6px;width:2px;height:20px;background:#fff;box-shadow:0 0 10px #fff;transform:translateX(-50%);transition:left .25s ease-out}
.ex-legend-mark span{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:#02061a;background:#fff;padding:1px 5px;border-radius:4px;white-space:nowrap}

/* List */
.ex-item{display:flex;align-items:center;padding:7px 9px;border-radius:8px;border:1px solid transparent;font-size:11px;
  transition:background .25s,border-color .25s,transform .25s;animation:ex-item .6s both cubic-bezier(.2,.8,.2,1)}
.ex-item:hover{background:rgba(46,230,197,.08);border-color:rgba(46,230,197,.3);transform:translateX(4px)}
@keyframes ex-item{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}

/* Inspector */
.ex-bar{height:5px;border-radius:999px;background:rgba(148,163,184,.14);overflow:hidden}
.ex-bar i{display:block;height:100%;width:var(--w);border-radius:999px;animation:ex-grow 1.1s .15s both cubic-bezier(.2,.8,.2,1)}
@keyframes ex-grow{from{width:0}}
.ex-link{display:inline-block;font-size:11px;color:var(--accent,#2ee6c5);border-top:1px solid rgba(255,255,255,.08);padding-top:10px;width:100%;transition:letter-spacing .3s,color .3s}
.ex-link:hover{letter-spacing:.06em;color:#fff}

/* Tooltip */
.ex-tip{position:absolute;z-index:20;pointer-events:none;padding:10px 12px;font-size:11px;min-width:170px;border-radius:10px;animation:ex-pop .18s both}
@keyframes ex-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}

/* Bottom bar */
.ex-pill{padding:6px 12px;border-radius:8px;border:1px solid rgba(148,163,184,.2);color:#94a3b8;transition:all .35s cubic-bezier(.2,.8,.2,1)}
.ex-pill:hover{border-color:rgba(46,230,197,.5);color:#fff}
.ex-pill.on{color:#02061a;background:var(--accent,#2ee6c5);border-color:var(--accent,#2ee6c5);box-shadow:0 0 18px rgba(46,230,197,.4);font-weight:700}
.ex-pill.on span{opacity:.7}
.ex-play{width:28px;height:28px;border-radius:50%;border:1px solid rgba(46,230,197,.5);color:var(--accent,#2ee6c5);font-size:10px;transition:all .3s}
.ex-play:hover{background:var(--accent,#2ee6c5);color:#02061a;box-shadow:0 0 18px rgba(46,230,197,.5)}
.ex-prog{position:absolute;left:0;bottom:0;height:2px;background:linear-gradient(90deg,#2ee6c5,#7dd3fc);animation:ex-prog 4.5s linear both}
@keyframes ex-prog{from{width:0}to{width:100%}}
.ex-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(46,230,197,.2);border-top-color:#2ee6c5;animation:ex-rot .8s linear infinite}
@keyframes ex-rot{to{transform:rotate(360deg)}}
.ex-src{font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid}
.ex-src.api{color:#2ee6c5;border-color:rgba(46,230,197,.4)}
.ex-src.sample{color:#fbbf24;border-color:rgba(251,191,36,.4)}

/* Area name labels */
.ex-place{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;
  transition:opacity .6s cubic-bezier(.2,.8,.2,1),transform .6s cubic-bezier(.2,.8,.2,1)}
.ex-place.is-hidden{opacity:0;transform:scale(.6);pointer-events:none}
.ex-pdot{position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;border:1.5px solid rgba(2,6,26,.9);transition:transform .3s}
.ex-ptxt{position:absolute;left:10px;top:0;transform:translateY(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;cursor:pointer;
  font-size:10.5px;color:#e2e8f0;padding:3px 8px;border-radius:999px;background:rgba(2,6,26,.72);backdrop-filter:blur(6px);
  border:1px solid rgba(148,163,184,.2);text-shadow:0 1px 4px rgba(0,0,0,.9);transition:all .25s cubic-bezier(.2,.8,.2,1)}
.ex-ptxt b{font-weight:800;font-variant-numeric:tabular-nums}
.ex-place.t1 .ex-ptxt{font-size:12px;font-weight:700;padding:4px 10px;letter-spacing:.02em}
.ex-place.t1 .ex-pdot{width:10px;height:10px;left:-5px;top:-5px}
.ex-place.t3 .ex-ptxt{font-size:9.5px;opacity:.9}
.ex-place:hover .ex-ptxt,.ex-place.on .ex-ptxt{background:rgba(8,24,52,.95);border-color:var(--accent,#2ee6c5);color:#fff;transform:translateY(-50%) scale(1.08);box-shadow:0 0 22px rgba(46,230,197,.35)}
.ex-place:hover .ex-pdot,.ex-place.on .ex-pdot{transform:scale(1.5)}
.ex-place-root{z-index:2}
.ex-place-root:hover{z-index:5}

/* Hotspot + selection markers */
.ex-pulse{position:relative;width:16px;height:16px;cursor:pointer}
.ex-pulse i{position:absolute;inset:4px;border-radius:50%;background:#ff5a5a;box-shadow:0 0 14px #ff5a5a}
.ex-pulse b{position:absolute;inset:0;border-radius:50%;border:2px solid #ff5a5a;animation:ex-ring 2.2s ease-out infinite}
.ex-pulse b:nth-of-type(2){animation-delay:1.1s}
.ex-pulse em{position:absolute;left:24px;top:-2px;font-style:normal;font-size:10px;color:#fff;background:rgba(2,6,26,.88);
  border:1px solid rgba(255,90,90,.5);padding:2px 6px;border-radius:5px;white-space:nowrap;font-family:ui-monospace,monospace}
.ex-sel{position:relative;width:18px;height:18px;pointer-events:none}
.ex-sel i{position:absolute;inset:6px;border-radius:50%;background:#fff;box-shadow:0 0 16px #fff}
.ex-sel b{position:absolute;inset:0;border-radius:50%;border:2px solid #2ee6c5;animation:ex-ring 1.8s ease-out infinite}
.ex-sel b:nth-of-type(2){animation-delay:.9s}
@keyframes ex-ring{0%{transform:scale(.4);opacity:.9}100%{transform:scale(3.2);opacity:0}}

/* Make the nav controls match the glass look */
.maplibregl-ctrl-group{background:rgba(2,6,26,.85) !important;border:1px solid rgba(46,230,197,.25);border-radius:10px !important;overflow:hidden;backdrop-filter:blur(10px)}
.maplibregl-ctrl-group button{filter:invert(1) hue-rotate(150deg) brightness(1.1)}

@media (prefers-reduced-motion: reduce){
  .ex-glass,.ex-slide-l,.ex-slide-u,.ex-slide-d,.ex-fade,.ex-item,.ex-pulse b,.ex-sel b,.ex-intro-logo,.ex-bar i{animation-duration:.01ms !important;animation-delay:0s !important}
  .ex-pulse b,.ex-sel b{display:none}
}
`;