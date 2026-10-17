import "server-only";

// @ts-expect-error @google/earthengine does not provide TypeScript declarations.
import ee from "@google/earthengine";
import fs from "node:fs";
import path from "node:path";

let initializationPromise: Promise<void> | null = null;

export function initializeEarthEngine(): Promise<void> {
  if (initializationPromise) return initializationPromise;

  initializationPromise = new Promise((resolve, reject) => {
    try {
      const project = process.env.GEE_PROJECT;
      const keyPath = process.env.GEE_KEY_PATH;

      if (!project || !keyPath) {
        throw new Error("Missing GEE_PROJECT or GEE_KEY_PATH in .env.local");
      }

      const absoluteKeyPath = path.resolve(process.cwd(), keyPath);
      const key = JSON.parse(fs.readFileSync(absoluteKeyPath, "utf8"));

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
            project
          );
        },
        (error: unknown) => {
          initializationPromise = null;
          reject(error);
        }
      );
    } catch (error) {
      initializationPromise = null;
      reject(error);
    }
  });

  return initializationPromise;
}

export { ee };