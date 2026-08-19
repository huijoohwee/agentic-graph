import { DurableObject } from 'cloudflare:workers'
import {
  MAX_BUNDLE_EDGES,
  MAX_BUNDLE_LEGS,
  cascadeIdFor,
  isIdentifier,
  isMinorUnits,
  type BeginCascadeResult,
  type BundleSeed,
  type CascadeOutcome,
  type CascadePhase,
  type CascadeRecord,
  type Edge,
  type Leg,
  type LegChange,
  type MutationEvent,
  type Quote,
  type Rejection,
} from './bundle-types'
import { affectedSet, topologicalOrder } from './topo-order'

type MetaRow = { bundle_id: string; principal_id: string; total_budget_minor: number }
type LegRow = {
  leg_id: string
  principal_id: string
  category: string
  committed_offer_id: string | null
  committed_amount_minor: number | null
  last_cascade_id: string | null
}
type EdgeRow = { from_leg_id: string; to_leg_id: string }
type CascadeRow = {
  cascade_id: string
  event_id: string
  bundle_id: string
  principal_id: string
  changed_leg_id: string
  phase: CascadePhase
  affected_json: string
  prior_legs_json: string
  changes_json: string
  net_amount_minor: number
  outcome_json: string | null
  started_at: number
  updated_at: number
}
type SettlementClaimRow = { owner: string; expires_at: number }

