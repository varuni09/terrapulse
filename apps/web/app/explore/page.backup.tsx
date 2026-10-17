"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Navbar from "../components/Navbar";
import AiAnalyst from "../insights/AiAnalyst";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Fraunces, JetBrains_Mono } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

type Layer = "lst" | "ndvi" | "equity";
type ViewMode = "cinematic" | "flat" | "street";

type Sel = {
  lat: number;
  lon: number;
  lst: number;
  ndvi: number;
  equity: number;
  name?: string;
};

type Place = {
  id?: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

/* ───────────────────────── constants ───────────────────────── */

const RAMPS: Record<Layer, string[]> = {
  lst: ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"],
  ndvi: ["#f7fcb9", "#addd8e", "#41ab5d", "#006837"],
  equity: ["#feebe2", "#fbb4b9", "#f768a1", "#c51b8a", "#7a0177"],
};

const META = {
  lst: { label: "Surface temp", lo: "26°C", hi: "44°C" },
  ndvi: { label: "Vegetation", lo: "0.00", hi: "0.85" },
  equity: { label: "Heat Equity Risk", lo: "0", hi: "100" },
};

const GLASS =
  "bg-[#04091f]/80 backdrop-blur-2xl border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.09)] rounded-2xl";

const EMPTY = { type: "FeatureCollection", features: [] } as any;
const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const BLOCK_MIN_ZOOM = 6;
const NICE_STEPS = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 3, 5, 10];
const MAX_BLOCKS = 1600;

/* ───────────────────────── colour helpers ───────────────────────── */

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function ramp(t: number, cols: string[]) {
  const x = clamp(t) * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(x)),
    f = x - i;
  const a = rgb(cols[i]),
    b = rgb(cols[i + 1]);
  return "#" + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, "0")).join("");
}

function makeLut(cols: string[]) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const c = rgb(ramp(i / 255, cols));
    lut[i * 3] = c[0];
    lut[i * 3 + 1] = c[1];
    lut[i * 3 + 2] = c[2];
  }
  return lut;
}
const LUTS: Record<Layer, Uint8ClampedArray> = {
  lst: makeLut(RAMPS.lst),
  ndvi: makeLut(RAMPS.ndvi),
  equity: makeLut(RAMPS.equity),
};

/* ───────────────────────── synthetic data field ─────────────────────────
   Deterministic function of (lat, lon): the same point always gives the same
   value, so the smooth heat surface, the 3D blocks and click-inspection agree.
   Replace `sample()` with a real data lookup later.
────────────────────────────────────────────────────────────────────────── */

function hash2(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s),
    b = hash2(xi + 1, yi, s),
    c = hash2(xi, yi + 1, s),
    d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(lat: number, lon: number, seed: number, freqs: number[]) {
  let sum = 0,
    norm = 0,
    amp = 1;
  for (let i = 0; i < freqs.length; i++) {
    sum += amp * vnoise(lon * freqs[i], lat * freqs[i], seed + i * 131);
    norm += amp;
    amp *= 0.6;
  }
  return sum / norm;
}

const REG = [0.35, 1.1, 3.2];
const DET = [14, 45, 160, 600, 2200];
const stretch = (x: number, k: number) => clamp((x - 0.5) * k + 0.5);

// [lat, lon, scale] – every city/town label the map renders gets an urban heat island.
type City = [number, number, number];
const CITIES: City[] = [];

function addCity(lat: number, lon: number, scale: number) {
  for (const c of CITIES) {
    if (Math.abs(c[0] - lat) < 0.03 && Math.abs(c[1] - lon) < 0.03) {
      c[2] = Math.max(c[2], scale);
      return;
    }
  }
  CITIES.push([lat, lon, scale]);
  if (CITIES.length > 1500) CITIES.shift();
}

function registerCities(m: maplibregl.Map) {
  try {
    const feats = m.queryRenderedFeatures();
    for (const f of feats) {
      if (f.sourceLayer !== "place") continue;
      const cls = (f.properties as any)?.class;
      if (cls !== "city" && cls !== "town") continue;
      const g: any = f.geometry;
      if (g?.type !== "Point") continue;
      addCity(g.coordinates[1], g.coordinates[0], cls === "city" ? 1 : 0.55);
    }
  } catch {
    /* ignore */
  }
}

