import React from 'react'
import type { GraphNode, GraphEdge } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { usePinnedLs } from '@/lib/ui/panelPinned'
import { LS_KEYS } from '@/lib/config.ls.keys'
import Tooltip from 'agentic-design-system/react/hover'
import { HOVER_BEHAVIOR } from 'agentic-design-system/hover/text'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { PanelControlButton } from 'agentic-design-system/react/panels'
import { startPointerDrag } from 'grph-shared/dom/pointerDrag'
import { computePanelFrameResizeFromDrag16x9, readRichMediaPanelFrameMetrics } from '@/lib/render/mediaPanelLayout'
import { buildGraphHoverSemanticKey, buildNodeContent, buildEdgeContent, buildGroupContent } from './GraphHoverTooltip.data'

export type HoverKind = 'node' | 'edge' | 'group'

export type HoverInfo = {
  kind: HoverKind;
  id: string;
  clientX: number;
  clientY: number;
}

const HOVER_PANEL_BRIDGE_CLOSE_DELAY_MS = HOVER_BEHAVIOR.bridgeCloseDelayMs
const HOVER_PANEL_DEFAULT_WIDTH_PX = 260
const HOVER_PANEL_MIN_WIDTH_PX = 220
const HOVER_PANEL_MIN_HEIGHT_PX = 140

type HoverPanelOffset = { x: number; y: number }
type HoverPanelSize = { width: number; height: number }

const ZERO_HOVER_PANEL_OFFSET: HoverPanelOffset = { x: 0, y: 0 }

const isHoverPanelDragExcludedTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false
  return !!target.closest([
    '[data-kg-resize-handle]',
    '[data-kg-card-media-interactive="1"]',
    'button',
    'a',
    'input',
    'select',
    'textarea',
    '[contenteditable="true"]',
    'iframe',
    'video',
    'audio',
  ].join(','))
}

export type GraphHoverTooltipProps = {
  hoverInfo: HoverInfo | null;
  containerRef: React.RefObject<HTMLElement | null>;
  nodes: GraphNode[] | null | undefined;
  edges: GraphEdge[] | null | undefined;
  schema: GraphSchema | null | undefined;
  onRequestClose?: () => void;
  tooltipInteractive?: boolean;
}

