import { pool } from "../db/index.js";

export type FileAccessAction = "preview" | "download" | "prepare_for_llm";
export type FileAccessOutcome = "allowed" | "denied";

export type FileAccessLogRow = {
  id: number;
  datasetId: string;
  requesterHint: string;
  action: FileAccessAction;
  outcome: FileAccessOutcome;
  accessRole: string | null;
  passportId: string | null;
  reason: string | null;
  createdAt: string;
};

export async function logFileAccess(input: {
  datasetId: string;
  requesterHint: string;
  action: FileAccessAction;
  outcome: FileAccessOutcome;
  accessRole?: string;
  passportId?: string;
  reason?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO file_access_logs (
      dataset_id, requester_hint, action, outcome, access_role, passport_id, reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.datasetId,
      input.requesterHint,
      input.action,
      input.outcome,
      input.accessRole ?? null,
      input.passportId ?? null,
      input.reason ?? null,
    ],
  );
}

export async function listFileAccessLogs(
  limit = 200,
  offset = 0,
): Promise<FileAccessLogRow[]> {
  const result = await pool.query<{
    id: number;
    dataset_id: string;
    requester_hint: string;
    action: FileAccessAction;
    outcome: FileAccessOutcome;
    access_role: string | null;
    passport_id: string | null;
    reason: string | null;
    created_at: Date;
  }>(
    `SELECT id, dataset_id, requester_hint, action, outcome, access_role, passport_id, reason, created_at
     FROM file_access_logs
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [Math.min(Math.max(limit, 1), 1000), Math.max(offset, 0)],
  );

  return result.rows.map((row) => ({
    id: row.id,
    datasetId: row.dataset_id,
    requesterHint: row.requester_hint,
    action: row.action,
    outcome: row.outcome,
    accessRole: row.access_role,
    passportId: row.passport_id,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  }));
}
