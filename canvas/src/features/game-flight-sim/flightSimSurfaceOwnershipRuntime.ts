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
    physicsWasPlaying: readXrPhysicsRuntime().phase === 'playing',
    timelineWasPlaying: useGraphStore.getState().timelineTransportPlaying === true,
  })
}

export function suspendFlightSimAuthoredRuntime(): void {
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

const FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS = 1_000
const FLIGHT_SIM_SURFACE_STABLE_FRAME_COUNT = 2

function flightSimSurfaceRestorationError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || 'Flight Sim surface restoration failed.')
}

async function waitForFlightSimGeospatialDisposal(): Promise<void> {
  if (
    typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) return
  const gympgrph = await importGympgrph()
  const deadline = Date.now() + FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS
  let stableFrames = 0
  while (Date.now() <= deadline) {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
    const mapDisposed = gympgrph.readActiveMapLibreMap?.() == null
    const canvasDisposed = document.querySelector('canvas.maplibregl-canvas') == null
    if (mapDisposed && canvasDisposed) {
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
    const restored = await setGeospatialModeEnabled(enabled)
    if (restored !== enabled) {
      throw new Error(`Geo mode restored ${String(restored)} instead of ${String(enabled)}.`)
    }
    if (!enabled) await waitForFlightSimGeospatialDisposal()
    return null
  } catch (error) {
    return flightSimSurfaceRestorationError(error)
  }
}
