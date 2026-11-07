import type { GraphData } from '@/lib/graph/types'
import { retainedAgentGraphDocumentIdentity, isReadOnlyAgentGraphProjection } from './agentGraphProjectionPolicy'
import { normalizeAgentGraphObservation } from '../../../../contracts/agent-graph-observation.mjs'

const ROOT = '/.workspace/codebase-index'
const SCHEMA = 'agentic-graph-codebase-index-manifest/v1'
export type WorkspaceCodebaseIndex = { path: string; value: Record<string, unknown>; text: string }

const safeCategory = (value: unknown): value is string => typeof value === 'string'
  && value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/.test(value)

function categoryCounts(values: unknown[]) {
  const counts = new Map<string, number>()
  for (const value of values) if (safeCategory(value)) counts.set(value, (counts.get(value) ?? 0) + 1)
  const sorted = [...counts].sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount
    || (left < right ? -1 : left > right ? 1 : 0))
  return { categories: sorted.slice(0, 24).map(([category, count]) => ({ category, count })),
    omittedCategories: Math.max(0, sorted.length - 24) }
}

function projectionInventory(graph: GraphData) {
  const sourceNodes = graph.nodes.filter(node => node.type === 'SourceFile')
  const binaryNodes = graph.nodes.filter(node => node.type === 'NativeBinaryArtifact')
  return {
    scope: 'loaded-projection',
    sourceNodes: sourceNodes.length,
    parserIds: categoryCounts(sourceNodes.map(node => node.properties['corpus:parserId'])),
    nodeTypes: categoryCounts(graph.nodes.map(node => node.type)),
    edgeLabels: categoryCounts(graph.edges.map(edge => edge.label)),
    nativeBinaryFormats: categoryCounts(binaryNodes.map(node => node.properties['native:format'])),
  }
}

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
      inventory: projectionInventory(graph),
      ...(retention === 'session' ? { retention: 'session' } : {}) },
    traversal: { graphId: retained.graphId, expectedSnapshotDigest: retained.snapshotDigest },
    observation: normalizeAgentGraphObservation(identity.observation) ?? null,
    observationBasis: retention === 'session' ? 'session-import' : 'first-retained-import',
    evaluation: { status: 'unobserved', evidence: null },
  }
  const path = `${ROOT}/${retained.graphId.slice(9)}/${retained.snapshotDigest}.manifest.json`
  return { path, value, text: JSON.stringify(value, null, 2) + '\n' }
}
