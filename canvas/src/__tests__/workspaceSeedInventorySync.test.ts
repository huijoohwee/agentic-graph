import fsPromises from 'node:fs/promises'
import path from 'node:path'
import fs from 'node:fs'

import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  readCanonicalWorkspaceSeedMirrorEntries,
  readWorkspaceInitializationDocsMirrorEntries,
  type WorkspaceDocsMirrorEntry,
} from '@/features/workspace-fs/workspaceSeedProvider'
import {
  resetWorkspaceDocsMirrorSyncForPersistedFs,
  syncWorkspaceDocsMirrorEntries,
} from '@/features/workspace-fs/workspaceFsPersistedReconciliation'
import { resetCanonicalPublishedDocsMirrorCacheForTests } from '@/features/workspace-fs/workspaceGithubDocsMirror'
import {
  CANONICAL_WORKSPACE_SEED_BASENAMES,
  readCanonicalWorkspaceSeedBundleEntries,
} from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import { resetWorkspaceSeedProviderStorageCacheForTests } from '@/features/workspace-fs/workspaceSeedProviderStorageCache'
import { loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import {
  testPartialCanonicalAuthorityCannotMutateOrDeleteSeeds,
  testRepoLocalBrowserBootstrapRefreshesLiveCanonicalSeedInventory,
} from './workspaceSeedCompletenessHardening.test'

export { testRepoLocalBrowserBootstrapRefreshesLiveCanonicalSeedInventory }

const REPO_LOCAL_ENV = 'VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL'
const DOCS_ROOT_ENV = 'VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT'
const SEEDS_READ_ROOT_ENV = 'VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT'
const AGENTIC_DOCS_ROOT_ENV = 'VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT'

const restoreEnv = (name: string, value: string | undefined): void => {
  if (typeof value === 'string') process.env[name] = value
  else delete process.env[name]
}

export async function testBundledWorkspaceSeedInventoryMatchesAuthoredSourceExactly() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const seedsRoot = path.join(repoRoot, 'docs', 'workspace-seeds')
  const expectedBasenames = (await fsPromises.readdir(seedsRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort()
  const entries = await readCanonicalWorkspaceSeedBundleEntries()
  const actualBasenames = entries
    .map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
    .sort()

  if (JSON.stringify(actualBasenames) !== JSON.stringify(expectedBasenames)
    || JSON.stringify(actualBasenames) !== JSON.stringify([...CANONICAL_WORKSPACE_SEED_BASENAMES].sort())) {
    throw new Error(`expected exact bundled seed inventory ${JSON.stringify(expectedBasenames)}, got ${JSON.stringify(actualBasenames)}`)
  }
  for (const entry of entries) {
    const basename = entry.relPath.replace(/^workspace-seeds\//, '')
    const authoredText = await fsPromises.readFile(path.join(seedsRoot, basename), 'utf8')
    if (entry.text !== authoredText) {
      throw new Error(`expected bundled ${basename} bytes to match the authored source`)
    }
  }
}

export function testBundledWorkspaceSeedInventoryUsesEagerRawGlobInBuilds(): void {
  const bundlePath = path.resolve(
    process.cwd(),
    'src',
    'features',
    'workspace-fs',
    'workspaceCanonicalSeedBundle.ts',
  )
  const text = fs.readFileSync(bundlePath, 'utf8')
  if (!text.includes("import.meta.glob('../../../../docs/workspace-seeds/*.md'")) {
    throw new Error('expected canonical workspace seed bundle to load the authored inventory through one raw glob')
  }
  if (!text.includes("query: '?raw'")) {
    throw new Error('expected canonical workspace seed bundle glob to request raw markdown bytes')
  }
  if (!text.includes('eager: true')) {
    throw new Error('expected canonical workspace seed bundle glob to stay eager for production builds')
  }
  if (text.includes('bundlePromise')) {
    throw new Error('expected canonical workspace seed reads not to retain a stale process-lifetime promise')
  }
}

export async function testProductionFallbackRestoresBundledWorkspaceSeedInventory() {
  const missingRoot = `/missing/workspace-seed-production-${Date.now()}`
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_READ_ROOT_ENV]
  const previousAgenticRoot = process.env[AGENTIC_DOCS_ROOT_ENV]
  const previousFetch = globalThis.fetch
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  try {
    delete process.env[REPO_LOCAL_ENV]
    process.env[DOCS_ROOT_ENV] = `${missingRoot}/docs`
    process.env[SEEDS_READ_ROOT_ENV] = `${missingRoot}/docs/workspace-seeds`
    process.env[AGENTIC_DOCS_ROOT_ENV] = `${missingRoot}/agentic-canvas-os/docs`
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    globalThis.fetch = (async () => new Response('', { status: 403 })) as typeof fetch

    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const seedEntries = mirrored
      .filter(entry => entry.relPath.startsWith('workspace-seeds/'))
      .sort((left, right) => left.relPath.localeCompare(right.relPath))
    const actualBasenames = seedEntries.map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
    const expectedBasenames = [...CANONICAL_WORKSPACE_SEED_BASENAMES]
      .sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(actualBasenames) !== JSON.stringify(expectedBasenames)) {
      throw new Error(`expected production fallback inventory ${JSON.stringify(expectedBasenames)}, got ${JSON.stringify(actualBasenames)}`)
    }
    if (seedEntries.some(entry => entry.authority !== 'agentic-graph-workspace-seeds-bundled')) {
      throw new Error(`expected revision-pinned bundle authority, got ${JSON.stringify(seedEntries)}`)
    }
    const memoryFs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
        { path: '/docs/workspace-seeds', parentPath: '/docs', kind: 'folder', name: 'workspace-seeds', updatedAtMs: 1 },
        {
          path: '/docs/workspace-seeds/stale-production-demo.md',
          parentPath: '/docs/workspace-seeds',
          kind: 'file',
          name: 'stale-production-demo.md',
          text: '# stale production seed\n',
          updatedAtMs: 1,
        },
        {
          path: '/notes/user-owned.md',
          parentPath: '/notes',
          kind: 'file',
          name: 'user-owned.md',
          text: '# user owned\n',
          updatedAtMs: 1,
        },
      ],
    })
    await memoryFs.ensureSeed()
    const memoryEntries = await memoryFs.listEntries()
    const memorySeedBasenames = memoryEntries
      .filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/workspace-seeds/'))
      .map(entry => entry.name)
      .filter(name => (CANONICAL_WORKSPACE_SEED_BASENAMES as readonly string[]).includes(name))
      .sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(memorySeedBasenames) !== JSON.stringify(expectedBasenames)) {
      throw new Error(`expected production memory fallback to restore exact bundled seed inventory, got ${JSON.stringify(memorySeedBasenames)}`)
    }
    if (!memoryEntries.some(entry => entry.path === '/notes/user-owned.md' && entry.kind === 'file')) {
      throw new Error('expected production memory fallback to preserve user-owned noncanonical files')
    }
    if (!memoryEntries.some(entry => entry.path === '/docs/workspace-seeds/stale-production-demo.md')) {
      throw new Error('expected canonical reconciliation to preserve noncanonical user seed files')
    }
  } finally {
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    globalThis.fetch = previousFetch
    restore()
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_READ_ROOT_ENV, previousSeedsRoot)
    restoreEnv(AGENTIC_DOCS_ROOT_ENV, previousAgenticRoot)
  }
}

