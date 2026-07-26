import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import {
  collectSelectedNodeIds,
  createSelectionGroupLabel,
  findSelectedUserSubgraph,
} from '@/lib/canvas/selectionGrouping'
import { subgraphGroupId } from '@/lib/graph/subgraphs'

export function useSelectionGrouping(args: { active: boolean; allowMutations?: boolean }) {
  const allowMutations = args.allowMutations !== false
  const { graphData, selectedNodeId, selectedNodeIds, selectedGroupId } = useGraphStore(
    useShallow(state => ({
      graphData: state.graphData,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      selectedGroupId: state.selectedGroupId,
    })),
  )

  const nodeIds = useMemo(
    () => collectSelectedNodeIds(selectedNodeId, selectedNodeIds),
    [selectedNodeId, selectedNodeIds],
  )
  const selectedSubgraph = useMemo(
    () => findSelectedUserSubgraph(graphData, selectedGroupId),
    [graphData, selectedGroupId],
  )
  const canGroupNodes = args.active && allowMutations && !selectedSubgraph && nodeIds.length >= 2
  const canUngroup = args.active && allowMutations && selectedSubgraph != null

  const groupNodes = useCallback(() => {
    if (!args.active || !allowMutations) return
    const store = useGraphStore.getState()
    const nextNodeIds = collectSelectedNodeIds(store.selectedNodeId, store.selectedNodeIds)
    if (nextNodeIds.length < 2 || findSelectedUserSubgraph(store.graphData, store.selectedGroupId)) return
    const result = store.createUserSubgraph({
      label: createSelectionGroupLabel(store.graphData),
      memberNodeIds: nextNodeIds,
    })
    if (result.ok === false) {
      store.pushUiToast({
        id: 'selection-grouping-error',
        kind: 'error',
        message: result.message,
      })
      return
    }
    store.setSelectionSource('toolbar')
    store.selectGroup(subgraphGroupId(result.id))
  }, [allowMutations, args.active])

  const ungroup = useCallback(() => {
    if (!args.active || !allowMutations) return
    const store = useGraphStore.getState()
    const subgraph = findSelectedUserSubgraph(store.graphData, store.selectedGroupId)
    if (!subgraph) return
    store.setSelectionSource('toolbar')
    store.removeUserSubgraph(subgraph.id)
  }, [allowMutations, args.active])

  return {
    nodeIds,
    canGroupNodes,
    canUngroup,
    groupNodes,
    ungroup,
  }
}
