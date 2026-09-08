import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testGraphCanvasRootPrefersPlannedOverlayHideSet() {
  const p = resolve(process.cwd(), 'src', 'components', 'GraphCanvasRoot', 'GraphCanvasRootImpl.tsx')
  const text = readFileSync(p, 'utf8')
  if (text.includes('mediaOverlayHideNodeIdSet || richMedia.mediaOverlayNodeIdSet')) {
    throw new Error('expected GraphCanvasRoot to not prefer mounted-only overlay hide set')
  }
  if (!text.includes('mediaOverlayNodeIdSet: richMedia.mediaOverlayNodeIdSet')) {
    throw new Error('expected GraphCanvasRoot to pass planned overlay node id set to the scene')
  }
  if (!text.includes("import { isStoryboardWidgetSurfaceRenderer } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'")) {
    throw new Error('expected GraphCanvasRoot to reuse the shared Storyboard renderer gate for overlay selection ownership')
  }
  if (!text.includes('if (isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)) return')) {
    throw new Error('expected GraphCanvasRoot to preserve clicked Rich Media Panel selection on shared Storyboard/Storyboard Widget surfaces')
  }
  if (!text.includes('[canvas2dRenderer, openWidgetNodeIds, panelOnlyNodeIdSetForScene, richMedia.mediaOverlayNodeIdSet, selectNode, selectedNodeId, selectedNodeIds]')) {
    throw new Error('expected GraphCanvasRoot hidden-selection cleanup to depend on the active renderer gate')
  }
}
