import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildSelectionGroupingPlan,
  collectSelectedGroupIds,
  collectSelectedNodeIds,
  findSelectedUserSubgraph,
} from '@/lib/canvas/selectionGrouping'
import {
  groupCurrentCanvasSelection,
  ungroupCurrentCanvasSelection,
} from '@/lib/canvas/selectionGroupingRuntime'

export function useSelectionGrouping(args: { active: boolean; allowMutations?: boolean }) {
  const allowMutations = args.allowMutations !== false
  const { graphData, selectedNodeId, selectedNodeIds, selectedGroupId, selectedGroupIds } = useGraphStore(
    useShallow(state => ({
      graphData: state.graphData,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      selectedGroupId: state.selectedGroupId,
      selectedGroupIds: state.selectedGroupIds,
    })),
  )

  const nodeIds = useMemo(
    () => collectSelectedNodeIds(selectedNodeId, selectedNodeIds),
    [selectedNodeId, selectedNodeIds],
  )
  const selectedSubgraph = useMemo(
    () => {
      const groupIds = collectSelectedGroupIds(selectedGroupId, selectedGroupIds)
      return groupIds.length === 1 ? findSelectedUserSubgraph(graphData, groupIds[0]) : null
    },
    [graphData, selectedGroupId, selectedGroupIds],
  )
  const groupingPlan = useMemo(() => buildSelectionGroupingPlan({
    graphData,
    nodeIds,
    groupIds: collectSelectedGroupIds(selectedGroupId, selectedGroupIds),
  }), [graphData, nodeIds, selectedGroupId, selectedGroupIds])
  const canGroupNodes = args.active && allowMutations && groupingPlan.entityCount >= 2
  const canUngroup = args.active && allowMutations && selectedSubgraph != null && groupingPlan.entityCount === 1

  const groupNodes = useCallback(() => {
    if (!args.active || !allowMutations) return
    const result = groupCurrentCanvasSelection()
    if (result.ok === false) {
      const store = useGraphStore.getState()
      store.pushUiToast({
        id: 'selection-grouping-error',
        kind: 'error',
        message: result.message,
      })
    }
  }, [allowMutations, args.active])

  const ungroup = useCallback(() => {
    if (!args.active || !allowMutations) return
    const result = ungroupCurrentCanvasSelection()
    if (result.ok === false) {
      useGraphStore.getState().pushUiToast({
        id: 'selection-ungroup-error',
        kind: 'error',
        message: result.message,
      })
    }
  }, [allowMutations, args.active])

  return {
    nodeIds,
    canGroupNodes,
    canUngroup,
    groupNodes,
    ungroup,
  }
}
