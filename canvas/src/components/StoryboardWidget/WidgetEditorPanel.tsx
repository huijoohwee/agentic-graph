import React from 'react'

import RichMediaPanel, { beginRichMediaPanelResizeDrag, RichMediaPanelResizeHandle } from '@/components/RichMediaPanel'
import { FloatingPanel } from '@/components/ui/FloatingPanel'
import { WidgetEditorForm } from '@/components/StoryboardWidget/WidgetEditorForm'
import { StoryboardWidgetPanelChromeHeader } from '@/components/StoryboardWidget/StoryboardWidgetPanelChrome'
import { getStoryboardWidgetPanelChromeClassName } from '@/components/StoryboardWidget/storyboardWidgetPanelChromeClassName'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import {
  handleWidgetInnerPanelScrollCapture,
  handleWidgetInnerPanelWheelCapture,
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE,
  resolveWidgetEditorSurfaceLabel,
  type WidgetEditorSurfaceKind,
} from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { resolveBeatRefForNode, resolveBeatClipOverlayIdsForNode } from '@/components/StoryboardWidget/beatByBeat'
import { emitStoryboardWidgetInteractionFrame } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { WidgetEditorPortHandles } from '@/components/StoryboardWidget/WidgetEditorPortHandles'
import { resolveWidgetNodeTitle } from '@/components/StoryboardWidget/widgetEditorTitle'
import type { RichMediaWidgetPreviewState } from '@/components/StoryboardWidget/useRichMediaWidgetPreview'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import {
  getRichMediaPanelNodeLabel,
} from '@/lib/render/richMediaSsot'
import { PANEL_FRAME_EMBEDDED_SURFACE_STYLE } from '@/lib/ui/panelFrame'

