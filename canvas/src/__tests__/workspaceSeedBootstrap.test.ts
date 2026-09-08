import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import path from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { acquireWorkspaceSeedSyncSuspension } from '@/lib/workspace/workspaceSeedSyncRuntime'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { SourceFilesPersistenceBootstrap } from '@/features/source-files/SourceFilesPersistenceBootstrap'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { hydrateWorkspaceEntriesInlineText, readWorkspaceSourceRootEntriesSnapshot } from '@/features/source-files/sourceFilesRuntimeShared'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { AG_HUIJOOHWEE_DOCS_ROOT, withLocalDocsMirror } from './helpers/workspaceSeedMirrorHarness'

export async function testWorkspaceSeedProviderReadsDocsMirrorFromSelectedLocalFolderHandle() {
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  type MockFsEntry = {
    kind: 'file' | 'directory'
    name: string
    entries?: () => AsyncIterable<[string, MockFsEntry]>
    getDirectoryHandle?: (name: string) => Promise<MockFsEntry>
    getFile?: () => Promise<File>
  }
  const makeDirectoryEntry = (name: string, children: Record<string, MockFsEntry>): MockFsEntry => ({
    kind: 'directory',
    name,
    entries: async function* () {
      const keys = Object.keys(children).sort((a, b) => a.localeCompare(b))
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]!
        const child = children[key]
        if (!child) continue
        yield [key, child]
      }
    },
    getDirectoryHandle: async (childName: string) => {
      const child = children[String(childName || '').trim()]
      if (!child || child.kind !== 'directory') throw new Error(`missing directory ${childName}`)
      return child
    },
  })
  const makeFileEntry = (name: string, text: string, lastModified: number): MockFsEntry => ({
    kind: 'file',
    name,
    getFile: async () => new File([text], name, { lastModified }),
  })
  const workspaceSeedsDir = makeDirectoryEntry('workspace-seeds', {
    'agentic-graph-video-demo.md': makeFileEntry('agentic-graph-video-demo.md', '# seed from selected folder handle', 1710000000000),
    'ignore.txt': makeFileEntry('ignore.txt', 'ignore me', 1710000000000),
  })
  const docsDir = makeDirectoryEntry('docs', {
    'workspace-seeds': workspaceSeedsDir,
  })
  const rootDir = makeDirectoryEntry('root', {
    docs: docsDir,
  })

  try {
    store.setLocalMarkdownFolderHandle(rootDir as unknown as FileSystemDirectoryHandle, { accessMode: 'fs-access', name: 'root' })
    store.setLocalMarkdownSelectedFolderPath('docs/workspace-seeds')
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('seed from selected folder handle')) {
      throw new Error(`expected docs mirror to read markdown from selected local folder handle, got ${JSON.stringify(mirrored)}`)
    }
    if (mirrored.some(entry => String(entry.relPath || '').toLowerCase().endsWith('.txt'))) {
      throw new Error('expected docs mirror to include markdown-like files only from selected local folder handle')
    }
  } finally {
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
  }
}

