import assert from 'node:assert/strict'
import { exportAgenticGraphStorageWorkspace, exportAgenticGraphStorageWorkspacePages } from '@/lib/storage/agentic-graph-storage-client-export'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createStorageWorkerRequest } from '@/__tests__/helpers/fake-agentic-graph-storage-worker-fetch'
import { __resetAgenticGraphStorageDbForTests, getAgenticGraphStorageDb } from '@/lib/storage/agentic-graph-storage-db'
import {
  __resetAgenticGraphStorageRouteAvailabilityForTests,
  syncAgenticGraphStorageNow,
} from '@/lib/storage/agentic-graph-storage-client-sync'
import { AGENTIC_OS_STORAGE_API_VERSION, AGENTIC_OS_STORAGE_SYNC_API_VERSION, AGENTIC_OS_STORAGE_SYNC_LIMITS } from '@/lib/storage/agentic-graph-storage-sync-contract'
import {
  AgenticGraphStorageResponseLimitError,
  AgenticGraphStorageRetryableTransportError,
  AgenticGraphStorageBrowserOriginError,
  buildAgenticGraphStorageSyncAuthHeaders,
  getClientFetch,
  fetchWithTimeout,
  parseStorageResponseJson,
} from '@/lib/storage/agentic-graph-storage-client-transport'

export async function testStorageFetchPreservesNativeCallableReceiver() {
  const expected = new Response('receiver-safe response')
  const input = 'https://storage.example/api/storage/export'
  let calls = 0
  const response = await fetchWithTimeout({
    fetchImpl: function(this: unknown, receivedInput, init) {
      assert.equal(this, undefined, 'A supplied fetch callable must not receive the transport arguments as its receiver')
      assert.equal(receivedInput, input)
      assert.equal(init?.credentials, 'include', 'Explicit browser credentials must survive the timeout wrapper')
      assert.ok(init?.signal instanceof AbortSignal)
      assert.equal(init.signal.aborted, false)
      calls += 1
      return Promise.resolve(expected)
    },
    input, init: { credentials: 'include' }, timeoutMs: 500,
  })
  assert.equal(calls, 1)
  assert.equal(response, expected, 'The timeout wrapper must preserve the supplied Response identity')
  assert.equal(await response.text(), 'receiver-safe response')
}

export async function testAgenticGraphStorageClientCancelsOversizedChunkedResponse() {
  const chunkBytes = Math.floor(AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes / 2) + 1
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
  if (!(error instanceof AgenticGraphStorageResponseLimitError)) {
    throw new Error(`expected typed storage response byte-limit error, received ${String(error)}`)
  }
  if (!cancelled) throw new Error('expected oversized chunked storage response stream to be cancelled')
  if (chunkIndex !== 2) throw new Error(`expected cancellation at the first over-limit chunk, read ${chunkIndex} chunks`)
}

export async function testAgenticGraphStorageClientAppliesEveryKeysetPage() {
  await __resetAgenticGraphStorageDbForTests()
  __resetAgenticGraphStorageRouteAvailabilityForTests()
  const workspaceId = 'wk_keyset_client'
  const observedCursors: Array<string | null> = []
  const document = (id: string, revision: number) => ({
    id, workspaceId, canonicalPath: `docs/${id}.md`, title: id, docType: 'note', lang: 'en-US',
    graphId: null, sourceKind: 'markdown' as const, contentMd: `# ${id}`, contentHash: `sha256:${id}`,
    parserVersion: '1.0.0', revision, updatedAtMs: 1_777_000_000_000 + revision, deleted: false,
  })
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = createStorageWorkerRequest(input, init)
    const body = await request.json() as { pageCursor?: string | null }
    observedCursors.push(body.pageCursor || null)
    const second = body.pageCursor === 'page-2'
    return Response.json({
      ok: true, apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId,
      nextCursor: '2026-05-04T00:00:00.000Z', nextPageCursor: second ? null : 'page-2', pageComplete: second,
      serverTimeMs: 1_777_000_000_100,
      changes: {
        documents: [document(second ? 'doc-2' : 'doc-1', second ? 2 : 1)],
        documentChunks: [], graphSnapshots: [], deletions: [], reusedChunkIds: [],
      },
    })
  }
  const dbState = await getAgenticGraphStorageDb()
  const result = await syncAgenticGraphStorageNow({
    workspaceId, deviceId: 'dev-keyset', baseUrl: (typeof window === 'undefined' ? '' : window.location?.origin) || 'https://storage.example', fetchImpl, dbState,
  })
  if (result.pulledDocumentCount !== 2) throw new Error(`expected two paged documents, got ${result.pulledDocumentCount}`)
  if (JSON.stringify(observedCursors) !== JSON.stringify([null, 'page-2'])) {
    throw new Error(`expected advancing page cursor sequence, got ${JSON.stringify(observedCursors)}`)
  }
  for (const id of ['doc-1', 'doc-2']) {
    if (!await dbState.collections.documents.findOne(id).exec()) throw new Error(`expected ${id} to persist`)
  }
  await __resetAgenticGraphStorageDbForTests()
}

