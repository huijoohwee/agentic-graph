import { useGraphStore } from '@/hooks/useGraphStore'
import { applyFrontmatterFlowImportModes } from '@/features/parsers/frontmatterFlowImportMode'
import {
  waitForCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import { LS_KEYS } from '@/lib/config'
import { createMemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'

export async function testFrontmatterFlowDefault2dSurfaceExitsGeospatialMode() {
  const { restore, storage } = initWindowHarness({
    storage: createMemoryStorage(),
  })
  try {
    useGraphStore.getState().resetAll()
    storage.setItem(LS_KEYS.geospatialOverlayEnabled, 'true')

    applyFrontmatterFlowImportModes({
      type: 'Graph',
      context: 'frontmatter-flow',
      metadata: { kind: 'frontmatter-flow' },
      nodes: [{ id: 'widget', type: 'TextGeneration', label: 'Widget' }],
      edges: [],
    } as never)
    await waitForCanvasFrontmatterSurfaceTransition()

    const state = useGraphStore.getState()
    const geospatialEnabled = storage.getItem(LS_KEYS.geospatialOverlayEnabled)
    if (geospatialEnabled !== '0' && geospatialEnabled !== 'false') {
      throw new Error(`expected the default 2d flow landing to exit Geospatial Mode, got ${String(geospatialEnabled)}`)
    }
    if (state.canvasRenderMode !== '2d') {
      throw new Error(`expected the default flow landing to remain 2d, got ${String(state.canvasRenderMode)}`)
    }
    if (state.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected the default flow landing to use Storyboard, got ${String(state.canvas2dRenderer)}`)
    }
  } finally {
    restore()
  }
}
