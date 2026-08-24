PRAGMA foreign_keys = ON;

-- Browser-session bootstrap maps an externally verified identity to a
-- pre-provisioned Knowgrph user. This table intentionally carries no role or
-- workspace grant: workspace_memberships remains the sole authorization SSOT.
CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (provider, issuer, subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_user
  ON auth_identities(user_id);
