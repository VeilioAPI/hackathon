import { getCurrentDatasetUpload } from "../db/index.js";
import { listAccessPassports } from "./passports.js";
import { createSignedDownloadUrl, getObject } from "./object-storage.js";

export class AccessDeniedError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class UnsupportedDatasetFormatError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDatasetFormatError";
  }
}

export type DatasetAccessRole = "owner" | "recipient";

export type DatasetAccessDecision = {
  allowed: boolean;
  role?: DatasetAccessRole;
  passportId?: string;
  reason?: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function previewFromCsv(content: string, maxRows: number) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { format: "CSV" as const, columns: [] as string[], rows: [] as Record<string, string>[], totalRows: 0, truncated: false };
  }

  const columns = parseCsvLine(lines[0]);
  const dataLines = lines.slice(1);
  const totalRows = dataLines.length;
  const rows = dataLines.slice(0, maxRows).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      row[column] = cells[index] ?? "";
    });
    return row;
  });

  return {
    format: "CSV" as const,
    columns,
    rows,
    totalRows,
    truncated: totalRows > maxRows,
  };
}

function previewFromJson(content: string, maxRows: number) {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    const columns =
      parsed.length > 0 && parsed[0] && typeof parsed[0] === "object" && !Array.isArray(parsed[0])
        ? Object.keys(parsed[0] as Record<string, unknown>)
        : ["value"];
    const rows = parsed.slice(0, maxRows).map((item, index) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record: Record<string, string> = {};
        for (const column of columns) {
          const value = (item as Record<string, unknown>)[column];
          record[column] =
            value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
        }
        return record;
      }
      return { value: JSON.stringify(item) };
    });
    return {
      format: "JSON" as const,
      columns,
      rows,
      totalRows: parsed.length,
      truncated: parsed.length > maxRows,
    };
  }

  if (parsed && typeof parsed === "object") {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      record[key] =
        value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    return {
      format: "JSON" as const,
      columns: Object.keys(record),
      rows: [record],
      totalRows: 1,
      truncated: false,
    };
  }

  return {
    format: "JSON" as const,
    columns: ["value"],
    rows: [{ value: String(parsed) }],
    totalRows: 1,
    truncated: false,
  };
}

export async function checkDatasetFileAccess(
  datasetId: string,
  requesterHint: string,
): Promise<DatasetAccessDecision> {
  const upload = await getCurrentDatasetUpload(datasetId);
  if (!upload) {
    return { allowed: false, reason: "No protected file deposited for this dataset" };
  }

  if (upload.owner_hint === requesterHint) {
    return { allowed: true, role: "owner" };
  }

  const passports = await listAccessPassports();
  const activePassport = passports.find(
    (passport) =>
      passport.datasetId === datasetId &&
      passport.recipientHint === requesterHint &&
      passport.status === "Active",
  );

  if (activePassport) {
    return {
      allowed: true,
      role: "recipient",
      passportId: activePassport.passportId,
    };
  }

  return {
    allowed: false,
    reason: "Access denied — an active Access Passport is required to view this file",
  };
}

async function requireDatasetFileAccess(datasetId: string, requesterHint: string) {
  const decision = await checkDatasetFileAccess(datasetId, requesterHint);
  if (!decision.allowed) {
    throw new AccessDeniedError(decision.reason ?? "Access denied");
  }
  const upload = await getCurrentDatasetUpload(datasetId);
  if (!upload) {
    throw new Error(`No protected file for dataset ${datasetId}`);
  }
  return { upload, decision };
}

async function readUploadData(upload: { file_data: Buffer | null; storage_key: string | null }) {
  if (upload.storage_key) {
    return getObject(upload.storage_key);
  }
  if (upload.file_data) {
    return upload.file_data;
  }
  throw new Error("Dataset upload payload unavailable");
}

