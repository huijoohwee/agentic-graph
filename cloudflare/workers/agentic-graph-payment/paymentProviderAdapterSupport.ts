import type {
  PaymentFailureCode,
  PaymentProviderError,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'

export type PaymentProviderFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export const asProviderRecord = (
  value: unknown,
): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

export const readProviderString = (
  record: Record<string, unknown> | null,
  key: string,
): string => typeof record?.[key] === 'string'
  ? String(record[key]).trim()
  : ''

export const readProviderNumber = (
  record: Record<string, unknown> | null,
  key: string,
): number => {
  const value = record?.[key]
  return (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
  )
    ? value
    : 0
}

const sanitizeProviderReason = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const sanitized = value
    .trim()
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[redacted]')
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g, '[redacted]')
    .replace(/\bwhsec_[A-Za-z0-9]+\b/g, '[redacted]')
    .replace(/\b(?:\d[\s-]?){8,}\b/g, '[redacted]')
    .slice(0, 240)
    .trim()
  return sanitized || null
}

export const providerElapsedMs = (startedAt: number): number =>
  Math.max(0, Math.floor(performance.now() - startedAt))

export const mapPaymentProviderError = (
  body: unknown,
  requestId: string | null,
  httpStatus: number,
): PaymentProviderError => {
  const envelope = asProviderRecord(body)
  const stripeError = asProviderRecord(envelope?.error)
  const straitsxError = Array.isArray(envelope?.errors)
    ? asProviderRecord(envelope?.errors[0])
    : null
  const error = stripeError || straitsxError || envelope
  return Object.freeze({
    providerType:
      readProviderString(error, 'type')
      || readProviderString(error, 'error')
      || 'provider_error',
    providerCode:
      readProviderString(error, 'code')
      || readProviderString(error, 'error_code')
      || null,
    declineCode: readProviderString(error, 'decline_code') || null,
    providerReason: sanitizeProviderReason(
      readProviderString(error, 'detail')
      || readProviderString(error, 'message')
      || readProviderString(error, 'title'),
    ),
    requestId,
    httpStatus,
    details: null,
  })
}

export const mapPaymentProviderFailureCode = (
  status: number,
  error: PaymentProviderError,
): PaymentFailureCode => {
  if (
    error.providerType === 'idempotency_error'
    || error.providerCode === 'STXE-7000'
  ) {
    return 'intent_parameter_conflict'
  }
  if (status >= 500 || status === 429) return 'provider_outcome_unknown'
  if (error.declineCode || status === 402) return 'provider_declined'
  return 'provider_declined'
}

export const buildUnknownProviderOutcome = (
  operation: string,
  startedAt: number,
) => Object.freeze({
  ok: false as const,
  code: 'provider_outcome_unknown' as const,
  error: null,
  calls: Object.freeze([{
    operation,
    requestId: null,
    outcome: 'provider_outcome_unknown',
    elapsedMs: providerElapsedMs(startedAt),
  }]),
})
