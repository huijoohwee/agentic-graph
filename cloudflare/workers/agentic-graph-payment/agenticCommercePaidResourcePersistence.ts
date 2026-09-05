import { queryFirst, type D1DatabaseLike } from '../shared/d1'
import {
  PAID_RESOURCE_REJECTION_LIMIT,
  prunePaidResourceRejections,
  recordPaidResourceRejection,
} from './agenticCommercePaidResourceRejection'
export type PaidResourceState =
  | 'challenged'
  | 'verifying'
  | 'executing'
  | 'settling'
  | 'settlement_unknown'
  | 'fulfilled'
  | 'expired'
export const PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT = 8
export type PaidResourceRow = Readonly<{
  id: string
  resource_id: string
  idempotency_key: string
  network: string
  request_digest: string
  request_json: string
  requirements_digest: string
  requirements_json: string
  payment_required_digest: string
  payment_required_json: string
  facilitator_url: string
  rpc_url: string
  transport_digest: string
  payment_payload_digest: string | null
  signed_blob_digest: string | null
  transaction_hash: string | null
  state: PaidResourceState
  revision: number
  claim_token: string | null
  claim_expires_at: string | null
  response_json: string | null
  response_digest: string | null
  settlement_json: string | null
  settlement_digest: string | null
  settlement_attempts: number
  verification_attempts: number
  payer: string | null
  error_code: string | null
  created_at: string
  updated_at: string
  expires_at: string
  fulfilled_at: string | null
}>

export type ChallengeResult =
  | { ok: true; created: boolean; record: PaidResourceRow }
  | { ok: false; code: 'paid_resource_identity_conflict'; record: PaidResourceRow }

export type PaymentClaimResult =
  | { ok: true; claimed: true; record: PaidResourceRow }
  | { ok: true; claimed: false; record: PaidResourceRow }
  | {
      ok: false
      code: 'paid_resource_payment_conflict' | 'paid_resource_payment_rejected' | 'paid_resource_transaction_conflict' | 'paid_resource_verification_exhausted'
      record: PaidResourceRow
    }

export type PaidResourceTransitionResult =
  | { ok: true; record: PaidResourceRow }
  | { ok: false; code: 'paid_resource_revision_conflict'; record: PaidResourceRow | null }

const changedRows = (meta: unknown): number => {
  if (!meta || typeof meta !== 'object') return 0
  const changes = (meta as { changes?: unknown }).changes
  return typeof changes === 'number' && Number.isFinite(changes)
    ? Math.max(0, Math.floor(changes))
    : 0
}

const executeChanged = async (
  db: D1DatabaseLike,
  sql: string,
  values: unknown[],
): Promise<number> => {
  const result = await db.prepare(sql).bind(...values).run()
  return changedRows(result.meta)
}

export const findPaidResourceById = async (
  db: D1DatabaseLike,
  id: string,
): Promise<PaidResourceRow | null> => queryFirst<PaidResourceRow>(
  db,
  'SELECT * FROM agentic_commerce_paid_resources WHERE id = ?',
  [id],
)

export const findPaidResourceByIdentity = async (
  db: D1DatabaseLike,
  resourceId: string,
  idempotencyKey: string,
): Promise<PaidResourceRow | null> => queryFirst<PaidResourceRow>(
  db,
  `SELECT * FROM agentic_commerce_paid_resources
    WHERE resource_id = ? AND idempotency_key = ?`,
  [resourceId, idempotencyKey],
)

export const prunePaidResourceRetention = async (
  db: D1DatabaseLike,
  args: { now: string; expiredBefore: string },
): Promise<void> => {
  await executeChanged(
    db,
    `DELETE FROM agentic_commerce_paid_resources
      WHERE rowid IN (SELECT rowid FROM agentic_commerce_paid_resources
        WHERE state = 'challenged' AND expires_at <= ? ORDER BY expires_at LIMIT 64)`,
    [args.now],
  )
  await prunePaidResourceRejections(db, args.now)
  await executeChanged(
    db,
    `DELETE FROM agentic_commerce_paid_resources
      WHERE rowid IN (SELECT rowid FROM agentic_commerce_paid_resources
        WHERE state = 'expired' AND updated_at <= ? ORDER BY updated_at LIMIT 64)`,
    [args.expiredBefore],
  )
  await executeChanged(
    db,
    `DELETE FROM agentic_commerce_paid_resource_admission_windows
      WHERE rowid IN (SELECT rowid FROM agentic_commerce_paid_resource_admission_windows
        WHERE expires_at <= ? ORDER BY expires_at LIMIT 64)`,
    [args.now],
  )
}

