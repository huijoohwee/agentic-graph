import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { finalizeEdgeAuthoring } from '@/features/edge-creation/authoring'
import { appendStoryboardWidgetAuthoredEdge, appendStoryboardWidgetDraftNode, resolveStoryboardWidgetEdgeAuthoringNodeId } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions'
import { resolveProjectedRichMediaShellTransformFromGeometry } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { buildRichMediaPanelRegistryDraft } from '@/features/storyboard-widget-manager/richMediaPanelRegistryDraft'
import { buildStoryboardElementRegistryDraft } from '@/features/storyboard-widget-manager/storyboardElementRegistryDraft'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { computeRichMediaOverlayConnectedValuesByNodeId } from '@/lib/render/richMediaSsot'
import { resolveMediaPointerReleaseClientPoint } from '@/lib/ui/mediaDragPayload'
import {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import type { GraphData } from '@/lib/graph/types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const buildTestImageDataUri = (semanticId: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><title>${semanticId}</title></svg>`)}`
export function testStoryboardRichMediaPortEdgeProjectsReferenceImageIntoCard() {
  const imageUrl = buildTestImageDataUri('media-source')
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: 'media-source',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Reference media',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
          imageUrl,
        },
      },
      {
        id: 'storyboard-target',
        type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
        label: 'Target card',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_STORYBOARD_ELEMENT_FORM_ID,
          lane: 'Storyboard',
        },
      },
    ],
    edges: [],
  }
  const authored = finalizeEdgeAuthoring({
    mode: 'create',
    data: graphData,
    schema: null,
    label: 'linksTo',
    selectedEdgeId: null,
    from: { nodeId: 'media-source', portKey: 'imageUrl' },
    to: { nodeId: 'storyboard-target', portKey: 'mediaUrl' },
  })
  if (authored.kind !== 'create') throw new Error(`expected a typed Rich Media to Storyboard edge, got ${authored.kind}`)
  const registry = [
    { ...buildRichMediaPanelRegistryDraft(), id: 'rich-media', updatedAt: '2026-06-27T00:00:00.000Z' },
    { ...buildStoryboardElementRegistryDraft(), id: 'storyboard', updatedAt: '2026-06-27T00:00:00.000Z' },
  ]
  const board = buildStoryboardBoardModel({
    graphData: { ...graphData, edges: [authored.edge] },
    graphRevision: 1,
    widgetRegistry: registry,
  })
  const targetCard = board.lanes.flatMap(lane => lane.cards).find(card => card.id === 'storyboard-target')
  if (targetCard?.media?.url !== imageUrl || (targetCard.media.kind !== 'image' && targetCard.media.kind !== 'svg')) {
    throw new Error(`expected connected reference image in target card, got ${JSON.stringify(targetCard?.media)}`)
  }
}
export function testStoryboardCardPortEdgeProjectsImageOutputIntoRichMediaPanel() {
  const imageUrl = buildTestImageDataUri('storyboard-source')
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: 'storyboard-source',
        type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
        label: 'Source card',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_STORYBOARD_ELEMENT_FORM_ID,
          lane: 'Storyboard',
          imageUrl,
        },
      },
      {
        id: 'media-target',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Output media',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
          imageUrl: '',
        },
      },
    ],
    edges: [],
  }
  const authored = finalizeEdgeAuthoring({
    mode: 'create',
    data: graphData,
    schema: null,
    label: 'linksTo',
    selectedEdgeId: null,
    from: { nodeId: 'storyboard-source', portKey: 'imageUrl' },
    to: { nodeId: 'media-target', portKey: 'imageUrl' },
  })
  if (authored.kind !== 'create') throw new Error(`expected typed Storyboard to Rich Media edge, got ${authored.kind}`)
  const registry = [
    { ...buildRichMediaPanelRegistryDraft(), id: 'rich-media', updatedAt: '2026-06-27T00:00:00.000Z' },
    { ...buildStoryboardElementRegistryDraft(), id: 'storyboard', updatedAt: '2026-06-27T00:00:00.000Z' },
  ]
  const connectedValues = computeRichMediaOverlayConnectedValuesByNodeId({
    graphData: { ...graphData, edges: [authored.edge] },
    graphRevision: 1,
    registry,
    includeMediaSpecNodes: true,
  })
  const imageValue = connectedValues.get('media-target')?.['properties.imageUrl']?.value
  if (imageValue !== imageUrl) {
    throw new Error(`expected Card image output in Rich Media Panel target, got ${JSON.stringify(imageValue)}`)
  }
}
export function testStoryboardPropsPanelEdgeRequestUsesSharedOverlayAuthoring() {
  const surface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  const requestBridge = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardEdgeCreationRequest.ts'), 'utf8')
  const nativeEdgeEffect = readFileSync(resolve(process.cwd(), 'src/components/GraphCanvas/hooks/useEdgeCreationEffect.ts'), 'utf8')
  if (!surface.includes('useStoryboardEdgeCreationRequest({') || !requestBridge.includes('state.edgeCreationRequest') || !requestBridge.includes('beginEdge(sourceId, null)')) {
    throw new Error('expected Storyboard to consume Props Panel edge requests through shared Storyboard Widget authoring')
  }
  if (!nativeEdgeEffect.includes("edgeCreationRequest.type === 'create' && isStoryboardCanvas2dRenderer(state.canvas2dRenderer)")) {
    throw new Error('expected native GraphCanvas edge authoring to defer Storyboard requests to the overlay owner')
  }
}

