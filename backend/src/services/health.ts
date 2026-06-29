import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { config, PARTICIPANT_KEYS, type ParticipantKey } from "../config.js";
import { pool } from "../db/index.js";
import { getCantonAuthHeaders } from "../canton/auth.js";

function configuredParticipants(): ParticipantKey[] {
  return PARTICIPANT_KEYS.filter((key) => {
    const url = config.canton.participantJsonUrls[key];
    return typeof url === "string" && url.trim().length > 0;
  });
}

async function checkDatabase(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

async function checkBootstrap(): Promise<boolean> {
  if (config.canton.mode !== "public") {
    return true;
  }
  try {
    await access(config.canton.bootstrapReadyFile);
    return true;
  } catch {
    return false;
  }
}

async function readBootstrapMetadata(): Promise<Record<string, unknown> | null> {
  const metadataPath =
    process.env.CANTON_BOOTSTRAP_METADATA_FILE ?? "/shared/bootstrap-metadata.json";
  try {
    const raw = await readFile(metadataPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function checkCanton(): Promise<boolean> {
  const participants = configuredParticipants();
  if (participants.length === 0) {
    return false;
  }
  try {
    const checks = await Promise.all(
      participants.map(async (key) => {
        const response = await fetch(`${config.canton.participantJsonUrls[key]}/readyz`, {
          method: "GET",
          headers: await getCantonAuthHeaders(),
        });
        return response.ok;
      }),
    );
    return checks.every(Boolean);
  } catch {
    return false;
  }
}

export async function livenessProbe() {
  return { status: "ok", service: "veilio-exchange-backend", mode: config.canton.mode };
}

export async function readinessProbe() {
  const [database, canton, bootstrap, metadata] = await Promise.all([
    checkDatabase(),
    checkCanton(),
    checkBootstrap(),
    readBootstrapMetadata(),
  ]);
  return {
    status: database && canton && bootstrap ? "ok" : "degraded",
    mode: config.canton.mode,
    checks: { database, canton, bootstrap },
    canton: metadata
      ? {
          packageId: metadata.packageId,
          packageIds: metadata.packageIds,
          cantonScanBaseUrl: metadata.cantonScanBaseUrl,
          readyAt: metadata.readyAt,
        }
      : undefined,
  };
}
