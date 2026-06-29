import * as governance from "./governance.js";
import { listBanks } from "./parties.js";

export type PassportStatus =
  | "PendingConsent"
  | "Active"
  | "Revoked"
  | "Expired"
  | "Denied";

export interface AccessPassport {
  passportId: string;
  agreementId: string;
  datasetId: string;
  datasetTitle?: string;
  useCase?: string;

  ownerHint: string;
  ownerDisplayName?: string;
  recipientHint: string;
  recipientDisplayName?: string;

  purpose: string;
  accessScope: "ReadOnly" | "Analytics" | "FullAccess";
  accessRights: string;

  status: PassportStatus;
  issuedAt: string;
  expiresAt: string;
  consentRecordedAt?: string;
  revokedAt?: string;
  revocationReason?: string;

  permissionContractId: string;
  consentContractId?: string;
  revocationContractId?: string;
  auditEventIds: string[];
}

export interface ExchangeSummary {
  activePassports: number;
  pendingRequests: number;
  pendingConsent: number;
  expiringWithin7Days: number;
  revokedLast30Days: number;
  partnerCount: number;
  datasetCount: number;
}

export interface OwnerExposureGrant {
  passportId: string;
  agreementId: string;
  datasetId: string;
  recipientHint: string;
  recipientDisplayName?: string;
  purpose: string;
  accessScope: AccessPassport["accessScope"];
  accessRights: string;
  status: PassportStatus;
  issuedAt: string;
  expiresAt: string;
  daysUntilExpiry: number | null;
  consentRecordedAt?: string;
}

export interface OwnerExposurePendingShare {
  agreementId: string;
  datasetId: string;
  recipientHint: string;
  recipientDisplayName?: string;
  purpose: string;
  expiration: string;
  kind: "proposal" | "pending_consent";
}

export interface OwnerExposureDataset {
  datasetId: string;
  datasetTitle?: string;
  useCase?: string;
  classification?: string;
  dataFormat?: string;
  grants: OwnerExposureGrant[];
  pending: OwnerExposurePendingShare[];
}

export interface OwnerExposureRecipient {
  recipientHint: string;
  recipientDisplayName?: string;
  activeGrants: number;
  pendingGrants: number;
  datasetTitles: string[];
  purposes: string[];
}

export interface OwnerExposureSummary {
  datasetsOwned: number;
  datasetsWithAccess: number;
  activeGrants: number;
  pendingConsent: number;
  pendingProposals: number;
  uniqueRecipients: number;
  expiringWithin7Days: number;
}

export interface OwnerExposure {
  ownerHint: string;
  ownerDisplayName?: string;
  summary: OwnerExposureSummary;
  byDataset: OwnerExposureDataset[];
  byRecipient: OwnerExposureRecipient[];
}

export interface PassportTimelineEvent {
  contractId: string;
  txId: string | null;
  auditId: string;
  action: string;
  actor: string;
  actorHint?: string;
  datasetId: string;
  timestamp: string;
  details?: string;
  relatedEntityId?: string;
}

export interface PassportDetail extends AccessPassport {
  timeline: PassportTimelineEvent[];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function value(row: unknown, key: string): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  return asString((row as Record<string, unknown>)[key]);
}

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDatasetTitle(description: string, datasetId: string): string | undefined {
  const trimmed = description.trim();
  if (!trimmed) {
    return undefined;
  }
  const colonIdx = trimmed.indexOf(": ");
  if (colonIdx > 0 && colonIdx < 80) {
    return trimmed.slice(0, colonIdx);
  }
  if (trimmed.length <= 64) {
    return trimmed;
  }
  return datasetId;
}

