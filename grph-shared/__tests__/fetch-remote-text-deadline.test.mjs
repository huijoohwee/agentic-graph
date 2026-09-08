import assert from 'node:assert/strict'
import test from 'node:test'
import { setTimeout as nativeSetTimeout, clearTimeout as nativeClearTimeout } from 'node:timers'
import { fetchRemoteTextDetailed } from '../dist/net/fetchRemoteText.js'

const url = 'https://remote-fixture.example/buyer-receipt.txt'
const timeoutMs = 40
const encoder = new TextEncoder()
const options = { timeoutMs, useProxy: 'never' }
const testOptions = { concurrency: false, timeout: 2500 }

function deferred() {
  let resolve
  const promise = new Promise(accept => { resolve = accept })
  return { promise, resolve }
}

async function bounded(promise, label) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = nativeSetTimeout(() => reject(new Error(`Fixture rescue: ${label} did not settle`)), 500)
    })])
  } finally { nativeClearTimeout(timer) }
}

async function withTransport(run) {
  const descriptors = new Map(['fetch', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const owned = [], releases = [], failures = [], unexpected = [], calls = []
  let handler = () => { throw new Error('Test fetch handler was not configured') }
  const control = {
    calls,
    own(promise) { void promise.catch(() => undefined); owned.push(promise); return promise },
    release(callback) { releases.push(callback) },
    handle(next) { handler = next },
    fetch(init = {}) { return control.own(fetchRemoteTextDetailed(url, { ...options, ...init })) },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { location: { origin: 'http://localhost:4173' } } })
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: async (input, init) => {
    const target = input instanceof Request ? input.url : String(input)
    calls.push({ target, init })
    if (target !== url) {
      unexpected.push(target)
      throw new Error(`Unexpected transport request: ${target}`)
    }
    return handler(init)
  } })
  try {
    await run(control)
    assert.deepEqual(unexpected, [], 'An authoritative source result must not trigger another transport')
  } catch (error) { failures.push(error) }
  finally {
    for (const release of releases.reverse()) {
      try { release() } catch (error) { failures.push(error) }
    }
    try {
      const settled = await bounded(Promise.allSettled(owned), 'owned producer/request cleanup')
      for (const result of settled) if (result.status === 'rejected') failures.push(result.reason)
    } catch (error) { failures.push(error) }
    for (const [key, descriptor] of descriptors) {
      try {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else assert.equal(Reflect.deleteProperty(globalThis, key), true)
      } catch (error) { failures.push(error) }
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length) throw new AggregateError(failures, failures.map(error => String(error?.message ?? error)).join('; '))
}

function responseStream(control, { chunks = [], hold = true, status = 200, headers } = {}) {
  const pulled = deferred(), canceled = deferred(), cancelFinished = deferred()
  let controller, index = 0, pullCount = 0, cancelCount = 0, closed = false, released = false
  control.own(cancelFinished.promise)
  const body = new ReadableStream({
    start(value) { controller = value },
    pull() {
      pullCount += 1
      pulled.resolve()
      if (index < chunks.length) controller.enqueue(chunks[index++])
      else if (!hold) { closed = true; controller.close() }
    },
    cancel() { cancelCount += 1; closed = true; canceled.resolve(); return cancelFinished.promise },
  }, { highWaterMark: 0 })
  control.release(() => {
    released = true
    cancelFinished.resolve(); canceled.resolve(); pulled.resolve()
    if (!closed) { closed = true; controller.close() }
  })
  return {
    body, response: new Response(body, { status, headers }), pulled: pulled.promise, canceled: canceled.promise,
    get pullCount() { return pullCount }, get cancelCount() { return cancelCount }, get released() { return released },
  }
}

function assertDisposed(stream) {
  assert.equal(stream.cancelCount, 1, 'Discarded response body must receive exactly one cancellation')
  assert.equal(stream.body.locked, false, 'Discarding a body must release its reader lock')
  assert.equal(stream.released, false, 'The API must settle without awaiting the producer cancellation promise')
}

test('remote text deadline aborts pending headers and disposes a late response', testOptions, async () => {
  await withTransport(async control => {
    const entered = deferred(), headers = deferred(), late = responseStream(control)
    control.own(headers.promise)
    control.release(() => headers.resolve(late.response))
    let signal
    control.handle(init => { signal = init?.signal; entered.resolve(); return headers.promise })
    const operation = control.fetch()
    await bounded(entered.promise, 'header request entry')
    const result = await bounded(operation, 'header deadline')
    assert.equal(result.ok, false)
    assert.equal(result.kind, 'timeout')
    assert.equal(result.url, url)
    assert.equal(signal?.aborted, true, 'The deadline must abort the actual fetch request')
    headers.resolve(late.response)
    await bounded(late.canceled, 'late response disposal')
    assertDisposed(late)
    assert.equal(control.calls.length, 1)
  })
})

