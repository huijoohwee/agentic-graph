import type { GraphData } from '@/lib/graph/types'
import type { TraceSpan } from './missionControlProjection'

export type AgentMissionProvenanceSource = {
  repository: string
  revision?: string
  tree?: string
  snapshotDigest?: string
}
export type AgentMissionProvenanceContext = { source: unknown; projectionSource: unknown }
export type AgentMissionProvenanceResult = { status: 'matched' | 'missing' | 'stale'; reason: string }
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {}
const sha = (value: unknown, length: number) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value)
const repository = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 512
  && !/[\s\u0000-\u001f\u007f]/u.test(value)
const missing = (detail: string): AgentMissionProvenanceResult => ({ status: 'missing', reason: `Impact unobserved: ${detail} is missing or invalid.` })
const stale = (detail: string): AgentMissionProvenanceResult => ({ status: 'stale', reason: `Impact unobserved: ${detail} differs from the selected source.` })

/** Compare supplied source evidence only; matching provenance never proves execution or authenticity. */
export function joinAgentMissionProvenance(span: TraceSpan, graph: GraphData,
  context: AgentMissionProvenanceContext): AgentMissionProvenanceResult {
  const source = record(context?.source), projection = record(context?.projectionSource)
  if (!repository(source.repository) || !repository(projection.repository)) return missing('explicit repository provenance')
  if (source.repository !== projection.repository) return stale('repository provenance')
  const identity = record(graph.metadata?.agentGraphProjection)
  if (!sha(identity.snapshotDigest, 64) || !sha(projection.snapshotDigest, 64)) return missing('projection snapshot provenance')
  if (projection.snapshotDigest !== identity.snapshotDigest) return stale('projection snapshot provenance')
  let compared = 0
  for (const field of ['revision', 'tree', 'snapshotDigest'] as const) {
    // Projection's snapshot identifies the loaded graph. A span may instead bind its repository revision/tree.
    if (field === 'snapshotDigest' && source[field] === undefined) continue
    if (source[field] === undefined && projection[field] === undefined) continue
    const length = field === 'snapshotDigest' ? 64 : 40
    if (!sha(source[field], length) || !sha(projection[field], length)) return missing(`${field} provenance`)
    if (source[field] !== projection[field]) return stale(`${field} provenance`)
    compared++
  }
  if (!compared) return missing('revision, tree or source snapshot provenance')
  if (span.component.revision) {
    if (!sha(source.revision, 40)) return missing('component revision provenance')
    if (span.component.revision !== source.revision) return stale('component revision provenance')
  }
  return { status: 'matched', reason: 'Supplied source provenance matches this projection; runtime execution is not inferred.' }
}
