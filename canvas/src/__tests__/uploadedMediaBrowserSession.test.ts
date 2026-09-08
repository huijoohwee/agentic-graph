import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useUploadedMediaInlineCommandCandidates } from '@/lib/command-menu/inlineUploadedMediaCandidates'
import { createFakeAgenticGraphStorageBrowserSession } from '@/__tests__/helpers/fake-agentic-graph-storage-browser-session'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  uploadMediaFileToAgenticGraphStorage,
  listUploadedMediaFromAgenticGraphStorage,
  renameUploadedMediaInAgenticGraphStorage,
  deleteUploadedMediaFromAgenticGraphStorage,
} from '@/lib/storage/uploadedMediaStorage'
import { AgenticGraphStorageBrowserOriginError, AgenticGraphStorageRetryableTransportError } from '@/lib/storage/agentic-graph-storage-client-transport'
import { uploadGeneratedWorkspaceBlobToAgenticGraphStorage } from '@/features/source-files/sourceFilesBinaryStorage'

const WORKSPACE = 'workspace:browser-media-client'
const ENV_KEYS = ['VITE_AGENTIC_OS_STORAGE_BASE_URL', 'VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID',
  'VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED'] as const
const withBrowser = async (run: (origin: string) => Promise<void>): Promise<void> => {
  const originalFetch = globalThis.fetch
  const previous = ENV_KEYS.map(key => process.env[key])
  const harness = initJsdomHarness()
  harness.dom.reconfigure({ url: 'https://storage.example/' })
  const origin = window.location.origin
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = origin
  process.env.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID = WORKSPACE
  process.env.VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED = 'true'
  let failure: unknown
  try { await run(origin) } catch (error) { failure = error }
  const cleanupErrors: unknown[] = []
  try { harness.restore() } catch (error) { cleanupErrors.push(error) }
  globalThis.fetch = originalFetch
  ENV_KEYS.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key]
    else process.env[key] = previous[index]
  })
  if (failure && !cleanupErrors.length) throw failure
  if (failure || cleanupErrors.length) throw new AggregateError(
    [...(failure ? [failure] : []), ...cleanupErrors], 'Browser media fixture failed',
  )
}

export const testUploadedMediaBrowserSessionRoundTrip = async (): Promise<void> => withBrowser(async origin => {
  const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
  const trace: Array<{ path: string; method: string }> = []
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    assert.equal(headers.has('authorization'), false, 'Browser does not expose a bearer token')
    assert.equal(headers.has('cookie'), false, 'Cookie remains owned by the transport')
    assert.equal(init?.credentials, 'same-origin')
    trace.push({ path: new URL(input instanceof Request ? input.url : String(input), origin).pathname,
      method: init?.method || (input instanceof Request ? input.method : 'GET') })
    return fixture.fetch(input, init)
  }
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const file = new File([bytes], 'replay.png', { type: 'image/png' })
  const uploaded = await uploadMediaFileToAgenticGraphStorage({ file, uploadNow: true })
  assert.ok(uploaded, 'Authenticated browser returns a durable artifact')
  assert.deepEqual(trace.map(row => row.method), ['POST', 'PUT', 'POST'])
  assert.equal(trace.filter(row => row.path === '/api/storage/media-capabilities').length, 1,
    'Persist already returns the signed read URL; no duplicate pre-upload read capability is requested')
  assert.equal(uploaded.accessUrl, uploaded.response.access.url)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 1)
  const listed = await listUploadedMediaFromAgenticGraphStorage()
  assert.equal(listed.length, 1, 'A subsequent catalog request reads the persisted D1 row')
  assert.equal(listed[0].response.artifactId, uploaded.response.artifactId)
  const read = await fixture.fetch(listed[0].accessUrl, { credentials: 'same-origin' })
  assert.equal(read.status, 200)
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), bytes)
  const renamed = await renameUploadedMediaInAgenticGraphStorage({ storage: listed[0], name: 'renamed.png' })
  assert.ok(renamed)
  assert.equal(renamed.provenance.fileName, 'renamed.png')
  assert.equal((await fixture.fetch(renamed.accessUrl, { credentials: 'same-origin' })).status, 200,
    'Rename must return a usable signed URL')
  const deleted = await deleteUploadedMediaFromAgenticGraphStorage({ storage: renamed })
  assert.ok(deleted?.ok)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
  assert.deepEqual(await listUploadedMediaFromAgenticGraphStorage(), [])
})

