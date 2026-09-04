import type { GraphData } from '@/lib/graph/types'

type ProjectionMetadata = {
  owner?: unknown
  readOnly?: unknown
  graphId?: unknown
  snapshotDigest?: unknown
  projectionToken?: unknown
}

type PreviewMetadata = {
  owner?: unknown
  readOnly?: unknown
  graphId?: unknown
  parserRegistryDigest?: unknown
  complete?: unknown
}

const PROJECTION_IDENTITIES = [
  { kind: 'agent-graph', key: 'agentGraphProjection', owner: 'agent-graph-runtime' },
  { kind: 'knowledge-graph', key: 'knowledgeGraphProjection', owner: 'knowledge-graph-runtime' },
] as const

const PREVIEW_IDENTITIES = [
  { kind: 'agent-graph', key: 'agentGraphPreview', owner: 'agent-graph-runtime-preview' },
  { kind: 'knowledge-graph', key: 'knowledgeGraphPreview', owner: 'knowledge-graph-runtime-preview' },
] as const

function readOwnedMetadata<T extends ProjectionMetadata | PreviewMetadata>(
  graphData: GraphData | null | undefined,
  identities: typeof PROJECTION_IDENTITIES | typeof PREVIEW_IDENTITIES,
): T | null {
  const metadata = graphData?.metadata
  if (!metadata) return null
  for (const identity of identities) {
    if (metadata.kind !== identity.kind) continue
    const value = metadata[identity.key] as T | undefined
    if (value?.owner === identity.owner && value.readOnly === true) return value
  }
  return null
}

function readProjectionMetadata(
  graphData: GraphData | null | undefined,
): ProjectionMetadata | null {
  return readOwnedMetadata<ProjectionMetadata>(graphData, PROJECTION_IDENTITIES)
}

function readPreviewMetadata(
  graphData: GraphData | null | undefined,
): PreviewMetadata | null {
  return readOwnedMetadata<PreviewMetadata>(graphData, PREVIEW_IDENTITIES)
}

export function isReadOnlyAgentGraphProjection(
  graphData: GraphData | null | undefined,
): boolean {
  const projection = readProjectionMetadata(graphData)
  if (projection !== null) {
    return typeof projection.graphId === 'string'
      && typeof projection.snapshotDigest === 'string'
  }
  const preview = readPreviewMetadata(graphData)
  return preview !== null
    && typeof preview.graphId === 'string'
    && typeof preview.parserRegistryDigest === 'string'
    && preview.complete === false
}

export function hasSameReadOnlyAgentGraphProjectionIdentity(
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
