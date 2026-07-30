import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Check, ExternalLink, FileText, GitBranch, Heart, Hash, Image as ImageIcon, Link2, Lock, MessageSquare, PanelsTopLeft, Sparkles, Video, Volume2, Wand2 } from 'lucide-react'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { emitFloatingPanelOpen, emitMediaLibraryOpenTop } from '@/features/canvas/utils'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { normalizeGraphData } from '@/lib/graph/normalize'
import { buildDataflowWidgetRegistry } from '@/lib/storyboardWidget/widgetRegistryDataflow'
import {
  DATA_VIEW_CHIP_ROW_CLASSNAME,
  DataViewTagChip,
  resolveDataViewChipClass,
} from '@/features/markdown/ui/MarkdownDataViewChips'
import { readMarkdownSigilDisplayText } from '@/lib/markdown/markdownSigil'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import {
  buildStoryboardBoardModel,
  STORYBOARD_ACTION_PROPERTY_KEYS,
  STORYBOARD_DIALOGUE_PROPERTY_KEYS,
  STORYBOARD_EMPTY_LANE,
  STORYBOARD_OUTPUT_PROPERTY_KEYS,
  STORYBOARD_PROMPT_PROPERTY_KEYS,
  STORYBOARD_SUMMARY_PROPERTY_KEYS,
  STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY,
  buildStoryboardInlineMediaCommandContext,
  type StoryboardCardModel,
} from '@/components/StoryboardCanvas/storyboardModel'
import { buildStoryboardHelpToast } from '@/components/StoryboardCanvas/storyboardHelpAction'
import { resetStoryboardCardPersistence, runStoryboardCardResetAction } from '@/components/StoryboardCanvas/storyboardCardResetAction'
import { runStoryboardDuplicateAction } from '@/components/StoryboardCanvas/storyboardDuplicateAction'
import { runStoryboardConvertLoopAction } from '@/components/StoryboardCanvas/storyboardConvertLoopAction'
import { runStoryboardOpenSidepaneAction } from '@/components/StoryboardCanvas/storyboardOpenSidepaneAction'
import { runStoryboardRemoveAction } from '@/components/StoryboardCanvas/storyboardRemoveAction'
import { runStoryboardRunAction } from '@/components/StoryboardCanvas/storyboardRunAction'
import { runStoryboardSelectAction } from '@/components/StoryboardCanvas/storyboardSelectAction'
import { buildStoryboardToolbarActionBindings } from '@/components/StoryboardCanvas/storyboardToolbarActionBindings'
import { invokeProbeTreeFromStoryboardToolbar } from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import { buildStoryboardToolbarProps } from '@/components/StoryboardCanvas/storyboardToolbarProps'
import { runStoryboardUpdateKvEntryAction } from '@/components/StoryboardCanvas/storyboardUpdateKvEntryAction'
import { canUseStrybldrStoryboardDuplicatePath } from '@/components/StoryboardCanvas/storyboardDuplicateRouting'
import { createStoryboardNewRecordId } from '@/components/StoryboardCanvas/storyboardNewRecord'
import { buildStoryboardGraphBackedNodeLookup } from '@/components/StoryboardCanvas/storyboardNodeLookup'
import { buildStoryboardCardMediaTextareaAttachment } from '@/components/StoryboardCanvas/storyboardCardMediaProjection'
import { isStoryboardDisplayReference, isStoryboardImageReference } from '@/components/StoryboardCanvas/storyboardCardMediaReference'
import { useStoryboardInfiniteZoom } from '@/components/StoryboardCanvas/useStoryboardInfiniteZoom'
import { StoryboardMediaPreview, StoryboardMediaSelectionPanel, StoryboardReferenceStrip, type StoryboardDisplayMedia, type StoryboardMediaSelectionSlot } from '@/components/StoryboardCanvas/storyboardMediaSelectionPanel'
import { buildFlowCanvasHeaderPinProps } from '@/components/FlowCanvas/flowCanvasRichMediaPanelHeaderToolbar'
import RichMediaPanel from '@/components/RichMediaPanel'
import type { MediaLightboxPromptParameters } from '@/lib/ui/MediaLightbox'
import { MEDIA_POINTER_DRAG_DROP_EVENT, claimMediaPointerDragDrop, clearMediaPointerDragPayload, hasMediaDragPayload, isMediaDropClaimedByNestedTarget, isMediaPointerDragDropClaimed, readMediaDragPayload, readMediaPointerDragPayload, resolveMediaDragEventReleaseClientPoint, type MediaDragPayload, type MediaPointerDragDropDetail } from '@/lib/ui/mediaDragPayload'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { useKanbanDragAndDrop } from '@/features/markdown/ui/kanban/useKanbanDragAndDrop'
import { reorderKanbanRowIds, type KanbanDropPosition } from '@/features/markdown/ui/kanban/kanbanReorder'
import { isKanbanMoveNoOp, buildKanbanDropOutcomeText } from '@/features/markdown/ui/kanban/kanbanMoveOutcomes'
import { buildKanbanCardDropIntentLabel, buildKanbanDragStatusText, buildKanbanLaneDropIntentLabel } from '@/features/markdown/ui/kanban/kanbanDragIntent'
import { getKanbanCardDragVisualState, getKanbanLaneDragVisualState } from '@/features/markdown/ui/kanban/kanbanDragVisualState'
import { KanbanCardDropPreview, KanbanLaneDropPreview } from '@/features/markdown/ui/kanban/KanbanDropPreview'
import { KanbanNewRecordDividerRow } from '@/features/markdown/ui/kanban/KanbanNewRecordDividerRow'
import { isInteractiveEventTarget } from '@/features/markdown/ui/kanban/kanbanMenu'
import { CardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'
import { CardMediaLoadingSkeleton, CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { WidgetEditorActionsToolbar } from '@/components/StoryboardWidget/WidgetEditorActionsToolbar'
import { WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { ChatModelCredentialControls } from '@/features/chat/ChatModelCredentialControls'
import { resolveChatModelCredentialProjection } from '@/features/chat/floatingPanelChat/floatingPanelChatCredentialContext'
import {
  CARD_MARKDOWN_PREVIEW_CHIP_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { buildCardParagraphEntries } from '@/lib/cards/cardParagraphs'
import { buildGraphNodeCanonicalTextPatch } from '@/lib/cards/graphNodeCardFields'
import {
  UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME,
  UI_RESPONSIVE_KANBAN_LANE_CLASSNAME,
  UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
  UI_RESPONSIVE_STORYBOARD_FILTER_ACTION_CLASSNAME,
  UI_RESPONSIVE_STORYBOARD_INDEX_BADGE_CLASSNAME,
  UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import {
  createStrytreeCandidateRunAction,
  createStrytreeContinuationDraftAction,
  publishStrytreeCandidateAction,
  toggleStrytreeLikeAction,
  unlockStrytreeNodeAction,
} from '@/features/strybldr/strytreeWorkflow'
import {
  appendStrybldrStoryboardMarkdownElement,
  createNextStrybldrStoryboardMarkdownNodeId,
  removeStrybldrStoryboardMarkdownElement,
  updateStrybldrStoryboardMarkdownCardOverride,
} from '@/features/strybldr/strybldrStoryboard'
import { writeActiveMarkdownDocumentTextIfPresent } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { GRAPH_KEYWORD_LANE_PROPERTY_KEYS, collectGraphKeywordTermStats } from '@/lib/graph/keywordTerms'
import { WorkspaceDataViewNewRecordButton } from '@/features/markdown-workspace/main/viewer/WorkspaceDataViewNewRecordButton'
import { UI_COPY } from '@/lib/config'
import { createUniqueId } from '@/lib/ids'
import { persistStoryboardCardMediaGraphSource } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCardMediaGraphSource'
import { createStoryboardWidgetWorkflowNodeRunner, resolveStoryboardWidgetBaseGraphKind } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import { buildStoryboardRunExecutionAnchorCapture } from '@/components/StoryboardCanvas/captureStoryboardRunExecutionAnchor'
import { readStoryboardNodeProperties, readStoryboardNumber, readStoryboardScalar, readStoryboardStringList } from '@/components/StoryboardCanvas/storyboardValueReaders'
import { resolveStoryboardPaintScale } from '@/components/StoryboardCanvas/storyboardInfiniteZoomMetrics'
import { openWorkflowManagerMappingForNode } from '@/features/storyboard-widget-manager/openWorkflowManagerMappingForNode'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { resolveFlowWidgetStateGraphKey, resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { getDocumentLocationFromMetadata } from '@/lib/graph/markdownMetadata'
import { buildNodeMediaProperties } from '@/lib/canvas/graph-elements/mediaSpec'
import {
  buildRichMediaPanelOverlayState,
  buildRichMediaPanelPreviewSpec,
  commitRichMediaPanelChange,
} from '@/lib/render/richMediaSsot'
import { buildRichMediaPanelDroppedMediaProperties } from '@/lib/render/richMediaPanelNode'
import {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
type StoryboardRenderedEdge = {
  id: string
  sourceId: string
  targetId: string
  renderSourceId: string
  renderTargetId: string
  label: string
  d: string
}
type StoryboardEdgeLayer = {
  width: number
  height: number
  edges: StoryboardRenderedEdge[]
}
const STORYBOARD_RENDERED_EDGE_LABELS = new Set(['parent_node_id', 'rootBranch', 'candidateOption', 'candidateScorecard', 'publishedCandidate'])
const EMPTY_STORYBOARD_WIDGET_REGISTRY: WidgetRegistryEntry[] = []
const STORYBOARD_BRANCH_ACTION_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4'
const STORYBOARD_GROUP_MEMBERSHIP_PROPERTY_KEYS = ['luminaGroupId', 'groupId', 'parentGroupId', 'clusterId', 'sectionId'] as const
const STORYBOARD_SCORECARD_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2'
const STORYBOARD_CANONICAL_TEXT_FIELDS = { summary: { propertyKeys: STORYBOARD_SUMMARY_PROPERTY_KEYS, canonicalKey: 'summary' }, output: { propertyKeys: STORYBOARD_OUTPUT_PROPERTY_KEYS, canonicalKey: 'output' }, action: { propertyKeys: STORYBOARD_ACTION_PROPERTY_KEYS, canonicalKey: 'action' }, dialogue: { propertyKeys: STORYBOARD_DIALOGUE_PROPERTY_KEYS, canonicalKey: 'dialogue' } } as const
const STORYBOARD_NEW_CARD_NODE_TYPE = 'Storyboard'
const STORYBOARD_NEW_CARD_LABEL = 'New storyboard card'
const STORYBOARD_CARD_RATIO_CLASS_BY_MODE = {
  '16:9': 'aspect-video w-[min(44rem,calc(100vw-2rem))]',
  '9:16': 'aspect-[9/16] w-[min(22rem,calc(100vw-2rem))]',
} as const
const STORYBOARD_LANE_WIDTH_CLASS_BY_MODE = {
  '16:9': 'w-[min(46rem,calc(100vw-2rem))]',
  '9:16': 'w-[min(24rem,calc(100vw-2rem))]',
} as const

const STORYTREE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: 'Hot' },
  { id: 'active', label: 'Active' },
  { id: 'protected', label: 'Protected' },
  { id: 'draft', label: 'Draft' },
  { id: 'dropped', label: 'Dropped' },
] as const
const STORYBOARD_DROPPED_PRIMARY_MEDIA_CLEAR_KEYS = [
  'renderUrl',
  'embedUrl',
  'media_url',
  'image',
  'imageUrl',
  'video',
  'videoUrl',
  'audio',
  'audioUrl',
  'audio_url',
  'src',
  'outputSrcDoc',
  'thumbnailUrl',
  'thumbnail_url',
  'posterUrl',
  'poster_url',
] as const
const STORYBOARD_DROPPED_REFERENCE_KEY_BY_KIND = {
  image: 'referenceImages',
  audio: 'referenceUrls',
  video: 'referenceUrls',
} as const

const buildStoryboardCardPrimaryMediaDropSlot = (
  card: StoryboardCardModel,
  media: StoryboardDisplayMedia | null,
): StoryboardMediaSelectionSlot => ({
  id: `${card.id}:media:card-drop`,
  label: media?.kind === 'audio' ? 'Audio' : media?.kind === 'video' ? 'Video' : 'Media 1',
  index: 0,
  kind: media ? 'primary' : 'empty',
  media,
  href: card.href,
})

function buildStoryboardCanvasRichMediaPanelProperties(args: {
  cleanUrl: string
  label: string
  maxOrder: number
  payload: MediaDragPayload
}): Record<string, unknown> {
  const { cleanUrl, label, maxOrder, payload } = args
  return {
    ...buildRichMediaPanelDroppedMediaProperties({ ...payload, url: cleanUrl, label }),
    [STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY]: true,
    lane: STORYBOARD_EMPTY_LANE,
    order: maxOrder + 1,
    title: label,
  }
}

function readStoryboardCanvasPanelSize(props: Record<string, unknown>): { width: number; height: number } {
  const width = readStoryboardNumber(props['visual:width']) || readStoryboardNumber(props.width) || 360
  const height = readStoryboardNumber(props['visual:height']) || readStoryboardNumber(props.height) || 260
  return {
    width: Math.max(220, Math.min(720, Math.round(width))),
    height: Math.max(160, Math.min(520, Math.round(height))),
  }
}

function StoryboardCanvasRichMediaPanelNode(props: {
  active: boolean
  flowWidgetPinnedByNodeId: Record<string, boolean>
  flowWidgetStateGraphKey: string | null
  node: GraphNode
  selected: boolean
  selectNode: (id: string) => void
  setSelectionSource: (source: 'canvas') => void
  updateNode: (id: string, patch: Partial<GraphNode>) => void
}) {
  const node = props.node
  const nodeId = readStoryboardScalar(node.id)
  const nodeProps = readStoryboardNodeProperties(node)
  const panel = React.useMemo(() => buildRichMediaPanelOverlayState({ node }), [node])
  const preview = React.useMemo(() => buildRichMediaPanelPreviewSpec({ node, panel }), [node, panel])
  const x = readStoryboardNumber(node.x) ?? 0
  const y = readStoryboardNumber(node.y) ?? 0
  const size = readStoryboardCanvasPanelSize(nodeProps)
  const handleSelect = React.useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    if (isInteractiveEventTarget(event.target)) return
    event.stopPropagation()
    if (!nodeId) return
    props.setSelectionSource('canvas')
    props.selectNode(nodeId)
  }, [nodeId, props])
  const stopPanelHeaderEvent = React.useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation()
  }, [])
  const headerPinProps = React.useMemo(() => buildFlowCanvasHeaderPinProps({
    enabled: true,
    flowWidgetPinnedByNodeId: props.flowWidgetPinnedByNodeId,
    flowWidgetStateGraphKey: props.flowWidgetStateGraphKey,
    nodeId,
    stopEvent: stopPanelHeaderEvent,
  }), [nodeId, props.flowWidgetPinnedByNodeId, props.flowWidgetStateGraphKey, stopPanelHeaderEvent])
  const handlePanelChange = React.useCallback((next: {
    activeTab: 'auto' | 'text' | 'image' | 'video' | 'audio' | 'model' | 'poi'
    freezeConnectedOutput: boolean
    text?: string
  }) => {
    if (!nodeId) return
    commitRichMediaPanelChange({
      nodeId,
      next,
      updateNode: (_id, patch) => props.updateNode(nodeId, patch as Partial<GraphNode>),
    })
  }, [nodeId, props])
  const handlePanelMediaDrop = React.useCallback((payload: MediaDragPayload) => {
    const cleanUrl = readStoryboardScalar(payload.url)
    if (!nodeId || !cleanUrl) return
    const label = readStoryboardScalar(payload.label) || readStoryboardScalar(node.label) || FLOW_RICH_MEDIA_PANEL_NODE_LABEL
    props.updateNode(nodeId, {
      properties: {
        ...nodeProps,
        ...buildRichMediaPanelDroppedMediaProperties({ ...payload, url: cleanUrl, label }),
        [STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY]: true,
        lane: nodeProps.lane || STORYBOARD_EMPTY_LANE,
        title: label,
      } as never,
    })
    props.setSelectionSource('canvas')
    props.selectNode(nodeId)
  }, [node.label, nodeId, nodeProps, props])
  if (!nodeId || !panel || !preview) return null
  return (
    <section
      className="absolute z-20"
      style={{
        left: x,
        top: y,
        width: size.width,
        height: size.height,
      }}
      data-kg-storyboard-canvas-rich-media-panel="1"
      data-kg-storyboard-canvas-rich-media-panel-id={nodeId}
      data-kg-storyboard-canvas-rich-media-panel-pinned={headerPinProps.headerPinned === true ? '1' : '0'}
      data-kg-storyboard-canvas-rich-media-panel-selected={props.selected ? '1' : undefined}
      data-kg-storyboard-widget-surface="storyboard"
      onPointerDownCapture={handleSelect}
      onMouseDownCapture={handleSelect}
    >
      <RichMediaPanel
        overlayId={nodeId}
        title={readStoryboardScalar(node.label) || FLOW_RICH_MEDIA_PANEL_NODE_LABEL}
        url={preview.url || ''}
        srcDoc={preview.srcDoc}
        openUrl={preview.openUrl || preview.url || ''}
        kind={preview.kind || 'iframe'}
        interactive={preview.interactive !== false}
        selected={props.selected}
        panel={panel}
        panelChrome="storyboardWidget"
        frameMode="surface"
        scrollOwner="panel"
        storyboardWidgetSurfaceId="storyboard"
        {...headerPinProps}
        widgetToolbarActive={props.active}
        onPanelChange={handlePanelChange}
        onMediaDrop={handlePanelMediaDrop}
        style={{
          width: '100%',
          height: '100%',
          boxShadow: props.selected ? '0 0 0 2px rgba(37, 99, 235, 0.45), 0 16px 42px rgba(15, 23, 42, 0.22)' : '0 12px 32px rgba(15, 23, 42, 0.18)',
        }}
      />
    </section>
  )
}

function readStoryboardBool(value: unknown): boolean {
  return value === true || String(value || '').trim().toLowerCase() === 'true'
}

function readStoryboardCardMediaLoadingState(props: Record<string, unknown>): { label: string; variant: 'text' | 'image' | 'video' | 'audio' | 'iframe' } | null {
  if (!readStoryboardBool(props.outputLoading)) return null
  if (!readStoryboardScalar(props.lastRunAt)) return null
  const kind = readStoryboardScalar(props.outputLoadingKind).toLowerCase()
  if (kind === 'image') return { label: 'Generating image...', variant: 'image' }
  if (kind === 'video') return { label: 'Generating video...', variant: 'video' }
  if (kind === 'audio') return { label: 'Generating audio...', variant: 'audio' }
  if (kind === 'text') return { label: 'Generating text...', variant: 'text' }
  return { label: 'Generating output...', variant: 'iframe' }
}

function shouldRenderStoryboardEdge(edge: unknown, label: string): boolean {
  if (STORYBOARD_RENDERED_EDGE_LABELS.has(label)) return true
  const properties = edge && typeof edge === 'object' && !Array.isArray(edge)
    ? (edge as { properties?: unknown }).properties
    : null
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return false
  return readStoryboardBool((properties as Record<string, unknown>).strybldrWorkflowEdge)
}

function storytreeCardMatchesFilter(card: StoryboardCardModel, props: Record<string, unknown>, filter: string): boolean {
  if (card.lane !== 'Storytree' || filter === 'all') return true
  const status = readStoryboardScalar(props.strytreeStatus || props.branchStatus).toLowerCase()
  const accessState = readStoryboardScalar(props.accessState).toLowerCase()
  if (filter === 'protected') return readStoryboardBool(props.unlockRequired) || accessState.includes('unlock') || readStoryboardBool(props.isProtected)
  return status === filter || accessState === filter
}

function StorytreeEdgeConnector(props: {
  sourceId: string
  sourceTitle: string
  targetId: string
  targetTitle: string
  label: string
  depth: number
}) {
  const indentPx = Math.min(Math.max(0, props.depth), 5) * 22
  const displayLabel = props.label === 'rootBranch' ? 'root' : 'parent'
  const sourceTitle = readMarkdownSigilDisplayText(props.sourceTitle)
  const targetTitle = readMarkdownSigilDisplayText(props.targetTitle)
  return (
    <section
      className="relative mb-2 flex min-h-8 items-center"
      style={{ paddingLeft: `${indentPx}px` }}
      aria-label={`Storytree edge ${sourceTitle} to ${targetTitle}`}
      data-kg-storytree-edge={props.label}
      data-kg-storytree-edge-source={props.sourceId}
      data-kg-storytree-edge-target={props.targetId}
    >
      <section className="pointer-events-none absolute bottom-0 top-0 w-px bg-black/15" style={{ left: `${indentPx + 8}px` }} aria-hidden="true" />
      <section className="pointer-events-none absolute h-px w-7 bg-black/15" style={{ left: `${indentPx + 8}px`, top: '50%' }} aria-hidden="true" />
      <span className="ml-8 inline-flex max-w-full items-center gap-1 rounded-full border border-black/10 bg-black/[0.025] px-2 py-1 text-[10px] text-black/55">
        <span className="h-1.5 w-1.5 rounded-full bg-black/35" aria-hidden="true" />
        <span className="truncate">{sourceTitle}</span>
        <span aria-hidden="true">to</span>
        <span className="truncate">{targetTitle}</span>
        <span className="rounded bg-black/5 px-1">{displayLabel}</span>
      </span>
    </section>
  )
}

function resolveStoryboardDisplayMedia(card: StoryboardCardModel): StoryboardDisplayMedia | null {
  if (card.media) return card.media
  const firstVisualReference = card.references.find(isStoryboardDisplayReference)
  if (!firstVisualReference) return null
  return {
    kind: firstVisualReference.kind,
    url: firstVisualReference.url,
  }
}

function StoryboardMentionPill(props: {
  label: string
  title?: string
  href?: string
  children: React.ReactElement
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}) {
  const content = (
    <>
      {props.children}
      <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME}>{props.label}</span>
    </>
  )
  if (props.href) {
    return (
      <a
        href={props.href}
        target="_blank"
        rel="noreferrer"
        className={[CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME, UI_THEME_TOKENS.button.hoverBg].join(' ')}
        draggable={false}
        data-kg-card-inline-media-pill="1"
        onClick={props.onClick}
        onDragStart={event => {
          event.preventDefault()
        }}
        title={props.title || props.label}
      >
        {content}
      </a>
    )
  }
  return (
    <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME} title={props.title || props.label} data-kg-card-inline-media-pill="1">
      {content}
    </span>
  )
}