export async function testStorageWorkerRequestPreservesBrowserRequestSemantics() {
  const { dom, restore } = initJsdomHarness()
  dom.reconfigure({ url: 'http://localhost:5173/workspace/current' })
  try {
    const controller = new AbortController()
    const request = createStorageWorkerRequest('/api/storage/push', {
      method: 'POST', body: '{"workspaceId":"fixture"}', credentials: 'same-origin',
      headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' },
      signal: controller.signal,
    })
    assert.equal(request.url, 'http://localhost:5173/api/storage/push')
    assert.equal(request.method, 'POST')
    assert.equal(await request.text(), '{"workspaceId":"fixture"}')
    assert.equal(request.headers.get('authorization'), 'Bearer fixture-token')
    assert.equal(request.headers.get('content-type'), 'application/json')
    assert.equal(request.credentials, 'same-origin')
    controller.abort('fixture cancellation')
    assert.equal(request.signal.aborted, true)
    assert.equal(request.signal.reason, 'fixture cancellation')
    assert.equal(createStorageWorkerRequest('relative').url, 'http://localhost:5173/workspace/relative')
    const absolute = 'https://service.example/api/storage/pull?cursor=next'
    assert.equal(createStorageWorkerRequest(new URL(absolute)).url, absolute)
    const input = new Request(absolute, { method: 'POST', body: 'original', headers: { authorization: 'Bearer old' } })
    const replaced = createStorageWorkerRequest(input, {
      method: 'PUT', body: 'replacement', headers: { authorization: 'Bearer new' }, credentials: 'omit',
    })
    assert.equal(replaced.url, absolute)
    assert.equal(replaced.method, 'PUT')
    assert.equal(await replaced.text(), 'replacement')
    assert.equal(replaced.headers.get('authorization'), 'Bearer new')
    assert.equal(replaced.credentials, 'omit')
  } finally { restore() }
}

export function testStorageWorkerRequestRequiresExplicitRelativeBase() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    assert.equal(Reflect.deleteProperty(globalThis, 'window'), true)
    assert.throws(() => createStorageWorkerRequest('/api/storage/push'), /require a browser URL/)
    const absolute = 'https://service.example/api/storage/pull'
    assert.equal(createStorageWorkerRequest(absolute).url, absolute)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

export async function testStorageWorkerFixturePreservesClientOriginAndAuthGuards() {
  const { dom, restore } = initJsdomHarness()
  dom.reconfigure({ url: 'http://localhost:5173/workspace/current' })
  const previousPublicToken = process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN
  process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN = 'public-build-input-must-not-be-a-credential'
  try {
    const observed: Request[] = []
    const clientFetch = getClientFetch(async (input, init) => {
      observed.push(createStorageWorkerRequest(input, init))
      return new Response('{}', { status: 200 })
    })
    await clientFetch('/api/storage/pull', {
      method: 'POST', body: 'public fixture body', headers: buildAgenticGraphStorageSyncAuthHeaders(),
    })
    assert.equal(observed.length, 1)
    assert.equal(observed[0].url, 'http://localhost:5173/api/storage/pull')
    assert.equal(observed[0].credentials, 'same-origin')
    assert.equal(observed[0].headers.get('authorization'), null)
    assert.equal(await observed[0].text(), 'public fixture body')
    assert.deepEqual(buildAgenticGraphStorageSyncAuthHeaders('explicit-service-token'), { authorization: 'Bearer explicit-service-token' })
    for (const path of ['/api/storage/push', '/api/storage/pull', '/api/storage/export/fixture']) {
      assert.throws(() => clientFetch(`https://foreign.example${path}`, { method: 'POST', body: 'must remain local' }), AgenticGraphStorageBrowserOriginError)
    }
    assert.throws(() => clientFetch(new Request('https://foreign.example/api/storage/pull')), AgenticGraphStorageBrowserOriginError)
    assert.equal(observed.length, 1, 'foreign requests must fail before reaching the fixture fetch')
  } finally {
    if (previousPublicToken === undefined) delete process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN
    else process.env.VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN = previousPublicToken
    restore()
  }
}

