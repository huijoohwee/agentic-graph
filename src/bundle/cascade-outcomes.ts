import type { CascadeRecord, RuntimeCascadeOutcome } from './bundle-types'

export function committedOutcome(record: CascadeRecord, archiveDeferred: boolean): RuntimeCascadeOutcome {
  return Object.freeze({
    kind: 'committed', cascadeId: record.cascadeId, bundleId: record.bundleId,
    changedLegId: record.changedLegId, affected: record.affected, changes: record.changes,
    netAmountMinor: record.netAmountMinor, settlementCalls: record.settlementAttempts,
    reason: null, archiveDeferred, elapsedMs: Math.max(0, record.updatedAt - record.startedAt),
  })
}