export const WidgetEditorPanel = React.memo(function WidgetEditorPanel(args: {
  active: boolean
  storyboardWidgetSurfaceId?: string
  editorSurfaceKind?: WidgetEditorSurfaceKind
  node: GraphNode
  graphMetaKind?: string | null
  registryEntry: WidgetRegistryEntry | null
  registryEntries: ReadonlyArray<WidgetRegistryEntry>
  minimized: boolean
  hideFields: boolean
  pinned: boolean
  showPinToggle?: boolean
  constrainToContainer?: boolean
  uiPanelOpacity: number | null | undefined
  panelTextClass: string
  microLabelClass: string
  monospaceTextClass: string
  uiIconScale: 'compact' | 'default' | undefined
  uiIconStrokeWidth: number
  labelInputRef: React.MutableRefObject<HTMLInputElement | null>
  headerDragEnabled?: boolean
  onHeaderPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onToggleHideFields: () => void
  onTogglePinned?: (event: React.MouseEvent) => void
  onPinnedPointerDown?: (event: React.PointerEvent) => void
  onToggleMinimized: () => void
  onSetLabel: (label: string) => void
  onSetType: (type: string) => void
  onPatchProperties: (patch: Record<string, unknown>) => void
  onSetProperties: (properties: Record<string, unknown>) => void
  onValidate: () => void
  onRegistrySelectionChange?: (args: { entry: WidgetRegistryEntry | null }) => void
  onRenameSchemaFieldId?: (args: { prevId: string; nextId: string }) => void
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  richMediaWidgetPreview?: RichMediaWidgetPreviewState

  portHandleEdges: ReadonlyArray<GraphEdge>
  schema: GraphSchema | null
  toolMode?: 'select' | 'addEdge'
  pendingEdgeSourceId?: string | null
  onBeginAddEdgeFromNode?: (nodeId: string, portKey?: string | null) => void
  onFinalizeAddEdgeToNode?: (nodeId: string, portKey?: string | null) => void
}) {
  const {
    active,
    storyboardWidgetSurfaceId,
    editorSurfaceKind,
    node,
    graphMetaKind,
    registryEntry,
    registryEntries,
    minimized,
    hideFields,
    pinned,
    showPinToggle = true,
    uiPanelOpacity,
    panelTextClass,
    microLabelClass,
    monospaceTextClass,
    uiIconScale,
    uiIconStrokeWidth,
    labelInputRef,
    headerDragEnabled = true,
    onHeaderPointerDown,
    onToggleHideFields,
    onTogglePinned,
    onPinnedPointerDown,
    onToggleMinimized,
    onSetLabel,
    onSetType,
    onPatchProperties,
    onSetProperties,
    onValidate,
    onRegistrySelectionChange,
    onRenameSchemaFieldId,

    connectedValuesBySchemaPath,
    richMediaWidgetPreview,

    portHandleEdges,
    schema,
    toolMode,
    pendingEdgeSourceId,
    onBeginAddEdgeFromNode,
    onFinalizeAddEdgeToNode,
  } = args

  const beatByBeatTitle = React.useMemo(() => {
    const kind = String(graphMetaKind || '').trim()
    if (kind !== 'frontmatter-flow') return null
    const beatRef = resolveBeatRefForNode(node)
    if (!beatRef) return null
    const ids = resolveBeatClipOverlayIdsForNode(node)
    if (!ids) return null
    return (
      <>
        <span>{beatRef}</span>
        <span>{' · '}</span>
        <code className={cn(monospaceTextClass, UI_THEME_TOKENS.text.secondary)}>{`{{timeline.beats.${beatRef}.label}}`}</code>
        <span>{' · '}</span>
        <code className={cn(monospaceTextClass, UI_THEME_TOKENS.text.secondary)}>{ids.clipNodeId}</code>
        <span>{' → '}</span>
        <code className={cn(monospaceTextClass, UI_THEME_TOKENS.text.secondary)}>{ids.overlayNodeId}</code>
      </>
    )
  }, [graphMetaKind, monospaceTextClass, node])
  const handleSchemaPortHandleClick = React.useCallback(
    (evt: { dir: 'in' | 'out'; portKey: string }) => {
      if (!active) return
      const nodeId = String(node.id || '').trim()
      if (!nodeId) return
      const portKey = String(evt.portKey || '').trim()
      if (!portKey) return

      if (evt.dir === 'out') {
        onBeginAddEdgeFromNode?.(nodeId, portKey)
        return
      }

      if (!pendingEdgeSourceId) return
      if (pendingEdgeSourceId === nodeId) return
      onFinalizeAddEdgeToNode?.(nodeId, portKey)
    },
    [active, node.id, onBeginAddEdgeFromNode, onFinalizeAddEdgeToNode, pendingEdgeSourceId],
  )

  const isFrontmatterFlow = React.useMemo(() => {
    return String(graphMetaKind || '').trim() === 'frontmatter-flow'
  }, [graphMetaKind])
  const editorSurfaceLabel = resolveWidgetEditorSurfaceLabel(editorSurfaceKind)
  const isRichMediaPanelWidget = String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
  const showRichMediaPanelBody = isRichMediaPanelWidget && !hideFields && !minimized
  const constrainRichMedia = showRichMediaPanelBody && args.constrainToContainer === true
  const richMediaPanelState = richMediaWidgetPreview?.richMediaPanelState || null
  const richMediaPreview = richMediaWidgetPreview?.richMediaPreview || null
  const richMediaPanelViewSize = richMediaWidgetPreview?.richMediaPanelViewSize || RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE
  const handleRichMediaResizeStart = richMediaWidgetPreview?.handleRichMediaResizeStart
  const handleRichMediaResize = richMediaWidgetPreview?.handleRichMediaResize
  const handleRichMediaResizeEnd = richMediaWidgetPreview?.handleRichMediaResizeEnd
  const handleRichMediaContentSize = richMediaWidgetPreview?.handleRichMediaContentSize
  const handleRichMediaPanelChange = richMediaWidgetPreview?.handleRichMediaPanelChange
  const hasRichMediaResizeHandlers = Boolean(handleRichMediaResizeStart || handleRichMediaResize || handleRichMediaResizeEnd)
  const handleRichMediaOuterResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!hasRichMediaResizeHandlers) return
    beginRichMediaPanelResizeDrag({
      event,
      onBeforeStart: () => {
        try {
          emitStoryboardWidgetInteractionFrame()
        } catch {
          void 0
        }
      },
      onResizeStart: handleRichMediaResizeStart,
      onResize: handleRichMediaResize,
      onResizeEnd: handleRichMediaResizeEnd,
    })
  }, [handleRichMediaResize, handleRichMediaResizeEnd, handleRichMediaResizeStart, hasRichMediaResizeHandlers])

  return (
    <FloatingPanel
      as="section"
      ariaLabel={editorSurfaceLabel}
      className={getStoryboardWidgetPanelChromeClassName(panelTextClass)}
      onWheelCapture={e => handleWidgetInnerPanelWheelCapture(e, emitStoryboardWidgetInteractionFrame)}
      onScrollCapture={() => handleWidgetInnerPanelScrollCapture(emitStoryboardWidgetInteractionFrame)}
      style={{
        opacity: showRichMediaPanelBody ? 1 : (Number.isFinite(uiPanelOpacity) ? uiPanelOpacity : 1),
        width: showRichMediaPanelBody ? `${richMediaPanelViewSize.width}px` : undefined,
        height: minimized || constrainRichMedia ? undefined : (showRichMediaPanelBody ? `${richMediaPanelViewSize.height}px` : WIDGET_BASE_SIZE.height),
        maxWidth: constrainRichMedia ? '100%' : undefined,
        minWidth: constrainRichMedia ? 0 : undefined,
        aspectRatio: constrainRichMedia ? `${richMediaPanelViewSize.width} / ${richMediaPanelViewSize.height}` : undefined,
      }}
    >
      <StoryboardWidgetPanelChromeHeader
        active={active}
        title={beatByBeatTitle || resolveWidgetNodeTitle({ node, graphMetaKind, registryEntry })}
        minimized={minimized}
        hideFields={hideFields}
        showFieldToggle={!isRichMediaPanelWidget}
        showPinToggle={showPinToggle}
        actionsAriaLabel={editorSurfaceLabel}
        pinned={pinned}
        microLabelClass={microLabelClass}
        uiIconScale={uiIconScale}
        uiIconStrokeWidth={uiIconStrokeWidth}
        dragHandle={headerDragEnabled}
        onHeaderPointerDown={headerDragEnabled ? onHeaderPointerDown : undefined}
        onValidate={onValidate}
        onToggleHideFields={onToggleHideFields}
        onToggleMinimized={onToggleMinimized}
        onTogglePinned={onTogglePinned}
        onPinnedPointerDown={onPinnedPointerDown}
      />

      {showRichMediaPanelBody ? (
        <section
          data-kg-widget-body="1"
          data-kg-rich-media-render-surface="1"
          data-kg-rich-media-scroll-owner="panel"
          data-kg-media-scroll-surface="1"
          className="relative min-h-0 overflow-y-auto overflow-x-hidden"
          style={{
            width: '100%',
            maxWidth: '100%',
            flex: '1 1 0%',
            overscrollBehaviorX: 'none',
            overscrollBehaviorY: 'contain',
            pointerEvents: 'auto',
            scrollbarGutter: 'stable',
          }}
        >
          <RichMediaPanel
            overlayId={String(node.id || '')}
            title={String(node.label || getRichMediaPanelNodeLabel())}
            url={richMediaPreview?.url || ''}
            srcDoc={richMediaPreview?.srcDoc}
            openUrl={richMediaPreview?.openUrl || richMediaPreview?.url || ''}
            kind={richMediaPreview?.kind || 'iframe'}
            renderMode={richMediaPreview?.renderMode}
            interactive={richMediaPreview?.interactive !== false}
            resizable={true}
            onResizeStart={handleRichMediaResizeStart}
            onResize={handleRichMediaResize}
            onResizeEnd={handleRichMediaResizeEnd}
            panel={richMediaPanelState || undefined}
            widgetToolbarActive={false}
            onPanelChange={handleRichMediaPanelChange}
            frameMode="surface"
            resizeHandlePlacement="external"
            scrollOwner="panel"
            storyboardWidgetInteractionMode={true}
            storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
            headerPinned={pinned}
            storyboardWidgetFrontmatterDocumentMode={isFrontmatterFlow}
            onInlineContentSize={handleRichMediaContentSize}
            style={PANEL_FRAME_EMBEDDED_SURFACE_STYLE}
          />
        </section>
      ) : !minimized && (
        <WidgetEditorForm
          active={active}
          storyboardWidgetSurfaceId={storyboardWidgetSurfaceId}
          pinnedInCanvas={pinned}
          node={node}
          graphMetaKind={graphMetaKind}
          edges={portHandleEdges}
          schema={schema}
          hideFields={hideFields}
          labelInputRef={labelInputRef}
          onSetLabel={onSetLabel}
          onSetType={onSetType}
          onPatchProperties={onPatchProperties}
          onSetProperties={onSetProperties}
          onValidate={onValidate}
          onSchemaPortHandleClick={handleSchemaPortHandleClick}
          onRenameSchemaFieldId={onRenameSchemaFieldId}
          onRegistrySelectionChange={onRegistrySelectionChange}
          connectedValuesBySchemaPath={connectedValuesBySchemaPath}
          richMediaWidgetPreview={richMediaWidgetPreview}

          registryEntry={registryEntry}
          registryEntries={registryEntries}
        />
      )}

      {isRichMediaPanelWidget ? (
        <WidgetEditorPortHandles
          active={active}
          node={{ id: node.id, type: node.type, properties: node.properties }}
          schema={schema}
          registryEntries={registryEntries}
          edges={portHandleEdges}
          forceEnabled
          strictHandleSet={isFrontmatterFlow}
          toolMode={toolMode}
          pendingEdgeSourceId={pendingEdgeSourceId}
          onBeginAddEdgeFromNode={onBeginAddEdgeFromNode}
          onFinalizeAddEdgeToNode={onFinalizeAddEdgeToNode}
        />
      ) : null}

      {showRichMediaPanelBody && hasRichMediaResizeHandlers ? (
        <RichMediaPanelResizeHandle placement="panel" onPointerDown={handleRichMediaOuterResizePointerDown} />
      ) : null}
    </FloatingPanel>
  )
})