export function testStoryboardPortDragResolvesWorkspaceQualifiedMediaNodeId() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'media-node', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label: 'Media', properties: {} }],
    edges: [],
  }
  const resolved = resolveStoryboardWidgetEdgeAuthoringNodeId(graphData, 'workspace:document::media-node')
  if (resolved !== 'media-node') {
    throw new Error(`expected workspace-qualified overlay endpoint to resolve to media-node, got ${String(resolved)}`)
  }
}

export function testStoryboardPortEdgesReuseSharedOverlayEdgeSurface() {
  const proxy = readFileSync(resolve(process.cwd(), 'src/lib/canvas/storyboard-widget-overlay-proxy.ts'), 'utf8')
  const cards = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx'), 'utf8')
  const cardProjection = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d.ts'), 'utf8')
  const media = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx'), 'utf8')
  const runtime = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const surface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  if (!proxy.includes('SEMANTIC_FLOW_OVERLAY_ROOT_SELECTOR') || !proxy.includes('`[data-node-id][${STORYBOARD_WIDGET_OVERLAY_SURFACE_ATTR}]`')) {
    throw new Error('expected semantic widgets to reuse the shared Storyboard Widget edge surface contract')
  }
  if (!cards.includes('data-node-id={card.id}') || !cards.includes('data-kg-storyboard-widget-surface={storyboardWidgetSurfaceId}')) {
    throw new Error('expected Storyboard cards to register with the shared overlay-edge surface')
  }
  if (!media.includes('data-node-id={node.id}') || !media.includes('data-kg-storyboard-widget-surface={storyboardWidgetOverlaySurfaceId || undefined}')) {
    throw new Error('expected Rich Media panels to register with the shared overlay-edge surface')
  }
  if (!runtime.includes('overlayOnlyActive || hasOverlayEditors || storyboardCardsMode')) {
    throw new Error('expected Storyboard to activate the shared overlay-edge renderer')
  }
  if (!runtime.includes('hasOverlayEditors={overlayEdgeHostActive}')) {
    throw new Error('expected Storyboard drag/pan/zoom frames to invalidate shared overlay-edge geometry')
  }
  if (!cardProjection.includes('emitStoryboardWidgetGeometryCommitted()')) {
    throw new Error('expected fixed Storyboard card screen-box writes to resync shared overlay-edge geometry')
  }
  if (!surface.includes('props.overlayOnlyActive || props.hasOverlayEditors || storyboardCardsActive')) {
    throw new Error('expected Storyboard to mount the shared overlay-edge SVG surface')
  }
}

export function testStoryboardCrossSurfaceEdgeUsesStoryboardWidgetDraftAuthority() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'workspace:media::panel', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label: 'Media', properties: {} },
      { id: 'card', type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID, label: 'Card', properties: {} },
    ],
    edges: [],
  }
  const authored = finalizeEdgeAuthoring({
    mode: 'create',
    data: graphData,
    schema: null,
    label: 'linksTo',
    selectedEdgeId: null,
    from: { nodeId: 'workspace:media::panel', portKey: 'imageUrl' },
    to: { nodeId: 'card', portKey: 'mediaUrl' },
  })
  if (authored.kind !== 'create') throw new Error(`expected cross-surface edge creation, got ${authored.kind}`)
  const next = appendStoryboardWidgetAuthoredEdge(graphData, authored.edge)
  if (next.edges.length !== 1 || next.edges[0]?.source !== 'workspace:media::panel' || next.edges[0]?.target !== 'card') {
    throw new Error(`expected Storyboard Widget draft to retain cross-surface endpoints, got ${JSON.stringify(next.edges)}`)
  }
}

export function testStoryboardPortEdgeKeepsPendingRichMediaPanelInDraft() {
  const baseGraphData: GraphData = {
    type: 'Graph',
    metadata: { graphDataRevision: 4 },
    nodes: [
      { id: 'card', type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID, label: 'Card', properties: {} },
    ],
    edges: [],
  }
  const pendingPanel = {
    id: 'pending-media-panel',
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: 'Dropped media',
    properties: { imageUrl: buildTestImageDataUri('pending-media') },
  }
  const draftWithPanel = appendStoryboardWidgetDraftNode(baseGraphData, pendingPanel, { revisionFloor: 4 })
  const authored = finalizeEdgeAuthoring({
    mode: 'create',
    data: draftWithPanel,
    schema: null,
    label: 'linksTo',
    selectedEdgeId: null,
    from: { nodeId: 'pending-media-panel', portKey: 'imageUrl' },
    to: { nodeId: 'card', portKey: 'mediaUrl' },
  })
  if (authored.kind !== 'create') throw new Error(`expected pending Rich Media edge creation, got ${authored.kind}`)
  const nextDraft = appendStoryboardWidgetAuthoredEdge(draftWithPanel, authored.edge, { revisionFloor: 5 })
  const nodeIds = new Set((nextDraft.nodes || []).map(node => String(node.id || '')))
  if (!nodeIds.has('pending-media-panel') || !nodeIds.has('card')) {
    throw new Error(`expected draft to retain pending Rich Media panel and target card, got ${JSON.stringify([...nodeIds])}`)
  }
  if ((nextDraft.edges || []).length !== 1) {
    throw new Error(`expected authored edge to remain in same draft graph, got ${JSON.stringify(nextDraft.edges)}`)
  }
  const revision = Number(((nextDraft.metadata || {}) as Record<string, unknown>).graphDataRevision || 0)
  if (!Number.isFinite(revision) || revision <= 5) {
    throw new Error(`expected authored Storyboard draft revision to outrun live/base reset, got ${revision}`)
  }
}