function urban(lat: number, lon: number, cs: City[]) {
  let u = 0;
  const cl = Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const dy = lat - c[0];
    if (dy > 1.2 || dy < -1.2) continue;
    const dx = (lon - c[1]) * cl;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1.5) continue;
    const s = c[2];
    const core = Math.exp(-d2 / (2 * 0.07 * s * 0.07 * s));
    const halo = 0.55 * Math.exp(-d2 / (2 * 0.25 * s * 0.25 * s));
    const v = core + halo;
    if (v > u) u = v;
  }
  return Math.min(1, u);
}

function sample(lat: number, lon: number, cs: City[]) {
  const reg = fbm(lat, lon, 11, REG);
  const regV = fbm(lat, lon, 29, REG);
  const det = fbm(lat, lon, 53, DET);
  const detV = fbm(lat, lon, 71, DET);
  const u = clamp(urban(lat, lon, cs) * (0.7 + 0.6 * det));

  const t = clamp(0.62 * stretch(reg, 2.4) + 0.22 * stretch(det, 2.2) + 0.38 * u);
  const v = clamp(0.62 * stretch(regV, 2.4) + 0.3 * stretch(detV, 2.2) + 0.08 * (1 - t) - 0.55 * u + 0.12);
  const eq = clamp(0.5 * t + 0.35 * (1 - v) + 0.2 * u);

  return { lst: 26 + t * 18, ndvi: v * 0.85, equity: Math.round(eq * 100), t, v, eq };
}

const normFor = (layer: Layer, s: ReturnType<typeof sample>) =>
  layer === "lst" ? s.t : layer === "ndvi" ? s.v : s.eq;

/* ───────────────────────── map helpers ───────────────────────── */

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

