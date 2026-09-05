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
const ALL_IDENTITIES = [...PROJECTION_IDENTITIES, ...PREVIEW_IDENTITIES] as const

function readOwnedMetadata<T extends ProjectionMetadata | PreviewMetadata>(
  graphData: GraphData | null | undefined,
  identities: typeof PROJECTION_IDENTITIES | typeof PREVIEW_IDENTITIES,
): T | null {
  const metadata = graphData?.metadata
  if (!metadata) return null
  const present = ALL_IDENTITIES.filter(identity => Object.hasOwn(metadata, identity.key))
  if (present.length !== 1) return null
  const identity = present[0]
  if (metadata.kind !== identity.kind
    || !identities.some(candidate => candidate.key === identity.key)) return null
  const value = metadata[identity.key] as T | undefined
  return value?.owner === identity.owner && value.readOnly === true ? value : null
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
  if (current?.metadata?.kind !== next?.metadata?.kind) return false
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
