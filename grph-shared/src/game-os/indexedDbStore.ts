import { cloneCanonicalGameOsValue } from './canonical.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'
import {
  GameOsError,
  type GameOsContinuityStore,
  type GameOsJsonValue,
} from './types.js'

export const GAME_OS_INDEXED_DB_NAME = 'knowgrph-game-os' as const
export const GAME_OS_INDEXED_DB_VERSION = 1
export const GAME_OS_INDEXED_DB_STORE = 'world-envelopes' as const

type StoredGameOsEnvelope<Value = Record<string, unknown>> = {
  worldId: string
  revision: string
  value: Value
}

export type GameOsIndexedDbLifecycleEvent = Readonly<{
  databaseName: string
  oldVersion: number
  newVersion: number | null
}>

export type GameOsIndexedDbContinuityStore = GameOsContinuityStore & {
  readonly databaseName: string
  readonly version: number
  close(): void
}

const positiveInteger = (value: unknown, field: string): number => {
  try { return exactSafeInteger(value, field, 1) } catch {
    throw new GameOsError('input-invalid', `${field} must be a positive integer.`, { field })
  }
}

const requiredText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('input-invalid', `${field} is required.`, { field })
  }
}

const storeError = (
  message: string,
  details: Record<string, GameOsJsonValue>,
): GameOsError => new GameOsError('store_unavailable', message, details)

const malformedRecordError = (databaseName: string, worldId: string, reason?: string): GameOsError =>
  new GameOsError('record_malformed', 'Game OS IndexedDB record is malformed.', {
    databaseName,
    recordId: `world:${worldId}`,
    ...(reason ? { reason } : {}),
  })

const errorReason = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const normalizeStoredEnvelope = (
  worldId: string,
  value: Record<string, unknown>,
): StoredGameOsEnvelope => {
  try { exactRecord(value, ['schema', 'worldId', 'revision', 'lease', 'continuity'], 'stored envelope') } catch (error) {
    throw new GameOsError('input-invalid', errorReason(error))
  }
  let revision: string
  let storedWorldId: string
  try {
    revision = exactText(value.revision, 'revision')
    storedWorldId = exactText(value.worldId, 'value.worldId')
  } catch (error) { throw new GameOsError('input-invalid', errorReason(error)) }
  if (storedWorldId !== worldId) {
    throw new GameOsError('input-invalid', 'Stored envelope worldId does not match its key.', {
      worldId,
    })
  }
  return {
    worldId,
    revision,
    value: cloneCanonicalGameOsValue(value),
  }
}

function decodeStoredEnvelope(
  value: unknown,
  databaseName: string,
  worldId: string,
  validateInner: true,
): StoredGameOsEnvelope<Record<string, unknown>>
function decodeStoredEnvelope(
  value: unknown,
  databaseName: string,
  worldId: string,
  validateInner: false,
): StoredGameOsEnvelope<unknown>
function decodeStoredEnvelope(
  value: unknown,
  databaseName: string,
  worldId: string,
  validateInner: boolean,
): StoredGameOsEnvelope<unknown> {
  try {
    const wrapper = exactRecord(value, ['worldId', 'revision', 'value'], 'IndexedDB envelope wrapper')
    const wrapperWorldId = exactText(wrapper.worldId, 'wrapper.worldId')
    const revision = exactText(wrapper.revision, 'wrapper.revision')
    const inner = validateInner
      ? exactRecord(wrapper.value, ['schema', 'worldId', 'revision', 'lease', 'continuity'], 'stored envelope')
      : wrapper.value
    if (wrapperWorldId !== worldId) {
      throw new Error('stored world identity does not match its key')
    }
    if (validateInner) {
      const innerRecord = inner as Record<string, unknown>
      if (exactText(innerRecord.worldId, 'value.worldId') !== worldId) {
        throw new Error('inner world identity does not match its key')
      }
      if (exactText(innerRecord.revision, 'value.revision') !== revision) {
        throw new Error('wrapper and inner revisions differ')
      }
    }
    return { worldId, revision, value: validateInner ? cloneCanonicalGameOsValue(inner) : inner }
  } catch (error) {
    throw malformedRecordError(databaseName, worldId, errorReason(error))
  }
}

