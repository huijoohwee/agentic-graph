import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { useGraphStore } from '@/hooks/useGraphStore'
import { restoreStoryboardWidgetDropCameraAuthority } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { isStoryboardWidgetContentMaterializationRebalanceRequest } from '@/lib/storyboardWidget/layoutRebalance'
import {
  buildStoryboardFixedCardCollisionLayoutKey2d,
  settleStoryboardFixedCardCollisionItems2d,
  storyboardFixedCardCollisionRectsOverlap2d,
} from '@/components/StoryboardWidgetCanvas/storyboardFixedCardCollisionLayout2d'

export function testStoryboardWidgetDropRestoresCameraWithoutRebalancingCollective() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow', source: 'markdown:workspace.md' },
    nodes: [],
    edges: [],
  })
  const zoomViewKeyRef = { current: 'storyboard:workspace.md' }
  restoreStoryboardWidgetDropCameraAuthority({
    authority: {
      zoomViewKey: zoomViewKeyRef.current,
      transform: { k: 1, x: 144, y: 96 },
    },
    zoomViewKeyRef,
    requestBalancedLayout: false,
  })

  const state = useGraphStore.getState()
  const keyed = state.zoomStateByKey[zoomViewKeyRef.current]
  if (!keyed || keyed.k !== 1 || keyed.x !== 144 || keyed.y !== 96) {
    throw new Error(`expected drop camera authority to persist the exact active transform, got ${JSON.stringify(keyed)}`)
  }
  if (state.zoomRequest?.type !== 'transform'
    || state.zoomRequest.payload.k !== 1
    || state.zoomRequest.payload.x !== 144
    || state.zoomRequest.payload.y !== 96) {
    throw new Error(`expected drop camera authority to reassert the exact active transform, got ${JSON.stringify(state.zoomRequest)}`)
  }
  if (state.storyboardWidgetLayoutRebalanceRequest != null) {
    throw new Error(`expected an authored drop to preserve the existing collective layout, got ${JSON.stringify(state.storyboardWidgetLayoutRebalanceRequest)}`)
  }

  const dropBridgePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetDropBridge.ts')
  const dropBridgeText = readFileSync(dropBridgePath, 'utf8')
  if (!dropBridgeText.includes('const captureInsertionCameraAuthority = React.useCallback(() => {')
    || !dropBridgeText.includes('const insertionCameraAuthority = captureInsertionCameraAuthority()')
    || !dropBridgeText.includes('preserveDropCameraAfterInsert(insertionCameraAuthority)')
    || dropBridgeText.includes('preserveDropCameraAndBalanceCollective(true)')) {
    throw new Error('expected Widget and Rich Media drops to capture camera authority before publication and restore it without reseeding existing authored cards')
  }
  if (!dropBridgeText.includes('const insertionGraphData =')
    || !dropBridgeText.includes('args.draftGraphDataRef.current')
    || !dropBridgeText.includes('graphData: insertionGraphData')
    || !dropBridgeText.includes('buildGraphDocumentMetaKey(insertionGraphData)')) {
    throw new Error('expected insertion placement to use the active authored document scope instead of the composed store graph scope')
  }
}

