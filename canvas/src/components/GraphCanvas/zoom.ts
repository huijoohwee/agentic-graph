import * as d3 from 'd3'
import type React from 'react'

import type { GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { ViewportControlsPreset } from '@/lib/config.viewport-controls'

import { shouldIgnoreCanvasWheelEvent } from '@/lib/canvas/wheel-target-guard'
import { UI_SELECTORS } from '@/lib/config'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isNodePointerTarget } from '@/features/canvas/utils'
import { readElementLocalPoint } from '@/lib/canvas/canvas-event-coords'
import { createInfiniteCanvasViewportController } from '@/lib/canvas/infinite-canvas-engine'
import { createGraphZoomPresentationApplier } from '@/components/GraphCanvas/zoom/presentation'
import { readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import { mergeScaleExtentWithCurrent } from '@/lib/zoom/scaleExtent'
import { coerceWheelFallback, resolveWheelAnchor } from '@/lib/canvas/wheel-anchor'
import { computeWheelZoomFactor, computeZoomWheelDeltaYpx } from '@/lib/canvas/zoom-input'
import { computeFlowWheelZoomDurationMs } from '@/lib/canvas/zoom-smoothing'
import { readWheelBehavior, shouldWheelZoom } from '@/lib/canvas/camera-options-2d'
import { createSafariGestureZoomController } from '@/lib/canvas/safari-gesture-zoom'

export const createZoom = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  labelsSelRef: React.MutableRefObject<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>,
  schema: GraphSchema,
  viewportControlsPreset: ViewportControlsPreset,
  onZoomTransform?: (t: { k: number; x: number; y: number }) => void,
  onLabelLodVisibilityChange?: (hidden: boolean) => void,
  isActive?: () => boolean,
  isolateDocumentState = false,
) => {
  const __kgWheelZoomSsot = (deltaYpx: number, increment: number, rect: DOMRect) => {
    const nowMs = Date.now()
    const fallback = coerceWheelFallback({ fallback: null, nowMs, maxAgeMs: 800 })
    const anchor = resolveWheelAnchor({ rect, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, fallback })
    const factor = computeWheelZoomFactor(deltaYpx * increment)
    const durationMs = computeFlowWheelZoomDurationMs({ deltaYpxAbs: Math.abs(deltaYpx), minMs: 0, maxMs: 0 })
    void computeZoomWheelDeltaYpx
    return { anchor, factor, durationMs }
  }
  const __kgWheelPresetSsot = (e: WheelEvent) => {
    const wheelBehavior = readWheelBehavior(schema)
    return shouldWheelZoom({ event: e, preset: viewportControlsPreset, wheelBehavior })
  }
  void __kgWheelZoomSsot
  void __kgWheelPresetSsot

  const [schemaMinK, schemaMaxK] = readZoomScaleExtent(schema)
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .filter(() => false)
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
      presentation(event.transform as d3.ZoomTransform)
      if (onZoomTransform) {
        const t = event.transform as d3.ZoomTransform
        onZoomTransform({ k: t.k ?? 1, x: t.x ?? 0, y: t.y ?? 0 })
      }
    })

  let scaleExtent = mergeScaleExtentWithCurrent({ schemaMinK, schemaMaxK })
  zoom.scaleExtent([scaleExtent.minK, scaleExtent.maxK])

  svg.call(zoom)

  const syncScaleExtent = (schemaNow: GraphSchema) => {
    const [nextSchemaMinK, nextSchemaMaxK] = readZoomScaleExtent(schemaNow)
    const [curMinK, curMaxK] = zoom.scaleExtent()
    const next = mergeScaleExtentWithCurrent({ schemaMinK: nextSchemaMinK, schemaMaxK: nextSchemaMaxK, curMinK, curMaxK })
    if (next.minK !== curMinK || next.maxK !== curMaxK) zoom.scaleExtent([next.minK, next.maxK])
    scaleExtent = next
  }

  const presentation = createGraphZoomPresentationApplier({
    g,
    labelsSelRef,
    schema,
    onLabelLodVisibilityChange,
  })

  const svgEl = svg.node()
  if (svgEl) {
    let wheelAnchorFallback: { sx: number; sy: number; ts: number } | null = null
    const active = typeof isActive === 'function' ? isActive : () => true
    const any = svgEl as unknown as {
      __kgViewportControllerDestroy?: (() => void) | null
      __kgWindowGestureDestroy?: (() => void) | null
    }
    if (typeof any.__kgViewportControllerDestroy === 'function') {
      try {
        any.__kgViewportControllerDestroy()
      } catch {
        void 0
      }
    }
    if (typeof any.__kgWindowGestureDestroy === 'function') {
      try {
        any.__kgWindowGestureDestroy()
      } catch {
        void 0
      }
    }
    const ignoreSelector = [UI_SELECTORS.canvasWheelIgnore, UI_SELECTORS.canvasPointerIgnore].filter(Boolean).join(', ')
    const shouldIgnorePointerTarget = (target: EventTarget | null): boolean => {
      const el = target instanceof Element ? target : null
      if (!ignoreSelector || !el) return false
      return el.closest(ignoreSelector) != null
    }

    const controller = createInfiniteCanvasViewportController({
      active,
      adapter: {
        getTransform: () => d3.zoomTransform(svgEl),
        setTransform: (t) => {
          try {
            svg.interrupt()
          } catch {
            void 0
          }
          syncScaleExtent(useGraphStore.getState().schema || schema)
          svg.call(zoom.transform as never, t)
        },
      },
      getSchema: () => useGraphStore.getState().schema || schema,
      getPreset: () => (useGraphStore.getState().viewportControlsPreset || viewportControlsPreset) as ViewportControlsPreset,
      getPointerMode2d: () => (useGraphStore.getState().canvasPointerMode2d === 'pan' ? 'pan' : 'select'),
      getWheelZoomCtrlMetaBoostMultiplier: () => useGraphStore.getState().wheelZoomCtrlMetaBoostMultiplier,
      getCanvasPanSpeedMultiplier: () => useGraphStore.getState().canvasPanSpeedMultiplier,
      getCanvasInteractionSpeedMultiplier: () => useGraphStore.getState().canvasInteractionSpeedMultiplier,
      getFlowWheelZoomSpeedMultiplier: () => useGraphStore.getState().flowWheelZoomSpeedMultiplier,
      getFlowWheelZoomIncrementMultiplier: () => useGraphStore.getState().flowWheelZoomIncrementMultiplier,
      getFlowWheelZoomSmoothDuration: () => ({
        minMs: useGraphStore.getState().flowWheelZoomSmoothMinDurationMs,
        maxMs: useGraphStore.getState().flowWheelZoomSmoothMaxDurationMs,
      }),
      isSpacePanHeld: () => isSpacePanHeld(),
      shouldIgnorePointerTarget,
      shouldIgnoreWheelEvent: (e) => shouldIgnoreCanvasWheelEvent({ event: e, ignoreSelector: UI_SELECTORS.canvasWheelIgnore }),
      getWheelAnchorFallback: () => wheelAnchorFallback,
      setWheelAnchorFallback: (p) => {
        wheelAnchorFallback = p
      },
      shouldBlockPanStart: (e) => {
        const targetEl = e.target instanceof Element ? e.target : null
        return e.button === 0 && useGraphStore.getState().canvasPointerMode2d !== 'pan' && isSpacePanHeld() !== true && isNodePointerTarget(targetEl)
      },
      lockUserSelect: () => lockGlobalUserSelect(),
      unlockUserSelect: () => unlockGlobalUserSelect(),
      disableAutoZoomModes: () => { if (!isolateDocumentState) disableAutoZoomModesForUserGesture(useGraphStore.getState()) },
      readLocalPoint: (e) => readElementLocalPoint({ el: svgEl, event: e }),
      getBoundingRect: () => svgEl.getBoundingClientRect(),
      pointerCapture: {
        setPointerCapture: (id) => svgEl.setPointerCapture(id),
        releasePointerCapture: (id) => svgEl.releasePointerCapture(id),
        hasPointerCapture: (id) => svgEl.hasPointerCapture(id),
      },
    })

    any.__kgViewportControllerDestroy = controller.destroy
    svg.on('wheel.kgInfiniteViewport', (event: unknown) => {
      controller.handleWheel(event as WheelEvent)
    })
    svg.on('pointerdown.kgInfiniteViewport', (event: unknown) => {
      controller.handlePointerDown(event as PointerEvent)
    })
    svg.on('pointermove.kgInfiniteViewport', (event: unknown) => {
      controller.handlePointerMove(event as PointerEvent)
    })
    svg.on('pointerup.kgInfiniteViewport', (event: unknown) => {
      controller.handlePointerUp(event as PointerEvent)
    })
    svg.on('pointercancel.kgInfiniteViewport', (event: unknown) => {
      controller.handlePointerCancel(event as PointerEvent)
    })
    svg.on('lostpointercapture.kgInfiniteViewport', (event: unknown) => {
      controller.handleLostPointerCapture(event as PointerEvent)
    })
    svg.on('contextmenu.kgInfiniteViewport', (event: unknown) => {
      controller.handleContextMenu(event as MouseEvent)
    })
    svg.on('mousedown.kgInfiniteViewport', (event: unknown) => {
      const e = event as MouseEvent
      if (active() && !shouldIgnorePointerTarget(e.target)) {
        try {
          e.preventDefault()
        } catch {
          void 0
        }
      }
      controller.handleMouseDown(e)
    })

    const gestureZoom = createSafariGestureZoomController({
      active,
      adapter: {
        getTransform: () => d3.zoomTransform(svgEl),
        setTransform: (t) => {
          const schemaNow = useGraphStore.getState().schema || schema
          syncScaleExtent(schemaNow)
          svg.call(zoom.transform as never, t)
        },
      },
      getSchema: () => useGraphStore.getState().schema || schema,
      computeScaleExtent: ({ currentK }) => ({ minK: scaleExtent.minK, maxK: scaleExtent.maxK }),
      disableAutoZoomModes: () => { if (!isolateDocumentState) disableAutoZoomModesForUserGesture(useGraphStore.getState()) },
      onGestureStart: () => controller.destroy(),
      readLocalPoint: (e) => readElementLocalPoint({ el: svgEl, event: e }),
      getBoundingRect: () => svgEl.getBoundingClientRect(),
    })

    const windowGestureDestroy = (() => {
      if (typeof window === 'undefined') return null
      const withinRect = (event: Event): boolean => {
        const cx = (event as unknown as { clientX?: unknown }).clientX
        const cy = (event as unknown as { clientY?: unknown }).clientY
        if (typeof cx !== 'number' || !Number.isFinite(cx) || typeof cy !== 'number' || !Number.isFinite(cy)) return false
        const rect = svgEl.getBoundingClientRect()
        if (!rect || rect.width <= 1 || rect.height <= 1) return false
        return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom
      }

      const onStart = (event: Event) => {
        if (!active()) return
        if (!withinRect(event)) return
        gestureZoom.handleGestureStart(event)
      }
      const onChange = (event: Event) => {
        if (!active()) return
        if (!withinRect(event)) return
        gestureZoom.handleGestureChange(event)
      }
      const onEnd = (event: Event) => {
        if (!active()) return
        gestureZoom.handleGestureEnd(event)
      }
      const onCancel = (event: Event) => {
        if (!active()) return
        gestureZoom.handleGestureCancel(event)
      }

      window.addEventListener('gesturestart', onStart as EventListener, { passive: false, capture: true })
      window.addEventListener('gesturechange', onChange as EventListener, { passive: false, capture: true })
      window.addEventListener('gestureend', onEnd as EventListener, { passive: false, capture: true })
      window.addEventListener('gesturecancel', onCancel as EventListener, { passive: false, capture: true })

      return () => {
        try {
          window.removeEventListener('gesturestart', onStart as EventListener, true)
          window.removeEventListener('gesturechange', onChange as EventListener, true)
          window.removeEventListener('gestureend', onEnd as EventListener, true)
          window.removeEventListener('gesturecancel', onCancel as EventListener, true)
        } catch {
          void 0
        }
      }
    })()

    any.__kgWindowGestureDestroy = windowGestureDestroy

    svg.on('gesturestart.kgGestureZoom', (event: unknown) => {
      gestureZoom.handleGestureStart(event as Event)
    })
    svg.on('gesturechange.kgGestureZoom', (event: unknown) => {
      gestureZoom.handleGestureChange(event as Event)
    })
    svg.on('gestureend.kgGestureZoom', (event: unknown) => {
      gestureZoom.handleGestureEnd(event as Event)
    })
    svg.on('gesturecancel.kgGestureZoom', (event: unknown) => {
      gestureZoom.handleGestureCancel(event as Event)
    })
  }

  return zoom
}
