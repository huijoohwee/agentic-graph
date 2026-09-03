import {
  AGENTIC_COMMERCE_ENV_KEYS,
  type AgenticCommerceEnvLike,
} from '../../../grph-shared/src/payments/agenticCommerceSsot'
import { readStripePaymentServerKey } from '../../../grph-shared/src/payments/stripePaymentSsot'
import {
  asRecord,
  readRecordString,
  type AgenticCommerceRiskSignal,
  type AgenticCommerceSessionRow,
  type OpenboxAction,
} from './agenticCommercePersistence'

type IntegrationResult =
  | { ok: true; status?: number; error?: string; details?: Record<string, unknown> }
  | { ok: false; status: number; error: string; details?: Record<string, unknown> }

const readEnvString = (env: AgenticCommerceEnvLike, key: string): string => String(env[key] || '').trim()

const readOpenboxAction = (value: unknown): OpenboxAction | '' => {
  const action = String(value || '').trim()
  return action === 'authorized' || action === 'manual_review' || action === 'blocked' ? action : ''
}

export const readOpenboxRiskSignal = async (
  env: AgenticCommerceEnvLike,
  session: AgenticCommerceSessionRow,
): Promise<AgenticCommerceRiskSignal | null> => {
  const apiUrl = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.openboxApiUrl)
  if (!apiUrl) return null
  const apiKey = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.openboxApiKey)
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        session_id: session.id,
        action: 'agentic_checkout_complete',
        payment_rail: session.payment_rail,
        amount_total: session.amount_total,
        currency: session.currency,
      }),
    })
    if (!response.ok) return null
    const body = asRecord(await response.json().catch(() => null))
    if (!body) return null
    const nested = asRecord(body.openbox_risk)
    const scoreValue = nested?.score ?? body.score ?? body.risk_score
    const score = typeof scoreValue === 'number' ? scoreValue : Number(scoreValue)
    const action = readOpenboxAction(nested?.action ?? body.action)
    if (!Number.isFinite(score) || !action) return null
    return { source: 'openbox', score, action, session_id: session.id }
  } catch {
    return null
  }
}

export const ingestOpenboxProof = async (
  env: AgenticCommerceEnvLike,
  proof: unknown,
): Promise<IntegrationResult | null> => {
  const ingestUrl = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.openboxIngestUrl)
  if (!ingestUrl) return null
  const apiKey = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.openboxApiKey)
  try {
    const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(proof),
    })
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? '' : `OpenBOX ingest failed with HTTP ${response.status}.`,
    } as IntegrationResult
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : 'OpenBOX ingest failed.',
    }
  }
}

export const authorizeStripeDelegatePayment = async (
  env: AgenticCommerceEnvLike,
  session: AgenticCommerceSessionRow,
  vaultToken: string,
): Promise<IntegrationResult> => {
  const delegateUrl = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.stripeDelegatePaymentUrl)
  if (!delegateUrl) return { ok: true, details: { delegated: false } }
  const apiKey = readStripePaymentServerKey(env)
  if (!apiKey) return { ok: false, status: 500, error: 'Missing server-managed Stripe key for delegate payment.' }
  const response = await fetch(delegateUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      session_id: session.id,
      vault_token: vaultToken,
      amount_total: session.amount_total,
      currency: session.currency,
      payment_rail: session.payment_rail,
    }),
  }).catch(() => null)
  if (!response) return { ok: false, status: 502, error: 'Stripe delegate payment request failed.' }
  if (!response.ok) return { ok: false, status: 422, error: `Stripe delegate payment failed with HTTP ${response.status}.` }
  return { ok: true, details: { delegated: true, status: response.status } }
}

const parseHexQuantity = (value: unknown): number => {
  const text = String(value || '').trim()
  if (!/^0x[0-9a-f]+$/i.test(text)) return 0
  return Number.parseInt(text.slice(2), 16)
}

const parseHexAmount = (value: unknown): bigint => {
  const text = String(value || '').trim()
  if (!/^0x[0-9a-f]+$/i.test(text)) return 0n
  return BigInt(text)
}

