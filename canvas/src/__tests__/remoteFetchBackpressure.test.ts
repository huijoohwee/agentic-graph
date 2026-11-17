import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRemoteFetchHandler } from '../../viteRemoteFetch'
import { WEBPAGE_HTML_SOURCE_MAX_BYTES } from '@/lib/websites/webpageHtmlPreviewBudget'

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

export async function testRemoteFetchUsesLargerBudgetForHtmlIframeProxy() {
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: '/__webpage_proxy?url=https://example.test/page',
    headers: { host: 'localhost', origin: 'http://localhost', accept: 'text/html,*/*;q=0.9' },
    socket: { remoteAddress: '127.0.0.1' },
  })
  const handler = createRemoteFetchHandler({ repoRoot: process.cwd(), injectWebpageProxyHtml: options => options.html })
  const originalFetch = globalThis.fetch

  const makeResponse = () => {
    const state = { statusCode: 200, body: '', headers: new Map<string, string>(), writableEnded: false, destroyed: false }
    const res = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      setHeader(key: string, value: string) {
        state.headers.set(String(key).toLowerCase(), String(value))
      },
      end(chunk?: unknown) {
        if (chunk !== undefined) state.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        state.writableEnded = true
        this.writableEnded = true
      },
      write(chunk: unknown) {
        state.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
        this.headersSent = true
        return true
      },
      once() { return this },
      removeListener() { return this },
      destroy() { state.destroyed = true; this.destroyed = true; return this },
    }
    return { res, state }
  }

  try {
    globalThis.fetch = (async (_url, _options) => ({
      status: 200,
      ok: true,
      headers: new Headers({
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(30 * 1024 * 1024),
      }),
      body: undefined,
      arrayBuffer: async () => new TextEncoder().encode('<!doctype html><html><body>ok</body></html>').buffer,
    })) as typeof fetch

    {
      const { res, state } = makeResponse()
      await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => {
        throw new Error('unexpected middleware fallthrough')
      })
      assert.equal(state.destroyed, false)
      assert.equal(state.writableEnded, true)
      assert.equal(res.statusCode, 200)
      assert.match(state.body, /<!doctype html>/i)
    }

    globalThis.fetch = (async (_url, _options) => ({
      status: 200,
      ok: true,
      headers: new Headers({
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(Math.min(WEBPAGE_HTML_SOURCE_MAX_BYTES, 30 * 1024 * 1024)),
      }),
      body: undefined,
      arrayBuffer: async () => new TextEncoder().encode('{"ok":true}').buffer,
    })) as typeof fetch

    {
      const { res, state } = makeResponse()
      await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, () => {
        throw new Error('unexpected middleware fallthrough')
      })
      assert.equal(res.statusCode, 413)
      assert.match(state.body, /Upstream response too large/)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
