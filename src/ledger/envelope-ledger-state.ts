import { isMinorUnits } from '../bundle/bundle-runtime'

export const ENVELOPE_HOLD_RETENTION = Object.freeze({
  schema: 'agenticgraph-envelope-hold-retention/v1',
  mode: 'compact-released-receipts',
  maximumRows: null,
  compactsTerminalPayloads: true,
  exactReplayRetention: 'indefinite',
  activeHoldObservation: 'getHolds-active-only',
  coldStartValidation: 'full-once-per-schema-version',
} as const)

type LedgerStateRow = {
  active_total_minor: number
  revision: number
}

export function activeHoldTotal(ctx: DurableObjectState): number {
  const total = readLedgerState(ctx).active_total_minor
  if (!isMinorUnits(total)) throw new Error('stored-money-malformed')
  return total
}

export function availableFromLedger(ctx: DurableObjectState, totalBudgetMinor: number): number {
  const available = totalBudgetMinor - activeHoldTotal(ctx)
  if (!isMinorUnits(available)) throw new Error('envelope-conservation-violated')
  return available
}

export function ledgerRevision(ctx: DurableObjectState): string {
  return `ledger:${readLedgerState(ctx).revision}`
}

export function assertLedgerConservation(ctx: DurableObjectState, totalBudgetMinor: number): void {
  const activeTotalMinor = activeHoldTotal(ctx)
  if (activeTotalMinor > totalBudgetMinor) throw new Error('envelope-conservation-violated')
}

function readLedgerState(ctx: DurableObjectState): LedgerStateRow {
  const state = ctx.storage.sql.exec<LedgerStateRow>(
    'SELECT active_total_minor, revision FROM envelope_ledger_state WHERE singleton = 1',
  ).one()
  if (!isMinorUnits(state.active_total_minor)
    || !Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new Error('envelope-ledger-state-malformed')
  }
  return state
}
