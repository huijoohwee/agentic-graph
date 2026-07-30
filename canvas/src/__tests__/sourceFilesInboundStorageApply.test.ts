import { applyPulledKnowgrphStorageChangesToSourceFiles } from '@/features/source-files/sourceFilesInboundStorageApply'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testPulledKnowgrphStorageChangesMaterializeIntoVisibleSourceFilesWithoutAutoComposingWorkspaceDocs() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])

  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: 'kgws:remote-visible',
    changes: {
      documents: [
        {
          id: 'sf:remote_demo',
          workspaceId: 'kgws:remote-visible',
          canonicalPath: 'workspace:/remote-demo.md',
          title: 'remote-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: 'sf-graph:remote_demo',
          sourceKind: 'markdown',
          contentMd: '# Remote Demo',
          contentHash: 'sha256:remote-demo',
          parserVersion: 'markdown-frontmatter',
          revision: 2,
          updatedAtMs: 1_777_200_000_000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [
        {
          id: 'sf-graph:remote_demo',
          documentId: 'sf:remote_demo',
          workspaceId: 'kgws:remote-visible',
          graphRevision: 4,
          graphHash: 'sha256:remote-graph',
          graphJson: {
            type: 'Graph',
            nodes: [{ id: 'remote-node', label: 'Remote Node' }],
            edges: [],
            metadata: {},
          },
          layoutJson: null,
          derivedFromDocumentRevision: 2,
          updatedAtMs: 1_777_200_000_100,
        },
      ],
    },
  })

  await result.completion
  if (!result.applied) throw new Error('expected pulled storage changes to apply into visible source files')
  const store = useGraphStore.getState()
  const file = store.sourceFiles.find(entry => entry.id === 'remote_demo') || null
  if (!file) throw new Error('expected pulled remote document to become a visible source file')
  if (String(file.text || '') !== '# Remote Demo') throw new Error('expected visible source file text to reflect pulled remote markdown')
  if ((file.parsedGraphData?.nodes || []).length !== 1) throw new Error('expected visible source file to carry pulled graph snapshot data')
  if (Array.isArray(store.graphData?.nodes) && store.graphData.nodes.length > 0) {
    throw new Error('expected pulled workspace-backed source files to stay visible-only and avoid automatic canvas recomposition')
  }
}

export async function testPulledKnowgrphStorageDeletesRemoveVisibleSourceFiles() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([
    {
      id: 'remote_demo',
      name: 'remote-demo.md',
      text: '# Remote Demo',
      enabled: true,
      status: 'parsed',
      parsedParserId: 'markdown-frontmatter',
      parsedTextHash: 'sha256:remote-demo',
      parsedGraphRevision: 1,
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'remote-node', label: 'Remote Node', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      source: { kind: 'local', path: 'workspace:/remote-demo.md' },
    },
  ])

  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: 'kgws:remote-visible',
    changes: {
      documents: [
        {
          id: 'sf:remote_demo',
          workspaceId: 'kgws:remote-visible',
          canonicalPath: 'workspace:/remote-demo.md',
          title: 'remote-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: 'sf-graph:remote_demo',
          sourceKind: 'markdown',
          contentMd: '# Remote Demo',
          contentHash: 'sha256:remote-demo',
          parserVersion: 'markdown-frontmatter',
          revision: 3,
          updatedAtMs: 1_777_200_000_200,
          deleted: true,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    },
  })

  await result.completion
  if (!result.applied) throw new Error('expected pulled delete to apply into visible source files')
  const file = useGraphStore.getState().sourceFiles.find(entry => entry.id === 'remote_demo') || null
  if (file) throw new Error('expected pulled delete tombstone to remove the visible source file')
}

