import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function migrate(): Promise<void> {
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");

  // Ensure object-storage columns exist before schema.sql indexes (legacy prod DBs).
  const uploadsTable = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dataset_uploads'
  `);
  if (uploadsTable.rowCount && uploadsTable.rowCount > 0) {
    await pool.query(`
      ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'db'
    `);
    await pool.query(`
      ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_bucket TEXT
    `);
    await pool.query(`
      ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_key TEXT
    `);
  }

  await pool.query(sql);
  await pool.query("DROP TABLE IF EXISTS mock_datasets");

  await pool.query(`
    ALTER TABLE banks DROP CONSTRAINT IF EXISTS banks_participant_check
  `);
  await pool.query(`
    ALTER TABLE banks ADD CONSTRAINT banks_participant_check CHECK (participant IN (
      'participant1', 'participant2', 'participant3', 'participant4', 'participant5'
    ))
  `);
  await pool.query(`
    ALTER TABLE banks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''
  `);
  await pool.query(`
    ALTER TABLE governance_refs ADD COLUMN IF NOT EXISTS tx_id TEXT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS sha256 TEXT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS row_count BIGINT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ
  `);
  await pool.query(`
    UPDATE dataset_uploads
    SET sha256 = COALESCE(sha256, '')
    WHERE sha256 IS NULL
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ALTER COLUMN sha256 SET NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exchange_listings (
      listing_id TEXT PRIMARY KEY,
      dataset_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      classification TEXT NOT NULL,
      use_case TEXT NOT NULL,
      owner_hint TEXT NOT NULL,
      default_purpose TEXT NOT NULL,
      tokenized BOOLEAN NOT NULL DEFAULT TRUE,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_exchange_listings_owner ON exchange_listings (owner_hint)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_exchange_listings_use_case ON exchange_listings (use_case)
  `);
  await pool.query(`
    ALTER TABLE exchange_listings ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
  `);
  await pool.query(`
    ALTER TABLE exchange_listings ADD COLUMN IF NOT EXISTS invited_recipient_hint TEXT
  `);
  await pool.query(`
    UPDATE exchange_listings SET visibility = 'network' WHERE visibility = 'private' AND listing_id LIKE 'LST-DS-%DEMO%'
  `);
  await pool.query(`
    UPDATE exchange_listings SET visibility = 'network'
    WHERE visibility = 'private'
      AND dataset_id IN ('DS-CUSTOMER-KYC-2026', 'DS-INVOICE-BATCH-Q2', 'DS-ACCOUNTING-FY2025')
  `);

  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS veilio_vault_id TEXT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS pii_fields_tokenized INT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS tokenized_column_names TEXT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ALTER COLUMN file_data DROP NOT NULL
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'db'
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_bucket TEXT
  `);
  await pool.query(`
    ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_key TEXT
  `);

  const specCol = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'banks' AND column_name = 'spec'
  `);
  if (specCol.rowCount && specCol.rowCount > 0) {
    await pool.query(`
      UPDATE banks SET description = COALESCE(NULLIF(description, ''), display_name)
      WHERE description = '' OR description IS NULL
    `);
    await pool.query(`ALTER TABLE banks DROP COLUMN IF EXISTS spec`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS file_access_logs (
      id SERIAL PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      requester_hint TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('preview', 'download', 'prepare_for_llm')),
      outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
      access_role TEXT,
      passport_id TEXT,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_file_access_logs_dataset ON file_access_logs (dataset_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_file_access_logs_requester ON file_access_logs (requester_hint, created_at DESC)
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'file_access_logs'
          AND constraint_name = 'file_access_logs_action_check'
      ) THEN
        ALTER TABLE file_access_logs DROP CONSTRAINT file_access_logs_action_check;
      END IF;
    END $$;
  `);
  await pool.query(`
    ALTER TABLE file_access_logs
    ADD CONSTRAINT file_access_logs_action_check
    CHECK (action IN ('preview', 'download', 'prepare_for_llm'))
  `).catch(() => {
    /* constraint may already include prepare_for_llm on fresh installs */
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_idempotency_keys (
      id SERIAL PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      route_key TEXT NOT NULL,
      status_code INT NOT NULL,
      response_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_idempotency_unique ON api_idempotency_keys (idempotency_key, route_key)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_api_idempotency_expiry ON api_idempotency_keys (expires_at)
  `);
  await pool.query(`DELETE FROM api_idempotency_keys WHERE expires_at < NOW()`);
}

export async function saveGovernanceRef(input: {
  entityType: string;
  entityId: string;
  contractId: string;
  party: string;
  participant: string;
  txId?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO governance_refs (entity_type, entity_id, contract_id, party, participant, tx_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.entityType,
      input.entityId,
      input.contractId,
      input.party,
      input.participant,
      input.txId ?? null,
    ],
  );
}

export async function getTxIdForContract(contractId: string): Promise<string | null> {
  const result = await pool.query<{ tx_id: string | null }>(
    `SELECT tx_id FROM governance_refs WHERE contract_id = $1 AND tx_id IS NOT NULL
     ORDER BY id DESC LIMIT 1`,
    [contractId],
  );
  return result.rows[0]?.tx_id ?? null;
}

export async function getLatestRef(
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const result = await pool.query<{ contract_id: string }>(
    `SELECT contract_id FROM governance_refs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY id DESC LIMIT 1`,
    [entityType, entityId],
  );
  return result.rows[0]?.contract_id ?? null;
}

export async function listBankRows(): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query("SELECT * FROM banks ORDER BY created_at ASC");
  return result.rows;
}

export async function searchBankRows(input: {
  query?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
  const query = input.query?.trim().toLowerCase();
  if (!query) {
    const [rowsResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT * FROM banks ORDER BY created_at ASC LIMIT $1 OFFSET $2`,
        [input.limit, input.offset],
      ),
      pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM banks`),
    ]);
    return {
      rows: rowsResult.rows,
      total: Number.parseInt(totalResult.rows[0]?.count ?? "0", 10),
    };
  }

  const like = `%${query}%`;
  const [rowsResult, totalResult] = await Promise.all([
    pool.query(
      `SELECT * FROM banks
       WHERE lower(hint) LIKE $1 OR lower(display_name) LIKE $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [like, input.limit, input.offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM banks
       WHERE lower(hint) LIKE $1 OR lower(display_name) LIKE $1`,
      [like],
    ),
  ]);
  return {
    rows: rowsResult.rows,
    total: Number.parseInt(totalResult.rows[0]?.count ?? "0", 10),
  };
}

export async function getBankRow(
  hint: string,
): Promise<Record<string, unknown> | null> {
  const result = await pool.query("SELECT * FROM banks WHERE hint = $1", [hint]);
  if (result.rowCount === 0) {
    return null;
  }
  return result.rows[0];
}

export async function insertBankRow(input: {
  hint: string;
  displayName: string;
  description: string;
  participant: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO banks (hint, display_name, description, participant)
     VALUES ($1, $2, $3, $4)`,
    [input.hint, input.displayName, input.description, input.participant],
  );
}

export async function updateBankPartyId(hint: string, partyId: string): Promise<void> {
  await pool.query("UPDATE banks SET party_id = $2 WHERE hint = $1", [hint, partyId]);
}

export async function deleteBankRow(hint: string): Promise<void> {
  await pool.query("DELETE FROM banks WHERE hint = $1", [hint]);
}

export async function countPartnerLocalUsage(hint: string): Promise<{
  uploads: number;
  listingsOwned: number;
  listingsInvited: number;
}> {
  const [uploads, owned, invited] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM dataset_uploads WHERE owner_hint = $1`,
      [hint],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM exchange_listings WHERE owner_hint = $1`,
      [hint],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM exchange_listings WHERE invited_recipient_hint = $1`,
      [hint],
    ),
  ]);
  return {
    uploads: Number.parseInt(uploads.rows[0]?.count ?? "0", 10),
    listingsOwned: Number.parseInt(owned.rows[0]?.count ?? "0", 10),
    listingsInvited: Number.parseInt(invited.rows[0]?.count ?? "0", 10),
  };
}

export async function insertDatasetUpload(input: {
  datasetId: string;
  ownerHint: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  rowCount: number | null;
  fileData?: Buffer;
  storageProvider?: string;
  storageBucket?: string;
  storageKey?: string;
  replaceLatest?: boolean;
  veilioVaultId?: string;
  piiFieldsTokenized?: number;
  tokenizedColumnNames?: string[];
}): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.replaceLatest) {
      await client.query(
        `UPDATE dataset_uploads
         SET is_current = FALSE, replaced_at = NOW()
         WHERE dataset_id = $1 AND is_current = TRUE`,
        [input.datasetId],
      );
    }
    const result = await client.query<{ id: number }>(
      `INSERT INTO dataset_uploads (
         dataset_id, owner_hint, file_name, mime_type, file_size, sha256, row_count,
         is_current, file_data, storage_provider, storage_bucket, storage_key,
         veilio_vault_id, pii_fields_tokenized, tokenized_column_names
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        input.datasetId,
        input.ownerHint,
        input.fileName,
        input.mimeType,
        input.fileSize,
        input.sha256,
        input.rowCount,
        input.fileData ?? null,
        input.storageProvider ?? "db",
        input.storageBucket ?? null,
        input.storageKey ?? null,
        input.veilioVaultId ?? null,
        input.piiFieldsTokenized ?? null,
        input.tokenizedColumnNames?.length
          ? JSON.stringify(input.tokenizedColumnNames)
          : null,
      ],
    );
    await client.query("COMMIT");
    return result.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listDatasetUploads(datasetId?: string): Promise<
  Array<{
    id: number;
    dataset_id: string;
    owner_hint: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    sha256: string;
    row_count: number | null;
    is_current: boolean;
    replaced_at: string | null;
    storage_provider: string;
    storage_bucket: string | null;
    storage_key: string | null;
    veilio_vault_id: string | null;
    pii_fields_tokenized: number | null;
    tokenized_column_names: string | null;
    created_at: string;
  }>
> {
  if (datasetId) {
    const result = await pool.query(
      `SELECT id, dataset_id, owner_hint, file_name, mime_type, file_size,
              sha256, row_count, is_current, replaced_at, storage_provider,
              storage_bucket, storage_key, veilio_vault_id, pii_fields_tokenized,
              tokenized_column_names, created_at
       FROM dataset_uploads
       WHERE dataset_id = $1
       ORDER BY created_at DESC`,
      [datasetId],
    );
    return result.rows;
  }
  const result = await pool.query(
    `SELECT id, dataset_id, owner_hint, file_name, mime_type, file_size,
            sha256, row_count, is_current, replaced_at, storage_provider,
            storage_bucket, storage_key, veilio_vault_id, pii_fields_tokenized,
            tokenized_column_names, created_at
     FROM dataset_uploads
     ORDER BY created_at DESC
     LIMIT 200`,
  );
  return result.rows;
}

export async function getDatasetUploadById(id: number): Promise<{
  id: number;
  dataset_id: string;
  owner_hint: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  row_count: number | null;
  is_current: boolean;
  replaced_at: string | null;
  file_data: Buffer | null;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  created_at: string;
} | null> {
  const result = await pool.query(
    `SELECT id, dataset_id, owner_hint, file_name, mime_type, file_size,
            sha256, row_count, is_current, replaced_at, file_data,
            storage_provider, storage_bucket, storage_key, created_at
     FROM dataset_uploads
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function getCurrentDatasetUpload(datasetId: string): Promise<{
  id: number;
  dataset_id: string;
  owner_hint: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  sha256: string;
  row_count: number | null;
  is_current: boolean;
  replaced_at: string | null;
  file_data: Buffer | null;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string | null;
  veilio_vault_id: string | null;
  pii_fields_tokenized: number | null;
  tokenized_column_names: string | null;
  created_at: string;
} | null> {
  const result = await pool.query(
    `SELECT id, dataset_id, owner_hint, file_name, mime_type, file_size,
            sha256, row_count, is_current, replaced_at, file_data,
            storage_provider, storage_bucket, storage_key,
            veilio_vault_id, pii_fields_tokenized, tokenized_column_names, created_at
     FROM dataset_uploads
     WHERE dataset_id = $1 AND is_current = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [datasetId],
  );
  return result.rows[0] ?? null;
}

export type ListingVisibility = "private" | "network" | "direct";

export type ExchangeListingRow = {
  listing_id: string;
  dataset_id: string;
  title: string;
  description: string;
  classification: string;
  use_case: string;
  owner_hint: string;
  default_purpose: string;
  tokenized: boolean;
  is_published: boolean;
  visibility: ListingVisibility;
  invited_recipient_hint: string | null;
  published_at: string;
  created_at: string;
};

export async function listExchangeListings(): Promise<ExchangeListingRow[]> {
  const result = await pool.query<ExchangeListingRow>(
    `SELECT * FROM exchange_listings WHERE is_published = TRUE ORDER BY published_at DESC`,
  );
  return result.rows;
}

export async function getExchangeListingById(
  listingId: string,
): Promise<ExchangeListingRow | null> {
  const result = await pool.query<ExchangeListingRow>(
    `SELECT * FROM exchange_listings WHERE listing_id = $1`,
    [listingId],
  );
  return result.rows[0] ?? null;
}

export async function getExchangeListingByDatasetId(
  datasetId: string,
): Promise<ExchangeListingRow | null> {
  const result = await pool.query<ExchangeListingRow>(
    `SELECT * FROM exchange_listings WHERE dataset_id = $1`,
    [datasetId],
  );
  return result.rows[0] ?? null;
}

export async function insertExchangeListing(input: {
  listingId: string;
  datasetId: string;
  title: string;
  description: string;
  classification: string;
  useCase: string;
  ownerHint: string;
  defaultPurpose: string;
  tokenized?: boolean;
  visibility?: ListingVisibility;
  invitedRecipientHint?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO exchange_listings (
       listing_id, dataset_id, title, description, classification,
       use_case, owner_hint, default_purpose, tokenized, visibility, invited_recipient_hint
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.listingId,
      input.datasetId,
      input.title,
      input.description,
      input.classification,
      input.useCase,
      input.ownerHint,
      input.defaultPurpose,
      input.tokenized ?? true,
      input.visibility ?? "private",
      input.invitedRecipientHint ?? null,
    ],
  );
}

export async function upsertExchangeListing(input: {
  listingId: string;
  datasetId: string;
  title: string;
  description: string;
  classification: string;
  useCase: string;
  ownerHint: string;
  defaultPurpose: string;
  tokenized?: boolean;
  visibility?: ListingVisibility;
  invitedRecipientHint?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO exchange_listings (
       listing_id, dataset_id, title, description, classification,
       use_case, owner_hint, default_purpose, tokenized, is_published, visibility,
       invited_recipient_hint, published_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, NOW())
     ON CONFLICT (dataset_id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       classification = EXCLUDED.classification,
       use_case = EXCLUDED.use_case,
       owner_hint = EXCLUDED.owner_hint,
       default_purpose = EXCLUDED.default_purpose,
       tokenized = EXCLUDED.tokenized,
       visibility = EXCLUDED.visibility,
       invited_recipient_hint = EXCLUDED.invited_recipient_hint,
       is_published = TRUE,
       published_at = NOW()`,
    [
      input.listingId,
      input.datasetId,
      input.title,
      input.description,
      input.classification,
      input.useCase,
      input.ownerHint,
      input.defaultPurpose,
      input.tokenized ?? true,
      input.visibility ?? "private",
      input.invitedRecipientHint ?? null,
    ],
  );
}

export async function deleteDatasetUploadsByDatasetId(datasetId: string): Promise<number> {
  const result = await pool.query(
    `DELETE FROM dataset_uploads WHERE dataset_id = $1`,
    [datasetId],
  );
  return result.rowCount ?? 0;
}

export async function deleteExchangeListingByDatasetId(datasetId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM exchange_listings WHERE dataset_id = $1`, [
    datasetId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function clearAllExchangeListings(): Promise<number> {
  const result = await pool.query(`DELETE FROM exchange_listings`);
  return result.rowCount ?? 0;
}

export async function getIdempotencyResponse(
  idempotencyKey: string,
  routeKey: string,
): Promise<{ statusCode: number; responseJson: unknown } | null> {
  const result = await pool.query<{ status_code: number; response_json: unknown }>(
    `SELECT status_code, response_json
     FROM api_idempotency_keys
     WHERE idempotency_key = $1 AND route_key = $2 AND expires_at > NOW()
     LIMIT 1`,
    [idempotencyKey, routeKey],
  );
  if (result.rowCount === 0) {
    return null;
  }
  return {
    statusCode: result.rows[0].status_code,
    responseJson: result.rows[0].response_json,
  };
}

export async function saveIdempotencyResponse(input: {
  idempotencyKey: string;
  routeKey: string;
  statusCode: number;
  responseJson: unknown;
}): Promise<void> {
  await pool.query(
    `INSERT INTO api_idempotency_keys (
       idempotency_key, route_key, status_code, response_json, expires_at
     )
     VALUES ($1, $2, $3, $4::jsonb, NOW() + ($5 || ' seconds')::interval)
     ON CONFLICT (idempotency_key, route_key) DO UPDATE SET
       status_code = EXCLUDED.status_code,
       response_json = EXCLUDED.response_json,
       expires_at = EXCLUDED.expires_at`,
    [
      input.idempotencyKey,
      input.routeKey,
      input.statusCode,
      JSON.stringify(input.responseJson ?? null),
      String(config.security.idempotencyTtlSeconds),
    ],
  );
}
