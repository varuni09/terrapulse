import "server-only";

// @ts-expect-error Earth Engine's Node client does not provide TypeScript declarations.
import ee from "@google/earthengine";

let ready: Promise<void> | null = null;

export function initEE(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const project = process.env.GEE_PROJECT;
    const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
    if (!project) return reject(new Error("CONFIG: missing GEE_PROJECT"));
    if (!raw) return reject(new Error("CONFIG: missing GEE_SERVICE_ACCOUNT_JSON"));

    let key: Record<string, unknown>;
    try {
      key = JSON.parse(raw);
    } catch {
      return reject(new Error("CONFIG: GEE_SERVICE_ACCOUNT_JSON is not valid JSON"));
    }
    if (typeof key.private_key === "string") key.private_key = key.private_key.replace(/\\n/g, "\n");

    ee.data.authenticateViaPrivateKey(
      key,
      () => ee.initialize(null, null, () => resolve(), (error: unknown) => reject(new Error("EE init: " + String(error))), null, project),
      (error: unknown) => reject(new Error("EE auth: " + String(error))),
    );
  }).catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export { ee };