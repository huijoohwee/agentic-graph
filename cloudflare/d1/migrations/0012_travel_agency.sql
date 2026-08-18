CREATE TABLE IF NOT EXISTS workspace_membership_transaction_sides (
  membership_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  transaction_side TEXT NOT NULL CHECK (transaction_side IN ('shopper', 'merchant')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_transaction_sides_workspace_side
  ON workspace_membership_transaction_sides(workspace_id, transaction_side);

CREATE TABLE IF NOT EXISTS travel_wallet_profile_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  transaction_side TEXT NOT NULL CHECK (transaction_side IN ('shopper', 'merchant')),
  wallet_address_digest TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_contract TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, membership_id, chain_id, token_contract)
);

CREATE INDEX IF NOT EXISTS idx_travel_wallet_links_workspace_side
  ON travel_wallet_profile_links(workspace_id, transaction_side, status);

CREATE TABLE IF NOT EXISTS travel_notification_recipients (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  transaction_side TEXT NOT NULL CHECK (transaction_side IN ('shopper', 'merchant')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'webhook', 'in_app')),
  recipient_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (membership_id) REFERENCES workspace_memberships(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, membership_id, channel, recipient_digest)
);

CREATE INDEX IF NOT EXISTS idx_travel_notification_recipients_workspace_side
  ON travel_notification_recipients(workspace_id, transaction_side, status);

CREATE TABLE IF NOT EXISTS travel_notification_suppression (
  suppression_key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_digest TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  suppressed_at TEXT NOT NULL,
  UNIQUE (workspace_id, transaction_id, channel, recipient_digest, event_digest)
);

CREATE TABLE IF NOT EXISTS travel_agency_runtime_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  value_kind TEXT NOT NULL CHECK (value_kind IN ('string', 'integer', 'boolean', 'json')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'server', 'secret_ref')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_travel_runtime_config_visibility
  ON travel_agency_runtime_config(visibility);

CREATE TABLE IF NOT EXISTS travel_agency_readiness_evidence (
  component_id TEXT PRIMARY KEY,
  local_rung TEXT NOT NULL CHECK (local_rung IN ('spec-complete', 'dev-proven', 'runtime-ready')),
  delivered_rung TEXT NOT NULL CHECK (delivered_rung IN ('undocumented', 'documented', 'runtime-ready')),
  evidence_reference TEXT,
  deploy_boundary TEXT NOT NULL CHECK (deploy_boundary IN ('closed', 'sandbox-only', 'production-open')),
  blocker_code TEXT,
  updated_at TEXT NOT NULL,
  CHECK ((evidence_reference IS NOT NULL AND length(evidence_reference) > 0) OR (local_rung = 'spec-complete' AND delivered_rung = 'undocumented' AND deploy_boundary = 'closed'))
);