export const testUploadedMediaBrowserRejectsCrossOriginBeforeDispatch = async (): Promise<void> => withBrowser(async () => {
  process.env.VITE_AGENTIC_OS_STORAGE_BASE_URL = 'https://foreign.example'
  let dispatched = 0
  const fetchImpl: typeof fetch = async () => { dispatched++; throw new Error('unexpected foreign request') }
  const file = new File(['private-bytes'], 'private.png', { type: 'image/png' })
  await assert.rejects(() => uploadMediaFileToAgenticGraphStorage({ file, uploadNow: true, fetchImpl }),
    AgenticGraphStorageBrowserOriginError)
  await assert.rejects(() => listUploadedMediaFromAgenticGraphStorage({ fetchImpl }), AgenticGraphStorageBrowserOriginError)
  await assert.rejects(() => uploadGeneratedWorkspaceBlobToAgenticGraphStorage({
    workspacePath: '/workspace/invoice.pdf', blob: file, uploadNow: true, fetchImpl,
  }), AgenticGraphStorageBrowserOriginError)
  assert.equal(dispatched, 0, 'Neither metadata nor bytes can leave this browser origin')
})

export const testGeneratedBlobBrowserSessionRoundTrip = async (): Promise<void> => withBrowser(async origin => {
  const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
  const blob = new Blob(['%PDF-local-fixture'], { type: 'application/pdf' })
  const uploaded = await uploadGeneratedWorkspaceBlobToAgenticGraphStorage({ workspacePath: '/workspace/invoice.pdf',
    blob, uploadNow: true, fetchImpl: fixture.fetch })
  assert.ok(uploaded, 'A browser session delivers generic artifacts as well as media')
  const read = await fixture.fetch(uploaded.publicUrl, { credentials: 'same-origin' })
  assert.equal(read.status, 200)
  assert.equal(await read.text(), await blob.text())
  fixture.env.DB.workspaceMemberships.get(fixture.membershipId)!.role = 'viewer'
  assert.equal(await uploadGeneratedWorkspaceBlobToAgenticGraphStorage({ workspacePath: '/workspace/other.pdf',
    blob, uploadNow: true, fetchImpl: fixture.fetch }), null)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 1)
})

const mediaFile = () => new File(['paid-artifact'], 'deadline.png', { type: 'image/png' })
const requestStage = (input: RequestInfo | URL, init?: RequestInit): string => {
  const path = new URL(input instanceof Request ? input.url : String(input)).pathname
  const method = init?.method || 'GET'
  return path.endsWith('/media-capabilities')
    ? `capability:${JSON.parse(String(init?.body)).operation}`
    : method === 'PUT' ? 'media:PUT' : `${path.includes('/blob/') ? 'blob' : 'assets'}:${method}`
}
const boundedFixture = async <T>(operation: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Upload fixture did not settle within 1500ms')), 1500)
    })])
  } finally { if (timer !== undefined) clearTimeout(timer) }
}
const assertHeaderTimeout = async (
  delegate: typeof fetch, stage: string, run: (fetchImpl: typeof fetch) => Promise<unknown>,
  expectedStages: string[], bearer?: string,
): Promise<void> => {
  const trace: string[] = []
  let signal: AbortSignal | null | undefined, release: (() => void) | undefined
  const fetchImpl: typeof fetch = (input, init) => {
    const current = requestStage(input, init)
    trace.push(current)
    const headers = new Headers(init?.headers)
    assert.equal(init?.credentials, 'same-origin')
    assert.equal(headers.has('cookie'), false, 'Only the browser fixture owns the session cookie')
    assert.equal(headers.get('authorization'), bearer ? `Bearer ${bearer}` : null)
    if (current !== stage) return delegate(input, init)
    signal = init?.signal
    return new Promise<Response>((_resolve, reject) => { release = () => reject(new Error('Withheld headers released by fixture')) })
  }
  const operation = run(fetchImpl)
  const errors: unknown[] = []
  try {
    await assert.rejects(boundedFixture(operation), AgenticGraphStorageRetryableTransportError)
    assert.equal(signal?.aborted, true, 'Expiry must abort the actual injected fetch signal')
    assert.deepEqual(trace, expectedStages, 'No retry or later persistence stage may follow an expired request')
  } catch (error) { errors.push(error) }
  try { release?.() } catch (error) { errors.push(error) }
  try { await boundedFixture(operation.then(() => undefined, () => undefined)) } catch (error) { errors.push(error) }
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, 'Header timeout fixture failed')
}

