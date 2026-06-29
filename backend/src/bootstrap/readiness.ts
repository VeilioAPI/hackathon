import { access } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import { config } from "../config.js";

export async function waitForBootstrapReadiness(): Promise<void> {
  if (config.canton.mode !== "public") {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.canton.startupWaitMs) {
    try {
      await access(config.canton.bootstrapReadyFile);
      return;
    } catch {
      await wait(1500);
    }
  }

  throw new Error(
    `Timed out waiting for Canton bootstrap readiness file: ${config.canton.bootstrapReadyFile}`,
  );
}
