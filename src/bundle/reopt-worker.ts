import { archiveCascade } from '../archive/provenance-archive'
import {
  DEFAULT_CASCADE_WALL_MS,
  type CascadeOutcome,
  type CascadeRecord,
  type MutationEvent,
  type Rejection,
} from './bundle-types'
import { dispatchAffectedSet, type DispatchResult } from './reopt-dispatch'

export type SettlementResult = Readonly<{
  kind: 'settled'
  settlementId: string
  idempotencyKey: string
}> | Rejection

type WorkerAdapters = Readonly<{
  dispatch?: typeof dispatchAffectedSet
  settle?: (record: CascadeRecord, owner: string, deadlineAt: number) => Promise<SettlementResult>
  archive?: typeof archiveCascade
}>

export class ReoptWorker {
  constructor(
    private readonly env: TravelCommerceEnv,
    private readonly ctx: ExecutionContext,
    private readonly adapters: WorkerAdapters = {},
  ) {}

  async handleMutation(event: MutationEvent): Promise<CascadeOutcome | Rejection | Readonly<{ kind: 'pending'; cascadeId: string }>> {
    const startedAt = Date.now()
    const wallMs = readWallClock(this.env.CASCADE_WALL_MS)
    const deadlineAt = startedAt + wallMs
    const owner = crypto.randomUUID()
    const graph = this.env.BUNDLE_GRAPH.getByName(event.bundleId)
    let begin
    try {
      begin = await graph.beginCascade(event, startedAt)
    } catch {
      return { kind: 'rejected', reason: 'store-unavailable' }
    }
    const ledger = begin.record.principalId
      ? this.env.ENVELOPE_LEDGER.getByName(begin.record.principalId)
      : null
    if (begin.kind === 'terminal') {
      if (begin.outcome.kind === 'rolled-back' && ledger) await ledger.releaseCascade(begin.record.cascadeId)
      return begin.outcome
    }
    let record = begin.record
    let settlementApplied = record.phase === 'finalizing' && record.netAmountMinor !== 0
    let holdsCommitted = false
    try {
      if (record.phase === 'quoting') {
        const snapshot = await graph.getSnapshot()
        if (!snapshot) return this.rollback(graph, ledger, record, 'store-unavailable')
        const dispatch = this.adapters.dispatch ?? dispatchAffectedSet
        const quoted = await dispatch(
          record, snapshot.legs, this.env.DISCOVERY_SERVICE, this.ctx, deadlineAt,
        )
        if (quoted.kind === 'rejected') return this.rollback(graph, ledger, record, quoted.reason)
        if (!ledger) return this.rollback(graph, null, record, 'envelope-unavailable')
        const reservation = await ledger.checkAndReserveCascade(record.cascadeId, quoted.quotes)
        if (reservation.kind === 'rejected') return this.rollback(graph, ledger, record, reservation.reason)
        await graph.recordHarnessCosts(record.cascadeId, quoted.quotes)
        const prepared = await graph.prepareCommit(record.cascadeId, quoted.quotes)
        if (isRejection(prepared)) {
          return this.rollback(graph, ledger, record, prepared.reason)
        }
        record = prepared
      }
      if ((record.phase === 'settlement_pending' || record.phase === 'settling') && record.netAmountMinor !== 0) {
        const claim = await graph.claimSettlement(record.cascadeId, owner)
        if (claim.kind === 'rejected') return this.rollback(graph, ledger, record, claim.reason)
        if (claim.kind === 'busy') return { kind: 'pending', cascadeId: record.cascadeId }
        if (claim.kind === 'claimed') {
          const settle = this.adapters.settle ?? ((candidate, claimOwner, deadline) => this.settle(candidate, claimOwner, deadline))
          const settled = await settle(record, owner, deadlineAt)
          if (settled.kind === 'rejected') return this.rollback(graph, ledger, record, settled.reason)
          settlementApplied = true
          const marked = await graph.markSettlementComplete(record.cascadeId, owner)
          if (isRejection(marked)) {
            return { kind: 'pending', cascadeId: record.cascadeId }
          }
          record = marked
        }
      }
      if (!ledger) {
        return settlementApplied
          ? { kind: 'pending', cascadeId: record.cascadeId }
          : this.rollback(graph, null, record, 'envelope-unavailable')
      }
      const committedHolds = await ledger.commitCascade(record.cascadeId)
      if (committedHolds.kind === 'rejected') {
        return settlementApplied
          ? { kind: 'pending', cascadeId: record.cascadeId }
          : this.rollback(graph, ledger, record, committedHolds.reason)
      }
      holdsCommitted = true
      const snapshot = await graph.getSnapshot()
      if (!snapshot) return { kind: 'pending', cascadeId: record.cascadeId }
      const candidate = buildCommittedOutcome(record, Date.now())
      let archiveDeferred = false
      try {
        const archive = this.adapters.archive ?? archiveCascade
        await archive(this.env.PROVENANCE_ARCHIVE, snapshot, candidate)
      } catch (error) {
        archiveDeferred = true
        log('error', 'provenance archive deferred', {
          cascadeId: record.cascadeId,
          reason: error instanceof Error ? error.message : 'archive-failed',
        })
      }
      return graph.finishCascade(record.cascadeId, archiveDeferred)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'cascade-failed'
      if (settlementApplied || holdsCommitted) {
        log('error', 'cascade finalization deferred', { cascadeId: record.cascadeId, reason })
        return { kind: 'pending', cascadeId: record.cascadeId }
      }
      return this.rollback(graph, ledger, record, reason)
    }
  }

