CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  client_intent_key TEXT NOT NULL UNIQUE,
  parameter_fingerprint TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  settlement_asset TEXT NOT NULL CHECK (settlement_asset IN ('fiat', 'xsgd')),
  origin TEXT NOT NULL CHECK (origin IN ('buyer', 'agent')),
  rail TEXT NOT NULL CHECK (rail IN ('stripe', 'straitsx')),
  selection_reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'queued_offline',
      'pending_provider',
      'paid',
      'no_payment_required',
      'failed',
      'expired',
      'cancelled',
      'reconciliation_unresolved',
      'provider_outcome_unknown',
      'refunded'
    )
  ),
  provider_object_id TEXT,
  provider_request_id TEXT,
  provider_instruction_json TEXT,
  provider_error_json TEXT,
  refund_reference TEXT,
  reconciliation_attempts INTEGER NOT NULL DEFAULT 0 CHECK (reconciliation_attempts >= 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  terminal_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_state_updated
  ON payment_intents(state, updated_at);

CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_object
  ON payment_intents(rail, provider_object_id);

CREATE TABLE IF NOT EXISTS payment_provider_events (
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'straitsx')),
  event_id TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  raw_body_hash TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (
    processing_status IN ('processing', 'processed', 'failed')
  ),
  processing_error TEXT,
  claim_token TEXT,
  claim_expires_at TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  CHECK (
    processing_status != 'processing'
    OR (claim_token IS NOT NULL AND claim_expires_at IS NOT NULL)
  ),
  PRIMARY KEY (provider, event_id),
  UNIQUE (provider, semantic_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_status_expiry
  ON payment_provider_events(processing_status, claim_expires_at);

CREATE TABLE IF NOT EXISTS payment_cost_entries (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('stripe', 'straitsx')),
  operation TEXT NOT NULL,
  provider_request_id TEXT,
  outcome TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  model_call_count INTEGER NOT NULL DEFAULT 0 CHECK (model_call_count = 0),
  model_cost_usd REAL NOT NULL DEFAULT 0 CHECK (model_cost_usd = 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_cost_entries_intent_created
  ON payment_cost_entries(intent_id, created_at);