export function testStoryboardPortEdgeSelectsAuthoredEdgeAfterCreate() {
  const actions = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts'), 'utf8')
  const edgeActions = readFileSync(resolve(process.cwd(), 'src/hooks/store/graph-data-slice/graphDataEdgeActions.ts'), 'utf8')
  if (!actions.includes("import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'")) {
    throw new Error('expected Storyboard/Storyboard Widget port edge authoring to reuse the shared auto-zoom disable helper')
  }
  const createBranch = actions.slice(actions.indexOf("if (result.kind === 'create')"))
  if (!createBranch.includes('disableAutoZoomModesForUserGesture(useGraphStore.getState())')) {
    throw new Error('expected authored Storyboard edge creation to suppress auto-zoom side effects before selecting the new edge')
  }
  if (!createBranch.includes("args.selectEdge(String(result.edge.id || ''))") || !createBranch.includes('args.selectNode(null)')) {
    throw new Error('expected Storyboard/Storyboard Widget port edge creation to select the authored edge so it remains visible after pending preview clears')
  }
  if (createBranch.indexOf('disableAutoZoomModesForUserGesture(useGraphStore.getState())') > createBranch.indexOf("args.selectEdge(String(result.edge.id || ''))")) {
    throw new Error('expected authored edge creation to disable auto-zoom before selecting the new edge')
  }
  if (createBranch.indexOf("args.selectEdge(String(result.edge.id || ''))") > createBranch.indexOf("args.setToolMode('select')")) {
    throw new Error('expected authored edge selection before leaving addEdge mode')
  }
  if (!edgeActions.includes('get().setGraphDataPreservingLayout(nextGraphData)')) {
    throw new Error('expected composed Storyboard edge commits to preserve widget layout when source-layer recomposition rewrites the graph after edge creation')
  }
}