test('remote text deadline releases a pending successful body despite ignored cancellation', testOptions, async () => {
  await withTransport(async control => {
    const pending = responseStream(control)
    let signal
    control.handle(init => { signal = init?.signal; return pending.response })
    const operation = control.fetch()
    await bounded(pending.pulled, 'successful response body read')
    const result = await bounded(operation, 'successful body deadline')
    assert.equal(result.ok, false)
    assert.equal(result.kind, 'timeout')
    assert.equal(signal?.aborted, true)
    assertDisposed(pending)
    assert.equal(control.calls.length, 1)
  })
})

test('a pending HTTP error body keeps its authoritative status without proxy replay', testOptions, async () => {
  await withTransport(async control => {
    const pending = responseStream(control, { status: 503 })
    control.handle(() => pending.response)
    const operation = control.fetch({ useProxy: 'auto' })
    await bounded(pending.pulled, 'HTTP diagnostic body read')
    const result = await bounded(operation, 'HTTP diagnostic body deadline')
    assert.equal(result.ok, false)
    assert.equal(result.kind, 'http')
    assert.equal(result.status, 503)
    assert.equal(result.usedProxy, false)
    assert.equal(result.errorText, undefined)
    assertDisposed(pending)
    assert.equal(control.calls.length, 1)
  })
})

test('an oversized content-length disposes unread bytes without retrying the source', testOptions, async () => {
  await withTransport(async control => {
    const oversized = responseStream(control, { headers: { 'content-length': '9' } })
    control.handle(() => oversized.response)
    const result = await bounded(control.fetch({ useProxy: 'auto', maxBytes: 8 }), 'declared size rejection')
    assert.equal(result.ok, false)
    assert.equal(result.kind, 'too_large')
    assert.equal(result.status, 200)
    assert.equal(result.contentLength, 9)
    assert.equal(oversized.pullCount, 0, 'Declared oversize must not consume the body')
    assertDisposed(oversized)
    assert.equal(control.calls.length, 1)
  })
})

test('streaming byte overflow cancels the producer and unlocks its reader', testOptions, async () => {
  await withTransport(async control => {
    const oversized = responseStream(control, { chunks: [encoder.encode('abc'), encoder.encode('DEF')] })
    control.handle(() => oversized.response)
    const result = await bounded(control.fetch({ useProxy: 'auto', maxBytes: 4 }), 'streaming size rejection')
    assert.equal(result.ok, false)
    assert.equal(result.kind, 'too_large')
    assert.equal(result.status, 200)
    assertDisposed(oversized)
    assert.equal(control.calls.length, 1)
  })
})

test('HEAD and preflight responses dispose unused bodies before returning or fetching text', testOptions, async () => {
  await withTransport(async control => {
    for (const scenario of ['head', 'preflight', 'preflight-oversize']) {
      const before = control.calls.length
      const head = responseStream(control, { headers: { 'content-length': scenario === 'preflight-oversize' ? '99' : '4' } })
      control.handle(init => {
        if (init?.method === 'HEAD') return head.response
        assert.equal(scenario, 'preflight', 'Only an admitted preflight may continue to GET')
        assertDisposed(head)
        return new Response('text')
      })
      const result = await bounded(control.fetch(scenario === 'head'
        ? { method: 'HEAD', maxBytes: 4 }
        : { preflightHead: true, maxBytes: 4 }), `${scenario} completion`)
      assert.equal(result.ok, scenario !== 'preflight-oversize')
      if (result.ok) assert.equal(result.text, scenario === 'head' ? '' : 'text')
      else assert.equal(result.kind, 'too_large')
      assert.equal(head.pullCount, 0)
      assertDisposed(head)
      assert.equal(control.calls.length - before, scenario === 'preflight' ? 2 : 1)
    }
  })
})

