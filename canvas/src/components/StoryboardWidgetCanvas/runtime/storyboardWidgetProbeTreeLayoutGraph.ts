import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export const readProbeTreeLayoutString = (value: unknown): string =>
  String(unwrapGraphCellValue(value) ?? '').trim()

export const readProbeTreeLayoutRecord = (value: unknown): Record<string, unknown> => {
  const unwrapped = unwrapGraphCellValue(value)
  return unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)
    ? unwrapped as Record<string, unknown>
    : {}
}

export const readProbeTreeLayoutProperties = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const typedValues = (
    Object.prototype.hasOwnProperty.call(record, 'key')
    || Object.prototype.hasOwnProperty.call(record, 'type')
  ) ? readProbeTreeLayoutRecord(record.value) : null
  return typedValues || record
}

export const collectProbeTreeThreadNodeIds = (
  graphData: GraphData,
  threadRootId: string,
): Set<string> => {
  const threadNodeIds = new Set<string>([threadRootId].filter(Boolean))
  let changed = true
  while (changed) {
    changed = false
    for (const node of graphData.nodes || []) {
      const nodeId = readProbeTreeLayoutString(node.id)
      if (!nodeId || threadNodeIds.has(nodeId)) continue
      const properties = readProbeTreeLayoutProperties(node.properties)
      const explicitRootId = readProbeTreeLayoutString(properties.probeTreeThreadRootId)
      const parentNodeId = readProbeTreeLayoutString(properties.parentNodeId || properties.parentGraphNodeId)
      if (explicitRootId === threadRootId || (parentNodeId && threadNodeIds.has(parentNodeId))) {
        threadNodeIds.add(nodeId)
        changed = true
      }
    }
  }
  return threadNodeIds
}

export const resolveCanonicalProbeTreeThreadRootId = (
  graphData: GraphData,
  candidateNodeId: string,
): string => {
  const nodeById = new Map<string, GraphNode>(
    (graphData.nodes || []).map(node => [readProbeTreeLayoutString(node.id), node]),
  )
  const seen = new Set<string>()
  let currentNodeId = readProbeTreeLayoutString(candidateNodeId)
  while (currentNodeId && !seen.has(currentNodeId)) {
    seen.add(currentNodeId)
    const node = nodeById.get(currentNodeId)
    if (!node) break
    const properties = readProbeTreeLayoutProperties(node.properties)
    const explicitRootId = readProbeTreeLayoutString(properties.probeTreeThreadRootId)
    if (explicitRootId && explicitRootId !== currentNodeId) {
      currentNodeId = explicitRootId
      continue
    }
    const parentNodeId = readProbeTreeLayoutString(properties.parentNodeId || properties.parentGraphNodeId)
    if (!parentNodeId) break
    currentNodeId = parentNodeId
  }
  return currentNodeId || readProbeTreeLayoutString(candidateNodeId)
}
