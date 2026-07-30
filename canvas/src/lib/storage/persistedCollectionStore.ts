import { getLocalStorage } from '@/lib/persistence'
import { toCloneSafeValue } from '@/lib/storage/cloneSafe'

type PersistedRecord = Record<string, unknown>
type PersistedRecordMap = Record<string, PersistedRecord>
type Selector<T> = Partial<{ [K in keyof T]: T[K] }>
type SortSpec<T> = Partial<Record<Extract<keyof T, string>, 'asc' | 'desc'>>
type PersistedSnapshot<Collections extends PersistedRecordMap> = {
  [CollectionName in keyof Collections]: Record<string, Collections[CollectionName]>
}
type PersistedCollectionKeyResolvers<Collections extends PersistedRecordMap> = Partial<{
  [CollectionName in keyof Collections]: (record: Collections[CollectionName]) => string
}>
type PersistedCollectionRecordFilters<Collections extends PersistedRecordMap> = Partial<{
  [CollectionName in keyof Collections]: (record: Collections[CollectionName]) => boolean
}>

const cloneRecord = <T>(value: T): T => {
  const cloned = toCloneSafeValue(value)
  return (cloned ?? null) as T
}

const compareValues = (left: unknown, right: unknown): number => {
  if (left === right) return 0
  if (left == null) return -1
  if (right == null) return 1
  const leftNumber = typeof left === 'number' ? left : Number.NaN
  const rightNumber = typeof right === 'number' ? right : Number.NaN
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return String(left).localeCompare(String(right))
}

const matchesSelector = <T extends PersistedRecord>(record: T, selector?: Selector<T>): boolean => {
  if (!selector) return true
  const entries = Object.entries(selector) as Array<[keyof T, T[keyof T]]>
  for (let i = 0; i < entries.length; i += 1) {
    const [key, value] = entries[i]!
    if (record[key] !== value) return false
  }
  return true
}

const readMutableSnapshotCollection = <Collections extends PersistedRecordMap, CollectionName extends keyof Collections>(
  snapshot: PersistedSnapshot<Collections>,
  collectionName: CollectionName,
): Record<string, Collections[CollectionName]> =>
  snapshot[collectionName] as Record<string, Collections[CollectionName]>

export type PersistedCollectionRow<T extends PersistedRecord> = {
  get<K extends keyof T>(key: K): T[K] | undefined
  toJSON(): T
  incrementalPatch(patch: Partial<T>): Promise<void>
  remove(): Promise<void>
}

export type PersistedCollectionChangeEvent<T extends PersistedRecord> = {
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  documentId: string
  documentData: T | null
}

export type PersistedCollection<T extends PersistedRecord> = {
  $: {
    subscribe(
      listener: (event: PersistedCollectionChangeEvent<T>) => void,
    ): { unsubscribe(): void }
  }
  find(query?: { selector?: Selector<T> }): {
    sort(spec: SortSpec<T>): ReturnType<PersistedCollection<T>['find']>
    limit(count: number): ReturnType<PersistedCollection<T>['find']>
    exec(): Promise<Array<PersistedCollectionRow<T>>>
  }
  findOne(id: string): {
    exec(): Promise<PersistedCollectionRow<T> | null>
  }
  incrementalUpsert(record: T): Promise<void>
}

export type PersistedCollectionMap<Collections extends PersistedRecordMap> = {
  [CollectionName in keyof Collections]: PersistedCollection<Collections[CollectionName]>
}

export type PersistedCollectionPersistenceState = {
  mode: 'indexeddb' | 'memory'
  status: 'active' | 'degraded'
  error: string | null
  restoredRecordTypes: string[]
  failedRecordTypes: Array<{ recordType: string; reason: string }>
}

export type PersistedCollectionDb<Collections extends PersistedRecordMap> = {
  db: {
    remove(): Promise<void>
    close(): Promise<void>
  }
  collections: PersistedCollectionMap<Collections>
  persistence: {
    getState(): PersistedCollectionPersistenceState
    subscribe(listener: (state: PersistedCollectionPersistenceState) => void): { unsubscribe(): void }
  }
}