export class BundleGraphStore extends DurableObject<TravelCommerceEnv> {
  constructor(ctx: DurableObjectState, env: TravelCommerceEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => this.migrate())
  }

  initBundle(seed: BundleSeed): { kind: 'initialized' | 'idempotent' } | Rejection {
    const validation = validateSeed(seed)
    if (validation) return validation
    const existing = this.meta()
    if (existing) {
      return existing.bundle_id === seed.bundleId && existing.principal_id === seed.principalId
        ? { kind: 'idempotent' }
        : { kind: 'rejected', reason: 'bundle-initialization-conflict' }
    }
    const topology = topologicalOrder(seed.legs.map((leg) => leg.legId), seed.edges)
    if (!topology.ok) return { kind: 'rejected', reason: topology.reason }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO bundle_meta (bundle_id, principal_id, total_budget_minor) VALUES (?, ?, ?)',
        seed.bundleId, seed.principalId, seed.totalBudgetMinor,
      )
      for (const leg of seed.legs) this.insertLeg(leg)
      for (const edge of seed.edges) {
        this.ctx.storage.sql.exec(
          'INSERT INTO edges (from_leg_id, to_leg_id) VALUES (?, ?)', edge.fromLegId, edge.toLegId,
        )
      }
      topology.order.forEach((legId, position) => {
        this.ctx.storage.sql.exec('INSERT INTO topology (position, leg_id) VALUES (?, ?)', position, legId)
      })
    })
    return { kind: 'initialized' }
  }

  beginCascade(event: MutationEvent, now = Date.now()): BeginCascadeResult {
    const cascadeId = cascadeIdFor(event)
    const existing = this.readCascade(cascadeId)
    if (existing) return existing.outcome
      ? { kind: 'terminal', record: existing, outcome: existing.outcome }
      : { kind: 'resume', record: existing }
    const meta = this.meta()
    if (!meta || meta.bundle_id !== event.bundleId) {
      return this.persistTerminal(event, '', 'rejected', [], [], 'bundle-unavailable', now)
    }
    const legs = this.readLegs()
    const edges = this.readEdges()
    const affected = affectedSet(event.legId, legs.map((leg) => leg.legId), edges)
    if (!affected.ok) {
      return this.persistTerminal(event, meta.principal_id, 'rejected', [], [], affected.reason, now)
    }
    if (affected.order.length === 0) {
      return this.persistTerminal(event, meta.principal_id, 'no_op', [], [], 'no-outgoing-edges', now)
    }
    const priorLegs = affected.order.map((legId) => legs.find((leg) => leg.legId === legId)!)
    const record: CascadeRecord = Object.freeze({
      cascadeId, eventId: event.eventId, bundleId: event.bundleId, principalId: meta.principal_id,
      changedLegId: event.legId, phase: 'quoting', affected: Object.freeze([...affected.order]),
      priorLegs: Object.freeze(priorLegs), changes: Object.freeze([]), netAmountMinor: 0,
      outcome: null, startedAt: now, updatedAt: now,
    })
    this.writeCascade(record)
    this.appendSessionLog(record, 'cascade-started', null, now)
    return { kind: 'plan', record }
  }

  prepareCommit(cascadeId: string, quotes: readonly Quote[], now = Date.now()): CascadeRecord | Rejection {
    const record = this.readCascade(cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.phase !== 'quoting') return record
    const expected = new Set(record.affected)
    if (
      quotes.length !== expected.size
      || new Set(quotes.map((quote) => quote.legId)).size !== quotes.length
      || quotes.some((quote) => !expected.has(quote.legId))
    ) return { kind: 'rejected', reason: 'requote-malformed' }
    const byLeg = new Map(quotes.map((quote) => [quote.legId, quote]))
    const changes: LegChange[] = record.priorLegs.map((prior) => {
      const quote = byLeg.get(prior.legId)!
      return Object.freeze({
        legId: prior.legId,
        priorOfferId: prior.committedOfferId,
        priorAmountMinor: prior.committedAmountMinor,
        newOfferId: quote.offerId,
        newAmountMinor: quote.amountMinor,
      })
    })
    const netAmountMinor = changes.reduce(
      (sum, change) => sum + change.newAmountMinor - (change.priorAmountMinor ?? 0), 0,
    )
    const next: CascadeRecord = Object.freeze({
      ...record,
      phase: netAmountMinor === 0 ? 'finalizing' : 'settlement_pending',
      changes: Object.freeze(changes), netAmountMinor, updatedAt: now,
    })
    this.ctx.storage.transactionSync(() => {
      for (const change of changes) {
        this.ctx.storage.sql.exec(
          `UPDATE legs SET committed_offer_id = ?, committed_amount_minor = ?, last_cascade_id = ?
           WHERE leg_id = ?`,
          change.newOfferId, change.newAmountMinor, cascadeId, change.legId,
        )
      }
      this.updateCascade(next)
    })
    this.appendSessionLog(next, 'commit-prepared', null, now)
    return next
  }

  claimSettlement(
    cascadeId: string,
    owner: string,
    now = Date.now(),
    leaseMs = 15_000,
  ): Readonly<{ kind: 'claimed' | 'busy' | 'not-required'; expiresAt?: number }> | Rejection {
    const record = this.readCascade(cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.netAmountMinor === 0 || record.phase === 'finalizing') return { kind: 'not-required' }
    if (record.outcome) return { kind: 'not-required' }
    const current = this.ctx.storage.sql.exec<SettlementClaimRow>(
      'SELECT owner, expires_at FROM settlement_claims WHERE cascade_id = ?', cascadeId,
    ).toArray()[0]
    if (current && current.owner !== owner && current.expires_at > now) {
      return { kind: 'busy', expiresAt: current.expires_at }
    }
    const expiresAt = now + leaseMs
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO settlement_claims (cascade_id, owner, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(cascade_id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at`,
        cascadeId, owner, expiresAt,
      )
      this.ctx.storage.sql.exec("UPDATE cascades SET phase = 'settling', updated_at = ? WHERE cascade_id = ?", now, cascadeId)
    })
    return { kind: 'claimed', expiresAt }
  }

  markSettlementComplete(cascadeId: string, owner: string, now = Date.now()): CascadeRecord | Rejection {
    const claim = this.ctx.storage.sql.exec<SettlementClaimRow>(
      'SELECT owner, expires_at FROM settlement_claims WHERE cascade_id = ?', cascadeId,
    ).toArray()[0]
    if (!claim || claim.owner !== owner) return { kind: 'rejected', reason: 'settlement-claim-lost' }
    const record = this.readCascade(cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    const next = Object.freeze({ ...record, phase: 'finalizing' as const, updatedAt: now })
    this.ctx.storage.transactionSync(() => {
      this.updateCascade(next)
      this.ctx.storage.sql.exec('DELETE FROM settlement_claims WHERE cascade_id = ?', cascadeId)
    })
    return next
  }

  finishCascade(cascadeId: string, archiveDeferred: boolean, now = Date.now()): CascadeOutcome | Rejection {
    const record = this.readCascade(cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.outcome) return record.outcome
    if (record.phase !== 'finalizing') {
      return { kind: 'rejected', reason: 'cascade-not-finalizable' }
    }
    const outcome: CascadeOutcome = Object.freeze({
      kind: 'committed', cascadeId, bundleId: record.bundleId, changedLegId: record.changedLegId,
      affected: record.affected, changes: record.changes, netAmountMinor: record.netAmountMinor,
      settlementCalls: record.netAmountMinor === 0 ? 0 : 1, reason: null, archiveDeferred,
      elapsedMs: Math.max(0, now - record.startedAt),
    })
    const next = Object.freeze({ ...record, phase: 'committed' as const, outcome, updatedAt: now })
    this.ctx.storage.transactionSync(() => {
      this.updateCascade(next)
      this.appendCostLog(cascadeId, 'Reopt_Worker', 0, 0, 0, now)
    })
    this.appendSessionLog(next, archiveDeferred ? 'archive-deferred' : 'cascade-committed', null, now)
    this.broadcast(outcome)
    return outcome
  }

  rollbackCascade(cascadeId: string, reason: string, now = Date.now()): CascadeOutcome | Rejection {
    const record = this.readCascade(cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.outcome) return record.outcome
    const outcome: CascadeOutcome = Object.freeze({
      kind: 'rolled-back', cascadeId, bundleId: record.bundleId, changedLegId: record.changedLegId,
      affected: record.affected, changes: record.changes, netAmountMinor: 0, settlementCalls: 0,
      reason: reason || 'cascade-failed', archiveDeferred: false,
      elapsedMs: Math.max(0, now - record.startedAt),
    })
    const next = Object.freeze({ ...record, phase: 'rolled_back' as const, outcome, updatedAt: now })
    this.ctx.storage.transactionSync(() => {
      for (const prior of record.priorLegs) this.restoreLeg(prior)
      this.updateCascade(next)
      this.appendCostLog(cascadeId, 'Reopt_Worker', 0, 0, 0, now)
    })
    this.appendSessionLog(next, 'cascade-rolled-back', reason, now)
    this.broadcast(outcome)
    return outcome
  }

  recordHarnessCosts(cascadeId: string, quotes: readonly Quote[], now = Date.now()): void {
    for (const quote of quotes) {
      this.appendCostLog(
        cascadeId, `Discovery_Harness:${quote.agentId}`, quote.promptTokens,
        quote.completionTokens, quote.dollarCost, now,
      )
    }
  }

  getCascade(cascadeId: string): CascadeRecord | null {
    return this.readCascade(cascadeId)
  }

  getSnapshot(): Readonly<{ bundleId: string; principalId: string; legs: readonly Leg[]; edges: readonly Edge[] }> | null {
    const meta = this.meta()
    return meta ? Object.freeze({
      bundleId: meta.bundle_id,
      principalId: meta.principal_id,
      legs: Object.freeze(this.readLegs()),
      edges: Object.freeze(this.readEdges()),
    }) : null
  }

  getSessionLog(): readonly Readonly<Record<string, string | number | null>>[] {
    return this.ctx.storage.sql.exec<{
      cascade_id: string; event_type: string; changed_leg_id: string; affected_json: string
      outcome: string | null; reason: string | null; recorded_at: number
    }>(
      `SELECT cascade_id, event_type, changed_leg_id, affected_json, outcome, reason, recorded_at
       FROM session_log ORDER BY seq`,
    ).toArray().map((row) => Object.freeze({
      cascadeId: row.cascade_id, eventType: row.event_type, changedLegId: row.changed_leg_id,
      affected: row.affected_json, outcome: row.outcome, reason: row.reason, recordedAt: row.recorded_at,
    }))
  }

  getCostLog(): readonly Readonly<Record<string, string | number>>[] {
    return this.ctx.storage.sql.exec<{
      cascade_id: string; component: string; prompt_tokens: number; completion_tokens: number
      dollar_cost: number; recorded_at: number
    }>('SELECT cascade_id, component, prompt_tokens, completion_tokens, dollar_cost, recorded_at FROM cost_log ORDER BY seq')
      .toArray().map((row) => Object.freeze({
        cascadeId: row.cascade_id, component: row.component, promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens, dollarCost: row.dollar_cost, recordedAt: row.recorded_at,
      }))
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ ok: false, reason: 'websocket-upgrade-required' }, { status: 426 })
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ connectedAt: Date.now() })
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message === 'ping') socket.send('pong')
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bundle_meta (
        bundle_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, total_budget_minor INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS legs (
        leg_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, category TEXT NOT NULL,
        committed_offer_id TEXT, committed_amount_minor INTEGER, last_cascade_id TEXT
      );
      CREATE TABLE IF NOT EXISTS edges (
        from_leg_id TEXT NOT NULL, to_leg_id TEXT NOT NULL,
        PRIMARY KEY (from_leg_id, to_leg_id)
      );
      CREATE TABLE IF NOT EXISTS topology (position INTEGER PRIMARY KEY, leg_id TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS cascades (
        cascade_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, bundle_id TEXT NOT NULL,
        principal_id TEXT NOT NULL, changed_leg_id TEXT NOT NULL, phase TEXT NOT NULL,
        affected_json TEXT NOT NULL, prior_legs_json TEXT NOT NULL, changes_json TEXT NOT NULL,
        net_amount_minor INTEGER NOT NULL, outcome_json TEXT, started_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settlement_claims (
        cascade_id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, cascade_id TEXT NOT NULL, event_type TEXT NOT NULL,
        changed_leg_id TEXT NOT NULL, affected_json TEXT NOT NULL, outcome TEXT, reason TEXT, recorded_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cost_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, cascade_id TEXT NOT NULL, component TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL, completion_tokens INTEGER NOT NULL,
        dollar_cost REAL NOT NULL, recorded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cascades_event ON cascades(event_id);
      CREATE INDEX IF NOT EXISTS idx_session_cascade ON session_log(cascade_id, seq);
      INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (1, ${Date.now()});
    `)
  }

  private meta(): MetaRow | null {
    return this.ctx.storage.sql.exec<MetaRow>(
      'SELECT bundle_id, principal_id, total_budget_minor FROM bundle_meta LIMIT 1',
    ).toArray()[0] ?? null
  }

  private readLegs(): Leg[] {
    return this.ctx.storage.sql.exec<LegRow>(
      `SELECT leg_id, principal_id, category, committed_offer_id, committed_amount_minor, last_cascade_id
       FROM legs ORDER BY leg_id`,
    ).toArray().map(mapLeg)
  }

  private readEdges(): Edge[] {
    return this.ctx.storage.sql.exec<EdgeRow>(
      'SELECT from_leg_id, to_leg_id FROM edges ORDER BY from_leg_id, to_leg_id',
    ).toArray().map((row) => Object.freeze({ fromLegId: row.from_leg_id, toLegId: row.to_leg_id }))
  }

  private readCascade(cascadeId: string): CascadeRecord | null {
    const row = this.ctx.storage.sql.exec<CascadeRow>(
      `SELECT cascade_id, event_id, bundle_id, principal_id, changed_leg_id, phase,
       affected_json, prior_legs_json, changes_json, net_amount_minor, outcome_json, started_at, updated_at
       FROM cascades WHERE cascade_id = ?`, cascadeId,
    ).toArray()[0]
    return row ? mapCascade(row) : null
  }

  private writeCascade(record: CascadeRecord): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO cascades (
        cascade_id, event_id, bundle_id, principal_id, changed_leg_id, phase, affected_json,
        prior_legs_json, changes_json, net_amount_minor, outcome_json, started_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      record.cascadeId, record.eventId, record.bundleId, record.principalId, record.changedLegId,
      record.phase, JSON.stringify(record.affected), JSON.stringify(record.priorLegs),
      JSON.stringify(record.changes), record.netAmountMinor,
      record.outcome ? JSON.stringify(record.outcome) : null, record.startedAt, record.updatedAt,
    )
  }

  private updateCascade(record: CascadeRecord): void {
    this.ctx.storage.sql.exec(
      `UPDATE cascades SET phase = ?, changes_json = ?, net_amount_minor = ?, outcome_json = ?, updated_at = ?
       WHERE cascade_id = ?`,
      record.phase, JSON.stringify(record.changes), record.netAmountMinor,
      record.outcome ? JSON.stringify(record.outcome) : null, record.updatedAt, record.cascadeId,
    )
  }

  private persistTerminal(
    event: MutationEvent,
    principalId: string,
    phase: 'rejected' | 'no_op',
    affected: readonly string[],
    changes: readonly LegChange[],
    reason: string,
    now: number,
  ): BeginCascadeResult {
    const kind = phase === 'no_op' ? 'no-op' : 'rejected'
    const cascadeId = cascadeIdFor(event)
    const outcome: CascadeOutcome = Object.freeze({
      kind, cascadeId, bundleId: event.bundleId, changedLegId: event.legId, affected, changes,
      netAmountMinor: 0, settlementCalls: 0, reason, archiveDeferred: false, elapsedMs: 0,
    })
    const record: CascadeRecord = Object.freeze({
      cascadeId, eventId: event.eventId, bundleId: event.bundleId, principalId,
      changedLegId: event.legId, phase, affected, priorLegs: Object.freeze([]), changes,
      netAmountMinor: 0, outcome, startedAt: now, updatedAt: now,
    })
    this.ctx.storage.transactionSync(() => {
      this.writeCascade(record)
      this.appendCostLog(cascadeId, 'Reopt_Worker', 0, 0, 0, now)
    })
    this.appendSessionLog(record, kind, reason, now)
    return { kind: 'terminal', record, outcome }
  }

  private insertLeg(leg: Leg): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO legs (
        leg_id, principal_id, category, committed_offer_id, committed_amount_minor, last_cascade_id
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      leg.legId, leg.principalId, leg.category, leg.committedOfferId,
      leg.committedAmountMinor, leg.lastCascadeId,
    )
  }

  private restoreLeg(leg: Leg): void {
    this.ctx.storage.sql.exec(
      `UPDATE legs SET principal_id = ?, category = ?, committed_offer_id = ?,
       committed_amount_minor = ?, last_cascade_id = ? WHERE leg_id = ?`,
      leg.principalId, leg.category, leg.committedOfferId,
      leg.committedAmountMinor, leg.lastCascadeId, leg.legId,
    )
  }

  private appendSessionLog(record: CascadeRecord, eventType: string, reason: string | null, now: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO session_log (
        cascade_id, event_type, changed_leg_id, affected_json, outcome, reason, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      record.cascadeId, eventType, record.changedLegId, JSON.stringify(record.affected),
      record.outcome?.kind ?? null, reason, now,
    )
  }

  private appendCostLog(
    cascadeId: string,
    component: string,
    promptTokens: number,
    completionTokens: number,
    dollarCost: number,
    now: number,
  ): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO cost_log (
        cascade_id, component, prompt_tokens, completion_tokens, dollar_cost, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      cascadeId, component, promptTokens, completionTokens, dollarCost, now,
    )
  }

  private broadcast(outcome: CascadeOutcome): void {
    const message = JSON.stringify({ type: 'cascade-outcome', outcome })
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message) } catch { socket.close(1011, 'delivery-failed') }
    }
  }
}

