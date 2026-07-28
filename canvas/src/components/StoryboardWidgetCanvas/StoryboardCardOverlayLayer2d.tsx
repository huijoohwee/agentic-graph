import React from 'react'
import { buildFlowCanvasHeaderPinProps, type FlowCanvasHeaderPinProps } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'
import { WidgetEditorActionsToolbar } from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'
import { STORYBOARD_WIDGET_PANEL_TITLE_CLASS_NAME, StoryboardWidgetPanelChromeHeader } from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'
import { getStoryboardWidgetPanelSurfaceChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import { StoryboardWidgetOverlayPortHandles } from '@/components/StoryboardWidget/StoryboardWidgetOverlayPortHandles'
import { StoryboardCardMediaDropSlot2d } from '@/components/StoryboardWidgetCanvas/StoryboardCardMediaDropSlot2d'
import { StoryboardCardOutputEditSurface, StoryboardCardTextEditSurface } from '@/components/StoryboardWidgetCanvas/StoryboardCardTextEditSurface'
import { commitStoryboardCardCanonicalText2d } from '@/components/StoryboardWidgetCanvas/storyboardCardCanonicalTextCommit2d'
import { buildStoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
import { readStoryboardCardCenter2d, readStoryboardCardSize2d, type StoryboardCardPlacement } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { isStoryboardHeaderDragBlockedTarget, StoryboardCardResizeHandle, useStoryboardCardOverlayInteractions2d, useStoryboardCardOverlayWheelForwarding } from '@/components/StoryboardWidgetCanvas/storyboardCardOverlayInteractions2d'
import { isStoryboardFixedCardOwnedNode } from '@/components/StoryboardWidgetCanvas/storyboardCardOwnership2d'
import { shouldStoryboardCardOverlayYieldToTextEditTarget } from '@/components/StoryboardWidgetCanvas/storyboardCardSummaryEditTarget'
import { useStoryboardCardMediaDrop2d } from '@/components/StoryboardWidgetCanvas/useStoryboardCardMediaDrop2d'
import { useStoryboardCardOverlayProjection2d } from '@/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d'
import { buildStoryboardToolbarActionBindings } from '@/components/StoryboardCanvas/storyboardToolbarActionBindings'
import { invokeProbeTreeFromStoryboardToolbar } from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import { runStoryboardRemoveAction } from '@/components/StoryboardCanvas/storyboardRemoveAction'
import { mergeStoryboardMediaAlbumItems, toStoryboardMediaAlbumItem } from '@/components/StoryboardCanvas/storyboardCardMediaAlbum'
import { buildStoryboardCardMediaTextareaAttachments } from '@/components/StoryboardCanvas/storyboardCardMediaProjection'
import { buildStoryboardBoardModel, buildStoryboardInlineMediaCommandContext, type StoryboardCardModel } from '@/components/StoryboardCanvas/storyboardModel'
import type { StoryboardCardSourceReference } from '@/components/StoryboardCanvas/storyboardCardConnectedSources'
import { emitStoryboardCardProvenanceFocus } from '@/lib/storyboardWidget/storyboardCardProvenanceFocus'
import { buildStoryboardToolbarProps } from '@/components/StoryboardCanvas/storyboardToolbarProps'
import { writeActiveMarkdownDocumentTextIfPresent } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { StoryboardWidgetOverlayDragTransform } from '@/lib/storyboardWidget/overlayWorldDrag'
import type { FlowWidgetPinnedById } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import { readCanvasBoardLayoutMode } from '@/lib/canvas/canvasBoardLayoutDisplayControls'
import { activateMultiNodeSelectModeForShift, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'
import { isFlowWidgetHeaderDragAllowedByPin } from '@/lib/storyboardWidget/flowWidgetPinMovement'
import { collectGroupPanelContainedNodeIds, isGroupPanelContainedNode } from '@/lib/storyboardWidget/groupPanelContainment'
import { readStoryboardWidgetContainmentGroupAabb } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRuntimeGroupLookup'
import type { FlowNativeRuntime } from '@/components/FlowCanvas/nativeRuntime'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { buildGraphNodeCanonicalTextPatch, GRAPH_NODE_CARD_TITLE_PROPERTY_KEYS, type GraphNodeCardTextFieldSpec } from '@/lib/cards/graphNodeCardFields'
import { buildInlineMediaCommandDragPayload } from '@/lib/command-menu/inlineMediaCommandDragPayload'
import type { InlineMediaCommandCandidate } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { GRAPH_KEYWORD_LANE_PROPERTY_KEYS } from '@/lib/graph/keywordTerms'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { commitGraphOverlayNodeRemoval, commitGraphOverlayProjectionRemoval, resolveGraphOverlayNodeRemoval } from '@/lib/graph/graphOverlayNodeRemoval'
import { createUniqueId } from '@/lib/ids'
import { UI_LABELS } from '@/lib/config'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { RICH_MEDIA_PANEL_DEFAULT_CSS_VARS } from '@/lib/render/richMediaPanelDefaults'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import { screenToWorld } from '@/lib/zoom/viewport'
const STORYBOARD_CARD_OVERLAY_Z_INDEX = 60
const ignoreStoryboardCardAction = () => void 0
function StoryboardCardOverlayItem(props: {
  card: StoryboardCardModel; node: GraphNode; pendingMedia: StoryboardCardModel['media']; storyboardWidgetSurfaceId: string
  cardMoveEnabled: boolean
  register: (id: string, el: HTMLElement | null) => void; selected: boolean
  onDuplicate: (card: StoryboardCardModel) => void; onOpenInSidepane: (card: StoryboardCardModel) => void; onProbeTree: (card: StoryboardCardModel) => void; onRemove: (card: StoryboardCardModel) => void; onRun: (card: StoryboardCardModel) => void; onSelect: (card: StoryboardCardModel, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void
  onCommitLane: (card: StoryboardCardModel, nextValue: string) => void; onCommitPrimaryText: (card: StoryboardCardModel, field: GraphNodeCardTextFieldSpec, nextValue: string) => void; onCommitTitle: (card: StoryboardCardModel, nextValue: string) => void; onCommitType: (card: StoryboardCardModel, nextValue: string) => void
  onDropMedia: (card: StoryboardCardModel, payload: MediaDragPayload) => void
  onSourceReferenceActivate: (reference: StoryboardCardSourceReference) => void
  headerPinProps: FlowCanvasHeaderPinProps
  readCardSize: (node: GraphNode) => { width: number; height: number }
  onHeaderPointerDown: (event: React.PointerEvent<HTMLElement>, node: GraphNode) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>, node: GraphNode) => void
}) {
  const { card, cardMoveEnabled, storyboardWidgetSurfaceId, headerPinProps, node, onCommitLane, onCommitPrimaryText, onCommitTitle, onCommitType, onDropMedia, onDuplicate, onHeaderPointerDown, onOpenInSidepane, onProbeTree, onRemove, onResizePointerDown, onRun, onSelect, onSourceReferenceActivate, pendingMedia, readCardSize, register, selected } = props
  const { width, height } = readCardSize(node)
  const suppressShiftActivationClickRef = React.useRef(false)
  const activateCard = React.useCallback(() => {
    if (suppressShiftActivationClickRef.current) {
      suppressShiftActivationClickRef.current = false
      return
    }
    onSelect(card)
  }, [card, onSelect])
  const textModel = buildStoryboardCardTextModel(card)
  const displayMedia = pendingMedia || card.media
  const displayMediaItems = React.useMemo(() => mergeStoryboardMediaAlbumItems(
    card.mediaItems || [],
    [toStoryboardMediaAlbumItem(card.media)],
    [toStoryboardMediaAlbumItem(pendingMedia)],
  ), [card.media, card.mediaItems, pendingMedia])
  const projectedMediaAttachments = React.useMemo(() => (
    buildStoryboardCardMediaTextareaAttachments([...displayMediaItems, displayMedia], card.title)
  ), [card.title, displayMedia, displayMediaItems])
  const storyboardCommandContextText = buildStoryboardInlineMediaCommandContext(
    displayMedia === card.media ? card : { ...card, media: displayMedia },
  )
  const applyInlineMediaCommandToCard = React.useCallback((candidate: InlineMediaCommandCandidate) => {
    const payload = buildInlineMediaCommandDragPayload(candidate)
    if (!payload) return
    onDropMedia(card, payload)
  }, [card, onDropMedia])
  const toolbarProps = buildStoryboardToolbarProps({
    active: true,
    duplicateDisabled: headerPinProps.headerPinned === true,
    primaryReferenceUrl: card.href || card.references[0]?.url,
  })
  const toolbarActionBindings = buildStoryboardToolbarActionBindings({
    card, runCard: onRun, openCardInSidepane: onOpenInSidepane, duplicateCard: onDuplicate,
    clearCardOutput: ignoreStoryboardCardAction, showCardHelp: ignoreStoryboardCardAction, removeCard: onRemove,
    openCardWorkflowManagerMapping: ignoreStoryboardCardAction, probeTreeCard: onProbeTree, convertCardToLoop: ignoreStoryboardCardAction,
  })
  return (
    <article
      ref={el => register(card.id, el)}
      aria-label={`Storyboard card ${card.title}`}
      className={getStoryboardWidgetPanelSurfaceChromeClassName({
        className: 'pointer-events-auto absolute left-0 top-0 overflow-visible',
        selected,
      })}
      data-kg-storyboard-card-pixel-snap="1"
      data-kg-storyboard-card-vector-zoom="1"
      data-kg-storyboard-fixed-card="1"
      data-kg-storyboard-fixed-card-id={card.id}
      data-kg-storyboard-fixed-card-lane={card.lane || 'Storyboard'}
      data-kg-storyboard-fixed-card-rich-media-chrome="1"
      data-kg-storyboard-fixed-card-pinned={headerPinProps.headerPinned === true ? '1' : '0'}
      data-kg-storyboard-widget-selected={selected ? '1' : undefined}
      data-kg-overlay-pan-owner="canvas"
      data-node-id={card.id}
      data-kg-storyboard-widget-surface={storyboardWidgetSurfaceId}
      onClickCapture={event => {
        if (!suppressShiftActivationClickRef.current && !event.shiftKey) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDownCapture={event => {
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest('[data-kg-port-handle="1"],[data-kg-rich-media-resize-handle="1"]')) return
        if (event.shiftKey) {
          suppressShiftActivationClickRef.current = true
          onSelect(card, {
            shiftKey: true,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
          })
          event.preventDefault()
          event.stopPropagation()
          return
        }
        suppressShiftActivationClickRef.current = false
        if (target && isStoryboardHeaderDragBlockedTarget(target)) return
        if (shouldStoryboardCardOverlayYieldToTextEditTarget(target)) return
        if (target?.closest('[data-kg-rich-media-storyboard-widget-header="1"]') && !isStoryboardHeaderDragBlockedTarget(target)) {
          onSelect(card, {
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
          })
          if (cardMoveEnabled) onHeaderPointerDown(event, node)
          return
        }
        onSelect(card, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        })
      }}
      style={{
        width,
        height,
        transformOrigin: '0 0',
        ...RICH_MEDIA_PANEL_DEFAULT_CSS_VARS,
      }}
    >
      <WidgetEditorActionsToolbar
        visible={selected}
        ariaLabel={UI_LABELS.storyboardCard}
        {...toolbarProps}
        {...toolbarActionBindings}
      />
      <StoryboardWidgetOverlayPortHandles node={node} selected={selected} />
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[inherit]">
        <StoryboardWidgetPanelChromeHeader
          active
          title={card.title}
          actionsAriaLabel={UI_LABELS.storyboardCard}
          titleContent={<section className="flex min-w-0 items-center gap-1.5" data-kg-storyboard-card-title-row="1">
            <CardInlineTextEditor
              value={card.title}
              ariaLabel={`Storyboard title for ${card.id}`}
              placeholder="Add title"
              canEdit
              editActivation="click"
              editorSurface="viewer"
              inlineChipDensity="compact"
              onCommit={nextValue => onCommitTitle(card, nextValue)}
              onEditingChange={editing => { if (editing) activateCard() }}
              displayClassName={STORYBOARD_WIDGET_PANEL_TITLE_CLASS_NAME}
              editorClassName={STORYBOARD_WIDGET_PANEL_TITLE_CLASS_NAME}
            />
          </section>}
          richMediaHeader
          dragHandle={cardMoveEnabled}
          onHeaderPointerDown={cardMoveEnabled ? event => onHeaderPointerDown(event, node) : undefined}
          showFieldToggle={false}
          showPinToggle={selected && typeof headerPinProps.onHeaderTogglePinned === 'function'}
          pinned={headerPinProps.headerPinned === true}
          onTogglePinned={headerPinProps.onHeaderTogglePinned}
          onPinnedPointerDown={headerPinProps.onHeaderPinnedPointerDown}
          showValidate={false}
          showMinimizeToggle={false}
        />
        <section
          className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(6.25rem,36%)] gap-2 p-[var(--kg-media-panel-padding,6px)]"
          aria-label={`${card.title} storyboard card body`}
          data-kg-rich-media-storyboard-widget-body="1"
          data-kg-widget-body="1"
          data-kg-storyboard-card-body-layout="brief-media"
        >
          <StoryboardCardTextEditSurface
            card={card}
            textModel={textModel}
            projectedMediaAttachments={projectedMediaAttachments}
            storyboardCommandContextText={storyboardCommandContextText}
            onActivate={activateCard}
            onCommitLane={onCommitLane}
            onCommitText={onCommitPrimaryText}
            onCommitType={onCommitType}
            onMediaCommandSelect={applyInlineMediaCommandToCard}
            onSourceReferenceActivate={onSourceReferenceActivate}
          />
          {textModel.secondaryEditable && textModel.secondaryField?.id === 'output' ? (
            <StoryboardCardOutputEditSurface card={card} textModel={textModel} onActivate={activateCard} onCommitText={onCommitPrimaryText} />
          ) : (
            <StoryboardCardMediaDropSlot2d card={card} displayMedia={displayMedia} displayMediaItems={displayMediaItems} onDropMedia={onDropMedia} />
          )}
        </section>
      </section>
      {selected ? <StoryboardCardResizeHandle onPointerDown={event => onResizePointerDown(event, node)} /> : null}
    </article>
  )
}

export function StoryboardCardOverlayLayer2d(props: {
  active: boolean
  commitGraphData?: (graphData: GraphData) => void
  flowWidgetPinnedByNodeId: FlowWidgetPinnedById
  flowWidgetStateGraphKey: string | null
  fixedCardReferencePlacements: ReadonlyMap<string, StoryboardCardPlacement>
  storyboardWidgetSurfaceId: string
  storyboardCollectiveZoomBaselineKRef?: React.MutableRefObject<number | null>
  graphData: GraphData | null
  graphRevision: number
  onNodeChange: (nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => void
  removeNodeById: (nodeId: string) => void
  removePendingNodeById: (nodeId: string) => void
  getTransform: () => StoryboardWidgetOverlayDragTransform | null
  getRuntime: () => FlowNativeRuntime | null
  getWheelForwardTarget?: () => Element | null
  runWorkflowNode?: (nodeId: string) => Promise<void> | void
  schema: GraphSchema | null
  widgetRegistry: ReadonlyArray<WidgetRegistryEntry>
  registerInteractionFrameProjectionScheduler?: (scheduler: null | (() => void)) => void
}) {
  const { active, commitGraphData, storyboardWidgetSurfaceId, getTransform, getWheelForwardTarget, graphData, graphRevision, onNodeChange, removeNodeById, removePendingNodeById, runWorkflowNode, schema, widgetRegistry } = props
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const strybldrStoryboardBoardLayoutMode = useGraphStore(s => s.strybldrStoryboardBoardLayoutMode)
  const setMarkdownDocument = useGraphStore(s => s.setMarkdownDocument)
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName || null)
  const markdownDocumentText = useGraphStore(s => s.markdownDocumentText || null)
  const addNode = useGraphStore(s => s.addNode)
  const addHistory = useGraphStore(s => s.addHistory); const upsertUiToast = useGraphStore(s => s.upsertUiToast)
  const removeNode = useGraphStore(s => s.removeNode)
  const selectNode = useGraphStore(s => s.selectNode)
  const selectedNodeId = useGraphStore(s => String(s.selectedNodeId || '').trim())
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds)
  const scopedFlowWidgetPinnedByNodeId = useGraphStore(s => resolveScopedFlowWidgetNodeMap({
    graphMetaKey: props.flowWidgetStateGraphKey,
    keyedByGraphMetaKey: s.flowWidgetPinnedByNodeIdByGraphMetaKey,
    globalByNodeId: s.flowWidgetPinnedByNodeId,
  }))
  const setSelectionSource = useGraphStore(s => s.setSelectionSource)
  const updateOpenWidgetNodeIds = useGraphStore(s => s.updateOpenWidgetNodeIds)
  const requestZoom = useGraphStore(s => s.requestZoom)
  const requestZoomBounds = useGraphStore(s => s.requestZoomBounds)
  const storyboardBoardLayoutMode = readCanvasBoardLayoutMode(strybldrStoryboardBoardLayoutMode)
  const effectiveFlowWidgetPinnedByNodeId = Object.keys(scopedFlowWidgetPinnedByNodeId).length > 0
    ? scopedFlowWidgetPinnedByNodeId
    : props.flowWidgetPinnedByNodeId
  const fixedLayoutEnabled = storyboardBoardLayoutMode === 'fixed'
  const storyboardCardSizing = React.useMemo(() => ({
    aspectRatioMode: strybldrStoryboardCardAspectMode,
  }), [strybldrStoryboardCardAspectMode])
  const [activeCardId, setActiveCardId] = React.useState('')
  const rootRef = React.useRef<HTMLElement | null>(null)
  const overlayElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const dragWorldOverrideByCardIdRef = React.useRef<Map<string, { x: number; y: number }>>(new Map())
  const board = React.useMemo(
    () => buildStoryboardBoardModel({ graphData, graphRevision, widgetRegistry }),
    [graphData, graphRevision, widgetRegistry],
  )
  const nodeById = React.useMemo(() => {
    const out = new Map<string, GraphNode>()
    const nodes = Array.isArray(graphData?.nodes) ? (graphData.nodes as GraphNode[]) : []
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      const id = String(node?.id || '').trim()
      if (id) out.set(id, node)
    }
    return out
  }, [graphData])
  const cards = React.useMemo(
    () => board.lanes
      .flatMap(lane => lane.cards)
      .filter(card => isStoryboardFixedCardOwnedNode(nodeById.get(card.id))),
    [board.lanes, nodeById],
  )
  const groupPanelContainedNodeIds = React.useMemo(
    () => collectGroupPanelContainedNodeIds(graphData),
    [graphData],
  )
  const { dropCardMedia, pendingMediaByCardId } = useStoryboardCardMediaDrop2d({
    cards,
    commitGraphData,
    graphData,
    markdownDocumentName,
    markdownDocumentText,
    nodeById,
  })
  const readCardSize = React.useCallback(
    (node: GraphNode) => readStoryboardCardSize2d(node, storyboardCardSizing.aspectRatioMode),
    [storyboardCardSizing],
  )
  const setDragVisualOverride = React.useCallback((id: string, point: { x: number; y: number } | null) => { const key = String(id || '').trim(); if (!key) return; if (point) dragWorldOverrideByCardIdRef.current.set(key, point); else dragWorldOverrideByCardIdRef.current.delete(key) }, [])
  const preserveCardScreenPlacementForPinTransition = React.useCallback((id: string) => {
    const key = String(id || '').trim()
    if (!key) return
    const rect = overlayElsRef.current.get(key)?.getBoundingClientRect()
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) return
    dragWorldOverrideByCardIdRef.current.set(key, screenToWorld({
      transform: getTransform(),
      sx: rect.left + rect.width / 2,
      sy: rect.top + rect.height / 2,
    }))
  }, [getTransform])
  const readCardCenter = React.useCallback((node: GraphNode): StoryboardCardPlacement | null => {
    const id = String(node.id || '').trim()
    if (!id) return readStoryboardCardCenter2d(node)
    return dragWorldOverrideByCardIdRef.current.get(id) || (fixedLayoutEnabled ? readStoryboardCardCenter2d(node) || props.fixedCardReferencePlacements.get(id) : props.fixedCardReferencePlacements.get(id) || readStoryboardCardCenter2d(node)) || null
  }, [fixedLayoutEnabled, props.fixedCardReferencePlacements])
  useStoryboardCardOverlayWheelForwarding({ getWheelForwardTarget, rootRef })
  const interactions = useStoryboardCardOverlayInteractions2d({
    addHistory,
    getTransform,
    readContainmentBounds: id => readStoryboardWidgetContainmentGroupAabb(props.getRuntime(), id),
    readNodeCenter: readCardCenter,
    readNodeSize: readCardSize,
    schema,
    setDragVisualOverride,
    updateNode: (id, patch) => onNodeChange(id, patch, graphData),
  })
  const { clearCardProjection } = useStoryboardCardOverlayProjection2d({
    active,
    cards,
    dragWorldOverrideByCardIdRef,
    effectiveFlowWidgetPinnedByNodeId,
    fixedCardReferencePlacements: props.fixedCardReferencePlacements,
    fixedLayoutEnabled,
    getTransform,
    graphRevision,
    layoutIdentity: props.flowWidgetStateGraphKey || markdownDocumentName || storyboardWidgetSurfaceId,
    nodeById,
    overlayElsRef,
    readCardSize,
    rootRef,
    registerInteractionFrameProjectionScheduler: props.registerInteractionFrameProjectionScheduler,
    storyboardCollectiveZoomBaselineKRef: props.storyboardCollectiveZoomBaselineKRef,
  })
  const register = React.useCallback((id: string, el: HTMLElement | null) => {
    const key = String(id || '').trim()
    if (!key) return
    if (el) overlayElsRef.current.set(key, el)
    else { overlayElsRef.current.delete(key); clearCardProjection(key) }
  }, [clearCardProjection])
  const stopCardHeaderControlEvent = React.useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation()
  }, [])
  const readLatestNode = React.useCallback((id: string): GraphNode | null => {
    const key = String(id || '').trim()
    if (!key) return null
    const latestGraphData = useGraphStore.getState().graphData
    const latestNode = resolveGraphNodeByCanonicalId(latestGraphData, key)
    if (latestNode) return latestNode
    return nodeById.get(key) || resolveGraphNodeByCanonicalId(graphData, key) || null
  }, [graphData, nodeById])
  const commitNodePatch = React.useCallback((card: StoryboardCardModel, patch: Partial<GraphNode>, historyLabel: string) => {
    const id = String(card.id || '').trim()
    if (!id) return
    onNodeChange(id, patch, graphData)
    addHistory(historyLabel)
  }, [addHistory, graphData, onNodeChange])
  const commitNodeCanonicalProperty = React.useCallback((card: StoryboardCardModel, args: {
    canonicalKey: string
    historyLabel: string
    nextValue: string
    preserveFormatting?: boolean
    propertyKeys: readonly string[]
  }) => {
    const liveGraphData = useGraphStore.getState().graphData || graphData
    const node = readLatestNode(card.id)
    commitStoryboardCardCanonicalText2d({
      ...args,
      addHistory,
      cardId: String(node?.id || card.id).trim(),
      commitGraphData,
      currentProperties: (node?.properties || {}) as Record<string, unknown>,
      graphData: liveGraphData,
      updateNode: (id, patch) => onNodeChange(id, patch, liveGraphData),
    })
  }, [addHistory, commitGraphData, graphData, onNodeChange, readLatestNode])
  const commitTitle = React.useCallback((card: StoryboardCardModel, nextValue: string) => {
    const label = String(nextValue || '').trim()
    const node = readLatestNode(card.id)
    commitNodePatch(card, {
      label,
      properties: buildGraphNodeCanonicalTextPatch({
        currentProperties: (node?.properties || {}) as Record<string, unknown>,
        propertyKeys: GRAPH_NODE_CARD_TITLE_PROPERTY_KEYS,
        canonicalKey: 'title',
        nextValue: label,
      }) as Record<string, JSONValue>,
    }, 'Storyboard title')
  }, [commitNodePatch, readLatestNode])
  const commitType = React.useCallback((card: StoryboardCardModel, nextValue: string) => {
    commitNodePatch(card, { type: String(nextValue || '').trim() }, 'Storyboard type')
  }, [commitNodePatch])
  const commitLane = React.useCallback((card: StoryboardCardModel, nextValue: string) => {
    commitNodeCanonicalProperty(card, {
      canonicalKey: 'lane',
      historyLabel: 'Storyboard lane',
      nextValue,
      propertyKeys: GRAPH_KEYWORD_LANE_PROPERTY_KEYS,
    })
  }, [commitNodeCanonicalProperty])
  const commitPrimaryText = React.useCallback((card: StoryboardCardModel, field: GraphNodeCardTextFieldSpec, nextValue: string) => {
    commitNodeCanonicalProperty(card, {
      canonicalKey: field.canonicalKey,
      historyLabel: `Storyboard ${field.label.toLowerCase()}`,
      nextValue,
      preserveFormatting: true,
      propertyKeys: field.propertyKeys,
    })
  }, [commitNodeCanonicalProperty])
  const selectCard = React.useCallback((
    card: StoryboardCardModel,
    modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
  ) => {
    const state = useGraphStore.getState()
    const mode = activateMultiNodeSelectModeForShift({
      mode: state.schema?.behavior?.selectMode || 'single',
      shiftKey: modifiers.shiftKey,
      setSelectMode: state.setSelectMode,
    })
    setSelectionSource('canvas')
    const gesture = resolveNodeSelectionGesture({ mode, ...modifiers })
    if (gesture === 'toggle') {
      state.toggleNodeSelectionAdditive(card.id)
      const nextState = useGraphStore.getState()
      const remainsSelected = String(nextState.selectedNodeId || '').trim() === card.id
        || (nextState.selectedNodeIds || []).some(id => String(id || '').trim() === card.id)
      setActiveCardId(remainsSelected ? card.id : '')
      return
    }
    setActiveCardId(card.id)
    if (mode === 'multi' || mode === 'lasso') {
      state.selectNodesExpanded({ nodeIds: [card.id], activeNodeId: card.id })
      return
    }
    selectNode(card.id)
  }, [selectNode, setSelectionSource])
  const focusSourceReference = React.useCallback((reference: StoryboardCardSourceReference) => {
    const nodeId = String(reference.nodeId || '').trim()
    if (!nodeId) return
    setActiveCardId('')
    setSelectionSource('canvas')
    const provenance = reference.selectionProvenance?.[0]
    if (provenance) {
      emitStoryboardCardProvenanceFocus({
        sourceNodeId: nodeId,
        edgeId: provenance.edgeId || reference.edgeIds[0] || '',
        documentPath: provenance.documentPath,
        selectedText: provenance.selectedText,
        startLine: provenance.startLine,
        endLine: provenance.endLine,
      })
      const sourceNode = resolveGraphNodeByCanonicalId(graphData, nodeId)
      const sourceProperties = sourceNode?.properties && typeof sourceNode.properties === 'object'
        ? sourceNode.properties as Record<string, unknown>
        : {}
      const readFinite = (value: unknown, fallback: number): number => {
        const scalar = value && typeof value === 'object' && 'value' in value
          ? (value as { value?: unknown }).value
          : value
        const parsed = typeof scalar === 'number' ? scalar : Number(scalar)
        return Number.isFinite(parsed) ? parsed : fallback
      }
      if (sourceNode) {
        requestZoomBounds({
          bounds: {
            x: readFinite(sourceNode.x ?? sourceNode.fx, 0),
            y: readFinite(sourceNode.y ?? sourceNode.fy, 0),
            w: Math.max(1, readFinite(sourceProperties['visual:width'], 640)),
            h: Math.max(1, readFinite(sourceProperties['visual:height'], 420)),
          },
          insetPx: 72,
        })
      }
      return
    }
    selectNode(nodeId)
    requestZoom('selection')
  }, [graphData, requestZoom, requestZoomBounds, selectNode, setSelectionSource])
  const runCard = React.useCallback((card: StoryboardCardModel) => {
    selectCard(card)
    void runWorkflowNode?.(card.id)
  }, [runWorkflowNode, selectCard])
  const materializeProbeTree = React.useCallback((card: StoryboardCardModel) => {
    invokeProbeTreeFromStoryboardToolbar({
      card,
      graphData,
      commitGraphData: nextGraphData => {
        if (commitGraphData) commitGraphData(nextGraphData)
        else useGraphStore.getState().setGraphDataPreservingLayout(nextGraphData)
      },
      addHistory,
      upsertUiToast,
    })
  }, [addHistory, commitGraphData, graphData, upsertUiToast])
  const openCardInSidepane = React.useCallback((card: StoryboardCardModel) => {
    selectCard(card)
    updateOpenWidgetNodeIds(prev => (prev.includes(card.id) ? prev : [...prev, card.id]))
  }, [selectCard, updateOpenWidgetNodeIds])
  const duplicateCard = React.useCallback((card: StoryboardCardModel) => {
    const node = nodeById.get(card.id)
    if (!node) return
    const nodes = Array.isArray(graphData?.nodes) ? (graphData!.nodes as GraphNode[]) : []
    const usedIds = new Set(nodes.map(item => String(item?.id || '').trim()).filter(Boolean))
    const id = createUniqueId('n', usedIds)
    addNode({
      ...node,
      id,
      label: `${String(node.label || card.title || 'Storyboard card').trim()} Copy`,
      x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x + 32 : 32,
      y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y + 32 : 32,
      fx: undefined,
      fy: undefined,
      properties: {
        ...((node.properties || {}) as Record<string, JSONValue>),
        title: `${String(card.title || node.label || 'Storyboard card').trim()} Copy`,
      } as Record<string, JSONValue>,
    })
    addHistory('Storyboard duplicate')
  }, [addHistory, addNode, graphData, nodeById])
  const removeCard = React.useCallback((card: StoryboardCardModel) => {
    const id = String(card.id || '').trim()
    if (!id) return
    const liveGraphData = useGraphStore.getState().graphData || null
    const graphDataForRemoval = liveGraphData || graphData || null
    const removal = resolveGraphOverlayNodeRemoval({
      graphData: graphDataForRemoval,
      nodeId: id,
      openWidgetNodeIds: useGraphStore.getState().openWidgetNodeIds || [],
      selectedNodeId: useGraphStore.getState().selectedNodeId,
    })
    if (!removal) return
    const resolvedCardNodeId = removal.targetNodeId
    const markdownRemoveResult = runStoryboardRemoveAction({
      markdownDocumentText,
      cardId: id,
      resolvedCardNodeId,
      hasSourceNode: false,
      commitMarkdownRemoval: nextMarkdownText => {
        const liveState = useGraphStore.getState()
        const markdownName = String(liveState.markdownDocumentName || markdownDocumentName || '').trim()
        const currentMarkdownText = typeof liveState.markdownDocumentText === 'string' ? liveState.markdownDocumentText : markdownDocumentText || ''
        if (!markdownName || nextMarkdownText === currentMarkdownText) return false
        setMarkdownDocument(markdownName, nextMarkdownText, { applyViewPreset: false })
        writeActiveMarkdownDocumentTextIfPresent({
          state: liveState,
          sourceFiles: liveState.sourceFiles || [],
          text: nextMarkdownText,
          label: 'Storyboard remove',
        })
        addHistory('Storyboard remove')
        return true
      },
      removeGraphNode: ignoreStoryboardCardAction,
    })
    if (markdownRemoveResult.handled) {
      commitGraphOverlayProjectionRemoval({
        removal,
        removePendingNode: removePendingNodeById,
        removeDraftNode: removeNodeById,
        setOpenWidgetNodeIds: nodeIds => updateOpenWidgetNodeIds(() => nodeIds),
        clearSelection: () => {
          setSelectionSource('canvas')
          selectNode(null)
        },
      })
      return
    }
    commitGraphOverlayNodeRemoval({
      removal,
      removePendingNode: removePendingNodeById,
      removeSourceNode: removeNode,
      removeDraftNode: removeNodeById,
      setOpenWidgetNodeIds: nodeIds => updateOpenWidgetNodeIds(() => nodeIds),
      clearSelection: () => {
        setSelectionSource('canvas')
        selectNode(null)
      },
    })
    addHistory('Storyboard remove')
  }, [addHistory, graphData, markdownDocumentName, markdownDocumentText, removeNode, removeNodeById, removePendingNodeById, selectNode, setMarkdownDocument, setSelectionSource, updateOpenWidgetNodeIds])

  if (!active || cards.length === 0) return null
  return (
    <section
      ref={rootRef}
      aria-label="Storyboard card overlay"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-kg-flow-widget-state-graph-key={props.flowWidgetStateGraphKey || undefined}
      data-kg-storyboard-fixed-card-grid={fixedLayoutEnabled ? '1' : '0'}
      data-kg-storyboard-fixed-card-layout={storyboardBoardLayoutMode}
      data-kg-storyboard-fixed-card-overlay="1"
      style={{ zIndex: STORYBOARD_CARD_OVERLAY_Z_INDEX }}
    >
      {cards.map(card => {
        const node = nodeById.get(card.id)
        if (!node) return null
        const containedByGroupPanel = isGroupPanelContainedNode(groupPanelContainedNodeIds, card.id)
        const selected = isCanonicalNodeIdEqual(activeCardId, card.id)
          || isCanonicalNodeIdEqual(selectedNodeId, card.id)
          || (Array.isArray(selectedNodeIds) && selectedNodeIds.some(id => isCanonicalNodeIdEqual(id, card.id)))
        const headerPinProps = buildFlowCanvasHeaderPinProps({
          enabled: true,
          flowWidgetPinnedByNodeId: effectiveFlowWidgetPinnedByNodeId,
          flowWidgetStateGraphKey: props.flowWidgetStateGraphKey,
          nodeId: card.id,
          onBeforePinnedChange: () => preserveCardScreenPlacementForPinTransition(card.id),
          stopEvent: stopCardHeaderControlEvent,
        })
        return (
          <StoryboardCardOverlayItem
            key={card.id}
            card={card}
            cardMoveEnabled={containedByGroupPanel || isFlowWidgetHeaderDragAllowedByPin({
              pinnedInCanvas: headerPinProps.headerPinned === true,
            })}
            storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
            headerPinProps={headerPinProps}
            node={node}
            pendingMedia={pendingMediaByCardId[card.id] || null}
            readCardSize={readCardSize}
            onCommitLane={commitLane}
            onCommitPrimaryText={commitPrimaryText}
            onCommitTitle={commitTitle}
            onCommitType={commitType}
            onDuplicate={duplicateCard}
            onDropMedia={dropCardMedia}
            onHeaderPointerDown={interactions.beginHeaderDrag}
            onOpenInSidepane={openCardInSidepane}
            onProbeTree={materializeProbeTree}
            onRemove={removeCard}
            onResizePointerDown={interactions.beginResize}
            onRun={runCard}
            onSelect={selectCard}
            onSourceReferenceActivate={focusSourceReference}
            register={register}
            selected={selected}
          />
        )
      })}
    </section>
  )
}