export const testUploadedMediaHeadersBoundEveryUploadPhase = async (): Promise<void> => withBrowser(async origin => {
  for (const stage of ['capability:write', 'media:PUT', 'assets:POST']) {
    const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
    const stages = ['capability:write', 'media:PUT', 'assets:POST']
    await assertHeaderTimeout(fixture.fetch, stage, fetchImpl => uploadMediaFileToAgenticGraphStorage({
      file: mediaFile(), uploadNow: true, fetchImpl, requestTimeoutMs: 80,
    }), stages.slice(0, stages.indexOf(stage) + 1))
    assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, stage === 'assets:POST' ? 1 : 0,
      'Only a completed raw upload may exist; no client success is invented for an interrupted phase')
    assert.deepEqual(await listUploadedMediaFromAgenticGraphStorage({ fetchImpl: fixture.fetch }), [],
      'An unconfirmed artifact is not advertised as a durable catalog entry')
  }
})

export const testUploadedMediaHeadersBoundCatalogMutations = async (): Promise<void> => withBrowser(async origin => {
  for (const [operation, stage, expected] of [
    ['list', 'assets:GET', ['assets:GET']],
    ['list', 'capability:read', ['assets:GET', 'capability:read']],
    ['rename', 'assets:PATCH', ['assets:PATCH']],
    ['rename', 'capability:read', ['assets:PATCH', 'capability:read']],
    ['delete', 'assets:DELETE', ['assets:DELETE']],
  ] as const) {
    const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
    const storage = await uploadMediaFileToAgenticGraphStorage({ file: mediaFile(), uploadNow: true, fetchImpl: fixture.fetch })
    assert.ok(storage)
    await assertHeaderTimeout(fixture.fetch, stage, fetchImpl => {
      const options = { fetchImpl, requestTimeoutMs: 80 }
      return operation === 'list' ? listUploadedMediaFromAgenticGraphStorage(options)
        : operation === 'rename' ? renameUploadedMediaInAgenticGraphStorage({ ...options, storage, name: 'next.png' })
          : deleteUploadedMediaFromAgenticGraphStorage({ ...options, storage })
    }, [...expected])
    assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 1,
      'No withheld request is dispatched or converted into successful deletion')
  }
})

export const testGeneratedBlobHeadersBoundWithoutChangingAuth = async (): Promise<void> => withBrowser(async origin => {
  const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
  await assertHeaderTimeout(fixture.fetch, 'blob:POST', fetchImpl => uploadGeneratedWorkspaceBlobToAgenticGraphStorage({
    workspacePath: '/workspace/invoice.pdf', blob: new Blob(['%PDF-invoice']), uploadNow: true,
    fetchImpl, sessionToken: fixture.sessionToken, requestTimeoutMs: 80,
  }), ['blob:POST'], fixture.sessionToken)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
})