const EXPORT_WORKSPACE = 'workspace:export-contract'
const exportPage = (overrides: Record<string, unknown> = {}) => ({
  ok: true, apiVersion: AGENTIC_OS_STORAGE_API_VERSION, workspaceId: EXPORT_WORKSPACE,
  exportedAtMs: 1_777_000_000_000, documents: [], documentChunks: [], graphSnapshots: [], ...overrides,
})
const exportDocument = (id: string) => ({
  id, workspaceId: EXPORT_WORKSPACE, canonicalPath: `${id}.md`, title: id, docType: 'markdown',
  lang: null, graphId: null, sourceKind: 'markdown', contentMd: `# ${id}`, contentHash: `hash:${id}`,
  parserVersion: 'fixture', revision: 1, updatedAtMs: 1_777_000_000_000, deleted: false,
})
const withExportBrowser = async (run: (baseUrl: string) => Promise<void>) => {
  const { dom, restore } = initJsdomHarness()
  const baseUrl = 'https://workspace.example.test'
  dom.reconfigure({ url: `${baseUrl}/workspace/current` })
  try { await run(baseUrl) } finally { restore() }
}

export async function testStorageExportClientCollectsThreePagesAndLegacyCompleteResponse() {
  await withExportBrowser(async baseUrl => {
    const requests: Request[] = []
    const pages = [
      exportPage({ documents: [exportDocument('one')], pageComplete: false, nextPageCursor: 'A' }),
      exportPage({ documentChunks: [{ id: 'chunk', workspaceId: EXPORT_WORKSPACE, documentId: 'one',
        chunkKey: 'body', chunkOrder: 0, heading: null, markdown: '# chunk', tokenEstimate: 1,
        contentHash: 'hash:chunk', updatedAtMs: 1_777_000_000_000 }], pageComplete: false, nextPageCursor: 'B' }),
      exportPage({ documents: [exportDocument('two')], graphSnapshots: [{ id: 'graph', workspaceId: EXPORT_WORKSPACE,
        documentId: 'two', graphRevision: 1, graphHash: 'hash:graph', graphJson: { nodes: [] }, layoutJson: null,
        derivedFromDocumentRevision: 1, updatedAtMs: 1_777_000_000_000 }], pageComplete: true, nextPageCursor: null }),
    ]
    const result = await exportAgenticGraphStorageWorkspace({ workspaceId: EXPORT_WORKSPACE, baseUrl,
      sessionToken: 'explicit-export-service-token', fetchImpl: async (input, init) => {
        requests.push(createStorageWorkerRequest(input, init))
        assert.ok(requests.length <= pages.length, 'Valid pagination must not request another page after completion')
        return Response.json(pages[requests.length - 1])
      } })
    assert.deepEqual(requests.map(request => new URL(request.url).searchParams.get('cursor')), [null, 'A', 'B'])
    for (const request of requests) {
      assert.equal(new URL(request.url).origin, baseUrl)
      assert.equal(request.credentials, 'same-origin')
      assert.equal(request.headers.get('authorization'), 'Bearer explicit-export-service-token')
    }
    assert.deepEqual(result.documents.map(row => row.id), ['one', 'two'])
    assert.equal(result.documentChunks[0].markdown, '# chunk')
    assert.deepEqual(result.graphSnapshots[0].graphJson, { nodes: [] })
    assert.equal(result.pageComplete, true)
    assert.equal(result.nextPageCursor, null)
    let legacyCalls = 0
    const legacy = await exportAgenticGraphStorageWorkspace({ workspaceId: EXPORT_WORKSPACE, baseUrl,
      fetchImpl: async (_input, init) => {
        legacyCalls += 1
        assert.equal(new Headers(init?.headers).get('authorization'), null)
        assert.equal(init?.credentials, 'same-origin')
        return Response.json(exportPage({ documents: [exportDocument('legacy')] }))
      } })
    assert.equal(legacyCalls, 1)
    assert.equal(legacy.documents[0].id, 'legacy')
  })
}

