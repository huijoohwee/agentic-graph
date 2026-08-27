import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import Dexie from 'dexie'
import {
  IDBKeyRange,
  IDBObjectStore as FakeIDBObjectStore,
  indexedDB as fakeIndexedDB,
} from 'fake-indexeddb'
import {
  buildStorageSyncWebMcpToolBuilders,
} from '@/features/agent-ready/storageSyncWebMcpTools'
import {
  buildKnowgrphAgentReadyToolContracts,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { STORAGE_SYNC_AGENT_READY_TOOL_IDS } from '@/features/agent-ready/storageSyncAgentReadyContract.mjs'
import {
  controlLocalFileSync,
  controlLocalGitRepository,
  inspectLocalFileSync,
  inspectLocalGitRepository,
} from '@/lib/storage/knowgrphStorageBrowserRuntime'
import { createKnowgrphGitPersistedCache } from '@/lib/storage/knowgrphStorageEngineAdapters'
import {
  getKnowgrphStorageEnginePersistence,
  resetKnowgrphStorageEnginePersistenceForTests,
} from '@/lib/storage/knowgrphStorageEnginePersistence'
import { __resetKnowgrphStorageDbForTests } from '@/lib/storage/knowgrphStorageDb'

const RELAY_ENV_KEYS = [
  'VITE_KNOWGRPH_STORAGE_BASE_URL',
  'VITE_KNOWGRPH_STORAGE_WORKSPACE_ID',
  'VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN',
] as const
const WORKSPACE_ID = 'kgws:browser-runtime'
const SESSION_SECRET = 'session-secret-must-never-be-inspected'
const BINARY_SECRET = 'binary-payload-must-never-be-inspected'

// Keep Dexie's deletion dependency available even when the runtime-visible
// IndexedDB global is intentionally absent to exercise degraded persistence.
Dexie.dependencies.indexedDB = fakeIndexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

type MutableRoot = typeof globalThis & {
  window?: Window & typeof globalThis
  indexedDB?: IDBFactory
  IDBKeyRange?: typeof globalThis.IDBKeyRange
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value))
  }
}

const snapshotEnv = (): Map<string, string | undefined> =>
  new Map(RELAY_ENV_KEYS.map(key => [key, process.env[key]]))

const configureRelayEnv = (): void => {
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'http://127.0.0.1:8787'
  process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = WORKSPACE_ID
  process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = SESSION_SECRET
}

