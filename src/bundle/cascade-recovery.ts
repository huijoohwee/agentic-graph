import { archiveCascade, isArchiveConflict } from '../archive/provenance-archive'
import type { EnvelopeLedger } from '../ledger/envelope-ledger'
import type {
  BundleSnapshot,
  RuntimeCascadeOutcome,
  CascadeRecord,
  Rejection,
} from './bundle-types'
import { isIdentifier } from './bundle-runtime'
import { CASCADE_DEADLINE, deadlineExpired, rpcPromise, withinCascadeDeadline } from './cascade-deadline'

type ProtectResult = Awaited<ReturnType<EnvelopeLedger['protectCascade']>>
type QuarantineResult = Awaited<ReturnType<EnvelopeLedger['quarantineCascade']>>
type CommitResult = Awaited<ReturnType<EnvelopeLedger['commitCascade']>>
type ReleaseResult = Awaited<ReturnType<EnvelopeLedger['releaseCascade']>>
const MAX_SETTLEMENT_RESPONSE_BYTES = 16_384

export type PendingCascade = Readonly<{ kind: 'pending'; cascadeId: string; reason: string }>
export type ReconciliationSettlement = Readonly<{
  kind: 'reconciliation-required'
  cascadeId: string
  reason: 'settlement-idempotency-conflict'
}>
export type SettlementResult = Readonly<{
  kind: 'settled'
  settlementId: string
  idempotencyKey: string
}> | Rejection | PendingCascade | ReconciliationSettlement

export type CascadeAdapters = Readonly<{
  settle?: (record: CascadeRecord, deadlineAt: number) => Promise<SettlementResult>
  archive?: typeof archiveCascade
}>

type MaybePromise<T> = T | Promise<T>

export type RecoveryGraph = Readonly<{
  claimSettlement: (
    cascadeId: string,
    owner: string,
  ) => MaybePromise<Readonly<{ kind: 'claimed' | 'busy' | 'not-required'; expiresAt?: number }> | Rejection>
  recordSettlementAttempt: (cascadeId: string, owner: string) => MaybePromise<CascadeRecord | Rejection>
  markSettlementComplete: (cascadeId: string, owner: string) => MaybePromise<CascadeRecord | Rejection>
  commitPreparedCascade: (cascadeId: string) => MaybePromise<CascadeRecord | Rejection>
  getArchiveSnapshot: (cascadeId: string) => MaybePromise<BundleSnapshot | null>
  finishCascade: (cascadeId: string, archiveDeferred: boolean) => MaybePromise<RuntimeCascadeOutcome | Rejection>
  completeDeferredArchive: (cascadeId: string) => MaybePromise<RuntimeCascadeOutcome | Rejection>
  failArchive: (cascadeId: string, reason: string) => MaybePromise<RuntimeCascadeOutcome | Rejection>
  requireReconciliation: (cascadeId: string, reason: string) => MaybePromise<RuntimeCascadeOutcome | Rejection>
  rollbackCascade: (cascadeId: string, reason: string) => MaybePromise<RuntimeCascadeOutcome | Rejection>
  confirmRollbackRelease: (cascadeId: string) => MaybePromise<RuntimeCascadeOutcome | Rejection>
  deferRecovery: (cascadeId: string, reason: string) => MaybePromise<CascadeRecord | Rejection>
}>

