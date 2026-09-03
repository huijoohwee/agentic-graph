import storageWorkerModule from '../../../cloudflare/workers/agentic-graph-storage/index.ts'
import {
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
  CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
  AGENTIC_OS_STORAGE_API_VERSION,
  AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS,
  AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
  buildAgenticGraphStorageDocPath,
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
  hashAgenticGraphStorageContent,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'

const worker = (
  typeof (storageWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? storageWorkerModule
    : (storageWorkerModule as unknown as { default: typeof storageWorkerModule }).default
) as typeof storageWorkerModule

const assertCrawlerVisibleDocHeaders = (response: Response, routeLabel: string) => {
  if (!String(response.headers.get('content-type') || '').includes('text/markdown')) {
    throw new Error(`expected ${routeLabel} response to be served as text/markdown`)
  }
  if (response.headers.get('x-robots-tag') !== 'all') {
    throw new Error(`expected ${routeLabel} response to allow crawler indexing`)
  }
  if (response.headers.get(AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS.source) !== 'd1-documents-doc-view') {
    throw new Error(`expected ${routeLabel} response to declare the D1 doc-view crawler source`)
  }
  if (response.headers.get(AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy) !== 'cloudflare-zone-policy') {
    throw new Error(`expected ${routeLabel} response to declare Cloudflare-owned Pay Per Crawl policy`)
  }
  if (!String(response.headers.get('link') || '').includes(CLOUDFLARE_PAY_PER_CRAWL_DOC_URL)) {
    throw new Error(`expected ${routeLabel} response to link the Cloudflare Pay Per Crawl reference`)
  }
}

export async function testAgenticGraphStorageWorkerPushPullAndExportFlow() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const pushResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: 'wk_1',
        deviceId: 'dev_1',
        mutations: [
          {
            mutationId: 'mut_doc_1',
            workspaceId: 'wk_1',
            entity: 'document',
            op: 'upsert',
            recordId: 'doc_1',
            baseRevision: null,
            record: {
              id: 'doc_1',
              workspaceId: 'wk_1',
              canonicalPath: 'docs/example.md',
              title: 'Example',
              docType: 'note',
              lang: 'en-US',
              graphId: 'graph_1',
              sourceKind: 'markdown',
              contentMd: '# Example',
              contentHash: hashAgenticGraphStorageContent('# Example'),
              parserVersion: '1.0.0',
              revision: 1,
              updatedAtMs: 1_777_000_000_000,
              deleted: false,
            },
          },
          {
            mutationId: 'mut_chunk_1',
            workspaceId: 'wk_1',
            entity: 'documentChunk',
            op: 'upsert',
            recordId: 'chunk_1',
            baseRevision: null,
            record: {
              id: 'chunk_1',
              documentId: 'doc_1',
              workspaceId: 'wk_1',
              chunkKey: 'frontmatter',
              chunkOrder: 0,
              heading: null,
              markdown: 'title: Example',
              tokenEstimate: 12,
              contentHash: hashAgenticGraphStorageContent('title: Example'),
              updatedAtMs: 1_777_000_000_100,
            },
          },
          {
            mutationId: 'mut_graph_1',
            workspaceId: 'wk_1',
            entity: 'graphSnapshot',
            op: 'upsert',
            recordId: 'graphsnap_1',
            baseRevision: null,
            record: {
              id: 'graphsnap_1',
              documentId: 'doc_1',
              workspaceId: 'wk_1',
              graphRevision: 1,
              graphHash: 'sha256:graph1',
              graphJson: { type: 'Graph', nodes: [], edges: [] },
              layoutJson: { mode: '2d' },
              derivedFromDocumentRevision: 1,
              updatedAtMs: 1_777_000_000_200,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  if (!pushResponse.ok) throw new Error(`expected push response ok, received ${pushResponse.status}`)
  const pushJson = await pushResponse.json() as { acknowledgements?: Array<{ status?: string }> }
  if (!Array.isArray(pushJson.acknowledgements) || pushJson.acknowledgements.length !== 3) {
    throw new Error('expected push response to acknowledge all submitted mutations')
  }
  if (pushJson.acknowledgements.some(ack => ack.status !== 'applied')) {
    throw new Error('expected all initial storage mutations to apply cleanly')
  }

  const pullResponse = await worker.fetch(
    new Request('https://example.com/api/storage/pull', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: 'wk_1',
        deviceId: 'dev_1',
        since: null,
      }),
    }),
    env as never,
  )
  if (!pullResponse.ok) throw new Error(`expected pull response ok, received ${pullResponse.status}`)
  const pullJson = await pullResponse.json() as {
    changes?: { documents?: unknown[]; documentChunks?: unknown[]; graphSnapshots?: unknown[] }
  }
  if (pullJson.changes?.documents?.length !== 1) throw new Error('expected pull to return one document')
  if (pullJson.changes?.documentChunks?.length !== 1) throw new Error('expected pull to return one chunk')
  if (pullJson.changes?.graphSnapshots?.length !== 1) throw new Error('expected pull to return one graph snapshot')

  const exportResponse = await worker.fetch(
    new Request('https://example.com/api/storage/export/wk_1'),
    env as never,
  )
  if (!exportResponse.ok) throw new Error(`expected export response ok, received ${exportResponse.status}`)
  const exportJson = await exportResponse.json() as { documents?: unknown[]; documentChunks?: unknown[]; graphSnapshots?: unknown[] }
  if (exportJson.documents?.length !== 1 || exportJson.documentChunks?.length !== 1 || exportJson.graphSnapshots?.length !== 1) {
    throw new Error('expected export to return the full workspace storage bundle')
  }
}

export async function testAgenticGraphStorageWorkerRepeatedPushPullReusesSyncDeviceRow() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const createPushRequest = () =>
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: 'wk_repeat',
        deviceId: 'dev_repeat',
        mutations: [],
      }),
    })
  const createPullRequest = () =>
    new Request('https://example.com/api/storage/pull', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: 'wk_repeat',
        deviceId: 'dev_repeat',
        since: null,
      }),
    })

  const firstPush = await worker.fetch(createPushRequest(), env as never)
  const secondPush = await worker.fetch(createPushRequest(), env as never)
  const firstPull = await worker.fetch(createPullRequest(), env as never)
  const secondPull = await worker.fetch(createPullRequest(), env as never)

  if (!firstPush.ok || !secondPush.ok || !firstPull.ok || !secondPull.ok) {
    throw new Error('expected repeated push/pull requests for the same device to stay successful')
  }
  if (env.DB.syncDevices.size !== 1) {
    throw new Error(`expected repeated device registration to keep a single sync device row, got ${env.DB.syncDevices.size}`)
  }
}

