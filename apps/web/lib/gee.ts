
import "server-only";

// @ts-expect-error @google/earthengine does not provide TypeScript declarations.
import ee from "@google/earthengine";
import fs from "node:fs";
import path from "node:path";

let initializationPromise: Promise<void> | null = null;

function getServiceAccountKey(): Record<string, unknown> {
  const json = process.env.GEE_SERVICE_ACCOUNT_JSON;

  if (json) {
    return JSON.parse(json);
  }

  // Local development fallback.
  const keyPath = process.env.GEE_KEY_PATH;

  if (keyPath) {
    const absoluteKeyPath = path.resolve(process.cwd(), keyPath);
    return JSON.parse(fs.readFileSync(absoluteKeyPath, "utf8"));
  }

  throw new Error(
    "Missing Earth Engine credentials. Set GEE_SERVICE_ACCOUNT_JSON in Vercel or GEE_KEY_PATH locally.",
  );
}

export function initializeEarthEngine(): Promise<void> {
  if (initializationPromise) return initializationPromise;

  initializationPromise = new Promise((resolve, reject) => {
    try {
      const project = process.env.GEE_PROJECT;

      if (!project) {
        throw new Error("Missing GEE_PROJECT environment variable.");
      }

      const key = getServiceAccountKey();

      ee.data.authenticateViaPrivateKey(
        key,
        () => {
          ee.initialize(
            null,
            null,
            () => resolve(),
            (error: unknown) => {
              initializationPromise = null;
              reject(error);
            },
            project,
          );
        },
        (error: unknown) => {
          initializationPromise = null;
          reject(error);
        },
      );
    } catch (error) {
      initializationPromise = null;
      reject(error);
    }
  });

  return initializationPromise;
}

export { ee };
