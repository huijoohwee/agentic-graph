CREATE TABLE IF NOT EXISTS payment_chain_id_allowlist (
  chain_id INTEGER PRIMARY KEY,
  chain_label TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO payment_chain_id_allowlist (
  chain_id,
  chain_label,
  environment,
  status,
  updated_by,
  updated_at
) VALUES (
  43114,
  'Avalanche C-Chain',
  'production',
  'active',
  'migration:0013_chain_id_allowlist',
  datetime('now')
);
