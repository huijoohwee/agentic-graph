import {
  AGENTIC_COMMERCE_API_VERSION,
  type AgenticCommerceEnvLike,
} from '../../../grph-shared/src/payments/agenticCommerceSsot'
import { AGENTIC_COMMERCE_SOLANA_PAY_KEY } from '../../../grph-shared/src/payments/agenticCommerceSolanaPaySsot'
import type { D1DatabaseLike } from '../shared/d1'
import {
  asRecord,
  readRecordString,
  readSession,
  writeTraceEvent,
  type AgenticCommerceSessionRow,
} from './agenticCommercePersistence'
import { attestWeb3Settlement, confirmWeb3Transfer } from './agenticCommerceIntegrations'
import { settleAgenticCommerceSession } from './agenticCommerceSettlement'
import { confirmAgenticCommerceSolanaPayTransfer } from './agenticCommerceSolanaPay'
import { errorJson, json, readRequestJson, type HeadersRecord } from './agenticCommerceHttp'

export const settleAgenticCommerceSolanaPaySession = async (
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  session: AgenticCommerceSessionRow,
  payload: Record<string, unknown>,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  if (session.payment_rail !== AGENTIC_COMMERCE_SOLANA_PAY_KEY) {
    return errorJson(422, 'Solana Pay settlement requires a solana_pay ACP session.', corsHeaders)
  }
  const signature = readRecordString(payload, 'signature') || readRecordString(payload, 'tx_signature') || readRecordString(payload, 'tx_hash')
  const confirmation = await confirmAgenticCommerceSolanaPayTransfer(env, session, signature)
  if (confirmation.ok === false) return errorJson(confirmation.status, confirmation.error, corsHeaders)
  const confirmedAt = new Date().toISOString()
  await writeTraceEvent(db, {
    sessionId: session.id,
    eventType: 'knowgrph.commerce.solana_pay_confirm',
    payload: {
      tool: 'knowgrph.commerce.solana_pay_confirm',
      session_id: session.id,
      provider: AGENTIC_COMMERCE_SOLANA_PAY_KEY,
      signature,
      details: confirmation.details,
    },
    createdAt: confirmedAt,
  })
  const settled = await settleAgenticCommerceSession(db, env, session.id, { txHash: signature })
  if (!settled) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  return json(200, { ok: true, apiVersion: AGENTIC_COMMERCE_API_VERSION, session: settled.session, proof: settled.proof }, corsHeaders)
}

export const handleAgenticCommerceWeb3Settle = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const payload = asRecord(await readRequestJson(request)) || {}
  const sessionId = readRecordString(payload, 'session_id')
  const txHash = readRecordString(payload, 'tx_hash')
  if (!sessionId) return errorJson(400, 'session_id is required.', corsHeaders)
  if (!txHash) return errorJson(400, 'tx_hash is required.', corsHeaders)
  const session = await readSession(db, sessionId)
  if (!session) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  if (session.payment_rail !== 'erc20') return errorJson(422, 'Web3 settlement requires an ERC-20 ACP session.', corsHeaders)
  const confirmation = await confirmWeb3Transfer(env, session, txHash)
  if (!confirmation.ok) return errorJson(confirmation.status, confirmation.error, corsHeaders)
  const confirmedAt = new Date().toISOString()
  await writeTraceEvent(db, {
    sessionId,
    eventType: 'knowgrph.commerce.web3_confirm',
    payload: { tool: 'knowgrph.commerce.web3_confirm', session_id: sessionId, tx_hash: txHash, details: confirmation.details || null },
    createdAt: confirmedAt,
  })
  const attestation = await attestWeb3Settlement(env, session, txHash)
  if (!attestation.ok) return errorJson(attestation.status, attestation.error, corsHeaders)
  await writeTraceEvent(db, {
    sessionId,
    eventType: 'knowgrph.commerce.attest',
    payload: { tool: 'knowgrph.commerce.attest', session_id: sessionId, tx_hash: txHash, attestation_uid: attestation.attestationUid },
    createdAt: new Date().toISOString(),
  })
  const settled = await settleAgenticCommerceSession(db, env, sessionId, { txHash, attestationUid: attestation.attestationUid || null })
  if (!settled) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  return json(200, { ok: true, apiVersion: AGENTIC_COMMERCE_API_VERSION, session: settled.session, proof: settled.proof }, corsHeaders)
}

export const handleAgenticCommerceSolanaPaySettle = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const payload = asRecord(await readRequestJson(request)) || {}
  const sessionId = readRecordString(payload, 'session_id')
  if (!sessionId) return errorJson(400, 'session_id is required.', corsHeaders)
  const session = await readSession(db, sessionId)
  if (!session) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  return settleAgenticCommerceSolanaPaySession(env, db, session, payload, corsHeaders)
}