export async function recoverPreparedCascade(
  graph: RecoveryGraph,
  env: TravelCommerceEnv,
  record: CascadeRecord,
  deadlineAt: number,
  adapters: CascadeAdapters = {},
): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
  if (record.phase === 'archive_failed') {
    return record.outcome ?? { kind: 'rejected', reason: 'terminal-outcome-missing' }
  }
  if (record.outcome?.kind === 'committed' && record.outcome.archiveDeferred) {
    if (deadlineExpired(deadlineAt)) return record.outcome
    return retryDeferredArchive(graph, env.PROVENANCE_ARCHIVE, record, adapters, deadlineAt)
  }
  const ledger = env.ENVELOPE_LEDGER.getByName(record.principalId)
  if (record.phase === 'reconciliation_required') {
    const reason = record.outcome?.reason ?? 'settlement-outcome-ambiguous'
    await ensureQuarantinedCustody(ledger, record, reason)
    return record.outcome ?? { kind: 'rejected', reason: 'terminal-outcome-missing' }
  }
  if (record.outcome?.kind === 'rolled-back' && record.outcome.releaseConfirmed !== true) {
    return completeRollbackRelease(graph, ledger, record)
  }
  if (deadlineExpired(deadlineAt)) return expireCurrentPhase(graph, ledger, record)
  if (record.phase !== 'archiving') {
    const protectedHolds = await withinCascadeDeadline(
      () => rpcPromise<ProtectResult>(ledger.protectCascade(record.cascadeId)), deadlineAt,
    )
    if (protectedHolds === CASCADE_DEADLINE) return expireCurrentPhase(graph, ledger, record)
    if (protectedHolds.kind === 'rejected') {
      const safeToRollback = record.netAmountMinor === 0 || (
        record.settlementAttempts === 0
        && (record.phase === 'settlement_pending' || record.phase === 'settling')
      )
      return safeToRollback
        ? rollbackCascadeSafely(graph, ledger, record, protectedHolds.reason, deadlineAt)
        : requireCustodyReconciliation(
            graph, ledger, record, `hold-recovery-${protectedHolds.reason}`,
          )
    }
    if (deadlineExpired(deadlineAt)) return expireCurrentPhase(graph, ledger, record)
  }
  let current = record
  if (current.settlementAttempts > 0
    && (current.phase === 'settlement_pending' || current.phase === 'settling')) {
    return requireCustodyReconciliation(graph, ledger, current, 'settlement-outcome-ambiguous')
  }
  if ((current.phase === 'settlement_pending' || current.phase === 'settling') && current.netAmountMinor !== 0) {
    const owner = crypto.randomUUID()
    const claim = await withinCascadeDeadline(
      () => graph.claimSettlement(current.cascadeId, owner), deadlineAt,
    )
    if (claim === CASCADE_DEADLINE) {
      return rollbackCascadeSafely(graph, ledger, current, 'cascade-timeout', deadlineAt)
    }
    if (claim.kind === 'rejected') {
      return rollbackCascadeSafely(graph, ledger, current, claim.reason, deadlineAt)
    }
    if (claim.kind === 'busy') return pending(current, 'settlement-claim-busy')
    if (claim.kind === 'claimed') {
      const attempted = await withinCascadeDeadline(
        () => graph.recordSettlementAttempt(current.cascadeId, owner), deadlineAt,
      )
      if (attempted === CASCADE_DEADLINE) {
        return rollbackCascadeSafely(graph, ledger, current, 'cascade-timeout', deadlineAt)
      }
      if (isRejection(attempted)) return defer(graph, current, attempted.reason)
      current = attempted
      const settle = adapters.settle ?? ((candidate, deadline) => (
        settleCascade(env.ISSUANCE_SERVICE, env.SETTLEMENT_CURRENCY, candidate, deadline)
      ))
      let settled
      try {
        settled = await withinCascadeDeadline(() => settle(current, deadlineAt), deadlineAt)
      } catch {
        return requireCustodyReconciliation(graph, ledger, current, 'settlement-outcome-unknown')
      }
      if (settled === CASCADE_DEADLINE) {
        return requireCustodyReconciliation(graph, ledger, current, 'settlement-outcome-unknown')
      }
      if (settled.kind === 'pending') {
        return requireCustodyReconciliation(graph, ledger, current, settled.reason)
      }
      if (settled.kind === 'reconciliation-required') {
        return requireCustodyReconciliation(graph, ledger, current, settled.reason)
      }
      if (settled.kind === 'rejected') {
        return rollbackCascadeSafely(graph, ledger, current, settled.reason, deadlineAt)
      }
      const marked = await withinCascadeDeadline(
        () => graph.markSettlementComplete(current.cascadeId, owner), deadlineAt,
      )
      if (marked === CASCADE_DEADLINE) {
        return requireCustodyReconciliation(graph, ledger, current, 'settlement-finalization-unknown')
      }
      if (isRejection(marked)) {
        return requireCustodyReconciliation(graph, ledger, current, `settlement-finalization-${marked.reason}`)
      }
      current = marked
    }
  }
  if (current.phase === 'finalizing') {
    if (deadlineExpired(deadlineAt)) return expireCurrentPhase(graph, ledger, current)
    const committed = await withinCascadeDeadline(
      () => rpcPromise<CommitResult>(ledger.commitCascade(current.cascadeId)), deadlineAt,
    )
    if (committed === CASCADE_DEADLINE) return defer(graph, current, 'cascade-timeout')
    if (committed.kind === 'rejected') return defer(graph, current, committed.reason)
    const applied = await withinCascadeDeadline(
      () => graph.commitPreparedCascade(current.cascadeId), deadlineAt,
    )
    if (applied === CASCADE_DEADLINE) return defer(graph, current, 'cascade-timeout')
    if (isRejection(applied)) return defer(graph, current, applied.reason)
    current = applied
  }
  if (current.phase !== 'archiving') return pending(current, 'cascade-phase-pending')
  if (deadlineExpired(deadlineAt)) return graph.finishCascade(current.cascadeId, true)
  const snapshot = await withinCascadeDeadline(
    () => graph.getArchiveSnapshot(current.cascadeId), deadlineAt,
  )
  if (snapshot === CASCADE_DEADLINE) return graph.finishCascade(current.cascadeId, true)
  if (!snapshot) return defer(graph, current, 'archive-snapshot-unavailable')
  const candidate = canonicalArchiveOutcome(current)
  try {
    const archive = adapters.archive ?? archiveCascade
    const archived = await withinCascadeDeadline(
      () => archive(env.PROVENANCE_ARCHIVE, snapshot, candidate), deadlineAt,
    )
    if (archived === CASCADE_DEADLINE) return graph.finishCascade(current.cascadeId, true)
    return graph.finishCascade(current.cascadeId, false)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'archive-failed'
    log('error', 'provenance archive deferred', { cascadeId: current.cascadeId, reason })
    if (isArchiveConflict(error)) return graph.failArchive(current.cascadeId, reason)
    return graph.finishCascade(current.cascadeId, true)
  }
}

