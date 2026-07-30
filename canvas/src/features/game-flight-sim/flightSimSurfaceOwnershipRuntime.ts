import { useGraphStore } from '@/hooks/useGraphStore'
import { runCanvasSurfaceOwnershipTransaction } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'
import {
  commitCanvasGeospatialSurfaceOwnership,
  GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS,
} from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
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

export const FLIGHT_SIM_SURFACE_DISPOSAL_TIMEOUT_MS =
  GEOSPATIAL_SURFACE_DISPOSAL_TIMEOUT_MS

function flightSimSurfaceRestorationError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || 'Flight Sim surface restoration failed.')
}

async function restoreFlightSimGeospatialSurface(
  enabled: boolean,
): Promise<string | null> {
  try {
    await commitCanvasGeospatialSurfaceOwnership(enabled)
    return null
  } catch (error) {
    return flightSimSurfaceRestorationError(error)
  }
}
