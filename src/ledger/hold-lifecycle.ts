import type { Reservation } from '../bundle/bundle-types'

type HoldBalance = Readonly<Pick<Reservation, 'amountMinor' | 'state'>>
type TransitionableHold = Readonly<{
  state: Reservation['state']
  [key: string]: unknown
}>

export type HoldTransitionResult<Hold extends TransitionableHold = Reservation> =
  | Readonly<{ ok: true; hold: Hold; changed: boolean; idempotent: boolean }>
  | Readonly<{ ok: false; reason: 'illegal-transition' }>

export function transitionHold<Hold extends TransitionableHold>(
  hold: Hold,
  target: 'committed' | 'released',
): HoldTransitionResult<Hold> {
  if (hold.state === target) return { ok: true, hold, changed: false, idempotent: true }
  if (hold.state !== 'reserved' && hold.state !== 'quarantined') {
    return { ok: false, reason: 'illegal-transition' }
  }
  return {
    ok: true,
    hold: Object.freeze({ ...hold, state: target }) as Hold,
    changed: true,
    idempotent: false,
  }
}

export function availableBalance(totalBudgetMinor: number, holds: readonly HoldBalance[]): number {
  return totalBudgetMinor - holds.reduce(
    (sum, hold) => sum + (hold.state === 'released' ? 0 : hold.amountMinor),
    0,
  )
}

export function conservesBudget(totalBudgetMinor: number, holds: readonly HoldBalance[]): boolean {
  const active = holds.reduce((sum, hold) => sum + (hold.state === 'released' ? 0 : hold.amountMinor), 0)
  return totalBudgetMinor === availableBalance(totalBudgetMinor, holds) + active
}
