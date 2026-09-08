import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testStoryboardFixedCardOverlaySkipsNoopTransformWrites() {
  const text = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d.ts'), 'utf8')
  for (const snippet of [
    'lastAppliedBoxByCardIdRef',
    'const boxChanged = !previousBox',
    'Math.abs(previousBox.left - box.left) >= 0.25',
    'if (!boxChanged) continue',
    'lastAppliedBoxByCardIdRef.current.set',
    'lastAppliedBoxByCardIdRef.current.delete(cardId)',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected Storyboard fixed-card overlay to avoid redundant transform writes: ${snippet}`)
    }
  }
  if (!text.includes('initialTimer = window.setTimeout(() => {')
    || !text.includes('if (initialTimer) window.clearTimeout(initialTimer)')) {
    throw new Error('expected Storyboard fixed-card overlay to schedule initial geometry independently of animation frames so hidden canvases receive placement')
  }
}

export function testStoryboardCardOverlayRestoresFlexInteractions() {
  const overlay = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx'), 'utf8')
  const projection = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d.ts'), 'utf8')
  const helper = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardCardOverlayInteractions2d.ts'), 'utf8')
  const headerInteractiveTarget = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/storyboardWidgetHeaderInteractiveTarget.ts'), 'utf8')
  const richMediaDrag = readFileSync(resolve(process.cwd(), 'src/components/RichMediaPanelOverlayDrag.ts'), 'utf8')
  const richMediaResize = readFileSync(resolve(process.cwd(), 'src/components/RichMediaPanelResizeHandle.tsx'), 'utf8')
  const richMediaSurface = readFileSync(resolve(process.cwd(), 'src/components/useRichMediaPanelSurfaceState.ts'), 'utf8')
  const overlayProxy = readFileSync(resolve(process.cwd(), 'src/lib/canvas/storyboard-widget-overlay-proxy.ts'), 'utf8')
  const pinToggleButton = readFileSync(resolve(process.cwd(), 'src/components/PinToggleIconButton.tsx'), 'utf8')
  const placements = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardCardPlacements2d.ts'), 'utf8')
  const stablePlacements = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/useStableStoryboardCardPlacements2d.ts'), 'utf8')
  const storyboardWidgetChrome = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/StoryboardWidgetPanelChrome.tsx'), 'utf8')
  const storyboardWidgetView = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidget/WidgetEditorView.tsx'), 'utf8')
  const mediaOverlays = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx'), 'utf8')
  const headerActions = readFileSync(resolve(process.cwd(), 'src/features/panels/ui/HeaderActions.tsx'), 'utf8')
  const hoverTooltip = readFileSync(resolve(process.cwd(), 'src/components/GraphHoverTooltip.tsx'), 'utf8')
  const surface = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  const listeners = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/interactions/listeners.ts'), 'utf8')
  const canvasViewMenu = readFileSync(resolve(process.cwd(), 'src/components/toolbar/canvasViewMenu.ts'), 'utf8')
  const canvasGridControls = readFileSync(resolve(process.cwd(), 'src/lib/canvas/canvasGridDisplayControls.ts'), 'utf8')
  const canvasBoardControls = readFileSync(resolve(process.cwd(), 'src/lib/canvas/canvasBoardLayoutDisplayControls.ts'), 'utf8')
  if (!projection.includes('initialTimer = window.setTimeout(() => {')
    || !projection.includes('if (initialTimer) window.clearTimeout(initialTimer)')) {
    throw new Error('expected Storyboard fixed-card overlay to schedule initial geometry independently of animation frames so hidden canvases receive placement')
  }
  for (const snippet of [
    'data-kg-overlay-pan-owner="canvas"',
    'dragHandle={cardMoveEnabled}',
    'onHeaderPointerDown={cardMoveEnabled ? event => onHeaderPointerDown(event, node) : undefined}',
    '<StoryboardCardResizeHandle',
    'useStoryboardCardOverlayWheelForwarding({ getWheelForwardTarget, rootRef })',
    'useStableStoryboardCardPlacements2d',
    'const projectedCenter = dragPlacement || settledPlacement || fixedPlacement || nodeCenter || null',
    'getWheelForwardTarget={() => props.rootRef.current?.querySelector',
    'const overlayPanOwnerCanvas =',
    'shouldUseCanvasOverlayBodyPan({ target: resolved.targetEl, overlayRoot: resolved.overlayRoot })',
    'overlayBodyViewportPan && storyboardWidgetOverlayInteractionMode && !overlayPanOwnerCanvas',
  ]) {
    if (![overlay, projection, surface, listeners].some(text => text.includes(snippet))) throw new Error(`expected Storyboard card flex interactions snippet: ${snippet}`)
  }
  for (const snippet of ['installRichMediaOverlayWheelForwarding', 'startRichMediaPanelHeaderDrag', 'beginRichMediaPanelResizeDrag', 'createRafValueScheduler', 'isStoryboardHeaderDragBlockedTarget', "'visual:width'", "'visual:height'"]) {
    if (!helper.includes(snippet)) throw new Error(`expected Storyboard card interaction helper snippet: ${snippet}`)
  }
  for (const snippet of ['[contenteditable="true"]', '[data-kg-card-inline-edit="1"]', 'shouldStoryboardWidgetHeaderYieldToInteractiveTarget']) {
    if (!headerInteractiveTarget.includes(snippet)) throw new Error(`expected shared Storyboard header interactive-target snippet: ${snippet}`)
  }
  for (const snippet of ['installWheelForwardingAndBrowserZoomGuards', 'startPointerDrag']) {
    if (!richMediaDrag.includes(snippet)) throw new Error(`expected Rich Media interaction owner to keep low-level primitive: ${snippet}`)
    if (helper.includes(snippet)) throw new Error(`expected Storyboard helper to avoid low-level Rich Media primitive: ${snippet}`)
  }
  for (const snippet of ['beginRichMediaPanelResizeDrag', 'RichMediaPanelResizeHandle']) {
    if (!richMediaResize.includes(snippet) || !helper.includes(snippet)) throw new Error(`expected Storyboard resize to reuse Rich Media owner: ${snippet}`)
  }
  if (!richMediaSurface.includes('installRichMediaOverlayWheelForwarding(element, {')) {
    throw new Error('expected Storyboard Widget Rich Media panels to reuse shared Rich Media wheel forwarding owner')
  }
  if (!storyboardWidgetView.includes('data-kg-overlay-pan-owner="canvas"')) {
    throw new Error('expected Storyboard Widget roots to reuse the Card canvas collective-pan owner contract')
  }
  for (const snippet of [
    'export const STORYBOARD_WIDGET_OVERLAY_CONTROL_SELECTOR',
    'export function shouldUseCanvasOverlayBodyPan',
    'isCanvasOverlayPanOwnedByCanvas(args.overlayRoot)',
  ]) {
    if (!overlayProxy.includes(snippet)) throw new Error(`expected shared Widget/Rich Media body-pan helper to preserve collective drag: ${snippet}`)
  }
  if (!mediaOverlays.includes('const richMediaBodyPanOwnedByCollective = storyboardSharedSurfaceRendererMode')
    || !mediaOverlays.includes('(containedByGroupPanel || richMediaPanelPinAllowsMovement) && !richMediaBodyPanOwnedByCollective')) {
    throw new Error('expected Storyboard Rich Media body drag to reuse collective canvas pan while retaining local header drag')
  }
  if (!richMediaSurface.includes('|| storyboardWidgetInteractionMode')) {
    throw new Error('expected Storyboard Rich Media panels to advertise canvas collective-pan ownership independent of pin UI state')
  }
  for (const snippet of ['CANVAS_GRID_DISPLAY_CONTROL_ID', 'SNAP_GRID_DISPLAY_CONTROL_ID', 'readCanvasGridDisplayControlActive', 'readSnapGridDisplayControlActive']) {
    if (!canvasViewMenu.includes(snippet) || !canvasGridControls.includes(snippet)) throw new Error(`expected Canvas View Grid/Snap controls to stay shared: ${snippet}`)
  }
  for (const snippet of ['CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID', 'readCanvasBoardLayoutDisplayControlActive']) {
    if (!canvasViewMenu.includes(snippet) || !canvasBoardControls.includes(snippet)) throw new Error(`expected Canvas View Board controls to stay shared: ${snippet}`)
  }
  if (!canvasBoardControls.includes('readCanvasBoardLayoutMode')) {
    throw new Error('expected shared Board layout owner to retain readCanvasBoardLayoutMode')
  }
  for (const snippet of [
    'buildFlowCanvasHeaderPinProps',
    'flowWidgetPinnedByNodeId: FlowWidgetPinnedById',
    'flowWidgetStateGraphKey: string | null',
    'flowWidgetPinnedByNodeId={effectiveFlowWidgetPinnedByNodeId}',
    'flowWidgetStateGraphKey={flowWidgetStateGraphKey}',
    'cardMoveEnabled: boolean',
    'if (cardMoveEnabled) onHeaderPointerDown(event, node)',
    'isFlowWidgetHeaderDragAllowedByPin({',
    'pinnedInCanvas: headerPinProps.headerPinned === true',
    'effectiveFlowWidgetPinnedByNodeId,',
    'fixedCardReferencePlacements: ReadonlyMap<string, StoryboardCardPlacement>',
    'fixedLayoutEnabled ? readStoryboardCardCenter2d(node) || props.fixedCardReferencePlacements.get(id) : props.fixedCardReferencePlacements.get(id) || readStoryboardCardCenter2d(node)',
    'const previousPinned = lastPinnedByCardIdRef.current.get(card.id)',
    'previousPinned === true && cardPinned === false && !dragWorldOverrideByCardIdRef.current.has(card.id)',
    'const liveBox = lastAppliedBoxByCardIdRef.current.get(card.id) || null',
    'dragWorldOverrideByCardIdRef.current.set(card.id, screenToWorld({ transform: currentTransform, sx, sy }))',
    'const preserveCardScreenPlacementForPinTransition = React.useCallback(',
    'onBeforePinnedChange: () => preserveCardScreenPlacementForPinTransition(card.id)',
    'const fixedPlacement = fixedLayoutEnabled && cardPinned ? referencePlacement : null',
    'readNodeCenter: readCardCenter',
    'updateNode: (id, patch) => onNodeChange(id, patch, graphData)',
    'onNodeChange={props.patchNodeById}',
    'duplicateDisabled: headerPinProps.headerPinned === true',
    'target?.closest(\'[data-kg-port-handle="1"],[data-kg-rich-media-resize-handle="1"]\')',
    "data-kg-storyboard-fixed-card-pinned={headerPinProps.headerPinned === true ? '1' : '0'}",
    'showPinToggle={selected && typeof headerPinProps.onHeaderTogglePinned ===',
    'pinned={headerPinProps.headerPinned === true}',
    'onTogglePinned={headerPinProps.onHeaderTogglePinned}',
    'onPinnedPointerDown={headerPinProps.onHeaderPinnedPointerDown}',
  ]) {
    if (![overlay, projection, stablePlacements, surface].some(text => text.includes(snippet))) throw new Error(`expected Storyboard card header pin/unpin to reuse shared Rich Media header pin controls: ${snippet}`)
  }
  for (const snippet of ['readCanvasBoardLayoutMode(strybldrStoryboardBoardLayoutMode)', "storyboardBoardLayoutMode === 'fixed'", 'if (!storyboardSharedSurfaceActive) return null', 'return applyFixedStoryboardCardPlacementsToGraphData2d({']) {
    if (!overlay.includes(snippet) && !surface.includes(snippet)) throw new Error(`expected Storyboard card/Rich Media surface to reuse shared Board Fixed mode: ${snippet}`)
  }
  for (const snippet of [
    "from '@/lib/storyboardWidget/flowWidgetPinnedState'",
    'flowWidgetPinnedByNodeId?: FlowWidgetPinnedById | null',
    'includeUnpinned || readFlowWidgetPinnedInCanvas(flowWidgetPinnedByNodeId, card.id)',
    'const centerOwnsReferenceOrigin = !includeUnpinned || readFlowWidgetPinnedInCanvas(flowWidgetPinnedByNodeId, packedCards[i]!.id)',
    'flowWidgetPinnedByNodeId: args.flowWidgetPinnedByNodeId',
    'referencePlacements?: ReadonlyMap<string, StoryboardCardPlacement> | null',
    'readPlacementSize?: ReadStoryboardPlacementSize',
    'if (!placement || !readFlowWidgetPinnedInCanvas(args.flowWidgetPinnedByNodeId, id)) return node',
    'export const buildFixedStoryboardCardReferencePlacements2d',
    'includeUnpinned: true',
  ]) {
    if (!placements.includes(snippet)) throw new Error(`expected Board Fixed placements to keep pin-anchored reference geometry while reusing shared pin semantics: ${snippet}`)
  }
  for (const snippet of ['reconcileStableStoryboardCardPlacements2d', 'stablePlacement || candidatePlacement', 'buildGraphDocumentMetaKey(args.graphData)']) {
    if (!stablePlacements.includes(snippet)) throw new Error(`expected pin transitions to retain existing shared reference slots: ${snippet}`)
  }
  if (overlay.includes('input,textarea,select,button,[role="button"]')) {
    throw new Error('expected Storyboard header drag guard to avoid blocking inline display editors by role')
  }
  if (!overlayProxy.includes('export const STORYBOARD_WIDGET_OVERLAY_MODE_SELECTOR = \'[data-kg-storyboard-widget-mode="1"]\'') || !overlayProxy.includes('export const STORYBOARD_WIDGET_OVERLAY_ROOT_SELECTOR = `[data-kg-widget]${STORYBOARD_WIDGET_OVERLAY_MODE_SELECTOR}`')) {
    throw new Error('expected Storyboard Widget overlay proxy to keep widget roots scoped to Storyboard widgets')
  }
  for (const snippet of ['data-kg-widget={card.id}', 'data-kg-storyboard-widget-mode="1"', 'data-kg-widget-pinned=']) {
    if (overlay.includes(snippet)) {
      throw new Error(`expected fixed Storyboard cards to stay out of Storyboard Widget collective widget scans: ${snippet}`)
    }
  }
  for (const snippet of ['selectionDisabled', 'toolMode === \'addEdge\'']) {
    if (overlay.includes(snippet)) {
      throw new Error(`expected fixed Storyboard cards to stay selectable so shared pin/unpin controls are reachable: ${snippet}`)
    }
  }
  for (const snippet of ['<PinToggleIconButton', "title={pinned ? UI_LABELS.unpinPanel : UI_LABELS.pinPanel}", 'activeIconClassName={UI_THEME_TOKENS.icon.active}']) {
    if (!storyboardWidgetChrome.includes(snippet)) throw new Error(`expected Storyboard Widget chrome to reuse shared pin toggle button: ${snippet}`)
  }
  for (const snippet of ['<PinToggleIconButton', 'title={pinned ? UI_COPY.floatingPanelUnpin : UI_COPY.floatingPanelPin}', 'ariaPressed={!!pinned}']) {
    if (!headerActions.includes(snippet)) throw new Error(`expected floating panel header actions to reuse shared pin toggle button: ${snippet}`)
  }
  for (const snippet of ['<PinToggleIconButton', 'title={tooltipPinned ? UI_COPY.floatingPanelUnpin : UI_COPY.floatingPanelPin}', 'ariaPressed={tooltipPinned}']) {
    if (!hoverTooltip.includes(snippet)) throw new Error(`expected hover tooltip to reuse shared pin toggle button: ${snippet}`)
  }
  for (const snippet of ['Pin className={renderedIconClassName}', 'PinOff className={renderedIconClassName}', 'getPinToggleButtonClassName(pinned)']) {
    if (!pinToggleButton.includes(snippet)) throw new Error(`expected shared pin toggle button to own pin/unpin icon rendering: ${snippet}`)
  }
}
