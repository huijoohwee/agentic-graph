import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import {
  hydrateWorkspaceEntriesInlineText,
  materializeActiveWorkspaceEntryIntoSourceFiles,
  readWorkspaceActiveEntrySnapshot,
} from '@/features/source-files/sourceFilesRuntimeShared'
import { invalidateCachedWorkspaceActiveEntrySnapshot } from '@/features/source-files/workspaceActiveEntryCache'
import {
  readWorkspaceInitializationDocsMirrorEntries,
  readWorkspaceInitializationSeedText,
} from '@/features/workspace-fs/workspaceSeedProvider'
import { CANONICAL_WORKSPACE_SEED_BASENAMES } from '@/features/workspace-fs/workspaceCanonicalSeedBundle'
import { buildWorkspaceEntriesSemanticKey } from '@/features/workspace-fs/workspaceEntriesSemanticKey'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'
import { resolveDocumentRepositoryAuthority } from 'grph-shared/collaboration/documentRepositoryAuthority'

const createMinimalFs = (overrides: Partial<WorkspaceFs> = {}): WorkspaceFs => ({
  ensureSeed: async () => false,
  listEntries: async () => [],
  readFileText: async () => '',
  writeFileText: async () => void 0,
  createFile: async () => '/docs/tmp.md',
  createFolder: async () => '/docs',
  deleteEntry: async () => void 0,
  ...overrides,
})

const fileEntry = (path: string, text = '', updatedAtMs = 1): WorkspaceEntry => {
  const name = path.split('/').filter(Boolean).at(-1) || 'file.md'
  const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '/' : '/'
  return { path, parentPath, kind: 'file', name, text, updatedAtMs } as WorkspaceEntry
}

const restoreEnv = (key: string, value: string | undefined): void => {
  if (typeof value === 'string') process.env[key] = value
  else delete process.env[key]
}

const withFetchAndEnv = async (
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  run: () => Promise<void>,
): Promise<void> => {
  const previousFetch = globalThis.fetch
  const previousEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(env)) restoreEnv(key, value)
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = fetchImpl
  try {
    await run()
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) restoreEnv(key, value)
    if (previousFetch) (globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
  }
}

const withStoreMirrorState = async (run: () => Promise<void>): Promise<void> => {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  try {
    await run()
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
  }
}

export async function testMaterializeActiveWorkspaceEntryReadsActiveFileWithoutListingWorkspace() {
  const { restore } = initJsdomHarness()
  try {
    useGraphStore.getState().resetAll()
    const activePath = '/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'
    const activeSourcePath = `workspace:${activePath}`
    const activeText = [
      '---',
      'title: "agentic-graph AR/VR/XR runtime-readiness demo"',
      'run_ready_demo:',
      '  id: "xr-v2"',
      `  canonical_source_file: "${activePath}"`,
      '---',
      '# XR v2 active seed',
    ].join('\n')
    useMarkdownExplorerStore.getState().setActivePath(activePath)
    let listEntriesCalls = 0
    await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: activePath,
      fs: createMinimalFs({
        listEntries: async () => {
          listEntriesCalls += 1
          throw new Error('active materialization should not list the whole workspace')
        },
        readFileText: async path => (String(path || '').trim() === activePath ? activeText : null),
      }),
      applyToGraph: false,
    })
    const sourceFiles = useGraphStore.getState().sourceFiles || []
    const active = sourceFiles.find(file => String(file.source?.path || '') === activeSourcePath) || null
    if (listEntriesCalls !== 0) throw new Error(`expected active materialization not to list workspace entries, got ${listEntriesCalls}`)
    if (!active || String(active.text || '') !== activeText) {
      throw new Error(`expected canonical XR active-only materialization to preserve ${activeSourcePath}, got ${JSON.stringify(sourceFiles)}`)
    }
    const repositoryAuthority = resolveDocumentRepositoryAuthority({
      documentKey: activePath,
      documentKind: 'markdown',
    })
    if (
      repositoryAuthority?.repositoryTarget !== 'agentic-graph-docs'
      || repositoryAuthority.canonicalPath !== 'agentic-graph/docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'
    ) {
      throw new Error(`expected active seed repository authority to remain rooted in agentic-graph/docs, got ${JSON.stringify(repositoryAuthority)}`)
    }
  } finally {
    restore()
  }
}

