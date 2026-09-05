import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import { parsePaymentPayload } from '@x402/core/schemas'
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types'

import { readBoundedJson } from './travelAgency/boundedJson'

const FACILITATOR_RESPONSE_BYTES = 32 * 1024
const XRPL_RESPONSE_BYTES = 64 * 1024
const PAYMENT_SIGNATURE_HEADER_CHARS = 32 * 1024
const JSON_MAX_DEPTH = 32
const JSON_MAX_NODES = 2_048
const MAX_SIGNED_BLOB_HEX_CHARS = 32 * 1024
const XRPL_TRANSACTION_PREFIX = new Uint8Array([0x54, 0x58, 0x4e, 0x00])

type JsonRecord = Record<string, unknown>
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type XrplX402Transport = Readonly<{
  facilitatorUrl: string
  facilitatorAuthorization?: string
  facilitatorTimeoutMs: number
  rpcUrl: string
  rpcTimeoutMs: number
  fetchFn?: FetchLike
}>

export type ParsedXrplPayment = Readonly<{
  paymentPayload: PaymentPayload
  signedTxBlob: string
  paymentPayloadDigest: string
  signedTxBlobDigest: string
  transactionHash: string
}>

export type PaymentParseResult =
  | { ok: true; payment: ParsedXrplPayment }
  | { ok: false; code: 'payment_signature_invalid' | 'payment_requirements_mismatch' }

export type FacilitatorSupportResult =
  | { ok: true }
  | { ok: false; code: 'facilitator_unavailable' | 'facilitator_unsupported' }

export type VerifyResult =
  | { ok: true; response: VerifyResponse }
  | { ok: false; code: 'payment_invalid' | 'facilitator_unavailable' }

export type SettleResult =
  | { ok: true; response: SettleResponse }
  | { ok: false; code: 'settlement_failed' | 'settlement_unknown' }

export type ReconciliationResult =
  | { status: 'fulfilled'; response: SettleResponse }
  | { status: 'failed'; transactionHash: string }
  | { status: 'pending'; transactionHash: string }
  | { status: 'unavailable'; transactionHash: string }

const isRecord = (value: unknown): value is JsonRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const hasBoundedJsonShape = (root: unknown): boolean => {
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [{ value: root, depth: 0 }]
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop() as { value: unknown; depth: number }
    nodes += 1
    if (nodes > JSON_MAX_NODES || current.depth > JSON_MAX_DEPTH) return false
    if (!current.value || typeof current.value !== 'object') continue
    for (const value of Object.values(current.value)) {
      pending.push({ value, depth: current.depth + 1 })
    }
  }
  return true
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  )
}

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value))

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

const sha = async (algorithm: 'SHA-256' | 'SHA-512', bytes: Uint8Array): Promise<Uint8Array> => {
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return new Uint8Array(await crypto.subtle.digest(algorithm, input))
}

export const sha256Hex = async (value: string): Promise<string> =>
  bytesToHex(await sha('SHA-256', new TextEncoder().encode(value)))