export const admitPaidResourceChallenge = async (
  db: D1DatabaseLike,
  args: {
    bucketKey: string
    limit: number
    expiresAt: string
    now: string
  },
): Promise<boolean> => (await executeChanged(
  db,
  `INSERT INTO agentic_commerce_paid_resource_admission_windows (
     bucket_key, request_count, expires_at, updated_at
   ) VALUES (?, 1, ?, ?)
   ON CONFLICT(bucket_key) DO UPDATE SET
     request_count = request_count + 1,
     expires_at = excluded.expires_at,
     updated_at = excluded.updated_at
   WHERE request_count < ?`,
  [args.bucketKey, args.expiresAt, args.now, args.limit],
)) === 1

const sameChallenge = (
  row: PaidResourceRow,
  args: {
    id: string
    network: string
    requestDigest: string
    requirementsDigest: string
    paymentRequiredDigest: string
    facilitatorUrl: string
    rpcUrl: string
    transportDigest: string
  },
): boolean => row.id === args.id
  && row.network === args.network
  && row.request_digest === args.requestDigest
  && row.requirements_digest === args.requirementsDigest
  && row.payment_required_digest === args.paymentRequiredDigest
  && row.facilitator_url === args.facilitatorUrl
  && row.rpc_url === args.rpcUrl
  && row.transport_digest === args.transportDigest

export const createPaidResourceChallenge = async (
  db: D1DatabaseLike,
  args: {
    id: string
    resourceId: string
    idempotencyKey: string
    network: string
    requestDigest: string
    requestJson: string
    requirementsDigest: string
    requirementsJson: string
    paymentRequiredDigest: string
    paymentRequiredJson: string
    facilitatorUrl: string
    rpcUrl: string
    transportDigest: string
    now: string
    expiresAt: string
  },
): Promise<ChallengeResult> => {
  const inserted = await executeChanged(
    db,
    `INSERT OR IGNORE INTO agentic_commerce_paid_resources (
       id, resource_id, idempotency_key, network, request_digest, request_json,
       requirements_digest, requirements_json, payment_required_digest,
       payment_required_json, facilitator_url, rpc_url, transport_digest, state, revision,
       created_at, updated_at, expires_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'challenged', 0, ?, ?, ?)`,
    [
      args.id,
      args.resourceId,
      args.idempotencyKey,
      args.network,
      args.requestDigest,
      args.requestJson,
      args.requirementsDigest,
      args.requirementsJson,
      args.paymentRequiredDigest,
      args.paymentRequiredJson,
      args.facilitatorUrl,
      args.rpcUrl,
      args.transportDigest,
      args.now,
      args.now,
      args.expiresAt,
    ],
  )
  const record = await findPaidResourceByIdentity(
    db,
    args.resourceId,
    args.idempotencyKey,
  )
  if (!record) {
    const collision = await findPaidResourceById(db, args.id)
    if (collision) {
      return { ok: false, code: 'paid_resource_identity_conflict', record: collision }
    }
    throw new Error('paid resource challenge write was not observable')
  }
  if (!sameChallenge(record, args)) {
    return { ok: false, code: 'paid_resource_identity_conflict', record }
  }
  return { ok: true, created: inserted === 1, record }
}

const samePayment = (
  row: PaidResourceRow,
  args: {
    paymentPayloadDigest: string
    signedBlobDigest: string
    transactionHash: string
  },
): boolean => row.payment_payload_digest === args.paymentPayloadDigest
  && row.signed_blob_digest === args.signedBlobDigest
  && row.transaction_hash === args.transactionHash

