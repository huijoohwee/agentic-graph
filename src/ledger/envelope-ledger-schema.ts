export function migrateEnvelopeLedger(ctx: DurableObjectState, currency: string): void {
  ctx.storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS _sql_schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS envelope (
      principal_id TEXT PRIMARY KEY, total_budget_minor INTEGER NOT NULL CHECK (total_budget_minor >= 0),
      currency TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS holds (
      hold_id TEXT PRIMARY KEY, cascade_id TEXT NOT NULL, bundle_id TEXT NOT NULL,
      leg_id TEXT NOT NULL, offer_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
      target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor >= 0), prior_hold_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('reserved', 'committed', 'released')), expires_at INTEGER NOT NULL,
      quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined IN (0, 1)),
      quarantine_reason TEXT, quarantined_at INTEGER,
      reconciliation_decision_id TEXT, reconciliation_decision TEXT,
      reconciliation_operator_id TEXT, reconciliation_reason TEXT, reconciled_at INTEGER,
      UNIQUE (cascade_id, leg_id)
    );
    CREATE INDEX IF NOT EXISTS idx_holds_active ON holds(state, expires_at);
    CREATE INDEX IF NOT EXISTS idx_holds_cascade ON holds(cascade_id);
  `)
  ensureColumn(ctx, 'holds', 'bundle_id', "TEXT NOT NULL DEFAULT 'legacy'")
  ensureColumn(ctx, 'holds', 'target_amount_minor', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'holds', 'prior_hold_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'quarantined', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'holds', 'quarantine_reason', 'TEXT')
  ensureColumn(ctx, 'holds', 'quarantined_at', 'INTEGER')
  ensureColumn(ctx, 'holds', 'reconciliation_decision_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciliation_decision', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciliation_operator_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciliation_reason', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciled_at', 'INTEGER')
  ensureColumn(ctx, 'envelope', 'currency', "TEXT NOT NULL DEFAULT ''")
  ctx.storage.sql.exec("UPDATE envelope SET currency = ? WHERE currency = ''", currency)
  ctx.storage.sql.exec(`
    UPDATE holds SET target_amount_minor = amount_minor WHERE target_amount_minor = 0 AND amount_minor != 0;
    DROP INDEX IF EXISTS idx_holds_committed_position;
    CREATE UNIQUE INDEX idx_holds_committed_position
      ON holds(bundle_id, leg_id) WHERE state = 'committed' AND bundle_id != 'legacy';
    INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (3, ${Date.now()});
  `)
}

function ensureColumn(ctx: DurableObjectState, table: string, column: string, declaration: string): void {
  const present = ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray().some((item) => item.name === column)
  if (!present) ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`)
}
