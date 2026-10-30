import React from 'react'
import type { GraphNode } from '@/lib/graph/types'

export function usePendingOverlayNodeRegistry(
  pendingOverlayNode: GraphNode | null,
  setPendingOverlayNode: React.Dispatch<React.SetStateAction<GraphNode | null>>,
  setPendingOverlayNodesById: React.Dispatch<React.SetStateAction<Record<string, GraphNode>>>,
) {
  const registerPendingOverlayNode = React.useCallback<React.Dispatch<React.SetStateAction<GraphNode | null>>>(node => setPendingOverlayNode(node), [setPendingOverlayNode])
  React.useEffect(() => {
    const id = String(pendingOverlayNode?.id || '').trim()
    if (!id || !pendingOverlayNode) return
    setPendingOverlayNodesById(previous => previous[id] === pendingOverlayNode ? previous : { ...previous, [id]: pendingOverlayNode })
  }, [pendingOverlayNode, setPendingOverlayNodesById])
  return registerPendingOverlayNode
}
