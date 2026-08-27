import {
  PAYMENT_MAX_RECONCILIATION_ATTEMPTS,
  type PaymentRailNeutralResult,
  type PaymentSurfaceSnapshot,
  type PaymentSurfaceState,
} from 'grph-shared/payments/paymentRuntimeContract'
import type { AgenticGraphStorageDb } from '@/lib/storage/agenticgraphStorageDb'
import {
  buildQueuedPaymentSurfaceSnapshot,
  listPaymentIntentQueue,
  paymentIntentQueueRecordToCommand,
  updatePaymentIntentQueueRecord,
} from './paymentIntentQueue'
import {
  appendLocalPaymentReceipt,
  type LocalPaymentReceiptAppendResult,
} from './paymentReceiptProjection'
import type { PaymentApiTransport } from './paymentApiClient'

export const PAYMENT_RECONCILIATION_BACKOFF_MS = Object.freeze([
  1_000,
  5_000,
  15_000,
  60_000,
  300_000,
])

export type PaymentReconcilerResult = Readonly<{
  online: boolean
  networkCalls: number
  attemptedClientIntentKeys: readonly string[]
  snapshots: readonly PaymentSurfaceSnapshot[]
  receiptErrors: readonly string[]
}>

type PaymentReconcilerOptions = Readonly<{
  transport: PaymentApiTransport
  db?: AgenticGraphStorageDb | null
  online?: boolean | (() => boolean)
  nowMs?: number
  maxAttempts?: number
  force?: boolean
}>

const TERMINAL_SURFACE_STATES = new Set<PaymentSurfaceState>([
  'paid',
  'refunded',
  'no_payment_required',
  'failed',
  'expired',
  'cancelled',
  'reconciliation_unresolved',
])

let reconciliationTail: Promise<void> = Promise.resolve()

const runReconciliation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const predecessor = reconciliationTail
  let release = (): void => undefined
  reconciliationTail = new Promise<void>(resolve => {
    release = resolve
  })
  await predecessor
  try {
    return await operation()
  } finally {
    release()
  }
}

const readOnline = (
  online: PaymentReconcilerOptions['online'],
): boolean => typeof online === 'function'
  ? online()
  : online !== false

const readNowMs = (value?: number): number => {
  const candidate = Number(value)
  return Number.isFinite(candidate) && candidate >= 0
    ? Math.floor(candidate)
    : Date.now()
}

const readMaxAttempts = (value?: number): number => {
  const candidate = Number(value)
  if (!Number.isFinite(candidate)) return PAYMENT_MAX_RECONCILIATION_ATTEMPTS
  return Math.min(
    PAYMENT_MAX_RECONCILIATION_ATTEMPTS,
    Math.max(1, Math.floor(candidate)),
  )
}

const stateFromResult = (
  result: PaymentRailNeutralResult,
): Exclude<PaymentSurfaceState, 'idle'> => {
  if (result.intent) {
    return result.intent.state === 'idle' ? 'failed' : result.intent.state
  }
  if (result.ok === false && result.code === 'provider_outcome_unknown') {
    return 'pending_provider'
  }
  return 'failed'
}

const readBuyerSafeReason = (result: PaymentRailNeutralResult): string | null =>
  result.ok === false ? result.message : null

const receiptErrorMessage = (
  result: LocalPaymentReceiptAppendResult,
): string | null => result.ok === false ? result.message : null

