import {
  loadParticipantsConfig,
  partyHint,
  type ParticipantKey,
  type PartyInfo,
} from "../config.js";

let partyCache: PartyInfo[] = [];

export function setPartyCache(parties: PartyInfo[]): void {
  partyCache = parties;
}

export function listParties(): PartyInfo[] {
  return partyCache;
}

export function listAllPartyIds(): string[] {
  return partyCache.map((p) => p.partyId);
}

export function resolveParty(hint: string): string {
  const match = partyCache.find((p) => p.hint === hint);
  if (!match) {
    const available = partyCache.map((p) => p.hint).join(", ");
    throw new Error(
      `Unknown or unallocated bank: ${hint}. Available: ${available || "(none — add a bank first)"}`,
    );
  }
  return match.partyId;
}

export function participantForParty(party: string): ParticipantKey {
  const match = partyCache.find((p) => p.partyId === party);
  if (match) {
    return match.participant;
  }

  const cfg = loadParticipantsConfig();
  const mapped = cfg.party_participants?.[party];
  if (mapped) {
    return mapped;
  }

  throw new Error(`No participant mapping for party: ${partyHint(party)}`);
}
