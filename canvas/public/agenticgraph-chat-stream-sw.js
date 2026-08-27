;(function installKnowgrphDurableChatStreamWorker() {
  const START = 'KG_CHAT_STREAM_START'
  const ATTACH = 'KG_CHAT_STREAM_ATTACH'
  const ABORT = 'KG_CHAT_STREAM_ABORT'
  const FORGET = 'KG_CHAT_STREAM_FORGET'
  const RESPONSE = 'KG_CHAT_STREAM_RESPONSE'
  const CHUNK = 'KG_CHAT_STREAM_CHUNK'
  const DONE = 'KG_CHAT_STREAM_DONE'
  const ERROR = 'KG_CHAT_STREAM_ERROR'
  const RUNTIME_ATTEST_REQUEST = 'KG_CHAT_STREAM_RUNTIME_ATTEST_REQUEST'
  const RUNTIME_ATTEST_RESPONSE = 'KG_CHAT_STREAM_RUNTIME_ATTEST_RESPONSE'
  const RUNTIME_SCHEMA = 'knowgrph-chat-stream-worker/v2'
  const CACHE_NAME = 'kg-chat-durable-stream-v1'
  const CACHE_PATH_PREFIX = '/__kg_chat_stream/'
  const runs = new Map()

  const normalizeString = value => String(value || '').trim()

  const cacheRequest = runId => new Request(`${self.location.origin}${CACHE_PATH_PREFIX}${encodeURIComponent(runId)}.json`)

  const send = (port, message) => {
    if (!port) return
    try {
      port.postMessage(message)
    } catch {
      void 0
    }
  }

  const broadcast = (run, message) => {
    if (!run || !run.ports) return
    run.ports.forEach(port => send(port, message))
  }

  const serializeRun = run => ({
    runId: run.runId,
    status: run.status,
    statusCode: run.statusCode,
    statusText: run.statusText,
    contentType: run.contentType,
    chunks: run.chunks,
    error: run.error,
    updatedAtMs: Date.now(),
  })

  const persistRun = async run => {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(cacheRequest(run.runId), new Response(JSON.stringify(serializeRun(run)), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      }))
    } catch {
      void 0
    }
  }

  const loadCachedRun = async runId => {
    try {
      const cache = await caches.open(CACHE_NAME)
      const response = await cache.match(cacheRequest(runId))
      if (!response) return null
      const data = await response.json()
      if (!data || typeof data !== 'object' || normalizeString(data.runId) !== runId) return null
      return {
        runId,
        status: data.status === 'done' ? 'done' : data.status === 'error' ? 'error' : 'active',
        statusCode: Number(data.statusCode || 200) || 200,
        statusText: normalizeString(data.statusText) || 'OK',
        contentType: normalizeString(data.contentType) || 'text/event-stream; charset=utf-8',
        chunks: Array.isArray(data.chunks) ? data.chunks.filter(chunk => typeof chunk === 'string') : [],
        error: normalizeString(data.error),
        controller: null,
        ports: new Set(),
      }
    } catch {
      return null
    }
  }

  const forgetRun = async runId => {
    const existing = runs.get(runId)
    if (existing && existing.controller) {
      try {
        existing.controller.abort()
      } catch {
        void 0
      }
    }
    if (existing) {
      existing.ports.forEach(port => {
        try {
          port.close()
        } catch {
          void 0
        }
      })
    }
    runs.delete(runId)
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.delete(cacheRequest(runId))
    } catch {
      void 0
    }
  }

  const parseSseFrames = buffer => {
    const events = []
    let rest = String(buffer || '')
    while (true) {
      const index = rest.search(/\n\s*\n/)
      if (index < 0) break
      const rawFrame = rest.slice(0, index)
      rest = rest.slice(index).replace(/^\n\s*\n/, '')
      const dataLines = rawFrame
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^\s/, ''))
      if (dataLines.length > 0) events.push(dataLines.join('\n'))
    }
    return { events, rest }
  }

  const appendSseEvent = async (run, raw) => {
    const eventText = String(raw || '')
    const chunk = `data: ${eventText}\n\n`
    run.chunks.push(chunk)
    broadcast(run, { type: CHUNK, runId: run.runId, chunk })
    await persistRun(run)
  }

  const replayRunToPort = (run, port) => {
    send(port, {
      type: RESPONSE,
      runId: run.runId,
      status: run.statusCode,
      statusText: run.statusText,
      contentType: run.contentType,
    })
    run.chunks.forEach(chunk => send(port, { type: CHUNK, runId: run.runId, chunk }))
    if (run.status === 'done') send(port, { type: DONE, runId: run.runId })
    if (run.status === 'error') send(port, { type: ERROR, runId: run.runId, error: run.error || 'Durable chat stream failed.' })
  }

  const startRun = async (runId, request, port) => {
    const existing = runs.get(runId)
    if (existing) {
      existing.ports.add(port)
      replayRunToPort(existing, port)
      return
    }
    const run = {
      runId,
      status: 'active',
      statusCode: 200,
      statusText: 'OK',
      contentType: 'text/event-stream; charset=utf-8',
      chunks: [],
      error: '',
      controller: new AbortController(),
      ports: new Set([port]),
    }
    runs.set(runId, run)
    await persistRun(run)

    try {
      const upstream = await fetch(request.requestUrl, {
        method: request.method || 'POST',
        headers: request.headers || {},
        body: request.body || undefined,
        signal: run.controller.signal,
      })
      run.statusCode = upstream.status
      run.statusText = upstream.statusText || 'OK'
      run.contentType = upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8'
      broadcast(run, {
        type: RESPONSE,
        runId,
        status: run.statusCode,
        statusText: run.statusText,
        contentType: run.contentType,
      })
      await persistRun(run)

      const reader = upstream.body && upstream.body.getReader ? upstream.body.getReader() : null
      if (!reader) {
        const text = await upstream.text().catch(() => '')
        if (text) {
          const chunk = run.contentType.includes('text/event-stream') ? text : `data: ${JSON.stringify({ error: text })}\n\n`
          run.chunks.push(chunk)
          broadcast(run, { type: CHUNK, runId, chunk })
        }
        run.status = 'done'
        broadcast(run, { type: DONE, runId })
        await persistRun(run)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        if (!chunk.value || chunk.value.byteLength === 0) continue
        const text = decoder.decode(chunk.value, { stream: true })
        if (!run.contentType.toLowerCase().includes('text/event-stream')) {
          run.chunks.push(text)
          broadcast(run, { type: CHUNK, runId, chunk: text })
          await persistRun(run)
          continue
        }
        buffer += text
        const parsed = parseSseFrames(buffer)
        buffer = parsed.rest
        for (const raw of parsed.events) {
          await appendSseEvent(run, raw)
        }
      }
      const tail = decoder.decode()
      if (tail) buffer += tail
      if (buffer.trim()) {
        const parsed = parseSseFrames(`${buffer}\n\n`)
        for (const raw of parsed.events) {
          await appendSseEvent(run, raw)
        }
      }
      run.status = 'done'
      broadcast(run, { type: DONE, runId })
      await persistRun(run)
    } catch (error) {
      run.status = 'error'
      run.error = error && typeof error === 'object' && 'message' in error ? String(error.message || '') : String(error || 'Durable chat stream failed.')
      broadcast(run, { type: ERROR, runId, error: run.error })
      await persistRun(run)
    }
  }

  const attachRun = async (runId, port) => {
    let run = runs.get(runId)
    if (!run) {
      run = await loadCachedRun(runId)
      if (run) runs.set(runId, run)
    }
    if (!run) {
      send(port, { type: ERROR, runId, error: 'No durable chat stream run is available.' })
      return
    }
    run.ports.add(port)
    replayRunToPort(run, port)
  }

  self.addEventListener('message', event => {
    const data = event.data || {}
    const runId = normalizeString(data.runId)
    const port = event.ports && event.ports[0] ? event.ports[0] : null
    if (data.type === RUNTIME_ATTEST_REQUEST && port) {
      send(port, { type: RUNTIME_ATTEST_RESPONSE, schema: RUNTIME_SCHEMA })
      return
    }
    if (!runId) return
    if (data.type === START && port && data.request) {
      event.waitUntil(startRun(runId, data.request, port))
      return
    }
    if (data.type === ATTACH && port) {
      event.waitUntil(attachRun(runId, port))
      return
    }
    if (data.type === ABORT) {
      event.waitUntil(forgetRun(runId))
      return
    }
    if (data.type === FORGET) {
      event.waitUntil(forgetRun(runId))
    }
  })
})()