function inferUseCase(parts: string[]): string {
  const text = parts.join(" ").toLowerCase();
  if (text.includes("kyc") || text.includes("identity")) {
    return "KYC";
  }
  if (text.includes("invoice") || text.includes("trade") || text.includes("finance")) {
    return "TradeFinance";
  }
  if (text.includes("audit")) {
    return "Audit";
  }
  if (text.includes("health") || text.includes("patient") || text.includes("clinical")) {
    return "Healthcare";
  }
  if (text.includes("ai") || text.includes("model")) {
    return "AI";
  }
  return "General";
}

function mapPermissionStatus(status: string): PassportStatus {
  if (status === "PSRevoked") {
    return "Revoked";
  }
  if (status === "PSExpired") {
    return "Expired";
  }
  if (status === "PSActive") {
    return "Active";
  }
  return "PendingConsent";
}

function shouldReplace(current: AccessPassport, incoming: AccessPassport): boolean {
  const rank = (status: PassportStatus): number => {
    if (status === "Revoked") return 5;
    if (status === "Expired") return 4;
    if (status === "Denied") return 3;
    if (status === "Active") return 2;
    return 1;
  };
  const byStatus = rank(incoming.status) - rank(current.status);
  if (byStatus !== 0) {
    return byStatus > 0;
  }
  return incoming.issuedAt > current.issuedAt;
}

export async function listAccessPassports(filters?: {
  useCase?: string;
  status?: PassportStatus | string;
  ownerHint?: string;
}): Promise<AccessPassport[]> {
  const [permissions, agreements, datasets, banks, audit] = await Promise.all([
    governance.listPermissions(),
    governance.listSharingAgreements(),
    governance.listLedgerDatasets(),
    listBanks(),
    governance.listAuditTrail(),
  ]);

  const agreementById = new Map(agreements.map((item) => [value(item, "agreementId"), item]));
  const datasetById = new Map(datasets.map((item) => [value(item, "datasetId"), item]));
  const bankByHint = new Map(banks.map((bank) => [bank.hint, bank]));

  const consentByPermissionId = new Map<
    string,
    { timestamp: string; contractId: string; auditId: string }
  >();
  const revocationByPermissionId = new Map<
    string,
    { timestamp: string; contractId: string; reason?: string; auditId: string }
  >();
  const auditIdsByPermissionId = new Map<string, string[]>();

  for (const event of audit) {
    const action = value(event, "action");
    const entityId = value(event, "relatedEntityId");
    if (!entityId) {
      continue;
    }

    const list = auditIdsByPermissionId.get(entityId) ?? [];
    list.push(value(event, "auditId"));
    auditIdsByPermissionId.set(entityId, list);

    if (action === "ConsentRecorded") {
      consentByPermissionId.set(entityId, {
        timestamp: value(event, "timestamp"),
        contractId: value(event, "contractId"),
        auditId: value(event, "auditId"),
      });
    } else if (action === "PermissionRevoked") {
      revocationByPermissionId.set(entityId, {
        timestamp: value(event, "timestamp"),
        contractId: value(event, "contractId"),
        reason: value(event, "details"),
        auditId: value(event, "auditId"),
      });
    }
  }

  const merged = new Map<string, AccessPassport>();

  for (const permission of permissions) {
    const permissionId = value(permission, "permissionId");
    if (!permissionId) {
      continue;
    }
    const agreement = agreementById.get(value(permission, "agreementId"));
    const dataset = datasetById.get(value(permission, "datasetId"));
    const ownerHint = value(permission, "ownerHint") || value(permission, "owner").split("::")[0];
    const recipientHint =
      value(permission, "recipientHint") || value(permission, "recipient").split("::")[0];
    const consent = consentByPermissionId.get(permissionId);
    const revocation = revocationByPermissionId.get(permissionId);
    const status = revocation ? "Revoked" : mapPermissionStatus(value(permission, "status"));

    const passport: AccessPassport = {
      passportId: permissionId,
      agreementId: value(permission, "agreementId"),
      datasetId: value(permission, "datasetId"),
      datasetTitle: parseDatasetTitle(value(dataset, "description"), value(permission, "datasetId")),
      useCase: inferUseCase([
        value(dataset, "description"),
        value(dataset, "classification"),
        value(agreement, "purpose"),
        value(permission, "purpose"),
        value(permission, "datasetId"),
      ]),
      ownerHint,
      ownerDisplayName: bankByHint.get(ownerHint)?.displayName,
      recipientHint,
      recipientDisplayName: bankByHint.get(recipientHint)?.displayName,
      purpose: value(agreement, "purpose") || value(permission, "purpose"),
      accessScope: (value(permission, "accessScope") || "Analytics") as
        | "ReadOnly"
        | "Analytics"
        | "FullAccess",
      accessRights: value(permission, "accessRights") || "read-analytics",
      status,
      issuedAt: value(permission, "issuedAt") || value(permission, "expiresAt"),
      expiresAt: value(permission, "expiresAt") || value(agreement, "expiration"),
      consentRecordedAt: consent?.timestamp,
      revokedAt: revocation?.timestamp,
      revocationReason: revocation?.reason,
      permissionContractId: value(permission, "contractId"),
      consentContractId: consent?.contractId,
      revocationContractId: revocation?.contractId,
      auditEventIds: auditIdsByPermissionId.get(permissionId) ?? [],
    };

    const current = merged.get(permissionId);
    if (!current || shouldReplace(current, passport)) {
      merged.set(permissionId, passport);
    }
  }

  let rows = Array.from(merged.values());
  if (filters?.useCase) {
    rows = rows.filter(
      (row) => row.useCase?.toLowerCase() === filters.useCase?.toLowerCase(),
    );
  }
  if (filters?.status) {
    rows = rows.filter(
      (row) => row.status.toLowerCase() === String(filters.status).toLowerCase(),
    );
  }
  if (filters?.ownerHint) {
    rows = rows.filter(
      (row) => row.ownerHint.toLowerCase() === filters.ownerHint?.toLowerCase(),
    );
  }
  return rows;
}

