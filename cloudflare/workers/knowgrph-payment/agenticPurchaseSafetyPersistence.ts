import type { D1DatabaseLike } from '../shared/d1'
import { queryFirst } from '../shared/d1'
import {
  AGENTIC_PURCHASE_LIMITS,
} from '../../../grph-shared/src/payments/agenticPurchaseRuntimeContract'

type LifecycleRow = {
  lifecycle_id: string
  lifecycle_key: string
  envelope_digest: string
  envelope_json: string
  phase: 'funding' | 'discovery' | 'issuance' | 'execution'
  phase_state: string
  next_action: string
  cancellation_requested: number
  financial_state_exists: number
  revision: number
  created_at: string
  updated_at: string
  terminal_at: string | null
}

type FundingReservationRow = {
  lifecycle_id: string
  funding_key: string
  amount_minor: number
  asset: 'xsgd'
  network: 'avalanche-c-chain'
  state: 'reserved' | 'released' | 'settled'
  transfer_hash: string | null
  provider_credit_ref: string | null
  created_at: string
  released_at: string | null
  settled_at: string | null
}

type ApprovalRow = {
  approval_ref: string
  lifecycle_id: string
  envelope_digest: string
  candidate_digest: string
  amount_minor: number
  currency: 'sgd'
  merchant_policy_digest: string
  expires_at: string
  consumed_at: string | null
  created_at: string
}

type AuthorizationRow = {
  lifecycle_id: string
  provider_authorization_id: string
  request_digest: string
  amount_minor: number
  currency: 'sgd'
  decision: 'approved' | 'declined'
  reservation_state: 'reserved' | 'released' | 'settled'
  created_at: string
  updated_at: string
}

type CardRow = {
  lifecycle_id: string
  issue_key: string
  card_ref: string | null
  status: 'creating' | 'active' | 'closure_pending' | 'closed' | 'failed'
  controls_digest: string
  disposal_at: string
  closed_at: string | null
  revision: number
  created_at: string
  updated_at: string
}

export type AgenticPurchaseLifecycleCreateResult =
  | Readonly<{ ok: true; lifecycleId: string; idempotentReplay: boolean }>
  | Readonly<{
      ok: false
      code: 'purchase_instruction_conflict'
      lifecycleId: string
    }>

export type AgenticPurchaseApprovalResult =
  | Readonly<{
      ok: true
      approvalRef: string
      idempotentReplay: boolean
      consumedNow: boolean
    }>
  | Readonly<{
      ok: false
      code:
        | 'approval_invalid'
        | 'approval_not_found'
        | 'approval_expired'
        | 'approval_conflict'
        | 'approval_already_consumed'
    }>

export type AgenticPurchaseAuthorizationClaimResult =
  | Readonly<{
      ok: true
      decision: 'approved' | 'declined'
      idempotentReplay: boolean
      reservationCreated: boolean
    }>
  | Readonly<{
      ok: false
      code:
        | 'authorization_unauthenticated'
        | 'authorization_identity_conflict'
    }>

export type AgenticPurchaseFundingReleaseResult = Readonly<{
  ok: true
  releasedNow: boolean
  idempotentReplay: boolean
  returnTransferCreated: false
}>

const changedRows = (meta: unknown): number => {
  if (!meta || typeof meta !== 'object') return 0
  const changes = (meta as { changes?: unknown }).changes
  return typeof changes === 'number' && Number.isFinite(changes)
    ? Math.max(0, Math.floor(changes))
    : 0
}

const executeChangedRows = async (
  db: D1DatabaseLike,
  sql: string,
  values: readonly unknown[],
): Promise<number> => {
  const result = await db.prepare(sql).bind(...values).run()
  return changedRows(result.meta)
}

const readLifecycleByKey = (
  db: D1DatabaseLike,
  lifecycleKey: string,
): Promise<LifecycleRow | null> => queryFirst<LifecycleRow>(
  db,
  `SELECT *
     FROM payment_purchase_lifecycles
    WHERE lifecycle_key = ?
    LIMIT 1`,
  [lifecycleKey],
)

const readApproval = (
  db: D1DatabaseLike,
  approvalRef: string,
): Promise<ApprovalRow | null> => queryFirst<ApprovalRow>(
  db,
  `SELECT *
     FROM payment_purchase_approvals
    WHERE approval_ref = ?
    LIMIT 1`,
  [approvalRef],
)