export async function testRepoLocalProductionUsesBundledCanonicalWorkspaceSeedInventory() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const seedsRoot = path.join(repoRoot, 'docs', 'workspace-seeds')
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousSeedsRoot = process.env[SEEDS_READ_ROOT_ENV]
  const previousFetch = globalThis.fetch
  try {
    process.env[REPO_LOCAL_ENV] = '1'
    delete process.env[SEEDS_READ_ROOT_ENV]
    globalThis.fetch = (async () => {
      throw new Error('repo-local production seed projection must not depend on a runtime request')
    }) as typeof fetch

    const mirrored = await readCanonicalWorkspaceSeedMirrorEntries()
    const actualBasenames = mirrored
      .map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
      .sort((left, right) => left.localeCompare(right))
    const expectedBasenames = [...CANONICAL_WORKSPACE_SEED_BASENAMES]
      .sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(actualBasenames) !== JSON.stringify(expectedBasenames)) {
      throw new Error(`expected repo-local production inventory ${JSON.stringify(expectedBasenames)}, got ${JSON.stringify(actualBasenames)}`)
    }
    if (mirrored.some(entry => entry.authority !== 'agentic-graph-workspace-seeds-bundled')) {
      throw new Error(`expected revision-pinned bundled authority, got ${JSON.stringify(mirrored)}`)
    }
    for (const entry of mirrored) {
      const basename = entry.relPath.replace(/^workspace-seeds\//, '')
      const authoredText = await fsPromises.readFile(path.join(seedsRoot, basename), 'utf8')
      if (entry.text !== authoredText) {
        throw new Error(`expected repo-local production ${basename} bytes to match the authored source`)
      }
    }
  } finally {
    globalThis.fetch = previousFetch
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(SEEDS_READ_ROOT_ENV, previousSeedsRoot)
  }
}

