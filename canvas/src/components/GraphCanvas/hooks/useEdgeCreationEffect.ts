import { useEffect } from 'react'
import { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  startEdgeFromNode,
  startUpdateEdgeEndpoint,
  resolveEdgeCreationGraphData,
  PendingLink,
  TempLinkSelection,
} from '@/features/edge-creation'
import { isStoryboardCanvas2dRenderer } from '@/lib/config.render'

interface UseEdgeCreationEffectProps {
  paused?: boolean
  graphData?: GraphData | null
  tempLinkSelRef: React.MutableRefObject<TempLinkSelection>
  linkDragRef: React.MutableRefObject<PendingLink | null>
}

export function useEdgeCreationEffect({
  paused,
  graphData: renderedGraphData,
  tempLinkSelRef,
  linkDragRef,
}: UseEdgeCreationEffectProps) {
  useEffect(() => {
    if (paused) return
    const unsub = useGraphStore.subscribe(
      s => s.edgeCreationRequest,
      edgeCreationRequest => {
        const state = useGraphStore.getState()
        const graphData = resolveEdgeCreationGraphData(renderedGraphData, state.graphData as GraphData | null)
        if (!edgeCreationRequest || !graphData) return
        // Storyboard cards and rich-media panels use the shared Storyboard Widget
        // overlay authoring state so their semantic port handles remain the
        // source and target owners for the entire interaction.
        if (edgeCreationRequest.type === 'create' && isStoryboardCanvas2dRenderer(state.canvas2dRenderer)) return
        const graphSemanticKey = buildScopedGraphSemanticKey('graph-canvas-edge-creation-effect-graph', {
          graphData,
          graphRevision: state.graphDataRevision || 0,
        })
        const graphLookup = getCachedGraphLookup({
          cacheScope: 'graph-canvas-edge-creation-effect-graph',
          graphData,
          graphRevision: state.graphDataRevision || 0,
          graphSemanticKey,
          preferCurrentGraphDataRefs: true,
        })
        const fromId = String(edgeCreationRequest.fromId || '').trim()
        const n = fromId ? graphLookup?.nodeById.get(fromId) || null : null
        if (!n) {
          state.clearEdgeCreationRequest()
          return
        }
        if (edgeCreationRequest.type === 'create') {
          startEdgeFromNode(n, tempLinkSelRef, linkDragRef)
          state.clearEdgeCreationRequest()
          return
        }
        const selectedEdgeId = state.selectedEdgeId
        const selectedEdgeKey = String(selectedEdgeId || '').trim()
        const sel = selectedEdgeKey ? graphLookup?.edgeById.get(selectedEdgeKey) || null : null
        if (sel) {
          startUpdateEdgeEndpoint(
            sel,
            n,
            edgeCreationRequest.type,
            tempLinkSelRef,
            linkDragRef,
            id => state.selectEdge(id),
            src => state.setSelectionSource(src),
          )
        } else {
          startEdgeFromNode(n, tempLinkSelRef, linkDragRef)
        }
        state.clearEdgeCreationRequest()
      },
    )
    return () => {
      unsub()
    }
  }, [linkDragRef, paused, renderedGraphData, tempLinkSelRef])
}
