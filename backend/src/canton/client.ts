import { randomUUID } from "node:crypto";
import { getCantonAuthHeaders } from "./auth.js";
import {
  config,
  jsonApiUrlForParticipant,
  partyHint,
  type ParticipantKey,
} from "../config.js";
import { participantForParty } from "../services/party-cache.js";

type JsonCommand =
  | {
      CreateCommand: {
        templateId: string;
        createArguments: Record<string, unknown>;
      };
    }
  | {
      ExerciseCommand: {
        templateId: string;
        contractId: string;
        choice: string;
        choiceArgument: Record<string, unknown>;
      };
    };

export interface ActiveContract<T = Record<string, unknown>> {
  contractId: string;
  payload: T;
  offset?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CantonClient {
  private async request<T>(
    participant: ParticipantKey,
    path: string,
    actAs: string[],
    body?: unknown,
    method: "GET" | "POST" = "POST",
  ): Promise<T> {
    const baseUrl = jsonApiUrlForParticipant(participant);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    Object.assign(headers, await getCantonAuthHeaders(actAs));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.canton.timeoutMs);
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Canton JSON API ${path} failed (${response.status}): ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async getLedgerEnd(participant: ParticipantKey): Promise<number> {
    const result = await this.request<{ offset?: number }>(
      participant,
      "/v2/state/ledger-end",
      [],
      undefined,
      "GET",
    );
    return result.offset ?? 0;
  }

  async allocateParty(participant: ParticipantKey, hint: string): Promise<string> {
    try {
      const result = await this.request<{ partyDetails: { party: string } }>(
        participant,
        "/v2/parties",
        [],
        {
          partyIdHint: hint,
          identityProviderId: "",
          localMetadata: null,
        },
      );
      return result.partyDetails.party;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Party already exists")) {
        const namespace = config.canton.publicBootstrap.partyNamespace.trim();
        if (namespace) {
          return `${hint}::${namespace}`;
        }
        const parties = await this.listKnownParties(participant);
        const existing = parties.find((partyId) => partyHint(partyId) === hint);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async listKnownParties(participant: ParticipantKey): Promise<string[]> {
    const result = await this.request<unknown>(
      participant,
      "/v2/parties",
      [],
      undefined,
      "GET",
    );

    if (Array.isArray(result)) {
      return result
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const party = (item as { party?: unknown }).party;
          return typeof party === "string" ? party : null;
        })
        .filter((party): party is string => Boolean(party));
    }

    if (result && typeof result === "object") {
      const details = (result as { partyDetails?: unknown }).partyDetails;
      if (Array.isArray(details)) {
        return details
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const party = (item as { party?: unknown }).party;
            return typeof party === "string" ? party : null;
          })
          .filter((party): party is string => Boolean(party));
      }
    }

    return [];
  }

  async getUpdateIdForOffset(
    participant: ParticipantKey,
    party: string,
    offset: number,
  ): Promise<string | null> {
    if (offset <= 0) {
      return null;
    }

    try {
      const result = await this.request<unknown[]>(
        participant,
        "/v2/updates",
        [party],
        {
          beginExclusive: offset - 1,
          endInclusive: offset,
          verbose: true,
          filter: {
            filtersByParty: {
              [party]: {
                cumulative: [],
              },
            },
          },
        },
      );

      for (const entry of result ?? []) {
        const updateId = extractUpdateId(entry);
        if (updateId) {
          return updateId;
        }
      }
    } catch {
      // Fall back to contract id in audit listing.
    }

    return null;
  }

  async submitAndWait(
    party: string,
    commands: JsonCommand[],
  ): Promise<{ updateId: string; completionOffset: string }> {
    const participant = participantForParty(party);
    const result = await this.request<{
      transaction: { updateId: string; offset: number };
    }>(participant, "/v2/commands/submit-and-wait-for-transaction", [party], {
      commands: {
        commandId: randomUUID(),
        userId: "veilio-backend",
        actAs: [party],
        readAs: [party],
        commands,
      },
    });

    return {
      updateId: result.transaction.updateId,
      completionOffset: String(result.transaction.offset),
    };
  }

  async queryActiveContracts<T>(
    party: string,
    templateId: string,
  ): Promise<ActiveContract<T>[]> {
    const participant = participantForParty(party);
    const ledgerEnd = await this.getLedgerEnd(participant);
    const result = await this.request<
      Array<{
        contractEntry?: {
          JsActiveContract?: {
            createdEvent: {
              contractId: string;
              createArgument: T;
              offset?: number;
            };
          };
        };
      }>
    >(participant, "/v2/state/active-contracts", [party], {
      filter: {
        filtersByParty: {
          [party]: {
            cumulative: [
              {
                identifierFilter: {
                  TemplateFilter: {
                    value: {
                      templateId,
                      includeCreatedEventBlob: false,
                    },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: false,
      activeAtOffset: ledgerEnd,
    });

    return (result ?? [])
      .filter((entry) => entry.contractEntry?.JsActiveContract)
      .map((entry) => ({
        contractId: entry.contractEntry!.JsActiveContract!.createdEvent.contractId,
        payload: entry.contractEntry!.JsActiveContract!.createdEvent.createArgument,
        offset: entry.contractEntry!.JsActiveContract!.createdEvent.offset,
      }));
  }

  async waitForContract<T>(
    party: string,
    templateId: string,
    predicate: (payload: T) => boolean,
    retries = 30,
    delayMs = 300,
  ): Promise<ActiveContract<T>> {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const contracts = await this.queryActiveContracts<T>(party, templateId);
      const match = contracts.filter((c) => predicate(c.payload)).at(-1);
      if (match) {
        return match;
      }
      await sleep(delayMs);
    }
    throw new Error(`Contract not visible for party ${party} after polling`);
  }

  async waitForContractId<T>(
    party: string,
    templateId: string,
    contractId: string,
    retries = 30,
    delayMs = 300,
  ): Promise<ActiveContract<T>> {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const contracts = await this.queryActiveContracts<T>(party, templateId);
      const match = contracts.find((c) => c.contractId === contractId);
      if (match) {
        return match;
      }
      await sleep(delayMs);
    }
    throw new Error(
      `Contract ${contractId} not visible for party ${party} after polling`,
    );
  }
}

export const canton = new CantonClient();

function extractUpdateId(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const update = (entry as { update?: unknown }).update;
  if (!update || typeof update !== "object") {
    return null;
  }

  const transaction = (update as { Transaction?: { value?: { updateId?: string } } }).Transaction;
  const updateId = transaction?.value?.updateId;
  return updateId ?? null;
}