const transactionError = (
  databaseName: string,
  operation: string,
  error: unknown,
): GameOsError => storeError(
  `Game OS IndexedDB ${operation} failed.`,
  { databaseName, operation, reason: errorReason(error) },
)

const openDatabase = (args: {
  indexedDB: IDBFactory
  databaseName: string
  version: number
  onUpgradeBlocked?: (event: GameOsIndexedDbLifecycleEvent) => void
}): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  let settled = false
  const request = args.indexedDB.open(args.databaseName, args.version)
  const rejectOnce = (error: GameOsError) => {
    if (settled) return
    settled = true
    reject(error)
  }
  request.onupgradeneeded = () => {
    const database = request.result
    if (!database.objectStoreNames.contains(GAME_OS_INDEXED_DB_STORE)) {
      database.createObjectStore(GAME_OS_INDEXED_DB_STORE, { keyPath: 'worldId' })
    }
  }
  request.onblocked = event => {
    if (settled) return
    const lifecycleEvent = Object.freeze({
      databaseName: args.databaseName,
      oldVersion: event.oldVersion,
      newVersion: event.newVersion,
    })
    const details: Record<string, GameOsJsonValue> = { ...lifecycleEvent }
    try {
      args.onUpgradeBlocked?.(lifecycleEvent)
    } catch (error) {
      details.callbackFailure = errorReason(error)
    }
    rejectOnce(storeError(
      `Game OS IndexedDB upgrade is blocked for ${args.databaseName}.`,
      details,
    ))
  }
  request.onerror = () => rejectOnce(transactionError(
    args.databaseName,
    'open',
    request.error ?? new Error('unknown open failure'),
  ))
  request.onsuccess = () => {
    if (settled) {
      request.result.close()
      return
    }
    settled = true
    resolve(request.result)
  }
})

