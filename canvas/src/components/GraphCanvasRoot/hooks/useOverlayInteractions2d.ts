import React, { useCallback, useRef, type MutableRefObject, type RefObject } from 'react'
import * as d3 from 'd3'

import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import { DEFAULT_DRAG_ALPHA_TARGET } from '@/lib/graph/layoutDefaults'
import { readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { computeOverlayPanTransform2d } from '@/lib/canvas/overlayInteractions2d'
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import { readMergedGraphNodeLookup, type MergedGraphNodeLookupCache } from '@/components/GraphCanvasRoot/utils/mergedNodeLookup'
import {
  computeStoryboardWidgetOverlayDraggedWorldPoint,
  computeStoryboardWidgetOverlayPointerGrabOffset,
  readStoryboardWidgetOverlayCanvasOffset,
  type StoryboardWidgetOverlayDragPoint,
} from '@/lib/storyboardWidget/overlayWorldDrag'

export function useOverlayInteractions2d(args: {
  activeRef: MutableRefObject<boolean>
  svgRef: RefObject<SVGSVGElement | null>
  zoomRef: MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  simulationRef: MutableRefObject<d3.Simulation<GraphNode, GraphEdge> | null>
  sceneGraphDataRef: MutableRefObject<GraphData | null>
  graphDataRevision: number
  schemaRef: MutableRefObject<GraphSchema>
  requestOverlaySchedule?: () => void
}) {
  const { activeRef, svgRef, zoomRef, simulationRef, sceneGraphDataRef, graphDataRevision, schemaRef, requestOverlaySchedule } = args

  const stopEvent = useCallback((event: React.SyntheticEvent) => {
    try {
      event.stopPropagation()
    } catch {
      void 0
    }
  }, [])

  const headerDragRef = useRef<null | {
    id: string
    baseX: number
    baseY: number
    structured: boolean
    frozen: boolean
    lastDx: number
    lastDy: number
    startClientX: number
    startClientY: number
    lastClientX: number
    lastClientY: number
    grabOffsetWorld: StoryboardWidgetOverlayDragPoint
    workspaceViewModeAtStart: 'canvas' | 'editor'
  }>(null)
  const overlayPanRef = useRef<null | { pointerId: number; startClientX: number; startClientY: number; startTransform: d3.ZoomTransform }>(null)
  const overlayNodeLookupRef = useRef<MergedGraphNodeLookupCache>({
    graphSemanticKey: '',
    rev: -1,
    sim: null,
    map: new Map(),
  })

  const readOverlayInteractionNodeById = useCallback(() => {
    return readMergedGraphNodeLookup({
      cacheRef: overlayNodeLookupRef,
      cacheScope: 'graph-canvas-root-overlay-interactions-node-lookup',
      graphData: sceneGraphDataRef.current,
      graphRevision: graphDataRevision,
      simulation: simulationRef.current,
    })
  }, [graphDataRevision, sceneGraphDataRef, simulationRef])

  const headerDragMoveSchedulerRef = useRef(
    createRafValueScheduler((args0: { dx: number; dy: number; clientX: number; clientY: number }) => {
      const st = headerDragRef.current
      if (!st) return
      if (!shouldStartHeaderDrag()) return
      const svgEl = svgRef.current
      if (!svgEl) return
      const sim = simulationRef.current
      const node = readOverlayInteractionNodeById().get(st.id) || null
      if (!node) return
      st.lastDx = args0.dx
      st.lastDy = args0.dy
      st.lastClientX = args0.clientX
      st.lastClientY = args0.clientY
      const t = d3.zoomTransform(svgEl as unknown as SVGSVGElement)
      const p = computeStoryboardWidgetOverlayDraggedWorldPoint({
        transform: t,
        canvasOffset: readStoryboardWidgetOverlayCanvasOffset(svgEl),
        pointerClient: { x: args0.clientX, y: args0.clientY },
        grabOffsetWorld: st.grabOffsetWorld,
        baseWorld: { x: st.baseX, y: st.baseY },
        schema: schemaRef.current,
        snapToGrid: false,
      })
      node.fx = p.x
      node.fy = p.y
      node.x = p.x
      node.y = p.y
      node.vx = 0
      node.vy = 0
      try {
        const tickHandler = sim?.on('tick')
        if (typeof tickHandler === 'function') {
          ;(tickHandler as unknown as () => void)()
        }
      } catch {
        void 0
      }
      try {
        requestOverlaySchedule?.()
      } catch {
        void 0
      }
    }),
  )

  const overlayPanMoveSchedulerRef = useRef(
    createRafValueScheduler((args0: { pointerId: number; dx: number; dy: number }) => {
      const drag = overlayPanRef.current
      if (!drag || drag.pointerId !== args0.pointerId) return
      const svgEl = svgRef.current
      const zoom = zoomRef.current
      if (!svgEl || !zoom) return
      const st = useGraphStore.getState()
      disableAutoZoomModesForUserGesture(st)
      const next = computeOverlayPanTransform2d({
        startTransform: drag.startTransform,
        dxClientPx: args0.dx,
        dyClientPx: args0.dy,
        canvasPanSpeedMultiplier: st.canvasPanSpeedMultiplier,
        canvasInteractionSpeedMultiplier: st.canvasInteractionSpeedMultiplier,
        applySpeedMultipliers: false,
      })
      d3.select(svgEl).call(
        zoom.transform as unknown as (sel: d3.Selection<SVGSVGElement, unknown, null, undefined>, t: d3.ZoomTransform) => void,
        next,
      )
      try {
        requestOverlaySchedule?.()
      } catch {
        void 0
      }
    }),
  )

  const shouldStartHeaderDrag = useCallback(() => {
    if (isSpacePanHeld()) return false
    return true
  }, [])

  const beginHeaderDrag = useCallback(
    (id: string, clientX: number, clientY: number) => {
      if (!activeRef.current) return
      if (!shouldStartHeaderDrag()) return
      const svgEl = svgRef.current
      if (!svgEl) return
      const sim = simulationRef.current
      const node = readOverlayInteractionNodeById().get(id) || null
      if (!node) return
      const x0 = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0
      const y0 = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0
      const mode = readLayoutMode(schemaRef.current)
      const structured = mode === 'radial'
      const frozen = svgEl.getAttribute('data-kg-layout-frozen') === '1'
      const workspaceViewModeAtStart = useGraphStore.getState().workspaceViewMode === 'editor' ? 'editor' : 'canvas'
      const t = d3.zoomTransform(svgEl as unknown as SVGSVGElement)
      const grabOffsetWorld = computeStoryboardWidgetOverlayPointerGrabOffset({
        transform: t,
        canvasOffset: readStoryboardWidgetOverlayCanvasOffset(svgEl),
        pointerClient: { x: clientX, y: clientY },
        startWorld: { x: x0, y: y0 },
      })
      lockGlobalUserSelect()
      headerDragRef.current = {
        id,
        baseX: x0,
        baseY: y0,
        structured,
        frozen,
        lastDx: 0,
        lastDy: 0,
        startClientX: clientX,
        startClientY: clientY,
        lastClientX: clientX,
        lastClientY: clientY,
        grabOffsetWorld,
        workspaceViewModeAtStart,
      }
      if (sim && !structured && !frozen) {
        const alphaTarget = (() => {
          try {
            const v = useGraphStore.getState().graphDragAlphaTarget2d
            return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(0.6, v)) : DEFAULT_DRAG_ALPHA_TARGET
          } catch {
            return DEFAULT_DRAG_ALPHA_TARGET
          }
        })()
        try {
          sim.alphaTarget(alphaTarget).restart()
        } catch {
          void 0
        }
      }
      node.fx = x0
      node.fy = y0
    },
    [activeRef, readOverlayInteractionNodeById, schemaRef, shouldStartHeaderDrag, simulationRef, svgRef],
  )

  const moveHeaderDrag = useCallback(
    (dx: number, dy: number, clientX?: number, clientY?: number) => {
      const st = headerDragRef.current
      headerDragMoveSchedulerRef.current.schedule({
        dx,
        dy,
        clientX: typeof clientX === 'number' && Number.isFinite(clientX) ? clientX : (st ? st.startClientX + dx : dx),
        clientY: typeof clientY === 'number' && Number.isFinite(clientY) ? clientY : (st ? st.startClientY + dy : dy),
      })
    },
    [],
  )

  const endHeaderDrag = useCallback(() => {
    const st = headerDragRef.current
    if (!st) return
    // Consume the last pointer sample while its drag state is still available.
    headerDragMoveSchedulerRef.current.flush()
    headerDragRef.current = null
    unlockGlobalUserSelect()
    const svgEl = svgRef.current
    const sim = simulationRef.current
    const node = readOverlayInteractionNodeById().get(st.id) || null
    if (node && !st.structured) {
      node.fx = null
      node.fy = null
    }
    if (sim && !st.structured && !st.frozen) {
      try {
        sim.alphaTarget(0)
      } catch {
        void 0
      }
    }
    if (!node) return
    const workspaceViewModeAtEnd = useGraphStore.getState().workspaceViewMode === 'editor' ? 'editor' : 'canvas'
    if (workspaceViewModeAtEnd !== st.workspaceViewModeAtStart) {
      node.x = st.baseX
      node.y = st.baseY
      if (!st.structured) {
        node.fx = null
        node.fy = null
      }
      return
    }
    const t = svgEl ? d3.zoomTransform(svgEl as unknown as SVGSVGElement) : null
    const p = computeStoryboardWidgetOverlayDraggedWorldPoint({
      transform: t,
      canvasOffset: readStoryboardWidgetOverlayCanvasOffset(svgEl),
      pointerClient: { x: st.lastClientX, y: st.lastClientY },
      grabOffsetWorld: st.grabOffsetWorld,
      baseWorld: { x: st.baseX, y: st.baseY },
      schema: schemaRef.current,
      snapToGrid: true,
    })
    node.x = p.x
    node.y = p.y
    if (st.workspaceViewModeAtStart === 'editor') {
      try {
        useGraphStore.getState().updateNode(st.id, { x: p.x, y: p.y })
      } catch {
        void 0
      }
    }
    const tickHandler = sim?.on('tick')
    if (typeof tickHandler === 'function') (tickHandler as () => void)()
    requestOverlaySchedule?.()
  }, [readOverlayInteractionNodeById, requestOverlaySchedule, schemaRef, simulationRef, svgRef])

  const startOverlayPan = useCallback(
    (args0: { pointerId: number; clientX: number; clientY: number }) => {
      if (!activeRef.current) return
      const svgEl = svgRef.current
      const zoom = zoomRef.current
      if (!svgEl || !zoom) return
      try {
        d3.select(svgEl).interrupt()
      } catch {
        void 0
      }
      const st = useGraphStore.getState()
      disableAutoZoomModesForUserGesture(st)
      overlayPanRef.current = {
        pointerId: args0.pointerId,
        startClientX: args0.clientX,
        startClientY: args0.clientY,
        startTransform: d3.zoomTransform(svgEl),
      }
    },
    [activeRef, svgRef, zoomRef],
  )

  const moveOverlayPan = useCallback(
    (args0: { pointerId: number; clientX: number; clientY: number; dx: number; dy: number }) => {
      overlayPanMoveSchedulerRef.current.schedule({ pointerId: args0.pointerId, dx: args0.dx, dy: args0.dy })
      void args0.clientX
      void args0.clientY
    },
    [],
  )

  const endOverlayPan = useCallback((args0: { pointerId: number }) => {
    const drag = overlayPanRef.current
    if (!drag || drag.pointerId !== args0.pointerId) return
    try {
      overlayPanMoveSchedulerRef.current.flush()
    } catch {
      void 0
    }
    overlayPanRef.current = null
  }, [])

  const cancelAllInteractions = useCallback(() => {
    const h = headerDragRef.current
    if (h) {
      try {
        endHeaderDrag()
      } catch {
        try {
          headerDragRef.current = null
          unlockGlobalUserSelect()
        } catch {
          void 0
        }
      }
    }
    const p = overlayPanRef.current
    if (p) {
      try {
        endOverlayPan({ pointerId: p.pointerId })
      } catch {
        try {
          overlayPanRef.current = null
        } catch {
          void 0
        }
      }
    }
  }, [endHeaderDrag, endOverlayPan])

  React.useEffect(() => {
    const onUp = (e: PointerEvent) => {
      const h = headerDragRef.current
      if (h) {
        try {
          endHeaderDrag()
        } catch {
          try {
            headerDragRef.current = null
            unlockGlobalUserSelect()
          } catch {
            void 0
          }
        }
      }
      const p = overlayPanRef.current
      if (p) {
        try {
          endOverlayPan({ pointerId: p.pointerId })
        } catch {
          try {
            overlayPanRef.current = null
          } catch {
            void 0
          }
        }
      }
      void e
    }
    const onBlur = () => {
      const h = headerDragRef.current
      if (h) {
        try {
          endHeaderDrag()
        } catch {
          try {
            headerDragRef.current = null
            unlockGlobalUserSelect()
          } catch {
            void 0
          }
        }
      }
      const p = overlayPanRef.current
      if (p) {
        try {
          endOverlayPan({ pointerId: p.pointerId })
        } catch {
          try {
            overlayPanRef.current = null
          } catch {
            void 0
          }
        }
      }
    }
    window.addEventListener('pointerup', onUp, { capture: true })
    window.addEventListener('pointercancel', onUp, { capture: true })
    window.addEventListener('blur', onBlur)
    const onVisibility = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') onBlur()
      } catch {
        void 0
      }
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    const onAnyPointerDown = () => {
      if (!headerDragRef.current && !overlayPanRef.current) return
      cancelAllInteractions()
    }
    window.addEventListener('pointerdown', onAnyPointerDown, { capture: true })
    const watchdog = window.setTimeout(() => {
      if (!headerDragRef.current && !overlayPanRef.current) return
      cancelAllInteractions()
    }, 12000) as unknown as number
    return () => {
      try {
        cancelAllInteractions()
      } catch {
        void 0
      }
      window.removeEventListener('pointerup', onUp, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('pointercancel', onUp, { capture: true } as AddEventListenerOptions)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onAnyPointerDown, { capture: true } as AddEventListenerOptions)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
      try {
        window.clearTimeout(watchdog)
      } catch {
        void 0
      }
    }
  }, [cancelAllInteractions, endHeaderDrag, endOverlayPan])

  return {
    stopEvent,
    shouldStartHeaderDrag,
    beginHeaderDrag,
    moveHeaderDrag,
    endHeaderDrag,
    startOverlayPan,
    moveOverlayPan,
    endOverlayPan,
  }
}
