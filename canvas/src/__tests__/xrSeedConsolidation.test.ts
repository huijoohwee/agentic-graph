import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { syncWorkspaceDocsMirrorEntries } from '@/features/workspace-fs/workspaceFsPersistedReconciliation'
import { readCanonicalWorkspaceSeedBundleEntries } from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import { RETIRED_XR_WORKSPACE_SEED_PATHS, preserveRetiredXrSeed } from '@/features/workspace-fs/workspaceXrSeedMigration'
import { WORKSPACE_RUN_READY_DEMO_SEEDS, resolveWorkspaceRunReadyDemoSeed, XR_V2_DEMO_REPO_REL_PATH } from '@/features/workspace-fs/workspaceRunReadyDemos'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

export async function testXrSeedConsolidationPreservesAuthoredBytes() {
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  const oldText = '---\nrun_ready_demo:\n  id: xr-physics\n---\n# My edited scene\n'
  const retired: WorkspaceEntry = { path: RETIRED_XR_WORKSPACE_SEED_PATHS[0], parentPath: '/docs/workspace-seeds', name: 'agentic-graph-physics-playground-demo.md', kind: 'file', text: oldText, updatedAtMs: 1 }
  const legacy: WorkspaceEntry = { ...retired, path: RETIRED_XR_WORKSPACE_SEED_PATHS[1], name: 'knowgrph-physics-playground-demo.md', text: oldText + '# Preserved legacy edits\n' }
  const imported: WorkspaceEntry = { ...retired, path: '/imports/my-scene.md', parentPath: '/imports', name: 'my-scene.md' }
  const canonicalPath = `/${XR_V2_DEMO_REPO_REL_PATH}`
  const bundle = (await readCanonicalWorkspaceSeedBundleEntries()).map(entry => ({ ...entry, authority: 'agentic-graph-workspace-seeds-bundled' as const }))
  const db = createPersistedCollectionDb<{ entries: WorkspaceEntry }>({ storageKey: `xr-migration-${Date.now()}`, collectionNames: ['entries'], persistent: false, recordKeyByCollection: { entries: entry => entry.path } })
  try {
    assert.equal(WORKSPACE_RUN_READY_DEMO_SEEDS.filter(seed => seed.id.startsWith('xr-')).length, 1)
    assert.equal(resolveWorkspaceRunReadyDemoSeed('xr-physics'), resolveWorkspaceRunReadyDemoSeed('xr-v2'))
    assert.equal(fs.existsSync(path.resolve(process.cwd(), '..', RETIRED_XR_WORKSPACE_SEED_PATHS[0].slice(1))), false)
    await db.collections.entries.incrementalUpsert(retired)
    await db.collections.entries.incrementalUpsert(imported)
    await db.collections.entries.incrementalUpsert(legacy)
    // An incomplete replacement must never retire source bytes.
    await syncWorkspaceDocsMirrorEntries(db.collections, bundle.slice(0, 1))
    assert.ok(await db.collections.entries.findOne(retired.path).exec())
    await syncWorkspaceDocsMirrorEntries(db.collections, bundle)
    assert.equal(await db.collections.entries.findOne(retired.path).exec(), null)
    assert.equal(await db.collections.entries.findOne(legacy.path).exec(), null)
    assert.ok(await db.collections.entries.findOne(canonicalPath).exec())
    const entries = (await db.collections.entries.find().exec()).map(row => row.toJSON())
    const saved = entries.filter(entry => entry.path.startsWith('/notes/Recovered Playground') && entry.text === oldText)
    assert.equal(saved.length, 1)
    assert.equal(entries.filter(entry => entry.path.startsWith('/notes/Recovered Playground') && entry.text === legacy.text).length, 1)
    assert.equal((await db.collections.entries.findOne(imported.path).exec())?.get('text'), oldText)
    await syncWorkspaceDocsMirrorEntries(db.collections, bundle)
    assert.equal((await db.collections.entries.find().exec()).filter(row => row.get('path') === saved[0].path).length, 1)
    // A colliding recovery filename cannot overwrite unrelated user content.
    const first = preserveRetiredXrSeed(oldText, new Map())!
    const collision = preserveRetiredXrSeed(oldText, new Map([[first.path, { ...first, text: 'keep me' }]]))!
    assert.notEqual(collision.path, first.path)
    const memory = createMemoryWorkspaceFs({ initialEntries: [retired, legacy, imported] })
    await memory.ensureSeed()
    const memoryEntries = await memory.listEntries()
    assert.equal(memoryEntries.some(entry => RETIRED_XR_WORKSPACE_SEED_PATHS.includes(entry.path)), false)
    assert.equal(memoryEntries.filter(entry => entry.path.startsWith('/notes/Recovered Playground') && entry.text === legacy.text).length, 1)
    assert.equal(memoryEntries.filter(entry => entry.path.startsWith('/notes/Recovered Playground') && entry.text === oldText).length, 1)
    assert.equal(memoryEntries.find(entry => entry.path === imported.path)?.text, oldText)
  } finally {
    await db.db.close()
    restore()
  }
}
