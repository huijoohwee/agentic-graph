import {
  assertPaymentDataMinimized,
  buildProviderIdempotencyKey,
  type PaymentFailureCode,
  type PaymentIntentRecord,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'
import {
  buildStraitsxAuthenticationHeaders,
  resolveStraitsxRuntimeConfig,
} from '../../../grph-shared/src/payments/straitsxPaymentSsot'
import type {
  PaymentProviderCallObservation,
  PaymentProviderCreateResult,
  PaymentProviderReadResult,
  PaymentRailAdapter,
} from './paymentRailAdapters'
import {
  asProviderRecord,
  buildUnknownProviderOutcome,
  mapPaymentProviderError,
  mapPaymentProviderFailureCode,
  providerElapsedMs,
  readProviderString,
  type PaymentProviderFetch,
} from './paymentProviderAdapterSupport'

const STRAITSX_INSTRUCTION_FIELDS = Object.freeze([
  'id',
  'type',
  'virtualPaymentAddress',
  'base64EncodedImage',
  'qrCodeData',
  'referenceId',
  'externalReference',
  'expiresAt',
] as const)
const STRAITSX_EXPIRY_OFFSET_MS = 29 * 24 * 60 * 60 * 1_000

type StraitsxPaymentResource = Readonly<{
  state: PaymentIntentRecord['state']
  amountMinor: number
  currency: string
  clientIntentReference: string
  providerObjectId: string
  instruction: Readonly<Record<string, unknown>>
}>

const straitsxState = (statusValue: unknown): PaymentIntentRecord['state'] => {
  const status = String(statusValue || '').trim().toLowerCase()
  if (status === 'completed') return 'paid'
  if (status === 'refunded') return 'refunded'
  if (status === 'failed') return 'failed'
  if (status === 'expired') return 'expired'
  return 'pending_provider'
}

const parseMajorAmountMinor = (value: unknown): number | null => {
  const normalized = typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : ''
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) return null
  const [major, fraction = ''] = normalized.split('.')
  const amountMinor = (
    BigInt(major) * 100n
    + BigInt(fraction.padEnd(2, '0'))
  )
  return amountMinor > 0n && amountMinor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(amountMinor)
    : null
}

const formatMinorAsMajorJsonNumber = (amountMinor: number): string => {
  const exactMinor = BigInt(amountMinor)
  const major = exactMinor / 100n
  const cents = exactMinor % 100n
  if (cents === 0n) return major.toString()
  const fraction = cents.toString().padStart(2, '0').replace(/0$/, '')
  return `${major}.${fraction}`
}

const projectPaymentInstruction = (
  paymentMethod: Record<string, unknown>,
): Readonly<Record<string, unknown>> => {
  const instruction: Record<string, unknown> = {}
  for (const field of STRAITSX_INSTRUCTION_FIELDS) {
    if (Object.hasOwn(paymentMethod, field)) instruction[field] = paymentMethod[field]
  }
  assertPaymentDataMinimized(instruction)
  return Object.freeze(instruction)
}

const parseStraitsxPaymentResource = (
  value: unknown,
): StraitsxPaymentResource | null => {
  const envelope = asProviderRecord(value)
  const data = asProviderRecord(envelope?.data)
  const attributes = asProviderRecord(data?.attributes)
  const paymentMethod = asProviderRecord(attributes?.paymentMethod)
  const amountMinor = parseMajorAmountMinor(attributes?.amount)
  const currency = readProviderString(attributes, 'currency').toLowerCase()
  const clientIntentReference = readProviderString(attributes, 'referenceId')
  const providerObjectId = readProviderString(paymentMethod, 'id')
  if (
    paymentMethod == null
    || readProviderString(data, 'type') !== 'payment'
    || readProviderString(paymentMethod, 'type') !== 'paynow'
    || amountMinor == null
    || !/^[a-z]{3,4}$/.test(currency)
    || !clientIntentReference
    || !providerObjectId
  ) {
    return null
  }
  const instruction = projectPaymentInstruction(paymentMethod)
  if (Object.keys(instruction).length < 2) return null
  return Object.freeze({
    state: straitsxState(attributes?.status),
    amountMinor,
    currency,
    clientIntentReference,
    providerObjectId,
    instruction,
  })
}