function viewBounds(m: maplibregl.Map) {
  const c = m.getCanvas();
  const w = c.clientWidth,
    h = c.clientHeight;
  const p = m.getPitch();
  const topY = p > 60 ? h * 0.45 : p > 40 ? h * 0.25 : p > 20 ? h * 0.1 : 0;
  const pts = [
    [0, topY],
    [w, topY],
    [w, h],
    [0, h],
  ].map((q) => m.unproject(q as [number, number]));
  const lons = pts.map((q) => q.lng),
    lats = pts.map((q) => q.lat);
  let west = Math.min(...lons),
    east = Math.max(...lons),
    south = Math.min(...lats),
    north = Math.max(...lats);
  const padX = (east - west) * 0.08,
    padY = (north - south) * 0.08;
  west = Math.max(-179.9, west - padX);
  east = Math.min(179.9, east + padX);
  south = Math.max(-80, south - padY);
  north = Math.min(80, north + padY);
  return { west, east, south, north };
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

/* ───────────────────────── component ───────────────────────── */

export default function ExplorePage() {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const heatDrawBusyRef = useRef(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const orbitRef = useRef(false);
  const layerRef = useRef<Layer>("lst");
  const blocksOnRef = useRef(true);

  const [mapReady, setMapReady] = useState(false);
  const [layer, setLayer] = useState<Layer>("lst");
  const [orbit, setOrbit] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("cinematic");
  const [blockHeight, setBlockHeight] = useState(1.0);
  const [blocks, setBlocks] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const blocksOn = blocks && viewMode !== "flat";
  layerRef.current = layer;
  blocksOnRef.current = blocksOn;

  /* ── smooth heat surface (canvas → image source) ── */
  const drawHeat = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const src: any = m.getSource("heat-img");
    if (!src || typeof src.updateImage !== "function") return;

    const { west, east, south, north } = viewBounds(m);
    const yN = mercY(north),
      yS = mercY(south);
    const W = 384;
    const H = Math.round(clamp((W * (yN - yS)) / (((east - west) * Math.PI) / 180), 128, 512));

    const cs = CITIES.filter(
      (c) => c[0] > south - 1.3 && c[0] < north + 1.3 && c[1] > west - 2 && c[1] < east + 2
    );
    const lut = LUTS[layerRef.current];
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    const d = img.data;

    for (let j = 0; j < H; j++) {
      const lat = invMercY(yN + ((yS - yN) * (j + 0.5)) / H);
      for (let i = 0; i < W; i++) {
        const lon = west + ((east - west) * (i + 0.5)) / W;
        const s = sample(lat, lon, cs);
        const idx = Math.round(clamp(normFor(layerRef.current, s)) * 255) * 3;
        const o = (j * W + i) * 4;
        d[o] = lut[idx];
        d[o + 1] = lut[idx + 1];
        d[o + 2] = lut[idx + 2];
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    src.updateImage({
      url: canvas.toDataURL("image/png"),
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    });
  }, []);

  /* ── 3D square blocks (only when zoomed in enough) ── */
  const drawBlocks = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const source = m.getSource("blocks-src") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!blocksOnRef.current || m.getZoom() < BLOCK_MIN_ZOOM) {
      source.setData(EMPTY);
      return;
    }

    const { west, east, south, north } = viewBounds(m);
    let k = NICE_STEPS.findIndex((s) => s >= (east - west) / 36);
    if (k < 0) k = NICE_STEPS.length - 1;
    let step = NICE_STEPS[k];
    const count = (st: number) =>
      (Math.ceil(east / st) - Math.floor(west / st)) * (Math.ceil(north / st) - Math.floor(south / st));
    while (count(step) > MAX_BLOCKS && k < NICE_STEPS.length - 1) step = NICE_STEPS[++k];

    const cs = CITIES.filter(
      (c) => c[0] > south - 1.3 && c[0] < north + 1.3 && c[1] > west - 2 && c[1] < east + 2
    );
    const hasWater = !!m.getLayer("water");
    const cv = m.getCanvas();
    const cw = cv.clientWidth,
      ch = cv.clientHeight;
    const cellM = step * 111320;
    const gap = step * 0.04;
    const features: any[] = [];

    for (let i = Math.floor(west / step); i < Math.ceil(east / step); i++) {
      for (let j = Math.floor(south / step); j < Math.ceil(north / step); j++) {
        const lon0 = i * step,
          lat0 = j * step;
        const cx = lon0 + step / 2,
          cy = lat0 + step / 2;

        if (hasWater) {
          try {
            const p = m.project([cx, cy]);
            if (p.x >= 0 && p.y >= 0 && p.x <= cw && p.y <= ch) {
              if (m.queryRenderedFeatures([p.x, p.y], { layers: ["water"] }).length) continue;
            }
          } catch {
            /* ignore */
          }
        }

        const s = sample(cy, cx, cs);
        const hs = cellM * 0.35;
        features.push({
          type: "Feature",
          properties: {
            lat: cy,
            lon: cx,
            lst: s.lst,
            ndvi: s.ndvi,
            equity: s.equity,
            c_lst: ramp(s.t, RAMPS.lst),
            c_ndvi: ramp(s.v, RAMPS.ndvi),
            c_equity: ramp(s.eq, RAMPS.equity),
            h_lst: (0.1 + 0.9 * s.t) * hs,
            h_ndvi: (0.1 + 0.9 * s.v) * hs,
            h_equity: (0.1 + 0.9 * s.eq) * hs,
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [lon0 + gap, lat0 + gap],
                [lon0 + step - gap, lat0 + gap],
                [lon0 + step - gap, lat0 + step - gap],
                [lon0 + gap, lat0 + step - gap],
                [lon0 + gap, lat0 + gap],
              ],
            ],
          },
        });
      }
    }
    source.setData({ type: "FeatureCollection", features } as any);
  }, []);

  const regen = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    registerCities(m);
    drawHeat();
    drawBlocks();
  }, [drawHeat, drawBlocks]);

  const placeMarker = useCallback((lng: number, lat: number) => {
    const m = mapRef.current;
    if (!m) return;
    markerRef.current?.remove();
    const el = document.createElement("div");
    el.style.cssText =
      "width:18px;height:18px;border-radius:50%;border:2px solid #2ee6c5;box-shadow:0 0 14px #2ee6c5;background:rgba(46,230,197,.25);pointer-events:none";
    markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
  }, []);

  /* ── init map once ── */
  useEffect(() => {
    if (!box.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: box.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [78.9629, 22.0],
      zoom: 4.8,
      pitch: 40,
      bearing: -15,
      maxPitch: 70,
      renderWorldCopies: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (orbitRef.current) return;
      clearTimeout(timer);
      timer = setTimeout(regen, 220);
    };

    map.on("load", () => {
      map.resize();

      const layers = map.getStyle().layers;
      const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
      // Heat surface goes UNDER the water layer (so oceans stay clear) and under labels.
      const beforeHeat = map.getLayer("water") ? "water" : firstSymbol;

      const vb = viewBounds(map);
      map.addSource("heat-img", {
        type: "image",
        url: BLANK_PNG,
        coordinates: [
          [vb.west, vb.north],
          [vb.east, vb.north],
          [vb.east, vb.south],
          [vb.west, vb.south],
        ],
      });
      map.addLayer(
        {
          id: "heat-layer",
          type: "raster",
          source: "heat-img",
          paint: { "raster-opacity": 0.55, "raster-fade-duration": 0 },
        },
        beforeHeat
      );

      map.addSource("blocks-src", { type: "geojson", data: EMPTY });
      map.addLayer(
        {
          id: "blocks-layer",
          type: "fill-extrusion",
          source: "blocks-src",
          paint: {
            "fill-extrusion-color": ["get", "c_lst"],
            "fill-extrusion-height": ["get", "h_lst"],
            "fill-extrusion-opacity": 0.9,
          },
        },
        firstSymbol
      );

      map.on("click", async (e) => {
        const { lat, lng } = e.lngLat;
        const s = sample(lat, lng, CITIES);
        setSel({ lat, lon: lng, lst: s.lst, ndvi: s.ndvi, equity: s.equity, name: "Locating…" });
        placeMarker(lng, lat);
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lng}`
          );
          const d = await r.json();
          const a = d.address || {};
          const place = a.city || a.town || a.village || a.suburb || a.county || a.state_district || d.name;
          const label = [place, a.state].filter(Boolean).join(", ") || "Open water / unnamed area";
          setSel((cur) => (cur && cur.lat === lat && cur.lon === lng ? { ...cur, name: label } : cur));
        } catch {
          setSel((cur) => (cur && cur.lat === lat && cur.lon === lng ? { ...cur, name: undefined } : cur));
        }
      });

      setMapReady(true);
      regen();
      map.once("idle", regen); // labels/tiles are loaded now → register cities again
    });

    map.on("moveend", schedule);

    mapRef.current = map;
    return () => {
      clearTimeout(timer);
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [regen, placeMarker]);

  /* ── layer change: recolour surface + blocks ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    drawHeat();
    if (m.getLayer("blocks-layer")) {
      m.setPaintProperty("blocks-layer", "fill-extrusion-color", ["get", `c_${layer}`]);
    }
  }, [layer, mapReady, drawHeat]);

  /* ── block height / visibility ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady || !m.getLayer("blocks-layer")) return;
    m.setPaintProperty("blocks-layer", "fill-extrusion-height", ["*", ["get", `h_${layer}`], blockHeight]);
  }, [layer, blockHeight, mapReady]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    m.setPaintProperty("heat-layer", "raster-opacity", blocksOn ? 0.55 : 0.85);
    drawBlocks();
  }, [blocksOn, mapReady, drawBlocks]);

  /* ── orbit ── */
  useEffect(() => {
    orbitRef.current = orbit;
    const m = mapRef.current;
    if (!m || !mapReady) return;
    if (!orbit) {
      regen();
      return;
    }
    let raf = 0;
    const spin = () => {
      m.setBearing(m.getBearing() + 0.15);
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    const iv = setInterval(() => {
      drawHeat();
      drawBlocks();
    }, 900);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [orbit, mapReady, regen, drawHeat, drawBlocks]);

  /* ── search suggestions ── */
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
    addCity(p.latitude, p.longitude, 1.2);
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
    });
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
    if (mode === "flat") m.easeTo({ pitch: 0, bearing: 0, duration: 1200 });
    if (mode === "cinematic") m.easeTo({ pitch: 45, bearing: -20, duration: 1200 });
    if (mode === "street") m.easeTo({ pitch: 68, bearing: 35, duration: 1200 });
  };

  const riskLabel = (v: number) => (v >= 70 ? "Severe" : v >= 50 ? "High" : v >= 30 ? "Moderate" : "Low");

  const bars: { key: Layer; label: string; text: string; pct: number }[] = sel
    ? [
        { key: "lst", label: "Surface Temp", text: `${sel.lst.toFixed(1)}°C`, pct: (sel.lst - 26) / 18 },
        { key: "ndvi", label: "Vegetation (NDVI)", text: sel.ndvi.toFixed(2), pct: sel.ndvi / 0.85 },
        { key: "equity", label: "Heat Equity Risk", text: `${sel.equity} / 100 · ${riskLabel(sel.equity)}`, pct: sel.equity / 100 },
      ]
    : [];

  return (
    <main
      className={`relative min-h-screen overflow-hidden bg-[#02061a] pt-16 font-mono text-slate-100 ${display.variable} ${mono.variable}`}
    >
      <Navbar />
      <div className="relative h-[calc(100vh-64px)] w-full">
        <div ref={box} style={{ position: "absolute", inset: 0, zIndex: 10 }} />
        <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(2,6,26,.6)_100%)]" />

        {/* Search & Dock */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className={`absolute left-5 top-5 z-30 flex flex-wrap items-center gap-3 p-2.5 ${GLASS}`}
        >
          <form onSubmit={handleSearch} className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchError("");
              }}
              onFocus={() => results.length && setOpen(true)}
              placeholder="Search any city on Earth…"
              className="w-60 rounded-xl border border-white/10 bg-black/60 py-1.5 pl-3 pr-14 text-xs text-white placeholder-slate-400 focus:border-[#2ee6c5] focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-1.5 rounded-lg bg-[#2ee6c5] px-2 py-1 text-[10px] font-bold uppercase text-[#02061a] hover:brightness-110"
            >
              {searching ? "…" : "Go"}
            </button>

            {(open && results.length > 0) || searchError ? (
              <div className={`absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden ${GLASS}`}>
                {searchError && <div className="px-3 py-2 text-xs text-rose-300">{searchError}</div>}
                {open &&
                  results.map((r, i) => (
                    <button
                      type="button"
                      key={`${r.latitude}-${r.longitude}-${i}`}
                      onClick={() => goTo(r)}
                      className="block w-full border-b border-white/5 px-3 py-2 text-left text-xs last:border-0 hover:bg-white/10"
                    >
                      <div className="font-semibold text-white">{r.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {[r.admin1, r.country].filter(Boolean).join(", ")}
                      </div>
                    </button>
                  ))}
              </div>
            ) : null}
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
                {META[l].label}
              </button>
            ))}
          </div>

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
            onClick={() => setOrbit(!orbit)}
            className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              orbit ? "border-[#2ee6c5] text-[#2ee6c5]" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            🔄 Orbit
          </button>

          <button
            onClick={() => {
              setOrbit(false);
              markerRef.current?.remove();
              setSel(null);
              mapRef.current?.flyTo({ center: [78.9629, 22.0], zoom: 4.8, pitch: 40, bearing: -15, duration: 2500 });
            }}
            className="rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-white/20 active:scale-95"
          >
            🌐 Reset
          </button>
        </motion.div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className={`absolute bottom-5 left-16 z-30 max-w-[calc(100%-5rem)] p-4 md:w-[24rem] ${GLASS}`}
        >
          <div className="mb-1 text-[10px] uppercase tracking-[0.25em] text-slate-400">{META[layer].label}</div>
          <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${RAMPS[layer].join(",")})` }} />
          <div className="mt-1 flex justify-between text-[11px] tabular-nums">
            <span>{META[layer].lo}</span>
            <span>{META[layer].hi}</span>
          </div>
        </motion.div>

        {/* Inspector */}
        <AnimatePresence>
          {sel && (
            <motion.aside
              key={`${sel.lat}-${sel.lon}`}
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 48 }}
              className={`absolute right-5 top-[19.5rem] z-30 w-72 p-5 ${GLASS}`}
            >
              <div className="flex items-start justify-between">
                <div className="pr-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[#2ee6c5]">Location</div>
                  <h4 className="mt-1 text-sm leading-snug text-white">{sel.name ?? "Selected point"}</h4>
                  <div className="mt-0.5 text-[10px] tabular-nums text-slate-500">
                    {sel.lat.toFixed(4)}°, {sel.lon.toFixed(4)}°
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSel(null);
                    markerRef.current?.remove();
                  }}
                  className="text-slate-500 hover:text-white"
                >
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
                        className="h-full rounded-full"
                        style={{ width: `${clamp(b.pct) * 100}%`, background: ramp(clamp(b.pct), RAMPS[b.key]) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AiAnalyst onDiveIn={() => regen()} onSwitchLayer={(l) => setLayer(l)} />
      </div>
    </main>
  );
}