export async function testStorageExportClientRejectsMalformedPagesBeforeYield() {
  await withExportBrowser(async baseUrl => {
    const invalid: Record<string, unknown>[] = [
      { workspaceId: 'workspace:other' },
      { pageComplete: false }, { pageComplete: false, nextPageCursor: '' },
      { pageComplete: false, nextPageCursor: 1 }, { pageComplete: 'false' },
      { pageComplete: true, nextPageCursor: 'unexpected' },
      { pageComplete: false, nextPageCursor: 'A'.repeat(4097) },
    ]
    for (const field of ['documents', 'documentChunks', 'graphSnapshots']) {
      for (const value of [undefined, null, {}, 'not an array', [null], ['not a row'],
        [{ id: 'foreign', workspaceId: 'workspace:other' }]]) invalid.push({ [field]: value })
    }
    for (const malformed of invalid) {
      let yielded = 0
      let calls = 0
      await assert.rejects(async () => {
        for await (const _page of exportAgenticGraphStorageWorkspacePages({ workspaceId: EXPORT_WORKSPACE, baseUrl,
          fetchImpl: async () => { calls += 1; return Response.json(exportPage(malformed)) } })) yielded += 1
      }, /storage export/)
      assert.equal(yielded, 0, 'An invalid page must never be offered to a streaming consumer')
      assert.equal(calls, 1, 'Invalid metadata must fail without retry or continuation')
    }
  })
}

export async function testStorageExportClientRejectsNonadvancingAndCyclicCursorsBeforeYield() {
  await withExportBrowser(async baseUrl => {
    for (const nextCursors of [['A', 'A'], ['A', 'B', 'A']]) {
      let yielded = 0
      let calls = 0
      const observed: Array<string | null> = []
      await assert.rejects(async () => {
        for await (const _page of exportAgenticGraphStorageWorkspacePages({ workspaceId: EXPORT_WORKSPACE, baseUrl,
          fetchImpl: async (input, init) => {
            observed.push(new URL(createStorageWorkerRequest(input, init).url).searchParams.get('cursor'))
            assert.ok(calls < nextCursors.length, 'Cycle detection must stop before another network request')
            return Response.json(exportPage({ documents: [exportDocument(`doc-${calls}`)], pageComplete: false,
              nextPageCursor: nextCursors[calls++] }))
          } })) yielded += 1
      }, /non-advancing|cyclic/)
      assert.equal(calls, nextCursors.length)
      assert.equal(yielded, nextCursors.length - 1, 'Reject the page carrying the broken continuation before yield')
      assert.deepEqual(observed, [null, ...nextCursors.slice(0, -1)])
    }
  })
}

export async function testStorageExportClientKeepsNativeRowAndByteBounds() {
  await withExportBrowser(async baseUrl => {
    let yielded = 0
    await assert.rejects(async () => {
      for await (const _page of exportAgenticGraphStorageWorkspacePages({ workspaceId: EXPORT_WORKSPACE, baseUrl,
        fetchImpl: async () => Response.json(exportPage({ documents: Array.from({ length: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows + 1 },
          (_, index) => exportDocument(`doc-${index}`)) })) })) yielded += 1
    }, AgenticGraphStorageResponseLimitError)
    assert.equal(yielded, 0)
    let cancelled = false
    await assert.rejects(exportAgenticGraphStorageWorkspace({ workspaceId: EXPORT_WORKSPACE, baseUrl,
      fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true } }), {
        headers: { 'content-type': 'application/json', 'content-length': String(AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes + 1) },
      }) }), AgenticGraphStorageResponseLimitError)
    assert.equal(cancelled, true, 'Export still uses the shared bounded body reader and its cancellation')
  })
}

export async function testStorageExportClientBoundsHeaderWaitAndKeepsOriginGuard() {
  await withExportBrowser(async baseUrl => {
    const observed: { signal?: AbortSignal } = {}
    let calls = 0
    await assert.rejects(exportAgenticGraphStorageWorkspace({ workspaceId: EXPORT_WORKSPACE, baseUrl, requestTimeoutMs: 5,
      fetchImpl: async (_input, init) => {
        calls += 1
        observed.signal = init?.signal as AbortSignal
        return await new Promise<Response>(() => void 0)
      } }), AgenticGraphStorageRetryableTransportError)
    assert.equal(calls, 1, 'Export timeout does not introduce a retry loop')
    assert.equal(observed.signal?.aborted, true, 'The existing timeout owner aborts the pending fetch')
    await assert.rejects(exportAgenticGraphStorageWorkspace({ workspaceId: EXPORT_WORKSPACE, baseUrl: 'https://foreign.example',
      fetchImpl: async () => { throw new Error('origin guard must reject before fetch') } }), AgenticGraphStorageBrowserOriginError)
  })
}