export async function testReadWorkspaceActiveEntrySnapshotCachesRecentActiveFileText() {
  const activePath = '/docs/recent-active.md'
  invalidateCachedWorkspaceActiveEntrySnapshot()
  let readCalls = 0
  try {
    const first = await readWorkspaceActiveEntrySnapshot({
      activePath,
      fs: createMinimalFs({
        readFileText: async path => {
          readCalls += 1
          return String(path || '').trim() === activePath ? '# recent active' : null
        },
      }),
    })
    const second = await readWorkspaceActiveEntrySnapshot({
      activePath,
      fs: createMinimalFs({
        readFileText: async () => {
          throw new Error('expected second active snapshot read to come from bounded cache')
        },
      }),
    })
    if (readCalls !== 1) throw new Error(`expected exactly one active-file fs read, got ${readCalls}`)
    if (String(first[0]?.text || '') !== '# recent active' || String(second[0]?.text || '') !== '# recent active') {
      throw new Error('expected active workspace snapshot cache to preserve the recent active file text')
    }
  } finally {
    invalidateCachedWorkspaceActiveEntrySnapshot()
  }
}

export async function testHydrateWorkspaceEntriesInlineTextPrefersWorkspaceCanonicalD1PathForActiveDocs() {
  const capturedUrls: string[] = []
  await withFetchAndEnv({
    VITE_AGENTIC_OS_STORAGE_BASE_URL: 'https://storage.example.test',
    VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: 'kgws:test-workspace-canonical',
  }, (async input => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    const ok = url.includes('/api/storage/doc/') && url.includes(encodeURIComponent('workspace:/docs/active-document.md'))
    return new Response(ok ? '# hydrated from workspace canonical d1 path' : '', { status: ok ? 200 : 404 })
  }) as typeof fetch, async () => {
    const entries = [fileEntry('/docs/active-document.md')]
    const hydrated = await hydrateWorkspaceEntriesInlineText({
      fs: createMinimalFs(),
      workspaceEntries: entries,
      forceIncludePaths: ['/docs/active-document.md'],
    })
    if (hydrated === entries) throw new Error('expected active docs workspace entry text to hydrate from workspace canonical D1 doc path')
    if (String(hydrated[0]?.text || '').trim() !== '# hydrated from workspace canonical d1 path') {
      throw new Error(`expected workspace canonical D1 hydration, got ${String(hydrated[0]?.text || '')}`)
    }
    if (!capturedUrls[0]?.includes(encodeURIComponent('workspace:/docs/active-document.md'))) {
      throw new Error(`expected workspace:/docs canonical path before legacy aliases, got ${JSON.stringify(capturedUrls)}`)
    }
  })
}

export async function testHydrateWorkspaceEntriesInlineTextOnlyFetchesActiveForceIncludedEntry() {
  const capturedUrls: string[] = []
  await withFetchAndEnv({
    VITE_AGENTIC_OS_STORAGE_BASE_URL: 'https://storage.example.test',
    VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: 'kgws:test-active-only',
  }, (async input => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    const active = url.includes(encodeURIComponent('workspace:/docs/active.md'))
    return new Response(active ? '# active from d1' : '', { status: active ? 200 : 404 })
  }) as typeof fetch, async () => {
    const hydrated = await hydrateWorkspaceEntriesInlineText({
      fs: createMinimalFs(),
      workspaceEntries: [fileEntry('/docs/active.md'), fileEntry('/docs/inactive.md', '', 2)],
      forceIncludePaths: ['/docs/active.md'],
    })
    if (String(hydrated[0]?.text || '').trim() !== '# active from d1') {
      throw new Error(`expected active entry to hydrate from D1, got ${String(hydrated[0]?.text || '')}`)
    }
    if (String(hydrated[1]?.text || '').trim()) {
      throw new Error(`expected inactive entry to stay unhydrated, got ${String(hydrated[1]?.text || '')}`)
    }
    if (capturedUrls.some(url => url.includes('inactive.md'))) {
      throw new Error(`expected active-file hydration not to fetch inactive docs, got ${JSON.stringify(capturedUrls)}`)
    }
  })
}

