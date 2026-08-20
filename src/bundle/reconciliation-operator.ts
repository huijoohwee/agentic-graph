import type { EnvelopeLedger } from '../ledger/envelope-ledger'
import { DEFAULT_CASCADE_WALL_MS } from './bundle-runtime'
import type {
  ReconciliationDecisionInput,
  Rejection,
  RuntimeCascadeOutcome,
} from './bundle-types'
import type { BundleGraphStore } from './bundle-graph-store'
import { recoverPreparedCascade, type PendingCascade } from './cascade-recovery'

export type OperatorReconciliationResult =
  | Readonly<{
    kind: 'reconciliation-resolved' | 'idempotent'
    decisionId: string
    decision: 'commit' | 'release'
    custody: 'resolved' | 'idempotent'
    outcome: RuntimeCascadeOutcome | PendingCascade
  }>
  | Rejection

export async function resolveOperatorReconciliation(
  env: TravelCommerceEnv,
  bundleId: string,
  cascadeId: string,
  input: ReconciliationDecisionInput,
): Promise<OperatorReconciliationResult> {
  const graph: DurableObjectStub<BundleGraphStore> = env.BUNDLE_GRAPH.getByName(bundleId)
  const current = await graph.getCascade(cascadeId)
  if (!current || current.bundleId !== bundleId) return { kind: 'rejected', reason: 'unknown-cascade' }
  const staged = await graph.stageReconciliationDecision(cascadeId, input)
  if (staged.kind === 'rejected') return staged
  const ledger: DurableObjectStub<EnvelopeLedger> = env.ENVELOPE_LEDGER.getByName(current.principalId)
  const custody = await ledger.resolveReconciliation(cascadeId, input)
  if (custody.kind === 'rejected') return custody
  const applied = await graph.applyReconciliationDecision(cascadeId, input.decisionId)
  if (applied.kind === 'rejected') return applied
  let outcome: RuntimeCascadeOutcome | PendingCascade | null = applied.outcome
  if (!outcome && applied.record.phase === 'archiving') {
    const wallMs = boundedWallClock(env.CASCADE_WALL_MS)
    const recovered = await recoverPreparedCascade(graph, env, applied.record, Date.now() + wallMs)
    if (recovered.kind === 'rejected' && !('cascadeId' in recovered)) return recovered
    outcome = recovered
  }
  if (!outcome) return { kind: 'rejected', reason: 'reconciliation-outcome-unavailable' }
  return Object.freeze({
    kind: staged.kind === 'idempotent' && applied.kind === 'idempotent'
      ? 'idempotent' : 'reconciliation-resolved',
    decisionId: input.decisionId,
    decision: input.decision,
    custody: custody.kind,
    outcome,
  })
}

function boundedWallClock(value: string): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= DEFAULT_CASCADE_WALL_MS
    ? parsed
    : DEFAULT_CASCADE_WALL_MS
}
