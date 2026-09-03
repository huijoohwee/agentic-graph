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
import { AGENTIC_OS_STORAGE_SYNC_BOUNDS } from '@/lib/storage/agentic-graph-storage-bounds'
import type {
  KgDocumentChunkRecord,
  KgGraphSnapshotRecord,
  AgenticGraphStorageCursorRecord,
  AgenticGraphStorageMutation,
  AgenticGraphStorageOutboxRecord,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
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
  entity: AgenticGraphStorageMutation['entity']
  recordId: string
  serverRevision: number | null
  remoteRecord: AgenticGraphStorageMutation['record'] | null
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

export type AgenticGraphStorageRecordMap = {
  documents: KgDocumentLocalRecord
  documentChunks: KgDocumentChunkRecord
  graphSnapshots: KgGraphSnapshotRecord
  syncOutbox: AgenticGraphStorageOutboxRecord
  syncConflicts: KgStorageConflictCandidateRecord
  syncCursor: AgenticGraphStorageCursorRecord
  paymentIntentQueue: KgPaymentIntentQueueRecord
  paymentChainEvidence: KgChainEvidenceRecord
  paymentReceiptDocuments: KgPaymentReceiptDocumentRecord
}

export type AgenticGraphStorageCollections = PersistedCollectionMap<AgenticGraphStorageRecordMap>
export type AgenticGraphStorageDb = PersistedCollectionDb<AgenticGraphStorageRecordMap> & {
  atomicWriteWithRevisions?: IndexedDbCollectionDb<AgenticGraphStorageRecordMap>['atomicWriteWithRevisions']
  revisionHistory?: IndexedDbCollectionDb<AgenticGraphStorageRecordMap>['revisionHistory']
  collaborationOutbox?: IndexedDbCollectionDb<AgenticGraphStorageRecordMap>['collaborationOutbox']
}

export type AgenticGraphStorageMutationUnit = {
  mutations: ReadonlyArray<PersistedCollectionAtomicMutation<AgenticGraphStorageRecordMap>>
  revisionDocuments?: ReadonlyArray<KgDocumentLocalRecord>
}

export const AGENTIC_OS_STORAGE_DB_NAME = 'kg:agentic-graph-storage'
export const AGENTIC_OS_STORAGE_PERSISTENCE_EVENT = 'kg:agentic-graph-storage-persistence-state'
export const AGENTIC_OS_STORAGE_COLLECTION_NAMES = Object.freeze([
  'documents',
  'documentChunks',
  'graphSnapshots',
  'syncOutbox',
  'syncConflicts',
  'syncCursor',
  'paymentIntentQueue',
  'paymentChainEvidence',
  'paymentReceiptDocuments',
] satisfies Array<keyof AgenticGraphStorageRecordMap>)

let agenticGraphStorageDbSingleton: Promise<AgenticGraphStorageDb> | null = null

const isAgenticGraphStorageDbTestMode = (): boolean => {
  try {
    const env = typeof process !== 'undefined' ? process.env : undefined
    if (!env) return false
    if (env.NODE_ENV === 'test') return true
    if (env.AG_TEST_QUIET === '1') return true
    return false
  } catch {
    return false
  }
}

export const getAgenticGraphStorageDb = async (): Promise<AgenticGraphStorageDb> => {
  if (agenticGraphStorageDbSingleton) return agenticGraphStorageDbSingleton
  agenticGraphStorageDbSingleton = (async () => {
    const testMode = isAgenticGraphStorageDbTestMode() || typeof window === 'undefined'
    if (!testMode) {
      return createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({
        databaseName: AGENTIC_OS_STORAGE_DB_NAME,
        collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
        onPersistenceStateChanged(state) {
          try {
            window.dispatchEvent(new CustomEvent(AGENTIC_OS_STORAGE_PERSISTENCE_EVENT, { detail: state }))
          } catch {
            void 0
          }
        },
      })
    }
    return createPersistedCollectionDb<AgenticGraphStorageRecordMap>({
      storageKey: AGENTIC_OS_STORAGE_DB_NAME,
      persistent: false,
      collectionNames: [...AGENTIC_OS_STORAGE_COLLECTION_NAMES],
    })
  })()
  return agenticGraphStorageDbSingleton.catch(err => {
    agenticGraphStorageDbSingleton = null
    throw err
  })
}

export const putAgenticGraphStorageDocument = async (
  dbState: AgenticGraphStorageDb,
  record: KgDocumentLocalRecord,
): Promise<void> => {
  await commitAgenticGraphStorageMutationUnit(dbState, {
    mutations: [{ kind: 'upsert', collectionName: 'documents', record }],
    revisionDocuments: [record],
  })
}

export const commitAgenticGraphStorageMutationUnit = async (
  dbState: AgenticGraphStorageDb,
  unit: AgenticGraphStorageMutationUnit,
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
    keep: AGENTIC_OS_STORAGE_SYNC_BOUNDS.minDocumentRevisionsRetained,
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

export const listAgenticGraphStorageDocumentRevisions = async (
  workspaceId: string,
  documentId: string,
  dbState?: AgenticGraphStorageDb | null,
): Promise<IndexedDocumentRevisionRecord[]> => {
  const storage = dbState || await getAgenticGraphStorageDb()
  if (!storage.revisionHistory) return []
  return storage.revisionHistory.list(workspaceId, documentId)
}

const collaborationOutboxMemory = new Map<string, IndexedCollaborationUpdateRecord>()

export const enqueueAgenticGraphCollaborationUpdate = async (
  record: IndexedCollaborationUpdateRecord,
  dbState?: AgenticGraphStorageDb | null,
): Promise<void> => {
  const storage = dbState || await getAgenticGraphStorageDb()
  collaborationOutboxMemory.set(record.updateId, record)
  await storage.collaborationOutbox?.enqueue(record)
}

export const listAgenticGraphCollaborationUpdates = async (
  workspaceId: string,
  documentKey: string,
  dbState?: AgenticGraphStorageDb | null,
): Promise<IndexedCollaborationUpdateRecord[]> => {
  const storage = dbState || await getAgenticGraphStorageDb()
  if (storage.collaborationOutbox) {
    return storage.collaborationOutbox.list(workspaceId, documentKey)
  }
  return Array.from(collaborationOutboxMemory.values())
    .filter(record => record.workspaceId === workspaceId && record.documentKey === documentKey)
    .sort((left, right) => left.clientSeq - right.clientSeq)
}

export const acknowledgeAgenticGraphCollaborationUpdate = async (
  updateId: string,
  dbState?: AgenticGraphStorageDb | null,
): Promise<void> => {
  const storage = dbState || await getAgenticGraphStorageDb()
  collaborationOutboxMemory.delete(updateId)
  await storage.collaborationOutbox?.remove(updateId)
}

export const markAgenticGraphCollaborationUpdateAttempt = async (
  updateId: string,
  dbState?: AgenticGraphStorageDb | null,
): Promise<void> => {
  const storage = dbState || await getAgenticGraphStorageDb()
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

export const getAgenticGraphStoragePersistenceState = async (): Promise<PersistedCollectionPersistenceState> =>
  (await getAgenticGraphStorageDb()).persistence.getState()

export const subscribeAgenticGraphStoragePersistenceState = (
  listener: (state: PersistedCollectionPersistenceState) => void,
): (() => void) => {
  let subscription: { unsubscribe(): void } | null = null
  let cancelled = false
  void getAgenticGraphStorageDb().then(storage => {
    if (cancelled) return
    listener(storage.persistence.getState())
    subscription = storage.persistence.subscribe(listener)
  })
  return () => {
    cancelled = true
    subscription?.unsubscribe()
  }
}

export const warmAgenticGraphStorageDb = async (): Promise<void> => {
  await getAgenticGraphStorageDb()
}

export const __resetAgenticGraphStorageDbForTests = async (): Promise<void> => {
  const current = agenticGraphStorageDbSingleton
  agenticGraphStorageDbSingleton = null
  collaborationOutboxMemory.clear()
  let dbState: AgenticGraphStorageDb | null = null
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
