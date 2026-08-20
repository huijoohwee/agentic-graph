import {
  HOLD_TTL_MS,
  isCurrency,
  isIdentifier,
  isMinorUnits,
  minorUnits,
} from '../bundle/bundle-runtime'
import type { Quote, Rejection } from '../bundle/bundle-types'
import { compactReleasedHolds, elapsed, verifiedForLane } from './envelope-ledger-records'

const ORDINARY_SCOPE_PREFIX = '~ordinary:'

export type OrdinaryOfferReservationInput = Readonly<{
  operationId: string
  agentId: string
  offerId: string
  amountMinor: number
  currency: string
  priceVerification: Quote['priceVerification']
}>

export type OrdinaryOfferHold = Readonly<{
  holdId: string
  operationId: string
  agentId: string
  offerId: string
  amountMinor: number
  currency: string
  priceVerification: Quote['priceVerification']
  state: 'reserved' | 'committed' | 'released'
  expiresAt: number
}>

export type OrdinaryOfferReserveResult =
  | Readonly<{
    kind: 'reserved' | 'idempotent'
    hold: OrdinaryOfferHold
    availableAfterMinor: number
    operationElapsedMs: number
  }>
  | Rejection

export type OrdinaryOfferTransitionResult =
  | Readonly<{
    kind: 'committed' | 'released' | 'idempotent'
    hold: OrdinaryOfferHold
    availableAfterMinor: number
  }>
  | Rejection

type OrdinaryRow = {
  hold_id: string
  operation_id: string
  agent_id: string
  offer_id: string
  amount_minor: number
  state: 'reserved' | 'committed' | 'released'
  expires_at: number
  price_verification: Quote['priceVerification']
}

export function reserveOrdinaryOffer(
  ctx: DurableObjectState,
  input: OrdinaryOfferReservationInput,
  envelopeCurrency: string,
  lane: TravelCommerceEnv['DEPLOY_LANE'],
  availableBeforeMinor: number,
  now: number,
  operationStartedAt: number,
): OrdinaryOfferReserveResult {
  if (!validInput(input)) return { kind: 'rejected', reason: 'envelope-malformed' }
  if (input.currency !== envelopeCurrency) return { kind: 'rejected', reason: 'quote-currency-mismatch' }
  if (!verifiedForLane(input.priceVerification, lane)) {
    return { kind: 'rejected', reason: 'quote-unverified' }
  }
  const existing = readOrdinaryOffer(ctx, input.operationId)
  if (existing) {
    if (!sameOperation(existing, input)) return { kind: 'rejected', reason: 'idempotency-conflict' }
    if (existing.state === 'released') {
      return { kind: 'rejected', reason: 'offer-reservation-released' }
    }
    return Object.freeze({
      kind: 'idempotent',
      hold: mapOrdinaryHold(existing, envelopeCurrency),
      availableAfterMinor: availableBeforeMinor,
      operationElapsedMs: elapsed(operationStartedAt),
    })
  }
  if (input.amountMinor > availableBeforeMinor) {
    return {
      kind: 'rejected',
      reason: 'insufficient-envelope',
      details: { availableAtCheck: availableBeforeMinor, requested: input.amountMinor },
    }
  }
  const expiresAt = now + HOLD_TTL_MS
  const holdId = ordinaryScope(input.operationId)
  ctx.storage.sql.exec(
    `INSERT INTO holds (
      hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
      prior_hold_id, state, expires_at, reservation_kind, operation_id, agent_id, price_verification
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'reserved', ?, 'ordinary', ?, ?, ?)`,
    holdId, holdId, `${ORDINARY_SCOPE_PREFIX}${input.agentId}`, input.operationId, input.offerId,
    input.amountMinor, input.amountMinor, expiresAt, input.operationId, input.agentId,
    input.priceVerification,
  )
  return Object.freeze({
    kind: 'reserved',
    hold: Object.freeze({
      holdId,
      operationId: input.operationId,
      agentId: input.agentId,
      offerId: input.offerId,
      amountMinor: minorUnits(input.amountMinor),
      currency: envelopeCurrency,
      priceVerification: input.priceVerification,
      state: 'reserved',
      expiresAt,
    }),
    availableAfterMinor: availableBeforeMinor - input.amountMinor,
    operationElapsedMs: elapsed(operationStartedAt),
  })
}

