ALTER TABLE strytree_token_ledger ADD COLUMN semantic_digest TEXT;
ALTER TABLE strytree_token_ledger ADD COLUMN authority_version INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_strytree_ledger_authority_version
  ON strytree_token_ledger(user_id, authority_version)
  WHERE authority_version IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_strytree_ledger_effect
  ON strytree_token_ledger(user_id, event_type, related_object_type, related_object_id);

CREATE TABLE IF NOT EXISTS strytree_provider_effect_claims (
  provider_event_id TEXT PRIMARY KEY,
  payment_session_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  semantic_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('claimed', 'applied')),
  claimed_at TEXT NOT NULL,
  applied_event_id TEXT,
  FOREIGN KEY (user_id) REFERENCES strytree_users(id),
  FOREIGN KEY (payment_session_id) REFERENCES strytree_payment_sessions(id),
  FOREIGN KEY (applied_event_id) REFERENCES strytree_token_ledger(id)
);

CREATE INDEX IF NOT EXISTS idx_strytree_provider_effect_state
  ON strytree_provider_effect_claims(state, claimed_at);
