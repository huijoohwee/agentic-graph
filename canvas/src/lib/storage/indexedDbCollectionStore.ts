import Dexie, { type Table } from 'dexie'
import { toCloneSafeValue } from '@/lib/storage/cloneSafe'
import {
  createPersistedCollectionDb,
  type PersistedCollection,
  type PersistedCollectionChangeEvent,
  type PersistedCollectionDb,
  type PersistedCollectionMap,
  type PersistedCollectionPersistenceState,
  type PersistedCollectionRow,
} from '@/lib/storage/persistedCollectionStore'

type StoredRecord = Record<string, unknown>
type StoredRecordMap = Record<string, StoredRecord>
type Selector<T> = Partial<{ [K in keyof T]: T[K] }>
type SortSpec<T> = Partial<Record<Extract<keyof T, string>, 'asc' | 'desc'>>

type IndexedCollectionRecord = {
  key: string
  collection: string
  id: string
  value: StoredRecord
}

export type IndexedDocumentRevisionRecord = {
  key: string
  workspaceId: string
  documentId: string
  documentRevision: number
  contentMd: string
  contentHash: string
  updatedAtMs: number
}

export type IndexedCollaborationUpdateRecord = {
  updateId: string
  workspaceId: string
  documentKey: string
  roomId: string
  provider: 'pocketbase' | 'durable-object'
  clientSeq: number
  updateBase64: string
  attemptCount: number
  acknowledgedAtMs: number | null
  createdAtMs: number
  updatedAtMs: number
}

class IndexedCollectionDexie extends Dexie {
  records!: Table<IndexedCollectionRecord, string>
  documentRevisions!: Table<IndexedDocumentRevisionRecord, string>
  collaborationUpdates!: Table<IndexedCollaborationUpdateRecord, string>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({
      records: '&key, collection, id, [collection+id]',
      documentRevisions: '&key, [workspaceId+documentId], documentRevision, updatedAtMs',
      collaborationUpdates: '&updateId, [workspaceId+documentKey], roomId, acknowledgedAtMs, createdAtMs',
    })
  }
}

export type IndexedDbCollectionDb<Collections extends StoredRecordMap> = PersistedCollectionDb<Collections> & {
  revisionHistory: {
    put(record: Omit<IndexedDocumentRevisionRecord, 'key'>, keep?: number): Promise<void>
    list(workspaceId: string, documentId: string): Promise<IndexedDocumentRevisionRecord[]>
  }
  collaborationOutbox: {
    enqueue(record: IndexedCollaborationUpdateRecord): Promise<void>
    list(workspaceId: string, documentKey: string): Promise<IndexedCollaborationUpdateRecord[]>
    remove(updateId: string): Promise<void>
    markAttempt(updateId: string): Promise<void>
  }
}

const cloneValue = <T>(value: T): T => (toCloneSafeValue(value) ?? null) as T

const normalizeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error || 'IndexedDB operation failed')

const compareValues = (left: unknown, right: unknown): number => {
  if (left === right) return 0
  if (left == null) return -1
  if (right == null) return 1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right))
}

const matchesSelector = <T extends StoredRecord>(record: T, selector?: Selector<T>): boolean => {
  if (!selector) return true
  const entries = Object.entries(selector) as Array<[keyof T, T[keyof T]]>
  return entries.every(([key, value]) => record[key] === value)
}

const recordsEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const collectionRecordKey = (collection: string, id: string): string =>
  `${collection}\u0000${id}`

const revisionRecordKey = (workspaceId: string, documentId: string, revision: number): string =>
  `${workspaceId}\u0000${documentId}\u0000${revision}`

