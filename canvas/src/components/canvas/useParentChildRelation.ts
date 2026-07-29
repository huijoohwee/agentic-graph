import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import { collectSelectedNodeIds } from '@/lib/canvas/selectionGrouping'
import { findNodeParentSubgraph } from '@/lib/canvas/parentChildRelation'
import { findUserSubgraphParent } from '@/lib/canvas/subFlow'

export function useParentChildRelation(args: { active: boolean; allowMutations?: boolean }) {
  const allowMutations = args.allowMutations !== false
  const { graphData, selectedNodeId, selectedNodeIds, selectedGroupId } = useGraphStore(
    useShallow(state => ({
      graphData: state.graphData,
      selectedNodeId: state.selectedNodeId,
      selectedNodeIds: state.selectedNodeIds,
      selectedGroupId: state.selectedGroupId,
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
  const nestedGroup = useMemo(
    () => findUserSubgraphParent(graphData, selectedGroupId),
    [graphData, selectedGroupId],
  )
  const canDetach = args.active && allowMutations && (
    (childNodeId != null && parentSubgraph != null) ||
    nestedGroup != null
  )

  const detach = useCallback(() => {
    if (!args.active || !allowMutations) return
    const store = useGraphStore.getState()
    const selectedNestedGroup = findUserSubgraphParent(store.graphData, store.selectedGroupId)
    if (selectedNestedGroup) {
      const result = store.updateUserSubgraph(selectedNestedGroup.child.id, { parentId: null })
      if (result.ok === false) {
        store.pushUiToast({
          id: 'sub-flow-detach-error',
          kind: 'error',
          message: result.message,
        })
        return
      }
      store.setSelectionSource('toolbar')
      return
    }
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
    nestedGroup,
    canDetach,
    detach,
  }
}