export function testStoryboardRichMediaOverlaySelectionMountsSharedPortHandles() {
  const mediaOverlays = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx'), 'utf8')
  const headerToolbar = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar.ts'), 'utf8')
  const overlayHandles = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/StoryboardWidgetOverlayPortHandles.tsx'), 'utf8')
  const nodeHandles = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorPortHandles.tsx'), 'utf8')
  const overlayEdges = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetOverlayEdges.ts'), 'utf8')
  const runtime = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const surface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  if (!headerToolbar.includes("selectionSource: 'canvas'") || !headerToolbar.includes('selectedNodeIds: [nodeId]')) {
    throw new Error('expected Rich Media overlay selection owner to update global selected node state for shared port handles')
  }
  if (!mediaOverlays.includes('onPointerDownCapture={event => {')
    || !mediaOverlays.includes('const id = String(node.id ||')
    || !mediaOverlays.includes('richMediaPanelHeaderToolbar.activate()')
    || !mediaOverlays.includes('const hasSelectionChrome =')
    || !mediaOverlays.includes('<StoryboardWidgetOverlayPortHandles nodeId={node.id} selected={hasSelectionChrome} />')) {
    throw new Error('expected Rich Media overlay pointer selection to feed the shared port-handle owner')
  }
  if (!headerToolbar.includes('st.updateOpenWidgetNodeIds(prev => (prev.includes(nodeId) ? prev : [...prev, nodeId]))')) {
    throw new Error('expected Rich Media overlay reselection on Storyboard to reopen the panel in shared open-widget state')
  }
  if (!overlayHandles.includes('resolveGraphNodeByCanonicalId(interaction?.graphData, nodeId)') || !overlayHandles.includes('(!props.selected && !isPendingTarget)') || !overlayHandles.includes('inputOnly={isPendingTarget && !props.selected}')) {
    throw new Error('expected shared overlay handles to expose input-only targets during an explicit edge drag')
  }
  if (!overlayHandles.includes('FLOW_PORT_HANDLE_FINALIZE_EVENT') || !overlayHandles.includes('value.finalizeEdge(targetNodeId, detail.targetPortKey, {')) {
    throw new Error('expected shared overlay port handles to consume semantic drag-finalize events')
  }
  if (!overlayHandles.includes('FLOW_PORT_HANDLE_CANCEL_EVENT') || !overlayHandles.includes('value.cancelEdge()')) {
    throw new Error('expected missed Card/Rich Media source-handle drags to cancel add-edge mode through the shared overlay owner')
  }
  if (!overlayHandles.includes('readFlowPortHandleAtClientPoint') || !overlayHandles.includes('startFlowPortHandlePointerDrag({ event, sourceNodeId, sourcePortKey })')) {
    throw new Error('expected covered Rich Media source handles to reuse the shared pointer-drag utility instead of a Rich Media-only handler')
  }
  if (!runtime.includes('cancelPendingEdge={cancelPendingEdge}') || !surface.includes("event.key !== 'Escape' || props.toolMode !== 'addEdge'")) {
    throw new Error('expected Storyboard edge creation to support shared Escape cancel without a target handle')
  }
  if (!surface.includes('FLOW_PORT_HANDLE_SELECTOR') || !surface.includes('readFlowPortHandleAtClientPoint({ clientX: event.clientX, clientY: event.clientY })')) {
    throw new Error('expected shared add-edge cancel to preserve covered port handles while allowing blank-click abort')
  }
  const cursorEffectStart = overlayEdges.indexOf('const onMove = (e: MouseEvent | PointerEvent)')
  const cursorEffectEnd = overlayEdges.indexOf('}, [args.active, args.rootRef, scheduleOverlayEdgeUpdate])', Math.max(0, cursorEffectStart))
  const cursorEffect = cursorEffectStart >= 0 && cursorEffectEnd > cursorEffectStart
    ? overlayEdges.slice(cursorEffectStart, cursorEffectEnd)
    : ''
  if (!overlayEdges.includes('FLOW_PORT_HANDLE_PREVIEW_EVENT') || !overlayEdges.includes("toolMode: 'addEdge', sourceId: source.id, sourcePortKey: source.portKey")) {
    throw new Error('expected shared overlay edge preview to consume immediate port-handle preview events')
  }
  if (!overlayEdges.includes('document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, onPreview)') || !overlayEdges.includes('pendingEdgeCursorRef.current')) {
    throw new Error('expected shared overlay edge preview to track cursor movement through port-handle preview events')
  }
  if (!overlayEdges.includes('function collectRequestedOverlayIdentityIds(args: {')) {
    throw new Error('expected shared overlay edge preview to compute the current requested overlay identities before choosing a stable graph')
  }
  if (!overlayEdges.includes('pendingEdgeSourceId: args.pendingEdgeSourceId') || !overlayEdges.includes('pendingPreviewSourceId: pendingEdgePreviewRef.current.sourceId')) {
    throw new Error('expected shared overlay edge preview to keep pending source identities in the requested overlay identity set')
  }
  if (!overlayEdges.includes('const stableGraphContainsRequestedOverlayIdentities = graphContainsRequestedOverlayIdentities(stableGraph, requestedOverlayIdentityIds)')) {
    throw new Error('expected shared overlay edge preview to verify stable graph reuse against current requested overlay identities')
  }
  if (!overlayEdges.includes('&& stableGraphContainsRequestedOverlayIdentities')) {
    throw new Error('expected shared overlay edge preview to refuse stable graph reuse when it would drop the active Storyboard source overlay')
  }
  if (!overlayEdges.includes('const lastStableOverlayRectByNodeIdRef = React.useRef<Map<string, StableOverlayRectSnapshot>>(new Map())')) {
    throw new Error('expected shared overlay edge preview to retain the last stable source rect across transient Storyboard overlay churn')
  }
  if (!overlayEdges.includes('const pendingEdgeStartPointRef = React.useRef<PendingEdgeStartPointSnapshot | null>(null)')) {
    throw new Error('expected shared overlay edge preview to retain the drag-start anchor as a final fallback for live-route pending previews')
  }
  if (!overlayEdges.includes('stableRects.set(id, { rect: cloneDomRect(rect), ts: nextTs })')) {
    throw new Error('expected shared overlay edge preview to snapshot stable overlay rect geometry for active nodes')
  }
  if (!overlayEdges.includes('const sRect = sourceId ? overlayRectsByNodeId.get(sourceId) || cachedSourceRect : null')) {
    throw new Error('expected shared overlay edge preview to fall back to a recent stable source rect when the live overlay root briefly disappears')
  }
  if (!overlayEdges.includes("if (source?.phase === 'start' && source.id && Number.isFinite(x) && Number.isFinite(y))")) {
    throw new Error('expected shared overlay edge preview to snapshot the source handle drag-start point')
  }
  if (!overlayEdges.includes('cachedStartPointAvailable: !!cachedStartPoint')) {
    throw new Error('expected pending-edge debug state to expose drag-start fallback availability')
  }
  if (!overlayEdges.includes('if ((sRect || cachedStartPoint) && cursor) {')) {
    throw new Error('expected pending-edge preview to render from either the overlay rect or the cached drag-start anchor')
  }
  if (!overlayEdges.includes('const nextPendingEdgePreview = {') || !overlayEdges.includes('if (nextPendingEdgePreview.toolMode !== \'addEdge\' || !nextPendingEdgePreview.sourceId) {') || !overlayEdges.includes('scheduleOverlayEdgeUpdate()')) {
    throw new Error('expected shared overlay edge preview state transitions to force a redraw and retire lingering pending-edge residue after finalize/cancel')
  }
  if (!overlayEdges.includes("'[data-kg-storyboard-fixed-card-id]'")) {
    throw new Error('expected Storyboard overlay edge runtime to discover visible fixed-card ids from the shared surface DOM')
  }
  if (!overlayEdges.includes('const requestedOverlayIdentityIdsBase = collectRequestedOverlayIdentityIds({')) {
    throw new Error('expected Storyboard overlay edge runtime to build a base requested-id set before widening hybrid media-to-card routing context')
  }
  if (overlayEdges.includes('requestedOverlayIdentityIdsBase.length > 0')) {
    throw new Error('expected Storyboard overlay edge runtime to widen requested ids with fixed cards without requiring a pre-existing overlay edge context')
  }
  if (!overlayEdges.includes('for (let i = 0; i < domStoryboardFixedCardEntries.length; i += 1) {\n          const id = readCanonicalStoryboardWidgetOverlayIdentity(domStoryboardFixedCardEntries[i]?.id)')) {
    throw new Error('expected Storyboard overlay edge runtime to seed visible fixed-card ids into pure Card-mode overlay edge rendering')
  }
  if (cursorEffect.includes('if (!args.overlayOnlyModeEnabled) return')) {
    throw new Error('expected Storyboard port drag preview to avoid overlay-only gating')
  }
  if (!nodeHandles.includes('isCanonicalNodeIdEqual(args.pendingEdgeSourceId, nodeId)')) {
    throw new Error('expected shared overlay port handles to compare pending edge source ids canonically')
  }
  if (!nodeHandles.includes('const edgeDotHitOffsetPx = sizePx') || !nodeHandles.includes('railWidthPx + edgeDotHitOffsetPx') || !nodeHandles.includes('right: `-${edgeDotHitOffsetPx}px`') || !overlayEdges.includes('readStoryboardOverlayPortHandleSignature') || !overlayEdges.includes('const directionalRailBtn = railBtn || el.querySelector') || !overlayEdges.includes("el?.matches('[data-kg-rich-media-overlay=\"1\"], [data-kg-storyboard-fixed-card=\"1\"]') ? 50")) {
    throw new Error('expected edge geometry to use the visible draggable directional rail')
  }
  const pointerDownBlockStart = nodeHandles.indexOf('onPointerDown={e => {')
  const pointerDownBlockEnd = nodeHandles.indexOf('onMouseDown={e => {', Math.max(0, pointerDownBlockStart))
  const pointerDownBlock = pointerDownBlockStart >= 0 && pointerDownBlockEnd > pointerDownBlockStart ? nodeHandles.slice(pointerDownBlockStart, pointerDownBlockEnd) : ''
  if (!pointerDownBlock || pointerDownBlock.indexOf('startFlowPortHandlePointerDrag({ event: e, sourceNodeId: nodeId') > pointerDownBlock.indexOf('handleClick(p.dir, parseFlowHandleKey(p.handleId as never))')) {
    throw new Error('expected direct source-handle drag to start the shared drag session before add-edge state mutation')
  }
}

