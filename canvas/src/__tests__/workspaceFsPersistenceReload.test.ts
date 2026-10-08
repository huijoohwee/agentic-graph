import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { withDurableBrowserStorage } from './helpers/durable-browser-storage'
import { IndexedCollectionDexie } from '@/lib/storage/indexedDbCollectionSchema'
import { createIndexedDbCollectionDb } from '@/lib/storage/indexedDbCollectionStore'
import { createWorkspaceFsDb, WORKSPACE_FS_LEGACY_KEY } from '@/features/workspace-fs/workspaceFsIndexedDb'
import { createWorkspacePersistedFs } from '@/features/workspace-fs/workspaceFsPersisted'
import { WorkspaceSourceTextConflictError, type WorkspaceEntry } from '@/features/workspace-fs/types'
import { createResilientWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { LS_KEYS } from '@/lib/config'
import { resolveBrowserStorageKey } from '@/lib/persistence'
import { cancelWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import { importWorkspaceLocalFiles } from '@/features/markdown-workspace/workspaceImport/localImport'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource, type WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'
import { projectWorkspaceEntriesToSourceFilesExplorer } from '@/features/workspace-fs/workspaceSourceRoots'

const note = (path = '/notes/draft.md', text = '# Draft\n\n保留 🧭\r\n'): WorkspaceEntry => ({
  path, parentPath: '/notes', kind: 'file', name: path.split('/').at(-1)!, text, updatedAtMs: 7,
})
const fixture = async (run: (storage: MemoryStorage, databaseName: string) => Promise<void>) =>
  withDurableBrowserStorage(async () => {
    const storage = new MemoryStorage(), databaseName = `workspace-idb-test:${randomUUID()}`
    const { restore } = initWindowHarness({ storage })
    try { await run(storage, databaseName) } finally {
      const raw = new IndexedCollectionDexie(databaseName)
      await raw.delete()
      restore()
    }
  })

export async function testWorkspaceFileTextPersistsAcrossFsReinit() {
  await fixture(async (storage, databaseName) => {
    const old = note(), seed = note('/docs/workspace-seeds/offline.md', '# Source seed')
    const original = JSON.stringify({ entries: { [old.path]: old, [seed.path]: seed } })
    storage.setItem(WORKSPACE_FS_LEGACY_KEY, original)
    let db = await createWorkspaceFsDb({ databaseName, legacyRecordFilter: () => false })
    assert.equal(db.persistence.getState().mode, 'indexeddb')
    let fs = createWorkspacePersistedFs(() => Promise.resolve(db))
    assert.equal(await fs.readFileText(old.path), old.text, 'migration preserves Unicode and line endings')
    assert.equal(await fs.readFileText(seed.path), seed.text, 'browser caches source documents despite legacy snapshot filtering')
    const folder = await fs.createFolder({ parentPath: '/', name: 'local', mirrorToHost: false })
    const created = await fs.createFile({ parentPath: folder, name: 'offline.md', text: '', mirrorToHost: false })
    await fs.writeFileText(created, '# Offline edit\n\nSaved without a provider.', { mirrorToHost: false })
    await fs.writeFileText(old.path, '# Updated', { mirrorToHost: false })
    await db.db.close()
    db = await createWorkspaceFsDb({ databaseName })
    fs = createWorkspacePersistedFs(() => Promise.resolve(db))
    assert.equal(await fs.readFileText(created), '# Offline edit\n\nSaved without a provider.')
    assert.equal(await fs.readFileText(old.path), '# Updated')
    assert.ok((await fs.listEntries()).some(entry => entry.path === created))
    await fs.deleteEntry(old.path, { mirrorToHost: false })
    await db.db.close()
    db = await createWorkspaceFsDb({ databaseName })
    try {
      assert.equal(await createWorkspacePersistedFs(() => Promise.resolve(db)).readFileText(old.path), null,
        'a migrated legacy snapshot must not resurrect a deleted file')
      assert.equal(storage.getItem(WORKSPACE_FS_LEGACY_KEY), original, 'migration and edits retain the legacy backup unchanged')
    } finally { await db.db.close() }
  })
}

export async function testWorkspaceRootLocalImportSurvivesSeedRefreshAndReload() {
  await fixture(async (storage, databaseName) => {
    const name = 'agentic-graph-game-flight-sim-demo.md', path = `/${name}`
    const mirror = `/docs/workspace-seeds/${name}`
    const text = await readFile(new URL(`../../../docs/workspace-seeds/${name}`, import.meta.url), 'utf8')
    const metadataKey = resolveBrowserStorageKey(LS_KEYS.markdownWorkspaceSourcesByPath)
    const cancelMetadataWrite = () => cancelWorkspaceSyncTask(`ls:coalesced:json:${LS_KEYS.markdownWorkspaceSourcesByPath}`)
    const previousSource = loadWorkspaceSourceIndex()[path] || null
    const envKey = 'VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL', previousEnv = process.env[envKey]
    const previousFetch = globalThis.fetch
    let db = await createWorkspaceFsDb({ databaseName })
    process.env[envKey] = '1'
    globalThis.fetch = (async () => { throw new Error('Root import regression cannot access the network') }) as typeof fetch
    const freshIndex = async (): Promise<WorkspaceSourceIndex> => {
      // A new module models a reloaded tab; the existing importer keeps its stale cache.
      const module = await import(new URL(`../features/workspace-fs/sourceIndex.ts?reload=${randomUUID()}`, import.meta.url).href)
      return module.loadWorkspaceSourceIndex()
    }
    try {
      let fs = createWorkspacePersistedFs(() => Promise.resolve(db))
      await fs.ensureSeed()
      assert.equal(await fs.readFileText(mirror), text, 'Exercise a real equal-byte canonical seed collision')
      const result = await importWorkspaceLocalFiles({ fs, files: [new File([text], name, { type: 'text/markdown' })], parentPath: '/' })
      assert.deepEqual(result.failed, [])
      assert.ok(result.createdPaths.includes(path))
      const sources = await freshIndex()
      assert.equal(sources[path]?.kind, 'local')
      assert.equal(sources[`workspace:${path}`], undefined, 'Provenance uses raw workspace paths')
      assert.equal(loadWorkspaceSourceIndex()[path]?.kind, 'local')
      cancelMetadataWrite()
      await fs.ensureSeed(); await fs.ensureSeed()
      assert.equal(await fs.readFileText(path), text)
      await db.db.close()
      db = await createWorkspaceFsDb({ databaseName })
      fs = createWorkspacePersistedFs(() => Promise.resolve(db))
      await fs.ensureSeed()
      const reloaded = await freshIndex(), entries = await fs.listEntries()
      assert.equal(await fs.readFileText(path), text, 'Root bytes survive IndexedDB reopen and seed refresh')
      const project = (index: WorkspaceSourceIndex, workspaceEntries = entries, existing = [] as ReturnType<typeof mergeWorkspaceEntriesIntoSourceFiles>) =>
        mergeWorkspaceEntriesIntoSourceFiles({ existing, workspaceEntries, sourcesByPath: index, workspaceDocsOnly: true, preserveExistingWorkspaceEntries: true })
      const files = project(reloaded), imported = files.find(file => file.source?.path === `workspace:${path}`)
      assert.ok(imported); assert.equal(imported.text, text)
      const retained = { ...imported, enabled: false }
      assert.equal(project(reloaded, entries.filter(entry => entry.path !== path), [retained]).find(file => file.id === retained.id), retained,
        'A partial refresh preserves an explicitly imported disabled source')
      assert.ok(projectWorkspaceEntriesToSourceFilesExplorer(entries, undefined, reloaded).some(entry => entry.path === path))
      const roots = entries.filter(entry => entry.path === path || entry.path === mirror)
      assert.equal(project({}, roots).some(file => file.source?.path === `workspace:${path}`), false)
      assert.equal(projectWorkspaceEntriesToSourceFilesExplorer(roots, undefined, {}).some(entry => entry.path === path), false)
      const persistedMetadata = storage.getItem(metadataKey)
      assert.ok(persistedMetadata)
      setWorkspaceEntrySource(path, null, { persist: 'sync' }); cancelMetadataWrite()
      for (const raw of [null, '{broken metadata', persistedMetadata]) {
        if (raw === null) storage.removeItem(metadataKey)
        else storage.setItem(metadataKey, raw)
        const current = await freshIndex()
        if (raw === persistedMetadata) assert.equal(current[path]?.kind, 'local')
        else assert.deepEqual(current, {}, 'Reload observes missing/corrupt metadata, not a warm cache')
        assert.equal(loadWorkspaceSourceIndex()[path], undefined, 'The original tab can retain a stale empty cache')
        await fs.ensureSeed()
        await db.db.close()
        db = await createWorkspaceFsDb({ databaseName })
        fs = createWorkspacePersistedFs(() => Promise.resolve(db))
        assert.equal(await fs.readFileText(path), text, 'Uncertain metadata never authorizes deleting root bytes')
      }
      storage.setItem(metadataKey, persistedMetadata)
    } finally {
      cancelMetadataWrite()
      setWorkspaceEntrySource(path, previousSource, { persist: 'sync' }); cancelMetadataWrite()
      await db.db.close()
      globalThis.fetch = previousFetch
      if (previousEnv === undefined) delete process.env[envKey]
      else process.env[envKey] = previousEnv
    }
  })
}

export async function testWorkspaceIndexedDbConcurrentMigrationAndStaleRows() {
  await fixture(async (storage, databaseName) => {
    const old = note()
    storage.setItem(WORKSPACE_FS_LEGACY_KEY, JSON.stringify({ entries: { [old.path]: old } }))
    const [first, second] = await Promise.all([createWorkspaceFsDb({ databaseName }), createWorkspaceFsDb({ databaseName })])
    try {
      assert.equal((await first.collections.entries.find().exec()).length, 1)
      const stale = (await first.collections.entries.findOne(old.path).exec())!
      const fresh = (await second.collections.entries.findOne(old.path).exec())!
      await fresh.incrementalPatch({ text: 'Another tab saved this' })
      await assert.rejects(stale.incrementalPatch({ text: 'Stale edit' }), /changed in another tab/)
      await assert.rejects(stale.remove(), /changed in another tab/)
      assert.equal((await first.collections.entries.findOne(old.path).exec())?.get('text'), 'Another tab saved this')
      assert.equal(stale.get('text'), old.text, 'rejected patches do not mutate their observed row')
      await assert.rejects(fresh.incrementalPatch({ path: '/different.md' }), /identity cannot change/)
      const firstFs = createWorkspacePersistedFs(() => Promise.resolve(first))
      const secondFs = createWorkspacePersistedFs(() => Promise.resolve(second))
      await Promise.all([firstFs.listEntries(), secondFs.listEntries()])
      const paths = await Promise.all([firstFs, secondFs].map((fs, index) => fs.createFile({
        parentPath: '/notes', name: 'same-name.md', text: `tab-${index}`, mirrorToHost: false,
      })))
      assert.equal(new Set(paths).size, 2, 'simultaneous creates must retain both files')
      assert.deepEqual(await Promise.all(paths.map(path => firstFs.readFileText(path))), ['tab-0', 'tab-1'])
      const exact = await Promise.allSettled([firstFs, secondFs].map((fs, index) => createResilientWorkspaceFs(fs).createFile({
        parentPath: '/notes', name: 'exact.md', text: `winner-${index}`, mirrorToHost: false, requireExactPath: true,
      })))
      assert.equal(exact.filter(result => result.status === 'fulfilled').length, 1, 'one exact-path writer wins across tabs')
      const loser = exact.find(result => result.status === 'rejected') as PromiseRejectedResult
      assert.match(loser.reason.message, /destination already exists/)
      assert.equal((await firstFs.listEntries()).filter(entry => entry.name.startsWith('exact')).length, 1, 'no fallback file or shadow copy')
      const winner = exact.findIndex(result => result.status === 'fulfilled')
      assert.equal(await secondFs.readFileText('/notes/exact.md'), `winner-${winner}`)
      const folders = await Promise.all([firstFs, secondFs].map(fs => fs.createFolder({
        parentPath: '/notes', name: 'same-folder', mirrorToHost: false,
      })))
      assert.equal(new Set(folders).size, 2, 'simultaneous folder creates receive distinct paths')
      const raw = new IndexedCollectionDexie(databaseName)
      try {
        await raw.open()
        assert.equal(await raw.records.where('collection').equals('migrations').count(), 1)
        assert.equal((await raw.records.get(`entries\u0000${old.path}`))?.value.path, old.path)
      } finally { raw.close() }
    } finally { await first.db.close(); await second.db.close() }
  })
}

export async function testWorkspaceConditionalSaveKeepsOneWinnerAcrossTabs() {
  await fixture(async (storage, databaseName) => {
    const old = note('/notes/two-tab.py', 'score = 1\n')
    storage.setItem(WORKSPACE_FS_LEGACY_KEY, JSON.stringify({ entries: { [old.path]: old } }))
    const first = await createWorkspaceFsDb({ databaseName })
    const second = await createWorkspaceFsDb({ databaseName })
    try {
      const tabs = [first, second].map(db => createResilientWorkspaceFs(createWorkspacePersistedFs(() => Promise.resolve(db))))
      assert.deepEqual(await Promise.all(tabs.map(fs => fs.readFileText(old.path))), [old.text, old.text])
      const results = await Promise.allSettled(tabs.map((fs, index) => fs.writeFileText(old.path, `score = ${index + 2}\n`, {
        expectedText: old.text, mirrorToHost: false,
      })))
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      const rejected = results.find(result => result.status === 'rejected')
      assert(rejected?.status === 'rejected' && rejected.reason instanceof WorkspaceSourceTextConflictError)
      const winner = results.findIndex(result => result.status === 'fulfilled')
      assert.equal(await tabs[0]!.readFileText(old.path), `score = ${winner + 2}\n`)
      await assert.rejects(tabs[1 - winner]!.writeFileText(old.path, 'score = 9\n', {
        expectedText: old.text, mirrorToHost: false,
      }), WorkspaceSourceTextConflictError)
      assert.equal(await tabs[0]!.readFileText(old.path), `score = ${winner + 2}\n`)
      await tabs[winner]!.writeFileText(old.path, `score = ${winner + 2}\n`, {
        expectedText: old.text, mirrorToHost: false,
      })
    } finally { await first.db.close(); await second.db.close() }
  })
}

export async function testWorkspaceIndexedDbMigrationPreservesExistingAndInvalidBytes() {
  await fixture(async (storage, databaseName) => {
    const old = note(), retained = { ...old, text: 'Already in IndexedDB' }
    const existing = await createIndexedDbCollectionDb<{ entries: WorkspaceEntry; migrations: { id: string } }>({
      databaseName, collectionNames: ['entries', 'migrations'], recordKeyByCollection: { entries: entry => entry.path },
    })
    await existing.collections.entries.incrementalUpsert(retained)
    await existing.db.close()
    for (const invalid of ['{broken', JSON.stringify({ entries: { bad: { ...old, text: 4 } } })]) {
      storage.setItem(WORKSPACE_FS_LEGACY_KEY, invalid)
      await assert.rejects(createWorkspaceFsDb({ databaseName }))
      assert.equal(storage.getItem(WORKSPACE_FS_LEGACY_KEY), invalid)
    }
    const restored = note('/notes/restored.md', 'Recovered legacy bytes')
    storage.setItem(WORKSPACE_FS_LEGACY_KEY, JSON.stringify({ entries: { old, restored } }))
    const db = await createWorkspaceFsDb({ databaseName })
    try {
      assert.equal((await db.collections.entries.findOne(old.path).exec())?.get('text'), retained.text)
      assert.equal((await db.collections.entries.findOne(restored.path).exec())?.get('text'), restored.text,
        'failed migration does not mark the legacy import complete')
    } finally { await db.db.close() }
  })
}

const rejectDurableTransactions = async (run: () => Promise<void>) => {
  const prototype = IndexedCollectionDexie.prototype
  const previous = Object.getOwnPropertyDescriptor(prototype, 'transaction')
  Object.defineProperty(prototype, 'transaction', { configurable: true, value() { throw new Error('QuotaExceededError: injected durable write failure') } })
  try { await run() } finally {
    if (previous) Object.defineProperty(prototype, 'transaction', previous)
    else Reflect.deleteProperty(prototype, 'transaction')
  }
}

export async function testWorkspaceIndexedDbWriteFailureAndMigrationRetry() {
  await fixture(async (storage, databaseName) => {
    const old = note(), original = JSON.stringify({ entries: { old } })
    storage.setItem(WORKSPACE_FS_LEGACY_KEY, original)
    await rejectDurableTransactions(async () => {
      await assert.rejects(createWorkspaceFsDb({ databaseName }), /QuotaExceededError/)
    })
    let db = await createWorkspaceFsDb({ databaseName })
    const row = (await db.collections.entries.findOne(old.path).exec())!
    await rejectDurableTransactions(async () => {
      await assert.rejects(row.incrementalPatch({ text: 'Must not be acknowledged as saved' }), /QuotaExceededError/)
      assert.equal(db.persistence.getState().status, 'degraded')
    })
    await db.db.close()
    db = await createWorkspaceFsDb({ databaseName })
    try {
      assert.equal((await db.collections.entries.findOne(old.path).exec())?.get('text'), old.text)
      assert.equal(storage.getItem(WORKSPACE_FS_LEGACY_KEY), original)
    } finally { await db.db.close() }
  })
}
