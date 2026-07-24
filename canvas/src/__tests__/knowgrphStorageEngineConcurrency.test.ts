import assert from 'node:assert/strict'
import test from 'node:test'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import {
  FileSyncEngine,
  FileSyncOutbox,
  FileSyncProviderRegistry,
  createPersistedCacheProvider,
  type FileSyncEntry,
  type FileSyncProvider,
} from '../lib/storage/file-sync'
import { createKnowgrphGitEngine } from '../lib/storage/git/knowgrphGitEngine'
import {
  createKnowgrphFileSyncBinaryStore,
  createKnowgrphFileSyncCollection,
  createKnowgrphFileSyncHashComputer,
  createKnowgrphFileSyncLedgerStore,
  createKnowgrphFileSyncOutboxStore,
  createKnowgrphGitPersistedCache,
} from '../lib/storage/knowgrphStorageEngineAdapters'
import { createKnowgrphStorageEnginePersistence } from '../lib/storage/knowgrphStorageEnginePersistence'
import {
  buildGitRemoteFixture,
  copyGitTestValue,
  createGitTestAuthority,
  gitTestRelay,
} from './support/knowgrphGitEngineTestSupport'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

let databaseSequence = 0
const nextDatabaseName = (): string => `kg:storage-concurrency:${databaseSequence++}`

class CountingFileProvider implements FileSyncProvider {
  readonly providerId = 'memory-remote'
  readonly target = 'external-file-storage' as const
  readonly entries = new Map<string, FileSyncEntry>()
  writeCalls = 0

  async list() {
    return {
      entries: [...this.entries.values()],
      nextCursor: null,
      snapshotVersion: 'counting:v1',
      complete: true,
    }
  }

  async stat(key: string) {
    return this.entries.get(key) ?? null
  }

  async read(): Promise<never> {
    throw new Error('unexpected remote read')
  }

  async write(request: { entry: FileSyncEntry; bytes: Uint8Array | null }) {
    this.writeCalls += 1
    const written = {
      ...request.entry,
      revision: `remote:${this.writeCalls}`,
    }
    this.entries.set(written.key, written)
    return written
  }

  async delete(key: string) {
    this.entries.delete(key)
  }
}

export async function testStorageEngineGitCrossInstanceClaim() {
  const databaseName = nextDatabaseName()
  const firstPersistence = await createKnowgrphStorageEnginePersistence({ databaseName })
  const secondPersistence = await createKnowgrphStorageEnginePersistence({ databaseName })
  let fetchCalls = 0
  const fixture = await buildGitRemoteFixture('repo', 'alpha')
  const dependencies = (persistence: Awaited<ReturnType<typeof createKnowgrphStorageEnginePersistence>>) => ({
    cache: createKnowgrphGitPersistedCache(persistence),
    authority: createGitTestAuthority(),
    relay: gitTestRelay(async () => {
      fetchCalls += 1
      return copyGitTestValue(fixture)
    }),
    deviceId: 'device',
  })
  try {
    const firstEngine = createKnowgrphGitEngine(dependencies(firstPersistence))
    const secondEngine = createKnowgrphGitEngine(dependencies(secondPersistence))
    assert.equal((await firstEngine.clone({
      workspaceId: 'workspace',
      repositoryId: 'repo',
      remoteId: 'origin',
      canonicalPathScope: 'knowgrph',
      refName: 'refs/heads/main',
    }, 'offline-only')).status, 'queued')
    const results = await Promise.all([
      firstEngine.drain('workspace'),
      secondEngine.drain('workspace'),
    ])
    assert.equal(results.flat().filter(result => result.status === 'complete').length, 1)
    assert.equal(fetchCalls, 1)
    assert.equal(
      (await firstPersistence.outbox.list('git-operation', 'workspace')).length,
      0,
    )
  } finally {
    await firstPersistence.close()
    await secondPersistence.remove()
  }
}
test('fresh Git adapters claim one persisted FIFO operation exactly once', testStorageEngineGitCrossInstanceClaim)

