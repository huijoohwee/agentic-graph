import {
  buildProviderIdempotencyKey,
  type PaymentFailureCode,
  type PaymentInstruction,
  type PaymentIntentRecord,
  type PaymentProviderError,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'
import {
  buildStripeCheckoutSessionCreateForm,
  resolveStripeCheckoutServerConfig,
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_REQUEST_API_VERSION,
} from '../../../grph-shared/src/payments/stripePaymentSsot'
import {
  asProviderRecord as asRecord,
  buildUnknownProviderOutcome as unknownOutcome,
  mapPaymentProviderError as mapProviderError,
  mapPaymentProviderFailureCode as mapFailureCode,
  providerElapsedMs as elapsedSince,
  readProviderNumber as readNumber,
  readProviderString as readString,
  type PaymentProviderFetch,
} from './paymentProviderAdapterSupport'

export { createStraitsxPaymentRailAdapter } from './straitsxPaymentRailAdapter'

export type PaymentProviderCallObservation = Readonly<{
  operation: string
  requestId: string | null
  outcome: string
  elapsedMs: number
}>

export type PaymentProviderReadResult =
  | Readonly<{
      ok: true
      state: PaymentIntentRecord['state']
      amountMinor: number
      currency: string
      providerObjectId: string
      clientIntentReference: string
      providerRequestId: string | null
      refundTargetId: string | null
      calls: readonly PaymentProviderCallObservation[]
    }>
  | Readonly<{
      ok: false
      code: PaymentFailureCode
      error: PaymentProviderError | null
      providerObjectId?: string | null
      providerRequestId?: string | null
      instruction?: PaymentInstruction
      calls: readonly PaymentProviderCallObservation[]
    }>

export type PaymentProviderCreateResult =
  | Readonly<{
      ok: true
      state: 'pending_provider' | 'paid' | 'no_payment_required'
      providerObjectId: string
      providerRequestId: string | null
      instruction: PaymentInstruction
      calls: readonly PaymentProviderCallObservation[]
    }>
  | Readonly<{
      ok: false
      code: PaymentFailureCode
      error: PaymentProviderError | null
      providerObjectId?: string | null
      providerRequestId?: string | null
      instruction?: PaymentInstruction
      calls: readonly PaymentProviderCallObservation[]
    }>

export type PaymentProviderRefundResult =
  | Readonly<{
      ok: true
      refundReference: string
      providerRequestId: string | null
      calls: readonly PaymentProviderCallObservation[]
    }>
  | Readonly<{
      ok: false
      code: PaymentFailureCode
      error: PaymentProviderError | null
      calls: readonly PaymentProviderCallObservation[]
    }>

export type PaymentRailAdapter = Readonly<{
  create(record: PaymentIntentRecord): Promise<PaymentProviderCreateResult>
  read(record: PaymentIntentRecord): Promise<PaymentProviderReadResult>
  refund(record: PaymentIntentRecord): Promise<PaymentProviderRefundResult>
}>

const STRIPE_API_BASE_URL = 'https://api.stripe.com/v1'

const readStripeRuntimeCredential = (
  env: Readonly<Record<string, unknown>>,
): { ok: true; value: string } | { ok: false; code: PaymentFailureCode } => {
  if (String(env[STRIPE_PAYMENT_ENV_KEYS.runtimeMode] || '').trim() !== 'sandbox') {
    return { ok: false, code: 'mode_mismatch' }
  }
  const value = String(env[STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey] || '').trim()
  if (!value.startsWith('rk_test_')) return { ok: false, code: 'mode_mismatch' }
  return { ok: true, value }
}

const stripeState = (body: Record<string, unknown>): PaymentIntentRecord['state'] => {
  const paymentStatus = readString(body, 'payment_status').toLowerCase()
  const objectStatus = readString(body, 'status').toLowerCase()
  if (paymentStatus === 'paid') return 'paid'
  if (paymentStatus === 'no_payment_required') return 'no_payment_required'
  if (objectStatus === 'expired') return 'expired'
  return 'pending_provider'
}

export const createStripePaymentRailAdapter = (args: {
  env: Readonly<Record<string, unknown>>
  requestOrigin: string
  fetch?: PaymentProviderFetch
}): PaymentRailAdapter => {
  const providerFetch = args.fetch || fetch
  const callStripe = async (
    operation: string,
    path: string,
    init?: RequestInit,
  ): Promise<{
    response: Response
    body: unknown
    observation: PaymentProviderCallObservation
  }> => {
    const startedAt = performance.now()
    const response = await providerFetch(`${STRIPE_API_BASE_URL}${path}`, init)
    const body = await response.json().catch(() => null)
    return {
      response,
      body,
      observation: Object.freeze({
        operation,
        requestId: response.headers.get('request-id'),
        outcome: response.ok ? 'success' : `http_${response.status}`,
        elapsedMs: elapsedSince(startedAt),
      }),
    }
  }

  const readSession = async (
    record: PaymentIntentRecord,
  ): Promise<PaymentProviderReadResult> => {
    const credential = readStripeRuntimeCredential(args.env)
    if (credential.ok === false) {
      return Object.freeze({ ok: false, code: credential.code, error: null, calls: [] })
    }
    if (!record.providerObjectId) {
      return Object.freeze({ ok: false, code: 'not_found', error: null, calls: [] })
    }
    const startedAt = performance.now()
    try {
      const result = await callStripe(
        'checkout_session.read',
        `/checkout/sessions/${encodeURIComponent(record.providerObjectId)}`,
        {
          headers: {
            authorization: `Bearer ${credential.value}`,
            'Stripe-Version': STRIPE_PAYMENT_REQUEST_API_VERSION,
          },
        },
      )
      const body = asRecord(result.body)
      if (!result.response.ok || !body) {
        const error = mapProviderError(
          result.body,
          result.observation.requestId,
          result.response.status,
        )
        return Object.freeze({
          ok: false,
          code: mapFailureCode(result.response.status, error),
          error,
          calls: [result.observation],
        })
      }
      return Object.freeze({
        ok: true,
        state: stripeState(body),
        amountMinor: readNumber(body, 'amount_total'),
        currency: readString(body, 'currency').toLowerCase(),
        providerObjectId: readString(body, 'id'),
        clientIntentReference:
          readString(body, 'client_reference_id')
          || readString(asRecord(body.metadata), 'acp_session_id'),
        providerRequestId: result.observation.requestId,
        refundTargetId: readString(body, 'payment_intent') || null,
        calls: [result.observation],
      })
    } catch {
      return unknownOutcome('checkout_session.read', startedAt) as PaymentProviderReadResult
    }
  }

  return Object.freeze({
    async create(record) {
      const credential = readStripeRuntimeCredential(args.env)
      if (credential.ok === false) {
        return Object.freeze({ ok: false, code: credential.code, error: null, calls: [] })
      }
      const checkoutConfig = resolveStripeCheckoutServerConfig(args.env)
      if (checkoutConfig.ok === false) {
        return Object.freeze({ ok: false, code: 'capability_unavailable', error: null, calls: [] })
      }
      const idempotencyKey = buildProviderIdempotencyKey(
        'stripe',
        record.clientIntentKey,
      )
      const returnOrigin = String(
        args.env[STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin] || args.requestOrigin,
      ).trim().replace(/\/+$/, '')
      const body = buildStripeCheckoutSessionCreateForm({
        successUrl: `${returnOrigin}/agentic-graph?payment_intent=${encodeURIComponent(record.id)}`,
        cancelUrl: `${returnOrigin}/agentic-graph?payment_cancelled=${encodeURIComponent(record.id)}`,
        agenticCommerceSessionId: idempotencyKey,
        expectedAmountTotal: record.amountMinor,
        expectedCurrency: record.currency,
      }, checkoutConfig)
      const startedAt = performance.now()
      try {
        const result = await callStripe('checkout_session.create', '/checkout/sessions', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${credential.value}`,
            'content-type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': idempotencyKey,
            'Stripe-Version': STRIPE_PAYMENT_REQUEST_API_VERSION,
          },
          body,
        })
        const responseBody = asRecord(result.body)
        if (!result.response.ok || !responseBody) {
          const error = mapProviderError(
            result.body,
            result.observation.requestId,
            result.response.status,
          )
          return Object.freeze({
            ok: false,
            code: mapFailureCode(result.response.status, error),
            error,
            calls: [result.observation],
          })
        }
        const providerObjectId = readString(responseBody, 'id')
        const url = readString(responseBody, 'url')
        const clientIntentReference =
          readString(responseBody, 'client_reference_id')
          || readString(asRecord(responseBody.metadata), 'acp_session_id')
        const amountMatches = readNumber(responseBody, 'amount_total') === record.amountMinor
        const currencyMatches = readString(responseBody, 'currency').toLowerCase() === record.currency
        const identityMatches = clientIntentReference === idempotencyKey
        if (!amountMatches || !currencyMatches || !identityMatches) {
          return Object.freeze({
            ok: false,
            code: 'provider_outcome_unknown',
            error: mapProviderError(responseBody, result.observation.requestId, 409),
            providerObjectId: providerObjectId || null,
            providerRequestId: result.observation.requestId,
            instruction: url
              ? Object.freeze({ kind: 'hosted_checkout' as const, url })
              : null,
            calls: [result.observation],
          })
        }
        if (!providerObjectId || !url) {
          return Object.freeze({
            ok: false,
            code: 'provider_outcome_unknown',
            error: null,
            calls: [result.observation],
          })
        }
        return Object.freeze({
          ok: true,
          state: stripeState(responseBody) as 'pending_provider' | 'paid' | 'no_payment_required',
          providerObjectId,
          providerRequestId: result.observation.requestId,
          instruction: Object.freeze({ kind: 'hosted_checkout', url }),
          calls: [result.observation],
        })
      } catch {
        return unknownOutcome('checkout_session.create', startedAt) as PaymentProviderCreateResult
      }
    },

    read: readSession,

    async refund(record) {
      if (record.state !== 'paid') {
        return Object.freeze({ ok: false, code: 'refund_not_applicable', error: null, calls: [] })
      }
      const read = await readSession(record)
      if (read.ok === false) {
        return Object.freeze({
          ok: false,
          code: read.code,
          error: read.error,
          calls: read.calls,
        })
      }
      const identityMatches =
        read.state === 'paid'
        && read.providerObjectId === record.providerObjectId
        && read.clientIntentReference === buildProviderIdempotencyKey(
          'stripe',
          record.clientIntentKey,
        )
        && read.amountMinor === record.amountMinor
        && read.currency === record.currency
      if (!identityMatches || !read.refundTargetId) {
        return Object.freeze({
          ok: false,
          code: 'provider_operation_unverified',
          error: null,
          calls: read.calls,
        })
      }
      const credential = readStripeRuntimeCredential(args.env)
      if (credential.ok === false) {
        return Object.freeze({ ok: false, code: credential.code, error: null, calls: read.calls })
      }
      const idempotencyKey = buildProviderIdempotencyKey(
        'stripe',
        record.clientIntentKey,
        'refund',
      )
      const startedAt = performance.now()
      try {
        const result = await callStripe('refund.create', '/refunds', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${credential.value}`,
            'content-type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': idempotencyKey,
            'Stripe-Version': STRIPE_PAYMENT_REQUEST_API_VERSION,
          },
          body: new URLSearchParams({ payment_intent: read.refundTargetId }),
        })
        const body = asRecord(result.body)
        if (!result.response.ok || !body) {
          const error = mapProviderError(
            result.body,
            result.observation.requestId,
            result.response.status,
          )
          return Object.freeze({
            ok: false,
            code: mapFailureCode(result.response.status, error),
            error,
            calls: [...read.calls, result.observation],
          })
        }
        const refundReference = readString(body, 'id')
        if (!refundReference.startsWith('re_')) {
          return Object.freeze({
            ok: false,
            code: 'provider_outcome_unknown',
            error: null,
            calls: [...read.calls, result.observation],
          })
        }
        return Object.freeze({
          ok: true,
          refundReference,
          providerRequestId: result.observation.requestId,
          calls: [...read.calls, result.observation],
        })
      } catch {
        const failed = unknownOutcome('refund.create', startedAt) as PaymentProviderRefundResult
        return Object.freeze({ ...failed, calls: [...read.calls, ...failed.calls] })
      }
    },
  })
}
