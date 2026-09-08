import path from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readWorkspaceInitializationDocsMirrorEntries } from '@/features/workspace-fs/workspaceSeedProvider'
import { AG_HUIJOOHWEE_DOCS_ROOT, withFetchAndEnv, withStoreMirrorState } from './helpers/workspaceSeedMirrorHarness'
import { createFakeAgenticGraphStorageBrowserSession } from './helpers/fake-agentic-graph-storage-browser-session'
import { AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID, hashAgenticGraphStorageContent } from '@/lib/storage/agentic-graph-storage-sync-contract'

export async function testWorkspaceSeedProviderPrefersAgenticGraphStorageExportWhenConfigured() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000005000,
      documents: [
        {
          id: 'sf:video',
          workspaceId: 'kgws:test',
          canonicalPath: `${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-video-demo.md`,
          title: 'agentic-graph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# from agentic-graph storage export',
          contentHash: 'x',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000005000,
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
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
    if (!target || !String(target.text || '').includes('from agentic-graph storage export')) {
      throw new Error(`expected docs mirror to prefer agentic-graph storage export when configured, got ${JSON.stringify(mirrored)}`)
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

export async function testWorkspaceSeedProviderPrefersSourceFilesDocViewOverLargerStorageExportDataset() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (url.includes('/api/storage/doc/')) {
      if (
        url.includes(encodeURIComponent('huijoohwee/docs/agentic-graph-video-demo.md'))
        || url.includes(encodeURIComponent('docs/agentic-graph-video-demo.md'))
      ) {
        return new Response('# from source-files doc view', { status: 200 })
      }
      return new Response('', { status: 404 })
    }
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000007000,
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
          contentMd: '# stale export maps',
          contentHash: 'maps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006900,
          deleted: false,
        },
        {
          id: 'sf:grabmaps',
          workspaceId: 'kgws:test',
          canonicalPath: `${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-maps-grabmap-multim-demo.md`,
          title: 'agentic-graph-maps-grabmap-multim-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# stale export grabmaps',
          contentHash: 'grabmaps',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006950,
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
          updatedAtMs: 1710000007000,
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
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([
      {
        id: 'sf-video',
        name: 'agentic-graph-video-demo.md',
        text: '',
        enabled: true,
        status: 'idle',
        source: { kind: 'local', path: `${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-video-demo.md` },
      },
    ])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    if (mirrored.length !== 1 || mirrored[0]?.relPath !== 'agentic-graph-video-demo.md') {
      throw new Error(`expected source-files doc view to stay authoritative for selected workspace files, got ${JSON.stringify(mirrored)}`)
    }
    if (String(mirrored[0]?.text || '').trim() !== '# from source-files doc view') {
      throw new Error(`expected source-files doc view to beat larger stale storage export dataset, got ${JSON.stringify(mirrored)}`)
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

export async function testWorkspaceSeedProviderPrefersCompleteStorageExportDatasetForSync() {
  const workspaceId = AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID, selectedPath = 'docs/mirror-export-fixture'
  await withStoreMirrorState(async () => {
    const session = await createFakeAgenticGraphStorageBrowserSession(workspaceId, { origin: window.location.origin })
    const documents = session.env.DB.documents
    const put = (id: string, name: string, text: string) => documents.set(id, {
      id, workspace_id: workspaceId, canonical_path: `${selectedPath}/${name}`, title: name, doc_type: 'markdown',
      lang: null, graph_id: null, source_kind: 'markdown', content_md: text, content_hash: hashAgenticGraphStorageContent(text),
      parser_version: 'source-files', revision: 1, deleted: 0,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    })
    put('sf:readme', 'workspace-readme.md', '# export maps')
    put('sf:grabmaps', 'agentic-graph-maps-grabmap-multim-demo.md', '# export grabmaps')
    put('sf:video', 'agentic-graph-video-demo.md', '# from source-files doc view')
    const requests: Array<{ path: string; credentials: RequestCredentials }> = []
    const pending = new Set<Promise<Response>>()
    let firstDocumentText: string | null = null
    const fetcher = (async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, session.origin)
      if (url.origin !== session.origin) throw new Error('Storage mirror fixture cannot access an external origin')
      if (url.pathname === '/__agentic_os_fs_list') return new Response('', { status: 404 })
      requests.push({ path: url.pathname, credentials: init?.credentials || 'same-origin' })
      const operation = (async () => {
        const response = await session.fetch(input, init)
        if (firstDocumentText === null && url.pathname.startsWith('/api/storage/doc/') && response.ok) {
          firstDocumentText = await response.clone().text()
          // A fresh export observes the real remote row update after the narrower read.
          put('sf:video', 'agentic-graph-video-demo.md', '# export video')
        }
        return response
      })()
      pending.add(operation)
      try { return await operation } finally { pending.delete(operation) }
    }) as typeof fetch
    await withFetchAndEnv({
      VITE_AGENTIC_OS_STORAGE_BASE_URL: session.origin, VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: workspaceId,
      VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: '', VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: '',
      VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: 'true', VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL: 'false',
    }, fetcher, async () => {
      useGraphStore.setState({
        localMarkdownFolderHandle: null, localMarkdownFolderName: null, localMarkdownFolderAccessMode: null,
        localMarkdownFolderCacheId: null, localMarkdownSelectedFolderPath: selectedPath,
        sourceFiles: [{ id: 'sf-video', name: 'agentic-graph-video-demo.md', text: '', enabled: true, status: 'idle',
          source: { kind: 'local', path: `${selectedPath}/agentic-graph-video-demo.md` } }],
      })
      let mirrored: Awaited<ReturnType<typeof readWorkspaceInitializationDocsMirrorEntries>>
      try { mirrored = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true }) }
      finally { while (pending.size) await Promise.allSettled([...pending]) }
      if (mirrored.length !== 3) {
        throw new Error(`expected sync mirror to prefer fuller storage export dataset, got ${JSON.stringify(mirrored)}`)
      }
      const relPaths = mirrored.map(entry => entry.relPath)
      if (!relPaths.includes('agentic-graph-video-demo.md') || !relPaths.includes('workspace-readme.md')) {
        throw new Error(`expected sync mirror to keep exported docs set, got ${JSON.stringify(mirrored)}`)
      }
      const video = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
      if (String(video?.text || '').trim() !== '# export video') {
        throw new Error(`expected sync mirror to use export text for complete dataset mode, got ${JSON.stringify(mirrored)}`)
      }
      if (firstDocumentText !== '# from source-files doc view'
        || !requests.some(request => request.path.startsWith('/api/storage/export/'))
        || requests.some(request => request.credentials !== 'same-origin')) {
        throw new Error('Expected authenticated native doc-view and complete-export reads for the selected workspace')
      }
    })
  })
}

