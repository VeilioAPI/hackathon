import { createHash, randomBytes } from "node:crypto";

export type VeilioVaultResult = {
  vaultId: string;
  tokenized: boolean;
  sealed?: boolean;
  piiFieldsDetected: string[];
  piiFieldsTokenized: number;
  tokenizedColumnNames: string[];
  classification: string;
  originalSha256: string;
  protectedSha256: string;
  buffer: Buffer;
  fileName: string;
};

export type ColumnAnalysis = {
  name: string;
  suggestedTokenize: boolean;
  reason: string;
  sampleValues: string[];
};

export type TabularAnalysis = {
  format: "CSV" | "JSON";
  columns: ColumnAnalysis[];
  previewRows: Record<string, string>[];
  rowCount: number;
};

/** column name → whether to tokenize values in that column */
export type TokenizationPolicy = Record<string, boolean>;

const PII_COLUMN_HINTS = [
  "email",
  "e_mail",
  "phone",
  "mobile",
  "national_id",
  "ssn",
  "iban",
  "passport",
  "birth",
  "address",
  "name",
  "customer_name",
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

function token(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return `TOK_${digest}`;
}

export function suggestColumnTokenization(column: string, sampleValues: string[]): {
  suggestedTokenize: boolean;
  reason: string;
} {
  const columnLower = column.toLowerCase();
  if (PII_COLUMN_HINTS.some((hint) => columnLower.includes(hint))) {
    return { suggestedTokenize: true, reason: "Column name suggests personal data" };
  }
  for (const raw of sampleValues) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (EMAIL_RE.test(trimmed)) {
      EMAIL_RE.lastIndex = 0;
      return { suggestedTokenize: true, reason: "Sample values look like email addresses" };
    }
    if (PHONE_RE.test(trimmed)) {
      PHONE_RE.lastIndex = 0;
      return { suggestedTokenize: true, reason: "Sample values look like phone numbers" };
    }
  }
  return { suggestedTokenize: false, reason: "No sensitive pattern detected" };
}

function shouldTokenizeColumn(
  column: string,
  value: string,
  policy?: TokenizationPolicy,
): boolean {
  if (policy && Object.prototype.hasOwnProperty.call(policy, column)) {
    return policy[column] === true;
  }
  const suggestion = suggestColumnTokenization(column, [value]);
  return suggestion.suggestedTokenize;
}

function tokenizeCell(
  column: string,
  value: string,
  policy?: TokenizationPolicy,
): { value: string; tokenized: boolean } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value, tokenized: false };
  }
  if (!shouldTokenizeColumn(column, trimmed, policy)) {
    return { value, tokenized: false };
  }
  return { value: token(trimmed), tokenized: true };
}

function parseCsvHeadersAndRows(content: string): {
  headers: string[];
  rows: string[][];
} {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = lines[0].split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")),
  );
  return { headers, rows };
}

function extractJsonColumns(content: string): { columns: string[]; rows: Record<string, unknown>[] } {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === "object") {
      const columns = Object.keys(parsed[0] as Record<string, unknown>);
      return { columns, rows: parsed as Record<string, unknown>[] };
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return { columns: Object.keys(record), rows: [record] };
    }
  } catch {
    // fall through
  }
  return { columns: [], rows: [] };
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function analyzeTabularFile(buffer: Buffer, fileName: string): TabularAnalysis | null {
  const lower = fileName.toLowerCase();
  const isJson = lower.endsWith(".json");
  const isCsv = lower.endsWith(".csv");
  if (!isJson && !isCsv) {
    return null;
  }

  const text = buffer.toString("utf8");

  if (isCsv) {
    const { headers, rows } = parseCsvHeadersAndRows(text);
    const previewRows: Record<string, string>[] = rows.slice(0, 3).map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index] ?? "";
      });
      return record;
    });
    const columns = headers.map((name) => {
      const sampleValues = rows.slice(0, 5).map((row) => row[headers.indexOf(name)] ?? "");
      const suggestion = suggestColumnTokenization(name, sampleValues);
      return {
        name,
        suggestedTokenize: suggestion.suggestedTokenize,
        reason: suggestion.reason,
        sampleValues: sampleValues.filter(Boolean).slice(0, 2),
      };
    });
    return {
      format: "CSV",
      columns,
      previewRows,
      rowCount: rows.length,
    };
  }

  const { columns: jsonColumns, rows } = extractJsonColumns(text);
  const previewRows = rows.slice(0, 3).map((row) => {
    const record: Record<string, string> = {};
    for (const key of jsonColumns) {
      record[key] = cellToString(row[key]);
    }
    return record;
  });
  const columns = jsonColumns.map((name) => {
    const sampleValues = rows.slice(0, 5).map((row) => cellToString(row[name]));
    const suggestion = suggestColumnTokenization(name, sampleValues);
    return {
      name,
      suggestedTokenize: suggestion.suggestedTokenize,
      reason: suggestion.reason,
      sampleValues: sampleValues.filter(Boolean).slice(0, 2),
    };
  });
  return {
    format: "JSON",
    columns,
    previewRows,
    rowCount: rows.length,
  };
}