export async function testAgenticGraphStorageWorkerReturnsConflictForStaleDocumentRevision() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const initialRequest = new Request('https://example.com/api/storage/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
      workspaceId: 'wk_conflict',
      deviceId: 'dev_a',
      mutations: [
        {
          mutationId: 'mut_initial',
          workspaceId: 'wk_conflict',
          entity: 'document',
          op: 'upsert',
          recordId: 'doc_conflict',
          baseRevision: null,
          record: {
            id: 'doc_conflict',
            workspaceId: 'wk_conflict',
            canonicalPath: 'docs/conflict.md',
            title: 'Conflict',
            docType: 'note',
            lang: 'en-US',
            graphId: null,
            sourceKind: 'markdown',
            contentMd: '# Conflict',
            contentHash: hashAgenticGraphStorageContent('# Conflict'),
            parserVersion: '1.0.0',
            revision: 2,
            updatedAtMs: 1_777_000_001_000,
            deleted: false,
          },
        },
      ],
    }),
  })
  await worker.fetch(initialRequest, env as never)

  const staleResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: 'wk_conflict',
        deviceId: 'dev_b',
        mutations: [
          {
            mutationId: 'mut_stale',
            workspaceId: 'wk_conflict',
            entity: 'document',
            op: 'upsert',
            recordId: 'doc_conflict',
            baseRevision: 1,
            record: {
              id: 'doc_conflict',
              workspaceId: 'wk_conflict',
              canonicalPath: 'docs/conflict.md',
              title: 'Conflict',
              docType: 'note',
              lang: 'en-US',
              graphId: null,
              sourceKind: 'markdown',
              contentMd: '# Conflict stale',
              contentHash: hashAgenticGraphStorageContent('# Conflict stale'),
              parserVersion: '1.0.0',
              revision: 1,
              updatedAtMs: 1_777_000_001_100,
              deleted: false,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  const staleJson = await staleResponse.json() as { acknowledgements?: Array<{ status?: string }> }
  if (staleJson.acknowledgements?.[0]?.status !== 'conflict') {
    throw new Error('expected stale document push to return a conflict acknowledgement')
  }
}

export async function testAgenticGraphStorageWorkerHandlesCorsPreflightAndHeaders() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const preflightResponse = await worker.fetch(
    new Request('https://example.com/api/storage/pull', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5174',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }),
    env as never,
  )
  if (preflightResponse.status !== 204) {
    throw new Error(`expected OPTIONS preflight status 204, received ${preflightResponse.status}`)
  }
  if (preflightResponse.headers.get('access-control-allow-origin') !== '*') {
    throw new Error('expected preflight response to expose access-control-allow-origin header')
  }
  const exportResponse = await worker.fetch(
    new Request('https://example.com/api/storage/export/wk_1'),
    env as never,
  )
  if (exportResponse.headers.get('access-control-allow-origin') !== '*') {
    throw new Error('expected export response to include CORS headers')
  }
}

export async function testAgenticGraphStorageWorkerDocViewRebuildsChunkOnlyMarkdown() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const pushResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: 'wk_doc_view_chunks',
        deviceId: 'dev_doc_view_chunks',
        mutations: [
          {
            mutationId: 'mut_doc_chunk_only',
            workspaceId: 'wk_doc_view_chunks',
            entity: 'document',
            op: 'upsert',
            recordId: 'doc_chunk_only',
            baseRevision: null,
            record: {
              id: 'doc_chunk_only',
              workspaceId: 'wk_doc_view_chunks',
              canonicalPath: 'huijoohwee/docs/agentic-graph-video-demo.md',
              title: 'agentic-graph-video-demo.md',
              docType: 'markdown',
              lang: null,
              graphId: null,
              sourceKind: 'markdown',
              contentMd: '',
              contentHash: hashAgenticGraphStorageContent(''),
              parserVersion: 'seed-storage-docs-to-cloudflare:v1',
              revision: 1,
              updatedAtMs: 1_777_300_400_000,
              deleted: false,
            },
          },
          {
            mutationId: 'mut_doc_chunk_only_0',
            workspaceId: 'wk_doc_view_chunks',
            entity: 'documentChunk',
            op: 'upsert',
            recordId: 'chunk_doc_view_0',
            baseRevision: null,
            record: {
              id: 'chunk_doc_view_0',
              documentId: 'doc_chunk_only',
              workspaceId: 'wk_doc_view_chunks',
              chunkKey: 'title',
              chunkOrder: 0,
              heading: null,
              markdown: '# Chunk Title',
              tokenEstimate: 4,
              contentHash: hashAgenticGraphStorageContent('# Chunk Title'),
              updatedAtMs: 1_777_300_400_001,
            },
          },
          {
            mutationId: 'mut_doc_chunk_only_1',
            workspaceId: 'wk_doc_view_chunks',
            entity: 'documentChunk',
            op: 'upsert',
            recordId: 'chunk_doc_view_1',
            baseRevision: null,
            record: {
              id: 'chunk_doc_view_1',
              documentId: 'doc_chunk_only',
              workspaceId: 'wk_doc_view_chunks',
              chunkKey: 'body',
              chunkOrder: 1,
              heading: null,
              markdown: 'Chunk body',
              tokenEstimate: 3,
              contentHash: hashAgenticGraphStorageContent('Chunk body'),
              updatedAtMs: 1_777_300_400_002,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  if (!pushResponse.ok) throw new Error(`expected push ok before doc view read, received ${pushResponse.status}`)

  const docViewResponse = await worker.fetch(
    new Request('https://example.com/api/storage/doc/wk_doc_view_chunks/huijoohwee%2Fdocs%2Fagentic-graph-video-demo.md'),
    env as never,
  )
  if (!docViewResponse.ok) throw new Error(`expected doc view response ok, received ${docViewResponse.status}`)
  assertCrawlerVisibleDocHeaders(docViewResponse, 'workspace doc view')
  const markdown = await docViewResponse.text()
  if (markdown.trim() !== '# Chunk Title\n\nChunk body') {
    throw new Error(`expected doc view to rebuild chunk-only markdown, got "${markdown}"`)
  }
}

export async function testAgenticGraphStorageWorkerServesDefaultDocViewWithoutWorkspaceId() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  await pushCrawlerDocument({
    env,
    workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
    documentId: 'doc_default_doc_view',
    canonicalPath: 'huijoohwee/docs/default-doc.md',
    title: 'Default Doc',
    contentMd: '# Default Doc',
  })

  const response = await worker.fetch(
    new Request(`https://example.com${buildAgenticGraphStorageDefaultDocPath('huijoohwee/docs/default-doc.md')}`),
    env as never,
  )
  if (!response.ok) throw new Error(`expected default doc view response ok, received ${response.status}`)
  assertCrawlerVisibleDocHeaders(response, 'default doc view')
  const markdown = await response.text()
  if (markdown.trim() !== '# Default Doc') {
    throw new Error(`expected default doc view to return the default workspace markdown, got "${markdown}"`)
  }
}

const pushCrawlerDocument = async (args: {
  env: ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv>
  workspaceId: string
  documentId: string
  canonicalPath: string
  title: string
  contentMd: string
  deleted?: boolean
}) => {
  const response = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: args.workspaceId,
        deviceId: 'dev_crawler',
        mutations: [
          {
            mutationId: `mut_${args.documentId}`,
            workspaceId: args.workspaceId,
            entity: 'document',
            op: 'upsert',
            recordId: args.documentId,
            baseRevision: null,
            record: {
              id: args.documentId,
              workspaceId: args.workspaceId,
              canonicalPath: args.canonicalPath,
              title: args.title,
              docType: 'markdown',
              lang: null,
              graphId: null,
              sourceKind: 'markdown',
              contentMd: args.contentMd,
              contentHash: hashAgenticGraphStorageContent(args.contentMd),
              parserVersion: 'source-files',
              revision: 1,
              updatedAtMs: 1_777_400_000_000,
              deleted: args.deleted === true,
            },
          },
        ],
      }),
    }),
    args.env as never,
  )
  if (!response.ok) throw new Error(`expected crawler fixture push ok, received ${response.status}`)
}

