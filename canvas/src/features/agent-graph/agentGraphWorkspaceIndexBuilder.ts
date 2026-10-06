import type { GraphData } from '@/lib/graph/types'
import { retainedAgentGraphDocumentIdentity, isReadOnlyAgentGraphProjection } from './agentGraphProjectionPolicy'
import { normalizeAgentGraphObservation } from '../../../../contracts/agent-graph-observation.mjs'

const ROOT = '/.workspace/codebase-index'
const SCHEMA = 'agentic-graph-codebase-index-manifest/v1'
export type WorkspaceCodebaseIndex = { path: string; value: Record<string, unknown>; text: string }

/** Pure identity-preserving index metadata; session inspection creates no storage or workflow reference. */
export function buildAgentGraphWorkspaceIndex(graph: GraphData, projectionPath: string,
  { retention }: { retention?: 'session' } = {}): WorkspaceCodebaseIndex {
  const identity = graph.metadata?.agentGraphProjection as Record<string, unknown> | undefined
  const retained = retainedAgentGraphDocumentIdentity(projectionPath)
  if (!identity || !isReadOnlyAgentGraphProjection(graph) || identity.complete !== true || !retained
    || retained.graphId !== identity.graphId || retained.snapshotDigest !== identity.snapshotDigest) throw Error('Codebase index requires an identified native snapshot')
  const value = {
    schema: SCHEMA, authority: false, graphId: retained.graphId, snapshotDigest: retained.snapshotDigest,
    parserRegistryDigest: identity.parserRegistryDigest, acquisition: identity.acquisition ?? null,
    counts: identity.counts, complete: identity.complete,
    projection: { path: projectionPath, renderer: 'd3', readOnly: true, complete: identity.projectionComplete,
      truncated: identity.projectionTruncated, limit: identity.projectionLimit,
      loadedNodes: graph.nodes.length, loadedEdges: graph.edges.length,
      ...(retention === 'session' ? { retention: 'session' } : {}) },
    traversal: { graphId: retained.graphId, expectedSnapshotDigest: retained.snapshotDigest },
    observation: normalizeAgentGraphObservation(identity.observation) ?? null,
    observationBasis: retention === 'session' ? 'session-import' : 'first-retained-import',
    evaluation: { status: 'unobserved', evidence: null },
  }
  const path = `${ROOT}/${retained.graphId.slice(9)}/${retained.snapshotDigest}.manifest.json`
  return { path, value, text: JSON.stringify(value, null, 2) + '\n' }
}
