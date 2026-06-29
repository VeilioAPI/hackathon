import { listDatasetUploads } from "../db/index.js";
import * as catalog from "./catalog.js";
import * as governance from "./governance.js";
import { listFileAccessLogs } from "./file-access-audit.js";
import * as passports from "./passports.js";

export const COMPLIANCE_EXPORT_SCHEMA_VERSION = 2;

function parseTokenizedColumnNames(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function protectionType(input: {
  mimeType: string;
  tokenizedColumnNames: string[];
  veilioVaultId: string | null;
  piiFieldsTokenized: number | null;
}): "column_tokenization" | "pdf_sealed" | "vault_only" | "none" {
  const lower = input.mimeType.toLowerCase();
  if (lower.includes("pdf") && input.veilioVaultId) {
    return "pdf_sealed";
  }
  if (input.tokenizedColumnNames.length > 0 || (input.piiFieldsTokenized ?? 0) > 0) {
    return "column_tokenization";
  }
  if (input.veilioVaultId) {
    return "vault_only";
  }
  return "none";
}

export type VeilioProtectionDataset = {
  datasetId: string;
  ownerHint: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  rowCount: number | null;
  veilioVaultId: string | null;
  piiFieldsTokenized: number | null;
  tokenizedColumnNames: string[];
  protectionType: "column_tokenization" | "pdf_sealed" | "vault_only" | "none";
  isCurrent: boolean;
  depositedAt: string;
};

export type VeilioProtectionSummary = {
  protectedDatasets: number;
  withColumnTokenization: number;
  withPdfSealing: number;
  totalTokenizedColumns: number;
  totalPiiFieldsTokenized: number;
};

export type GovernedShareRecord = {
  passportId: string;
  agreementId: string;
  datasetId: string;
  datasetTitle?: string;
  ownerHint: string;
  recipientHint: string;
  purpose: string;
  status: passports.PassportStatus;
  expiresAt: string;
  veilioVaultId: string | null;
  protectedFileName?: string;
  protectedSha256?: string;
  piiFieldsTokenized: number | null;
  tokenizedColumnNames: string[];
  protectionType: "column_tokenization" | "pdf_sealed" | "vault_only" | "none";
};

export type ComplianceExportPack = {
  generatedAt: string;
  product: "Veilio Exchange";
  version: string;
  exportSchemaVersion: number;
  privacyModel: {
    piiOnCanton: false;
    piiStorage: "Veilio Vault (off-ledger)";
    governanceOnCanton: true;
    note: string;
  };
  summary: Awaited<ReturnType<typeof passports.getExchangeSummary>>;
  veilioProtection: {
    layer: "Veilio Vault";
    integrationMode: "mock";
    summary: VeilioProtectionSummary;
    datasets: VeilioProtectionDataset[];
  };
  governedShares: GovernedShareRecord[];
  catalog: catalog.CatalogListing[];
  passports: Awaited<ReturnType<typeof passports.listAccessPassports>>;
  governanceAudit: Awaited<ReturnType<typeof governance.listAuditTrail>>;
  consents: Awaited<ReturnType<typeof governance.listConsents>>;
  revocations: Awaited<ReturnType<typeof governance.listRevocations>>;
  fileAccess: Awaited<ReturnType<typeof listFileAccessLogs>>;
};

function buildVeilioProtectionDatasets(
  uploads: Awaited<ReturnType<typeof listDatasetUploads>>,
): VeilioProtectionDataset[] {
  return uploads
    .filter((row) => row.is_current)
    .map((row) => {
      const tokenizedColumnNames = parseTokenizedColumnNames(row.tokenized_column_names);
      const piiFieldsTokenized =
        row.pii_fields_tokenized == null ? null : Number(row.pii_fields_tokenized);
      return {
        datasetId: row.dataset_id,
        ownerHint: row.owner_hint,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sha256: row.sha256,
        rowCount: row.row_count == null ? null : Number(row.row_count),
        veilioVaultId: row.veilio_vault_id,
        piiFieldsTokenized,
        tokenizedColumnNames,
        protectionType: protectionType({
          mimeType: row.mime_type,
          tokenizedColumnNames,
          veilioVaultId: row.veilio_vault_id,
          piiFieldsTokenized,
        }),
        isCurrent: row.is_current,
        depositedAt: row.created_at,
      };
    });
}

function summarizeVeilioProtection(
  datasets: VeilioProtectionDataset[],
): VeilioProtectionSummary {
  let totalTokenizedColumns = 0;
  let totalPiiFieldsTokenized = 0;
  let withColumnTokenization = 0;
  let withPdfSealing = 0;

  for (const row of datasets) {
    totalTokenizedColumns += row.tokenizedColumnNames.length;
    totalPiiFieldsTokenized += row.piiFieldsTokenized ?? 0;
    if (row.protectionType === "column_tokenization") {
      withColumnTokenization += 1;
    }
    if (row.protectionType === "pdf_sealed") {
      withPdfSealing += 1;
    }
  }

  return {
    protectedDatasets: datasets.length,
    withColumnTokenization,
    withPdfSealing,
    totalTokenizedColumns,
    totalPiiFieldsTokenized,
  };
}

function buildGovernedShares(
  passportRows: Awaited<ReturnType<typeof passports.listAccessPassports>>,
  protectionByDataset: Map<string, VeilioProtectionDataset>,
): GovernedShareRecord[] {
  return passportRows
    .filter((row) => row.status !== "Denied")
    .map((passport) => {
      const protection = protectionByDataset.get(passport.datasetId);
      const tokenizedColumnNames = protection?.tokenizedColumnNames ?? [];
      return {
        passportId: passport.passportId,
        agreementId: passport.agreementId,
        datasetId: passport.datasetId,
        datasetTitle: passport.datasetTitle,
        ownerHint: passport.ownerHint,
        recipientHint: passport.recipientHint,
        purpose: passport.purpose,
        status: passport.status,
        expiresAt: passport.expiresAt,
        veilioVaultId: protection?.veilioVaultId ?? null,
        protectedFileName: protection?.fileName,
        protectedSha256: protection?.sha256,
        piiFieldsTokenized: protection?.piiFieldsTokenized ?? null,
        tokenizedColumnNames,
        protectionType: protection
          ? protection.protectionType
          : protectionType({
              mimeType: "",
              tokenizedColumnNames: [],
              veilioVaultId: null,
              piiFieldsTokenized: null,
            }),
      };
    });
}

export async function buildComplianceExportPack(): Promise<ComplianceExportPack> {
  const [
    summary,
    passportRows,
    governanceAudit,
    consents,
    revocations,
    fileAccess,
    uploads,
    catalogRows,
  ] = await Promise.all([
    passports.getExchangeSummary(),
    passports.listAccessPassports(),
    governance.listAuditTrail(),
    governance.listConsents(),
    governance.listRevocations(),
    listFileAccessLogs(500),
    listDatasetUploads(),
    catalog.listCatalog(),
  ]);

  const veilioDatasets = buildVeilioProtectionDatasets(uploads);
  const protectionByDataset = new Map(
    veilioDatasets.map((row) => [row.datasetId, row]),
  );

  return {
    generatedAt: new Date().toISOString(),
    product: "Veilio Exchange",
    version: "0.2.0",
    exportSchemaVersion: COMPLIANCE_EXPORT_SCHEMA_VERSION,
    privacyModel: {
      piiOnCanton: false,
      piiStorage: "Veilio Vault (off-ledger)",
      governanceOnCanton: true,
      note:
        "Recipients receive only Veilio-protected file versions. Canton records governance metadata (purpose, parties, expiration) — never raw PII.",
    },
    summary,
    veilioProtection: {
      layer: "Veilio Vault",
      integrationMode: "mock",
      summary: summarizeVeilioProtection(veilioDatasets),
      datasets: veilioDatasets,
    },
    governedShares: buildGovernedShares(passportRows, protectionByDataset),
    catalog: catalogRows,
    passports: passportRows,
    governanceAudit,
    consents,
    revocations,
    fileAccess,
  };
}
