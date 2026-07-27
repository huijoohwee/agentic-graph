import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '@/lib/graph/types';
import { GraphSchema } from '@/lib/graph/schema';
import { readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig';
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readSnapGridConfigFromSchema, snapPointToGrid } from '@/lib/canvas/gridSnap'
import { DEFAULT_DRAG_ALPHA_TARGET } from '@/lib/graph/layoutDefaults'
import { DEFAULT_DRAG_ALPHA_TARGET_HARD_CAP } from '@/lib/graph/layoutDefaults'
import { markGraphCanvasUserInteracted } from '@/components/GraphCanvas/userInteractionFlag'
import { cancelPendingRefreeze, scheduleSimulationRefreezeAfterDrag } from '@/components/GraphCanvas/dragRefreeze'
import { beginDragForceTuning } from '@/components/GraphCanvas/dragForceTuning'
import { readCanvasDragIntentThresholdPx } from '@/lib/canvas/dragIntent'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { buildCanonicalNodeLookup, getCanonicalNodeLookupValue } from '@/lib/graph/canonicalNodeIds'

export const nodeDragBehavior = (
  simulation: d3.Simulation<GraphNode, GraphEdge>,
  schema: GraphSchema,
  opts?: {
    onNodeDragEnd?: (node: GraphNode) => void
    clampNodePosition?: (args: {
      node: GraphNode
      x: number
      y: number
      disableSnap: boolean
    }) => { x: number; y: number }
  },
) =>
  (() => {
    let locked = false
    let shouldRefreeze = false
    let refreezeSvg: SVGSVGElement | null = null
    let endForceTune: null | (() => void) = null
    const readDragAlphaTarget = () => {
      try {
        const v = useGraphStore.getState().graphDragAlphaTarget2d
        return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(0.6, v)) : DEFAULT_DRAG_ALPHA_TARGET
      } catch {
        return DEFAULT_DRAG_ALPHA_TARGET
      }
    }
    const isFrozenFromEl = (el: SVGElement | null): boolean => {
      const svg = el?.ownerSVGElement
      return svg?.getAttribute('data-kg-layout-frozen') === '1'
    }
    let activeNode: GraphNode | null = null
    let watchdogTimer = 0
    let lastDragAtMs = 0
    let dragThresholdPx = 0
    let dragActivated = false
    let dragStartClientX = Number.NaN
    let dragStartClientY = Number.NaN

    const readNodeDragSlopPx = (pointerType: unknown): number => {
      return readCanvasDragIntentThresholdPx(pointerType)
    }

    const clearWatchdog = () => {
      if (!watchdogTimer) return
      try {
        window.clearInterval(watchdogTimer)
      } catch {
        void 0
      }
      watchdogTimer = 0
    }

    const resetDragState = () => {
      clearWatchdog()
      if (locked) {
        locked = false
        unlockGlobalUserSelect()
      }
      if (endForceTune) {
        try { endForceTune() } catch { void 0 }
        endForceTune = null
      }
      if (activeNode) {
        const mode = readLayoutMode(schema)
        const structured = mode === 'radial'
        if (dragActivated && !structured) {
          simulation.alphaTarget(0)
          activeNode.fx = null
          activeNode.fy = null
        }
        if (dragActivated) {
          activeNode.vx = 0
          activeNode.vy = 0

          try {
            opts?.onNodeDragEnd?.(activeNode)
          } catch {
            void 0
          }
        }

        if (dragActivated && structured) simulation.stop()
        activeNode = null
      }

      if (shouldRefreeze) {
        const svg = refreezeSvg
        scheduleSimulationRefreezeAfterDrag({ simulation, svgEl: svg })
      }
      shouldRefreeze = false
      refreezeSvg = null
      dragThresholdPx = 0
      dragActivated = false
      dragStartClientX = Number.NaN
      dragStartClientY = Number.NaN
    }

    const onGlobalRelease = () => {
      if (activeNode) resetDragState()
    }

    const activateDrag = (event: d3.D3DragEvent<SVGElement, GraphNode, GraphNode>, d: GraphNode, el: SVGElement) => {
      if (dragActivated) return
      dragActivated = true

      const mode = readLayoutMode(schema)
      const structured = mode === 'radial'
      const svgEl = el.ownerSVGElement
      cancelPendingRefreeze(svgEl as unknown as SVGSVGElement | null)
      markGraphCanvasUserInteracted(svgEl)
      const frozenAtStart = isFrozenFromEl(el)
      shouldRefreeze = !structured && frozenAtStart
      refreezeSvg = shouldRefreeze ? (svgEl as unknown as SVGSVGElement | null) : null
      if (shouldRefreeze) {
        try {
          svgEl?.setAttribute('data-kg-layout-frozen', '0')
        } catch {
          void 0
        }
        try {
          simulation.on('end.kgFreeze', null)
        } catch {
          void 0
        }
      }

      if (!structured && !event.active) {
        endForceTune = beginDragForceTuning(simulation)
        const alpha = Math.min(readDragAlphaTarget(), DEFAULT_DRAG_ALPHA_TARGET_HARD_CAP)
        simulation.alphaTarget(alpha).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    }

    return d3.drag<SVGElement, GraphNode>()
    .on('start', function (event, d) {
      if (useGraphStore.getState().canvasPointerMode2d === 'pan') return
      if (isSpacePanHeld()) return
      lockGlobalUserSelect()
      locked = true
      activeNode = d
      lastDragAtMs = Date.now()

      try {
        const src = event && typeof event === 'object' && 'sourceEvent' in event ? (event as { sourceEvent?: unknown }).sourceEvent : null
        const srcRecord = src && typeof src === 'object' ? (src as Record<string, unknown>) : null
        dragThresholdPx = readNodeDragSlopPx(srcRecord?.pointerType)
        dragStartClientX = typeof srcRecord?.clientX === 'number' ? srcRecord.clientX : Number.NaN
        dragStartClientY = typeof srcRecord?.clientY === 'number' ? srcRecord.clientY : Number.NaN
        const pe = src instanceof PointerEvent ? src : null
        if (pe && typeof pe.pointerId === 'number') {
          const svgEl = (this as unknown as SVGElement).ownerSVGElement
          svgEl?.setPointerCapture?.(pe.pointerId)
        }
      } catch {
        void 0
      }
      
      clearWatchdog()
      watchdogTimer = window.setInterval(() => {
        if (!activeNode) return
        if (Date.now() - lastDragAtMs > 12_000) {
          onGlobalRelease()
          return
        }
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          onGlobalRelease()
        }
      }, 1000)

      if (typeof window !== 'undefined') {
        window.addEventListener('pointerup', onGlobalRelease, { capture: true, once: true })
        window.addEventListener('pointercancel', onGlobalRelease, { capture: true, once: true })
        window.addEventListener('pointerdown', onGlobalRelease, { capture: true, once: true })
      }

      if (!(dragThresholdPx > 0)) activateDrag(event, d, this as unknown as SVGElement)
    })
    .on('drag', function (event, d) {
      if (useGraphStore.getState().canvasPointerMode2d === 'pan') return
      if (isSpacePanHeld()) return
      lastDragAtMs = Date.now()
      if (!dragActivated && dragThresholdPx > 0) {
        const src = event && typeof event === 'object' && 'sourceEvent' in event ? (event as { sourceEvent?: unknown }).sourceEvent : null
        const srcRecord = src && typeof src === 'object' ? (src as Record<string, unknown>) : null
        const clientX = typeof srcRecord?.clientX === 'number' ? srcRecord.clientX : Number.NaN
        const clientY = typeof srcRecord?.clientY === 'number' ? srcRecord.clientY : Number.NaN
        if (Number.isFinite(clientX) && Number.isFinite(clientY) && Number.isFinite(dragStartClientX) && Number.isFinite(dragStartClientY)) {
          const distancePx = Math.hypot(clientX - dragStartClientX, clientY - dragStartClientY)
          if (!(distancePx >= dragThresholdPx)) return
        }
        activateDrag(event, d, this as unknown as SVGElement)
      } else if (!dragActivated) {
        activateDrag(event, d, this as unknown as SVGElement)
      }
      const mode = readLayoutMode(schema)
      const structured = mode === 'radial'
      const grid = readSnapGridConfigFromSchema(schema)
      const src = event && typeof event === 'object' && 'sourceEvent' in event ? (event as { sourceEvent?: unknown }).sourceEvent : null
      const altDown = !!(src && typeof src === 'object' && 'altKey' in (src as Record<string, unknown>) && (src as { altKey?: unknown }).altKey)
      
      // Calculate new position
      let nx = event.x;
      let ny = event.y;
      
      if (grid.enabled && !altDown) {
        const snapped = snapPointToGrid({ x: nx, y: ny }, grid)
        nx = snapped.x
        ny = snapped.y
      }

      if (opts?.clampNodePosition) {
        try {
          const clamped = opts.clampNodePosition({ node: d, x: nx, y: ny, disableSnap: altDown })
          nx = clamped.x
          ny = clamped.y
        } catch {
          void 0
        }
      }
      
      const constraint = schema.behavior.dragConstraint || 'free';
      if (constraint === 'axis-x') {
        d.fx = nx;
        if (structured) d.x = nx;
      } else if (constraint === 'axis-y') {
        d.fy = ny;
        if (structured) d.y = ny;
      } else if (constraint === 'none') {
        d.fx = d.x; // Keep original if 'none' constraint, though usually 'free' is default
        d.fy = d.y;
      } else {
        d.fx = nx;
        d.fy = ny;
        if (structured) {
          d.x = nx;
          d.y = ny;
        }
      }

      if (structured) {
        const tickHandler = simulation.on('tick')
        if (typeof tickHandler === 'function') {
          ;(tickHandler as unknown as () => void)()
        }
      }
    })
    .on('end', (event, d) => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointerup', onGlobalRelease, { capture: true })
        window.removeEventListener('pointercancel', onGlobalRelease, { capture: true })
        window.removeEventListener('pointerdown', onGlobalRelease, { capture: true })
      }
      if (locked) {
        locked = false
        unlockGlobalUserSelect()
      }
      if (activeNode) resetDragState()
    });
  })()

