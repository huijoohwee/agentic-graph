import {
  assertPaymentDataMinimized,
  buildPaymentFailureResult,
  buildPaymentParameterFingerprint,
  buildPaymentPublicStatus,
  buildPaymentSuccessResult,
  buildProviderIdempotencyKey,
  PAYMENT_MAX_RECONCILIATION_ATTEMPTS,
  PAYMENT_PROVIDER_CREATE_RETRY_WINDOW_MS,
  validatePaymentIntentCommand,
  type PaymentIntentRecord,
  type PaymentProviderCostEntry,
  type PaymentRailNeutralResult,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'
import {
  selectPaymentRail,
  type PaymentRailReadiness,
} from '../../../grph-shared/src/payments/paymentRailSsot'
import {
  paymentCommandMatchesBuyerProduct,
  type PaymentBuyerProduct,
} from '../../../grph-shared/src/payments/paymentBuyerProductSsot'
import type {
  PaymentProviderCallObservation,
  PaymentProviderReadResult,
  PaymentRailAdapter,
} from './paymentRailAdapters'
import type {
  PaymentRuntimeStore,
  PersistedPaymentIntentRecord,
} from './paymentRuntimePersistence'
import {
  buildInitialRecord,
  createPaymentIntentConcurrency,
  FINANCIAL_SUCCESS_STATES,
  patchRecord,
  safeProviderError,
  TERMINAL_PROVIDER_STATES,
} from './paymentIntentConcurrency'
import { paymentFailureMessage } from './paymentRuntimeFailures'

export type PaymentRuntimeReadiness = Readonly<{
  rails: PaymentRailReadiness
  admissionRails: PaymentRailReadiness
  cardSettledCurrencies: readonly string[]
  entries: readonly Readonly<{
    rail: 'stripe' | 'straitsx'
    ready: boolean
    missing: readonly string[]
    admissionReady: boolean
    admissionMissing: readonly string[]
  }>[]
  unavailableSources: readonly string[]
}>

export type PaymentRuntimeService = Readonly<{
  createIntent(command: unknown): Promise<PaymentRailNeutralResult>
  readPublicStatus(intentId: string): Promise<
    | Readonly<{ ok: true; status: ReturnType<typeof buildPaymentPublicStatus> }>
    | Readonly<{ ok: false; code: 'not_found' }>
  >
  reconcile(intentId: string): Promise<PaymentRailNeutralResult>
  settleFromProviderRead(args: {
    rail: 'stripe' | 'straitsx'
    providerObjectId: string
  }): Promise<PaymentRailNeutralResult>
  refund(intentId: string): Promise<PaymentRailNeutralResult>
  readView(view: string): Promise<
    | Readonly<{
        ok: true
        view: 'rail_readiness' | 'cost_summary'
        entries: readonly unknown[]
        unavailableSources: readonly string[]
        modelCallCount: 0
        modelCostUsd: 0
      }>
    | Readonly<{ ok: false; code: 'schema_invalid' }>
  >
}>

export const createPaymentRuntimeService = (args: {
  store: PaymentRuntimeStore
  adapters: Readonly<Record<'stripe' | 'straitsx', PaymentRailAdapter>>
  readiness: PaymentRuntimeReadiness
  buyerProduct: PaymentBuyerProduct | null
  now?: () => Date
  randomUuid?: () => string
  onCostLogGap?: (error: unknown) => void
}): PaymentRuntimeService => {
  const now = args.now || (() => new Date())
  const randomUuid = args.randomUuid || (() => crypto.randomUUID())
  const { mutateIntent, persistAdapterFailure } =
    createPaymentIntentConcurrency({ store: args.store, now })

  const storageFailure = (
    record: PaymentIntentRecord | null = null,
  ): PaymentRailNeutralResult => buildPaymentFailureResult({
    code: 'storage_unavailable',
    message: paymentFailureMessage('storage_unavailable'),
    record,
  })

  const observeProviderCalls = async (
    intentId: string,
    rail: PaymentIntentRecord['rail'],
    calls: readonly PaymentProviderCallObservation[],
  ): Promise<void> => {
    for (const call of calls) {
      const entry: PaymentProviderCostEntry = Object.freeze({
        id: `pcost_${randomUuid()}`,
        intentId,
        rail,
        operation: call.operation,
        providerRequestId: call.requestId,
        outcome: call.outcome,
        elapsedMs: call.elapsedMs,
        modelCallCount: 0,
        modelCostUsd: 0,
        createdAt: now().toISOString(),
      })
      try {
        await args.store.appendCostEntry(entry)
      } catch (error) {
        args.onCostLogGap?.(error)
      }
    }
  }

  const applyProviderRead = async (
    record: PersistedPaymentIntentRecord,
    result: PaymentProviderReadResult,
  ): Promise<PaymentRailNeutralResult> => {
    await observeProviderCalls(record.id, record.rail, result.calls)
    const mutation = await mutateIntent(record, current => {
      if (TERMINAL_PROVIDER_STATES.has(current.state)) return null
      if (result.ok === false) {
        const nextAttempt = current.reconciliationAttempts + 1
        const stopped = nextAttempt >= PAYMENT_MAX_RECONCILIATION_ATTEMPTS
        const updatedAt = now().toISOString()
        return patchRecord(current, {
          state: stopped
            ? 'reconciliation_unresolved'
            : 'provider_outcome_unknown',
          providerRequestId:
            result.error?.requestId || current.providerRequestId,
          providerError: safeProviderError(result.error),
          reconciliationAttempts: nextAttempt,
          updatedAt,
          terminalAt: stopped ? updatedAt : null,
        })
      }
      const identityMatches =
        result.providerObjectId === current.providerObjectId
        && result.clientIntentReference === buildProviderIdempotencyKey(
          current.rail,
          current.clientIntentKey,
        )
        && result.amountMinor === current.amountMinor
        && result.currency === current.currency
      const providerStateIsTerminal = TERMINAL_PROVIDER_STATES.has(result.state)
      if (!identityMatches || !providerStateIsTerminal) {
        const nextAttempt = current.reconciliationAttempts + 1
        const stopped = nextAttempt >= PAYMENT_MAX_RECONCILIATION_ATTEMPTS
        const updatedAt = now().toISOString()
        return patchRecord(current, {
          state: stopped
            ? 'reconciliation_unresolved'
            : 'provider_outcome_unknown',
          providerRequestId:
            result.providerRequestId || current.providerRequestId,
          reconciliationAttempts: nextAttempt,
          updatedAt,
          terminalAt: stopped ? updatedAt : null,
        })
      }
      const updatedAt = now().toISOString()
      return patchRecord(current, {
        state: result.state,
        providerRequestId:
          result.providerRequestId || current.providerRequestId,
        providerError: null,
        reconciliationAttempts: current.reconciliationAttempts + 1,
        updatedAt,
        terminalAt: updatedAt,
      })
    })
    if (!mutation.record) return storageFailure()
    if (!mutation.applied) {
      if (TERMINAL_PROVIDER_STATES.has(mutation.record.state)) {
        return buildPaymentSuccessResult(mutation.record, true)
      }
      return buildPaymentFailureResult({
        code: 'provider_outcome_unknown',
        message: paymentFailureMessage('provider_outcome_unknown'),
        record: mutation.record,
      })
    }
    if (result.ok === false) {
      return buildPaymentFailureResult({
        code: result.code,
        message: paymentFailureMessage(result.code),
        record: mutation.record,
      })
    }
    if (mutation.record.state === result.state) {
      return buildPaymentSuccessResult(mutation.record, true)
    }
    return buildPaymentFailureResult({
      code: 'provider_outcome_unknown',
      message: paymentFailureMessage('provider_outcome_unknown'),
      record: mutation.record,
    })
  }

  const service: PaymentRuntimeService = Object.freeze({
    async createIntent(rawCommand) {
      const validation = validatePaymentIntentCommand(rawCommand)
      if (validation.ok === false) {
        return buildPaymentFailureResult({
          code: validation.code,
          message: validation.message,
        })
      }
      const command = validation.value
      const fingerprint = buildPaymentParameterFingerprint(command)
      const existing = await args.store.findIntentByClientKey(command.clientIntentKey)
      if (existing) {
        if (existing.parameterFingerprint !== fingerprint) {
          return buildPaymentFailureResult({
            code: 'intent_parameter_conflict',
            message: paymentFailureMessage('intent_parameter_conflict'),
            record: existing,
            idempotentReplay: true,
          })
        }
        return buildPaymentSuccessResult(existing, true)
      }
      if (
        !args.buyerProduct
        || !paymentCommandMatchesBuyerProduct(command, args.buyerProduct)
      ) {
        return buildPaymentFailureResult({
          code: 'capability_unavailable',
          message: paymentFailureMessage('capability_unavailable'),
        })
      }
      const selection = selectPaymentRail({
        currency: command.currency,
        settlementAsset: command.settlementAsset,
        readiness: args.readiness.admissionRails,
        cardSettledCurrencies: args.readiness.cardSettledCurrencies,
      })
      if (selection.ok === false) {
        return buildPaymentFailureResult({
          code: 'rail_unavailable',
          message: paymentFailureMessage('rail_unavailable'),
        })
      }
      const initialRecord = buildInitialRecord({
        command,
        rail: selection.rail,
        selectionReason: selection.reason,
        nowIso: now().toISOString(),
      })
      assertPaymentDataMinimized(initialRecord)
      let record: PersistedPaymentIntentRecord
      try {
        // The durable ownership row exists before any provider contact.
        record = await args.store.insertIntent(initialRecord)
      } catch {
        const raced = await args.store.findIntentByClientKey(command.clientIntentKey)
        if (raced?.parameterFingerprint === fingerprint) {
          return buildPaymentSuccessResult(raced, true)
        }
        return buildPaymentFailureResult({
          code: raced ? 'intent_parameter_conflict' : 'storage_unavailable',
          message: paymentFailureMessage(raced ? 'intent_parameter_conflict' : 'storage_unavailable'),
          record: raced,
        })
      }
      const result = await args.adapters[record.rail].create(record)
      await observeProviderCalls(record.id, record.rail, result.calls)
      if (result.ok === false) {
        const failureMutation = await persistAdapterFailure(
          record,
          result.code,
          result.error,
          result.providerObjectId || null,
          result.providerRequestId || null,
          result.instruction || null,
        )
        if (!failureMutation.record) return storageFailure()
        if (
          !failureMutation.applied
          && TERMINAL_PROVIDER_STATES.has(failureMutation.record.state)
        ) {
          return buildPaymentSuccessResult(failureMutation.record, true)
        }
        return buildPaymentFailureResult({
          code: result.code,
          message: paymentFailureMessage(result.code),
          record: failureMutation.record,
        })
      }
      const creationMutation = await mutateIntent(record, current => {
        if (TERMINAL_PROVIDER_STATES.has(current.state)) return null
        if (
          current.providerObjectId
          && current.providerObjectId !== result.providerObjectId
        ) return null
        return patchRecord(current, {
          // Creation never establishes financial success; provider read/event does.
          state: 'pending_provider',
          providerObjectId: result.providerObjectId,
          providerRequestId: result.providerRequestId,
          providerInstruction: result.instruction,
          updatedAt: now().toISOString(),
        })
      })
      if (!creationMutation.record) return storageFailure()
      if (
        !creationMutation.applied
        && creationMutation.record.providerObjectId !== result.providerObjectId
      ) {
        return buildPaymentFailureResult({
          code: 'provider_outcome_unknown',
          message: paymentFailureMessage('provider_outcome_unknown'),
          record: creationMutation.record,
        })
      }
      return buildPaymentSuccessResult(
        creationMutation.record,
        !creationMutation.applied,
      )
    },

    async readPublicStatus(intentId) {
      const record = await args.store.findIntentById(String(intentId || '').trim())
      return record
        ? Object.freeze({ ok: true, status: buildPaymentPublicStatus(record) })
        : Object.freeze({ ok: false, code: 'not_found' })
    },

    async reconcile(intentId) {
      const record = await args.store.findIntentById(String(intentId || '').trim())
      if (!record) {
        return buildPaymentFailureResult({
          code: 'not_found',
          message: paymentFailureMessage('not_found'),
        })
      }
      if (TERMINAL_PROVIDER_STATES.has(record.state)) {
        return buildPaymentSuccessResult(record, true)
      }
      if (record.reconciliationAttempts >= PAYMENT_MAX_RECONCILIATION_ATTEMPTS) {
        const stoppedMutation = await mutateIntent(record, current => {
          if (TERMINAL_PROVIDER_STATES.has(current.state)) return null
          if (
            current.reconciliationAttempts
            < PAYMENT_MAX_RECONCILIATION_ATTEMPTS
          ) return null
          const updatedAt = now().toISOString()
          return patchRecord(current, {
            state: 'reconciliation_unresolved',
            updatedAt,
            terminalAt: updatedAt,
          })
        })
        if (!stoppedMutation.record) return storageFailure()
        if (
          !stoppedMutation.applied
          && TERMINAL_PROVIDER_STATES.has(stoppedMutation.record.state)
        ) {
          return buildPaymentSuccessResult(stoppedMutation.record, true)
        }
        return buildPaymentFailureResult({
          code: 'provider_outcome_unknown',
          message: paymentFailureMessage('provider_outcome_unknown'),
          record: stoppedMutation.record,
        })
      }
      let ownedRecord = record
      if (!ownedRecord.providerObjectId) {
        const createdAtMs = Date.parse(ownedRecord.createdAt)
        if (
          !Number.isFinite(createdAtMs)
          || now().getTime() - createdAtMs >= PAYMENT_PROVIDER_CREATE_RETRY_WINDOW_MS
        ) {
          return buildPaymentFailureResult({
            code: 'provider_outcome_unknown',
            message: paymentFailureMessage('provider_outcome_unknown'),
            record: ownedRecord,
          })
        }
        const retriedCreate = await args.adapters[ownedRecord.rail].create(ownedRecord)
        await observeProviderCalls(ownedRecord.id, ownedRecord.rail, retriedCreate.calls)
        if (retriedCreate.ok === false) {
          const retryFailure = await mutateIntent(ownedRecord, current => {
            if (TERMINAL_PROVIDER_STATES.has(current.state)) return null
            if (current.providerObjectId) return null
            const nextAttempt = current.reconciliationAttempts + 1
            const stopped = nextAttempt >= PAYMENT_MAX_RECONCILIATION_ATTEMPTS
            const updatedAt = now().toISOString()
            return patchRecord(current, {
              state: stopped
                ? 'reconciliation_unresolved'
                : 'provider_outcome_unknown',
              providerRequestId:
                retriedCreate.error?.requestId || current.providerRequestId,
              providerError: safeProviderError(retriedCreate.error),
              reconciliationAttempts: nextAttempt,
              updatedAt,
              terminalAt: stopped ? updatedAt : null,
            })
          })
          if (!retryFailure.record) return storageFailure()
          if (
            !retryFailure.applied
            && TERMINAL_PROVIDER_STATES.has(retryFailure.record.state)
          ) {
            return buildPaymentSuccessResult(retryFailure.record, true)
          }
          if (!retryFailure.applied && retryFailure.record.providerObjectId) {
            ownedRecord = retryFailure.record
          } else {
            return buildPaymentFailureResult({
              code: retriedCreate.code,
              message: paymentFailureMessage(retriedCreate.code),
              record: retryFailure.record,
            })
          }
        } else {
          const retryCreation = await mutateIntent(ownedRecord, current => {
            if (TERMINAL_PROVIDER_STATES.has(current.state)) return null
            if (
              current.providerObjectId
              && current.providerObjectId !== retriedCreate.providerObjectId
            ) return null
            return patchRecord(current, {
              state: 'pending_provider',
              providerObjectId: retriedCreate.providerObjectId,
              providerRequestId: retriedCreate.providerRequestId,
              providerInstruction: retriedCreate.instruction,
              updatedAt: now().toISOString(),
            })
          })
          if (!retryCreation.record) return storageFailure()
          if (
            !retryCreation.applied
            && TERMINAL_PROVIDER_STATES.has(retryCreation.record.state)
          ) {
            return buildPaymentSuccessResult(retryCreation.record, true)
          }
          if (
            retryCreation.record.providerObjectId
            !== retriedCreate.providerObjectId
          ) {
            return buildPaymentFailureResult({
              code: 'provider_outcome_unknown',
              message: paymentFailureMessage('provider_outcome_unknown'),
              record: retryCreation.record,
            })
          }
          ownedRecord = retryCreation.record
        }
        if (!ownedRecord.providerObjectId) {
          return buildPaymentFailureResult({
            code: 'provider_outcome_unknown',
            message: paymentFailureMessage('provider_outcome_unknown'),
            record: ownedRecord,
          })
        }
      }
      const result = await args.adapters[ownedRecord.rail].read(ownedRecord)
      return applyProviderRead(ownedRecord, result)
    },

    async settleFromProviderRead(input) {
      const record = await args.store.findIntentByProviderObject(
        input.rail,
        input.providerObjectId,
      )
      if (!record) {
        return buildPaymentFailureResult({
          code: 'not_found',
          message: paymentFailureMessage('not_found'),
        })
      }
      if (TERMINAL_PROVIDER_STATES.has(record.state)) {
        return buildPaymentSuccessResult(record, true)
      }
      const result = await args.adapters[record.rail].read(record)
      return applyProviderRead(record, result)
    },

    async refund(intentId) {
      const record = await args.store.findIntentById(String(intentId || '').trim())
      if (!record) {
        return buildPaymentFailureResult({
          code: 'not_found',
          message: paymentFailureMessage('not_found'),
        })
      }
      if (record.refundReference) return buildPaymentSuccessResult(record, true)
      if (!FINANCIAL_SUCCESS_STATES.has(record.state)) {
        return buildPaymentFailureResult({
          code: 'refund_not_applicable',
          message: paymentFailureMessage('refund_not_applicable'),
          record,
        })
      }
      const result = await args.adapters[record.rail].refund(record)
      await observeProviderCalls(record.id, record.rail, result.calls)
      if (result.ok === false) {
        const refundFailure = await mutateIntent(record, current => {
          if (current.refundReference || current.state === 'refunded') return null
          if (!FINANCIAL_SUCCESS_STATES.has(current.state)) return null
          return patchRecord(current, {
            providerRequestId:
              result.error?.requestId || current.providerRequestId,
            providerError: safeProviderError(result.error),
            updatedAt: now().toISOString(),
          })
        })
        if (!refundFailure.record) return storageFailure()
        if (
          refundFailure.record.refundReference
          || refundFailure.record.state === 'refunded'
        ) {
          return buildPaymentSuccessResult(refundFailure.record, true)
        }
        return buildPaymentFailureResult({
          code: result.code,
          message: paymentFailureMessage(result.code),
          record: refundFailure.record,
        })
      }
      const refundMutation = await mutateIntent(record, current => {
        if (current.refundReference || current.state === 'refunded') return null
        if (!FINANCIAL_SUCCESS_STATES.has(current.state)) return null
        const updatedAt = now().toISOString()
        return patchRecord(current, {
          state: 'refunded',
          refundReference: result.refundReference,
          providerRequestId:
            result.providerRequestId || current.providerRequestId,
          updatedAt,
          terminalAt: updatedAt,
        })
      })
      if (!refundMutation.record) return storageFailure()
      if (
        refundMutation.record.refundReference === result.refundReference
        || refundMutation.record.state === 'refunded'
      ) {
        return buildPaymentSuccessResult(
          refundMutation.record,
          !refundMutation.applied,
        )
      }
      return buildPaymentFailureResult({
        code: 'refund_not_applicable',
        message: paymentFailureMessage('refund_not_applicable'),
        record: refundMutation.record,
      })
    },

    async readView(view) {
      if (view === 'rail_readiness') {
        return Object.freeze({
          ok: true,
          view,
          entries: args.readiness.entries,
          unavailableSources: args.readiness.unavailableSources,
          modelCallCount: 0,
          modelCostUsd: 0,
        })
      }
      if (view === 'cost_summary') {
        const entries = await args.store.listCostEntries()
        return Object.freeze({
          ok: true,
          view,
          entries,
          unavailableSources: [] as readonly string[],
          modelCallCount: 0,
          modelCostUsd: 0,
        })
      }
      return Object.freeze({ ok: false, code: 'schema_invalid' })
    },
  })

  return service
}
