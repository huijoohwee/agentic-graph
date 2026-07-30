import type {
  PaymentRailId,
  PaymentRailSelectionReason,
  PaymentSettlementAsset,
} from './paymentRailSsot.js'
import type {
  KnowgrphPaymentTerminalState,
  KnowgrphTerminalPaymentRecord,
} from './paymentRecordDocument.js'

export const PAYMENT_SURFACE_STATES = Object.freeze([
  'idle',
  'queued_offline',
  'pending_provider',
  'paid',
  'refunded',
  'no_payment_required',
  'failed',
  'expired',
  'cancelled',
  'reconciliation_unresolved',
] as const)

export const PAYMENT_INTERNAL_STATES = Object.freeze([
  ...PAYMENT_SURFACE_STATES,
  'provider_outcome_unknown',
] as const)

export const PAYMENT_FAILURE_CODES = Object.freeze([
  'approval_missing',
  'capability_unavailable',
  'intent_parameter_conflict',
  'integration_model_unsupported',
  'mode_mismatch',
  'not_found',
  'provider_declined',
  'provider_operation_unverified',
  'provider_outcome_unknown',
  'rail_unavailable',
  'refund_not_applicable',
  'schema_invalid',
  'storage_unavailable',
] as const)

export const PAYMENT_ORIGINS = Object.freeze(['buyer', 'agent'] as const)
export const PAYMENT_MAX_RECONCILIATION_ATTEMPTS = 5
export const PAYMENT_INTENT_QUEUE_MAX_DEPTH = 100
export const PAYMENT_PROVIDER_CREATE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1_000
export const PAYMENT_MODEL_COST_USD = 0
export const PAYMENT_MODEL_CALL_COUNT = 0
export const PAYMENT_CLIENT_INTENT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PaymentSurfaceState = typeof PAYMENT_SURFACE_STATES[number]
export type PaymentInternalState = typeof PAYMENT_INTERNAL_STATES[number]
export type PaymentFailureCode = typeof PAYMENT_FAILURE_CODES[number]
export type PaymentOrigin = typeof PAYMENT_ORIGINS[number]

export type PaymentIntentCommand = Readonly<{
  clientIntentKey: string
  amountMinor: number
  currency: string
  settlementAsset: PaymentSettlementAsset
  origin: PaymentOrigin
  approvalRef?: string
}>

export type PaymentInstruction =
  | Readonly<{
      kind: 'hosted_checkout'
      url: string
    }>
  | Readonly<{
      kind: 'provider_instruction'
      value: unknown
    }>
  | null

export type PaymentProviderError = Readonly<{
  providerType: string
  providerCode: string | null
  declineCode: string | null
  providerReason: string | null
  requestId: string | null
  httpStatus: number | null
  details: unknown
}>

export type PaymentIntentRecord = Readonly<{
  id: string
  clientIntentKey: string
  parameterFingerprint: string
  amountMinor: number
  currency: string
  settlementAsset: PaymentSettlementAsset
  origin: PaymentOrigin
  rail: PaymentRailId
  selectionReason: PaymentRailSelectionReason
  state: PaymentInternalState
  providerObjectId: string | null
  providerRequestId: string | null
  providerInstruction: PaymentInstruction
  providerError: PaymentProviderError | null
  refundReference: string | null
  reconciliationAttempts: number
  createdAt: string
  updatedAt: string
  terminalAt: string | null
}>

export type PaymentPublicStatus = Readonly<{
  intentId: string
  state: PaymentSurfaceState
  amountMinor: number
  currency: string
}>

export type PaymentRailNeutralResult =
  | Readonly<{
      ok: true
      intent: PaymentPublicStatus
      rail: PaymentRailId
      instruction: PaymentInstruction
      receiptRecord: KnowgrphTerminalPaymentRecord | null
      idempotentReplay: boolean
      modelCallCount: 0
      modelCostUsd: 0
    }>
  | Readonly<{
      ok: false
      code: PaymentFailureCode
      message: string
      intent: PaymentPublicStatus | null
      rail: PaymentRailId | null
      instruction: null
      receiptRecord: KnowgrphTerminalPaymentRecord | null
      idempotentReplay: boolean
      modelCallCount: 0
      modelCostUsd: 0
    }>

export type PaymentProviderCostEntry = Readonly<{
  id: string
  intentId: string
  rail: PaymentRailId
  operation: string
  providerRequestId: string | null
  outcome: string
  elapsedMs: number
  modelCallCount: 0
  modelCostUsd: 0
  createdAt: string
}>

export type PaymentSurfaceSnapshot = Readonly<{
  clientIntentKey: string | null
  state: PaymentSurfaceState
  amountMinor: number | null
  currency: string | null
  rail: PaymentRailId | null
  instruction: PaymentInstruction
  label: string
  nextAction: string
  buyerSafeReason: string | null
}>