function daysUntilExpiry(iso?: string): number | null {
  const expiresAt = parseDate(iso)?.getTime();
  if (expiresAt == null) {
    return null;
  }
  return Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
}

function ownerHintFromRow(row: unknown, ownerKey = "owner"): string {
  const hint = value(row, "ownerHint");
  if (hint) {
    return hint;
  }
  return value(row, ownerKey).split("::")[0];
}

function recipientHintFromRow(row: unknown): string {
  const hint = value(row, "recipientHint");
  if (hint) {
    return hint;
  }
  return value(row, "recipient").split("::")[0];
}

export async function getOwnerExposure(ownerHint: string): Promise<OwnerExposure> {
  const normalizedOwner = ownerHint.trim();
  const [passportRows, proposals, datasets, banks, catalogRows] = await Promise.all([
    listAccessPassports({ ownerHint: normalizedOwner }),
    governance.listSharingProposals(),
    governance.listLedgerDatasets(),
    listBanks(),
    import("./catalog.js").then((mod) => mod.listCatalog(normalizedOwner)),
  ]);

  const bankByHint = new Map(banks.map((bank) => [bank.hint, bank]));
  const catalogByDatasetId = new Map(catalogRows.map((row) => [row.datasetId, row]));
  const ownerDisplayName = bankByHint.get(normalizedOwner)?.displayName;

  const ownedDatasets = datasets.filter(
    (dataset) => ownerHintFromRow(dataset) === normalizedOwner,
  );

  const ownerProposals = proposals.filter(
    (proposal) => ownerHintFromRow(proposal) === normalizedOwner,
  );

  const grants: OwnerExposureGrant[] = passportRows
    .filter((passport) => passport.status !== "Revoked" && passport.status !== "Expired")
    .map((passport) => ({
      passportId: passport.passportId,
      agreementId: passport.agreementId,
      datasetId: passport.datasetId,
      recipientHint: passport.recipientHint,
      recipientDisplayName: passport.recipientDisplayName,
      purpose: passport.purpose,
      accessScope: passport.accessScope,
      accessRights: passport.accessRights,
      status: passport.status,
      issuedAt: passport.issuedAt,
      expiresAt: passport.expiresAt,
      daysUntilExpiry: daysUntilExpiry(passport.expiresAt),
      consentRecordedAt: passport.consentRecordedAt,
    }));

  const pendingFromProposals: OwnerExposurePendingShare[] = ownerProposals.map((proposal) => ({
    agreementId: value(proposal, "agreementId"),
    datasetId: value(proposal, "datasetId"),
    recipientHint: recipientHintFromRow(proposal),
    recipientDisplayName: bankByHint.get(recipientHintFromRow(proposal))?.displayName,
    purpose: value(proposal, "purpose"),
    expiration: value(proposal, "expiration"),
    kind: "proposal" as const,
  }));

  const datasetIds = new Set<string>();
  for (const dataset of ownedDatasets) {
    datasetIds.add(value(dataset, "datasetId"));
  }
  for (const grant of grants) {
    datasetIds.add(grant.datasetId);
  }
  for (const pending of [...pendingFromProposals]) {
    datasetIds.add(pending.datasetId);
  }

  const byDataset: OwnerExposureDataset[] = Array.from(datasetIds)
    .filter(Boolean)
    .map((datasetId) => {
      const ledger = ownedDatasets.find((row) => value(row, "datasetId") === datasetId);
      const catalog = catalogByDatasetId.get(datasetId);

      return {
        datasetId,
        datasetTitle:
          catalog?.title ??
          parseDatasetTitle(value(ledger, "description"), datasetId) ??
          datasetId,
        useCase:
          catalog?.useCase ??
          inferUseCase([value(ledger, "description"), value(ledger, "classification"), datasetId]),
        classification:
          catalog?.classification ??
          (value(ledger, "classification") ? value(ledger, "classification") : undefined),
        dataFormat: value(ledger, "dataFormat") || undefined,
        grants: grants.filter((grant) => grant.datasetId === datasetId),
        pending: pendingFromProposals.filter((row) => row.datasetId === datasetId),
      };
    })
    .sort((a, b) => (a.datasetTitle ?? a.datasetId).localeCompare(b.datasetTitle ?? b.datasetId));

  const recipientMap = new Map<string, OwnerExposureRecipient>();

  function touchRecipient(
    hint: string,
    displayName: string | undefined,
    datasetTitle: string,
    purpose: string,
    active: boolean,
    pending: boolean,
  ) {
    const current = recipientMap.get(hint) ?? {
      recipientHint: hint,
      recipientDisplayName: displayName,
      activeGrants: 0,
      pendingGrants: 0,
      datasetTitles: [],
      purposes: [],
    };
    if (displayName && !current.recipientDisplayName) {
      current.recipientDisplayName = displayName;
    }
    if (active) {
      current.activeGrants += 1;
    }
    if (pending) {
      current.pendingGrants += 1;
    }
    if (!current.datasetTitles.includes(datasetTitle)) {
      current.datasetTitles.push(datasetTitle);
    }
    if (purpose && !current.purposes.includes(purpose)) {
      current.purposes.push(purpose);
    }
    recipientMap.set(hint, current);
  }

  for (const row of byDataset) {
    const title = row.datasetTitle ?? row.datasetId;
    for (const grant of row.grants) {
      touchRecipient(
        grant.recipientHint,
        grant.recipientDisplayName,
        title,
        grant.purpose,
        grant.status === "Active",
        grant.status === "PendingConsent",
      );
    }
    for (const pending of row.pending) {
      touchRecipient(
        pending.recipientHint,
        pending.recipientDisplayName,
        title,
        pending.purpose,
        false,
        true,
      );
    }
  }

  const activeGrants = grants.filter((grant) => grant.status === "Active").length;
  const pendingConsent = grants.filter((grant) => grant.status === "PendingConsent").length;
  const expiringWithin7Days = grants.filter((grant) => {
    if (grant.status !== "Active") {
      return false;
    }
    const days = grant.daysUntilExpiry;
    return days != null && days >= 0 && days <= 7;
  }).length;

  const datasetsWithAccess = byDataset.filter(
    (row) => row.grants.length > 0 || row.pending.length > 0,
  ).length;

  return {
    ownerHint: normalizedOwner,
    ownerDisplayName,
    summary: {
      datasetsOwned: ownedDatasets.length || byDataset.length,
      datasetsWithAccess,
      activeGrants,
      pendingConsent,
      pendingProposals: pendingFromProposals.length,
      uniqueRecipients: recipientMap.size,
      expiringWithin7Days,
    },
    byDataset,
    byRecipient: Array.from(recipientMap.values()).sort((a, b) =>
      (a.recipientDisplayName ?? a.recipientHint).localeCompare(
        b.recipientDisplayName ?? b.recipientHint,
      ),
    ),
  };
}

