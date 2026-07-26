export function continueStoryboardWidgetMultiConnectSession(args: {
  edgeId: string
  sourceNodeId: string
  sourcePortKey: string | null
  setSelectionSource: (source: 'canvas') => void
  selectEdge: (edgeId: string | null) => void
  selectNode: (nodeId: string | null) => void
  setPendingEdgeSourceId: (nodeId: string | null) => void
  setPendingEdgeSourcePortKey: (portKey: string | null) => void
  setToolMode: (mode: 'addEdge') => void
}): boolean {
  const edgeId = String(args.edgeId || '').trim()
  const sourceNodeId = String(args.sourceNodeId || '').trim()
  if (!edgeId || !sourceNodeId) return false
  const sourcePortKey = String(args.sourcePortKey || '').trim() || null
  args.setSelectionSource('canvas')
  args.selectEdge(edgeId)
  args.selectNode(null)
  args.setPendingEdgeSourceId(sourceNodeId)
  args.setPendingEdgeSourcePortKey(sourcePortKey)
  args.setToolMode('addEdge')
  return true
}
