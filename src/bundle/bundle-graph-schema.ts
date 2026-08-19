export function migrateBundleGraph(ctx: DurableObjectState): void {
  ctx.storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS _sql_schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bundle_meta (
      bundle_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL,
      total_budget_minor INTEGER NOT NULL CHECK (total_budget_minor >= 0),
      initialization_state TEXT NOT NULL DEFAULT 'ready' CHECK (initialization_state IN ('pending', 'ready')),
      seed_fingerprint TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS legs (
      leg_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, category TEXT NOT NULL,
      committed_offer_id TEXT, committed_amount_minor INTEGER CHECK (committed_amount_minor >= 0), last_cascade_id TEXT
    );
    CREATE TABLE IF NOT EXISTS edges (
      from_leg_id TEXT NOT NULL, to_leg_id TEXT NOT NULL, PRIMARY KEY (from_leg_id, to_leg_id)
    );
    CREATE TABLE IF NOT EXISTS topology (position INTEGER PRIMARY KEY, leg_id TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS cascades (
      cascade_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, bundle_id TEXT NOT NULL,
      principal_id TEXT NOT NULL, changed_leg_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN (
        'quoting', 'settlement_pending', 'settling', 'finalizing', 'archiving',
        'committed', 'archive_failed', 'reconciliation_required', 'rolled_back', 'no_op', 'rejected'
      )),
      affected_json TEXT NOT NULL, prior_legs_json TEXT NOT NULL, changes_json TEXT NOT NULL,
      net_amount_minor INTEGER NOT NULL, outcome_json TEXT, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      recovery_attempts INTEGER NOT NULL DEFAULT 0, settlement_attempts INTEGER NOT NULL DEFAULT 0,
      next_recovery_at INTEGER, archive_snapshot_json TEXT
    );
    CREATE TABLE IF NOT EXISTS settlement_claims (
      cascade_id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reconciliation_decisions (
      cascade_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE,
      decision TEXT NOT NULL CHECK (decision IN ('commit', 'release')),
      operator_id TEXT NOT NULL, reason TEXT NOT NULL,
      requested_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS session_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, cascade_id TEXT NOT NULL, event_type TEXT NOT NULL,
      bundle_id TEXT NOT NULL, changed_leg_id TEXT NOT NULL, affected_json TEXT NOT NULL,
      outcome TEXT, reason TEXT, recorded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cost_log (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, cascade_id TEXT NOT NULL, component TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL,
      dollar_cost REAL NOT NULL, recorded_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cascades_event ON cascades(event_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_cascade_component ON cost_log(cascade_id, component);
  `)
  ensureColumn(ctx, 'cascades', 'recovery_attempts', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'cascades', 'settlement_attempts', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'cascades', 'next_recovery_at', 'INTEGER')
  ensureColumn(ctx, 'cascades', 'archive_snapshot_json', 'TEXT')
  ensureColumn(ctx, 'bundle_meta', 'initialization_state', "TEXT NOT NULL DEFAULT 'ready'")
  ensureColumn(ctx, 'bundle_meta', 'seed_fingerprint', "TEXT NOT NULL DEFAULT ''")
  ensureColumn(ctx, 'session_log', 'bundle_id', "TEXT NOT NULL DEFAULT ''")
  ctx.storage.sql.exec(
    `UPDATE session_log SET bundle_id = COALESCE(
      (SELECT bundle_id FROM cascades WHERE cascades.cascade_id = session_log.cascade_id), bundle_id
    ) WHERE bundle_id = ''`,
  )
  ctx.storage.sql.exec(
    `DELETE FROM session_log WHERE seq NOT IN (
      SELECT MAX(seq) FROM session_log GROUP BY cascade_id
    )`,
  )
  ctx.storage.sql.exec('DROP INDEX IF EXISTS idx_session_cascade')
  ctx.storage.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_session_cascade ON session_log(cascade_id)')
  ctx.storage.sql.exec(
    `UPDATE cascades SET recovery_attempts = 0, next_recovery_at = ?
      WHERE outcome_json IS NULL AND next_recovery_at IS NULL`, Date.now() + 1_000,
  )
  ctx.storage.sql.exec(
    `UPDATE cascades SET next_recovery_at = ?
      WHERE phase = 'rolled_back' AND next_recovery_at IS NULL
        AND COALESCE(json_extract(outcome_json, '$.releaseConfirmed'), 0) = 0`, Date.now() + 1_000,
  )
  ctx.storage.sql.exec(
    `UPDATE cascades SET settlement_attempts = 1
      WHERE settlement_attempts = 0 AND net_amount_minor != 0
        AND phase IN ('settling', 'finalizing', 'archiving')`,
  )
  ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS idx_cascades_recovery ON cascades(next_recovery_at, phase)')
  ctx.storage.sql.exec(
    'INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (3, ?)', Date.now(),
  )
}

function ensureColumn(ctx: DurableObjectState, table: string, column: string, declaration: string): void {
  const present = ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray().some((item) => item.name === column)
  if (!present) ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`)
}
