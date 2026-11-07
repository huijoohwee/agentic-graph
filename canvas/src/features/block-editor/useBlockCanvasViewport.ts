import * as React from 'react'
import { zoomIdentity, type ZoomTransform } from 'd3'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useContainerDims } from '@/hooks/useContainerDims'
import { defaultSchema } from '@/lib/graph/schema'
import { readZoomScaleExtent } from '@/lib/graph/layoutDefaults'
import { createInfiniteCanvasViewportController } from '@/lib/canvas/infinite-canvas-engine'
import { readElementLocalPoint } from '@/lib/canvas/canvas-event-coords'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { clampScale, computeAnchoredZoomTransform } from '@/lib/canvas/viewport-transform'

const initialTransform = () => zoomIdentity.translate(16, 16)
const controlTarget = (target: EventTarget | null) => target instanceof Element
  && !!target.closest('button, input, textarea, select, a, [contenteditable="true"]')

/** Embedded adapter for the same engine used by the native graph and storyboard canvases. */
export function useBlockCanvasViewport(documentId: string) {
  const viewportRef = React.useRef<HTMLElement | null>(null)
  const [element, setElement] = React.useState<HTMLElement | null>(null)
  const setViewport = React.useCallback((next: HTMLElement | null) => { viewportRef.current = next; setElement(next) }, [])
  const resolveMeasureElement = React.useCallback(() => element, [element])
  const dims = useContainerDims(viewportRef, { resolveMeasureElement })
  const transformRef = React.useRef(initialTransform())
  const [transform, setTransform] = React.useState(transformRef.current)
  const apply = React.useCallback((next: ZoomTransform) => { transformRef.current = next; setTransform(next) }, [])
  const reset = React.useCallback(() => apply(initialTransform()), [apply])
  React.useEffect(reset, [documentId, reset])
  const getTransform = React.useCallback(() => transformRef.current, [])
  const getEventTarget = React.useCallback(() => viewportRef.current, [])
  React.useEffect(() => {
    if (!element) return
    const state = useGraphStore.getState
    let anchor: { sx: number; sy: number; ts: number } | null = null
    let pointerType = ''
    const controller = createInfiniteCanvasViewportController({
      active: () => element.isConnected,
      adapter: { getTransform, setTransform: apply },
      getSchema: () => state().schema || defaultSchema,
      getPreset: () => state().viewportControlsPreset,
      getPointerMode2d: () => 'pan',
      getWheelZoomCtrlMetaBoostMultiplier: () => state().wheelZoomCtrlMetaBoostMultiplier,
      getCanvasPanSpeedMultiplier: () => state().canvasPanSpeedMultiplier,
      getCanvasInteractionSpeedMultiplier: () => state().canvasInteractionSpeedMultiplier,
      getFlowWheelZoomSpeedMultiplier: () => state().flowWheelZoomSpeedMultiplier,
      getFlowWheelZoomIncrementMultiplier: () => state().flowWheelZoomIncrementMultiplier,
      getFlowWheelZoomSmoothDuration: () => ({ minMs: state().flowWheelZoomSmoothMinDurationMs, maxMs: state().flowWheelZoomSmoothMaxDurationMs }),
      isSpacePanHeld,
      shouldIgnorePointerTarget: target => controlTarget(target) || (pointerType !== 'touch' && !isSpacePanHeld() && target instanceof Element && !!target.closest('[role="treeitem"]')),
      shouldIgnoreWheelEvent: event => controlTarget(event.target),
      lockUserSelect: lockGlobalUserSelect,
      unlockUserSelect: unlockGlobalUserSelect,
      disableAutoZoomModes: () => undefined, // Embedded view never changes the main Canvas camera or preferences.
      readLocalPoint: event => readElementLocalPoint({ el: element, event }),
      getBoundingRect: () => element.getBoundingClientRect(),
      getWheelAnchorFallback: () => anchor,
      setWheelAnchorFallback: next => { anchor = next },
      pointerCapture: {
        setPointerCapture: id => element.setPointerCapture(id),
        releasePointerCapture: id => element.releasePointerCapture(id),
        hasPointerCapture: id => element.hasPointerCapture(id),
      },
    })
    const handlers: Record<string, EventListener> = {
      wheel: event => { if (controller.handleWheel(event as WheelEvent)) event.stopPropagation() },
      pointerdown: event => { pointerType = (event as PointerEvent).pointerType; if (controller.handlePointerDown(event as PointerEvent)) event.stopPropagation() },
      pointermove: event => { if (controller.handlePointerMove(event as PointerEvent)) event.stopPropagation() },
      pointerup: event => { if (controller.handlePointerUp(event as PointerEvent)) event.stopPropagation() },
      pointercancel: event => controller.handlePointerCancel(event as PointerEvent),
      lostpointercapture: event => controller.handleLostPointerCapture(event as PointerEvent),
      contextmenu: event => controller.handleContextMenu(event as MouseEvent),
      mousedown: event => controller.handleMouseDown(event as MouseEvent),
    }
    for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler, { passive: false })
    return () => { controller.destroy(); for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler) }
  }, [element, apply, getTransform])
  const zoomBy = (factor: number) => {
    const [minK, maxK] = readZoomScaleExtent(useGraphStore.getState().schema || defaultSchema)
    apply(computeAnchoredZoomTransform({ transform: transformRef.current, anchor: { sx: dims.width / 2, sy: dims.height / 2 }, nextK: clampScale(transformRef.current.k * factor, { minK, maxK }) }))
  }
  const reveal = (node?: HTMLElement) => {
    if (!node || !element) return
    node.focus({ preventScroll: true })
    const box = (node.querySelector('.kg-block-heading') || node).getBoundingClientRect(), viewport = element.getBoundingClientRect()
    const dx = box.width > viewport.width - 16 || box.left < viewport.left + 8 ? viewport.left + 8 - box.left : box.right > viewport.right - 8 ? viewport.right - 8 - box.right : 0
    const dy = box.top < viewport.top + 8 ? viewport.top + 8 - box.top : box.bottom > viewport.bottom - 40 ? viewport.bottom - 40 - box.bottom : 0
    if (dx || dy) { const t = transformRef.current; apply(zoomIdentity.translate(t.x + dx, t.y + dy).scale(t.k)) }
  }
  return { setViewport, dims, transform, getTransform, getEventTarget, zoomBy, reset, reveal }
}