export async function testHydrateWorkspaceEntriesInlineTextDedupesConcurrentStorageDocFetches() {
  let storageDocFetches = 0
  await withFetchAndEnv({
    VITE_AGENTIC_OS_STORAGE_BASE_URL: 'https://dedupe.example.test',
    VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: 'kgws:test-dedupe',
  }, (async input => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    const ok = url.includes('/api/storage/doc/') && url.includes(encodeURIComponent('workspace:/docs/dedupe.md'))
    if (!ok) return new Response('', { status: 404 })
    storageDocFetches += 1
    await new Promise(resolve => setTimeout(resolve, 5))
    return new Response('# deduped active document', { status: 200 })
  }) as typeof fetch, async () => {
    const hydrated = await hydrateWorkspaceEntriesInlineText({
      fs: createMinimalFs(),
      workspaceEntries: [fileEntry('/docs/dedupe.md'), fileEntry('/docs/dedupe.md')],
      forceIncludePaths: ['/docs/dedupe.md'],
    })
    if (storageDocFetches !== 1) throw new Error(`expected one in-flight D1 doc fetch, got ${storageDocFetches}`)
    if (hydrated.some(entry => String(entry.text || '').trim() !== '# deduped active document')) {
      throw new Error(`expected duplicate active entries to share deduped D1 text, got ${JSON.stringify(hydrated)}`)
    }
  })
}

export function testMergeWorkspaceEntriesForceIncludeOnlySkipsInactiveWorkspaceRecords() {
  const merged = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [fileEntry('/docs/active.md', '# active'), fileEntry('/docs/inactive.md', '# inactive', 2)],
    sourcesByPath: {
      '/docs/active.md': { kind: 'local', originalName: 'active.md' },
      '/docs/inactive.md': { kind: 'local', originalName: 'inactive.md' },
    },
    forceIncludePaths: ['/docs/active.md'],
    forceIncludeOnly: true,
    workspaceDocsOnly: true,
  })
  if (merged.length !== 1 || String(merged[0]?.source?.path || '') !== 'workspace:/docs/active.md') {
    throw new Error(`expected force-include-only merge to skip inactive records, got ${JSON.stringify(merged)}`)
  }
}

export function testWorkspaceEntriesSemanticKeyForceIncludeOnlyIgnoresInactiveTextChanges() {
  const first = buildWorkspaceEntriesSemanticKey({
    entries: [fileEntry('/docs/active.md', '# active'), fileEntry('/docs/inactive.md', '# inactive v1', 2)],
    docsOnly: true,
    forceIncludePaths: ['/docs/active.md'],
    forceIncludeOnly: true,
  })
  const second = buildWorkspaceEntriesSemanticKey({
    entries: [fileEntry('/docs/active.md', '# active'), fileEntry('/docs/inactive.md', '# inactive v2'.repeat(1000), 3)],
    docsOnly: true,
    forceIncludePaths: ['/docs/active.md'],
    forceIncludeOnly: true,
  })
  if (first !== second) throw new Error('expected active-only semantic key to ignore inactive workspace text churn')
}