export const edgeDragBehavior = (
  simulation: d3.Simulation<GraphNode, GraphEdge>,
  schema: GraphSchema,
  nodeById?: ReadonlyMap<string, GraphNode> | null,
) =>
  (() => {
    const canonicalNodeLookup = nodeById && nodeById.size > 0 ? buildCanonicalNodeLookup(nodeById.entries()) : null
    let locked = false
    let sourceNode: GraphNode | undefined
    let targetNode: GraphNode | undefined
    let shouldRefreeze = false
    let refreezeSvg: SVGSVGElement | null = null
    let dragZoomK = 1
    let endForceTune: null | (() => void) = null

    const readDragAlphaTarget = () => {
      try {
        const v = useGraphStore.getState().graphDragAlphaTarget2d
        return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(0.6, v)) : DEFAULT_DRAG_ALPHA_TARGET
      } catch {
        return DEFAULT_DRAG_ALPHA_TARGET
      }
    }

    const isFrozenFromEl = (el: SVGElement | null): boolean => {
      const svg = el?.ownerSVGElement
      return svg?.getAttribute('data-kg-layout-frozen') === '1'
    }

    let activeEdge: GraphEdge | null = null
    let watchdogTimer = 0
    let lastDragAtMs = 0

    const clearWatchdog = () => {
      if (!watchdogTimer) return
      try {
        window.clearInterval(watchdogTimer)
      } catch {
        void 0
      }
      watchdogTimer = 0
    }

    const resetDragState = () => {
      clearWatchdog()
      if (locked) {
        locked = false
        unlockGlobalUserSelect()
      }
      if (endForceTune) {
        try { endForceTune() } catch { void 0 }
        endForceTune = null
      }
      if (sourceNode && targetNode) {
        const mode = readLayoutMode(schema)
        const structured = mode === 'radial'
        if (!structured) {
          simulation.alphaTarget(0)
          sourceNode.fx = null
          sourceNode.fy = null
          targetNode.fx = null
          targetNode.fy = null
        }
        sourceNode.vx = 0
        sourceNode.vy = 0
        targetNode.vx = 0
        targetNode.vy = 0
        if (structured) simulation.stop()
      }
      sourceNode = undefined
      targetNode = undefined
      activeEdge = null

      if (shouldRefreeze) {
        const svg = refreezeSvg
        scheduleSimulationRefreezeAfterDrag({ simulation, svgEl: svg })
      }
      shouldRefreeze = false
      refreezeSvg = null
    }

    const onGlobalRelease = () => {
      if (activeEdge) resetDragState()
    }

    return d3.drag<SVGElement, GraphEdge>()
      .on('start', function (event, d) {
        if (useGraphStore.getState().canvasPointerMode2d === 'pan') return
        if (isSpacePanHeld()) return
        lockGlobalUserSelect()
        locked = true
        activeEdge = d
        lastDragAtMs = Date.now()

        try {
          const src = event && typeof event === 'object' && 'sourceEvent' in event ? (event as { sourceEvent?: unknown }).sourceEvent : null
          const pe = src instanceof PointerEvent ? src : null
          if (pe && typeof pe.pointerId === 'number') {
            const svgEl = (this as unknown as SVGElement).ownerSVGElement
            svgEl?.setPointerCapture?.(pe.pointerId)
          }
        } catch {
          void 0
        }
        
        clearWatchdog()
        watchdogTimer = window.setInterval(() => {
          if (!activeEdge) return
          if (Date.now() - lastDragAtMs > 12_000) {
            onGlobalRelease()
            return
          }
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            onGlobalRelease()
          }
        }, 1000)

        if (typeof window !== 'undefined') {
          window.addEventListener('pointerup', onGlobalRelease, { capture: true, once: true })
          window.addEventListener('pointercancel', onGlobalRelease, { capture: true, once: true })
          window.addEventListener('pointerdown', onGlobalRelease, { capture: true, once: true })
        }

        // Reuse the caller-owned display lookup instead of rescanning live simulation nodes.
        const { src: sId, tgt: tId } = readGraphEdgeEndpoints(d)
        sourceNode = sId ? getCanonicalNodeLookupValue(canonicalNodeLookup, sId) || undefined : undefined
        targetNode = tId ? getCanonicalNodeLookupValue(canonicalNodeLookup, tId) || undefined : undefined
        
        if (!sourceNode || !targetNode) return

        const mode = readLayoutMode(schema)
        const structured = mode === 'radial'
        const svgEl = (this as unknown as SVGElement).ownerSVGElement
        dragZoomK = 1
        try {
          const k = d3.zoomTransform(svgEl as unknown as SVGSVGElement).k
          dragZoomK = typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : 1
        } catch {
          dragZoomK = 1
        }
        cancelPendingRefreeze(svgEl as unknown as SVGSVGElement | null)
        markGraphCanvasUserInteracted(svgEl)
        const frozenAtStart = isFrozenFromEl(this as unknown as SVGElement)
        shouldRefreeze = !structured && frozenAtStart
        refreezeSvg = shouldRefreeze ? (svgEl as unknown as SVGSVGElement | null) : null
        if (shouldRefreeze) {
          try {
            svgEl?.setAttribute('data-kg-layout-frozen', '0')
          } catch {
            void 0
          }
          try {
            simulation.on('end.kgFreeze', null)
          } catch {
            void 0
          }
        }

        if (!structured && !event.active) {
          endForceTune = beginDragForceTuning(simulation)
          const alpha = Math.min(readDragAlphaTarget(), DEFAULT_DRAG_ALPHA_TARGET_HARD_CAP)
          simulation.alphaTarget(alpha).restart();
        }
        
        // Fix nodes
        sourceNode.fx = sourceNode.x
        sourceNode.fy = sourceNode.y
        targetNode.fx = targetNode.x
        targetNode.fy = targetNode.y
      })
      .on('drag', (event) => {
        if (useGraphStore.getState().canvasPointerMode2d === 'pan') return
        if (isSpacePanHeld()) return
        if (!sourceNode || !targetNode) return
        lastDragAtMs = Date.now()

        const dx = event.dx / dragZoomK
        const dy = event.dy / dragZoomK
        
        // Move both nodes
        if (sourceNode.fx != null) sourceNode.fx += dx
        if (sourceNode.fy != null) sourceNode.fy += dy
        if (targetNode.fx != null) targetNode.fx += dx
        if (targetNode.fy != null) targetNode.fy += dy
        
        const mode = readLayoutMode(schema)
        const structured = mode === 'radial'
        
        if (structured) {
             if (sourceNode.x != null) sourceNode.x += dx
             if (sourceNode.y != null) sourceNode.y += dy
             if (targetNode.x != null) targetNode.x += dx
             if (targetNode.y != null) targetNode.y += dy
        
            const tickHandler = simulation.on('tick')
            if (typeof tickHandler === 'function') {
              ;(tickHandler as unknown as () => void)()
            }
        }
      })
      .on('end', (event) => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointerup', onGlobalRelease, { capture: true })
          window.removeEventListener('pointercancel', onGlobalRelease, { capture: true })
          window.removeEventListener('pointerdown', onGlobalRelease, { capture: true })
        }
        if (activeEdge) resetDragState()
      })
  })()
