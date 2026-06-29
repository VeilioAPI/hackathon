import { logger } from "../observability.js";
import { initializeParties } from "./parties.js";

let warmPromise: Promise<void> | null = null;
let warmed = false;

export function isPartyRegistryWarm(): boolean {
  return warmed;
}

export async function warmPartyRegistryWithRetry(
  maxAttempts = 10,
  delayMs = 3000,
): Promise<void> {
  if (warmed) {
    return;
  }
  if (warmPromise) {
    await warmPromise;
    return;
  }

  warmPromise = (async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await initializeParties();
        warmed = true;
        return;
      } catch (error) {
        logger.warn(
          { err: error, attempt, maxAttempts },
          "Party registry warm-up attempt failed",
        );
        if (attempt === maxAttempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  })();

  try {
    await warmPromise;
  } catch (error) {
    warmPromise = null;
    throw error;
  }
}

export function invalidatePartyRegistryWarm(): void {
  warmed = false;
  warmPromise = null;
}

export async function ensurePartyRegistryReady(
  maxAttempts = 10,
  delayMs = 3000,
): Promise<void> {
  if (warmed) {
    return;
  }
  await warmPartyRegistryWithRetry(maxAttempts, delayMs);
}
