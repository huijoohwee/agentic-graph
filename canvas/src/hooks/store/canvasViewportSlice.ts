import type { GraphState } from '@/hooks/store/types'
import type { StoreApi } from 'zustand'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { lsBool, lsFloat, lsInt, lsJson, lsSetBool, lsSetFloat, lsSetInt, lsSetJsonCoalesced } from '@/lib/persistence'
import type { planCanvasSliceStorageMigrations } from './canvasSliceStorageMigrations'
import type { ZoomCommandType, ZoomFitIntent, ZoomRequest, ZoomRequestOptions, ZoomTransformIntent } from '@/lib/zoom/requests'
import { DEFAULT_VIEWPORT_CONTROLS_PRESET } from '@/lib/config.viewport-controls'
import { coerceViewportControlsPreset } from '@/lib/canvas/viewport-controls'
import {
  FLOW_WHEEL_ZOOM_SMOOTH_MAX_DURATION_DEFAULT_MS,
  FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MAX_MS,
  FLOW_WHEEL_ZOOM_SMOOTH_MIN_DURATION_DEFAULT_MS,
  FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MIN_MS,
  FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_DEFAULT,
  FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_MAX,
  FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_MIN,
  FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_DEFAULT,
  FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_MAX,
  FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_MIN,
  clampFlowWheelZoomSmoothDurationMs,
  clampFlowWheelZoomIncrementMultiplier,
  clampFlowWheelZoomSpeedMultiplier,
  coerceFlowWheelZoomSmoothRange,
} from '@/lib/canvas/flow-zoom-tuning'
import {
  CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_DEFAULT,
  CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_MAX,
  CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_MIN,
  clampCanvasWheelZoomCtrlMetaBoostMultiplier,
} from '@/lib/canvas/zoom-input'
import {
  CANVAS_INTERACTION_SPEED_MULTIPLIER_DEFAULT,
  CANVAS_INTERACTION_SPEED_MULTIPLIER_MAX,
  CANVAS_INTERACTION_SPEED_MULTIPLIER_MIN,
  CANVAS_PAN_SPEED_MULTIPLIER_DEFAULT,
  CANVAS_PAN_SPEED_MULTIPLIER_MAX,
  CANVAS_PAN_SPEED_MULTIPLIER_MIN,
  clampCanvasInteractionSpeedMultiplier,
  clampCanvasPanSpeedMultiplier,
} from '@/lib/canvas/camera-options-2d'