function tokenizeCsv(
  content: string,
  policy?: TokenizationPolicy,
): { content: string; fields: string[]; count: number } {
  const { headers, rows } = parseCsvHeadersAndRows(content);
  if (headers.length === 0) {
    return { content, fields: [], count: 0 };
  }

  const detected = new Set<string>();
  let tokenizedCount = 0;
  const output = [headers.join(",")];

  for (const row of rows) {
    const nextCells = headers.map((header, index) => {
      const result = tokenizeCell(header, row[index] ?? "", policy);
      if (result.tokenized) {
        detected.add(header);
        tokenizedCount += 1;
      }
      return result.value;
    });
    output.push(nextCells.join(","));
  }

  return {
    content: output.join("\n"),
    fields: Array.from(detected),
    count: tokenizedCount,
  };
}

function tokenizeJson(
  content: string,
  policy?: TokenizationPolicy,
): { content: string; fields: string[]; count: number } {
  try {
    const parsed = JSON.parse(content) as unknown;
    const detected = new Set<string>();
    let tokenizedCount = 0;

    const walk = (value: unknown, path: string): unknown => {
      if (typeof value === "string") {
        const column = path.split(".").pop() ?? path;
        const result = tokenizeCell(column, value, policy);
        if (result.tokenized) {
          detected.add(column);
          tokenizedCount += 1;
        }
        return result.value;
      }
      if (Array.isArray(value)) {
        return value.map((item, index) => walk(item, `${path}[${index}]`));
      }
      if (value && typeof value === "object") {
        const record: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          record[key] = walk(nested, path ? `${path}.${key}` : key);
        }
        return record;
      }
      return value;
    };

    const transformed = walk(parsed, "");
    return {
      content: `${JSON.stringify(transformed, null, 2)}\n`,
      fields: Array.from(detected),
      count: tokenizedCount,
    };
  } catch {
    return { content, fields: [], count: 0 };
  }
}

export function sealDocumentInVault(
  buffer: Buffer,
  fileName: string,
  classification = "Regulated-Financial",
): VeilioVaultResult {
  const originalSha256 = createHash("sha256").update(buffer).digest("hex");
  const vaultId = `VV-${randomBytes(6).toString("hex").toUpperCase()}`;
  const protectedName = fileName.includes(".sealed.")
    ? fileName
    : fileName.replace(/(\.[^.]+)$/, ".sealed$1");

  return {
    vaultId,
    tokenized: false,
    sealed: true,
    piiFieldsDetected: [],
    piiFieldsTokenized: 0,
    tokenizedColumnNames: [],
    classification,
    originalSha256,
    protectedSha256: originalSha256,
    buffer,
    fileName: protectedName,
  };
}

export function processThroughVeilioVault(
  buffer: Buffer,
  fileName: string,
  classification = "Regulated-Financial",
  policy?: TokenizationPolicy,
): VeilioVaultResult {
  const lower = fileName.toLowerCase();
  const isPdf = lower.endsWith(".pdf");

  if (isPdf) {
    return sealDocumentInVault(buffer, fileName, classification);
  }

  const originalSha256 = createHash("sha256").update(buffer).digest("hex");
  const vaultId = `VV-${randomBytes(6).toString("hex").toUpperCase()}`;
  const text = buffer.toString("utf8");
  const isJson = fileName.toLowerCase().endsWith(".json");
  const tokenized = isJson ? tokenizeJson(text, policy) : tokenizeCsv(text, policy);
  const protectedBuffer = Buffer.from(tokenized.content, "utf8");
  const protectedSha256 = createHash("sha256").update(protectedBuffer).digest("hex");
  const protectedName = fileName.includes(".tokenized.")
    ? fileName
    : fileName.replace(/(\.[^.]+)$/, ".tokenized$1");

  return {
    vaultId,
    tokenized: tokenized.count > 0,
    piiFieldsDetected: tokenized.fields,
    piiFieldsTokenized: tokenized.count,
    tokenizedColumnNames: tokenized.fields,
    classification,
    originalSha256,
    protectedSha256,
    buffer: protectedBuffer,
    fileName: protectedName,
  };
}