export const reconcilePaymentIntentQueue = async (
  options: PaymentReconcilerOptions,
): Promise<PaymentReconcilerResult> => runReconciliation(async () => {
  const records = await listPaymentIntentQueue(options.db)
  const initiallyOnline = readOnline(options.online)
  if (!initiallyOnline) {
    return Object.freeze({
      online: false,
      networkCalls: 0,
      attemptedClientIntentKeys: Object.freeze([]),
      snapshots: Object.freeze(records.map(record =>
        buildQueuedPaymentSurfaceSnapshot(record))),
      receiptErrors: Object.freeze([]),
    })
  }

  const nowMs = readNowMs(options.nowMs)
  const maxAttempts = readMaxAttempts(options.maxAttempts)
  const attemptedClientIntentKeys: string[] = []
  const snapshots: PaymentSurfaceSnapshot[] = []
  const receiptErrors: string[] = []
  let networkCalls = 0

  for (const queuedRecord of records) {
    if (!readOnline(options.online)) break
    if (TERMINAL_SURFACE_STATES.has(queuedRecord.state)) {
      snapshots.push(buildQueuedPaymentSurfaceSnapshot(queuedRecord))
      continue
    }
    if (
      !options.force
      && queuedRecord.nextAttemptAtMs > nowMs
    ) {
      snapshots.push(buildQueuedPaymentSurfaceSnapshot(queuedRecord))
      continue
    }
    if (queuedRecord.attemptCount >= maxAttempts) {
      const unresolved = await updatePaymentIntentQueueRecord(
        queuedRecord.clientIntentKey,
        current => ({
          ...current,
          state: 'reconciliation_unresolved',
          updatedAtMs: nowMs,
          nextAttemptAtMs: Number.MAX_SAFE_INTEGER,
          buyerSafeReason: 'Payment status could not be resolved within the retry limit.',
        }),
        options.db,
      )
      if (unresolved) snapshots.push(buildQueuedPaymentSurfaceSnapshot(unresolved))
      continue
    }

    const attemptNumber = queuedRecord.attemptCount + 1
    const attempted = await updatePaymentIntentQueueRecord(
      queuedRecord.clientIntentKey,
      current => ({
        ...current,
        attemptCount: attemptNumber,
        lastAttemptAtMs: nowMs,
        updatedAtMs: nowMs,
        nextAttemptAtMs: nowMs + PAYMENT_RECONCILIATION_BACKOFF_MS[
          Math.min(attemptNumber - 1, PAYMENT_RECONCILIATION_BACKOFF_MS.length - 1)
        ]!,
      }),
      options.db,
    )
    if (!attempted) continue

    attemptedClientIntentKeys.push(attempted.clientIntentKey)
    networkCalls += 1
    let result: PaymentRailNeutralResult
    try {
      result = attempted.serverIntentId
        ? await options.transport.reconcileIntent(attempted.serverIntentId)
        : await options.transport.submitIntent(paymentIntentQueueRecordToCommand(attempted))
    } catch {
      const unresolved = attemptNumber >= maxAttempts
      const networkFailure = await updatePaymentIntentQueueRecord(
        attempted.clientIntentKey,
        current => ({
          ...current,
          state: unresolved
            ? 'reconciliation_unresolved'
            : current.serverIntentId
              ? 'pending_provider'
              : 'queued_offline',
          updatedAtMs: nowMs,
          nextAttemptAtMs: unresolved
            ? Number.MAX_SAFE_INTEGER
            : current.nextAttemptAtMs,
          buyerSafeReason: unresolved
            ? 'Payment status could not be resolved within the retry limit.'
            : 'Connection unavailable. This payment remains safely held for retry.',
        }),
        options.db,
      )
      if (networkFailure) {
        snapshots.push(buildQueuedPaymentSurfaceSnapshot(networkFailure))
      }
      continue
    }

    if (result.receiptRecord) {
      const receiptResult = await appendLocalPaymentReceipt(
        result.receiptRecord,
        options.db,
      )
      const errorMessage = receiptErrorMessage(receiptResult)
      if (errorMessage) receiptErrors.push(errorMessage)
    }
    const resultState = stateFromResult(result)
    const exhausted = !TERMINAL_SURFACE_STATES.has(resultState)
      && attemptNumber >= maxAttempts
    const updated = await updatePaymentIntentQueueRecord(
      attempted.clientIntentKey,
      current => ({
        ...current,
        state: exhausted ? 'reconciliation_unresolved' : resultState,
        rail: result.rail || current.rail,
        serverIntentId: result.intent?.intentId || current.serverIntentId,
        updatedAtMs: nowMs,
        nextAttemptAtMs: exhausted || TERMINAL_SURFACE_STATES.has(resultState)
          ? Number.MAX_SAFE_INTEGER
          : current.nextAttemptAtMs,
        buyerSafeReason: exhausted
          ? 'Payment status could not be resolved within the retry limit.'
          : readBuyerSafeReason(result),
      }),
      options.db,
    )
    if (updated) {
      snapshots.push(buildQueuedPaymentSurfaceSnapshot(
        updated,
        exhausted ? null : result.instruction,
      ))
    }
  }

  return Object.freeze({
    online: readOnline(options.online),
    networkCalls,
    attemptedClientIntentKeys: Object.freeze(attemptedClientIntentKeys),
    snapshots: Object.freeze(snapshots),
    receiptErrors: Object.freeze(receiptErrors),
  })
})

export const retryPaymentIntentWithSameKey = async (
  clientIntentKey: string,
  options: PaymentReconcilerOptions,
): Promise<PaymentReconcilerResult> => {
  const nowMs = readNowMs(options.nowMs)
  await updatePaymentIntentQueueRecord(
    clientIntentKey,
    current => ({
      ...current,
      state: current.serverIntentId ? 'pending_provider' : 'queued_offline',
      attemptCount: 0,
      nextAttemptAtMs: nowMs,
      updatedAtMs: nowMs,
      buyerSafeReason: null,
    }),
    options.db,
  )
  return reconcilePaymentIntentQueue({ ...options, nowMs, force: true })
}

export const __resetPaymentReconcilerForTests = (): void => {
  reconciliationTail = Promise.resolve()
}
