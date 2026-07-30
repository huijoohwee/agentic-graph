import {
  appendKnowgrphPaymentRecordDocument,
  buildKnowgrphPublicPaymentStatus,
  parseKnowgrphPaymentRecordDocument,
  serializeKnowgrphPaymentRecordDocument,
  type KnowgrphPaymentRecordParseError,
  type KnowgrphPublicPaymentStatus,
  type KnowgrphTerminalPaymentRecord,
} from 'grph-shared/payments/paymentRecordDocument'
import { assertPaymentDataMinimized } from 'grph-shared/payments/paymentRuntimeContract'
import {
  getKnowgrphStorageDb,
  type KgPaymentReceiptDocumentRecord,
  type KnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'

export const LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID = 'payment-receipts:v1'

export type LocalPaymentReceiptProjection = Readonly<{
  document: string
  records: readonly KnowgrphTerminalPaymentRecord[]
  statuses: readonly KnowgrphPublicPaymentStatus[]
}>

export type LocalPaymentReceiptReadResult =
  | Readonly<{ ok: true; projection: LocalPaymentReceiptProjection }>
  | Readonly<{ ok: false; error: KnowgrphPaymentRecordParseError }>

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
      parseError?: KnowgrphPaymentRecordParseError
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
  db?: KnowgrphStorageDb | null,
): Promise<KnowgrphStorageDb> => db || getKnowgrphStorageDb()

const buildProjection = (
  document: string,
  records: readonly KnowgrphTerminalPaymentRecord[],
): LocalPaymentReceiptProjection => Object.freeze({
  document,
  records: Object.freeze([...records]),
  statuses: Object.freeze(records.map(buildKnowgrphPublicPaymentStatus)),
})

const recordsMatch = (
  left: KnowgrphTerminalPaymentRecord,
  right: KnowgrphTerminalPaymentRecord,
): boolean =>
  serializeKnowgrphPaymentRecordDocument([left])
  === serializeKnowgrphPaymentRecordDocument([right])

const canReplacePaidWithRefunded = (
  current: KnowgrphTerminalPaymentRecord,
  next: KnowgrphTerminalPaymentRecord,
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
  db?: KnowgrphStorageDb | null,
): Promise<string> => {
  const storage = await resolveStorage(db)
  const row = await storage.collections.paymentReceiptDocuments
    .findOne(LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID)
    .exec()
  return row?.get('document') ?? ''
}

export const readLocalPaymentReceiptProjection = async (
  db?: KnowgrphStorageDb | null,
): Promise<LocalPaymentReceiptReadResult> => {
  const document = await readLocalPaymentReceiptDocument(db)
  const parsed = parseKnowgrphPaymentRecordDocument(document)
  if (parsed.ok === false) return Object.freeze({ ok: false, error: parsed.error })
  return Object.freeze({
    ok: true,
    projection: buildProjection(document, parsed.records),
  })
}

export const appendLocalPaymentReceipt = async (
  record: KnowgrphTerminalPaymentRecord,
  db?: KnowgrphStorageDb | null,
): Promise<LocalPaymentReceiptAppendResult> => runReceiptMutation(async () => {
  try {
    assertPaymentDataMinimized(record)
    const storage = await resolveStorage(db)
    const currentDocument = await readLocalPaymentReceiptDocument(storage)
    const current = parseKnowgrphPaymentRecordDocument(currentDocument)
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
    let nextRecords: readonly KnowgrphTerminalPaymentRecord[]
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
      nextDocument = serializeKnowgrphPaymentRecordDocument(nextRecords)
    } else {
      const appended = appendKnowgrphPaymentRecordDocument(currentDocument, record)
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
