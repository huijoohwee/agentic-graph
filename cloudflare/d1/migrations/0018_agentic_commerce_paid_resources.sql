-- Durable, minimized x402 paid-resource coordination. Signed XRPL transaction
-- blobs and credentials are deliberately excluded from persistence.
CREATE TABLE IF NOT EXISTS agentic_commerce_paid_resources (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  network TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  request_json TEXT NOT NULL,
  requirements_digest TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  payment_required_digest TEXT NOT NULL,
  payment_required_json TEXT NOT NULL,
  facilitator_url TEXT NOT NULL,
  rpc_url TEXT NOT NULL,
  transport_digest TEXT NOT NULL,
  payment_payload_digest TEXT,
  signed_blob_digest TEXT,
  transaction_hash TEXT,
  state TEXT NOT NULL CHECK (
    state IN (
      'challenged',
      'verifying',
      'executing',
      'settling',
      'settlement_unknown',
      'fulfilled',
      'expired'
    )
  ),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  claim_token TEXT,
  claim_expires_at TEXT,
  response_json TEXT,
  response_digest TEXT,
  settlement_json TEXT,
  settlement_digest TEXT,
  settlement_attempts INTEGER NOT NULL DEFAULT 0 CHECK (
    settlement_attempts >= 0 AND settlement_attempts <= 2
  ),
  verification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (
    verification_attempts >= 0 AND verification_attempts <= 8
  ),
  payer TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  fulfilled_at TEXT,
  UNIQUE (resource_id, idempotency_key),
  CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CHECK ((response_json IS NULL) = (response_digest IS NULL)),
  CHECK ((settlement_json IS NULL) = (settlement_digest IS NULL)),
  CHECK (state NOT IN ('settling', 'settlement_unknown', 'fulfilled') OR settlement_attempts > 0),
  CHECK (state != 'fulfilled' OR (
    response_json IS NOT NULL
    AND settlement_json IS NOT NULL
    AND transaction_hash IS NOT NULL
    AND fulfilled_at IS NOT NULL
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_paid_resource_network_transaction
  ON agentic_commerce_paid_resources(network, transaction_hash)
  WHERE transaction_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paid_resource_state_claim
  ON agentic_commerce_paid_resources(state, claim_expires_at);

CREATE INDEX IF NOT EXISTS idx_paid_resource_retention
  ON agentic_commerce_paid_resources(expires_at)
  WHERE state = 'challenged';

CREATE INDEX IF NOT EXISTS idx_paid_resource_expired_retention
  ON agentic_commerce_paid_resources(updated_at)
  WHERE state = 'expired';

CREATE TABLE IF NOT EXISTS agentic_commerce_paid_resource_rejections (
  paid_resource_id TEXT NOT NULL,
  network TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (network, transaction_hash)
);

CREATE INDEX IF NOT EXISTS idx_paid_resource_rejection_retention
  ON agentic_commerce_paid_resource_rejections(expires_at);

CREATE INDEX IF NOT EXISTS idx_paid_resource_rejection_owner
  ON agentic_commerce_paid_resource_rejections(paid_resource_id);

CREATE TABLE IF NOT EXISTS agentic_commerce_paid_resource_admission_windows (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paid_resource_admission_expiry
  ON agentic_commerce_paid_resource_admission_windows(expires_at);