const withStorageBodyRescue = async <T>(run: () => Promise<T>, release: () => void): Promise<T> => {
  const schedule = globalThis.setTimeout.bind(globalThis), clear = globalThis.clearTimeout.bind(globalThis)
  const bounded = async <R>(operation: Promise<R>, label: string): Promise<R> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
        timer = schedule(() => reject(new Error(`Storage body fixture ${label} deadline exceeded`)), 500)
      })])
    } finally { if (timer !== undefined) clear(timer) }
  }
  const operation = Promise.resolve().then(run)
  const errors: unknown[] = []
  let value!: T
  try { value = await bounded(operation, 'rescue') } catch (error) { errors.push(error) }
  try { release() } catch (error) { errors.push(error) }
  try { await bounded(operation.then(() => undefined, () => undefined), 'drain') } catch (error) { errors.push(error) }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, errors.map(error => String(error)).join('; '))
  return value
}

const storageBodyFixture = (chunks: Uint8Array[], options: {
  stall?: boolean; beforePull?: () => void; declaredBytes?: number
} = {}) => {
  let controller!: ReadableStreamDefaultController<Uint8Array>, finishCancel!: () => void
  let pulls = 0, cancellations = 0
  const cancellation = new Promise<void>(resolve => { finishCancel = resolve })
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    pull(value) {
      options.beforePull?.()
      const chunk = chunks[pulls++]
      if (chunk) value.enqueue(chunk)
      else if (!options.stall) value.close()
    },
    cancel() { cancellations += 1; return cancellation },
  }, { highWaterMark: 0 })
  const headers = new Headers({ 'content-type': 'application/json' })
  if (options.declaredBytes !== undefined) headers.set('content-length', String(options.declaredBytes))
  return {
    response: new Response(body, { headers }),
    get pulls() { return pulls }, get cancellations() { return cancellations },
    release() {
      const lockedBeforeFixtureCleanup = body.locked
      finishCancel()
      try { controller.error(new Error('Storage body fixture released')) } catch { /* Already terminal. */ }
      assert.equal(lockedBeforeFixtureCleanup, false, 'The reader owner must release its lock before fixture rescue')
    },
  }
}

const withStorageMonotonicClock = async (run: (clock: { now: number }) => Promise<void>): Promise<void> => {
  const owner = globalThis.performance
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'now')
  const clock = { now: 1_000 }
  Object.defineProperty(owner, 'now', { configurable: true, value: () => clock.now })
  let failure: unknown, failed = false
  try { await run(clock) } catch (error) { failure = error; failed = true }
  try {
    if (descriptor) Object.defineProperty(owner, 'now', descriptor)
    else assert.equal(Reflect.deleteProperty(owner, 'now'), true, 'Clock descriptor restoration must succeed')
  } catch (error) {
    if (failed) throw new AggregateError([failure, error], `${String(failure)}; Clock restore failed: ${String(error)}`)
    throw error
  }
  if (failed) throw failure
}

export async function testStorageResponseBodyDeadlineCancelsStalledProducer() {
  for (const inherited of [false, true]) {
    const fixture = storageBodyFixture([], { stall: true })
    const observed: { signal?: AbortSignal } = {}
    await assert.rejects(withStorageBodyRescue(async () => {
      const response = inherited ? await fetchWithTimeout({
        fetchImpl: async (_input, init) => { observed.signal = init?.signal as AbortSignal; return fixture.response },
        input: 'https://storage.example/api/storage/export', init: { method: 'GET' }, timeoutMs: 5,
      }) : fixture.response
      return parseStorageResponseJson(response, {
        requestLabel: 'stalled storage response', apiOrigin: 'https://storage.example',
        ...(inherited ? {} : { timeoutMs: 5 }),
      })
    }, fixture.release), AgenticGraphStorageRetryableTransportError)
    assert.equal(fixture.cancellations, 1, 'The deadline must cancel even when producer cancellation never settles')
    if (inherited) assert.equal(observed.signal?.aborted, true, 'Body expiry must abort the inherited fetch owner')
  }
}