export async function testWorkspaceSeedProviderProjectsCanonicalLocalInventoryExactly() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const docsRoot = path.join(repoRoot, 'docs')
  const seedsRoot = path.join(docsRoot, 'workspace-seeds')
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_READ_ROOT_ENV]
  const previousAgenticRoot = process.env[AGENTIC_DOCS_ROOT_ENV]
  const globals = globalThis as typeof globalThis & { window?: Window }
  const previousWindow = globals.window
  try {
    process.env[REPO_LOCAL_ENV] = '1'
    process.env[DOCS_ROOT_ENV] = docsRoot
    process.env[SEEDS_READ_ROOT_ENV] = seedsRoot
    process.env[AGENTIC_DOCS_ROOT_ENV] = path.join(repoRoot, '.missing-agentic-docs')
    delete globals.window

    const expected = (await fsPromises.readdir(seedsRoot, { withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .sort()
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const actual = mirrored
      .filter(entry => entry.authority === 'agentic-graph-workspace-seeds-local')
      .map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
      .sort()

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const projectedSeeds = mirrored.filter(entry => entry.relPath.startsWith('workspace-seeds/'))
      throw new Error(`expected Source Files seed inventory ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} from ${JSON.stringify(projectedSeeds)}`)
    }
  } finally {
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_READ_ROOT_ENV, previousSeedsRoot)
    restoreEnv(AGENTIC_DOCS_ROOT_ENV, previousAgenticRoot)
    if (previousWindow) globals.window = previousWindow
  }
  await testRepoLocalBrowserBootstrapRefreshesLiveCanonicalSeedInventory()
}

export const testRepoLocalBrowserBootstrapUsesBundledSeedInventoryWithoutMirrorProxy =
  testRepoLocalBrowserBootstrapRefreshesLiveCanonicalSeedInventory

