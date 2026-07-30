import {
  planStoryboardWidgetRunMaterializationPositions,
  STORYBOARD_WIDGET_RUN_COORDINATOR_FANOUT_TOPOLOGY_MODE,
  type StoryboardWidgetRunExecutionAnchorSnapshot,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor'
import {
  RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
} from '@/lib/render/richMediaPanelDefaults'
import { worldToScreen } from '@/lib/zoom/viewport'

export function testCoordinatorFanoutRunMaterializationPreservesRightwardTopDownTopologyAtNaturalSize() {
  const sourceSize = {
    width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  }
  const items = [
    {
      ...sourceSize,
      worldPositionMode: 'center' as const,
    },
    {
      ...sourceSize,
      worldPositionMode: 'top-left' as const,
    },
    {
      ...sourceSize,
      worldPositionMode: 'center' as const,
    },
  ]
  const topology = {
    mode: STORYBOARD_WIDGET_RUN_COORDINATOR_FANOUT_TOPOLOGY_MODE,
    coordinatorItemIndex: 1,
    fanoutItemIndices: [0, 2],
  } as const
  const buildSnapshot = (width: number): StoryboardWidgetRunExecutionAnchorSnapshot => ({
    nodeId: 'generic-fanout-source',
    graphMetaKey: 'generic-fanout',
    authority: 'rendered',
    world: { x: 40, y: 350 },
    screen: {
      left: 40,
      top: 350,
      width: sourceSize.width,
      height: sourceSize.height,
    },
    paintScale: 1,
    transform: { k: 1, x: 0, y: 0 },
    visibleViewport: {
      left: 0,
      top: 0,
      right: width,
      bottom: 900,
      width,
      height: 900,
    },
  })
  const projectRects = (
    positions: Array<{ x: number; y: number }>,
  ): Array<{ left: number; top: number; width: number; height: number }> => (
    positions.map((position, index) => {
      const projected = worldToScreen({
        transform: { k: 1, x: 0, y: 0 },
        x: position.x,
        y: position.y,
      })
      const item = items[index]!
      return item.worldPositionMode === 'center'
        ? {
            left: projected.sx - item.width / 2,
            top: projected.sy - item.height / 2,
            width: item.width,
            height: item.height,
          }
        : {
            left: projected.sx,
            top: projected.sy,
            width: item.width,
            height: item.height,
          }
    })
  )
  const wideSnapshot = buildSnapshot(1_600)
  const wideRects = projectRects(planStoryboardWidgetRunMaterializationPositions({
    snapshot: wideSnapshot,
    sourceItem: sourceSize,
    items,
    topology,
    preset: 'richMedia',
  }))
  const wideCoordinator = wideRects[1]!
  const wideFanout = [wideRects[0]!, wideRects[2]!]
  if (
    wideCoordinator.left <= Number(wideSnapshot.screen?.left) + sourceSize.width
    || wideFanout.some(rect => rect.left <= wideCoordinator.left + wideCoordinator.width)
    || wideFanout[0]!.left !== wideFanout[1]!.left
    || wideFanout[0]!.top >= wideFanout[1]!.top
  ) {
    throw new Error(`expected a wide viewport to preserve source -> coordinator -> ordered fanout columns independent of item array order, got ${JSON.stringify(wideRects)}`)
  }

  const constrainedSnapshot = buildSnapshot(920)
  const constrainedPositions = planStoryboardWidgetRunMaterializationPositions({
    snapshot: constrainedSnapshot,
    sourceItem: sourceSize,
    items,
    topology,
    preset: 'richMedia',
  })
  const constrainedRects = projectRects(constrainedPositions)
  const constrainedCoordinator = constrainedRects[1]!
  const constrainedFanout = [constrainedRects[0]!, constrainedRects[2]!]
  const allConstrainedRectsInsideViewport = constrainedRects.every(rect => (
    rect.left >= constrainedSnapshot.visibleViewport.left
    && rect.top >= constrainedSnapshot.visibleViewport.top
    && rect.left + rect.width <= constrainedSnapshot.visibleViewport.right
    && rect.top + rect.height <= constrainedSnapshot.visibleViewport.bottom
  ))
  if (
    constrainedCoordinator.left <= Number(constrainedSnapshot.screen?.left) + sourceSize.width
    || constrainedFanout.some(rect => rect.left !== constrainedCoordinator.left)
    || constrainedCoordinator.top >= constrainedFanout[0]!.top
    || constrainedFanout[0]!.top >= constrainedFanout[1]!.top
    || !allConstrainedRectsInsideViewport
  ) {
    throw new Error(`expected a constrained natural-size viewport to collapse the coordinator and ordered fanout into one visible rightward top-down column, got ${JSON.stringify(constrainedRects)}`)
  }

  const balancedFallback = planStoryboardWidgetRunMaterializationPositions({
    snapshot: constrainedSnapshot,
    sourceItem: sourceSize,
    items,
    preset: 'richMedia',
  })
  const invalidTopologyFallback = planStoryboardWidgetRunMaterializationPositions({
    snapshot: constrainedSnapshot,
    sourceItem: sourceSize,
    items,
    topology: {
      ...topology,
      fanoutItemIndices: [0],
    },
    preset: 'richMedia',
  })
  if (JSON.stringify(invalidTopologyFallback) !== JSON.stringify(balancedFallback)) {
    throw new Error(`expected incomplete topology metadata to preserve the existing balanced fallback exactly, got ${JSON.stringify({ balancedFallback, invalidTopologyFallback })}`)
  }
}