export function testFrontmatterGrowthPreservesExistingCollective() {
  const runtimePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetRuntimeScene.ts')
  const collisionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlayCollision.ts')
  const projectionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'useStoryboardCardOverlayProjection2d.ts')
  const placementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'storyboardCardPlacements2d.ts')
  const runtimeText = readFileSync(runtimePath, 'utf8')
  const collisionText = readFileSync(collisionPath, 'utf8')
  const projectionText = readFileSync(projectionPath, 'utf8')
  const placementsText = readFileSync(placementsPath, 'utf8')
  if (!runtimeText.includes('const incrementalUnplacedNodeIds = (')
    || !runtimeText.includes('&& pendingRaw.length > 0')
    || runtimeText.includes('&& !isFrontmatterFlow\n      && pendingRaw.length > 0')) {
    throw new Error('expected Widget/Rich Media growth to use single-node incremental placement in frontmatter flows')
  }
  if (!runtimeText.includes('&& incrementalUnplacedNodeIds.length === 0')) {
    throw new Error('expected whole-collective frontmatter recovery to stay disabled during incremental growth')
  }
  if (!collisionText.includes('article[aria-label^="Storyboard card"][data-node-id]')
    || !collisionText.includes('id: `storyboard-card:${id}`')) {
    throw new Error('expected authored Storyboard cards to participate as full-size collision obstacles for Widget/Rich Media cascade placement')
  }
  if (collisionText.includes('const allowPinnedAutoPlace = pinnedOverlap || shouldAutoPlaceStoryboardWidget({')
    || !collisionText.includes('const allowPinnedAutoPlace = shouldAutoPlaceStoryboardWidget({')) {
    throw new Error('expected authored pinned placements to remain authoritative after zoom, pan, and drag interactions')
  }
  for (const snippet of [
    'const targetAspect = 16 / 9',
    'Math.ceil(Math.sqrt(cardCount * targetAspect / cellAspect))',
    'const columnIndex = index % columnCount',
    'const rowIndex = Math.floor(index / columnCount)',
  ]) {
    if (!placementsText.includes(snippet)) {
      throw new Error(`expected fixed cards to use balanced 2D waterfall placement via ${snippet}`)
    }
  }
  for (const snippet of [
    "'[data-kg-rich-media-overlay=\"1\"]'",
    'relaxOverlayPanelsWithCollision({',
    'settledWorldByCardIdRef',
    'const worldById = new Map<string, StoryboardCardPlacement>()',
    'if (fixedLayoutEnabled) return rawBox',
  ]) {
    if (!projectionText.includes(snippet)) {
      throw new Error(`expected fixed-card projection to enforce balanced Widget/Rich Media layout via ${snippet}`)
    }
  }
}

export function testFixedCardProjectionFreezesBalancedWorldLayoutDuringCollectiveCameraMotion() {
  const projectionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'useStoryboardCardOverlayProjection2d.ts')
  const projectionText = readFileSync(projectionPath, 'utf8')
  for (const snippet of [
    'settledWorldByCardIdRef',
    'worldById: Map<string, StoryboardCardPlacement>',
    'if (fixedLayoutEnabled) return rawBox',
    'screenToWorld({',
  ]) {
    if (!projectionText.includes(snippet)) {
      throw new Error(`expected fixed Card projection to preserve one world-space collective through drag/pan/zoom via ${snippet}`)
    }
  }
  for (const stale of [
    'const currentDomRect = item.el.getBoundingClientRect()',
    'const projectionOffsetLeft = previouslyApplied',
    'const finalSettledCardBoxes:',
    'STORYBOARD_WIDGET_SCREEN_AUTHORITY_COLLECTIVE_PAN_EVENT',
  ]) {
    if (projectionText.includes(stale)) {
      throw new Error(`expected camera motion to avoid per-frame Card/Rich Media layout mutation via ${stale}`)
    }
  }
}

export function testFixedCardCollisionLayoutInvalidatesWhenRichMediaWorldGeometryChanges() {
  const baseArgs = {
    viewport: { width: 1280, height: 720 },
    cards: [{ id: 'target-card', width: 360, height: 203 }],
    obstacles: [{
      id: 'rich-media:source-panel',
      centerWorldX: 320,
      centerWorldY: 240,
      baseWidth: 745,
      baseHeight: 419,
    }],
  }
  const initialKey = buildStoryboardFixedCardCollisionLayoutKey2d(baseArgs)
  const movedKey = buildStoryboardFixedCardCollisionLayoutKey2d({
    ...baseArgs,
    obstacles: baseArgs.obstacles.map(obstacle => ({ ...obstacle, centerWorldX: obstacle.centerWorldX + 96 })),
  })
  const resizedKey = buildStoryboardFixedCardCollisionLayoutKey2d({
    ...baseArgs,
    obstacles: baseArgs.obstacles.map(obstacle => ({ ...obstacle, baseWidth: obstacle.baseWidth + 96 })),
  })
  if (initialKey === movedKey) {
    throw new Error('expected a moved Rich Media obstacle to invalidate the fixed-card collision settlement')
  }
  if (initialKey === resizedKey) {
    throw new Error('expected a resized Rich Media obstacle to invalidate the fixed-card collision settlement')
  }
}

