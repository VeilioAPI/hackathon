import { canton, type ActiveContract } from "../canton/client.js";
import { templates } from "../canton/templates.js";
import {
  listAllPartyIds,
  participantForParty,
  resolveParty,
} from "../services/party-cache.js";
import { partyHint } from "../config.js";
import { saveGovernanceRef, getTxIdForContract } from "../db/index.js";
import { logger } from "../observability.js";

const READ_MODEL_CACHE_TTL_MS = Number(process.env.READ_MODEL_CACHE_TTL_MS ?? 1500);
const readModelCache = new Map<
  string,
  { expiresAt: number; value: Array<ActiveContract<unknown> & { party: string }> }
>();

function damlTime(date = new Date()): string {
  return date.toISOString();
}

function damlOptional(value: string | undefined): string | null {
  return value ?? null;
}

async function queryAllParties<T>(
  templateId: string,
): Promise<Array<ActiveContract<T> & { party: string }>> {
  const cached = readModelCache.get(templateId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as Array<ActiveContract<T> & { party: string }>;
  }
  // A contract shared between parties (e.g. owner + recipient) is returned by
  // each party's query; dedupe by contract id so listings show one row each.
  const byContractId = new Map<string, ActiveContract<T> & { party: string }>();
  for (const party of listAllPartyIds()) {
    try {
      const contracts = await canton.queryActiveContracts<T>(party, templateId);
      for (const contract of contracts) {
        if (!byContractId.has(contract.contractId)) {
          byContractId.set(contract.contractId, { ...contract, party });
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, party: partyHint(party), templateId },
        "Skipping Canton query for party after ledger read failure",
      );
    }
  }
  const value = Array.from(byContractId.values());
  readModelCache.set(templateId, {
    expiresAt: Date.now() + READ_MODEL_CACHE_TTL_MS,
    value: value as Array<ActiveContract<unknown> & { party: string }>,
  });
  return value;
}

function clearReadModelCache(): void {
  readModelCache.clear();
}

export async function registerDataset(input: {
  datasetId: string;
  ownerHint: string;
  description: string;
  classification: string;
  dataFormat?: "CSV" | "JSON" | "PDF";
  title?: string;
}) {
  const datasetId = input.datasetId.trim();
  if (!datasetId) {
    throw new Error("datasetId is required");
  }

  const owner = resolveParty(input.ownerHint);
  const existing = await queryAllParties<{ datasetId: string }>(templates.dataset());
  if (existing.some((d) => d.payload.datasetId === datasetId)) {
    throw new Error(`Dataset ${datasetId} is already registered on Canton`);
  }

  const now = damlTime();
  const description = input.description.trim();
  const classification = input.classification.trim();
  const dataFormat = input.dataFormat ?? "CSV";
  const title = input.title?.trim();
  const details = title ? `${title}: ${description}` : description;

  const tx = await canton.submitAndWait(owner, [
    {
      CreateCommand: {
        templateId: templates.auditRecord(),
        createArguments: {
          auditId: `audit-register-${datasetId}-${Date.now()}`,
          actor: owner,
          action: "DatasetRegistered",
          datasetId,
          timestamp: now,
          details: damlOptional(details),
          relatedEntityId: null,
          observers: [],
        },
      },
    },
    {
      CreateCommand: {
        templateId: templates.dataset(),
        createArguments: {
          datasetId,
          owner,
          description,
          dataFormat,
          classification,
          status: "DSRegistered",
          registeredAt: now,
        },
      },
    },
  ]);
  clearReadModelCache();

  const dataset = await canton.waitForContract<{ datasetId: string }>(
    owner,
    templates.dataset(),
    (p) => p.datasetId === datasetId,
  );

  await saveGovernanceRef({
    entityType: "dataset",
    entityId: datasetId,
    contractId: dataset.contractId,
    party: owner,
    participant: participantForParty(owner),
    txId: tx.updateId,
  });

  return {
    datasetId,
    contractId: dataset.contractId,
    owner: input.ownerHint,
    updateId: tx.updateId,
  };
}