const buildStableExpiresAt = (createdAt: string): string | null => {
  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs)) return null
  return new Date(createdAtMs + STRAITSX_EXPIRY_OFFSET_MS).toISOString()
}

const mapStraitsxConfigFailure = (
  error:
    | Exclude<ReturnType<typeof resolveStraitsxRuntimeConfig>, { ok: true }>['error']
    | 'signing_failed',
): PaymentFailureCode => {
  if (error === 'mode_mismatch') return 'mode_mismatch'
  if (
    error === 'integration_model_unresolved'
    || error === 'integration_model_unsupported'
  ) {
    return 'integration_model_unsupported'
  }
  return 'capability_unavailable'
}

export const createStraitsxPaymentRailAdapter = (args: {
  env: Readonly<Record<string, unknown>>
  fetch?: PaymentProviderFetch
}): PaymentRailAdapter => {
  const providerFetch = args.fetch || fetch
  const callStraitsx = async (
    operation: string,
    path: string,
    method: 'GET' | 'POST',
    body: string,
  ): Promise<{
    ok: true
    response: Response
    body: unknown
    observation: PaymentProviderCallObservation
  } | {
    ok: false
    code: PaymentFailureCode
  }> => {
    const authentication = await buildStraitsxAuthenticationHeaders(
      args.env,
      { method, path, body },
    ).catch(() => null)
    if (authentication == null || authentication.ok === false) {
      return {
        ok: false,
        code: mapStraitsxConfigFailure(
          authentication?.error || 'signing_failed',
        ),
      }
    }
    const config = resolveStraitsxRuntimeConfig(args.env)
    if (config.ok === false) {
      return { ok: false, code: mapStraitsxConfigFailure(config.error) }
    }
    const startedAt = performance.now()
    const response = await providerFetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        ...authentication.headers,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body } : {}),
    })
    const responseBody = await response.json().catch(() => null)
    return {
      ok: true,
      response,
      body: responseBody,
      observation: Object.freeze({
        operation,
        requestId: response.headers.get('x-request-id'),
        outcome: response.ok ? 'success' : `http_${response.status}`,
        elapsedMs: providerElapsedMs(startedAt),
      }),
    }
  }

  return Object.freeze({
    async create(record) {
      if (record.settlementAsset === 'xsgd') {
        return Object.freeze({
          ok: false,
          code: 'capability_unavailable',
          error: null,
          calls: [],
        })
      }
      const config = resolveStraitsxRuntimeConfig(args.env)
      if (config.ok === false) {
        const code = mapStraitsxConfigFailure(config.error)
        return Object.freeze({ ok: false, code, error: null, calls: [] })
      }
      if (config.paymentMethod !== 'dynamic_paynow') {
        return Object.freeze({
          ok: false,
          code: 'integration_model_unsupported',
          error: null,
          calls: [],
        })
      }
      const referenceId = buildProviderIdempotencyKey(
        'straitsx',
        record.clientIntentKey,
      )
      const expiresAt = buildStableExpiresAt(record.createdAt)
      if (!expiresAt) {
        return Object.freeze({
          ok: false,
          code: 'schema_invalid',
          error: null,
          calls: [],
        })
      }
      const requestBody = [
        '{"data":{"attributes":{"referenceId":',
        JSON.stringify(referenceId),
        ',"amount":',
        formatMinorAsMajorJsonNumber(record.amountMinor),
        ',"expiresAt":',
        JSON.stringify(expiresAt),
        '}}}',
      ].join('')
      const startedAt = performance.now()
      try {
        const result = await callStraitsx(
          'payment.create',
          config.paymentCreatePath,
          'POST',
          requestBody,
        )
        if (result.ok === false) {
          return Object.freeze({
            ok: false,
            code: result.code,
            error: null,
            calls: [],
          })
        }
        const body = asProviderRecord(result.body)
        if (!result.response.ok || !body) {
          const error = mapPaymentProviderError(
            result.body,
            result.observation.requestId,
            result.response.status,
          )
          return Object.freeze({
            ok: false,
            code: mapPaymentProviderFailureCode(result.response.status, error),
            error,
            calls: [result.observation],
          })
        }
        const payment = parseStraitsxPaymentResource(body)
        if (
          !payment
          || payment.clientIntentReference !== referenceId
          || payment.amountMinor !== record.amountMinor
          || payment.currency !== record.currency
          || !['pending_provider', 'paid'].includes(payment.state)
        ) {
          return Object.freeze({
            ok: false,
            code: payment && ['failed', 'expired'].includes(payment.state)
              ? 'provider_declined'
              : 'provider_outcome_unknown',
            error: null,
            providerObjectId: payment?.providerObjectId || null,
            providerRequestId: result.observation.requestId,
            instruction: payment == null
              ? null
              : Object.freeze({
                  kind: 'provider_instruction' as const,
                  value: payment.instruction,
                }),
            calls: [result.observation],
          })
        }
        return Object.freeze({
          ok: true,
          state: payment.state as
            'pending_provider' | 'paid' | 'no_payment_required',
          providerObjectId: payment.providerObjectId,
          providerRequestId: result.observation.requestId,
          instruction: Object.freeze({
            kind: 'provider_instruction' as const,
            value: payment.instruction,
          }),
          calls: [result.observation],
        })
      } catch {
        return buildUnknownProviderOutcome(
          'payment.create',
          startedAt,
        ) as PaymentProviderCreateResult
      }
    },

    async read(record) {
      const config = resolveStraitsxRuntimeConfig(args.env)
      if (config.ok === false) {
        const code = mapStraitsxConfigFailure(config.error)
        return Object.freeze({ ok: false, code, error: null, calls: [] })
      }
      if (!record.providerObjectId) {
        return Object.freeze({
          ok: false,
          code: 'not_found',
          error: null,
          calls: [],
        })
      }
      const path = config.paymentReadPathTemplate.replace(
        '{paymentId}',
        encodeURIComponent(record.providerObjectId),
      )
      const startedAt = performance.now()
      try {
        const result = await callStraitsx('payment.read', path, 'GET', '')
        if (result.ok === false) {
          return Object.freeze({
            ok: false,
            code: result.code,
            error: null,
            calls: [],
          })
        }
        const body = asProviderRecord(result.body)
        if (!result.response.ok || !body) {
          const error = mapPaymentProviderError(
            result.body,
            result.observation.requestId,
            result.response.status,
          )
          return Object.freeze({
            ok: false,
            code: mapPaymentProviderFailureCode(result.response.status, error),
            error,
            calls: [result.observation],
          })
        }
        const payment = parseStraitsxPaymentResource(body)
        if (!payment) {
          return Object.freeze({
            ok: false,
            code: 'provider_outcome_unknown',
            error: null,
            providerRequestId: result.observation.requestId,
            calls: [result.observation],
          })
        }
        return Object.freeze({
          ok: true,
          state: payment.state,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          providerObjectId: payment.providerObjectId,
          clientIntentReference: payment.clientIntentReference,
          providerRequestId: result.observation.requestId,
          refundTargetId: null,
          calls: [result.observation],
        })
      } catch {
        return buildUnknownProviderOutcome(
          'payment.read',
          startedAt,
        ) as PaymentProviderReadResult
      }
    },

    async refund() {
      return Object.freeze({
        ok: false,
        code: 'provider_operation_unverified',
        error: null,
        calls: [],
      })
    },
  })
}
