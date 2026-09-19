import { parseSseEvents } from '@/features/chat/floatingPanelChat/floatingPanelChatStreamParsing'
import { validateDashboardEvent, type DashboardEvent } from './dashboardMarkdownDocument'

/** Finite full snapshots. Reuse framing; never interpret a read chunk as a JSON event. */
export async function readDashboardSnapshotStream(response: Response, signal?: AbortSignal): Promise<DashboardEvent> {
  if (!response.ok || !response.body) throw Error('Dashboard input is unavailable.')
  const sse = response.headers.get('content-type')?.includes('text/event-stream') === true
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true })
  let rest = '', bytes = 0, count = 0, last: DashboardEvent | null = null, canonical = '', ended = false
  const accept = (json: string) => {
    if (ended) throw Error('Dashboard input arrived after completion.')
    if (json === '[DONE]') { ended = true; return }
    if (++count > 32) throw Error('Dashboard stream exceeds 32 snapshots.')
    const next = validateDashboardEvent(JSON.parse(json)), identity = JSON.stringify(next)
    if (last && (last.sourceId !== next.sourceId || next.sequence < last.sequence || next.observedAt < last.observedAt)) throw Error('Dashboard source or event ordering changed.')
    if (last?.sequence === next.sequence) {
      if (identity !== canonical) throw Error('Dashboard revision was reused with different values.')
      return
    }
    last = next; canonical = identity
  }
  const abort = () => { void reader.cancel().catch(() => undefined) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      signal?.throwIfAborted()
      const chunk = await reader.read()
      signal?.throwIfAborted()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 1024 * 1024) throw Error('Dashboard input exceeds 1 MiB.')
      rest += decoder.decode(chunk.value, { stream: true })
      if (sse) { const frames = parseSseEvents(rest); rest = frames.rest; frames.events.forEach(accept) }
    }
    rest += decoder.decode()
    if (sse) {
      const frames = parseSseEvents(rest); frames.events.forEach(accept)
      if (frames.rest.trim()) throw Error('Dashboard input ended within a frame.')
    } else accept(rest)
    if (!last) throw Error('Dashboard input contained no snapshot.')
    return last
  } finally { signal?.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