export const claimPaidResourcePayment = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    paymentPayloadDigest: string
    signedBlobDigest: string
    transactionHash: string
    claimToken: string
    claimExpiresAt: string
    now: string
  },
): Promise<PaymentClaimResult> => {
  try {
    const claimed = await executeChanged(
      db,
      `UPDATE agentic_commerce_paid_resources
          SET state = 'verifying',
              verification_attempts = verification_attempts + 1,
              payment_payload_digest = ?,
              signed_blob_digest = ?,
              transaction_hash = ?,
              claim_token = ?,
              claim_expires_at = ?,
              revision = revision + 1,
              updated_at = ?,
              error_code = NULL
        WHERE id = ?
          AND revision = ?
          AND state = 'challenged'
          AND verification_attempts < ${PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT}
          AND expires_at > ?
          AND NOT EXISTS (SELECT 1 FROM agentic_commerce_paid_resource_rejections
            WHERE transaction_hash = ?)
          AND (SELECT COUNT(*) FROM agentic_commerce_paid_resource_rejections
            WHERE paid_resource_id = ?) < ${PAID_RESOURCE_REJECTION_LIMIT}
          AND (payment_payload_digest IS NULL OR payment_payload_digest = ?)
          AND (signed_blob_digest IS NULL OR signed_blob_digest = ?)
          AND (transaction_hash IS NULL OR transaction_hash = ?)`,
      [
        args.paymentPayloadDigest,
        args.signedBlobDigest,
        args.transactionHash,
        args.claimToken,
        args.claimExpiresAt,
        args.now,
        args.id,
        args.expectedRevision,
        args.now,
        args.transactionHash,
        args.id,
        args.paymentPayloadDigest,
        args.signedBlobDigest,
        args.transactionHash,
      ],
    )
    const record = await findPaidResourceById(db, args.id)
    if (!record) throw new Error('paid resource payment claim was not observable')
    if (claimed === 1) return { ok: true, claimed: true, record }
    const rejected = await queryFirst<{ rejected: number }>(db,
      `SELECT 1 AS rejected WHERE EXISTS (
         SELECT 1 FROM agentic_commerce_paid_resource_rejections WHERE transaction_hash = ?
       ) OR (SELECT COUNT(*) FROM agentic_commerce_paid_resource_rejections
         WHERE paid_resource_id = ?) >= ?`,
      [args.transactionHash, args.id, PAID_RESOURCE_REJECTION_LIMIT])
    if (rejected) {
      return { ok: false, code: 'paid_resource_payment_rejected', record }
    }
    if (record.state === 'challenged'
      && record.verification_attempts >= PAID_RESOURCE_VERIFICATION_ATTEMPT_LIMIT) {
      return { ok: false, code: 'paid_resource_verification_exhausted', record }
    }
    if (!samePayment(record, args) && record.payment_payload_digest !== null) {
      return { ok: false, code: 'paid_resource_payment_conflict', record }
    }
    return { ok: true, claimed: false, record }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/unique constraint|constraint failed/i.test(message)) throw error
    const current = await findPaidResourceById(db, args.id)
    if (current && samePayment(current, args)) {
      return { ok: true, claimed: false, record: current }
    }
    if (current) {
      return {
        ok: false,
        code: 'paid_resource_transaction_conflict',
        record: current,
      }
    }
    throw error
  }
}

const transition = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken?: string
    fromStates: readonly PaidResourceState[]
    assignments: string
    values: unknown[]
  },
): Promise<PaidResourceTransitionResult> => {
  const statePlaceholders = args.fromStates.map(() => '?').join(', ')
  const claimClause = args.claimToken ? 'AND claim_token = ?' : ''
  const changed = await executeChanged(
    db,
    `UPDATE agentic_commerce_paid_resources
        SET ${args.assignments}, revision = revision + 1
      WHERE id = ? AND revision = ?
        AND state IN (${statePlaceholders}) ${claimClause}`,
    [
      ...args.values,
      args.id,
      args.expectedRevision,
      ...args.fromStates,
      ...(args.claimToken ? [args.claimToken] : []),
    ],
  )
  const record = await findPaidResourceById(db, args.id)
  return changed === 1 && record
    ? { ok: true, record }
    : { ok: false, code: 'paid_resource_revision_conflict', record }
}

export const markPaidResourceExecuting = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken: string
    payer: string | null
    now: string
  },
): Promise<PaidResourceTransitionResult> => transition(db, {
  ...args,
  fromStates: ['verifying'],
  assignments: "state = 'executing', payer = ?, updated_at = ?",
  values: [args.payer, args.now],
})

export const cachePaidResourceResponse = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken: string
    responseJson: string
    responseDigest: string
    claimExpiresAt: string
    now: string
  },
): Promise<PaidResourceTransitionResult> => transition(db, {
  ...args,
  fromStates: ['executing'],
  assignments: `state = 'settling', response_json = ?, response_digest = ?,
    settlement_attempts = settlement_attempts + 1,
    claim_expires_at = ?, updated_at = ?`,
  values: [args.responseJson, args.responseDigest, args.claimExpiresAt, args.now],
})

export const markPaidResourceSettlementUnknown = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken: string
    now: string
    errorCode?: string
  },
): Promise<PaidResourceTransitionResult> => transition(db, {
  ...args,
  fromStates: ['settling'],
  assignments: `state = 'settlement_unknown', claim_token = NULL,
    claim_expires_at = NULL, error_code = ?, updated_at = ?`,
  values: [args.errorCode ?? 'settlement_unknown', args.now],
})

export const releasePaidResourceSettlementFailure = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    fromState: 'settling' | 'settlement_unknown'
    now: string
    claimToken?: string
  },
): Promise<PaidResourceTransitionResult> => {
  await recordPaidResourceRejection(db, args)
  return transition(db, {
    id: args.id,
    expectedRevision: args.expectedRevision,
    ...(args.claimToken ? { claimToken: args.claimToken } : {}),
    fromStates: [args.fromState],
    assignments: `state = CASE WHEN expires_at > ? THEN 'challenged' ELSE 'expired' END,
      payment_payload_digest = NULL, signed_blob_digest = NULL, transaction_hash = NULL,
      settlement_json = NULL, settlement_digest = NULL, settlement_attempts = 0,
      payer = NULL, claim_token = NULL, claim_expires_at = NULL,
      error_code = 'settlement_failed', updated_at = ?`,
    values: [args.now, args.now],
  })
}

