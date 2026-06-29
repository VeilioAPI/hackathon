import * as catalog from "./catalog.js";
import * as governance from "./governance.js";
import { processThroughVeilioVault, analyzeTabularFile, type TokenizationPolicy } from "./veilio-mock.js";
import {
  deleteDatasetUploadsByDatasetId,
  deleteExchangeListingByDatasetId,
  insertDatasetUpload,
} from "../db/index.js";
import { createHash } from "node:crypto";
import { putObject } from "./object-storage.js";

function rowCountFromCsv(content: string): number {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length <= 1 ? 0 : lines.length - 1;
}

function rowCountFromJson(content: string): number | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return 1;
    return 0;
  } catch {
    return null;
  }
}

function inferUseCase(classification: string, title: string): catalog.CatalogListing["useCase"] {
  const text = `${classification} ${title}`.toLowerCase();
  if (text.includes("trade") || text.includes("invoice")) return "TradeFinance";
  if (text.includes("audit") || text.includes("accounting")) return "Audit";
  if (text.includes("health")) return "Healthcare";
  if (text.includes("ai") || text.includes("model")) return "AI";
  if (text.includes("kyc") || text.includes("identity") || text.includes("customer")) {
    return "KYC";
  }
  return "General";
}

export function analyzeDatasetFile(file: {
  originalname: string;
  buffer: Buffer;
}) {
  const analysis = analyzeTabularFile(file.buffer, file.originalname);
  const lower = file.originalname.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  if (isPdf || !analysis) {
    return {
      format: "PDF" as const,
      sealed: true,
      message:
        "PDF documents are sealed in Veilio Vault. Column-level tokenization applies to CSV and JSON.",
    };
  }
  return analysis;
}