export async function settleCascade(
  issuance: Fetcher,
  currency: string,
  record: CascadeRecord,
  deadlineAt: number,
): Promise<SettlementResult> {
  const remainingMs = deadlineAt - Date.now()
  if (remainingMs <= 0) return pending(record, 'settlement-deadline-exceeded')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('settlement-deadline-exceeded'), remainingMs)
  try {
    const response = await issuance.fetch(new Request('https://issuance-service.internal/v1/net-settlements', {
      method: 'POST',
      signal: controller.signal,
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
        currency,
        caller: 'Issuance_Service',
      }),
    }))
    const result = await readSettlementResponse(response)
    if (response.status === 409) {
      return result?.ok === false
        && result.code === 'idempotency-conflict'
        && result.idempotencyKey === record.cascadeId
        ? Object.freeze({
            kind: 'reconciliation-required', cascadeId: record.cascadeId,
            reason: 'settlement-idempotency-conflict',
          })
        : pending(record, 'settlement-retryable-409')
    }
    if (response.status === 422) {
      return result?.ok === false
        && result.code === 'settlement-effect-rejected'
        && result.idempotencyKey === record.cascadeId
        && result.definitive === true
        && result.effectApplied === false
        ? { kind: 'rejected', reason: 'settlement-effect-rejected' }
        : pending(record, 'settlement-response-ambiguous')
    }
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return pending(record, `settlement-retryable-${response.status}`)
    }
    if (!response.ok) return { kind: 'rejected', reason: `settlement-failed-${response.status}` }
    const expectedEffect = record.netAmountMinor > 0 ? 'charged' : 'refunded'
    if (
      result?.ok !== true
      || result.idempotencyKey !== record.cascadeId
      || result.amountMinor !== record.netAmountMinor
      || result.currency !== currency
      || result.effect !== expectedEffect
      || !isIdentifier(result.settlementId)
      || !isIdentifier(result.providerReference)
    ) return pending(record, 'settlement-response-ambiguous')
    return Object.freeze({
      kind: 'settled', settlementId: result.settlementId, idempotencyKey: record.cascadeId,
    })
  } catch {
    return pending(record, 'settlement-outcome-unknown')
  } finally {
    clearTimeout(timeout)
  }
}

async function readSettlementResponse(response: Response): Promise<Record<string, unknown> | null> {
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_SETTLEMENT_RESPONSE_BYTES) {
    await response.body?.cancel()
    return null
  }
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_SETTLEMENT_RESPONSE_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

async function retryDeferredArchive(
  graph: RecoveryGraph,
  bucket: R2Bucket,
  record: CascadeRecord,
  adapters: CascadeAdapters,
  deadlineAt: number,
): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
  const snapshot = await withinCascadeDeadline(
    () => graph.getArchiveSnapshot(record.cascadeId), deadlineAt,
  )
  if (snapshot === CASCADE_DEADLINE) return record.outcome ?? pending(record, 'cascade-timeout')
  if (!snapshot) return defer(graph, record, 'archive-snapshot-unavailable')
  try {
    const archive = adapters.archive ?? archiveCascade
    const archived = await withinCascadeDeadline(
      () => archive(bucket, snapshot, canonicalArchiveOutcome(record)), deadlineAt,
    )
    if (archived === CASCADE_DEADLINE) return record.outcome ?? pending(record, 'cascade-timeout')
    return graph.completeDeferredArchive(record.cascadeId)
  } catch (error) {
    if (isArchiveConflict(error)) {
      return graph.failArchive(record.cascadeId, error.message)
    }
    return defer(graph, record, error instanceof Error ? error.message : 'archive-retry-failed')
  }
}