export async function getExchangeSummary(): Promise<ExchangeSummary> {
  const [passports, proposals, datasets, banks, audit] = await Promise.all([
    listAccessPassports(),
    governance.listSharingProposals(),
    governance.listLedgerDatasets(),
    listBanks(),
    governance.listAuditTrail(),
  ]);

  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const expiringWithin7Days = passports.filter((passport) => {
    if (passport.status !== "Active") {
      return false;
    }
    const expiresAt = parseDate(passport.expiresAt)?.getTime();
    if (!expiresAt) {
      return false;
    }
    return expiresAt >= now && expiresAt - now <= sevenDays;
  }).length;

  const revokedLast30Days =
    audit.filter((event) => {
      if (value(event, "action") !== "PermissionRevoked") {
        return false;
      }
      const timestamp = parseDate(value(event, "timestamp"))?.getTime();
      if (!timestamp) {
        return false;
      }
      return timestamp >= now - thirtyDays;
    }).length ||
    passports.filter((passport) => {
      if (passport.status !== "Revoked") {
        return false;
      }
      const revokedAt = parseDate(passport.revokedAt)?.getTime();
      return revokedAt ? revokedAt >= now - thirtyDays : false;
    }).length;

  return {
    activePassports: passports.filter((passport) => passport.status === "Active").length,
    pendingRequests: proposals.length,
    pendingConsent: passports.filter((passport) => passport.status === "PendingConsent").length,
    expiringWithin7Days,
    revokedLast30Days,
    partnerCount: banks.length,
    datasetCount: datasets.length,
  };
}

