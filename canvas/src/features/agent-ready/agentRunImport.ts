import { readRunTrace, record, known, type RunTrace } from './missionControlProjection'
const schemas = new Set(['agent-run-inspection/v1', 'agent-toolkit-run/v1'])
export const AGENT_RUN_IMPORT_MAX_BYTES = 16 * 1024 * 1024
export function agentRunInspectionJson(trace: RunTrace, selectedSpanId: string | null, expiresAt: number): string {
  return JSON.stringify({ schema: 'agent-run-inspection/v1', authority: false, expiresAt, selectedSpanId, trace }, null, 2)
}
/** Local files are observations, even when their former live session has expired. */
export function readAgentRunImport(text: string, fileName: string, importedAt = Date.now()): { trace: RunTrace; spanId: string | null } | null {
  if (new TextEncoder().encode(text).length > AGENT_RUN_IMPORT_MAX_BYTES) throw Error('Trace import exceeds 16 MiB.')
  let value: Record<string, unknown>
  try { value = record(JSON.parse(text)) } catch { return null }
  const legacy = value.authority === false && known(value.exportedAt) !== null && Array.isArray(value.spans) && typeof value.runId === 'string'
  if (!schemas.has(String(value.schema)) && !legacy) return null
  if (!Number.isFinite(importedAt) || importedAt < 0) throw Error('Import time is unavailable.')
  const normalized = value.schema === 'agent-run-inspection/v1' || legacy
  const input = normalized && !legacy ? record(value.trace) : value
  const wire = normalized ? { ...input, schema: 'agent-toolkit-run/v1',
    spans: Array.isArray(input.spans) ? input.spans.map(item => { const s = record(item), t = record(s.timing); return { ...s,
      timing: { startOffsetMs: t.offset, inclusiveMs: t.inclusive, exclusiveObservedMs: t.exclusive, scope: t.scope, basis: t.basis } } }) : input.spans,
    coverage: { partial: input.partial, droppedEvents: input.dropped, expectedSpans: input.expected },
    page: { total: input.total, offset: input.offset, nextCursor: input.nextCursor },
  } : input
  // Captured failed workflow phases are data, never an authenticated denial response.
  const rows = Array.isArray(wire.spans) ? wire.spans : []
  if (rows.length > 2048) throw Error('Trace import exceeds 2,048 spans.')
  const normalizedWire = { ...wire, ...(wire.status === 'blocked' ? { status: 'failed' } : {}) }
  const trace = readRunTrace({ ...normalizedWire, spans: rows.slice(0,32) }, String(input.runId || ''))
  for (let offset=32; offset<rows.length; offset+=32) trace.spans.push(...readRunTrace({ ...normalizedWire, spans: rows.slice(offset,offset+32) }, trace.runId).spans)
  if (new Set(trace.spans.map(s=>s.spanId)).size !== trace.spans.length) throw Error('Duplicate span identity.')
  if (wire.status === 'blocked') trace.status = 'blocked'
  trace.localImport = { fileName: fileName.slice(0, 240), importedAt }
  trace.nextCursor = null // A local file cannot carry a capability to fetch further runtime pages.
  const selected = typeof value.selectedSpanId === 'string' && trace.spans.some(span => span.spanId === value.selectedSpanId) ? value.selectedSpanId : null
  return { trace, spanId: selected }
}
let generation = 0
let activeImport: AbortController | null = null
/** Shared Launch entry. Ordinary JSON remains with the existing document importer. */
export async function importAgentRunFile(file: File, onImported?: () => void, surface: 'editor' | 'canvas' = 'editor'): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith('.json')) return false
  const attempt = ++generation
  activeImport?.abort(); const controller = new AbortController(); activeImport = controller
  if (file.size > AGENT_RUN_IMPORT_MAX_BYTES) return false
  try {
    const text = await file.text()
    if (attempt !== generation) return true
    let imported = readAgentRunImport(text, file.name)
    if (!imported) {
      let schema: unknown
      try { schema = JSON.parse(text)?.schema } catch { return false }
      if (schema === 'agentic-os/workflow-group/v1' || schema === 'agentic-os/workflow-observation-input/v1') {
        const { readWorkflowImport } = await import('./agentWorkflowImport')
        imported = { trace: await readWorkflowImport(text, file.name, controller.signal), spanId: null }
      }
    }
    if (!imported) return false
    const store = await import('./agentRunInspectionStore')
    if (attempt !== generation) return true
    store.activateAgentRunWorkspace('topology', surface)
    store.openAgentRunInspection({ ...imported, scope: `local-import:${attempt}`, expiresAt: imported.trace.localImport!.importedAt + 60000, search: '', view: 'topology' })
    onImported?.()
  } catch (error) {
    if (attempt !== generation) return true
    const { useGraphStore } = await import('@/hooks/useGraphStore')
    useGraphStore.getState().pushUiToast({ id: 'agent-run-import', kind: 'error', message: (error as Error).message, ttlMs: 6000 })
  }
  return true
}