export async function proposeSharing(input: {
  datasetId: string;
  agreementId: string;
  recipientHint: string;
  purpose: string;
  expirationDays?: number;
}) {
  const recipient = resolveParty(input.recipientHint);
  const datasets = await queryAllParties<{
    datasetId: string;
    owner: string;
    description: string;
    dataFormat: string;
    classification: string;
    status: string;
    registeredAt: string;
  }>(
    templates.dataset(),
  );
  const dataset = datasets.filter((d) => d.payload.datasetId === input.datasetId).at(-1);
  if (!dataset) {
    throw new Error(`Dataset ${input.datasetId} not found on ledger. Register it first.`);
  }

  const owner = String(dataset.payload.owner);
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + (input.expirationDays ?? 30));

  await canton.submitAndWait(owner, [
    {
      ExerciseCommand: {
        templateId: templates.dataset(),
        contractId: dataset.contractId,
        choice: "ProposeSharingAgreement",
        choiceArgument: {
          agreementId: input.agreementId,
          recipient,
          purpose: input.purpose,
          expiration: damlTime(expiration),
        },
      },
    },
    {
      // Keep dataset reusable for additional sharing agreements.
      CreateCommand: {
        templateId: templates.dataset(),
        createArguments: {
          datasetId: String(dataset.payload.datasetId),
          owner: String(dataset.payload.owner),
          description: String(dataset.payload.description),
          dataFormat: String(dataset.payload.dataFormat),
          classification: String(dataset.payload.classification),
          status: String(dataset.payload.status),
          registeredAt: String(dataset.payload.registeredAt),
        },
      },
    },
  ]);
  clearReadModelCache();

  const proposal = await canton.waitForContract<{ agreementId: string }>(
    owner,
    templates.sharingProposal(),
    (p) => p.agreementId === input.agreementId,
  );

  await saveGovernanceRef({
    entityType: "sharing_proposal",
    entityId: input.agreementId,
    contractId: proposal.contractId,
    party: owner,
    participant: participantForParty(owner),
  });

  return {
    agreementId: input.agreementId,
    contractId: proposal.contractId,
    owner: partyHint(owner),
    recipient: input.recipientHint,
  };
}

export async function acceptSharing(agreementId: string) {
  const proposals = await queryAllParties<{
    agreementId: string;
    recipient: string;
  }>(templates.sharingProposal());
  const proposal = proposals.filter((p) => p.payload.agreementId === agreementId).at(-1);
  if (!proposal) {
    throw new Error(`Sharing proposal not found: ${agreementId}`);
  }

  const recipient = String(proposal.payload.recipient);
  await canton.waitForContract<{ agreementId: string }>(
    recipient,
    templates.sharingProposal(),
    (p) => p.agreementId === agreementId,
  );

  await canton.submitAndWait(recipient, [
    {
      ExerciseCommand: {
        templateId: templates.sharingProposal(),
        contractId: proposal.contractId,
        choice: "AcceptSharingAgreement",
        choiceArgument: {},
      },
    },
  ]);
  clearReadModelCache();
  clearReadModelCache();

  const agreement = await canton.waitForContract<{ agreementId: string }>(
    recipient,
    templates.sharingAgreement(),
    (p) => p.agreementId === agreementId,
  );

  await saveGovernanceRef({
    entityType: "sharing_agreement",
    entityId: agreementId,
    contractId: agreement.contractId,
    party: recipient,
    participant: participantForParty(recipient),
  });

  return { agreementId, contractId: agreement.contractId, recipient: partyHint(recipient) };
}

export async function issuePermission(input: {
  agreementId: string;
  permissionId: string;
  accessRights?: string;
  accessScope?: string;
}) {
  const agreements = await queryAllParties<{
    agreementId: string;
    owner: string;
    status: string;
  }>(templates.sharingAgreement());
  const agreement = agreements
    .filter((a) => a.payload.agreementId === input.agreementId && a.payload.status === "ASActive")
    .at(-1);
  if (!agreement) {
    throw new Error(`Active sharing agreement not found: ${input.agreementId}`);
  }

  const owner = String(agreement.payload.owner);
  await canton.waitForContract<{ agreementId: string }>(
    owner,
    templates.sharingAgreement(),
    (p) => p.agreementId === input.agreementId,
  );

  await canton.submitAndWait(owner, [
    {
      ExerciseCommand: {
        templateId: templates.sharingAgreement(),
        contractId: agreement.contractId,
        choice: "IssuePermission",
        choiceArgument: {
          permissionId: input.permissionId,
          accessRights: input.accessRights ?? "read-analytics",
          accessScope: input.accessScope ?? "Analytics",
        },
      },
    },
  ]);
  clearReadModelCache();

  const permission = await canton.waitForContract<{ permissionId: string; status: string }>(
    owner,
    templates.permission(),
    (p) => p.permissionId === input.permissionId && p.status === "PSPending",
  );

  await saveGovernanceRef({
    entityType: "permission",
    entityId: input.permissionId,
    contractId: permission.contractId,
    party: owner,
    participant: participantForParty(owner),
  });

  return { permissionId: input.permissionId, contractId: permission.contractId, owner: partyHint(owner) };
}