export const testUploadedMediaStatusOnlyBodyIsDisposed = async (): Promise<void> => withBrowser(async origin => {
  for (const status of [200, 500]) {
    const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
    let canceled = 0, finishCancel!: () => void, rawResponse: Response | undefined
    const cancellation = new Promise<void>(resolve => { finishCancel = resolve })
    const fetchImpl: typeof fetch = async (input, init) => {
      if (requestStage(input, init) !== 'media:PUT') return fixture.fetch(input, init)
      const actual = await fixture.fetch(input, init)
      assert.equal(actual.status, 200)
      await actual.body?.cancel()
      rawResponse = new Response(new ReadableStream({ cancel() { canceled++; return cancellation } }), { status })
      return rawResponse
    }
    const operation = uploadMediaFileToAgenticGraphStorage({ file: mediaFile(), uploadNow: true, fetchImpl })
    const errors: unknown[] = []
    try {
      const result = await boundedFixture(operation)
      assert.equal(!!result, status === 200)
      assert.equal(canceled, 1, 'Status-only success and failure bodies are canceled without waiting for the producer')
      assert.equal(rawResponse?.body?.locked, false)
    } catch (error) { errors.push(error) }
    finishCancel()
    try { await boundedFixture(operation.then(() => undefined, () => undefined)) } catch (error) { errors.push(error) }
    if (errors.length === 1) throw errors[0]
    if (errors.length) throw new AggregateError(errors, 'Raw upload disposal fixture failed')
  }
  for (const stage of ['assets:GET', 'assets:PATCH', 'assets:DELETE', 'assets:POST', 'blob:POST']) {
    const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
    const storage = await uploadMediaFileToAgenticGraphStorage({ file: mediaFile(), uploadNow: true, fetchImpl: fixture.fetch })
    assert.ok(storage)
    let canceled = 0, finishCancel!: () => void, errorResponse: Response | undefined
    const trace: string[] = []
    const cancellation = new Promise<void>(resolve => { finishCancel = resolve })
    const fetchImpl: typeof fetch = (input, init) => {
      const current = requestStage(input, init)
      trace.push(current)
      if (current !== stage) return fixture.fetch(input, init)
      errorResponse = new Response(new ReadableStream({ cancel() { canceled++; return cancellation } }), { status: 500 })
      return Promise.resolve(errorResponse)
    }
    const operation: Promise<unknown> = stage === 'assets:GET' ? listUploadedMediaFromAgenticGraphStorage({ fetchImpl })
      : stage === 'assets:PATCH' ? renameUploadedMediaInAgenticGraphStorage({ storage, name: 'next.png', fetchImpl })
        : stage === 'assets:DELETE' ? deleteUploadedMediaFromAgenticGraphStorage({ storage, fetchImpl })
          : stage === 'assets:POST' ? uploadMediaFileToAgenticGraphStorage({ file: mediaFile(), uploadNow: true, fetchImpl })
            : uploadGeneratedWorkspaceBlobToAgenticGraphStorage({ workspacePath: '/workspace/invoice.pdf',
              blob: new Blob(['%PDF-invoice']), uploadNow: true, fetchImpl })
    const errors: unknown[] = []
    try {
      const result = await boundedFixture(operation)
      assert.deepEqual(result, stage === 'assets:GET' ? [] : null, 'The existing unsuccessful response semantics remain intact')
      assert.equal(canceled, 1, 'Every unused error body is canceled once without awaiting the producer')
      assert.equal(errorResponse?.body?.locked, false)
      assert.deepEqual(trace, stage === 'assets:POST' ? ['capability:write', 'media:PUT', stage] : [stage],
        'An HTTP failure must not retry or start a subsequent network phase')
    } catch (error) { errors.push(error) }
    finishCancel()
    try { await boundedFixture(operation.then(() => undefined, () => undefined)) } catch (error) { errors.push(error) }
    try { await errorResponse?.body?.cancel() } catch (error) { errors.push(error) }
    if (errors.length === 1) throw errors[0]
    if (errors.length) throw new AggregateError(errors, 'Unused error response disposal fixture failed')
  }
})

export const testUploadedMediaBodyKeepsOriginalPhaseDeadline = async (): Promise<void> => withBrowser(async origin => {
  for (const stage of ['capability:write', 'assets:POST', 'blob:POST', 'new-phase']) {
    const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
    const clockOwner = globalThis.performance
    const previousNow = Object.getOwnPropertyDescriptor(clockOwner, 'now')
    let now = 1000, cancels = 0, pulls = 0, phaseResponse: Response | undefined, phaseSignal: AbortSignal | null | undefined
    Object.defineProperty(clockOwner, 'now', { configurable: true, value: () => now })
    const errors: unknown[] = []
    try {
      const fetchImpl: typeof fetch = async (input, init) => {
        const actual = await fixture.fetch(input, init)
        if (stage === 'new-phase') { now += 75; return actual }
        if (requestStage(input, init) !== stage) return actual
        phaseSignal = init?.signal
        const bytes = new Uint8Array(await actual.arrayBuffer())
        now += 75
        phaseResponse = new Response(new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls++
            now += 26
            controller.enqueue(bytes)
          },
          cancel() { cancels++ },
        }, { highWaterMark: 0 }), { status: actual.status, headers: actual.headers })
        return phaseResponse
      }
      const operation: Promise<unknown> = stage === 'blob:POST'
        ? uploadGeneratedWorkspaceBlobToAgenticGraphStorage({ workspacePath: '/workspace/invoice.pdf',
          blob: new Blob(['%PDF-invoice']), uploadNow: true, fetchImpl, requestTimeoutMs: 100 })
        : uploadMediaFileToAgenticGraphStorage({ file: mediaFile(), uploadNow: true, fetchImpl, requestTimeoutMs: 100 })
      if (stage === 'new-phase') {
        assert.ok(await boundedFixture(operation), 'Each upload phase gets its own request allowance')
        assert.equal(now, 1225, 'Three75ms phases may complete despite exceeding100ms in total')
      } else {
        if (stage === 'capability:write') await assert.rejects(boundedFixture(operation), AgenticGraphStorageRetryableTransportError)
        else assert.equal(await boundedFixture(operation), null, 'An expired receipt cannot report durable success')
        assert.equal(pulls, 1, '75ms headers plus26ms body exceeds the same100ms phase allowance')
        assert.equal(cancels, 1)
        assert.equal(phaseSignal?.aborted, true)
        assert.equal(phaseResponse?.body?.locked, false)
      }
    } catch (error) { errors.push(error) }
    try {
      if (phaseResponse?.body && !phaseResponse.body.locked) await phaseResponse.body.cancel()
    } catch (error) { errors.push(error) }
    try {
      if (previousNow) Object.defineProperty(clockOwner, 'now', previousNow)
      else assert.equal(Reflect.deleteProperty(clockOwner, 'now'), true)
    } catch (error) { errors.push(error) }
    if (errors.length === 1) throw errors[0]
    if (errors.length) throw new AggregateError(errors, 'Upload phase deadline fixture failed')
  }
})

