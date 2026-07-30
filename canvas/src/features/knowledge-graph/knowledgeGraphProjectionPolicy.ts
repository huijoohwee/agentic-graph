import type { GraphData } from '@/lib/graph/types'

type ProjectionMetadata = {
  owner?: unknown
  readOnly?: unknown
  graphId?: unknown
  snapshotDigest?: unknown
  projectionToken?: unknown
}

function readProjectionMetadata(
  graphData: GraphData | null | undefined,
): ProjectionMetadata | null {
  const metadata = graphData?.metadata
  if (!metadata || metadata.kind !== 'knowledge-graph') return null
  const projection = metadata.knowledgeGraphProjection as ProjectionMetadata | undefined
  return projection?.owner === 'knowledge-graph-runtime' && projection.readOnly === true
    ? projection
    : null
}

export function isReadOnlyKnowledgeGraphProjection(
  graphData: GraphData | null | undefined,
): boolean {
  const projection = readProjectionMetadata(graphData)
  return projection !== null
    && typeof projection.graphId === 'string'
    && typeof projection.snapshotDigest === 'string'
}

export function hasSameReadOnlyKnowledgeGraphProjectionIdentity(
  current: GraphData | null | undefined,
  next: GraphData | null | undefined,
): boolean {
  const left = readProjectionMetadata(current)
  const right = readProjectionMetadata(next)
  return left !== null
    && right !== null
    && typeof left.graphId === 'string'
    && left.graphId === right.graphId
    && typeof left.snapshotDigest === 'string'
    && left.snapshotDigest === right.snapshotDigest
    && typeof left.projectionToken === 'string'
    && left.projectionToken === right.projectionToken
}
