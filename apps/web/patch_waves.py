"""Usage (from apps/web):  python patch_waves.py app/explore/page.tsx
Adds the animated ocean-wave layer, a Waves toggle, and live sea-state (Open-Meteo Marine). Makes page.tsx.bak3 first."""
import shutil, sys
path = sys.argv[1]
s = open(path, encoding="utf-8").read()
shutil.copy(path, path + ".bak3")

def rep(old, new):
    global s
    assert s.count(old) == 1, "anchor not found exactly once:\n" + old[:90]
    s = s.replace(old, new)

rep('import { Fraunces, JetBrains_Mono } from "next/font/google";',
    'import { Fraunces, JetBrains_Mono } from "next/font/google";\nimport { createOceanWaves } from "../../lib/oceanWaves";')
rep('const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);',
    'const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);\n  const wavesRef = useRef<ReturnType<typeof createOceanWaves> | null>(null);')
rep('const [searchError, setSearchError] = useState("");',
    'const [searchError, setSearchError] = useState("");\n  const [waves, setWaves] = useState(true);\n  const [sea, setSea] = useState("");')
rep('map.getCanvas().style.cursor = "crosshair";\n      setMapReady(true);',
    'map.getCanvas().style.cursor = "crosshair";\n      wavesRef.current = createOceanWaves(maplibregl, map);\n      setMapReady(true);')
rep('clearTimeout(retryTimer.current);\n      markerRef.current?.remove();\n      map.remove();',
    'clearTimeout(retryTimer.current);\n      markerRef.current?.remove();\n      wavesRef.current?.destroy();\n      wavesRef.current = null;\n      map.remove();')
rep('  /* ── orbit ── */', '''  /* ── ocean waves on/off ── */
  useEffect(() => {
    if (mapReady) wavesRef.current?.setEnabled(waves);
  }, [waves, mapReady]);

  /* ── real sea state at the view centre drives wave direction, size and speed ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | null = null;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const c = m.getCenter();
        ctrl?.abort();
        ctrl = new AbortController();
        try {
          const r = await fetch(
            `https://marine-api.open-meteo.com/v1/marine?latitude=${c.lat.toFixed(2)}&longitude=${c.lng.toFixed(2)}&current=wave_height,wave_direction,wave_period`,
            { signal: ctrl.signal }
          );
          const k = (await r.json())?.current;
          if (k && typeof k.wave_height === "number" && typeof k.wave_direction === "number") {
            const period = typeof k.wave_period === "number" ? k.wave_period : 8;
            wavesRef.current?.setSeaState({ height: k.wave_height, fromDeg: k.wave_direction, periodS: period });
            setSea(`${k.wave_height.toFixed(1)} m · ${period.toFixed(0)} s · from ${Math.round(k.wave_direction)}°`);
          } else setSea("");
        } catch (e: any) {
          if (e?.name !== "AbortError") setSea("");
        }
      }, 900);
    };
    m.on("moveend", update);
    update();
    return () => {
      clearTimeout(timer);
      ctrl?.abort();
      m.off("moveend", update);
    };
  }, [mapReady]);

  /* ── orbit ── */''')
rep('🔄 Orbit\n          </button>', '''🔄 Orbit
          </button>

          <button
            onClick={() => setWaves((w) => !w)}
            className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              waves ? "border-[#2ee6c5] text-[#2ee6c5]" : "border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            🌊 Waves
          </button>''')
rep('        <AiAnalyst onDiveIn=', '''        {waves && sea && (
          <div className={`absolute bottom-[4.5rem] right-5 z-30 px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-300 ${GLASS}`}>
            🌊 Sea state · {sea}
          </div>
        )}

        <AiAnalyst onDiveIn=''')
open(path, "w", encoding="utf-8", newline="\n").write(s)
print("patched", path, "(backup:", path + ".bak3)")
