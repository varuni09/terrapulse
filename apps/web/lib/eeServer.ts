// Shared Earth Engine initialisation for server routes (same env vars as your other GEE routes).
// @ts-ignore  (the Earth Engine node client ships no types)
import ee from "@google/earthengine";

let ready: Promise<void> | null = null;
export function initEE(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const project = process.env.GEE_PROJECT;
    const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
    if (!project) return reject(new Error("CONFIG: missing GEE_PROJECT"));
    if (!raw) return reject(new Error("CONFIG: missing GEE_SERVICE_ACCOUNT_JSON"));
    let key: any;
    try { key = JSON.parse(raw); } catch { return reject(new Error("CONFIG: GEE_SERVICE_ACCOUNT_JSON is not valid JSON")); }
    if (typeof key.private_key === "string") key.private_key = key.private_key.replace(/\\n/g, "\n");
    ee.data.authenticateViaPrivateKey(
      key,
      () => ee.initialize(null, null, () => resolve(), (e: any) => reject(new Error("EE init: " + String(e))), null, project),
      (e: any) => reject(new Error("EE auth: " + String(e)))
    );
  }).catch((e) => { ready = null; throw e; });
  return ready;
}
export { ee };
