import type { GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { agentRunInspectionJson, readAgentRunImport } from './agentRunImport'
import { record, type RunTrace } from './missionControlProjection'
import type { MissionCodebaseIndex } from './useAgentMissionCodebaseIndex'

/** Historical evidence only; none of these fields restore a live inspection or capability. */
export type MissionDashboardSnapshot = {
  trace: RunTrace
  codebase?: MissionCodebaseIndex
  graph?: GraphData
  schema: GraphSchema
}
export type DashboardFilePaths = { input: string; template: string; output: string }

export function readMissionDashboardSnapshot(input: unknown): MissionDashboardSnapshot {
  const value = record(input), raw = record(value.trace)
  if (!Array.isArray(raw.spans) || !raw.profile || !raw.evaluation) throw Error('Dashboard Mission evidence is invalid.')
  const imported = readAgentRunImport(agentRunInspectionJson(raw as RunTrace, null, Number(raw.expiresAt)), 'dashboard-input.json', Number(raw.observedAt))
  if (!imported) throw Error('Dashboard Mission evidence is invalid.')
  const trace = { ...raw, ...imported.trace, localImport: raw.localImport, nextCursor: raw.nextCursor } as RunTrace
  if (raw.localImport === undefined) delete trace.localImport
  // The shared importer validates the span fields; retain source-authored reason text as well.
  trace.evaluation.reason = typeof record(raw.evaluation).reason === 'string' ? record(raw.evaluation).reason as string : trace.evaluation.reason
  trace.spans.forEach((span, index) => {
    const reason = record(record((raw.spans as unknown[])[index]).evaluation).reason
    if (typeof reason === 'string') span.evaluation.reason = reason
  })
  if (raw.workflowManifest) {
    const manifest = record(raw.workflowManifest)
    if (typeof manifest.text !== 'string' || !/^[a-f0-9]{64}$/.test(String(manifest.digest))
      || JSON.stringify(JSON.parse(manifest.text)) !== JSON.stringify(manifest.value)) throw Error('Saved Mission manifest differs from its source bytes.')
    trace.workflowManifest = manifest as RunTrace['workflowManifest']
  }
  const schema = record(value.schema)
  if (!schema.nodeStyles || !schema.edgeStyles) throw Error('Saved Mission presentation schema is missing.')
  let codebase: MissionCodebaseIndex | undefined, graph: GraphData | undefined
  if (value.codebase) {
    const candidate = record(value.codebase), index = record(candidate.index), indexValue = record(index.value)
    if (typeof index.path !== 'string' || typeof index.text !== 'string'
      || JSON.stringify(JSON.parse(index.text)) !== JSON.stringify(indexValue)
      || indexValue.schema !== 'agentic-graph-codebase-index-manifest/v1' || indexValue.authority !== false) throw Error('Saved codebase index is invalid.')
    const data = record(value.graph), identity = record(record(data.metadata).agentGraphProjection)
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges) || data.nodes.length > 2048 || data.edges.length > 4096
      || identity.graphId !== indexValue.graphId || identity.snapshotDigest !== indexValue.snapshotDigest
      || data.nodes.some(node => typeof record(node).id !== 'string' || !record(node).properties)
      || data.edges.some(edge => typeof record(edge).id !== 'string' || typeof record(edge).source !== 'string' || typeof record(edge).target !== 'string' || !record(edge).properties)) throw Error('Saved codebase projection is incomplete or has another identity.')
    codebase = candidate as MissionCodebaseIndex; graph = data as unknown as GraphData
  }
  return { trace, schema: schema as unknown as GraphSchema, ...(codebase ? { codebase, graph } : {}) }
}