export async function testPulledKnowgrphStorageDocsCanonicalPathMaterializeIntoWorkspaceDocsSourceFiles() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])

  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: 'kgws:canonical-docs',
    changes: {
      documents: [
        {
          id: 'docs:maps_places',
          workspaceId: 'kgws:canonical-docs',
          canonicalPath: 'huijoohwee/docs/knowgrph-maps-places.md',
          title: 'knowgrph-maps-places.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# Maps Places',
          contentHash: 'sha256:maps-places',
          parserVersion: 'seed-storage-docs-to-cloudflare:v1',
          revision: 8,
          updatedAtMs: 1_777_300_000_000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    },
  })

  await result.completion
  if (!result.applied) throw new Error('expected pulled canonical docs record to materialize into visible source files')
  const file = useGraphStore.getState().sourceFiles.find(entry => String(entry.source?.path || '') === 'workspace:/docs/knowgrph-maps-places.md') || null
  if (!file) throw new Error('expected pulled canonical docs record to map into workspace:/docs source path')
  if (String(file.text || '') !== '# Maps Places') throw new Error('expected pulled canonical docs markdown content to become visible source file text')
}

export async function testPulledKnowgrphStorageUsesDocumentChunksWhenContentMdIsBlank() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])

  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: 'kgws:canonical-docs',
    changes: {
      documents: [
        {
          id: 'docs:video_demo',
          workspaceId: 'kgws:canonical-docs',
          canonicalPath: 'huijoohwee/docs/knowgrph-video-demo.md',
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '',
          contentHash: 'sha256:video-demo',
          parserVersion: 'seed-storage-docs-to-cloudflare:v1',
          revision: 9,
          updatedAtMs: 1_777_300_000_000,
          deleted: false,
        },
      ],
      documentChunks: [
        {
          id: 'chunk:video_demo:01',
          documentId: 'docs:video_demo',
          workspaceId: 'kgws:canonical-docs',
          chunkKey: 'intro',
          chunkOrder: 1,
          heading: null,
          markdown: 'Second chunk',
          tokenEstimate: 8,
          contentHash: 'sha256:chunk-2',
          updatedAtMs: 1_777_300_000_011,
        },
        {
          id: 'chunk:video_demo:00',
          documentId: 'docs:video_demo',
          workspaceId: 'kgws:canonical-docs',
          chunkKey: 'title',
          chunkOrder: 0,
          heading: null,
          markdown: '# Video Demo',
          tokenEstimate: 10,
          contentHash: 'sha256:chunk-1',
          updatedAtMs: 1_777_300_000_010,
        },
      ],
      graphSnapshots: [],
    },
  })

  await result.completion
  if (!result.applied) throw new Error('expected pulled canonical docs record to apply when markdown is in document chunks')
  const file = useGraphStore.getState().sourceFiles.find(entry => String(entry.source?.path || '') === 'workspace:/docs/knowgrph-video-demo.md') || null
  if (!file) throw new Error('expected pulled canonical docs chunked record to map into workspace:/docs source path')
  if (String(file.text || '').trim() !== '# Video Demo\n\nSecond chunk') {
    throw new Error(`expected chunked markdown reconstruction for visible source file text, got "${String(file.text || '')}"`)
  }
}

export async function testPulledKnowgrphStorageDoesNotOverwriteExistingVisibleTextWithBlankDocumentContent() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([
    {
      id: 'ws:video-demo',
      name: 'knowgrph-video-demo.md',
      text: '# Existing hydrated text',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'workspace:/docs/knowgrph-video-demo.md' },
    },
  ])

  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: 'kgws:canonical-docs',
    changes: {
      documents: [
        {
          id: 'docs:video_demo',
          workspaceId: 'kgws:canonical-docs',
          canonicalPath: 'huijoohwee/docs/knowgrph-video-demo.md',
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '',
          contentHash: 'sha256:video-demo',
          parserVersion: 'seed-storage-docs-to-cloudflare:v1',
          revision: 10,
          updatedAtMs: 1_777_300_100_000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    },
  })

  await result.completion
  if (!result.applied) throw new Error('expected pulled canonical docs record to apply')
  const file = useGraphStore.getState().sourceFiles.find(entry => String(entry.source?.path || '') === 'workspace:/docs/knowgrph-video-demo.md') || null
  if (!file) throw new Error('expected canonical docs source file to remain present after pull apply')
  if (String(file.text || '').trim() !== '# Existing hydrated text') {
    throw new Error(`expected blank pulled document content not to clobber existing visible source file text, got "${String(file.text || '')}"`)
  }
}