const readAuthorization = (
  db: D1DatabaseLike,
  lifecycleId: string,
): Promise<AuthorizationRow | null> => queryFirst<AuthorizationRow>(
  db,
  `SELECT *
     FROM payment_purchase_authorizations
    WHERE lifecycle_id = ?
    LIMIT 1`,
  [lifecycleId],
)

const readFundingReservation = (
  db: D1DatabaseLike,
  lifecycleId: string,
): Promise<FundingReservationRow | null> => queryFirst<FundingReservationRow>(
  db,
  `SELECT *
     FROM payment_purchase_funding_reservations
    WHERE lifecycle_id = ?
    LIMIT 1`,
  [lifecycleId],
)

const readCard = (
  db: D1DatabaseLike,
  lifecycleId: string,
): Promise<CardRow | null> => queryFirst<CardRow>(
  db,
  `SELECT *
     FROM payment_purchase_cards
    WHERE lifecycle_id = ?
    LIMIT 1`,
  [lifecycleId],
)

export const createAgenticPurchaseLifecycle = async (
  db: D1DatabaseLike,
  args: Readonly<{
    lifecycleId: string
    lifecycleKey: string
    envelopeDigest: string
    envelopeJson: string
    now: string
  }>,
): Promise<AgenticPurchaseLifecycleCreateResult> => {
  const insertedRows = await executeChangedRows(
    db,
    `INSERT INTO payment_purchase_lifecycles (
       lifecycle_id, lifecycle_key, envelope_digest, envelope_json,
       phase, phase_state, next_action, cancellation_requested,
       financial_state_exists, revision, created_at, updated_at, terminal_at
     ) VALUES (?, ?, ?, ?, 'funding', 'blocked',
       'Resolve every Funding readiness blocker before approval',
       0, 0, 0, ?, ?, NULL)
     ON CONFLICT DO NOTHING`,
    [
      args.lifecycleId,
      args.lifecycleKey,
      args.envelopeDigest,
      args.envelopeJson,
      args.now,
      args.now,
    ],
  )
  if (insertedRows === 1) {
    return Object.freeze({
      ok: true,
      lifecycleId: args.lifecycleId,
      idempotentReplay: false,
    })
  }
  const existing = await readLifecycleByKey(db, args.lifecycleKey)
  if (
    existing
    && existing.lifecycle_id === args.lifecycleId
    && existing.envelope_digest === args.envelopeDigest
  ) {
    return Object.freeze({
      ok: true,
      lifecycleId: existing.lifecycle_id,
      idempotentReplay: true,
    })
  }
  return Object.freeze({
    ok: false,
    code: 'purchase_instruction_conflict',
    lifecycleId: existing?.lifecycle_id || args.lifecycleId,
  })
}

export const registerAgenticPurchaseApproval = async (
  db: D1DatabaseLike,
  args: Readonly<{
    approvalRef: string
    lifecycleId: string
    envelopeDigest: string
    candidateDigest: string
    amountMinor: number
    merchantPolicyDigest: string
    expiresAt: string
    createdAt: string
  }>,
): Promise<AgenticPurchaseApprovalResult> => {
  const createdAtMs = Date.parse(args.createdAt)
  const expiresAtMs = Date.parse(args.expiresAt)
  if (
    !Number.isSafeInteger(args.amountMinor)
    || args.amountMinor <= 0
    || !Number.isFinite(createdAtMs)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= createdAtMs
    || expiresAtMs - createdAtMs
      > AGENTIC_PURCHASE_LIMITS.maximumApprovalTtlMs
  ) {
    return Object.freeze({ ok: false, code: 'approval_invalid' })
  }
  const insertedRows = await executeChangedRows(
    db,
    `INSERT INTO payment_purchase_approvals (
       approval_ref, lifecycle_id, envelope_digest, candidate_digest,
       amount_minor, currency, merchant_policy_digest, expires_at,
       consumed_at, created_at
     ) VALUES (?, ?, ?, ?, ?, 'sgd', ?, ?, NULL, ?)
     ON CONFLICT DO NOTHING`,
    [
      args.approvalRef,
      args.lifecycleId,
      args.envelopeDigest,
      args.candidateDigest,
      args.amountMinor,
      args.merchantPolicyDigest,
      args.expiresAt,
      args.createdAt,
    ],
  )
  if (insertedRows === 1) {
    return Object.freeze({
      ok: true,
      approvalRef: args.approvalRef,
      idempotentReplay: false,
      consumedNow: false,
    })
  }
  const existing = await readApproval(db, args.approvalRef)
  const unchanged = existing
    && existing.lifecycle_id === args.lifecycleId
    && existing.envelope_digest === args.envelopeDigest
    && existing.candidate_digest === args.candidateDigest
    && existing.amount_minor === args.amountMinor
    && existing.currency === 'sgd'
    && existing.merchant_policy_digest === args.merchantPolicyDigest
    && existing.expires_at === args.expiresAt
  if (!unchanged) return Object.freeze({ ok: false, code: 'approval_conflict' })
  return Object.freeze({
    ok: true,
    approvalRef: args.approvalRef,
    idempotentReplay: true,
    consumedNow: false,
  })
}

