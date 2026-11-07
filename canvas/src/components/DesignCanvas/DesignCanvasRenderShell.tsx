import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { CANVAS_INTERACTIVE_CLASS, CANVAS_SURFACE_CLASS } from '@/lib/canvas/surface'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { CanvasGridOverlaySurface } from '@/components/CanvasGridOverlaySurface'
import type { CanvasGridRenderConfig } from '@/lib/canvas/canvasGridConfig'
import { DesignCanvasArrangeActionBar } from '@/components/DesignCanvas/ArrangeActionBar'
import { DesignCanvasEditorChrome } from '@/components/DesignCanvas/DesignCanvasEditorChrome'
import { DesignCanvasFrameShellLayer } from '@/components/DesignCanvas/FrameShellLayer'
import { DesignCanvasLabelBadgesLayer } from '@/components/DesignCanvas/LabelBadgesLayer'
import { DesignCanvasMediaOverlay } from '@/components/DesignCanvas/MediaOverlay'
import { DesignCanvasSelectionOverlay } from '@/components/DesignCanvas/SelectionOverlay'
import { DesignCanvasWebpageStatusPanel } from '@/components/DesignCanvas/webpageStatusPanel'
import { DesignCanvasWireframePreviewLayer } from '@/components/DesignCanvas/WireframePreviewLayer'
import { MarkdownDesignOverlay } from '@/lib/markdown-edgeless'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import type {
  DesignCanvasFrameNodeRef,
  DesignCanvasFrameRect,
  DesignCanvasFrameVisual,
  DesignCanvasGroupBounds,
  DesignCanvasGroupHandleConfig,
  DesignCanvasInlineMediaPreview,
  DesignCanvasLabelLayout,
  DesignCanvasMarqueeBox,
  DesignCanvasResizeHandle,
  DesignCanvasWireframeEdge,
  DesignCanvasWireframePreview,
} from '@/components/DesignCanvas/types'
import type { MediaOverlayNode } from '@/lib/render/mediaOverlayPool'
import type { WebpageFrontmatterMeta } from '@/lib/markdown/frontmatter'
import type { WebpageStatusUiStore } from '@/components/DesignCanvas/webpageStatusStore'

export type DesignCanvasRenderShellProps = {
  containerRef: React.RefObject<HTMLElement | null>
  active: boolean
  interactionActive: boolean
  documentUrl: string
  webpageFrontmatter: WebpageFrontmatterMeta | null
  webpageWorkspacePath: string | null
  webpageLayoutStatus: 'idle' | 'loading' | 'ready' | 'error'
  webpageStatusStore: WebpageStatusUiStore
  onDecreaseFidelity: () => void
  onIncreaseFidelity: () => void
  onRetry: () => void
  selectedCount: number
  arrangeActionsActive: boolean
  onArrangeAction: (action: string) => void
  canvasGrid: CanvasGridRenderConfig | null
  themeSignal?: string
  dims: { width: number; height: number; dpr: number }
  getZoomTransform: () => unknown
  getZoomEventTarget: () => SVGSVGElement | null
  svgRef: React.RefObject<SVGSVGElement | null>
  gRef: React.RefObject<SVGGElement | null>
  onSvgPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void
  onSvgPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void
  onSvgPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void
  onSvgPointerCancel: () => void
  designGroups: GraphGroup[]
  designGroupBoundsById: Record<string, DesignCanvasGroupBounds>
  selectedGroupId: string | null
  allowGroupResize: boolean
  groupHandleCfg: DesignCanvasGroupHandleConfig
  registerGroupRectEl: (id: string, el: SVGRectElement | null) => void
  registerGroupHandleEl: (id: string, el: SVGGElement | null) => void
  beginGroupResize: (
    event: React.PointerEvent<Element>,
    args: { groupId: string; memberNodeIds: string[]; startBounds: { x: number; y: number; w: number; h: number } },
  ) => void
  styleById: Map<string, unknown> | null
  wireframeEdges: DesignCanvasWireframeEdge[]
  wireframeEdgeStroke: string
  wireframeEdgeStrokeWidth: number
  wireframeEdgesAnimated: boolean
  renderNodes: DesignCanvasFrameNodeRef[]
  positions: Record<string, DesignCanvasFrameRect>
  panelOnlyNodeIdSet: Set<string> | null
  frameVisualById: Map<string, DesignCanvasFrameVisual>
  renderMediaAsNodes: boolean
  designMediaPreviewById: Map<string, DesignCanvasInlineMediaPreview>
  startDesignMediaOverlayPan: (args: { pointerId: number }) => void
  moveDesignMediaOverlayPan: (args: { pointerId: number; dx: number; dy: number }) => void
  endDesignMediaOverlayPan: (args: { pointerId: number }) => void
  registerFrameEl: (id: string, el: SVGGElement | null) => void
  registerFrameRectEl: (id: string, el: SVGRectElement | null) => void
  registerFrameStatusEl: (id: string, el: SVGPathElement | null) => void
  onFramePointerDown: (id: string, rect: DesignCanvasFrameRect, event: React.PointerEvent<SVGGElement>) => void
  onFramePointerMove: (event: React.PointerEvent<SVGGElement>) => void
  onFramePointerUp: () => void
  onFramePointerCancel: (id: string, rect: { x: number; y: number }) => void
  wireframePreviewById: Map<string, DesignCanvasWireframePreview>
  labelLayoutById: Map<string, DesignCanvasLabelLayout>
  selectedNodeId: string | null
  marqueeBox: DesignCanvasMarqueeBox | null
  resizeOverlayRef: React.MutableRefObject<SVGGElement | null>
  onBeginResize: (
    event: React.PointerEvent<SVGRectElement>,
    args: { id: string; handle: DesignCanvasResizeHandle; rect: DesignCanvasFrameRect },
  ) => void
  workspaceEditorOverlayEnabled: boolean
  markdownDocumentName: string | null
  markdownDocumentText: string
  markdownPanelAllowedKinds: Array<'table' | 'code' | 'blockquote' | 'callout' | 'html'>
  stopOverlayEvent: (event: React.SyntheticEvent) => void
  designMediaOverlayNodes: MediaOverlayNode[]
  onRegisterOverlayEl: (id: string, el: HTMLElement | null) => void
  shouldStartHeaderDrag: () => boolean
  onHeaderDragStart: (args: { nodeId: string; pointerId: number }) => void
  onHeaderDrag: (args: { nodeId: string; dx: number; dy: number; pointerId: number }) => void
  onHeaderDragEnd: (args: { nodeId: string; pointerId: number }) => void
}

