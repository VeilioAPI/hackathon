import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

loadEnv();

export const PARTICIPANT_KEYS = [
  "participant1",
  "participant2",
  "participant3",
  "participant4",
  "participant5",
] as const;

export type ParticipantKey = (typeof PARTICIPANT_KEYS)[number];

export interface ParticipantsConfig {
  default_participant: { host: string; port: number };
  participants: Record<string, { host: string; port: number }>;
  party_participants?: Record<string, ParticipantKey>;
}

export interface PartyInfo {
  hint: string;
  partyId: string;
  participant: ParticipantKey;
}

export type CantonMode = "local" | "public";

const DEFAULT_JSON_URLS: Record<ParticipantKey, string> = {
  participant1: "http://127.0.0.1:5013",
  participant2: "http://127.0.0.1:5023",
  participant3: "http://127.0.0.1:5033",
  participant4: "http://127.0.0.1:5043",
  participant5: "http://127.0.0.1:5053",
};

function participantsConfigPath(): string {
  const configured = process.env.PARTICIPANTS_CONFIG ?? "../canton/participants.json";
  return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
}

export function loadParticipantsConfig(): ParticipantsConfig {
  return JSON.parse(readFileSync(participantsConfigPath(), "utf8")) as ParticipantsConfig;
}

export function partyHint(partyId: string): string {
  const idx = partyId.indexOf("::");
  return idx >= 0 ? partyId.slice(0, idx) : partyId;
}

function jsonUrlForParticipantKey(key: ParticipantKey): string {
  const envKey = `CANTON_${key.toUpperCase()}_JSON_URL`;
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.CANTON_MODE === "public" && key !== "participant1") {
    const primary = process.env.CANTON_PARTICIPANT1_JSON_URL?.trim();
    if (primary) {
      return primary;
    }
  }
  const legacy: Partial<Record<ParticipantKey, string | undefined>> = {
    participant1: process.env.CANTON_PARTICIPANT_A_JSON_URL,
    participant2: process.env.CANTON_PARTICIPANT_B_JSON_URL,
  };
  return legacy[key] ?? DEFAULT_JSON_URLS[key];
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:veilio@localhost:5432/veilio_exchange",
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  },
  security: {
    authRequired: process.env.AUTH_REQUIRED === "true",
    devTokenMint: process.env.AUTH_DEV_TOKEN_MINT === "true",
    jwtSecret: process.env.AUTH_JWT_SECRET ?? process.env.CANTON_JWT_SECRET ?? "veilio-dev-secret",
    jwtAudience: process.env.AUTH_JWT_AUDIENCE ?? "veilio-api",
    jwtIssuer: process.env.AUTH_JWT_ISSUER ?? "veilio-auth",
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
    idempotencyTtlSeconds: Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 3600),
  },
  observability: {
    requestLogLevel: process.env.REQUEST_LOG_LEVEL ?? "info",
  },
  loadDemoOnStart: process.env.LOAD_DEMO_ON_START === "true",
  storage: {
    provider: process.env.OBJECT_STORAGE_PROVIDER ?? "local",
    localRoot:
      process.env.OBJECT_STORAGE_LOCAL_ROOT ??
      resolve(process.cwd(), process.env.NODE_ENV === "production" ? "/app/object-store" : "./.object-store"),
    signedUrlTtlSeconds: Number(process.env.OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS ?? 900),
    signingSecret:
      process.env.OBJECT_STORAGE_SIGNING_SECRET ??
      process.env.AUTH_JWT_SECRET ??
      "veilio-storage-secret",
    publicBaseUrl:
      process.env.OBJECT_STORAGE_PUBLIC_BASE_URL ??
      `http://localhost:${Number(process.env.PORT ?? 3001)}`,
    bucket: process.env.OBJECT_STORAGE_BUCKET ?? "veilio",
  },
  canton: {
    mode: (process.env.CANTON_MODE === "public" ? "public" : "local") as CantonMode,
    bootstrapReadyFile: process.env.CANTON_BOOTSTRAP_READY_FILE ?? "/shared/.canton-ready",
    startupWaitMs: Number(process.env.CANTON_STARTUP_WAIT_MS ?? 180_000),
    packageId:
      process.env.CANTON_PACKAGE_ID ??
      "786f2e1ab3daecece17a8eaf6a62ac062e226aab6c4cff88a4659f51fa1bf752",
    useJwt: process.env.CANTON_USE_JWT === "true",
    authBearerToken: process.env.CANTON_AUTH_BEARER_TOKEN ?? "",
    oauth: {
      tokenUrl: process.env.CANTON_OAUTH_TOKEN_URL ?? "",
      clientId: process.env.CANTON_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.CANTON_OAUTH_CLIENT_SECRET ?? "",
      audience: process.env.CANTON_OAUTH_AUDIENCE ?? "",
      scope: process.env.CANTON_OAUTH_SCOPE ?? "daml_ledger_api",
    },
    jwtSecret: process.env.CANTON_JWT_SECRET ?? "veilio-dev-secret",
    jwtAudience: process.env.CANTON_JWT_AUDIENCE ?? "https://veilio.local",
    tlsCertPath: process.env.CANTON_TLS_CERT_PATH ?? "",
    tlsKeyPath: process.env.CANTON_TLS_KEY_PATH ?? "",
    timeoutMs: Number(process.env.CANTON_HTTP_TIMEOUT_MS ?? 15_000),
    publicBootstrap: {
      enabled: process.env.CANTON_PUBLIC_BOOTSTRAP_ENABLED === "true",
      uploadDar: process.env.CANTON_PUBLIC_UPLOAD_DAR !== "false",
      darPath: process.env.CANTON_DAR_PATH ?? "/app/dars/veilio-governance-0.2.0.dar",
      vetAllPackages: process.env.CANTON_PUBLIC_VET_ALL_PACKAGES !== "false",
      synchronizerId: process.env.CANTON_PUBLIC_SYNCHRONIZER_ID ?? "",
      writeParticipantsConfig:
        process.env.CANTON_PUBLIC_WRITE_PARTICIPANTS_CONFIG !== "false",
      partyMappingsJson: process.env.CANTON_PUBLIC_PARTY_MAPPINGS_JSON ?? "{}",
      bankDefinitionsJson: process.env.CANTON_PUBLIC_BANKS_JSON ?? "[]",
      autoAllocate: process.env.CANTON_PUBLIC_AUTO_ALLOCATE === "true",
      partyNamespace: process.env.CANTON_PUBLIC_PARTY_NAMESPACE ?? "",
      cantonScanBaseUrl:
        process.env.CANTONSCAN_BASE_URL ?? "https://www.cantonscan.com",
    },
    participantJsonUrls: Object.fromEntries(
      PARTICIPANT_KEYS.map((key) => [key, jsonUrlForParticipantKey(key)]),
    ) as Record<ParticipantKey, string>,
  },
};

export function jsonApiUrlForParticipant(participant: ParticipantKey): string {
  return config.canton.participantJsonUrls[participant];
}

export function isParticipantKey(value: string): value is ParticipantKey {
  return (PARTICIPANT_KEYS as readonly string[]).includes(value);
}