export async function testRepoLocalPersistedBootstrapReconcilesCanonicalSeedInventory() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const docsRoot = path.join(repoRoot, 'docs')
  const seedsRoot = path.join(docsRoot, 'workspace-seeds')
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_READ_ROOT_ENV]
  const globals = globalThis as typeof globalThis & { window?: Window }
  const previousWindow = globals.window
  try {
    process.env[REPO_LOCAL_ENV] = '1'
    process.env[DOCS_ROOT_ENV] = docsRoot
    process.env[SEEDS_READ_ROOT_ENV] = seedsRoot
    delete globals.window

    const persistedModuleUrl = new URL(
      `../features/workspace-fs/workspaceFsPersisted.ts?canonical-seed-inventory=${Date.now()}`,
      import.meta.url,
    ).href
    const persistedModule = await import(persistedModuleUrl) as typeof import('@/features/workspace-fs/workspaceFsPersisted')
    const workspaceFs = persistedModule.createWorkspacePersistedFs()
    await workspaceFs.ensureSeed()

    const expected = (await fsPromises.readdir(seedsRoot, { withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => `/docs/workspace-seeds/${entry.name}`)
      .sort()
    const actual = (await workspaceFs.listEntries())
      .filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/workspace-seeds/'))
      .map(entry => entry.path)
      .sort()

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`expected repo-local persisted Source Files seed inventory ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
    const memoryFs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
        { path: '/docs/workspace-seeds', parentPath: '/docs', kind: 'folder', name: 'workspace-seeds', updatedAtMs: 1 },
        {
          path: '/docs/workspace-seeds/stale-demo.md',
          parentPath: '/docs/workspace-seeds',
          kind: 'file',
          name: 'stale-demo.md',
          text: '# stale\n',
          updatedAtMs: 1,
        },
        {
          path: '/docs/private-note.md',
          parentPath: '/docs',
          kind: 'file',
          name: 'private-note.md',
          text: '# private\n',
          updatedAtMs: 1,
        },
      ],
    })
    await memoryFs.ensureSeed()
    const memoryEntries = await memoryFs.listEntries()
    const memorySeedPaths = memoryEntries
      .filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/workspace-seeds/'))
      .map(entry => entry.path)
      .filter(seedPath => (CANONICAL_WORKSPACE_SEED_BASENAMES as readonly string[])
        .some(basename => seedPath === `/docs/workspace-seeds/${basename}`))
      .sort()
    if (JSON.stringify(memorySeedPaths) !== JSON.stringify(expected)) {
      throw new Error(`expected memory fallback to reconcile exact canonical seed inventory ${JSON.stringify(expected)}, got ${JSON.stringify(memorySeedPaths)}`)
    }
    if (!memoryEntries.some(entry => entry.path === '/docs/private-note.md' && entry.kind === 'file')) {
      throw new Error('expected memory canonical-seed reconciliation to preserve unrelated workspace documents')
    }
    if (!memoryEntries.some(entry => entry.path === '/docs/workspace-seeds/stale-demo.md')) {
      throw new Error('expected memory reconciliation to preserve noncanonical user seed files')
    }
    const citySeedPath = '/docs/workspace-seeds/agentic-graph-game-city-building-sim-demo.md'
    const projectedCityText = await workspaceFs.readFileText(citySeedPath)
    const authoredCityText = await fsPromises.readFile(
      path.join(seedsRoot, 'agentic-graph-game-city-building-sim-demo.md'),
      'utf8',
    )
    if (projectedCityText !== authoredCityText || !projectedCityText.includes('kgCanvasSurfaceMode: "geo-xr"')) {
      throw new Error('expected the repo-local City projection to stay byte-identical to its Geo+XR source')
    }
  } finally {
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_READ_ROOT_ENV, previousSeedsRoot)
    if (previousWindow) globals.window = previousWindow
  }
}

export async function testWorkspaceSeedProviderOverlaysLocalInventoryOnPublishedDocs() {
  const seedsRoot = '/workspace/agentic-graph/docs/workspace-seeds'
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousSeedsRoot = process.env[SEEDS_READ_ROOT_ENV]
  const previousFetch = globalThis.fetch
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  const listedRoots: string[] = []
  try {
    delete process.env[REPO_LOCAL_ENV]
    process.env[SEEDS_READ_ROOT_ENV] = seedsRoot

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (rawUrl === '/__agentic_os_fs_list') {
        const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
        const requestedRoot = String(body.path || '')
        listedRoots.push(requestedRoot)
        const files = requestedRoot === seedsRoot
          ? [
              { relPath: 'README.md', text: '# Seeds\n', updatedAtMs: 1 },
              { relPath: 'team-demo.md', text: '# Team demo\n', updatedAtMs: 2 },
            ]
          : [{ relPath: 'stale.md', text: '# Stale local projection\n', updatedAtMs: 1 }]
        return Response.json({ ok: true, files })
      }
      return new Response('', { status: 403 })
    }) as typeof fetch

    const seedEntries = (await readCanonicalWorkspaceSeedMirrorEntries())
      .sort((left, right) => left.relPath.localeCompare(right.relPath))
    if (listedRoots.length !== 1 || listedRoots[0] !== seedsRoot) {
      throw new Error(`expected canonical seed resolution to probe only the configured local seed root, got ${JSON.stringify(listedRoots)}`)
    }
    const expectedBasenames = [...CANONICAL_WORKSPACE_SEED_BASENAMES]
      .sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(seedEntries.map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))) !== JSON.stringify(expectedBasenames)) {
      throw new Error(`expected partial local seeds to resolve through the complete canonical bundle, got ${JSON.stringify(seedEntries)}`)
    }
    if (seedEntries.find(entry => entry.relPath.endsWith('/README.md'))?.authority !== 'agentic-graph-workspace-seeds-local'
      || seedEntries.some(entry => entry.relPath.endsWith('/team-demo.md'))) {
      throw new Error(`expected only safe canonical local entries to overlay bundled seeds, got ${JSON.stringify(seedEntries)}`)
    }
  } finally {
    globalThis.fetch = previousFetch
    restore()
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(SEEDS_READ_ROOT_ENV, previousSeedsRoot)
  }
}

export async function testWorkspaceSeedReconciliationRestoresCanonicalInventory() {
  const storage = new MemoryStorage()
  const { restore } = initWindowHarness({ storage })
  const desiredPath = '/docs/workspace-seeds/agentic-graph-physics-playground-demo.md'
  const restoredPaths = [
    '/docs/workspace-seeds/agentic-graph-game-flight-sim-demo.companion.md',
    '/docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md',
    '/docs/workspace-seeds/agentic-graph-game-mmorpg-demo.companion.md',
    '/docs/workspace-seeds/agentic-graph-game-mmorpg-demo.md',
  ]
  const unrelatedPath = '/docs/private-note.md'
  const unmanagedPath = '/docs/unmanaged-note.md'
  const previousSourceIndex = loadWorkspaceSourceIndex()
  const previousDesiredSource = previousSourceIndex[desiredPath] || null
  const previousRestoredSources = new Map(restoredPaths.map(restoredPath => [
    restoredPath,
    previousSourceIndex[restoredPath] || null,
  ] as const))
  const previousUnrelatedSource = previousSourceIndex[unrelatedPath] || null
  const db = createPersistedCollectionDb<{ entries: WorkspaceEntry }>({
    storageKey: `workspace-seed-inventory-${Date.now()}`,
    collectionNames: ['entries'],
    persistent: false,
    recordKeyByCollection: { entries: entry => entry.path },
  })
  try {
    const now = Date.now()
    const initialEntries: WorkspaceEntry[] = [
      { path: '/', parentPath: '', kind: 'folder', name: '', updatedAtMs: now },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: now },
      { path: '/docs/workspace-seeds', parentPath: '/docs', kind: 'folder', name: 'workspace-seeds', updatedAtMs: now },
      { path: desiredPath, parentPath: '/docs/workspace-seeds', kind: 'file', name: 'agentic-graph-physics-playground-demo.md', text: '# Stale text\n', updatedAtMs: now },
      { path: unrelatedPath, parentPath: '/docs', kind: 'file', name: 'private-note.md', text: '# Private\n', updatedAtMs: now },
      { path: unmanagedPath, parentPath: '/docs', kind: 'file', name: 'unmanaged-note.md', text: '# Unmanaged\n', updatedAtMs: now },
    ]
    for (const entry of initialEntries) await db.collections.entries.incrementalUpsert(entry)
    setWorkspaceEntrySource(desiredPath, { kind: 'local', originalName: 'agentic-graph-physics-playground-demo.md' }, { persist: 'sync' })
    for (const restoredPath of restoredPaths) {
      setWorkspaceEntrySource(
        restoredPath,
        { kind: 'local', originalName: restoredPath.slice(restoredPath.lastIndexOf('/') + 1) },
        { persist: 'sync' },
      )
    }
    setWorkspaceEntrySource(unrelatedPath, { kind: 'local', originalName: 'private-note.md' }, { persist: 'sync' })

    const authoritativeEntries: WorkspaceDocsMirrorEntry[] = (
      await readCanonicalWorkspaceSeedBundleEntries()
    ).map((entry, index) => {
      const workspacePath = `/docs/${entry.relPath}`
      const restoredIndex = restoredPaths.indexOf(workspacePath)
      return {
        ...entry,
        text: workspacePath === desiredPath
          ? '# Current text\n'
          : restoredIndex >= 0 ? `# Restored draft ${restoredIndex + 1}\n` : entry.text,
        updatedAtMs: now + index + 1,
        authority: 'agentic-graph-workspace-seeds-local',
      }
    })
    resetWorkspaceDocsMirrorSyncForPersistedFs()
    const changed = await syncWorkspaceDocsMirrorEntries(db.collections, authoritativeEntries, {
      scope: 'canonical-workspace-seeds',
    })
    const entries = (await db.collections.entries.find().exec()).map(row => row.toJSON())
    const seedFiles = entries
      .filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/workspace-seeds/'))
      .sort((left, right) => left.path.localeCompare(right.path))
    const expectedSeedPaths = CANONICAL_WORKSPACE_SEED_BASENAMES
      .map(basename => `/docs/workspace-seeds/${basename}`)
      .sort((left, right) => left.localeCompare(right)).join('|')

    if (!changed) throw new Error('expected authoritative workspace-seed reconciliation to report a change')
    if (seedFiles.map(entry => entry.path).join('|') !== expectedSeedPaths) {
      throw new Error(`expected exact canonical seed inventory, got ${JSON.stringify(seedFiles)}`)
    }
    if (seedFiles.find(entry => entry.path === desiredPath)?.text !== '# Current text\n') {
      throw new Error('expected canonical seed text to replace stale source-owned text')
    }
    if (restoredPaths.some((restoredPath, index) =>
      seedFiles.find(entry => entry.path === restoredPath)?.text !== `# Restored draft ${index + 1}\n`)) {
      throw new Error(`expected restored canonical draft inventory, got ${JSON.stringify(seedFiles)}`)
    }
    if (!entries.some(entry => entry.path === unrelatedPath && entry.text === '# Private\n')) {
      throw new Error('expected reconciliation to preserve unrelated source-owned documents')
    }
    if (!entries.some(entry => entry.path === unmanagedPath && entry.text === '# Unmanaged\n')) {
      throw new Error('expected seed-only reconciliation to preserve unrelated unowned documents')
    }
    const sourceIndex = loadWorkspaceSourceIndex()
    const canonicalOwnership = restoredPaths.filter(restoredPath => sourceIndex[restoredPath])
    if (sourceIndex[desiredPath] || canonicalOwnership.length > 0 || !sourceIndex[unrelatedPath]) {
      throw new Error(`expected only canonical seed source ownership to be cleared, got ${JSON.stringify(sourceIndex)}`)
    }
  } finally {
    setWorkspaceEntrySource(desiredPath, previousDesiredSource, { persist: 'sync' })
    for (const [restoredPath, previousRestoredSource] of previousRestoredSources) {
      setWorkspaceEntrySource(restoredPath, previousRestoredSource, { persist: 'sync' })
    }
    setWorkspaceEntrySource(unrelatedPath, previousUnrelatedSource, { persist: 'sync' })
    await db.db.close()
    restore()
  }
  await testPartialCanonicalAuthorityCannotMutateOrDeleteSeeds()
}