export function DesignCanvasRenderShell(props: DesignCanvasRenderShellProps) {
  const {
    containerRef,
    active,
    interactionActive,
    documentUrl,
    webpageFrontmatter,
    webpageWorkspacePath,
    webpageLayoutStatus,
    webpageStatusStore,
    onDecreaseFidelity,
    onIncreaseFidelity,
    onRetry,
    selectedCount,
    arrangeActionsActive,
    onArrangeAction,
    canvasGrid,
    themeSignal,
    dims,
    getZoomTransform,
    getZoomEventTarget,
    svgRef,
    gRef,
    onSvgPointerDown,
    onSvgPointerMove,
    onSvgPointerUp,
    onSvgPointerCancel,
    designGroups,
    designGroupBoundsById,
    selectedGroupId,
    allowGroupResize,
    groupHandleCfg,
    registerGroupRectEl,
    registerGroupHandleEl,
    beginGroupResize,
    styleById,
    wireframeEdges,
    wireframeEdgeStroke,
    wireframeEdgeStrokeWidth,
    wireframeEdgesAnimated,
    renderNodes,
    positions,
    panelOnlyNodeIdSet,
    frameVisualById,
    renderMediaAsNodes,
    designMediaPreviewById,
    startDesignMediaOverlayPan,
    moveDesignMediaOverlayPan,
    endDesignMediaOverlayPan,
    registerFrameEl,
    registerFrameRectEl,
    registerFrameStatusEl,
    onFramePointerDown,
    onFramePointerMove,
    onFramePointerUp,
    onFramePointerCancel,
    wireframePreviewById,
    labelLayoutById,
    selectedNodeId,
    marqueeBox,
    resizeOverlayRef,
    onBeginResize,
    workspaceEditorOverlayEnabled,
    markdownDocumentName,
    markdownDocumentText,
    markdownPanelAllowedKinds,
    stopOverlayEvent,
    designMediaOverlayNodes,
    onRegisterOverlayEl,
    shouldStartHeaderDrag,
    onHeaderDragStart,
    onHeaderDrag,
    onHeaderDragEnd,
  } = props

  return (
    <section
      ref={containerRef}
      className={`${CANVAS_SURFACE_CLASS} relative h-full w-full overflow-hidden bg-[var(--kg-panel-bg)]`}
      aria-label="Design Canvas"
    >
      <DesignCanvasWebpageStatusPanel
        active={active}
        documentUrl={documentUrl}
        webpageFrontmatter={webpageFrontmatter}
        webpageWorkspacePath={webpageWorkspacePath}
        webpageLayoutStatus={webpageLayoutStatus}
        webpageStatusStore={webpageStatusStore}
        onDecreaseFidelity={onDecreaseFidelity}
        onIncreaseFidelity={onIncreaseFidelity}
        onRetry={onRetry}
      />
      <DesignCanvasArrangeActionBar active={arrangeActionsActive} selectedCount={selectedCount} onAction={onArrangeAction} />
      <DesignCanvasEditorChrome active={active} interactionActive={interactionActive} selectedCount={selectedCount} layerCount={renderNodes.length} />
      <CanvasGridOverlaySurface
        canvasGrid={canvasGrid}
        width={dims.width}
        height={dims.height}
        dpr={dims.dpr}
        getTransform={getZoomTransform}
        getEventTarget={getZoomEventTarget}
        themeSignal={themeSignal}
        surfaceId="design"
      />
      <svg
        ref={svgRef}
        className={`${CANVAS_INTERACTIVE_CLASS} block h-full w-full select-none`}
        role="img"
        aria-label="Design renderer"
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={onSvgPointerCancel}
      >
        <defs>
          <filter id="shadow-sm" filterUnits="objectBoundingBox" x={-0.2} y={-0.2} width={1.4} height={1.4}>
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1" />
          </filter>
          <filter id="shadow-md" filterUnits="objectBoundingBox" x={-0.2} y={-0.2} width={1.4} height={1.4}>
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.1" />
          </filter>
        </defs>
        <g ref={gRef}>
          {designGroups.length > 0 ? (
            <g data-kg-layer="design-groups">
              {designGroups.map(group => {
                const id = String(group.id || '').trim()
                if (!id) return null
                const bounds = designGroupBoundsById[id]
                if (!bounds) return null
                const selected = String(selectedGroupId || '').trim() === id
                const stroke = selected ? 'var(--kg-canvas-accent)' : 'var(--kg-border)'
                const strokeWidth = selected ? 2 : 1.5
                const canResize = allowGroupResize && selected
                const isHeadingGroup = group.source === 'markdownHeading' || id.startsWith('md:')
                const fill = isHeadingGroup ? (group.style?.fill || 'var(--kg-panel-bg)') : 'transparent'
                const fillOpacity = isHeadingGroup ? 0.16 : 0
                return (
                  <g key={id} data-kg-group-id={id} style={{ pointerEvents: 'all' }}>
                    <rect
                      ref={el => registerGroupRectEl(id, el)}
                      data-kg-design-group-rect="1"
                      x={bounds.x}
                      y={bounds.y}
                      width={bounds.w}
                      height={bounds.h}
                      fill={fill}
                      fillOpacity={fillOpacity}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      rx={12}
                      ry={12}
                      onPointerDown={event => {
                        if (!interactionActive) return
                        if (isSpacePanHeld()) return
                        if (useGraphStore.getState().canvasPointerMode2d === 'pan') return
                        event.stopPropagation()
                        const store = useGraphStore.getState()
                        store.setSelectionSource('canvas')
                        try {
                          store.selectNode(null)
                        } catch {
                          void 0
                        }
                        store.selectGroup(id)
                      }}
                    />
                    {isHeadingGroup ? (
                      <text
                        x={bounds.x + 14}
                        y={bounds.y + 12}
                        dominantBaseline="hanging"
                        textAnchor="start"
                        fill="var(--kg-text-primary)"
                        fontSize={14}
                        fontWeight={600}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {String(group.label || '').trim()}
                      </text>
                    ) : null}
                    <g
                      ref={el => registerGroupHandleEl(id, el)}
                      data-kg-group-resize="br"
                      transform={`translate(${bounds.x + bounds.w},${bounds.y + bounds.h})`}
                      style={{ display: canResize ? undefined : 'none', pointerEvents: 'all', cursor: 'nwse-resize' }}
                    >
                      <circle
                        data-kg-group-resize-hit="1"
                        r={groupHandleCfg.hitRadiusPx}
                        fill="transparent"
                        stroke="transparent"
                        onPointerDown={event => {
                          beginGroupResize(event, {
                            groupId: id,
                            memberNodeIds: Array.isArray(group.memberNodeIds) ? group.memberNodeIds.map(v => String(v || '')) : [],
                            startBounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
                          })
                        }}
                      />
                      <circle
                        data-kg-group-resize-dot="1"
                        r={groupHandleCfg.dotRadiusPx}
                        fill="var(--kg-panel-bg)"
                        fillOpacity={0.72}
                        stroke="var(--kg-text-secondary)"
                        strokeWidth={groupHandleCfg.strokeWidthPx}
                        style={{ pointerEvents: 'none' }}
                      />
                    </g>
                  </g>
                )
              })}
            </g>
          ) : null}
          {styleById && wireframeEdges.length > 0 ? (
            <g data-kg-layer="wireframe-edges" style={{ pointerEvents: 'none' }}>
              {wireframeEdges.map(edge => (
                <path
                  key={edge.id}
                  d={edge.d}
                  stroke={wireframeEdgeStroke}
                  strokeWidth={wireframeEdgeStrokeWidth}
                  opacity={edge.opacity}
                  strokeDasharray={wireframeEdgesAnimated ? '7 5' : undefined}
                  style={wireframeEdgesAnimated ? { animation: 'kg-edge-dash-flow 1.25s linear infinite' } : undefined}
                  fill="none"
                />
              ))}
            </g>
          ) : null}
          <DesignCanvasFrameShellLayer
            renderNodes={renderNodes}
            positions={positions}
            panelOnlyNodeIdSet={panelOnlyNodeIdSet}
            frameVisualById={frameVisualById}
            renderMediaAsNodes={renderMediaAsNodes}
            inlineMediaPreviewById={designMediaPreviewById}
            forwardWheelTo={() => svgRef.current}
            onOverlayPanStart={({ pointerId, buttons }) => {
              if ((buttons & 1) !== 1 && (buttons & 4) !== 4) return
              startDesignMediaOverlayPan({ pointerId })
            }}
            onOverlayPan={({ pointerId, dx, dy }) => moveDesignMediaOverlayPan({ pointerId, dx, dy })}
            onOverlayPanEnd={({ pointerId }) => endDesignMediaOverlayPan({ pointerId })}
            registerFrameEl={registerFrameEl}
            registerFrameRectEl={registerFrameRectEl}
            registerFrameStatusEl={registerFrameStatusEl}
            onFramePointerDown={onFramePointerDown}
            onFramePointerMove={onFramePointerMove}
            onFramePointerUp={onFramePointerUp}
            onFramePointerCancel={onFramePointerCancel}
          />
          <DesignCanvasWireframePreviewLayer
            enabled={Boolean(styleById) && !renderMediaAsNodes}
            renderNodes={renderNodes}
            positions={positions}
            panelOnlyNodeIdSet={panelOnlyNodeIdSet}
            wireframePreviewById={wireframePreviewById}
            forwardWheelTo={() => svgRef.current}
            onOverlayPanStart={({ pointerId, buttons }) => {
              if ((buttons & 1) !== 1 && (buttons & 4) !== 4) return
              startDesignMediaOverlayPan({ pointerId })
            }}
            onOverlayPan={({ pointerId, dx, dy }) => moveDesignMediaOverlayPan({ pointerId, dx, dy })}
            onOverlayPanEnd={({ pointerId }) => endDesignMediaOverlayPan({ pointerId })}
          />
          <DesignCanvasLabelBadgesLayer
            enabled={Boolean(styleById)}
            renderNodes={renderNodes}
            positions={positions}
            panelOnlyNodeIdSet={panelOnlyNodeIdSet}
            labelLayoutById={labelLayoutById}
          />
          <DesignCanvasSelectionOverlay
            active={active}
            selectedNodeId={selectedNodeId}
            positions={positions}
            marqueeBox={marqueeBox}
            resizeOverlayRef={resizeOverlayRef}
            onBeginResize={onBeginResize}
          />
        </g>
      </svg>
      <MarkdownDesignOverlay
        enabled={workspaceEditorOverlayEnabled}
        svgRef={svgRef}
        markdownDocumentName={markdownDocumentName}
        markdownDocumentText={markdownDocumentText}
        allowedKinds={markdownPanelAllowedKinds}
        stopEvent={stopOverlayEvent}
      />
      <DesignCanvasMediaOverlay
        active={active}
        designMediaOverlayNodes={designMediaOverlayNodes}
        renderMediaAsNodes={renderMediaAsNodes}
        onRegisterOverlayEl={onRegisterOverlayEl}
        forwardWheelTo={() => svgRef.current}
        shouldStartHeaderDrag={shouldStartHeaderDrag}
        onOverlayPanStart={({ pointerId, buttons }) => {
          if ((buttons & 1) !== 1 && (buttons & 4) !== 4) return
          startDesignMediaOverlayPan({ pointerId })
        }}
        onOverlayPan={({ pointerId, dx, dy }) => moveDesignMediaOverlayPan({ pointerId, dx, dy })}
        onOverlayPanEnd={({ pointerId }) => endDesignMediaOverlayPan({ pointerId })}
        onHeaderDragStart={onHeaderDragStart}
        onHeaderDrag={onHeaderDrag}
        onHeaderDragEnd={onHeaderDragEnd}
      />
    </section>
  )
}
