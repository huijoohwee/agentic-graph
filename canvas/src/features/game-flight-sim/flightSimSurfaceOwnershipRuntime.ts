import { useGraphStore } from '@/hooks/useGraphStore'
import { runCanvasSurfaceOwnershipTransaction } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'
import {
  importGympgrph,
  setGeospatialModeEnabled,
} from '@/features/geospatial/gympgrphBridge'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'
import {
  pauseXrPhysicsRuntime,
  playXrPhysicsRuntime,
  readXrPhysicsRuntime,
} from '@/features/three/xrPhysicsRuntime'
import {
  pauseXrNativeControllerDemo,
  readXrNativeControllerDemo,
  resumeXrNativeControllerDemo,
} from '@/features/three/xrNativeControllerDemoRuntime'
import { isXrGameplaySurfaceView } from '@/features/three/xrSceneSurfaceRuntime'

type GraphStoreState = ReturnType<typeof useGraphStore.getState>

export type FlightSimPreviousCanvasSurface = Readonly<
  Pick<
    GraphStoreState,
    | 'canvasRenderMode'
    | 'canvas3dMode'
    | 'canvasRenderModeLastFree'
    | 'canvasRenderModeIsAuto'
    | 'floatingPanelOpen'
    | 'floatingPanelView'
  > & {
    geospatialModeEnabled: boolean
  }
>

export type FlightSimAuthoredRuntimeOwnership = Readonly<{
  nativeControllerWasRunning: boolean
  physicsWasPlaying: boolean
  timelineWasPlaying: boolean
}>

export function captureFlightSimPreviousCanvasSurface(): FlightSimPreviousCanvasSurface {
  const state = useGraphStore.getState()
  return Object.freeze({
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: isXrGameplaySurfaceView(state.floatingPanelView)
      ? 'motionControl'
      : state.floatingPanelView,
    geospatialModeEnabled: readGeospatialOverlayEnabledPreference(),
  })
}

export function captureFlightSimAuthoredRuntimeOwnership(): FlightSimAuthoredRuntimeOwnership {
  return Object.freeze({
    nativeControllerWasRunning:
      readXrNativeControllerDemo().phase === 'running',
    physicsWasPlaying: readXrPhysicsRuntime().phase === 'playing',
    timelineWasPlaying: useGraphStore.getState().timelineTransportPlaying === true,
  })
}

export function suspendFlightSimAuthoredRuntime(): void {
  if (readXrNativeControllerDemo().phase === 'running') {
    pauseXrNativeControllerDemo()
  }
  pauseXrPhysicsRuntime()
  useGraphStore.getState().setTimelineTransportState({ playing: false })
}

export function restoreFlightSimAuthoredRuntime(
  ownership: FlightSimAuthoredRuntimeOwnership | null,
): void {
  if (!ownership) return
  if (ownership.physicsWasPlaying) playXrPhysicsRuntime()
  else pauseXrPhysicsRuntime()
  useGraphStore.getState().setTimelineTransportState({
    playing: ownership.timelineWasPlaying,
  })
  if (ownership.nativeControllerWasRunning) {
    resumeXrNativeControllerDemo()
  }
}

export function restoreFlightSimPreviousCanvasSurface(
  previous: FlightSimPreviousCanvasSurface,
): Promise<string | null> {
  runCanvasSurfaceOwnershipTransaction(() => {
    const state = useGraphStore.getState()
    state.setCanvas3dMode(previous.canvas3dMode)
    state.setCanvasRenderMode(previous.canvasRenderMode)
    state.setFloatingPanelView(previous.floatingPanelView)
    state.setFloatingPanelOpen(previous.floatingPanelOpen)
    useGraphStore.setState({
      canvasRenderModeLastFree: previous.canvasRenderModeLastFree,
      canvasRenderModeIsAuto: previous.canvasRenderModeIsAuto,
    })
  })
  return restoreFlightSimGeospatialSurface(previous.geospatialModeEnabled)
}

// Cold Geo+XR entry can finish loading MapLibre immediately before rollback.
// Keep disposal bounded below the stage deadline while allowing that lazy owner
// to unmount and release its lease before the one permitted retry.
export const FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS = 2_000
const FLIGHT_SIM_SURFACE_STABLE_FRAME_COUNT = 2

function flightSimSurfaceRestorationError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || 'Flight Sim surface restoration failed.')
}

function waitForFlightSimSurfaceFrame(deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      reject(new Error('MapLibre did not release the restored non-Geo Canvas surface.'))
      return
    }
    let settled = false
    let frameId = 0
    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      if (frameId !== 0) window.cancelAnimationFrame(frameId)
      reject(new Error('MapLibre did not release the restored non-Geo Canvas surface.'))
    }, remainingMs)
    frameId = window.requestAnimationFrame(() => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve()
    })
  })
}

async function waitForFlightSimGeospatialDisposal(
  ownedLease: Readonly<{ isCurrent: () => boolean }> | null,
  ownedCanvas: HTMLCanvasElement | null,
): Promise<void> {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) return
  const deadline = Date.now() + FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS
  let stableFrames = 0
  while (Date.now() <= deadline) {
    await waitForFlightSimSurfaceFrame(deadline)
    const mapReleased = ownedLease == null || !ownedLease.isCurrent()
    const ownedCanvasReleased = ownedCanvas == null || !ownedCanvas.isConnected
    const geoCanvasReleased = document.querySelector(
      '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
    ) == null
    if (mapReleased && ownedCanvasReleased && geoCanvasReleased) {
      stableFrames += 1
      if (stableFrames >= FLIGHT_SIM_SURFACE_STABLE_FRAME_COUNT) return
    } else {
      stableFrames = 0
    }
  }
  throw new Error('MapLibre did not release the restored non-Geo Canvas surface.')
}

async function restoreFlightSimGeospatialSurface(
  enabled: boolean,
): Promise<string | null> {
  try {
    const gympgrph = await importGympgrph()
    const ownedLease =
      gympgrph.captureNativeGeospatialMapLibreLease?.() ?? null
    const ownedCanvas = ownedLease?.canvas ?? (
      typeof document === 'undefined'
        ? null
        : document.querySelector<HTMLCanvasElement>(
            '[data-kg-geo-xr-layer="geo-background"] canvas.maplibregl-canvas',
          )
    )
    const restored = await setGeospatialModeEnabled(enabled)
    if (restored !== enabled) {
      throw new Error(`Geo mode restored ${String(restored)} instead of ${String(enabled)}.`)
    }
    const ownedCanvasElement = (
      ownedCanvas
      && typeof ownedCanvas === 'object'
      && 'isConnected' in ownedCanvas
    )
      ? ownedCanvas as HTMLCanvasElement
      : null
    if (!enabled) {
      await waitForFlightSimGeospatialDisposal(
        ownedLease,
        ownedCanvasElement,
      )
    }
    return null
  } catch (error) {
    return flightSimSurfaceRestorationError(error)
  }
}
