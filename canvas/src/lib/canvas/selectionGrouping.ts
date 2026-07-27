import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs, subgraphGroupId, type UserSubgraph } from '@/lib/graph/subgraphs'

export function collectSelectedNodeIds(
  selectedNodeId: string | null | undefined,
  selectedNodeIds: readonly string[] | null | undefined,
): string[] {
  const ids = new Set<string>()
  const primaryId = String(selectedNodeId || '').trim()
  if (primaryId) ids.add(primaryId)
  for (const rawId of selectedNodeIds || []) {
    const id = String(rawId || '').trim()
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

export function findSelectedUserSubgraph(
  graphData: GraphData | null | undefined,
  selectedGroupId: string | null | undefined,
): UserSubgraph | null {
  const groupId = String(selectedGroupId || '').trim()
  if (!groupId) return null
  return readSubgraphs(graphData).find(subgraph => subgraphGroupId(subgraph.id) === groupId) || null
}

export function createSelectionGroupLabel(graphData: GraphData | null | undefined): string {
  const labels = new Set(readSubgraphs(graphData).map(subgraph => subgraph.label.trim().toLocaleLowerCase()))
  let suffix = 1
  while (labels.has(`group ${suffix}`)) suffix += 1
  return `Group ${suffix}`
}

export function reselectDetachedNodeIds(
  memberNodeIds: readonly string[],
  toggleSelection: (nodeId: string) => void,
): string[] {
  const ids = collectSelectedNodeIds(null, memberNodeIds)
  for (let index = 0; index < ids.length; index += 1) toggleSelection(ids[index])
  return ids
}