export async function testAgenticGraphStorageWorkerServesSourceFilesCrawlerIndex() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  await pushCrawlerDocument({
    env,
    workspaceId: 'wk_crawler',
    documentId: 'doc_alpha',
    canonicalPath: 'huijoohwee/docs/alpha.md',
    title: 'Alpha Source',
    contentMd: '# Alpha',
  })
  await pushCrawlerDocument({
    env,
    workspaceId: 'wk_crawler',
    documentId: 'doc_deleted',
    canonicalPath: 'huijoohwee/docs/deleted.md',
    title: 'Deleted Source',
    contentMd: '# Deleted',
    deleted: true,
  })

  const response = await worker.fetch(
    new Request(`https://example.com${buildAgenticGraphStorageSourceFilesIndexPath('wk_crawler')}`),
    env as never,
  )
  if (!response.ok) throw new Error(`expected crawler index response ok, received ${response.status}`)
  if (!String(response.headers.get('content-type') || '').includes('text/markdown')) {
    throw new Error('expected Source Files crawler index to be served as markdown')
  }
  if (response.headers.get('x-robots-tag') !== 'all') {
    throw new Error('expected Source Files crawler index to allow crawler indexing')
  }
  if (response.headers.get(AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy) !== 'cloudflare-zone-policy') {
    throw new Error('expected Source Files crawler index to declare Cloudflare-owned Pay Per Crawl policy')
  }
  if (!String(response.headers.get('link') || '').includes(CLOUDFLARE_PAY_PER_CRAWL_DOC_URL)) {
    throw new Error('expected Source Files crawler index to link the Cloudflare Pay Per Crawl reference')
  }
  const markdown = await response.text()
  if (!markdown.includes('# agentic-graph Source Files') || !markdown.includes('Workspace: `wk_crawler`')) {
    throw new Error('expected crawler index to identify the source-files workspace')
  }
  if (
    !markdown.includes(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.price)
    || !markdown.includes(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.charged)
    || !markdown.includes(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.error)
    || !markdown.includes(CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.exactPrice)
    || !markdown.includes(CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.maxPrice)
  ) {
    throw new Error('expected crawler index to describe Pay Per Crawl payment response semantics without emulating them')
  }
  if (!markdown.includes('https://example.com/api/storage/doc/wk_crawler/huijoohwee%2Fdocs%2Falpha.md')) {
    throw new Error('expected crawler index to link directly to the markdown doc-view route')
  }
  if (!markdown.includes(`contentHash: \`${hashAgenticGraphStorageContent('# Alpha')}\``)) {
    throw new Error('expected crawler index to expose source-file content hash metadata')
  }
  if (markdown.includes('Deleted Source')) {
    throw new Error('expected crawler index to hide deleted Source Files')
  }
}