export const claimPaidResourceSettlementRetry = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken: string
    claimExpiresAt: string
    now: string
  },
): Promise<PaidResourceTransitionResult> => {
  const changed = await executeChanged(
    db,
    `UPDATE agentic_commerce_paid_resources
        SET state = 'settling', settlement_attempts = settlement_attempts + 1,
            claim_token = ?, claim_expires_at = ?, error_code = NULL,
            updated_at = ?, revision = revision + 1
      WHERE id = ? AND revision = ? AND state = 'settlement_unknown'
        AND settlement_attempts < 2`,
    [
      args.claimToken,
      args.claimExpiresAt,
      args.now,
      args.id,
      args.expectedRevision,
    ],
  )
  const record = await findPaidResourceById(db, args.id)
  return changed === 1 && record
    ? { ok: true, record }
    : { ok: false, code: 'paid_resource_revision_conflict', record }
}

export const fulfillPaidResource = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken?: string
    settlementJson: string
    settlementDigest: string
    payer: string | null
    now: string
  },
): Promise<PaidResourceTransitionResult> => transition(db, {
  ...args,
  fromStates: ['settling', 'settlement_unknown'],
  assignments: `state = 'fulfilled', settlement_json = ?, settlement_digest = ?,
    payer = COALESCE(?, payer), claim_token = NULL, claim_expires_at = NULL,
    error_code = NULL, fulfilled_at = ?, updated_at = ?`,
  values: [
    args.settlementJson,
    args.settlementDigest,
    args.payer,
    args.now,
    args.now,
  ],
})

export const expirePaidResource = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken?: string
    fromStates: readonly PaidResourceState[]
    errorCode: string
    now: string
  },
): Promise<PaidResourceTransitionResult> => transition(db, {
  ...args,
  assignments: `state = 'expired', claim_token = NULL,
    claim_expires_at = NULL, error_code = ?, updated_at = ?`,
  values: [args.errorCode, args.now],
})

export const expirePaidResourcePastDeadline = async (
  db: D1DatabaseLike,
  row: PaidResourceRow,
  now: string,
): Promise<PaidResourceRow> => {
  if (row.state !== 'challenged' || row.expires_at > now) return row
  const result = await expirePaidResource(db, {
    id: row.id,
    expectedRevision: row.revision,
    fromStates: ['challenged'],
    errorCode: 'payment_window_expired',
    now,
  })
  return result.record ?? row
}

export const releasePaidResourceVerification = async (
  db: D1DatabaseLike,
  args: {
    id: string
    expectedRevision: number
    claimToken: string
    errorCode: string
    now: string
  },
): Promise<PaidResourceTransitionResult> => transition(db, {
  ...args,
  fromStates: ['verifying'],
  assignments: `state = CASE WHEN expires_at > ? THEN 'challenged' ELSE 'expired' END,
    payment_payload_digest = NULL,
    signed_blob_digest = NULL, transaction_hash = NULL, claim_token = NULL,
    claim_expires_at = NULL, error_code = ?, updated_at = ?`,
  values: [args.now, args.errorCode, args.now],
})

export const recoverStalePaidResource = async (
  db: D1DatabaseLike,
  args: { id: string; expectedRevision: number; now: string },
): Promise<PaidResourceTransitionResult> => {
  const changed = await executeChanged(
    db,
    `UPDATE agentic_commerce_paid_resources
        SET state = CASE state
          WHEN 'verifying' THEN 'challenged'
          WHEN 'settling' THEN 'settlement_unknown'
          ELSE 'expired'
        END,
        payment_payload_digest = CASE WHEN state = 'verifying' THEN NULL ELSE payment_payload_digest END,
        signed_blob_digest = CASE WHEN state = 'verifying' THEN NULL ELSE signed_blob_digest END,
        transaction_hash = CASE WHEN state = 'verifying' THEN NULL ELSE transaction_hash END,
        claim_token = NULL,
        claim_expires_at = NULL,
        error_code = CASE state
          WHEN 'settling' THEN 'settlement_attempt_interrupted'
          WHEN 'executing' THEN 'resource_execution_abandoned'
          ELSE 'verification_claim_expired'
        END,
        revision = revision + 1,
        updated_at = ?
      WHERE id = ? AND revision = ?
        AND state IN ('verifying', 'executing', 'settling')
        AND claim_expires_at <= ?`,
    [args.now, args.id, args.expectedRevision, args.now],
  )
  const record = await findPaidResourceById(db, args.id)
  return changed === 1 && record
    ? { ok: true, record }
    : { ok: false, code: 'paid_resource_revision_conflict', record }
}
