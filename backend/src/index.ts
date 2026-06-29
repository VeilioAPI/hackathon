import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { migrate } from "./db/index.js";
import { apiRouter } from "./routes/index.js";
import { listParties } from "./services/party-cache.js";
import { waitForBootstrapReadiness } from "./bootstrap/readiness.js";
import { ensureStorageRoot } from "./services/object-storage.js";
import {
  prepareProductionCatalog,
  seedProductionCatalogIfEnabled,
} from "./bootstrap/catalog-init.js";
import { invalidatePartyRegistryWarm, warmPartyRegistryWithRetry } from "./services/party-registry.js";
import { httpLogger, logger, metricsMiddleware, metricsSnapshot } from "./observability.js";
import { getCantonAuthHeaders } from "./canton/auth.js";
import { isCantonOAuthConfigured } from "./canton/oauth-token.js";

const app = express();

app.use(httpLogger);
app.use(metricsMiddleware);
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(helmet());
app.use(
  rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path === "/metrics" ||
      req.path === "/api/health" ||
      req.path.startsWith("/api/health/"),
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRouter);
app.get("/metrics", async (_req, res, next) => {
  try {
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(await metricsSnapshot());
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    logger.error({ err: error }, "Unhandled request error");
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: error.issues.map((issue) => issue.message).join("; "),
      });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    res.status(status).json({ error: message });
  },
);

async function start(): Promise<void> {
  await waitForBootstrapReadiness();
  await ensureStorageRoot();
  await migrate();
  await prepareProductionCatalog();

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, "0.0.0.0", () => resolve());
    server.on("error", reject);
  });

  logger.info(`Veilio backend listening on http://0.0.0.0:${config.port}`);

  if (isCantonOAuthConfigured()) {
    void getCantonAuthHeaders()
      .then(() => logger.info("Canton OAuth token ready"))
      .catch((error) => {
        logger.warn({ err: error }, "Initial Canton OAuth token fetch failed; will retry on first request");
      });
  }

  void warmPartyRegistryWithRetry()
    .then(() => {
      const parties = listParties();
      logger.info(
        parties.length > 0
          ? `Canton parties: ${parties.map((p) => p.hint).join(", ")}`
          : "Canton parties: (none yet — add banks via the UI)",
      );
    })
    .catch((error) => {
      logger.warn(
        { err: error },
        "Party registry warm-up failed on startup; will retry on first API request",
      );
    });

  void seedProductionCatalogIfEnabled().catch((error) => {
    logger.warn({ err: error }, "Demo network seed on startup failed");
  });

  void watchEmbeddedCantonHealth();
}

const CANTON_WATCH_INTERVAL_MS = Number(process.env.CANTON_WATCH_INTERVAL_MS ?? 30_000);

async function isEmbeddedCantonReachable(): Promise<boolean> {
  const url = config.canton.participantJsonUrls.participant1;
  if (!url || config.canton.mode === "public") {
    return true;
  }
  try {
    const response = await fetch(`${url}/readyz`, {
      method: "GET",
      headers: await getCantonAuthHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function watchEmbeddedCantonHealth(): void {
  if (config.canton.mode === "public") {
    return;
  }

  let lastReachable = true;

  setInterval(() => {
    void (async () => {
      const reachable = await isEmbeddedCantonReachable();
      if (!reachable && lastReachable) {
        logger.warn("Embedded Canton became unreachable; invalidating party registry cache");
        invalidatePartyRegistryWarm();
      } else if (reachable && !lastReachable) {
        logger.info("Embedded Canton is reachable again; re-warming party registry");
        void warmPartyRegistryWithRetry().catch((error) => {
          logger.warn({ err: error }, "Party registry re-warm after Canton recovery failed");
        });
      }
      lastReachable = reachable;
    })();
  }, CANTON_WATCH_INTERVAL_MS);
}

start().catch((error) => {
  logger.error({ err: error }, "Failed to start backend");
  process.exit(1);
});