const decodeHex = (value: string): Uint8Array | null => {
  if (
    value.length < 2
    || value.length > MAX_SIGNED_BLOB_HEX_CHARS
    || value.length % 2 !== 0
    || !/^[0-9a-fA-F]+$/.test(value)
  ) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

export const xrplTransactionHash = async (signedTxBlob: string): Promise<string | null> => {
  const transaction = decodeHex(signedTxBlob)
  if (!transaction) return null
  const prefixed = new Uint8Array(XRPL_TRANSACTION_PREFIX.length + transaction.length)
  prefixed.set(XRPL_TRANSACTION_PREFIX)
  prefixed.set(transaction, XRPL_TRANSACTION_PREFIX.length)
  return bytesToHex((await sha('SHA-512', prefixed)).slice(0, 32)).toUpperCase()
}

const exactRequirements = (
  left: PaymentRequirements,
  right: PaymentRequirements,
): boolean => canonicalJson(left) === canonicalJson(right)

const exactResource = (
  payload: PaymentPayload,
  required: PaymentRequired,
): boolean => payload.x402Version === 2
  && (!payload.resource || canonicalJson(payload.resource) === canonicalJson(required.resource))

export const parseXrplPaymentSignature = async (args: {
  header: string
  requirements: PaymentRequirements
  paymentRequired: PaymentRequired
}): Promise<PaymentParseResult> => {
  if (args.header.length > PAYMENT_SIGNATURE_HEADER_CHARS) {
    return { ok: false, code: 'payment_signature_invalid' }
  }
  try {
    const decoded = decodePaymentSignatureHeader(args.header)
    if (!hasBoundedJsonShape(decoded)) return { ok: false, code: 'payment_signature_invalid' }
    const parsed = parsePaymentPayload(decoded)
    if (!parsed.success || parsed.data.x402Version !== 2) {
      return { ok: false, code: 'payment_signature_invalid' }
    }
    const paymentPayload = parsed.data as unknown as PaymentPayload
    if (!exactRequirements(paymentPayload.accepted, args.requirements)
      || !exactResource(paymentPayload, args.paymentRequired)) {
      return { ok: false, code: 'payment_requirements_mismatch' }
    }
    const payload = paymentPayload.payload
    const keys = Object.keys(payload).sort()
    const signedTxBlob = payload.signedTxBlob
    const invoiceId = payload.invoiceId
    if (keys.length !== 2 || keys[0] !== 'invoiceId' || keys[1] !== 'signedTxBlob'
      || typeof signedTxBlob !== 'string' || typeof invoiceId !== 'string'
      || invoiceId !== args.requirements.extra?.invoiceId) {
      return { ok: false, code: 'payment_signature_invalid' }
    }
    const transactionHash = await xrplTransactionHash(signedTxBlob)
    if (!transactionHash) return { ok: false, code: 'payment_signature_invalid' }
    const normalizedBlob = signedTxBlob.toUpperCase()
    const [paymentPayloadDigest, signedTxBlobDigest] = await Promise.all([
      sha256Hex(canonicalJson(paymentPayload)), sha256Hex(normalizedBlob),
    ])
    return { ok: true, payment: Object.freeze({
      paymentPayload, signedTxBlob: normalizedBlob, paymentPayloadDigest,
      signedTxBlobDigest, transactionHash,
    }) }
  } catch {
    return { ok: false, code: 'payment_signature_invalid' }
  }
}

export const paymentRequiredHeader = (value: PaymentRequired): string =>
  encodePaymentRequiredHeader(value)

export const paymentResponseHeader = (value: SettleResponse): string =>
  encodePaymentResponseHeader(value)

const cleanBaseUrl = (value: string): string => value.replace(/\/+$/g, '')

const boundedFetchJson = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes: number,
  fetchFn: FetchLike,
): Promise<{ response: Response; body: unknown } | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    })
    const body = await readBoundedJson(response, maxBytes)
    if (body === null || !hasBoundedJsonShape(body)) return null
    return { response, body }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const facilitatorHeaders = (authorization?: string): Headers => {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (authorization) headers.set('authorization', authorization)
  return headers
}

const facilitatorBody = (
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): string => JSON.stringify({
  x402Version: paymentPayload.x402Version,
  paymentPayload,
  paymentRequirements,
})

export const checkXrplFacilitatorSupport = async (
  transport: XrplX402Transport,
  requirements: PaymentRequirements,
): Promise<FacilitatorSupportResult> => {
  const fetchFn = transport.fetchFn ?? fetch
  const result = await boundedFetchJson(
    `${cleanBaseUrl(transport.facilitatorUrl)}/supported`,
    { method: 'GET', headers: facilitatorHeaders(transport.facilitatorAuthorization) },
    transport.facilitatorTimeoutMs,
    FACILITATOR_RESPONSE_BYTES,
    fetchFn,
  )
  if (!result || !result.response.ok || !isRecord(result.body) || !Array.isArray(result.body.kinds)) {
    return { ok: false, code: 'facilitator_unavailable' }
  }
  const supported = result.body.kinds.some((kind) =>
    isRecord(kind)
    && kind.x402Version === 2
    && kind.scheme === requirements.scheme
    && kind.network === requirements.network)
  return supported ? { ok: true } : { ok: false, code: 'facilitator_unsupported' }
}

