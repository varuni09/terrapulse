"""Usage (from apps/web):  python patch_cities.py app/explore/page.tsx
Adds: ?city= support, city picker, world-start camera + fly-in from orbit, NASA GIBS world heat layer (World toggle).
Makes page.tsx.bak2 first. Apply AFTER patch_explore.py."""
import shutil, sys
path = sys.argv[1]
s = open(path, encoding="utf-8").read()
shutil.copy(path, path + ".bak2")

def rep(old, new):
    global s
    assert s.count(old) == 1, "anchor not found exactly once:\n" + old[:90]
    s = s.replace(old, new)

rep('const rafK = useRef(0);', '''const rafK = useRef(0);
  const cityRef = useRef({ code: "chennai", name: "Chennai", center: [80.2, 13.04] as [number, number], zoom: 10.5 });
  const baseRef = useRef("/data/cities/chennai");
  const worldRef = useRef<{ tiles: string; maxzoom: number; attribution: string } | null>(null);''')

rep('const [focus, setFocus] = useState(false);', '''const [focus, setFocus] = useState(false);
  const [cities, setCities] = useState<any[]>([]);
  const [cityName, setCityName] = useState("");
  const [world, setWorld] = useState(true);''')

rep('const grid = await (await fetch("/data/chennai_h3_res8.geojson")).json();', '''const code = new URLSearchParams(window.location.search).get("city") ?? "chennai";
        baseRef.current = `/data/cities/${code}`;
        try {
          const reg = await (await fetch("/data/cities.json")).json();
          setCities(reg);
          const c = reg.find((x: any) => x.code === code);
          if (c) { cityRef.current = { code, name: c.name, center: c.center, zoom: c.zoom }; setCityName(c.name); }
        } catch { /* registry missing */ }
        try { worldRef.current = await (await fetch("/data/world.json")).json(); } catch { /* world layer not set up */ }
        const grid = await (await fetch(`${baseRef.current}/grid.geojson`)).json();''')
rep('fetch("/data/obs/index.json")', 'fetch(`${baseRef.current}/obs/index.json`)')
rep('fetch(`/data/obs/${idx[0].file}`)', 'fetch(`${baseRef.current}/obs/${idx[0].file}`)')

rep('center: [80.2, 13.04], zoom: 9.2, pitch: 0, bearing: 0', 'center: [20, 18], zoom: 1.5, pitch: 0, bearing: 0')
rep('m.flyTo({ center: [80.2, 13.04], zoom: 10.5, pitch: 55, bearing: -18, duration: 3200, essential: true });',
    'm.flyTo({ center: cityRef.current.center, zoom: cityRef.current.zoom, pitch: 55, bearing: -18, duration: 5200, curve: 1.6, essential: true });')
rep('mapRef.current?.flyTo({ center: [80.2, 13.04], zoom: 10.5, pitch: 55, bearing: -18, duration: 2600, essential: true });',
    'mapRef.current?.flyTo({ center: cityRef.current.center, zoom: cityRef.current.zoom, pitch: 55, bearing: -18, duration: 2600, essential: true });')
rep('center: [80.2707, 13.0827], zoom: 13.2,', 'center: cityRef.current.center, zoom: cityRef.current.zoom + 2.7,')
rep('{"Chennai".split("").map(', '{(cityName || "Earth").split("").map(')

rep('m.addSource("hex", { type: "geojson", data: fc });', '''const w = worldRef.current;
    if (w) {
      m.addSource("world", { type: "raster", tiles: [w.tiles], tileSize: 256, maxzoom: w.maxzoom, attribution: w.attribution });
      m.addLayer({ id: "world-lst", type: "raster", source: "world", paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 600 } } });
    }
    m.addSource("hex", { type: "geojson", data: fc });''')
rep('useEffect(() => { hRef.current = hScale; paint(); }, [hScale, paint]);', '''useEffect(() => { hRef.current = hScale; paint(); }, [hScale, paint]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("world-lst")) return;
    m.setPaintProperty("world-lst", "raster-opacity", world ? ["interpolate", ["linear"], ["zoom"], 2, 0.85, 6, 0.65, 9, 0.2] : 0);
  }, [world, mapReady, fc]);''')

rep('["Focus", focus, () => setFocus(!focus)]', '["Focus", focus, () => setFocus(!focus)], ["World", world, () => setWorld(!world)]')

rep('<div className="relative flex rounded-xl bg-black/40 p-1">', '''{cities.length > 1 && (
            <select value={cityRef.current.code} onChange={(e) => { window.location.href = `/explore?city=${e.target.value}`; }}
              className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-slate-200 outline-none">
              {cities.map((c: any) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          )}
          <div className="relative flex rounded-xl bg-black/40 p-1">''')
open(path, "w", encoding="utf-8", newline="\n").write(s)
print("patched", path, "(backup:", path + ".bak2)")