export async function depositDataset(input: {
  ownerHint: string;
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
  datasetId?: string;
  title?: string;
  description?: string;
  classification?: string;
  replaceLatest?: boolean;
  shareScope?: catalog.ListingVisibility;
  invitedRecipientHint?: string;
  sharePurpose?: string;
  tokenizeColumns?: TokenizationPolicy;
}): Promise<{
  datasetId: string;
  uploadId: number;
  fileName: string;
  fileSize: number;
  rowCount: number | null;
  sha256: string;
  listingId: string;
  registered: boolean;
  published: boolean;
  visibility: catalog.ListingVisibility;
  veilio?: {
    vaultId: string;
    tokenized: boolean;
    piiFieldsDetected: string[];
    piiFieldsTokenized: number;
    tokenizedColumnNames: string[];
    classification: string;
    protectedFileName: string;
  };
  share?: {
    agreementId: string;
    passportId: string;
    recipientHint: string;
    status: string;
  };
}> {
  const ownerHint = input.ownerHint.trim();
  if (!ownerHint) {
    throw new Error("ownerHint is required");
  }

  const file = input.file;
  const ext = file.originalname.split(".").at(-1)?.toLowerCase();
  const mime = file.mimetype.toLowerCase();
  const isJson = ext === "json" || mime.includes("json");
  const isCsv = ext === "csv" || mime.includes("csv");
  const isPdf = ext === "pdf" || mime.includes("pdf");
  if (!isJson && !isCsv && !isPdf) {
    throw new Error("Only CSV, JSON, or PDF files are supported");
  }

  const dataFormat = isPdf ? "PDF" : isJson ? "JSON" : "CSV";
  const titleFromFile = file.originalname.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const title = (input.title?.trim() || titleFromFile || "Protected dataset").slice(0, 120);
  const description =
    input.description?.trim() ||
    `Protected ${dataFormat} dataset deposited by ${ownerHint} (off-ledger storage, governance metadata on Canton)`;
  const classification = input.classification?.trim() || "Regulated-Financial";
  const datasetId =
    input.datasetId?.trim() ||
    `DS-${titleFromFile.replace(/\s+/g, "-").slice(0, 24).toUpperCase() || "UPLOAD"}-${Date.now().toString(36)}`;

  const existing = await governance.listLedgerDatasets();
  const alreadyOnLedger = existing.some((row) => {
    const payload = row as Record<string, unknown>;
    return String(payload.datasetId) === datasetId;
  });

  let registered = false;
  if (!alreadyOnLedger) {
    await governance.registerDataset({
      datasetId,
      ownerHint,
      title,
      description,
      classification,
      dataFormat: dataFormat as "CSV" | "JSON" | "PDF",
    });
    registered = true;
  }

  const veilio = processThroughVeilioVault(
    file.buffer,
    file.originalname,
    classification,
    input.tokenizeColumns,
  );
  const protectedText = isPdf ? "" : veilio.buffer.toString("utf8");
  const rowCount = isPdf
    ? null
    : isJson
      ? rowCountFromJson(protectedText)
      : rowCountFromCsv(protectedText);
  const sha256 = createHash("sha256").update(veilio.buffer).digest("hex");
  const objectKey = `${ownerHint}/${datasetId}/${Date.now().toString(36)}-${veilio.fileName}`;
  const objectRef = await putObject(objectKey, veilio.buffer);

  const uploadId = await insertDatasetUpload({
    datasetId,
    ownerHint,
    fileName: veilio.fileName,
    mimeType: isPdf ? "application/pdf" : file.mimetype || "application/octet-stream",
    fileSize: veilio.buffer.length,
    sha256,
    rowCount,
    fileData: undefined,
    storageProvider: objectRef.provider,
    storageBucket: objectRef.bucket,
    storageKey: objectRef.objectKey,
    replaceLatest: input.replaceLatest ?? false,
    veilioVaultId: veilio.vaultId,
    piiFieldsTokenized: veilio.piiFieldsTokenized,
    tokenizedColumnNames: veilio.tokenizedColumnNames,
  });

  const shareScope = input.shareScope ?? "private";
  if (shareScope === "direct" && !input.invitedRecipientHint?.trim()) {
    throw new Error("invitedRecipientHint is required for direct sharing");
  }
  if (shareScope === "direct" && input.invitedRecipientHint?.trim() === ownerHint) {
    throw new Error("Cannot share directly with yourself");
  }

  const listingId = await catalog.ensureListingForDataset({
    datasetId,
    title,
    description,
    classification,
    useCase: inferUseCase(classification, title),
    ownerHint,
    defaultPurpose: input.sharePurpose?.trim() || "Regulated data sharing",
    visibility: shareScope,
    invitedRecipientHint: input.invitedRecipientHint?.trim(),
  });

  let shareResult:
    | {
        agreementId: string;
        passportId: string;
        recipientHint: string;
        status: string;
      }
    | undefined;

  if (shareScope === "direct" && input.invitedRecipientHint) {
    const shared = await shareDatasetExternally({
      datasetId,
      ownerHint,
      recipientHint: input.invitedRecipientHint.trim(),
      purpose: input.sharePurpose?.trim() || "Regulated data sharing",
      expirationDays: 90,
    });
    shareResult = {
      agreementId: shared.agreementId,
      passportId: shared.passportId,
      recipientHint: shared.recipientHint,
      status: shared.status,
    };
  }

  return {
    datasetId,
    uploadId,
    fileName: veilio.fileName,
    fileSize: veilio.buffer.length,
    rowCount,
    sha256,
    listingId,
    registered,
    published: true,
    visibility: shareScope,
    veilio: {
      vaultId: veilio.vaultId,
      tokenized: veilio.tokenized,
      piiFieldsDetected: veilio.piiFieldsDetected,
      piiFieldsTokenized: veilio.piiFieldsTokenized,
      tokenizedColumnNames: veilio.tokenizedColumnNames,
      classification: veilio.classification,
      protectedFileName: veilio.fileName,
    },
    share: shareResult,
  };
}

