import {
  assertPaymentDataMinimized,
  buildPaymentIntentId,
  buildPaymentParameterFingerprint,
  type PaymentFailureCode,
  type PaymentIntentCommand,
  type PaymentIntentRecord,
  type PaymentProviderError,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'
import type {
  PaymentRuntimeStore,
  PersistedPaymentIntentRecord,
} from './paymentRuntimePersistence'

export const TERMINAL_PROVIDER_STATES = new Set<PaymentIntentRecord['state']>([
  'paid',
  'no_payment_required',
  'failed',
  'expired',
  'cancelled',
  'refunded',
])

export const FINANCIAL_SUCCESS_STATES = new Set<PaymentIntentRecord['state']>([
  'paid',
])

const INTENT_CAS_RETRY_LIMIT = 4

export const safeProviderError = (
  error: PaymentProviderError | null,
): PaymentProviderError | null => error
  ? Object.freeze({
      providerType: error.providerType,
      providerCode: error.providerCode,
      declineCode: error.declineCode,
      providerReason: error.providerReason,
      requestId: error.requestId,
      httpStatus: error.httpStatus,
      details: null,
    })
  : null

export const buildInitialRecord = (args: {
  command: PaymentIntentCommand
  rail: PaymentIntentRecord['rail']
  selectionReason: PaymentIntentRecord['selectionReason']
  nowIso: string
}): PaymentIntentRecord => Object.freeze({
  id: buildPaymentIntentId(args.command.clientIntentKey),
  clientIntentKey: args.command.clientIntentKey,
  parameterFingerprint: buildPaymentParameterFingerprint(args.command),
  amountMinor: args.command.amountMinor,
  currency: args.command.currency,
  settlementAsset: args.command.settlementAsset,
  origin: args.command.origin,
  rail: args.rail,
  selectionReason: args.selectionReason,
  state: 'pending_provider',
  providerObjectId: null,
  providerRequestId: null,
  providerInstruction: null,
  providerError: null,
  refundReference: null,
  reconciliationAttempts: 0,
  createdAt: args.nowIso,
  updatedAt: args.nowIso,
  terminalAt: null,
})

export const patchRecord = (
  record: PersistedPaymentIntentRecord,
  patch: Partial<PaymentIntentRecord>,
): PersistedPaymentIntentRecord => {
  const next = Object.freeze({ ...record, ...patch })
  assertPaymentDataMinimized(next)
  return next
}

export const createPaymentIntentConcurrency = (args: {
  store: PaymentRuntimeStore
  now: () => Date
}) => {
  const mutateIntent = async (
    initial: PersistedPaymentIntentRecord,
    buildNext: (
      current: PersistedPaymentIntentRecord,
    ) => PersistedPaymentIntentRecord | null,
  ): Promise<Readonly<{
    record: PersistedPaymentIntentRecord | null
    applied: boolean
  }>> => {
    let current = initial
    for (let attempt = 0; attempt < INTENT_CAS_RETRY_LIMIT; attempt += 1) {
      const next = buildNext(current)
      if (!next) return Object.freeze({ record: current, applied: false })
      const update = await args.store.updateIntent(next)
      if (update.ok === true) {
        return Object.freeze({ record: update.record, applied: true })
      }
      if (!update.current) {
        return Object.freeze({ record: null, applied: false })
      }
      current = update.current
    }
    return Object.freeze({ record: current, applied: false })
  }

  const persistAdapterFailure = (
    record: PersistedPaymentIntentRecord,
    code: PaymentFailureCode,
    error: PaymentProviderError | null,
    providerObjectId: string | null = null,
    providerRequestId: string | null = null,
    providerInstruction: PaymentIntentRecord['providerInstruction'] = null,
  ) => mutateIntent(record, current => {
    if (TERMINAL_PROVIDER_STATES.has(current.state)) return null
    const unresolved = code === 'provider_outcome_unknown'
    const updatedAt = args.now().toISOString()
    return patchRecord(current, {
      state: unresolved ? 'provider_outcome_unknown' : 'failed',
      providerObjectId: providerObjectId || current.providerObjectId,
      providerRequestId:
        providerRequestId || error?.requestId || current.providerRequestId,
      providerInstruction: providerInstruction || current.providerInstruction,
      providerError: safeProviderError(error),
      updatedAt,
      terminalAt: unresolved ? null : updatedAt,
    })
  })

  return Object.freeze({ mutateIntent, persistAdapterFailure })
}