/** Owns viewport settings, persisted transforms and zoom request publication. */
export function createCanvasViewportSlice(set: StoreApi<GraphState>['setState'], get: () => GraphState,
  migrationPlan: ReturnType<typeof planCanvasSliceStorageMigrations>) {
  const initialViewportControlsPresetStored = lsJson(
    LS_KEYS.viewportControlsPreset,
    DEFAULT_VIEWPORT_CONTROLS_PRESET,
    v => coerceViewportControlsPreset(v),
  )
  const initialViewportControlsPreset = initialViewportControlsPresetStored
  const initialPinnedStored = lsBool(LS_KEYS.viewportPinned, false)
  const initialFitToScreenStored = lsBool(LS_KEYS.viewportFitToScreen, true)
  const initialZoomToSelectionStored = lsBool(LS_KEYS.viewportZoomToSelection, false)
  const initialZoomModes = (() => {
    if (initialPinnedStored) {
      return { viewPinned: true, fitToScreenMode: false, zoomToSelectionMode: false }
    }
    if (initialZoomToSelectionStored) {
      return { viewPinned: false, fitToScreenMode: false, zoomToSelectionMode: true }
    }
    if (initialFitToScreenStored) {
      return { viewPinned: false, fitToScreenMode: true, zoomToSelectionMode: false }
    }
    return { viewPinned: false, fitToScreenMode: false, zoomToSelectionMode: false }
  })()

  const initialFlowWheelZoomSpeedMultiplier = clampFlowWheelZoomSpeedMultiplier(
    migrationPlan.flowWheelZoomSpeedMultiplier ?? lsFloat(LS_KEYS.flowWheelZoomSpeedMultiplier, FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_DEFAULT, {
      min: FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_MIN,
      max: FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_MAX,
    }),
  )
  const initialFlowWheelZoomIncrementMultiplier = clampFlowWheelZoomIncrementMultiplier(
    lsFloat(LS_KEYS.flowWheelZoomIncrementMultiplier, FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_DEFAULT, {
      min: FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_MIN,
      max: FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_MAX,
    }),
  )
  const initialSmooth = coerceFlowWheelZoomSmoothRange({
    minMs: clampFlowWheelZoomSmoothDurationMs(lsInt(LS_KEYS.flowWheelZoomSmoothMinDurationMs, FLOW_WHEEL_ZOOM_SMOOTH_MIN_DURATION_DEFAULT_MS)),
    maxMs: clampFlowWheelZoomSmoothDurationMs(lsInt(LS_KEYS.flowWheelZoomSmoothMaxDurationMs, FLOW_WHEEL_ZOOM_SMOOTH_MAX_DURATION_DEFAULT_MS)),
  })
  const initialFlowWheelZoomSmoothMinDurationMs = initialSmooth.minMs
  const initialFlowWheelZoomSmoothMaxDurationMs = initialSmooth.maxMs

  const initialZoomDurationFitMs = Math.max(0, Math.min(2000, lsInt(LS_KEYS.zoomDurationFitMs, 300)))
  const initialZoomDurationSelectionMs = Math.max(0, Math.min(2000, lsInt(LS_KEYS.zoomDurationSelectionMs, 300)))
  const initialWheelZoomCtrlMetaBoostMultiplier = clampCanvasWheelZoomCtrlMetaBoostMultiplier(
    migrationPlan.wheelZoomCtrlMetaBoostMultiplier ?? lsFloat(LS_KEYS.wheelZoomCtrlMetaBoostMultiplier, CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_DEFAULT, {
      min: CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_MIN,
      max: CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_MAX,
    }),
  )
  const initialCanvasInteractionSpeedMultiplier = clampCanvasInteractionSpeedMultiplier(
    lsFloat(LS_KEYS.canvasInteractionSpeedMultiplier, CANVAS_INTERACTION_SPEED_MULTIPLIER_DEFAULT, {
      min: CANVAS_INTERACTION_SPEED_MULTIPLIER_MIN,
      max: CANVAS_INTERACTION_SPEED_MULTIPLIER_MAX,
    }),
  )
  const initialCanvasPanSpeedMultiplier = clampCanvasPanSpeedMultiplier(
    lsFloat(LS_KEYS.canvasPanSpeedMultiplier, CANVAS_PAN_SPEED_MULTIPLIER_DEFAULT, {
      min: CANVAS_PAN_SPEED_MULTIPLIER_MIN,
      max: CANVAS_PAN_SPEED_MULTIPLIER_MAX,
    }),
  )

  return {
  canvasDims: { w: 800, h: 600 } as { w: number; h: number },
  canvasPos: { x: 0, y: 0 } as { x: number; y: number },
  setCanvasDims: (d: { w: number; h: number }) => {
    const next = { w: Math.max(1, d.w), h: Math.max(1, d.h) }
    const cur = get().canvasDims
    if (cur.w === next.w && cur.h === next.h) return
    set({ canvasDims: next })
  },
  setCanvasPos: (p: { x: number; y: number }) => {
    const next = { x: Math.max(0, p.x), y: Math.max(0, p.y) }
    const cur = get().canvasPos
    if (cur.x === next.x && cur.y === next.y) return
    set({ canvasPos: next })
  },
  viewPinned: initialZoomModes.viewPinned as boolean,
  setViewPinned: (v: boolean) =>
    set(state => {
      const nextPinned = !!v
      if (nextPinned) {
        lsSetBool(LS_KEYS.viewportPinned, true)
        lsSetBool(LS_KEYS.viewportFitToScreen, false)
        lsSetBool(LS_KEYS.viewportZoomToSelection, false)
        return {
          viewPinned: true,
          fitToScreenMode: false,
          zoomToSelectionMode: false,
          ...(state.zoomRequest?.type === 'selection' && state.zoomRequest.origin === 'selectionMode' ? { zoomRequest: null } : {}),
        }
      }
      lsSetBool(LS_KEYS.viewportPinned, false)
      const z = state.zoomState
      const nextZoomState = z ? { ...z, graphDataRevision: state.graphDataRevision } : z
      return {
        viewPinned: false,
        zoomState: nextZoomState,
        zoomRequest: { type: 'fit', intent: 'fitToView', at: Date.now() },
      }
    }),
  toggleViewPinned: () => {
    const current = get().viewPinned
    get().setViewPinned(!current)
  },
  fitToScreenMode: initialZoomModes.fitToScreenMode as boolean,
  setFitToScreenMode: (v: boolean) =>
    set(state => {
      const next = !!v
      if (!next) {
        if (!state.fitToScreenMode) return {}
        lsSetBool(LS_KEYS.viewportFitToScreen, false)
        return { fitToScreenMode: false }
      }
      lsSetBool(LS_KEYS.viewportPinned, false)
      lsSetBool(LS_KEYS.viewportFitToScreen, true)
      lsSetBool(LS_KEYS.viewportZoomToSelection, false)
      return {
        viewPinned: false,
        fitToScreenMode: true,
        zoomToSelectionMode: false,
        zoomRequest: { type: 'fit', intent: 'fitToScreen', at: Date.now() },
      }
    }),
  toggleFitToScreenMode: () => {
    const current = get().fitToScreenMode
    get().setFitToScreenMode(!current)
  },
  zoomToSelectionMode: initialZoomModes.zoomToSelectionMode as boolean,
  setZoomToSelectionMode: (v: boolean) =>
    set(state => {
      const next = !!v
      if (!next) {
        if (!state.zoomToSelectionMode) return {}
        lsSetBool(LS_KEYS.viewportZoomToSelection, false)
        return { zoomToSelectionMode: false,
          ...(state.zoomRequest?.type === 'selection' && state.zoomRequest.origin === 'selectionMode' ? { zoomRequest: null } : {}),
        }
      }
      lsSetBool(LS_KEYS.viewportPinned, false)
      lsSetBool(LS_KEYS.viewportFitToScreen, false)
      lsSetBool(LS_KEYS.viewportZoomToSelection, true)
      return {
        viewPinned: false,
        zoomToSelectionMode: true,
        fitToScreenMode: false,
        zoomRequest: { type: 'selection', origin: 'selectionMode', at: Date.now() },
      }
    }),
  toggleZoomToSelectionMode: () => {
    const current = get().zoomToSelectionMode
    get().setZoomToSelectionMode(!current)
  },
  zoomRequest: null as ZoomRequest | null,
  requestZoom: (type: ZoomCommandType, opts?: ZoomRequestOptions) =>
    set(state => {
      const isAutoSelection = opts?.origin === 'selectionMode'
      if (isAutoSelection && (type !== 'selection' || state.viewPinned || !state.zoomToSelectionMode)) return {}
      const isAutoFit = type === 'fit' && (opts?.intent || 'fitToView') === 'fitToScreen'
      const shouldDisableAutoModes = !state.viewPinned && !isAutoFit && !isAutoSelection && (type === 'in' || type === 'out' || type === 'reset' || type === 'selection' || type === 'fit')
      const modePatch = (() => {
        if (!shouldDisableAutoModes) return {}
        if (!state.fitToScreenMode && !state.zoomToSelectionMode) return {}
        try {
          lsSetBool(LS_KEYS.viewportFitToScreen, false)
          lsSetBool(LS_KEYS.viewportZoomToSelection, false)
        } catch {
          void 0
        }
        return { fitToScreenMode: false, zoomToSelectionMode: false }
      })()
      if (type === 'fit') {
        const intent: ZoomFitIntent = opts?.intent || 'fitToView'
        return { ...modePatch, zoomRequest: { type: 'fit', intent, at: Date.now() } }
      }
      return { ...modePatch, zoomRequest: { type, ...(isAutoSelection ? { origin: 'selectionMode' } : {}), at: Date.now() } as ZoomRequest }
    }),
  requestZoomTransform: (payload: { k: number; x: number; y: number }, opts?: { intent?: ZoomTransformIntent }) =>
    set({ zoomRequest: { type: 'transform', at: Date.now(), payload, intent: opts?.intent } }),
  requestZoomBounds: (payload: { bounds: { x: number; y: number; w: number; h: number }; insetPx?: number; origin?: { x: number; y: number } }) =>
    set({ zoomRequest: { type: 'bounds', at: Date.now(), payload } }),
  clearZoomRequest: () => set({ zoomRequest: null }),

  zoomState: null as null | { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number },
  setZoomState: (z: { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }) => set({ zoomState: z }),
  zoomStateByKey: {} as Record<string, { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number }>,
  setZoomStateForKey: (
    key: string,
    z: { k: number; x: number; y: number; graphDataRevision?: number; viewportW?: number; viewportH?: number } | null,
  ) =>
    set(state => {
      const k = String(key || '')
      if (!k) return {}
      if (!z) {
        if (!state.zoomStateByKey[k]) return {}
        const next = { ...state.zoomStateByKey }
        delete next[k]
        return { zoomStateByKey: next }
      }
      const prev = state.zoomStateByKey[k]
      if (prev && prev.k === z.k && prev.x === z.x && prev.y === z.y && prev.graphDataRevision === z.graphDataRevision && prev.viewportW === z.viewportW && prev.viewportH === z.viewportH) {
        return {}
      }
      return { zoomStateByKey: { ...state.zoomStateByKey, [k]: z } }
    }),
  threeCameraRequest: null as null | { type: 'in' | 'out' | 'fit' | 'reset' | 'selection'; at: number },
  requestThreeCamera: (type: 'in' | 'out' | 'fit' | 'reset' | 'selection') =>
    set({ threeCameraRequest: { type, at: Date.now() } }),
  clearThreeCameraRequest: () => set({ threeCameraRequest: null }),
  viewportControlsPreset: initialViewportControlsPreset,
  flowWheelZoomSpeedMultiplier: initialFlowWheelZoomSpeedMultiplier,
  flowWheelZoomIncrementMultiplier: initialFlowWheelZoomIncrementMultiplier,
  flowWheelZoomSmoothMinDurationMs: initialFlowWheelZoomSmoothMinDurationMs,
  flowWheelZoomSmoothMaxDurationMs: initialFlowWheelZoomSmoothMaxDurationMs,
  zoomDurationFitMs: initialZoomDurationFitMs,
  zoomDurationSelectionMs: initialZoomDurationSelectionMs,
  wheelZoomCtrlMetaBoostMultiplier: initialWheelZoomCtrlMetaBoostMultiplier,
  canvasInteractionSpeedMultiplier: initialCanvasInteractionSpeedMultiplier,
  canvasPanSpeedMultiplier: initialCanvasPanSpeedMultiplier,
  setViewportControlsPreset: (preset) => {
    const next = coerceViewportControlsPreset(preset)
    const cur = get().viewportControlsPreset
    if (cur === next) return
    lsSetJsonCoalesced(LS_KEYS.viewportControlsPreset, next, { signature: String(next) })
    set({ viewportControlsPreset: next })
  },
  setFlowWheelZoomSpeedMultiplier: (v: number) => {
    const next = clampFlowWheelZoomSpeedMultiplier(
      lsSetFloat(LS_KEYS.flowWheelZoomSpeedMultiplier, Number(v), {
        min: FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_MIN,
        max: FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_MAX,
      }),
    )
    const cur = get().flowWheelZoomSpeedMultiplier
    if (cur === next) return
    set({ flowWheelZoomSpeedMultiplier: next })
  },
  setFlowWheelZoomIncrementMultiplier: (v: number) => {
    const next = clampFlowWheelZoomIncrementMultiplier(
      lsSetFloat(LS_KEYS.flowWheelZoomIncrementMultiplier, Number(v), {
        min: FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_MIN,
        max: FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_MAX,
      }),
    )
    const cur = get().flowWheelZoomIncrementMultiplier
    if (cur === next) return
    set({ flowWheelZoomIncrementMultiplier: next })
  },
  setFlowWheelZoomSmoothMinDurationMs: (v: number) => {
    const curMax = get().flowWheelZoomSmoothMaxDurationMs
    const nextMin = clampFlowWheelZoomSmoothDurationMs(
      lsSetInt(LS_KEYS.flowWheelZoomSmoothMinDurationMs, Number(v), {
        min: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MIN_MS,
        max: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MAX_MS,
      }),
    )
    const clampedMin = Math.min(nextMin, curMax)
    if (clampedMin !== nextMin) {
      lsSetInt(LS_KEYS.flowWheelZoomSmoothMinDurationMs, clampedMin, {
        min: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MIN_MS,
        max: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MAX_MS,
      })
    }
    const curMin = get().flowWheelZoomSmoothMinDurationMs
    if (curMin === clampedMin) return
    set({ flowWheelZoomSmoothMinDurationMs: clampedMin })
  },
  setFlowWheelZoomSmoothMaxDurationMs: (v: number) => {
    const curMin = get().flowWheelZoomSmoothMinDurationMs
    const nextMax = clampFlowWheelZoomSmoothDurationMs(
      lsSetInt(LS_KEYS.flowWheelZoomSmoothMaxDurationMs, Number(v), {
        min: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MIN_MS,
        max: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MAX_MS,
      }),
    )
    const clampedMax = Math.max(nextMax, curMin)
    if (clampedMax !== nextMax) {
      lsSetInt(LS_KEYS.flowWheelZoomSmoothMaxDurationMs, clampedMax, {
        min: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MIN_MS,
        max: FLOW_WHEEL_ZOOM_SMOOTH_DURATION_MAX_MS,
      })
    }
    const curMax = get().flowWheelZoomSmoothMaxDurationMs
    if (curMax === clampedMax) return
    set({ flowWheelZoomSmoothMaxDurationMs: clampedMax })
  },
  setZoomDurationFitMs: (v: number) => {
    const next = lsSetInt(LS_KEYS.zoomDurationFitMs, Number(v), { min: 0, max: 2000 })
    const cur = get().zoomDurationFitMs
    if (cur === next) return
    set({ zoomDurationFitMs: next })
  },
  setZoomDurationSelectionMs: (v: number) => {
    const next = lsSetInt(LS_KEYS.zoomDurationSelectionMs, Number(v), { min: 0, max: 2000 })
    const cur = get().zoomDurationSelectionMs
    if (cur === next) return
    set({ zoomDurationSelectionMs: next })
  },
  setWheelZoomCtrlMetaBoostMultiplier: (v: number) => {
    const next = clampCanvasWheelZoomCtrlMetaBoostMultiplier(
      lsSetFloat(LS_KEYS.wheelZoomCtrlMetaBoostMultiplier, Number(v), {
        min: CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_MIN,
        max: CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_MAX,
      }),
    )
    const cur = get().wheelZoomCtrlMetaBoostMultiplier
    if (cur === next) return
    set({ wheelZoomCtrlMetaBoostMultiplier: next })
  },
  setCanvasInteractionSpeedMultiplier: (v: number) => {
    const next = clampCanvasInteractionSpeedMultiplier(
      lsSetFloat(LS_KEYS.canvasInteractionSpeedMultiplier, Number(v), {
        min: CANVAS_INTERACTION_SPEED_MULTIPLIER_MIN,
        max: CANVAS_INTERACTION_SPEED_MULTIPLIER_MAX,
      }),
    )
    const cur = get().canvasInteractionSpeedMultiplier
    if (cur === next) return
    set({ canvasInteractionSpeedMultiplier: next })
  },
  setCanvasPanSpeedMultiplier: (v: number) => {
    const next = clampCanvasPanSpeedMultiplier(
      lsSetFloat(LS_KEYS.canvasPanSpeedMultiplier, Number(v), {
        min: CANVAS_PAN_SPEED_MULTIPLIER_MIN,
        max: CANVAS_PAN_SPEED_MULTIPLIER_MAX,
      }),
    )
    const cur = get().canvasPanSpeedMultiplier
    if (cur === next) return
    set({ canvasPanSpeedMultiplier: next })
  },
  }
}