export async function rollbackCascadeSafely(
  graph: RecoveryGraph,
  ledger: DurableObjectStub<EnvelopeLedger>,
  record: CascadeRecord,
  reason: string,
  deadlineAt?: number,
): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
  const rollback = Promise.resolve(graph.rollbackCascade(record.cascadeId, reason))
  void rollback.catch(() => undefined)
  const outcome = deadlineAt == null
    ? await rollback
    : await withinCascadeDeadline(() => rollback, deadlineAt)
  if (outcome === CASCADE_DEADLINE) return pending(record, 'cascade-timeout')
  if (isRejection(outcome)) return outcome
  return completeRollbackRelease(graph, ledger, record, deadlineAt)
}

async function completeRollbackRelease(
  graph: RecoveryGraph,
  ledger: DurableObjectStub<EnvelopeLedger>,
  record: CascadeRecord,
  deadlineAt?: number,
): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
  try {
    const release = Promise.resolve(rpcPromise<ReleaseResult>(ledger.releaseCascade(record.cascadeId)))
    void release.catch(() => undefined)
    const released = deadlineAt == null
      ? await release
      : await withinCascadeDeadline(() => release, deadlineAt)
    if (released === CASCADE_DEADLINE) {
      await graph.deferRecovery(record.cascadeId, 'cascade-timeout')
      return pending(record, 'cascade-timeout')
    }
    if (released.kind === 'rejected') {
      return graph.requireReconciliation(record.cascadeId, `hold-release-${released.reason}`)
    }
    return graph.confirmRollbackRelease(record.cascadeId)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'hold-release-unavailable'
    return defer(graph, record, `hold-release-${reason}`)
  }
}

function expireCurrentPhase(
  graph: RecoveryGraph,
  ledger: DurableObjectStub<EnvelopeLedger>,
  record: CascadeRecord,
): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> | RuntimeCascadeOutcome | Rejection {
  if (record.phase === 'archiving') return graph.finishCascade(record.cascadeId, true)
  const preEffect = record.settlementAttempts === 0 && (
    record.phase === 'settlement_pending'
    || record.phase === 'settling'
    || (record.phase === 'finalizing' && record.netAmountMinor === 0)
  )
  return preEffect
    ? rollbackCascadeSafely(graph, ledger, record, 'cascade-timeout')
    : requireCustodyReconciliation(graph, ledger, record, 'settlement-outcome-unknown')
}

async function requireCustodyReconciliation(
  graph: RecoveryGraph,
  ledger: DurableObjectStub<EnvelopeLedger>,
  record: CascadeRecord,
  reason: string,
): Promise<RuntimeCascadeOutcome | Rejection | PendingCascade> {
  const custody = await ensureQuarantinedCustody(ledger, record, reason)
  if (custody.kind === 'rejected'
    && custody.reason !== 'illegal-transition'
    && custody.reason !== 'unknown-cascade-holds') {
    return defer(graph, record, `custody-quarantine-${custody.reason}`)
  }
  return graph.requireReconciliation(record.cascadeId, reason)
}

async function ensureQuarantinedCustody(
  ledger: DurableObjectStub<EnvelopeLedger>,
  record: CascadeRecord,
  _reason: string,
): Promise<QuarantineResult> {
  try {
    return await rpcPromise<QuarantineResult>(ledger.quarantineCascade(
      record.cascadeId, 'settlement-outcome-requires-reconciliation',
    ))
  } catch (error) {
    return {
      kind: 'rejected',
      reason: error instanceof Error ? error.message : 'custody-quarantine-unavailable',
    }
  }
}

async function defer(
  graph: RecoveryGraph,
  record: CascadeRecord,
  reason: string,
): Promise<PendingCascade | Rejection> {
  const deferred = await graph.deferRecovery(record.cascadeId, reason)
  return isRejection(deferred) ? deferred : pending(deferred, reason)
}

function canonicalArchiveOutcome(record: CascadeRecord): RuntimeCascadeOutcome {
  if (record.outcome?.kind === 'committed') {
    return Object.freeze({ ...record.outcome, archiveDeferred: false, reason: null })
  }
  return Object.freeze({
    kind: 'committed',
    cascadeId: record.cascadeId,
    bundleId: record.bundleId,
    changedLegId: record.changedLegId,
    affected: record.affected,
    changes: record.changes,
    netAmountMinor: record.netAmountMinor,
    settlementCalls: record.settlementAttempts,
    reason: null,
    archiveDeferred: false,
    elapsedMs: Math.max(0, record.updatedAt - record.startedAt),
  })
}

function pending(record: Pick<CascadeRecord, 'cascadeId'>, reason: string): PendingCascade {
  return Object.freeze({ kind: 'pending', cascadeId: record.cascadeId, reason })
}

function isRejection(value: CascadeRecord | RuntimeCascadeOutcome | Rejection): value is Rejection {
  return 'kind' in value && value.kind === 'rejected'
}

function log(level: 'error', message: string, data: Readonly<Record<string, unknown>>): void {
  console.error(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...data }))
}