export const openGameOsIndexedDbContinuityStore = async (args: {
  indexedDB?: IDBFactory
  databaseName?: string
  version?: number
  onUpgradeBlocked?: (event: GameOsIndexedDbLifecycleEvent) => void
  onVersionChange?: (event: GameOsIndexedDbLifecycleEvent) => void
} = {}): Promise<GameOsIndexedDbContinuityStore> => {
  const indexedDbFactory = args.indexedDB ?? globalThis.indexedDB
  if (!indexedDbFactory) {
    throw storeError('IndexedDB is unavailable in this runtime.', {
      databaseName: args.databaseName ?? GAME_OS_INDEXED_DB_NAME,
    })
  }
  const databaseName = requiredText(args.databaseName ?? GAME_OS_INDEXED_DB_NAME, 'databaseName')
  const version = positiveInteger(args.version ?? GAME_OS_INDEXED_DB_VERSION, 'version')
  const database = await openDatabase({
    indexedDB: indexedDbFactory,
    databaseName,
    version,
    onUpgradeBlocked: args.onUpgradeBlocked,
  })
  let closed = false
  database.onversionchange = event => {
    if (closed) return
    closed = true
    database.close()
    args.onVersionChange?.(Object.freeze({
      databaseName,
      oldVersion: event.oldVersion,
      newVersion: event.newVersion,
    }))
  }
  const requireOpen = (): IDBDatabase => {
    if (closed) {
      throw storeError(`Game OS IndexedDB ${databaseName} is closed.`, {
        databaseName,
      })
    }
    return database
  }
  return Object.freeze({
    databaseName,
    version,
    get(worldIdValue: string) {
      const worldId = requiredText(worldIdValue, 'worldId')
      return new Promise<Record<string, unknown> | null>((resolve, reject) => {
        try {
          const transaction = requireOpen().transaction(GAME_OS_INDEXED_DB_STORE, 'readonly')
          const request = transaction.objectStore(GAME_OS_INDEXED_DB_STORE).get(worldId)
          request.onerror = () => reject(transactionError(databaseName, 'get', request.error))
          request.onsuccess = () => {
            if (request.result === undefined) {
              resolve(null)
              return
            }
            try { resolve(decodeStoredEnvelope(request.result, databaseName, worldId, true).value) } catch (error) {
              reject(error)
            }
          }
        } catch (error) {
          reject(transactionError(databaseName, 'get', error))
        }
      })
    },
    getVersioned(worldIdValue: string) {
      const worldId = requiredText(worldIdValue, 'worldId')
      return new Promise<Readonly<{ value: Record<string, unknown>; revision: string }> | null>(
        (resolve, reject) => {
          try {
            const transaction = requireOpen().transaction(GAME_OS_INDEXED_DB_STORE, 'readonly')
            const request = transaction.objectStore(GAME_OS_INDEXED_DB_STORE).get(worldId)
            request.onerror = () => reject(transactionError(databaseName, 'getVersioned', request.error))
            request.onsuccess = () => {
              if (request.result === undefined) {
                resolve(null)
                return
              }
              try {
                const decoded = decodeStoredEnvelope(request.result, databaseName, worldId, false)
                resolve(Object.freeze({
                  value: decoded.value as Record<string, unknown>,
                  revision: decoded.revision,
                }))
              } catch (error) { reject(error) }
            }
          } catch (error) {
            reject(transactionError(databaseName, 'getVersioned', error))
          }
        },
      )
    },
    compareAndPut(
      worldIdValue: string,
      value: Record<string, unknown>,
      expectedRevisionValue: string | null,
    ) {
      const worldId = requiredText(worldIdValue, 'worldId')
      const expectedRevision = expectedRevisionValue === null
        ? null
        : requiredText(expectedRevisionValue, 'expectedRevision')
      const next = normalizeStoredEnvelope(worldId, value)
      return new Promise<boolean>((resolve, reject) => {
        let result = false
        let completed = false
        try {
          const transaction = requireOpen().transaction(GAME_OS_INDEXED_DB_STORE, 'readwrite')
          const objectStore = transaction.objectStore(GAME_OS_INDEXED_DB_STORE)
          const request = objectStore.get(worldId)
          const fail = (error: unknown) => {
            if (completed) return
            completed = true
            reject(error instanceof GameOsError ? error : transactionError(databaseName, 'compareAndPut', error))
          }
          request.onerror = () => fail(request.error)
          request.onsuccess = () => {
            const current = request.result
            let matches = current === undefined && expectedRevision === null
            if (current !== undefined) {
              try { matches = decodeStoredEnvelope(current, databaseName, worldId, false).revision === expectedRevision } catch (error) {
                fail(error); return
              }
            }
            if (!matches) return
            result = true
            objectStore.put(next)
          }
          transaction.onabort = () => fail(transaction.error ?? new Error('transaction aborted'))
          transaction.onerror = () => fail(transaction.error ?? new Error('transaction failed'))
          transaction.oncomplete = () => {
            if (completed) return
            completed = true
            resolve(result)
          }
        } catch (error) {
          completed = true
          reject(transactionError(databaseName, 'compareAndPut', error))
        }
      })
    },
    compareAndDelete(worldIdValue: string, expectedRevisionValue: string) {
      const worldId = requiredText(worldIdValue, 'worldId')
      const expectedRevision = requiredText(expectedRevisionValue, 'expectedRevision')
      return new Promise<boolean>((resolve, reject) => {
        let result = false
        let completed = false
        try {
          const transaction = requireOpen().transaction(GAME_OS_INDEXED_DB_STORE, 'readwrite')
          const objectStore = transaction.objectStore(GAME_OS_INDEXED_DB_STORE)
          const request = objectStore.get(worldId)
          const fail = (error: unknown) => {
            if (completed) return
            completed = true
            reject(error instanceof GameOsError ? error : transactionError(databaseName, 'compareAndDelete', error))
          }
          request.onerror = () => fail(request.error)
          request.onsuccess = () => {
            const current = request.result
            if (current === undefined) return
            let revision: string
            try { revision = decodeStoredEnvelope(current, databaseName, worldId, false).revision } catch (error) {
              fail(error); return
            }
            if (revision !== expectedRevision) return
            result = true
            objectStore.delete(worldId)
          }
          transaction.onabort = () => fail(transaction.error ?? new Error('transaction aborted'))
          transaction.onerror = () => fail(transaction.error ?? new Error('transaction failed'))
          transaction.oncomplete = () => {
            if (completed) return
            completed = true
            resolve(result)
          }
        } catch (error) {
          completed = true
          reject(transactionError(databaseName, 'compareAndDelete', error))
        }
      })
    },
    close() {
      if (closed) return
      closed = true
      database.close()
    },
  })
}
