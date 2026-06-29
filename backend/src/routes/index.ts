import { Router } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import type { RequestHandler } from "express";
import { PARTICIPANT_KEYS, config } from "../config.js";
import { z } from "zod";
import {
  getDatasetUploadById,
  insertDatasetUpload,
  listDatasetUploads,
} from "../db/index.js";
import * as governance from "../services/governance.js";
import * as passports from "../services/passports.js";
import * as catalog from "../services/catalog.js";
import * as demo from "../services/demo.js";
import * as datasets from "../services/datasets.js";
import * as datasetAccess from "../services/dataset-access.js";
import { AccessDeniedError, UnsupportedDatasetFormatError } from "../services/dataset-access.js";
import * as fileAccessAudit from "../services/file-access-audit.js";
import * as complianceExport from "../services/compliance-export.js";
import { listParties } from "../services/party-cache.js";
import { authMiddleware, hintForRequest, requireRole } from "../auth.js";
import { devTokenRouter } from "../auth/dev-token.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { getObject, putObject, resolveSignedDownloadToken } from "../services/object-storage.js";
import { readFile } from "node:fs/promises";
import { livenessProbe, readinessProbe } from "../services/health.js";
import { publishWebhook } from "../services/webhooks.js";
import {
  createBank,
  deleteBank,
  allocateBankParty,
  listBanks,
  searchBanks,
} from "../services/parties.js";
import {
  ensurePartyRegistryReady,
  invalidatePartyRegistryWarm,
} from "../services/party-registry.js";
import { logger } from "../observability.js";

export const apiRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const requirePartner: RequestHandler[] = [authMiddleware, requireRole(["admin", "partner"])];
const requireAdmin: RequestHandler[] = [authMiddleware, requireRole(["admin"])];
const requireDemoSeed: RequestHandler[] = config.security.devTokenMint
  ? [authMiddleware, requireRole(["admin", "partner"])]
  : requireAdmin;

apiRouter.use(idempotencyMiddleware);

function rowCountFromCsv(content: string): number {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    return 0;
  }
  return lines.length - 1;
}

function rowCountFromJson(content: string): number | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
    if (parsed && typeof parsed === "object") {
      return 1;
    }
    return 0;
  } catch {
    return null;
  }
}

