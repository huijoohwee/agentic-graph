import {
  AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY,
  buildAgenticCommerceSemanticKey,
  type AgenticCommerceEnvLike,
} from '../../../grph-shared/src/payments/agenticCommerceSsot'
import { AGENTIC_COMMERCE_SOLANA_PAY_KEY } from '../../../grph-shared/src/payments/agenticCommerceSolanaPaySsot'
import { STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID } from '../../../grph-shared/src/payments/stripePaymentSsot'
import type { D1DatabaseLike } from '../shared/d1'
import {
  asRecord,
  mapSessionRow,
  parseJson,
  readProofForSession,
  readRecordString,
  readSession,
  stableJson,
  updateSessionState,
  writeProof,
  writeTraceEvent,
  type AgenticCommerceRiskSignal,
  type AgenticCommerceSessionRow,
} from './agenticCommercePersistence'
import { ingestOpenboxProof, readOpenboxRiskSignal } from './agenticCommerceIntegrations'

const buildProof = (args: {
  session: AgenticCommerceSessionRow
  riskSignal: AgenticCommerceRiskSignal | null
  completedAt: string
  txHash?: string | null
  attestationUid?: string | null
}) => {
  const proofId = `proof_${buildAgenticCommerceSemanticKey('commerce-proof', [
    args.session.id,
    args.completedAt,
    args.riskSignal?.score ?? '',
    args.riskSignal?.action ?? '',
    args.txHash || '',
    args.attestationUid || '',
  ])}`
  const canvasNode = args.session.payment_rail === 'erc20' || args.session.payment_rail === AGENTIC_COMMERCE_SOLANA_PAY_KEY
    ? {
        type: '@node:proof',
        session_id: args.session.id,
        payment_rail: args.session.payment_rail,
        tx_hash: args.txHash || null,
        attestation_uid: args.attestationUid || null,
      }
    : null
  return {
    proof_id: proofId,
    session_id: args.session.id,
    status: 'complete',
    payment_rail: args.session.payment_rail,
    amount_total: args.session.amount_total,
    currency: args.session.currency,
    ...(args.riskSignal ? { openbox_risk: args.riskSignal } : {}),
    ...(args.attestationUid ? { attestation_uid: args.attestationUid } : {}),
    ...(canvasNode ? { canvas_node: canvasNode } : {}),
    cost_log: {
      model: 'none',
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hits: 0,
      estimated_cost_usd: 0,
    },
  }
}

const readNumber = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) ? Math.floor(amount) : 0
}

const readStripeCheckoutSessionId = (stripeSession: Record<string, unknown>): string =>
  readRecordString(stripeSession, 'id')

const readStripeCheckoutSessionStatus = (stripeSession: Record<string, unknown>): string =>
  readRecordString(stripeSession, 'status') || 'unknown'

const readStripeCheckoutPaymentStatus = (stripeSession: Record<string, unknown>): string =>
  readRecordString(stripeSession, 'payment_status') || 'unknown'

const readStoredStripeCheckoutResponse = (session: AgenticCommerceSessionRow): Record<string, unknown> | null => {
  const response = asRecord(parseJson(session.response_json || '{}', {}))
  const stripeCheckout = response ? asRecord(response[AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]) : null
  return stripeCheckout || null
}

const readStripeCheckoutResponseForSession = (
  session: AgenticCommerceSessionRow,
  stripeSession?: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  const stripeCheckout = readStoredStripeCheckoutResponse(session)
  if (!stripeSession) return stripeCheckout
  const id = readStripeCheckoutSessionId(stripeSession) || readRecordString(stripeCheckout || {}, 'id')
  if (!id) return stripeCheckout
  const url = readRecordString(stripeSession, 'url') || readRecordString(stripeCheckout || {}, 'url')
  return {
    ...(stripeCheckout || {}),
    id,
    ...(url ? { url } : {}),
    status: readStripeCheckoutSessionStatus(stripeSession),
    payment_status: readStripeCheckoutPaymentStatus(stripeSession),
  }
}

