import { config } from "../config.js";
import { logger } from "../observability.js";
import { clearProductionCatalog, seedDemoNetwork } from "../services/demo.js";
import { warmPartyRegistryWithRetry } from "../services/party-registry.js";

export async function prepareProductionCatalog(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (config.loadDemoOnStart) {
    return;
  }

  const result = await clearProductionCatalog();
  logger.info(
    result,
    "Production catalog cleared (set LOAD_DEMO_ON_START=true to auto-load demo data)",
  );
}

export async function seedProductionCatalogIfEnabled(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !config.loadDemoOnStart) {
    return;
  }

  await warmPartyRegistryWithRetry();
  const result = await seedDemoNetwork();
  logger.info(
    {
      partners: result.partners.length,
      listings: result.listings.length,
      scenarios: result.scenarios.length,
    },
    "Demo network seeded on startup (LOAD_DEMO_ON_START=true)",
  );
}