export const consumeAgenticPurchaseApproval = async (
  db: D1DatabaseLike,
  args: Readonly<{
    approvalRef: string
    lifecycleId: string
    envelopeDigest: string
    candidateDigest: string
    amountMinor: number
    merchantPolicyDigest: string
    now: string
  }>,
): Promise<AgenticPurchaseApprovalResult> => {
  const consumedRows = await executeChangedRows(
    db,
    `UPDATE payment_purchase_approvals
        SET consumed_at = ?
      WHERE approval_ref = ?
        AND lifecycle_id = ?
        AND envelope_digest = ?
        AND candidate_digest = ?
        AND amount_minor = ?
        AND currency = 'sgd'
        AND merchant_policy_digest = ?
        AND consumed_at IS NULL
        AND expires_at > ?`,
    [
      args.now,
      args.approvalRef,
      args.lifecycleId,
      args.envelopeDigest,
      args.candidateDigest,
      args.amountMinor,
      args.merchantPolicyDigest,
      args.now,
    ],
  )
  if (consumedRows === 1) {
    return Object.freeze({
      ok: true,
      approvalRef: args.approvalRef,
      idempotentReplay: false,
      consumedNow: true,
    })
  }
  const existing = await readApproval(db, args.approvalRef)
  if (!existing) return Object.freeze({ ok: false, code: 'approval_not_found' })
  const unchanged = existing.lifecycle_id === args.lifecycleId
    && existing.envelope_digest === args.envelopeDigest
    && existing.candidate_digest === args.candidateDigest
    && existing.amount_minor === args.amountMinor
    && existing.currency === 'sgd'
    && existing.merchant_policy_digest === args.merchantPolicyDigest
  if (!unchanged) return Object.freeze({ ok: false, code: 'approval_conflict' })
  if (existing.expires_at <= args.now && existing.consumed_at === null) {
    return Object.freeze({ ok: false, code: 'approval_expired' })
  }
  if (existing.consumed_at !== null) {
    return Object.freeze({
      ok: true,
      approvalRef: existing.approval_ref,
      idempotentReplay: true,
      consumedNow: false,
    })
  }
  return Object.freeze({ ok: false, code: 'approval_already_consumed' })
}

export const reserveAgenticPurchaseFunding = async (
  db: D1DatabaseLike,
  args: Readonly<{
    lifecycleId: string
    fundingKey: string
    amountMinor: number
    createdAt: string
  }>,
): Promise<Readonly<{
  ok: boolean
  idempotentReplay: boolean
  code?: 'funding_reservation_conflict'
}>> => {
  const insertedRows = await executeChangedRows(
    db,
    `INSERT INTO payment_purchase_funding_reservations (
       lifecycle_id, funding_key, amount_minor, asset, network, state,
       transfer_hash, provider_credit_ref, created_at, released_at, settled_at
     ) VALUES (?, ?, ?, 'xsgd', 'avalanche-c-chain', 'reserved',
       NULL, NULL, ?, NULL, NULL)
     ON CONFLICT DO NOTHING`,
    [args.lifecycleId, args.fundingKey, args.amountMinor, args.createdAt],
  )
  if (insertedRows === 1) {
    return Object.freeze({ ok: true, idempotentReplay: false })
  }
  const existing = await readFundingReservation(db, args.lifecycleId)
  const unchanged = existing
    && existing.funding_key === args.fundingKey
    && existing.amount_minor === args.amountMinor
    && existing.asset === 'xsgd'
    && existing.network === 'avalanche-c-chain'
  return unchanged
    ? Object.freeze({ ok: true, idempotentReplay: true })
    : Object.freeze({
        ok: false,
        idempotentReplay: false,
        code: 'funding_reservation_conflict',
      })
}

