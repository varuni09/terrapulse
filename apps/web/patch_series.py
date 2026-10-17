"""Usage (from apps/web):  python patch_series.py app/explore/page.tsx
Adds the 24-month time-series card to the inspector and renames 'Heat Equity Risk' (it uses no people/income data).
Makes page.tsx.bak4 first."""
import shutil, sys
path = sys.argv[1]
s = open(path, encoding="utf-8").read()
shutil.copy(path, path + ".bak4")

def rep(old, new, many=False):
    global s
    n = s.count(old)
    assert n >= 1 and (many or n == 1), f"anchor found {n} times:\n" + old[:90]
    s = s.replace(old, new)

rep('import { Fraunces, JetBrains_Mono } from "next/font/google";',
    'import { Fraunces, JetBrains_Mono } from "next/font/google";\nimport TimeSeriesCard from "../components/TimeSeriesCard";')
rep('{/* live air temperature */}', '<TimeSeriesCard lat={sel.lat} lon={sel.lon} />\n\n              {/* live air temperature */}')
rep("Heat Equity Risk", "Heat–Green Index", many=True)
open(path, "w", encoding="utf-8", newline="\n").write(s)
print("patched", path, "(backup:", path + ".bak4)")
