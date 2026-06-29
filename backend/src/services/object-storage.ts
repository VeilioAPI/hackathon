import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "../config.js";

export type ObjectPointer = {
  provider: string;
  bucket: string;
  objectKey: string;
};

function objectPath(objectKey: string): string {
  const safeKey = objectKey.replace(/[^a-zA-Z0-9._/-]/g, "_");
  return join(config.storage.localRoot, safeKey);
}

export async function ensureStorageRoot(): Promise<void> {
  await mkdir(config.storage.localRoot, { recursive: true });
}

export async function putObject(objectKey: string, payload: Buffer): Promise<ObjectPointer> {
  await ensureStorageRoot();
  const path = objectPath(objectKey);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, payload);
  return {
    provider: config.storage.provider,
    bucket: config.storage.bucket,
    objectKey,
  };
}

export async function getObject(objectKey: string): Promise<Buffer> {
  return readFile(objectPath(objectKey));
}

type SignedPayload = {
  objectKey: string;
  expiresAt: number;
};

function signPayload(payload: SignedPayload): string {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", config.storage.signingSecret).update(body).digest("hex");
  return Buffer.from(`${body}.${signature}`).toString("base64url");
}

function verifyToken(token: string): SignedPayload {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const idx = decoded.lastIndexOf(".");
  if (idx < 0) {
    throw new Error("Malformed token");
  }
  const body = decoded.slice(0, idx);
  const sig = decoded.slice(idx + 1);
  const expected = createHmac("sha256", config.storage.signingSecret).update(body).digest("hex");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error("Invalid token signature");
  }
  const payload = JSON.parse(body) as SignedPayload;
  if (!payload.objectKey || !payload.expiresAt) {
    throw new Error("Invalid token payload");
  }
  if (payload.expiresAt < Date.now()) {
    throw new Error("Expired token");
  }
  return payload;
}

export function createSignedDownloadUrl(objectKey: string): string {
  const token = signPayload({
    objectKey,
    expiresAt: Date.now() + config.storage.signedUrlTtlSeconds * 1000,
  });
  return `${config.storage.publicBaseUrl}/api/storage/download/${token}`;
}

export function resolveSignedDownloadToken(token: string): string {
  return verifyToken(token).objectKey;
}