function StoryboardDetailRow(props: {
  icon: React.ReactNode
  label: string
  value: string
  canEdit?: boolean
  placeholder?: string
  markdownCommandContextText?: string
  onCommit?: (nextValue: string) => void
}) {
  const displayValue = readMarkdownSigilDisplayText(props.value)
  if (!displayValue && !props.canEdit) return null
  return (
    <section className="flex items-start gap-2 rounded-lg border border-black/5 bg-black/[0.025] px-2.5 py-2">
      <span className={['mt-0.5 shrink-0', UI_THEME_TOKENS.text.tertiary].join(' ')}>{props.icon}</span>
      <section className="min-w-0 flex-1">
        <p className={['m-0 text-[10px] font-semibold uppercase tracking-[0.08em]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
          {props.label}
        </p>
        <CardInlineTextEditor
          value={props.value}
          ariaLabel={props.label}
          placeholder={props.placeholder || `Add ${props.label.toLowerCase()}`}
          canEdit={props.canEdit}
          editActivation="click"
          multiline
          markdownPreview="auto"
          markdownCommandContextText={props.markdownCommandContextText}
          rows={3}
          onCommit={props.onCommit}
          displayClassName={['m-0 mt-1 text-xs leading-5', UI_THEME_TOKENS.text.secondary].join(' ')}
          editorClassName={`mt-1 ${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-5`}
        />
      </section>
    </section>
  )
}

function resolveStoryboardCardPrimaryReferenceUrl(card: Pick<StoryboardCardModel, 'href' | 'references'>): string {
  const directHref = readStoryboardScalar(card.href)
  if (directHref) return directHref
  for (const reference of card.references) {
    const url = readStoryboardScalar(reference.url)
    if (url) return url
  }
  return ''
}

export default function StoryboardCanvas({
  active = true,
}: {
  active?: boolean
}) {
  const graphData = useActiveGraphRenderData(active)
  const { storeGraphData, graphRevision, flowWidgetPinnedByNodeId, flowWidgetPinnedByNodeIdByGraphMetaKey, selectedNodeId, selectNode, updateNode, addNode, removeNode, setSelectionSource, updateOpenWidgetNodeIds, setGraphDataPreservingLayout, setMarkdownDocument, addHistory, upsertUiToast, dismissUiToast, markdownDocumentName, markdownDocumentText, documentWidgetRegistry, effectiveWidgetRegistry, baseWidgetRegistry, chatProvider, chatAuthMode, chatApiKey, setChatApiKey, chatEndpointUrl, chatModel, uiPanelMicroLabelTextSizeClass, strybldrStoryboardCardAspectMode, strybldrStoryboardBoardLayoutMode } = useGraphStore(
    useShallow(s => ({
      storeGraphData: (s.graphData as GraphData | null) || null,
      graphRevision: s.graphDataRevision || 0,
      flowWidgetPinnedByNodeId: s.flowWidgetPinnedByNodeId || {},
      flowWidgetPinnedByNodeIdByGraphMetaKey: s.flowWidgetPinnedByNodeIdByGraphMetaKey || {},
      selectedNodeId: String(s.selectedNodeId || '').trim(),
      selectNode: s.selectNode,
      updateNode: s.updateNode,
      addNode: s.addNode,
      removeNode: s.removeNode,
      setSelectionSource: s.setSelectionSource,
      updateOpenWidgetNodeIds: s.updateOpenWidgetNodeIds,
      setGraphDataPreservingLayout: s.setGraphDataPreservingLayout,
      setMarkdownDocument: s.setMarkdownDocument,
      addHistory: s.addHistory,
      upsertUiToast: s.upsertUiToast,
      dismissUiToast: s.dismissUiToast,
      markdownDocumentName: s.markdownDocumentName || null,
      markdownDocumentText: s.markdownDocumentText || null,
      documentWidgetRegistry: Array.isArray(s.documentWidgetRegistry) ? s.documentWidgetRegistry : EMPTY_STORYBOARD_WIDGET_REGISTRY,
      effectiveWidgetRegistry: Array.isArray(s.effectiveWidgetRegistry) ? s.effectiveWidgetRegistry : EMPTY_STORYBOARD_WIDGET_REGISTRY,
      baseWidgetRegistry: Array.isArray(s.widgetRegistry) ? s.widgetRegistry : EMPTY_STORYBOARD_WIDGET_REGISTRY,
      chatProvider: s.chatProvider,
      chatAuthMode: s.chatAuthMode,
      chatApiKey: s.chatApiKey,
      setChatApiKey: s.setChatApiKey,
      chatEndpointUrl: s.chatEndpointUrl,
      chatModel: s.chatModel,
      uiPanelMicroLabelTextSizeClass: s.uiPanelMicroLabelTextSizeClass || 'text-xs',
      strybldrStoryboardCardAspectMode: s.strybldrStoryboardCardAspectMode === '9:16' ? '9:16' : '16:9',
      strybldrStoryboardBoardLayoutMode: s.strybldrStoryboardBoardLayoutMode === 'fixed' ? 'fixed' : 'flex',
    })),
  )
  const boardScrollRef = React.useRef<HTMLElement | null>(null)
  const laneScrollElementsRef = React.useRef(new Map<string, HTMLOListElement>())
  const cardElementsRef = React.useRef(new Map<string, HTMLElement>())
  const storyboardRunGraphRef = React.useRef<GraphData | null>(storeGraphData || graphData || null)
  const [storyboardEdgeLayer, setStoryboardEdgeLayer] = React.useState<StoryboardEdgeLayer>({ width: 0, height: 0, edges: [] })
  const [storytreeFilter, setStorytreeFilter] = React.useState<string>('all')
  const widgetRegistry = React.useMemo(() => buildDataflowWidgetRegistry({ documentWidgetRegistry, effectiveWidgetRegistry, widgetRegistry: baseWidgetRegistry }), [baseWidgetRegistry, documentWidgetRegistry, effectiveWidgetRegistry])
  const board = React.useMemo(() => buildStoryboardBoardModel({ graphData, graphRevision, widgetRegistry }), [graphData, graphRevision, widgetRegistry])
  const flowWidgetStateGraphKey = React.useMemo(() => resolveFlowWidgetStateGraphKey({ graphData }), [graphData])
  const effectiveFlowWidgetPinnedByNodeId = React.useMemo(() => resolveScopedFlowWidgetNodeMap({
    graphMetaKey: flowWidgetStateGraphKey,
    keyedByGraphMetaKey: flowWidgetPinnedByNodeIdByGraphMetaKey,
    globalByNodeId: flowWidgetPinnedByNodeId,
  }), [flowWidgetPinnedByNodeId, flowWidgetPinnedByNodeIdByGraphMetaKey, flowWidgetStateGraphKey])
  const storyboardZoom = useStoryboardInfiniteZoom({
    active,
    graphData,
  })
  const setStoryboardZoomViewportElement = storyboardZoom.setViewportElement
  const setBoardScrollElement = React.useCallback((element: HTMLElement | null) => {
    boardScrollRef.current = element
    setStoryboardZoomViewportElement(element)
  }, [setStoryboardZoomViewportElement])
  React.useEffect(() => {
    storyboardRunGraphRef.current = storeGraphData || graphData || null
  }, [graphData, storeGraphData])
  const storyboardRunBaseGraphKind = React.useMemo(
    () => resolveStoryboardWidgetBaseGraphKind(storeGraphData || graphData || null),
    [graphData, storeGraphData],
  )
  const commitStoryboardMarkdownMutation = React.useCallback((args: {
    nextMarkdownText: string | null
    historyLabel: string
    nextSelectedNodeId?: string | null
  }): boolean => {
    if (!args.nextMarkdownText || !markdownDocumentName || args.nextMarkdownText === markdownDocumentText) return false
    setMarkdownDocument(markdownDocumentName, args.nextMarkdownText, { applyViewPreset: false })
    writeActiveMarkdownDocumentTextIfPresent({
      state: useGraphStore.getState(),
      sourceFiles: useGraphStore.getState().sourceFiles || [],
      text: args.nextMarkdownText,
      label: args.historyLabel,
    })
    addHistory(args.historyLabel)
    if (Object.prototype.hasOwnProperty.call(args, 'nextSelectedNodeId')) {
      selectNode(args.nextSelectedNodeId ? String(args.nextSelectedNodeId) : null)
    }
    return true
  }, [addHistory, markdownDocumentName, markdownDocumentText, selectNode, setMarkdownDocument])
  const appendStoryboardRunNode = React.useCallback((appendArgs: {
    id?: string | null
    type: string
    label?: string | null
    x: number
    y: number
    properties?: Record<string, unknown>
  }): string => {
    const currentGraph = storyboardRunGraphRef.current || storeGraphData || graphData || { context: '', type: 'Graph', nodes: [], edges: [] }
    const currentNodes = Array.isArray(currentGraph.nodes) ? currentGraph.nodes : []
    const usedIds = new Set(currentNodes.map(node => String(node?.id || '').trim()).filter(Boolean))
    const nextId = String(appendArgs.id || '').trim() || createUniqueId('n', usedIds)
    const nextNode: GraphNode = {
      id: nextId,
      label: typeof appendArgs.label === 'string' && appendArgs.label.trim() ? appendArgs.label.trim() : nextId,
      type: appendArgs.type,
      x: appendArgs.x,
      y: appendArgs.y,
      properties: (appendArgs.properties || {}) as never,
    }
    const nextGraph = normalizeGraphData({ ...currentGraph, nodes: [...currentNodes, nextNode] })
    if (
      appendArgs.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
      && markdownDocumentName
      && markdownDocumentText
    ) {
      const nextProperties = (appendArgs.properties || {}) as Record<string, unknown>
      const mediaKind =
        readStoryboardScalar(nextProperties.mediaKind)
        || readStoryboardScalar(nextProperties.richMediaActiveTab)
        || (readStoryboardScalar(nextProperties.videoUrl) ? 'video' : '')
        || (readStoryboardScalar(nextProperties.audioUrl) ? 'audio' : '')
        || (readStoryboardScalar(nextProperties.imageUrl) ? 'image' : '')
      const mediaUrl =
        readStoryboardScalar(nextProperties.mediaUrl)
        || readStoryboardScalar(nextProperties.sourceUrl)
        || readStoryboardScalar(nextProperties.renderUrl)
        || readStoryboardScalar(nextProperties.videoUrl)
        || readStoryboardScalar(nextProperties.audioUrl)
        || readStoryboardScalar(nextProperties.imageUrl)
      const maxOrder = board.lanes.reduce((max, lane) => {
        return lane.cards.reduce((laneMax, card) => Math.max(laneMax, Number.isFinite(card.order) ? card.order : 0), max)
      }, 0)
      let nextMarkdownText = appendStrybldrStoryboardMarkdownElement({
        text: markdownDocumentText,
        nodeId: nextId,
        title: nextNode.label,
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        lane: STORYBOARD_EMPTY_LANE,
        order: maxOrder + 1,
      })
      if (nextMarkdownText) {
        const nextMarkdownPatch: {
          title?: string
          type?: string
          lane?: string
          order?: number
          outputSrcDoc?: string
          imageUrl?: string
          mediaKind?: string
          mediaUrl?: string
          renderUrl?: string
          sourceUrl?: string
        } = {
          title: nextNode.label,
          type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
          lane: STORYBOARD_EMPTY_LANE,
          order: maxOrder + 1,
        }
        const outputSrcDoc = readStoryboardScalar(nextProperties.outputSrcDoc)
        const imageUrl = readStoryboardScalar(nextProperties.imageUrl)
        const renderUrl = readStoryboardScalar(nextProperties.renderUrl)
        const sourceUrl = readStoryboardScalar(nextProperties.sourceUrl) || mediaUrl
        if (outputSrcDoc) nextMarkdownPatch.outputSrcDoc = outputSrcDoc
        if (imageUrl) nextMarkdownPatch.imageUrl = imageUrl
        if (mediaKind) nextMarkdownPatch.mediaKind = mediaKind
        if (mediaUrl) nextMarkdownPatch.mediaUrl = mediaUrl
        if (renderUrl) nextMarkdownPatch.renderUrl = renderUrl
        if (sourceUrl) nextMarkdownPatch.sourceUrl = sourceUrl
        nextMarkdownText = updateStrybldrStoryboardMarkdownCardOverride({
          text: nextMarkdownText,
          nodeId: nextId,
          patch: nextMarkdownPatch,
        }) || nextMarkdownText
        if (commitStoryboardMarkdownMutation({
          nextMarkdownText,
          historyLabel: 'Storyboard media panel',
          nextSelectedNodeId: nextId,
        })) {
          storyboardRunGraphRef.current = nextGraph
          setGraphDataPreservingLayout(nextGraph)
          updateOpenWidgetNodeIds(prev => (prev.includes(nextId) ? prev : [...prev, nextId]))
          return nextId
        }
      }
    }
    storyboardRunGraphRef.current = nextGraph
    setGraphDataPreservingLayout(nextGraph)
    updateOpenWidgetNodeIds(prev => (prev.includes(nextId) ? prev : [...prev, nextId]))
    return nextId
  }, [
    board.lanes,
    commitStoryboardMarkdownMutation,
    graphData,
    markdownDocumentName,
    markdownDocumentText,
    setGraphDataPreservingLayout,
    storeGraphData,
    updateOpenWidgetNodeIds,
  ])
  const commitStoryboardPublishedGraphData = React.useCallback((nextGraphData: GraphData) => {
    const committedGraphData = bumpStoryboardWidgetDraftGraphDataRevision(nextGraphData, {
      revisionFloor: graphRevision,
    })
    storyboardRunGraphRef.current = committedGraphData
    setGraphDataPreservingLayout(committedGraphData)
    void persistStoryboardCardMediaGraphSource(committedGraphData, { sourceOwner: { documentName: markdownDocumentName, documentText: markdownDocumentText } })
  }, [graphRevision, markdownDocumentName, markdownDocumentText, setGraphDataPreservingLayout])
  const materializeStoryboardProbeTree = React.useCallback((card: StoryboardCardModel) => invokeProbeTreeFromStoryboardToolbar({
    card,
    graphData: storyboardRunGraphRef.current || storeGraphData || graphData,
    commitGraphData: commitStoryboardPublishedGraphData,
    addHistory,
    upsertUiToast,
  }), [addHistory, commitStoryboardPublishedGraphData, graphData, storeGraphData, upsertUiToast])
  const captureStoryboardRunExecutionAnchor = React.useCallback((rawNodeId: string) => {
    // The delegated capture owner terminates through buildStoryboardWidgetRunExecutionAnchorSnapshot({
    return buildStoryboardRunExecutionAnchorCapture({
      graphData: storyboardRunGraphRef.current || storeGraphData || graphData || null,
      rawNodeId,
      cardElements: cardElementsRef.current,
      viewportElement: boardScrollRef.current,
      graphMetaKey: flowWidgetStateGraphKey,
      aspectMode: strybldrStoryboardCardAspectMode === '9:16' ? '9:16' : '16:9',
      transform: storyboardZoom.transform,
    })
  }, [
    flowWidgetStateGraphKey,
    graphData,
    storeGraphData,
    storyboardZoom.transform.k,
    storyboardZoom.transform.x,
    storyboardZoom.transform.y,
    strybldrStoryboardCardAspectMode,
  ])
  const runStoryboardWorkflowNode = React.useMemo(() => createStoryboardWidgetWorkflowNodeRunner({
    baseGraphKind: storyboardRunBaseGraphKind,
    baseGraphData: storeGraphData || graphData || null,
    readDraftGraphData: () => storyboardRunGraphRef.current || storeGraphData || graphData || null,
    commitDraftGraphDataUpdate: (_currentDraft, nextDraft) => {
      storyboardRunGraphRef.current = nextDraft
      setGraphDataPreservingLayout(nextDraft)
    },
    commitPublishedGraphData: commitStoryboardPublishedGraphData,
    persistDraftGraphData: async (nextGraphData, options) => { await persistStoryboardCardMediaGraphSource(nextGraphData, { ...options, sourceOwner: options?.sourceOwner || { documentName: markdownDocumentName, documentText: markdownDocumentText } }) },
    renderGraphDataOverride: graphData,
    markdownDocumentName,
    markdownDocumentSourceUrl: null,
    widgetRegistry,
    appendDraftNode: appendStoryboardRunNode,
    updateNode,
    upsertUiToast,
    scheduleOverlayEdgeUpdate: () => {},
    captureExecutionAnchor: captureStoryboardRunExecutionAnchor,
  }), [appendStoryboardRunNode, captureStoryboardRunExecutionAnchor, commitStoryboardPublishedGraphData, graphData, markdownDocumentName, markdownDocumentText, setGraphDataPreservingLayout, storyboardRunBaseGraphKind, storeGraphData, updateNode, upsertUiToast, widgetRegistry])
  const storyboardKeywordCommandContextText = React.useMemo(() => {
    return collectGraphKeywordTermStats(graphData)
      .map(entry => `#${entry.term}`)
      .join('\n')
  }, [graphData])
  const rowIdToLaneKey = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const lane of board.lanes) {
      for (const card of lane.cards) map.set(card.id, lane.id)
    }
    return map
  }, [board.lanes])
  const laneToRowIds = React.useMemo(() => {
    const map = new Map<string, readonly string[]>()
    for (const lane of board.lanes) {
      map.set(lane.id, lane.cards.map(card => card.id))
    }
    return map
  }, [board.lanes])
  const orderedCardIds = React.useMemo(() => board.lanes.flatMap(lane => lane.cards.map(card => card.id)), [board.lanes])
  const rowIdToOrder = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const lane of board.lanes) {
      for (const card of lane.cards) map.set(card.id, card.order)
    }
    return map
  }, [board.lanes])
  const cardById = React.useMemo(() => {
    const map = new Map<string, StoryboardCardModel>()
    for (const lane of board.lanes) {
      for (const card of lane.cards) map.set(card.id, card)
    }
    return map
  }, [board.lanes])
  const nodeById = React.useMemo(
    () => buildStoryboardGraphBackedNodeLookup([storeGraphData, graphData]),
    [graphData, storeGraphData],
  )
  const canvasRichMediaPanelNodes = React.useMemo(() => {
    const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
    return nodes.filter(node => {
      const props = readStoryboardNodeProperties(node)
      return String(node?.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
        && props[STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY] === true
    })
  }, [graphData?.nodes])
  const storytreeIncomingEdgeByCardId = React.useMemo(() => {
    const out = new Map<string, { sourceId: string; sourceTitle: string; label: string }>()
    const edges = Array.isArray(graphData?.edges) ? graphData.edges : []
    for (const edge of edges) {
      const label = readStoryboardScalar(edge?.label)
      if (label !== 'parent_node_id' && label !== 'rootBranch') continue
      const sourceId = readStoryboardScalar(edge?.source)
      const targetId = readStoryboardScalar(edge?.target)
      const sourceCard = cardById.get(sourceId)
      const targetCard = cardById.get(targetId)
      if (!sourceCard || !targetCard || targetCard.lane !== 'Storytree') continue
      out.set(targetId, {
        sourceId,
        sourceTitle: sourceCard.title,
        label,
      })
    }
    return out
  }, [cardById, graphData?.edges])
  const currentPropertiesByCardId = React.useMemo(() => {
    const map = new Map<string, Record<string, unknown>>()
    const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
    for (const node of nodes) {
      const id = String(node?.id || '').trim()
      if (!id) continue
      map.set(id, readStoryboardNodeProperties(node))
    }
    return map
  }, [graphData])
  const visibleLanes = React.useMemo(() => {
    return board.lanes.map(lane => {
      if (lane.id !== 'Storytree') return lane
      return {
        ...lane,
        cards: lane.cards.filter(card => storytreeCardMatchesFilter(card, currentPropertiesByCardId.get(card.id) || {}, storytreeFilter)),
      }
    })
  }, [board.lanes, currentPropertiesByCardId, storytreeFilter])
  const visibleCardIds = React.useMemo(() => visibleLanes.flatMap(lane => lane.cards.map(card => card.id)), [visibleLanes])
  const visibleCardKey = visibleCardIds.join('\u0000')
  const structuralEndpointCardIdByNodeId = React.useMemo(() => {
    const visible = new Set(visibleCardIds)
    const endpointByNodeId = new Map<string, string>()
    const visibleCardEntries: Array<{ card: StoryboardCardModel; x: number; y: number }> = []
    for (const lane of visibleLanes) {
      for (const card of lane.cards) {
        if (!visible.has(card.id)) continue
        const properties = currentPropertiesByCardId.get(card.id) || {}
        for (const key of STORYBOARD_GROUP_MEMBERSHIP_PROPERTY_KEYS) {
          const groupId = readStoryboardScalar(properties[key])
          if (groupId && !endpointByNodeId.has(groupId)) endpointByNodeId.set(groupId, card.id)
        }
        const node = nodeById.get(card.id)
        const x = readStoryboardNumber(node?.x)
        const y = readStoryboardNumber(node?.y)
        if (node && x !== null && y !== null) visibleCardEntries.push({ card, x, y })
      }
    }
    const graphNodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
    for (const node of graphNodes) {
      const groupId = readStoryboardScalar(node?.id)
      if (!groupId || visible.has(groupId) || endpointByNodeId.has(groupId)) continue
      const properties = readStoryboardNodeProperties(node)
      const type = readStoryboardScalar(node?.type).toLowerCase()
      const isStructuralGroup = readStoryboardBool(properties.luminaGroup) || /\b(group|cluster|section)\b/i.test(type)
      if (!isStructuralGroup) continue
      const groupX = readStoryboardNumber(node?.x)
      const groupY = readStoryboardNumber(node?.y)
      const groupWidth = readStoryboardNumber(properties.width)
      const groupHeight = readStoryboardNumber(properties.height)
      if (groupX === null || groupY === null || groupWidth === null || groupHeight === null) continue
      const member = visibleCardEntries.find(entry => (
        entry.x >= groupX &&
        entry.y >= groupY &&
        entry.x <= groupX + groupWidth &&
        entry.y <= groupY + groupHeight
      ))
      if (member) endpointByNodeId.set(groupId, member.card.id)
    }
    return endpointByNodeId
  }, [currentPropertiesByCardId, graphData?.nodes, nodeById, visibleCardIds, visibleLanes])
  const updateStoryboardCanonicalProperty = React.useCallback((args: {
    cardId: string
    propertyKeys: readonly string[]
    canonicalKey: string
    nextValue: string
  }) => {
    const nextMarkdownText = updateStrybldrStoryboardMarkdownCardOverride({
      text: markdownDocumentText || '',
      nodeId: args.cardId,
      patch: { [args.canonicalKey]: args.nextValue },
    })
    if (commitStoryboardMarkdownMutation({
      nextMarkdownText,
      historyLabel: `Storyboard ${args.canonicalKey}`,
    })) {
      return
    }
    const currentProperties = currentPropertiesByCardId.get(args.cardId) || {}
    const nextProperties = buildGraphNodeCanonicalTextPatch({
      currentProperties,
      propertyKeys: args.propertyKeys,
      canonicalKey: args.canonicalKey,
      nextValue: args.nextValue,
    })
    if (graphData?.nodes?.some(node => readStoryboardScalar(node?.id) === args.cardId)) {
      setGraphDataPreservingLayout({
        ...graphData,
        nodes: graphData.nodes.map(node => (
          readStoryboardScalar(node?.id) === args.cardId
            ? { ...node, properties: nextProperties as never }
            : node
        )),
      })
      addHistory(`Storyboard ${args.canonicalKey}`)
      return
    }
    updateNode(args.cardId, { properties: nextProperties as never })
  }, [addHistory, commitStoryboardMarkdownMutation, currentPropertiesByCardId, graphData, markdownDocumentText, setGraphDataPreservingLayout, updateNode])
  const updateStoryboardCardModel = React.useCallback((cardId: string, nextModel: string) => {
    const cleanModel = readStoryboardScalar(nextModel)
    if (!cleanModel) return
    const nextMarkdownText = updateStrybldrStoryboardMarkdownCardOverride({
      text: markdownDocumentText || '',
      nodeId: cardId,
      patch: { chatModel: cleanModel },
    })
    if (commitStoryboardMarkdownMutation({
      nextMarkdownText,
      historyLabel: 'Storyboard model',
    })) {
      return
    }
    const currentProperties = currentPropertiesByCardId.get(cardId) || {}
    const nextProperties = {
      ...currentProperties,
      chatModel: cleanModel,
    }
    if (graphData?.nodes?.some(node => readStoryboardScalar(node?.id) === cardId)) {
      setGraphDataPreservingLayout({
        ...graphData,
        nodes: graphData.nodes.map(node => (
          readStoryboardScalar(node?.id) === cardId
            ? { ...node, properties: nextProperties as never }
            : node
        )),
      })
      addHistory('Storyboard model')
      return
    }
    updateNode(cardId, { properties: nextProperties as never })
  }, [addHistory, commitStoryboardMarkdownMutation, currentPropertiesByCardId, graphData, markdownDocumentText, setGraphDataPreservingLayout, updateNode])
  const updateStoryboardDroppedMediaProperties = React.useCallback((cardId: string, nextProperties: Record<string, unknown>) => {
    if (graphData?.nodes?.some(node => readStoryboardScalar(node?.id) === cardId)) {
      setGraphDataPreservingLayout({
        ...graphData,
        nodes: graphData.nodes.map(node => (
          readStoryboardScalar(node?.id) === cardId
            ? { ...node, properties: nextProperties as never }
            : node
        )),
      })
      addHistory('Storyboard media')
      return
    }
    updateNode(cardId, { properties: nextProperties as never })
  }, [addHistory, graphData, setGraphDataPreservingLayout, updateNode])
  const handleDropStoryboardMedia = React.useCallback((card: StoryboardCardModel, slot: StoryboardMediaSelectionSlot, payload: MediaDragPayload) => {
    const cleanUrl = readStoryboardScalar(payload.url)
    if (!cleanUrl) return
    const currentProperties = currentPropertiesByCardId.get(card.id) || {}
    const writesPrimaryMedia = slot.kind === 'primary' || (slot.kind === 'empty' && slot.index === 0)
    if (writesPrimaryMedia) {
      const nextMarkdownText = updateStrybldrStoryboardMarkdownCardOverride({
        text: markdownDocumentText || '',
        nodeId: card.id,
        patch: {
          imageUrl: '',
          mediaKind: payload.kind,
          mediaUrl: cleanUrl,
          outputSrcDoc: '',
          renderUrl: '',
        },
      })
      const committed = commitStoryboardMarkdownMutation({
        nextMarkdownText,
        historyLabel: 'Storyboard media',
      })
      if (committed) {
        return
      }
      const nextPropertiesBase = { ...currentProperties }
      STORYBOARD_DROPPED_PRIMARY_MEDIA_CLEAR_KEYS.forEach(key => {
        delete nextPropertiesBase[key]
      })
      const nextProperties = buildNodeMediaProperties({
        extra: {
          ...nextPropertiesBase,
          ...(payload.thumbnailUrl ? { thumbnailUrl: payload.thumbnailUrl } : {}),
        },
        kind: payload.kind,
        url: cleanUrl,
        includeCamelGeneric: true,
      })
      updateStoryboardDroppedMediaProperties(card.id, nextProperties)
      return
    }
    const referenceKey = STORYBOARD_DROPPED_REFERENCE_KEY_BY_KIND[payload.kind]
    const currentReferences = readStoryboardStringList(currentProperties[referenceKey])
    const fallbackReferences = card.references
      .filter(reference => (
        payload.kind === 'image'
          ? reference.kind === 'image' || reference.kind === 'svg'
          : reference.kind === payload.kind
      ))
      .map(reference => reference.url)
    const nextReferences = (currentReferences.length > 0 ? currentReferences : fallbackReferences).slice()
    const replacementIndex = Number.isInteger(slot.referenceIndex) ? Number(slot.referenceIndex) : Math.max(0, slot.index - 1)
    if (replacementIndex >= 0 && replacementIndex < nextReferences.length) nextReferences[replacementIndex] = cleanUrl
    else nextReferences.push(cleanUrl)
    const seenReferences = new Set<string>()
    const uniqueReferences = nextReferences.filter(value => {
      const key = value.toLowerCase()
      if (!key || seenReferences.has(key)) return false
      seenReferences.add(key)
      return true
    })
    updateStoryboardDroppedMediaProperties(card.id, {
      ...currentProperties,
      [referenceKey]: uniqueReferences,
    })
  }, [commitStoryboardMarkdownMutation, currentPropertiesByCardId, markdownDocumentText, updateStoryboardDroppedMediaProperties])
  const handleDropStoryboardCanvasMediaNode = React.useCallback((payload: MediaDragPayload, clientX: number, clientY: number) => {
    const cleanUrl = readStoryboardScalar(payload.url)
    if (!cleanUrl) return
    const rect = boardScrollRef.current?.getBoundingClientRect(); const transform = storyboardZoom.transform; const paintScale = resolveStoryboardPaintScale(transform.k)
    const x = rect ? Math.round((clientX - rect.left - transform.x) / paintScale - RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width / 2) : 0
    const y = rect ? Math.round((clientY - rect.top - transform.y) / paintScale - RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height / 2) : 0
    const baseGraphData = storeGraphData || graphData || { context: '', type: 'Graph', nodes: [], edges: [] }
    const nodes = Array.isArray(baseGraphData.nodes) ? baseGraphData.nodes : []
    const beforeIds = new Set<string>(nodes.map(node => String(node.id || '').trim()).filter(Boolean))
    const nextId = createUniqueId('n', beforeIds)
    const maxOrder = board.lanes.reduce((max, lane) => lane.cards.reduce((laneMax, card) => Math.max(laneMax, Number.isFinite(card.order) ? card.order : 0), max), 0)
    const label = readStoryboardScalar(payload.label) || FLOW_RICH_MEDIA_PANEL_NODE_LABEL
    const nextNode: GraphNode = {
      id: nextId,
      label,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      x,
      y,
      fx: x,
      fy: y,
      properties: buildStoryboardCanvasRichMediaPanelProperties({
        cleanUrl,
        label,
        maxOrder,
        payload,
      }) as never,
    }
    addNode(nextNode)
    const committedGraphData = useGraphStore.getState().graphData as GraphData | null
    const committedNodes = Array.isArray(committedGraphData?.nodes) ? committedGraphData.nodes : []
    const canonicalId = resolveGraphNodeByCanonicalId(committedGraphData, nextId)?.id
    const insertedId = committedNodes.find(node => {
      const nodeId = String(node.id || '').trim()
      if (!nodeId || beforeIds.has(nodeId)) return false
      return String(node.label || '').trim() === label && String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    })?.id
    const selectedId = String(canonicalId || insertedId || nextId).trim() || nextId
    setSelectionSource('canvas')
    selectNode(selectedId)
    updateOpenWidgetNodeIds(prev => (prev.includes(selectedId) ? prev : [...prev, selectedId]))
    addHistory('Storyboard canvas media')
  }, [addHistory, addNode, board.lanes, graphData, storeGraphData, storyboardZoom.transform])
  const handleNewStoryboardRecord = React.useCallback((preferredLane?: string) => {
    const storeGraphData = useGraphStore.getState().graphData as GraphData | null
    const baseGraphData = (storeGraphData || graphData || { context: '', type: 'Graph', nodes: [], edges: [] }) as GraphData
    const nodes = Array.isArray(baseGraphData.nodes) ? baseGraphData.nodes : []
    const activeNodes = Array.isArray(graphData?.nodes) ? graphData.nodes : nodes
    const nextId = createNextStrybldrStoryboardMarkdownNodeId({
      text: markdownDocumentText || '',
    }) || createStoryboardNewRecordId([...nodes, ...activeNodes])
    const selectedCard = selectedNodeId ? cardById.get(selectedNodeId) || null : null
    const targetLane = String(
      preferredLane
      || selectedCard?.lane
      || visibleLanes.find(lane => lane.cards.length > 0)?.id
      || STORYBOARD_EMPTY_LANE,
    ).trim() || STORYBOARD_EMPTY_LANE
    const maxOrder = board.lanes.reduce((max, lane) => {
      return lane.cards.reduce((laneMax, card) => Math.max(laneMax, Number.isFinite(card.order) ? card.order : 0), max)
    }, 0)
    const maxX = activeNodes.reduce((max, node) => Math.max(max, Number.isFinite(node.x) ? Number(node.x) : 0), 0)
    const maxY = activeNodes.reduce((max, node) => Math.max(max, Number.isFinite(node.y) ? Number(node.y) : 0), 0)
    const label = STORYBOARD_NEW_CARD_LABEL
    const type = STORYBOARD_NEW_CARD_NODE_TYPE
    const selectedSourceUnitId = selectedCard
      ? readStoryboardScalar(currentPropertiesByCardId.get(selectedCard.id)?.strybldrSourceUnitId)
      : ''
    const laneSourceUnitId = (preferredLane ? visibleLanes.find(lane => lane.id === preferredLane) : undefined)?.cards
      .map(card => readStoryboardScalar(currentPropertiesByCardId.get(card.id)?.strybldrSourceUnitId))
      .find(Boolean) || ''
    const fallbackSourceUnitId = activeNodes
      .map(node => readStoryboardScalar(readStoryboardNodeProperties(node).strybldrSourceUnitId))
      .find(Boolean) || ''
    const targetSourceUnitId = selectedSourceUnitId || laneSourceUnitId || fallbackSourceUnitId
    const nextMarkdownText = appendStrybldrStoryboardMarkdownElement({
      text: markdownDocumentText || '',
      nodeId: nextId,
      title: label,
      type,
      lane: targetLane === STORYBOARD_EMPTY_LANE ? '' : targetLane,
      order: maxOrder + 1,
      sourceUnitId: targetSourceUnitId,
    })
    if (commitStoryboardMarkdownMutation({
      nextMarkdownText,
      historyLabel: 'Storyboard new record',
      nextSelectedNodeId: nextId,
    })) {
      return
    }
    const beforeIds = new Set<string>((storeGraphData?.nodes || []).map(node => String(node.id || '').trim()).filter(Boolean))
    const nextNode: GraphNode = {
      id: nextId,
      label,
      type,
      x: maxX + 48,
      y: maxY + 48,
      properties: {
        lane: targetLane === STORYBOARD_EMPTY_LANE ? '' : targetLane,
        order: maxOrder + 1,
      } as never,
    }
    addNode(nextNode)
    const committedGraphData = useGraphStore.getState().graphData as GraphData | null
    const committedNodes = Array.isArray(committedGraphData?.nodes) ? committedGraphData.nodes : []
    const canonicalId = resolveGraphNodeByCanonicalId(committedGraphData, nextId)?.id
    const insertedId = committedNodes.find(node => {
      const nodeId = String(node.id || '').trim()
      if (!nodeId || beforeIds.has(nodeId)) return false
      return String(node.label || '').trim() === label && String(node.type || '').trim() === type
    })?.id
    selectNode(String(canonicalId || insertedId || nextId))
  }, [addNode, board.lanes, cardById, commitStoryboardMarkdownMutation, currentPropertiesByCardId, graphData, markdownDocumentText, selectNode, selectedNodeId, visibleLanes])
  const resolveStoryboardActionTarget = React.useCallback((cardId: string) => {
    const sourceNode = nodeById.get(cardId) || null
    const resolvedCardNodeId = readStoryboardScalar(sourceNode?.id) || cardId
    return { sourceNode, resolvedCardNodeId }
  }, [nodeById])
  const openStoryboardCardInSidepane = React.useCallback((card: StoryboardCardModel) => {
    const { resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    return runStoryboardOpenSidepaneAction({
      resolvedCardNodeId,
      setSelectionSource,
      selectNode,
      updateOpenWidgetNodeIds,
      openSidepane: () => emitFloatingPanelOpen({ tab: 'node', open: true }),
    })
  }, [resolveStoryboardActionTarget, selectNode, setSelectionSource, updateOpenWidgetNodeIds])
  const runStoryboardCard = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode, resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    const runResult = runStoryboardRunAction({
      cardId: card.id,
      hasSourceNode: Boolean(sourceNode),
      resolvedCardNodeId,
      openInSidepane: () => openStoryboardCardInSidepane(card),
      runNode: runStoryboardWorkflowNode,
    })
    if (runResult.status === 'unavailable') {
      upsertUiToast(runResult.toast)
      return
    }
  }, [openStoryboardCardInSidepane, resolveStoryboardActionTarget, runStoryboardWorkflowNode, upsertUiToast])
  const generateStoryboardCardMediaFromPrompt = React.useCallback((card: StoryboardCardModel, prompt: string, parameters?: MediaLightboxPromptParameters) => {
    const cleanPrompt = readStoryboardScalar(prompt)
    if (!cleanPrompt) {
      upsertUiToast({
        id: 'storyboard:media-prompt:empty',
        kind: 'warning',
        message: 'Add a prompt before generating media.',
      })
      return
    }
    const nextModel = readStoryboardScalar(parameters?.model)
    if (nextModel) updateStoryboardCardModel(card.id, nextModel)
    if (readStoryboardScalar(card.prompt) !== cleanPrompt) {
      updateStoryboardCanonicalProperty({
        cardId: card.id,
        propertyKeys: STORYBOARD_PROMPT_PROPERTY_KEYS,
        canonicalKey: 'prompt',
        nextValue: cleanPrompt,
      })
    }
    const runWithCommittedPrompt = () => runStoryboardCard({ ...card, prompt: cleanPrompt })
    if (typeof window === 'undefined') {
      runWithCommittedPrompt()
      return
    }
    window.setTimeout(runWithCommittedPrompt, 0)
  }, [runStoryboardCard, updateStoryboardCanonicalProperty, updateStoryboardCardModel, upsertUiToast])
  const hasStrybldrStoryboardDuplicatePath = React.useMemo(
    () => Boolean(createNextStrybldrStoryboardMarkdownNodeId({ text: markdownDocumentText || '' })),
    [markdownDocumentText],
  )
  const canUseStrybldrStoryboardDuplicatePathForCard = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode, resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    return canUseStrybldrStoryboardDuplicatePath({
      hasStrybldrStoryboardDuplicatePath,
      sourceNode,
      resolvedCardNodeId,
      cardId: card.id,
      currentPropertiesByCardId,
    })
  }, [currentPropertiesByCardId, hasStrybldrStoryboardDuplicatePath, resolveStoryboardActionTarget])
  const canDuplicateStoryboardCard = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode, resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    if (canUseStrybldrStoryboardDuplicatePathForCard(card)) return true
    const sourceLocation = getDocumentLocationFromMetadata(sourceNode?.metadata)
    if (markdownDocumentName && sourceLocation?.documentPath === markdownDocumentName) return true
    const sourceId = String(readStoryboardScalar(sourceNode?.id) || resolvedCardNodeId || card.id || '').trim()
    const isMarkdownBackedCard = sourceId.startsWith('blk:md:')
    if (isMarkdownBackedCard) return false
    return Boolean(graphData && sourceNode)
  }, [canUseStrybldrStoryboardDuplicatePathForCard, graphData, markdownDocumentName, resolveStoryboardActionTarget])
  const duplicateStoryboardCard = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode, resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    const sourceLocation = getDocumentLocationFromMetadata(sourceNode?.metadata)
    const duplicatedResult = runStoryboardDuplicateAction({
      canUseStrybldrDuplicatePath: canUseStrybldrStoryboardDuplicatePathForCard(card),
      title: `${card.title || STORYBOARD_NEW_CARD_LABEL} copy`,
      typeLabel: card.typeLabel,
      lane: card.lane,
      order: card.order + 1,
      sourceUnitId: readStoryboardScalar(currentPropertiesByCardId.get(card.id)?.strybldrSourceUnitId),
      summary: card.summary,
      action: card.action,
      prompt: card.prompt,
      markdownDocumentName,
      markdownDocumentText,
      sourceLocation,
      getNodes: () => {
        const committedGraphData = useGraphStore.getState().graphData as GraphData | null
        return Array.isArray(committedGraphData?.nodes) ? committedGraphData.nodes : []
      },
      commitStrybldrMutation: ({ nextMarkdownText, nextSelectedNodeId }) => commitStoryboardMarkdownMutation({
        nextMarkdownText,
        historyLabel: 'Storyboard duplicate',
        nextSelectedNodeId,
      }),
      commitMarkdownMutation: nextMarkdownText => commitStoryboardMarkdownMutation({
        nextMarkdownText,
        historyLabel: 'Storyboard duplicate',
      }),
      selectNode: nextSelectedNodeId => selectNode(String(nextSelectedNodeId)),
    })
    if (duplicatedResult.handled) return
    const sourceId = String(readStoryboardScalar(sourceNode?.id) || resolvedCardNodeId || card.id || '').trim()
    if (sourceId.startsWith('blk:md:')) {
      upsertUiToast({
        id: `storyboard-duplicate-${card.id}`,
        kind: 'warning',
        message: 'Duplicate is unavailable for markdown-backed storyboard cards until a durable document duplicate path is available.',
        ttlMs: 3000,
      })
      return
    }
    if (!graphData || !sourceNode) {
      upsertUiToast({
        id: `storyboard-duplicate-${card.id}`,
        kind: 'warning',
        message: 'Duplicate is unavailable for this storyboard card.',
        ttlMs: 2600,
      })
      return
    }
    const nextId = createUniqueId('n', new Set(graphData.nodes.map(node => readStoryboardScalar(node.id)).filter(Boolean)))
    const baseLabel = readStoryboardScalar(sourceNode.label) || card.title || nextId
    const nextNode: GraphNode = {
      ...sourceNode,
      id: nextId,
      label: `${baseLabel} copy`,
      x: (Number.isFinite(sourceNode.x) ? Number(sourceNode.x) : 0) + 40,
      y: (Number.isFinite(sourceNode.y) ? Number(sourceNode.y) : 0) + 40,
    }
    setGraphDataPreservingLayout(normalizeGraphData({ ...graphData, nodes: [...graphData.nodes, nextNode] }))
    updateOpenWidgetNodeIds(prev => (prev.includes(nextId) ? prev : [...prev, nextId]))
    setSelectionSource('canvas')
    selectNode(nextId)
    addHistory('Storyboard duplicate')
  }, [addHistory, canUseStrybldrStoryboardDuplicatePathForCard, commitStoryboardMarkdownMutation, currentPropertiesByCardId, graphData, markdownDocumentName, markdownDocumentText, resolveStoryboardActionTarget, selectNode, setGraphDataPreservingLayout, setSelectionSource, updateOpenWidgetNodeIds, upsertUiToast])
  const resetStoryboardCard = React.useCallback((card: StoryboardCardModel) => {
    const clearResult = runStoryboardCardResetAction({
      card,
      resetCard: () => resetStoryboardCardPersistence({
        cardId: card.id,
        markdownDocumentText,
        commitMarkdownMutation: commitStoryboardMarkdownMutation,
        currentPropertiesByCardId,
        graphData,
        setGraphData: setGraphDataPreservingLayout,
        addHistory,
        updateNode,
      }),
    })
    if (clearResult.status === 'empty') {
      upsertUiToast({
        id: `storyboard-reset-${card.id}`,
        kind: 'neutral',
        message: 'Storyboard card is already clear.',
        ttlMs: 2200,
      })
      return
    }
    upsertUiToast({
      id: `storyboard-reset-${card.id}`,
      kind: 'neutral',
      message: 'Cleared storyboard card.',
      ttlMs: 2200,
    })
  }, [addHistory, commitStoryboardMarkdownMutation, currentPropertiesByCardId, graphData, markdownDocumentText, setGraphDataPreservingLayout, updateNode, upsertUiToast])
  const showStoryboardCardHelp = React.useCallback(() => {
    upsertUiToast(buildStoryboardHelpToast({
      message: UI_COPY.flowWidgetHelpToast,
    }))
  }, [upsertUiToast])
  const convertStoryboardCardToLoop = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode, resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    const convertResult = runStoryboardConvertLoopAction({
      graphData,
      hasSourceNode: Boolean(sourceNode),
      resolvedCardNodeId,
    })
    if (convertResult.status === 'unavailable') {
      upsertUiToast({
        id: `storyboard-convert-loop-${card.id}`,
        kind: 'neutral',
        message: 'Convert to loop is only available for graph-backed nodes.',
        ttlMs: 2200,
      })
      return
    }
    if (convertResult.status === 'already-loop') {
      upsertUiToast({
        id: `storyboard-convert-loop-${card.id}`,
        kind: 'neutral',
        message: UI_COPY.flowWidgetConvertToLoopAlreadyLoopToast,
        ttlMs: 2200,
      })
      return
    }
    setGraphDataPreservingLayout(convertResult.graphData)
    addHistory('Storyboard convert to loop')
    upsertUiToast({
      id: `storyboard-convert-loop-${card.id}`,
      kind: 'success',
      message: UI_COPY.flowWidgetConvertToLoopToast,
      ttlMs: 2600,
    })
  }, [addHistory, graphData, resolveStoryboardActionTarget, setGraphDataPreservingLayout, upsertUiToast])
  const removeStoryboardCard = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode, resolvedCardNodeId } = resolveStoryboardActionTarget(card.id)
    const removeResult = runStoryboardRemoveAction({
      markdownDocumentText,
      cardId: card.id,
      resolvedCardNodeId,
      hasSourceNode: Boolean(sourceNode),
      commitMarkdownRemoval: nextMarkdownText => commitStoryboardMarkdownMutation({
        nextMarkdownText,
        historyLabel: 'Storyboard remove',
        nextSelectedNodeId: null,
      }),
      removeGraphNode: removeNode,
    })
    if (removeResult.handled) return
    upsertUiToast({
      id: `storyboard-remove-${card.id}`,
      kind: 'warning',
      message: 'Remove is unavailable for this storyboard card.',
      ttlMs: 2600,
    })
  }, [commitStoryboardMarkdownMutation, markdownDocumentText, removeNode, resolveStoryboardActionTarget, upsertUiToast])
  const openStoryboardCardWorkflowManagerMapping = React.useCallback((card: StoryboardCardModel) => {
    const { sourceNode } = resolveStoryboardActionTarget(card.id)
    runStoryboardUpdateKvEntryAction({
      sourceNode,
      registry: widgetRegistry,
      graphMetaKind: storyboardRunBaseGraphKind,
      openMappingForNode: openWorkflowManagerMappingForNode,
    })
  }, [resolveStoryboardActionTarget, storyboardRunBaseGraphKind, widgetRegistry])
  const registerCardElement = React.useCallback((cardId: string, element: HTMLElement | null) => {
    if (element) {
      cardElementsRef.current.set(cardId, element)
      return
    }
    cardElementsRef.current.delete(cardId)
  }, [])
  const readStoryboardCardIdFromDropTarget = React.useCallback((target: EventTarget | null): string => {
    if (!(target instanceof Element)) return ''
    const cardElement = target.closest('[data-kg-storyboard-card-media-drop="1"]')
    if (!cardElement) return ''
    for (const [cardId, element] of cardElementsRef.current.entries()) {
      if (element === cardElement || element.contains(cardElement)) return cardId
    }
    const resolvedCardId = readStoryboardScalar(cardElement.getAttribute('data-kg-storyboard-card-id'))
    return cardById.has(resolvedCardId) ? resolvedCardId : ''
  }, [cardById])

  React.useLayoutEffect(() => {
    const root = boardScrollRef.current
    if (!root) {
      setStoryboardEdgeLayer({ width: 0, height: 0, edges: [] })
      return
    }
    const visible = new Set(visibleCardIds)
    const graphEdges = Array.isArray(graphData?.edges) ? graphData.edges : []
    let frame = 0
    const buildLayer = () => {
      const rootRect = root.getBoundingClientRect()
      const width = Math.max(root.scrollWidth, root.clientWidth)
      const height = Math.max(root.scrollHeight, root.clientHeight)
      const edges: StoryboardRenderedEdge[] = []
      for (const edge of graphEdges) {
        const label = readStoryboardScalar(edge?.label)
        if (!shouldRenderStoryboardEdge(edge, label)) continue
        const sourceId = readStoryboardScalar(edge?.source)
        const targetId = readStoryboardScalar(edge?.target)
        if (!sourceId || !targetId) continue
        const renderSourceId = visible.has(sourceId) ? sourceId : structuralEndpointCardIdByNodeId.get(sourceId) || ''
        const renderTargetId = visible.has(targetId) ? targetId : structuralEndpointCardIdByNodeId.get(targetId) || ''
        if (!renderSourceId || !renderTargetId) continue
        const sourceEl = cardElementsRef.current.get(renderSourceId)
        const targetEl = cardElementsRef.current.get(renderTargetId)
        if (!sourceEl || !targetEl) continue
        const sourceRect = sourceEl.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()
        const sourceCenterX = sourceRect.left - rootRect.left + root.scrollLeft + sourceRect.width / 2
        const sourceCenterY = sourceRect.top - rootRect.top + root.scrollTop + sourceRect.height / 2
        const targetCenterX = targetRect.left - rootRect.left + root.scrollLeft + targetRect.width / 2
        const targetCenterY = targetRect.top - rootRect.top + root.scrollTop + targetRect.height / 2
        const crossLane = Math.abs(targetCenterX - sourceCenterX) > sourceRect.width * 0.45
        const sx = crossLane && targetCenterX >= sourceCenterX
          ? sourceRect.right - rootRect.left + root.scrollLeft - 10
          : sourceCenterX
        const sy = crossLane ? sourceCenterY : sourceRect.bottom - rootRect.top + root.scrollTop - 8
        const tx = crossLane && targetCenterX >= sourceCenterX
          ? targetRect.left - rootRect.left + root.scrollLeft + 10
          : targetCenterX
        const ty = crossLane ? targetCenterY : targetRect.top - rootRect.top + root.scrollTop + 8
        const dx = Math.max(40, Math.abs(tx - sx) * 0.5)
        const dy = Math.max(28, Math.abs(ty - sy) * 0.5)
        const d = crossLane
          ? `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${(sx + dx).toFixed(1)} ${sy.toFixed(1)} ${(tx - dx).toFixed(1)} ${ty.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`
          : `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx.toFixed(1)} ${(sy + dy).toFixed(1)} ${tx.toFixed(1)} ${(ty - dy).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`
        edges.push({
          id: readStoryboardScalar(edge?.id) || `${sourceId}:${label}:${targetId}`,
          sourceId,
          targetId,
          renderSourceId,
          renderTargetId,
          label,
          d,
        })
      }
      setStoryboardEdgeLayer({ width, height, edges })
    }
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(buildLayer)
    }
    schedule()
    root.addEventListener('scroll', schedule, { passive: true })
    const laneScrollElements = Array.from(laneScrollElementsRef.current.values())
    for (const element of laneScrollElements) element.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const Observer = typeof ResizeObserver !== 'undefined' ? ResizeObserver : null
    const observer = Observer ? new Observer(schedule) : null
    observer?.observe(root)
    for (const cardId of visibleCardIds) {
      const element = cardElementsRef.current.get(cardId)
      if (element) observer?.observe(element)
    }
    return () => {
      if (frame) cancelAnimationFrame(frame)
      root.removeEventListener('scroll', schedule)
      for (const element of laneScrollElements) element.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [graphData?.edges, storyboardZoom.transformKey, structuralEndpointCardIdByNodeId, visibleCardIds, visibleCardKey])
  const commitStrytreeWorkflowResult = React.useCallback((args: {
    result: ReturnType<typeof toggleStrytreeLikeAction>
    history: string
  }) => {
    const { result } = args
    if (result.changed) {
      setGraphDataPreservingLayout(result.graphData)
      addHistory(args.history)
      if (result.createdNodeId) selectNode(result.createdNodeId)
    }
    upsertUiToast({
      id: `storytree:${args.history.toLowerCase().replace(/\s+/g, '-')}`,
      kind: result.kind,
      message: result.message,
      dismissible: result.kind !== 'success',
      ttlMs: result.kind === 'success' ? 2600 : null,
    })
  }, [addHistory, selectNode, setGraphDataPreservingLayout, upsertUiToast])
  const toggleStorytreeLike = React.useCallback((cardId: string) => {
    if (!graphData) return
    commitStrytreeWorkflowResult({
      result: toggleStrytreeLikeAction(graphData, cardId),
      history: 'Storytree like',
    })
  }, [commitStrytreeWorkflowResult, graphData])
  const unlockStorytreeBranch = React.useCallback((cardId: string) => {
    if (!graphData) return
    commitStrytreeWorkflowResult({
      result: unlockStrytreeNodeAction(graphData, cardId),
      history: 'Storytree unlock',
    })
  }, [commitStrytreeWorkflowResult, graphData])
  const draftStorytreeContinuation = React.useCallback((cardId: string, prompt: string) => {
    if (!graphData) return
    commitStrytreeWorkflowResult({
      result: createStrytreeContinuationDraftAction(graphData, cardId, { prompt }),
      history: 'Storytree continuation',
    })
  }, [commitStrytreeWorkflowResult, graphData])
  const compareStorytreeCandidates = React.useCallback((cardId: string) => {
    if (!graphData) return
    commitStrytreeWorkflowResult({
      result: createStrytreeCandidateRunAction(graphData, cardId),
      history: 'ForkCompare candidates',
    })
  }, [commitStrytreeWorkflowResult, graphData])
  const publishForkCompareCandidate = React.useCallback((cardId: string) => {
    if (!graphData) return
    commitStrytreeWorkflowResult({
      result: publishStrytreeCandidateAction(graphData, cardId),
      history: 'ForkCompare publish',
    })
  }, [commitStrytreeWorkflowResult, graphData])
  const updateStoryboardTitle = React.useCallback((cardId: string, nextValue: string) => {
    const label = String(nextValue || '').trim()
    const nextMarkdownText = updateStrybldrStoryboardMarkdownCardOverride({
      text: markdownDocumentText || '',
      nodeId: cardId,
      patch: { title: label },
    })
    if (nextMarkdownText && markdownDocumentName && nextMarkdownText !== markdownDocumentText) {
      setMarkdownDocument(markdownDocumentName, nextMarkdownText, { applyViewPreset: false })
      writeActiveMarkdownDocumentTextIfPresent({
        state: useGraphStore.getState(),
        sourceFiles: useGraphStore.getState().sourceFiles || [],
        text: nextMarkdownText,
        label: 'Storyboard title',
      })
      addHistory('Storyboard title')
      return
    }
    if (graphData?.nodes?.some(node => readStoryboardScalar(node?.id) === cardId)) {
      setGraphDataPreservingLayout({
        ...graphData,
        nodes: graphData.nodes.map(node => (
          readStoryboardScalar(node?.id) === cardId
            ? { ...node, label }
            : node
        )),
      })
      addHistory('Storyboard title')
      return
    }
    updateNode(cardId, { label })
  }, [addHistory, graphData, markdownDocumentName, markdownDocumentText, setGraphDataPreservingLayout, setMarkdownDocument, updateNode])
  const updateStoryboardType = React.useCallback((cardId: string, nextValue: string) => {
    const type = String(nextValue || '').trim()
    const nextMarkdownText = updateStrybldrStoryboardMarkdownCardOverride({
      text: markdownDocumentText || '',
      nodeId: cardId,
      patch: { type },
    })
    if (nextMarkdownText && markdownDocumentName && nextMarkdownText !== markdownDocumentText) {
      setMarkdownDocument(markdownDocumentName, nextMarkdownText, { applyViewPreset: false })
      writeActiveMarkdownDocumentTextIfPresent({
        state: useGraphStore.getState(),
        sourceFiles: useGraphStore.getState().sourceFiles || [],
        text: nextMarkdownText,
        label: 'Storyboard type',
      })
      addHistory('Storyboard type')
      return
    }
    if (graphData?.nodes?.some(node => readStoryboardScalar(node?.id) === cardId)) {
      setGraphDataPreservingLayout({
        ...graphData,
        nodes: graphData.nodes.map(node => (
          readStoryboardScalar(node?.id) === cardId
            ? { ...node, type }
            : node
        )),
      })
      addHistory('Storyboard type')
      return
    }
    updateNode(cardId, { type })
  }, [addHistory, graphData, markdownDocumentName, markdownDocumentText, setGraphDataPreservingLayout, setMarkdownDocument, updateNode])
  const updateStoryboardLane = React.useCallback((card: StoryboardCardModel, nextValue: string) => {
    updateStoryboardCanonicalProperty({
      cardId: card.id,
      propertyKeys: GRAPH_KEYWORD_LANE_PROPERTY_KEYS,
      canonicalKey: 'lane',
      nextValue,
    })
  }, [updateStoryboardCanonicalProperty])
  const isStoryboardMoveNoOp = React.useCallback((move: {
    rowId: string
    sourceGroupKey: string
    targetGroupKey: string
    targetRowId: string | null
    position: KanbanDropPosition
  }): boolean => {
    const currentSourceGroupKey = rowIdToLaneKey.get(move.rowId) || move.sourceGroupKey || ''
    if (!currentSourceGroupKey) return false
    const nextOrderedRowIds = reorderKanbanRowIds({
      orderedRowIds: orderedCardIds,
      availableRowIds: orderedCardIds,
      rowIdToGroupKey: rowIdToLaneKey,
      draggedRowId: move.rowId,
      targetGroupKey: move.targetGroupKey,
      targetRowId: move.targetRowId,
      position: move.position,
    })
    const sameLane = currentSourceGroupKey === move.targetGroupKey
    const sameOrder =
      nextOrderedRowIds.length === orderedCardIds.length
      && nextOrderedRowIds.every((rowId, index) => rowId === orderedCardIds[index])
    if (sameLane && sameOrder) return true
    return isKanbanMoveNoOp({
      groupToRowIds: laneToRowIds,
      draggedRowId: move.rowId,
      sourceGroupKey: currentSourceGroupKey,
      targetGroupKey: move.targetGroupKey,
      targetRowId: move.targetRowId,
      position: move.position,
    })
  }, [laneToRowIds, orderedCardIds, rowIdToLaneKey])
  const storyboardDrag = useKanbanDragAndDrop({
    enabled: active && typeof updateNode === 'function' && board.totalCards > 0,
    getBoardScrollElement: () => boardScrollRef.current,
    getLaneScrollElement: groupKey => laneScrollElementsRef.current.get(groupKey) || null,
    isNoOpMove: isStoryboardMoveNoOp,
    buildOutcomeMessage: ({ kind, move, sourceGroupKey, blockedReason }) => buildKanbanDropOutcomeText({
      kind,
      sourceLaneLabel: sourceGroupKey || move?.sourceGroupKey || null,
      targetLaneLabel: move?.targetGroupKey || null,
      targetCardLabel: move?.targetRowId ? cardById.get(move.targetRowId)?.title || move.targetRowId : null,
      blockedReason,
    }),
    onCommitMove: move => {
      const orderedRowIds = reorderKanbanRowIds({
        orderedRowIds: orderedCardIds,
        availableRowIds: orderedCardIds,
        rowIdToGroupKey: rowIdToLaneKey,
        draggedRowId: move.rowId,
        targetGroupKey: move.targetGroupKey,
        targetRowId: move.targetRowId,
        position: move.position,
      })
      for (let index = 0; index < orderedRowIds.length; index += 1) {
        const cardId = orderedRowIds[index]
        const card = cardById.get(cardId)
        if (!card) continue
        const nextOrder = index + 1
        const currentOrder = rowIdToOrder.get(cardId) ?? card.order
        const currentProperties = currentPropertiesByCardId.get(cardId) || {}
        const nextLaneValue =
          cardId === move.rowId
            ? (move.targetGroupKey === STORYBOARD_EMPTY_LANE ? '' : move.targetGroupKey)
            : card.lane === STORYBOARD_EMPTY_LANE
              ? ''
              : card.lane
        const currentLaneValue = String(currentProperties[card.lanePropertyKey] ?? currentProperties.lane ?? card.lane).trim()
        if (cardId !== move.rowId && currentOrder === nextOrder) continue
        if (cardId === move.rowId && currentOrder === nextOrder && currentLaneValue === nextLaneValue) continue
        updateNode(card.id, {
          properties: {
            ...currentProperties,
            lane: nextLaneValue,
            [card.lanePropertyKey]: nextLaneValue,
            order: nextOrder,
          } as never,
        })
      }
    },
  })
  const handleStoryboardCanvasMediaNativeDragOver = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (readStoryboardCardIdFromDropTarget(event.target)) return
    if (!hasMediaDragPayload(event.dataTransfer) && !readMediaPointerDragPayload()) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [readStoryboardCardIdFromDropTarget])
  const handleStoryboardCanvasMediaNativeDrop = React.useCallback((event: React.DragEvent<HTMLElement>) => {
    if (readStoryboardCardIdFromDropTarget(event.target)) return
    const payload = readMediaDragPayload(event.dataTransfer) || readMediaPointerDragPayload(); if (!payload) return
    const release = resolveMediaDragEventReleaseClientPoint(event.nativeEvent)
    event.preventDefault()
    event.stopPropagation()
    handleDropStoryboardCanvasMediaNode(payload, release.clientX, release.clientY)
    clearMediaPointerDragPayload()
  }, [handleDropStoryboardCanvasMediaNode, readStoryboardCardIdFromDropTarget])
  const handleStoryboardCanvasPointerMediaDrop = React.useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    if (readStoryboardCardIdFromDropTarget(event.target)) return
    const payload = readMediaPointerDragPayload(); if (!payload) return
    const release = resolveMediaDragEventReleaseClientPoint(event.nativeEvent)
    event.preventDefault()
    event.stopPropagation()
    handleDropStoryboardCanvasMediaNode(payload, release.clientX, release.clientY)
    clearMediaPointerDragPayload()
  }, [handleDropStoryboardCanvasMediaNode, readStoryboardCardIdFromDropTarget])
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const isCanvasMediaRelease = (clientX: number, clientY: number): boolean => {
      const canvasElement = boardScrollRef.current
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !canvasElement || isMediaDropClaimedByNestedTarget(clientX, clientY)) return false
      const canvasRect = canvasElement.getBoundingClientRect()
      if (
        clientX < canvasRect.left ||
        clientX > canvasRect.right ||
        clientY < canvasRect.top ||
        clientY > canvasRect.bottom
      ) return false
      const hitElement = typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
        ? document.elementFromPoint(clientX, clientY)
        : null
      return !readStoryboardCardIdFromDropTarget(hitElement)
    }
    const handleCanvasPointerDragDrop = (event: Event) => {
      const detail = (event as CustomEvent<Partial<MediaPointerDragDropDetail>>).detail || null
      if (document.querySelector('[data-kg-storyboard-widget-surface-root="storyboard"]')) return
      const payload = isMediaPointerDragDropClaimed(detail as MediaPointerDragDropDetail | null | undefined) ? null : detail?.payload
      const clientX = Number(detail?.clientX)
      const clientY = Number(detail?.clientY)
      if (!payload || !isCanvasMediaRelease(clientX, clientY)) return
      claimMediaPointerDragDrop(detail as MediaPointerDragDropDetail | null | undefined); handleDropStoryboardCanvasMediaNode(payload, clientX, clientY)
      clearMediaPointerDragPayload()
    }
    const handleWindowPointerMediaRelease = (event: PointerEvent | MouseEvent) => {
      const payload = readMediaPointerDragPayload()
      const release = resolveMediaDragEventReleaseClientPoint(event)
      if (!payload || !isCanvasMediaRelease(release.clientX, release.clientY)) return
      event.preventDefault()
      event.stopPropagation()
      handleDropStoryboardCanvasMediaNode(payload, release.clientX, release.clientY)
      clearMediaPointerDragPayload()
    }
    const handleWindowNativeMediaDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer
      if (!dataTransfer || (!hasMediaDragPayload(dataTransfer) && !readMediaPointerDragPayload())) return
      if (!isCanvasMediaRelease(event.clientX, event.clientY)) return
      event.preventDefault()
      event.stopPropagation()
      dataTransfer.dropEffect = 'copy'
    }
    const handleWindowNativeMediaDrop = (event: DragEvent) => {
      const payload = (event.dataTransfer ? readMediaDragPayload(event.dataTransfer) : null) || readMediaPointerDragPayload()
      const release = resolveMediaDragEventReleaseClientPoint(event)
      if (!payload || !isCanvasMediaRelease(release.clientX, release.clientY)) return
      event.preventDefault()
      event.stopPropagation()
      handleDropStoryboardCanvasMediaNode(payload, release.clientX, release.clientY)
      clearMediaPointerDragPayload()
    }
    window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handleCanvasPointerDragDrop)
    window.addEventListener('pointerup', handleWindowPointerMediaRelease, true)
    window.addEventListener('mouseup', handleWindowPointerMediaRelease, true)
    window.addEventListener('dragover', handleWindowNativeMediaDragOver, true)
    window.addEventListener('drop', handleWindowNativeMediaDrop, true)
    return () => {
      window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, handleCanvasPointerDragDrop)
      window.removeEventListener('pointerup', handleWindowPointerMediaRelease, true)
      window.removeEventListener('mouseup', handleWindowPointerMediaRelease, true)
      window.removeEventListener('dragover', handleWindowNativeMediaDragOver, true)
      window.removeEventListener('drop', handleWindowNativeMediaDrop, true)
    }
  }, [handleDropStoryboardCanvasMediaNode, readStoryboardCardIdFromDropTarget])
  const laneCount = board.lanes.length
  const mediaCount = board.lanes.reduce((sum, lane) => sum + lane.cards.filter(card => card.media !== null).length, 0)
  const referenceCount = board.lanes.reduce((sum, lane) => sum + lane.cards.reduce((laneSum, card) => laneSum + card.references.length, 0), 0)
  const isWideStoryboardLayout = strybldrStoryboardCardAspectMode === '16:9'
  const isFlexibleStoryboardBoard = strybldrStoryboardBoardLayoutMode === 'flex'
  const shouldUseFullHeightFixedLanes = strybldrStoryboardBoardLayoutMode === 'fixed' && !isWideStoryboardLayout
  const storyboardCardRatioClassName = STORYBOARD_CARD_RATIO_CLASS_BY_MODE[strybldrStoryboardCardAspectMode]
  const storyboardLaneWidthClassName = STORYBOARD_LANE_WIDTH_CLASS_BY_MODE[strybldrStoryboardCardAspectMode]
  const activeDragStatusText = buildKanbanDragStatusText({
    sourceLaneLabel: storyboardDrag.dragSourceGroupKey,
    targetLaneLabel: storyboardDrag.dragOverGroupKey,
    targetCardLabel: storyboardDrag.dragOverRowId ? cardById.get(storyboardDrag.dragOverRowId)?.title || storyboardDrag.dragOverRowId : null,
    position: storyboardDrag.dragOverPosition as KanbanDropPosition,
    isDragging: storyboardDrag.draggingRowId !== null,
  })
  const dragToastMessage = activeDragStatusText || storyboardDrag.dragOutcomeMessage

  React.useEffect(() => {
    const toastId = 'storyboard:drag-status'
    const message = String(dragToastMessage || '').trim()
    if (!message) {
      dismissUiToast(toastId)
      return
    }
    upsertUiToast({
      id: toastId,
      kind: activeDragStatusText ? 'neutral' : storyboardDrag.commitFlashRowId ? 'success' : 'neutral',
      message,
      ttlMs: activeDragStatusText ? null : 2200,
      dismissible: !activeDragStatusText,
      log: false,
    })
  }, [activeDragStatusText, dismissUiToast, dragToastMessage, storyboardDrag.commitFlashRowId, upsertUiToast])

  return (
    <section className={['relative flex h-full w-full flex-col overflow-hidden', UI_THEME_TOKENS.panel.bg].join(' ')} aria-label="Storyboard canvas">
      <header className={['kg-data-view-new-record-hover-scope flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3', UI_THEME_TOKENS.panel.border].join(' ')}>
        <section className="min-w-0">
          <section className="flex items-center gap-2">
            <PanelsTopLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h2 className={['m-0 text-sm font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>Storyboard</h2>
            <span className={['inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[10px]', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary].join(' ')}>
              {board.totalCards}
            </span>
          </section>
          <p className={['m-0 mt-1 text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>
            Native storyboard board derived from the active graph and shaped with the shared kanban system.
          </p>
        </section>
        <section className="flex flex-wrap items-center gap-2">
          <span className={['inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary].join(' ')}>
            <Hash className="h-3 w-3" aria-hidden="true" />
            {laneCount} lanes
          </span>
          <span className={['inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary].join(' ')}>
            <ImageIcon className="h-3 w-3" aria-hidden="true" />
            {mediaCount} media
          </span>
          <span className={['inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px]', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary].join(' ')}>
            <Link2 className="h-3 w-3" aria-hidden="true" />
            {referenceCount} links
          </span>
          <span className={['hidden text-[10px] sm:inline font-mono', UI_THEME_TOKENS.text.tertiary].join(' ')} title={board.semanticKey}>
            {board.semanticKey ? board.semanticKey.slice(0, 10) : 'empty'}
          </span>
        </section>
      </header>

      {board.totalCards > 0 ? (
        <section
          ref={setBoardScrollElement}
          className="relative flex-1 touch-none overflow-hidden"
          aria-label="Storyboard lanes"
          data-kg-storyboard-infinite-canvas="1"
          data-kg-storyboard-card-aspect={strybldrStoryboardCardAspectMode}
          data-kg-storyboard-board-layout={strybldrStoryboardBoardLayoutMode}
          data-kg-storyboard-zoom-scale={storyboardZoom.zoomScale}
          onDragOverCapture={handleStoryboardCanvasMediaNativeDragOver}
          onDropCapture={handleStoryboardCanvasMediaNativeDrop}
          onPointerUpCapture={handleStoryboardCanvasPointerMediaDrop}
          onMouseUpCapture={handleStoryboardCanvasPointerMediaDrop}
        >
          {storyboardEdgeLayer.edges.length > 0 ? (
            <svg
              className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
              width={storyboardEdgeLayer.width}
              height={storyboardEdgeLayer.height}
              viewBox={`0 0 ${storyboardEdgeLayer.width} ${storyboardEdgeLayer.height}`}
              aria-hidden="true"
              data-kg-storyboard-canvas-edge-layer="1"
            >
              <defs>
                <marker id="kg-storyboard-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="rgba(17, 24, 39, 0.32)" />
                </marker>
              </defs>
              {storyboardEdgeLayer.edges.map(edge => (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke={edge.label === 'candidateOption' || edge.label === 'candidateScorecard' ? 'rgba(20, 83, 45, 0.34)' : 'rgba(17, 24, 39, 0.28)'}
                  strokeWidth={edge.label === 'publishedCandidate' ? 2.5 : 1.75}
                  strokeDasharray={edge.label === 'candidateOption' || edge.label === 'candidateScorecard' ? '6 5' : undefined}
                  markerEnd="url(#kg-storyboard-edge-arrow)"
                  data-kg-storyboard-canvas-edge={edge.label}
                  data-kg-storyboard-canvas-edge-id={edge.id}
                  data-kg-storyboard-canvas-edge-source={edge.sourceId}
                  data-kg-storyboard-canvas-edge-target={edge.targetId}
                  data-kg-storyboard-canvas-edge-render-source={edge.renderSourceId}
                  data-kg-storyboard-canvas-edge-render-target={edge.renderTargetId}
                />
              ))}
            </svg>
          ) : null}
          <section
            ref={storyboardZoom.contentRef}
            className={[
              'absolute left-0 top-0 z-10 inline-flex min-w-fit items-start gap-4 overflow-visible',
              shouldUseFullHeightFixedLanes ? 'h-full' : 'min-h-full',
              isFlexibleStoryboardBoard ? 'flex-wrap content-start' : '',
            ].join(' ')}
            style={storyboardZoom.contentStyle}
            data-kg-storyboard-zoom-content="1"
          >
            {canvasRichMediaPanelNodes.map(node => {
              const nodeId = readStoryboardScalar(node.id)
              return (
                <StoryboardCanvasRichMediaPanelNode
                  key={nodeId || String(node.label || '')}
                  active={active}
                  flowWidgetPinnedByNodeId={effectiveFlowWidgetPinnedByNodeId}
                  flowWidgetStateGraphKey={flowWidgetStateGraphKey}
                  node={node}
                  selected={isCanonicalNodeIdEqual(selectedNodeId, nodeId)}
                  selectNode={selectNode}
                  setSelectionSource={setSelectionSource}
                  updateNode={updateNode}
                />
              )
            })}
            {visibleLanes.map(lane => (
              (() => {
                const laneDropProps = storyboardDrag.createLaneDropProps(lane.id)
                return (
              <section
                key={lane.id}
                data-kg-kanban-group="1"
                className={[
                  'flex shrink-0 flex-col overflow-hidden rounded-2xl border shadow-sm',
                  shouldUseFullHeightFixedLanes ? `h-full ${UI_RESPONSIVE_KANBAN_LANE_CLASSNAME}` : `max-h-full ${storyboardLaneWidthClassName}`,
                  getKanbanLaneDragVisualState({
                    hasActiveDrag: storyboardDrag.draggingRowId !== null,
                    isDragOver: storyboardDrag.dragOverGroupKey === lane.id && storyboardDrag.dragSourceGroupKey !== lane.id,
                    isSourceLane: storyboardDrag.dragSourceGroupKey === lane.id,
                    isCommitFlash: storyboardDrag.commitFlashGroupKey === lane.id,
                  }).className,
                  UI_THEME_TOKENS.panel.border,
                  UI_THEME_TOKENS.kanban.groupBg,
                ].join(' ')}
                style={getKanbanLaneDragVisualState({
                  hasActiveDrag: storyboardDrag.draggingRowId !== null,
                  isDragOver: storyboardDrag.dragOverGroupKey === lane.id && storyboardDrag.dragSourceGroupKey !== lane.id,
                  isSourceLane: storyboardDrag.dragSourceGroupKey === lane.id,
                  isCommitFlash: storyboardDrag.commitFlashGroupKey === lane.id,
                }).style}
                aria-label={`Storyboard lane ${readMarkdownSigilDisplayText(lane.label)}`}
                {...laneDropProps}
              >
                <header
                  data-kg-kanban-group-header="1"
                  className={['kg-data-view-new-record-hover-scope sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur-sm', UI_THEME_TOKENS.panel.divider, UI_THEME_TOKENS.kanban.groupBg].join(' ')}
                >
                  <section className="min-w-0">
                    <h3 className={['m-0 text-sm font-medium truncate', UI_THEME_TOKENS.text.primary].join(' ')} title={readMarkdownSigilDisplayText(lane.label)}>
                      {renderMarkdownSigilInlineText(lane.label)}
                    </h3>
                    <p className={['m-0 mt-1 text-[11px]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                      {lane.cards.length} storyboard cards
                    </p>
                  </section>
                  <section className="flex shrink-0 items-center gap-2">
                    <menu
                      data-kg-kanban-group-actions="1"
                      className="m-0 flex list-none items-center gap-1 p-0 opacity-0 pointer-events-none transition-opacity"
                      aria-label={`${readMarkdownSigilDisplayText(lane.label)} actions`}
                    >
                      <li className="list-none">
                        <WorkspaceDataViewNewRecordButton
                          className="rounded-lg"
                          onClick={() => handleNewStoryboardRecord(lane.id)}
                          labelMode="icon"
                          hoverRevealScope="container"
                        />
                      </li>
                    </menu>
                    <span className={['inline-flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-[10px]', UI_THEME_TOKENS.badge.chip, UI_THEME_TOKENS.text.secondary].join(' ')}>
                      {lane.cards.length}
                    </span>
                  </section>
                </header>
                {lane.id === 'Storytree' ? (
                  <section className={['flex gap-1 overflow-x-auto border-b px-3 py-2', UI_THEME_TOKENS.panel.divider].join(' ')} aria-label="Storytree filters">
                    {STORYTREE_FILTERS.map(filter => (
                      <button
                        key={filter.id}
                        type="button"
                        className={[
                          UI_RESPONSIVE_STORYBOARD_FILTER_ACTION_CLASSNAME,
                          'inline-flex shrink-0 items-center gap-1 rounded border text-[11px]',
                          filter.id === storytreeFilter ? 'border-black/30 bg-black/10 text-black' : [UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary].join(' '),
                        ].join(' ')}
                        aria-pressed={filter.id === storytreeFilter}
                        aria-label={`Storytree filter ${filter.label}`}
                        onClick={event => {
                          event.stopPropagation()
                          setStorytreeFilter(filter.id)
                        }}
                      >
                        <Hash className="h-3 w-3" aria-hidden="true" />
                        {filter.label}
                      </button>
                    ))}
                  </section>
                ) : null}

                <ol
                  ref={element => {
                    if (element) {
                      laneScrollElementsRef.current.set(lane.id, element)
                      return
                    }
                    laneScrollElementsRef.current.delete(lane.id)
                  }}
                  data-kg-kanban-group-list="1"
                  className={[
                    'm-0 list-none overflow-y-auto p-3',
                    shouldUseFullHeightFixedLanes ? 'flex-1 space-y-3' : 'grid content-start gap-3',
                  ].join(' ')}
                  aria-label={`${readMarkdownSigilDisplayText(lane.label)} cards`}
                  {...laneDropProps}
                >
                  {lane.cards.map((card, cardIndex) => {
                    const resolvedCardNodeId = readStoryboardScalar(nodeById.get(card.id)?.id) || card.id
                    const selected = isCanonicalNodeIdEqual(selectedNodeId, resolvedCardNodeId)
                    const selectStoryboardCardFromCanvas = () => runStoryboardSelectAction({
                      resolvedCardNodeId,
                      setSelectionSource,
                      selectNode,
                    })
                    const openStoryboardCardMediaPanel = () => {
                      selectStoryboardCardFromCanvas()
                      emitFloatingPanelOpen({ tab: 'media', open: true })
                      emitMediaLibraryOpenTop()
                    }
                    const currentCardProperties = currentPropertiesByCardId.get(card.id) || {}
                    const displayTitle = readMarkdownSigilDisplayText(card.title)
                    const displayIndex = card.indexLabel || String(cardIndex + 1)
                    const displayMedia = resolveStoryboardDisplayMedia(card)
                    const projectedMediaAttachment = buildStoryboardCardMediaTextareaAttachment(displayMedia, card.title || card.id)
                    const projectedMediaAttachments = projectedMediaAttachment ? [projectedMediaAttachment] : null
                    const mediaLoadingState = readStoryboardCardMediaLoadingState(currentCardProperties)
                    const primaryReferenceUrl = resolveStoryboardCardPrimaryReferenceUrl(card)
                    const toolbarProps = buildStoryboardToolbarProps({
                      active,
                      duplicateDisabled: !canDuplicateStoryboardCard(card),
                      primaryReferenceUrl,
                    })
                    const toolbarActionBindings = buildStoryboardToolbarActionBindings({
                      card,
                      runCard: runStoryboardCard,
                      openCardInSidepane: openStoryboardCardInSidepane,
                      duplicateCard: duplicateStoryboardCard,
                      clearCardOutput: resetStoryboardCard,
                      showCardHelp: showStoryboardCardHelp,
                      removeCard: removeStoryboardCard,
                      openCardWorkflowManagerMapping: openStoryboardCardWorkflowManagerMapping,
                      probeTreeCard: materializeStoryboardProbeTree,
                      convertCardToLoop: convertStoryboardCardToLoop,
                    })
                    const visualBriefReference = card.references.find(isStoryboardImageReference) || null
                    const storyboardCommandContextText = [
                      storyboardKeywordCommandContextText,
                      buildStoryboardInlineMediaCommandContext(card),
                    ].filter(Boolean).join('\n')
                    const cardParagraphEntries = buildCardParagraphEntries([
                      { id: 'summary', label: 'Summary', value: card.summary },
                      { id: 'output', label: 'Output', value: card.output },
                      { id: 'action', label: 'Action', value: card.action },
                      { id: 'dialogue', label: 'Dialogue', value: card.dialogue },
                    ])
                    const summaryEntry = cardParagraphEntries.find(entry => entry.id === 'summary') || null
                    const outputEntry = cardParagraphEntries.find(entry => entry.id === 'output') || null
                    const canEditCard = typeof updateNode === 'function'
                    const sourcePromptLabel = readStoryboardScalar(card.sourcePromptLabel)
                    const usesNativeSourceFields = !!sourcePromptLabel || !!readStoryboardScalar(currentCardProperties.luminaNodeType)
                    const canEditCanonicalText = canEditCard && !usesNativeSourceFields
                    const shouldRenderSourcePromptReferenceControls = !usesNativeSourceFields && (card.references.length > 0 || !!card.href)
                    const commitCardProperty = (fieldId: keyof typeof STORYBOARD_CANONICAL_TEXT_FIELDS) => (nextValue: string) => {
                      const field = STORYBOARD_CANONICAL_TEXT_FIELDS[fieldId]
                      updateStoryboardCanonicalProperty({
                        cardId: card.id,
                        propertyKeys: field.propertyKeys,
                        canonicalKey: field.canonicalKey,
                        nextValue,
                      })
                    }
                    const detailRows = [
                      { fieldId: 'output', icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />, label: 'Output', value: card.output || outputEntry?.value || '' },
                      { fieldId: 'action', icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />, label: 'Action', value: card.action },
                      { fieldId: 'dialogue', icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />, label: 'Dialogue', value: card.dialogue },
                    ].filter(row => row.value || canEditCanonicalText) as {
                      fieldId: keyof typeof STORYBOARD_CANONICAL_TEXT_FIELDS
                      icon: React.ReactNode
                      label: string
                      value: string
                    }[]
                    const cardDragProps = storyboardDrag.createCardDragProps({ rowId: card.id, groupKey: lane.id })
                    const cardDropProps = storyboardDrag.createCardDropProps({ rowId: card.id, groupKey: lane.id })
                    const cardPrimaryMediaDropSlot = buildStoryboardCardPrimaryMediaDropSlot(card, displayMedia)
                    const handleStoryboardCardMediaNativeDragOver = (event: React.DragEvent<HTMLElement>) => {
                      if (!hasMediaDragPayload(event.dataTransfer) && !readMediaPointerDragPayload()) {
                        cardDropProps.onDragOver?.(event)
                        return
                      }
                      event.preventDefault()
                      event.stopPropagation()
                      event.dataTransfer.dropEffect = 'copy'
                    }
                    const handleStoryboardCardMediaNativeDrop = (event: React.DragEvent<HTMLElement>) => {
                      const payload = readMediaDragPayload(event.dataTransfer) || readMediaPointerDragPayload()
                      if (!payload) {
                        cardDropProps.onDrop?.(event)
                        return
                      }
                      event.preventDefault()
                      event.stopPropagation()
                      handleDropStoryboardMedia(card, cardPrimaryMediaDropSlot, payload)
                      clearMediaPointerDragPayload()
                    }
                    const handleStoryboardCardPointerMediaDrop = (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
                      const payload = readMediaPointerDragPayload()
                      if (!payload) return
                      event.preventDefault()
                      event.stopPropagation()
                      handleDropStoryboardMedia(card, cardPrimaryMediaDropSlot, payload)
                      clearMediaPointerDragPayload()
                    }
                    const cardDragVisualState = getKanbanCardDragVisualState({
                      hasActiveDrag: storyboardDrag.draggingRowId !== null,
                      isDragging: storyboardDrag.draggingRowId === card.id,
                      isDropTarget: storyboardDrag.dragOverRowId === card.id,
                      isCommitFlash: storyboardDrag.commitFlashRowId === card.id,
                    })
                    const isStorytreeBranch = card.lane === 'Storytree' && !!readStoryboardScalar(currentCardProperties.strytreeNodeId)
                    const isForkCompareCandidate = card.lane === 'ForkCompare' && !!readStoryboardScalar(currentCardProperties.strytreeCandidateId)
                    const storytreeDepth = Math.max(0, Number(currentCardProperties.depth || 0))
                    const storytreeIncomingEdge = isStorytreeBranch ? storytreeIncomingEdgeByCardId.get(card.id) || null : null
                    const likedByCurrentUser = readStoryboardBool(currentCardProperties.likedByCurrentUser)
                    const unlockRequired = readStoryboardBool(currentCardProperties.unlockRequired)
                    const canUnlock = currentCardProperties.canUnlock !== false && readStoryboardScalar(currentCardProperties.accessState) !== 'unlock-needs-credits'
                    const accessState = readStoryboardScalar(currentCardProperties.accessState) || 'open'
                    const unlockPriceCredits = Number(currentCardProperties.unlockPriceCredits || 0)
                    const storytreeStatus = readStoryboardScalar(currentCardProperties.strytreeStatus || currentCardProperties.branchStatus)
                    const candidateStatus = readStoryboardScalar(currentCardProperties.candidateStatus || currentCardProperties.status)
                    const candidateProvider = readStoryboardScalar(currentCardProperties.provider) || 'local-harness'
                    const candidateModeration = readStoryboardScalar(currentCardProperties.moderationStatus) || 'pending'
                    const candidateFallback = readStoryboardScalar(currentCardProperties.fallbackStatus) || 'none'
                    const candidateContinuity = Number(currentCardProperties.continuityScore || 0)
                    const candidateCreditCost = Number(currentCardProperties.creditCost || 0)
                    const candidateElapsedMs = Number(currentCardProperties.elapsedMs || 0)
                    const candidatePublishEligible = readStoryboardBool(currentCardProperties.publishEligible)
                    const storyboardCardCredentialProjection = resolveChatModelCredentialProjection({
                      currentNode: nodeById.get(card.id) || null,
                      globalProvider: chatProvider,
                      globalAuthMode: chatAuthMode,
                      globalEndpointUrl: chatEndpointUrl,
                      globalModel: chatModel,
                      apiKey: chatApiKey || '',
                      onApiKeyChange: setChatApiKey,
                    })
                    const explicitStoryboardCardChatModel = readStoryboardScalar(currentCardProperties.chatModel)
                    const sourceModelLabel = readStoryboardScalar(card.sourceModelLabel)
                    const shouldUseSourceModelReadout = !!sourceModelLabel && !explicitStoryboardCardChatModel
                    const storyboardCardModelSelect = shouldUseSourceModelReadout
                      ? null
                      : storyboardCardCredentialProjection.modelSelect
                    const storyboardMediaPromptModel = storyboardCardModelSelect?.modelId || sourceModelLabel || chatModel
                    return (
                      <React.Fragment key={card.id}>
                        <li
                          className={['relative list-none', shouldUseFullHeightFixedLanes ? '' : 'w-full'].join(' ')}
                          style={isStorytreeBranch ? { paddingLeft: `${Math.min(storytreeDepth, 5) * 14}px` } : undefined}
                        >
                          {selected ? (
                            <WidgetEditorActionsToolbar
                              visible
                              {...toolbarProps}
                              {...toolbarActionBindings}
                            />
                          ) : null}
                          {storytreeIncomingEdge ? (
                            <StorytreeEdgeConnector
                              sourceId={storytreeIncomingEdge.sourceId}
                              sourceTitle={storytreeIncomingEdge.sourceTitle}
                              targetId={card.id}
                              targetTitle={card.title}
                              label={storytreeIncomingEdge.label}
                              depth={storytreeDepth}
                            />
                          ) : null}
                          <article
                          className={[
                            'group overflow-hidden rounded-2xl border bg-white shadow-sm transition-transform duration-150 select-none',
                            storyboardCardRatioClassName,
                            shouldUseFullHeightFixedLanes ? '' : 'max-w-full',
                            UI_THEME_TOKENS.kanban.cardHoverBg,
                            selected ? 'border-black/30 ring-1 ring-black/10' : UI_THEME_TOKENS.panel.border,
                            isStorytreeBranch ? 'border-l-4 border-l-black/20' : '',
                            isForkCompareCandidate ? 'border-l-4 border-l-emerald-700/35' : '',
                            cardDragVisualState.className,
                            'hover:-translate-y-[1px]',
                          ].join(' ')}
                          style={cardDragVisualState.style}
                          ref={element => {
                            storyboardDrag.registerFocusableRowElement({
                              rowId: card.id,
                              element,
                            })
                            registerCardElement(card.id, element)
                          }}
                          tabIndex={0}
                          role="button"
                          aria-pressed={selected}
                          aria-grabbed={cardDragProps.draggable ? storyboardDrag.draggingRowId === card.id : undefined}
                          aria-label={`Select storyboard card ${displayTitle}`}
                          data-kg-storyboard-card-id={resolvedCardNodeId}
                          data-kg-storyboard-card-media-drop="1"
                          onDragEnter={event => {
                            if (hasMediaDragPayload(event.dataTransfer)) {
                              event.preventDefault()
                              event.stopPropagation()
                              event.dataTransfer.dropEffect = 'copy'
                              return
                            }
                            cardDropProps.onDragEnter?.(event)
                          }}
                          onDragOver={handleStoryboardCardMediaNativeDragOver}
                          onDragLeave={event => {
                            if (hasMediaDragPayload(event.dataTransfer)) {
                              event.stopPropagation()
                              return
                            }
                            cardDropProps.onDragLeave?.(event)
                          }}
                          onDrop={handleStoryboardCardMediaNativeDrop}
                          onPointerUp={handleStoryboardCardPointerMediaDrop}
                          onMouseUp={handleStoryboardCardPointerMediaDrop}
                          draggable={cardDragProps.draggable}
                          onDragStart={cardDragProps.onDragStart}
                          onDragEnd={cardDragProps.onDragEnd}
                          onClick={event => {
                            if (isInteractiveEventTarget(event.target)) return
                            selectStoryboardCardFromCanvas()
                          }}
                          onFocusCapture={() => {
                            if (selected) return
                            selectStoryboardCardFromCanvas()
                          }}
                          onKeyDown={event => {
                            if (isInteractiveEventTarget(event.target)) return
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              selectStoryboardCardFromCanvas()
                            }
                          }}
                        >
                          {storyboardDrag.dragOverRowId === card.id ? (
                            <KanbanCardDropPreview
                              position={storyboardDrag.dragOverPosition as KanbanDropPosition}
                              label={buildKanbanCardDropIntentLabel({
                                position: storyboardDrag.dragOverPosition as KanbanDropPosition,
                                targetCardLabel: card.title,
                                targetLaneLabel: lane.label,
                              })}
                            />
                          ) : null}
                          <section className={[
                            'w-full cursor-pointer text-left',
                            isWideStoryboardLayout
                              ? 'grid h-full grid-cols-[minmax(0,1fr)_minmax(13rem,0.86fr)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden'
                              : 'block h-full overflow-y-auto',
                          ].join(' ')}
                          data-kg-storyboard-card-scroll-root="1"
                          data-kg-canvas-wheel-ignore="true"
                          >
                            <section
                              data-kg-kanban-card-drag-region="1"
                              data-kg-storyboard-card-sticky-header="1"
                              className={[
                                'sticky top-0 z-10 border-b border-black/5 bg-white/95 px-3 py-2.5 backdrop-blur-sm cursor-grab active:cursor-grabbing select-none',
                                isWideStoryboardLayout ? 'col-span-2' : '',
                              ].join(' ')}
                            >
                              <section className="flex items-start justify-between gap-3">
                                <section className="min-w-0 flex-1">
                                  <section className="mb-2 flex items-center gap-2">
                                    <span className={`${UI_RESPONSIVE_STORYBOARD_INDEX_BADGE_CLASSNAME} inline-flex items-center justify-center rounded-md border border-black/10 bg-black/[0.03] px-2 py-1 text-[10px] font-semibold text-black/70`}>
                                      {displayIndex}
                                    </span>
                                    <CardInlineTextEditor
                                      value={card.typeLabel}
                                      ariaLabel={`Storyboard type for ${card.id}`}
                                      placeholder="Add type"
                                      canEdit={canEditCard}
                                      editActivation="click"
                                      onCommit={nextValue => {
                                        updateStoryboardType(card.id, nextValue)
                                      }}
                                      displayClassName={[
                                        DATA_VIEW_CHIP_ROW_CLASSNAME,
                                        'inline-flex max-w-full items-center',
                                        resolveDataViewChipClass(card.typeLabel),
                                      ].join(' ')}
                                      editorClassName={[
                                        'min-w-[6rem] rounded border px-2 py-0.5 text-[10px] font-medium',
                                        UI_THEME_TOKENS.input.bg,
                                        UI_THEME_TOKENS.input.border,
                                        UI_THEME_TOKENS.input.text,
                                      ].join(' ')}
                                    />
                                    <CardInlineTextEditor
                                      value={card.lane}
                                      ariaLabel={`Storyboard lane for ${card.id}`}
                                      placeholder="Add lane"
                                      canEdit={canEditCard}
                                      editActivation="click"
                                      onCommit={nextValue => {
                                        updateStoryboardLane(card, nextValue)
                                      }}
                                      displayClassName={[
                                        DATA_VIEW_CHIP_ROW_CLASSNAME,
                                        'inline-flex max-w-full items-center',
                                        resolveDataViewChipClass(card.lane),
                                      ].join(' ')}
                                      editorClassName={[
                                        'min-w-[4.5rem] rounded border px-2 py-0.5 text-[10px] font-medium',
                                        UI_THEME_TOKENS.input.bg,
                                        UI_THEME_TOKENS.input.border,
                                        UI_THEME_TOKENS.input.text,
                                      ].join(' ')}
                                    />
                                  </section>
                                  <CardInlineTextEditor
                                    value={card.title}
                                    ariaLabel={`Storyboard title for ${card.id}`}
                                    placeholder="Add title"
                                    canEdit={canEditCard}
                                    editActivation="click"
                                    onCommit={nextValue => {
                                      updateStoryboardTitle(card.id, nextValue)
                                    }}
                                    displayClassName={['m-0 truncate text-sm font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}
                                    editorClassName={`${UI_RESPONSIVE_CARD_TITLE_EDITOR_CLASSNAME} text-sm font-semibold leading-5`}
                                  />
                                  {card.slugline ? (
                                    <p className={['m-0 mt-1 text-[11px] uppercase tracking-[0.08em]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                                      {renderMarkdownSigilInlineText(card.slugline)}
                                    </p>
                                  ) : null}
                                </section>
                                {displayMedia?.kind === 'video' ? (
                                  <Video className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                                ) : displayMedia?.kind === 'audio' ? (
                                  <Volume2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                                ) : displayMedia || mediaLoadingState?.variant === 'image' ? (
                                  <ImageIcon className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                                ) : null}
                              </section>
                            </section>

                            <section
                              data-kg-kanban-card-drag-region="1"
                              className={[
                                'overflow-hidden border-b border-black/5 cursor-grab active:cursor-grabbing select-none',
                                isWideStoryboardLayout ? 'col-start-2 row-start-2 min-h-0 border-l' : 'aspect-[16/9]',
                                selected ? 'bg-black/10' : 'bg-black/5',
                              ].join(' ')}
                            >
                              <section className="h-full min-h-0">
                                {isWideStoryboardLayout ? (
                                  <StoryboardMediaSelectionPanel
                                    card={card}
                                    title={displayTitle}
                                    media={displayMedia}
                                    loadingState={mediaLoadingState}
                                    model={storyboardMediaPromptModel}
                                    onAddMedia={openStoryboardCardMediaPanel}
                                    onDropMedia={handleDropStoryboardMedia}
                                    onGenerateMediaPrompt={generateStoryboardCardMediaFromPrompt}
                                  />
                                ) : mediaLoadingState ? (
                                  <CardMediaLoadingSkeleton
                                    label={mediaLoadingState.label}
                                    variant={mediaLoadingState.variant}
                                  />
                                ) : (
                                  <StoryboardMediaPreview title={displayTitle} href={card.href} media={displayMedia} />
                                )}
                              </section>
                            </section>

                            <section
                              data-kg-kanban-card-drag-region="1"
                              data-kg-canvas-wheel-ignore="true"
                              className={[
                                'space-y-3 px-3 py-3 cursor-grab active:cursor-grabbing select-none',
                                isWideStoryboardLayout ? 'col-start-1 row-start-2 min-h-0 overflow-y-auto' : '',
                              ].join(' ')}
                            >
                              <section
                                className="space-y-1"
                                aria-label={`Model for storyboard card ${displayTitle}`}
                                onClick={event => event.stopPropagation()}
                                onPointerDown={event => event.stopPropagation()}
                              >
                                <p className={['m-0 text-[10px] font-semibold uppercase tracking-[0.08em]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                                  {UI_COPY.chatModelSelectLabel}
                                </p>
                                {storyboardCardModelSelect ? (
                                  <ChatModelCredentialControls
                                    apiKeyPrompt={storyboardCardCredentialProjection.apiKeyPrompt}
                                    modelId={storyboardCardModelSelect.modelId}
                                    modelOptions={storyboardCardModelSelect.options}
                                    onModelChanged={nextModel => updateStoryboardCardModel(card.id, nextModel)}
                                    disabled={!canEditCard}
                                    uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
                                  />
                                ) : (
                                  <output
                                    className={[
                                      'block rounded border px-2 py-1 text-[11px]',
                                      UI_THEME_TOKENS.input.border,
                                      UI_THEME_TOKENS.input.bg,
                                      UI_THEME_TOKENS.text.primary,
                                    ].join(' ')}
                                    data-kg-storyboard-source-model-readout="true"
                                  >
                                    {sourceModelLabel}
                                  </output>
                                )}
                              </section>

                              {summaryEntry || canEditCanonicalText ? (
                                <section>
                                  <p className={['m-0 text-[10px] font-semibold uppercase tracking-[0.08em]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                                    {summaryEntry?.label || 'Summary'}
                                  </p>
                                  <CardInlineTextEditor
                                    value={summaryEntry?.value || ''}
                                    ariaLabel={`Summary for ${card.id}`}
                                    placeholder="Add summary"
                                    canEdit={canEditCanonicalText}
                                    editActivation="click"
                                    multiline
                                    markdownPreview="auto"
                                    markdownCommandContextText={storyboardCommandContextText}
                                    projectedMediaAttachments={projectedMediaAttachments}
                                    rows={3}
                                    onCommit={commitCardProperty('summary')}
                                    displayClassName={['m-0 mt-1 text-xs leading-5', UI_THEME_TOKENS.text.secondary].join(' ')}
                                    editorClassName={`mt-1 ${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-5`}
                                  />
                                </section>
                              ) : null}

                              {detailRows.map(row => (
                                <StoryboardDetailRow
                                  key={row.fieldId}
                                  icon={row.icon}
                                  label={row.label}
                                  value={row.value}
                                  canEdit={canEditCanonicalText}
                                  onCommit={commitCardProperty(row.fieldId)}
                                  markdownCommandContextText={storyboardCommandContextText}
                                />
                              ))}

                              {isStorytreeBranch ? (
                                <section className="rounded-xl border border-black/5 bg-black/[0.025] p-2.5" aria-label="Storytree workflow">
                                  <section className="mb-2 flex flex-wrap items-center gap-1">
                                    <DataViewTagChip value={storytreeStatus || 'storytree'} />
                                    <DataViewTagChip value={accessState} />
                                    {Number.isFinite(unlockPriceCredits) && unlockPriceCredits > 0 ? <DataViewTagChip value={`${unlockPriceCredits} credits`} /> : null}
                                  </section>
                                  <section className={STORYBOARD_BRANCH_ACTION_GRID_CLASS_NAME}>
                                    <button
                                      type="button"
                                      className={[UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME, 'inline-flex items-center justify-center gap-1 rounded border text-[11px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary].join(' ')}
                                      aria-label={`${likedByCurrentUser ? 'Unlike' : 'Like'} storytree branch ${displayTitle}`}
                                      onClick={event => {
                                        event.stopPropagation()
                                        toggleStorytreeLike(card.id)
                                      }}
                                    >
                                      <Heart className="h-3.5 w-3.5" aria-hidden="true" fill={likedByCurrentUser ? 'currentColor' : 'none'} />
                                      {likedByCurrentUser ? 'Liked' : 'Like'}
                                    </button>
                                    <button
                                      type="button"
                                      className={[UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME, 'inline-flex items-center justify-center gap-1 rounded border text-[11px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary].join(' ')}
                                      aria-label={`Compare storytree candidates from ${displayTitle}`}
                                      disabled={storytreeStatus === 'dropped'}
                                      onClick={event => {
                                        event.stopPropagation()
                                        compareStorytreeCandidates(card.id)
                                      }}
                                    >
                                      <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                                      Compare
                                    </button>
                                    <button
                                      type="button"
                                      className={[UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME, 'inline-flex items-center justify-center gap-1 rounded border text-[11px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary].join(' ')}
                                      aria-label={`Unlock storytree branch ${displayTitle}`}
                                      disabled={!unlockRequired || !canUnlock}
                                      onClick={event => {
                                        event.stopPropagation()
                                        unlockStorytreeBranch(card.id)
                                      }}
                                    >
                                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                      {unlockRequired ? 'Unlock' : 'Open'}
                                    </button>
                                    <button
                                      type="button"
                                      className={[UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME, 'inline-flex items-center justify-center gap-1 rounded border text-[11px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.secondary].join(' ')}
                                      aria-label={`Draft storytree continuation from ${displayTitle}`}
                                      disabled={storytreeStatus === 'dropped'}
                                      onClick={event => {
                                        event.stopPropagation()
                                        draftStorytreeContinuation(card.id, card.prompt)
                                      }}
                                    >
                                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                                      Draft
                                    </button>
                                  </section>
                                </section>
                              ) : null}

                              {isForkCompareCandidate ? (
                                <section className="rounded-xl border border-emerald-900/10 bg-emerald-50/40 p-2.5" aria-label="ForkCompare scorecard">
                                  <section className="mb-2 flex flex-wrap items-center gap-1">
                                    <DataViewTagChip value={candidateStatus || 'candidate'} />
                                    <DataViewTagChip value={candidateModeration} />
                                    <DataViewTagChip value={`${Math.round(Math.max(0, Math.min(1, candidateContinuity)) * 100)}% continuity`} />
                                  </section>
                                  <section className={STORYBOARD_SCORECARD_GRID_CLASS_NAME}>
                                    <span className={['rounded border px-2 py-1', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')}>
                                      {candidateCreditCost} credits
                                    </span>
                                    <span className={['rounded border px-2 py-1', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')}>
                                      {Math.max(0, Math.round(candidateElapsedMs / 1000))}s
                                    </span>
                                    <span className={['rounded border px-2 py-1', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')}>
                                      {candidateProvider}
                                    </span>
                                    <span className={['rounded border px-2 py-1', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary].join(' ')}>
                                      {candidateFallback}
                                    </span>
                                  </section>
                                  <button
                                    type="button"
                                    className={[
                                      UI_RESPONSIVE_PANEL_TEXT_ACTION_BUTTON_CLASSNAME,
                                      'mt-2 inline-flex w-full items-center justify-center gap-1 rounded border text-[11px]',
                                      candidatePublishEligible ? 'border-emerald-900/20 bg-emerald-700/10 text-emerald-950 hover:bg-emerald-700/15' : [UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.tertiary].join(' '),
                                    ].join(' ')}
                                    aria-label={`Publish ForkCompare candidate ${displayTitle}`}
                                    disabled={!candidatePublishEligible}
                                    onClick={event => {
                                      event.stopPropagation()
                                      publishForkCompareCandidate(card.id)
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                    Publish selected
                                  </button>
                                </section>
                              ) : null}

                              {card.prompt || card.style || card.references.length > 0 ? (
                                <section className="rounded-xl border border-black/5 bg-black/[0.025] p-2.5" aria-label={sourcePromptLabel ? `${sourcePromptLabel} source prompt` : 'Visual brief'}>
                                  <section className="flex items-center justify-between gap-2">
                                    <section className="flex items-center gap-2">
                                      <Sparkles className={['h-3.5 w-3.5 shrink-0', UI_THEME_TOKENS.text.tertiary].join(' ')} aria-hidden="true" />
                                      <span className={['text-[10px] font-semibold uppercase tracking-[0.08em]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                                        {sourcePromptLabel || 'Visual Brief'}
                                      </span>
                                    </section>
                                    {card.style ? <DataViewTagChip value={card.style} /> : null}
                                  </section>
                                  {card.prompt ? (
                                    <CardInlineTextEditor
                                      value={card.prompt}
                                      ariaLabel={`${sourcePromptLabel || 'Visual brief'} for ${card.id}`}
                                      placeholder={`Add ${(sourcePromptLabel || 'visual brief').toLowerCase()}`}
                                      canEdit={typeof updateNode === 'function'}
                                      editActivation="click"
                                      multiline
                                      markdownPreview="auto"
                                      markdownCommandContextText={storyboardCommandContextText}
                                      rows={3}
                                      onCommit={nextValue => {
                                        updateStoryboardCanonicalProperty({
                                          cardId: card.id,
                                          propertyKeys: STORYBOARD_PROMPT_PROPERTY_KEYS,
                                          canonicalKey: 'prompt',
                                          nextValue,
                                        })
                                      }}
                                      displayClassName={['m-0 mt-2 text-xs leading-5', UI_THEME_TOKENS.text.secondary].join(' ')}
                                      editorClassName={`mt-2 ${UI_RESPONSIVE_CARD_MULTILINE_EDITOR_CLASSNAME} text-xs leading-5`}
                                    />
                                  ) : null}
                                  {shouldRenderSourcePromptReferenceControls ? (
                                    <section className="mt-2 flex items-center gap-2">
                                      {card.references.length > 0 ? (
                                        <StoryboardMentionPill label={`${card.references.length} refs`} title={`${card.references.length} references`}>
                                          {visualBriefReference ? (
                                            <CardMediaPreview
                                              kind={visualBriefReference.kind}
                                              url={visualBriefReference.url}
                                              title="Reference"
                                              interactive={false}
                                              fit="cover"
                                              mediaThumbnailDataAttr
                                              mediaClassName={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME}
                                            />
                                          ) : (
                                            <span className={[CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_CLASS_NAME, 'inline-flex items-center justify-center bg-black/5 text-[color:var(--kg-text-secondary)]'].join(' ')}>
                                              <ImageIcon className="h-3 w-3" aria-hidden="true" />
                                            </span>
                                          )}
                                        </StoryboardMentionPill>
                                      ) : null}
                                      {card.href ? (
                                        <a
                                          href={card.href}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={[UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME, CARD_MARKDOWN_PREVIEW_CHIP_CLASS_NAME].join(' ')}
                                          draggable={false}
                                          onClick={event => {
                                            event.stopPropagation()
                                          }}
                                          onDragStart={event => {
                                            event.preventDefault()
                                          }}
                                          title={card.href}
                                        >
                                          <Wand2 className="h-3 w-3" aria-hidden="true" />
                                          Open brief
                                        </a>
                                      ) : null}
                                    </section>
                                  ) : null}
                                </section>
                              ) : null}

                              {!isWideStoryboardLayout ? <StoryboardReferenceStrip cardId={card.id} references={card.references} /> : null}

                              {card.tags.length > 0 ? (
                                <section className="flex flex-wrap gap-1">
                                  {card.tags.slice(0, 4).map(tag => (
                                    <DataViewTagChip key={`${card.id}:tag:${tag}`} value={tag} />
                                  ))}
                                </section>
                              ) : null}

                              {card.meta.length > 0 ? (
                                <section className={['flex flex-wrap gap-1 text-[11px]', UI_THEME_TOKENS.text.tertiary].join(' ')}>
                                  {card.meta.map(item => (
                                    <span key={`${card.id}:meta:${item}`} className={['rounded px-2 py-1', UI_THEME_TOKENS.badge.chip].join(' ')}>
                                      {item}
                                    </span>
                                  ))}
                                </section>
                              ) : null}

                              {card.href && !usesNativeSourceFields ? (
                                <section className="flex items-center justify-end">
                                  <a
                                    href={card.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={[UI_RESPONSIVE_STORYBOARD_REFERENCE_LINK_CLASSNAME, 'inline-flex max-w-full items-center gap-1 text-xs underline underline-offset-2', UI_THEME_TOKENS.text.secondary].join(' ')}
                                    draggable={false}
                                    onClick={event => {
                                      event.stopPropagation()
                                    }}
                                    onDragStart={event => {
                                      event.preventDefault()
                                    }}
                                    title={card.href}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    <span className="truncate">Open source</span>
                                  </a>
                                </section>
                              ) : null}
                            </section>
                          </section>
                          </article>
                        </li>
                        {cardIndex < lane.cards.length - 1 ? (
                          <KanbanNewRecordDividerRow onClick={() => handleNewStoryboardRecord(lane.id)} />
                        ) : null}
                      </React.Fragment>
                    )
                  })}
                  <KanbanNewRecordDividerRow onClick={() => handleNewStoryboardRecord(lane.id)} />
                  {storyboardDrag.draggingRowId !== null && storyboardDrag.dragOverGroupKey === lane.id && storyboardDrag.dragOverRowId == null ? (
                    <li className="list-none">
                      <KanbanLaneDropPreview label={buildKanbanLaneDropIntentLabel({ targetLaneLabel: lane.label })} compact />
                    </li>
                  ) : null}
                </ol>
              </section>
                )
              })()
            ))}
          </section>
        </section>
      ) : (
        <section className="flex flex-1 items-center justify-center p-6" aria-label="Storyboard empty state">
          <section className="max-w-md text-center">
            <PanelsTopLeft className="mx-auto h-8 w-8" aria-hidden="true" />
            <h3 className={['mb-2 mt-3 text-sm font-semibold', UI_THEME_TOKENS.text.primary].join(' ')}>No storyboard cards yet</h3>
            <p className={['m-0 text-sm', UI_THEME_TOKENS.text.secondary].join(' ')}>
              Add scene-like nodes, stage fields, summaries, script beats, prompts, or media references to project the active graph into storyboard lanes.
            </p>
          </section>
        </section>
      )}
    </section>
  )
}