export async function testStorageResponseBodyUsesRemainingRequestDeadline() {
  for (const [headerElapsed, bodyElapsed, parserTimeout] of [[75, 26, undefined], [75, 26, 1_000], [0, 21, 20]]) {
    await withStorageMonotonicClock(async clock => {
      const fixture = storageBodyFixture([new TextEncoder().encode('{"ok":true}')], {
        beforePull() { clock.now += bodyElapsed! },
      })
      await assert.rejects(withStorageBodyRescue(async () => {
        const response = await fetchWithTimeout({
          fetchImpl: async () => { clock.now += headerElapsed!; return fixture.response },
          input: 'https://storage.example/api/storage/export', init: { method: 'GET' }, timeoutMs: 100,
        })
        return parseStorageResponseJson(response, {
          requestLabel: 'remaining storage budget', apiOrigin: 'https://storage.example', timeoutMs: parserTimeout,
        })
      }, fixture.release), AgenticGraphStorageRetryableTransportError)
      assert.equal(fixture.pulls, 1, 'Headers consume the original deadline; parser options may only shorten it')
      assert.equal(fixture.cancellations, 1)
    })
  }
}

export async function testStorageResponseDeadlineDoesNotResetForReadyChunks() {
  await withStorageMonotonicClock(async clock => {
    const chunks = [...new TextEncoder().encode('{"ok":true}')].map(byte => new Uint8Array([byte]))
    const fixture = storageBodyFixture(chunks, { beforePull() { clock.now += 7 } })
    await assert.rejects(withStorageBodyRescue(() => parseStorageResponseJson(fixture.response, {
      requestLabel: 'ready storage chunks', apiOrigin: 'https://storage.example', timeoutMs: 20,
    }), fixture.release), AgenticGraphStorageRetryableTransportError)
    assert.equal(fixture.pulls, 3, 'Always-ready microtasks must stop at the single body deadline')
    assert.equal(fixture.cancellations, 1)
  })
}

export async function testStorageResponseLimitsIgnoreNonsettlingCancellation() {
  const half = Math.floor(AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes / 2) + 1
  for (const declared of [true, false]) {
    const fixture = storageBodyFixture(declared ? [] : [new Uint8Array(half), new Uint8Array(half)], {
      stall: true, ...(declared ? { declaredBytes: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes + 1 } : {}),
    })
    await assert.rejects(withStorageBodyRescue(() => parseStorageResponseJson(fixture.response, {
      requestLabel: 'oversized storage body', apiOrigin: 'https://storage.example', timeoutMs: 1_000,
    }), fixture.release), AgenticGraphStorageResponseLimitError)
    assert.equal(fixture.cancellations, 1, 'Byte-limit rejection must not wait for producer cancellation')
    assert.equal(fixture.pulls, declared ? 0 : 2, 'No read is allowed after the first proven byte overflow')
  }
}

export async function testStorageResponseUtf8PreservesSplitBytesAndRejectsMalformed() {
  const expected = { text: 'Buyer 🧭 café\u0000\n', nested: { paid: true } }
  const bytes = new TextEncoder().encode(JSON.stringify(expected))
  const fixture = storageBodyFixture([...bytes].map(byte => new Uint8Array([byte])))
  const parsed = await withStorageBodyRescue(() => parseStorageResponseJson(fixture.response, {
    requestLabel: 'split UTF-8 storage body', apiOrigin: 'https://storage.example', timeoutMs: 1_000,
  }), fixture.release)
  assert.deepEqual(parsed, expected, 'Streaming decoding must preserve multibyte text and embedded NUL exactly')
  for (const [chunk, stall] of [[new Uint8Array([0xc3, 0x28]), true], [new Uint8Array([0xf0, 0x9f]), false]] as const) {
    const malformed = storageBodyFixture([chunk], { stall })
    await assert.rejects(withStorageBodyRescue(() => parseStorageResponseJson(malformed.response, {
      requestLabel: 'malformed UTF-8 storage body', apiOrigin: 'https://storage.example', timeoutMs: 1_000,
    }), malformed.release), /response is unreadable/)
    if (stall) assert.equal(malformed.cancellations, 1)
  }
}
