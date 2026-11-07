import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { downloadPinnedXrDepthBytes } from '../prepare-xr-v2-depth-assets.mjs'

const bytes = Uint8Array.from([1, 2, 3, 4])
const file = { path: 'test-depth.onnx', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
const goodResponse = () => new Response(bytes, { status: 200 })

function interruptedBody(error) {
  let pulls = 0
  return new Response(new ReadableStream({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(bytes.slice(0, 2))
      else controller.error(error)
    },
  }, { highWaterMark: 0 }), { status: 200 })
}

function dependencies(responses) {
  const calls = [], waits = [], reports = []
  return { calls, waits, reports, options: {
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return responses(calls.length)
    },
    wait: async delay => { waits.push(delay) },
    report: message => { reports.push(message) },
  } }
}

test('retries a timed-out response body with a fresh bounded request and no partial-byte carryover', async () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  const fixture = dependencies(attempt => attempt === 1 ? interruptedBody(timeout) : goodResponse())
  assert.deepEqual(await downloadPinnedXrDepthBytes(file, fixture.options), bytes)
  assert.equal(fixture.calls.length, 2)
  assert.deepEqual(fixture.waits, [1000])
  assert.match(fixture.reports[0], /test-depth\.onnx response body failed on attempt 1\/4: TimeoutError/)
  for (const { url, init } of fixture.calls) {
    assert.match(url, /4472b7362082ad9968fee890ca0f1e5aca36b93d\/test-depth\.onnx$/)
    assert.equal(init.redirect, 'follow')
    assert.ok(init.signal instanceof AbortSignal && !init.signal.aborted)
  }
  assert.notEqual(fixture.calls[0].init.signal, fixture.calls[1].init.signal)
})

test('exhausts four streamed transport attempts and preserves the resource and original cause', async () => {
  const interruption = new TypeError('terminated', { cause: Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' }) })
  const fixture = dependencies(() => interruptedBody(interruption))
  await assert.rejects(downloadPinnedXrDepthBytes(file, fixture.options), error => {
    assert.match(error.message, /test-depth\.onnx response body failed on attempt 4\/4/)
    assert.equal(error.cause, interruption)
    return true
  })
  assert.equal(fixture.calls.length, 4)
  assert.deepEqual(fixture.waits, [1000, 2000, 4000])
  assert.equal(fixture.reports.length, 3)
})

test('does not retry a complete response with a mismatched integrity digest', async () => {
  const fixture = dependencies(() => new Response(Uint8Array.from([4, 3, 2, 1])))
  await assert.rejects(downloadPinnedXrDepthBytes(file, fixture.options), /integrity mismatch for test-depth\.onnx/)
  assert.equal(fixture.calls.length, 1)
  assert.deepEqual(fixture.waits, [])
})

test('declared size mismatch rejects before reading and releases the body', async () => {
  let reads = 0, cancelled = false
  const fixture = dependencies(() => new Response(new ReadableStream({
    pull() { reads++ }, cancel() { cancelled = true },
  }, { highWaterMark: 0 }), { headers: { 'content-length': String(file.bytes + 1) } }))
  await assert.rejects(downloadPinnedXrDepthBytes(file, fixture.options), /size mismatch for test-depth\.onnx/)
  assert.equal(reads, 0); assert.equal(cancelled, true)
  assert.equal(fixture.calls.length, 1); assert.deepEqual(fixture.waits, [])
})

test('oversized streamed bodies and non-transport reader errors remain fail-fast', async () => {
  for (const [response, reason] of [
    [() => new Response(Uint8Array.from([1, 2, 3, 4, 5])), /exceeds the bounded download size/],
    [() => interruptedBody(new Error('unexpected stream contract')), /unexpected stream contract/],
  ]) {
    const fixture = dependencies(response)
    await assert.rejects(downloadPinnedXrDepthBytes(file, fixture.options), reason)
    assert.equal(fixture.calls.length, 1); assert.deepEqual(fixture.waits, [])
  }
})

test('retains HTTP status classification and Retry-After behavior', async () => {
  const fatal = dependencies(() => new Response(null, { status: 404 }))
  await assert.rejects(downloadPinnedXrDepthBytes(file, fatal.options), /test-depth\.onnx \(404\)/)
  assert.equal(fatal.calls.length, 1); assert.deepEqual(fatal.waits, [])
  const transient = dependencies(attempt => attempt === 1
    ? new Response(null, { status: 503, headers: { 'retry-after': '2' } }) : goodResponse())
  assert.deepEqual(await downloadPinnedXrDepthBytes(file, transient.options), bytes)
  assert.equal(transient.calls.length, 2); assert.deepEqual(transient.waits, [2000])
})

test('retries a transient request failure without relaxing body integrity', async () => {
  const fixture = dependencies(attempt => {
    if (attempt === 1) throw new TypeError('fetch failed')
    return goodResponse()
  })
  assert.deepEqual(await downloadPinnedXrDepthBytes(file, fixture.options), bytes)
  assert.equal(fixture.calls.length, 2); assert.deepEqual(fixture.waits, [1000])
  assert.match(fixture.reports[0], /test-depth\.onnx request failed on attempt 1\/4/)
})
