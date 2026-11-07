import { useGraphStore } from '@/hooks/useGraphStore'
import { emitFloatingPanelOpen } from '@/features/canvas/utils'
import { setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'

export function openXrMediaLibrary(): void {
  const state = useGraphStore.getState()
  state.setFloatingPanelView('media')
  state.setFloatingPanelOpen(true)
  emitFloatingPanelOpen({ tab: 'media', open: true })
  setMediaCatalogMode('xr-3d')
}