export function testStoryboardRichMediaDropCentersPanelOnPointer() {
  const projectedTransform = resolveProjectedRichMediaShellTransformFromGeometry({
    rect: { left: 620, top: 340, width: 720, height: 406 },
    nodeTopLeft: { x: 100, y: 50 },
    panelSize: { width: 720, height: 406 },
    screenOrigin: { left: 500, top: 100 },
  })
  if (JSON.stringify(projectedTransform) !== JSON.stringify({ k: 1, x: 20, y: 190 })) {
    throw new Error(`expected projected Rich Media camera to use local surface coordinates and the panel's real visual size, got ${JSON.stringify(projectedTransform)}`)
  }
  const dropBridge = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetDropBridge.ts'), 'utf8')
  const graphActions = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts'), 'utf8')
  const runtime = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const pendingOverlayGraph = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetPendingOverlayGraph.ts'), 'utf8')
  const runtimeScene = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRuntimeScene.ts'), 'utf8')
  const surface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  const cardOverlay = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx'), 'utf8')
  const cardOwnership = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardCardOwnership2d.ts'), 'utf8')
  const mediaOverlay = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx'), 'utf8')
  const mediaOverlayPool = readFileSync(resolve(process.cwd(), 'src/lib/render/mediaOverlayPool.ts'), 'utf8')
  if (!dropBridge.includes("from '@/lib/render/richMediaPanelDefaults'")) {
    throw new Error('expected Rich Media media-drop bridge to reuse shared panel size defaults')
  }
  if (!dropBridge.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width / 2') || !dropBridge.includes('RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height / 2')) {
    throw new Error('expected dropped Rich Media Panels to center on the pointer instead of landing offset')
  }
  for (const snippet of ['fx: x', 'fy: y', 'vx: 0', 'vy: 0']) {
    if (!dropBridge.includes(snippet)) throw new Error(`expected dropped Rich Media Panels to remain pinned at the manual release position: ${snippet}`)
  }
  for (const snippet of [
    'const hasAuthoritativeGraphWorldAnchor = (rawId: string): boolean => {',
    'const hasXY = Number.isFinite(node.x) && Number.isFinite(node.y)',
    'const hasFixedXY = Number.isFinite(node.fx) && Number.isFinite(node.fy)',
    'if (forceSceneEmptyReseed) return !hasAuthoritativeGraphWorldAnchor(id)',
    'return !hasAuthoritativeGraphWorldAnchor(id)',
    '|| (initialCollectiveCenteringPass && !hasAuthoritativeWorldAnchor)',
    'const unanchoredPinnedOpenIds = pinnedOpenIds.filter(id => !hasAuthoritativeGraphWorldAnchor(id))',
  ]) {
    if (!runtimeScene.includes(snippet)) {
      throw new Error(`expected dropped Rich Media Panels with authored graph coordinates to stay out of collective reseed authority: ${snippet}`)
    }
  }
  for (const snippet of ['fx: next.x', 'fy: next.y', 'vx: 0', 'vy: 0']) {
    if (!mediaOverlay.includes(snippet)) throw new Error(`expected Rich Media Panel drag to update the shared pinned world position: ${snippet}`)
  }
  for (const [label, text] of [
    ['drop bridge', dropBridge],
    ['draft node actions', graphActions],
    ['runtime pending overlay merge', pendingOverlayGraph],
  ] as const) {
    if (!text.includes('addStoryboardWidgetNodeIdVariants') && !text.includes('addStoryboardWidgetUsedNodeIdVariants')) {
      throw new Error(`expected ${label} to reserve workspace-qualified ids and canonical suffixes before creating or merging dropped Rich Media Panels`)
    }
  }
  if (!runtime.includes("from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetPendingOverlayGraph'")) {
    throw new Error('expected StoryboardWidgetCanvas runtime to delegate pending overlay graph merging to the focused helper')
  }
  if (!runtime.includes('resolvePendingOverlayGraphDataBase({')
    || !pendingOverlayGraph.includes('export function resolvePendingOverlayGraphDataBase(args:')
    || !pendingOverlayGraph.includes('if (!args.storyboardCardsMode) return args.flowCanvasGraphDataOverride')
    || !pendingOverlayGraph.includes('|| args.renderGraphDataOverride')
    || !runtime.includes('resolvePendingOverlayGraphDataBase({ baseGraphData, draftGraphData, flowCanvasGraphDataOverride, renderGraphDataOverride, storyboardCardsMode })')) {
    throw new Error('expected Storyboard pending Rich Media overlays to merge into the parsed Storyboard source graph, not only the FlowCanvas override')
  }
  if (!runtime.includes('resolveGraphNodeByCanonicalId(baseGraphData, id)') || !runtime.includes('}, [baseGraphData])')) {
    throw new Error('expected pending Rich Media overlays to retire only after the authoritative base graph contains the committed node')
  }
  if (runtime.includes('resolveGraphNodeByCanonicalId(flowCanvasGraphDataOverride, id)')) {
    throw new Error('forbid draft-derived Storyboard render projection from retiring pending Rich Media overlays')
  }
  if (!runtime.includes('const pendingOverlayStillSelectedOrOpen = (id: string): boolean => {')
    || !runtime.includes('const pendingSelectedId = String(pendingSelectNodeIdRef.current || \'\').trim()')
    || !runtime.includes('const pendingOpenId = String(pendingOpenWidgetNodeIdRef.current || \'\').trim()')
    || !runtime.includes('!resolveGraphNodeByCanonicalId(baseGraphData, id) && pendingOverlayStillSelectedOrOpen(id)')
    || !runtime.includes('pendingOverlayNode || pendingOverlayStillSelectedOrOpen(pendingId)')) {
    throw new Error('expected pending Rich Media overlays to clear stranded residue only after the panel is no longer selected or open in shared widget state')
  }
  const overlaySurface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetOverlaySurface.tsx'), 'utf8')
  const sharedWidgetCanvas = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared.tsx'), 'utf8')
  if (!overlaySurface.includes('selectedNodeId: selectedOverlayEditorNodeIdForDerivation')) throw new Error('expected pending Storyboard widget panels to derive selected overlay editor ids through the shared duplicate-suppression gate')
  if (!sharedWidgetCanvas.includes("String(args.storyboardWidgetSurfaceId || '').trim() !== 'storyboard'") || !sharedWidgetCanvas.includes('isRichMediaPanelNode(node) ? null : selectedNodeId')) throw new Error('expected selected Storyboard Rich Media panels to stay on the canvas media overlay instead of opening a duplicate floating widget editor')
  const overlayElements = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceElements.tsx'), 'utf8')
  const pendingResolveIndex = overlayElements.indexOf('if (pending && pending === id) return args.pendingOverlayNode')
  if (pendingResolveIndex < 0 || pendingResolveIndex > overlayElements.indexOf('const found = args.renderGraphNodeById.get(id) || null')) {
    throw new Error('expected pending Rich Media overlay nodes to render before stable frontmatter graph fallbacks can drop authored coordinates')
  }
  const renderState = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRenderState.ts'), 'utf8')
  const stableRenderEffectStart = renderState.indexOf('React.useLayoutEffect(() => {', renderState.indexOf('const [stableRenderGraphOverride'))
  const stableRenderEffectEnd = renderState.indexOf('const renderGraphDataOverride', stableRenderEffectStart)
  const stableRenderEffect = renderState.slice(stableRenderEffectStart, stableRenderEffectEnd)
  if (stableRenderEffect.includes('\n    stableRenderGraphOverride,\n')) {
    throw new Error('forbid stable render cache state from retriggering its own layout effect after Storyboard drops')
  }
  if (!renderState.includes('setStableRenderGraphOverride(prev => (prev === null ? prev : null))')) {
    throw new Error('expected stable render cache cleanup to use an idempotent functional update')
  }
  if (!cardOwnership.includes("String(node.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID")) {
    throw new Error('expected Rich Media Panels to remain FlowCanvas-owned beside fixed Storyboard cards')
  }
  if (!mediaOverlay.includes('const richMediaInfiniteCanvasMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === \'flowCanvas\'')
    || !mediaOverlay.includes('const mediaOverlayDragInteractionMode = storyboardWidgetSurfaceRendererMode || storyboardSharedSurfaceRendererMode || canvas2dRenderer === \'flowCanvas\'')) {
    throw new Error('expected Storyboard Rich Media Panels to use manual canvas placement and drag authority, not balanced viewport layout')
  }
  const mediaOverlayWorldPoint = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/flowCanvasMediaOverlayWorldPoint.ts'), 'utf8')
  if (!mediaOverlayPool.includes('x?: number')
    || !mediaOverlayPool.includes("...(typeof n0.x === 'number' && Number.isFinite(n0.x) ? { x: n0.x } : {})")
    || !mediaOverlay.includes("from '@/components/FlowCanvas/flowCanvasMediaOverlayWorldPoint'")
    || !mediaOverlayWorldPoint.includes('export function readNodeWorldTopLeft2d(')
    || !mediaOverlayWorldPoint.includes('export function readNodeWorldCenterFromTopLeft2d(')
    || !mediaOverlay.includes('readNodeWorldTopLeft2d(mediaNodes.find(node => isCanonicalNodeIdEqual(node?.id, id)))')
    || !mediaOverlay.includes("readNodeWorldCenterFromTopLeft2d(mediaNodes.find(node => isCanonicalNodeIdEqual(node?.id, id)))")) {
    throw new Error('expected Rich Media overlay nodes to preserve dropped graph coordinates for immediate Storyboard placement')
  }
  if (mediaOverlay.includes('http://127.0.0.1:7777') || mediaOverlay.includes('[DEBUG] rich media overlay selected/opened on storyboard surface')) {
    throw new Error('forbid hardcoded Storyboard Rich Media overlay debug endpoints in the shared media surface')
  }
  if (surface.includes('http://127.0.0.1:7777') || surface.includes('storyboard-media-panel-loop') || surface.includes('[DEBUG]')) {
    throw new Error('forbid hardcoded Storyboard surface debug endpoints and debug traces in the shared media drop owner')
  }
  const overlayPlacementRuntime = ['src/components/StoryboardWidget/useWidgetPlacementRuntime.ts', 'src/components/StoryboardWidget/widgetPlacementRuntimeProjection.ts'].map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n')
  if (!overlayPlacementRuntime.includes('const hasAuthoritativeNodeWorldPos = (liveX != null && liveY != null) || (nx != null && ny != null)')
    || !overlayPlacementRuntime.includes('&& !hasAuthoritativeNodeWorldPos')
    || !overlayPlacementRuntime.includes('hasAuthoritativeNodeWorldPos')
    || !readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/richMediaOverlayFrameSize.ts'), 'utf8').includes('return RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE')
    || !overlayPlacementRuntime.includes('const richMediaAuthoritativeScreenBase = effectiveRichMediaFrameSize && hasAuthoritativeNodeWorldPos')
    || !overlayPlacementRuntime.includes('screenY + frameHeight * (1 - panelScale) / 2')) {
    throw new Error('expected dropped Rich Media frontmatter panels to honor graph coordinates instead of balanced viewport fallback')
  }
  const motion = readFileSync(resolve(process.cwd(), 'src/lib/motion/knowgrphMotion.ts'), 'utf8')
  const rootMotion = motion.slice(motion.indexOf("preset === 'flow-widget-emphasis'"), motion.indexOf("preset === 'overlay-toolbar-enter'"))
  if (rootMotion.includes('transform:')) {
    throw new Error('forbid root widget motion from overriding overlay placement transforms during Rich Media drops')
  }
  for (const [label, text] of [['Storyboard surface', surface], ['Storyboard card overlay', cardOverlay]] as const) {
    if (!text.includes('isStoryboardFixedCardOwnedNode')) {
      throw new Error(`expected ${label} to reuse shared fixed-card ownership before hiding or rendering nodes`)
    }
  }
  if (!pendingOverlayGraph.includes('for (const node of nodes) addStoryboardWidgetNodeIdVariants(existingIds, node?.id)')) {
    throw new Error('expected pending Rich Media overlay merge to dedupe against existing workspace-qualified node ids')
  }
  if (!dropBridge.includes('for (const rid of args.reservedNodeIdsRef.current) addStoryboardWidgetUsedNodeIdVariants(used, rid)')) {
    throw new Error('expected dropped Rich Media Panel id reservation to include reserved canonical suffixes')
  }
  if (dropBridge.includes('findRichMediaPanelNodeIdBySourceKey')
    || dropBridge.includes('existingSourceNodeId')
    || dropBridge.includes('args.updateNode(existingSourceNodeId')) {
    throw new Error('forbid subsequent FloatingPanel Media drops from moving a previous Rich Media Panel by source key')
  }
  if (!dropBridge.includes('const openPendingOverlayNode = React.useCallback((rawId: unknown) => {')) {
    throw new Error('expected Storyboard Rich Media drop bridge to centralize immediate open-widget restoration for pending overlay nodes')
  }
  if (!dropBridge.includes('useGraphStore.getState().updateOpenWidgetNodeIds(prev => (prev.includes(id) ? prev : [...prev, id]))')) {
    throw new Error('expected Storyboard Rich Media drop bridge to mark pending overlay nodes open in shared widget state immediately')
  }
  const richMediaDropStart = dropBridge.indexOf('const addRichMediaPanelFromMediaAtWorld = React.useCallback((payload: { media: MediaDragPayload; releaseClientPoint?: { clientX: number; clientY: number }; x: number; y: number }) => {')
  const richMediaDropEnd = dropBridge.indexOf('\n\n  React.useEffect(() => {', richMediaDropStart)
  const richMediaDropSlice = dropBridge.slice(richMediaDropStart, richMediaDropEnd)
  if (richMediaDropSlice.includes('openPendingOverlayNode(actualId)') || richMediaDropSlice.includes('args.pendingOpenWidgetNodeIdRef.current = actualId')) throw new Error('forbid direct media drops from opening a duplicate Rich Media floating widget editor; the canvas media overlay is the owner')
  if (!richMediaDropSlice.includes('args.scheduleForceSelect(actualId, { minHoldMs: 700 })')) throw new Error('expected direct media drops to keep canvas selection without mounting a duplicate floating widget editor')
  if (!richMediaDropSlice.includes('recordMediaDropScreenAnchor(actualId, payload.releaseClientPoint)')) throw new Error('expected direct media drops to preserve the release-point screen anchor through the first overlay layout frame')
}

