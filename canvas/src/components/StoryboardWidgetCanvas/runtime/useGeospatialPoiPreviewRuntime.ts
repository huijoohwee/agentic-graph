import React from 'react'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'

type Args = {
  enabled: boolean
  node: GraphNode | null
  baseGraphData: GraphData | null
  storedOpenWidgetNodeIds: string[]
  pendingOverlayNodeIdRef: React.MutableRefObject<string | null>
  lastDroppedWidgetNodeIdRef: React.MutableRefObject<string | null>
  setLastDroppedWidgetToken: React.Dispatch<React.SetStateAction<number>>
  setPendingOverlayNode: React.Dispatch<React.SetStateAction<GraphNode | null>>
  setPendingOverlayNodesById: React.Dispatch<React.SetStateAction<Record<string, GraphNode>>>
}

export function useGeospatialPoiPreviewRuntime(args: Args) {
  const {
    enabled, node, baseGraphData, storedOpenWidgetNodeIds, pendingOverlayNodeIdRef,
    lastDroppedWidgetNodeIdRef, setLastDroppedWidgetToken, setPendingOverlayNode, setPendingOverlayNodesById,
  } = args
  const nodeId = String(node?.id || '').trim()
  const openWidgetNodeIds = React.useMemo(
    () => enabled && nodeId ? [nodeId] : storedOpenWidgetNodeIds,
    [enabled, nodeId, storedOpenWidgetNodeIds],
  )
  React.useEffect(() => {
    const previewNode = enabled ? node : null
    const id = String(previewNode?.id || '').trim()
    if (!previewNode || !id) return
    pendingOverlayNodeIdRef.current = id
    lastDroppedWidgetNodeIdRef.current = id
    setLastDroppedWidgetToken(token => token + 1)
    setPendingOverlayNode(previewNode)
    setPendingOverlayNodesById(previous => previous[id] === previewNode ? previous : { ...previous, [id]: previewNode })
    return () => {
      if (pendingOverlayNodeIdRef.current === id) pendingOverlayNodeIdRef.current = null
      setPendingOverlayNode(previous => String(previous?.id || '').trim() === id ? null : previous)
      setPendingOverlayNodesById(previous => {
        if (resolveGraphNodeByCanonicalId(baseGraphData, id) || !Object.prototype.hasOwnProperty.call(previous, id)) return previous
        const next = { ...previous }
        delete next[id]
        return next
      })
    }
  }, [baseGraphData, enabled, lastDroppedWidgetNodeIdRef, node, pendingOverlayNodeIdRef, setLastDroppedWidgetToken, setPendingOverlayNode, setPendingOverlayNodesById])
  return { openWidgetNodeIds, nodeId }
}