export async function testAgenticGraphStorageWorkerServesDefaultLlmsSourceFilesEntrypoint() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  await pushCrawlerDocument({
    env,
    workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
    documentId: 'doc_llms',
    canonicalPath: 'huijoohwee/docs/llms-demo.md',
    title: 'LLMS Demo',
    contentMd: '# LLMS Demo',
  })

  const response = await worker.fetch(
    new Request(`https://example.com${buildAgenticGraphStorageLlmsPath()}`),
    env as never,
  )
  if (!response.ok) throw new Error(`expected default llms source-files response ok, received ${response.status}`)
  if (!String(response.headers.get('content-type') || '').includes('text/plain')) {
    throw new Error('expected default llms source-files response to be served as text/plain')
  }
  const text = await response.text()
  if (!text.includes('Markdown Source Files from the agentic-graph Editor Workspace storage boundary.')) {
    throw new Error('expected llms entrypoint to describe the storage-backed Source Files boundary')
  }
  if (!text.includes('Cloudflare AI Crawl Control Pay Per Crawl') || !text.includes(CLOUDFLARE_PAY_PER_CRAWL_DOC_URL)) {
    throw new Error('expected llms entrypoint to include Pay Per Crawl policy metadata')
  }
  if (!text.includes('https://example.com/api/storage/doc-default/huijoohwee%2Fdocs%2Fllms-demo.md')) {
    throw new Error('expected default llms entrypoint to link to the default Source File doc-view route')
  }

  const indexResponse = await worker.fetch(
    new Request(`https://example.com${buildAgenticGraphStorageSourceFilesIndexPath()}`),
    env as never,
  )
  if (!indexResponse.ok) throw new Error(`expected default source-files index response ok, received ${indexResponse.status}`)
  const indexMarkdown = await indexResponse.text()
  if (!indexMarkdown.includes('Workspace: `kgws:canonical-docs`') || !indexMarkdown.includes('LLMS Demo')) {
    throw new Error('expected default Source Files index to resolve the canonical docs workspace')
  }
  if (!indexMarkdown.includes('https://example.com/api/storage/doc-default/huijoohwee%2Fdocs%2Fllms-demo.md')) {
    throw new Error('expected default Source Files index to link through the workspace-free default doc-view route')
  }
}

