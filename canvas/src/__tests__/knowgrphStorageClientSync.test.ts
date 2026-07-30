import storageWorkerModule from '../../../cloudflare/workers/knowgrph-storage/index.ts'
import { createFakeKnowgrphStorageWorkerEnv } from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import {
  __resetKnowgrphStorageDbForTests,
  getKnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import {
  __resetKnowgrphStorageRouteAvailabilityForTests,
  exportKnowgrphStorageWorkspace,
  queueKnowgrphStorageMutation,
  syncKnowgrphStorageNow,
} from '@/lib/storage/knowgrphStorageClientSync'
import { getKnowgrphStorageDeviceId } from '@/lib/storage/knowgrphStorageDeviceIdentity'
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

export async function testKnowgrphStorageClientSyncPushesOutboxAndUpdatesCursor() {
  await __resetKnowgrphStorageDbForTests()
  const env = createFakeKnowgrphStorageWorkerEnv()
  const fetchImpl = createWorkerFetch(env)
  const dbState = await getKnowgrphStorageDb()
  const deviceId = getKnowgrphStorageDeviceId({
    getItem: () => null,
    setItem: () => void 0,
  } as unknown as Storage)

  await queueKnowgrphStorageMutation({
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

  const result = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_push',
    deviceId,
    baseUrl: 'https://example.com',
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

  const exported = await exportKnowgrphStorageWorkspace({
    workspaceId: 'wk_client_push',
    baseUrl: 'https://example.com',
    fetchImpl,
  })
  if (exported.documents.length !== 1) throw new Error('expected workspace export to include the pushed document')

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncPullsRemoteChangesIntoPersistedCache() {
  await __resetKnowgrphStorageDbForTests()
  const env = createFakeKnowgrphStorageWorkerEnv()
  const fetchImpl = createWorkerFetch(env)
  const dbState = await getKnowgrphStorageDb()
  const deviceId = 'dev_pull_local'

  const remoteSeedResponse = await worker.fetch(
    new Request('https://example.com/api/storage/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: KNOWGRPH_STORAGE_API_VERSION,
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
              contentHash: hashKnowgrphStorageContent('# Remote Pull'),
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
              contentHash: hashKnowgrphStorageContent('title: Remote Pull'),
              updatedAtMs: 1_777_100_000_550,
            },
          },
        ],
      }),
    }),
    env as never,
  )
  if (!remoteSeedResponse.ok) throw new Error('expected remote seed push to succeed before client pull')

  const result = await syncKnowgrphStorageNow({
    workspaceId: 'wk_client_pull',
    deviceId,
    baseUrl: 'https://example.com',
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

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncSanitizesNullNumericFieldsFromPullPayloads() {
  await __resetKnowgrphStorageDbForTests()
  const dbState = await getKnowgrphStorageDb()
  const workspaceId = 'wk_client_pull_null_numeric'
  const deviceId = 'dev_pull_null_numeric'
  const fetchImpl: typeof fetch = async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith('/api/storage/push')) {
      return new Response(
        JSON.stringify({
          ok: true,
          apiVersion: KNOWGRPH_STORAGE_API_VERSION,
          workspaceId,
          ackCursor: 'ack:null-numeric',
          serverTimeMs: 1_777_300_000_000,
          acknowledgements: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.endsWith('/api/storage/pull')) {
      return new Response(
        JSON.stringify({
          ok: true,
          apiVersion: KNOWGRPH_STORAGE_API_VERSION,
          workspaceId,
          nextCursor: 'pull:null-numeric',
          serverTimeMs: 1_777_300_000_100,
          changes: {
            documents: [
              {
                id: 'doc_null_numeric',
                workspaceId,
                canonicalPath: 'docs/null-numeric.md',
                title: 'Null Numeric',
                docType: 'note',
                lang: 'en-US',
                graphId: 'graph_null_numeric',
                sourceKind: 'markdown',
                contentMd: '# Null Numeric',
                contentHash: 'sha256:null-numeric',
                parserVersion: '1.0.0',
                revision: null,
                updatedAtMs: null,
                deleted: false,
              },
            ],
            documentChunks: [
              {
                id: 'chunk_null_numeric',
                documentId: 'doc_null_numeric',
                workspaceId,
                chunkKey: 'body',
                chunkOrder: null,
                heading: null,
                markdown: 'Body',
                tokenEstimate: null,
                contentHash: 'sha256:null-chunk',
                updatedAtMs: null,
              },
            ],
            graphSnapshots: [
              {
                id: 'graph_null_numeric',
                documentId: 'doc_null_numeric',
                workspaceId,
                graphRevision: null,
                graphHash: 'sha256:null-graph',
                graphJson: null,
                layoutJson: [],
                derivedFromDocumentRevision: null,
                updatedAtMs: null,
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('not found', { status: 404 })
  }

  const result = await syncKnowgrphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
  })
  if (result.pulledDocumentCount !== 1 || result.pulledChunkCount !== 1 || result.pulledGraphSnapshotCount !== 1) {
    throw new Error('expected one pulled document/chunk/graph snapshot in null-numeric sanitization regression test')
  }
  const docRow = await dbState.collections.documents.findOne('doc_null_numeric').exec()
  if (!docRow) throw new Error('expected sanitized pulled document row')
  if (docRow.get('documentRevision') !== 0) throw new Error('expected null document revision to sanitize to numeric 0')
  if (docRow.get('updatedAtMs') !== 0) throw new Error('expected null document updatedAtMs to sanitize to numeric 0')

  const chunkRow = await dbState.collections.documentChunks.findOne('chunk_null_numeric').exec()
  if (!chunkRow) throw new Error('expected sanitized pulled document chunk row')
  if (chunkRow.get('chunkOrder') !== 0) throw new Error('expected null chunkOrder to sanitize to numeric 0 fallback')
  if (chunkRow.get('tokenEstimate') !== 0) throw new Error('expected null tokenEstimate to sanitize to numeric 0')
  if (chunkRow.get('updatedAtMs') !== 0) throw new Error('expected null chunk updatedAtMs to sanitize to numeric 0')

  const graphRow = await dbState.collections.graphSnapshots.findOne('graph_null_numeric').exec()
  if (!graphRow) throw new Error('expected sanitized pulled graph snapshot row')
  if (graphRow.get('graphRevision') !== 0) throw new Error('expected null graphRevision to sanitize to numeric 0')
  if (graphRow.get('derivedFromDocumentRevision') !== 0) throw new Error('expected null derivedFromDocumentRevision to sanitize to numeric 0')
  if (graphRow.get('updatedAtMs') !== 0) throw new Error('expected null graph updatedAtMs to sanitize to numeric 0')
  const graphJson = graphRow.get('graphJson') as unknown
  if (!graphJson || typeof graphJson !== 'object' || Array.isArray(graphJson)) {
    throw new Error('expected invalid non-object graphJson to sanitize to object')
  }
  if (graphRow.get('layoutJson') !== null) throw new Error('expected invalid array layoutJson to sanitize to null')

  await __resetKnowgrphStorageDbForTests()
}

export async function testQueueKnowgrphStorageMutationSanitizesNullNumericFieldsInOutboundRecords() {
  await __resetKnowgrphStorageDbForTests()
  const dbState = await getKnowgrphStorageDb()
  const badGraphJson: Record<string, unknown> = { label: 'bad' }
  badGraphJson.fn = () => void 0
  badGraphJson.self = badGraphJson
  const mutationId = await queueKnowgrphStorageMutation({
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
  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncSanitizesLegacyOutboxPayloadsBeforePush() {
  await __resetKnowgrphStorageDbForTests()
  const dbState = await getKnowgrphStorageDb()
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

  let pushedMutation: Record<string, unknown> | null = null
  const fetchImpl: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith('/api/storage/push')) {
      const bodyText = String(init?.body || '')
      const body = JSON.parse(bodyText) as { mutations?: Array<Record<string, unknown>> }
      pushedMutation = (body.mutations || [])[0] || null
      return new Response(
        JSON.stringify({
          ok: true,
          apiVersion: KNOWGRPH_STORAGE_API_VERSION,
          workspaceId,
          ackCursor: 'ack:legacy-outbox',
          serverTimeMs: 1_777_310_000_000,
          acknowledgements: [
            {
              mutationId,
              recordId: legacyMutation.recordId,
              entity: 'graphSnapshot',
              status: 'applied',
              serverRevision: 1,
              message: null,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (url.endsWith('/api/storage/pull')) {
      return new Response(
        JSON.stringify({
          ok: true,
          apiVersion: KNOWGRPH_STORAGE_API_VERSION,
          workspaceId,
          nextCursor: 'pull:legacy-outbox',
          serverTimeMs: 1_777_310_000_100,
          changes: { documents: [], documentChunks: [], graphSnapshots: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('not found', { status: 404 })
  }

  const result = await syncKnowgrphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'https://example.com',
    fetchImpl,
    dbState,
  })
  if (result.pushedCount !== 1 || result.appliedCount !== 1) {
    throw new Error('expected legacy outbox payload sync to push and apply one mutation')
  }
  const pushedRecord = ((pushedMutation?.record || {}) as Record<string, unknown>)
  if (Number(pushedRecord.graphRevision) !== 0) throw new Error('expected legacy pushed graphRevision to sanitize to 0')
  if (Number(pushedRecord.derivedFromDocumentRevision) !== 0) throw new Error('expected legacy pushed derivedFromDocumentRevision to sanitize to 0')
  if (Number(pushedRecord.updatedAtMs) !== 0) throw new Error('expected legacy pushed updatedAtMs to sanitize to 0')
  if (!pushedRecord.graphJson || typeof pushedRecord.graphJson !== 'object' || Array.isArray(pushedRecord.graphJson)) {
    throw new Error('expected legacy pushed invalid graphJson to sanitize to object')
  }
  if (pushedRecord.layoutJson !== null) throw new Error('expected legacy pushed invalid array layoutJson to sanitize to null')

  await __resetKnowgrphStorageDbForTests()
}

export async function testKnowgrphStorageClientSyncRepairsLegacyTopLevelNullNumericOutboxFieldsBeforeSync() {
  await __resetKnowgrphStorageDbForTests()
  const dbState = await getKnowgrphStorageDb()
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

  await syncKnowgrphStorageNow({
    workspaceId,
    deviceId,
    baseUrl: 'http://127.0.0.1:5174',
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

  await __resetKnowgrphStorageDbForTests()
}

export {
  testKnowgrphStorageClientSyncAutoClearsStaleRetainedConflictsAfterPull,
  testKnowgrphStorageClientSyncCanApplyPulledRemoteChangesIntoVisibleSourceFiles,
  testKnowgrphStorageClientSyncRetainsConflictingOutboxMutationsForResolution,
  testKnowgrphStorageClientSyncSkipsNetworkLoadFailuresWithoutThrowing,
  testKnowgrphStorageClientSyncSkipsUnavailableRoutesWithoutThrowing,
} from '@/__tests__/knowgrphStorageClientSyncRuntime.test'
