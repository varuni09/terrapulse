
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("maplibre-gl/package.json");
const packageDir = path.dirname(packageJsonPath);
const sourceDir = path.join(packageDir, "dist");
const targetDir = path.join(process.cwd(), "public", "maplibre");

mkdirSync(targetDir, { recursive: true });

for (const file of [
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs",
]) {
  copyFileSync(
    path.join(sourceDir, file),
    path.join(targetDir, file),
  );
  console.log(`Copied ${file}`);
}