export async function recordConsent(input: {
  permissionId: string;
  consentId: string;
}) {
  const permissions = await queryAllParties<{
    permissionId: string;
    recipient: string;
    status: string;
  }>(templates.permission());
  const permission = permissions
    .filter((p) => p.payload.permissionId === input.permissionId && p.payload.status === "PSPending")
    .at(-1);
  if (!permission) {
    throw new Error(`Pending permission not found: ${input.permissionId}`);
  }

  const recipient = String(permission.payload.recipient);
  await canton.waitForContract<{ permissionId: string; status: string }>(
    recipient,
    templates.permission(),
    (p) => p.permissionId === input.permissionId && p.status === "PSPending",
  );

  await canton.submitAndWait(recipient, [
    {
      ExerciseCommand: {
        templateId: templates.permission(),
        contractId: permission.contractId,
        choice: "RecordConsent",
        choiceArgument: { consentId: input.consentId },
      },
    },
  ]);
  clearReadModelCache();

  const active = await canton.waitForContract<{ permissionId: string; status: string }>(
    recipient,
    templates.permission(),
    (p) => p.permissionId === input.permissionId && p.status === "PSActive",
  );

  await saveGovernanceRef({
    entityType: "permission_active",
    entityId: input.permissionId,
    contractId: active.contractId,
    party: recipient,
    participant: participantForParty(recipient),
  });

  return { permissionId: input.permissionId, contractId: active.contractId, recipient: partyHint(recipient) };
}

export async function revokePermission(input: {
  permissionId: string;
  revocationId: string;
  reason: string;
}) {
  const permissions = await queryAllParties<{
    permissionId: string;
    owner: string;
    status: string;
  }>(templates.permission());
  const permission = permissions
    .filter(
      (p) =>
        p.payload.permissionId === input.permissionId &&
        (p.payload.status === "PSActive" || p.payload.status === "PSPending"),
    )
    .at(-1);
  if (!permission) {
    throw new Error(`Revocable permission not found: ${input.permissionId}`);
  }

  const owner = String(permission.payload.owner);
  await canton.waitForContract<{ permissionId: string; status: string }>(
    owner,
    templates.permission(),
    (p) =>
      p.permissionId === input.permissionId &&
      (p.status === "PSActive" || p.status === "PSPending"),
  );

  await canton.submitAndWait(owner, [
    {
      ExerciseCommand: {
        templateId: templates.permission(),
        contractId: permission.contractId,
        choice: "RevokePermission",
        choiceArgument: {
          revocationId: input.revocationId,
          reason: input.reason,
        },
      },
    },
  ]);
  clearReadModelCache();

  const revocation = await canton.waitForContract<{ revocationId: string }>(
    owner,
    templates.revocation(),
    (p) => p.revocationId === input.revocationId,
  );

  return {
    permissionId: input.permissionId,
    revocationId: input.revocationId,
    contractId: revocation.contractId,
    owner: partyHint(owner),
  };
}

export async function rejectSharing(agreementId: string, reason: string) {
  const proposals = await queryAllParties<{
    agreementId: string;
    recipient: string;
  }>(templates.sharingProposal());
  const proposal = proposals.filter((p) => p.payload.agreementId === agreementId).at(-1);
  if (!proposal) {
    throw new Error(`Sharing proposal not found: ${agreementId}`);
  }

  const recipient = String(proposal.payload.recipient);
  await canton.submitAndWait(recipient, [
    {
      ExerciseCommand: {
        templateId: templates.sharingProposal(),
        contractId: proposal.contractId,
        choice: "RejectSharingAgreement",
        choiceArgument: {
          reason,
        },
      },
    },
  ]);
  clearReadModelCache();

  return { agreementId, recipient: partyHint(recipient), rejected: true };
}