const readOptionalString = (value: unknown, max = 512): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined

export const verifyXrplPayment = async (args: {
  transport: XrplX402Transport
  paymentPayload: PaymentPayload
  requirements: PaymentRequirements
}): Promise<VerifyResult> => {
  const result = await boundedFetchJson(
    `${cleanBaseUrl(args.transport.facilitatorUrl)}/verify`,
    {
      method: 'POST',
      headers: facilitatorHeaders(args.transport.facilitatorAuthorization),
      body: facilitatorBody(args.paymentPayload, args.requirements),
    },
    args.transport.facilitatorTimeoutMs,
    FACILITATOR_RESPONSE_BYTES,
    args.transport.fetchFn ?? fetch,
  )
  if (!result || !isRecord(result.body) || typeof result.body.isValid !== 'boolean') {
    return { ok: false, code: 'facilitator_unavailable' }
  }
  if (!result.response.ok) {
    return {
      ok: false,
      code: result.response.status >= 500 || result.response.status === 408 || result.response.status === 429
        ? 'facilitator_unavailable'
        : 'payment_invalid',
    }
  }
  if (result.body.isValid !== true) {
    return { ok: false, code: 'payment_invalid' }
  }
  return {
    ok: true,
    response: {
      isValid: true,
      ...(readOptionalString(result.body.payer, 128) ? { payer: result.body.payer as string } : {}),
      ...(isRecord(result.body.extensions) ? { extensions: result.body.extensions } : {}),
      ...(isRecord(result.body.extra) ? { extra: result.body.extra } : {}),
    },
  }
}

export const settleXrplPayment = async (args: {
  transport: XrplX402Transport
  paymentPayload: PaymentPayload
  requirements: PaymentRequirements
  transactionHash: string
}): Promise<SettleResult> => {
  const result = await boundedFetchJson(
    `${cleanBaseUrl(args.transport.facilitatorUrl)}/settle`,
    {
      method: 'POST',
      headers: facilitatorHeaders(args.transport.facilitatorAuthorization),
      body: facilitatorBody(args.paymentPayload, args.requirements),
    },
    args.transport.facilitatorTimeoutMs,
    FACILITATOR_RESPONSE_BYTES,
    args.transport.fetchFn ?? fetch,
  )
  if (!result || !isRecord(result.body)) {
    return { ok: false, code: 'settlement_unknown' }
  }
  const transaction = readOptionalString(result.body.transaction, 128)
  const network = readOptionalString(result.body.network, 128)
  const amount = readOptionalString(result.body.amount, 128)
  if (
    (transaction !== undefined && transaction.toUpperCase() !== args.transactionHash)
    || (network !== undefined && network !== args.requirements.network)
    || (amount !== undefined && amount !== args.requirements.amount)
  ) return { ok: false, code: 'settlement_unknown' }
  if (result.body.success === false) {
    const reason = typeof result.body.errorReason === 'string' ? result.body.errorReason : ''
    const uncertainReason = reason === 'settlement_pending'
      || ['submit_failed:', 'submit_missing_tx_hash', 'validation_failed:']
        .some(prefix => reason.startsWith(prefix))
    const transientStatus = result.response.status >= 500
      || result.response.status === 408
      || result.response.status === 429
    const legacyBoundRejection = result.response.ok
      && result.body.settlementAttempted === undefined
      && transaction?.toUpperCase() === args.transactionHash
      && network === args.requirements.network
    const definitive = !uncertainReason && (
      (result.body.settlementAttempted === false && !transientStatus)
      || legacyBoundRejection
    )
    return {
      ok: false,
      code: definitive ? 'settlement_failed' : 'settlement_unknown',
    }
  }
  if (!result.response.ok) return { ok: false, code: 'settlement_unknown' }
  if (
    transaction?.toUpperCase() !== args.transactionHash
    || network !== args.requirements.network
    || (amount !== undefined && amount !== args.requirements.amount)
  ) return { ok: false, code: 'settlement_unknown' }
  if (
    result.body.success !== true
  ) {
    return { ok: false, code: 'settlement_unknown' }
  }
  return {
    ok: true,
    response: {
      success: true,
      transaction: args.transactionHash,
      network,
      amount: args.requirements.amount,
      ...(readOptionalString(result.body.payer, 128) ? { payer: result.body.payer as string } : {}),
      ...(isRecord(result.body.extensions) ? { extensions: result.body.extensions } : {}),
      ...(isRecord(result.body.extra) ? { extra: result.body.extra } : {}),
    },
  }
}