export async function testPulledKnowgrphStorageCanonicalizesExistingWorkspaceDocsAliasPathBeforeMatching() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([
    {
      id: 'ws:alias-path',
      name: 'knowgrph-video-demo.md',
      text: '',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: 'workspace:/docs/huijoohwee/docs/knowgrph-video-demo.md' },
    },
  ])

  const result = applyPulledKnowgrphStorageChangesToSourceFiles({
    workspaceId: 'kgws:canonical-docs',
    changes: {
      documents: [
        {
          id: 'docs:video_demo',
          workspaceId: 'kgws:canonical-docs',
          canonicalPath: 'huijoohwee/docs/knowgrph-video-demo.md',
          title: 'knowgrph-video-demo.md',
          docType: 'markdown',
          lang: null,
          graphId: null,
          sourceKind: 'markdown',
          contentMd: '# Canonical Pulled Text',
          contentHash: 'sha256:video-demo',
          parserVersion: 'seed-storage-docs-to-cloudflare:v1',
          revision: 11,
          updatedAtMs: 1_777_300_200_000,
          deleted: false,
        },
      ],
      documentChunks: [],
      graphSnapshots: [],
    },
  })

  await result.completion
  if (!result.applied) throw new Error('expected pulled canonical docs record to apply into existing alias workspace entry')
  const files = useGraphStore.getState().sourceFiles.filter(entry => String(entry.name || '') === 'knowgrph-video-demo.md')
  if (files.length !== 1) {
    throw new Error(`expected alias + canonical pulled docs records to collapse into one source file identity, got ${files.length}`)
  }
  if (String(files[0]?.source?.path || '') !== 'workspace:/docs/knowgrph-video-demo.md') {
    throw new Error(`expected pulled docs canonicalization to normalize alias source path, got "${String(files[0]?.source?.path || '')}"`)
  }
  if (String(files[0]?.text || '').trim() !== '# Canonical Pulled Text') {
    throw new Error(`expected pulled canonical docs text to hydrate normalized existing entry, got "${String(files[0]?.text || '')}"`)
  }
}

export async function testPulledKnowgrphStorageHydratesBlankCanonicalDocsViaStorageDocFallback() {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousFetch = globalThis.fetch
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co'
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : (input as URL).toString())
    if (!url.includes('/api/storage/doc/')) return new Response('', { status: 404 })
    if (!url.includes(encodeURIComponent('kgws:canonical-docs'))) return new Response('', { status: 404 })
    if (!url.includes(encodeURIComponent('huijoohwee/docs/knowgrph-storage-sync-cloudflare-d1.md'))) return new Response('', { status: 404 })
    return new Response('# Hydrated via storage doc fallback', { status: 200 })
  }) as typeof fetch
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])

  try {
    const result = applyPulledKnowgrphStorageChangesToSourceFiles({
      workspaceId: 'kgws:canonical-docs',
      changes: {
        documents: [
          {
            id: 'docs:storage_sync_cloudflare_d1',
            workspaceId: 'kgws:canonical-docs',
            canonicalPath: 'huijoohwee/docs/knowgrph-storage-sync-cloudflare-d1.md',
            title: 'knowgrph-storage-sync-cloudflare-d1.md',
            docType: 'markdown',
            lang: null,
            graphId: null,
            sourceKind: 'markdown',
            contentMd: '',
            contentHash: 'sha256:storage-sync-d1',
            parserVersion: 'seed-storage-docs-to-cloudflare:v1',
            revision: 12,
            updatedAtMs: 1_777_300_300_000,
            deleted: false,
          },
        ],
        documentChunks: [],
        graphSnapshots: [],
      },
    })
    await result.completion
    if (!result.applied) throw new Error('expected pulled canonical docs record to apply before async fallback hydration')

    const waitUntil = async (predicate: () => boolean, timeoutMs = 2500) => {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (predicate()) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error('timed out waiting for storage doc fallback hydration to materialize pulled canonical docs text')
    }

    await waitUntil(() => {
      const file = useGraphStore.getState().sourceFiles.find(entry => String(entry.source?.path || '') === 'workspace:/docs/knowgrph-storage-sync-cloudflare-d1.md') || null
      return String(file?.text || '').trim() === '# Hydrated via storage doc fallback'
    })
  } finally {
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  }
}
