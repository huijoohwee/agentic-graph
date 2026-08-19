import type { Reservation } from '../bundle/bundle-types'

export type HoldTransitionResult =
  | Readonly<{ ok: true; hold: Reservation; changed: boolean }>
  | Readonly<{ ok: false; reason: 'illegal-transition' }>

export function transitionHold(
  hold: Reservation,
  target: 'committed' | 'released',
): HoldTransitionResult {
  if (hold.state === target) return { ok: true, hold, changed: false }
  if (hold.state !== 'reserved') return { ok: false, reason: 'illegal-transition' }
  return { ok: true, hold: Object.freeze({ ...hold, state: target }), changed: true }
}

export function availableBalance(totalBudgetMinor: number, holds: readonly Reservation[]): number {
  return totalBudgetMinor - holds.reduce(
    (sum, hold) => sum + (hold.state === 'released' ? 0 : hold.amountMinor),
    0,
  )
}

export function conservesBudget(totalBudgetMinor: number, holds: readonly Reservation[]): boolean {
  const active = holds.reduce((sum, hold) => sum + (hold.state === 'released' ? 0 : hold.amountMinor), 0)
  return totalBudgetMinor === availableBalance(totalBudgetMinor, holds) + active
}
