import storageWorkerModule from '../../../cloudflare/workers/knowgrph-storage/index.ts'
import { createFakeKnowgrphStorageWorkerEnv } from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import {
  __resetKnowgrphStorageDbForTests,
  getKnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import {
  __resetKnowgrphStorageRouteAvailabilityForTests,
  queueKnowgrphStorageMutation,
  syncKnowgrphStorageNow,
} from '@/lib/storage/knowgrphStorageClientSync'
import { applyPulledKnowgrphStorageChangesToSourceFiles } from '@/features/source-files/sourceFilesInboundStorageApply'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  KNOWGRPH_STORAGE_API_VERSION,
  hashKnowgrphStorageContent,
} from '@/lib/storage/knowgrphStorageSyncContract'

const worker = (
  typeof (storageWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? storageWorkerModule
    : (storageWorkerModule as unknown as { default: typeof storageWorkerModule }).default
) as typeof storageWorkerModule

const createWorkerFetch = (env: ReturnType<typeof createFakeKnowgrphStorageWorkerEnv>) => {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    return worker.fetch(request, env as never)
  }
}

export async function testKnowgrphStorageClientSyncRetainsConflictingOutboxMutationsForResolution() {
  await __resetKnowgrphStorageDbForTests()
  const env = createFakeKnowgrphStorageWorkerEnv()
  const fetchImpl = createWorkerFetch(env)
  const dbState = await getKnowgrphStorageDb()
  const deviceId = 'dev_conflict_local'

  const remoteSeedResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId: 'wk_client_conflict',
        deviceId: 'dev_remote_seed',
        mutations: [
          {
            mutationId: 'mut_seed_conflict',
            workspaceId: 'wk_client_conflict',
            entity: 'document',
            op: 'upsert',
            recordId: 'doc_conflict',
            baseRevision: null,
            record: {
              id: 'doc_conflict',
              workspaceId: 'wk_client_conflict',
              canonicalPath: 'docs/conflict.md',
              title: 'Conflict',
              docType: 'note',
              lang: 'en-US',
              graphId: null,
              sourceKind: 'markdown',
              contentMd: '# Server',
              contentHash: hashKnowgrphStorageContent('# Server'),
              parserVersion: '1.0.0',
              revision: 2,
              updatedAtMs: 1_777_100_001_000,
              deleted: false,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  const remoteSeedBody = await remoteSeedResponse.json() as {
    acknowledgements?: Array<{ entity?: string; status?: string; message?: string | null }>
  }
  if (
    !remoteSeedResponse.ok
    || remoteSeedBody.acknowledgements?.length !== 1
    || remoteSeedBody.acknowledgements.some(acknowledgement => acknowledgement.status !== 'applied')
  ) {
    throw new Error(`expected conflict seed mutation to apply: ${JSON.stringify(remoteSeedBody)}`)
  }

  const mutationId = await queueKnowgrphStorageMutation({
    workspaceId: 'wk_client_conflict',
    deviceId,
    entity: 'document',
    op: 'upsert',
    baseRevision: 1,
    record: {
      id: 'doc_conflict',
      workspaceId: 'wk_client_conflict',
      canonicalPath: 'docs/conflict.md',
      title: 'Conflict',
      docType: 'note',
      lang: 'en-US',
      graphId: null,
      sourceKind: 'markdown',
      contentMd: '# Local stale',
      contentHash: 'sha256:local-stale',
      parserVersion: '1.0.0',
      revision: 4,
      updatedAtMs: 1_777_100_001_100,
      deleted: false,
    },
    dbState,
  })

  const result = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_conflict',
    deviceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
  })
  if (result.conflictCount !== 1 || result.unresolvedConflictCount !== 1) {
    throw new Error('expected the newer local mutation to remain a single unresolved conflict')
  }
  if (result.conflictEntries.length !== 1 || result.conflictEntries[0]?.serverRevision !== 2) {
    throw new Error('expected the retained conflict to expose the current server revision for manual resolution')
  }

  const conflictRow = await dbState.collections.syncOutbox.findOne(mutationId).exec()
  if (!conflictRow) throw new Error('expected unresolved conflict to remain in the durable outbox')
  if (Number(conflictRow.get('attemptCount') || 0) !== 1) {
    throw new Error('expected one acknowledged conflict attempt without automatic retry')
  }
  if (String(conflictRow.get('lastAckStatus') || '').trim() !== 'conflict') {
    throw new Error('expected unresolved outbox row to retain its conflict status')
  }
  if (Number(conflictRow.get('baseRevision')) !== 1) {
    throw new Error('expected automatic sync to leave the user-authored base revision unchanged')
  }

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncAutoClearsStaleRetainedConflictsAfterPull() {
  await __resetKnowgrphStorageDbForTests()
  const env = createFakeKnowgrphStorageWorkerEnv()
  const fetchImpl = createWorkerFetch(env)
  const dbState = await getKnowgrphStorageDb()
  const deviceId = 'dev_conflict_retained'

  await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId: 'wk_client_conflict_retained',
        deviceId: 'dev_remote_seed_retained',
        mutations: [
          {
            mutationId: 'mut_seed_conflict_retained',
            workspaceId: 'wk_client_conflict_retained',
            entity: 'document',
            op: 'upsert',
            recordId: 'doc_conflict_retained',
            baseRevision: null,
            record: {
              id: 'doc_conflict_retained',
              workspaceId: 'wk_client_conflict_retained',
              canonicalPath: 'docs/conflict-retained.md',
              title: 'Conflict Retained',
              docType: 'note',
              lang: 'en-US',
              graphId: null,
              sourceKind: 'markdown',
              contentMd: '# Server Retained',
              contentHash: hashKnowgrphStorageContent('# Server Retained'),
              parserVersion: '1.0.0',
              revision: 3,
              updatedAtMs: 1_777_100_003_000,
              deleted: false,
            },
          },
        ],
      }),
    }),
    env as never,
  )

  const mutationId = await queueKnowgrphStorageMutation({
    workspaceId: 'wk_client_conflict_retained',
    deviceId,
    entity: 'document',
    op: 'upsert',
    baseRevision: 1,
    record: {
      id: 'doc_conflict_retained',
      workspaceId: 'wk_client_conflict_retained',
      canonicalPath: 'docs/conflict-retained.md',
      title: 'Conflict Retained',
      docType: 'note',
      lang: 'en-US',
      graphId: null,
      sourceKind: 'markdown',
      contentMd: '# Local Retained',
      contentHash: 'sha256:local-retained',
      parserVersion: '1.0.0',
      revision: 1,
      updatedAtMs: 1_777_100_003_100,
      deleted: false,
    },
    dbState,
  })

  await dbState.collections.documents.incrementalUpsert({
    id: 'doc_conflict_retained',
    workspaceId: 'wk_client_conflict_retained',
    canonicalPath: 'docs/conflict-retained.md',
    title: 'Conflict Retained',
    docType: 'note',
    lang: 'en-US',
    graphId: null,
    sourceKind: 'markdown',
    contentMd: '# Server Retained',
    contentHash: hashKnowgrphStorageContent('# Server Retained'),
    parserVersion: '1.0.0',
    documentRevision: 3,
    updatedAtMs: 1_777_100_003_000,
    isDeleted: false,
  })

  const outboxRow = await dbState.collections.syncOutbox.findOne(mutationId).exec()
  if (!outboxRow) throw new Error('expected retained conflict test to enqueue local mutation')
  await outboxRow.incrementalPatch({
    attemptCount: 23,
    lastAckStatus: 'conflict',
    lastAckMessage: 'retained conflict seed',
    updatedAtMs: Date.now(),
  })

  const result = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_conflict_retained',
    deviceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
  })

  if (result.pushedCount !== 0 || result.conflictCount !== 0 || result.unresolvedConflictCount !== 0) {
    throw new Error('expected a pre-existing conflict to skip automatic push and clear only after the newer server revision is pulled')
  }
  const retainedRow = await dbState.collections.syncOutbox.findOne(mutationId).exec()
  if (retainedRow) {
    throw new Error('expected the stale retained conflict to clear after pull without an automatic retry')
  }

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncCanApplyPulledRemoteChangesIntoVisibleSourceFiles() {
  await __resetKnowgrphStorageDbForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setSourceFiles([])
  const env = createFakeKnowgrphStorageWorkerEnv()
  const fetchImpl = createWorkerFetch(env)
  const dbState = await getKnowgrphStorageDb()
  const deviceId = 'dev_pull_visible'

  const visibleSeedResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
        workspaceId: 'wk_client_visible',
        deviceId: 'dev_remote_visible',
        mutations: [
          {
            mutationId: 'mut_visible_doc',
            workspaceId: 'wk_client_visible',
            entity: 'document',
            op: 'upsert',
            recordId: 'sf:visible_remote',
            baseRevision: null,
            record: {
              id: 'sf:visible_remote',
              workspaceId: 'wk_client_visible',
              canonicalPath: 'workspace:/visible-remote.md',
              title: 'visible-remote.md',
              docType: 'markdown',
              lang: null,
              graphId: 'sf-graph:visible_remote',
              sourceKind: 'markdown',
              contentMd: '# Visible Remote',
              contentHash: hashKnowgrphStorageContent('# Visible Remote'),
              parserVersion: 'markdown-frontmatter',
              revision: 1,
              updatedAtMs: 1_777_100_002_000,
              deleted: false,
            },
          },
          {
            mutationId: 'mut_visible_graph',
            workspaceId: 'wk_client_visible',
            entity: 'graphSnapshot',
            op: 'upsert',
            recordId: 'sf-graph:visible_remote',
            baseRevision: null,
            record: {
              id: 'sf-graph:visible_remote',
              documentId: 'sf:visible_remote',
              workspaceId: 'wk_client_visible',
              graphRevision: 1,
              graphHash: 'sha256:visible-graph',
              graphJson: { type: 'Graph', nodes: [{ id: 'visible-node', label: 'Visible Node' }], edges: [], metadata: {} },
              layoutJson: null,
              derivedFromDocumentRevision: 1,
              updatedAtMs: 1_777_100_002_050,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  const visibleSeedBody = await visibleSeedResponse.json() as {
    acknowledgements?: Array<{ entity?: string; status?: string; message?: string | null }>
  }
  if (
    !visibleSeedResponse.ok
    || visibleSeedBody.acknowledgements?.length !== 2
    || visibleSeedBody.acknowledgements.some(acknowledgement => acknowledgement.status !== 'applied')
  ) {
    throw new Error(`expected visible document and graph seed mutations to apply: ${JSON.stringify(visibleSeedBody)}`)
  }

  await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_visible',
    deviceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
    onPulledChangesApplied: async ({ workspaceId, changes, signal, taskContext }) => {
      const result = applyPulledKnowgrphStorageChangesToSourceFiles({
        workspaceId,
        changes,
        signal,
        taskContext,
      })
      await result.completion
    },
  })

  const file = useGraphStore.getState().sourceFiles.find(entry => entry.id === 'visible_remote') || null
  if (!file) throw new Error('expected client sync to make pulled remote document visible in sourceFiles')
  if (String(file.text || '') !== '# Visible Remote') throw new Error('expected visible source file text to match pulled remote document')
  await new Promise<void>(resolve => setTimeout(resolve, 20))
  if (!Array.isArray(useGraphStore.getState().graphData?.nodes) || useGraphStore.getState().graphData.nodes.length < 1) {
    throw new Error('expected pulled remote source file to become visible in a non-empty composed canvas graph')
  }

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncSkipsUnavailableRoutesWithoutThrowing() {
  await __resetKnowgrphStorageDbForTests()
  __resetKnowgrphStorageRouteAvailabilityForTests()
  const dbState = await getKnowgrphStorageDb()
  let requestCount = 0
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    requestCount += 1
    const url = String(input instanceof Request ? input.url : input)
    if (url.includes('/api/storage/pull')) {
      return new Response('<!doctype html><html><body>vite fallback</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    return new Response('', { status: 404 })
  }

  const first = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_unavailable',
    deviceId: 'dev_unavailable',
    baseUrl: 'http://127.0.0.1:5173',
    fetchImpl,
    dbState,
  })
  const second = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_unavailable',
    deviceId: 'dev_unavailable',
    baseUrl: 'http://127.0.0.1:5173',
    fetchImpl,
    dbState,
  })

  if (first.pushedCount !== 0 || first.pulledDocumentCount !== 0 || first.pulledChunkCount !== 0 || first.pulledGraphSnapshotCount !== 0) {
    throw new Error('expected unavailable storage routes to skip sync cleanly without reporting pushed or pulled records')
  }
  if (second.pushedCount !== 0 || second.pulledDocumentCount !== 0 || second.pulledChunkCount !== 0 || second.pulledGraphSnapshotCount !== 0) {
    throw new Error('expected repeated sync attempts against unavailable storage routes to stay in the shared skipped state')
  }
  if (requestCount !== 1) {
    throw new Error(`expected unavailable route backoff to suppress repeated fetch attempts, got ${requestCount}`)
  }

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncSkipsNetworkLoadFailuresWithoutThrowing() {
  await __resetKnowgrphStorageDbForTests()
  __resetKnowgrphStorageRouteAvailabilityForTests()
  const dbState = await getKnowgrphStorageDb()
  let requestCount = 0
  const fetchImpl = async (): Promise<Response> => {
    requestCount += 1
    const error = new TypeError('Load failed')
    throw error
  }

  const first = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_load_failed',
    deviceId: 'dev_load_failed',
    baseUrl: 'http://127.0.0.1:5174',
    fetchImpl,
    dbState,
  })
  const second = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_load_failed',
    deviceId: 'dev_load_failed',
    baseUrl: 'http://127.0.0.1:5174',
    fetchImpl,
    dbState,
  })

  if (first.pushedCount !== 0 || first.pulledDocumentCount !== 0 || first.pulledChunkCount !== 0 || first.pulledGraphSnapshotCount !== 0) {
    throw new Error('expected network load failure to skip sync cleanly without reporting pushed or pulled records')
  }
  if (second.pushedCount !== 0 || second.pulledDocumentCount !== 0 || second.pulledChunkCount !== 0 || second.pulledGraphSnapshotCount !== 0) {
    throw new Error('expected repeated sync attempts during load failure backoff to remain skipped')
  }
  if (requestCount !== 1) {
    throw new Error(`expected network load failure backoff to suppress repeated fetch attempts, got ${requestCount}`)
  }

  await __resetKnowgrphStorageDbForTests()
}