export const createIndexedDbCollectionDb = async <Collections extends StoredRecordMap>(args: {
  databaseName: string
  collectionNames: Array<keyof Collections>
  onPersistenceStateChanged?: ((state: PersistedCollectionPersistenceState) => void) | null
}): Promise<IndexedDbCollectionDb<Collections>> => {
  const raw = new IndexedCollectionDexie(args.databaseName)
  const memory = createPersistedCollectionDb<Collections>({
    storageKey: `${args.databaseName}:memory`,
    persistent: false,
    collectionNames: args.collectionNames,
  })
  const stateListeners = new Set<(state: PersistedCollectionPersistenceState) => void>()
  const collectionListeners = new Map<
    keyof Collections,
    Set<(event: PersistedCollectionChangeEvent<Collections[keyof Collections]>) => void>
  >()
  const collaborationMemory = new Map<string, IndexedCollaborationUpdateRecord>()
  let persistenceState: PersistedCollectionPersistenceState = {
    mode: 'indexeddb',
    status: 'active',
    error: null,
    restoredRecordTypes: [],
    failedRecordTypes: [],
  }

  const publishState = (): void => {
    const snapshot = cloneValue(persistenceState)
    args.onPersistenceStateChanged?.(snapshot)
    stateListeners.forEach(listener => listener(snapshot))
  }

  const degradeToMemory = (error: unknown): void => {
    persistenceState = {
      ...persistenceState,
      mode: 'memory',
      status: 'degraded',
      error: normalizeError(error),
    }
    publishState()
  }

  try {
    await raw.open()
  } catch (error) {
    degradeToMemory(error)
  }

  if (persistenceState.mode === 'indexeddb') {
    for (const collectionName of args.collectionNames) {
      try {
        const persisted = await raw.records.where('collection').equals(String(collectionName)).toArray()
        for (const record of persisted) {
          await memory.collections[collectionName].incrementalUpsert(
            cloneValue(record.value) as Collections[typeof collectionName],
          )
        }
        persistenceState.restoredRecordTypes.push(String(collectionName))
      } catch (error) {
        persistenceState.failedRecordTypes.push({
          recordType: String(collectionName),
          reason: normalizeError(error),
        })
      }
    }
    if (persistenceState.failedRecordTypes.length > 0) {
      persistenceState = {
        ...persistenceState,
        status: 'degraded',
        error: 'One or more IndexedDB record types could not be restored.',
      }
    }
    publishState()
  }

  const runWriteWithRetry = async (operation: () => Promise<void>): Promise<boolean> => {
    if (persistenceState.mode !== 'indexeddb') return false
    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await operation()
        return true
      } catch (error) {
        lastError = error
        if (attempt === 0) await Promise.resolve()
      }
    }
    degradeToMemory(lastError)
    return false
  }

  const runRead = async <T>(operation: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
    if (persistenceState.mode !== 'indexeddb') return fallback()
    try {
      return await operation()
    } catch (error) {
      degradeToMemory(error)
      return fallback()
    }
  }

  const emitChange = <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    event: PersistedCollectionChangeEvent<Collections[CollectionName]>,
  ): void => {
    const listeners = collectionListeners.get(collectionName)
    if (!listeners) return
    listeners.forEach(listener => {
      listener(event as PersistedCollectionChangeEvent<Collections[keyof Collections]>)
    })
  }

  const readId = (record: StoredRecord): string => String(record.id || '').trim()

  const writeRecord = async <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    record: Collections[CollectionName],
  ): Promise<void> => {
    const safeRecord = cloneValue(record)
    const id = readId(safeRecord)
    if (!id) throw new Error(`${String(collectionName)} record id is required`)
    const memoryRow = await memory.collections[collectionName].findOne(id).exec()
    const operation: PersistedCollectionChangeEvent<Collections[CollectionName]>['operation'] =
      memoryRow ? 'UPDATE' : 'INSERT'
    await runWriteWithRetry(async () => {
      const key = collectionRecordKey(String(collectionName), id)
      await raw.transaction('rw', raw.records, async () => {
        const existing = await raw.records.get(key)
        if (existing && recordsEqual(existing.value, safeRecord)) return
        await raw.records.put({
          key,
          collection: String(collectionName),
          id,
          value: safeRecord,
        })
      })
    })
    await memory.collections[collectionName].incrementalUpsert(safeRecord)
    emitChange(collectionName, {
      operation,
      documentId: id,
      documentData: cloneValue(safeRecord),
    })
  }

  const removeRecord = async <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    id: string,
  ): Promise<void> => {
    const memoryRow = await memory.collections[collectionName].findOne(id).exec()
    if (!memoryRow) return
    const previous = memoryRow.toJSON()
    await runWriteWithRetry(async () => {
      await raw.records.delete(collectionRecordKey(String(collectionName), id))
    })
    await memoryRow.remove()
    emitChange(collectionName, {
      operation: 'DELETE',
      documentId: id,
      documentData: previous,
    })
  }

  const buildRow = <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    initialRecord: Collections[CollectionName],
  ): PersistedCollectionRow<Collections[CollectionName]> => {
    let current = cloneValue(initialRecord)
    const id = readId(current)
    return {
      get(key) {
        return current[key]
      },
      toJSON() {
        return cloneValue(current)
      },
      async incrementalPatch(patch) {
        current = {
          ...current,
          ...cloneValue(patch),
        }
        await writeRecord(collectionName, current)
      },
      async remove() {
        await removeRecord(collectionName, id)
      },
    }
  }

  const readCollectionRecords = async <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
  ): Promise<Array<Collections[CollectionName]>> =>
    runRead(
      async () => {
        const records = await raw.records.where('collection').equals(String(collectionName)).toArray()
        return records.map(record => cloneValue(record.value) as Collections[CollectionName])
      },
      async () => {
        const rows = await memory.collections[collectionName].find().exec()
        return rows.map(row => row.toJSON())
      },
    )

  const collections = {} as PersistedCollectionMap<Collections>
  for (const collectionName of args.collectionNames) {
    collections[collectionName] = {
      $: {
        subscribe(listener) {
          const typedListener = listener as (
            event: PersistedCollectionChangeEvent<Collections[keyof Collections]>,
          ) => void
          const listeners = collectionListeners.get(collectionName) || new Set()
          listeners.add(typedListener)
          collectionListeners.set(collectionName, listeners)
          return {
            unsubscribe() {
              listeners.delete(typedListener)
              if (listeners.size === 0) collectionListeners.delete(collectionName)
            },
          }
        },
      },
      find(query?: { selector?: Selector<Collections[typeof collectionName]> }) {
        let sortSpec: SortSpec<Collections[typeof collectionName]> | null = null
        let rowLimit: number | null = null
        return {
          sort(spec) {
            sortSpec = spec
            return this
          },
          limit(count) {
            rowLimit = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : null
            return this
          },
          async exec() {
            const records = (await readCollectionRecords(collectionName))
              .filter(record => matchesSelector(record, query?.selector))
              .sort((left, right) => {
                if (!sortSpec) return 0
                for (const [key, direction] of Object.entries(sortSpec)) {
                  const delta = compareValues(left[key], right[key])
                  if (delta !== 0) return direction === 'desc' ? -delta : delta
                }
                return 0
              })
            const limited = rowLimit == null ? records : records.slice(0, rowLimit)
            return limited.map(record => buildRow(collectionName, record))
          },
        }
      },
      findOne(id) {
        return {
          async exec() {
            const safeId = String(id || '').trim()
            if (!safeId) return null
            const record = await runRead(
              async () => {
                const stored = await raw.records.get(collectionRecordKey(String(collectionName), safeId))
                return stored ? cloneValue(stored.value) as Collections[typeof collectionName] : null
              },
              async () => {
                const row = await memory.collections[collectionName].findOne(safeId).exec()
                return row?.toJSON() ?? null
              },
            )
            return record ? buildRow(collectionName, record) : null
          },
        }
      },
      async incrementalUpsert(record) {
        await writeRecord(collectionName, record)
      },
    } as PersistedCollection<Collections[typeof collectionName]>
  }

  const listRevisions = async (
    workspaceId: string,
    documentId: string,
  ): Promise<IndexedDocumentRevisionRecord[]> =>
    runRead(
      async () => {
        const rows = await raw.documentRevisions
          .where('[workspaceId+documentId]')
          .equals([workspaceId, documentId])
          .toArray()
        return rows.sort((left, right) => left.documentRevision - right.documentRevision)
      },
      async () => [],
    )

  return {
    db: {
      async remove() {
        await memory.db.remove()
        if (raw.isOpen()) raw.close()
        await raw.delete()
      },
      async close() {
        await memory.db.close()
        raw.close()
      },
    },
    collections,
    persistence: {
      getState() {
        return cloneValue(persistenceState)
      },
      subscribe(listener) {
        stateListeners.add(listener)
        return {
          unsubscribe() {
            stateListeners.delete(listener)
          },
        }
      },
    },
    revisionHistory: {
      async put(record, keep = 10) {
        const safeKeep = Math.max(10, Math.floor(keep || 10))
        const key = revisionRecordKey(record.workspaceId, record.documentId, record.documentRevision)
        await runWriteWithRetry(async () => {
          await raw.transaction('rw', raw.documentRevisions, async () => {
            await raw.documentRevisions.put({ ...cloneValue(record), key })
            const rows = await raw.documentRevisions
              .where('[workspaceId+documentId]')
              .equals([record.workspaceId, record.documentId])
              .toArray()
            rows.sort((left, right) => right.documentRevision - left.documentRevision)
            const expiredKeys = rows.slice(safeKeep).map(row => row.key)
            if (expiredKeys.length > 0) await raw.documentRevisions.bulkDelete(expiredKeys)
          })
        })
      },
      list: listRevisions,
    },
    collaborationOutbox: {
      async enqueue(record) {
        const safeRecord = cloneValue(record)
        await runWriteWithRetry(async () => {
          const existing = await raw.collaborationUpdates.get(safeRecord.updateId)
          if (!existing || !recordsEqual(existing, safeRecord)) {
            await raw.collaborationUpdates.put(safeRecord)
          }
        })
        collaborationMemory.set(safeRecord.updateId, safeRecord)
      },
      async list(workspaceId, documentKey) {
        return runRead(
          async () => {
            const rows = await raw.collaborationUpdates
              .where('[workspaceId+documentKey]')
              .equals([workspaceId, documentKey])
              .toArray()
            rows.forEach(row => collaborationMemory.set(row.updateId, cloneValue(row)))
            return rows.sort((left, right) => left.clientSeq - right.clientSeq)
          },
          async () => Array.from(collaborationMemory.values())
            .filter(row => row.workspaceId === workspaceId && row.documentKey === documentKey)
            .sort((left, right) => left.clientSeq - right.clientSeq),
        )
      },
      async remove(updateId) {
        await runWriteWithRetry(async () => {
          await raw.collaborationUpdates.delete(updateId)
        })
        collaborationMemory.delete(updateId)
      },
      async markAttempt(updateId) {
        const current = await runRead(
          async () => raw.collaborationUpdates.get(updateId),
          async () => collaborationMemory.get(updateId),
        )
        if (!current) return
        const next = {
          ...current,
          attemptCount: current.attemptCount + 1,
          updatedAtMs: Date.now(),
        }
        await runWriteWithRetry(async () => {
          await raw.collaborationUpdates.put(next)
        })
        collaborationMemory.set(updateId, next)
      },
    },
  }
}
