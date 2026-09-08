import assert from 'node:assert/strict'
import {
  AgenticGraphStorageRetryableTransportError,
  fetchWithTimeout,
  readResponseTextWithDeadline,
} from '@/lib/storage/agentic-graph-storage-client-transport'
import {
  fetchWorkspaceDocsMirrorResponse,
  readWorkspaceDocsMirrorTextViaFetch as readText,
  resetWorkspaceSeedProviderStorageCacheForTests as resetCache,
} from '@/features/workspace-fs/workspaceSeedProviderStorageCache'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

type Timer = ReturnType<typeof globalThis.setTimeout>
type Scope = {
  own<T>(promise: Promise<T>): Promise<T>
  release(callback: () => void): void
  setFetch(fetchImpl: typeof fetch): void
  pause(ms: number): Promise<void>
  fireHeaderDeadline(): void
  delays: number[]
}

const withOwnedRequests = async (run: (scope: Scope) => Promise<void>): Promise<void> => {
  const descriptors = new Map<string, PropertyDescriptor | undefined>(['fetch', 'setTimeout', 'clearTimeout'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const))
  const schedule = globalThis.setTimeout.bind(globalThis)
  const clear = globalThis.clearTimeout.bind(globalThis)
  const owned: Promise<unknown>[] = [], releases: Array<() => void> = [], errors: unknown[] = []
  const headers = new Map<Timer, () => void>(), delays: number[] = []
  const fixtureTimers = new Set<Timer>()
  const own = <T>(promise: Promise<T>): Promise<T> => {
    void promise.catch(() => undefined)
    owned.push(promise)
    return promise
  }
  const bounded = async <T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> => {
    let timer: Timer | undefined
    try {
      return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
        timer = schedule(() => reject(new Error(`Mirror fixture ${label} exceeded ${timeoutMs}ms`)), timeoutMs)
      })])
    } finally { if (timer !== undefined) clear(timer) }
  }
  const timerWrapper = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]): Timer => {
    delays.push(Number(delay))
    const timer = schedule(callback, delay, ...args)
    if (delay === 8000) headers.set(timer, () => callback(...args))
    return timer
  }) as typeof globalThis.setTimeout
  const clearWrapper = ((timer: Timer | undefined): void => {
    if (timer !== undefined) headers.delete(timer)
    clear(timer)
  }) as typeof globalThis.clearTimeout
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, writable: true, value: timerWrapper })
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, writable: true, value: clearWrapper })
  resetCache()
  const operation = own(Promise.resolve().then(() => run({
    own, release: callback => releases.push(callback), delays,
    setFetch(fetchImpl) {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchImpl })
    },
    pause(ms) {
      return own(new Promise<void>(resolve => {
        const timer = schedule(() => { fixtureTimers.delete(timer); resolve() }, ms)
        fixtureTimers.add(timer)
      }))
    },
    fireHeaderDeadline() {
      assert.equal(headers.size, 1, 'Exactly one owned 8000ms mirror header timer must be pending')
      const [timer, callback] = headers.entries().next().value!
      headers.delete(timer)
      clear(timer)
      callback()
    },
  })))
  try { await bounded(operation, 'body', 2000) } catch (error) { errors.push(error) }
  for (const release of releases.reverse()) {
    try { release() } catch (error) { errors.push(error) }
  }
  try { await bounded(operation.then(() => undefined, () => undefined), 'body drain', 500) }
  catch (error) { errors.push(error) }
  const draining = owned.length
  try { await bounded(Promise.allSettled(owned), 'owned request drain', 500) }
  catch (error) { errors.push(error) }
  if (owned.length !== draining) errors.push(new Error('Mirror fixture created new work during final drain'))
  if (headers.size) errors.push(new Error('Mirror request left native header timers after owned work drained'))
  for (const timer of headers.keys()) clear(timer)
  for (const timer of fixtureTimers) clear(timer)
  resetCache()
  for (const [key, descriptor] of descriptors) {
    try {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else assert.equal(Reflect.deleteProperty(globalThis, key), true, `Restore ${key}`)
    } catch (error) { errors.push(error) }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, errors.map(error => String(error)).join('; '))
}