export async function denyConsent(input: {
  permissionId: string;
  consentId: string;
  reason: string;
}) {
  const permissions = await queryAllParties<{
    permissionId: string;
    recipient: string;
    status: string;
  }>(templates.permission());
  const permission = permissions
    .filter((p) => p.payload.permissionId === input.permissionId && p.payload.status === "PSPending")
    .at(-1);
  if (!permission) {
    throw new Error(`Pending permission not found: ${input.permissionId}`);
  }

  const recipient = String(permission.payload.recipient);
  await canton.submitAndWait(recipient, [
    {
      ExerciseCommand: {
        templateId: templates.permission(),
        contractId: permission.contractId,
        choice: "DenyConsent",
        choiceArgument: {
          consentId: input.consentId,
          reason: input.reason,
        },
      },
    },
  ]);
  clearReadModelCache();

  const consent = await canton.waitForContract<{ consentId: string }>(
    recipient,
    templates.consent(),
    (p) => p.consentId === input.consentId,
  );

  return {
    permissionId: input.permissionId,
    consentId: input.consentId,
    contractId: consent.contractId,
    recipient: partyHint(recipient),
    denied: true,
  };
}

export async function withdrawConsent(input: { consentId: string; reason: string }) {
  const consents = await queryAllParties<{
    consentId: string;
    recipient: string;
    status: string;
  }>(templates.consent());
  const consent = consents
    .filter((c) => c.payload.consentId === input.consentId && c.payload.status === "CSGranted")
    .at(-1);
  if (!consent) {
    throw new Error(`Granted consent not found: ${input.consentId}`);
  }

  const recipient = String(consent.payload.recipient);
  await canton.submitAndWait(recipient, [
    {
      ExerciseCommand: {
        templateId: templates.consent(),
        contractId: consent.contractId,
        choice: "WithdrawConsent",
        choiceArgument: {
          reason: input.reason,
        },
      },
    },
  ]);

  const withdrawn = await canton.waitForContract<{ consentId: string; status: string }>(
    recipient,
    templates.consent(),
    (p) => p.consentId === input.consentId && p.status === "CSWithdrawn",
  );

  return {
    consentId: input.consentId,
    contractId: withdrawn.contractId,
    recipient: partyHint(recipient),
    withdrawn: true,
  };
}

export async function revokeAgreement(input: { agreementId: string; reason: string }) {
  const agreements = await queryAllParties<{
    agreementId: string;
    owner: string;
    status: string;
  }>(templates.sharingAgreement());
  const agreement = agreements
    .filter((a) => a.payload.agreementId === input.agreementId && a.payload.status === "ASActive")
    .at(-1);
  if (!agreement) {
    throw new Error(`Active sharing agreement not found: ${input.agreementId}`);
  }

  const owner = String(agreement.payload.owner);
  await canton.submitAndWait(owner, [
    {
      ExerciseCommand: {
        templateId: templates.sharingAgreement(),
        contractId: agreement.contractId,
        choice: "RevokeAgreement",
        choiceArgument: {
          reason: input.reason,
        },
      },
    },
  ]);
  clearReadModelCache();

  const revoked = await canton.waitForContract<{ agreementId: string; status: string }>(
    owner,
    templates.sharingAgreement(),
    (p) => p.agreementId === input.agreementId && p.status === "ASRevoked",
  );

  return {
    agreementId: input.agreementId,
    contractId: revoked.contractId,
    owner: partyHint(owner),
    revoked: true,
  };
}

export async function checkPermissionExpiration(permissionId: string) {
  const permissions = await queryAllParties<{
    permissionId: string;
    owner: string;
    status: string;
  }>(templates.permission());
  const permission = permissions
    .filter(
      (p) =>
        p.payload.permissionId === permissionId &&
        (p.payload.status === "PSActive" || p.payload.status === "PSPending"),
    )
    .at(-1);
  if (!permission) {
    throw new Error(`Revocable permission not found: ${permissionId}`);
  }

  const owner = String(permission.payload.owner);
  await canton.submitAndWait(owner, [
    {
      ExerciseCommand: {
        templateId: templates.permission(),
        contractId: permission.contractId,
        choice: "CheckExpiration",
        choiceArgument: {},
      },
    },
  ]);
  clearReadModelCache();

  const updated = await canton.waitForContract<{ permissionId: string; status: string }>(
    owner,
    templates.permission(),
    (p) => p.permissionId === permissionId,
  );

  return {
    permissionId,
    status: String(updated.payload.status),
    contractId: updated.contractId,
    owner: partyHint(owner),
  };
}