export const releaseAgenticPurchaseFundingReservation = async (
  db: D1DatabaseLike,
  lifecycleId: string,
  releasedAt: string,
): Promise<AgenticPurchaseFundingReleaseResult> => {
  const releasedRows = await executeChangedRows(
    db,
    `UPDATE payment_purchase_funding_reservations
        SET state = 'released', released_at = ?
      WHERE lifecycle_id = ? AND state = 'reserved'`,
    [releasedAt, lifecycleId],
  )
  if (releasedRows === 1) {
    return Object.freeze({
      ok: true,
      releasedNow: true,
      idempotentReplay: false,
      returnTransferCreated: false,
    })
  }
  await readFundingReservation(db, lifecycleId)
  return Object.freeze({
    ok: true,
    releasedNow: false,
    idempotentReplay: true,
    returnTransferCreated: false,
  })
}

export const claimAgenticPurchaseAuthorization = async (
  db: D1DatabaseLike,
  args: Readonly<{
    authenticated: boolean
    lifecycleId: string
    providerAuthorizationId: string
    requestDigest: string
    amountMinor: number
    decision: 'approved' | 'declined'
    now: string
  }>,
): Promise<AgenticPurchaseAuthorizationClaimResult> => {
  if (!args.authenticated) {
    return Object.freeze({
      ok: false,
      code: 'authorization_unauthenticated',
    })
  }
  const insertedRows = await executeChangedRows(
    db,
    `INSERT INTO payment_purchase_authorizations (
       lifecycle_id, provider_authorization_id, request_digest,
       amount_minor, currency, decision, reservation_state,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'sgd', ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [
      args.lifecycleId,
      args.providerAuthorizationId,
      args.requestDigest,
      args.amountMinor,
      args.decision,
      args.decision === 'approved' ? 'reserved' : 'released',
      args.now,
      args.now,
    ],
  )
  if (insertedRows === 1) {
    return Object.freeze({
      ok: true,
      decision: args.decision,
      idempotentReplay: false,
      reservationCreated: args.decision === 'approved',
    })
  }
  const existing = await readAuthorization(db, args.lifecycleId)
  if (
    existing
    && existing.provider_authorization_id === args.providerAuthorizationId
    && existing.request_digest === args.requestDigest
    && existing.amount_minor === args.amountMinor
    && existing.currency === 'sgd'
  ) {
    return Object.freeze({
      ok: true,
      decision: existing.decision,
      idempotentReplay: true,
      reservationCreated: false,
    })
  }
  return Object.freeze({
    ok: false,
    code: 'authorization_identity_conflict',
  })
}

export const closeAgenticPurchaseCardWhenSafe = async (
  db: D1DatabaseLike,
  args: Readonly<{
    lifecycleId: string
    safeToClose: boolean
    closedAt: string
  }>,
): Promise<Readonly<{
  ok: boolean
  closedNow: boolean
  idempotentReplay: boolean
  code?: 'card_closure_pending' | 'card_not_found'
}>> => {
  if (!args.safeToClose) {
    return Object.freeze({
      ok: false,
      closedNow: false,
      idempotentReplay: false,
      code: 'card_closure_pending',
    })
  }
  const closedRows = await executeChangedRows(
    db,
    `UPDATE payment_purchase_cards
        SET status = 'closed',
            closed_at = ?,
            updated_at = ?,
            revision = revision + 1
      WHERE lifecycle_id = ?
        AND status = 'closure_pending'
        AND NOT EXISTS (
          SELECT 1
            FROM payment_purchase_authorizations
           WHERE lifecycle_id = ?
             AND reservation_state = 'reserved'
        )
        AND NOT EXISTS (
          SELECT 1
            FROM payment_purchase_funding_reservations
           WHERE lifecycle_id = ?
             AND state = 'reserved'
        )`,
    [
      args.closedAt,
      args.closedAt,
      args.lifecycleId,
      args.lifecycleId,
      args.lifecycleId,
    ],
  )
  if (closedRows === 1) {
    return Object.freeze({
      ok: true,
      closedNow: true,
      idempotentReplay: false,
    })
  }
  const existing = await readCard(db, args.lifecycleId)
  if (existing?.status === 'closed') {
    return Object.freeze({
      ok: true,
      closedNow: false,
      idempotentReplay: true,
    })
  }
  return Object.freeze({
    ok: false,
    closedNow: false,
    idempotentReplay: false,
    code: existing ? 'card_closure_pending' : 'card_not_found',
  })
}