const restoreEnv = (snapshot: Map<string, string | undefined>): void => {
  for (const key of RELAY_ENV_KEYS) {
    const value = snapshot.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

const resetStorage = async (): Promise<void> => {
  await __resetKnowgrphStorageDbForTests()
  await resetKnowgrphStorageEnginePersistenceForTests()
}

const assertInspectionRedacted = (value: unknown): void => {
  const serialized = JSON.stringify(value)
  assert.equal(serialized.includes(SESSION_SECRET), false, 'inspection leaked the relay session bearer')
  assert.equal(serialized.includes(BINARY_SECRET), false, 'inspection leaked persisted binary content')
  const visit = (current: unknown): void => {
    if (!current || typeof current !== 'object') return
    if (Array.isArray(current)) {
      current.forEach(visit)
      return
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      assert.equal(
        /^(?:authorization|password|credential|credentials|accessToken|refreshToken|clientSecret|privateKey|apiKey|bodyBase64|bytes)$/i.test(key),
        false,
        `inspection exposed forbidden field ${key}`,
      )
      visit(child)
    }
  }
  visit(value)
}

const withoutBrowserPersistence = async <Result>(
  callback: () => Promise<Result>,
): Promise<Result> => {
  const root = globalThis as MutableRoot
  const priorWindow = root.window
  const priorIndexedDb = root.indexedDB
  const priorKeyRange = root.IDBKeyRange
  try {
    delete root.window
    delete root.indexedDB
    delete root.IDBKeyRange
    await resetStorage()
    return await callback()
  } finally {
    await resetStorage()
    if (priorWindow === undefined) delete root.window
    else root.window = priorWindow
    if (priorIndexedDb === undefined) delete root.indexedDB
    else root.indexedDB = priorIndexedDb
    if (priorKeyRange === undefined) delete root.IDBKeyRange
    else root.IDBKeyRange = priorKeyRange
  }
}

export async function testKnowgrphStorageBrowserInspectionsRedactCredentialsAndBytes(): Promise<void> {
  const env = snapshotEnv()
  configureRelayEnv()
  try {
    await withoutBrowserPersistence(async () => {
      const persistence = await getKnowgrphStorageEnginePersistence()
      const gitCache = createKnowgrphGitPersistedCache(persistence)
      await gitCache.putRepository({
        id: `${WORKSPACE_ID}\0knowgrph-docs`,
        workspaceId: WORKSPACE_ID,
        repositoryId: 'knowgrph-docs',
        remoteId: 'origin',
        canonicalPathScope: 'knowgrph/docs',
        headRefName: 'refs/heads/main',
        objectFormat: 'sha1',
        updatedAtMs: 1,
      })
      await gitCache.putObjects([{
        id: `${WORKSPACE_ID}\0knowgrph-docs\0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
        workspaceId: WORKSPACE_ID,
        repositoryId: 'knowgrph-docs',
        objectId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        objectFormat: 'sha1',
        objectType: 'blob',
        bodyBase64: Buffer.from(BINARY_SECRET).toString('base64'),
        byteLength: BINARY_SECRET.length,
        updatedAtMs: 1,
      }])
      await gitCache.putRefs([{
        id: `${WORKSPACE_ID}\0knowgrph-docs\0refs/heads/main`,
        workspaceId: WORKSPACE_ID,
        repositoryId: 'knowgrph-docs',
        refName: 'refs/heads/main',
        targetKind: 'direct',
        target: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        remoteId: 'origin',
        updatedAtMs: 1,
      }])
      await persistence.records.put(`file-sync:entry:${WORKSPACE_ID}`, 'docs/private.bin', {
        workspaceId: WORKSPACE_ID,
        key: 'docs/private.bin',
        kind: 'file',
        entryType: 'standard',
        sizeBytes: BINARY_SECRET.length,
        hashes: [{ algorithm: 'sha256', value: 'opaque-hash' }],
        revision: 'local:1',
        modifiedAtMs: 1,
        binaryKey: 'private-binary',
      })
      await persistence.binary.put({
        namespace: 'file-sync:binary',
        objectKey: 'private-binary',
        contentHash: 'sha256:opaque-hash',
        byteLength: BINARY_SECRET.length,
        bytes: new TextEncoder().encode(BINARY_SECRET),
      })

      const gitInspection = await inspectLocalGitRepository()
      const fileInspection = await inspectLocalFileSync()
      assert.equal(gitInspection.schema, 'knowgrph-storage-git-inspection/v1')
      assert.equal(fileInspection.schema, 'knowgrph-storage-file-sync-inspection/v1')
      assert.equal((gitInspection.repositories as unknown[]).length, 1)
      assert.equal(fileInspection.cacheEntryCount, 1)
      assertInspectionRedacted(gitInspection)
      assertInspectionRedacted(fileInspection)
    })
  } finally {
    restoreEnv(env)
  }
}

export async function testKnowgrphStorageBrowserControlsRejectInvalidInputBeforeRuntime(): Promise<void> {
  const git = await controlLocalGitRepository({
    operation: 'push',
    remoteId: 'origin',
    canonicalPathScope: '../outside-authority',
    baseRef: 'refs/heads/main',
    accessToken: SESSION_SECRET,
  })
  const files = await controlLocalFileSync({
    direction: 'pull',
    providerId: 'google-drive',
    prefix: 'docs',
    credentials: SESSION_SECRET,
  })
  assert.deepEqual(git, {
    schema: 'knowgrph-storage-git-control/v1',
    ok: false,
    status: 'invalid-input',
  })
  assert.deepEqual(files, {
    schema: 'knowgrph-storage-file-sync-control/v1',
    ok: false,
    status: 'invalid-input',
  })
  assertInspectionRedacted([git, files])
}

export async function testKnowgrphStorageBrowserMutationsFailClosedWithoutIndexedDb(): Promise<void> {
  const env = snapshotEnv()
  const priorFetch = globalThis.fetch
  let networkCalls = 0
  configureRelayEnv()
  globalThis.fetch = (async () => {
    networkCalls += 1
    throw new Error('network must remain fenced')
  }) as typeof fetch
  try {
    await withoutBrowserPersistence(async () => {
      const git = await controlLocalGitRepository({
        operation: 'clone',
        remoteId: 'origin',
        canonicalPathScope: 'knowgrph/docs',
        baseRef: 'refs/heads/main',
      })
      const files = await controlLocalFileSync({
        direction: 'push',
        providerId: 'google-drive',
        prefix: 'docs',
      })
      assert.equal(git.status, 'persistence-unavailable')
      assert.equal(git.ok, false)
      assert.equal(files.status, 'persistence-unavailable')
      assert.equal(files.ok, false)
      assert.equal(networkCalls, 0)
    })
  } finally {
    globalThis.fetch = priorFetch
    restoreEnv(env)
  }
}

export async function testKnowgrphStorageBrowserMutationStopsWhenIndexedDbDegrades(): Promise<void> {
  const root = globalThis as MutableRoot
  const env = snapshotEnv()
  const priorNodeEnv = process.env.NODE_ENV
  const priorQuiet = process.env.KG_TEST_QUIET
  const priorWindow = root.window
  const priorIndexedDb = root.indexedDB
  const priorKeyRange = root.IDBKeyRange
  const priorFetch = globalThis.fetch
  const storage = new MemoryStorage()
  const objectStorePrototype = FakeIDBObjectStore.prototype
  const originalAdd = objectStorePrototype.add
  let networkCalls = 0
  configureRelayEnv()
  process.env.NODE_ENV = 'development'
  process.env.KG_TEST_QUIET = '0'
  storage.setItem('kg:sync:workspace:cloudEnabled', '1')
  root.window = {
    location: { hostname: '127.0.0.1' },
    localStorage: storage,
    dispatchEvent: () => true,
  } as unknown as Window & typeof globalThis
  root.indexedDB = fakeIndexedDB
  root.IDBKeyRange = IDBKeyRange
  Dexie.dependencies.indexedDB = fakeIndexedDB
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  globalThis.fetch = (async () => {
    networkCalls += 1
    throw new Error('degraded persistence must stop before relay transport')
  }) as typeof fetch
  objectStorePrototype.add = function (value, key) {
    if (this.name === 'engineOutbox') {
      throw new Error('forced IndexedDB outbox failure')
    }
    return originalAdd.call(this, value, key)
  }
  try {
    await resetStorage()
    const persistence = await getKnowgrphStorageEnginePersistence()
    assert.equal(persistence.persistence.getState().mode, 'indexeddb')
    const result = await controlLocalGitRepository({
      operation: 'clone',
      remoteId: 'origin',
      canonicalPathScope: 'knowgrph/docs',
      baseRef: 'refs/heads/main',
    })
    assert.deepEqual(result, {
      schema: 'knowgrph-storage-git-control/v1',
      ok: false,
      status: 'persistence-unavailable',
    })
    assert.deepEqual(persistence.persistence.getState(), {
      mode: 'memory',
      status: 'degraded',
      error: 'forced IndexedDB outbox failure',
    })
    assert.equal(networkCalls, 0)
  } finally {
    objectStorePrototype.add = originalAdd
    await resetStorage()
    globalThis.fetch = priorFetch
    if (priorWindow === undefined) delete root.window
    else root.window = priorWindow
    if (priorIndexedDb === undefined) delete root.indexedDB
    else root.indexedDB = priorIndexedDb
    if (priorKeyRange === undefined) delete root.IDBKeyRange
    else root.IDBKeyRange = priorKeyRange
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = priorNodeEnv
    if (priorQuiet === undefined) delete process.env.KG_TEST_QUIET
    else process.env.KG_TEST_QUIET = priorQuiet
    restoreEnv(env)
  }
}

export async function testKnowgrphStorageWebMcpBuildersExecuteBrowserBoundaries(): Promise<void> {
  await withoutBrowserPersistence(async () => {
    const contracts = buildKnowgrphAgentReadyToolContracts({
      includeBrowserOnlyTools: true,
    })
    const findContract = (name: string) => {
      const contract = contracts.find(candidate => candidate.name === name)
      assert.ok(contract, `missing agent-ready contract ${name}`)
      return contract
    }
    const builders = buildStorageSyncWebMcpToolBuilders(findContract)
    const gitInspect = builders[STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalGitRepository]()
    const fileInspect = builders[STORAGE_SYNC_AGENT_READY_TOOL_IDS.inspectLocalFileSync]()
    const gitControl = builders[STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalGitRepository]()
    const fileControl = builders[STORAGE_SYNC_AGENT_READY_TOOL_IDS.controlLocalFileSync]()
    assert.equal(gitInspect.name, 'knowgrph.inspect_local_git_repository')
    assert.equal(fileInspect.name, 'knowgrph.inspect_local_file_sync')
    assert.equal(
      (await gitInspect.execute({} as Record<string, unknown>) as Record<string, unknown>).schema,
      'knowgrph-storage-git-inspection/v1',
    )
    assert.equal(
      (await fileInspect.execute({} as Record<string, unknown>) as Record<string, unknown>).schema,
      'knowgrph-storage-file-sync-inspection/v1',
    )
    assert.equal(
      (await gitControl.execute({ operation: 'invalid' }) as Record<string, unknown>).status,
      'invalid-input',
    )
    assert.equal(
      (await fileControl.execute({ direction: 'invalid' }) as Record<string, unknown>).status,
      'invalid-input',
    )
  })
}

export async function testKnowgrphStorageBrowserOfflineControlsEnqueueWithoutNetwork(): Promise<void> {
  const root = globalThis as MutableRoot
  const env = snapshotEnv()
  const priorNodeEnv = process.env.NODE_ENV
  const priorQuiet = process.env.KG_TEST_QUIET
  const priorWindow = root.window
  const priorIndexedDb = root.indexedDB
  const priorKeyRange = root.IDBKeyRange
  const priorFetch = globalThis.fetch
  const storage = new MemoryStorage()
  let networkCalls = 0
  configureRelayEnv()
  process.env.NODE_ENV = 'development'
  process.env.KG_TEST_QUIET = '0'
  storage.setItem('kg:sync:workspace:cloudEnabled', '0')
  root.window = {
    location: { hostname: '127.0.0.1' },
    localStorage: storage,
    dispatchEvent: () => true,
  } as unknown as Window & typeof globalThis
  root.indexedDB = fakeIndexedDB
  root.IDBKeyRange = IDBKeyRange
  Dexie.dependencies.indexedDB = fakeIndexedDB
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  }
  globalThis.fetch = (async () => {
    networkCalls += 1
    throw new Error('offline controls must not reach the network')
  }) as typeof fetch
  try {
    await resetStorage()
    const persistence = await getKnowgrphStorageEnginePersistence()
    assert.deepEqual(persistence.persistence.getState(), {
      mode: 'indexeddb',
      status: 'active',
      error: null,
    })
    await persistence.records.put(`file-sync:entry:${WORKSPACE_ID}`, 'docs/readme.md', {
      workspaceId: WORKSPACE_ID,
      key: 'docs/readme.md',
      kind: 'file',
      entryType: 'standard',
      sizeBytes: 5,
      hashes: [{ algorithm: 'sha256', value: 'local-hash' }],
      revision: 'local:1',
      modifiedAtMs: 1,
      binaryKey: 'docs-readme',
    })

    const git = await controlLocalGitRepository({
      operation: 'clone',
      remoteId: 'origin',
      canonicalPathScope: 'knowgrph/docs',
      baseRef: 'refs/heads/main',
    })
    const files = await controlLocalFileSync({
      direction: 'push',
      providerId: 'google-drive',
      prefix: 'docs',
    })
    assert.equal(git.status, 'queued')
    assert.equal(git.mode, 'offline-only')
    assert.equal(files.status, 'queued')
    assert.equal(files.mode, 'offline-only')
    assert.equal(await persistence.outbox.count('git-operation', WORKSPACE_ID), 1)
    assert.equal(await persistence.outbox.count('file-transfer', WORKSPACE_ID), 1)
    assert.equal(networkCalls, 0)
  } finally {
    await resetStorage()
    globalThis.fetch = priorFetch
    if (priorWindow === undefined) delete root.window
    else root.window = priorWindow
    if (priorIndexedDb === undefined) delete root.indexedDB
    else root.indexedDB = priorIndexedDb
    if (priorKeyRange === undefined) delete root.IDBKeyRange
    else root.IDBKeyRange = priorKeyRange
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = priorNodeEnv
    if (priorQuiet === undefined) delete process.env.KG_TEST_QUIET
    else process.env.KG_TEST_QUIET = priorQuiet
    restoreEnv(env)
  }
}
