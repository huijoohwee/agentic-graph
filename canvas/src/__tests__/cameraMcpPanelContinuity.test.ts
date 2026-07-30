import { ensureSharedCameraPanel } from '@/features/strybldr/cameraPanelSurfaceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testCameraPanelActivationPreservesOpenXrOperatorPanels() {
  const state = useGraphStore.getState()
  const previous = {
    canvasRenderMode: state.canvasRenderMode,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    canvas3dMode: state.canvas3dMode,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
  }
  try {
    for (const floatingPanelView of ['media', 'skillsCommands', 'flightSim'] as const) {
      useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr', floatingPanelOpen: true, floatingPanelView } as never)
      if (!ensureSharedCameraPanel()) throw new Error(`expected Camera surface activation from ${floatingPanelView}`)
      const current = useGraphStore.getState()
      if (!current.floatingPanelOpen || current.floatingPanelView !== floatingPanelView) {
        throw new Error(`expected Camera framing to preserve ${floatingPanelView}, got ${current.floatingPanelView}`)
      }
    }
    useGraphStore.setState({ canvasRenderMode: '2d', floatingPanelOpen: true, floatingPanelView: 'media' } as never)
    if (!ensureSharedCameraPanel() || useGraphStore.getState().floatingPanelView !== 'media') {
      throw new Error('expected Camera framing to preserve an open non-XR operator panel')
    }
    useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr', floatingPanelOpen: false, floatingPanelView: 'skillsCommands' } as never)
    if (!ensureSharedCameraPanel() || !useGraphStore.getState().floatingPanelOpen || useGraphStore.getState().floatingPanelView !== 'camera') {
      throw new Error('expected Camera framing to open Camera only when no operator panel is open')
    }
  } finally {
    useGraphStore.setState(previous as never)
  }
}
