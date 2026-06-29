import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { config, PARTICIPANT_KEYS, type ParticipantKey } from "../config.js";
import { getCantonAuthHeaders } from "../canton/auth.js";
import { jsonApiUrlForParticipant } from "../config.js";

function participantsToUpload(): ParticipantKey[] {
  const configured = process.env.CANTON_PUBLIC_UPLOAD_PARTICIPANTS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) {
    return configured.filter((key): key is ParticipantKey =>
      (PARTICIPANT_KEYS as readonly string[]).includes(key),
    );
  }
  return PARTICIPANT_KEYS.filter((key) => Boolean(config.canton.participantJsonUrls[key]));
}

export async function waitForParticipantReady(
  participant: ParticipantKey,
  timeoutMs = config.canton.startupWaitMs,
): Promise<void> {
  const baseUrl = jsonApiUrlForParticipant(participant);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/readyz`, {
        method: "GET",
        headers: await getCantonAuthHeaders(),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Participant not reachable yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Participant ${participant} not ready at ${baseUrl}/readyz`);
}

export async function listPackageIds(participant: ParticipantKey): Promise<string[]> {
  const baseUrl = jsonApiUrlForParticipant(participant);
  const response = await fetch(`${baseUrl}/v2/packages`, {
    method: "GET",
    headers: {
      ...(await getCantonAuthHeaders()),
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`List packages failed for ${participant} (${response.status}): ${text}`);
  }
  const payload = (await response.json()) as { packageIds?: string[] };
  return payload.packageIds ?? [];
}

export async function uploadDarToParticipant(
  participant: ParticipantKey,
  darPath: string,
): Promise<{ packageIds: string[] }> {
  const darBytes = await readFile(darPath);
  const baseUrl = jsonApiUrlForParticipant(participant);
  const params = new URLSearchParams();
  if (config.canton.publicBootstrap.vetAllPackages) {
    params.set("vetAllPackages", "true");
  }
  if (config.canton.publicBootstrap.synchronizerId) {
    params.set("synchronizerId", config.canton.publicBootstrap.synchronizerId);
  }
  const query = params.toString();
  const url = `${baseUrl}/v2/packages${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(await getCantonAuthHeaders()),
      "Content-Type": "application/octet-stream",
    },
    body: darBytes,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DAR upload failed for ${participant} (${response.status}): ${text}`);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    mainPackageId?: string;
    packageIds?: string[];
  };
  const packageIds = payload.packageIds ?? (payload.mainPackageId ? [payload.mainPackageId] : []);
  return { packageIds };
}

export async function deployDarToPublicNetwork(): Promise<{
  darPath: string;
  darSha256: string;
  uploadedTo: ParticipantKey[];
  packageIds: string[];
}> {
  const darPath = config.canton.publicBootstrap.darPath;
  const darBytes = await readFile(darPath);
  const darSha256 = createHash("sha256").update(darBytes).digest("hex");
  const participants = participantsToUpload();
  if (participants.length === 0) {
    throw new Error("No participant JSON URLs configured for DAR upload");
  }

  const uploadedTo: ParticipantKey[] = [];
  const packageIds = new Set<string>();

  for (const participant of participants) {
    await waitForParticipantReady(participant);
    const existing = await listPackageIds(participant);
    const expected = config.canton.packageId;
    if (expected && existing.includes(expected)) {
      console.log(`Package ${expected} already present on ${participant}, skipping upload`);
      uploadedTo.push(participant);
      packageIds.add(expected);
      continue;
    }

    console.log(`Uploading DAR to ${participant} from ${darPath}`);
    const result = await uploadDarToParticipant(participant, darPath);
    uploadedTo.push(participant);
    for (const id of result.packageIds) {
      packageIds.add(id);
    }
    if (expected && !result.packageIds.includes(expected)) {
      const afterUpload = await listPackageIds(participant);
      if (!afterUpload.includes(expected)) {
        console.warn(
          `Expected package ${expected} not reported after upload on ${participant}; found: ${afterUpload.join(", ")}`,
        );
      }
    }
  }

  return {
    darPath,
    darSha256,
    uploadedTo,
    packageIds: Array.from(packageIds),
  };
}
