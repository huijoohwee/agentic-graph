import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import { createStorageWorkerFetch, readStorageWorker } from '@/__tests__/helpers/fakeAgenticGraphStorageWorkerFetch'
import {
  __resetAgenticGraphStorageDbForTests,
  getAgenticGraphStorageDb,
} from '@/lib/storage/agenticgraphStorageDb'
import {
  buildAgenticGraphStorageBlobPath,
  buildAgenticGraphStorageDocPath,
  AGENTICGRAPH_STORAGE_API_VERSION,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  publishGeneratedWorkspaceEntriesToAgenticGraphStorage,
  publishWorkspaceEntryShareUrl,
} from '@/features/source-files/sourceFileShareUrl'

export async function testGeneratedChatLogWorkspaceEntryQueuesCanonicalStoragePath() {
  await __resetAgenticGraphStorageDbForTests()
  const previousRuntimeSync = process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  try {
    const workspaceId = 'kgws:test-chat-log-generated-queue'
    const workspacePath = '/chat-log/20260605T134222Z/kgc_20260605T134222Z.md'
    const result = await publishGeneratedWorkspaceEntriesToAgenticGraphStorage({
      workspaceId,
      entries: [{
        path: workspacePath,
        parentPath: '/chat-log/20260605T134222Z',
        kind: 'file',
        name: 'kgc_20260605T134222Z.md',
        text: '# Generated KGC',
        updatedAtMs: 1_780_661_400_000,
      }],
    })
    if (result.syncResult !== null) {
      throw new Error('expected generated chat artifact publish to queue locally unless runtime storage sync is enabled')
    }
    if (result.storedCount !== 1 || result.queuedMutationCount !== 1) {
      throw new Error(`expected one generated chat artifact to queue for storage, got ${JSON.stringify(result)}`)
    }
    const expectedCanonicalPath = 'chat-log/20260605T134222Z/kgc_20260605T134222Z.md'
    if (result.canonicalPaths.join('|') !== expectedCanonicalPath) {
      throw new Error(`expected chat artifact canonical path to stay under chat-log, got ${JSON.stringify(result.canonicalPaths)}`)
    }
  } finally {
    if (typeof previousRuntimeSync === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
    await __resetAgenticGraphStorageDbForTests()
  }
}

export async function testGeneratedChatLogWorkspaceEntryFlushesToPublicStorageWhenRuntimeSyncEnabled() {
  await __resetAgenticGraphStorageDbForTests()
  const previousRuntimeSync = process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = '1'
  try {
    const env = createFakeAgenticGraphStorageWorkerEnv()
    const fetchImpl = createStorageWorkerFetch(env)
    const workspaceId = 'kgws:test-chat-log-generated-flush'
    const canonicalPath = 'chat-log/20260605T134222Z/kgc_20260605T134222Z.md'
    const dbState = await getAgenticGraphStorageDb()
    const result = await publishGeneratedWorkspaceEntriesToAgenticGraphStorage({
      workspaceId,
      baseUrl: 'https://example.com',
      fetchImpl,
      dbState,
      entries: [{
        path: `/${canonicalPath}`,
        parentPath: '/chat-log/20260605T134222Z',
        kind: 'file',
        name: 'kgc_20260605T134222Z.md',
        text: '# Generated Public KGC',
        updatedAtMs: 1_780_661_400_000,
      }],
    })
    if (!result.syncResult || result.syncResult.pushedCount !== 1 || result.syncResult.appliedCount !== 1) {
      throw new Error(`expected runtime-enabled generated chat artifact publish to flush D1 mutation, got ${JSON.stringify(result.syncResult)}`)
    }
    const docResponse = await readStorageWorker().fetch(
      new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, canonicalPath)}`),
      env as never,
    )
    if (!docResponse.ok) {
      throw new Error(`expected generated chat artifact document to be readable from the local storage worker, got ${docResponse.status}`)
    }
    const text = await docResponse.text()
    if (text !== '# Generated Public KGC') {
      throw new Error(`expected generated chat artifact public content to match source text, got ${text}`)
    }
  } finally {
    if (typeof previousRuntimeSync === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
    await __resetAgenticGraphStorageDbForTests()
  }
}

export async function testStorageWorkerR2BlobRouteStoresAndServesBinaryObject() {
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:test-r2-blob'
  const canonicalPath = 'chat-log/20260605T134222Z/kgc-output_20260605T134222Z.png'
  const routePath = buildAgenticGraphStorageBlobPath(workspaceId, canonicalPath)
  const uploadResponse = await readStorageWorker().fetch(
    new Request(`https://example.com${routePath}`, {
      method: 'POST',
      headers: {
        'content-type': 'image/png',
        'x-agenticgraph-content-hash': 'sha256:test-r2-blob',
      },
      body: Uint8Array.from([137, 80, 78, 71]),
    }),
    env as never,
  )
  if (!uploadResponse.ok) {
    throw new Error(`expected R2 blob upload route ok, got ${uploadResponse.status}`)
  }
  const upload = await uploadResponse.json() as {
    objectKey?: string
    canonicalPath?: string
    contentHash?: string
  }
  if (!upload.objectKey || upload.canonicalPath !== canonicalPath || upload.contentHash !== 'sha256:test-r2-blob') {
    throw new Error(`expected upload response to expose canonical R2 coordinates, got ${JSON.stringify(upload)}`)
  }
  if (!env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.has(upload.objectKey)) {
    throw new Error(`expected fake R2 bucket to contain uploaded object ${upload.objectKey}`)
  }
  const readResponse = await readStorageWorker().fetch(
    new Request(`https://example.com${routePath}`),
    env as never,
  )
  if (!readResponse.ok) {
    throw new Error(`expected R2 blob read route ok, got ${readResponse.status}`)
  }
  if (String(readResponse.headers.get('content-type') || '') !== 'image/png') {
    throw new Error(`expected R2 blob read route to preserve content type, got ${String(readResponse.headers.get('content-type') || '')}`)
  }
  const bytes = Array.from(new Uint8Array(await readResponse.arrayBuffer()))
  if (bytes.join(',') !== '137,80,78,71') {
    throw new Error(`expected R2 blob read route to return uploaded bytes, got ${bytes.join(',')}`)
  }
}

