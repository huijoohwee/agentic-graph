import {
  createPersistedCollectionDb,
  type PersistedCollectionAtomicMutation,
  type PersistedCollectionDb,
  type PersistedCollectionMap,
  type PersistedCollectionPersistenceState,
} from '@/lib/storage/persistedCollectionStore'
import {
  createIndexedDbCollectionDb,
  type IndexedCollaborationUpdateRecord,
  type IndexedDbCollectionDb,
  type IndexedDocumentRevisionRecord,
} from '@/lib/storage/indexedDbCollectionStore'
import { KNOWGRPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/knowgrphStorageBounds'
import type {
  KgDocumentChunkRecord,
  KgGraphSnapshotRecord,
  KnowgrphStorageCursorRecord,
  KnowgrphStorageMutation,
  KnowgrphStorageOutboxRecord,
} from '@/lib/storage/knowgrphStorageSyncContract'
import type { PaymentRailId, PaymentSettlementAsset } from 'grph-shared/payments/paymentRailSsot'
import type {
  PaymentOrigin,
  PaymentSurfaceState,
} from 'grph-shared/payments/paymentRuntimeContract'

export type KgDocumentLocalRecord = {
  id: string
  workspaceId: string
  canonicalPath: string
  title: string | null
  docType: string | null
  lang: string | null
  graphId: string | null
  sourceKind: 'markdown'
  contentMd: string
  contentHash: string
  parserVersion: string
  documentRevision: number
  updatedAtMs: number
  isDeleted: boolean
}

export type KgStorageConflictCandidateRecord = {
  id: string
  workspaceId: string
  mutationId: string
  entity: KnowgrphStorageMutation['entity']
  recordId: string
  serverRevision: number | null
  remoteRecord: KnowgrphStorageMutation['record'] | null
  receivedAtMs: number
}

export type KgPaymentIntentQueueRecord = {
  id: string
  clientIntentKey: string
  parameterFingerprint: string
  amountMinor: number
  currency: string
  settlementAsset: PaymentSettlementAsset
  origin: PaymentOrigin
  state: Exclude<PaymentSurfaceState, 'idle'>
  rail: PaymentRailId | null
  serverIntentId: string | null
  attemptCount: number
  nextAttemptAtMs: number
  creationOrdinal: number
  createdAtMs: number
  updatedAtMs: number
  lastAttemptAtMs: number | null
  buyerSafeReason: string | null
}

export type KgPaymentReceiptDocumentRecord = {
  id: string
  schemaVersion: 1
  document: string
  updatedAtMs: number
}

export type KgChainEvidenceRecord = {
  id: string
  record: unknown
  updatedAtMs: number
}

export type KnowgrphStorageRecordMap = {
  documents: KgDocumentLocalRecord
  documentChunks: KgDocumentChunkRecord
  graphSnapshots: KgGraphSnapshotRecord
  syncOutbox: KnowgrphStorageOutboxRecord
  syncConflicts: KgStorageConflictCandidateRecord
  syncCursor: KnowgrphStorageCursorRecord
  paymentIntentQueue: KgPaymentIntentQueueRecord
  paymentChainEvidence: KgChainEvidenceRecord
  paymentReceiptDocuments: KgPaymentReceiptDocumentRecord
}

export type KnowgrphStorageCollections = PersistedCollectionMap<KnowgrphStorageRecordMap>
export type KnowgrphStorageDb = PersistedCollectionDb<KnowgrphStorageRecordMap> & {
  atomicWriteWithRevisions?: IndexedDbCollectionDb<KnowgrphStorageRecordMap>['atomicWriteWithRevisions']
  revisionHistory?: IndexedDbCollectionDb<KnowgrphStorageRecordMap>['revisionHistory']
  collaborationOutbox?: IndexedDbCollectionDb<KnowgrphStorageRecordMap>['collaborationOutbox']
}

export type KnowgrphStorageMutationUnit = {
  mutations: ReadonlyArray<PersistedCollectionAtomicMutation<KnowgrphStorageRecordMap>>
  revisionDocuments?: ReadonlyArray<KgDocumentLocalRecord>
}

export const KNOWGRPH_STORAGE_DB_NAME = 'kg:knowgrph-storage'
export const KNOWGRPH_STORAGE_PERSISTENCE_EVENT = 'kg:knowgrph-storage-persistence-state'
export const KNOWGRPH_STORAGE_COLLECTION_NAMES = Object.freeze([
  'documents',
  'documentChunks',
  'graphSnapshots',
  'syncOutbox',
  'syncConflicts',
  'syncCursor',
  'paymentIntentQueue',
  'paymentChainEvidence',
  'paymentReceiptDocuments',
] satisfies Array<keyof KnowgrphStorageRecordMap>)

let knowgrphStorageDbSingleton: Promise<KnowgrphStorageDb> | null = null

const isKnowgrphStorageDbTestMode = (): boolean => {
  try {
    const env = typeof process !== 'undefined' ? process.env : undefined
    if (!env) return false
    if (env.NODE_ENV === 'test') return true
    if (env.KG_TEST_QUIET === '1') return true
    return false
  } catch {
    return false
  }
}

export const getKnowgrphStorageDb = async (): Promise<KnowgrphStorageDb> => {
  if (knowgrphStorageDbSingleton) return knowgrphStorageDbSingleton
  knowgrphStorageDbSingleton = (async () => {
    const testMode = isKnowgrphStorageDbTestMode() || typeof window === 'undefined'
    if (!testMode) {
      return createIndexedDbCollectionDb<KnowgrphStorageRecordMap>({
        databaseName: KNOWGRPH_STORAGE_DB_NAME,
        collectionNames: [...KNOWGRPH_STORAGE_COLLECTION_NAMES],
        onPersistenceStateChanged(state) {
          try {
            window.dispatchEvent(new CustomEvent(KNOWGRPH_STORAGE_PERSISTENCE_EVENT, { detail: state }))
          } catch {
            void 0
          }
        },
      })
    }
    return createPersistedCollectionDb<KnowgrphStorageRecordMap>({
      storageKey: KNOWGRPH_STORAGE_DB_NAME,
      persistent: false,
      collectionNames: [...KNOWGRPH_STORAGE_COLLECTION_NAMES],
    })
  })()
  return knowgrphStorageDbSingleton.catch(err => {
    knowgrphStorageDbSingleton = null
    throw err
  })
}

export const putKnowgrphStorageDocument = async (
  dbState: KnowgrphStorageDb,
  record: KgDocumentLocalRecord,
): Promise<void> => {
  await commitKnowgrphStorageMutationUnit(dbState, {
    mutations: [{ kind: 'upsert', collectionName: 'documents', record }],
    revisionDocuments: [record],
  })
}

export const commitKnowgrphStorageMutationUnit = async (
  dbState: KnowgrphStorageDb,
  unit: KnowgrphStorageMutationUnit,
): Promise<void> => {
  const revisions = (unit.revisionDocuments || []).map(record => ({
    record: {
      workspaceId: record.workspaceId,
      documentId: record.id,
      documentRevision: record.documentRevision,
      contentMd: record.contentMd,
      contentHash: record.contentHash,
      updatedAtMs: record.updatedAtMs,
    },
    keep: KNOWGRPH_STORAGE_SYNC_BOUNDS.minDocumentRevisionsRetained,
  }))
  const persistence = dbState.persistence.getState()
  if (dbState.atomicWriteWithRevisions
    && persistence.mode === 'indexeddb'
    && persistence.status === 'active') {
    await dbState.atomicWriteWithRevisions(unit.mutations, revisions)
    return
  }
  // The explicit memory adapter preserves mutation atomicity, but never claims revision durability.
  await dbState.atomicWrite(unit.mutations)
}

export const listKnowgrphStorageDocumentRevisions = async (
  workspaceId: string,
  documentId: string,
  dbState?: KnowgrphStorageDb | null,
): Promise<IndexedDocumentRevisionRecord[]> => {
  const storage = dbState || await getKnowgrphStorageDb()
  if (!storage.revisionHistory) return []
  return storage.revisionHistory.list(workspaceId, documentId)
}

const collaborationOutboxMemory = new Map<string, IndexedCollaborationUpdateRecord>()

export const enqueueKnowgrphCollaborationUpdate = async (
  record: IndexedCollaborationUpdateRecord,
  dbState?: KnowgrphStorageDb | null,
): Promise<void> => {
  const storage = dbState || await getKnowgrphStorageDb()
  collaborationOutboxMemory.set(record.updateId, record)
  await storage.collaborationOutbox?.enqueue(record)
}

export const listKnowgrphCollaborationUpdates = async (
  workspaceId: string,
  documentKey: string,
  dbState?: KnowgrphStorageDb | null,
): Promise<IndexedCollaborationUpdateRecord[]> => {
  const storage = dbState || await getKnowgrphStorageDb()
  if (storage.collaborationOutbox) {
    return storage.collaborationOutbox.list(workspaceId, documentKey)
  }
  return Array.from(collaborationOutboxMemory.values())
    .filter(record => record.workspaceId === workspaceId && record.documentKey === documentKey)
    .sort((left, right) => left.clientSeq - right.clientSeq)
}

export const acknowledgeKnowgrphCollaborationUpdate = async (
  updateId: string,
  dbState?: KnowgrphStorageDb | null,
): Promise<void> => {
  const storage = dbState || await getKnowgrphStorageDb()
  collaborationOutboxMemory.delete(updateId)
  await storage.collaborationOutbox?.remove(updateId)
}

export const markKnowgrphCollaborationUpdateAttempt = async (
  updateId: string,
  dbState?: KnowgrphStorageDb | null,
): Promise<void> => {
  const storage = dbState || await getKnowgrphStorageDb()
  const current = collaborationOutboxMemory.get(updateId)
  if (current) {
    collaborationOutboxMemory.set(updateId, {
      ...current,
      attemptCount: current.attemptCount + 1,
      updatedAtMs: Date.now(),
    })
  }
  await storage.collaborationOutbox?.markAttempt(updateId)
}

export const getKnowgrphStoragePersistenceState = async (): Promise<PersistedCollectionPersistenceState> =>
  (await getKnowgrphStorageDb()).persistence.getState()

export const subscribeKnowgrphStoragePersistenceState = (
  listener: (state: PersistedCollectionPersistenceState) => void,
): (() => void) => {
  let subscription: { unsubscribe(): void } | null = null
  let cancelled = false
  void getKnowgrphStorageDb().then(storage => {
    if (cancelled) return
    listener(storage.persistence.getState())
    subscription = storage.persistence.subscribe(listener)
  })
  return () => {
    cancelled = true
    subscription?.unsubscribe()
  }
}

export const warmKnowgrphStorageDb = async (): Promise<void> => {
  await getKnowgrphStorageDb()
}

export const __resetKnowgrphStorageDbForTests = async (): Promise<void> => {
  const current = knowgrphStorageDbSingleton
  knowgrphStorageDbSingleton = null
  collaborationOutboxMemory.clear()
  let dbState: KnowgrphStorageDb | null = null
  if (current) {
    try {
      dbState = await current
    } catch {
      dbState = null
    }
  }
  if (!dbState) return
  try {
    await dbState.db.remove()
  } catch {
    try {
      await dbState.db.close()
    } catch {
      void 0
    }
  }
}