export async function testWorkspaceSeedProviderStorageExportRebuildsMarkdownFromChunksWhenContentMdBlank() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/export/')) return new Response('', { status: 404 })
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000006000,
      documents: [
        {
          id: 'docs:video_demo',
          workspaceId: 'kgws:test',
          canonicalPath: `${AG_HUIJOOHWEE_DOCS_ROOT}/agentic-graph-video-demo.md`,
          title: 'agentic-graph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '',
          contentHash: 'sha256:video-demo',
          parserVersion: 'source-files',
          revision: 1,
          updatedAtMs: 1710000006000,
          deleted: false,
        },
      ],
      documentChunks: [
        {
          id: 'chunk:video_demo:1',
          documentId: 'docs:video_demo',
          workspaceId: 'kgws:test',
          chunkKey: 'second',
          chunkOrder: 1,
          heading: null,
          markdown: 'from chunk 2',
          tokenEstimate: 2,
          contentHash: 'sha256:c2',
          updatedAtMs: 1710000006002,
        },
        {
          id: 'chunk:video_demo:0',
          documentId: 'docs:video_demo',
          workspaceId: 'kgws:test',
          chunkKey: 'first',
          chunkOrder: 0,
          heading: null,
          markdown: '# from chunk 1',
          tokenEstimate: 3,
          contentHash: 'sha256:c1',
          updatedAtMs: 1710000006001,
        },
      ],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    const mirrored = await readWorkspaceInitializationDocsMirrorEntries()
    const target = mirrored.find(entry => entry.relPath === 'agentic-graph-video-demo.md') || null
    if (!target || String(target.text || '').trim() !== '# from chunk 1\n\nfrom chunk 2') {
      throw new Error(`expected docs mirror to reconstruct markdown from export chunks when contentMd is blank, got ${JSON.stringify(mirrored)}`)
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

export async function testWorkspaceSeedProviderUsesSameOriginStoragePathOnLocalhostDev() {
  const previousBaseUrl = process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousHandle = store.localMarkdownFolderHandle
  const previousCacheId = store.localMarkdownFolderCacheId
  const previousSelectedFolderPath = store.localMarkdownSelectedFolderPath
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://airvio.co'
  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = AG_HUIJOOHWEE_DOCS_ROOT
  const capturedRequestUrls: string[] = []
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    capturedRequestUrls.push(String(typeof input === 'string' ? input : (input as URL).toString()))
    return new Response(JSON.stringify({
      ok: true,
      apiVersion: '2026-05-04',
      workspaceId: 'kgws:test',
      exportedAtMs: 1710000005000,
      documents: [],
      documentChunks: [],
      graphSnapshots: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    store.setLocalMarkdownFolderHandle(null)
    store.setLocalMarkdownFolderCacheId(null, null)
    store.setLocalMarkdownSelectedFolderPath('docs')
    store.setSourceFiles([])
    await readWorkspaceInitializationDocsMirrorEntries()
    if (!capturedRequestUrls.some(url => url.startsWith('/api/storage/export/'))) {
      throw new Error(`expected localhost dev storage export call to use same-origin proxy path, got ${JSON.stringify(capturedRequestUrls)}`)
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
