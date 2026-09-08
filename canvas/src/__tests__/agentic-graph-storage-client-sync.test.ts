import assert from 'node:assert/strict'
import {
  createStorageWorkerFetch as createWorkerFetch,
  createStorageWorkerRequest,
  readStorageWorker,
} from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fake-agentic-graph-storage-d1'
import {
  __resetAgenticGraphStorageDbForTests,
  getAgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import {
  __resetAgenticGraphStorageRouteAvailabilityForTests,
  exportAgenticGraphStorageWorkspace,
  queueAgenticGraphStorageMutation,
  syncAgenticGraphStorageNow,
} from '@/lib/storage/agentic-graph-storage-client-sync'
import { getAgenticGraphStorageDeviceId } from '@/lib/storage/agentic-graph-storage-device-identity'
import { applyPulledAgenticGraphStorageChangesToSourceFiles } from '@/features/source-files/sourceFilesInboundStorageApply'
import { uploadGeneratedWorkspaceBlobToAgenticGraphStorage } from '@/features/source-files/sourceFilesBinaryStorage'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  AGENTIC_OS_STORAGE_SYNC_API_VERSION,
  hashAgenticGraphStorageContent,
} from '@/lib/storage/agentic-graph-storage-sync-contract'

const worker = readStorageWorker()

export async function testAgenticGraphStorageClientSyncPushesOutboxAndUpdatesCursor() {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const sessionToken = 'storage-sync-session-token'
  const observedRequests: Array<{ pathname: string; authorization: string }> = []
  const workerFetch = createWorkerFetch(env)
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = createStorageWorkerRequest(input, init)
    observedRequests.push({
      pathname: new URL(request.url).pathname,
      authorization: String(request.headers.get('authorization') || ''),
    })
    return workerFetch(request)
  }
  const dbState = await getAgenticGraphStorageDb()
  const deviceId = getAgenticGraphStorageDeviceId({
    getItem: () => null,
    setItem: () => void 0,
  } as unknown as Storage)

  await queueAgenticGraphStorageMutation({
    workspaceId: 'wk_client_push',
    deviceId,
    entity: 'document',
    op: 'upsert',
    record: {
      id: 'doc_client_push',
      workspaceId: 'wk_client_push',
      canonicalPath: 'docs/client-push.md',
      title: 'Client Push',
      docType: 'note',
      lang: 'en-US',
      graphId: 'graph_client_push',
      sourceKind: 'markdown',
      contentMd: '# Client Push',
      contentHash: 'sha256:client-push',
      parserVersion: '1.0.0',
      revision: 1,
      updatedAtMs: 1_777_100_000_000,
      deleted: false,
    },
    dbState,
  })

  const before = await dbState.collections.syncOutbox.find().exec()
  if (before.length !== 1) throw new Error('expected one queued outbox mutation before sync')

  const result = await syncAgenticGraphStorageNow({
    workspaceId: 'wk_client_push',
    deviceId,
    baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com',
    sessionToken,
    fetchImpl,
    dbState,
  })

  if (result.pushedCount !== 1 || result.appliedCount !== 1) {
    throw new Error(`expected one pushed/applied mutation, received pushed=${result.pushedCount} applied=${result.appliedCount}`)
  }

  const afterOutbox = await dbState.collections.syncOutbox.find().exec()
  if (afterOutbox.length !== 0) throw new Error('expected sync to clear applied outbox mutations')

  const cursor = await dbState.collections.syncCursor.findOne(`wk_client_push:${deviceId}`).exec()
  if (!cursor) throw new Error('expected sync cursor row to be written after a successful sync')
  if (!String(cursor.get('lastPushCursor') || '')) throw new Error('expected lastPushCursor to be set after push')
  if (!String(cursor.get('lastPullCursor') || '')) throw new Error('expected lastPullCursor to be set after pull')

  const exported = await exportAgenticGraphStorageWorkspace({
    workspaceId: 'wk_client_push',
    baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com',
    sessionToken,
    fetchImpl,
  })
  if (exported.documents.length !== 1) throw new Error('expected workspace export to include the pushed document')
  const blobUpload = await uploadGeneratedWorkspaceBlobToAgenticGraphStorage({
    workspacePath: 'generated/client-push.bin',
    workspaceId: 'wk_client_push',
    baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com',
    uploadNow: true,
    sessionToken,
    blob: new Blob(['bounded-blob'], { type: 'application/octet-stream' }),
    fetchImpl,
  })
  if (!blobUpload) throw new Error('expected authenticated workspace blob upload to succeed')
  if (observedRequests.length !== 4 || observedRequests.some(request => request.authorization !== `Bearer ${sessionToken}`)) {
    throw new Error(`expected push, pull, export, and blob upload to carry the session bearer: ${JSON.stringify(observedRequests)}`)
  }
  if (JSON.stringify({ result, exported, blobUpload }).includes(sessionToken)) throw new Error('expected storage results to redact the session bearer')

  await __resetAgenticGraphStorageDbForTests()
}

