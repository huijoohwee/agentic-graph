import type { GraphData } from '@/lib/graph/types'
import type { GeospatialBounds } from 'grph-shared/geospatial/enhancedLayerContract'

export type GraphNodeGeoReference = {
  exists: boolean
  bounds: GeospatialBounds | null
}

const readRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const readFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const numberValue = typeof value === 'number' ? value : Number(value.trim())
  return Number.isFinite(numberValue) ? numberValue : null
}

export function resolveGraphNodeGeoReference(args: {
  graphData: GraphData | null | undefined
  nodeId: string
}): GraphNodeGeoReference {
  const nodeId = String(args.nodeId || '').trim()
  const node = nodeId
    ? (args.graphData?.nodes || []).find(candidate => String(candidate.id || '').trim() === nodeId)
    : null
  if (!node) return { exists: false, bounds: null }

  const geo = readRecord(node.properties?.geo)
  const lat = readFiniteNumber(geo?.lat)
  const lng = readFiniteNumber(geo?.lng)
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { exists: true, bounds: null }
  }
  return { exists: true, bounds: [lng, lat, lng, lat] }
}

export const resolveGraphNodeGeoBounds = (
  graphData: GraphData | null | undefined,
  nodeId: string,
): GeospatialBounds | null => resolveGraphNodeGeoReference({ graphData, nodeId }).bounds
