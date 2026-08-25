import { DurableObject } from 'cloudflare:workers'
import {
  CASCADE_RECOVERY_DELAY_MS,
  CASCADE_RECOVERY_MAX_DELAY_MS,
  DEFAULT_CASCADE_WALL_MS,
  MAX_BUNDLE_EDGES,
  MAX_BUNDLE_LEGS,
  cascadeIdFor,
  isIdentifier,
  isMinorUnits, minorUnits, signedMinorUnits,
} from './bundle-runtime'
import type {
  BeginCascadeResult,
  BundleSeed,
  BundleSnapshot,
  RuntimeCascadeOutcome,
  CascadeRecord,
  Edge,
  Leg,
  LegChange,
  MutationEvent,
  Quote,
  ReconciliationApplyResult,
  ReconciliationDecisionInput,
  ReconciliationDecisionRecord,
  ReconciliationStageResult,
  Rejection,
} from './bundle-types'
import type { MarketplaceSplit } from './bundle-marketplace/contracts'
import { replacePreparedSplits } from './bundle-marketplace/storage'
import {
  commitMarketplaceTransaction,
  marketplaceState,
  recordHarnessCostEntries,
  resolvePreparedMarketplaceSplits,
  runMarketplacePayoutAlarm,
} from './bundle-marketplace/store-integration'
import { type SettlementClaimRow } from './bundle-graph-records'
import { migrateBundleGraph } from './bundle-graph-schema'
import {
  insertLegRow,
  readCascade,
  readEdges,
  readLegs,
  readMeta,
  projectBundleSnapshot,
  readRecoveryCandidate,
  readTopology,
  replaceTopology,
  restoreLeg,
  scheduleNextAlarm,
  updateCascade,
  writeCascade,
} from './bundle-graph-storage'
import { edgeKey, scaleRejection, validateLeg } from './bundle-graph-validation'
import {
  appendCostLog,
  appendSessionLog,
  broadcast,
  readCostLog,
  readSessionLog,
} from './bundle-graph-observability'
import { recoverPreparedCascade, rollbackCascadeSafely } from './cascade-recovery'
import { initializeBundle } from './bundle-graph-initialization'
import { committedOutcome } from './cascade-outcomes'
import {
  claimSettlement as claimSettlementState,
  markSettlementComplete as markSettlementCompleteState,
  recordSettlementAttempt as recordSettlementAttemptState,
} from './bundle-settlement-state'
import { BundleGraphAdjacency, type AdjacencyDiagnostics } from './bundle-graph-adjacency'
import { topologicalOrder, type TopologyResult } from './topo-order'
import {
  applyReconciliationDecision as applyReconciliationState,
  readReconciliationDecision,
  requireReconciliationState,
  stageReconciliationDecision as stageReconciliationState,
} from './bundle-reconciliation'
export class BundleGraphStore extends DurableObject<TravelCommerceEnv> {
  private adjacency!: BundleGraphAdjacency
  constructor(ctx: DurableObjectState, env: TravelCommerceEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.migrate()
      this.adjacency = new BundleGraphAdjacency(readEdges(ctx))
      await scheduleNextAlarm(ctx)
    })
  }
  async initBundle(seed: BundleSeed): Promise<{ kind: 'initialized' | 'idempotent' } | Rejection> {
    const result = await initializeBundle(this.ctx, this.env, seed)
    if (result.kind === 'initialized') this.adjacency.replaceAfterInitialization(seed.edges)
    return result
  }
  async insertLeg(leg: Leg): Promise<{ kind: 'inserted' | 'idempotent'; topology: readonly string[] } | Rejection> {
    const meta = readMeta(this.ctx)
    if (!meta) return { kind: 'rejected', reason: 'bundle-unavailable' }
    const validation = validateLeg(leg, meta.principal_id)
    if (validation) return validation
    if (this.hasActiveCascade()) return { kind: 'rejected', reason: 'bundle-busy' }
    const legs = readLegs(this.ctx)
    const current = legs.find((item) => item.legId === leg.legId)
    if (current) {
      return JSON.stringify(current) === JSON.stringify(leg)
        ? { kind: 'idempotent', topology: readTopology(this.ctx) }
        : { kind: 'rejected', reason: 'duplicate-leg' }
    }
    if (legs.length >= MAX_BUNDLE_LEGS) return scaleRejection('legs', legs.length + 1)
    if (leg.committedOfferId != null && leg.committedAmountMinor != null) {
      return { kind: 'rejected', reason: 'committed-leg-insertion-unsupported' }
    }
    const topology = topologicalOrder(
      [...legs.map((item) => item.legId), leg.legId], this.adjacency.snapshotEdges(),
    )
    if (!topology.ok) return { kind: 'rejected', reason: topology.reason }
    this.ctx.storage.transactionSync(() => {
      insertLegRow(this.ctx, leg)
      replaceTopology(this.ctx, topology.order)
    })
    return { kind: 'inserted', topology: topology.order }
  }
  insertEdge(edge: Edge): { kind: 'inserted' | 'idempotent'; topology: readonly string[] } | Rejection {
    if (!readMeta(this.ctx)) return { kind: 'rejected', reason: 'bundle-unavailable' }
    if (!isIdentifier(edge.fromLegId) || !isIdentifier(edge.toLegId)) {
      return { kind: 'rejected', reason: 'bundle-malformed' }
    }
    if (this.hasActiveCascade()) return { kind: 'rejected', reason: 'bundle-busy' }
    const edges = this.adjacency.snapshotEdges()
    if (edges.some((item) => edgeKey(item) === edgeKey(edge))) {
      return { kind: 'idempotent', topology: readTopology(this.ctx) }
    }
    if (edges.length >= MAX_BUNDLE_EDGES) return scaleRejection('edges', edges.length + 1)
    const topology = topologicalOrder(readLegs(this.ctx).map((leg) => leg.legId), [...edges, edge])
    if (!topology.ok) return { kind: 'rejected', reason: topology.reason }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        'INSERT INTO edges (from_leg_id, to_leg_id) VALUES (?, ?)', edge.fromLegId, edge.toLegId,
      )
      replaceTopology(this.ctx, topology.order)
    })
    this.adjacency.insert(edge)
    return { kind: 'inserted', topology: topology.order }
  }
  async beginCascade(event: MutationEvent, now = Date.now()): Promise<BeginCascadeResult> {
    const cascadeId = cascadeIdFor(event)
    const existing = readCascade(this.ctx, cascadeId)
    if (existing) return existing.outcome
      ? { kind: 'terminal', record: existing, outcome: existing.outcome }
      : { kind: 'resume', record: existing }
    const meta = readMeta(this.ctx)
    if (!meta || meta.bundle_id !== event.bundleId) {
      return this.persistTerminal(event, '', 'rejected', [], [], 'bundle-unavailable', now)
    }
    if (this.hasActiveCascade()) {
      return Object.freeze({ kind: 'pending', cascadeId, reason: 'bundle-busy' })
    }
    const affected = this.affectedSet(event.legId)
    if (!affected.ok) {
      return this.persistTerminal(event, meta.principal_id, 'rejected', [], [], affected.reason, now)
    }
    if (affected.order.length === 0) {
      return this.persistTerminal(event, meta.principal_id, 'no_op', [], [], 'no-outgoing-edges', now)
    }
    const legs = readLegs(this.ctx)
    const priorLegs = affected.order.map((legId) => legs.find((leg) => leg.legId === legId)!)
    const record: CascadeRecord = Object.freeze({
      cascadeId, eventId: event.eventId, bundleId: event.bundleId, principalId: meta.principal_id,
      changedLegId: event.legId, phase: 'quoting', affected: Object.freeze([...affected.order]),
      priorLegs: Object.freeze(priorLegs), changes: Object.freeze([]), netAmountMinor: minorUnits(0),
      outcome: null, startedAt: now, updatedAt: now, recoveryAttempts: 0, settlementAttempts: 0,
      nextRecoveryAt: now + DEFAULT_CASCADE_WALL_MS + CASCADE_RECOVERY_DELAY_MS,
    })
    this.ctx.storage.transactionSync(() => {
      writeCascade(this.ctx, record)
      appendSessionLog(this.ctx, record, 'cascade-started', null, now)
    })
    await scheduleNextAlarm(this.ctx)
    return { kind: 'plan', record }
  }

  prepareCommit(
    cascadeId: string,
    quotes: readonly Quote[],
    marketplaceSplitsOrNow?: readonly MarketplaceSplit[] | number,
    now = Date.now(),
  ): CascadeRecord | Rejection {
    if (typeof marketplaceSplitsOrNow === 'number') now = marketplaceSplitsOrNow
    const record = readCascade(this.ctx, cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.phase !== 'quoting') return record
    const marketplaceSplits = resolvePreparedMarketplaceSplits(
      record, quotes, marketplaceSplitsOrNow,
    )
    if (!marketplaceSplits) return { kind: 'rejected', reason: 'marketplace-split-malformed' }
    const expected = new Set(record.affected)
    if (
      quotes.length !== expected.size
      || new Set(quotes.map((quote) => quote.legId)).size !== quotes.length
      || quotes.some((quote) => (
        quote.kind !== 'offer'
        || !expected.has(quote.legId)
        || !isIdentifier(quote.offerId)
        || !isMinorUnits(quote.amountMinor)
        || quote.currency !== this.env.SETTLEMENT_CURRENCY
        || (quote.priceVerification !== 'verified'
          && !(this.env.DEPLOY_LANE !== 'Production_Lane' && quote.priceVerification === 'deterministic-demo'))
      ))
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
        currency: quote.currency,
        agentId: quote.agentId,
        priceVerification: quote.priceVerification,
        provenance: quote.provenance,
      })
    })
    const netAmountMinor = changes.reduce(
      (sum, change) => sum + change.newAmountMinor - (change.priorAmountMinor ?? 0), 0,
    )
    if (!Number.isSafeInteger(netAmountMinor)) return { kind: 'rejected', reason: 'requote-malformed' }
    const next: CascadeRecord = Object.freeze({
      ...record,
      phase: netAmountMinor === 0 ? 'finalizing' : 'settlement_pending',
      changes: Object.freeze(changes), netAmountMinor: signedMinorUnits(netAmountMinor), updatedAt: now,
      nextRecoveryAt: now + CASCADE_RECOVERY_DELAY_MS,
    })
    this.ctx.storage.transactionSync(() => {
      updateCascade(this.ctx, next)
      replacePreparedSplits(this.ctx, cascadeId, marketplaceSplits)
      appendSessionLog(this.ctx, next, 'commit-prepared', null, now)
    })
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return next
  }

  claimSettlement(
    cascadeId: string,
    owner: string,
    now = Date.now(),
    leaseMs = 15_000,
  ): Readonly<{ kind: 'claimed' | 'busy' | 'not-required'; expiresAt?: number }> | Rejection {
    return claimSettlementState(this.ctx, cascadeId, owner, now, leaseMs)
  }

  markSettlementComplete(cascadeId: string, owner: string, now = Date.now()): CascadeRecord | Rejection {
    return markSettlementCompleteState(this.ctx, cascadeId, owner, now)
  }

  recordSettlementAttempt(cascadeId: string, owner: string, now = Date.now()): CascadeRecord | Rejection {
    return recordSettlementAttemptState(this.ctx, cascadeId, owner, now)
  }

  commitPreparedCascade(cascadeId: string, now = Date.now()): CascadeRecord | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.phase === 'archiving') return record
    if (record.outcome) return record
    if (record.phase !== 'finalizing') return { kind: 'rejected', reason: 'cascade-not-finalizable' }
    const currentSnapshot = this.getSnapshot()
    if (!currentSnapshot) return { kind: 'rejected', reason: 'store-unavailable' }
    const snapshot = projectBundleSnapshot(currentSnapshot, record)
    const next: CascadeRecord = Object.freeze({
      ...record,
      phase: 'archiving',
      updatedAt: now,
      nextRecoveryAt: now + CASCADE_RECOVERY_DELAY_MS,
    })
    this.ctx.storage.transactionSync(() => {
      for (const change of record.changes) {
        this.ctx.storage.sql.exec(
          `UPDATE legs SET committed_offer_id = ?, committed_amount_minor = ?, last_cascade_id = ?
           WHERE leg_id = ?`,
          change.newOfferId, change.newAmountMinor, cascadeId, change.legId,
        )
      }
      commitMarketplaceTransaction(this.ctx, next, now)
      updateCascade(this.ctx, next, JSON.stringify(snapshot))
      appendSessionLog(this.ctx, next, 'bundle-committed', null, now)
    })
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return next
  }

  getArchiveSnapshot(cascadeId: string): BundleSnapshot | null {
    const row = this.ctx.storage.sql.exec<{ archive_snapshot_json: string | null }>(
      'SELECT archive_snapshot_json FROM cascades WHERE cascade_id = ?', cascadeId,
    ).toArray()[0]
    if (!row?.archive_snapshot_json) return null
    const parsed: unknown = JSON.parse(row.archive_snapshot_json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as BundleSnapshot : null
  }

  finishCascade(cascadeId: string, archiveDeferred: boolean, now = Date.now()): RuntimeCascadeOutcome | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.outcome) return record.outcome
    if (record.phase !== 'archiving') {
      return { kind: 'rejected', reason: 'cascade-not-finalizable' }
    }
    const outcome: RuntimeCascadeOutcome = Object.freeze({
      kind: 'committed', cascadeId, bundleId: record.bundleId, changedLegId: record.changedLegId,
      affected: record.affected, changes: record.changes, netAmountMinor: record.netAmountMinor,
      settlementCalls: record.settlementAttempts, reason: null, archiveDeferred,
      elapsedMs: Math.max(0, record.updatedAt - record.startedAt),
    })
    const next = Object.freeze({
      ...record,
      phase: 'committed' as const,
      outcome,
      updatedAt: now,
      nextRecoveryAt: archiveDeferred ? now + CASCADE_RECOVERY_DELAY_MS : null,
    })
    this.ctx.storage.transactionSync(() => {
      updateCascade(this.ctx, next, archiveDeferred ? undefined : null)
      appendCostLog(this.ctx, cascadeId, 'Reopt_Worker', 0, 0, 0, now)
      appendSessionLog(this.ctx, next, archiveDeferred ? 'archive-deferred' : 'cascade-committed', null, now)
    })
    broadcast(this.ctx, outcome)
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return outcome
  }

  completeDeferredArchive(cascadeId: string, now = Date.now()): RuntimeCascadeOutcome | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record?.outcome || record.outcome.kind !== 'committed') {
      return { kind: 'rejected', reason: 'archive-cascade-unavailable' }
    }
    if (!record.outcome.archiveDeferred) return record.outcome
    const outcome = Object.freeze({ ...record.outcome, archiveDeferred: false })
    const next = Object.freeze({ ...record, outcome, updatedAt: now, nextRecoveryAt: null })
    this.ctx.storage.transactionSync(() => {
      updateCascade(this.ctx, next, null)
      appendSessionLog(this.ctx, next, 'archive-recovered', null, now)
    })
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return outcome
  }

  failArchive(cascadeId: string, reason: string, now = Date.now()): RuntimeCascadeOutcome | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.phase === 'archive_failed' && record.outcome) return record.outcome
    if (record.phase !== 'archiving' && !(record.outcome?.kind === 'committed' && record.outcome.archiveDeferred)) {
      return { kind: 'rejected', reason: 'archive-cascade-unavailable' }
    }
    const base = record.outcome?.kind === 'committed'
      ? record.outcome
      : committedOutcome(record, false)
    const outcome: RuntimeCascadeOutcome = Object.freeze({ ...base, archiveDeferred: true, reason })
    const next = Object.freeze({
      ...record, phase: 'archive_failed' as const, outcome, updatedAt: now, nextRecoveryAt: null,
    })
    this.ctx.storage.transactionSync(() => {
      updateCascade(this.ctx, next)
      appendSessionLog(this.ctx, next, 'archive-operator-action-required', reason, now)
    })
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return outcome
  }

  requireReconciliation(cascadeId: string, reason: string, now = Date.now()): RuntimeCascadeOutcome | Rejection {
    return requireReconciliationState(this.ctx, cascadeId, reason, now)
  }
  stageReconciliationDecision(
    cascadeId: string, input: ReconciliationDecisionInput, now = Date.now(),
  ): ReconciliationStageResult {
    return stageReconciliationState(this.ctx, cascadeId, input, now)
  }
  applyReconciliationDecision(
    cascadeId: string, decisionId: string, now = Date.now(),
  ): ReconciliationApplyResult {
    return applyReconciliationState(this.ctx, cascadeId, decisionId, now)
  }
  getReconciliationDecision(cascadeId: string): ReconciliationDecisionRecord | null {
    return readReconciliationDecision(this.ctx, cascadeId)
  }
  rollbackCascade(cascadeId: string, reason: string, now = Date.now()): RuntimeCascadeOutcome | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (record.outcome) return record.outcome
    if (record.phase === 'archiving' || (record.phase === 'finalizing' && record.netAmountMinor !== 0)) {
      return { kind: 'rejected', reason: 'settlement-finalization-required' }
    }
    const outcome: RuntimeCascadeOutcome = Object.freeze({
      kind: 'rolled-back', cascadeId, bundleId: record.bundleId, changedLegId: record.changedLegId,
      affected: record.affected, changes: record.changes, netAmountMinor: minorUnits(0),
      settlementCalls: record.settlementAttempts,
      reason: reason || 'cascade-failed', archiveDeferred: false, releaseConfirmed: false,
      elapsedMs: Math.max(0, now - record.startedAt),
    })
    const next = Object.freeze({
      ...record,
      phase: 'rolled_back' as const,
      outcome,
      updatedAt: now,
      nextRecoveryAt: now + CASCADE_RECOVERY_DELAY_MS,
    })
    this.ctx.storage.transactionSync(() => {
      for (const prior of record.priorLegs) restoreLeg(this.ctx, prior)
      updateCascade(this.ctx, next)
      this.ctx.storage.sql.exec('DELETE FROM settlement_claims WHERE cascade_id = ?', cascadeId)
      appendSessionLog(this.ctx, next, 'rollback-release-pending', reason, now)
    })
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return outcome
  }
  confirmRollbackRelease(cascadeId: string, now = Date.now()): RuntimeCascadeOutcome | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record?.outcome || record.outcome.kind !== 'rolled-back') {
      return { kind: 'rejected', reason: 'rollback-release-unavailable' }
    }
    if (record.outcome.releaseConfirmed === true) return record.outcome
    const outcome: RuntimeCascadeOutcome = Object.freeze({ ...record.outcome, releaseConfirmed: true })
    const next = Object.freeze({ ...record, outcome, updatedAt: now, nextRecoveryAt: null })
    this.ctx.storage.transactionSync(() => {
      updateCascade(this.ctx, next)
      appendCostLog(this.ctx, cascadeId, 'Reopt_Worker', 0, 0, 0, now)
      appendSessionLog(this.ctx, next, 'cascade-rolled-back', outcome.reason, now)
    })
    broadcast(this.ctx, outcome)
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return outcome
  }
  recordHarnessCosts(cascadeId: string, quotes: readonly Quote[], now = Date.now()): void {
    recordHarnessCostEntries(this.ctx, cascadeId, quotes, now)
  }

  getCascade(cascadeId: string): CascadeRecord | null {
    return readCascade(this.ctx, cascadeId)
  }

  affectedSet(changedLegId: string): TopologyResult {
    return this.adjacency.affectedSet(changedLegId, readLegs(this.ctx).map((leg) => leg.legId))
  }

  isPresent(legId: string): boolean {
    if (!isIdentifier(legId)) return false
    return this.ctx.storage.sql.exec<{ present: number }>(
      'SELECT EXISTS(SELECT 1 FROM legs WHERE leg_id = ?) AS present', legId,
    ).one().present === 1
  }

  getAdjacencyDiagnostics(): AdjacencyDiagnostics {
    return this.adjacency.diagnostics()
  }

  getSnapshot(): BundleSnapshot | null {
    const meta = readMeta(this.ctx)
    return meta ? Object.freeze({
      bundleId: meta.bundle_id,
      principalId: meta.principal_id,
      legs: Object.freeze(readLegs(this.ctx)),
      edges: this.adjacency.snapshotEdges(),
    }) : null
  }

  getSessionLog(): readonly Readonly<Record<string, string | number | null>>[] {
    return readSessionLog(this.ctx)
  }

  getCostLog(): readonly Readonly<Record<string, string | number>>[] {
    return readCostLog(this.ctx)
  }

  getMarketplaceState(): Readonly<Record<string, unknown>> {
    return marketplaceState(this.ctx)
  }

  deferRecovery(cascadeId: string, reason: string, now = Date.now()): CascadeRecord | Rejection {
    const record = readCascade(this.ctx, cascadeId)
    if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
    if (
      record.outcome
      && !(record.outcome.kind === 'committed' && record.outcome.archiveDeferred)
      && !(record.outcome.kind === 'rolled-back' && record.outcome.releaseConfirmed !== true)
    ) {
      return { kind: 'rejected', reason: 'cascade-terminal' }
    }
    const attempts = record.recoveryAttempts + 1
    const delay = Math.min(
      CASCADE_RECOVERY_MAX_DELAY_MS,
      CASCADE_RECOVERY_DELAY_MS * (2 ** Math.min(attempts - 1, 8)),
    )
    const claim = this.ctx.storage.sql.exec<SettlementClaimRow>(
      'SELECT owner, expires_at FROM settlement_claims WHERE cascade_id = ?', cascadeId,
    ).toArray()[0]
    const next = Object.freeze({
      ...record,
      recoveryAttempts: attempts,
      nextRecoveryAt: Math.max(now + delay, claim?.expires_at ?? 0),
      updatedAt: now,
    })
    this.ctx.storage.transactionSync(() => {
      updateCascade(this.ctx, next)
      appendSessionLog(this.ctx, next, 'recovery-deferred', reason, now)
    })
    this.ctx.waitUntil(scheduleNextAlarm(this.ctx))
    return next
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    const record = readRecoveryCandidate(this.ctx, now)
    if (record) {
      try {
        if (record.phase === 'quoting') {
          const ledger = this.env.ENVELOPE_LEDGER.getByName(record.principalId)
          await rollbackCascadeSafely(this, ledger, record, 'cascade-recovery-timeout')
        } else {
          await recoverPreparedCascade(this, this.env, record, now + DEFAULT_CASCADE_WALL_MS)
        }
      } catch (error) {
        this.deferRecovery(
          record.cascadeId,
          error instanceof Error ? error.message : 'cascade-recovery-failed',
          now,
        )
      }
    }
    await runMarketplacePayoutAlarm(this.ctx, this.env)
    await scheduleNextAlarm(this.ctx)
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ ok: false, reason: 'websocket-upgrade-required' }, { status: 426 })
    }
    const protocols = (request.headers.get('sec-websocket-protocol') ?? '')
      .split(',').map((value) => value.trim()).filter(Boolean)
    if (!protocols.includes('knowgrph.v1')) {
      return Response.json({ ok: false, reason: 'websocket-protocol-required' }, { status: 400 })
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ connectedAt: Date.now() })
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { 'sec-websocket-protocol': 'knowgrph.v1' },
    })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === 'string' && message === 'ping') socket.send('pong')
  }

  private hasActiveCascade(): boolean {
    return this.ctx.storage.sql.exec<{ active: number }>(
      `SELECT EXISTS(SELECT 1 FROM cascades
       WHERE outcome_json IS NULL OR phase = 'reconciliation_required' OR (
         phase = 'rolled_back' AND COALESCE(json_extract(outcome_json, '$.releaseConfirmed'), 0) = 0
       )) AS active`,
    ).one().active === 1
  }

  private migrate(): void {
    migrateBundleGraph(this.ctx)
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
    const outcome: RuntimeCascadeOutcome = Object.freeze({
      kind, cascadeId, bundleId: event.bundleId, changedLegId: event.legId, affected, changes,
      netAmountMinor: minorUnits(0), settlementCalls: 0, reason, archiveDeferred: false, elapsedMs: 0,
    })
    const record: CascadeRecord = Object.freeze({
      cascadeId, eventId: event.eventId, bundleId: event.bundleId, principalId,
      changedLegId: event.legId, phase, affected, priorLegs: Object.freeze([]), changes,
      netAmountMinor: minorUnits(0), outcome, startedAt: now, updatedAt: now,
      recoveryAttempts: 0, settlementAttempts: 0, nextRecoveryAt: null,
    })
    this.ctx.storage.transactionSync(() => {
      writeCascade(this.ctx, record)
      appendCostLog(this.ctx, cascadeId, 'Reopt_Worker', 0, 0, 0, now)
      appendSessionLog(this.ctx, record, kind, reason, now)
    })
    return { kind: 'terminal', record, outcome }
  }
}

function isRejection(value: CascadeRecord | RuntimeCascadeOutcome | Rejection): value is Rejection {
  return 'kind' in value && value.kind === 'rejected'
}