export function testMediaPointerReleaseUsesActualCursorPoint() {
  const pointerRelease = resolveMediaPointerReleaseClientPoint({ eventType: 'pointerup', eventClientX: 720, eventClientY: 640, lastClientX: 1010, lastClientY: 220 })
  if (pointerRelease.clientX !== 720 || pointerRelease.clientY !== 640) {
    throw new Error('expected pointer release to use the actual cursor point instead of a stale FloatingPanel move point')
  }
  const nativeDropRelease = resolveMediaPointerReleaseClientPoint({ eventType: 'drop', eventClientX: 0, eventClientY: 0, lastClientX: 720, lastClientY: 640 })
  if (nativeDropRelease.clientX !== 720 || nativeDropRelease.clientY !== 640) {
    throw new Error(`expected native drop zero coordinates to use the last real cursor point, got ${JSON.stringify(nativeDropRelease)}`)
  }
  const nativeDragRelease = resolveMediaPointerReleaseClientPoint({ eventType: 'dragend', eventClientX: 0, eventClientY: 0, lastClientX: 720, lastClientY: 640 })
  if (nativeDragRelease.clientX !== 720 || nativeDragRelease.clientY !== 640) {
    throw new Error('expected native dragend to retain the last valid dragover point')
  }
  const bridge = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetDropBridge.ts'), 'utf8')
  const surface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  if (!bridge.includes('const release = resolveMediaDragEventReleaseClientPoint(ev)') || !bridge.includes('release.clientX, release.clientY, rect')) {
    throw new Error('expected shared widget drop bridge to convert native media drops from the resolved cursor release point')
  }
  if (!surface.includes('const release = resolveMediaDragEventReleaseClientPoint(ev.nativeEvent)') || !surface.includes('release.clientX, release.clientY')) {
    throw new Error('expected Storyboard Widget surface media drops to convert native drops from the resolved cursor release point')
  }
}

