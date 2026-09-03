import { describe, expect, it } from 'vitest'
import type {
  BundleId,
  BundleSeed,
  BundleSnapshot,
  CascadeOutcome,
  CascadeRecord,
  CascadeLegChange,
  CommittedPosition,
  CostEntry,
  EdgeRow,
  Hold,
  Leg,
  LegChange,
  LegId,
  LegRow,
  MinorUnits,
  Quote,
  Reservation,
  ReserveResult,
  RuntimeCascadeOutcome,
} from '../../../../src/bundle/bundle-types'

const bundleId = 'bundle' as BundleId
const legId = 'leg' as LegId
const brandedMinorUnits = 100 as MinorUnits

const validLeg: LegRow = {
  legId,
  principalId: 'principal' as LegRow['principalId'],
  category: 'flight',
  committedOfferId: null,
  committedAmountMinor: brandedMinorUnits,
  lastCascadeId: null,
}

const validEdge: EdgeRow = { fromLegId: legId, toLegId: 'downstream' as LegId }

// @ts-expect-error LegRow is closed: undeclared fields cannot enter the contract.
const excessLeg: LegRow = { ...validLeg, undeclared: true }
// @ts-expect-error EdgeRow is closed: undeclared fields cannot enter the contract.
const excessEdge: EdgeRow = { ...validEdge, weight: 1 }
// @ts-expect-error Branded BundleId and LegId identities are not interchangeable.
const crossedIdentity: LegId = bundleId
// @ts-expect-error A raw floating-point number is not a branded integer MinorUnits value.
const floatingMoney: MinorUnits = 1.5

type CommittedReason = Extract<CascadeOutcome, { kind: 'committed' }>['reason']
type RolledBackSettlementCalls = Extract<CascadeOutcome, { kind: 'rolled-back' }>['settlementCalls']
type TerminalHold = Extract<Hold, { state: 'committed' | 'released' }>
type RejectedReserve = Extract<ReserveResult, { kind: 'rejected' }>
type OperationalDto =
  | BundleSeed
  | BundleSnapshot
  | CascadeLegChange
  | CascadeOutcome
  | CascadeRecord
  | CommittedPosition
  | CostEntry
  | Hold
  | Leg
  | LegChange
  | LegRow
  | Quote
  | Reservation
  | ReserveResult
  | RuntimeCascadeOutcome
type RawNumberMoneyKey<T> = T extends readonly (infer Item)[]
  ? RawNumberMoneyKey<Item>
  : T extends object
    ? {
        [Key in keyof T]-?: Key extends `${string}Minor`
          ? number extends NonNullable<T[Key]> ? Key : never
          : RawNumberMoneyKey<NonNullable<T[Key]>>
      }[keyof T]
    : never
type IsNever<T> = [T] extends [never] ? true : false
type Assert<T extends true> = T
const allOperationalMoneyIsBranded: Assert<IsNever<RawNumberMoneyKey<OperationalDto>>> = true

// @ts-expect-error A committed outcome cannot carry a rollback reason.
const committedRollbackReason: CommittedReason = 'cascade-timeout'
// @ts-expect-error A rolled-back outcome cannot report a settlement call.
const rolledBackAfterSettlement: RolledBackSettlementCalls = 1
// @ts-expect-error A terminal hold exposes no further transition target.
const terminalTransition: TerminalHold = { state: 'committed', transitionTarget: 'released' }
const rejectedWithHold: RejectedReserve = {
  kind: 'rejected', reason: 'insufficient-envelope',
  // @ts-expect-error A rejected reservation carries no holds.
  holds: [],
}
// @ts-expect-error Operational quotes reject raw numeric monetary values.
const rawQuoteAmount: Quote['amountMinor'] = 100
// @ts-expect-error Operational bundle budgets reject raw numeric monetary values.
const rawBundleBudget: BundleSeed['totalBudgetMinor'] = 1_000
// @ts-expect-error Signed operational settlement deltas still require the monetary brand.
const rawSettlementDelta: RuntimeCascadeOutcome['netAmountMinor'] = -25

describe('closed bundle type contracts', () => {
  it('keeps compile-time assertions in the travel-commerce typecheck graph', () => {
    expect([validLeg, validEdge]).toHaveLength(2)
    void [excessLeg, excessEdge, crossedIdentity, floatingMoney]
    expect(allOperationalMoneyIsBranded).toBe(true)
    void [
      committedRollbackReason,
      rolledBackAfterSettlement,
      terminalTransition,
      rejectedWithHold,
      rawQuoteAmount,
      rawBundleBudget,
      rawSettlementDelta,
    ]
  })
})
