export const readKeywordGraphNodeBudget = (args: { edgesPerNode: number; maxEdgesCap: number }): number => {
  const rawEdgesPerNode = Number(args.edgesPerNode)
  const rawEdgeCap = Number(args.maxEdgesCap)
  const edgesPerNode = Number.isFinite(rawEdgesPerNode) ? Math.max(1, Math.min(60, Math.floor(rawEdgesPerNode))) : 6
  const edgeCap = Number.isFinite(rawEdgeCap) ? Math.max(0, Math.min(25_000, Math.floor(rawEdgeCap))) : 2400
  return Math.max(80, Math.min(220, Math.floor(edgeCap / edgesPerNode)))
}

export const readKeywordSourceNodeBudget = (args: { mentionEdgesPerSourceNode: number; maxEdgesCap: number }): number => {
  const rawMentionEdges = Number(args.mentionEdgesPerSourceNode)
  const rawEdgeCap = Number(args.maxEdgesCap)
  const mentionEdges = Number.isFinite(rawMentionEdges) ? Math.max(1, Math.min(30, Math.floor(rawMentionEdges))) : 6
  const edgeCap = Number.isFinite(rawEdgeCap) ? Math.max(0, Math.min(25_000, Math.floor(rawEdgeCap))) : 2400
  return Math.max(24, Math.min(96, Math.floor(edgeCap / (mentionEdges * 3))))
}