export async function testAgenticGraphStorageWorkerServesWorkspaceLlmsSourceFilesEntrypoint() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'wk_llms_workspace'
  await pushCrawlerDocument({
    env,
    workspaceId,
    documentId: 'doc_workspace_llms',
    canonicalPath: 'huijoohwee/docs/workspace-llms.md',
    title: 'Workspace LLMS',
    contentMd: '# Workspace LLMS',
  })

  const response = await worker.fetch(
    new Request(`https://example.com${buildAgenticGraphStorageLlmsPath(workspaceId)}`),
    env as never,
  )
  if (!response.ok) throw new Error(`expected workspace llms source-files response ok, received ${response.status}`)
  if (!String(response.headers.get('content-type') || '').includes('text/plain')) {
    throw new Error('expected workspace llms source-files response to be served as text/plain')
  }
  if (response.headers.get('x-robots-tag') !== 'all') {
    throw new Error('expected workspace llms source-files response to allow crawler indexing')
  }
  if (response.headers.get(AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy) !== 'cloudflare-zone-policy') {
    throw new Error('expected workspace llms source-files response to declare Cloudflare-owned Pay Per Crawl policy')
  }
  const text = await response.text()
  if (!text.includes(`Workspace: ${workspaceId}`)) {
    throw new Error('expected workspace llms entrypoint to identify the workspace-scoped Source Files surface')
  }
  if (!text.includes(`https://example.com${buildAgenticGraphStorageSourceFilesIndexPath(workspaceId)}`)) {
    throw new Error('expected workspace llms entrypoint to link back to the workspace-scoped Source Files index')
  }
  if (!text.includes(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, 'huijoohwee/docs/workspace-llms.md')}`)) {
    throw new Error('expected workspace llms entrypoint to link to the workspace-scoped Source File doc-view route')
  }
}

export async function testAgenticGraphStorageWorkerCrawlerRoutesStayReadOnly() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'wk_crawler_empty'
  const response = await worker.fetch(
    new Request(`https://example.com${buildAgenticGraphStorageSourceFilesIndexPath(workspaceId)}`),
    env as never,
  )
  if (!response.ok) throw new Error(`expected empty crawler index response ok, received ${response.status}`)
  const markdown = await response.text()
  if (!markdown.includes('No Source Files are currently published for this workspace.')) {
    throw new Error('expected empty crawler index to return a readable empty-state response')
  }
  if (env.DB.workspaces.has(workspaceId)) {
    throw new Error('expected crawler GET routes to avoid creating workspace rows')
  }
  if (env.DB.documents.size !== 0 || env.DB.documentChunks.size !== 0 || env.DB.graphSnapshots.size !== 0) {
    throw new Error('expected crawler GET routes to avoid mutating storage records')
  }
}