function validateSeed(seed: BundleSeed): Rejection | null {
  if (!seed || !isIdentifier(seed.bundleId) || !isIdentifier(seed.principalId) || !isMinorUnits(seed.totalBudgetMinor)) {
    return { kind: 'rejected', reason: 'bundle-malformed' }
  }
  if (!Array.isArray(seed.legs) || seed.legs.length === 0 || seed.legs.length > MAX_BUNDLE_LEGS) {
    return { kind: 'rejected', reason: 'scale-boundary-legs', details: { limit: MAX_BUNDLE_LEGS, observed: seed.legs?.length ?? -1 } }
  }
  if (!Array.isArray(seed.edges) || seed.edges.length > MAX_BUNDLE_EDGES) {
    return { kind: 'rejected', reason: 'scale-boundary-edges', details: { limit: MAX_BUNDLE_EDGES, observed: seed.edges?.length ?? -1 } }
  }
  if (new Set(seed.legs.map((leg) => leg.legId)).size !== seed.legs.length) return { kind: 'rejected', reason: 'duplicate-leg' }
  if (seed.legs.some((leg) => !isIdentifier(leg.legId) || leg.principalId !== seed.principalId || !isIdentifier(leg.category))) {
    return { kind: 'rejected', reason: 'cross-principal-bundle' }
  }
  return null
}

function mapLeg(row: LegRow): Leg {
  return Object.freeze({
    legId: row.leg_id, principalId: row.principal_id, category: row.category,
    committedOfferId: row.committed_offer_id, committedAmountMinor: row.committed_amount_minor,
    lastCascadeId: row.last_cascade_id,
  })
}

function mapCascade(row: CascadeRow): CascadeRecord {
  return Object.freeze({
    cascadeId: row.cascade_id, eventId: row.event_id, bundleId: row.bundle_id,
    principalId: row.principal_id, changedLegId: row.changed_leg_id, phase: row.phase,
    affected: Object.freeze(JSON.parse(row.affected_json) as string[]),
    priorLegs: Object.freeze(JSON.parse(row.prior_legs_json) as Leg[]),
    changes: Object.freeze(JSON.parse(row.changes_json) as LegChange[]),
    netAmountMinor: row.net_amount_minor,
    outcome: row.outcome_json ? Object.freeze(JSON.parse(row.outcome_json) as CascadeOutcome) : null,
    startedAt: row.started_at, updatedAt: row.updated_at,
  })
}
