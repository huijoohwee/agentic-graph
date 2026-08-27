import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  readCanonicalWorkspaceSeedMirrorEntries,
  type WorkspaceDocsMirrorEntry,
} from '@/features/workspace-fs/workspaceSeedProvider'
import {
  CANONICAL_WORKSPACE_SEED_BASENAMES,
  readCanonicalWorkspaceSeedBundleEntries,
} from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import {
  resetWorkspaceDocsMirrorSyncForPersistedFs,
  syncWorkspaceDocsMirrorEntries,
} from '@/features/workspace-fs/workspaceFsPersistedReconciliation'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

const REPO_LOCAL_ENV = 'VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL'
const DOCS_ROOT_ENV = 'VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT'
const SEEDS_READ_ROOT_ENV = 'VITE_AGENTICGRAPH_WORKSPACE_SEEDS_READ_ABS_ROOT'
const XR_SEED_BASENAME = 'agenticgraph-ar-vr-xr-runtime-readiness-demo.md'
const XR_SEED_PATH = `/docs/workspace-seeds/${XR_SEED_BASENAME}`

const restoreEnv = (name: string, value: string | undefined): void => {
  if (typeof value === 'string') process.env[name] = value
  else delete process.env[name]
}

const readSortedBasenames = (entries: ReadonlyArray<WorkspaceDocsMirrorEntry>): string[] => (
  entries.map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
    .sort((left, right) => left.localeCompare(right))
)

const assertExactCanonicalInventory = (
  entries: ReadonlyArray<WorkspaceDocsMirrorEntry>,
  label: string,
): void => {
  const expected = [...CANONICAL_WORKSPACE_SEED_BASENAMES]
    .sort((left, right) => left.localeCompare(right))
  const actual = readSortedBasenames(entries)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected exact canonical inventory ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

export async function testRepoLocalBrowserBootstrapRefreshesLiveCanonicalSeedInventory() {
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_READ_ROOT_ENV]
  const previousFetch = globalThis.fetch
  const previousDateNow = Date.now
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  const seedsRoot = `/repo-local/docs/workspace-seeds-${previousDateNow()}`
  let now = 1710000010000
  let listCalls = 0
  try {
    process.env[REPO_LOCAL_ENV] = '1'
    process.env[DOCS_ROOT_ENV] = '/repo-local/docs'
    process.env[SEEDS_READ_ROOT_ENV] = seedsRoot
    Date.now = () => now
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (rawUrl !== '/__kg_fs_list') return new Response('', { status: 404 })
      const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
      if (String(body.path || '') !== seedsRoot) return Response.json({ ok: true, files: [] })
      listCalls += 1
      const basenames = CANONICAL_WORKSPACE_SEED_BASENAMES.filter(basename => (
        listCalls !== 1 || basename !== XR_SEED_BASENAME
      ))
      return Response.json({
        ok: true,
        files: basenames.map((basename, index) => ({
          relPath: basename,
          text: listCalls === 2 && basename === XR_SEED_BASENAME
            ? '   '
            : `# live-${listCalls} ${basename}\n`,
          updatedAtMs: now + index,
        })),
      })
    }) as typeof fetch

    const partial = await readCanonicalWorkspaceSeedMirrorEntries()
    assertExactCanonicalInventory(partial, 'partial live read')
    const partialXr = partial.find(entry => entry.relPath.endsWith(`/${XR_SEED_BASENAME}`))
    const partialReadme = partial.find(entry => entry.relPath.endsWith('/README.md'))
    if (partialXr?.authority !== 'agenticgraph-workspace-seeds-bundled' || !partialXr.text.trim()) {
      throw new Error(`expected missing live XR seed to fall back to bundled bytes, got ${JSON.stringify(partialXr)}`)
    }
    if (partialReadme?.authority !== 'agenticgraph-workspace-seeds-local' || !partialReadme.text.includes('live-1')) {
      throw new Error(`expected safe live files to overlay the complete bundle, got ${JSON.stringify(partialReadme)}`)
    }

    now += 1001
    const unreadable = await readCanonicalWorkspaceSeedMirrorEntries()
    assertExactCanonicalInventory(unreadable, 'unreadable XR live read')
    const unreadableXr = unreadable.find(entry => entry.relPath.endsWith(`/${XR_SEED_BASENAME}`))
    if (unreadableXr?.authority !== 'agenticgraph-workspace-seeds-bundled' || !unreadableXr.text.trim()) {
      throw new Error(`expected unreadable live XR seed to fall back to bundled bytes, got ${JSON.stringify(unreadableXr)}`)
    }

    now += 1001
    const complete = await readCanonicalWorkspaceSeedMirrorEntries()
    assertExactCanonicalInventory(complete, 'complete live refresh')
    if (complete.some(entry => entry.authority !== 'agenticgraph-workspace-seeds-local')) {
      throw new Error(`expected a complete valid refresh to use local authority, got ${JSON.stringify(complete)}`)
    }
    if (!complete.find(entry => entry.relPath.endsWith(`/${XR_SEED_BASENAME}`))?.text.includes('live-3')) {
      throw new Error('expected the complete refresh to adopt the readable live XR seed')
    }
    if (listCalls !== 3) throw new Error(`expected one live request per refresh window, got ${listCalls}`)
  } finally {
    Date.now = previousDateNow
    globalThis.fetch = previousFetch
    restore()
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_READ_ROOT_ENV, previousSeedsRoot)
  }
}

