import { useGraphStore } from '@/hooks/useGraphStore'
import { runCanvasSurfaceOwnershipTransaction } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'
import { commitCanvasGeospatialSurfaceOwnership } from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
import { readGeospatialOverlayEnabledPreference } from '@/lib/geospatial/geospatialModePreference'

type GraphStoreState = ReturnType<typeof useGraphStore.getState>

export type CitySimPreviousCanvasSurface = Readonly<Pick<
  GraphStoreState,
  | 'canvasRenderMode'
  | 'canvas3dMode'
  | 'canvasRenderModeLastFree'
  | 'canvasRenderModeIsAuto'
  | 'floatingPanelOpen'
  | 'floatingPanelView'
> & {
  geospatialModeEnabled: boolean
}>

export function captureCitySimPreviousCanvasSurface(): CitySimPreviousCanvasSurface {
  const state = useGraphStore.getState()
  return Object.freeze({
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    geospatialModeEnabled: readGeospatialOverlayEnabledPreference(),
  })
}

export function restoreCitySimPreviousCanvasSurface(
  previous: CitySimPreviousCanvasSurface,
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
  return commitCanvasGeospatialSurfaceOwnership(previous.geospatialModeEnabled)
    .then(() => null)
    .catch(error => (
      error instanceof Error ? error.message : String(error || 'Geo restoration failed.')
    ))
}
