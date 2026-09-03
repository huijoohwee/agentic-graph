import { buildAgenticCommerceSemanticKey } from '../../../grph-shared/src/payments/agenticCommerceSsot'
import { execute, queryFirst, type D1DatabaseLike } from '../shared/d1'

export type AgenticCommerceSessionStatus = 'open' | 'pending_onchain' | 'complete' | 'cancelled' | 'payment_failed'
export type AgenticCommercePaymentRail = 'fiat' | 'erc20' | 'solana_pay'
export type OpenboxAction = 'authorized' | 'manual_review' | 'blocked'

export type AgenticCommerceRiskSignal = {
  source: 'openbox'
  score: number
  action: OpenboxAction
  session_id: string
}

export type AgenticCommerceSessionWrite = {
  id: string
  sellerId: string
  idempotencyKey: string
  payloadHash: string
  status: AgenticCommerceSessionStatus
  paymentRail: AgenticCommercePaymentRail
  amountTotal: number
  currency: string
  payerDid: string | null
  depositAddress: string | null
  requestJson: string
  responseJson: string
  riskSignalsJson: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
}

export type AgenticCommerceSessionRow = {
  id: string
  seller_id: string
  idempotency_key: string
  payload_hash: string
  status: AgenticCommerceSessionStatus
  payment_rail: AgenticCommercePaymentRail
  amount_total: number
  currency: string
  payer_did: string | null
  deposit_address: string | null
  request_json: string
  response_json: string
  risk_signals_json: string
  created_at: string
  updated_at: string
  completed_at: string | null
  cancelled_at: string | null
}

export type AgenticCommerceProofRow = {
  id: string
  session_id: string
  proof_json: string
  created_at: string
}

export type AgenticCommerceTraceRow = {
  id: string
  session_id: string
  event_type: string
  payload_json: string
  created_at: string
}

const normalizeJsonForSignature = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(normalizeJsonForSignature)
  if (typeof value !== 'object') return String(value)
  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) sorted[key] = normalizeJsonForSignature(record[key])
  return sorted
}

export const stableJson = (value: unknown): string => {
  try {
    return JSON.stringify(normalizeJsonForSignature(value))
  } catch {
    return 'null'
  }
}

export const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? value as Record<string, unknown> : null

export const readRecordString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

export const mapSessionRow = (row: AgenticCommerceSessionRow) => ({
  id: row.id,
  seller_id: row.seller_id,
  idempotency_key: row.idempotency_key,
  status: row.status,
  payment_rail: row.payment_rail,
  amount_total: row.amount_total,
  currency: row.currency,
  payer_did: row.payer_did,
  deposit_address: row.deposit_address,
  risk_signals: parseJson<AgenticCommerceRiskSignal[]>(row.risk_signals_json || '[]', []),
  created_at: row.created_at,
  updated_at: row.updated_at,
  completed_at: row.completed_at,
  cancelled_at: row.cancelled_at,
})

export const writeSession = async (db: D1DatabaseLike, session: AgenticCommerceSessionWrite): Promise<void> => {
  await execute(
    db,
    `INSERT INTO agentic_commerce_sessions (
       id, seller_id, idempotency_key, payload_hash, status, payment_rail, amount_total, currency,
       payer_did, deposit_address, request_json, response_json, risk_signals_json, created_at,
       updated_at, completed_at, cancelled_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       payment_rail = excluded.payment_rail,
       amount_total = excluded.amount_total,
       currency = excluded.currency,
       payer_did = excluded.payer_did,
       deposit_address = excluded.deposit_address,
       response_json = excluded.response_json,
       risk_signals_json = excluded.risk_signals_json,
       updated_at = excluded.updated_at,
       completed_at = COALESCE(excluded.completed_at, agentic_commerce_sessions.completed_at),
       cancelled_at = COALESCE(excluded.cancelled_at, agentic_commerce_sessions.cancelled_at)`,
    [
      session.id,
      session.sellerId,
      session.idempotencyKey,
      session.payloadHash,
      session.status,
      session.paymentRail,
      session.amountTotal,
      session.currency,
      session.payerDid,
      session.depositAddress,
      session.requestJson,
      session.responseJson,
      session.riskSignalsJson,
      session.createdAt,
      session.updatedAt,
      session.completedAt,
      session.cancelledAt,
    ],
  )
}

