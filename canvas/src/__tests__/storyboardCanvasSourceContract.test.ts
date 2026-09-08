import { readFileSync } from 'node:fs'
import { assertStoryboard2dMediaDropContract } from './storyboardCanvasMediaDropContract'
export function testStoryboardCanvasKeepsNativeRendererContract() {
  const source = readFileSync(new URL('../components/StoryboardCanvas.tsx', import.meta.url), 'utf8')
  const canvasViewportSource = readFileSync(new URL('../components/CanvasViewport.tsx', import.meta.url), 'utf8')
  const storyboardWidgetRuntimeSource = readFileSync(new URL('../components/StoryboardWidgetCanvas.runtime.tsx', import.meta.url), 'utf8')
  const storyboardWidgetRenderStateSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRenderState.ts', import.meta.url), 'utf8')
  const storyboardWidgetGraphActionsSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts', import.meta.url), 'utf8')
  const storyboardWidgetSurfaceSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx', import.meta.url), 'utf8')
  const storyboardWidgetDropBridgeSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetDropBridge.ts', import.meta.url), 'utf8')
  const graphCanvasRootSource = readFileSync(new URL('../components/GraphCanvasRoot/GraphCanvasRootImpl.tsx', import.meta.url), 'utf8')
  const graphStoryboardOverlaySource = ['../components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx', '../components/StoryboardWidgetCanvas/storyboardCardPlacements2d.ts', '../components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d.ts', '../components/StoryboardWidgetCanvas/StoryboardCardTextEditSurface.tsx'].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
  const graphCanvasSceneSource = readFileSync(new URL('../components/GraphCanvas/scene.ts', import.meta.url), 'utf8')
  const graphCanvasZoomSource = readFileSync(new URL('../components/GraphCanvas/zoom.ts', import.meta.url), 'utf8')
  const graphRichMediaOverlaySource = readFileSync(new URL('../components/GraphCanvasRoot/components/RichMediaOverlayLayer2d.tsx', import.meta.url), 'utf8')
  const flowCanvasGraphStateSource = readFileSync(new URL('../components/FlowCanvas/useFlowCanvasGraphState.ts', import.meta.url), 'utf8')
  const richMediaSsotSource = readFileSync(new URL('../lib/render/richMediaSsot.ts', import.meta.url), 'utf8')
  const configRenderSource = readFileSync(new URL('../lib/config.render.ts', import.meta.url), 'utf8')
  const screenAuthorityPanSource = readFileSync(new URL('../lib/storyboardWidget/screenAuthorityCollectivePan.ts', import.meta.url), 'utf8')
  const graphCanvasNodesLayerSource = readFileSync(new URL('../components/GraphCanvas/layers/nodes.ts', import.meta.url), 'utf8')
  const graphCanvasLinksLayerSource = readFileSync(new URL('../components/GraphCanvas/layers/links.ts', import.meta.url), 'utf8')
  const graphCanvasLabelsLayerSource = readFileSync(new URL('../components/GraphCanvas/layers/labels.ts', import.meta.url), 'utf8')
  const graphCanvasEdgeLabelsLayerSource = readFileSync(new URL('../components/GraphCanvas/layers/edgeLabels.ts', import.meta.url), 'utf8')
  const graphCanvasGroupsLayerSource = readFileSync(new URL('../components/GraphCanvas/layers/groups.ts', import.meta.url), 'utf8')
  const graphOverlayInteractionsSource = readFileSync(new URL('../components/GraphCanvasRoot/hooks/useOverlayInteractions2d.ts', import.meta.url), 'utf8')
  const storyboardWidgetOverlayDragSource = readFileSync(new URL('../lib/storyboardWidget/overlayWorldDrag.ts', import.meta.url), 'utf8')
  const storyboardWidgetDragHandlersSource = readFileSync(new URL('../components/StoryboardWidget/useWidgetDragHandlers.ts', import.meta.url), 'utf8')
  const infiniteZoomSource = readFileSync(new URL('../components/StoryboardCanvas/useStoryboardInfiniteZoom.ts', import.meta.url), 'utf8')
  const infiniteMetricsSource = readFileSync(new URL('../components/StoryboardCanvas/storyboardInfiniteZoomMetrics.ts', import.meta.url), 'utf8')
  const infiniteRequestSource = readFileSync(new URL('../components/StoryboardCanvas/storyboardInfiniteZoomRequest.ts', import.meta.url), 'utf8')
  const mediaSelectionSource = readFileSync(new URL('../components/StoryboardCanvas/storyboardMediaSelectionPanel.tsx', import.meta.url), 'utf8')
  const mediaLightboxSource = readFileSync(new URL('../lib/ui/MediaLightbox.tsx', import.meta.url), 'utf8')
  const mediaLightboxPromptParametersSource = readFileSync(new URL('../lib/ui/mediaLightboxPromptParameters.ts', import.meta.url), 'utf8')
  const mediaKindOverlaySource = readFileSync(new URL('../lib/ui/MediaKindOverlay.tsx', import.meta.url), 'utf8')
  assertStoryboard2dMediaDropContract()
  if (!source.includes("from '@/lib/render/richMediaPanelDefaults'") || !source.includes('resolveMediaDragEventReleaseClientPoint') || !source.includes('clientX - rect.left - transform.x') || !source.includes('clientY - rect.top - transform.y') || !source.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width / 2') || !source.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height / 2')) throw new Error('expected native Storyboard canvas FloatingPanel Media drops to center new Rich Media panels on the pan/zoom-correct release point')
  if (source.includes('existingSourceNodeId') || source.includes("findStoryboardGraphNodeIdByProperty([useGraphStore.getState().graphData as GraphData | null, storeGraphData, graphData], FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, 'mediaSourceKey'")) throw new Error('forbid source-key duplicate drops from moving a previous Storyboard Rich Media Panel')
  if (
    !canvasViewportSource.includes("const sharedGraphCanvasSurfaceActive = active2dSurface === 'd3'")
    || !canvasViewportSource.includes('data-kg-shared-graph-canvas-surface={sharedGraphCanvasSurfaceActive ? active2dSurface || undefined : undefined}')
    || !canvasViewportSource.includes('sharedGraphCanvasSurfaceActive ? <SharedGraphCanvasLazy active /> : null')
    || !canvasViewportSource.includes('active2dSurface === \'storyboard\' ? <StoryboardWidgetCanvasLazy active storyboardWidgetSurfaceId="storyboard" storyboardCardsMode /> : null')
  ) {
    throw new Error('expected Storyboard 2D renderer to reuse the shared widget canvas subsystem without routing through the D3 Graph renderer')
  }
  if (
    canvasViewportSource.includes("active2dSurface === 'd3' || active2dSurface === 'storyboard'")
    || graphCanvasRootSource.includes('StoryboardCardOverlayLayer2d')
    || graphCanvasRootSource.includes('applyFixedStoryboardCardPlacementsToGraphData2d')
    || graphCanvasRootSource.includes('data-kg-canvas-svg-underlay')
    || graphCanvasZoomSource.includes('__kgWindowViewportDestroy')
    || graphCanvasZoomSource.includes("svgEl.getAttribute('data-kg-canvas-svg-underlay') === 'storyboard'")
  ) {
    throw new Error('expected Storyboard 2D renderer to avoid GraphCanvas/D3 underlay interference')
  }
  if (canvasViewportSource.includes('StoryboardCanvasLazy')) {
    throw new Error('expected CanvasViewport to stop mounting the custom Storyboard canvas surface for the Storyboard 2D renderer')
  }
  for (const snippet of ['storyboardCardsMode = false', "const storyboardCardDisplayActive = storyboardCardsMode && storyboardDisplayMode === 'card'", "const storyboardWidgetDisplayActive = storyboardCardsMode && storyboardDisplayMode === 'widget'",
    'const storyboardCanvasGraphDataForDisplay = React.useMemo((): GraphData | null => {',
    'const storyboardWidgetNodeIds = React.useMemo((): string[] => {',
    'allowExplicitOpenWidgetNodeIds: storyboardWidgetDisplayActive',
    "from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetPendingOverlayGraph'",
    'const [pendingOverlayNodesById, setPendingOverlayNodesById] = React.useState<Record<string, GraphNode>>({})',
    'const registerPendingOverlayNode = React.useCallback<React.Dispatch<React.SetStateAction<GraphNode | null>>>((nextPendingNode) => {',
    'const flowCanvasGraphDataWithPendingOverlays = React.useMemo(',
    'appendPendingOverlayNodesToGraphData(resolvePendingOverlayGraphDataBase({',
    'setPendingOverlayNodesById(prev => {',
    'delete next[id]',
    'resolveGraphNodeByCanonicalId(baseGraphData, pendingId)',
    'pendingOverlayNodeIdRef.current = null',
    'setPendingOverlayNode(null)',
    'const storyboardCanvasGraphDataOverride = storyboardCardDisplayActive',
    '? appendPendingOverlayNodesToGraphData(storyboardCanvasGraphDataForDisplay, pendingOverlayNodesById) || storyboardCanvasGraphDataForDisplay',
    ': storyboardCardsMode',
    '? (flowCanvasGraphDataWithPendingOverlays || storyboardCanvasGraphDataForDisplay)',
    'const surfaceNoGraphLoaded = storyboardCardsMode ? false : noGraphLoaded',
    'storyboardCardsMode={storyboardCardDisplayActive}',
    'storyboardWidgetMode={storyboardWidgetDisplayActive}',
    'storyboardSourceGraphData={storyboardCanvasGraphDataOverride}',
    'renderGraphDataOverride={flowCanvasGraphDataOverride}',
    'noGraphLoaded={surfaceNoGraphLoaded}',
  ]) {
    if (!storyboardWidgetRuntimeSource.includes(snippet)) {
      throw new Error(`expected StoryboardWidgetCanvas runtime to own Storyboard card-surface snippet: ${snippet}`)
    }
  }
  for (const snippet of ["from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetCanvasSurfaceDeferred'", "from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'",
    "const storyboardSurfaceRouteActive = String(props.storyboardWidgetSurfaceId || '').trim() === 'storyboard' || canvas2dRenderer === 'storyboard'",
    'const storyboardCardsActive = props.storyboardCardsMode === true && storyboardSurfaceRouteActive',
    'const storyboardSharedSurfaceActive =',
    '(props.storyboardCardsMode === true || props.storyboardWidgetMode === true) && storyboardSurfaceRouteActive',
    'applyFixedStoryboardCardPlacementsToGraphData2d({',
    "from '@/components/StoryboardCanvas/storyboardModel'",
    'const board = buildStoryboardBoardModel({',
    'flatMap(lane => lane.cards.map(card => String(card.id || \'\').trim()))',
    'const readFlowCanvasBaseGraphDataOverride = React.useCallback(() => {',
    'const flowCanvasGraphDataOverride = storyboardSharedSurfaceActive ? storyboardGraphData : props.renderGraphDataOverride',
    'const flowCanvasGraphDataOverride = React.useMemo(() => {',
    'const flowCanvasNativeSceneExcludedNodeIds = React.useMemo(() => (',
    '...storyboardOverlayConsumerNodeIds,',
    'excludeNativeSceneNodeIds={flowCanvasNativeSceneExcludedNodeIds}',
    'graphDataOverride={flowCanvasGraphDataOverride}',
    'excludeRichMediaOverlayNodeIds={flowCanvasRichMediaOverlayExcludedNodeIds}',
    '<DeferredStoryboardCardOverlayLayer2d',
    'active={storyboardCardsActive}',
    'graphData={storyboardGraphData}',
    'flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId',
    'resolveFlowWidgetStateGraphKey({',
    'graphData: props.storyboardSourceGraphData || null',
    'resolveScopedFlowWidgetNodeMap({',
  ]) {
    if (!storyboardWidgetSurfaceSource.includes(snippet)) {
      throw new Error(`expected StoryboardWidgetCanvas surface to own Storyboard fixed-card geometry snippet: ${snippet}`)
    }
  }
  for (const snippet of ['buildStoryboardWidgetDraftGraphBaseSignature', 'const rawRenderGraphContentSignature = React.useMemo', 'prev.contentSignature === nextContentSignature', 'stableRenderGraphOverride.contentSignature === rawRenderGraphContentSignature']) {
    if (!storyboardWidgetRenderStateSource.includes(snippet)) {
      throw new Error(`expected StoryboardWidgetCanvas render state to refresh stable fixed-card graph on content-only edits: ${snippet}`)
    }
  }
  if (storyboardWidgetSurfaceSource.includes('return nodes.map(node => String(node?.id || \'\').trim()).filter(Boolean)')) {
    throw new Error('expected Storyboard fixed-card mode to hide only card-overlay nodes so dropped Rich Media Panels stay visible on FlowCanvas')
  }
  if (storyboardWidgetSurfaceSource.includes('hideNodeIds={flowCanvasHiddenNodeIds}') || storyboardWidgetSurfaceSource.includes('hidePortHandleNodeIds={flowCanvasHiddenNodeIds}')) {
    throw new Error('expected Storyboard fixed-card mode to exclude owned card nodes from the FlowCanvas graph upstream instead of masking them via hide props')
  }
  for (const snippet of ["return id === 'storyboard'", 'isStoryboardCanvas2dRenderer(resolveCanvas2dRendererId(canvas2dRenderer))',
    'isStoryboardCanvas2dRenderer(resolveCanvas2dRendererId(normalized.canvas2dRenderer))',
    "const excludeAllRichMediaPanelNodes = !storyboardWidgetFrontmatterInteractionMode && canvas2dRenderer !== 'storyboard'",
  ]) {
    if (
      !configRenderSource.includes(snippet)
      && !screenAuthorityPanSource.includes(snippet)
      && !richMediaSsotSource.includes(snippet)
      && !flowCanvasGraphStateSource.includes(snippet)
    ) {
      throw new Error(`expected Storyboard shared StoryboardWidget surface to keep dropped Rich Media Panel overlays visible: ${snippet}`)
    }
  }
  for (const snippet of [
    'draftGraphDataRef: React.MutableRefObject<GraphData | null>',
    'args.draftGraphDataRef.current || args.draftGraphData || args.baseGraphData',
    "from '@/components/StoryboardWidget/flowPortHandlePointerDrag'",
    'const portHandleDragPreviewActiveRef = React.useRef(false)',
    'document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, handlePreview)',
    "portHandleDragPreviewActiveRef.current = detail?.phase !== 'cancel'",
    'if (portHandleDragPreviewActiveRef.current) return',
  ]) {
    if (!storyboardWidgetGraphActionsSource.includes(snippet)) {
      throw new Error(`expected StoryboardWidget graph actions to append dropped Rich Media Panels against the live draft graph: ${snippet}`)
    }
  }
  for (const snippet of [
    'MEDIA_POINTER_DRAG_DROP_EVENT',
    'clearMediaPointerDragPayload',
    'hasMediaDragPayload',
    'readMediaDragPayload',
    'appendMediaPanelAtClientPoint',
    'isMediaPointerDropDistanceAccepted',
    'addRichMediaPanelFromMediaAtWorld',
    "window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handleCanvasPointerDragDrop, true)",
    'onDropCapture={(ev) => {',
    'readMediaDragPayload(ev.dataTransfer)',
    'Created Rich Media Panel node.',
  ]) {
    if (!storyboardWidgetSurfaceSource.includes(snippet)) {
      throw new Error(`expected StoryboardWidgetCanvas surface to own shared media-to-Rich-Media-Panel landing snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    'hasMediaDragPayload',
    'readMediaDragPayload',
    'MEDIA_POINTER_DRAG_DROP_EVENT',
    'appendMediaPanelFromDrop',
    'appendMediaPanelAtClientPoint',
    'isMediaPointerDragDistanceAccepted',
    'addRichMediaPanelFromMediaAtWorld({ media: { ...mediaPayload, url: mediaUrl }, releaseClientPoint: { clientX, clientY }, x: pos.x, y: pos.y })',
    "id: 'storyboard-widget-drop-media'",
    'Created Rich Media Panel node.',
    "document.addEventListener('drop', onDropCapture, true)",
    'window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, onMediaPointerDragDropCapture, true)',
  ]) {
    if (!storyboardWidgetDropBridgeSource.includes(snippet)) {
      throw new Error(`expected StoryboardWidget drop bridge to accept shared media drops into Rich Media Panel nodes: ${snippet}`)
    }
  }
  if (
    storyboardWidgetDropBridgeSource.includes('args.setPendingOverlayNode(null)')
    || storyboardWidgetDropBridgeSource.includes('args.pendingOverlayNodeIdRef.current = null')
  ) {
    throw new Error('expected pending dropped overlays to stay visible until the shared runtime confirms the committed render graph contains the node')
  }
  if (graphCanvasRootSource.includes('appendGraphCanvasMediaNode') || graphCanvasRootSource.includes('MEDIA_POINTER_DRAG_DROP_EVENT') || graphCanvasRootSource.includes('readMediaDragPayload')) {
    throw new Error('expected GraphCanvasRoot to avoid shared media-to-Rich-Media-Panel mutation ownership')
  }
  for (const snippet of [
    'openWidgetNodeIds:',
    'Array.isArray(s.openWidgetNodeIdsByRenderer?.[s.canvas2dRenderer])',
    'const preserveStoryboardOverlaySelection =',
    "canvas2dRenderer === 'storyboard'",
    'richMedia.mediaOverlayNodeIdSet?.has(selectedNodeId)',
    'openWidgetNodeIds.includes(selectedNodeId)',
    'if (preserveStoryboardOverlaySelection) return',
  ]) {
    if (!graphCanvasRootSource.includes(snippet)) {
      throw new Error(`expected GraphCanvasRoot to preserve storyboard media-panel selection while the node is rendered through the shared overlay pool: ${snippet}`)
    }
  }
  for (const snippet of [
    'buildStoryboardBoardModel',
    'data-kg-storyboard-fixed-card-overlay="1"',
    'data-kg-storyboard-fixed-card="1"',
    'Storyboard card ${card.title}',
    'computeStoryboardWidgetOverlayScreenBox({',
    'applyVectorPaintedOverlayBox(item.el, {',
    'scale: box.scale',
    'strybldrStoryboardBoardLayoutMode',
    'const cardCount = packedCards.length',
    'centerLaneOffset',
    'const columnIndex = index % columnCount',
    'const rowIndex = Math.floor(index / columnCount)',
    'readSnapGridConfigFromSchema',
    'snapPointToGrid',
    'readStableRichMediaPanelSize',
    'buildFixedStoryboardCardPlacements2d',
    'applyFixedStoryboardCardPlacementsToGraphData2d',
    'flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId',
    'graphMetaKey: props.flowWidgetStateGraphKey',
    'resolveScopedFlowWidgetNodeMap({',
    'readCanvasBoardLayoutMode',
    "storyboardBoardLayoutMode === 'fixed'",
    'CardInlineTextEditor',
    'getStoryboardWidgetPanelSurfaceChromeClassName',
    'buildStoryboardToolbarActionBindings',
    'data-kg-storyboard-fixed-card-lane',
    'data-kg-storyboard-fixed-card-rich-media-chrome="1"',
    'onCommitLane', 'onCommitTitle',
    'onCommitPrimaryText',
    'onOpenInSidepane',
    'onDuplicate',
    'onRemove',
    'const toolbarProps = buildStoryboardToolbarProps({',
    'const toolbarActionBindings = buildStoryboardToolbarActionBindings({',
    '{...toolbarProps}',
    'buildGraphNodeCanonicalTextPatch',
    'GRAPH_KEYWORD_LANE_PROPERTY_KEYS',
    'const snappedTopLeft = snapPointToGrid({',
    'data-kg-storyboard-fixed-card-layout={storyboardBoardLayoutMode}',
    'isFlowWidgetHeaderDragAllowedByPin({',
    'pinnedInCanvas: headerPinProps.headerPinned === true',
    'target?.closest(\'[data-kg-port-handle="1"],[data-kg-rich-media-resize-handle="1"]\')',
    'showPinToggle={selected && typeof headerPinProps.onHeaderTogglePinned ===',
  ]) {
    if (!graphStoryboardOverlaySource.includes(snippet)) {
      throw new Error(`expected shared Canvas surface to restore Storyboard card overlay snippet: ${snippet}`)
    }
  }
  for (const snippet of ['selectionDisabled', "toolMode === 'addEdge'"]) {
    if (graphStoryboardOverlaySource.includes(snippet)) {
      throw new Error(`expected Storyboard fixed cards to stay selectable while port handles own edge creation: ${snippet}`)
    }
  }
  for (const snippet of [
    'WidgetEditorActionsToolbar',
    "from '@/components/StoryboardWidget/richMediaOverlayToolbarProps'",
    'buildSharedRichMediaOverlayToolbarProps',
    'data-kg-rich-media-overlay-shell="1"',
    'data-kg-rich-media-overlay-shell-id={n.id}',
    'const selected = isCanonicalNodeIdEqual(activePanelId, n.id)',
    '{...buildSharedRichMediaOverlayToolbarProps()}',
    'onOpenInSidepane={() => openPanelInSidepane(n.id)}',
    'onDuplicate={() => duplicatePanel(n.id)}',
    'onRemove={() => removePanel(n.id)}',
    'className="relative h-full w-full pointer-events-auto"',
  ]) {
    if (!graphRichMediaOverlaySource.includes(snippet)) {
      throw new Error(`expected Storyboard shared Canvas Rich Media panel overlay to restore shared bubble-toolbar snippet: ${snippet}`)
    }
  }
  if (graphStoryboardOverlaySource.includes('clearOutput: false') || graphStoryboardOverlaySource.includes('updateKvEntry: false') || graphStoryboardOverlaySource.includes('run: false')) {
    throw new Error('expected Storyboard 2D card overlay to reuse the shared widget toolbar action set without a local action visibility mask')
  }
  if (graphRichMediaOverlaySource.includes('ariaLabel="Rich Media panel actions"') || graphRichMediaOverlaySource.includes('iconSizeClass="h-3.5 w-3.5"') || graphRichMediaOverlaySource.includes('WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX')) {
    throw new Error('expected Storyboard shared Canvas Rich Media panel overlay to consume shared Rich Media toolbar props instead of duplicating toolbar literals')
  }
  for (const snippet of [
    "from '@/lib/storyboardWidget/overlayWorldDrag'",
    'computeStoryboardWidgetOverlayPointerGrabOffset({',
    'computeStoryboardWidgetOverlayDraggedWorldPoint({',
    'readStoryboardWidgetOverlayCanvasOffset(svgEl)',
    'snapToGrid: false',
    'snapToGrid: true',
  ]) {
    if (!graphOverlayInteractionsSource.includes(snippet)) {
      throw new Error(`expected Storyboard Rich Media drag to reuse Storyboard Widget overlay-world drag helper snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    "from '@/lib/storyboardWidget/overlayWorldDrag'",
    'computeStoryboardWidgetOverlayPointerGrabOffset({',
    'computeStoryboardWidgetOverlayDraggedWorldPoint({',
  ]) {
    if (!storyboardWidgetDragHandlersSource.includes(snippet)) {
      throw new Error(`expected Storyboard Widget drag to reuse shared overlay-world drag helper snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    "import { screenToWorld } from '@/lib/zoom/viewport'",
    'computeVectorPaintedOverlayScreenBox',
    'computeStoryboardWidgetOverlayPointerGrabOffset',
    'computeStoryboardWidgetOverlayDraggedWorldPoint',
    'computeStoryboardWidgetOverlayScreenBox',
    'readSnapGridConfigFromSchema',
    'snapPointToGrid',
  ]) {
    if (!storyboardWidgetOverlayDragSource.includes(snippet)) {
      throw new Error(`expected Storyboard Widget overlay-world drag helper to own shared projection/snap snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    "snapToGrid: true",
  ]) {
    if (!graphOverlayInteractionsSource.includes(snippet)) {
      throw new Error(`expected Rich Media overlay drag to stay snapped to grid: ${snippet}`)
    }
  }
  for (const snippet of [
    "attr('data-kg-layer', 'scene-root')",
    "attr('role', 'presentation')",
    "attr('aria-hidden', 'true')",
    "attr('focusable', 'false')",
    "style('pointer-events', 'none')",
  ]) {
    if (!graphCanvasSceneSource.includes(snippet)) {
      throw new Error(`expected shared scene root to be transform-only instead of a noisy generic SVG target: ${snippet}`)
    }
  }
  for (const [sourceName, layerSource] of [
    ['nodes', graphCanvasNodesLayerSource],
    ['links', graphCanvasLinksLayerSource],
    ['labels', graphCanvasLabelsLayerSource],
    ['edge-labels', graphCanvasEdgeLabelsLayerSource],
    ['groups', graphCanvasGroupsLayerSource],
  ] as const) {
    if (!layerSource.includes("style('pointer-events', 'all')")) {
      throw new Error(`expected ${sourceName} layer to opt into pointer events under the non-hit-testable scene root`)
    }
  }
  for (const snippet of [
    'Visual Brief',
    'STORYBOARD_CARD_RATIO_CLASS_BY_MODE', "'9:16': 'aspect-[9/16] w-[min(22rem,calc(100vw-2rem))]'",
    'data-kg-storyboard-card-aspect={strybldrStoryboardCardAspectMode}', 'data-kg-storyboard-board-layout={strybldrStoryboardBoardLayoutMode}',
    "const shouldUseFullHeightFixedLanes = strybldrStoryboardBoardLayoutMode === 'fixed' && !isWideStoryboardLayout",
    'shouldUseFullHeightFixedLanes ? `h-full ${UI_RESPONSIVE_KANBAN_LANE_CLASSNAME}` : `max-h-full ${storyboardLaneWidthClassName}`',
    "grid-cols-[minmax(0,1fr)_minmax(13rem,0.86fr)]",
    'StoryboardMediaSelectionPanel',
    "emitFloatingPanelOpen({ tab: 'media', open: true })",
    'StoryboardMentionPill',
    'CARD_MARKDOWN_PREVIEW_CHIP_CLASS_NAME',
    'CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME',
    'resolveStoryboardActionTarget',
    "from '@/components/StoryboardCanvas/storyboardSelectAction'",
    'runStoryboardSelectAction({',
    'const selectStoryboardCardFromCanvas = () => runStoryboardSelectAction({',
    'onFocusCapture={() => {',
    'isCanonicalNodeIdEqual(selectedNodeId, resolvedCardNodeId)',
    'buildStoryboardBoardModel',
    'useKanbanDragAndDrop',
    'reorderKanbanRowIds',
    'data-kg-kanban-card-drag-region="1"',
    '...currentProperties',
    'aria-label={`Select storyboard card ${displayTitle}`}',
    "const toastId = 'storyboard:drag-status'",
    'upsertUiToast({',
    'dismissUiToast(toastId)',
    'const cardDragProps = storyboardDrag.createCardDragProps({ rowId: card.id, groupKey: lane.id })',
    'draggable={cardDragProps.draggable}',
    'onDragStart={cardDragProps.onDragStart}',
    'onDragEnd={cardDragProps.onDragEnd}',
    'const isStoryboardMoveNoOp = React.useCallback',
    'const currentSourceGroupKey = rowIdToLaneKey.get(move.rowId) || move.sourceGroupKey || \'\'',
    'const nextOrderedRowIds = reorderKanbanRowIds({',
    'isNoOpMove: isStoryboardMoveNoOp',
    'editActivation="click"',
    'WidgetEditorActionsToolbar',
    'resolveStoryboardCardPrimaryReferenceUrl',
    'buildStoryboardGraphBackedNodeLookup',
    "from '@/components/StoryboardCanvas/storyboardDuplicateAction'",
    "from '@/components/StoryboardCanvas/storyboardHelpAction'",
    "from '@/components/StoryboardCanvas/storyboardOpenSidepaneAction'",
    "from '@/components/StoryboardCanvas/storyboardRunAction'",
    "from '@/components/StoryboardCanvas/storyboardCardResetAction'",
    "from '@/components/StoryboardCanvas/storyboardConvertLoopAction'",
    "from '@/components/StoryboardCanvas/storyboardRemoveAction'",
    "from '@/components/StoryboardCanvas/storyboardSelectAction'",
    "from '@/components/StoryboardCanvas/storyboardUpdateKvEntryAction'",
    "from '@/components/StoryboardCanvas/storyboardDuplicateRouting'",
    "from '@/lib/canvas/graph-elements/mediaSpec'",
    "from '@/lib/config.storyboard-widget'",
    "import RichMediaPanel from '@/components/RichMediaPanel'",
    "import { buildFlowCanvasHeaderPinProps } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'",
    "import { resolveFlowWidgetStateGraphKey, resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'",
    'STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY',
    "from '@/lib/render/richMediaSsot'",
    'buildRichMediaPanelOverlayState',
    'buildRichMediaPanelPreviewSpec',
    'commitRichMediaPanelChange',
    'function StoryboardCanvasRichMediaPanelNode',
    'flowWidgetPinnedByNodeId: Record<string, boolean>',
    'flowWidgetStateGraphKey: string | null',
    'if (isInteractiveEventTarget(event.target)) return',
    'const stopPanelHeaderEvent = React.useCallback((event: React.SyntheticEvent) => {',
    'const headerPinProps = React.useMemo(() => buildFlowCanvasHeaderPinProps({',
    'flowWidgetPinnedByNodeId: props.flowWidgetPinnedByNodeId',
    'flowWidgetStateGraphKey: props.flowWidgetStateGraphKey',
    'data-kg-storyboard-canvas-rich-media-panel="1"',
    'data-kg-storyboard-canvas-rich-media-panel-pinned={headerPinProps.headerPinned === true ? \'1\' : \'0\'}',
    'data-kg-storyboard-widget-surface="storyboard"',
    '<RichMediaPanel',
    'panelChrome="storyboardWidget"',
    'storyboardWidgetSurfaceId="storyboard"',
    '{...headerPinProps}',
    'canvasRichMediaPanelNodes.map',
    'flowWidgetPinnedByNodeId={effectiveFlowWidgetPinnedByNodeId}',
    'flowWidgetStateGraphKey={flowWidgetStateGraphKey}',
    'const flowWidgetStateGraphKey = React.useMemo(() => resolveFlowWidgetStateGraphKey({ graphData }), [graphData])',
    'const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => resolveScopedFlowWidgetNodeMap({',
    'props[STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY] === true',
    "from '@/features/storyboard-widget-manager/resolveWidgetRegistry'",
    'FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID',
    'FLOW_RICH_MEDIA_PANEL_NODE_LABEL',
    'FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID',
    'FLOW_RICH_MEDIA_PANEL_FORM_ID',
    'FLOW_WIDGET_TYPE_ID_KEY',
    'FLOW_WIDGET_FORM_ID_KEY',
    'buildStoryboardCanvasRichMediaPanelProperties',
    'buildRichMediaPanelDroppedMediaProperties({ ...payload, url: cleanUrl, label })',
    '[STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY]: true',
    'type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID',
    'appendArgs.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID',
    'appendStrybldrStoryboardMarkdownElement({',
    "historyLabel: 'Storyboard media panel'",
    'updateStrybldrStoryboardMarkdownCardOverride({',
    'setGraphDataPreservingLayout(nextGraph)',
    'updateOpenWidgetNodeIds(prev => (prev.includes(selectedId) ? prev : [...prev, selectedId]))',
    'const handleWindowNativeMediaDragOver = (event: DragEvent) => {',
    'const handleWindowNativeMediaDrop = (event: DragEvent) => {',
    "window.addEventListener('dragover', handleWindowNativeMediaDragOver, true)",
    "window.addEventListener('drop', handleWindowNativeMediaDrop, true)",
    'buildNodeMediaProperties({',
    'includeCamelGeneric: true',
    'runCard: runStoryboardCard',
    'const generateStoryboardCardMediaFromPrompt = React.useCallback((card: StoryboardCardModel, prompt: string, parameters?: MediaLightboxPromptParameters) => {',
    'parameters?: MediaLightboxPromptParameters',
    'STORYBOARD_PROMPT_PROPERTY_KEYS',
    'updateStoryboardCardModel(card.id, nextModel)',
    'window.setTimeout(runWithCommittedPrompt, 0)',
    'const shouldUseSourceModelReadout = !!sourceModelLabel && !explicitStoryboardCardChatModel',
    'data-kg-storyboard-source-model-readout="true"',
    'const sourcePromptLabel = readStoryboardScalar(card.sourcePromptLabel)',
    'const usesNativeSourceFields = !!sourcePromptLabel || !!readStoryboardScalar(currentCardProperties.luminaNodeType)',
    'const canEditCanonicalText = canEditCard && !usesNativeSourceFields',
    'const shouldRenderSourcePromptReferenceControls = !usesNativeSourceFields && (card.references.length > 0 || !!card.href)',
    '].filter(row => row.value || canEditCanonicalText) as {',
    "{sourcePromptLabel || 'Visual Brief'}",
    '{shouldRenderSourcePromptReferenceControls ? (',
    '{card.href && !usesNativeSourceFields ? (',
    'runStoryboardWorkflowNode',
    'duplicateCard: duplicateStoryboardCard',
    'hasStrybldrStoryboardDuplicatePath',
    'const canUseStrybldrStoryboardDuplicatePathForCard = React.useCallback((card: StoryboardCardModel) => {',
    'return canUseStrybldrStoryboardDuplicatePath({',
    'runStoryboardDuplicateAction({',
    'canUseStrybldrDuplicatePath: canUseStrybldrStoryboardDuplicatePathForCard(card)',
    'commitStrybldrMutation: ({ nextMarkdownText, nextSelectedNodeId }) => commitStoryboardMarkdownMutation({',
    'commitMarkdownMutation: nextMarkdownText => commitStoryboardMarkdownMutation({',
    'const canDuplicateStoryboardCard = React.useCallback((card: StoryboardCardModel) => {',
    'getDocumentLocationFromMetadata(sourceNode?.metadata)',
    'duplicatedResult.handled',
    'selectNode: nextSelectedNodeId => selectNode(String(nextSelectedNodeId))',
    "const isMarkdownBackedCard = sourceId.startsWith('blk:md:')",
    "message: 'Duplicate is unavailable for markdown-backed storyboard cards until a durable document duplicate path is available.'",
    'duplicateDisabled: !canDuplicateStoryboardCard(card)',
    'clearCardOutput: resetStoryboardCard',
    'runStoryboardCardResetAction({',
    'showStoryboardCardHelp',
    'buildStoryboardHelpToast({',
    'openCardInSidepane: openStoryboardCardInSidepane',
    "from '@/components/StoryboardCanvas/storyboardToolbarActionBindings'",
    "from '@/components/StoryboardCanvas/storyboardToolbarProps'",
    "from '@/components/StoryboardCanvas/useStoryboardInfiniteZoom'",
    'const storyboardZoom = useStoryboardInfiniteZoom({',
    'const setStoryboardZoomViewportElement = storyboardZoom.setViewportElement',
    'const setBoardScrollElement = React.useCallback((element: HTMLElement | null) => {',
    'setStoryboardZoomViewportElement(element)',
    'data-kg-storyboard-infinite-canvas="1"',
    'data-kg-storyboard-zoom-scale={storyboardZoom.zoomScale}',
    'data-kg-storyboard-zoom-content="1"',
    'data-kg-storyboard-card-id={resolvedCardNodeId}',
    'data-kg-storyboard-card-scroll-root="1"',
    'data-kg-storyboard-card-sticky-header="1"',
    'data-kg-canvas-wheel-ignore="true"',
    'const toolbarProps = buildStoryboardToolbarProps({',
    'const toolbarActionBindings = buildStoryboardToolbarActionBindings({',
    '{...toolbarProps}',
    '{...toolbarActionBindings}',
    'runStoryboardOpenSidepaneAction({',
    'runStoryboardRunAction({',
    'removeCard: removeStoryboardCard',
    'runStoryboardRemoveAction({',
    'const openStoryboardCardWorkflowManagerMapping = React.useCallback((card: StoryboardCardModel) => {',
    'openCardWorkflowManagerMapping: openStoryboardCardWorkflowManagerMapping',
    'runStoryboardUpdateKvEntryAction({',
    'openMappingForNode: openWorkflowManagerMappingForNode',
    'registry: widgetRegistry',
    'graphMetaKind: storyboardRunBaseGraphKind',
    'convertCardToLoop: convertStoryboardCardToLoop',
    'runStoryboardConvertLoopAction({',
    'removeStrybldrStoryboardMarkdownElement',
    'commitStoryboardMarkdownMutation({',
    'runNode: runStoryboardWorkflowNode',
  ]) {
    if (!source.includes(snippet)) {
      throw new Error(`expected StoryboardCanvas to retain native storyboard contract snippet: ${snippet}`)
    }
  }
  if (source.includes('const statusPillText = activeDragStatusText || storyboardDrag.dragOutcomeMessage')) {
    throw new Error('expected StoryboardCanvas to route drag status through the shared toast host instead of a local top-left status pill')
  }
  if (source.includes('{...storyboardDrag.createCardDragProps({ rowId: card.id, groupKey: lane.id })}')) {
    throw new Error('expected StoryboardCanvas to avoid per-subsection drag-owner duplication and keep one shared drag owner on the card shell')
  }
  if (source.includes('if (hasStrybldrStoryboardDuplicatePath) return true')) {
    throw new Error('expected StoryboardCanvas duplicate routing to avoid document-wide Strybldr short-circuiting')
  }
  if (source.includes('const nextMarkdownId = hasStrybldrStoryboardDuplicatePath')) {
    throw new Error('expected StoryboardCanvas duplicate routing to choose the Strybldr append path per card')
  }
  if (source.includes('const nextMarkdownId = canUseStrybldrStoryboardDuplicatePathForCard(card)')) {
    throw new Error('expected StoryboardCanvas to centralize Strybldr duplicate markdown-id allocation in the shared action helper')
  }
  if (source.includes('chatModel: readStoryboardScalar(currentCardProperties.chatModel) || chatModel')) {
    throw new Error('expected StoryboardCanvas source-model cards to avoid prepending global chat model options')
  }
  if (source.includes('{card.href ? (\n                                      <a') || source.includes('{card.href ? (\n                                <section className="flex items-center justify-end">')) {
    throw new Error('expected StoryboardCanvas native-source cards to avoid generic Open brief/Open source actions')
  }
  if (source.includes('runStoryboardStrybldrDuplicateAction({') || source.includes('runStoryboardMarkdownDuplicateAction({')) {
    throw new Error('expected StoryboardCanvas to route both duplicate branches through one shared duplicate action helper')
  }
  if (source.includes('const converted = convertNodeToLoopInGraphData(graphData, resolvedCardNodeId)')) {
    throw new Error('expected StoryboardCanvas to centralize convert-to-loop graph mutation in the shared convert-loop action helper')
  }
  if (source.includes("updateStoryboardCanonicalProperty({\n      cardId: card.id,\n      propertyKeys: STORYBOARD_OUTPUT_PROPERTY_KEYS,")) {
    throw new Error('expected StoryboardCanvas to centralize clear-output choreography in the shared clear-output action helper')
  }
  if (source.includes("id: 'storyboard-widget-help'") && source.includes('const showStoryboardCardHelp = React.useCallback(() => {')) {
    throw new Error('expected StoryboardCanvas to centralize help toast payload construction in the shared help action helper')
  }
  if (source.includes("const selectStoryboardCardFromCanvas = () => {\n                      setSelectionSource('canvas')")) {
    throw new Error('expected StoryboardCanvas to centralize card-shell canvas selection choreography in the shared select action helper')
  }
  if (source.includes("const openStoryboardCardInSidepane = React.useCallback((card: StoryboardCardModel) => {\n    const { resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)\n    setSelectionSource('canvas')")) {
    throw new Error('expected StoryboardCanvas to centralize open-sidepane selection choreography in the shared open-sidepane action helper')
  }
  if (source.includes("onOpenInSidepane={() => {\n                                openStoryboardCardInSidepane(card)\n                              }}")) {
    throw new Error('expected StoryboardCanvas to keep the open-sidepane toolbar binder as a thin direct callback')
  }
  if (source.includes('onRun={() => runStoryboardCard(card)}') || source.includes('onDuplicate={() => duplicateStoryboardCard(card)}') || source.includes('onClearOutput={() => clearStoryboardCardOutput(card)}') || source.includes('onRemove={() => removeStoryboardCard(card)}') || source.includes('onUpdateKvEntry={() => openStoryboardCardWorkflowManagerMapping(card)}') || source.includes('onConvertToLoopNode={() => convertStoryboardCardToLoop(card)}')) {
    throw new Error('expected StoryboardCanvas to centralize per-card toolbar action lambdas in the shared toolbar binding helper')
  }
  if (source.includes('ariaLabel="Storyboard card actions"') || source.includes('navClassName="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2"') || source.includes("navStyle={{ pointerEvents: 'auto' }}") || source.includes('iconSizeClass="h-3.5 w-3.5"') || source.includes('iconStrokeWidth={1.8}') || source.includes('convertToLoopDisabled={false}') || source.includes('enableHandlesDisabled') || source.includes("actionVisibility={{\n                                enableHandles: false,\n                              }}") || source.includes("openExternalAction={buildWidgetOpenExternalAction({")) {
    throw new Error('expected StoryboardCanvas to centralize toolbar visual and presentation prop construction in the shared toolbar props helper')
  }
  if (source.includes('onEnableHandlesForAllInputs={() => { void 0 }}')) {
    throw new Error('expected StoryboardCanvas to avoid no-op enable-handles binders when the action is hidden')
  }
  if (source.includes("message: 'Run is available in Storyboard Widget for runnable graph-backed nodes.'") && source.includes('const runStoryboardCard = React.useCallback((card: StoryboardCardModel) => {')) {
    throw new Error('expected StoryboardCanvas to centralize storyboard run unavailable toast construction in the shared run action helper')
  }
  if (source.includes('void runStoryboardWorkflowNode(resolvedCardNodeId)')) {
    throw new Error('expected StoryboardCanvas to centralize storyboard run choreography in the shared run action helper')
  }
  if (source.includes("window.open(primaryReferenceUrl, '_blank', 'noopener,noreferrer')")) {
    throw new Error('expected StoryboardCanvas to centralize toolbar open-external choreography in the shared widget external action helper')
  }
  if (source.includes("onUpdateKvEntry={() => {\n                                const { sourceNode } = resolveStoryboardActionTarget(card.id)\n                                runStoryboardUpdateKvEntryAction({")) {
    throw new Error('expected StoryboardCanvas to centralize update-KV-entry choreography in the shared update-KV-entry action helper')
  }
  if (source.includes('const nextMarkdownText = removeStrybldrStoryboardMarkdownElement({')) {
    throw new Error('expected StoryboardCanvas to centralize storyboard remove branch choreography in the shared remove action helper')
  }
  if (source.includes('const strybldrRunId = readStoryboardScalar(sourceProperties.strybldrRunId)')) {
    throw new Error('expected StoryboardCanvas to centralize duplicate-path Strybldr metadata checks in the shared helper')
  }
  if (source.includes('const duplicatedRange = duplicateMarkdownLineRange({')) {
    throw new Error('expected StoryboardCanvas to centralize markdown duplicate line-range work in the shared helper')
  }
  if (source.includes('const duplicatedNodeId = committedNodes.find(node => {')) {
    throw new Error('expected StoryboardCanvas to centralize markdown duplicate reselection in the shared helper')
  }
  if (!source.includes("STORYBOARD_BRANCH_ACTION_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4'") || !source.includes("STORYBOARD_SCORECARD_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2'")) {
    throw new Error('expected StoryboardCanvas storytree and scorecard grids to use mobile-first responsive owners')
  }
  if (source.includes('grid grid-cols-4 gap-1.5') || source.includes('grid grid-cols-2 gap-1.5 text-[11px]')) {
    throw new Error('expected StoryboardCanvas to avoid fixed mobile storytree and scorecard grid literals')
  }
  for (const snippet of [
    'export function StoryboardMediaSelectionPanel',
    'Reference Pack',
    'data-kg-storyboard-media-selection-panel="1"',
    'const dropTargetProps = {',
    "'data-kg-storyboard-media-slot': '1'",
    "'data-kg-storyboard-media-slot-index': slot.index",
    "'data-kg-storyboard-media-drop-active': dropActive ? '1' : undefined",
    '{...dropTargetProps}',
    'data-kg-storyboard-media-lightbox-trigger="1"',
    'data-kg-storyboard-media-missing="1"',
    'onError={() => setMediaError(true)}',
    'data-kg-storyboard-add-media="1"',
    "from '@/lib/cards/CardMediaPreview'",
    "from '@/lib/ui/MediaKindOverlay'",
    "from '@/lib/ui/MediaLightbox'",
    "from '@/lib/ui/mediaDragPayload'",
    "from '@/lib/ui/mediaLightboxPromptParameters'",
    "from '@/lib/ui/mediaKindOverlayIcon'",
    'MediaPromptActionOverlay',
    '<figure',
    '<figcaption',
    '<button',
    'CardMediaLoadingSkeleton',
    'CardMediaPreview',
    'MediaDownloadOverlay',
    'MediaInfoOverlay',
    'MediaOpenLinkOverlay',
    'resolveMediaKindOverlayIcon',
    'data-kg-storyboard-media-overlay-root="1"',
    'readStoryboardMediaLightboxDescription(props.card)',
    'descriptionLabel="Prompt"',
    'promptSubmitLabel="Regenerate media"',
    'promptParameters={promptParameters}',
    'onGenerateMediaPrompt',
    'onDropMedia?: (card: StoryboardCardModel, slot: StoryboardMediaSelectionSlot, payload: MediaDragPayload) => void',
    'onDropMedia={props.onDropMedia ? (slot, payload) => props.onDropMedia?.(props.card, slot, payload) : undefined}',
    'buildStoryboardMediaPromptParameters({ kind: lightboxKind, model: props.model })',
    'const isStoryboardRelatedTargetInside = (currentTarget: HTMLElement, relatedTarget: EventTarget | null): boolean => {',
    'const [lightboxSlotId, setLightboxSlotId] = React.useState<string | null>(null)',
    'const lightboxSlot = lightboxSlotId ? slots.find(slot => slot.id === lightboxSlotId) || null : null',
    'onPromptSubmit={props.onGenerateMediaPrompt ? (prompt, parameters) => props.onGenerateMediaPrompt?.(props.card, prompt, parameters) : undefined}',
    'label="Modify prompt"',
    'appearance="hover"',
    '<MediaDownloadOverlay href={reference.url} kind="image"',
  ]) {
    if (!mediaSelectionSource.includes(snippet)) {
      throw new Error(`expected Storyboard media selection panel to retain shared media slot snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    'export function MediaPromptActionOverlay',
    'data-kg-media-prompt-action-overlay="1"',
    'PencilLine',
    'Modify prompt',
  ]) {
    if (!mediaKindOverlaySource.includes(snippet)) {
      throw new Error(`expected shared media overlay utilities to retain prompt action snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    'descriptionLabel?: string',
    'MediaLightboxPromptParameter',
    'promptParameters?: readonly MediaLightboxPromptParameter[]',
    'onPromptSubmit?: (value: string, parameters?: MediaLightboxPromptParameters) => void | Promise<void>',
    "from '@/lib/cards/CardMediaPreview'",
    "from '@/lib/ui/panelFormControls'",
    'data-kg-media-lightbox-media-panel="1"',
    'data-kg-media-lightbox-empty-output="1"',
    'data-kg-media-lightbox-prompt-panel="1"',
    'data-kg-media-lightbox-prompt="1"',
    'data-kg-media-lightbox-prompt-form="1"',
    'data-kg-media-lightbox-prompt-input="1"',
    "event.key === 'Enter' && !event.shiftKey",
    'data-kg-media-lightbox-prompt-submit="1"',
    'data-kg-media-lightbox-parameter-row="1"',
    'data-kg-media-lightbox-parameter={parameter.id}',
    'aria-label={promptSubmitLabel || \'Generate media\'}',
    'title={promptSubmitLabel || \'Generate media\'}',
    '<span className="sr-only">{promptSubmitLabel || \'Generate media\'}</span>',
    'className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"',
    "parameter.id === 'model' ? 'w-[13.25rem]' : 'w-[5.25rem]'",
    '<PanelTextarea',
    '<PanelSelect',
  ]) {
    if (!mediaLightboxSource.includes(snippet)) {
      throw new Error(`expected shared media lightbox to retain prompt/media panel snippet: ${snippet}`)
    }
  }
  if (!mediaLightboxSource.includes('placementOwner="parent"') || !mediaLightboxSource.includes('data-kg-media-lightbox-audio="1"') || !mediaLightboxSource.includes('<CardMediaPreview')) {
    throw new Error('expected image/video lightbox panels to retain parent placement and audio to reuse CardMediaPreview')
  }
  for (const snippet of [
    'buildMediaLightboxPromptParameters',
    'CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS',
    'MEDIA_VARIATION_COUNT_PARAMETER_OPTIONS',
    "id: 'model'",
    "id: 'aspectRatio'",
    "id: 'resolution'",
    "id: 'duration'",
    "id: 'count'",
  ]) {
    if (!mediaLightboxPromptParametersSource.includes(snippet)) {
      throw new Error(`expected shared media prompt parameters helper to retain snippet: ${snippet}`)
    }
  }
  if (!mediaSelectionSource.includes("from '@/lib/ui/mediaLightboxPromptParameters'")) {
    throw new Error('expected Storyboard media lightbox to reuse shared media prompt parameter helper')
  }
  const starterFallbackCopy = ['Media', 'unavailable'].join(' ')
  if (mediaSelectionSource.includes(starterFallbackCopy) || mediaSelectionSource.toLowerCase().includes(starterFallbackCopy.toLowerCase())) {
    throw new Error('expected Storyboard media slots to avoid starter-style hardcoded missing-media copy')
  }
  for (const snippet of [
    'MEDIA_POINTER_DRAG_DROP_EVENT', 'claimMediaPointerDragDrop', 'isMediaPointerDragDropClaimed', 'clearMediaPointerDragPayload', 'readMediaPointerDragPayload',
    'STORYBOARD_DROPPED_PRIMARY_MEDIA_CLEAR_KEYS',
    'STORYBOARD_DROPPED_REFERENCE_KEY_BY_KIND',
    'buildStoryboardCardPrimaryMediaDropSlot',
    'const handleDropStoryboardMedia = React.useCallback((card: StoryboardCardModel, slot: StoryboardMediaSelectionSlot, payload: MediaDragPayload) => {',
    'mediaUrl: cleanUrl',
    'mediaKind: payload.kind',
    'const referenceKey = STORYBOARD_DROPPED_REFERENCE_KEY_BY_KIND[payload.kind]',
    '[referenceKey]: uniqueReferences',
    'onDropMedia={handleDropStoryboardMedia}',
    'const cardDropProps = storyboardDrag.createCardDropProps({ rowId: card.id, groupKey: lane.id })',
    'data-kg-storyboard-card-media-drop="1"',
    'const handleDropStoryboardCanvasMediaNode = React.useCallback',
    "addHistory('Storyboard canvas media')",
    'const handleStoryboardCanvasMediaNativeDrop = React.useCallback', 'const release = resolveMediaDragEventReleaseClientPoint(event.nativeEvent)', 'handleDropStoryboardCanvasMediaNode(payload, release.clientX, release.clientY)',
    'window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handleCanvasPointerDragDrop)', "window.addEventListener('pointerup', handleWindowPointerMediaRelease, true)",
    'onDropCapture={handleStoryboardCanvasMediaNativeDrop}',
    'onPointerUpCapture={handleStoryboardCanvasPointerMediaDrop}',
    'onDragOver={handleStoryboardCardMediaNativeDragOver}',
    'onDrop={handleStoryboardCardMediaNativeDrop}',
    'onPointerUp={handleStoryboardCardPointerMediaDrop}',
    'onMouseUp={handleStoryboardCardPointerMediaDrop}',
  ]) {
    if (!source.includes(snippet)) {
      throw new Error(`expected StoryboardCanvas to wire shared Media drag/drop into 2D Renderer card media: ${snippet}`)
    }
  }
  if (mediaSelectionSource.includes('buildStoryboardMediaLightboxMetadata') || mediaLightboxSource.includes('data-kg-media-lightbox-metadata') || mediaLightboxSource.includes('data-kg-media-lightbox-prompt-label="1"')) {
    throw new Error('expected media lightbox prompt panel to avoid redundant visible prompt headers and meaningless metadata footers')
  }
  if (source.includes('useStoryboardScrollZoom') || source.includes('data-kg-storyboard-zoom-shell="1"')) {
    throw new Error('expected StoryboardCanvas to use infinite-canvas zoom ownership instead of scroll-surface zoom wrappers')
  }
  if (!source.includes("'sticky top-0 z-10 border-b border-black/5 bg-white/95 px-3 py-2.5 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none'")) {
    throw new Error('expected Storyboard card header to reuse the sticky header pattern inside the card scroll root')
  }
  for (const snippet of [
    "from '@/lib/canvas/infinite-canvas-engine'",
    "from '@/components/StoryboardCanvas/storyboardInfiniteZoomMetrics'",
    "from '@/components/StoryboardCanvas/storyboardInfiniteZoomRequest'",
    'const boardViewportRef = React.useRef<HTMLElement | null>(null)',
    'const [viewportElement, setViewportElementState] = React.useState<HTMLElement | null>(null)',
    'setViewportElementState(prev => (prev === element ? prev : element))',
    'createInfiniteCanvasViewportController({',
    'resolveStoryboardInfiniteZoomRequestTransform({',
    "zoomRequest: { type: 'fit', intent: 'fitToView', at: 0 }",
    'lastInitialFitKeyRef.current = fitKey',
    'cacheKeyBase: `storyboard:${metrics.signatureKey}`',
    'const requestState = useGraphStore.getState()',
    'commitZoomTransformToStore({',
    'interactionSnapshotRef.current',
    'transformRenderFrameRef',
    'requestAnimationFrame',
  ]) {
    if (!infiniteZoomSource.includes(snippet)) {
      throw new Error(`expected Storyboard infinite zoom hook to reuse shared zoom owner snippet: ${snippet}`)
    }
  }
  if (infiniteZoomSource.includes('scrollSurfaceZoom') || infiniteZoomSource.includes('computeScrollSurfaceZoomScaleFromRequest')) {
    throw new Error('expected Storyboard infinite zoom hook to avoid scroll-surface zoom helpers')
  }
  const hookStoreSelectorSource = infiniteZoomSource.slice(
    infiniteZoomSource.indexOf('useGraphStore('),
    infiniteZoomSource.indexOf('const effectiveSchema'),
  )
  for (const forbidden of ['selectedNodeId', 'selectedNodeIds', 'selectedEdgeId', 'selectedEdgeIds', 'selectedGroupId', 'selectedGroupIds']) {
    if (hookStoreSelectorSource.includes(forbidden)) {
      throw new Error(`expected Storyboard infinite zoom hook to avoid live selection subscription churn: ${forbidden}`)
    }
  }
  for (const snippet of [
    "from '@/lib/zoom/resolveZoomRequest2d'",
    'readZoomScaleExtent(args.schema)',
    'DEFAULT_TOOLBAR_ZOOM_CONFIG',
    'selectionState: StoryboardZoomSelectionState',
    'selectedNodeIds: readStringArray(args.selectionState.selectedNodeIds)',
    "cacheKeyBase: args.cacheKeyBase || 'storyboard'",
  ]) {
    if (!infiniteRequestSource.includes(snippet)) {
      throw new Error(`expected Storyboard zoom-request helper to retain lazy request resolution snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    'readStoryboardInfiniteMetrics',
    'buildStoryboardTransformCss',
    'buildStoryboardTransformKey',
    'signatureParts',
    'GRAPH_ELEMENT_FIT_ROLE_BOUNDS_ONLY',
    'GRAPH_ELEMENT_FIT_ROLE_PROPERTY',
    'signatureKey: hashStoryboardMetricSignature(signature)',
    'offsetParent',
    'readContentRect',
  ]) {
    if (!infiniteMetricsSource.includes(snippet)) {
      throw new Error(`expected Storyboard infinite zoom metrics helper to retain cached metric snippet: ${snippet}`)
    }
  }
  for (const forbidden of ['boords', 'peacock.boords.com', 'app.boords.com', 'dreamina.capcut.com', 'dreamina octo']) {
    if (source.toLowerCase().includes(forbidden)) {
      throw new Error(`expected StoryboardCanvas to avoid copied vendor reference: ${forbidden}`)
    }
  }
}
