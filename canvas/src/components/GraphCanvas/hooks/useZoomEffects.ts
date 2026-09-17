import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { applyZoomRequest, type ZoomRequest } from '@/components/GraphCanvas/zoomController'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData } from '@/lib/graph/types'

interface UseZoomEffectsProps {
  svgRef: React.RefObject<SVGSVGElement>
  zoomRef: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  width: number
  height: number
  paused?: boolean
  graphDataOverride?: GraphData | null
}

export function useZoomEffects({
  svgRef,
  zoomRef,
  width,
  height,
  paused,
  graphDataOverride,
}: UseZoomEffectsProps) {
  const dimsRef = useRef({ width, height })
  useEffect(() => {
    dimsRef.current = { width, height }
  }, [width, height])

  useEffect(() => {
    if (paused) return
    let rafId: number | null = null
    const apply = (zoomRequest: ZoomRequest | null) => {
      if (!zoomRequest || !svgRef.current || !zoomRef.current) return
      const state = useGraphStore.getState()
      const svg = d3.select(svgRef.current)
      applyZoomRequest(zoomRequest, {
        svg,
        zoom: zoomRef.current,
        graphData: graphDataOverride !== undefined ? graphDataOverride : state.graphData,
        width: Math.max(1, Math.floor(dimsRef.current.width)),
        height: Math.max(1, Math.floor(dimsRef.current.height)),
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: state.selectedEdgeId,
        selectedGroupId: state.selectedGroupId,
        selectedNodeIds: state.selectedNodeIds,
        selectedEdgeIds: state.selectedEdgeIds,
        selectedGroupIds: state.selectedGroupIds,
      })
    }
    const schedule = () => {
      if (rafId != null || !useGraphStore.getState().zoomRequest) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        apply(useGraphStore.getState().zoomRequest)
      })
    }
    const unsubZoomRequest = useGraphStore.subscribe(
      s => s.zoomRequest,
      schedule,
    )
    // Selection can replace the bounded render graph before the queued frame runs.
    // Resume its pending request after rebinding instead of dropping it in cleanup.
    schedule()
    return () => {
      unsubZoomRequest()
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [graphDataOverride, paused, svgRef, zoomRef])
}
