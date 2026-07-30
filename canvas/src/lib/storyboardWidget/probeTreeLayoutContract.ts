import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import type { GraphNode } from '@/lib/graph/types'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

export const PROBE_TREE_BALANCED_LAYOUT_MODE = 'balanced-waterfall' as const
export const PROBE_TREE_BALANCED_LAYOUT_VERSION = 7
export const PROBE_TREE_LAYOUT_MODE_PROPERTY = 'probeTreeLayoutMode' as const
export const PROBE_TREE_LAYOUT_VERSION_PROPERTY = 'probeTreeLayoutVersion' as const
export const PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY = 'probeTreePinnedByDefault' as const

export function isProbeTreeLayoutOwnedNode(node: { properties?: GraphNode['properties'] } | null | undefined): boolean {
  const properties = readGraphNodeProperties(node ? { properties: node.properties } : null)
  return String(unwrapGraphCellValue(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY]) || '').trim() === PROBE_TREE_BALANCED_LAYOUT_MODE
    && Number(unwrapGraphCellValue(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY])) === PROBE_TREE_BALANCED_LAYOUT_VERSION
}

export function isProbeTreePinnedByDefaultNode(node: { properties?: GraphNode['properties'] } | null | undefined): boolean {
  const properties = readGraphNodeProperties(node ? { properties: node.properties } : null)
  return isProbeTreeLayoutOwnedNode(node)
    && unwrapGraphCellValue(properties[PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]) === true
}