export function testStoryboardPortHandleActivationForbidsTimingBasedDuplicateEdges() {
  const handles = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorPortHandles.tsx'), 'utf8')
  const dragSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/flowPortHandlePointerDrag.ts'), 'utf8')
  const overlayHandles = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/StoryboardWidgetOverlayPortHandles.tsx'), 'utf8')
  if (!handles.includes('const suppressNextPointerClickRef = React.useRef(false)')) {
    throw new Error('expected port handles to track pointer activation explicitly')
  }
  if (!handles.includes('e.detail !== 0 && suppressNextPointerClickRef.current')) {
    throw new Error('expected the native click following pointer activation to be consumed')
  }
  if (handles.includes('e.detail !== 0 && Date.now() - lastPointerActivationAtRef.current < 120')) {
    throw new Error('forbid timing-based duplicate-edge suppression')
  }
  if (handles.includes('Date.now() - lastPointerActivationAtRef.current < 120')) {
    throw new Error('expected direct port handles to stop relying on pointer-vs-mouse timing windows')
  }
  if (!handles.includes("if (p.dir === 'out' && !startedDrag) return")) {
    throw new Error('expected direct source-handle mouse fallback to yield when a shared drag session already owns the gesture')
  }
  if (!overlayHandles.includes('const startedDrag = \'pointerId\' in event')) {
    throw new Error('expected covered source-handle capture to respect the shared drag-session ownership result')
  }
  if (!overlayHandles.includes('if (!startedDrag) return')) {
    throw new Error('expected covered source-handle capture to skip duplicate beginEdge state changes when drag start is rejected')
  }
  if (!dragSource.includes('let activeFlowPortHandleDragSession: FlowPortHandleDragSession | null = null')) {
    throw new Error('expected shared port-handle drag runtime to track a single active drag session')
  }
  if (!dragSource.includes("const session = beginFlowPortHandleDragSession('pointer')") || !dragSource.includes("const session = beginFlowPortHandleDragSession('mouse')")) {
    throw new Error('expected both pointer and mouse port-handle drags to claim the shared drag session before dispatching preview state')
  }
  if (!dragSource.includes("document.addEventListener('mousemove', moveMouse, true)") || !dragSource.includes("document.addEventListener('mouseup', finishMouse, true)")) {
    throw new Error('expected pointer-owned source drag sessions to continue consuming mouse move/up events without re-opening a duplicate mouse drag')
  }
  if (!dragSource.includes('function consumeFlowPortHandleDragEvent(event: Event): void') || !dragSource.includes('consumeFlowPortHandleDragEvent(event)') || !dragSource.includes('stopImmediatePropagation')) throw new Error('expected active source-handle drag move/up events to be consumed before canvas pan/zoom handlers can mutate Storyboard card projection')
  if (!dragSource.includes('shouldFreezeProjectionForFlowPortHandleDrag') || !dragSource.includes('FLOW_PORT_HANDLE_PROJECTION_SETTLE_FREEZE_MS')) throw new Error('expected source-handle edge creation to expose a projection freeze window for fixed Storyboard cards')
  if (!dragSource.includes('sourcePortKey: string | null') || !dragSource.includes('sourcePortKey: args.sourcePortKey')) throw new Error('expected finalized source-handle drags to preserve the authored source port')
  const graphActions = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts'), 'utf8')
  if (!graphActions.includes('source?: { nodeId: string; portKey: string | null }') || !graphActions.includes('const requestedSourceId = resolveStoryboardWidgetEdgeAuthoringNodeId(authoringGraphData, source?.nodeId || args.pendingEdgeSourceId)')) {
    throw new Error('expected edge materialization to use the finalized source endpoint instead of a stale pending-edge snapshot')
  }
  if (!handles.includes('e.preventDefault()')) throw new Error('expected source-handle pointer/mouse down to prevent browser/canvas default drag handling')
}