const buildSessionResponseJson = (
  session: AgenticCommerceSessionRow,
  stripeSession?: Record<string, unknown> | null,
): string => {
  const stripeCheckout = readStripeCheckoutResponseForSession(session, stripeSession)
  return stableJson({
    ...mapSessionRow(session),
    ...(stripeCheckout ? { [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: stripeCheckout } : {}),
  })
}

const readFiatSessionForStripeSession = async (
  db: D1DatabaseLike,
  stripeSession: Record<string, unknown>,
): Promise<AgenticCommerceSessionRow | null> => {
  const metadata = asRecord(stripeSession.metadata)
  const sessionId = metadata ? readRecordString(metadata, STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID) : ''
  if (!sessionId) return null
  const clientReferenceId = readRecordString(stripeSession, 'client_reference_id')
  if (clientReferenceId !== sessionId) return null
  const session = await readSession(db, sessionId)
  if (!session || session.payment_rail !== 'fiat') return null
  const amountTotal = readNumber(stripeSession.amount_total)
  const currency = readRecordString(stripeSession, 'currency').toLowerCase()
  if (amountTotal !== session.amount_total || !currency || currency !== session.currency.toLowerCase()) return null
  return session
}

const isStripeCheckoutPaymentResolved = (stripeSession: Record<string, unknown>): boolean => {
  const paymentStatus = readStripeCheckoutPaymentStatus(stripeSession).toLowerCase()
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
}

const isStripeCheckoutExpired = (stripeSession: Record<string, unknown>): boolean =>
  readStripeCheckoutSessionStatus(stripeSession).toLowerCase() === 'expired'

const isTerminalSessionStatus = (session: AgenticCommerceSessionRow): boolean =>
  session.status === 'complete' || session.status === 'cancelled' || session.status === 'payment_failed'

const isFailedOrCancelledSessionStatus = (session: AgenticCommerceSessionRow): boolean =>
  session.status === 'cancelled' || session.status === 'payment_failed'

export const settleAgenticCommerceSession = async (
  db: D1DatabaseLike,
  env: AgenticCommerceEnvLike,
  sessionId: string,
  options: { txHash?: string | null; attestationUid?: string | null; stripeSession?: Record<string, unknown> | null } = {},
): Promise<{ session: ReturnType<typeof mapSessionRow>; proof: unknown } | null> => {
  const session = await readSession(db, sessionId)
  if (!session) return null
  if (isFailedOrCancelledSessionStatus(session)) return null
  const existingProof = await readProofForSession(db, sessionId)
  if (session.status === 'complete' && existingProof) {
    return { session: mapSessionRow(session), proof: parseJson(existingProof.proof_json, null) }
  }

  const completedAt = session.completed_at || new Date().toISOString()
  const riskSignal = await readOpenboxRiskSignal(env, session)
  const riskSignals = riskSignal ? [riskSignal] : []
  const completedSession: AgenticCommerceSessionRow = {
    ...session,
    status: 'complete',
    updated_at: completedAt,
    completed_at: completedAt,
    risk_signals_json: stableJson(riskSignals),
  }
  const proof = buildProof({
    session: completedSession,
    riskSignal,
    completedAt,
    txHash: options.txHash || null,
    attestationUid: options.attestationUid || null,
  })
  await updateSessionState(db, {
    id: session.id,
    status: 'complete',
    responseJson: buildSessionResponseJson(completedSession, options.stripeSession),
    riskSignalsJson: stableJson(riskSignals),
    updatedAt: completedAt,
    completedAt,
  })
  await writeProof(db, {
    id: proof.proof_id,
    sessionId: session.id,
    proofJson: stableJson(proof),
    createdAt: completedAt,
  })
  await writeTraceEvent(db, {
    sessionId: session.id,
    eventType: 'knowgrph.commerce.settle',
    payload: {
      tool: 'knowgrph.commerce.settle',
      session_id: session.id,
      proof_id: proof.proof_id,
      risk_signal_source: riskSignal?.source || null,
    },
    createdAt: completedAt,
  })
  const ingestResult = await ingestOpenboxProof(env, proof)
  if (ingestResult) {
    await writeTraceEvent(db, {
      sessionId: session.id,
      eventType: 'knowgrph.commerce.openbox_ingest',
      payload: {
        tool: 'knowgrph.commerce.openbox_ingest',
        session_id: session.id,
        proof_id: proof.proof_id,
        ok: ingestResult.ok,
        status: ingestResult.status,
        error: ingestResult.ok ? null : ingestResult.error,
      },
      createdAt: completedAt,
    })
  }
  const updated = await readSession(db, session.id)
  return {
    session: updated ? mapSessionRow(updated) : mapSessionRow(completedSession),
    proof,
  }
}

export const settleAgenticCommerceSessionFromStripeSession = async (
  db: D1DatabaseLike,
  env: AgenticCommerceEnvLike,
  stripeSession: Record<string, unknown>,
): Promise<void> => {
  const session = await readFiatSessionForStripeSession(db, stripeSession)
  if (!session || isTerminalSessionStatus(session) || !isStripeCheckoutPaymentResolved(stripeSession)) return
  await settleAgenticCommerceSession(db, env, session.id, { stripeSession })
}

export const failAgenticCommerceSessionFromStripeSession = async (
  db: D1DatabaseLike,
  stripeSession: Record<string, unknown>,
): Promise<void> => {
  const session = await readFiatSessionForStripeSession(db, stripeSession)
  if (!session || isTerminalSessionStatus(session)) return
  if (isStripeCheckoutPaymentResolved(stripeSession)) return
  const failedAt = new Date().toISOString()
  const failedSession: AgenticCommerceSessionRow = {
    ...session,
    status: 'payment_failed',
    updated_at: failedAt,
  }
  await updateSessionState(db, {
    id: session.id,
    status: 'payment_failed',
    responseJson: buildSessionResponseJson(failedSession, stripeSession),
    riskSignalsJson: session.risk_signals_json || '[]',
    updatedAt: failedAt,
  })
  await writeTraceEvent(db, {
    sessionId: session.id,
    eventType: 'knowgrph.commerce.payment_failed',
    payload: {
      tool: 'knowgrph.commerce.payment_failed',
      provider: 'stripe',
      session_id: session.id,
      stripe_session_id: readStripeCheckoutSessionId(stripeSession) || null,
      stripe_status: readStripeCheckoutSessionStatus(stripeSession),
      stripe_payment_status: readStripeCheckoutPaymentStatus(stripeSession),
    },
    createdAt: failedAt,
  })
}

export const cancelAgenticCommerceSessionFromExpiredStripeSession = async (
  db: D1DatabaseLike,
  stripeSession: Record<string, unknown>,
): Promise<void> => {
  const session = await readFiatSessionForStripeSession(db, stripeSession)
  if (!session || isTerminalSessionStatus(session) || !isStripeCheckoutExpired(stripeSession)) return
  if (isStripeCheckoutPaymentResolved(stripeSession)) return
  const cancelledAt = session.cancelled_at || new Date().toISOString()
  const cancelledSession: AgenticCommerceSessionRow = {
    ...session,
    status: 'cancelled',
    updated_at: cancelledAt,
    cancelled_at: cancelledAt,
  }
  await updateSessionState(db, {
    id: session.id,
    status: 'cancelled',
    responseJson: buildSessionResponseJson(cancelledSession, stripeSession),
    riskSignalsJson: session.risk_signals_json || '[]',
    updatedAt: cancelledAt,
    cancelledAt,
  })
  await writeTraceEvent(db, {
    sessionId: session.id,
    eventType: 'knowgrph.commerce.checkout_expired',
    payload: {
      tool: 'knowgrph.commerce.checkout_expired',
      provider: 'stripe',
      session_id: session.id,
      stripe_session_id: readStripeCheckoutSessionId(stripeSession) || null,
      stripe_status: readStripeCheckoutSessionStatus(stripeSession),
      stripe_payment_status: readStripeCheckoutPaymentStatus(stripeSession),
    },
    createdAt: cancelledAt,
  })
}
