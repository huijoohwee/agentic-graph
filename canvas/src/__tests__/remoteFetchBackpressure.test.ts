import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRemoteFetchHandler } from '../../viteRemoteFetch'

class ResponseProbe extends EventEmitter {
  statusCode = 200
  headersSent = false
  writableEnded = false
  destroyed = false
  chunks: Buffer[] = []
  setHeader() { if (this.headersSent) throw new Error('headers already sent') }
  write(chunk: Buffer) {
    this.headersSent = true
    this.chunks.push(chunk)
    this.emit('wrote')
    return false
  }
  end() { this.writableEnded = true }
  destroy() { this.destroyed = true; this.emit('close'); return this }
}

async function runBackpressureScenario(action: 'request-close' | 'abort' | 'disconnect') {
  const req = Object.assign(new EventEmitter(), {
    method: 'GET', url: '/__fetch_remote?url=https://example.test/media', headers: { host: 'localhost' },
  })
  const res = new ResponseProbe()
  const originalFetch = globalThis.fetch
  let signal: AbortSignal | undefined
  let reads = 0
  globalThis.fetch = (async (_url, options) => {
    signal = options?.signal as AbortSignal
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
      body: { getReader: () => ({
        read: async () => ++reads === 1
          ? { done: false, value: Buffer.from('complete-body') }
          : { done: true, value: undefined },
        cancel: async () => undefined,
      }) },
    } as unknown as Response
  }) as typeof fetch
  let settled = false
  let failure: unknown
  const wrote = new Promise<void>(resolve => res.once('wrote', resolve))
  const handler = createRemoteFetchHandler({ repoRoot: process.cwd(), injectWebpageProxyHtml: options => options.html })
  const task = Promise.resolve(handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => {
    throw new Error('unexpected middleware fallthrough')
  })).then(() => { settled = true }, error => { failure = error; settled = true })
  try {
    await wrote
    if (action === 'request-close') {
      req.emit('close')
      assert.equal(signal?.aborted, false, 'normal request completion must not abort the response')
      res.emit('drain')
      await task
      assert.equal(res.writableEnded, true)
      assert.equal(res.destroyed, false)
      assert.equal(Buffer.concat(res.chunks).toString(), 'complete-body')
    } else {
      if (action === 'abort') req.emit('aborted')
      else res.destroy()
      await new Promise<void>(resolve => setImmediate(resolve))
      assert.equal(settled, true, 'cancelled backpressure must settle without a drain event')
      assert.equal(res.destroyed, true, 'a partial response must terminate without rewriting sent headers')
      assert.equal(signal?.aborted, true, 'cancel the upstream operation on disconnect')
    }
    assert.equal(failure, undefined)
    assert.equal(res.listenerCount('drain'), 0)
    assert.equal(res.listenerCount('close'), 0)
  } finally {
    // Release the old implementation after observing the failure, avoiding a hung red test.
    res.emit('drain')
    await task
    globalThis.fetch = originalFetch
  }
}

export const testRemoteFetchNormalRequestClosePreservesBody = () => runBackpressureScenario('request-close')
export const testRemoteFetchAbortReleasesBackpressure = () => runBackpressureScenario('abort')
export const testRemoteFetchDisconnectReleasesBackpressure = () => runBackpressureScenario('disconnect')
