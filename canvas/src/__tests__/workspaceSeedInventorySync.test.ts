import fsPromises from 'node:fs/promises'
import path from 'node:path'

import { createPersistedCollectionDb } from '@/lib/storage/persistedCollectionStore'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
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

const REPO_LOCAL_ENV = 'VITE_KNOWGRPH_RUN_READY_REPO_LOCAL'
const DOCS_ROOT_ENV = 'VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT'
const SEEDS_ROOT_ENV = 'VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT'
const AGENTIC_DOCS_ROOT_ENV = 'VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT'

const restoreEnv = (name: string, value: string | undefined): void => {
  if (typeof value === 'string') process.env[name] = value
  else delete process.env[name]
}

const decodeProxyUrl = (url: string): string => {
  if (!url.startsWith('/__fetch_remote')) return url
  const encoded = new URLSearchParams(url.split('?')[1] || '').get('url') || ''
  return decodeURIComponent(encoded)
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

export async function testProductionFallbackRestoresBundledWorkspaceSeedInventory() {
  const missingRoot = `/missing/workspace-seed-production-${Date.now()}`
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_ROOT_ENV]
  const previousAgenticRoot = process.env[AGENTIC_DOCS_ROOT_ENV]
  const previousFetch = globalThis.fetch
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  try {
    delete process.env[REPO_LOCAL_ENV]
    process.env[DOCS_ROOT_ENV] = `${missingRoot}/docs`
    process.env[SEEDS_ROOT_ENV] = `${missingRoot}/docs/workspace-seeds`
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
    if (seedEntries.some(entry => entry.authority !== 'knowgrph-workspace-seeds-bundled')) {
      throw new Error(`expected revision-pinned bundle authority, got ${JSON.stringify(seedEntries)}`)
    }
  } finally {
    resetCanonicalPublishedDocsMirrorCacheForTests()
    resetWorkspaceSeedProviderStorageCacheForTests()
    globalThis.fetch = previousFetch
    restore()
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_ROOT_ENV, previousSeedsRoot)
    restoreEnv(AGENTIC_DOCS_ROOT_ENV, previousAgenticRoot)
  }
}

export async function testWorkspaceSeedProviderProjectsCanonicalLocalInventoryExactly() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const docsRoot = path.join(repoRoot, 'docs')
  const seedsRoot = path.join(docsRoot, 'workspace-seeds')
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_ROOT_ENV]
  const previousAgenticRoot = process.env[AGENTIC_DOCS_ROOT_ENV]
  const globals = globalThis as typeof globalThis & { window?: Window }
  const previousWindow = globals.window
  try {
    process.env[REPO_LOCAL_ENV] = '1'
    process.env[DOCS_ROOT_ENV] = docsRoot
    process.env[SEEDS_ROOT_ENV] = seedsRoot
    process.env[AGENTIC_DOCS_ROOT_ENV] = path.join(repoRoot, '.missing-agentic-docs')
    delete globals.window

    const expected = (await fsPromises.readdir(seedsRoot, { withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .sort()
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const actual = mirrored
      .filter(entry => entry.authority === 'knowgrph-workspace-seeds-local')
      .map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
      .sort()

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const projectedSeeds = mirrored.filter(entry => entry.relPath.startsWith('workspace-seeds/'))
      throw new Error(`expected Source Files seed inventory ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} from ${JSON.stringify(projectedSeeds)}`)
    }
  } finally {
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_ROOT_ENV, previousSeedsRoot)
    restoreEnv(AGENTIC_DOCS_ROOT_ENV, previousAgenticRoot)
    if (previousWindow) globals.window = previousWindow
  }
}

export async function testRepoLocalPersistedBootstrapReconcilesCanonicalSeedInventory() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const docsRoot = path.join(repoRoot, 'docs')
  const seedsRoot = path.join(docsRoot, 'workspace-seeds')
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_ROOT_ENV]
  const globals = globalThis as typeof globalThis & { window?: Window }
  const previousWindow = globals.window
  try {
    process.env[REPO_LOCAL_ENV] = '1'
    process.env[DOCS_ROOT_ENV] = docsRoot
    process.env[SEEDS_ROOT_ENV] = seedsRoot
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
  } finally {
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_ROOT_ENV, previousSeedsRoot)
    if (previousWindow) globals.window = previousWindow
  }
}