export async function testApplyWorkspaceImportToCanvasForceIncludeOnlySkipsInactiveWorkspaceRecords() {
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      fileEntry('/docs/active.md', '# active'),
      fileEntry('/docs/inactive.md', '# inactive', 2),
    ],
  })
  try {
    store.setSourceFiles([])
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: ['/docs/active.md'],
      opts: {
        applyToGraph: false,
        workspaceEntries: await fs.listEntries(),
        sourcesByPath: {
          '/docs/active.md': { kind: 'local', originalName: 'active.md' },
          '/docs/inactive.md': { kind: 'local', originalName: 'inactive.md' },
        },
      },
    })
    const sourceFiles = useGraphStore.getState().sourceFiles || []
    if (sourceFiles.length !== 1 || String(sourceFiles[0]?.source?.path || '') !== 'workspace:/docs/active.md') {
      throw new Error(`expected workspace import apply to skip inactive records, got ${JSON.stringify(sourceFiles)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
  }
}

export async function testWorkspaceSeedProviderIncompleteSourceFilesStorageFallbackDoesNotCrashWhenStorageExportMisses() {
  await withFetchAndEnv({
    VITE_AGENTIC_OS_STORAGE_BASE_URL: 'https://storage.example.test',
    VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: 'kgws:test-miss',
  }, (async () => new Response('', { status: 404 })) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      const store = useGraphStore.getState()
      store.setLocalMarkdownFolderHandle(null)
      store.setLocalMarkdownFolderCacheId(null, null)
      store.setLocalMarkdownSelectedFolderPath('/virtual/workspace/docs')
      store.setSourceFiles([{
        id: 'sf-blank',
        name: 'missing.md',
        text: '',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: '/virtual/workspace/docs/missing.md' },
      }])
      const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
      if (!Array.isArray(mirrored)) throw new Error('expected storage fallback miss to return a mirror list')
    })
  })
}

export async function testWorkspaceSeedProviderConfiguredDocsRootPrecedesStorageFallback() {
  const capturedUrls: string[] = []
  const docsRootRelPath = 'configured-docs-root-demo.md'
  await withFetchAndEnv({
    VITE_AGENTIC_OS_STORAGE_BASE_URL: 'https://storage.example.test',
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: '/virtual/workspace/docs',
  }, (async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    if (url === '/__kg_fs_list') {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
      if (String(body.path || '').trim() !== '/virtual/workspace/docs') {
        return new Response(JSON.stringify({ ok: true, files: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        ok: true,
        files: [{
          relPath: docsRootRelPath,
          text: '# local docs mirror demo',
          updatedAtMs: 1710000009000,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000005000,
      documents: [{
        id: 'doc:stale-storage',
        workspaceId: 'kgws:test',
        canonicalPath: 'stale-storage.md',
        title: 'stale-storage.md',
        docType: 'markdown',
        lang: null,
        graphId: null,
        sourceKind: 'markdown',
        contentMd: '# stale storage mirror',
        contentHash: 'stale-storage',
        parserVersion: 'source-files',
        revision: 1,
        updatedAtMs: 1710000005000,
        deleted: false,
      }],
      documentChunks: [],
      graphSnapshots: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      const store = useGraphStore.getState()
      store.setLocalMarkdownFolderHandle(null)
      store.setLocalMarkdownFolderCacheId(null, null)
      store.setLocalMarkdownSelectedFolderPath('/virtual/workspace/docs')
      store.setSourceFiles([])
      const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
      if (mirrored.length !== 1 || mirrored[0]?.relPath !== docsRootRelPath) {
        throw new Error(`expected configured docs root to seed the mirror before storage fallback, got ${JSON.stringify(mirrored)}`)
      }
      if (capturedUrls[0] !== '/__kg_fs_list') {
        throw new Error(`expected docs root proxy read before storage export fallback, got ${JSON.stringify(capturedUrls)}`)
      }
      if (capturedUrls.some(url => url.includes('/api/storage/export/'))) {
        throw new Error(`expected complete configured docs root to avoid storage fallback, got ${JSON.stringify(capturedUrls)}`)
      }
    })
  })
}

export async function testWorkspaceSeedProviderConfiguredDocsRootPrecedesPublishedCanonicalDatasetInFullBootstrap() {
  const capturedUrls: string[] = []
  const docsRootRelPath = 'configured-full-bootstrap.md'
  await withFetchAndEnv({
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: '/virtual/workspace/full-bootstrap',
    VITE_AGENTIC_OS_STORAGE_BASE_URL: undefined,
  }, (async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    if (url === '/__kg_fs_list') {
      const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
      if (String(body.path || '').trim() !== '/virtual/workspace/full-bootstrap') {
        return new Response(JSON.stringify({ ok: true, files: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        ok: true,
        files: [{
          relPath: docsRootRelPath,
          text: '# configured full bootstrap docs',
          updatedAtMs: 1710000009001,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url === '/docs/workspace-readme.md') {
      return new Response('# published canonical fallback', {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      })
    }
    return new Response('', { status: 404 })
  }) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      const store = useGraphStore.getState()
      store.setLocalMarkdownFolderHandle(null)
      store.setLocalMarkdownFolderCacheId(null, null)
      store.setLocalMarkdownSelectedFolderPath('/virtual/workspace/full-bootstrap')
      store.setSourceFiles([])
      const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
      if (mirrored.length !== 1 || mirrored[0]?.relPath !== docsRootRelPath) {
        throw new Error(`expected configured docs root to stay authoritative during full bootstrap, got ${JSON.stringify(mirrored)}`)
      }
      if (capturedUrls[0] !== '/__kg_fs_list') {
        throw new Error(`expected configured docs root to resolve before published canonical fallback, got ${JSON.stringify(capturedUrls)}`)
      }
      if (capturedUrls.includes('/docs/workspace-readme.md')) {
        throw new Error(`expected authoritative configured docs root to avoid published canonical fallback, got ${JSON.stringify(capturedUrls)}`)
      }
    })
  })
}

export async function testWorkspaceSeedProviderCompleteSourceFilesBootstrapOverlaysCanonicalSeedInventory() {
  await withFetchAndEnv({
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: undefined,
    VITE_AGENTIC_OS_STORAGE_BASE_URL: undefined,
  }, (async () => new Response('', { status: 404 })) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      const store = useGraphStore.getState()
      store.setLocalMarkdownFolderHandle(null)
      store.setLocalMarkdownFolderCacheId(null, null)
      store.setLocalMarkdownSelectedFolderPath('/virtual/workspace/docs')
      store.setSourceFiles([
        {
          id: 'sf-seed-physics',
          name: 'agentic-graph-physics-playground-demo.md',
          text: '# physics seed\n',
          enabled: true,
          status: 'idle',
          source: {
            kind: 'local',
            path: '/virtual/workspace/docs/workspace-seeds/agentic-graph-physics-playground-demo.md',
          },
        },
        {
          id: 'sf-doc-agent-definitions',
          name: 'AGENT-DEFINITIONS.md',
          text: '# source definitions\n',
          enabled: true,
          status: 'idle',
          source: {
            kind: 'local',
            path: '/virtual/workspace/docs/AGENT-DEFINITIONS.md',
          },
        },
      ])

      const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
      const seedInventory = mirrored
        .filter(entry => entry.relPath.startsWith('workspace-seeds/'))
        .map(entry => entry.relPath.replace(/^workspace-seeds\//, ''))
        .sort((left, right) => left.localeCompare(right))
      const expectedSeedInventory = [...CANONICAL_WORKSPACE_SEED_BASENAMES]
        .sort((left, right) => left.localeCompare(right))

      if (JSON.stringify(seedInventory) !== JSON.stringify(expectedSeedInventory)) {
        throw new Error(`expected complete canonical seed inventory overlay, got ${JSON.stringify(seedInventory)}`)
      }
    })
  })
}

export async function testWorkspaceSeedProviderStorageExportDoesNotReuseStaleMirror() {
  let exportFetches = 0
  await withFetchAndEnv({
    VITE_AGENTIC_OS_STORAGE_BASE_URL: 'https://storage-cache.example.test',
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: undefined,
  }, (async input => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    exportFetches += 1
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test-cache',
      exportedAtMs: 1710000005000,
      documents: [{
        id: 'doc:cached',
        workspaceId: 'kgws:test-cache',
        canonicalPath: 'cache-demo/cached.md',
        title: 'cached.md',
        docType: 'markdown',
        lang: null,
        graphId: null,
        sourceKind: 'markdown',
        contentMd: `# fresh export ${exportFetches}`,
        contentHash: 'cached',
        parserVersion: 'source-files',
        revision: 1,
        updatedAtMs: 1710000005000,
        deleted: false,
      }],
      documentChunks: [],
      graphSnapshots: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      const store = useGraphStore.getState()
      store.setLocalMarkdownFolderHandle(null)
      store.setLocalMarkdownFolderCacheId(null, null)
      store.setLocalMarkdownSelectedFolderPath('/virtual/workspace/docs/cache-demo')
      store.setSourceFiles([])
      const first = await readWorkspaceInitializationDocsMirrorEntries()
      const second = await readWorkspaceInitializationDocsMirrorEntries()
      if (exportFetches !== 2) throw new Error(`expected D1 export mirror to refresh between reads, got ${exportFetches} fetches`)
      if (String(first[0]?.text || '').trim() !== '# fresh export 1' || String(second[0]?.text || '').trim() !== '# fresh export 2') {
        throw new Error(`expected storage export mirror to avoid stale reuse, got ${JSON.stringify({ first, second })}`)
      }
    })
  })
}

