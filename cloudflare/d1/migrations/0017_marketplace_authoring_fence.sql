-- Durable authoring-fence high-water marks and immutable transition outcomes.
CREATE TABLE IF NOT EXISTS marketplace_authoring_fence (
  semantic_scope TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL CHECK (lease_epoch > 0),
  mutation_sequence INTEGER NOT NULL CHECK (mutation_sequence > 0),
  fence_revision TEXT NOT NULL,
  mutation_id TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_authoring_outcome (
  mutation_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  permit_json TEXT NOT NULL,
  semantic_scope TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  lease_epoch INTEGER NOT NULL CHECK (lease_epoch > 0),
  mutation_sequence INTEGER NOT NULL CHECK (mutation_sequence > 0),
  fence_revision TEXT NOT NULL,
  vendor_id TEXT NOT NULL REFERENCES marketplace_vendor(vendor_id),
  actor_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  outcome_json TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (semantic_scope, lease_epoch, mutation_sequence)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_authoring_outcome_scope
  ON marketplace_authoring_outcome(semantic_scope, lease_epoch, mutation_sequence);

-- Exact current-state provenance for the Commerce marketplace projection.
-- This is updated in the same D1 batch as every fenced lifecycle transition.
CREATE TABLE IF NOT EXISTS marketplace_vendor_state_provenance (
  vendor_id TEXT PRIMARY KEY REFERENCES marketplace_vendor(vendor_id),
  actor_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL UNIQUE,
  lifecycle_state TEXT NOT NULL
    CHECK (lifecycle_state IN ('pending_review', 'approved', 'active', 'suspended')),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO marketplace_vendor_state_provenance (
  vendor_id, actor_id, mutation_id, lifecycle_state, updated_at
)
SELECT vendor_id, 'repository-migration-0016', 'migration:0016:' || vendor_id,
  lifecycle_state, updated_at
FROM marketplace_vendor;
