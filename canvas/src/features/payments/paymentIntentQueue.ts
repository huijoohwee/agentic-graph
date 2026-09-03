import {
  PAYMENT_INTENT_QUEUE_MAX_DEPTH,
  assertPaymentDataMinimized,
  buildPaymentIntentId,
  buildPaymentParameterFingerprint,
  listPaymentSurfaceStatePresentations,
  validatePaymentIntentCommand,
  type PaymentInstruction,
  type PaymentIntentCommand,
  type PaymentSurfaceSnapshot,
} from 'grph-shared/payments/paymentRuntimeContract'
import {
  getAgenticGraphStorageDb,
  type KgPaymentIntentQueueRecord,
  type AgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'

export type PaymentIntentQueueErrorCode =
  | 'agent_offline_queue_unsupported'
  | 'intent_parameter_conflict'
  | 'queue_capacity_reached'
  | 'schema_invalid'
  | 'storage_unavailable'

export type PaymentIntentQueueResult =
  | Readonly<{
      ok: true
      created: boolean
      record: KgPaymentIntentQueueRecord
    }>
  | Readonly<{
      ok: false
      code: PaymentIntentQueueErrorCode
      message: string
    }>

type QueueOptions = Readonly<{
  db?: AgenticGraphStorageDb | null
  nowMs?: number
  maxDepth?: number
}>

const PAYMENT_STATE_PRESENTATION = new Map(
  listPaymentSurfaceStatePresentations().map(entry => [entry.state, entry]),
)

let queueMutationTail: Promise<void> = Promise.resolve()

const runQueueMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const predecessor = queueMutationTail
  let release = (): void => undefined
  queueMutationTail = new Promise<void>(resolve => {
    release = resolve
  })
  await predecessor
  try {
    return await operation()
  } finally {
    release()
  }
}

const resolveStorage = async (
  db?: AgenticGraphStorageDb | null,
): Promise<AgenticGraphStorageDb> => db || getAgenticGraphStorageDb()

const normalizeNowMs = (value?: number): number => {
  const candidate = Number(value)
  return Number.isFinite(candidate) && candidate >= 0
    ? Math.floor(candidate)
    : Date.now()
}

const normalizeMaxDepth = (value?: number): number => {
  const candidate = Number(value)
  if (!Number.isFinite(candidate)) return PAYMENT_INTENT_QUEUE_MAX_DEPTH
  return Math.min(
    PAYMENT_INTENT_QUEUE_MAX_DEPTH,
    Math.max(1, Math.floor(candidate)),
  )
}

const validateStoredRecord = (record: KgPaymentIntentQueueRecord): void => {
  assertPaymentDataMinimized(record)
  if (record.origin === 'agent') {
    throw new Error('Agent approval references are never persisted in the offline buyer queue.')
  }
  if (!Number.isSafeInteger(record.creationOrdinal) || record.creationOrdinal < 1) {
    throw new Error('Payment queue creation ordinal must be a positive safe integer.')
  }
  if (!Number.isSafeInteger(record.attemptCount) || record.attemptCount < 0) {
    throw new Error('Payment queue attempt count must be a non-negative safe integer.')
  }
}

export const listPaymentIntentQueue = async (
  db?: AgenticGraphStorageDb | null,
): Promise<KgPaymentIntentQueueRecord[]> => {
  const storage = await resolveStorage(db)
  const rows = await storage.collections.paymentIntentQueue
    .find()
    .sort({ creationOrdinal: 'asc', clientIntentKey: 'asc' })
    .exec()
  return rows.map(row => row.toJSON())
}

export const findPaymentIntentQueueRecord = async (
  clientIntentKey: string,
  db?: AgenticGraphStorageDb | null,
): Promise<KgPaymentIntentQueueRecord | null> => {
  const storage = await resolveStorage(db)
  const row = await storage.collections.paymentIntentQueue
    .findOne(buildPaymentIntentId(clientIntentKey))
    .exec()
  return row?.toJSON() ?? null
}