export const testUploadedMediaCatalogRetriesAfterHeaderTimeout = async (): Promise<void> => withBrowser(async origin => {
  const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { origin, role: 'owner' })
  const storage = await uploadMediaFileToAgenticGraphStorage({ file: mediaFile(), uploadNow: true, fetchImpl: fixture.fetch })
  assert.ok(storage)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const nativeSetTimeout = globalThis.setTimeout
  let fireDeadline: (() => void) | undefined, heldTimer: ReturnType<typeof setTimeout> | undefined
  let releaseHeaders: (() => void) | undefined, signal: AbortSignal | null | undefined, requests = 0, recovering = false
  const errors: unknown[] = []
  let polling = true, pendingPoll: Promise<void> | undefined
  const CandidateList = () => {
    const candidates = useUploadedMediaInlineCommandCandidates()
    return React.createElement('output', null, candidates.map(candidate => candidate.label).join(','))
  }
  globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (!fireDeadline && delay === 30_000 && typeof handler === 'function') {
      fireDeadline = () => { if (heldTimer !== undefined) clearTimeout(heldTimer); handler(...args) }
      heldTimer = nativeSetTimeout(fireDeadline, 1000)
      return heldTimer
    }
    return nativeSetTimeout(handler as never, delay, ...args)
  }) as typeof globalThis.setTimeout
  globalThis.fetch = (input, init) => {
    if (requestStage(input, init) !== 'assets:GET' || recovering) return fixture.fetch(input, init)
    requests++
    signal = init?.signal
    return new Promise<Response>((_resolve, reject) => { releaseHeaders = () => reject(new Error('Catalog fixture released headers')) })
  }
  try {
    await act(async () => { root.render(React.createElement(CandidateList, { key: 'first' })) })
    assert.equal(requests, 1)
    assert.ok(fireDeadline, 'The ordinary default catalog request owns a finite header deadline')
    await act(async () => { fireDeadline!(); await Promise.resolve() })
    assert.equal(signal?.aborted, true)
    assert.equal(host.textContent, '', 'An expired list cannot invent an uploaded item')
    recovering = true
    await act(async () => {
      root.render(React.createElement(CandidateList, { key: 'retry' }))
      await new Promise(resolve => nativeSetTimeout(resolve, 0))
    })
    // The real Worker performs asynchronous signature checks before the candidate appears.
    pendingPoll = (async () => {
      while (polling && !host.textContent?.includes('deadline.png')) {
        await act(async () => { await new Promise(resolve => nativeSetTimeout(resolve, 1)) })
      }
    })()
    await boundedFixture(pendingPoll)
    assert.equal(host.textContent, 'deadline.png', 'A later mounted catalog read can recover the durable item')
  } catch (error) { errors.push(error) }
  polling = false
  try { if (pendingPoll) await boundedFixture(pendingPoll) } catch (error) { errors.push(error) }
  try { releaseHeaders?.() } catch (error) { errors.push(error) }
  try { if (heldTimer !== undefined) clearTimeout(heldTimer) } catch (error) { errors.push(error) }
  try { await act(async () => { root.unmount() }) } catch (error) { errors.push(error) }
  try { globalThis.setTimeout = nativeSetTimeout } catch (error) { errors.push(error) }
  host.remove()
  if (errors.length === 1) throw errors[0]
  if (errors.length) throw new AggregateError(errors, 'Catalog retry fixture failed')
})
