-- Native marketplace settlement reference data and reporting projections.
CREATE TABLE IF NOT EXISTS marketplace_commission_rule (
  commission_rule_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('flat', 'tiered')),
  rule_body TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (commission_rule_id, revision)
);

CREATE TABLE IF NOT EXISTS marketplace_vendor (
  vendor_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL
    CHECK (lifecycle_state IN ('pending_review', 'approved', 'active', 'suspended')),
  commission_rule_id TEXT NOT NULL,
  commission_rule_revision TEXT NOT NULL,
  settlement_currency TEXT NOT NULL,
  payout_principal_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (commission_rule_id, commission_rule_revision)
    REFERENCES marketplace_commission_rule(commission_rule_id, revision)
);

-- Non-authoritative D1 report. The split row committed in the bundle Durable Object is authoritative.
CREATE TABLE IF NOT EXISTS marketplace_vendor_split_projection (
  split_id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL REFERENCES marketplace_vendor(vendor_id),
  leg_ids TEXT NOT NULL,
  settlement_currency TEXT NOT NULL,
  gross_amount_minor INTEGER NOT NULL CHECK (gross_amount_minor > 0),
  commission_amount_minor INTEGER NOT NULL CHECK (commission_amount_minor >= 0),
  net_payout_amount_minor INTEGER NOT NULL CHECK (net_payout_amount_minor >= 0),
  commission_rule_id TEXT NOT NULL,
  commission_rule_revision TEXT NOT NULL,
  projected_at TEXT NOT NULL,
  UNIQUE (bundle_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS marketplace_payout (
  payout_id TEXT PRIMARY KEY,
  split_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payout_state TEXT NOT NULL CHECK (payout_state IN ('pending', 'blocked', 'dispatched', 'settled', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  terminal_reason TEXT,
  first_attempt_at TEXT,
  terminal_at TEXT,
  settlement_reference TEXT,
  next_attempt_at TEXT,
  last_result_fingerprint TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (split_id, payout_state)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_vendor_lifecycle_state
  ON marketplace_vendor(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_marketplace_vendor_split_projection_bundle
  ON marketplace_vendor_split_projection(bundle_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_vendor_split_projection_vendor
  ON marketplace_vendor_split_projection(vendor_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_payout_split
  ON marketplace_payout(split_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_payout_state
  ON marketplace_payout(payout_state);

-- These internal travel agents are the initial operator-approved marketplace cohort.
-- New vendors still enter through the authenticated lifecycle transition contract.
INSERT OR IGNORE INTO marketplace_commission_rule (
  commission_rule_id, revision, rule_kind, rule_body, content_hash, created_at
) VALUES (
  'travel-standard', '1', 'flat', '{"kind":"flat","bps":1000}',
  'sha256:travel-standard-v1-1000bps', '2026-08-22T00:00:00.000Z'
);

INSERT OR IGNORE INTO marketplace_vendor (
  vendor_id, display_name, lifecycle_state, commission_rule_id, commission_rule_revision,
  settlement_currency, payout_principal_id, content_hash, created_at, updated_at
) VALUES
  ('agent-flight', 'Knowgrph Flight Agent', 'active', 'travel-standard', '1', 'SGD',
   'agent-flight', 'sha256:agent-flight-marketplace-v1', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('agent-hotel', 'Knowgrph Hotel Agent', 'active', 'travel-standard', '1', 'SGD',
   'agent-hotel', 'sha256:agent-hotel-marketplace-v1', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('agent-experience', 'Knowgrph Experience Agent', 'active', 'travel-standard', '1', 'SGD',
   'agent-experience', 'sha256:agent-experience-marketplace-v1', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z'),
  ('agent-shopping', 'Knowgrph Shopping Agent', 'active', 'travel-standard', '1', 'SGD',
   'agent-shopping', 'sha256:agent-shopping-marketplace-v1', '2026-08-22T00:00:00.000Z', '2026-08-22T00:00:00.000Z');