export async function renewAccessPassport(input: {
  permissionId: string;
  newPermissionId?: string;
  reason?: string;
}) {
  const permissions = await queryAllParties<{
    permissionId: string;
    agreementId: string;
    owner: string;
    status: string;
    accessRights: string;
    accessScope: string;
  }>(templates.permission());
  const current = permissions
    .filter((p) => p.payload.permissionId === input.permissionId)
    .at(-1);
  if (!current) {
    throw new Error(`Permission not found: ${input.permissionId}`);
  }

  const status = String(current.payload.status);
  if (status === "PSRevoked") {
    throw new Error(`Cannot renew revoked permission: ${input.permissionId}`);
  }

  const agreementId = String(current.payload.agreementId);
  const agreements = await queryAllParties<{ agreementId: string; status: string }>(
    templates.sharingAgreement(),
  );
  const agreement = agreements.find(
    (row) => row.payload.agreementId === agreementId && row.payload.status === "ASActive",
  );
  if (!agreement) {
    throw new Error(
      `Active sharing agreement required for renewal. Re-propose sharing for ${agreementId}.`,
    );
  }

  if (status === "PSActive" || status === "PSPending") {
    await revokePermission({
      permissionId: input.permissionId,
      revocationId: `REV-RENEW-${input.permissionId}-${Date.now().toString(36)}`,
      reason: input.reason ?? "Renewed — superseded by new Access Passport",
    });
  }

  const newPermissionId =
    input.newPermissionId ??
    `${input.permissionId}-REN-${Date.now().toString(36).slice(-6).toUpperCase()}`;

  const issued = await issuePermission({
    agreementId,
    permissionId: newPermissionId,
    accessRights: String(current.payload.accessRights ?? "read-analytics"),
    accessScope: String(current.payload.accessScope ?? "Analytics"),
  });

  return {
    previousPermissionId: input.permissionId,
    newPermissionId,
    agreementId,
    status: "PendingConsent",
    owner: issued.owner,
    message:
      "New permission issued on Canton. Recipient must record consent to activate the renewed passport.",
  };
}