export async function testSourceFileShareUrlPublishesOverExistingCanonicalPathDocument() {
  await __resetAgenticGraphStorageDbForTests()
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const fetchImpl = createStorageWorkerFetch(env)
  const workspaceId = 'kgws:test-share-url-canonical-upsert'
  const canonicalPath = 'huijoohwee/docs/shared.md'
  const seedResponse = await readStorageWorker().fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
        workspaceId,
        deviceId: 'dev_seed',
        mutations: [{
          mutationId: 'mut_seed_shared',
          workspaceId,
          entity: 'document',
          op: 'upsert',
          recordId: 'docs:seeded-shared',
          baseRevision: null,
          record: {
            id: 'docs:seeded-shared',
            workspaceId,
            canonicalPath,
            title: 'shared.md',
            docType: 'markdown',
            lang: null,
            graphId: null,
            sourceKind: 'markdown',
            contentMd: '# Seeded shared',
            contentHash: 'sha256:seeded-shared',
            parserVersion: 'seed-storage-docs-to-cloudflare:v1',
            revision: 7,
            updatedAtMs: 1_777_400_100_000,
            deleted: false,
          },
        }],
      }),
    }),
    env as never,
  )
  if (!seedResponse.ok) throw new Error(`expected seed document push ok, got ${seedResponse.status}`)

  const shareUrl = await publishWorkspaceEntryShareUrl({
    workspaceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    entry: {
      path: '/docs/shared.md',
      parentPath: '/docs',
      kind: 'file',
      name: 'shared.md',
      text: '# Shared URL edit',
      updatedAtMs: 1_777_400_200_000,
    },
  })
  if (!shareUrl) throw new Error('expected Share URL publish to succeed for an existing canonical D1 document row')
  if (env.DB.documents.size !== 1) {
    throw new Error(`expected canonical path upsert to preserve one D1 document row, got ${env.DB.documents.size}`)
  }
  const storedRow = Array.from(env.DB.documents.values())[0]
  if (Number(storedRow?.revision || 0) !== 8) {
    throw new Error(`expected canonical path upsert to advance the existing document revision, got ${String(storedRow?.revision || '')}`)
  }
  const docResponse = await readStorageWorker().fetch(
    new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, canonicalPath)}`),
    env as never,
  )
  if (!docResponse.ok) throw new Error(`expected shared document route ok after canonical upsert, got ${docResponse.status}`)
  const text = await docResponse.text()
  if (text !== '# Shared URL edit') {
    throw new Error(`expected Share URL publish to update the canonical document body, got ${text}`)
  }
  await __resetAgenticGraphStorageDbForTests()
}
