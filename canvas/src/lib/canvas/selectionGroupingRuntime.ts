import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildSelectionGroupingPlan,
  collectSelectedGroupIds,
  collectSelectedNodeIds,
  createSelectionGroupLabel,
  findSelectedUserSubgraph,
} from '@/lib/canvas/selectionGrouping'
import { readSubgraphs, subgraphGroupId } from '@/lib/graph/subgraphs'

export type SelectionGroupingAvailability = {
  nodeIds: string[]
  groupIds: string[]
  entityCount: number
  canGroup: boolean
  canUngroup: boolean
}

export type SelectionGroupingResult =
  | { ok: true; operation: 'group'; groupId: string }
  | { ok: true; operation: 'ungroup'; nodeIds: string[]; groupIds: string[] }
  | { ok: false; message: string }

export function readSelectionGroupingAvailability(): SelectionGroupingAvailability {
  const state = useGraphStore.getState()
  const nodeIds = collectSelectedNodeIds(state.selectedNodeId, state.selectedNodeIds)
  const groupIds = collectSelectedGroupIds(state.selectedGroupId, state.selectedGroupIds)
  const plan = buildSelectionGroupingPlan({ graphData: state.graphData, nodeIds, groupIds })
  return {
    nodeIds,
    groupIds,
    entityCount: plan.entityCount,
    canGroup: plan.entityCount >= 2,
    canUngroup: groupIds.length === 1 && findSelectedUserSubgraph(state.graphData, groupIds[0]) != null,
  }
}

export function groupCurrentCanvasSelection(): SelectionGroupingResult {
  const store = useGraphStore.getState()
  const nodeIds = collectSelectedNodeIds(store.selectedNodeId, store.selectedNodeIds)
  const groupIds = collectSelectedGroupIds(store.selectedGroupId, store.selectedGroupIds)
  const plan = buildSelectionGroupingPlan({ graphData: store.graphData, nodeIds, groupIds })
  if (plan.entityCount < 2) return { ok: false, message: 'Select at least two nodes or Group Panels.' }
  const result = store.createUserSubgraph({
    label: createSelectionGroupLabel(store.graphData),
    memberNodeIds: plan.memberNodeIds,
    childGroupIds: plan.childSubgraphIds,
    autoBounds: true,
  })
  if (result.ok === false) return result
  const groupId = subgraphGroupId(result.id)
  store.setSelectionSource('toolbar')
  store.selectNodesExpanded({ nodeIds: [], groupIds: [groupId] })
  return { ok: true, operation: 'group', groupId }
}

export function ungroupCurrentCanvasSelection(): SelectionGroupingResult {
  const store = useGraphStore.getState()
  const selectedGroupIds = collectSelectedGroupIds(store.selectedGroupId, store.selectedGroupIds)
  if (selectedGroupIds.length !== 1) return { ok: false, message: 'Select one Group Panel to ungroup.' }
  const subgraph = findSelectedUserSubgraph(store.graphData, selectedGroupIds[0])
  if (!subgraph) return { ok: false, message: 'Selected Group Panel was not found.' }
  const nodeIds = [...subgraph.memberNodeIds]
  const groupIds = readSubgraphs(store.graphData)
    .filter(candidate => candidate.parentId === subgraph.id)
    .map(candidate => subgraphGroupId(candidate.id))
  store.setSelectionSource('toolbar')
  store.removeUserSubgraph(subgraph.id)
  if (nodeIds.length + groupIds.length > 1) store.setSelectMode('multi')
  store.selectNodesExpanded({ nodeIds, groupIds, activeNodeId: nodeIds[nodeIds.length - 1] || null })
  return { ok: true, operation: 'ungroup', nodeIds, groupIds }
}
