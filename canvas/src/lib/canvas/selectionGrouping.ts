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

export function collectSelectedGroupIds(
  selectedGroupId: string | null | undefined,
  selectedGroupIds: readonly string[] | null | undefined,
): string[] {
  const ids = new Set<string>()
  const primaryId = String(selectedGroupId || '').trim()
  if (primaryId) ids.add(primaryId)
  for (const rawId of selectedGroupIds || []) {
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

export function findSelectedUserSubgraphs(
  graphData: GraphData | null | undefined,
  selectedGroupId: string | null | undefined,
  selectedGroupIds: readonly string[] | null | undefined,
): UserSubgraph[] {
  const selectedIds = new Set(collectSelectedGroupIds(selectedGroupId, selectedGroupIds))
  return readSubgraphs(graphData).filter(subgraph => selectedIds.has(subgraphGroupId(subgraph.id)))
}

export type SelectionGroupingPlan = {
  memberNodeIds: string[]
  childSubgraphIds: string[]
  entityCount: number
}

export function buildSelectionGroupingPlan(args: {
  graphData: GraphData | null | undefined
  nodeIds: readonly string[]
  groupIds: readonly string[]
}): SelectionGroupingPlan {
  const subgraphs = readSubgraphs(args.graphData)
  const byId = new Map(subgraphs.map(subgraph => [subgraph.id, subgraph] as const))
  const selectedSubgraphIds = new Set(
    args.groupIds
      .map(groupId => subgraphs.find(subgraph => subgraphGroupId(subgraph.id) === groupId)?.id || '')
      .filter(Boolean),
  )
  const childSubgraphIds = [...selectedSubgraphIds].filter(id => {
    let parentId = byId.get(id)?.parentId || null
    for (let depth = 0; parentId && depth < 200; depth += 1) {
      if (selectedSubgraphIds.has(parentId)) return false
      parentId = byId.get(parentId)?.parentId || null
    }
    return true
  })
  const nestedNodeIds = new Set<string>()
  const collectNestedNodes = (id: string, visited: Set<string>) => {
    if (visited.has(id)) return
    visited.add(id)
    const subgraph = byId.get(id)
    if (!subgraph) return
    subgraph.memberNodeIds.forEach(nodeId => nestedNodeIds.add(nodeId))
    subgraphs
      .filter(candidate => candidate.parentId === id)
      .forEach(candidate => collectNestedNodes(candidate.id, visited))
  }
  childSubgraphIds.forEach(id => collectNestedNodes(id, new Set()))
  const memberNodeIds = collectSelectedNodeIds(null, args.nodeIds).filter(nodeId => !nestedNodeIds.has(nodeId))
  return {
    memberNodeIds,
    childSubgraphIds,
    entityCount: memberNodeIds.length + childSubgraphIds.length,
  }
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
