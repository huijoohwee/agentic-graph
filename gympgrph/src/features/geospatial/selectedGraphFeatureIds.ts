import type { FeatureCollection } from 'geojson'

type RecordValue = Record<string, unknown>

const asRecord = (value: unknown): RecordValue | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
)

const readSourceFeatureId = (node: unknown): string => {
  const properties = asRecord(asRecord(node)?.properties)
  const richMediaProperties = asRecord(properties?.richMediaPoiProperties)
  return String(properties?.kgSourceFeatureId ?? richMediaProperties?.kgSourceFeatureId ?? '').trim()
}

/** Treat a selected Rich Media detail panel as selection of its source map feature. */
export function resolveSelectedGeoGraphNodeIds(
  graphData: unknown,
  selectedNodeIds: ReadonlySet<string>,
): Set<string> {
  const result = new Set(selectedNodeIds)
  const nodes = asRecord(graphData)?.nodes
  if (!Array.isArray(nodes) || result.size === 0) return result

  const selectedSourceIds = new Set<string>()
  for (const node of nodes) {
    const nodeId = String(asRecord(node)?.id ?? '').trim()
    if (nodeId && result.has(nodeId)) {
      const sourceId = readSourceFeatureId(node)
      if (sourceId) selectedSourceIds.add(sourceId)
    }
  }
  if (selectedSourceIds.size === 0) return result

  for (const node of nodes) {
    const record = asRecord(node)
    const nodeId = String(record?.id ?? '').trim()
    const properties = asRecord(record?.properties)
    const sourceId = String(properties?.kgSourceFeatureId ?? '').trim()
    if (nodeId && sourceId && selectedSourceIds.has(sourceId)) result.add(nodeId)
  }
  return result
}

export function markSelectedGeoGraphFeatures(
  features: FeatureCollection['features'],
  selectedNodeIds: ReadonlySet<string>,
): void {
  for (const feature of features) {
    const id = String(feature.id ?? '').trim()
    const properties = feature.properties && typeof feature.properties === 'object'
      ? feature.properties as Record<string, unknown>
      : {}
    feature.properties = { ...properties, kgSelected: selectedNodeIds.has(id) }
  }
}