  private async settle(record: CascadeRecord, owner: string, deadlineAt: number): Promise<SettlementResult> {
    if (Date.now() >= deadlineAt) return { kind: 'rejected', reason: 'cascade-timeout' }
    const response = await this.env.ISSUANCE_SERVICE.fetch(new Request(
      'https://issuance-service.internal/v1/net-settlements',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': record.cascadeId,
          'x-knowgrph-component': 'Issuance_Service',
        },
        body: JSON.stringify({
          operation: 'settleNet',
          cascadeId: record.cascadeId,
          bundleId: record.bundleId,
          principalId: record.principalId,
          amountMinor: record.netAmountMinor,
          currency: this.env.SETTLEMENT_CURRENCY,
          caller: 'Issuance_Service',
          claimOwner: owner,
        }),
      },
    ))
    if (!response.ok) return { kind: 'rejected', reason: `settlement-failed-${response.status}` }
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'rejected', reason: 'settlement-malformed' }
    const result = value as Record<string, unknown>
    if (result.ok !== true || result.idempotencyKey !== record.cascadeId || typeof result.settlementId !== 'string') {
      return { kind: 'rejected', reason: 'settlement-malformed' }
    }
    return Object.freeze({
      kind: 'settled', settlementId: result.settlementId, idempotencyKey: record.cascadeId,
    })
  }

  private async rollback(
    graph: DurableObjectStub<import('./bundle-graph-store').BundleGraphStore>,
    ledger: DurableObjectStub<import('../ledger/envelope-ledger').EnvelopeLedger> | null,
    record: CascadeRecord,
    reason: string,
  ): Promise<CascadeOutcome | Rejection> {
    const outcome = await graph.rollbackCascade(record.cascadeId, reason)
    if (ledger) await ledger.releaseCascade(record.cascadeId)
    return outcome
  }
}

function buildCommittedOutcome(record: CascadeRecord, now: number): CascadeOutcome {
  return Object.freeze({
    kind: 'committed', cascadeId: record.cascadeId, bundleId: record.bundleId,
    changedLegId: record.changedLegId, affected: record.affected, changes: record.changes,
    netAmountMinor: record.netAmountMinor, settlementCalls: record.netAmountMinor === 0 ? 0 : 1,
    reason: null, archiveDeferred: false, elapsedMs: Math.max(0, now - record.startedAt),
  })
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

function log(level: 'info' | 'error', message: string, data: Readonly<Record<string, unknown>>): void {
  const entry = JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...data })
  if (level === 'error') console.error(entry)
  else console.log(entry)
}

function isRejection(value: CascadeRecord | Rejection): value is Rejection {
  return 'kind' in value && value.kind === 'rejected'
}
