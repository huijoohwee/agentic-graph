CREATE TABLE IF NOT EXISTS payment_chain_evidence_observations (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  chain_id INTEGER NOT NULL CHECK (chain_id = 43114),
  token_contract TEXT NOT NULL,
  watched_address_digest TEXT NOT NULL,
  transaction_hash TEXT,
  transfer_block_number INTEGER CHECK (transfer_block_number >= 0),
  observation_block_height INTEGER NOT NULL CHECK (observation_block_height >= 0),
  balance_base_units TEXT NOT NULL,
  evidence_state TEXT NOT NULL CHECK (
    evidence_state IN (
      'chain_unobserved',
      'chain_pending',
      'chain_confirmed',
      'chain_disagreement',
      'chain_verification_unresolved'
    )
  ),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  observed_at TEXT NOT NULL,
  UNIQUE (lifecycle_id, semantic_key),
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE INDEX IF NOT EXISTS idx_chain_evidence_obs_lifecycle_height
  ON payment_chain_evidence_observations(lifecycle_id, observation_block_height);

CREATE TABLE IF NOT EXISTS payment_chain_confirmed_funding (
  lifecycle_id TEXT PRIMARY KEY,
  chain_id INTEGER NOT NULL CHECK (chain_id = 43114),
  token_contract TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  transfer_block_number INTEGER NOT NULL CHECK (transfer_block_number >= 0),
  observation_block_height INTEGER NOT NULL CHECK (observation_block_height >= 0),
  highest_indexed_height INTEGER NOT NULL CHECK (highest_indexed_height >= 0),
  value_base_units TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  UNIQUE (chain_id, token_contract, transaction_hash),
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE TABLE IF NOT EXISTS payment_chain_disagreements (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL,
  semantic_key TEXT NOT NULL,
  disagreement_class TEXT NOT NULL CHECK (
    disagreement_class IN (
      'provider_hold',
      'provider_status_conflict',
      'chain_amount_under_credit',
      'chain_amount_over_credit',
      'provider_credit_missing',
      'chain_evidence_missing'
    )
  ),
  observation_block_height INTEGER NOT NULL CHECK (observation_block_height >= 0),
  chain_value_base_units TEXT,
  provider_credit_base_units TEXT,
  transaction_hash TEXT,
  provider_credit_ref TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (lifecycle_id, semantic_key),
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE TABLE IF NOT EXISTS payment_chain_cost_entries (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  attempt_index INTEGER NOT NULL CHECK (attempt_index >= 1),
  chain_id INTEGER NOT NULL,
  status_class TEXT,
  elapsed_ms INTEGER CHECK (elapsed_ms >= 0),
  response_bytes INTEGER CHECK (response_bytes >= 0),
  model_call_count INTEGER NOT NULL DEFAULT 0 CHECK (model_call_count = 0),
  created_at TEXT NOT NULL,
  UNIQUE (lifecycle_id, adapter_id, operation, attempt_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_cost_entries_lifecycle_created
  ON payment_chain_cost_entries(lifecycle_id, created_at);