export async function previewDatasetFile(input: {
  datasetId: string;
  requesterHint: string;
  maxRows?: number;
}) {
  const maxRows = Math.min(Math.max(input.maxRows ?? 25, 1), 100);
  const { upload, decision } = await requireDatasetFileAccess(input.datasetId, input.requesterHint);
  const payload = await readUploadData(upload);
  const isPdf =
    upload.mime_type.includes("pdf") || upload.file_name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    return {
      datasetId: input.datasetId,
      fileName: upload.file_name,
      mimeType: upload.mime_type,
      sha256: upload.sha256,
      format: "PDF" as const,
      columns: [] as string[],
      rows: [] as Record<string, string>[],
      totalRows: 0,
      truncated: false,
      maxRows: 0,
      accessRole: decision.role,
      passportId: decision.passportId,
      pdfBase64: payload.toString("base64"),
      sealedInVault: true,
      fileSize: Number(upload.file_size),
      downloadUrl: upload.storage_key ? createSignedDownloadUrl(upload.storage_key) : null,
    };
  }

  const content = payload.toString("utf8");
  const isJson =
    upload.mime_type.includes("json") || upload.file_name.toLowerCase().endsWith(".json");
  const preview = isJson ? previewFromJson(content, maxRows) : previewFromCsv(content, maxRows);

  return {
    datasetId: input.datasetId,
    fileName: upload.file_name,
    mimeType: upload.mime_type,
    sha256: upload.sha256,
    accessRole: decision.role,
    passportId: decision.passportId,
    downloadUrl: upload.storage_key ? createSignedDownloadUrl(upload.storage_key) : null,
    maxRows,
    ...preview,
  };
}

export async function downloadDatasetFile(input: {
  datasetId: string;
  requesterHint: string;
}) {
  const { upload, decision } = await requireDatasetFileAccess(input.datasetId, input.requesterHint);
  return {
    upload,
    downloadUrl: upload.storage_key ? createSignedDownloadUrl(upload.storage_key) : null,
    accessRole: decision.role,
    passportId: decision.passportId,
  };
}

function parseTokenizedColumnNames(raw: string | null): string[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function prepareDatasetForLlm(input: {
  datasetId: string;
  requesterHint: string;
  maxPreviewRows?: number;
}) {
  const maxPreviewRows = Math.min(Math.max(input.maxPreviewRows ?? 10, 1), 50);
  const { upload, decision } = await requireDatasetFileAccess(input.datasetId, input.requesterHint);
  const isPdf =
    upload.mime_type.includes("pdf") || upload.file_name.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    throw new UnsupportedDatasetFormatError(
      "PDF datasets cannot be prepared for LLM inline — use tabular CSV/JSON or download the sealed document",
    );
  }

  const payload = await readUploadData(upload);
  const content = payload.toString("utf8");
  const isJson =
    upload.mime_type.includes("json") || upload.file_name.toLowerCase().endsWith(".json");
  const format = isJson ? ("JSON" as const) : ("CSV" as const);
  const preview = isJson ? previewFromJson(content, maxPreviewRows) : previewFromCsv(content, maxPreviewRows);
  const tokenizedColumnNames = parseTokenizedColumnNames(upload.tokenized_column_names);

  return {
    datasetId: input.datasetId,
    fileName: upload.file_name,
    mimeType: upload.mime_type,
    sha256: upload.sha256,
    format,
    accessRole: decision.role,
    passportId: decision.passportId,
    veilioVaultId: upload.veilio_vault_id,
    tokenizedColumnNames,
    piiFieldsTokenized: upload.pii_fields_tokenized,
    rowCount: upload.row_count,
    content,
    preview: {
      columns: preview.columns,
      rows: preview.rows,
      totalRows: preview.totalRows,
      truncated: preview.truncated,
      maxRows: maxPreviewRows,
    },
    llmUsage: {
      instruction:
        "Send the `content` field to your LLM API. Columns listed in tokenizedColumnNames were replaced with stable TOK_* identifiers — never attach vault mapping.",
      warning: "Raw PII is not stored on Exchange after protection. Do not attempt to reverse tokens outside your Veilio vault.",
    },
    preparedAt: new Date().toISOString(),
  };
}
