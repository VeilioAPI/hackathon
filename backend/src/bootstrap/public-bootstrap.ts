import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { config, partyHint, PARTICIPANT_KEYS, type ParticipantKey, type ParticipantsConfig } from "../config.js";
import { canton } from "../canton/client.js";
import { deployDarToPublicNetwork } from "./dar-deploy.js";

type PublicBankDefinition = {
  hint: string;
  displayName?: string;
  description?: string;
  participant: ParticipantKey;
  partyId?: string;
};

type BootstrapMetadata = {
  mode: "local" | "public";
  readyAt: string;
  packageId: string;
  packageIds?: string[];
  darPath?: string;
  darSha256?: string;
  cantonScanBaseUrl: string;
  partyMappings: Record<string, ParticipantKey>;
};

function parsePartyMappings(): Record<string, ParticipantKey> {
  const parsed = JSON.parse(config.canton.publicBootstrap.partyMappingsJson) as Record<
    string,
    string
  >;
  const out: Record<string, ParticipantKey> = {};
  for (const [partyId, participant] of Object.entries(parsed)) {
    if (PARTICIPANT_KEYS.includes(participant as ParticipantKey)) {
      out[partyId] = participant as ParticipantKey;
    }
  }
  return out;
}

function parseBanks(): PublicBankDefinition[] {
  const parsed = JSON.parse(config.canton.publicBootstrap.bankDefinitionsJson) as Array<{
    hint: string;
    displayName?: string;
    description?: string;
    participant: string;
    partyId?: string;
  }>;
  return parsed
    .filter(
      (item) =>
        item &&
        typeof item.hint === "string" &&
        PARTICIPANT_KEYS.includes(item.participant as ParticipantKey),
    )
    .map((item) => ({
      hint: item.hint.trim(),
      displayName: item.displayName?.trim(),
      description: item.description?.trim(),
      participant: item.participant as ParticipantKey,
      partyId: item.partyId?.trim(),
    }))
    .filter((item) => item.hint.length > 0);
}

async function resolvePartyMappings(): Promise<Record<string, ParticipantKey>> {
  const mappings = parsePartyMappings();
  if (!config.canton.publicBootstrap.autoAllocate) {
    return mappings;
  }

  const banks = parseBanks();
  for (const bank of banks) {
    const partyId = bank.partyId || (await canton.allocateParty(bank.participant, bank.hint));
    mappings[partyId] = bank.participant;
    console.log(`Allocated party ${partyHint(partyId)} on ${bank.participant}`);
  }
  return mappings;
}

async function writeParticipantsConfig(
  partyMappings: Record<string, ParticipantKey>,
): Promise<void> {
  const participantHosts = Object.fromEntries(
    PARTICIPANT_KEYS.map((key) => {
      const url = new URL(config.canton.participantJsonUrls[key]);
      return [key, { host: url.hostname, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)) }];
    }),
  ) as ParticipantsConfig["participants"];

  const doc: ParticipantsConfig = {
    default_participant: participantHosts.participant1,
    participants: participantHosts,
    party_participants: partyMappings,
  };

  const participantsPath = process.env.PARTICIPANTS_CONFIG ?? "/shared/participants.json";
  await mkdir(dirname(participantsPath), { recursive: true });
  await writeFile(participantsPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  console.log(`Wrote participants config to ${participantsPath}`);
}

async function writeBootstrapMetadata(metadata: BootstrapMetadata): Promise<void> {
  const metadataPath =
    process.env.CANTON_BOOTSTRAP_METADATA_FILE ?? "/shared/bootstrap-metadata.json";
  await mkdir(dirname(metadataPath), { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

async function markReady(): Promise<void> {
  await mkdir(dirname(config.canton.bootstrapReadyFile), { recursive: true });
  await writeFile(config.canton.bootstrapReadyFile, "ok\n", "utf8");
}

async function waitForLocalCantonReady(): Promise<void> {
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
    `Timed out waiting for local Canton bootstrap file: ${config.canton.bootstrapReadyFile}`,
  );
}

async function main(): Promise<void> {
  if (config.canton.mode === "local" && !config.canton.publicBootstrap.enabled) {
    console.log("Local mode: waiting for embedded Canton bootstrap...");
    await waitForLocalCantonReady();
    console.log("Local Canton bootstrap detected.");
    return;
  }

  if (!config.canton.publicBootstrap.enabled) {
    await markReady();
    return;
  }

  console.log("Public Canton bootstrap starting...");
  let packageIds: string[] = [config.canton.packageId];
  let darPath: string | undefined;
  let darSha256: string | undefined;

  if (config.canton.publicBootstrap.uploadDar) {
    const deployResult = await deployDarToPublicNetwork();
    darPath = deployResult.darPath;
    darSha256 = deployResult.darSha256;
    packageIds = deployResult.packageIds.length > 0 ? deployResult.packageIds : packageIds;
    console.log(
      `DAR deployed to ${deployResult.uploadedTo.join(", ")}; packages: ${packageIds.join(", ")}`,
    );
  }

  const mappings = await resolvePartyMappings();
  if (config.canton.publicBootstrap.writeParticipantsConfig) {
    await writeParticipantsConfig(mappings);
  }

  await writeBootstrapMetadata({
    mode: "public",
    readyAt: new Date().toISOString(),
    packageId: packageIds[0] ?? config.canton.packageId,
    packageIds,
    darPath,
    darSha256,
    cantonScanBaseUrl: config.canton.publicBootstrap.cantonScanBaseUrl,
    partyMappings: mappings,
  });

  await markReady();
  console.log(
    `Public Canton bootstrap complete. Explore transactions at ${config.canton.publicBootstrap.cantonScanBaseUrl}`,
  );
}

main().catch((error) => {
  console.error("Canton bootstrap failed:", error);
  process.exit(1);
});