export async function testAgenticGraphStorageClientSyncPullsRemoteChangesIntoPersistedCache() {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const fetchImpl = createWorkerFetch(env)
  const dbState = await getAgenticGraphStorageDb()
  const deviceId = 'dev_pull_local'

  const remoteSeedResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION,
        workspaceId: 'wk_client_pull',
        deviceId: 'dev_remote_writer',
        mutations: [
          {
            mutationId: 'mut_remote_doc',
            workspaceId: 'wk_client_pull',
            entity: 'document',
            op: 'upsert',
            recordId: 'doc_remote_pull',
            baseRevision: null,
            record: {
              id: 'doc_remote_pull',
              workspaceId: 'wk_client_pull',
              canonicalPath: 'docs/remote-pull.md',
              title: 'Remote Pull',
              docType: 'note',
              lang: 'en-US',
              graphId: null,
              sourceKind: 'markdown',
              contentMd: '# Remote Pull',
              contentHash: hashAgenticGraphStorageContent('# Remote Pull'),
              parserVersion: '1.0.0',
              revision: 1,
              updatedAtMs: 1_777_100_000_500,
              deleted: false,
            },
          },
          {
            mutationId: 'mut_remote_chunk',
            workspaceId: 'wk_client_pull',
            entity: 'documentChunk',
            op: 'upsert',
            recordId: 'chunk_remote_pull',
            baseRevision: null,
            record: {
              id: 'chunk_remote_pull',
              documentId: 'doc_remote_pull',
              workspaceId: 'wk_client_pull',
              chunkKey: 'frontmatter',
              chunkOrder: 0,
              heading: null,
              markdown: 'title: Remote Pull',
              tokenEstimate: 8,
              contentHash: hashAgenticGraphStorageContent('title: Remote Pull'),
              updatedAtMs: 1_777_100_000_550,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  if (!remoteSeedResponse.ok) throw new Error('expected remote seed push to succeed before client pull')

  const result = await syncAgenticGraphStorageNow({
    workspaceId: 'wk_client_pull',
    deviceId,
    baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com',
    fetchImpl,
    dbState,
  })

  if (result.pulledDocumentCount !== 1 || result.pulledChunkCount !== 1) {
    throw new Error(`expected one pulled document and one pulled chunk, received docs=${result.pulledDocumentCount} chunks=${result.pulledChunkCount}`)
  }

  const documentRow = await dbState.collections.documents.findOne('doc_remote_pull').exec()
  if (!documentRow) throw new Error('expected remote document to be materialized into the local persisted cache after pull')
  const chunkRow = await dbState.collections.documentChunks.findOne('chunk_remote_pull').exec()
  if (!chunkRow) throw new Error('expected remote chunk to be materialized into the local persisted cache after pull')

  await __resetAgenticGraphStorageDbForTests()
}

export async function testAgenticGraphStorageClientSyncRejectsMalformedRemoteNumericFields() {
  for (const invalid of ['documentRevision', 'childRevision', 'graphRevision'] as const) {
    await __resetAgenticGraphStorageDbForTests()
    __resetAgenticGraphStorageRouteAvailabilityForTests()
    const dbState = await getAgenticGraphStorageDb(), workspaceId = `wk_remote_numeric_${invalid}`
    let requests = 0
    const fetchImpl: typeof fetch = async () => {
      requests += 1
      return Response.json({ ok: true, apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId,
        nextCursor: '2026-05-04T00:00:00.000Z', nextPageCursor: null, pageComplete: true, serverTimeMs: 1,
        changes: { deletions: [], documents: invalid !== 'documentRevision' ? [] : [{
          id: 'invalid-doc', workspaceId, canonicalPath: 'invalid.md', contentMd: 'keep invalid remote bytes out', revision: null,
        }], documentChunks: invalid !== 'childRevision' ? [] : [{ id: 'invalid-chunk', workspaceId,
          documentId: 'parent', chunkKey: 'body', syncRevision: null, updatedAtMs: 1 }],
          graphSnapshots: invalid !== 'graphRevision' ? [] : [{ id: 'invalid-graph', workspaceId,
            documentId: 'parent', graphRevision: null, syncRevision: 1, updatedAtMs: 1 }] },
      })
    }
    await assert.rejects(syncAgenticGraphStorageNow({ workspaceId, deviceId: 'dev-numeric',
      baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com', fetchImpl, dbState }),
      /Invalid pulled document|Invalid child sync (state|revision|natural identity)/, 'remote revisions must never be fabricated by numeric coercion')
    assert.ok(requests > 0, 'malformed remote fields must reach the response validation boundary')
    for (const name of ['documents', 'documentChunks', 'graphSnapshots', 'syncCursor'] as const) {
      assert.equal((await dbState.collections[name].find().exec()).length, 0, `${invalid} must leave ${name} unchanged`)
    }
    await __resetAgenticGraphStorageDbForTests()
  }
}

export async function testQueueAgenticGraphStorageMutationSanitizesNullNumericFieldsInOutboundRecords() {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  const dbState = await getAgenticGraphStorageDb()
  const badGraphJson: Record<string, unknown> = { label: 'bad' }
  badGraphJson.fn = () => void 0
  badGraphJson.self = badGraphJson
  const mutationId = await queueAgenticGraphStorageMutation({
    workspaceId: 'wk_outbound_null_numeric',
    deviceId: 'dev_outbound_null_numeric',
    entity: 'graphSnapshot',
    op: 'upsert',
    record: {
      id: 'graph_outbound_null_numeric',
      documentId: 'doc_outbound_null_numeric',
      workspaceId: 'wk_outbound_null_numeric',
      graphRevision: null as unknown as number,
      graphHash: 'sha256:outbound-null-graph',
      graphJson: badGraphJson as unknown as Record<string, unknown>,
      layoutJson: [] as unknown as Record<string, unknown>,
      derivedFromDocumentRevision: null as unknown as number,
      updatedAtMs: null as unknown as number,
    },
    dbState,
  })
  const row = await dbState.collections.syncOutbox.findOne(mutationId).exec()
  if (!row) throw new Error('expected queued outbox mutation for outbound null-numeric sanitization test')
  const payload = row.get('payload') as unknown as { record?: Record<string, unknown> }
  const record = (payload?.record || {}) as Record<string, unknown>
  if (Number(record.graphRevision) !== 0) throw new Error('expected outbound graphRevision to sanitize to 0')
  if (Number(record.derivedFromDocumentRevision) !== 0) throw new Error('expected outbound derivedFromDocumentRevision to sanitize to 0')
  if (Number(record.updatedAtMs) !== 0) throw new Error('expected outbound updatedAtMs to sanitize to 0')
  if (!record.graphJson || typeof record.graphJson !== 'object' || Array.isArray(record.graphJson)) {
    throw new Error('expected outbound invalid graphJson to sanitize to object')
  }
  const graphJson = record.graphJson as Record<string, unknown>
  if (typeof graphJson.fn !== 'undefined') throw new Error('expected outbound graphJson function field to be removed for clone safety')
  if (graphJson.self !== null) throw new Error('expected outbound circular graphJson reference to sanitize to null')
  if (record.layoutJson !== null) throw new Error('expected outbound invalid array layoutJson to sanitize to null')
  await __resetAgenticGraphStorageDbForTests()
}

export async function testAgenticGraphStorageClientSyncRetainsLegacyChildPayloadWithoutTransmission() {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'wk_legacy_outbox_sanitize'
  const deviceId = 'dev_legacy_outbox_sanitize'
  const mutationId = 'mut_legacy_outbox_sanitize'
  const legacyMutation = {
    mutationId,
    workspaceId,
    entity: 'graphSnapshot',
    op: 'upsert',
    recordId: 'graph_legacy_null_numeric',
    baseRevision: null,
    record: {
      id: 'graph_legacy_null_numeric',
      documentId: 'doc_legacy_null_numeric',
      workspaceId,
      graphRevision: null,
      graphHash: 'sha256:legacy-null-graph',
      graphJson: null,
      layoutJson: [],
      derivedFromDocumentRevision: null,
      updatedAtMs: null,
    },
  } as const
  await dbState.collections.syncOutbox.incrementalUpsert({
    id: mutationId,
    workspaceId,
    deviceId,
    entity: 'graphSnapshot',
    op: 'upsert',
    recordId: legacyMutation.recordId,
    baseRevision: null,
    payload: legacyMutation as unknown as Record<string, unknown>,
    payloadHash: 'legacy',
    attemptCount: 0,
    lastAckStatus: '',
    lastAckMessage: null,
    createdAtMs: 1,
    updatedAtMs: 1,
  })

  const before = (await dbState.collections.syncOutbox.findOne(mutationId).exec())!.toJSON()
  let pushes = 0
  const fetchImpl: typeof fetch = async (input) => {
    if (String(input).endsWith('/api/storage/push')) pushes += 1
    return Response.json({ ok: true, apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId,
      nextCursor: '2026-05-04T00:00:00.000Z', nextPageCursor: null, pageComplete: true, serverTimeMs: 1,
      changes: { documents: [], documentChunks: [], graphSnapshots: [], deletions: [] } })
  }
  await syncAgenticGraphStorageNow({ workspaceId, deviceId,
    baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://example.com', fetchImpl, dbState })
  assert.equal(pushes, 0, 'legacy child payloads require explicit revision migration before transmission')
  const after = (await dbState.collections.syncOutbox.findOne(mutationId).exec())!.toJSON()
  assert.deepEqual(after.payload, before.payload, 'legacy authored bytes must remain available for recovery')
  assert.equal(after.payloadHash, before.payloadHash, 'retention cannot claim a reserialized payload')
  await __resetAgenticGraphStorageDbForTests()
}

export async function testAgenticGraphStorageClientSyncRepairsLegacyTopLevelNullNumericOutboxFieldsBeforeSync() {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  const dbState = await getAgenticGraphStorageDb()
  const workspaceId = 'wk_legacy_top_level_numeric_null'
  const deviceId = 'dev_legacy_top_level_numeric_null'
  const mutationId = 'mut_legacy_top_level_numeric_null'
  const legacyMutation = {
    mutationId,
    workspaceId,
    entity: 'document',
    op: 'upsert',
    recordId: 'doc_legacy_top_level_numeric_null',
    baseRevision: null,
    record: {
      id: 'doc_legacy_top_level_numeric_null',
      workspaceId,
      canonicalPath: 'docs/legacy-top-level-null.md',
      title: null,
      docType: 'note',
      lang: 'en-US',
      graphId: null,
      sourceKind: 'markdown',
      contentMd: '# Legacy',
      contentHash: 'sha256:legacy-top-level-null',
      parserVersion: '1.0.0',
      revision: 1,
      updatedAtMs: 1,
      deleted: false,
    },
  } as const
  await dbState.collections.syncOutbox.incrementalUpsert({
    id: mutationId,
    workspaceId,
    deviceId,
    entity: 'document',
    op: 'upsert',
    recordId: legacyMutation.recordId,
    baseRevision: null,
    payload: legacyMutation as unknown as Record<string, unknown>,
    payloadHash: 'legacy-top-level-null',
    attemptCount: null as unknown as number,
    lastAckStatus: '',
    lastAckMessage: null,
    createdAtMs: null as unknown as number,
    updatedAtMs: null as unknown as number,
  })

  await syncAgenticGraphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'http://127.0.0.1:5174',
    fetchImpl: async () => {
      throw new TypeError('Load failed')
    },
    dbState,
  })

  const repairedRow = await dbState.collections.syncOutbox.findOne(mutationId).exec()
  if (!repairedRow) throw new Error('expected legacy outbox row to remain after route-unavailable sync skip')
  if (repairedRow.get('attemptCount') !== 0) throw new Error('expected top-level attemptCount null to repair to numeric 0')
  if (repairedRow.get('createdAtMs') !== 0) throw new Error('expected top-level createdAtMs null to repair to numeric 0')
  if (repairedRow.get('updatedAtMs') !== 0) throw new Error('expected top-level updatedAtMs null to repair to numeric 0')

  await __resetAgenticGraphStorageDbForTests()
}

export {
  testAgenticGraphStorageClientSyncAutoClearsStaleRetainedConflictsAfterPull,
  testAgenticGraphStorageClientSyncCanApplyPulledRemoteChangesIntoVisibleSourceFiles,
  testAgenticGraphStorageClientSyncRetainsConflictingOutboxMutationsForResolution,
  testAgenticGraphStorageClientSyncSkipsNetworkLoadFailuresWithoutThrowing,
  testAgenticGraphStorageClientSyncSkipsUnavailableRoutesWithoutThrowing,
} from '@/__tests__/agentic-graph-storage-client-sync-runtime.test'