export type PaymentContractValidationResult =
  | Readonly<{ ok: true; value: PaymentIntentCommand }>
  | Readonly<{ ok: false; code: 'approval_missing' | 'schema_invalid'; message: string }>

const PAYMENT_STATE_PRESENTATION: Readonly<
  Record<PaymentSurfaceState, Readonly<{ label: string; nextAction: string }>>
> = Object.freeze({
  idle: Object.freeze({ label: 'Ready to pay', nextAction: 'Confirm payment' }),
  queued_offline: Object.freeze({
    label: 'Held on this device',
    nextAction: 'Will submit when this device reconnects',
  }),
  pending_provider: Object.freeze({
    label: 'Waiting for provider confirmation',
    nextAction: 'Complete the provider instruction or check again',
  }),
  paid: Object.freeze({ label: 'Paid', nextAction: 'View receipt' }),
  refunded: Object.freeze({
    label: 'Refunded',
    nextAction: 'View refund receipt',
  }),
  no_payment_required: Object.freeze({
    label: 'No payment required',
    nextAction: 'Continue',
  }),
  failed: Object.freeze({ label: 'Payment failed', nextAction: 'Retry this payment' }),
  expired: Object.freeze({ label: 'Payment expired', nextAction: 'Retry this payment' }),
  cancelled: Object.freeze({ label: 'Payment cancelled', nextAction: 'Retry this payment' }),
  reconciliation_unresolved: Object.freeze({
    label: 'Payment status unresolved',
    nextAction: 'Check again later or contact the operator',
  }),
})

const PROHIBITED_PAYMENT_FIELD_PATTERN =
  /(card(number)?|cvv|cvc|bank(account)?|credential|secret|buyer_?email|customer_?id)/i
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeCurrency = (value: unknown): string => normalizeString(value).toLowerCase()

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const validatePaymentIntentCommand = (
  value: unknown,
): PaymentContractValidationResult => {
  if (!isPlainRecord(value)) {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'Payment intent must be an object.' })
  }
  const allowedKeys = new Set([
    'clientIntentKey',
    'amountMinor',
    'currency',
    'settlementAsset',
    'origin',
    'approvalRef',
  ])
  if (Object.keys(value).some(key => !allowedKeys.has(key))) {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'Payment intent contains an unsupported field.' })
  }
  if (
    typeof value.clientIntentKey !== 'string'
    || typeof value.amountMinor !== 'number'
    || typeof value.currency !== 'string'
    || typeof value.settlementAsset !== 'string'
    || typeof value.origin !== 'string'
    || (value.approvalRef != null && typeof value.approvalRef !== 'string')
  ) {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'Payment intent field types are invalid.' })
  }
  const clientIntentKey = normalizeString(value.clientIntentKey)
  const amountMinor = value.amountMinor
  const currency = normalizeCurrency(value.currency)
  const settlementAsset = normalizeString(value.settlementAsset).toLowerCase()
  const origin = normalizeString(value.origin).toLowerCase()
  const approvalRef = normalizeString(value.approvalRef)

  if (!PAYMENT_CLIENT_INTENT_KEY_PATTERN.test(clientIntentKey)) {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'clientIntentKey must be a UUID.' })
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'amountMinor must be a positive safe integer.' })
  }
  if (!/^[a-z]{3}$/.test(currency)) {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'currency must be a lowercase ISO 4217 code.' })
  }
  if (settlementAsset !== 'fiat' && settlementAsset !== 'xsgd') {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'settlementAsset must be fiat or xsgd.' })
  }
  if (origin !== 'buyer' && origin !== 'agent') {
    return Object.freeze({ ok: false, code: 'schema_invalid', message: 'origin must be buyer or agent.' })
  }
  if (origin === 'agent' && !approvalRef) {
    return Object.freeze({ ok: false, code: 'approval_missing', message: 'Agent payment creation requires approval.' })
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      clientIntentKey,
      amountMinor,
      currency,
      settlementAsset,
      origin,
      ...(approvalRef ? { approvalRef } : {}),
    }),
  })
}

export const buildPaymentParameterFingerprint = (
  command: PaymentIntentCommand,
): string => [
  command.amountMinor,
  command.currency,
  command.settlementAsset,
  command.origin,
].join(':')

export const buildPaymentIntentId = (clientIntentKey: string): string =>
  `pay_${normalizeString(clientIntentKey).toLowerCase()}`