export async function testPartialCanonicalAuthorityCannotMutateOrDeleteSeeds() {
  const storage = new MemoryStorage()
  const { restore } = initWindowHarness({ storage })
  const userSeedPath = '/docs/workspace-seeds/user-owned-demo.md'
  const previousSourceIndex = loadWorkspaceSourceIndex()
  const previousXrSource = previousSourceIndex[XR_SEED_PATH] || null
  const previousUserSource = previousSourceIndex[userSeedPath] || null
  const db = createPersistedCollectionDb<{ entries: WorkspaceEntry }>({
    storageKey: `workspace-seed-completeness-${Date.now()}`,
    collectionNames: ['entries'],
    persistent: false,
    recordKeyByCollection: { entries: entry => entry.path },
  })
  try {
    const initialEntries: WorkspaceEntry[] = [
      { path: '/', parentPath: '', kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      { path: '/docs/workspace-seeds', parentPath: '/docs', kind: 'folder', name: 'workspace-seeds', updatedAtMs: 1 },
      { path: XR_SEED_PATH, parentPath: '/docs/workspace-seeds', kind: 'file', name: XR_SEED_BASENAME, text: '# preserved XR\n', updatedAtMs: 1 },
      { path: userSeedPath, parentPath: '/docs/workspace-seeds', kind: 'file', name: 'user-owned-demo.md', text: '# user owned\n', updatedAtMs: 1 },
    ]
    for (const entry of initialEntries) await db.collections.entries.incrementalUpsert(entry)
    setWorkspaceEntrySource(XR_SEED_PATH, { kind: 'local', originalName: XR_SEED_BASENAME }, { persist: 'sync' })
    setWorkspaceEntrySource(userSeedPath, { kind: 'local', originalName: 'user-owned-demo.md' }, { persist: 'sync' })

    const bundle = await readCanonicalWorkspaceSeedBundleEntries()
    const local = bundle.map((entry): WorkspaceDocsMirrorEntry => ({
      ...entry,
      authority: 'agenticgraph-workspace-seeds-local',
    }))
    const partial = local.filter(entry => !entry.relPath.endsWith(`/${XR_SEED_BASENAME}`))
    resetWorkspaceDocsMirrorSyncForPersistedFs()
    await syncWorkspaceDocsMirrorEntries(db.collections, partial, { scope: 'canonical-workspace-seeds' })
    if (await db.collections.entries.findOne(XR_SEED_PATH).exec().then(row => row?.get('text')) !== '# preserved XR\n') {
      throw new Error('expected a partial canonical inventory not to delete or replace the existing XR seed')
    }

    const unreadable = local.map(entry => entry.relPath.endsWith(`/${XR_SEED_BASENAME}`)
      ? { ...entry, text: '   ' }
      : entry)
    await syncWorkspaceDocsMirrorEntries(db.collections, unreadable, { scope: 'canonical-workspace-seeds' })
    if (await db.collections.entries.findOne(XR_SEED_PATH).exec().then(row => row?.get('text')) !== '# preserved XR\n') {
      throw new Error('expected an unreadable XR entry not to replace the existing canonical seed')
    }

    await syncWorkspaceDocsMirrorEntries(db.collections, [
      ...local,
      {
        relPath: 'workspace-seeds/user-owned-demo.md',
        text: '# authority must not overwrite user content\n',
        updatedAtMs: 2,
        authority: 'agenticgraph-workspace-seeds-local',
      },
    ], { scope: 'canonical-workspace-seeds' })
    const xrText = await db.collections.entries.findOne(XR_SEED_PATH).exec().then(row => row?.get('text'))
    const userText = await db.collections.entries.findOne(userSeedPath).exec().then(row => row?.get('text'))
    if (xrText !== bundle.find(entry => entry.relPath.endsWith(`/${XR_SEED_BASENAME}`))?.text) {
      throw new Error('expected an exact canonical inventory to reconcile the XR seed')
    }
    if (userText !== '# user owned\n' || loadWorkspaceSourceIndex()[userSeedPath]?.kind !== 'local') {
      throw new Error('expected exact canonical reconciliation to preserve noncanonical user seed files and ownership')
    }
    if (loadWorkspaceSourceIndex()[XR_SEED_PATH]) {
      throw new Error('expected exact canonical reconciliation to clear canonical XR source ownership')
    }
  } finally {
    setWorkspaceEntrySource(XR_SEED_PATH, previousXrSource, { persist: 'sync' })
    setWorkspaceEntrySource(userSeedPath, previousUserSource, { persist: 'sync' })
    await db.db.close()
    restore()
  }
}
