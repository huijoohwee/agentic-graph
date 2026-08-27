import Dexie, { type Table } from 'dexie'
import { createAgenticGraphStorageEngineOutboxPersistence } from './agenticgraphStorageEngineOutboxPersistence'
import type {
  AgenticGraphStorageEngineBinaryRecord,
  AgenticGraphStorageEngineOutboxRecord,
  AgenticGraphStorageEnginePersistence,
  AgenticGraphStorageEnginePersistenceState,
  StoredEngineRecord,
} from './agenticgraphStorageEnginePersistenceContract'
import {
  assertStorageCredentialFree,
  assertStorageNamespaceAndId,
  cloneStorageValue,
  matchesStorageExpectedRevision,
  normalizeStorageError,
  normalizeStorageValue,
  storageBinaryChunkKey,
  storageBinaryKey,
  storageRecordKey,
  type StoredBinaryChunk,
  type StoredBinaryManifest,
} from './agenticgraphStorageEnginePersistenceSupport'

export type {
  AgenticGraphStorageEngineBinaryRecord,
  AgenticGraphStorageEngineOutboxClaim,
  AgenticGraphStorageEngineOutboxKind,
  AgenticGraphStorageEngineOutboxRecord,
  AgenticGraphStorageEnginePersistence,
  AgenticGraphStorageEnginePersistenceState,
  AgenticGraphStorageEngineRecordWrite,
} from './agenticgraphStorageEnginePersistenceContract'

export const AGENTICGRAPH_STORAGE_ENGINE_DB_NAME = 'kg:agenticgraph-storage-engines'
export const AGENTICGRAPH_STORAGE_ENGINE_MAX_BYTES = 10_485_760
export const AGENTICGRAPH_STORAGE_ENGINE_BINARY_CHUNK_BYTES = 256 * 1_024

class AgenticGraphStorageEngineDexie extends Dexie {
  engineRecords!: Table<StoredEngineRecord, string>
  engineOutbox!: Table<AgenticGraphStorageEngineOutboxRecord, string>
  binaryManifests!: Table<StoredBinaryManifest, string>
  binaryChunks!: Table<StoredBinaryChunk, string>