const heldBody = (scope: Scope, status = 200) => {
  const pulled = deferred<void>(), canceled = deferred<void>(), cancelFinished = deferred<void>()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cancellations = 0, released = false
  const cancellation = scope.own(cancelFinished.promise)
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    pull() { pulled.resolve() },
    cancel() { cancellations += 1; canceled.resolve(); return cancellation },
  }, { highWaterMark: 0 })
  scope.release(() => {
    released = true
    cancelFinished.resolve()
    canceled.resolve()
    pulled.resolve()
    if (!cancellations) controller.close()
  })
  return {
    response: new Response(body, { status }), body, pulled: pulled.promise, canceled: canceled.promise,
    get cancellations() { return cancellations }, get released() { return released },
  }
}

export async function testWorkspaceMirrorRequestCancelsUncooperativeLateHeaders() {
  await withOwnedRequests(async scope => {
    const fixture = heldBody(scope), headers = deferred<Response>(), entered = deferred<void>()
    let signal: AbortSignal | null | undefined
    scope.release(() => headers.resolve(fixture.response))
    const rawFetch = scope.own(headers.promise)
    const pending = scope.own(fetchWorkspaceDocsMirrorResponse('/__agentic_os_fs_list', {}, async (_input, init) => {
      signal = init?.signal
      entered.resolve()
      return rawFetch
    }))
    const rejected = scope.own(assert.rejects(pending, AgenticGraphStorageRetryableTransportError))
    await entered.promise
    scope.fireHeaderDeadline()
    await rejected
    assert.equal(signal?.aborted, true, 'Expiry must abort the original fetch even when it ignores abort')
    assert.equal(fixture.cancellations, 0, 'No response body exists at the header deadline')
    headers.resolve(fixture.response)
    await rawFetch
    await fixture.canceled
    assert.equal(fixture.cancellations, 1, 'The late response must be canceled, not cached or consumed')
    assert.equal(fixture.released, false, 'Request completion must not depend on producer cancellation settling')
    assert.equal(fixture.body.locked, false)
  })
}

export async function testWorkspaceMirrorRequestSharesHeaderAndBodyDeadline() {
  await withOwnedRequests(async scope => {
    const fixture = heldBody(scope)
    let signal: AbortSignal | null | undefined
    const response = await scope.own(fetchWithTimeout({
      input: '/__agentic_os_fs_list', init: { method: 'POST' }, timeoutMs: 200,
      fetchImpl: async (_input, init) => {
        signal = init?.signal
        await scope.pause(40)
        return fixture.response
      },
    }))
    const timerIndex = scope.delays.length
    const pending = scope.own(readResponseTextWithDeadline(response, { timeoutMs: 1000, maxBytes: null }))
    const rejected = scope.own(assert.rejects(pending, AgenticGraphStorageRetryableTransportError))
    assert.ok(scope.delays[timerIndex]! > 0 && scope.delays[timerIndex]! < 190,
      'The body receives the original remaining budget, even if its option requests more time')
    await fixture.pulled
    await rejected
    assert.equal(fixture.cancellations, 1, 'A held body must settle at the deadline despite a held cancel promise')
    assert.equal(signal?.aborted, true, 'Body expiry must abort its inherited fetch owner')
    assert.equal(fixture.released, false)
    assert.equal(fixture.body.locked, false, 'The deadline owner releases its reader before producer cleanup')
  })
}

