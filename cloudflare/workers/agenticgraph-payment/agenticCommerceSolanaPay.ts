import {
  AGENTIC_COMMERCE_SOLANA_PAY_KEY,
  buildAgenticCommerceSolanaPayReference,
  buildAgenticCommerceSolanaPayUrl,
  formatAgenticCommerceSolanaPayAmount,
  readAgenticCommerceSolanaPayAmountScale,
  readAgenticCommerceSolanaPayCommitment,
  readAgenticCommerceSolanaPayLabel,
  readAgenticCommerceSolanaPayNetwork,
  readAgenticCommerceSolanaPayRecipient,
  readAgenticCommerceSolanaPayRpcUrl,
  readAgenticCommerceSolanaPaySplToken,
} from '../../../grph-shared/src/payments/agenticCommerceSolanaPaySsot'
import type { AgenticCommerceEnvLike } from '../../../grph-shared/src/payments/agenticCommerceSsot'
import {
  asRecord,
  parseJson,
  readRecordString,
  type AgenticCommerceSessionRow,
} from './agenticCommercePersistence'

type SolanaPaySessionSeed = {
  id: string
  amountTotal: number
  currency: string
}

type SolanaPaySessionResponse = {
  url: string
  recipient: string
  amount: string
  reference: string
  memo: string
  label: string
  message: string
  network: string
  spl_token?: string
}

type SolanaPayConfirmResult =
  | { ok: true; details: Record<string, unknown> }
  | { ok: false; status: number; error: string }

const readArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const normalizeSignature = (value: string): string =>
  /^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(value.trim()) ? value.trim() : ''

const decimalToUnits = (value: string, decimals: number): bigint => {
  const text = String(value || '').trim()
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) return 0n
  const [whole, fraction = ''] = text.split('.')
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(`${whole}${padded}`.replace(/^0+(?=\d)/, '') || '0')
}

const readAccountKey = (value: unknown): string => {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  return record ? readRecordString(record, 'pubkey') : ''
}

const readAccountKeys = (transaction: Record<string, unknown>): string[] => {
  const message = asRecord(asRecord(transaction.transaction)?.message)
  return readArray(message?.accountKeys).map(readAccountKey).filter(Boolean)
}

const readTokenRawAmount = (value: unknown): bigint => {
  const amount = readRecordString(asRecord(value) || {}, 'amount')
  return /^[0-9]+$/.test(amount) ? BigInt(amount) : 0n
}

const readTokenDecimals = (value: unknown): number => {
  const decimals = asRecord(value)?.decimals
  const parsed = typeof decimals === 'number' ? decimals : Number(decimals)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 18 ? parsed : 0
}

const readTokenRecipientDelta = (
  meta: Record<string, unknown>,
  recipient: string,
  splToken: string,
): { delta: bigint; decimals: number } => {
  const byAccount = new Map<string, { pre: bigint; post: bigint; decimals: number }>()
  const applyBalance = (value: unknown, phase: 'pre' | 'post') => {
    const row = asRecord(value)
    if (!row || readRecordString(row, 'mint') !== splToken || readRecordString(row, 'owner') !== recipient) return
    const accountIndex = String(row.accountIndex ?? '')
    const uiTokenAmount = asRecord(row.uiTokenAmount)
    if (!accountIndex || !uiTokenAmount) return
    const current = byAccount.get(accountIndex) || { pre: 0n, post: 0n, decimals: readTokenDecimals(uiTokenAmount) }
    byAccount.set(accountIndex, { ...current, [phase]: readTokenRawAmount(uiTokenAmount) })
  }
  readArray(meta.preTokenBalances).forEach(row => applyBalance(row, 'pre'))
  readArray(meta.postTokenBalances).forEach(row => applyBalance(row, 'post'))
  let delta = 0n
  let decimals = 0
  byAccount.forEach(value => {
    if (value.post > value.pre) delta += value.post - value.pre
    decimals = Math.max(decimals, value.decimals)
  })
  return { delta, decimals }
}

const hasMemoInstruction = (transaction: Record<string, unknown>, memo: string): boolean => {
  const message = asRecord(asRecord(transaction.transaction)?.message)
  return readArray(message?.instructions).some(instruction => {
    const record = asRecord(instruction)
    if (!record || readRecordString(record, 'program') !== 'spl-memo') return false
    const parsed = record.parsed
    if (typeof parsed === 'string') return parsed === memo
    const parsedRecord = asRecord(parsed)
    return parsedRecord ? readRecordString(parsedRecord, 'memo') === memo : false
  })
}

