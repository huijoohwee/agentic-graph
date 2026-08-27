import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import {
  AGENTICGRAPH_STORAGE_ENGINE_BINARY_CHUNK_BYTES,
  createAgenticGraphStorageEnginePersistence,
} from '@/lib/storage/agenticgraphStorageEnginePersistence'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

let databaseSequence = 0

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const createPersistence = () => createAgenticGraphStorageEnginePersistence({
  databaseName: `kg:storage-engine-test:${databaseSequence++}`,
})

export async function testStorageEngineBinaryRoundTripUsesBoundedChunks() {
  const persistence = await createPersistence()
  const bytes = new Uint8Array(AGENTICGRAPH_STORAGE_ENGINE_BINARY_CHUNK_BYTES * 2 + 17)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251
  try {
    await persistence.binary.put({
      namespace: 'git:repo-1',
      objectKey: 'blob:abc',
      contentHash: 'sha1:abc',
      byteLength: bytes.byteLength,
      bytes,
    })
    const restored = await persistence.binary.get('git:repo-1', 'blob:abc')
    const reused = await persistence.binary.findByContentHash('git:repo-1', 'sha1:abc')
    assert(restored?.byteLength === bytes.byteLength, 'binary byte length did not round-trip')
    assert(restored?.bytes.every((value, index) => value === bytes[index]), 'binary bytes did not round-trip')
    assert(reused?.objectKey === 'blob:abc', 'content-hash lookup did not reuse the stored object')
    assert(persistence.persistence.getState().mode === 'indexeddb', 'binary storage must remain IndexedDB-backed')
  } finally {
    await persistence.remove()
  }
}

export async function testStorageEngineOutboxCapacityIsAtomic() {
  const persistence = await createPersistence()
  try {
    const accepted = await Promise.all(Array.from({ length: 20 }, (_value, index) =>
      persistence.outbox.enqueue({
        id: `transfer:${index}`,
        kind: 'file-transfer',
        workspaceId: 'kgws:canonical-docs',
        payload: { fileKey: `docs/${index}.md` },
        attemptCount: 0,
        lastErrorCode: null,
        createdAtMs: index,
        updatedAtMs: index,
      }, 7)))
    const queued = await persistence.outbox.list('file-transfer', 'kgws:canonical-docs')
    assert(accepted.filter(Boolean).length === 7, 'concurrent outbox admission exceeded its capacity')
    assert(queued.length === 7, 'outbox did not retain exactly the admitted entries')
    assert(
      queued.every((record, index) => record.id === `transfer:${index}`),
      'outbox ordering is not FIFO by creation time',
    )
  } finally {
    await persistence.remove()
  }
}

export async function testStorageEngineOutboxPartitionsGitAndFileSync() {
  const persistence = await createPersistence()
  const workspaceId = 'kgws:canonical-docs'
  try {
    await persistence.outbox.enqueue({
      id: 'git:1',
      kind: 'git-operation',
      workspaceId,
      payload: { operation: 'fetch' },
      attemptCount: 0,
      lastErrorCode: null,
      createdAtMs: 1,
      updatedAtMs: 1,
    })
    await persistence.outbox.enqueue({
      id: 'file:1',
      kind: 'file-transfer',
      workspaceId,
      payload: { direction: 'pull' },
      attemptCount: 0,
      lastErrorCode: null,
      createdAtMs: 2,
      updatedAtMs: 2,
    })
    const git = await persistence.outbox.list('git-operation', workspaceId)
    const files = await persistence.outbox.list('file-transfer', workspaceId)
    assert(git.length === 1 && git[0]?.id === 'git:1', 'git outbox partition leaked file transfers')
    assert(files.length === 1 && files[0]?.id === 'file:1', 'file outbox partition leaked git operations')
  } finally {
    await persistence.remove()
  }
}

export async function testStorageEngineRecordRevisionCompareAndSetIsAtomic() {
  const persistence = await createPersistence()
  try {
    const admitted = await Promise.all(Array.from({ length: 12 }, (_value, index) =>
      persistence.records.compareAndPut(
        'file-sync:entry:kgws:canonical-docs',
        'docs/shared.md',
        { revision: `rev:${index}`, text: String(index) },
        null,
      )))
    assert(admitted.filter(Boolean).length === 1, 'record compare-and-set admitted multiple absent revisions')
    const current = await persistence.records.get(
      'file-sync:entry:kgws:canonical-docs',
      'docs/shared.md',
    )
    const revision = String(current?.revision || '')
    assert(Boolean(revision), 'atomic record write did not persist a revision')
    assert(
      await persistence.records.compareAndRemove(
        'file-sync:entry:kgws:canonical-docs',
        'docs/shared.md',
        'stale-revision',
      ) === false,
      'atomic record removal accepted a stale revision',
    )
    assert(
      await persistence.records.compareAndRemove(
        'file-sync:entry:kgws:canonical-docs',
        'docs/shared.md',
        revision,
      ) === true,
      'atomic record removal rejected the current revision',
    )
  } finally {
    await persistence.remove()
  }
}

export async function testStorageEnginePersistenceRejectsCredentialFields() {
  const persistence = await createPersistence()
  try {
    await assertRejects(
      persistence.records.put('git:repo-1', 'remote', {
        remoteId: 'origin',
        accessToken: 'must-not-persist',
      }),
      'record store accepted an access token',
    )
    await assertRejects(
      persistence.outbox.enqueue({
        id: 'git:credential',
        kind: 'git-operation',
        workspaceId: 'kgws:canonical-docs',
        payload: { nested: { clientSecret: 'must-not-persist' } },
        attemptCount: 0,
        lastErrorCode: null,
        createdAtMs: 1,
        updatedAtMs: 1,
      }),
      'outbox accepted a client secret',
    )
    for (const field of ['token', 'sessionToken', 'bearerToken', 'sharedSecret']) {
      await assertRejects(
        persistence.records.put('git:repo-1', `credential:${field}`, {
          nested: { [field]: 'must-not-persist' },
        }),
        `record store accepted credential variant ${field}`,
      )
    }
  } finally {
    await persistence.remove()
  }
}

export async function testStorageEngineActiveMutationFailureDoesNotFallbackWrite() {
  const persistence = await createPersistence()
  const originalIndexedDb = Dexie.dependencies.indexedDB
  try {
    await persistence.close()
    Dexie.dependencies.indexedDB = undefined as never
    let message = ''
    try {
      await persistence.records.put('test', 'must-not-fallback', { value: 1 })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    assert(
      message === 'persistence-unavailable',
      'active IndexedDB mutation failure was not observable',
    )
    assert(
      persistence.persistence.getState().mode === 'memory'
        && persistence.persistence.getState().status === 'degraded',
      'failed IndexedDB mutation did not degrade persistence state',
    )
    assert(
      await persistence.records.get('test', 'must-not-fallback') === null,
      'failed IndexedDB mutation silently wrote to memory',
    )
    await persistence.records.put('test', 'memory-after-degrade', { value: 2 })
    assert(
      (await persistence.records.get('test', 'memory-after-degrade'))?.value === 2,
      'already-degraded persistence did not permit explicit memory mutation',
    )
  } finally {
    Dexie.dependencies.indexedDB = originalIndexedDb
    await persistence.remove()
  }
}

const assertRejects = async (promise: Promise<unknown>, message: string): Promise<void> => {
  let rejected = false
  try {
    await promise
  } catch {
    rejected = true
  }
  assert(rejected, message)
}
