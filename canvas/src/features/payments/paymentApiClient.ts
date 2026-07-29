import type {
  PaymentIntentCommand,
  PaymentRailNeutralResult,
} from 'grph-shared/payments/paymentRuntimeContract'
import type {
  PaymentBuyerProduct,
} from 'grph-shared/payments/paymentBuyerProductSsot'

export type { PaymentBuyerProduct } from 'grph-shared/payments/paymentBuyerProductSsot'

export const PAYMENT_INTENT_API_PATH = '/api/payments/intents'
export const PAYMENT_DISCOVERY_API_PATH = '/api/payments/discovery'

export type PaymentApiFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type PaymentApiTransport = Readonly<{
  readBuyerProduct(): Promise<PaymentBuyerProduct | null>
  submitIntent(command: PaymentIntentCommand): Promise<PaymentRailNeutralResult>
  reconcileIntent(intentId: string): Promise<PaymentRailNeutralResult>
}>

const parseBuyerProduct = (value: unknown): PaymentBuyerProduct | null => {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Payment discovery returned an invalid buyer product.')
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (
    keys.length !== 3
    || keys[0] !== 'amountMinor'
    || keys[1] !== 'currency'
    || keys[2] !== 'settlementAsset'
    || !Number.isSafeInteger(record.amountMinor)
    || Number(record.amountMinor) <= 0
    || typeof record.currency !== 'string'
    || !/^[a-z]{3}$/.test(record.currency)
    || (record.settlementAsset !== 'fiat' && record.settlementAsset !== 'xsgd')
  ) {
    throw new Error('Payment discovery returned an invalid buyer product.')
  }
  return Object.freeze({
    amountMinor: Number(record.amountMinor),
    currency: record.currency,
    settlementAsset: record.settlementAsset,
  })
}

const isRailNeutralResult = (value: unknown): value is PaymentRailNeutralResult => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.ok !== 'boolean') return false
  if (record.modelCallCount !== 0 || record.modelCostUsd !== 0) return false
  if (!Object.prototype.hasOwnProperty.call(record, 'receiptRecord')) return false
  if (record.ok) {
    return Boolean(record.intent)
      && typeof record.intent === 'object'
      && typeof record.rail === 'string'
      && Object.prototype.hasOwnProperty.call(record, 'instruction')
  }
  return typeof record.code === 'string'
    && typeof record.message === 'string'
    && Object.prototype.hasOwnProperty.call(record, 'intent')
}

const requestPaymentResult = async (
  fetchImpl: PaymentApiFetch,
  path: string,
  init: RequestInit,
): Promise<PaymentRailNeutralResult> => {
  const response = await fetchImpl(path, init)
  const body = await response.json().catch(() => null)
  if (!isRailNeutralResult(body)) {
    throw new Error(`Payment API returned an invalid result (HTTP ${response.status}).`)
  }
  return body
}

export const createPaymentApiTransport = (
  fetchImpl: PaymentApiFetch = fetch,
): PaymentApiTransport => Object.freeze({
  async readBuyerProduct() {
    const response = await fetchImpl(PAYMENT_DISCOVERY_API_PATH, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`Payment discovery failed (HTTP ${response.status}).`)
    }
    const record = body as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(record, 'buyerProduct')) {
      throw new Error('Payment discovery omitted the server-authoritative buyer product.')
    }
    return parseBuyerProduct(record.buyerProduct)
  },
  async submitIntent(command) {
    return requestPaymentResult(fetchImpl, PAYMENT_INTENT_API_PATH, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    })
  },
  async reconcileIntent(intentId) {
    const normalizedIntentId = String(intentId || '').trim()
    if (!normalizedIntentId) throw new Error('Payment intent id is required for reconciliation.')
    return requestPaymentResult(
      fetchImpl,
      `${PAYMENT_INTENT_API_PATH}/${encodeURIComponent(normalizedIntentId)}/reconcile`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      },
    )
  },
})
