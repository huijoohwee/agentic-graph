import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { collectSelectedNodeIds } from '@/lib/canvas/selectionGrouping'
import { findNodeParentSubgraph } from '@/lib/canvas/parentChildRelation'

export function useParentChildRelation(args: { active: boolean; allowMutations?: boolean }) {
  const allowMutations = args.allowMutations !== false
  const { graphData, selectedNodeId, selectedNodeIds } = useGraphStore(
    useShallow(state => ({
      graphData: state.graphData,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
    })),
  )
  const selectedIds = useMemo(
    () => collectSelectedNodeIds(selectedNodeId, selectedNodeIds),
    [selectedNodeId, selectedNodeIds],
  )
  const childNodeId = selectedIds.length === 1 ? selectedIds[0] || null : null
  const parentSubgraph = useMemo(
    () => findNodeParentSubgraph(graphData, childNodeId),
    [childNodeId, graphData],
  )
  const canDetach = args.active && allowMutations && childNodeId != null && parentSubgraph != null

  const detach = useCallback(() => {
    if (!args.active || !allowMutations) return
    const store = useGraphStore.getState()
    const nodeIds = collectSelectedNodeIds(store.selectedNodeId, store.selectedNodeIds)
    if (nodeIds.length !== 1) return
    const nodeId = nodeIds[0]!
    const parent = findNodeParentSubgraph(store.graphData, nodeId)
    if (!parent) return
    const result = store.detachNodeFromUserSubgraph(parent.id, nodeId)
    if (result.ok === false) {
      store.pushUiToast({
        id: 'parent-child-detach-error',
        kind: 'error',
        message: result.message,
      })
      return
    }
    store.setSelectionSource('toolbar')
    store.selectNode(nodeId)
  }, [allowMutations, args.active])

  return {
    childNodeId,
    parentSubgraph,
    canDetach,
    detach,
  }
}