export async function testStorageEngineFileCrossInstanceClaim() {
  const databaseName = nextDatabaseName()
  const firstPersistence = await createKnowgrphStorageEnginePersistence({ databaseName })
  const secondPersistence = await createKnowgrphStorageEnginePersistence({ databaseName })
  const workspaceId = 'workspace'
  const collection = createKnowgrphFileSyncCollection(firstPersistence)
  const binaries = createKnowgrphFileSyncBinaryStore(firstPersistence)
  const cacheProvider = createPersistedCacheProvider({
    workspaceId,
    collection,
    binaries,
    hashComputer: createKnowgrphFileSyncHashComputer(),
  })
  const remote = new CountingFileProvider()
  const createEngine = (
    persistence: Awaited<ReturnType<typeof createKnowgrphStorageEnginePersistence>>,
    claimOwner: string,
  ) => {
    const providers = new FileSyncProviderRegistry()
    providers.register(remote)
    return new FileSyncEngine({
      workspaceId,
      cacheProvider,
      providers,
      ledger: createKnowgrphFileSyncLedgerStore(persistence),
      outbox: new FileSyncOutbox(
        createKnowgrphFileSyncOutboxStore(persistence, workspaceId),
        { claimOwner },
      ),
      runtime: () => 'dev',
      sleep: async () => undefined,
    })
  }
  try {
    await cacheProvider.write({
      entry: {
        key: 'docs/once.bin',
        kind: 'file',
        entryType: 'standard',
        sizeBytes: 1,
        hashes: [{ algorithm: 'source', value: '07' }],
        revision: null,
        modifiedAtMs: null,
      },
      bytes: new Uint8Array([7]),
      expectedRevision: null,
    }, new AbortController().signal)
    const firstEngine = createEngine(firstPersistence, 'first-engine')
    const secondEngine = createEngine(secondPersistence, 'second-engine')
    assert.equal(
      (await firstEngine.queueTransfer(remote.providerId, 'push', 'docs/once.bin')).status,
      'queued',
    )
    const results = await Promise.all([
      firstEngine.drainOutbox(),
      secondEngine.drainOutbox(),
    ])
    assert.equal(results.flat().filter(result => result.status === 'transferred').length, 1)
    assert.equal(remote.writeCalls, 1)
    assert.equal(
      (await firstPersistence.outbox.list('file-transfer', workspaceId)).length,
      0,
    )
  } finally {
    await firstPersistence.close()
    await secondPersistence.remove()
  }
}
test('fresh file-sync adapters claim one persisted transfer exactly once', testStorageEngineFileCrossInstanceClaim)

export async function testStorageEngineGitOutboxBeyondTenThousand() {
  const persistence = await createKnowgrphStorageEnginePersistence({ forceMemory: true })
  const cache = createKnowgrphGitPersistedCache(persistence)
  try {
    for (let index = 0; index < 10_001; index += 1) {
      const timestamp = index + 1
      const record = await cache.appendOutbox({
        id: `git:capacity:${index}`,
        workspaceId: 'workspace',
        deviceId: 'device',
        entity: 'gitOperation',
        kind: 'fetch',
        request: {
          kind: 'fetch',
          workspaceId: 'workspace',
          repositoryId: 'repo',
          remoteId: 'origin',
          canonicalPathScope: 'knowgrph',
          refName: 'refs/heads/main',
        },
        attemptCount: 0,
        lastStatus: 'queued',
        lastMessage: null,
        createdAtMs: timestamp,
        updatedAtMs: timestamp,
      })
      assert.equal(record.enqueuedSequence, timestamp)
    }
    const queued = await cache.listOutbox('workspace', 'device')
    assert.equal(queued.length, 10_001)
    assert.equal(queued.at(-1)?.enqueuedSequence, 10_001)
  } finally {
    await persistence.remove()
  }
}
test(
  'Git outbox exceeds 10,000 entries and keeps a durable monotonic sequence',
  testStorageEngineGitOutboxBeyondTenThousand,
)
