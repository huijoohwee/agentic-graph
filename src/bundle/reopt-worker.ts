import {
  CASCADE_POST_DISCOVERY_RESERVE_MS,
  CASCADE_POST_DISCOVERY_RESERVE_RATIO,
  DEFAULT_CASCADE_WALL_MS,
  cascadeIdFor,
} from './bundle-runtime'
import type {
  RuntimeCascadeOutcome,
  CascadeRecord,
  MutationEvent,
  Rejection,
} from './bundle-types'
import {
  recoverPreparedCascade,
  rollbackCascadeSafely,
  type CascadeAdapters,
  type PendingCascade,
  type SettlementResult,
} from './cascade-recovery'
import { dispatchAffectedSet, type DispatchResult } from './reopt-dispatch'
import { CASCADE_DEADLINE, deadlineExpired, rpcPromise, withinCascadeDeadline } from './cascade-deadline'
import type { ReserveResult } from '../ledger/envelope-ledger'
import { resolveMarketplaceVendors } from './bundle-marketplace/client'
import { projectMarketplaceSplits } from './bundle-marketplace/projection'

export type { SettlementResult }

type WorkerAdapters = CascadeAdapters & Readonly<{
  dispatch?: typeof dispatchAffectedSet
}>

export class ReoptWorker {
  constructor(
    private readonly env: TravelCommerceEnv,
    private readonly ctx: ExecutionContext,
    private readonly adapters: WorkerAdapters = {},
  ) {}

