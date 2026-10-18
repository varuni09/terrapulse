type Point = { temperature: number | null };
type RenderRequest = {
  id: number;
  grid: { width: number; height: number; points: Point[] };
};
type RenderResponse = { id: number; blob?: Blob; error?: string };
type WorkerScope = {
  onmessage: ((event: MessageEvent<RenderRequest>) => void) | null;
  postMessage: (message: RenderResponse) => void;
};

const COLORS = ["#2c7bb6", "#4aa3ff", "#2ee6c5", "#ffd166", "#ff5a3d"];
const TEMP_MIN = -10;
const TEMP_MAX = 45;
const WIDTH = 160;
const HEIGHT = 160;

function rgb(color: string) {
  return [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
}

function colorAt(value: number) {
  const position = Math.max(0, Math.min(1, (value - TEMP_MIN) / (TEMP_MAX - TEMP_MIN))) * (COLORS.length - 1);
  const index = Math.min(COLORS.length - 2, Math.floor(position));
  const amount = position - index;
  const from = rgb(COLORS[index]);
  const to = rgb(COLORS[index + 1]);
  return from.map((channel, i) => Math.round(channel + (to[i] - channel) * amount));
}

const workerScope = self as unknown as WorkerScope;
workerScope.onmessage = async ({ data }) => {
  try {
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the weather raster canvas");

    const image = context.createImageData(WIDTH, HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      const gridY = (y / (HEIGHT - 1)) * (data.grid.height - 1);
      const y0 = Math.floor(gridY);
      const y1 = Math.min(data.grid.height - 1, y0 + 1);
      const fy = gridY - y0;
      for (let x = 0; x < WIDTH; x++) {
        const gridX = (x / (WIDTH - 1)) * (data.grid.width - 1);
        const x0 = Math.floor(gridX);
        const x1 = Math.min(data.grid.width - 1, x0 + 1);
        const fx = gridX - x0;
        const samples: [number | null, number][] = [
          [data.grid.points[y0 * data.grid.width + x0]?.temperature ?? null, (1 - fx) * (1 - fy)],
          [data.grid.points[y0 * data.grid.width + x1]?.temperature ?? null, fx * (1 - fy)],
          [data.grid.points[y1 * data.grid.width + x0]?.temperature ?? null, (1 - fx) * fy],
          [data.grid.points[y1 * data.grid.width + x1]?.temperature ?? null, fx * fy],
        ];
        let totalWeight = 0;
        let temperature = 0;
        for (const [value, weight] of samples) {
          if (value == null) continue;
          totalWeight += weight;
          temperature += value * weight;
        }
        if (totalWeight === 0) continue;

        const [red, green, blue] = colorAt(temperature / totalWeight);
        const offset = (y * WIDTH + x) * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 224;
      }
    }
    context.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    workerScope.postMessage({ id: data.id, blob });
  } catch (error) {
    workerScope.postMessage({ id: data.id, error: error instanceof Error ? error.message : "Weather raster rendering failed" });
  }
};