export const updateSessionState = async (db: D1DatabaseLike, args: {
  id: string
  status: AgenticCommerceSessionStatus
  responseJson: string
  riskSignalsJson: string
  updatedAt: string
  completedAt?: string | null
  cancelledAt?: string | null
}): Promise<void> => {
  await execute(
    db,
    `UPDATE agentic_commerce_sessions
       SET status = ?,
           response_json = ?,
           risk_signals_json = ?,
           updated_at = ?,
           completed_at = COALESCE(?, completed_at),
           cancelled_at = COALESCE(?, cancelled_at)
     WHERE id = ?`,
    [
      args.status,
      args.responseJson,
      args.riskSignalsJson,
      args.updatedAt,
      args.completedAt || null,
      args.cancelledAt || null,
      args.id,
    ],
  )
}

export const readSession = async (db: D1DatabaseLike, id: string): Promise<AgenticCommerceSessionRow | null> =>
  queryFirst<AgenticCommerceSessionRow>(db, 'SELECT * FROM agentic_commerce_sessions WHERE id = ?', [id])

export const readSessionByIdempotencyKey = async (
  db: D1DatabaseLike,
  sellerId: string,
  idempotencyKey: string,
): Promise<AgenticCommerceSessionRow | null> =>
  queryFirst<AgenticCommerceSessionRow>(
    db,
    'SELECT * FROM agentic_commerce_sessions WHERE seller_id = ? AND idempotency_key = ?',
    [sellerId, idempotencyKey],
  )

export const readProofForSession = async (
  db: D1DatabaseLike,
  sessionId: string,
): Promise<AgenticCommerceProofRow | null> =>
  queryFirst<AgenticCommerceProofRow>(
    db,
    'SELECT * FROM agentic_commerce_proofs WHERE session_id = ?',
    [sessionId],
  )

export const readProofRows = async (
  db: D1DatabaseLike,
  sessionId?: string | null,
): Promise<AgenticCommerceProofRow[]> => {
  if (sessionId) {
    const row = await readProofForSession(db, sessionId)
    return row ? [row] : []
  }
  const result = await db.prepare('SELECT * FROM agentic_commerce_proofs ORDER BY created_at, id').bind().all<AgenticCommerceProofRow>()
  return Array.isArray(result.results) ? result.results : []
}

export const writeProof = async (
  db: D1DatabaseLike,
  proof: { id: string; sessionId: string; proofJson: string; createdAt: string },
): Promise<void> => {
  await execute(
    db,
    `INSERT INTO agentic_commerce_proofs (id, session_id, proof_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET proof_json = excluded.proof_json`,
    [proof.id, proof.sessionId, proof.proofJson, proof.createdAt],
  )
}

export const writeTraceEvent = async (db: D1DatabaseLike, args: {
  sessionId: string
  eventType: string
  payload: unknown
  createdAt: string
}): Promise<void> => {
  const id = `trace_${buildAgenticCommerceSemanticKey('trace-event', [args.sessionId, args.eventType, args.createdAt])}`
  await execute(
    db,
    `INSERT INTO agentic_commerce_trace_events (id, session_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, args.sessionId, args.eventType, stableJson(args.payload), args.createdAt],
  )
}

export const readTraceRows = async (
  db: D1DatabaseLike,
  sessionId?: string | null,
): Promise<AgenticCommerceTraceRow[]> => {
  const query = sessionId
    ? db.prepare('SELECT * FROM agentic_commerce_trace_events WHERE session_id = ? ORDER BY created_at, id').bind(sessionId)
    : db.prepare('SELECT * FROM agentic_commerce_trace_events ORDER BY created_at, id').bind()
  const result = await query.all<AgenticCommerceTraceRow>()
  return Array.isArray(result.results) ? result.results : []
}
