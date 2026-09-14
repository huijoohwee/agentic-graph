-- At most 65 fixed quota buckets. OAuth admission has no paid fallback.
CREATE TABLE IF NOT EXISTS storage_oauth_budget (
  bucket TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  used INTEGER NOT NULL CHECK (used > 0)
);
-- Only admitted sign-ins create challenges; callbacks atomically consume them.
CREATE TABLE IF NOT EXISTS storage_oauth_challenges (
  state_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_storage_oauth_challenges_expiry ON storage_oauth_challenges(expires_at);
