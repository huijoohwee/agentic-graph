import { useGraphStore } from '@/hooks/useGraphStore'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { readCanvasLocalPoint } from '@/lib/canvas/canvas-event-coords'
import {
  shouldAllowPanDragForPointerEvent,
  shouldStartSelectionDragForPreset,
} from '@/lib/canvas/viewport-controls'
import { cancelFlowZoomRequestAnim } from '@/components/FlowCanvas/applyZoomRequestNative'
import {
  CANVAS_OVERLAY_DRAG_HANDLE_SELECTOR,
  CANVAS_OVERLAY_PROXY_ROOT_SELECTOR,
  CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR,
  RICH_MEDIA_LOCAL_INTERACTION_SELECTOR,
  RICH_MEDIA_OVERLAY_ROOT_SELECTOR,
  readStoryboardWidgetElementSurfaceId,
  readCanvasOverlayPinnedState,
  isCanvasOverlayPanOwnedByCanvas,
  resolveStoryboardWidgetOverlayProxyTarget,
  shouldUseCanvasOverlayBodyPan,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import {
  isStoryboardWidgetSurfaceRenderer,
  readStoryboardWidgetScreenAuthorityPanSnapshot,
  shouldUseStoryboardWidgetScreenAuthorityCollectivePan,
  type StoryboardWidgetScreenAuthorityPanSnapshot,
} from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import { UI_SELECTORS } from '@/lib/config'
import { __flowCanvasDebug, syncFlowCanvasDebugWindow } from '@/components/FlowCanvas/flowCanvasDebug'
import { readFlowPanInteractionSpeed } from '@/components/FlowCanvas/interactions/dragSession'

import type { FlowNativeInteractionsContext } from '@/components/FlowCanvas/interactions/context'

const FLOATING_PANEL_PROXY_EXCLUDE_SELECTOR = '[data-kg-floating-panel-root="true"], [data-agentic-base-floating-panel="true"]'

export function bindFlowNativeInteractionListeners(args: {
  ctx: FlowNativeInteractionsContext
  handlers: {
    onWheel: (e: WheelEvent) => void
    onPointerDown: (e: PointerEvent) => void
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
    onContextMenu: (e: MouseEvent) => void
    onWindowWheelCapture: (e: WheelEvent) => void
    onWindowGestureStartCapture: (e: Event) => void
    onWindowGestureChangeCapture: (e: Event) => void
    onWindowGestureEndCapture: (e: Event) => void
  }
  cancelPendingDragRelax: () => void
}) {
  const ctx = args.ctx
  const canvasEl = ctx.canvasEl
  const runtime = ctx.runtime

  let proxyPanPointerId: number | null = null
  let pendingProxyPan:
    | null
    | {
        pointerId: number
        startClientX: number
        startClientY: number
        startSx: number
        startSy: number
        startTx: number
        startTy: number
        interactionSpeed: number
        useStoryboardWidgetScreenAuthorityPan: boolean
        storyboardWidgetScreenAuthorityPan: StoryboardWidgetScreenAuthorityPanSnapshot | null
      } = null

  const spacePanProxyTargetSelector = [CANVAS_OVERLAY_PROXY_ROOT_SELECTOR, UI_SELECTORS.canvasWheelIgnore, UI_SELECTORS.canvasPointerIgnore]
    .filter(Boolean)
    .join(', ')

  const lastHandledPointerMoveKeyById = new Map<number, string>()
  const lastHandledPointerUpKeyById = new Map<number, string>()
  const shouldSkipDuplicatePointerEvent = (map: Map<number, string>, e: PointerEvent): boolean => {
    const id = typeof e.pointerId === 'number' ? e.pointerId : -1
    if (id < 0) return false
    const cx = typeof e.clientX === 'number' && Number.isFinite(e.clientX) ? e.clientX : 0
    const cy = typeof e.clientY === 'number' && Number.isFinite(e.clientY) ? e.clientY : 0
    const buttons = typeof e.buttons === 'number' && Number.isFinite(e.buttons) ? e.buttons : -1
    const button = typeof e.button === 'number' && Number.isFinite(e.button) ? e.button : -1
    const key = `${e.type}|${cx}|${cy}|${buttons}|${button}`
    const prev = map.get(id)
    if (prev != null && prev === key) return true
    map.set(id, key)
    return false
  }

  const handlePointerMoveOnce = (e: PointerEvent) => {
    if (shouldSkipDuplicatePointerEvent(lastHandledPointerMoveKeyById, e)) return
    args.handlers.onPointerMove(e)
  }

  const handlePointerUpOnce = (e: PointerEvent) => {
    if (shouldSkipDuplicatePointerEvent(lastHandledPointerUpKeyById, e)) return
    args.handlers.onPointerUp(e)
  }

  const onWindowPointerDownCapture = (e: PointerEvent) => {
    if (!ctx.args.active) return
    const st = useGraphStore.getState()
    const storyboardWidgetOverlayInteractionMode =
      isStoryboardWidgetSurfaceRenderer(st.canvas2dRenderer) && shouldUseStoryboardWidgetScreenAuthorityCollectivePan(st)
    if (!storyboardWidgetOverlayInteractionMode) return
    if (e.pointerType === 'touch') return
    if (proxyPanPointerId != null) return
    if (pendingProxyPan != null) return
    if (ctx.args.dragRef.current) return

    const targetEl = e.target instanceof Element ? e.target : null
    if (!targetEl) return
    if (targetEl.closest(FLOATING_PANEL_PROXY_EXCLUDE_SELECTOR)) return
    if (canvasEl.contains(targetEl)) return
    if (!spacePanProxyTargetSelector || !targetEl.closest(spacePanProxyTargetSelector)) return

    const preset = ctx.getPreset()
    const storeStateAtDown = st
    const panInteractionSpeed = readFlowPanInteractionSpeed(storeStateAtDown)
    const readProxyPanScreenAuthority = (): {
      useStoryboardWidgetScreenAuthorityPan: boolean
      storyboardWidgetScreenAuthorityPan: StoryboardWidgetScreenAuthorityPanSnapshot | null
    } => {
      const useStoryboardWidgetScreenAuthorityPan = shouldUseStoryboardWidgetScreenAuthorityCollectivePan(storeStateAtDown)
      return {
        useStoryboardWidgetScreenAuthorityPan,
        storyboardWidgetScreenAuthorityPan: useStoryboardWidgetScreenAuthorityPan
          ? readStoryboardWidgetScreenAuthorityPanSnapshot({
            storyboardWidgetSurfaceId: ctx.args.storyboardWidgetSurfaceId || readStoryboardWidgetElementSurfaceId(canvasEl),
            transform: runtime.transform,
          })
          : null,
      }
    }
    const button = typeof e.button === 'number' ? e.button : 0
    const shiftKey = e.shiftKey === true
    const spacePanHeld = isSpacePanHeld()
    const pointerMode2d = String(storeStateAtDown.canvasPointerMode2d || '')
    const pointerModePan = pointerMode2d === 'pan'
    const allowPan = shouldAllowPanDragForPointerEvent({
      preset,
      eventType: 'pointerdown',
      button,
      shiftKey,
      spacePanHeld,
      pointerMode2d,
    })
    const selectionDrag = pointerModePan ? false : shouldStartSelectionDragForPreset({
      preset,
      button,
      shiftKey,
      spacePanHeld,
      selectionOnDrag: ctx.args.selectionOnDrag,
    })

    const resolved = resolveStoryboardWidgetOverlayProxyTarget({
      target: targetEl,
      canvasEl,
      storyboardWidgetSurfaceId: ctx.args.storyboardWidgetSurfaceId,
    })
    if (
      resolved.kind === 'overlay'
      && spacePanHeld !== true
      && resolved.targetEl.closest(RICH_MEDIA_LOCAL_INTERACTION_SELECTOR)
    ) return
    const overlayPinnedToNode = resolved.kind === 'overlay' && readCanvasOverlayPinnedState(resolved.overlayRoot)
    const overlayResizeHandle =
      resolved.kind === 'overlay' && resolved.targetEl.closest(CANVAS_OVERLAY_RESIZE_HANDLE_SELECTOR)

    const overlayDragHandle = resolved.kind === 'overlay' && resolved.targetEl.closest(CANVAS_OVERLAY_DRAG_HANDLE_SELECTOR)

    const overlayRootIsRichMedia =
      resolved.kind === 'overlay'
      && (typeof resolved.overlayRoot.matches === 'function')
      && resolved.overlayRoot.matches(RICH_MEDIA_OVERLAY_ROOT_SELECTOR)
    const overlayPanOwnerCanvas =
      resolved.kind === 'overlay'
      && isCanvasOverlayPanOwnedByCanvas(resolved.overlayRoot)
    const overlayBodyViewportPan =
      resolved.kind === 'overlay'
      && button === 0
      && spacePanHeld !== true
      && e.altKey !== true
      && shouldUseCanvasOverlayBodyPan({ target: resolved.targetEl, overlayRoot: resolved.overlayRoot })
    const overlayViewportPanIntent = allowPan || overlayBodyViewportPan
    const overlaySelectionDrag = overlayBodyViewportPan ? false : selectionDrag

    try {
      const overlaySurfaceId =
        resolved.kind === 'overlay'
          ? String(resolved.overlayRoot.dataset.kgStoryboardWidgetSurface || '').trim()
          : ''
      __flowCanvasDebug.lastOverlayProxyPointerDown = [
        `kind=${resolved.kind}`,
        `activeSurface=${String(ctx.args.storyboardWidgetSurfaceId || '').trim() || '-'}`,
        `overlaySurface=${overlaySurfaceId || '-'}`,
        `pinned=${overlayPinnedToNode ? 1 : 0}`,
        `dragHandle=${overlayDragHandle ? 1 : 0}`,
        `resizeHandle=${overlayResizeHandle ? 1 : 0}`,
        `richMedia=${overlayRootIsRichMedia ? 1 : 0}`,
        `bodyPan=${overlayBodyViewportPan ? 1 : 0}`,
        `button=${button}`,
        `space=${spacePanHeld ? 1 : 0}`,
      ].join('|')
      syncFlowCanvasDebugWindow()
    } catch {
      void 0
    }

    // Resize handles are always local owner interactions. Never let window-capture proxy steal them.
    if (overlayResizeHandle) return

    if (overlayBodyViewportPan && storyboardWidgetOverlayInteractionMode && !overlayPanOwnerCanvas) return

    if (resolved.kind === 'overlay' && !overlayPinnedToNode && overlayDragHandle && button === 0 && spacePanHeld !== true) return
    if (resolved.kind === 'overlay' && resolved.isInteractive && !overlayBodyViewportPan && button === 0 && spacePanHeld !== true && !overlayDragHandle) return
    if (resolved.kind === 'overlay' && !overlayPinnedToNode && button === 0 && spacePanHeld !== true && (overlayViewportPanIntent !== true || overlaySelectionDrag === true)) return

    if (resolved.kind === 'overlay' && overlayPinnedToNode && button === 0 && spacePanHeld !== true && e.altKey !== true && overlayDragHandle) {
      if (overlayRootIsRichMedia) return
      ctx.viewportWheelController.destroy()
      cancelFlowZoomRequestAnim(runtime)
      try {
        disableAutoZoomModesForUserGesture(storeStateAtDown)
      } catch {
        void 0
      }

      const local = readCanvasLocalPoint({ canvasEl, event: e })
      if (!local) return
      ctx.args.lastPointerInCanvasRef.current = { sx: local.sx, sy: local.sy, ts: Date.now() }
      pendingProxyPan = {
        pointerId: e.pointerId,
        startClientX: Number.isFinite(e.clientX) ? e.clientX : 0,
        startClientY: Number.isFinite(e.clientY) ? e.clientY : 0,
        startSx: local.sx,
        startSy: local.sy,
        startTx: runtime.transform.x,
        startTy: runtime.transform.y,
        interactionSpeed: panInteractionSpeed,
        ...readProxyPanScreenAuthority(),
      }
      return
    }

    if (resolved.kind === 'overlay' && overlayPinnedToNode && button === 0 && spacePanHeld !== true && e.altKey !== true) {
      if (!overlayViewportPanIntent || overlaySelectionDrag) return

      ctx.viewportWheelController.destroy()
      cancelFlowZoomRequestAnim(runtime)
      try {
        disableAutoZoomModesForUserGesture(storeStateAtDown)
      } catch {
        void 0
      }

      const local = readCanvasLocalPoint({ canvasEl, event: e })
      if (!local) return
      ctx.args.lastPointerInCanvasRef.current = { sx: local.sx, sy: local.sy, ts: Date.now() }
      pendingProxyPan = {
        pointerId: e.pointerId,
        startClientX: Number.isFinite(e.clientX) ? e.clientX : 0,
        startClientY: Number.isFinite(e.clientY) ? e.clientY : 0,
        startSx: local.sx,
        startSy: local.sy,
        startTx: runtime.transform.x,
        startTy: runtime.transform.y,
        interactionSpeed: panInteractionSpeed,
        ...readProxyPanScreenAuthority(),
      }
      return
    }

    if (!overlayViewportPanIntent || overlaySelectionDrag) return
    if (resolved.kind === 'overlay' && resolved.isInteractive && !overlayBodyViewportPan && button === 0 && spacePanHeld !== true) return

    ctx.viewportWheelController.destroy()
    cancelFlowZoomRequestAnim(runtime)
    try {
      disableAutoZoomModesForUserGesture(storeStateAtDown)
    } catch {
      void 0
    }

    const local = readCanvasLocalPoint({ canvasEl, event: e })
    if (!local) return
    ctx.args.lastPointerInCanvasRef.current = { sx: local.sx, sy: local.sy, ts: Date.now() }
    pendingProxyPan = {
      pointerId: e.pointerId,
      startClientX: Number.isFinite(e.clientX) ? e.clientX : 0,
      startClientY: Number.isFinite(e.clientY) ? e.clientY : 0,
      startSx: local.sx,
      startSy: local.sy,
      startTx: runtime.transform.x,
      startTy: runtime.transform.y,
      interactionSpeed: panInteractionSpeed,
      ...readProxyPanScreenAuthority(),
    }
  }

  const onWindowPointerMoveCapture = (e: PointerEvent) => {
    if (!ctx.args.active) return
    if (proxyPanPointerId == null && pendingProxyPan == null) {
      const drag = ctx.args.dragRef.current
      if (drag) {
        const pointerIds = drag.type === 'pinch' ? [drag.pointerIdA, drag.pointerIdB] : [drag.pointerId]
        if (pointerIds.includes(e.pointerId)) {
          try {
            if (canvasEl.hasPointerCapture(e.pointerId) !== true) {
              handlePointerMoveOnce(e)
              try {
                e.preventDefault()
              } catch {
                void 0
              }
            }
          } catch {
            handlePointerMoveOnce(e)
            try {
              e.preventDefault()
            } catch {
              void 0
            }
          }
        }
      }
    }
    if (proxyPanPointerId != null) {
      if (e.pointerId !== proxyPanPointerId) return
      handlePointerMoveOnce(e)
      return
    }
    const pending = pendingProxyPan
    if (!pending) return
    if (e.pointerId !== pending.pointerId) return
    if (typeof e.buttons === 'number' && e.buttons === 0) {
      pendingProxyPan = null
      return
    }
    const cx = Number.isFinite(e.clientX) ? e.clientX : 0
    const cy = Number.isFinite(e.clientY) ? e.clientY : 0
    const dx = cx - pending.startClientX
    const dy = cy - pending.startClientY
    if (dx * dx + dy * dy < 9) return

    pendingProxyPan = null
    lockGlobalUserSelect()
    ctx.args.userSelectLockPointerIdRef.current = pending.pointerId
    ctx.args.dragRef.current = {
      type: 'pan',
      startSx: pending.startSx,
      startSy: pending.startSy,
      startTx: pending.startTx,
      startTy: pending.startTy,
      interactionSpeed: pending.interactionSpeed,
      pointerId: pending.pointerId,
      useStoryboardWidgetScreenAuthorityPan: pending.useStoryboardWidgetScreenAuthorityPan,
      storyboardWidgetScreenAuthorityPan: pending.storyboardWidgetScreenAuthorityPan,
    }
    proxyPanPointerId = pending.pointerId
    try {
      canvasEl.setPointerCapture(pending.pointerId)
    } catch {
      void 0
    }
    handlePointerMoveOnce(e)
    try {
      e.preventDefault()
    } catch {
      void 0
    }
  }

  const onWindowPointerUpCapture = (e: PointerEvent) => {
    if (!ctx.args.active) return
    if (pendingProxyPan && e.pointerId === pendingProxyPan.pointerId) {
      pendingProxyPan = null
    }
    if (proxyPanPointerId != null && e.pointerId === proxyPanPointerId) {
      proxyPanPointerId = null
      handlePointerUpOnce(e)
      return
    }

    const drag = ctx.args.dragRef.current
    if (!drag) return
    if (drag.type === 'pinch') {
      if (e.pointerId !== drag.pointerIdA && e.pointerId !== drag.pointerIdB) return
    } else {
      if (e.pointerId !== drag.pointerId) return
    }
    handlePointerUpOnce(e)
  }

  const onLostPointerCapture = (e: PointerEvent) => {
    if (pendingProxyPan && e.pointerId === pendingProxyPan.pointerId) {
      pendingProxyPan = null
    }
    if (proxyPanPointerId != null && e.pointerId === proxyPanPointerId) {
      proxyPanPointerId = null
    }
    if (ctx.args.userSelectLockPointerIdRef.current === e.pointerId) {
      ctx.args.userSelectLockPointerIdRef.current = null
      unlockGlobalUserSelect()
    }
    const drag = ctx.args.dragRef.current
    if (!drag) return

    if (drag.type === 'pinch') {
      if (e.pointerType === 'touch') {
        ctx.touchPointsById.delete(e.pointerId)
      }
      if (e.pointerId !== drag.pointerIdA && e.pointerId !== drag.pointerIdB) return
      ctx.args.dragRef.current = null
      ctx.edgeScroll.reset()
      ctx.args.setSelectionBox(null)
      ctx.args.requestCommit()
      return
    }

    if (drag.pointerId !== e.pointerId) return
    ctx.args.dragRef.current = null
    ctx.edgeScroll.reset()
    if (drag.type === 'lasso') {
      ctx.args.setSelectionBox(null)
    }
    ctx.args.requestCommit()
  }

  canvasEl.addEventListener('wheel', args.handlers.onWheel, { passive: false })
  canvasEl.addEventListener('pointerdown', args.handlers.onPointerDown, { passive: false })
  canvasEl.addEventListener('pointermove', args.handlers.onPointerMove, { passive: false })
  canvasEl.addEventListener('pointerup', args.handlers.onPointerUp, { passive: false })
  canvasEl.addEventListener('pointercancel', args.handlers.onPointerUp, { passive: false })
  canvasEl.addEventListener('lostpointercapture', onLostPointerCapture, { passive: false })
  canvasEl.addEventListener('contextmenu', args.handlers.onContextMenu, { passive: false })

  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', onWindowPointerDownCapture, { passive: false, capture: true })
    window.addEventListener('pointermove', onWindowPointerMoveCapture, { passive: false, capture: true })
    window.addEventListener('pointerup', onWindowPointerUpCapture, { passive: false, capture: true })
    window.addEventListener('pointercancel', onWindowPointerUpCapture, { passive: false, capture: true })
    window.addEventListener('wheel', args.handlers.onWindowWheelCapture, { passive: false, capture: true })
    window.addEventListener('gesturestart', args.handlers.onWindowGestureStartCapture, { passive: false, capture: true })
    window.addEventListener('gesturechange', args.handlers.onWindowGestureChangeCapture, { passive: false, capture: true })
    window.addEventListener('gestureend', args.handlers.onWindowGestureEndCapture, { passive: false, capture: true })
  }

  return () => {
    pendingProxyPan = null
    proxyPanPointerId = null
    if (ctx.args.userSelectLockPointerIdRef.current != null) {
      try {
        const pointerId = ctx.args.userSelectLockPointerIdRef.current
        if (canvasEl.hasPointerCapture(pointerId)) {
          canvasEl.releasePointerCapture(pointerId)
        }
      } catch {
        void 0
      }
      ctx.args.userSelectLockPointerIdRef.current = null
      unlockGlobalUserSelect()
    }

    {
      const drag = ctx.args.dragRef.current
      if (drag) {
        const pointerIds = drag.type === 'pinch' ? [drag.pointerIdA, drag.pointerIdB, drag.pointerId] : [drag.pointerId]
        const unique = Array.from(new Set(pointerIds.filter(v => typeof v === 'number' && Number.isFinite(v))))
        for (let i = 0; i < unique.length; i += 1) {
          const pointerId = unique[i]
          try {
            if (canvasEl.hasPointerCapture(pointerId)) {
              canvasEl.releasePointerCapture(pointerId)
            }
          } catch {
            void 0
          }
        }
        ctx.args.dragRef.current = null
        ctx.touchPointsById.clear()
        ctx.edgeScroll.reset()
      }
    }

    ctx.args.setSelectionBox(null)
    ctx.viewportWheelController.destroy()
    args.cancelPendingDragRelax()

    canvasEl.removeEventListener('wheel', args.handlers.onWheel)
    canvasEl.removeEventListener('pointerdown', args.handlers.onPointerDown)
    canvasEl.removeEventListener('pointermove', args.handlers.onPointerMove)
    canvasEl.removeEventListener('pointerup', args.handlers.onPointerUp)
    canvasEl.removeEventListener('pointercancel', args.handlers.onPointerUp)
    canvasEl.removeEventListener('lostpointercapture', onLostPointerCapture)
    canvasEl.removeEventListener('contextmenu', args.handlers.onContextMenu)

    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', onWindowPointerDownCapture, true)
      window.removeEventListener('pointermove', onWindowPointerMoveCapture, true)
      window.removeEventListener('pointerup', onWindowPointerUpCapture, true)
      window.removeEventListener('pointercancel', onWindowPointerUpCapture, true)
      window.removeEventListener('wheel', args.handlers.onWindowWheelCapture, true)
      window.removeEventListener('gesturestart', args.handlers.onWindowGestureStartCapture, true)
      window.removeEventListener('gesturechange', args.handlers.onWindowGestureChangeCapture, true)
      window.removeEventListener('gestureend', args.handlers.onWindowGestureEndCapture, true)
    }
  }
}