export async function testWorkspaceMirrorRequestCoalescesAndRetriesAfterReset() {
  await withOwnedRequests(async scope => {
    const url = 'https://mirror.example/api/storage/doc/w/shared.md'
    const fixture = heldBody(scope), headers = deferred<Response>(), entered = deferred<void>()
    const joined: Array<Promise<string | null>> = []
    let originalCalls = 0, replacementCalls = 0
    scope.release(() => headers.resolve(fixture.response))
    scope.setFetch(async input => {
      assert.equal(input, url)
      originalCalls += 1
      joined.push(scope.own(readText(url)))
      entered.resolve()
      return scope.own(headers.promise)
    })
    joined.push(scope.own(readText(`  ${url}  `)))
    scope.setFetch(async input => {
      assert.equal(input, url)
      replacementCalls += 1
      return new Response(' \n recovered 🧭 text \n ')
    })
    joined.push(scope.own(readText(url)))
    assert.equal(originalCalls, 0, 'Text pending ownership is installed before invoking its captured fetch')
    await entered.promise
    assert.equal(originalCalls, 1, 'Reentrant and concurrent reads share the captured original fetch')
    assert.equal(replacementCalls, 0, 'A later global fetch owner must not replace deferred request ownership')
    scope.fireHeaderDeadline()
    assert.deepEqual(await Promise.all(joined), [null, null, null])
    headers.resolve(fixture.response)
    await headers.promise
    await fixture.canceled
    assert.equal(fixture.cancellations, 1)
    assert.equal(await scope.own(readText(url)), null, 'The existing negative-cache policy remains intact')
    assert.equal(replacementCalls, 0)
    resetCache()
    assert.equal(await scope.own(readText(url)), ' \n recovered 🧭 text \n ', 'An explicit cache reset permits retry and retains exact response text')
    assert.equal(replacementCalls, 1)
  })
}

export async function testWorkspaceMirrorRequestResetRetiresOnlyExactPromise() {
  await withOwnedRequests(async scope => {
    const url = 'https://mirror.example/api/storage/doc/w/owner.md'
    const oldHeaders = deferred<Response>(), newHeaders = deferred<Response>()
    const oldEntered = deferred<void>(), newEntered = deferred<void>()
    let oldCalls = 0, newCalls = 0, foreignCalls = 0
    scope.release(() => oldHeaders.resolve(new Response('old')))
    scope.release(() => newHeaders.resolve(new Response('new')))
    scope.setFetch(async () => { oldCalls += 1; oldEntered.resolve(); return scope.own(oldHeaders.promise) })
    const oldRead = scope.own(readText(url))
    await oldEntered.promise
    resetCache()
    scope.setFetch(async () => { newCalls += 1; newEntered.resolve(); return scope.own(newHeaders.promise) })
    const newRead = scope.own(readText(url))
    await newEntered.promise
    oldHeaders.resolve(new Response('old'))
    assert.equal(await oldRead, 'old', 'The original caller can still receive its own completed result')
    scope.setFetch(async () => { foreignCalls += 1; throw new Error('An old finally retired the newer pending owner') })
    const joined = scope.own(readText(url))
    newHeaders.resolve(new Response('new'))
    assert.deepEqual(await Promise.all([newRead, joined]), ['new', 'new'], 'Old completion cannot publish into or remove the new owner')
    assert.equal(await scope.own(readText(url)), 'new', 'Only the new exact owner may populate the settled cache')
    assert.deepEqual([oldCalls, newCalls, foreignCalls], [1, 1, 0])
  })
}

export async function testWorkspaceMirrorRequestDisposesNonOkAndKeepsEmptyText() {
  await withOwnedRequests(async scope => {
    for (const status of [404, 503]) {
      const fixture = heldBody(scope, status)
      scope.setFetch(async input => {
        assert.equal(input, `https://mirror.example/status/${status}`)
        return fixture.response
      })
      assert.equal(await scope.own(readText(`https://mirror.example/status/${status}`)), null)
      assert.equal(fixture.cancellations, 1, 'Non-OK mirror responses dispose their unread body')
      assert.equal(fixture.released, false, 'Disposal must not wait for the producer cancel promise')
      assert.equal(fixture.body.locked, false)
    }
    for (const text of ['', ' \n\t ', '  authored 🧭 value \n']) {
      scope.setFetch(async () => new Response(text))
      assert.equal(await scope.own(readText('https://mirror.example/text')), text)
    }
    const invalid = await scope.own(readResponseTextWithDeadline(new Response('{broken'), { maxBytes: null, timeoutMs: 50 }))
    assert.throws(() => JSON.parse(invalid), SyntaxError, 'The generic body reader must not turn invalid JSON into a valid dataset')
  })
}

