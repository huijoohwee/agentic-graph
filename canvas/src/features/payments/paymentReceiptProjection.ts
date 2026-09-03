import {
  appendAgenticGraphPaymentRecordDocument,
  buildAgenticGraphPublicPaymentStatus,
  parseAgenticGraphPaymentRecordDocument,
  serializeAgenticGraphPaymentRecordDocument,
  type AgenticGraphPaymentRecordParseError,
  type AgenticGraphPublicPaymentStatus,
  type AgenticGraphTerminalPaymentRecord,
} from 'grph-shared/payments/paymentRecordDocument'
import { assertPaymentDataMinimized } from 'grph-shared/payments/paymentRuntimeContract'
import {
  getAgenticGraphStorageDb,
  type KgPaymentReceiptDocumentRecord,
  type AgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'

export const LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID = 'payment-receipts:v1'

export type LocalPaymentReceiptProjection = Readonly<{
  document: string
  records: readonly AgenticGraphTerminalPaymentRecord[]
  statuses: readonly AgenticGraphPublicPaymentStatus[]
}>

export type LocalPaymentReceiptReadResult =
  | Readonly<{ ok: true; projection: LocalPaymentReceiptProjection }>
  | Readonly<{ ok: false; error: AgenticGraphPaymentRecordParseError }>

export type LocalPaymentReceiptAppendResult =
  | Readonly<{
      ok: true
      appended: boolean
      projection: LocalPaymentReceiptProjection
    }>
  | Readonly<{
      ok: false
      code: 'receipt_identity_conflict' | 'receipt_parse_error' | 'storage_unavailable'
      message: string
      parseError?: AgenticGraphPaymentRecordParseError
    }>

let receiptMutationTail: Promise<void> = Promise.resolve()

const runReceiptMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
  const predecessor = receiptMutationTail
  let release = (): void => undefined
  receiptMutationTail = new Promise<void>(resolve => {
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

const buildProjection = (
  document: string,
  records: readonly AgenticGraphTerminalPaymentRecord[],
): LocalPaymentReceiptProjection => Object.freeze({
  document,
  records: Object.freeze([...records]),
  statuses: Object.freeze(records.map(buildAgenticGraphPublicPaymentStatus)),
})

const recordsMatch = (
  left: AgenticGraphTerminalPaymentRecord,
  right: AgenticGraphTerminalPaymentRecord,
): boolean =>
  serializeAgenticGraphPaymentRecordDocument([left])
  === serializeAgenticGraphPaymentRecordDocument([right])

const canReplacePaidWithRefunded = (
  current: AgenticGraphTerminalPaymentRecord,
  next: AgenticGraphTerminalPaymentRecord,
): boolean =>
  current.terminalState === 'paid'
  && next.terminalState === 'refunded'
  && current.intentId === next.intentId
  && current.clientIntentKey === next.clientIntentKey
  && current.rail === next.rail
  && current.amountMinor === next.amountMinor
  && current.currency === next.currency
  && current.settlementAsset === next.settlementAsset
  && current.providerObjectId === next.providerObjectId
  && next.terminalTimestamp >= current.terminalTimestamp

export const readLocalPaymentReceiptDocument = async (
  db?: AgenticGraphStorageDb | null,
): Promise<string> => {
  const storage = await resolveStorage(db)
  const row = await storage.collections.paymentReceiptDocuments
    .findOne(LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID)
    .exec()
  return row?.get('document') ?? ''
}

export const readLocalPaymentReceiptProjection = async (
  db?: AgenticGraphStorageDb | null,
): Promise<LocalPaymentReceiptReadResult> => {
  const document = await readLocalPaymentReceiptDocument(db)
  const parsed = parseAgenticGraphPaymentRecordDocument(document)
  if (parsed.ok === false) return Object.freeze({ ok: false, error: parsed.error })
  return Object.freeze({
    ok: true,
    projection: buildProjection(document, parsed.records),
  })
}

export const appendLocalPaymentReceipt = async (
  record: AgenticGraphTerminalPaymentRecord,
  db?: AgenticGraphStorageDb | null,
): Promise<LocalPaymentReceiptAppendResult> => runReceiptMutation(async () => {
  try {
    assertPaymentDataMinimized(record)
    const storage = await resolveStorage(db)
    const currentDocument = await readLocalPaymentReceiptDocument(storage)
    const current = parseAgenticGraphPaymentRecordDocument(currentDocument)
    if (current.ok === false) {
      return Object.freeze({
        ok: false,
        code: 'receipt_parse_error' as const,
        message: current.error.message,
        parseError: current.error,
      })
    }
    const existing = current.records.find(candidate =>
      candidate.intentId === record.intentId
      || candidate.clientIntentKey === record.clientIntentKey)
    let nextDocument: string
    let nextRecords: readonly AgenticGraphTerminalPaymentRecord[]
    if (existing) {
      if (recordsMatch(existing, record)) {
        return Object.freeze({
          ok: true,
          appended: false,
          projection: buildProjection(currentDocument, current.records),
        })
      }
      if (!canReplacePaidWithRefunded(existing, record)) {
        return Object.freeze({
          ok: false,
          code: 'receipt_identity_conflict' as const,
          message: 'The local receipt identity is already owned by a different terminal record.',
        })
      }
      nextRecords = current.records.map(candidate =>
        candidate.intentId === existing.intentId ? record : candidate)
      nextDocument = serializeAgenticGraphPaymentRecordDocument(nextRecords)
    } else {
      const appended = appendAgenticGraphPaymentRecordDocument(currentDocument, record)
      if (appended.ok === false) {
        return Object.freeze({
          ok: false,
          code: 'receipt_parse_error' as const,
          message: appended.error.message,
          parseError: appended.error,
        })
      }
      nextDocument = appended.document
      nextRecords = appended.records
    }
    const stored: KgPaymentReceiptDocumentRecord = {
      id: LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID,
      schemaVersion: 1,
      document: nextDocument,
      updatedAtMs: Date.now(),
    }
    assertPaymentDataMinimized(stored)
    await storage.collections.paymentReceiptDocuments.incrementalUpsert(stored)
    return Object.freeze({
      ok: true,
      appended: true,
      projection: buildProjection(nextDocument, nextRecords),
    })
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'storage_unavailable' as const,
      message: error instanceof Error ? error.message : 'Local receipt storage is unavailable.',
    })
  }
})

export const __resetPaymentReceiptProjectionForTests = (): void => {
  receiptMutationTail = Promise.resolve()
}
