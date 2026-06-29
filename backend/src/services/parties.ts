import { canton } from "../canton/client.js";
import {
  loadParticipantsConfig,
  partyHint,
  type ParticipantKey,
  type PartyInfo,
} from "../config.js";
import {
  getBankRow,
  insertBankRow,
  listBankRows,
  searchBankRows,
  updateBankPartyId,
  deleteBankRow,
  countPartnerLocalUsage,
} from "../db/index.js";
import {
  listAllPartyIds,
  listParties,
  participantForParty,
  resolveParty,
  setPartyCache,
} from "./party-cache.js";
import * as governance from "./governance.js";

export { listAllPartyIds, listParties, participantForParty, resolveParty };

export interface BankRecord {
  hint: string;
  displayName: string;
  description: string;
  participant: ParticipantKey;
  partyId: string | null;
  createdAt: string;
}

function mapBankRow(row: Record<string, unknown>): BankRecord {
  return {
    hint: String(row.hint),
    displayName: String(row.display_name),
    description: String(row.description ?? ""),
    participant: String(row.participant) as ParticipantKey,
    partyId: row.party_id ? String(row.party_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function refreshPartyCache(): Promise<void> {
  const rows = await listBankRows();
  setPartyCache(
    rows
      .filter((row) => row.party_id)
      .map((row) => ({
        hint: String(row.hint),
        partyId: String(row.party_id),
        participant: String(row.participant) as ParticipantKey,
      }))
      .sort((a, b) => a.hint.localeCompare(b.hint)),
  );
}

export async function listBanks(): Promise<BankRecord[]> {
  const rows = await listBankRows();
  return rows.map(mapBankRow);
}

export async function searchBanks(input: {
  query?: string;
  limit: number;
  offset: number;
}): Promise<{ items: BankRecord[]; total: number; limit: number; offset: number }> {
  const result = await searchBankRows(input);
  return {
    items: result.rows.map(mapBankRow),
    total: result.total,
    limit: input.limit,
    offset: input.offset,
  };
}

export async function createBank(input: {
  hint: string;
  displayName: string;
  description: string;
  participant: ParticipantKey;
}): Promise<BankRecord> {
  const hint = input.hint.trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(hint)) {
    throw new Error(
      "Bank hint must start with a letter and contain only letters, digits, underscores, or hyphens",
    );
  }

  const existing = await getBankRow(hint);
  if (existing) {
    throw new Error(`Bank already exists: ${hint}`);
  }

  await insertBankRow({
    hint,
    displayName: input.displayName.trim(),
    description: input.description.trim(),
    participant: input.participant,
  });

  try {
    const bank = await ensureBankAllocated(hint);
    await refreshPartyCache();
    return bank;
  } catch (error) {
    console.error(`Canton party allocation failed for ${hint}:`, error);
    await refreshPartyCache();
    const row = await getBankRow(hint);
    if (!row) {
      throw error instanceof Error ? error : new Error("Failed to create partner");
    }
    return mapBankRow(row);
  }
}

export async function allocateBankParty(hint: string): Promise<BankRecord> {
  const row = await getBankRow(hint);
  if (!row) {
    throw new Error(`Bank not found: ${hint}`);
  }
  const bank = await ensureBankAllocated(hint);
  await refreshPartyCache();
  return bank;
}

async function partnerGovernanceUsage(hint: string): Promise<{
  datasets: number;
  permissions: number;
  agreements: number;
  proposals: number;
}> {
  const [datasets, permissions, agreements, proposals] = await Promise.all([
    governance.listLedgerDatasets(),
    governance.listPermissions(),
    governance.listSharingAgreements(),
    governance.listSharingProposals(),
  ]);

  const matches = (ownerHint?: string, recipientHint?: string) =>
    ownerHint === hint || recipientHint === hint;

  return {
    datasets: datasets.filter((row) => row.ownerHint === hint).length,
    permissions: permissions.filter((row) => matches(row.ownerHint, row.recipientHint)).length,
    agreements: agreements.filter((row) => matches(row.ownerHint, row.recipientHint)).length,
    proposals: proposals.filter((row) => matches(row.ownerHint, row.recipientHint)).length,
  };
}

export async function deleteBank(hint: string): Promise<void> {
  const normalized = hint.trim();
  const row = await getBankRow(normalized);
  if (!row) {
    throw new Error(`Bank not found: ${normalized}`);
  }

  const local = await countPartnerLocalUsage(normalized);
  const onLedger = await partnerGovernanceUsage(normalized);

  const blockers: string[] = [];
  if (local.uploads > 0) {
    blockers.push(`${local.uploads} protected file upload(s)`);
  }
  if (local.listingsOwned > 0) {
    blockers.push(`${local.listingsOwned} Exchange listing(s) as owner`);
  }
  if (local.listingsInvited > 0) {
    blockers.push(`${local.listingsInvited} direct invite(s) as recipient`);
  }
  if (onLedger.datasets > 0) {
    blockers.push(`${onLedger.datasets} dataset(s) on Canton`);
  }
  if (onLedger.permissions > 0) {
    blockers.push(`${onLedger.permissions} access passport(s)`);
  }
  if (onLedger.agreements > 0) {
    blockers.push(`${onLedger.agreements} sharing agreement(s)`);
  }
  if (onLedger.proposals > 0) {
    blockers.push(`${onLedger.proposals} sharing proposal(s)`);
  }

  if (blockers.length > 0) {
    throw new Error(
      `Cannot delete ${normalized}: remove governed assets first (${blockers.join(", ")}).`,
    );
  }

  await deleteBankRow(normalized);
  await refreshPartyCache();
}

async function ensureBankAllocated(hint: string): Promise<BankRecord> {
  const row = await getBankRow(hint);
  if (!row) {
    throw new Error(`Bank not found: ${hint}`);
  }

  if (row.party_id) {
    return mapBankRow(row);
  }

  const participant = String(row.participant) as ParticipantKey;
  const partyId = await canton.allocateParty(participant, hint);
  await updateBankPartyId(hint, partyId);
  const updated = await getBankRow(hint);
  return mapBankRow(updated!);
}

export async function ensureAllBanksAllocated(): Promise<void> {
  const rows = await listBankRows();
  const knownPartiesByParticipant = new Map<ParticipantKey, Set<string>>();

  async function knownParties(participant: ParticipantKey): Promise<Set<string>> {
    const cached = knownPartiesByParticipant.get(participant);
    if (cached) return cached;
    const parties = new Set(await canton.listKnownParties(participant));
    knownPartiesByParticipant.set(participant, parties);
    return parties;
  }

  for (const row of rows) {
    const participant = String(row.participant) as ParticipantKey;
    const currentParty = row.party_id ? String(row.party_id) : null;

    if (!currentParty) {
      await ensureBankAllocated(String(row.hint));
      continue;
    }

    const known = await knownParties(participant);
    if (!known.has(currentParty)) {
      // Canton restarted (in-memory) and forgot this party ID; allocate fresh one.
      const nextPartyId = await canton.allocateParty(participant, String(row.hint));
      await updateBankPartyId(String(row.hint), nextPartyId);
      known.add(nextPartyId);
    }
  }
}

export async function syncBanksFromParticipantsConfig(): Promise<void> {
  const cfg = loadParticipantsConfig();
  if (!cfg.party_participants) {
    return;
  }

  for (const [partyId, participant] of Object.entries(cfg.party_participants)) {
    const hint = partyHint(partyId);
    if (hint.startsWith("participant")) {
      continue;
    }

    const existing = await getBankRow(hint);
    if (existing) {
      if (!existing.party_id) {
        await updateBankPartyId(hint, partyId);
      }
      continue;
    }

    await insertBankRow({
      hint,
      displayName: hint,
      description: "",
      participant,
    });
    await updateBankPartyId(hint, partyId);
  }
}

export async function initializeParties(): Promise<void> {
  await syncBanksFromParticipantsConfig();
  await ensureAllBanksAllocated();
  await refreshPartyCache();
}
