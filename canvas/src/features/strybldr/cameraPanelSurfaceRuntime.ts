import { useGraphStore } from '@/hooks/useGraphStore'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'

export function ensureSharedCameraPanel(): boolean {
  const state = useGraphStore.getState()
  if (state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr') {
    if (state.floatingPanelOpen) return true
    return activateXrSceneSurface({ panelView: 'camera', openPanel: true })
  }
  if (state.floatingPanelOpen) return true
  state.setFloatingPanelView('camera')
  state.setFloatingPanelOpen(true)
  return true
}
