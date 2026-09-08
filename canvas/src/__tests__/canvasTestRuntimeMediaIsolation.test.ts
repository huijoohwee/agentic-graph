import assert from 'node:assert/strict'
import { readMediaCatalogMode, setMediaCatalogMode } from '@/features/command-menu/mediaCatalogModeRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resetCanvasTestRuntime } from '@/tests/lib/resetCanvasTestRuntime'

export function testCanvasRuntimeCleanupRestoresMediaAndRendererSelection() {
  const initial = useGraphStore.getInitialState()
  for (const mode of ['xr-3d', 'voice-studio'] as const) {
    setMediaCatalogMode(mode)
    useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr' })
    // The runner invokes this same cleanup after successful and failed cases.
    resetCanvasTestRuntime()
    assert.equal(readMediaCatalogMode(), 'media', 'the next fixture must open the default media catalog')
    const state = useGraphStore.getState()
    assert.equal(state.canvasRenderMode, initial.canvasRenderMode)
    assert.equal(state.canvas3dMode, initial.canvas3dMode)
  }
}
