import { parseSseEvents } from '@/features/chat/floatingPanelChat/floatingPanelChatStreamParsing'

export type ObservationListener = (snapshot: unknown) => void

/** Finite authenticated snapshots, not an executor or an automatic reconnect loop. */
export async function readRunObservation(response: Response, operation: 'query' | 'trace', runId: unknown,
  signal?: AbortSignal | null, observe?: ObservationListener): Promise<unknown> {
  const reader = response.body?.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  const streaming = response.headers.get('content-type')?.includes('text/event-stream') === true
  if (!reader || !response.headers.get('cache-control')?.split(',').some(s => s.trim().toLowerCase() === 'no-store')) {
    await reader?.cancel(); reader?.releaseLock(); throw Error('Observation must be an uncached bounded response.')
  }
  let buffer = '', bytes = 0, events = 0, last: unknown, previousTime = -1, previousJson = '', ended = false
  const accept = (json: string) => {
    if (ended) throw Error('Observation arrived after the stream ended.')
    if (json === '[DONE]') { ended = true; return }
    if (++events > 32) throw Error('Observation stream exceeds its snapshot bound.')
    const value = JSON.parse(json)
    if (value?.status === 'blocked') throw Object.assign(Error(String(value.reasonCode || 'Observation refused.')), {
      denied: ['principal_expired', 'run_forbidden', 'toolkit_denied'].includes(value.reasonCode),
    })
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schema !== (operation === 'query' ? 'agent-toolkit-query/v1' : 'agent-toolkit-run/v1')
      || operation === 'trace' && value.runId !== runId
      || !Number.isSafeInteger(value.observedAt) || value.observedAt < previousTime
      || value.observedAt > Date.now() + 1000 || value.observedAt + 60000 <= Date.now())
      throw Error('Observation stream identity, schema or freshness changed.')
    const canonical = JSON.stringify(value)
    if (value.observedAt === previousTime) {
      if (canonical !== previousJson) throw Error('Observation stream reused a revision.')
      return
    }
    previousTime = value.observedAt; previousJson = canonical; last = value; observe?.(value)
  }
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    for (;;) {
      const part = await reader.read(); signal?.throwIfAborted()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 262144) throw Error('Observation stream exceeds 256 KiB.')
      buffer += decoder.decode(part.value, { stream: true })
      if (streaming) { const parsed = parseSseEvents(buffer); buffer = parsed.rest; parsed.events.forEach(accept) }
    }
    buffer += decoder.decode()
    if (streaming) {
      const parsed = parseSseEvents(buffer); parsed.events.forEach(accept)
      if (parsed.rest.trim()) throw Error('Observation stream ended within a frame.')
    } else accept(buffer)
    if (last === undefined) throw Error('Observation stream contained no snapshot.')
    return last
  } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock() }
}
