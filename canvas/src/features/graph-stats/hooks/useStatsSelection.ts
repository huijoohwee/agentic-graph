import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useSelectionAnchorIds } from '@/components/GraphCanvas/highlight'
import { readSelectionSubgraphMembershipForAnchorIds } from '@/lib/graph/file'
import type { GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { SelectionSnapshot } from '@/features/graph-stats/types'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'

const EMPTY_STRING_ARRAY: string[] = []

export function useStatsSelection() {
  const data = useGraphStore(s => s.graphData)
  const schema = useGraphStore(s => s.schema) as GraphSchema
  const zoomK = useGraphStore(s => s.zoomState?.k ?? 1)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds ?? EMPTY_STRING_ARRAY)
  const selectedEdgeIds = useGraphStore(s => s.selectedEdgeIds ?? EMPTY_STRING_ARRAY)
  const renderedGraph = useActiveGraphRenderData()
  const native = isReadOnlyAgentGraphProjection(data)
  const derivedGraph = native ? data : renderedGraph

  const edgeSelectionSnapshotRef = React.useRef<SelectionSnapshot | null>(null)
  const communitySelectionSnapshotRef = React.useRef<SelectionSnapshot | null>(null)

  const [pinnedEdgeId, setPinnedEdgeId] = React.useState<string | null>(null)
  const [pinnedCommunityId, setPinnedCommunityId] = React.useState<number | null>(null)

  const selectionInputsForStats = React.useMemo(() => {
    const snap =
      pinnedEdgeId != null
        ? edgeSelectionSnapshotRef.current
        : pinnedCommunityId != null
          ? communitySelectionSnapshotRef.current
          : null
    if (snap) return snap
    return { selectedNodeId, selectedEdgeId, selectedNodeIds, selectedEdgeIds }
  }, [pinnedCommunityId, pinnedEdgeId, selectedEdgeId, selectedEdgeIds, selectedNodeId, selectedNodeIds])

  const selectionAnchorIds = useSelectionAnchorIds({
      selectedNodeId: selectionInputsForStats.selectedNodeId,
      selectedEdgeId: selectionInputsForStats.selectedEdgeId,
      selectedNodeIds: selectionInputsForStats.selectedNodeIds,
      selectedEdgeIds: selectionInputsForStats.selectedEdgeIds,
    })

  const selectionMembership = React.useMemo(() => {
    const graph = derivedGraph as GraphData | null
    if (!graph) return null
    if (selectionAnchorIds.selectionNodeIds.length === 0 && selectionAnchorIds.selectionEdgeIds.length === 0) {
      return null
    }
    return readSelectionSubgraphMembershipForAnchorIds(graph, selectionAnchorIds)
  }, [derivedGraph, selectionAnchorIds])

  const selectionSubgraph = selectionMembership?.subgraph ?? null

  const hasSelectionSubgraph = !!(
    selectionSubgraph &&
    Array.isArray(selectionSubgraph.nodes) &&
    selectionSubgraph.nodes.length > 0 &&
    Array.isArray(selectionSubgraph.edges)
  )

  const [statsScope, setStatsScope] = React.useState<'auto' | 'dataset' | 'selection'>('auto')
  const [statsLod, setStatsLod] = React.useState<'auto' | 'low' | 'medium' | 'high'>('auto')

  const effectiveGraph = React.useMemo<GraphData | null>(() => {
    const graph = derivedGraph as GraphData | null
    if (!graph) return null
    if (statsScope === 'dataset') return graph
    if (statsScope === 'selection') return selectionSubgraph && hasSelectionSubgraph ? selectionSubgraph : graph
    if (statsScope === 'auto' && hasSelectionSubgraph && selectionSubgraph) return selectionSubgraph
    return graph
  }, [derivedGraph, hasSelectionSubgraph, selectionSubgraph, statsScope])

  const effectiveLod: 'low' | 'medium' | 'high' = React.useMemo(() => {
    if (statsLod === 'low' || statsLod === 'medium' || statsLod === 'high') return statsLod
    if (zoomK < 0.7) return 'low'
    if (zoomK < 1.5) return 'medium'
    return 'high'
  }, [statsLod, zoomK])

  const captureSelectionSnapshot = React.useCallback(() => {
    const st = useGraphStore.getState()
    return {
      selectedNodeId: st.selectedNodeId,
      selectedEdgeId: st.selectedEdgeId,
      selectedNodeIds: st.selectedNodeIds || [],
      selectedEdgeIds: st.selectedEdgeIds || [],
    }
  }, [])

  const restoreSelectionSnapshot = React.useCallback((snap: SelectionSnapshot | null) => {
    if (!snap) return
    useGraphStore.setState({
      selectedNodeId: snap.selectedNodeId,
      selectedEdgeId: snap.selectedEdgeId,
      selectedNodeIds: snap.selectedNodeIds,
      selectedEdgeIds: snap.selectedEdgeIds,
    })
  }, [])

  const selectNodeIds = React.useCallback((nodeIds: string[]) => {
    const unique = Array.from(new Set((nodeIds || []).map(String))).filter(Boolean)
    const active = unique.length ? unique[0] : null
    const st = useGraphStore.getState()
    st.setSelectionSource('menu')
    useGraphStore.setState({
      selectedNodeId: active,
      selectedEdgeId: null,
      selectedNodeIds: unique,
      selectedEdgeIds: [],
    })
  }, [])

  const selectEdgeIds = React.useCallback((edgeIds: string[]) => {
    const unique = Array.from(new Set((edgeIds || []).map(String))).filter(Boolean)
    const active = unique.length ? unique[0] : null
    const st = useGraphStore.getState()
    st.setSelectionSource('menu')
    useGraphStore.setState({
      selectedNodeId: null,
      selectedEdgeId: active,
      selectedNodeIds: [],
      selectedEdgeIds: unique,
    })
  }, [])

  return {
    data,
    renderedGraph,
    datasetGraph: derivedGraph,
    datasetScopeLabel: native ? 'Loaded graph' : 'Rendered graph',
    schema,
    effectiveGraph,
    statsScope,
    setStatsScope,
    statsLod,
    setStatsLod,
    effectiveLod,
    pinnedEdgeId,
    setPinnedEdgeId,
    pinnedCommunityId,
    setPinnedCommunityId,
    edgeSelectionSnapshotRef,
    communitySelectionSnapshotRef,
    captureSelectionSnapshot,
    restoreSelectionSnapshot,
    selectNodeIds,
    selectEdgeIds,
    selectedNodeIds,
    selectedEdgeIds,
    selectedNodeIdSet: React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]),
    selectedEdgeIdSet: React.useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds]),
  }
}