const transactionResult = (meta: unknown): string | null => {
  if (!isRecord(meta)) return null
  const value = meta.TransactionResult ?? meta.transaction_result
  return typeof value === 'string' ? value : null
}

const readExactNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null

const hasInvoiceMemo = (transaction: JsonRecord, invoiceId: string): boolean => {
  if (!Array.isArray(transaction.Memos)) return false
  const expected = bytesToHex(new TextEncoder().encode(invoiceId)).toUpperCase()
  return transaction.Memos.some((entry) => {
    if (!isRecord(entry) || !isRecord(entry.Memo)) return false
    const memoData = entry.Memo.MemoData
    return typeof memoData === 'string' && memoData.toUpperCase() === expected
  })
}

const reconciledPaymentMatchesRequirements = async (
  transaction: JsonRecord,
  meta: unknown,
  requirements: PaymentRequirements,
): Promise<'matches' | 'mismatch' | 'unavailable'> => {
  const extra = isRecord(requirements.extra) ? requirements.extra : {}
  const invoiceId = extra.invoiceId
  const sourceTag = readExactNumber(extra.sourceTag)
  const destinationTag = extra.destinationTag === undefined
    ? undefined
    : readExactNumber(extra.destinationTag)
  if (typeof invoiceId !== 'string' || sourceTag === null || destinationTag === null) {
    return 'unavailable'
  }
  if (!isRecord(meta)
    || typeof transaction.TransactionType !== 'string'
    || typeof transaction.Destination !== 'string'
    || (!Object.hasOwn(transaction, 'DeliverMax') && !Object.hasOwn(transaction, 'Amount'))
    || !Object.hasOwn(transaction, 'SourceTag')) return 'unavailable'
  const expectedInvoiceId = bytesToHex(
    await sha('SHA-256', new TextEncoder().encode(invoiceId)),
  ).toUpperCase()
  const hasInvoiceField = typeof transaction.InvoiceID === 'string'
  const hasMemoField = Array.isArray(transaction.Memos)
  if (!hasInvoiceField && !hasMemoField) return 'unavailable'
  const invoiceFieldMatches = typeof transaction.InvoiceID === 'string'
    && transaction.InvoiceID.toUpperCase() === expectedInvoiceId
  const requestedAmount = transaction.DeliverMax ?? transaction.Amount
  const deliveredAmount = meta.delivered_amount ?? meta.deliveredAmount
  if (deliveredAmount === undefined || readExactNumber(transaction.SourceTag) === null) {
    return 'unavailable'
  }
  let destinationTagMatches = transaction.DestinationTag === undefined
  if (destinationTag !== undefined) {
    if (!Object.hasOwn(transaction, 'DestinationTag')) return 'unavailable'
    const observed = readExactNumber(transaction.DestinationTag)
    if (observed === null) return 'unavailable'
    destinationTagMatches = observed === destinationTag
  }
  const matches = transaction.TransactionType === 'Payment'
    && transaction.Destination === requirements.payTo
    && requestedAmount === requirements.amount
    && deliveredAmount === requirements.amount
    && readExactNumber(transaction.SourceTag) === sourceTag
    && destinationTagMatches
    && (invoiceFieldMatches || hasInvoiceMemo(transaction, invoiceId))
  return matches ? 'matches' : 'mismatch'
}