  async handleMutation(
    event: MutationEvent,
  ): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
    const startedAt = Date.now()
    const deadlineAt = startedAt + readWallClock(this.env.CASCADE_WALL_MS)
    const graph = this.env.BUNDLE_GRAPH.getByName(event.bundleId)
    let begin
    try {
      begin = await graph.beginCascade(event, startedAt)
    } catch {
      return { kind: 'pending', cascadeId: cascadeIdFor(event), reason: 'store-unavailable' }
    }
    if (begin.kind === 'pending') return begin
    const ledger = begin.record.principalId
      ? this.env.ENVELOPE_LEDGER.getByName(begin.record.principalId)
      : null
    if (begin.kind === 'terminal') {
      if (
        begin.outcome.kind === 'rolled-back'
        && begin.outcome.releaseConfirmed !== true
        && ledger
      ) return recoverPreparedCascade(graph, this.env, begin.record, deadlineAt, this.adapters)
      if (begin.outcome.kind === 'committed' && begin.outcome.archiveDeferred) {
        return recoverPreparedCascade(graph, this.env, begin.record, deadlineAt, this.adapters)
      }
      if (begin.outcome.kind === 'reconciliation-required' && ledger) {
        return recoverPreparedCascade(graph, this.env, begin.record, deadlineAt, this.adapters)
      }
      return begin.outcome
    }
    let record: CascadeRecord = begin.record
    try {
      if (record.phase === 'quoting') {
        const discoveryDeadlineAt = discoveryPhaseDeadline(startedAt, deadlineAt)
        const snapshot = await withinCascadeDeadline(() => graph.getSnapshot(), deadlineAt)
        if (snapshot === CASCADE_DEADLINE) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        if (!snapshot) return this.rollback(graph, ledger, record, 'store-unavailable', deadlineAt)
        const dispatch = this.adapters.dispatch ?? dispatchAffectedSet
        const quoted = await withinCascadeDeadline(
          () => dispatch(
            record,
            snapshot.legs,
            this.env.DISCOVERY_SERVICE,
            this.ctx,
            discoveryDeadlineAt,
          ),
          discoveryDeadlineAt,
        )
        if (quoted === CASCADE_DEADLINE) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        if (quoted.kind === 'rejected') return this.rollback(graph, ledger, record, quoted.reason, deadlineAt)
        if (deadlineExpired(deadlineAt)) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        if (quoted.quotes.some((quote) => quote.currency !== this.env.SETTLEMENT_CURRENCY)) {
          return this.rollback(graph, ledger, record, 'quote-currency-mismatch', deadlineAt)
        }
        if (quoted.quotes.some((quote) => (
          quote.priceVerification !== 'verified'
          && !(this.env.DEPLOY_LANE !== 'Production_Lane' && quote.priceVerification === 'deterministic-demo')
        ))) return this.rollback(graph, ledger, record, 'quote-unverified', deadlineAt)
        const marketplace = await withinCascadeDeadline(
          () => resolveMarketplaceVendors(
            this.env.MARKETPLACE_SERVICE,
            quoted.quotes.map((quote) => quote.agentId),
          ),
          deadlineAt,
        )
        if (marketplace === CASCADE_DEADLINE) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        if (!marketplace.ok) return this.rollback(graph, ledger, record, marketplace.reason, deadlineAt)
        const splits = projectMarketplaceSplits(record.bundleId, quoted.quotes, marketplace.vendors)
        if (!splits) return this.rollback(graph, ledger, record, 'marketplace-split-rejected', deadlineAt)
        if (!ledger) return this.rollback(graph, null, record, 'envelope-unavailable', deadlineAt)
        const reservation = await withinCascadeDeadline(
          () => rpcPromise<ReserveResult>(
            ledger.checkAndReserveCascade(record.cascadeId, record.bundleId, quoted.quotes),
          ), deadlineAt,
        )
        if (reservation === CASCADE_DEADLINE) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        if (reservation.kind === 'rejected') {
          return this.rollback(graph, ledger, record, reservation.reason, deadlineAt)
        }
        const recorded = await withinCascadeDeadline(
          () => graph.recordHarnessCosts(record.cascadeId, quoted.quotes), deadlineAt,
        )
        if (recorded === CASCADE_DEADLINE) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        const prepared = await withinCascadeDeadline(
          () => rpcPromise<CascadeRecord | Rejection>(
            graph.prepareCommit(record.cascadeId, quoted.quotes, splits),
          ), deadlineAt,
        )
        if (prepared === CASCADE_DEADLINE) {
          return this.rollback(graph, ledger, record, 'cascade-timeout', deadlineAt)
        }
        if (isRejection(prepared)) {
          return this.rollback(graph, ledger, record, prepared.reason, deadlineAt)
        }
        record = prepared
      }
      return await recoverPreparedCascade(graph, this.env, record, deadlineAt, this.adapters)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'cascade-failed'
      if (record.phase !== 'quoting') {
        log('error', 'cascade finalization deferred', { cascadeId: record.cascadeId, reason })
        try { await graph.deferRecovery(record.cascadeId, reason) } catch { /* alarm already scheduled */ }
        return { kind: 'pending', cascadeId: record.cascadeId, reason }
      }
      return this.rollback(graph, ledger, record, reason, deadlineAt)
    }
  }

  private async rollback(
    graph: DurableObjectStub<import('./bundle-graph-store').BundleGraphStore>,
    ledger: DurableObjectStub<import('../ledger/envelope-ledger').EnvelopeLedger> | null,
    record: CascadeRecord,
    reason: string,
    deadlineAt: number,
  ): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
    if (ledger) return rollbackCascadeSafely(graph, ledger, record, reason, deadlineAt)
    const outcome = await withinCascadeDeadline(
      () => rpcPromise<RuntimeCascadeOutcome | Rejection>(graph.rollbackCascade(record.cascadeId, reason)),
      deadlineAt,
    )
    if (outcome === CASCADE_DEADLINE) {
      return { kind: 'pending', cascadeId: record.cascadeId, reason: 'cascade-timeout' }
    }
    return isRejection(outcome) ? outcome : graph.confirmRollbackRelease(record.cascadeId)
  }
}

export function discoveryPhaseDeadline(startedAt: number, cascadeDeadlineAt: number): number {
  const wallMs = Math.max(1, cascadeDeadlineAt - startedAt)
  const reserveMs = Math.max(1, Math.min(
    CASCADE_POST_DISCOVERY_RESERVE_MS,
    Math.floor(wallMs * CASCADE_POST_DISCOVERY_RESERVE_RATIO),
  ))
  return cascadeDeadlineAt - reserveMs
}

function readWallClock(value: string): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= DEFAULT_CASCADE_WALL_MS
    ? parsed
    : DEFAULT_CASCADE_WALL_MS
}

export function dispatchMetrics(result: DispatchResult): Readonly<Record<string, number>> {
  return Object.freeze({ quoteCount: result.quoteCount, rejectCount: result.rejectCount })
}

function log(level: 'error', message: string, data: Readonly<Record<string, unknown>>): void {
  console.error(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...data }))
}

function isRejection(value: CascadeRecord | RuntimeCascadeOutcome | Rejection): value is Rejection {
  return 'kind' in value && value.kind === 'rejected'
}
