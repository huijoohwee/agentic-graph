import { __resetKnowgrphStorageDbForTests, getKnowgrphStorageDb } from '@/lib/storage/knowgrphStorageDb'
import {
  __resetKnowgrphStorageRouteAvailabilityForTests,
  syncKnowgrphStorageNow,
} from '@/lib/storage/knowgrphStorageClientSync'
import { KNOWGRPH_STORAGE_API_VERSION, KNOWGRPH_STORAGE_SYNC_LIMITS } from '@/lib/storage/knowgrphStorageSyncContract'
import {
  KnowgrphStorageResponseLimitError,
  parseStorageResponseJson,
} from '@/lib/storage/knowgrphStorageClientTransport'

export async function testKnowgrphStorageClientCancelsOversizedChunkedResponse() {
  const chunkBytes = Math.floor(KNOWGRPH_STORAGE_SYNC_LIMITS.maxResponseBytes / 2) + 1
  let chunkIndex = 0
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex < 2) {
        chunkIndex += 1
        controller.enqueue(new Uint8Array(chunkBytes))
        return
      }
      controller.close()
    },
    cancel() {
      cancelled = true
    },
  })
  let error: unknown = null
  try {
    await parseStorageResponseJson(new Response(body, {
      headers: { 'content-type': 'application/json' },
    }), {
      requestLabel: 'chunked storage pull',
      apiOrigin: 'https://storage.example',
    })
  } catch (caught) {
    error = caught
  }
  if (!(error instanceof KnowgrphStorageResponseLimitError)) {
    throw new Error(`expected typed storage response byte-limit error, received ${String(error)}`)
  }
  if (!cancelled) throw new Error('expected oversized chunked storage response stream to be cancelled')
  if (chunkIndex !== 2) throw new Error(`expected cancellation at the first over-limit chunk, read ${chunkIndex} chunks`)
}

export async function testKnowgrphStorageClientAppliesEveryKeysetPage() {
  await __resetKnowgrphStorageDbForTests()
  __resetKnowgrphStorageRouteAvailabilityForTests()
  const workspaceId = 'wk_keyset_client'
  const observedCursors: Array<string | null> = []
  const document = (id: string, revision: number) => ({
    id, workspaceId, canonicalPath: `docs/${id}.md`, title: id, docType: 'note', lang: 'en-US',
    graphId: null, sourceKind: 'markdown' as const, contentMd: `# ${id}`, contentHash: `sha256:${id}`,
    parserVersion: '1.0.0', revision, updatedAtMs: 1_777_000_000_000 + revision, deleted: false,
  })
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    const body = await request.json() as { pageCursor?: string | null }
    observedCursors.push(body.pageCursor || null)
    const second = body.pageCursor === 'page-2'
    return Response.json({
      ok: true, apiVersion: KNOWGRPH_STORAGE_API_VERSION, workspaceId,
      nextCursor: 'sync:complete', nextPageCursor: second ? null : 'page-2', pageComplete: second,
      serverTimeMs: 1_777_000_000_100,
      changes: {
        documents: [document(second ? 'doc-2' : 'doc-1', second ? 2 : 1)],
        documentChunks: [], graphSnapshots: [], reusedChunkIds: [],
      },
    })
  }
  const dbState = await getKnowgrphStorageDb()
  const result = await syncKnowgrphStorageNow({
    workspaceId, deviceId: 'dev-keyset', baseUrl: 'https://storage.example', fetchImpl, dbState,
  })
  if (result.pulledDocumentCount !== 2) throw new Error(`expected two paged documents, got ${result.pulledDocumentCount}`)
  if (JSON.stringify(observedCursors) !== JSON.stringify([null, 'page-2'])) {
    throw new Error(`expected advancing page cursor sequence, got ${JSON.stringify(observedCursors)}`)
  }
  for (const id of ['doc-1', 'doc-2']) {
    if (!await dbState.collections.documents.findOne(id).exec()) throw new Error(`expected ${id} to persist`)
  }
  await __resetKnowgrphStorageDbForTests()
}