const reconcileRpcNetwork = async (
  transport: XrplX402Transport,
  network: string,
): Promise<'matches' | 'mismatch' | 'unavailable'> => {
  const match = /^xrpl:([0-9]+)$/u.exec(network)
  if (!match) return 'mismatch'
  const result = await boundedFetchJson(
    transport.rpcUrl,
    {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({ method: 'server_info', params: [{}] }),
    },
    transport.rpcTimeoutMs,
    XRPL_RESPONSE_BYTES,
    transport.fetchFn ?? fetch,
  )
  if (!result || !result.response.ok || !isRecord(result.body)) return 'unavailable'
  const root = isRecord(result.body.result) ? result.body.result : result.body
  const info = isRecord(root.info) ? root.info : null
  const observed = info?.network_id
  const observedNetworkId = typeof observed === 'number' && Number.isSafeInteger(observed)
    ? String(observed)
    : typeof observed === 'string' && /^[0-9]+$/u.test(observed)
      ? observed.replace(/^0+(?=[0-9])/u, '')
      : null
  return observedNetworkId === null
    ? 'unavailable'
    : observedNetworkId === match[1].replace(/^0+(?=[0-9])/u, '')
      ? 'matches'
      : 'mismatch'
}

export const reconcileXrplTransaction = async (args: {
  transport: XrplX402Transport
  requirements: PaymentRequirements
  transactionHash: string
}): Promise<ReconciliationResult> => {
  if (await reconcileRpcNetwork(args.transport, args.requirements.network) !== 'matches') {
    return { status: 'unavailable', transactionHash: args.transactionHash }
  }
  const result = await boundedFetchJson(
    args.transport.rpcUrl,
    {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        method: 'tx',
        params: [{ api_version: 2, transaction: args.transactionHash, binary: false }],
      }),
    },
    args.transport.rpcTimeoutMs,
    XRPL_RESPONSE_BYTES,
    args.transport.fetchFn ?? fetch,
  )
  if (!result || !result.response.ok || !isRecord(result.body)) {
    return { status: 'unavailable', transactionHash: args.transactionHash }
  }
  const root = isRecord(result.body.result) ? result.body.result : result.body
  if (typeof root.error === 'string') {
    return root.error === 'txnNotFound'
      ? { status: 'pending', transactionHash: args.transactionHash }
      : { status: 'unavailable', transactionHash: args.transactionHash }
  }
  if (root.validated !== true) {
    return { status: 'pending', transactionHash: args.transactionHash }
  }
  const observedHash = readOptionalString(
    root.hash
      ?? (isRecord(root.tx_json) ? root.tx_json.hash : undefined),
    128,
  )?.toUpperCase()
  if (!observedHash || observedHash !== args.transactionHash) {
    return { status: 'unavailable', transactionHash: args.transactionHash }
  }
  const resultCode = transactionResult(root.meta)
  if (!resultCode) return { status: 'unavailable', transactionHash: args.transactionHash }
  if (resultCode !== 'tesSUCCESS') {
    return { status: 'failed', transactionHash: args.transactionHash }
  }
  const transaction = isRecord(root.tx_json) ? root.tx_json : root
  const paymentMatch = await reconciledPaymentMatchesRequirements(transaction, root.meta, args.requirements)
  if (paymentMatch === 'unavailable') {
    return { status: 'unavailable', transactionHash: args.transactionHash }
  }
  if (paymentMatch === 'mismatch') {
    return { status: 'failed', transactionHash: args.transactionHash }
  }
  const payer = readOptionalString(
    transaction.Account,
    128,
  )
  return {
    status: 'fulfilled',
    response: {
      success: true,
      transaction: args.transactionHash,
      network: args.requirements.network,
      amount: args.requirements.amount,
      ...(payer ? { payer } : {}),
      extra: { reconciled: true },
    },
  }
}
