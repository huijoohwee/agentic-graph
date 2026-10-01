import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { planWebsiteCollectionConsolidation, consolidateWebsiteCollections, resolveWebsiteCollectionRoot } from '@/features/workspace-fs/websiteCollections'
import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { createWorkspaceFsDb, WORKSPACE_FS_LEGACY_KEY } from '@/features/workspace-fs/workspaceFsIndexedDb'
import { buildWorkspaceEntriesIndex } from '@/lib/markdown-workspace-runtime/workspaceEntriesIndex'
import { resolveMarkdownWorkspaceCanonicalSelection } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionCanonicalPath'
import { resolveMarkdownWorkspaceBootstrapActivePath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionBootstrap'
import { upsertShadowEntry, mergeEntriesWithShadow } from '@/features/workspace-fs/workspaceFsShadow'
import { withDurableBrowserStorage } from './helpers/durable-browser-storage'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { IndexedCollectionDexie } from '@/lib/storage/indexedDbCollectionSchema'

const first = '/websites/example.invalid/20260101T010101Z'
const second = '/websites/example.invalid/20260202T020202Z'
const folder = (path: string): WorkspaceEntry => ({ path, parentPath: path.slice(0, path.lastIndexOf('/')) || '/', name: path.split('/').at(-1)!, kind: 'folder', updatedAtMs: 1 })
const file = (path: string, text: string): WorkspaceEntry => ({ ...folder(path), kind: 'file', text })
const pageText = (url: string, capture: string) => `---\nkgWebpageUrl: "${url}"\nkgWebsiteImportId: "${capture}"\nkgWebsiteNodeId: "page"\n---\n# Exact body\n\nUnicode 保留 🧭\r\n`
const fixture = () => [
  folder('/'), folder('/websites'), folder('/websites/example.invalid'),
  folder(first), folder(`${first}/library`), folder(second), folder(`${second}/library`),
  file(`${first}/library/page.md`, pageText('https://example.invalid/library/page?a=1', 'first')),
  file(`${second}/library/page.md`, pageText('https://example.invalid/library/page?a=2', 'second')),
  file(`${first}/website.sitemap.md`, 'Earlier summary'),
  file(`${second}/website.sitemap.md`, '[Page](./library/page.md)'),
  file(`${second}/notes.md`, 'User notes must survive unchanged'),
  folder(`${second}/empty`),
]

test('one collection preserves every file and query variant, remaps summary links and is idempotent', () => {
  const entries = fixture(), original = JSON.stringify(entries)
  const plan = planWebsiteCollectionConsolidation(entries)
  assert.equal(plan.entries.filter(entry => entry.kind === 'file').length, entries.filter(entry => entry.kind === 'file').length)
  assert(!plan.entries.some(entry => entry.path.startsWith(second)))
  const migrated = plan.entries.find(entry => entry.previousPaths?.includes(`${second}/library/page.md`))!
  assert.equal(migrated.path, `${first}/library/page--20260202T020202Z.md`)
  assert.equal(migrated.text, entries.find(entry => entry.path === `${second}/library/page.md`)!.text)
  assert.equal(plan.entries.find(entry => entry.previousPaths?.includes(`${second}/notes.md`))?.text, 'User notes must survive unchanged')
  assert.equal(plan.entries.find(entry => entry.previousPaths?.includes(`${second}/website.sitemap.md`))?.text,
    '[Page](./library/page--20260202T020202Z.md)')
  assert(plan.entries.some(entry => entry.path === `${first}/empty`))
  assert.equal(planWebsiteCollectionConsolidation(plan.entries).moved.size, 0)
  assert.equal(JSON.stringify(entries), original, 'planning must not mutate original records')
  assert.equal(resolveWebsiteCollectionRoot(plan.entries, 'example.invalid', 'later'), first)
  assert.equal(resolveWebsiteCollectionRoot(plan.entries, 'other.invalid', 'later'), '/websites/other.invalid/later')
})

test('folder names alone do not authorize merging another website or ordinary files', () => {
  const entries = fixture().map(entry => entry.path.startsWith(second) && entry.text?.includes('kgWebpageUrl')
    ? { ...entry, text: entry.text.replaceAll('example.invalid', 'different.invalid') } : entry)
  assert.equal(planWebsiteCollectionConsolidation(entries).moved.size, 0)
})

test('open-file restoration and shadow caches follow committed path provenance', () => {
  const entries = fixture(), old = `${second}/library/page.md`
  const plan = planWebsiteCollectionConsolidation(entries), path = plan.moved.get(old)!
  const entriesIndex = buildWorkspaceEntriesIndex(plan.entries)
  assert.deepEqual(resolveMarkdownWorkspaceCanonicalSelection({ activePath: old, selectionPath: old, entriesIndex }), { activePath: path, selectionPath: path })
  assert.equal(resolveMarkdownWorkspaceBootstrapActivePath({ activePath: old, entriesIndex, lastSetActivePath: null, lastRequestedActivePath: null }), path)
  entries.forEach(upsertShadowEntry)
  assert(!mergeEntriesWithShadow(plan.entries).some(entry => entry.path.startsWith(second)), 'old cache rows must not resurrect folders')
})

test('conditional migration retries concurrent edits, and persistent conflicts retain all records', async () => {
  const db = createPersistedCollectionDb<{ entries: WorkspaceEntry }>({ storageKey: 'test', collectionNames: ['entries'], persistent: false, recordKeyByCollection: { entries: entry => entry.path } })
  await db.atomicWrite(fixture().map(record => ({ kind: 'upsert', collectionName: 'entries', record })))
  const commit = db.compareAndWrite.bind(db)
  let attempts = 0
  db.compareAndWrite = async (mutations, conditions) => {
    if (++attempts === 1) await db.collections.entries.incrementalUpsert(file(`${second}/notes.md`, 'Concurrent edit'))
    return commit(mutations, conditions)
  }
  await consolidateWebsiteCollections(db)
  assert.equal(attempts, 2)
  assert.equal((await db.collections.entries.findOne(`${first}/notes.md`).exec())?.get('text'), 'Concurrent edit')
  await db.atomicWrite(fixture().map(record => ({ kind: 'upsert', collectionName: 'entries', record })))
  const before = (await db.collections.entries.find().exec()).map(row => row.toJSON())
  db.compareAndWrite = async () => false
  await assert.rejects(consolidateWebsiteCollections(db), { name: 'WebsiteCollectionMigrationError' })
  assert.deepEqual((await db.collections.entries.find().exec()).map(row => row.toJSON()), before)
  await db.db.close()
})

test('two browser connections migrate once and retain the single collection through reload', async () => {
  await withDurableBrowserStorage(async () => {
    const storage = new MemoryStorage(), databaseName = `website-collections:${randomUUID()}`
    const { restore } = initWindowHarness({ storage })
    const original = JSON.stringify({ entries: Object.fromEntries(fixture().map(entry => [entry.path, entry])) })
    storage.setItem(WORKSPACE_FS_LEGACY_KEY, original)
    let connections: Awaited<ReturnType<typeof createWorkspaceFsDb>>[] = []
    try {
      connections = await Promise.all([createWorkspaceFsDb({ databaseName }), createWorkspaceFsDb({ databaseName })])
      const firstSnapshot = (await connections[0]!.collections.entries.find().exec()).map(row => row.toJSON())
      assert(!firstSnapshot.some(entry => entry.path.startsWith(second)))
      assert.equal(firstSnapshot.filter(entry => entry.kind === 'file').length, fixture().filter(entry => entry.kind === 'file').length)
      await Promise.all(connections.map(db => db.db.close()))
      connections = [await createWorkspaceFsDb({ databaseName })]
      assert.deepEqual((await connections[0]!.collections.entries.find().exec()).map(row => row.toJSON()), firstSnapshot)
      assert.equal(storage.getItem(WORKSPACE_FS_LEGACY_KEY), original, 'legacy backup remains untouched')
    } finally {
      await Promise.all(connections.map(db => db.db.close()))
      await new IndexedCollectionDexie(databaseName).delete()
      restore()
    }
  })
})