  constructor(databaseName: string) {
    super(databaseName)
    this.version(1).stores({
      engineRecords: '&key, namespace, id, [namespace+id], updatedAtMs',
      engineOutbox: '&id, kind, workspaceId, createdAtMs, [kind+workspaceId+createdAtMs]',
      binaryManifests: '&key, namespace, objectKey, contentHash, [namespace+objectKey], updatedAtMs',
      binaryChunks: '&key, manifestKey, chunkIndex, [manifestKey+chunkIndex]',
    })
    this.version(2).stores({
      engineRecords: '&key, namespace, id, [namespace+id], updatedAtMs',
      engineOutbox:
        '&id, kind, workspaceId, partitionKey, sequence, createdAtMs, [kind+workspaceId+createdAtMs]',
      binaryManifests: '&key, namespace, objectKey, contentHash, [namespace+objectKey], updatedAtMs',
      binaryChunks: '&key, manifestKey, chunkIndex, [manifestKey+chunkIndex]',
    })
  }
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer


export const createAgenticGraphStorageEnginePersistence = async (args: {
  databaseName?: string
  forceMemory?: boolean
} = {}): Promise<AgenticGraphStorageEnginePersistence> => {
  const raw = new AgenticGraphStorageEngineDexie(args.databaseName || AGENTICGRAPH_STORAGE_ENGINE_DB_NAME)
  const memoryRecords = new Map<string, StoredEngineRecord>()
  const memoryOutbox = new Map<string, AgenticGraphStorageEngineOutboxRecord>()
  const memoryBinary = new Map<string, AgenticGraphStorageEngineBinaryRecord>()
  let memoryMutation = Promise.resolve()
  let state: AgenticGraphStorageEnginePersistenceState = {
    mode: args.forceMemory ? 'memory' : 'indexeddb',
    status: 'active',
    error: null,
  }

  if (state.mode === 'indexeddb') {
    try {
      await raw.open()
    } catch (error) {
      state = { mode: 'memory', status: 'degraded', error: normalizeStorageError(error) }
    }
  }

  const degrade = (error: unknown): void => {
    if (state.mode === 'memory') return
    state = { mode: 'memory', status: 'degraded', error: normalizeStorageError(error) }
    raw.close()
  }

  const writeOrFallback = async (
    indexedWrite: () => Promise<void>,
    memoryWrite: () => Promise<void> | void,
  ): Promise<void> => {
    if (state.mode === 'indexeddb') {
      try {
        await indexedWrite()
        return
      } catch (error) {
        degrade(error)
        throw new Error('persistence-unavailable')
      }
    }
    await memoryWrite()
  }

  const readOrFallback = async <T>(
    indexedRead: () => Promise<T>,
    memoryRead: () => Promise<T> | T,
  ): Promise<T> => {
    if (state.mode === 'indexeddb') {
      try {
        return await indexedRead()
      } catch (error) {
        degrade(error)
      }
    }
    return memoryRead()
  }

  const withMemoryMutation = async <T>(operation: () => Promise<T> | T): Promise<T> => {
    const result = memoryMutation.then(operation, operation)
    memoryMutation = result.then(() => undefined, () => undefined)
    return result
  }

  const readBinaryFromManifest = async (
    manifest: StoredBinaryManifest | undefined,
  ): Promise<AgenticGraphStorageEngineBinaryRecord | null> => {
    if (!manifest) return null
    const chunks = await raw.binaryChunks
      .where('manifestKey')
      .equals(manifest.key)
      .sortBy('chunkIndex')
    if (chunks.length !== manifest.chunkCount) throw new Error('Persisted binary chunk set is incomplete.')
    const bytes = new Uint8Array(manifest.byteLength)
    let offset = 0
    for (const chunk of chunks) {
      const value = new Uint8Array(chunk.bytes)
      bytes.set(value, offset)
      offset += value.byteLength
    }
    if (offset !== manifest.byteLength) throw new Error('Persisted binary byte length is inconsistent.')
    return {
      namespace: manifest.namespace,
      objectKey: manifest.objectKey,
      contentHash: manifest.contentHash,
      byteLength: manifest.byteLength,
      bytes,
    }
  }

  const removeBinaryIndexed = async (key: string): Promise<void> => {
    await raw.transaction('rw', raw.binaryManifests, raw.binaryChunks, async () => {
      await raw.binaryChunks.where('manifestKey').equals(key).delete()
      await raw.binaryManifests.delete(key)
    })
  }
  const outboxPersistence = createAgenticGraphStorageEngineOutboxPersistence({
    database: raw,
    outboxTable: raw.engineOutbox,
    recordsTable: raw.engineRecords,
    memoryOutbox,
    memoryRecords,
    getState: () => state,
    degrade,
    withMemoryMutation,
    readOrFallback,
  })

  return {
    records: {
      async put(namespaceValue, idValue, value) {
        const [namespace, id] = assertStorageNamespaceAndId(namespaceValue, idValue)
        assertStorageCredentialFree(value)
        const stored: StoredEngineRecord = {
          key: storageRecordKey(namespace, id),
          namespace,
          id,
          value: cloneStorageValue(value),
          updatedAtMs: Date.now(),
        }
        await writeOrFallback(
          async () => raw.engineRecords.put(stored).then(() => undefined),
          () => { memoryRecords.set(stored.key, stored) },
        )
      },
      async putMany(entries) {
        const storedEntries = entries.map(entry => {
          const [namespace, id] = assertStorageNamespaceAndId(entry.namespace, entry.id)
          assertStorageCredentialFree(entry.value)
          return {
            key: storageRecordKey(namespace, id),
            namespace,
            id,
            value: cloneStorageValue(entry.value),
            updatedAtMs: Date.now(),
          } satisfies StoredEngineRecord
        })
        await writeOrFallback(
          async () => raw.transaction('rw', raw.engineRecords, async () => {
            if (storedEntries.length > 0) await raw.engineRecords.bulkPut(storedEntries)
          }),
          () => {
            for (const stored of storedEntries) memoryRecords.set(stored.key, stored)
          },
        )
      },
      async compareAndPut(namespaceValue, idValue, value, expectedRevision) {
        const [namespace, id] = assertStorageNamespaceAndId(namespaceValue, idValue)
        assertStorageCredentialFree(value)
        const stored: StoredEngineRecord = {
          key: storageRecordKey(namespace, id), namespace, id,
          value: cloneStorageValue(value), updatedAtMs: Date.now(),
        }
        if (state.mode === 'indexeddb') {
          try {
            return await raw.transaction('rw', raw.engineRecords, async () => {
              if (!matchesStorageExpectedRevision(
                await raw.engineRecords.get(stored.key),
                expectedRevision,
              )) return false
              await raw.engineRecords.put(stored)
              return true
            })
          } catch (error) {
            degrade(error)
            throw new Error('persistence-unavailable')
          }
        }
        return withMemoryMutation(() => {
          if (!matchesStorageExpectedRevision(memoryRecords.get(stored.key), expectedRevision)) return false
          memoryRecords.set(stored.key, stored)
          return true
        })
      },
      async get(namespaceValue, idValue) {
        const [namespace, id] = assertStorageNamespaceAndId(namespaceValue, idValue)
        const key = storageRecordKey(namespace, id)
        return readOrFallback(
          async () => cloneStorageValue((await raw.engineRecords.get(key))?.value ?? null),
          () => cloneStorageValue(memoryRecords.get(key)?.value ?? null),
        )
      },
      async list(namespaceValue, idPrefix = '') {
        const namespace = normalizeStorageValue(namespaceValue)
        if (!namespace) throw new Error('Storage engine namespace is required.')
        const prefix = normalizeStorageValue(idPrefix)
        return readOrFallback(
          async () => (await raw.engineRecords.where('namespace').equals(namespace).toArray())
            .filter(record => !prefix || record.id.startsWith(prefix))
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(record => cloneStorageValue(record.value)),
          () => Array.from(memoryRecords.values())
            .filter(record => record.namespace === namespace && (!prefix || record.id.startsWith(prefix)))
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(record => cloneStorageValue(record.value)),
        )
      },
      async remove(namespaceValue, idValue) {
        const [namespace, id] = assertStorageNamespaceAndId(namespaceValue, idValue)
        const key = storageRecordKey(namespace, id)
        await writeOrFallback(
          async () => raw.engineRecords.delete(key),
          () => { memoryRecords.delete(key) },
        )
      },
      async compareAndRemove(namespaceValue, idValue, expectedRevision) {
        const [namespace, id] = assertStorageNamespaceAndId(namespaceValue, idValue)
        const key = storageRecordKey(namespace, id)
        if (state.mode === 'indexeddb') {
          try {
            return await raw.transaction('rw', raw.engineRecords, async () => {
              if (!matchesStorageExpectedRevision(
                await raw.engineRecords.get(key),
                expectedRevision,
              )) return false
              await raw.engineRecords.delete(key)
              return true
            })
          } catch (error) {
            degrade(error)
            throw new Error('persistence-unavailable')
          }
        }
        return withMemoryMutation(() => {
          if (!matchesStorageExpectedRevision(memoryRecords.get(key), expectedRevision)) return false
          memoryRecords.delete(key)
          return true
        })
      },
    },
    binary: {
      async put(record) {
        const [namespace, objectKey] = assertStorageNamespaceAndId(record.namespace, record.objectKey)
        const contentHash = normalizeStorageValue(record.contentHash)
        const bytes = new Uint8Array(record.bytes)
        if (!contentHash) throw new Error('Persisted binary contentHash is required.')
        if (bytes.byteLength > AGENTICGRAPH_STORAGE_ENGINE_MAX_BYTES) {
          throw new Error('Persisted binary exceeds the 10 MiB storage-engine limit.')
        }
        const key = storageBinaryKey(namespace, objectKey)
        const chunks: StoredBinaryChunk[] = []
        for (let offset = 0, chunkIndex = 0; offset < bytes.byteLength; chunkIndex += 1) {
          const chunk = bytes.subarray(offset, offset + AGENTICGRAPH_STORAGE_ENGINE_BINARY_CHUNK_BYTES)
          chunks.push({
            key: storageBinaryChunkKey(key, chunkIndex),
            manifestKey: key,
            chunkIndex,
            bytes: toArrayBuffer(chunk),
          })
          offset += chunk.byteLength
        }
        const manifest: StoredBinaryManifest = {
          key,
          namespace,
          objectKey,
          contentHash,
          byteLength: bytes.byteLength,
          chunkCount: chunks.length,
          updatedAtMs: Date.now(),
        }
        const memoryRecord: AgenticGraphStorageEngineBinaryRecord = {
          namespace,
          objectKey,
          contentHash,
          byteLength: bytes.byteLength,
          bytes: new Uint8Array(bytes),
        }
        await writeOrFallback(
          async () => raw.transaction('rw', raw.binaryManifests, raw.binaryChunks, async () => {
            await raw.binaryChunks.where('manifestKey').equals(key).delete()
            if (chunks.length > 0) await raw.binaryChunks.bulkPut(chunks)
            await raw.binaryManifests.put(manifest)
          }),
          () => { memoryBinary.set(key, memoryRecord) },
        )
      },
      async get(namespaceValue, objectKeyValue) {
        const [namespace, objectKey] = assertStorageNamespaceAndId(namespaceValue, objectKeyValue)
        const key = storageBinaryKey(namespace, objectKey)
        return readOrFallback(
          async () => readBinaryFromManifest(await raw.binaryManifests.get(key)),
          () => {
            const record = memoryBinary.get(key)
            return record ? { ...record, bytes: new Uint8Array(record.bytes) } : null
          },
        )
      },
      async findByContentHash(namespaceValue, contentHashValue) {
        const namespace = normalizeStorageValue(namespaceValue)
        const contentHash = normalizeStorageValue(contentHashValue)
        if (!namespace || !contentHash) throw new Error('Binary namespace and contentHash are required.')
        return readOrFallback(
          async () => {
            const manifests = await raw.binaryManifests.where('contentHash').equals(contentHash).toArray()
            const manifest = manifests.find(entry => entry.namespace === namespace)
            return readBinaryFromManifest(manifest)
          },
          () => {
            const record = Array.from(memoryBinary.values())
              .find(entry => entry.namespace === namespace && entry.contentHash === contentHash)
            return record ? { ...record, bytes: new Uint8Array(record.bytes) } : null
          },
        )
      },
      async remove(namespaceValue, objectKeyValue) {
        const [namespace, objectKey] = assertStorageNamespaceAndId(namespaceValue, objectKeyValue)
        const key = storageBinaryKey(namespace, objectKey)
        await writeOrFallback(
          async () => removeBinaryIndexed(key),
          () => { memoryBinary.delete(key) },
        )
      },
    },
    outbox: outboxPersistence,
    persistence: {
      getState() {
        return { ...state }
      },
    },
    async close() {
      raw.close()
    },
    async remove() {
      memoryRecords.clear()
      memoryOutbox.clear()
      memoryBinary.clear()
      raw.close()
      await raw.delete()
    },
  }
}

let singleton: Promise<AgenticGraphStorageEnginePersistence> | null = null

export const getAgenticGraphStorageEnginePersistence = async (): Promise<AgenticGraphStorageEnginePersistence> => {
  if (!singleton) {
    singleton = createAgenticGraphStorageEnginePersistence({
      forceMemory: typeof indexedDB === 'undefined',
    }).catch(error => {
      singleton = null
      throw error
    })
  }
  return singleton
}

export const resetAgenticGraphStorageEnginePersistenceForTests = async (): Promise<void> => {
  const current = singleton
  singleton = null
  if (!current) return
  const persistence = await current.catch(() => null)
  await persistence?.remove()
}