export async function sweepExpiredPermissions(): Promise<{
  scanned: number;
  expired: Array<{ permissionId: string; status: string }>;
  errors: Array<{ permissionId: string; error: string }>;
}> {
  const permissions = await listPermissions();
  const now = Date.now();
  const candidates = permissions.filter((row) => {
    const payload = row as Record<string, unknown>;
    const status = String(payload.status ?? "");
    if (status !== "PSActive" && status !== "PSPending") {
      return false;
    }
    const expiresAt = new Date(String(payload.expiresAt ?? "")).getTime();
    return Number.isFinite(expiresAt) && expiresAt <= now;
  });

  const expired: Array<{ permissionId: string; status: string }> = [];
  const errors: Array<{ permissionId: string; error: string }> = [];

  for (const row of candidates) {
    const permissionId = String((row as Record<string, unknown>).permissionId ?? "");
    if (!permissionId) {
      continue;
    }
    try {
      const result = await checkPermissionExpiration(permissionId);
      if (result.status === "PSExpired") {
        expired.push({ permissionId, status: result.status });
      }
    } catch (error) {
      errors.push({
        permissionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { scanned: candidates.length, expired, errors };
}

export async function listConsents() {
  const all = await queryAllParties<Record<string, unknown>>(templates.consent());
  const merged = new Map<string, ActiveContract<Record<string, unknown>>>();
  for (const item of all) {
    const consentId = String(item.payload.consentId ?? "");
    merged.set(`${consentId}-${item.payload.status}`, item);
  }
  return Array.from(merged.values()).map((item) => ({
    contractId: item.contractId,
    ...item.payload,
    ownerHint: partyHint(String(item.payload.owner ?? "")),
    recipientHint: partyHint(String(item.payload.recipient ?? "")),
  }));
}

export async function listRevocations() {
  const all = await queryAllParties<Record<string, unknown>>(templates.revocation());
  const merged = new Map<string, ActiveContract<Record<string, unknown>>>();
  for (const item of all) {
    const revocationId = String(item.payload.revocationId ?? "");
    merged.set(revocationId, item);
  }
  return Array.from(merged.values()).map((item) => ({
    contractId: item.contractId,
    ...item.payload,
    revokerHint: partyHint(String(item.payload.revoker ?? "")),
    affectedHint: partyHint(String(item.payload.affectedParty ?? "")),
  }));
}

export async function listPermissions() {
  const all = await queryAllParties<Record<string, unknown>>(templates.permission());
  const merged = new Map<string, ActiveContract<Record<string, unknown>>>();
  for (const item of all) {
    const permissionId = String(item.payload.permissionId);
    merged.set(`${permissionId}-${item.payload.status}`, item);
  }
  return Array.from(merged.values()).map((item) => ({
    contractId: item.contractId,
    ...item.payload,
    ownerHint: partyHint(String(item.payload.owner ?? "")),
    recipientHint: partyHint(String(item.payload.recipient ?? "")),
  }));
}

export async function listSharingProposals() {
  const all = await queryAllParties<Record<string, unknown>>(templates.sharingProposal());
  return all.map((item) => ({
    contractId: item.contractId,
    ...item.payload,
    ownerHint: partyHint(String(item.payload.owner ?? "")),
    recipientHint: partyHint(String(item.payload.recipient ?? "")),
  }));
}

export async function listAuditTrail() {
  const raw = await queryAllParties<Record<string, unknown>>(templates.auditRecord());

  // The same audit contract is visible to every stakeholder party; keep one copy.
  const seen = new Map<string, (typeof raw)[number]>();
  for (const item of raw) {
    if (!seen.has(item.contractId)) {
      seen.set(item.contractId, item);
    }
  }
  const all = Array.from(seen.values());

  const offsetCache = new Map<string, string>();

  type AuditPayload = Record<string, unknown> & { timestamp?: string };

  const events = await Promise.all(
    all.map(async (item) => {
      let txId = await getTxIdForContract(item.contractId);

      if (!txId && item.offset != null) {
        const participant = participantForParty(item.party);
        const cacheKey = `${participant}:${item.offset}`;
        txId = offsetCache.get(cacheKey) ?? null;
        if (!txId) {
          txId = await canton.getUpdateIdForOffset(participant, item.party, item.offset);
          if (txId) {
            offsetCache.set(cacheKey, txId);
          }
        }
      }

      return {
        contractId: item.contractId,
        txId: txId ?? item.contractId,
        ...(item.payload as AuditPayload),
        actorHint: partyHint(String(item.payload.actor ?? "")),
      };
    }),
  );

  events.sort((a, b) =>
    String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")),
  );

  return events;
}

export async function archiveDataset(input: {
  datasetId: string;
  ownerHint: string;
}): Promise<{ datasetId: string; archivedContracts: number; auditContractId?: string }> {
  const datasetId = input.datasetId.trim();
  const owner = resolveParty(input.ownerHint);
  const datasets = await queryAllParties<Record<string, unknown>>(templates.dataset());
  const matches = datasets.filter((row) => String(row.payload.datasetId) === datasetId);

  if (matches.length === 0) {
    throw new Error(`Dataset ${datasetId} not found on Canton`);
  }

  const ownerMatches = matches.filter(
    (row) => partyHint(String(row.payload.owner ?? "")) === input.ownerHint,
  );
  if (ownerMatches.length === 0) {
    throw new Error(`Only the dataset owner can delete ${datasetId}`);
  }

  let auditContractId: string | undefined;
  let archivedContracts = 0;

  for (const dataset of ownerMatches) {
    try {
      const tx = await canton.submitAndWait(owner, [
        {
          ExerciseCommand: {
            templateId: templates.dataset(),
            contractId: dataset.contractId,
            choice: "ArchiveDataset",
            choiceArgument: {},
          },
        },
      ]);
      clearReadModelCache();
      archivedContracts += 1;
      auditContractId = tx.updateId;
    } catch {
      // Contract may already be archived or superseded — continue cleanup.
    }
  }

  return { datasetId, archivedContracts, auditContractId };
}

export async function listLedgerDatasets() {
  const all = await queryAllParties<Record<string, unknown>>(templates.dataset());
  return all.map((d) => ({
    contractId: d.contractId,
    ...d.payload,
    ownerHint: partyHint(String(d.payload.owner ?? "")),
  }));
}

export async function listSharingAgreements() {
  const all = await queryAllParties<Record<string, unknown>>(templates.sharingAgreement());
  const merged = new Map<string, ActiveContract<Record<string, unknown>>>();
  for (const item of all) {
    const id = String(item.payload.agreementId);
    merged.set(id, item);
  }
  return Array.from(merged.values()).map((item) => ({
    contractId: item.contractId,
    ...item.payload,
    ownerHint: partyHint(String(item.payload.owner ?? "")),
    recipientHint: partyHint(String(item.payload.recipient ?? "")),
  }));
}

export { damlOptional };