export const enqueuePaymentIntent = async (
  command: PaymentIntentCommand,
  options: QueueOptions = {},
): Promise<PaymentIntentQueueResult> => runQueueMutation(async () => {
  try {
    assertPaymentDataMinimized(command)
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'schema_invalid' as const,
      message: error instanceof Error ? error.message : 'Payment intent contains prohibited data.',
    })
  }
  const validation = validatePaymentIntentCommand(command)
  if (validation.ok === false) {
    return Object.freeze({
      ok: false,
      code: 'schema_invalid' as const,
      message: validation.message,
    })
  }
  if (validation.value.origin === 'agent') {
    return Object.freeze({
      ok: false,
      code: 'agent_offline_queue_unsupported' as const,
      message: 'Agent payment approvals are not persisted for later offline execution.',
    })
  }

  try {
    const storage = await resolveStorage(options.db)
    const id = buildPaymentIntentId(validation.value.clientIntentKey)
    const existingRow = await storage.collections.paymentIntentQueue.findOne(id).exec()
    const fingerprint = buildPaymentParameterFingerprint(validation.value)
    if (existingRow) {
      const existing = existingRow.toJSON()
      if (existing.parameterFingerprint !== fingerprint) {
        return Object.freeze({
          ok: false,
          code: 'intent_parameter_conflict' as const,
          message: 'The Client Intent Key is already owned by different payment parameters.',
        })
      }
      return Object.freeze({ ok: true, created: false, record: existing })
    }

    const records = await listPaymentIntentQueue(storage)
    if (records.length >= normalizeMaxDepth(options.maxDepth)) {
      return Object.freeze({
        ok: false,
        code: 'queue_capacity_reached' as const,
        message: 'The local payment queue is full. Existing payment intents were preserved.',
      })
    }
    const nowMs = normalizeNowMs(options.nowMs)
    const creationOrdinal = records.reduce(
      (highest, record) => Math.max(highest, record.creationOrdinal),
      0,
    ) + 1
    const record: KgPaymentIntentQueueRecord = {
      id,
      clientIntentKey: validation.value.clientIntentKey,
      parameterFingerprint: fingerprint,
      amountMinor: validation.value.amountMinor,
      currency: validation.value.currency,
      settlementAsset: validation.value.settlementAsset,
      origin: validation.value.origin,
      state: 'queued_offline',
      rail: null,
      serverIntentId: null,
      attemptCount: 0,
      nextAttemptAtMs: nowMs,
      creationOrdinal,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      lastAttemptAtMs: null,
      buyerSafeReason: null,
    }
    validateStoredRecord(record)
    await storage.collections.paymentIntentQueue.incrementalUpsert(record)
    return Object.freeze({ ok: true, created: true, record })
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'storage_unavailable' as const,
      message: error instanceof Error ? error.message : 'Local payment storage is unavailable.',
    })
  }
})

export const updatePaymentIntentQueueRecord = async (
  clientIntentKey: string,
  update: (
    current: KgPaymentIntentQueueRecord,
  ) => KgPaymentIntentQueueRecord,
  db?: AgenticGraphStorageDb | null,
): Promise<KgPaymentIntentQueueRecord | null> => runQueueMutation(async () => {
  const storage = await resolveStorage(db)
  const id = buildPaymentIntentId(clientIntentKey)
  const currentRow = await storage.collections.paymentIntentQueue.findOne(id).exec()
  if (!currentRow) return null
  const next = update(currentRow.toJSON())
  if (next.id !== id || next.clientIntentKey !== clientIntentKey) {
    throw new Error('Payment queue identity cannot change during an update.')
  }
  validateStoredRecord(next)
  await storage.collections.paymentIntentQueue.incrementalUpsert(next)
  return next
})

export const removePaymentIntentQueueRecord = async (
  clientIntentKey: string,
  db?: AgenticGraphStorageDb | null,
): Promise<void> => runQueueMutation(async () => {
  const storage = await resolveStorage(db)
  const row = await storage.collections.paymentIntentQueue
    .findOne(buildPaymentIntentId(clientIntentKey))
    .exec()
  await row?.remove()
})

export const paymentIntentQueueRecordToCommand = (
  record: KgPaymentIntentQueueRecord,
): PaymentIntentCommand => Object.freeze({
  clientIntentKey: record.clientIntentKey,
  amountMinor: record.amountMinor,
  currency: record.currency,
  settlementAsset: record.settlementAsset,
  origin: record.origin,
})

export const buildQueuedPaymentSurfaceSnapshot = (
  record: KgPaymentIntentQueueRecord,
  instruction: PaymentInstruction = null,
): PaymentSurfaceSnapshot => {
  const presentation = PAYMENT_STATE_PRESENTATION.get(record.state)
  if (!presentation) throw new Error(`Unsupported payment surface state: ${record.state}`)
  return Object.freeze({
    clientIntentKey: record.clientIntentKey,
    state: record.state,
    amountMinor: record.amountMinor,
    currency: record.currency,
    rail: record.rail,
    instruction,
    label: presentation.label,
    nextAction: presentation.nextAction,
    buyerSafeReason: record.buyerSafeReason,
  })
}

export const __resetPaymentIntentQueueForTests = (): void => {
  queueMutationTail = Promise.resolve()
}
