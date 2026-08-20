import { compactReleasedHolds } from './envelope-ledger-records'

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
      custody_pending INTEGER NOT NULL DEFAULT 0 CHECK (custody_pending IN (0, 1)),
      quarantine_reason TEXT, quarantined_at INTEGER,
      reconciliation_decision_id TEXT, reconciliation_decision TEXT,
      reconciliation_operator_id TEXT, reconciliation_reason TEXT, reconciled_at INTEGER,
      reservation_kind TEXT NOT NULL DEFAULT 'cascade' CHECK (reservation_kind IN ('cascade', 'ordinary')),
      operation_id TEXT, agent_id TEXT, price_verification TEXT,
      UNIQUE (cascade_id, leg_id)
    );
    CREATE TABLE IF NOT EXISTS envelope_ledger_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      active_total_minor INTEGER NOT NULL CHECK (
        active_total_minor >= 0 AND active_total_minor <= 9007199254740991
      ),
      revision INTEGER NOT NULL CHECK (revision >= 0 AND revision <= 9007199254740991)
    );
    CREATE TABLE IF NOT EXISTS ordinary_terminal_receipts (
      operation_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, offer_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0), expires_at INTEGER NOT NULL,
      price_verification TEXT NOT NULL CHECK (price_verification IN ('verified', 'deterministic-demo')),
      terminal_state TEXT NOT NULL CHECK (terminal_state = 'released'), released_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cascade_terminal_receipts (
      cascade_id TEXT PRIMARY KEY, released_count INTEGER NOT NULL CHECK (released_count > 0),
      released_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_holds_active ON holds(state, expires_at);
    CREATE INDEX IF NOT EXISTS idx_holds_balance ON holds(state, amount_minor);
    CREATE INDEX IF NOT EXISTS idx_holds_cascade ON holds(cascade_id);
  `)
  const current = ctx.storage.sql.exec<{ present: number }>(
    'SELECT EXISTS(SELECT 1 FROM _sql_schema_migrations WHERE id = 7) AS present',
  ).one().present === 1
  if (current) {
    assertCurrentLedgerHeader(ctx, currency)
    return
  }
  ensureColumn(ctx, 'holds', 'bundle_id', "TEXT NOT NULL DEFAULT 'legacy'")
  ensureColumn(ctx, 'holds', 'target_amount_minor', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'holds', 'prior_hold_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'quarantined', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'holds', 'custody_pending', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(ctx, 'holds', 'quarantine_reason', 'TEXT')
  ensureColumn(ctx, 'holds', 'quarantined_at', 'INTEGER')
  ensureColumn(ctx, 'holds', 'reconciliation_decision_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciliation_decision', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciliation_operator_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciliation_reason', 'TEXT')
  ensureColumn(ctx, 'holds', 'reconciled_at', 'INTEGER')
  ensureColumn(ctx, 'holds', 'reservation_kind', "TEXT NOT NULL DEFAULT 'cascade'")
  ensureColumn(ctx, 'holds', 'operation_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'agent_id', 'TEXT')
  ensureColumn(ctx, 'holds', 'price_verification', 'TEXT')
  ensureColumn(ctx, 'envelope', 'currency', "TEXT NOT NULL DEFAULT ''")
  const storedActiveTotal = assertStoredMoney(ctx)
  ctx.storage.sql.exec("UPDATE envelope SET currency = ? WHERE currency = ''", currency)
  assertStoredIdentity(ctx, currency)
  ctx.storage.sql.exec(`
    UPDATE holds SET target_amount_minor = amount_minor WHERE target_amount_minor = 0 AND amount_minor != 0;
    DROP INDEX IF EXISTS idx_holds_committed_position;
    CREATE INDEX IF NOT EXISTS idx_holds_active_position
      ON holds(bundle_id, leg_id, reservation_kind, state);
    CREATE UNIQUE INDEX idx_holds_committed_position
      ON holds(bundle_id, leg_id)
      WHERE state = 'committed' AND bundle_id != 'legacy' AND reservation_kind = 'cascade';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_holds_ordinary_operation
      ON holds(operation_id) WHERE reservation_kind = 'ordinary';
    INSERT OR IGNORE INTO envelope_ledger_state (singleton, active_total_minor, revision)
      VALUES (1, ${storedActiveTotal}, 0);
    CREATE TRIGGER IF NOT EXISTS envelope_holds_after_insert
      AFTER INSERT ON holds
      BEGIN
        UPDATE envelope_ledger_state
          SET active_total_minor = active_total_minor
            + CASE WHEN NEW.state != 'released' THEN NEW.amount_minor ELSE 0 END,
            revision = revision + 1 WHERE singleton = 1;
      END;
    CREATE TRIGGER IF NOT EXISTS envelope_holds_after_delete
      AFTER DELETE ON holds
      BEGIN
        UPDATE envelope_ledger_state
          SET active_total_minor = active_total_minor
            - CASE WHEN OLD.state != 'released' THEN OLD.amount_minor ELSE 0 END,
            revision = revision + 1 WHERE singleton = 1;
      END;
    CREATE TRIGGER IF NOT EXISTS envelope_holds_after_update
      AFTER UPDATE ON holds
      BEGIN
        UPDATE envelope_ledger_state SET active_total_minor = active_total_minor
          - CASE WHEN OLD.state != 'released' THEN OLD.amount_minor ELSE 0 END
          + CASE WHEN NEW.state != 'released' THEN NEW.amount_minor ELSE 0 END,
          revision = revision + 1 WHERE singleton = 1;
      END;
    INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (6, ${Date.now()});
  `)
  compactReleasedHolds(ctx)
  assertStoredLedgerState(ctx, storedActiveTotal)
  ctx.storage.sql.exec(
    'INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (7, ?)', Date.now(),
  )
}

function assertCurrentLedgerHeader(ctx: DurableObjectState, currency: string): void {
  const envelopes = ctx.storage.sql.exec<{ total_budget_minor: number; currency: string }>(
    'SELECT total_budget_minor, currency FROM envelope LIMIT 2',
  ).toArray()
  if (envelopes.length > 1 || envelopes.some(row => row.currency !== currency
    || !Number.isSafeInteger(row.total_budget_minor) || row.total_budget_minor < 0)) {
    throw new Error('envelope-ledger-header-malformed')
  }
  const state = ctx.storage.sql.exec<{ active_total_minor: number; revision: number }>(
    'SELECT active_total_minor, revision FROM envelope_ledger_state WHERE singleton = 1',
  ).one()
  if (!Number.isSafeInteger(state.active_total_minor) || state.active_total_minor < 0
    || !Number.isSafeInteger(state.revision) || state.revision < 0
    || envelopes[0] && state.active_total_minor > envelopes[0].total_budget_minor) {
    throw new Error('envelope-ledger-state-malformed')
  }
}

function assertStoredIdentity(ctx: DurableObjectState, currency: string): void {
  const malformed = ctx.storage.sql.exec<{ malformed: number }>(
    `SELECT EXISTS(
      SELECT 1 FROM envelope WHERE typeof(principal_id) != 'text' OR principal_id = ''
        OR typeof(currency) != 'text' OR currency != ?
      UNION ALL
      SELECT 1 FROM holds WHERE typeof(hold_id) != 'text' OR hold_id = ''
        OR typeof(cascade_id) != 'text' OR cascade_id = ''
        OR typeof(bundle_id) != 'text' OR bundle_id = ''
        OR typeof(leg_id) != 'text' OR leg_id = ''
        OR typeof(offer_id) != 'text' OR offer_id = ''
        OR (prior_hold_id IS NOT NULL AND typeof(prior_hold_id) != 'text')
        OR typeof(state) != 'text' OR state NOT IN ('reserved', 'committed', 'released')
        OR typeof(quarantined) != 'integer' OR quarantined NOT IN (0, 1)
        OR (quarantined = 1 AND state != 'reserved')
        OR typeof(custody_pending) != 'integer' OR custody_pending NOT IN (0, 1)
        OR (custody_pending = 1 AND (
          reservation_kind != 'cascade' OR state != 'reserved' OR quarantined != 0
        ))
        OR typeof(reservation_kind) != 'text'
        OR reservation_kind NOT IN ('cascade', 'ordinary')
      UNION ALL
      SELECT 1 FROM holds WHERE reservation_kind = 'ordinary' AND (
        typeof(operation_id) != 'text' OR operation_id = ''
        OR typeof(agent_id) != 'text' OR agent_id = ''
        OR typeof(price_verification) != 'text'
        OR price_verification NOT IN ('verified', 'deterministic-demo')
        OR cascade_id != ('~ordinary:' || operation_id)
        OR hold_id != ('~ordinary:' || operation_id)
        OR bundle_id != ('~ordinary:' || agent_id)
        OR leg_id != operation_id OR prior_hold_id IS NOT NULL
        OR target_amount_minor != amount_minor
      )
    ) AS malformed`,
    currency,
  ).one().malformed
  if (malformed === 1) throw new Error('legacy-stored-identity-malformed')
}

function assertStoredMoney(ctx: DurableObjectState): number {
  const malformed = ctx.storage.sql.exec<{ malformed: number }>(
    `SELECT EXISTS(
      SELECT 1 FROM envelope
      WHERE typeof(total_budget_minor) != 'integer'
        OR total_budget_minor < 0 OR total_budget_minor > 9007199254740991
      UNION ALL
      SELECT 1 FROM holds
      WHERE typeof(amount_minor) != 'integer' OR typeof(target_amount_minor) != 'integer'
        OR amount_minor < 0 OR amount_minor > 9007199254740991
        OR target_amount_minor < 0 OR target_amount_minor > 9007199254740991
    ) AS malformed`,
  ).one().malformed
  if (malformed === 1) throw new Error('legacy-stored-money-malformed')
  const envelopes = ctx.storage.sql.exec<{ total_budget_minor: number }>(
    'SELECT total_budget_minor FROM envelope',
  ).toArray()
  const active = ctx.storage.sql.exec<{ active_total_minor: number; active_count: number }>(
    `SELECT COALESCE(SUM(amount_minor), 0) AS active_total_minor,
      COUNT(*) AS active_count FROM holds WHERE state != 'released'`,
  ).one()
  if (envelopes.length > 1 || (active.active_count > 0 && envelopes.length !== 1)) {
    throw new Error('legacy-stored-money-malformed')
  }
  if (!Number.isSafeInteger(active.active_total_minor) || active.active_total_minor < 0
    || envelopes[0] && active.active_total_minor > envelopes[0].total_budget_minor) {
    throw new Error('legacy-stored-money-malformed')
  }
  return active.active_total_minor
}

function assertStoredLedgerState(ctx: DurableObjectState, storedActiveTotal: number): void {
  const state = ctx.storage.sql.exec<{ active_total_minor: number; revision: number }>(
    'SELECT active_total_minor, revision FROM envelope_ledger_state WHERE singleton = 1',
  ).one()
  if (state.active_total_minor !== storedActiveTotal || !Number.isSafeInteger(state.revision)
    || state.revision < 0) throw new Error('envelope-ledger-state-malformed')
}

function ensureColumn(ctx: DurableObjectState, table: string, column: string, declaration: string): void {
  const present = ctx.storage.sql.exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray().some((item) => item.name === column)
  if (!present) ctx.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`)
}
