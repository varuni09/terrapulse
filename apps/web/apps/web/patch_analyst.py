"""Usage (from apps/web):  python patch_analyst.py app/explore/page.tsx
Wires the grounded analyst into the page. Makes page.tsx.bak5 first."""
import shutil, sys
path = sys.argv[1]
s = open(path, encoding="utf-8").read()
shutil.copy(path, path + ".bak5")
old = '<AiAnalyst onDiveIn={() => mapRef.current?.triggerRepaint()} onSwitchLayer={(l) => setLayer(l)} />'
assert s.count(old) == 1, "AiAnalyst line not found exactly once"
s = s.replace(old, '<AiAnalyst onFlyTo={(lat, lon, name) => goTo({ name, latitude: lat, longitude: lon })} onSwitchLayer={(l) => setLayer(l)} />')
open(path, "w", encoding="utf-8", newline="\n").write(s)
print("patched", path, "(backup:", path + ".bak5)")