export function testIncrementalFixedCardUsesNearestOpenSpaceAroundExpandedRichMedia() {
  const gapPx = 28
  const obstacle = { id: 'source-panel', left: 196, top: 349, width: 749, height: 421 }
  const card = { id: 'target-card', left: 869, top: 253, width: 362, height: 204, movable: true }
  const availableViewportWidth = obstacle.left + obstacle.width + gapPx + card.width + gapPx
  const [settled] = settleStoryboardFixedCardCollisionItems2d({
    items: [card],
    obstacles: [obstacle],
    gapPx,
  })
  if (!settled) throw new Error('expected the incremental target card to receive a collision settlement')
  if (storyboardFixedCardCollisionRectsOverlap2d(settled, obstacle, gapPx)) {
    throw new Error(`expected the target card to clear the expanded Rich Media panel, got ${JSON.stringify(settled)}`)
  }
  if (settled.left + settled.width > availableViewportWidth) {
    throw new Error(`expected nearest-edge placement to keep the target card in the available viewport, got ${JSON.stringify(settled)}`)
  }
  if (settled.left !== obstacle.left + obstacle.width + gapPx || settled.top !== card.top) {
    throw new Error(`expected the nearest open edge without force-solver overshoot, got ${JSON.stringify(settled)}`)
  }
}

export function testZoomPresetRebalanceUsesTransientPresentationPositionsDuringEditorGuard() {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'zoom-preset-presentation',
    metadata: { kind: 'test', source: 'zoom-preset-presentation' },
    nodes: [],
    edges: [],
  })
  const targetTransform = { k: 1, x: 320, y: 180 }
  useGraphStore.getState().requestZoomTransform(targetTransform, { intent: 'zoomPreset' })
  const zoomRequest = useGraphStore.getState().zoomRequest
  if (zoomRequest?.type !== 'transform' || zoomRequest.intent !== 'zoomPreset') {
    throw new Error(`expected toolbar preset intent to survive store dispatch, got ${JSON.stringify(zoomRequest)}`)
  }
  useGraphStore.getState().requestStoryboardWidgetLayoutRebalance({
    reason: 'zoom-preset',
    targetTransform,
  })
  const layoutRequest = useGraphStore.getState().storyboardWidgetLayoutRebalanceRequest
  if (
    layoutRequest?.reason !== 'zoom-preset'
    || layoutRequest.targetTransform?.k !== targetTransform.k
    || layoutRequest.targetTransform?.x !== targetTransform.x
    || layoutRequest.targetTransform?.y !== targetTransform.y
  ) {
    throw new Error(`expected zoom-preset rebalance to retain target camera authority, got ${JSON.stringify(layoutRequest)}`)
  }
  useGraphStore.getState().requestStoryboardWidgetLayoutRebalance({
    reason: 'content-materialization',
  })
  const materializationRequest = useGraphStore.getState().storyboardWidgetLayoutRebalanceRequest
  if (
    !isStoryboardWidgetContentMaterializationRebalanceRequest(materializationRequest)
    || !layoutRequest
    || materializationRequest.at <= layoutRequest.at
  ) {
    throw new Error(`expected content materialization to retain its shared viewport recovery intent, got ${JSON.stringify(materializationRequest)}`)
  }

  useGraphStore.getState().setWorkspaceViewState({ mode: 'editor', paneOpen: true })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({ blocked: { x: 1, y: 1 } })
  if (useGraphStore.getState().flowWidgetWorldPosByNodeId.blocked) {
    throw new Error('expected ordinary geometry writes to remain blocked while the editor owns source mutation authority')
  }
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId(
    { presentation: { x: 120, y: 80 } },
    { allowDuringWorkspaceMutation: true, persist: false },
  )
  const presentation = useGraphStore.getState().flowWidgetWorldPosByNodeId.presentation
  if (presentation?.x !== 120 || presentation.y !== 80) {
    throw new Error(`expected explicit zoom-preset presentation geometry to remain usable during the editor guard, got ${JSON.stringify(presentation)}`)
  }
  useGraphStore.getState().setWorkspaceViewState({ mode: 'canvas', paneOpen: false })
}