const createEmptySnapshot = <Collections extends PersistedRecordMap>(
  collectionNames: Array<keyof Collections>,
): PersistedSnapshot<Collections> => {
  const snapshot = {} as PersistedSnapshot<Collections>
  for (let i = 0; i < collectionNames.length; i += 1) {
    const collectionName = collectionNames[i]!
    snapshot[collectionName] = {} as Record<string, Collections[typeof collectionName]>
  }
  return snapshot
}

export const createPersistedCollectionDb = <Collections extends PersistedRecordMap>(args: {
  storageKey: string
  collectionNames: Array<keyof Collections>
  persistent?: boolean
  recordKeyByCollection?: PersistedCollectionKeyResolvers<Collections>
  shouldPersistRecordByCollection?: PersistedCollectionRecordFilters<Collections>
}): PersistedCollectionDb<Collections> => {
  const storage = args.persistent === false ? null : getLocalStorage()
  let persistenceEnabled = !!storage
  const readRecordKey = <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    record: Collections[CollectionName],
    fallbackKey = '',
  ): string => {
    const customResolver = args.recordKeyByCollection?.[collectionName]
    const customKey = customResolver ? String(customResolver(record) || '').trim() : ''
    if (customKey) return customKey
    const defaultKey = String((record as { id?: unknown })?.id || '').trim()
    if (defaultKey) return defaultKey
    return String(fallbackKey || '').trim()
  }
  const readSnapshot = (): PersistedSnapshot<Collections> => {
    if (!storage || !persistenceEnabled) return createEmptySnapshot<Collections>(args.collectionNames)
    try {
      const raw = storage.getItem(args.storageKey)
      if (!raw) return createEmptySnapshot<Collections>(args.collectionNames)
      const parsed = JSON.parse(raw) as Partial<PersistedSnapshot<Collections>>
      const next = createEmptySnapshot<Collections>(args.collectionNames)
      for (let i = 0; i < args.collectionNames.length; i += 1) {
        const collectionName = args.collectionNames[i]!
        const collectionRows = parsed[collectionName]
        if (!collectionRows || typeof collectionRows !== 'object') continue
        const entries = Object.entries(collectionRows as Record<string, Collections[typeof collectionName]>)
        for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
          const [storageKey, value] = entries[entryIndex]!
          const cloned = cloneRecord(value)
          if (!cloned || typeof cloned !== 'object') continue
          const recordKey = readRecordKey(collectionName, cloned, storageKey)
          if (!recordKey) continue
          readMutableSnapshotCollection(next, collectionName)[recordKey] = cloned
        }
      }
      return next
    } catch {
      return createEmptySnapshot<Collections>(args.collectionNames)
    }
  }
  let snapshot = readSnapshot()
  const listenersByCollection = new Map<keyof Collections, Set<(event: PersistedCollectionChangeEvent<Collections[keyof Collections]>) => void>>()

  const emitChange = <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    event: PersistedCollectionChangeEvent<Collections[CollectionName]>,
  ): void => {
    const listeners = listenersByCollection.get(collectionName)
    if (!listeners || listeners.size === 0) return
    listeners.forEach(listener => {
      try {
        listener(event as PersistedCollectionChangeEvent<Collections[keyof Collections]>)
      } catch {
        void 0
      }
    })
  }

  const flushSnapshot = (): void => {
    if (!storage || !persistenceEnabled) return
    try {
      const persistedSnapshot = createEmptySnapshot<Collections>(args.collectionNames)
      for (let collectionIndex = 0; collectionIndex < args.collectionNames.length; collectionIndex += 1) {
        const collectionName = args.collectionNames[collectionIndex]!
        const filter = args.shouldPersistRecordByCollection?.[collectionName]
        const entries = Object.entries(snapshot[collectionName]) as Array<[
          string,
          Collections[typeof collectionName],
        ]>
        for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
          const [recordKey, record] = entries[entryIndex]!
          if (filter && !filter(record)) continue
          readMutableSnapshotCollection(persistedSnapshot, collectionName)[recordKey] = record
        }
      }
      storage.setItem(args.storageKey, JSON.stringify(persistedSnapshot))
    } catch {
      persistenceEnabled = false
    }
  }

  const writeRecord = <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    record: Collections[CollectionName],
  ): void => {
    const safeRecord = cloneRecord(record)
    if (!safeRecord || typeof safeRecord !== 'object') return
    const recordKey = readRecordKey(collectionName, safeRecord)
    if (!recordKey) return
    const collectionSnapshot = readMutableSnapshotCollection(snapshot, collectionName)
    const operation: PersistedCollectionChangeEvent<Collections[CollectionName]>['operation'] =
      collectionSnapshot[recordKey] ? 'UPDATE' : 'INSERT'
    collectionSnapshot[recordKey] = safeRecord
    flushSnapshot()
    emitChange(collectionName, {
      operation,
      documentId: recordKey,
      documentData: cloneRecord(safeRecord),
    })
  }

  const removeRecord = <CollectionName extends keyof Collections>(collectionName: CollectionName, id: string): void => {
    const current = snapshot[collectionName][id]
    if (!current) return
    delete snapshot[collectionName][id]
    flushSnapshot()
    emitChange(collectionName, {
      operation: 'DELETE',
      documentId: id,
      documentData: cloneRecord(current),
    })
  }

  const buildRow = <CollectionName extends keyof Collections>(
    collectionName: CollectionName,
    id: string,
  ): PersistedCollectionRow<Collections[CollectionName]> => ({
    get(key) {
      const current = snapshot[collectionName][id]
      return current?.[key]
    },
    toJSON() {
      return cloneRecord(snapshot[collectionName][id]) as Collections[CollectionName]
    },
    async incrementalPatch(patch) {
      const current = snapshot[collectionName][id]
      if (!current) return
      writeRecord(collectionName, {
        ...current,
        ...cloneRecord(patch),
      } as Collections[CollectionName])
    },
    async remove() {
      removeRecord(collectionName, id)
    },
  })

  const collections = {} as PersistedCollectionMap<Collections>
  for (let i = 0; i < args.collectionNames.length; i += 1) {
    const collectionName = args.collectionNames[i]!
    collections[collectionName] = {
      $: {
        subscribe(listener) {
          const typedListener = listener as (event: PersistedCollectionChangeEvent<Collections[keyof Collections]>) => void
          const listeners = listenersByCollection.get(collectionName) || new Set()
          listeners.add(typedListener)
          listenersByCollection.set(collectionName, listeners)
          return {
            unsubscribe() {
              listeners.delete(typedListener)
              if (listeners.size === 0) listenersByCollection.delete(collectionName)
            },
          }
        },
      },
      find(query) {
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
            const rows = Object.values(snapshot[collectionName])
              .filter(record => matchesSelector(record, query?.selector))
              .sort((left, right) => {
                if (!sortSpec) return 0
                const entries = Object.entries(sortSpec) as Array<[keyof Collections[typeof collectionName], 'asc' | 'desc']>
                for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
                  const [key, direction] = entries[entryIndex]!
                  const delta = compareValues(left[key], right[key])
                  if (delta !== 0) return direction === 'desc' ? -delta : delta
                }
                return 0
              })
            const limitedRows = rowLimit == null ? rows : rows.slice(0, rowLimit)
            return limitedRows
              .map(row => {
                const rowKey = readRecordKey(collectionName, row)
                return rowKey ? buildRow(collectionName, rowKey) : null
              })
              .filter(Boolean) as Array<PersistedCollectionRow<Collections[typeof collectionName]>>
          },
        }
      },
      findOne(id) {
        return {
          async exec() {
            const safeId = String(id || '').trim()
            if (!safeId || !snapshot[collectionName][safeId]) return null
            return buildRow(collectionName, safeId)
          },
        }
      },
      async incrementalUpsert(record) {
        const safeRecord = cloneRecord(record)
        if (!safeRecord || typeof safeRecord !== 'object') return
        const safeKey = readRecordKey(collectionName, safeRecord)
        if (!safeKey) return
        writeRecord(collectionName, safeRecord as Collections[typeof collectionName])
      },
    } as PersistedCollection<Collections[typeof collectionName]>
  }

  return {
    db: {
      async remove() {
        snapshot = createEmptySnapshot<Collections>(args.collectionNames)
        if (storage) {
          try {
            storage.removeItem(args.storageKey)
          } catch {
            void 0
          }
        }
      },
      async close() {
        void 0
      },
    },
    collections,
    persistence: {
      getState() {
        return {
          mode: 'memory',
          status: 'active',
          error: null,
          restoredRecordTypes: args.collectionNames.map(String),
          failedRecordTypes: [],
        }
      },
      subscribe() {
        return { unsubscribe() { void 0 } }
      },
    },
  }
}