export const buildProviderIdempotencyKey = (
  rail: PaymentRailId,
  clientIntentKey: string,
  operation = 'create',
): string => {
  const key = `knowgrph:${rail}:${operation}:${normalizeString(clientIntentKey).toLowerCase()}`
  if (key.length > 255 || EMAIL_PATTERN.test(key)) {
    throw new Error('Provider idempotency key violates the payment data-minimization contract.')
  }
  return key
}

export const toPaymentSurfaceState = (state: PaymentInternalState): PaymentSurfaceState => {
  if (state === 'provider_outcome_unknown') return 'pending_provider'
  return state
}

export const buildPaymentPublicStatus = (
  record: Pick<PaymentIntentRecord, 'id' | 'state' | 'amountMinor' | 'currency'>,
): PaymentPublicStatus => Object.freeze({
  intentId: record.id,
  state: toPaymentSurfaceState(record.state),
  amountMinor: record.amountMinor,
  currency: record.currency,
})

export const buildPaymentSurfaceSnapshot = (
  record: PaymentIntentRecord | null,
  buyerSafeReason: string | null = null,
): PaymentSurfaceSnapshot => {
  const state = record ? toPaymentSurfaceState(record.state) : 'idle'
  const presentation = PAYMENT_STATE_PRESENTATION[state]
  return Object.freeze({
    clientIntentKey: record?.clientIntentKey || null,
    state,
    amountMinor: record?.amountMinor ?? null,
    currency: record?.currency || null,
    rail: record?.rail || null,
    instruction: record?.providerInstruction || null,
    label: presentation.label,
    nextAction: presentation.nextAction,
    buyerSafeReason: buyerSafeReason ? normalizeString(buyerSafeReason) : null,
  })
}

export const assertPaymentDataMinimized = (value: unknown): void => {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }
    if (!isPlainRecord(candidate)) return
    for (const [key, nested] of Object.entries(candidate)) {
      if (PROHIBITED_PAYMENT_FIELD_PATTERN.test(key)) {
        throw new Error(`Prohibited payment field: ${key}`)
      }
      if (typeof nested === 'string' && EMAIL_PATTERN.test(nested)) {
        throw new Error(`Personal identifier is not permitted in payment metadata: ${key}`)
      }
      visit(nested)
    }
  }
  visit(value)
}

export const buildPaymentSuccessResult = (
  record: PaymentIntentRecord,
  idempotentReplay: boolean,
): PaymentRailNeutralResult => Object.freeze({
  ok: true,
  intent: buildPaymentPublicStatus(record),
  rail: record.rail,
  instruction: record.providerInstruction,
  receiptRecord: buildTerminalReceiptRecord(record),
  idempotentReplay,
  modelCallCount: PAYMENT_MODEL_CALL_COUNT,
  modelCostUsd: PAYMENT_MODEL_COST_USD,
})

export const buildPaymentFailureResult = (args: {
  code: PaymentFailureCode
  message: string
  record?: PaymentIntentRecord | null
  rail?: PaymentRailId | null
  idempotentReplay?: boolean
}): PaymentRailNeutralResult => Object.freeze({
  ok: false,
  code: args.code,
  message: normalizeString(args.message) || 'Payment operation failed.',
  intent: args.record ? buildPaymentPublicStatus(args.record) : null,
  rail: args.rail || args.record?.rail || null,
  instruction: null,
  receiptRecord: args.record ? buildTerminalReceiptRecord(args.record) : null,
  idempotentReplay: args.idempotentReplay === true,
  modelCallCount: PAYMENT_MODEL_CALL_COUNT,
  modelCostUsd: PAYMENT_MODEL_COST_USD,
})

const PAYMENT_RECEIPT_TERMINAL_STATES = new Set<PaymentInternalState>([
  'paid',
  'no_payment_required',
  'failed',
  'expired',
  'cancelled',
  'reconciliation_unresolved',
  'refunded',
])

export const buildTerminalReceiptRecord = (
  record: PaymentIntentRecord,
): KnowgrphTerminalPaymentRecord | null => {
  if (
    !PAYMENT_RECEIPT_TERMINAL_STATES.has(record.state)
    || !record.terminalAt
  ) return null
  return Object.freeze({
    intentId: record.id,
    clientIntentKey: record.clientIntentKey,
    rail: record.rail,
    amountMinor: record.amountMinor,
    currency: record.currency,
    settlementAsset: record.settlementAsset,
    terminalState: record.state as KnowgrphPaymentTerminalState,
    providerObjectId: record.providerObjectId,
    terminalTimestamp: record.terminalAt,
  })
}

export const listPaymentSurfaceStatePresentations = (): ReadonlyArray<
  Readonly<{ state: PaymentSurfaceState; label: string; nextAction: string }>
> => PAYMENT_SURFACE_STATES.map(state => Object.freeze({
  state,
  ...PAYMENT_STATE_PRESENTATION[state],
}))