export async function testWorkspaceSeedProviderConfiguredDocsRootDedupesBurstReads() {
  let docsRootFetches = 0
  await withFetchAndEnv({
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: '/virtual/workspace/docs-burst-dedupe',
    VITE_AGENTIC_OS_STORAGE_BASE_URL: undefined,
  }, (async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (url !== '/__kg_fs_list') return new Response('', { status: 404 })
    const body = JSON.parse(String(init?.body || '{}')) as { path?: unknown }
    if (String(body.path || '').trim() !== '/virtual/workspace/docs-burst-dedupe') {
      return new Response(JSON.stringify({ ok: true, files: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    docsRootFetches += 1
    return new Response(JSON.stringify({
      ok: true,
      files: [{
        relPath: 'burst-dedupe.md',
        text: '# deduped docs mirror',
        updatedAtMs: 1710000010000,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch, async () => {
    await withStoreMirrorState(async () => {
      const store = useGraphStore.getState()
      store.setLocalMarkdownFolderHandle(null)
      store.setLocalMarkdownFolderCacheId(null, null)
      store.setLocalMarkdownSelectedFolderPath('/virtual/workspace/docs-burst-dedupe')
      store.setSourceFiles([])
      const [first, second, third] = await Promise.all([
        readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true }),
        readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true }),
        readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true }),
      ])
      if (docsRootFetches !== 1) {
        throw new Error(`expected configured docs root burst reads to share one proxy request, got ${docsRootFetches}`)
      }
      const texts = [first, second, third].map(entries => String(entries[0]?.text || '').trim())
      if (texts.some(text => text !== '# deduped docs mirror')) {
        throw new Error(`expected burst reads to resolve the same docs mirror payload, got ${JSON.stringify(texts)}`)
      }
    })
  })
}

export async function testWorkspaceSeedProviderPublishedDocsSeedRejectsHtmlFallback() {
  const capturedUrls: string[] = []
  await withFetchAndEnv({
    VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: '/Users/demo/huijoohwee/docs',
    VITE_AGENTIC_OS_STORAGE_BASE_URL: undefined,
  }, (async input => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    if (url === '/docs/workspace-readme.md') {
      return new Response('---\ntitle: Seed\n---\n# Published seed', {
        status: 200,
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      })
    }
    return new Response('<!DOCTYPE html><html><head><title>agentic-graph</title></head><body>app shell</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }) as typeof fetch, async () => {
    const text = await readWorkspaceInitializationSeedText({
      basename: 'workspace-readme.md',
      relPathCandidates: ['docs/workspace-readme.md'],
    })
    if (String(text || '').trim() !== '---\ntitle: Seed\n---\n# Published seed') {
      throw new Error(`expected published docs seed to win over HTML fallbacks, got ${JSON.stringify(text)}`)
    }
    if (!capturedUrls.includes('/@fs/Users/demo/huijoohwee/docs/workspace-readme.md')) {
      throw new Error(`expected absolute /@fs candidate to be attempted, got ${JSON.stringify(capturedUrls)}`)
    }
    if (!capturedUrls.includes('/docs/workspace-readme.md')) {
      throw new Error(`expected root published docs seed to be attempted, got ${JSON.stringify(capturedUrls)}`)
    }
    if (capturedUrls.includes('/__codebase_file?path=docs%2Fworkspace-readme.md')) {
      throw new Error(`expected valid published seed to avoid __codebase_file fallback, got ${JSON.stringify(capturedUrls)}`)
    }
  })
}