export function GraphHoverTooltip({ hoverInfo, containerRef, nodes, edges, schema, onRequestClose, tooltipInteractive = false }: GraphHoverTooltipProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const uiIconBadgeChipClass = useGraphStore(s => s.uiIconBadgeChipClass)
  const uiIconBadgeChipTextSizeClass = useGraphStore(s => s.uiIconBadgeChipTextSizeClass)
  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || s.uiIconBadgeChipTextSizeClass || 'text-xs',
  )
  const graphHoverPreviewConfig = useGraphStore(s => s.graphHoverPreviewConfig)
  const uiOverlayOpacity = useGraphStore(s => s.uiOverlayOpacity)
  const uiIconStrokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  const iconSizeClass = getIconSizeClass(uiIconScale)
  const { pinned: tooltipPinned, setPinned } = usePinnedLs(LS_KEYS.hoverTooltipPinned, false)
  const [pinnedKey, setPinnedKey] = React.useState<string | null>(null)
  const [pinnedHoverInfo, setPinnedHoverInfo] = React.useState<HoverInfo | null>(null)
  const [bridgedHoverInfo, setBridgedHoverInfo] = React.useState<HoverInfo | null>(null)
  const [hoverPanelHovered, setHoverPanelHovered] = React.useState(false)
  const [hoverPanelOffset, setHoverPanelOffset] = React.useState<HoverPanelOffset>(ZERO_HOVER_PANEL_OFFSET)
  const [hoverPanelSize, setHoverPanelSize] = React.useState<HoverPanelSize | null>(null)
  const hoverPanelHoveredRef = React.useRef(false)
  const hoverPanelRootRef = React.useRef<HTMLElement | null>(null)
  const hoverPanelPointerDragActiveRef = React.useRef(false)
  const hoverBridgeCloseTimerRef = React.useRef<number | null>(null)
  const container = containerRef.current
  const clearHoverBridgeCloseTimer = React.useCallback(() => {
    if (hoverBridgeCloseTimerRef.current === null) return
    window.clearTimeout(hoverBridgeCloseTimerRef.current)
    hoverBridgeCloseTimerRef.current = null
  }, [])
  const scheduleHoverBridgeClose = React.useCallback(() => {
    clearHoverBridgeCloseTimer()
    hoverBridgeCloseTimerRef.current = window.setTimeout(() => {
      hoverBridgeCloseTimerRef.current = null
      if (hoverPanelHoveredRef.current) return
      setBridgedHoverInfo(null)
    }, HOVER_PANEL_BRIDGE_CLOSE_DELAY_MS)
  }, [clearHoverBridgeCloseTimer])
  React.useEffect(() => () => {
    clearHoverBridgeCloseTimer()
  }, [clearHoverBridgeCloseTimer])
  React.useEffect(() => {
    if (tooltipPinned) {
      clearHoverBridgeCloseTimer()
      hoverPanelHoveredRef.current = false
      setHoverPanelHovered(false)
      setBridgedHoverInfo(null)
      return
    }
    if (hoverInfo) {
      clearHoverBridgeCloseTimer()
      setBridgedHoverInfo(hoverInfo)
      return
    }
    if (!bridgedHoverInfo) return
    if (hoverPanelHoveredRef.current) return
    scheduleHoverBridgeClose()
  }, [bridgedHoverInfo, clearHoverBridgeCloseTimer, hoverInfo, scheduleHoverBridgeClose, tooltipPinned])
  const nodeMap = React.useMemo(() => {
    if (!nodes || !Array.isArray(nodes)) return null
    const m = new Map<string, GraphNode>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      m.set(String(n.id), n)
    }
    return m
  }, [nodes])
  const edgeMap = React.useMemo(() => {
    if (!edges || !Array.isArray(edges)) return null
    const m = new Map<string, GraphEdge>()
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]
      m.set(String(e.id), e)
    }
    return m
  }, [edges])
  const groupMap = React.useMemo(() => {
    if (!nodes || !Array.isArray(nodes)) return null
    const graphData = { type: 'GraphData', nodes, edges: edges && Array.isArray(edges) ? edges : [] }
    const groups = deriveGraphGroups(graphData)
    if (!groups || groups.length === 0) return null
    const m = new Map<string, GraphGroup>()
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i]
      m.set(String(g.id || ''), g)
    }
    return m
  }, [nodes, edges])
  const effectiveHoverInfo = tooltipPinned ? pinnedHoverInfo : (hoverInfo || bridgedHoverInfo)
  const hoverKind = effectiveHoverInfo?.kind
  const hoverId = effectiveHoverInfo?.id
  const hoverSemanticKey = React.useMemo(() => (
    buildGraphHoverSemanticKey({ kind: hoverKind, id: hoverId })
  ), [hoverKind, hoverId])
  const [expanded, setExpanded] = React.useState(false)
  const expandedKeyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    const nextKey = hoverSemanticKey
    if (expandedKeyRef.current !== nextKey) {
      expandedKeyRef.current = nextKey
      setExpanded(false)
    }
  }, [hoverSemanticKey])
  const node = React.useMemo(() => {
    if (hoverKind !== 'node' || !hoverId || !nodeMap) return null
    return nodeMap.get(String(hoverId)) || null
  }, [hoverKind, hoverId, nodeMap])
  const edge = React.useMemo(() => {
    if (hoverKind !== 'edge' || !hoverId || !edgeMap) return null
    return edgeMap.get(String(hoverId)) || null
  }, [hoverKind, hoverId, edgeMap])
  const group = React.useMemo(() => {
    if (hoverKind !== 'group' || !hoverId || !groupMap) return null
    return groupMap.get(String(hoverId)) || null
  }, [hoverKind, hoverId, groupMap])
  const content = React.useMemo(() => {
    const onToggleExpanded = () => setExpanded(v => !v)
    if (node) {
      return buildNodeContent(
        node,
        schema,
        iconSizeClass,
        uiIconBadgeChipClass,
        uiIconBadgeChipTextSizeClass,
        uiPanelMicroLabelTextSizeClass,
        graphHoverPreviewConfig,
        expanded,
        onToggleExpanded,
      )
    }
    if (edge) {
      return buildEdgeContent(
        edge,
        schema,
        iconSizeClass,
        uiIconBadgeChipClass,
        uiIconBadgeChipTextSizeClass,
        uiPanelMicroLabelTextSizeClass,
        graphHoverPreviewConfig,
        expanded,
        onToggleExpanded,
      )
    }
    if (group) {
      return buildGroupContent(group)
    }
    return null
  }, [
    edge,
    group,
    iconSizeClass,
    node,
    schema,
    uiIconBadgeChipClass,
    uiIconBadgeChipTextSizeClass,
    uiPanelMicroLabelTextSizeClass,
    graphHoverPreviewConfig,
    expanded,
  ])
  React.useEffect(() => {
    if (!tooltipPinned) {
      setPinnedKey(null)
      setPinnedHoverInfo(null)
      return
    }
    if (!hoverInfo) return
    if (pinnedKey) return
    const nextPinnedKey = buildGraphHoverSemanticKey(hoverInfo)
    if (!nextPinnedKey) return
    setPinnedKey(nextPinnedKey)
    setPinnedHoverInfo(hoverInfo)
  }, [hoverInfo, pinnedKey, tooltipPinned])

  const handleTogglePinned = React.useCallback(() => {
    if (!tooltipPinned) {
      if (hoverInfo) {
        const nextPinnedKey = buildGraphHoverSemanticKey(hoverInfo)
        setPinnedHoverInfo(hoverInfo)
        setPinnedKey(nextPinnedKey)
      }
      setPinned(true)
      return
    }
    setPinned(false)
    setPinnedKey(null)
    setPinnedHoverInfo(null)
    setHoverPanelOffset(ZERO_HOVER_PANEL_OFFSET)
    setHoverPanelSize(null)
  }, [hoverInfo, setPinned, tooltipPinned])

  const handleClose = React.useCallback(() => {
    clearHoverBridgeCloseTimer()
    hoverPanelHoveredRef.current = false
    setHoverPanelHovered(false)
    setBridgedHoverInfo(null)
    setPinned(false)
    setPinnedKey(null)
    setPinnedHoverInfo(null)
    setHoverPanelOffset(ZERO_HOVER_PANEL_OFFSET)
    setHoverPanelSize(null)
    if (onRequestClose) onRequestClose()
  }, [clearHoverBridgeCloseTimer, onRequestClose, setPinned])

  React.useEffect(() => {
    if (tooltipPinned) return
    setHoverPanelOffset(ZERO_HOVER_PANEL_OFFSET)
    setHoverPanelSize(null)
  }, [hoverSemanticKey, tooltipPinned])

  const handleHoverPanelPointerDown = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!tooltipPinned) return
    if (event.button !== 0) return
    if (isHoverPanelDragExcludedTarget(event.target)) return
    const startX = event.clientX
    const startY = event.clientY
    const startOffset = hoverPanelOffset
    hoverPanelPointerDragActiveRef.current = true
    startPointerDrag({
      ev: event.nativeEvent,
      cursor: 'grabbing',
      onMove: ev => {
        setHoverPanelOffset({
          x: Math.round(startOffset.x + ev.clientX - startX),
          y: Math.round(startOffset.y + ev.clientY - startY),
        })
      },
      onEnd: () => {
        hoverPanelPointerDragActiveRef.current = false
      },
      onCancel: () => {
        hoverPanelPointerDragActiveRef.current = false
      },
    })
  }, [hoverPanelOffset, tooltipPinned])

  const handleHoverPanelResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!tooltipPinned) return
    if (event.button !== 0) return
    const rootEl = hoverPanelRootRef.current
    const rect = rootEl?.getBoundingClientRect()
    const startW = hoverPanelSize?.width || Math.max(HOVER_PANEL_DEFAULT_WIDTH_PX, Math.round(rect?.width || HOVER_PANEL_DEFAULT_WIDTH_PX))
    const startH = hoverPanelSize?.height || Math.max(HOVER_PANEL_MIN_HEIGHT_PX, Math.round(rect?.height || HOVER_PANEL_MIN_HEIGHT_PX))
    const metrics = readRichMediaPanelFrameMetrics(rootEl)
    const startX = event.clientX
    const startY = event.clientY
    hoverPanelPointerDragActiveRef.current = true
    startPointerDrag({
      ev: event.nativeEvent,
      cursor: 'nwse-resize',
      onMove: ev => {
        const next = computePanelFrameResizeFromDrag16x9({
          startW,
          startH,
          dxClientPx: ev.clientX - startX,
          dyClientPx: ev.clientY - startY,
          metrics,
          minPanelW: HOVER_PANEL_MIN_WIDTH_PX,
          minPanelH: HOVER_PANEL_MIN_HEIGHT_PX,
        })
        setHoverPanelSize({
          width: next.panelW,
          height: next.panelH,
        })
      },
      onEnd: () => {
        hoverPanelPointerDragActiveRef.current = false
      },
      onCancel: () => {
        hoverPanelPointerDragActiveRef.current = false
      },
    })
  }, [hoverPanelSize, tooltipPinned])

  const anyPointerDragActive = (() => {
    try {
      const g = globalThis as unknown as { __kgActivePointerDragByKey?: unknown }
      const map = g.__kgActivePointerDragByKey as unknown as Map<string, unknown> | undefined
      return !!(map && typeof map.size === 'number' && map.size > 0)
    } catch {
      return false
    }
  })()
  const effectiveInteractive = (
    tooltipInteractive === true || tooltipPinned
  ) && (anyPointerDragActive !== true || hoverPanelPointerDragActiveRef.current)
  const hoverPanelRootStyle = React.useMemo<React.CSSProperties>(() => ({
    opacity: uiOverlayOpacity,
    pointerEvents: effectiveInteractive ? 'auto' : 'none',
  }), [effectiveInteractive, uiOverlayOpacity])
  const handleContentMouseEnter = React.useCallback(() => {
    if (!effectiveInteractive) return
    clearHoverBridgeCloseTimer()
    hoverPanelHoveredRef.current = true
    setHoverPanelHovered(true)
  }, [clearHoverBridgeCloseTimer, effectiveInteractive])
  const handleContentMouseLeave = React.useCallback(() => {
    hoverPanelHoveredRef.current = false
    setHoverPanelHovered(false)
    if (tooltipPinned) return
    clearHoverBridgeCloseTimer()
    setBridgedHoverInfo(null)
    if (onRequestClose) onRequestClose()
  }, [clearHoverBridgeCloseTimer, onRequestClose, tooltipPinned])

  if (!effectiveHoverInfo || !container || !content) return null
  const rect = container.getBoundingClientRect()
  const hoverXRaw = effectiveHoverInfo.clientX - rect.left + 8
  const hoverYRaw = effectiveHoverInfo.clientY - rect.top + 8
  const hoverX = Math.max(8, Math.min(Math.max(8, rect.width - 8), hoverXRaw))
  const hoverY = Math.max(8, Math.min(Math.max(8, rect.height - 8), hoverYRaw))

  return (
    <Tooltip
      content={(
        <section
          data-kg-hover-panel="1"
          data-kg-canvas-wheel-ignore="true"
          data-kg-hover-panel-pinned={tooltipPinned ? '1' : undefined}
          data-kg-hover-panel-drag-enabled={tooltipPinned ? '1' : undefined}
          data-kg-hover-panel-resize-enabled={tooltipPinned ? '1' : undefined}
          onPointerDown={handleHoverPanelPointerDown}
        >
          <section className="flex items-start justify-between gap-2">
            <section className="min-w-0 flex-1">{content}</section>
            <section className="flex flex-col gap-1 flex-none">
              <PanelControlButton control="pin" onAction={handleTogglePinned} pressed={tooltipPinned} />
              <PanelControlButton control="close" onAction={handleClose} />
            </section>
          </section>
          {tooltipPinned ? (
            <button
              type="button"
              aria-label="Resize"
              data-kg-resize-handle="se"
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 22,
                height: 22,
                background: 'transparent',
                cursor: 'nwse-resize',
                pointerEvents: 'auto',
                zIndex: 20,
              }}
              onPointerDown={handleHoverPanelResizePointerDown}
            >
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: 'transparent',
                  border: '2px solid var(--kg-canvas-accent)',
                  boxShadow: 'var(--kg-shadow-overlay)',
                  transition: 'var(--kg-transition-group-resize-dot)',
                }}
              />
            </button>
          ) : null}
        </section>
      )}
      open
      className={effectiveInteractive ? 'absolute z-50 pointer-events-auto' : 'absolute z-50 pointer-events-none'}
      anchorStyle={{ left: hoverX, top: hoverY, width: 0, height: 0 }}
      maxWidthPx={hoverPanelSize?.width || HOVER_PANEL_DEFAULT_WIDTH_PX}
      contentStyle={hoverPanelRootStyle}
      contentRef={hoverPanelRootRef}
      contentOffset={tooltipPinned ? hoverPanelOffset : null}
      contentSize={tooltipPinned ? hoverPanelSize : null}
      contentDataAttrs={{
        'data-kg-hover-panel-root': '1',
        'data-kg-hover-panel-bridged': bridgedHoverInfo && !hoverInfo ? '1' : undefined,
        'data-kg-hover-panel-hovered': hoverPanelHovered ? '1' : undefined,
        'data-kg-panel-frame': '1',
      }}
      onContentMouseEnter={handleContentMouseEnter}
      onContentMouseLeave={handleContentMouseLeave}
      interactive={effectiveInteractive}
    >
      <span />
    </Tooltip>
  )
}