export async function getAccessPassportById(
  passportId: string,
): Promise<PassportDetail | null> {
  const [passports, audit] = await Promise.all([
    listAccessPassports(),
    governance.listAuditTrail(),
  ]);
  const passport = passports.find((row) => row.passportId === passportId);
  if (!passport) {
    return null;
  }

  const relatedIds = new Set<string>([
    passport.passportId,
    passport.agreementId,
    passport.datasetId,
    ...(passport.auditEventIds ?? []),
  ]);

  const timeline = audit
    .filter((event) => {
      const relatedEntityId = value(event, "relatedEntityId");
      const datasetId = value(event, "datasetId");
      return (
        (relatedEntityId && relatedIds.has(relatedEntityId)) ||
        (datasetId && datasetId === passport.datasetId)
      );
    })
    .map((event) => ({
      contractId: value(event, "contractId"),
      txId: value(event, "txId") || null,
      auditId: value(event, "auditId"),
      action: value(event, "action"),
      actor: value(event, "actor"),
      actorHint: value(event, "actorHint") || undefined,
      datasetId: value(event, "datasetId"),
      timestamp: value(event, "timestamp"),
      details: value(event, "details") || undefined,
      relatedEntityId: value(event, "relatedEntityId") || undefined,
    }))
    .sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));

  return {
    ...passport,
    timeline,
  };
}
