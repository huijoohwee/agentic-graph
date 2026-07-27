import { useGraphStore } from '@/hooks/useGraphStore'
import {
  groupCurrentCanvasSelection,
  readSelectionGroupingAvailability,
  ungroupCurrentCanvasSelection,
} from '@/lib/canvas/selectionGroupingRuntime'
import { readSubgraphs, subgraphGroupId } from '@/lib/graph/subgraphs'
import { GROUP_PANEL_INVOCATION } from './groupPanelContract.mjs'

const readOperation = (input: Record<string, unknown>): 'inspect' | 'group' | 'ungroup' => {
  const operation = String(input.operation || '').trim().toLowerCase()
  if (operation === 'inspect' || operation === 'group' || operation === 'ungroup') return operation
  const invocation = String(input.invocation || '').trim().toLowerCase()
  if (invocation.includes('ungroup')) return 'ungroup'
  if (invocation.includes('group')) return 'group'
  return 'inspect'
}

const readSnapshot = (operation: string, ok: boolean, message?: string) => {
  const state = useGraphStore.getState()
  return {
    ok,
    operation,
    ...(message ? { message } : {}),
    invocation: GROUP_PANEL_INVOCATION,
    selection: readSelectionGroupingAvailability(),
    groups: readSubgraphs(state.graphData).map(group => ({
      id: group.id,
      groupId: subgraphGroupId(group.id),
      label: group.label,
      parentId: group.parentId || null,
      memberNodeIds: group.memberNodeIds,
      autoBounds: group.autoBounds === true,
    })),
  }
}

export async function controlLocalGroupPanel(input: Record<string, unknown>) {
  const operation = readOperation(input)
  if (operation === 'inspect') return readSnapshot(operation, true)
  if (operation === 'group' && (Array.isArray(input.nodeIds) || Array.isArray(input.groupIds))) {
    const nodeIds = Array.isArray(input.nodeIds) ? input.nodeIds.map(String).filter(Boolean) : []
    const groupIds = Array.isArray(input.groupIds) ? input.groupIds.map(String).filter(Boolean) : []
    const store = useGraphStore.getState()
    if (nodeIds.length + groupIds.length > 1) store.setSelectMode('multi')
    store.selectNodesExpanded({ nodeIds, groupIds, activeNodeId: nodeIds[nodeIds.length - 1] || null })
  }
  const result = operation === 'group'
    ? groupCurrentCanvasSelection()
    : ungroupCurrentCanvasSelection()
  if (result.ok === false) return readSnapshot(operation, false, result.message)
  return readSnapshot(operation, true)
}
