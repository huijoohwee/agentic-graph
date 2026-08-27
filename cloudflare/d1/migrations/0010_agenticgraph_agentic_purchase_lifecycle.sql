CREATE TABLE IF NOT EXISTS payment_purchase_lifecycles (
  lifecycle_id TEXT PRIMARY KEY,
  lifecycle_key TEXT NOT NULL UNIQUE,
  envelope_digest TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (
    phase IN ('funding', 'discovery', 'issuance', 'execution')
  ),
  phase_state TEXT NOT NULL CHECK (
    phase_state IN (
      'waiting',
      'ready',
      'in_progress',
      'blocked',
      'complete',
      'cancelled',
      'outcome_unknown',
      'closure_pending'
    )
  ),
  next_action TEXT NOT NULL,
  cancellation_requested INTEGER NOT NULL DEFAULT 0 CHECK (
    cancellation_requested IN (0, 1)
  ),
  financial_state_exists INTEGER NOT NULL DEFAULT 0 CHECK (
    financial_state_exists IN (0, 1)
  ),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  terminal_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_purchase_lifecycles_phase
  ON payment_purchase_lifecycles(phase, phase_state, updated_at);

CREATE TABLE IF NOT EXISTS payment_purchase_funding_reservations (
  lifecycle_id TEXT PRIMARY KEY,
  funding_key TEXT NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  asset TEXT NOT NULL CHECK (asset = 'xsgd'),
  network TEXT NOT NULL CHECK (network = 'avalanche-c-chain'),
  state TEXT NOT NULL CHECK (
    state IN ('reserved', 'released', 'settled')
  ),
  transfer_hash TEXT UNIQUE,
  provider_credit_ref TEXT UNIQUE,
  created_at TEXT NOT NULL,
  released_at TEXT,
  settled_at TEXT,
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE TABLE IF NOT EXISTS payment_purchase_approvals (
  approval_ref TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL UNIQUE,
  envelope_digest TEXT NOT NULL,
  candidate_digest TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'sgd'),
  merchant_policy_digest TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_purchase_approvals_expiry
  ON payment_purchase_approvals(expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS payment_purchase_cards (
  lifecycle_id TEXT PRIMARY KEY,
  issue_key TEXT NOT NULL UNIQUE,
  card_ref TEXT UNIQUE,
  status TEXT NOT NULL CHECK (
    status IN (
      'creating',
      'active',
      'closure_pending',
      'closed',
      'failed'
    )
  ),
  controls_digest TEXT NOT NULL,
  disposal_at TEXT NOT NULL,
  closed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE TABLE IF NOT EXISTS payment_purchase_authorizations (
  lifecycle_id TEXT PRIMARY KEY,
  provider_authorization_id TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency = 'sgd'),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'declined')),
  reservation_state TEXT NOT NULL CHECK (
    reservation_state IN ('reserved', 'released', 'settled')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);

CREATE TABLE IF NOT EXISTS payment_purchase_receipts (
  lifecycle_id TEXT PRIMARY KEY,
  receipt_json TEXT NOT NULL,
  disposal_state TEXT NOT NULL CHECK (
    disposal_state IN ('closure_pending', 'closed')
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (lifecycle_id)
    REFERENCES payment_purchase_lifecycles(lifecycle_id)
);
