CREATE TABLE IF NOT EXISTS banks (
  hint TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  participant TEXT NOT NULL CHECK (participant IN (
    'participant1', 'participant2', 'participant3', 'participant4', 'participant5'
  )),
  party_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_banks_hint ON banks (hint);
CREATE INDEX IF NOT EXISTS idx_banks_display_name ON banks (display_name);
CREATE INDEX IF NOT EXISTS idx_banks_hint_lower ON banks ((lower(hint)));
CREATE INDEX IF NOT EXISTS idx_banks_display_name_lower ON banks ((lower(display_name)));

CREATE TABLE IF NOT EXISTS governance_refs (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  party TEXT NOT NULL,
  participant TEXT NOT NULL,
  tx_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_refs_entity ON governance_refs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_governance_refs_contract ON governance_refs (contract_id);

CREATE TABLE IF NOT EXISTS dataset_uploads (
  id SERIAL PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  owner_hint TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  row_count BIGINT,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  replaced_at TIMESTAMPTZ,
  file_data BYTEA,
  storage_provider TEXT NOT NULL DEFAULT 'db',
  storage_bucket TEXT,
  storage_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade legacy tables created before object-storage columns were added.
ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'db';
ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE dataset_uploads ADD COLUMN IF NOT EXISTS storage_key TEXT;

CREATE INDEX IF NOT EXISTS idx_dataset_uploads_dataset ON dataset_uploads (dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dataset_uploads_storage_key ON dataset_uploads (storage_key);

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
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'network', 'direct')),
  invited_recipient_hint TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exchange_listings_owner ON exchange_listings (owner_hint);
CREATE INDEX IF NOT EXISTS idx_exchange_listings_use_case ON exchange_listings (use_case);

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
);

CREATE INDEX IF NOT EXISTS idx_file_access_logs_dataset ON file_access_logs (dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_access_logs_requester ON file_access_logs (requester_hint, created_at DESC);

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  id SERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  route_key TEXT NOT NULL,
  status_code INT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_idempotency_unique ON api_idempotency_keys (idempotency_key, route_key);
CREATE INDEX IF NOT EXISTS idx_api_idempotency_expiry ON api_idempotency_keys (expires_at);