export function transitionOrdinaryOffer(
  ctx: DurableObjectState,
  operationId: string,
  agentId: string,
  target: 'committed' | 'released',
  envelopeCurrency: string,
  availableBeforeMinor: number,
): OrdinaryOfferTransitionResult {
  if (!isIdentifier(operationId) || !isIdentifier(agentId)) {
    return { kind: 'rejected', reason: 'envelope-malformed' }
  }
  const existing = readOrdinaryOffer(ctx, operationId)
  if (!existing || existing.agent_id !== agentId) {
    return { kind: 'rejected', reason: 'unknown-offer-hold' }
  }
  if (existing.state === target) {
    return Object.freeze({
      kind: 'idempotent',
      hold: mapOrdinaryHold(existing, envelopeCurrency),
      availableAfterMinor: availableBeforeMinor,
    })
  }
  if (existing.state !== 'reserved') return { kind: 'rejected', reason: 'illegal-transition' }
  ctx.storage.sql.exec(
    "UPDATE holds SET state = ? WHERE operation_id = ? AND reservation_kind = 'ordinary' AND state = 'reserved'",
    target, operationId,
  )
  const updated = Object.freeze({ ...existing, state: target })
  const result = Object.freeze({
    kind: target,
    hold: mapOrdinaryHold(updated, envelopeCurrency),
    availableAfterMinor: availableBeforeMinor + (target === 'released' ? existing.amount_minor : 0),
  })
  if (target === 'released') compactReleasedHolds(ctx)
  return result
}

function readOrdinaryOffer(ctx: DurableObjectState, operationId: string): OrdinaryRow | null {
  const active = ctx.storage.sql.exec<OrdinaryRow>(
    `SELECT hold_id, operation_id, agent_id, offer_id, amount_minor, state, expires_at,
     price_verification FROM holds
     WHERE reservation_kind = 'ordinary' AND operation_id = ?`, operationId,
  ).toArray()[0]
  if (active) return active
  return ctx.storage.sql.exec<OrdinaryRow>(
    `SELECT ('~ordinary:' || operation_id) AS hold_id, operation_id, agent_id, offer_id,
       amount_minor, terminal_state AS state, expires_at, price_verification
     FROM ordinary_terminal_receipts WHERE operation_id = ?`, operationId,
  ).toArray()[0] ?? null
}

function validInput(input: OrdinaryOfferReservationInput): boolean {
  return isIdentifier(input.operationId)
    && isIdentifier(input.agentId)
    && isIdentifier(input.offerId)
    && isMinorUnits(input.amountMinor)
    && isCurrency(input.currency)
    && (input.priceVerification === 'verified' || input.priceVerification === 'deterministic-demo')
}

function sameOperation(row: OrdinaryRow, input: OrdinaryOfferReservationInput): boolean {
  return row.agent_id === input.agentId
    && row.offer_id === input.offerId
    && row.amount_minor === input.amountMinor
    && row.price_verification === input.priceVerification
}

function mapOrdinaryHold(row: OrdinaryRow, currency: string): OrdinaryOfferHold {
  if (!isMinorUnits(row.amount_minor)) throw new Error('stored-money-malformed')
  return Object.freeze({
    holdId: row.hold_id,
    operationId: row.operation_id,
    agentId: row.agent_id,
    offerId: row.offer_id,
    amountMinor: row.amount_minor,
    currency,
    priceVerification: row.price_verification,
    state: row.state,
    expiresAt: row.expires_at,
  })
}

function ordinaryScope(operationId: string): string {
  return `${ORDINARY_SCOPE_PREFIX}${operationId}`
}