test('remote text preserves whitespace and split UTF-8 code points at the exact byte budget', testOptions, async () => {
  await withTransport(async control => {
    const text = '\n \tBuyer 🧾\r\n €e\u0301\u0000  \n'
    const bytes = encoder.encode(text)
    const stream = responseStream(control, { hold: false, chunks: Array.from(bytes, byte => Uint8Array.of(byte)),
      headers: { 'content-length': String(bytes.byteLength), 'content-type': 'text/plain; charset=utf-8' } })
    const progress = []
    control.handle(() => stream.response)
    const result = await bounded(control.fetch({ maxBytes: bytes.byteLength, onProgress: value => progress.push(value) }), 'UTF-8 response')
    assert.equal(result.ok, true)
    assert.equal(result.text, text)
    assert.equal(result.contentLength, bytes.byteLength)
    assert.equal(result.contentType, 'text/plain; charset=utf-8')
    assert.equal(progress.at(-1)?.loadedBytes, bytes.byteLength)
    assert.ok(progress.every((value, index) => value.totalBytes === bytes.byteLength
      && value.loadedBytes > (progress[index - 1]?.loadedBytes ?? 0) && value.loadedBytes <= bytes.byteLength))
    assert.equal(stream.body.locked, false)
    assert.equal(stream.cancelCount, 0, 'A fully consumed body needs no cancellation')
    assert.equal(control.calls.length, 1)
  })
})

test('Response.text compatibility fallback enforces encoded bytes rather than string length', testOptions, async () => {
  await withTransport(async control => {
    const text = 'éé'
    control.handle(() => {
      const response = new Response(text)
      // Model fetch implementations exposing text() but no public streaming body.
      Object.defineProperty(response, 'body', { configurable: true, value: null })
      return response
    })
    const rejected = await bounded(control.fetch({ useProxy: 'auto', maxBytes: 3 }), 'body-less byte rejection')
    assert.equal(rejected.ok, false)
    assert.equal(rejected.kind, 'too_large')
    assert.equal(control.calls.length, 1, 'A byte-limit result is authoritative, not a transport retry')
    const accepted = await bounded(control.fetch({ maxBytes: 4 }), 'body-less exact byte budget')
    assert.equal(accepted.ok, true)
    assert.equal(accepted.text, text)
    assert.equal(control.calls.length, 2)
  })
})