export async function testWorkspaceMirrorRequestKeepsLargeJsonAndReplacementUtf8() {
  await withOwnedRequests(async scope => {
    const authored = ' \n' + 'x'.repeat(299996) + '\n '
    const encoder = new TextEncoder()
    let part = 0, deliveredBytes = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (part > 31) { controller.close(); return }
        const text = part === 0 ? '{"ok":true,"files":[' : part === 31 ? ']}'
          : `${part === 1 ? '' : ','}${JSON.stringify({ relPath: `docs/${part}.md`, text: authored, updatedAtMs: 123 })}`
        const bytes = encoder.encode(text)
        assert.ok(bytes.byteLength < 500000, 'The fixture emits bounded chunks and legal per-file payloads')
        deliveredBytes += bytes.byteLength
        part += 1
        controller.enqueue(bytes)
      },
    }, { highWaterMark: 0 })
    const response = await scope.own(fetchWorkspaceDocsMirrorResponse('/__agentic_os_fs_list', {}, async () => new Response(body)))
    const text = await scope.own(readResponseTextWithDeadline(response, { maxBytes: null }))
    const dataset = JSON.parse(text) as { ok: boolean; files: Array<{ relPath: string; text: string; updatedAtMs: number }> }
    assert.ok(deliveredBytes > 8 * 1024 * 1024, 'This legal 30-file mirror dataset exceeds the storage sync 8MiB policy')
    assert.equal(dataset.ok, true)
    assert.equal(dataset.files.length, 30)
    dataset.files.forEach((file, index) => assert.deepEqual(file,
      { relPath: `docs/${index + 1}.md`, text: authored, updatedAtMs: 123 }, 'Every full file and authored whitespace survives'))
    const chunks = [encoder.encode(' \n{"text":"'), new Uint8Array([0xf0, 0x9f]),
      new Uint8Array([0xa7, 0xad, 0xc3]), new Uint8Array([0x28]), encoder.encode('","zero":"\\u0000"} \n')]
    let index = 0
    const replacementBody = new ReadableStream<Uint8Array>({
      pull(controller) { if (index < chunks.length) controller.enqueue(chunks[index++]!); else controller.close() },
    }, { highWaterMark: 0 })
    const decoded = await scope.own(readResponseTextWithDeadline(new Response(replacementBody), { maxBytes: null, timeoutMs: 100 }))
    assert.equal(decoded, ' \n{"text":"🧭�(","zero":"\\u0000"} \n', 'Default decoding matches native replacement behavior across split UTF-8')
    assert.deepEqual(JSON.parse(decoded), { text: '🧭�(', zero: '\u0000' })
  })
}

export async function testWorkspaceMirrorRequestPreservesPayloadAndExplicitFetch() {
  await withOwnedRequests(async scope => {
    const input = '/__agentic_os_fs_list'
    const requestHeaders = new Headers({ 'content-type': 'application/json', 'x-fixture-owner': 'explicit' })
    const body = JSON.stringify({ path: '/workspace/docs mirror', maxFiles: 500 })
    const originalSignal = new AbortController().signal
    const init: RequestInit = { method: 'POST', headers: requestHeaders, body, credentials: 'omit',
      cache: 'no-store', redirect: 'error', signal: originalSignal }
    let explicitCalls = 0, ambientCalls = 0
    scope.setFetch(async () => { ambientCalls += 1; throw new Error('Explicit request must not use ambient fetch') })
    const response = await scope.own(fetchWorkspaceDocsMirrorResponse(input, init, async (observedInput, observedInit) => {
      explicitCalls += 1
      assert.equal(observedInput, input, 'The native proxy URL remains relative and unchanged')
      assert.equal(observedInit?.body, body, 'The exact original request body reaches the selected fetch')
      assert.equal(observedInit?.headers, requestHeaders)
      assert.deepEqual({ ...observedInit, signal: originalSignal }, init, 'Only the deadline-owned signal is substituted')
      assert.notEqual(observedInit?.signal, originalSignal)
      assert.equal(observedInit?.signal?.aborted, false)
      return new Response('{"ok":true,"files":[]}')
    }))
    assert.deepEqual(JSON.parse(await scope.own(readResponseTextWithDeadline(response, { maxBytes: null }))), { ok: true, files: [] })
    assert.deepEqual([explicitCalls, ambientCalls], [1, 0])
    assert.equal(init.signal, originalSignal, 'The caller-owned options and signal must remain unchanged')
    assert.equal(originalSignal.aborted, false)
  })
}