export async function shareDatasetExternally(input: {
  datasetId: string;
  ownerHint: string;
  recipientHint: string;
  purpose: string;
  expirationDays?: number;
}): Promise<{
  datasetId: string;
  agreementId: string;
  passportId: string;
  recipientHint: string;
  status: "ProposalPending" | "PassportPending" | "Active";
}> {
  const datasetId = input.datasetId.trim();
  const ownerHint = input.ownerHint.trim();
  const recipientHint = input.recipientHint.trim();

  if (ownerHint === recipientHint) {
    throw new Error("Cannot share a dataset with the same organization");
  }

  const datasets = await governance.listLedgerDatasets();
  const dataset = datasets.find((row) => {
    const payload = row as Record<string, unknown>;
    return String(payload.datasetId) === datasetId;
  }) as Record<string, unknown> | undefined;

  if (!dataset) {
    throw new Error(`Dataset ${datasetId} is not registered on Canton`);
  }

  const ownerFromLedger = String(dataset.ownerHint ?? "");
  if (ownerFromLedger && ownerFromLedger !== ownerHint) {
    throw new Error(`Only the owner (${ownerFromLedger}) can share this dataset`);
  }

  const existingPassports = await governance.listPermissions();
  const activeWithRecipient = existingPassports.find((row) => {
    const payload = row as Record<string, unknown>;
    return (
      String(payload.datasetId) === datasetId &&
      String(payload.recipientHint ?? "").split("::")[0] === recipientHint &&
      (String(payload.status) === "PSActive" || String(payload.status) === "PSPending")
    );
  }) as Record<string, unknown> | undefined;

  if (activeWithRecipient) {
    return {
      datasetId,
      agreementId: String(activeWithRecipient.agreementId ?? ""),
      passportId: String(activeWithRecipient.permissionId ?? ""),
      recipientHint,
      status:
        String(activeWithRecipient.status) === "PSActive" ? "Active" : "PassportPending",
    };
  }

  const agreementId = `SA-${datasetId}-${recipientHint}-${Date.now().toString(36)}`;
  const passportId = `VP-${datasetId}-${recipientHint}-${Date.now().toString(36)}`;

  await governance.proposeSharing({
    datasetId,
    agreementId,
    recipientHint,
    purpose: input.purpose.trim(),
    expirationDays: input.expirationDays ?? 90,
  });

  await governance.acceptSharing(agreementId);

  await governance.issuePermission({
    agreementId,
    permissionId: passportId,
    accessScope: "ReadOnly",
    accessRights: "read-only",
  });

  return {
    datasetId,
    agreementId,
    passportId,
    recipientHint,
    status: "PassportPending",
  };
}

export async function deleteDataset(input: {
  datasetId: string;
  ownerHint: string;
}): Promise<{
  datasetId: string;
  archivedContracts: number;
  deletedUploads: number;
  listingRemoved: boolean;
}> {
  const datasetId = input.datasetId.trim();
  const ownerHint = input.ownerHint.trim();

  const ledgerDatasets = await governance.listLedgerDatasets();
  const dataset = ledgerDatasets.find(
    (row) => String((row as Record<string, unknown>).datasetId) === datasetId,
  ) as Record<string, unknown> | undefined;
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found`);
  }
  if (String(dataset.ownerHint) !== ownerHint) {
    throw new Error(`Only the owner (${String(dataset.ownerHint)}) can delete this dataset`);
  }

  const permissions = await governance.listPermissions();
  const blocking = permissions.filter((row) => {
    const payload = row as Record<string, unknown>;
    if (String(payload.datasetId) !== datasetId) return false;
    const status = String(payload.status ?? "");
    return status === "PSActive" || status === "PSPending";
  });

  if (blocking.length > 0) {
    const ids = blocking
      .map((row) => String((row as Record<string, unknown>).permissionId ?? "passport"))
      .join(", ");
    throw new Error(
      `Cannot delete: revoke or wait for ${blocking.length} active passport(s) first (${ids})`,
    );
  }

  const archiveResult = await governance.archiveDataset({ datasetId, ownerHint });
  const deletedUploads = await deleteDatasetUploadsByDatasetId(datasetId);
  const listingRemoved = await deleteExchangeListingByDatasetId(datasetId);

  return {
    datasetId,
    archivedContracts: archiveResult.archivedContracts,
    deletedUploads,
    listingRemoved,
  };
}
