import { readRunObservation } from './durableRunStream'
import { readRunTrace, record, type RunTrace } from './missionControlProjection'

export const workflowManifestSchemas = new Set(['agentic-os/workflow-group/v1', 'agentic-os/workflow-observation-input/v1'])
/** One root, existing SSE reader, bounded pages; publish no partial import after a failed page. */
export async function readWorkflowImport(manifestText: string, fileName: string, signal: AbortSignal,
  request: typeof fetch = fetch): Promise<RunTrace> {
  signal = AbortSignal.any([signal, AbortSignal.timeout(30000)])
  if (new TextEncoder().encode(manifestText).length > 32000) throw Error('Workflow manifest exceeds 32 KB.')
  const manifest = JSON.parse(manifestText)
  if (!workflowManifestSchemas.has(manifest.schema) || typeof manifest.id !== 'string') throw Error('Workflow manifest is invalid.')
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(manifestText)))].map(n => n.toString(16).padStart(2, '0')).join('')
  const runId = `workflow-${manifest.id}`, spans: RunTrace['spans'] = [], ids = new Set<string>()
  let first: RunTrace | null = null, offset = 0, bytes = 0, partial = false
  do {
    signal.throwIfAborted()
    const response = await request('/api/agent-swarm/workflow-trace', { method: 'POST', signal,
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ manifestText, offset }) })
    if (!response.ok) throw Error('Workflow archive unavailable. Keep the selected manifest and its referenced files in this local workspace.')
    const raw = record(await readRunObservation(response, 'trace', runId, signal))
    bytes += new TextEncoder().encode(JSON.stringify(raw)).byteLength
    if (raw.manifestDigest !== digest || bytes > 16 * 1024 * 1024) throw Error('Workflow manifest changed or import exceeds 16 MiB.')
    const page = readRunTrace(raw, runId)
    if (page.offset !== offset || !Number.isSafeInteger(page.total) || page.total < 1 || page.total > 2048
      || page.spans.length !== Math.min(32, page.total - offset)
      || first && (first.total !== page.total || first.subjectDigest !== page.subjectDigest || first.status !== page.status)) throw Error('Workflow page identity or coverage changed (maximum 2,048 spans).')
    first ??= page
    // Paging is not missing source evidence; completeness of receipts is tracked independently.
    partial ||= record(raw.coverage).sourcePartial === true
    for (const span of page.spans) {
      if (ids.has(span.spanId)) throw Error('Duplicate workflow span.')
      ids.add(span.spanId); spans.push(span)
    }
    const next = offset + page.spans.length
    if (page.nextCursor !== (next < page.total ? String(next) : null)) throw Error('Workflow page sequence is incomplete.')
    offset = next
  } while (offset < first.total)
  signal.throwIfAborted()
  return { ...first, spans, total: spans.length, offset: 0, nextCursor: null, partial,
    localImport: { fileName: fileName.slice(0, 240), importedAt: Date.now() } }
}
