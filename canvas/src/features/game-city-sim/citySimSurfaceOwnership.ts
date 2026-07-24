import { useGraphStore } from '@/hooks/useGraphStore'
import { runCanvasSurfaceOwnershipTransaction } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'

type GraphStoreState = ReturnType<typeof useGraphStore.getState>

export type CitySimPreviousCanvasSurface = Readonly<Pick<
  GraphStoreState,
  | 'canvasRenderMode'
  | 'canvas3dMode'
  | 'canvasRenderModeLastFree'
  | 'canvasRenderModeIsAuto'
  | 'floatingPanelOpen'
  | 'floatingPanelView'
>>

export function captureCitySimPreviousCanvasSurface(): CitySimPreviousCanvasSurface {
  const state = useGraphStore.getState()
  return Object.freeze({
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
  })
}

export function restoreCitySimPreviousCanvasSurface(
  previous: CitySimPreviousCanvasSurface,
): void {
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
}
