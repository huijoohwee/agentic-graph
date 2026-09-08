import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyFixedStoryboardCardPlacementsToGraphData2d, readStoryboardCardSize2d, readStoryboardWidgetPlacementSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { projectMediaOverlayResizeWorldSizeToLayout } from '@/lib/render/mediaOverlayResizeProjection'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import { WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import { resolveFlowCanvasMediaOverlayInteractionPolicy } from '@/components/FlowCanvas/shared'

export function testStoryboardWidgetRichMediaOverlayResizePersistsVisualSize() {
  if (!resolveFlowCanvasMediaOverlayInteractionPolicy({ rendererInteractionMode: true, resizeMutationBlocked: false }).resizeActive
    || resolveFlowCanvasMediaOverlayInteractionPolicy({ rendererInteractionMode: true, resizeMutationBlocked: true }).resizeActive) {
    throw new Error('expected the shared Rich Media interaction policy to enable safe source-backed resize and block unsafe store-only resize')
  }
  const defaultCardSize = readStoryboardCardSize2d({ id: 'card-default', type: 'Card' } as GraphNode, '16:9')
  const defaultWidgetSize = readStoryboardWidgetPlacementSize2d({ id: 'widget-default', type: 'Widget' } as GraphNode, '16:9')
  if (defaultCardSize.width !== WIDGET_BASE_SIZE.width || defaultCardSize.height !== WIDGET_BASE_SIZE.height
    || defaultWidgetSize.width !== WIDGET_BASE_SIZE.width || defaultWidgetSize.height !== WIDGET_BASE_SIZE.height
    || RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width !== WIDGET_BASE_SIZE.width || RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height !== WIDGET_BASE_SIZE.height) {
    throw new Error('expected Card, Widget, and Rich Media Panel to reuse one default 16:9 shape and size')
  }
  const buildPlacementGraph = (unpinnedX: number, unpinnedY: number): GraphData => ({
    type: 'application/json',
    nodes: [
      { id: 'pinned-card', type: 'storyboard', label: 'Pinned', x: 100, y: 120, properties: { lane: 'Elements', order: 0, summary: 'Pinned' } },
      { id: 'unpinned-card', type: 'storyboard', label: 'Unpinned', x: unpinnedX, y: unpinnedY, properties: { lane: 'Elements', order: 1, summary: 'Unpinned' } },
    ],
    edges: [],
  } as GraphData)
  const projectPlacementGraph = (graphData: GraphData) => applyFixedStoryboardCardPlacementsToGraphData2d({
    aspectRatioMode: '16:9',
    flowWidgetPinnedByNodeId: { 'pinned-card': true, 'unpinned-card': false },
    graphData,
    graphRevision: 1,
    schema: null,
  })
  const readPinnedPosition = (graphData: GraphData | null): string => {
    const node = graphData?.nodes.find(candidate => candidate.id === 'pinned-card')
    return `${node?.x},${node?.y}`
  }
  const pinnedBeforeUnpinnedDrag = readPinnedPosition(projectPlacementGraph(buildPlacementGraph(300, 320)))
  const pinnedAfterUnpinnedDrag = readPinnedPosition(projectPlacementGraph(buildPlacementGraph(1600, 900)))
  if (pinnedBeforeUnpinnedDrag !== pinnedAfterUnpinnedDrag) {
    throw new Error(`expected unpinned Card, Widget, and Rich Media drag not to redefine the pinned collection origin: ${pinnedBeforeUnpinnedDrag} -> ${pinnedAfterUnpinnedDrag}`)
  }
  const p = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx')
  const sharedPath = resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'shared.ts')
  const draftActionsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetNodeDraftActions.ts')
  const text = readFileSync(p, 'utf8')
  const sharedText = readFileSync(sharedPath, 'utf8')
  const draftActionsText = readFileSync(draftActionsPath, 'utf8')
  const cardDragText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'storyboardCardOverlayInteractions2d.ts'), 'utf8')
  const cardProjectionText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'useStoryboardCardOverlayProjection2d.ts'), 'utf8')
  if (!text.includes("'visual:width'") || !text.includes("'visual:height'")) {
    throw new Error('expected FlowCanvas rich media overlay resize to write visual:width/visual:height')
  }
  if (cardDragText.includes('dragSchedulerRef') || !cardDragText.includes('}, event.currentTarget)') || !cardDragText.includes('setFlowWidgetDraggingNodeId(id)')
    || !cardDragText.includes('disableAutoZoomModesForUserGesture(useGraphStore.getState())') || !cardDragText.includes('args.setDragVisualOverride?.(id, latest)')
    || !cardDragText.includes("args.updateNode(id, { x: snapped.x, y: snapped.y })") || !cardProjectionText.includes('dragWorldOverrideByCardIdRef.current.has(cardId)')) {
    throw new Error('expected unpinned Card drag to use a local visual override and commit only the target node at drag-end')
  }
  if (!/mediaOverlayHeaderDragRef\.current = \{[^}]*\bid,[^}]*\bpointerId,/.test(text) || !text.includes('setFlowWidgetDraggingNodeId(id)')
    || !text.includes('flowWidgetDraggingNodeId === id) useGraphStore.getState().setFlowWidgetDraggingNodeId(null)')) {
    throw new Error('expected Widget and Rich Media drag to share the collection-layout lock for the complete drag lifecycle')
  }
  if (!text.includes('onNodePropertiesChange(node.id, nextProperties, mutationSourceGraphData)')) {
    throw new Error('expected FlowCanvas media overlays to commit size through the renderer source-graph mutation contract')
  }
  if (!sharedText.includes('sourceGraphData?: GraphData | null')) {
    throw new Error('expected the shared node-property mutation contract to carry its canonical source graph')
  }
  if (!draftActionsText.includes('const storeNodeId = String(resolveGraphNodeByCanonicalId(storeGraphData, id)?.id || \'\').trim()')
    || !draftActionsText.includes('args.updateNode(storeNodeId || id, patch)')) {
    throw new Error('expected Storyboard source-graph mutations to commit only the canonically resolved node')
  }
  if (!sharedText.includes('resizeActive: rendererInteractionMode && args.resizeMutationBlocked !== true')
    || !text.includes("resizeMutationBlocked = workspaceMutationBlocked && typeof onNodePropertiesChange !== 'function'")) {
    throw new Error('expected FlowCanvas rich media overlay resize to reuse the source-aware shared mutation policy')
  }
  if (!text.includes('const resizeHandleVisible = isSelected') || !text.includes('resizeHandleVisible={resizeHandleVisible}')) {
    throw new Error('expected FlowCanvas rich media overlay resize handle to remain visible with selected chrome even when mutation is temporarily blocked')
  }
  if (!text.includes('isStoryboardWidgetFrontmatterDocumentModeRequested')) {
    throw new Error('expected FlowCanvas rich media overlay resize to reuse shared frontmatter-document mode request gate SSOT')
  }
  if (!text.includes('phase=layout-override') || !text.includes('lastRichMediaResizeTrace')) {
    throw new Error('expected FlowCanvas rich media overlay resize path to publish strict live trace for resize lifecycle and layout override consumption')
  }
  if (!text.includes('projectMediaOverlayResizeWorldSizeToLayout({')) {
    throw new Error('expected Rich Media resize overrides to reuse the shared world-to-layout projection owner')
  }
  if (!text.includes('if (mediaOverlayDragInteractionMode) return')) {
    throw new Error('expected active Card, Widget, Storyboard, and Flow Canvas resize sessions to survive renderer cleanup effects')
  }
  if (!text.includes('readVectorPaintedOverlayScale(el)')) {
    throw new Error('expected Rich Media resize deltas to reuse the shared Card and Widget painted-scale projection instead of raw renderer zoom')
  }
  if (text.includes('if (!runtime || !scene) return')) {
    throw new Error('expected Rich Media resize to remain available before the optional Flow scene runtime hydrates')
  }
  const storyboardProjected = projectMediaOverlayResizeWorldSizeToLayout({
    height: 270,
    projectWithWorldTransformScale: true,
    scale: 0.375,
    width: 480,
  })
  if (storyboardProjected.w !== 480 || storyboardProjected.h !== 270) {
    throw new Error(`expected Storyboard resize to keep world size for one-time canvas zoom projection, got ${storyboardProjected.w}x${storyboardProjected.h}`)
  }
  const screenProjected = projectMediaOverlayResizeWorldSizeToLayout({
    height: 270,
    projectWithWorldTransformScale: false,
    scale: 0.375,
    width: 480,
  })
  if (screenProjected.w !== 180 || screenProjected.h !== 101.25) {
    throw new Error(`expected screen-layout renderers to retain their explicit zoom projection, got ${screenProjected.w}x${screenProjected.h}`)
  }

  const resizedBelowDefault = readStoryboardCardSize2d({
    id: 'rich-media-resized-below-default',
    label: 'Rich media resized below default',
    properties: { 'visual:width': 240, 'visual:height': 135 },
    type: 'MediaPanel',
  } as GraphNode, '16:9')
  if (resizedBelowDefault.width !== 240 || resizedBelowDefault.height !== 135) {
    throw new Error(`expected explicit Card and Rich Media resize below the default width to persist, got ${resizedBelowDefault.width}x${resizedBelowDefault.height}`)
  }
  const resizedWidgetBelowDefault = readStoryboardWidgetPlacementSize2d({
    id: 'widget-resized-below-default',
    label: 'Widget resized below default',
    properties: { 'visual:width': 240, 'visual:height': 135 },
    type: 'Widget',
  } as GraphNode, '16:9')
  if (resizedWidgetBelowDefault.width !== 240 || resizedWidgetBelowDefault.height !== 135) {
    throw new Error(`expected explicit Widget resize below the default width to persist, got ${resizedWidgetBelowDefault.width}x${resizedWidgetBelowDefault.height}`)
  }
}