export async function testWorkspaceSeedProviderOverlaysLocalInventoryOnPublishedDocs() {
  const docsRoot = '/workspace/huijoohwee/docs'
  const seedsRoot = '/workspace/knowgrph/docs/workspace-seeds'
  const previousRepoLocal = process.env[REPO_LOCAL_ENV]
  const previousDocsRoot = process.env[DOCS_ROOT_ENV]
  const previousSeedsRoot = process.env[SEEDS_ROOT_ENV]
  const previousFetch = globalThis.fetch
  const { restore } = initWindowHarness({ storage: new MemoryStorage() })
  const listedRoots: string[] = []
  try {
    delete process.env[REPO_LOCAL_ENV]
    process.env[DOCS_ROOT_ENV] = docsRoot
    process.env[SEEDS_ROOT_ENV] = seedsRoot
    resetCanonicalPublishedDocsMirrorCacheForTests()

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (rawUrl === '/__kg_fs_list') {
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

      const url = decodeProxyUrl(rawUrl)
      if (url === 'https://api.github.com/repos/huijoohwee/huijoohwee/git/refs/heads/main') {
        return Response.json({ object: { sha: 'published-commit' } })
      }
      if (url === 'https://api.github.com/repos/huijoohwee/huijoohwee/git/commits/published-commit') {
        return Response.json({ tree: { sha: 'published-tree' } })
      }
      if (url === 'https://api.github.com/repos/huijoohwee/huijoohwee/git/trees/published-tree?recursive=1') {
        return Response.json({ truncated: false, tree: [{ path: 'docs/published.md', type: 'blob' }] })
      }
      if (url === 'https://raw.githubusercontent.com/huijoohwee/huijoohwee/main/docs/published.md') {
        return new Response('# Published\n')
      }
      return new Response('', { status: 403 })
    }) as typeof fetch

    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    const seedEntries = mirrored
      .filter(entry => entry.relPath.startsWith('workspace-seeds/'))
      .sort((left, right) => left.relPath.localeCompare(right.relPath))
    if (listedRoots.length !== 1 || listedRoots[0] !== seedsRoot) {
      throw new Error(`expected bootstrap to probe only the canonical local seed root, got ${JSON.stringify(listedRoots)}`)
    }
    if (seedEntries.length !== 2 || seedEntries.some(entry => entry.authority !== 'knowgrph-workspace-seeds-local')) {
      throw new Error(`expected local seed inventory to overlay the published aggregate, got ${JSON.stringify(seedEntries)}`)
    }
    if (!mirrored.some(entry => entry.relPath === 'published.md' && entry.text === '# Published\n')) {
      throw new Error('expected non-seed documents to retain their published GitHub authority')
    }
  } finally {
    resetCanonicalPublishedDocsMirrorCacheForTests()
    globalThis.fetch = previousFetch
    restore()
    restoreEnv(REPO_LOCAL_ENV, previousRepoLocal)
    restoreEnv(DOCS_ROOT_ENV, previousDocsRoot)
    restoreEnv(SEEDS_ROOT_ENV, previousSeedsRoot)
  }
}

export async function testWorkspaceSeedReconciliationRestoresCanonicalInventory() {
  const storage = new MemoryStorage()
  const { restore } = initWindowHarness({ storage })
  const desiredPath = '/docs/workspace-seeds/knowgrph-physics-playground-demo.md'
  const restoredPaths = [
    '/docs/workspace-seeds/knowgrph-game-flight-sim-demo.companion.md',
    '/docs/workspace-seeds/knowgrph-game-flight-sim-demo.md',
    '/docs/workspace-seeds/knowgrph-game-mmorpg-demo.companion.md',
    '/docs/workspace-seeds/knowgrph-game-mmorpg-demo.md',
  ]
  const unrelatedPath = '/docs/private-note.md'
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
      { path: desiredPath, parentPath: '/docs/workspace-seeds', kind: 'file', name: 'knowgrph-physics-playground-demo.md', text: '# Stale text\n', updatedAtMs: now },
      { path: unrelatedPath, parentPath: '/docs', kind: 'file', name: 'private-note.md', text: '# Private\n', updatedAtMs: now },
    ]
    for (const entry of initialEntries) await db.collections.entries.incrementalUpsert(entry)
    setWorkspaceEntrySource(desiredPath, { kind: 'local', originalName: 'knowgrph-physics-playground-demo.md' }, { persist: 'sync' })
    for (const restoredPath of restoredPaths) {
      setWorkspaceEntrySource(
        restoredPath,
        { kind: 'local', originalName: restoredPath.slice(restoredPath.lastIndexOf('/') + 1) },
        { persist: 'sync' },
      )
    }
    setWorkspaceEntrySource(unrelatedPath, { kind: 'local', originalName: 'private-note.md' }, { persist: 'sync' })

    const authoritativeEntries: WorkspaceDocsMirrorEntry[] = [
      {
        relPath: 'workspace-seeds/README.md',
        text: '# Seeds\n',
        updatedAtMs: now + 1,
        authority: 'knowgrph-workspace-seeds-local',
      },
      {
        relPath: 'workspace-seeds/knowgrph-physics-playground-demo.md',
        text: '# Current text\n',
        updatedAtMs: now + 2,
        authority: 'knowgrph-workspace-seeds-local',
      },
      ...restoredPaths.map((restoredPath, index): WorkspaceDocsMirrorEntry => ({
        relPath: restoredPath.replace(/^\/docs\//, ''),
        text: `# Restored draft ${index + 1}\n`,
        updatedAtMs: now + 3 + index,
        authority: 'knowgrph-workspace-seeds-local',
      })),
    ]
    resetWorkspaceDocsMirrorSyncForPersistedFs()
    const changed = await syncWorkspaceDocsMirrorEntries(db.collections, authoritativeEntries)
    const entries = (await db.collections.entries.find().exec()).map(row => row.toJSON())
    const seedFiles = entries
      .filter(entry => entry.kind === 'file' && entry.path.startsWith('/docs/workspace-seeds/'))
      .sort((left, right) => left.path.localeCompare(right.path))
    const expectedSeedPaths = [
      '/docs/workspace-seeds/README.md',
      desiredPath,
      ...restoredPaths,
    ].sort((left, right) => left.localeCompare(right)).join('|')

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
}