export async function testWorkspaceSeedProviderPrefersSelectedLocalFolderHandleOverStorageExportInFullBootstrap() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  type MockFsEntry = {
    kind: 'file' | 'directory'
    name: string
    entries?: () => AsyncIterable<[string, MockFsEntry]>
    getDirectoryHandle?: (name: string) => Promise<MockFsEntry>
    getFile?: () => Promise<File>
  }
  const makeDirectoryEntry = (name: string, children: Record<string, MockFsEntry>): MockFsEntry => ({
    kind: 'directory',
    name,
    async *entries() {
      const keys = Object.keys(children)
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]!
        const child = children[key]
        if (!child) continue
        yield [key, child]
      }
    },
    getDirectoryHandle: async (childName: string) => {
      const child = children[String(childName || '').trim()]
      if (!child || child.kind !== 'directory') throw new Error(`missing directory ${childName}`)
      return child
    },
  })
  const makeFileEntry = (name: string, text: string, lastModified: number): MockFsEntry => ({
    kind: 'file',
    name,
    getFile: async () => new File([text], name, { lastModified }),
  })
  const docsDir = makeDirectoryEntry('docs', {
    'workspace-readme.md': makeFileEntry('workspace-readme.md', '# local handle workspace readme', 1710000008000),
  })
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000009000,
      documents: [
        {
          id: 'sf:maps',
          workspaceId: 'kgws:test',
          canonicalPath: `${AG_HUIJOOHWEE_DOCS_ROOT}/workspace-readme.md`,
          title: 'workspace-readme.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# stale export workspace readme',
          contentHash: 'maps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000008900,
          deleted: false,
        },
        {
          id: 'sf:video',
          workspaceId: 'kgws:test',
          canonicalPath: `${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-video-demo.md`,
          title: 'agentic-graph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# stale export video',
          contentHash: 'video',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000009000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownFolderHandle(docsDir as unknown as FileSystemDirectoryHandle, { accessMode: 'fs-access', name: 'docs' })
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    if (mirrored.length !== 1 || mirrored[0]?.relPath !== 'workspace-readme.md') {
      throw new Error(`expected selected local folder handle to stay authoritative in full bootstrap, got ${JSON.stringify(mirrored)}`)
    }
    if (String(mirrored[0]?.text || '').trim() !== '# local handle workspace readme') {
      throw new Error(`expected selected local folder handle text to beat storage export fallback, got ${JSON.stringify(mirrored)}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    store.setLocalMarkdownFolderHandle(previousHandle as FileSystemDirectoryHandle | null)
    store.setLocalMarkdownFolderCacheId(previousCacheId, null)
    store.setLocalMarkdownSelectedFolderPath(previousSelectedFolderPath)
    restore()
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  }
}

export async function testWorkspaceSourceRootSnapshotKeepsFullDocsTreeForSourceFilesSync() {
  const fs = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
      { path: '/docs/active.md', parentPath: '/docs', kind: 'file', name: 'active.md', text: '# Active', updatedAtMs: 2 },
      { path: '/docs/empty-placeholder.md', parentPath: '/docs', kind: 'file', name: 'empty-placeholder.md', text: '', updatedAtMs: 3 },
      { path: '/docs/model.gltf', parentPath: '/docs', kind: 'file', name: 'model.gltf', text: '{"asset":{"version":"2.0"}}', updatedAtMs: 4 },
    ],
  })
  const snapshot = await readWorkspaceSourceRootEntriesSnapshot({
    fs,
    activePath: '/docs/active.md',
  })
  const paths = snapshot
    .filter(entry => entry.kind === 'file')
    .map(entry => entry.path)
    .sort()
  for (const expectedPath of ['/docs/active.md', '/docs/empty-placeholder.md', '/docs/model.gltf']) {
    if (!paths.includes(expectedPath)) {
      throw new Error(`expected Source Files sync snapshot to keep full docs tree path ${expectedPath}, got ${JSON.stringify(paths)}`)
    }
  }
}

export async function testRuntimeSourceFilesReflectWorkspaceSeedFileContentChanges() {
  const name = 'agentic-graph-video-demo.md'
  await withLocalDocsMirror({ [name]: '# seed v1\n\nruntime reflection baseline' }, async ({ docsRoot, drain }) => {
    let root: ReturnType<typeof createRoot> | null = null
    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 5000
      while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('timed out waiting for source-file reflection of the changed local document')
        await new Promise<void>(resolve => setTimeout(resolve, 10))
      }
    }
    const reflects = (text: string) => useGraphStore.getState().sourceFiles.some(file =>
      file.source?.path === `workspace:/docs/${name}` && String(file.text || '').includes(text))
    try {
      resetWorkspaceFsForTests()
      const fs = await getWorkspaceFs()
      const activePath = `/docs/${name}` as const
      if (!(await fs.readFileText(activePath))?.includes('seed v1')) {
        throw new Error('expected native local mirror discovery to initialize v1 before runtime mount')
      }
      useMarkdownExplorerStore.getState().setActivePath(activePath)
      const container = document.createElement('section')
      document.body.appendChild(container)
      await act(async () => {
        root = createRoot(container)
        root.render(React.createElement(SourceFilesPersistenceBootstrap))
      })
      await waitFor(() => reflects('seed v1'))
      const { writeFile } = await import('node:fs/promises')
      await writeFile(path.join(docsRoot, name), '# seed v2\n\nruntime reflection updated')
      // Configured mirrors retain settled results for one second.
      await new Promise<void>(resolve => setTimeout(resolve, 1100))
      await fs.ensureSeed()
      if (!(await fs.readFileText(activePath))?.includes('seed v2')) {
        throw new Error('expected expired local mirror cache to refresh the workspace document to v2')
      }
      await waitFor(() => reflects('seed v2'))
    } finally {
      try { await act(async () => {
        root?.unmount()
        await drain()
        const release = await acquireWorkspaceSeedSyncSuspension(AbortSignal.timeout(1000))
        release()
        await drain()
      }) }
      finally { resetWorkspaceFsForTests() }
    }
  })
}

export async function testRuntimeSourceFilesSyncsFullDocsMirrorTree() {
  await withLocalDocsMirror({
    'active.md': '# Active', 'empty-placeholder.md': '', 'model.glb': Buffer.from([0x67, 0x6c, 0x54, 0x46]),
  }, async ({ drain }) => {
    let root: ReturnType<typeof createRoot> | null = null
    const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise<void>(resolve => setTimeout(resolve, 10))
      }
      const debugPaths = useGraphStore
        .getState()
        .sourceFiles
        .map(file => `${String(file.name || '')}::${String(file.source?.path || '')}`)
      throw new Error(`timed out waiting for full docs mirror Source Files sync; sourceFiles=${JSON.stringify(debugPaths)}`)
    }

    try {
      resetWorkspaceFsForTests()
      await getWorkspaceFs()
      useMarkdownExplorerStore.getState().setActivePath('/docs/active.md')
      const container = document.createElement('section')
      document.body.appendChild(container)
      await act(async () => {
        root = createRoot(container)
        root.render(React.createElement(SourceFilesPersistenceBootstrap))
      })
      await waitFor(() => {
        const sourcePaths = new Set(useGraphStore.getState().sourceFiles.map(file => String(file.source?.path || '')))
        return sourcePaths.has('workspace:/docs/active.md')
          && sourcePaths.has('workspace:/docs/empty-placeholder.md')
          && sourcePaths.has('workspace:/docs/model.glb')
      })
    } finally {
      try { await act(async () => {
        root?.unmount()
        await drain()
        const release = await acquireWorkspaceSeedSyncSuspension(AbortSignal.timeout(1000))
        release()
        await drain()
      }) }
      finally { resetWorkspaceFsForTests() }
    }
  })
}

export async function testHydrateWorkspaceEntriesInlineTextFallsBackToAgenticGraphStorageDocWhenFsTextIsBlank() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  const previousFetch = globalThis.fetch
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = 'kgws:test-fallback'
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/doc/')) return new Response('', { status: 404 })
    const hasCanonicalDocsPath =
      url.includes(encodeURIComponent('huijoohwee/docs/agentic-graph-video-demo.md'))
      || url.includes(encodeURIComponent('docs/agentic-graph-video-demo.md'))
    if (!hasCanonicalDocsPath) return new Response('', { status: 404 })
    return new Response('# hydrated from storage fallback', { status: 200 })
  }) as typeof fetch
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const entries = [
      {
        path: '/docs/agentic-graph-video-demo.md',
        parentPath: '/docs',
        kind: 'file',
        name: 'agentic-graph-video-demo.md',
        text: '',
        updatedAtMs: 1,
      },
    ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
    const hydrated = await hydrateWorkspaceEntriesInlineText({ fs, workspaceEntries: entries })
    if (hydrated === entries) throw new Error('expected blank docs workspace entry text to fallback-hydrate from agentic-graph storage doc endpoint')
    if (String(hydrated[0]?.text || '').trim() !== '# hydrated from storage fallback') {
      throw new Error(`expected docs entry fallback hydration from agentic-graph storage doc endpoint, got ${String(hydrated[0]?.text || '')}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
  }
}

export async function testHydrateWorkspaceEntriesInlineTextStorageFallbackCanonicalizesDuplicatedDocsPrefixPath() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
  const previousFetch = globalThis.fetch
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = 'kgws:test-fallback-canonical'
  const capturedUrls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    capturedUrls.push(url)
    if (!url.includes('/api/storage/doc/')) return new Response('', { status: 404 })
    const hasCanonicalDocsPath =
      url.includes(encodeURIComponent('huijoohwee/docs/agentic-graph-video-demo.md'))
      || url.includes(encodeURIComponent('docs/agentic-graph-video-demo.md'))
    if (!hasCanonicalDocsPath) return new Response('', { status: 404 })
    return new Response('# hydrated from canonicalized docs path', { status: 200 })
  }) as typeof fetch
  try {
    const fs: WorkspaceFs = {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async () => '',
      writeFileText: async () => void 0,
      createFile: async () => '/docs/tmp.md',
      createFolder: async () => '/docs',
      deleteEntry: async () => void 0,
    }
    const entries = [
      {
        path: '/docs/huijoohwee/docs/agentic-graph-video-demo.md',
        parentPath: '/docs/huijoohwee/docs',
        kind: 'file',
        name: 'agentic-graph-video-demo.md',
        text: '',
        updatedAtMs: 1,
      },
    ] as unknown as import('@/features/workspace-fs/types').WorkspaceEntry[]
    const hydrated = await hydrateWorkspaceEntriesInlineText({ fs, workspaceEntries: entries })
    if (hydrated === entries) throw new Error('expected storage fallback to hydrate duplicated docs-prefix workspace entry path')
    if (String(hydrated[0]?.text || '').trim() !== '# hydrated from canonicalized docs path') {
      throw new Error(`expected duplicated docs-prefix path to resolve to canonical storage doc fallback, got ${String(hydrated[0]?.text || '')}`)
    }
    if (capturedUrls.some(url => url.includes(encodeURIComponent('docs/huijoohwee/docs/agentic-graph-video-demo.md')))) {
      throw new Error(`expected duplicated docs-prefix canonical path not to be requested during storage fallback, got ${JSON.stringify(capturedUrls)}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
  }
}