apiRouter.get("/health", async (_req, res, next) => {
  try {
    const ready = await readinessProbe();
    res.status(ready.status === "ok" ? 200 : 503).json(ready);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/health/live", async (_req, res, next) => {
  try {
    res.json(await livenessProbe());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/health/ready", async (_req, res, next) => {
  try {
    const ready = await readinessProbe();
    res.status(ready.status === "ok" ? 200 : 503).json(ready);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/auth/token", devTokenRouter());
apiRouter.get("/auth/token", devTokenRouter());

apiRouter.use(async (req, res, next) => {
  if (
    req.path === "/health" ||
    req.path === "/health/live" ||
    req.path === "/health/ready" ||
    req.path.startsWith("/auth/")
  ) {
    return next();
  }
  try {
    await ensurePartyRegistryReady(3, 2000);
  } catch (error) {
    logger.warn(
      { err: error },
      "Party registry not ready; serving degraded API responses",
    );
  }
  next();
});

apiRouter.get("/canton/bootstrap", async (_req, res, next) => {
  try {
    const cantonScanBaseUrl =
      process.env.CANTONSCAN_BASE_URL ?? "https://www.cantonscan.com";
    const metadataPath =
      process.env.CANTON_BOOTSTRAP_METADATA_FILE ?? "/shared/bootstrap-metadata.json";

    const audit = await governance.listAuditTrail();
    const recentUpdateIds = audit
      .map((event) => String((event as Record<string, unknown>).txId ?? ""))
      .filter((txId) => txId.length > 0 && !txId.startsWith("00"))
      .filter((txId, index, rows) => rows.indexOf(txId) === index)
      .slice(-5)
      .reverse();

    try {
      const raw = await readFile(metadataPath, "utf8");
      const metadata = JSON.parse(raw) as Record<string, unknown>;
      res.json({
        ...metadata,
        cantonScanBaseUrl: metadata.cantonScanBaseUrl ?? cantonScanBaseUrl,
        recentUpdateIds,
      });
      return;
    } catch {
      res.json({
        mode: process.env.CANTON_MODE ?? "local",
        status: "embedded-local",
        cantonScanBaseUrl,
        recentUpdateIds,
      });
    }
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/parties", (_req, res) => {
  res.json(listParties());
});

apiRouter.get("/banks", async (_req, res, next) => {
  try {
    res.json(await listBanks());
  } catch (error) {
    next(error);
  }
});

const searchBanksSchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

apiRouter.get("/banks/search", async (req, res, next) => {
  try {
    const parsed = searchBanksSchema.parse(req.query);
    res.json(await searchBanks(parsed));
  } catch (error) {
    next(error);
  }
});

const createBankSchema = z.object({
  hint: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional().default(""),
  participant: z.enum(PARTICIPANT_KEYS),
});

function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

apiRouter.post("/banks", ...requireAdmin, async (req, res, next) => {
  try {
    const body = createBankSchema.parse(req.body);
    const bank = await createBank(body);
    res.status(201).json(bank);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: zodErrorMessage(error) });
      return;
    }
    next(error);
  }
});

apiRouter.post("/banks/:hint/allocate", async (req, res, next) => {
  try {
    const bank = await allocateBankParty(req.params.hint);
    res.json(bank);
  } catch (error) {
    next(error);
  }
});

apiRouter.delete("/banks/:hint", async (req, res, next) => {
  try {
    await deleteBank(req.params.hint);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/datasets", async (req, res, next) => {
  try {
    const limit =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 200;
    const offset =
      typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const rows = await governance.listLedgerDatasets();
    const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 200, 1), 1000);
    const boundedOffset = Math.max(Number.isFinite(offset) ? offset : 0, 0);
    res.json({
      items: rows.slice(boundedOffset, boundedOffset + boundedLimit),
      total: rows.length,
      limit: boundedLimit,
      offset: boundedOffset,
    });
  } catch (error) {
    next(error);
  }
});

const registerSchema = z.object({
  datasetId: z.string().min(1),
  ownerHint: z.string().min(1),
  description: z.string().min(1),
  classification: z.string().min(1),
  dataFormat: z.enum(["CSV", "JSON", "PDF"]).optional(),
  title: z.string().optional(),
});

apiRouter.post("/datasets/register", ...requirePartner, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const result = await governance.registerDataset(body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/datasets/analyze", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    res.json(datasets.analyzeDatasetFile(file));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/datasets/deposit", ...requirePartner, upload.single("file"), async (req, res, next) => {
  try {
    const ownerHint = hintForRequest(
      req,
      typeof req.body?.ownerHint === "string" ? req.body.ownerHint.trim() : "",
    );
    if (!ownerHint) {
      res.status(400).json({ error: "ownerHint is required" });
      return;
    }
    const banks = await listBanks();
    if (!banks.some((bank) => bank.hint === ownerHint)) {
      res.status(400).json({ error: `Unknown ownerHint: ${ownerHint}` });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const datasetId =
      typeof req.body?.datasetId === "string" ? req.body.datasetId.trim() : undefined;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : undefined;
    const description =
      typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
    const classification =
      typeof req.body?.classification === "string" ? req.body.classification.trim() : undefined;
    const shareScope =
      typeof req.body?.shareScope === "string" ? req.body.shareScope.trim() : "private";
    const invitedRecipientHint =
      typeof req.body?.invitedRecipientHint === "string"
        ? req.body.invitedRecipientHint.trim()
        : undefined;
    const sharePurpose =
      typeof req.body?.sharePurpose === "string" ? req.body.sharePurpose.trim() : undefined;
    const replaceLatest =
      String(req.body?.replaceLatest ?? "").toLowerCase() === "true";

    let tokenizeColumns: Record<string, boolean> | undefined;
    if (typeof req.body?.tokenizeColumns === "string" && req.body.tokenizeColumns.trim()) {
      try {
        const parsed = JSON.parse(req.body.tokenizeColumns) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          tokenizeColumns = parsed as Record<string, boolean>;
        }
      } catch {
        res.status(400).json({ error: "tokenizeColumns must be valid JSON" });
        return;
      }
    }

    const result = await datasets.depositDataset({
      ownerHint,
      file,
      datasetId: datasetId || undefined,
      title,
      description,
      classification,
      replaceLatest,
      shareScope:
        shareScope === "network" || shareScope === "direct" ? shareScope : "private",
      invitedRecipientHint,
      sharePurpose,
      tokenizeColumns,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

const shareDatasetSchema = z.object({
  ownerHint: z.string().min(1),
  recipientHint: z.string().min(1),
  purpose: z.string().min(1),
  expirationDays: z.number().int().positive().optional(),
});

apiRouter.post("/datasets/:datasetId/share", ...requirePartner, async (req, res, next) => {
  try {
    const body = shareDatasetSchema.parse(req.body);
    res.status(201).json(
      await datasets.shareDatasetExternally({
        datasetId: req.params.datasetId,
        ...body,
      }),
    );
  } catch (error) {
    next(error);
  }
});

const deleteDatasetSchema = z.object({
  ownerHint: z.string().min(1),
});

apiRouter.delete("/datasets/:datasetId", ...requirePartner, async (req, res, next) => {
  try {
    const body = deleteDatasetSchema.parse(req.body);
    res.json(
      await datasets.deleteDataset({
        datasetId: req.params.datasetId,
        ownerHint: body.ownerHint,
      }),
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/datasets/:datasetId/preview", ...requirePartner, async (req, res, next) => {
  try {
    const requesterHint = hintForRequest(
      req,
      typeof req.query.requesterHint === "string" ? req.query.requesterHint.trim() : "",
    );
    const maxRows =
      typeof req.query.maxRows === "string" ? Number.parseInt(req.query.maxRows, 10) : undefined;
    const datasetId = req.params.datasetId;
    try {
      const result = await datasetAccess.previewDatasetFile({
        datasetId,
        requesterHint,
        maxRows: Number.isFinite(maxRows) ? maxRows : undefined,
      });
      await fileAccessAudit.logFileAccess({
        datasetId,
        requesterHint,
        action: "preview",
        outcome: "allowed",
        accessRole: result.accessRole,
        passportId: result.passportId,
      });
      await publishWebhook("dataset.preview.allowed", {
        datasetId,
        requesterHint,
        passportId: result.passportId,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        await fileAccessAudit.logFileAccess({
          datasetId,
          requesterHint,
          action: "preview",
          outcome: "denied",
          reason: error.message,
        });
        await publishWebhook("dataset.preview.denied", {
          datasetId,
          requesterHint,
          reason: error.message,
        });
        res.status(403).json({ error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/datasets/:datasetId/download", ...requirePartner, async (req, res, next) => {
  try {
    const requesterHint = hintForRequest(
      req,
      typeof req.query.requesterHint === "string" ? req.query.requesterHint.trim() : "",
    );
    const datasetId = req.params.datasetId;
    try {
      const result = await datasetAccess.downloadDatasetFile({
        datasetId,
        requesterHint,
      });
      await fileAccessAudit.logFileAccess({
        datasetId,
        requesterHint,
        action: "download",
        outcome: "allowed",
        accessRole: result.accessRole,
        passportId: result.passportId,
      });
      await publishWebhook("dataset.download.allowed", {
        datasetId,
        requesterHint,
        passportId: result.passportId,
      });
      if (result.downloadUrl) {
        res.json({
          datasetId,
          fileName: result.upload.file_name,
          mimeType: result.upload.mime_type,
          fileSize: Number(result.upload.file_size),
          sha256: result.upload.sha256,
          accessRole: result.accessRole,
          passportId: result.passportId,
          downloadUrl: result.downloadUrl,
        });
        return;
      }
      res.setHeader("Content-Type", result.upload.mime_type || "application/octet-stream");
      res.setHeader("Content-Length", String(result.upload.file_size));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.upload.file_name}"`,
      );
      res.send(result.upload.file_data);
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        await fileAccessAudit.logFileAccess({
          datasetId,
          requesterHint,
          action: "download",
          outcome: "denied",
          reason: error.message,
        });
        await publishWebhook("dataset.download.denied", {
          datasetId,
          requesterHint,
          reason: error.message,
        });
        res.status(403).json({ error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/datasets/:datasetId/prepare-for-llm", ...requirePartner, async (req, res, next) => {
  try {
    const requesterHint = hintForRequest(
      req,
      typeof req.body?.requesterHint === "string" ? req.body.requesterHint.trim() : "",
    );
    const maxPreviewRows =
      typeof req.body?.maxPreviewRows === "number"
        ? req.body.maxPreviewRows
        : typeof req.body?.maxPreviewRows === "string"
          ? Number.parseInt(req.body.maxPreviewRows, 10)
          : undefined;
    const llmProvider =
      typeof req.body?.llmProvider === "string" ? req.body.llmProvider.trim() : "";
    const datasetId = req.params.datasetId;
    const auditReason = llmProvider ? `llmProvider:${llmProvider}` : undefined;

    try {
      const result = await datasetAccess.prepareDatasetForLlm({
        datasetId,
        requesterHint,
        maxPreviewRows: Number.isFinite(maxPreviewRows) ? maxPreviewRows : undefined,
      });
      await fileAccessAudit.logFileAccess({
        datasetId,
        requesterHint,
        action: "prepare_for_llm",
        outcome: "allowed",
        accessRole: result.accessRole,
        passportId: result.passportId,
        reason: auditReason,
      });
      await publishWebhook("dataset.llm_prepare.allowed", {
        datasetId,
        requesterHint,
        passportId: result.passportId,
        llmProvider: llmProvider || undefined,
        format: result.format,
        rowCount: result.rowCount,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        await fileAccessAudit.logFileAccess({
          datasetId,
          requesterHint,
          action: "prepare_for_llm",
          outcome: "denied",
          reason: error.message,
        });
        await publishWebhook("dataset.llm_prepare.denied", {
          datasetId,
          requesterHint,
          reason: error.message,
        });
        res.status(403).json({ error: error.message });
        return;
      }
      if (error instanceof UnsupportedDatasetFormatError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/datasets/uploads", async (req, res, next) => {
  try {
    const datasetId =
      typeof req.query.datasetId === "string" ? req.query.datasetId.trim() : undefined;
    const limit =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 200;
    const offset =
      typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 200, 1), 1000);
    const boundedOffset = Math.max(Number.isFinite(offset) ? offset : 0, 0);
    const rows = await listDatasetUploads(datasetId || undefined);
    const page = rows.slice(boundedOffset, boundedOffset + boundedLimit);
    res.json(
      page.map((row) => ({
        id: row.id,
        datasetId: row.dataset_id,
        ownerHint: row.owner_hint,
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSize: Number(row.file_size),
        sha256: row.sha256,
        rowCount: row.row_count == null ? null : Number(row.row_count),
        isCurrent: row.is_current,
        replacedAt: row.replaced_at,
        storageProvider: row.storage_provider,
        storageBucket: row.storage_bucket,
        storageKey: row.storage_key,
        veilioVaultId: row.veilio_vault_id ?? undefined,
        piiFieldsTokenized:
          row.pii_fields_tokenized == null ? null : Number(row.pii_fields_tokenized),
        tokenizedColumnNames: (() => {
          if (typeof row.tokenized_column_names !== "string" || !row.tokenized_column_names.trim()) {
            return undefined;
          }
          try {
            const parsed = JSON.parse(row.tokenized_column_names) as unknown;
            if (!Array.isArray(parsed)) return undefined;
            return parsed.filter((item): item is string => typeof item === "string");
          } catch {
            return undefined;
          }
        })(),
        createdAt: row.created_at,
      })),
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/datasets/uploads/:uploadId/download", ...requirePartner, async (req, res, next) => {
  try {
    const uploadId = Number.parseInt(req.params.uploadId, 10);
    if (!Number.isFinite(uploadId) || uploadId <= 0) {
      res.status(400).json({ error: "Invalid uploadId" });
      return;
    }
    const requesterHint = hintForRequest(
      req,
      typeof req.query.requesterHint === "string" ? req.query.requesterHint.trim() : "",
    );
    const row = await getDatasetUploadById(uploadId);
    if (!row) {
      res.status(404).json({ error: `Upload not found: ${req.params.uploadId}` });
      return;
    }
    const result = await datasetAccess.downloadDatasetFile({
      datasetId: row.dataset_id,
      requesterHint,
    });
    if (result.downloadUrl) {
      res.json({
        uploadId,
        datasetId: row.dataset_id,
        fileName: result.upload.file_name,
        mimeType: result.upload.mime_type,
        fileSize: Number(result.upload.file_size),
        downloadUrl: result.downloadUrl,
      });
      return;
    }
    if (!result.upload.file_data) {
      res.status(404).json({ error: "Upload payload unavailable" });
      return;
    }
    res.setHeader("Content-Type", result.upload.mime_type || "application/octet-stream");
    res.setHeader("Content-Length", String(result.upload.file_size));
    res.setHeader("Content-Disposition", `attachment; filename="${result.upload.file_name}"`);
    res.send(result.upload.file_data);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      res.status(403).json({ error: error.message });
      return;
    }
    next(error);
  }
});

apiRouter.get("/storage/download/:token", ...requirePartner, async (req, res, next) => {
  try {
    const objectKey = resolveSignedDownloadToken(req.params.token);
    const payload = await getObject(objectKey);
    const fileName = objectKey.split("/").at(-1) ?? "dataset.bin";
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(payload.length));
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(payload);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/datasets/upload", ...requirePartner, upload.single("file"), async (req, res, next) => {
  try {
    const datasetId = typeof req.body?.datasetId === "string" ? req.body.datasetId.trim() : "";
    const ownerHint = hintForRequest(
      req,
      typeof req.body?.ownerHint === "string" ? req.body.ownerHint.trim() : "",
    );
    const replaceLatest =
      String(req.body?.replaceLatest ?? "").toLowerCase() === "true";
    if (!datasetId || !ownerHint) {
      res.status(400).json({ error: "datasetId and ownerHint are required" });
      return;
    }
    const banks = await listBanks();
    if (!banks.some((bank) => bank.hint === ownerHint)) {
      res.status(400).json({ error: `Unknown ownerHint: ${ownerHint}` });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const ext = file.originalname.split(".").at(-1)?.toLowerCase();
    const allowedByExt = ext === "csv" || ext === "json" || ext === "pdf";
    const mime = file.mimetype.toLowerCase();
    const allowedByMime =
      mime.includes("csv") ||
      mime.includes("json") ||
      mime.includes("pdf") ||
      mime === "application/octet-stream";
    if (!allowedByExt && !allowedByMime) {
      res.status(400).json({ error: "Only CSV, JSON, or PDF files are supported" });
      return;
    }
    const isPdf = ext === "pdf" || mime.includes("pdf");
    const payloadText = isPdf ? "" : file.buffer.toString("utf8");
    const rowCount = isPdf
      ? null
      : ext === "json" || mime.includes("json")
        ? rowCountFromJson(payloadText)
        : rowCountFromCsv(payloadText);
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const objectRef = await putObject(
      `${ownerHint}/${datasetId}/${Date.now().toString(36)}-${file.originalname}`,
      file.buffer,
    );
    const uploadId = await insertDatasetUpload({
      datasetId,
      ownerHint,
      fileName: file.originalname,
      mimeType: isPdf ? "application/pdf" : file.mimetype || "application/octet-stream",
      fileSize: file.size,
      sha256,
      rowCount,
      fileData: undefined,
      storageProvider: objectRef.provider,
      storageBucket: objectRef.bucket,
      storageKey: objectRef.objectKey,
      replaceLatest,
    });
    res.status(201).json({
      uploadId,
      datasetId,
      ownerHint,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: isPdf ? "application/pdf" : file.mimetype || "application/octet-stream",
      sha256,
      rowCount,
      replacedPrevious: replaceLatest,
    });
  } catch (error) {
    next(error);
  }
});

const proposeSchema = z.object({
  datasetId: z.string().min(1),
  agreementId: z.string().min(1),
  recipientHint: z.string().min(1),
  purpose: z.string().min(1),
  expirationDays: z.number().int().positive().optional(),
});

apiRouter.post("/sharing/propose", ...requirePartner, async (req, res, next) => {
  try {
    const body = proposeSchema.parse(req.body);
    const result = await governance.proposeSharing(body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/sharing/:agreementId/accept", ...requirePartner, async (req, res, next) => {
  try {
    const result = await governance.acceptSharing(req.params.agreementId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const rejectSharingSchema = z.object({
  reason: z.string().min(1),
});

apiRouter.post("/sharing/:agreementId/reject", ...requirePartner, async (req, res, next) => {
  try {
    const body = rejectSharingSchema.parse(req.body);
    const result = await governance.rejectSharing(req.params.agreementId, body.reason);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/sharing", async (_req, res, next) => {
  try {
    const [agreements, proposals] = await Promise.all([
      governance.listSharingAgreements(),
      governance.listSharingProposals(),
    ]);
    res.json({ agreements, proposals });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/passports", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const useCase = typeof req.query.useCase === "string" ? req.query.useCase : undefined;
    const ownerHint =
      typeof req.query.ownerHint === "string" ? req.query.ownerHint : undefined;
    const limit =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 200;
    const offset =
      typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const rows = await passports.listAccessPassports({ status, useCase, ownerHint });
    const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 200, 1), 1000);
    const boundedOffset = Math.max(Number.isFinite(offset) ? offset : 0, 0);
    res.json({
      items: rows.slice(boundedOffset, boundedOffset + boundedLimit),
      total: rows.length,
      limit: boundedLimit,
      offset: boundedOffset,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/passports/:passportId", async (req, res, next) => {
  try {
    const row = await passports.getAccessPassportById(req.params.passportId);
    if (!row) {
      res.status(404).json({ error: `Passport not found: ${req.params.passportId}` });
      return;
    }
    res.json(row);
  } catch (error) {
    next(error);
  }
});

const renewPassportSchema = z.object({
  newPermissionId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

apiRouter.post("/passports/:passportId/renew", ...requirePartner, async (req, res, next) => {
  try {
    const body = renewPassportSchema.parse(req.body ?? {});
    res.status(201).json(
      await governance.renewAccessPassport({
        permissionId: req.params.passportId,
        newPermissionId: body.newPermissionId,
        reason: body.reason,
      }),
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/exchange/summary", async (_req, res, next) => {
  try {
    res.json(await passports.getExchangeSummary());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/exchange/owner-exposure", async (req, res, next) => {
  try {
    const ownerHint =
      typeof req.query.ownerHint === "string" ? req.query.ownerHint.trim() : "";
    if (!ownerHint) {
      res.status(400).json({ error: "ownerHint query parameter is required" });
      return;
    }
    res.json(await passports.getOwnerExposure(ownerHint));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/catalog", async (req, res, next) => {
  try {
    const viewerHint =
      typeof req.query.viewerHint === "string" ? req.query.viewerHint : undefined;
    const useCase = typeof req.query.useCase === "string" ? req.query.useCase : undefined;
    let rows = await catalog.listCatalog(viewerHint);
    if (useCase) {
      rows = rows.filter(
        (row) => row.useCase.toLowerCase() === useCase.toLowerCase(),
      );
    }
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

const publishCatalogSchema = z.object({
  datasetId: z.string().min(1),
  ownerHint: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  classification: z.string().min(1),
  useCase: z.enum(["KYC", "TradeFinance", "Audit", "AI", "Healthcare", "General"]),
  defaultPurpose: z.string().min(1),
  tokenized: z.boolean().optional(),
});

apiRouter.post("/catalog/publish", ...requirePartner, async (req, res, next) => {
  try {
    const body = publishCatalogSchema.parse(req.body);
    res.status(201).json(await catalog.publishListing(body));
  } catch (error) {
    next(error);
  }
});

const requestAccessSchema = z.object({
  requesterHint: z.string().min(1),
  purpose: z.string().optional(),
  expirationDays: z.number().int().positive().optional(),
});

apiRouter.post("/catalog/:listingId/request", ...requirePartner, async (req, res, next) => {
  try {
    const body = requestAccessSchema.parse(req.body);
    res.status(201).json(
      await catalog.requestAccess({
        listingId: req.params.listingId,
        ...body,
      }),
    );
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/demo/seed", ...requireDemoSeed, async (_req, res, next) => {
  try {
    res.json(await demo.seedDemoNetwork());
  } catch (error) {
    next(error);
  }
});

const issueSchema = z.object({
  agreementId: z.string().min(1),
  permissionId: z.string().min(1),
  accessRights: z.string().optional(),
  accessScope: z.enum(["ReadOnly", "Analytics", "FullAccess"]).optional(),
});

apiRouter.post("/permissions/issue", ...requirePartner, async (req, res, next) => {
  try {
    const body = issueSchema.parse(req.body);
    const result = await governance.issuePermission(body);
    await publishWebhook("permission.issued", result as Record<string, unknown>);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

const consentSchema = z.object({
  permissionId: z.string().min(1),
  consentId: z.string().min(1),
});

apiRouter.post("/permissions/consent", ...requirePartner, async (req, res, next) => {
  try {
    const body = consentSchema.parse(req.body);
    const result = await governance.recordConsent(body);
    await publishWebhook("permission.consented", result as Record<string, unknown>);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/permissions", ...requirePartner, async (_req, res, next) => {
  try {
    res.json(await governance.listPermissions());
  } catch (error) {
    next(error);
  }
});

const denySchema = z.object({
  permissionId: z.string().min(1),
  consentId: z.string().min(1),
  reason: z.string().min(1),
});

apiRouter.post("/permissions/deny", ...requirePartner, async (req, res, next) => {
  try {
    const body = denySchema.parse(req.body);
    res.json(await governance.denyConsent(body));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/permissions/:permissionId/check-expiration", ...requirePartner, async (req, res, next) => {
  try {
    res.json(await governance.checkPermissionExpiration(req.params.permissionId));
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/permissions/sweep-expiration", ...requireAdmin, async (_req, res, next) => {
  try {
    res.json(await governance.sweepExpiredPermissions());
  } catch (error) {
    next(error);
  }
});

const revokeSchema = z.object({
  permissionId: z.string().min(1),
  revocationId: z.string().min(1),
  reason: z.string().min(1),
});

apiRouter.post("/permissions/revoke", ...requirePartner, async (req, res, next) => {
  try {
    const body = revokeSchema.parse(req.body);
    const result = await governance.revokePermission(body);
    await publishWebhook("permission.revoked", result as Record<string, unknown>);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const withdrawSchema = z.object({
  consentId: z.string().min(1),
  reason: z.string().min(1),
});

apiRouter.post("/consents/withdraw", ...requirePartner, async (req, res, next) => {
  try {
    const body = withdrawSchema.parse(req.body);
    res.json(await governance.withdrawConsent(body));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/consents", ...requirePartner, async (_req, res, next) => {
  try {
    res.json(await governance.listConsents());
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/revocations", ...requirePartner, async (_req, res, next) => {
  try {
    res.json(await governance.listRevocations());
  } catch (error) {
    next(error);
  }
});

const revokeAgreementSchema = z.object({
  reason: z.string().min(1),
});

apiRouter.post("/sharing/:agreementId/revoke", ...requirePartner, async (req, res, next) => {
  try {
    const body = revokeAgreementSchema.parse(req.body);
    const result = await governance.revokeAgreement({
      agreementId: req.params.agreementId,
      reason: body.reason,
    });
    await publishWebhook("sharing.revoked", result as Record<string, unknown>);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/audit", ...requireAdmin, async (req, res, next) => {
  try {
    const limit =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 200;
    const offset =
      typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const rows = await governance.listAuditTrail();
    const boundedLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 200, 1), 1000);
    const boundedOffset = Math.max(Number.isFinite(offset) ? offset : 0, 0);
    res.json({
      items: rows.slice(boundedOffset, boundedOffset + boundedLimit),
      total: rows.length,
      limit: boundedLimit,
      offset: boundedOffset,
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/audit/file-access", ...requireAdmin, async (req, res, next) => {
  try {
    const limit =
      typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 200;
    const offset =
      typeof req.query.offset === "string" ? Number.parseInt(req.query.offset, 10) : 0;
    const boundedLimit = Number.isFinite(limit) ? limit : 200;
    const boundedOffset = Number.isFinite(offset) ? offset : 0;
    res.json(await fileAccessAudit.listFileAccessLogs(boundedLimit, boundedOffset));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/compliance/export-pack", ...requireAdmin, async (_req, res, next) => {
  try {
    const pack = await complianceExport.buildComplianceExportPack();
    const filename = `veilio-exchange-compliance-${pack.generatedAt.slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(pack);
  } catch (error) {
    next(error);
  }
});

export async function warmPartyRegistry(): Promise<void> {
  await ensurePartyRegistryReady();
}