const parseErc20Transfer = (input: unknown): { recipient: string; amount: bigint } | null => {
  const text = String(input || '').trim().toLowerCase()
  if (!text.startsWith('0xa9059cbb') || text.length < 138) return null
  const recipientWord = text.slice(10, 74)
  const amountWord = text.slice(74, 138)
  if (!/^[0-9a-f]{64}$/.test(recipientWord) || !/^[0-9a-f]{64}$/.test(amountWord)) return null
  return {
    recipient: `0x${recipientWord.slice(24)}`,
    amount: BigInt(`0x${amountWord}`),
  }
}

export const confirmWeb3Transfer = async (
  env: AgenticCommerceEnvLike,
  session: AgenticCommerceSessionRow,
  txHash: string,
): Promise<IntegrationResult> => {
  const rpcUrl = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.baseRpcUrl)
  if (!rpcUrl) return { ok: false, status: 503, error: 'BASE_RPC_URL is required for Web3 transfer confirmation.' }
  const txResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] }),
  }).catch(() => null)
  if (!txResponse?.ok) return { ok: false, status: 502, error: 'Base RPC transaction lookup failed.' }
  const txBody = asRecord(await txResponse.json().catch(() => null))
  const tx = asRecord(txBody?.result)
  if (!tx) return { ok: false, status: 404, error: 'Base RPC transaction not found.' }
  const depositAddress = String(session.deposit_address || '').toLowerCase()
  const erc20Transfer = parseErc20Transfer(tx.input)
  const to = readRecordString(tx, 'to').toLowerCase()
  if (to !== depositAddress && erc20Transfer?.recipient !== depositAddress) {
    return { ok: false, status: 422, error: 'Base RPC transaction recipient does not match session deposit address.' }
  }
  const paidAmount = erc20Transfer ? erc20Transfer.amount : parseHexAmount(tx.value)
  if (paidAmount < BigInt(session.amount_total)) {
    return { ok: false, status: 422, error: 'Base RPC transaction value is below the checkout amount.' }
  }
  const blockNumber = parseHexQuantity(tx.blockNumber)
  if (blockNumber <= 0) return { ok: false, status: 409, error: 'Base RPC transaction is not confirmed yet.' }
  const requiredBlocks = Math.max(0, Math.floor(Number(readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.baseConfirmationBlocks) || 0)))
  if (requiredBlocks <= 0) return { ok: true, details: { block_number: blockNumber } }
  const blockResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }),
  }).catch(() => null)
  const blockBody = asRecord(await blockResponse?.json().catch(() => null))
  const latestBlock = parseHexQuantity(blockBody?.result)
  if (latestBlock - blockNumber + 1 < requiredBlocks) return { ok: false, status: 409, error: 'Base RPC transaction needs more confirmations.' }
  return { ok: true, details: { block_number: blockNumber, latest_block: latestBlock } }
}

export const attestWeb3Settlement = async (
  env: AgenticCommerceEnvLike,
  session: AgenticCommerceSessionRow,
  txHash: string,
): Promise<IntegrationResult & { attestationUid?: string }> => {
  const attestUrl = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.easAttestUrl)
  if (!attestUrl) return { ok: false, status: 503, error: 'EAS_ATTEST_URL is required for Web3 settlement attestation.' }
  const response = await fetch(attestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      session_id: session.id,
      tx_hash: txHash,
      payer_did: session.payer_did,
      amount_total: session.amount_total,
      currency: session.currency,
    }),
  }).catch(() => null)
  if (!response?.ok) return { ok: false, status: 502, error: 'EAS attestation request failed.' }
  const body = asRecord(await response.json().catch(() => null))
  const attestationUid = body ? readRecordString(body, 'attestation_uid') || readRecordString(body, 'uid') : ''
  if (!attestationUid) return { ok: false, status: 502, error: 'EAS attestation response missing attestation_uid.' }
  return { ok: true, attestationUid }
}