const validateSolanaPayTransaction = (
  transaction: Record<string, unknown>,
  expected: SolanaPaySessionResponse,
): SolanaPayConfirmResult => {
  const meta = asRecord(transaction.meta)
  if (!meta || meta.err) return { ok: false, status: 422, error: 'Solana Pay transaction failed on-chain.' }
  const accountKeys = readAccountKeys(transaction)
  if (!accountKeys.includes(expected.reference)) {
    return { ok: false, status: 422, error: 'Solana Pay transaction reference does not match the checkout session.' }
  }
  if (!hasMemoInstruction(transaction, expected.memo)) {
    return { ok: false, status: 422, error: 'Solana Pay transaction memo does not match the checkout session.' }
  }
  if (expected.spl_token) {
    const { delta, decimals } = readTokenRecipientDelta(meta, expected.recipient, expected.spl_token)
    const expectedUnits = decimalToUnits(expected.amount, decimals)
    if (expectedUnits <= 0n || delta < expectedUnits) {
      return { ok: false, status: 422, error: 'Solana Pay token transfer amount or recipient does not match the checkout session.' }
    }
    return { ok: true, details: { reference: expected.reference, token_delta: delta.toString(), decimals } }
  }
  const recipientIndex = accountKeys.indexOf(expected.recipient)
  const preBalance = Number(readArray(meta.preBalances)[recipientIndex] ?? 0)
  const postBalance = Number(readArray(meta.postBalances)[recipientIndex] ?? 0)
  const expectedLamports = decimalToUnits(expected.amount, 9)
  if (recipientIndex < 0 || BigInt(Math.max(0, postBalance - preBalance)) < expectedLamports) {
    return { ok: false, status: 422, error: 'Solana Pay SOL transfer amount or recipient does not match the checkout session.' }
  }
  return { ok: true, details: { reference: expected.reference, lamports_delta: Math.max(0, postBalance - preBalance) } }
}

export const buildAgenticCommerceSolanaPaySessionResponse = (
  env: AgenticCommerceEnvLike,
  session: SolanaPaySessionSeed,
): { ok: true; solanaPay: SolanaPaySessionResponse; recipient: string } | { ok: false; error: string } => {
  const recipient = readAgenticCommerceSolanaPayRecipient(env)
  if (!recipient) return { ok: false, error: 'SOLANA_PAY_RECIPIENT is required for Solana Pay checkout sessions.' }
  const currency = String(session.currency || '').trim().toLowerCase()
  const splToken = readAgenticCommerceSolanaPaySplToken(env)
  if (currency !== 'sol' && !splToken) {
    return { ok: false, error: 'SOLANA_PAY_SPL_TOKEN is required for non-SOL Solana Pay checkout sessions.' }
  }
  const scale = readAgenticCommerceSolanaPayAmountScale(env, currency)
  const amount = formatAgenticCommerceSolanaPayAmount(session.amountTotal, scale)
  const reference = buildAgenticCommerceSolanaPayReference(session.id)
  const label = readAgenticCommerceSolanaPayLabel(env)
  const message = `Knowgrph checkout ${session.id}`
  const memo = `knowgrph:${session.id}`
  const solanaPay = {
    url: buildAgenticCommerceSolanaPayUrl({ recipient, amount, reference, label, message, memo, splToken }),
    recipient,
    amount,
    reference,
    memo,
    label,
    message,
    network: readAgenticCommerceSolanaPayNetwork(env),
    ...(splToken ? { spl_token: splToken } : {}),
  }
  return { ok: true, solanaPay, recipient }
}

export const readAgenticCommerceSolanaPaySessionResponse = (
  session: AgenticCommerceSessionRow,
): SolanaPaySessionResponse | null => {
  const response = asRecord(parseJson(session.response_json || '{}', {}))
  const solanaPay = response ? asRecord(response[AGENTIC_COMMERCE_SOLANA_PAY_KEY]) : null
  if (!solanaPay) return null
  const expected = {
    url: readRecordString(solanaPay, 'url'),
    recipient: readRecordString(solanaPay, 'recipient'),
    amount: readRecordString(solanaPay, 'amount'),
    reference: readRecordString(solanaPay, 'reference'),
    memo: readRecordString(solanaPay, 'memo'),
    label: readRecordString(solanaPay, 'label'),
    message: readRecordString(solanaPay, 'message'),
    network: readRecordString(solanaPay, 'network'),
    spl_token: readRecordString(solanaPay, 'spl_token') || undefined,
  }
  return expected.url && expected.recipient && expected.amount && expected.reference && expected.memo ? expected : null
}

export const confirmAgenticCommerceSolanaPayTransfer = async (
  env: AgenticCommerceEnvLike,
  session: AgenticCommerceSessionRow,
  signature: string,
): Promise<SolanaPayConfirmResult> => {
  const normalizedSignature = normalizeSignature(signature)
  if (!normalizedSignature) return { ok: false, status: 400, error: 'A valid Solana Pay transaction signature is required.' }
  const expected = readAgenticCommerceSolanaPaySessionResponse(session)
  if (!expected) return { ok: false, status: 422, error: 'Solana Pay checkout session is missing payment request metadata.' }
  const rpcUrl = readAgenticCommerceSolanaPayRpcUrl(env)
  if (!rpcUrl) return { ok: false, status: 503, error: 'SOLANA_PAY_RPC_URL is required for Solana Pay settlement.' }
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: session.id,
      method: 'getTransaction',
      params: [
        normalizedSignature,
        {
          encoding: 'jsonParsed',
          commitment: readAgenticCommerceSolanaPayCommitment(env),
          maxSupportedTransactionVersion: 0,
        },
      ],
    }),
  }).catch(() => null)
  if (!response?.ok) return { ok: false, status: 502, error: 'Solana RPC transaction lookup failed.' }
  const body = asRecord(await response.json().catch(() => null))
  const transaction = asRecord(body?.result)
  if (!transaction) return { ok: false, status: 409, error: 'Solana Pay transaction is not confirmed yet.' }
  const validated = validateSolanaPayTransaction(transaction, expected)
  return validated.ok ? { ok: true, details: { ...validated.details, signature: normalizedSignature } } : validated
}