test('pathological numeric options retain a deadline and a finite encoded-byte budget', testOptions, async () => {
  const failures = []
  const timerDescriptors = new Map(['setTimeout', 'clearTimeout'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const pendingTimers = new Set()
  let scheduled = []
  Object.defineProperty(globalThis, 'setTimeout', { configurable: true, writable: true, value: (callback, delay, ...args) => {
    const timer = nativeSetTimeout(callback, delay, ...args)
    pendingTimers.add(timer)
    scheduled.push({ timer, delay, fire: () => callback(...args) })
    return timer
  } })
  Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, writable: true, value: timer => {
    pendingTimers.delete(timer)
    nativeClearTimeout(timer)
  } })
  try {
    for (const timeout of [undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      scheduled = []
      try {
        await withTransport(async control => {
          const entered = deferred(), headers = deferred(), late = responseStream(control)
          control.own(headers.promise)
          control.release(() => headers.resolve(late.response))
          let signal
          control.handle(init => { signal = init?.signal; entered.resolve(); return headers.promise })
          const operation = control.fetch({ timeoutMs: timeout })
          await bounded(entered.promise, 'numeric deadline request entry')
          assert.equal(scheduled.length, 1, `timeoutMs=${String(timeout)} must retain one real request deadline`)
          assert.equal(scheduled[0].delay, 12_000, 'Invalid timeout inputs retain the existing default budget')
          pendingTimers.delete(scheduled[0].timer)
          nativeClearTimeout(scheduled[0].timer)
          scheduled[0].fire()
          const result = await bounded(operation, 'manually expired request deadline')
          assert.equal(result.ok, false)
          assert.equal(result.kind, 'timeout')
          assert.equal(signal?.aborted, true)
          headers.resolve(late.response)
          await bounded(late.canceled, 'late numeric-deadline response disposal')
          assertDisposed(late)
        })
      } catch (error) { failures.push(new Error(`timeoutMs=${String(timeout)}: ${String(error?.message ?? error)}`, { cause: error })) }
      finally {
        for (const timer of pendingTimers) nativeClearTimeout(timer)
        pendingTimers.clear()
      }
    }
  } finally {
    for (const timer of pendingTimers) nativeClearTimeout(timer)
    for (const [key, descriptor] of timerDescriptors) {
      try {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else assert.equal(Reflect.deleteProperty(globalThis, key), true)
      } catch (error) { failures.push(error) }
    }
  }
  try {
    await withTransport(async control => {
      control.handle(() => new Response(''))
      const empty = await bounded(control.fetch({ maxBytes: 0 }), 'empty zero-byte budget')
      assert.equal(empty.ok, true)
      assert.equal(empty.text, '')
      control.handle(() => new Response('x'))
      const nonempty = await bounded(control.fetch({ maxBytes: 0 }), 'nonempty zero-byte budget')
      assert.equal(nonempty.ok, false)
      assert.equal(nonempty.kind, 'too_large', 'An explicit zero cap must not become the default cap')
    })
  } catch (error) { failures.push(error) }
  for (const maxBytes of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    try {
      await withTransport(async control => {
        control.handle(() => new Response('small valid text'))
        const small = await bounded(control.fetch({ maxBytes, timeoutMs: 1000 }), 'invalid byte-cap small control')
        assert.equal(small.ok, true, 'Invalid budgets retain a useful positive default')
        assert.equal(small.text, 'small valid text')
        const block = new Uint8Array(400_000).fill(97)
        const oversized = responseStream(control, { chunks: [block, block, block, block, block, Uint8Array.of(98)] })
        control.handle(() => oversized.response)
        const large = await bounded(control.fetch({ maxBytes, timeoutMs: 1000 }), 'invalid byte-cap overflow')
        assert.equal(large.ok, false)
        assert.equal(large.kind, 'too_large', 'Invalid caps must reject more than the existing 2,000,000-byte default')
        assertDisposed(oversized)
      })
    } catch (error) { failures.push(new Error(`maxBytes=${String(maxBytes)}: ${String(error?.message ?? error)}`, { cause: error })) }
  }
  if (failures.length) throw new AggregateError(failures, failures.map(error => String(error?.message ?? error)).join('; '))
})


async function withMonotonicRequestClock(run) {
  const performanceOwner = globalThis.performance
  const descriptor = Object.getOwnPropertyDescriptor(performanceOwner, 'now')
  let elapsed = 0
  Object.defineProperty(performanceOwner, 'now', { configurable: true, writable: true, value: () => elapsed })
  try { await run({ advance: milliseconds => { elapsed += milliseconds }, now: () => elapsed }) }
  finally {
    if (descriptor) Object.defineProperty(performanceOwner, 'now', descriptor)
    else assert.equal(Reflect.deleteProperty(performanceOwner, 'now'), true)
  }
}

test('header latency consumes the original deadline available to the response body', testOptions, async () => {
  await withMonotonicRequestClock(clock => withTransport(async control => {
    const response = responseStream(control, { hold: false, chunks: [encoder.encode('first'), encoder.encode('second')] })
    let signal
    control.handle(init => {
      signal = init?.signal
      clock.advance(900)
      return response.response
    })
    const progress = []
    const result = await bounded(control.fetch({ timeoutMs: 1000, onProgress: value => {
      progress.push(value.loadedBytes)
      clock.advance(200)
    } }), 'shared header/body budget')
    assert.ok(progress.length > 0, 'The body begins before the original deadline expires')
    assert.ok(clock.now() >= 1000)
    assert.equal(result.ok, false, 'Headers must not grant the body a fresh timeout budget')
    assert.equal(result.kind, 'timeout')
    assert.equal(signal?.aborted, true)
    assertDisposed(response)
    assert.equal(control.calls.length, 1)
  }))
})

test('always-ready body chunks cannot extend the deadline while timer delivery is pending', testOptions, async () => {
  await withMonotonicRequestClock(clock => withTransport(async control => {
    const chunks = Array.from({ length: 16 }, () => Uint8Array.of(97))
    const response = responseStream(control, { hold: false, chunks })
    let signal
    control.handle(init => { signal = init?.signal; return response.response })
    const progress = []
    const result = await bounded(control.fetch({ timeoutMs: 25, onProgress: value => {
      progress.push(value.loadedBytes)
      clock.advance(10)
    } }), 'always-ready stream deadline')
    assert.ok(clock.now() >= 25)
    assert.equal(result.ok, false, 'Ready read promises must still enforce elapsed request time')
    assert.equal(result.kind, 'timeout')
    assert.ok(progress.length > 0 && progress.length < chunks.length, 'Stop the producer before consuming the complete expired stream')
    assert.equal(signal?.aborted, true)
    assertDisposed(response)
    assert.equal(control.calls.length, 1)
  }))
})
