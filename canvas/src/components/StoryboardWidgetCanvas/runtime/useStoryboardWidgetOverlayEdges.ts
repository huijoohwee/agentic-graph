import React from 'react'
import { FLOW_HANDLE_DEFAULT_EDGE_ID, buildFlowHandleId, computeFlowHandlesByNode } from '@/components/FlowCanvas/handles'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  hashRecordSignature32,
  hashScopedStringArraySignature,
  hashSignatureParts,
} from '@/lib/hash/signature'
import { type ToolMode, isRecord, pickString } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { readStoryboardOverlayPortHandleSignature } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayPortHandleSignature'
import {
  CANVAS_OVERLAY_PROXY_ROOT_SELECTOR,
  STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT,
  STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT,
  STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR,
  collectCanonicalStoryboardWidgetOverlayRectEntries,
  isTransientOffscreenRichMediaOverlayRoot,
  readCanvasOverlayNodeId,
  readStoryboardWidgetOverlaySurfaceId,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphEdge } from '@/lib/graph/types'
import {
  buildEdgePathD,
  ensureEdgeAnimationStyleElement,
  readEdgePathCurveOptions,
  readGlobalEdgeAnimationEnabled,
  readGlobalEdgeColor,
  readGlobalEdgeThicknessPx,
  readGlobalEdgeType,
} from '@/lib/graph/edgeTypes'
import { readEdgeEndpointId, readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import { buildGraphFlowOrderIndexByNodeId, resolveGraphEdgeFlowOrderDirection } from '@/lib/graph/flowOrder'
import { getEdgeBaseStroke, getEdgeStrokeWidth } from '@/components/GraphCanvas/helpers'
import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import {
  type StoryboardWidgetQeTraceWindow,
  isStoryboardWidgetQeTraceEnabled,
  pushStoryboardWidgetQeTrace,
} from '@/lib/storyboardWidget/storyboardWidgetQeTrace'
import {
  getCachedStoryboardWidgetOverlayEdgeGraph,
  readCanonicalStoryboardWidgetOverlayIdentity,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import {
  buildStoryboardContainedProjectionEdgePath,
  buildStoryboardOverlayEdgePathD,
  readStoryboardContainedProjectionEdgeAnchors,
  readStoryboardOverlayFallbackRectAnchor,
  readStoryboardOutputCardLeftSideAnchors,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayEdgeAnchors'
import { isStoryboardCardMediaDropOverlayEdge } from '@/components/StoryboardWidgetCanvas/storyboardCardMediaDropGraph'
import { FRONTMATTER_COLLECTIVE_ROLE_INDEX_KEY, buildFrontmatterOverlayNodeLookup, resolveFrontmatterOverlayEdgeCrowdingLiftPx } from '@/lib/storyboardWidget/frontmatterCollectiveLayout'
import { resolveStoryboardWidgetFocusedEdgeIds } from '@/lib/storyboardWidget/storyboardWidgetPortRows'
import { FLOW_PORT_HANDLE_PREVIEW_EVENT, type FlowPortHandlePreviewDetail } from '@/components/StoryboardWidget/flowPortHandlePointerDrag'
import { resolveStoryboardWidgetOverlayEdgeGraphAuthority } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayEdgeGraphAuthority'
import { applyEdgeMarkerAttributes, ensureEdgeMarkerRegistry } from '@/lib/graph/edgeMarkers'
import { readWorkflowMaterializationProjectionSourceNodeId } from '@/lib/storyboardWidget/runMaterializationProjection'
import { normalizeStoryboardWidgetPendingSourceIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetMultiSourceEdgeSession'

function removeAllPaths(ref: React.MutableRefObject<Map<string, SVGPathElement>>) {
  for (const el of ref.current.values()) {
    try {
      el.remove()
    } catch {
      void 0
    }
  }
  ref.current.clear()
}

function collectRequestedOverlayIdentityIds(args: {
  overlayEditorNodeIds: ReadonlyArray<string> | null | undefined
  openWidgetNodeIds: ReadonlyArray<string> | null | undefined
  pendingOverlayNodeId: string | null | undefined
  pendingEdgeSourceId: string | null | undefined
  pendingEdgeSourceIds: ReadonlyArray<string> | null | undefined
  pendingPreviewSourceId: string | null | undefined
  domOverlayRootEntries: ReadonlyArray<{ id: string }> | null | undefined
}): string[] {
  const ids = new Set<string>()
  const pushId = (rawId: unknown) => {
    const id = readCanonicalStoryboardWidgetOverlayIdentity(rawId)
    if (id) ids.add(id)
  }
  for (let i = 0; i < (args.overlayEditorNodeIds || []).length; i += 1) pushId(args.overlayEditorNodeIds?.[i])
  for (let i = 0; i < (args.openWidgetNodeIds || []).length; i += 1) pushId(args.openWidgetNodeIds?.[i])
  for (let i = 0; i < (args.domOverlayRootEntries || []).length; i += 1) pushId(args.domOverlayRootEntries?.[i]?.id)
  pushId(args.pendingOverlayNodeId)
  pushId(args.pendingEdgeSourceId)
  for (let i = 0; i < (args.pendingEdgeSourceIds || []).length; i += 1) pushId(args.pendingEdgeSourceIds?.[i])
  pushId(args.pendingPreviewSourceId)
  return Array.from(ids).sort((a, b) => a.localeCompare(b))
}

function graphContainsRequestedOverlayIdentities(
  graph: GraphData | null | undefined,
  requestedIds: ReadonlyArray<string>,
): boolean {
  if (!graph || requestedIds.length === 0) return true
  const graphNodeIds = new Set<string>()
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  for (let i = 0; i < nodes.length; i += 1) {
    const id = readCanonicalStoryboardWidgetOverlayIdentity(nodes[i]?.id)
    if (id) graphNodeIds.add(id)
  }
  for (let i = 0; i < requestedIds.length; i += 1) {
    const id = readCanonicalStoryboardWidgetOverlayIdentity(requestedIds[i])
    if (id && !graphNodeIds.has(id)) return false
  }
  return true
}

type FrozenOverlayEdgePathSnapshot = {
  id: string
  attrs: Record<string, string>
  animation: string
}

type StableOverlayRectSnapshot = {
  rect: DOMRect
  ts: number
}

type PendingEdgeStartPointSnapshot = {
  sourceId: string
  x: number
  y: number
  ts: number
}

const frozenOverlayEdgePathsBySurfaceId = new Map<string, FrozenOverlayEdgePathSnapshot[]>()
const STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR = 'data-kg-overlay-edge-id'
const STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY = '0.82'
const STORYBOARD_WIDGET_OVERLAY_EDGE_DIMMED_OPACITY = '0.16'
const STORYBOARD_WIDGET_MEDIA_SCROLL_SURFACE_SELECTOR = '[data-kg-media-scroll-surface="1"]'
const STORYBOARD_WIDGET_RICH_MEDIA_RENDER_SURFACE_SELECTOR = '[data-kg-rich-media-render-surface="1"]'
const STORYBOARD_WIDGET_OVERLAY_FLOW_ORDER_EXTRA_KEYS = [FRONTMATTER_COLLECTIVE_ROLE_INDEX_KEY] as const

function roundOverlayEdgeGeometryValue(value: number): number {
  return Math.round(value * 100) / 100
}

function isFiniteRect(rect: DOMRect | null | undefined): rect is DOMRect {
  return !!rect
    && Number.isFinite(rect.left)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.bottom)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
}

function cloneDomRect(rect: DOMRect): DOMRect {
  if (typeof DOMRect === 'function') return new DOMRect(rect.x, rect.y, rect.width, rect.height)
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    toJSON: () => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    }),
  } as DOMRect
}

function readOverlayScrollSurfaceSignature(overlayEl: HTMLElement | null): string {
  if (!overlayEl) return ''
  const scrollSurfaces = Array.from(overlayEl.querySelectorAll<HTMLElement>(STORYBOARD_WIDGET_MEDIA_SCROLL_SURFACE_SELECTOR))
  if (scrollSurfaces.length === 0) return ''
  return scrollSurfaces
    .slice(0, 16)
    .map((surface, index) => {
      const rect = surface.getBoundingClientRect()
      return [
        index,
        roundOverlayEdgeGeometryValue(rect.left),
        roundOverlayEdgeGeometryValue(rect.top),
        roundOverlayEdgeGeometryValue(rect.width),
        roundOverlayEdgeGeometryValue(rect.height),
        roundOverlayEdgeGeometryValue(surface.scrollLeft),
        roundOverlayEdgeGeometryValue(surface.scrollTop),
        roundOverlayEdgeGeometryValue(surface.clientWidth),
        roundOverlayEdgeGeometryValue(surface.clientHeight),
        roundOverlayEdgeGeometryValue(surface.scrollWidth),
        roundOverlayEdgeGeometryValue(surface.scrollHeight),
      ].join(':')
    })
    .join(';')
}

function readPortHandleVisibleBoundaryRect(overlayEl: HTMLElement, button: HTMLElement): DOMRect {
  const scrollSurface = button.closest<HTMLElement>(STORYBOARD_WIDGET_MEDIA_SCROLL_SURFACE_SELECTOR)
  if (scrollSurface && overlayEl.contains(scrollSurface)) return scrollSurface.getBoundingClientRect()
  const richMediaSurface = button.closest<HTMLElement>(STORYBOARD_WIDGET_RICH_MEDIA_RENDER_SURFACE_SELECTOR)
  if (richMediaSurface && overlayEl.contains(richMediaSurface)) return richMediaSurface.getBoundingClientRect()
  return overlayEl.getBoundingClientRect()
}

function isUsablePortHandleForOverlay(overlayEl: HTMLElement, button: HTMLElement): boolean {
  if (!overlayEl.contains(button)) return false
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(button)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false
  }
  const overlayRect = overlayEl.getBoundingClientRect()
  const buttonRect = button.getBoundingClientRect()
  if (!isFiniteRect(overlayRect) || !isFiniteRect(buttonRect)) return false
  const tolerancePx = 2
  return buttonRect.right >= overlayRect.left - tolerancePx
    && buttonRect.left <= overlayRect.right + tolerancePx
    && buttonRect.bottom >= overlayRect.top - tolerancePx
    && buttonRect.top <= overlayRect.bottom + tolerancePx
}

function isAnchorVisibleInBoundary(anchor: { x: number; y: number } | null, boundaryRect: DOMRect | null | undefined): boolean {
  if (!anchor || !isFiniteRect(boundaryRect)) return false
  const tolerancePx = 2
  return anchor.y >= boundaryRect.top - tolerancePx
    && anchor.y <= boundaryRect.bottom + tolerancePx
    && anchor.x >= boundaryRect.left - tolerancePx
    && anchor.x <= boundaryRect.right + tolerancePx
}

function isCachedAnchorAlignedWithFallbackRect(anchor: { x: number; y: number } | null, fallbackRect: DOMRect): boolean {
  if (!anchor || !isFiniteRect(fallbackRect)) return false
  const tolerancePx = 2
  return Number.isFinite(anchor.x)
    && Number.isFinite(anchor.y)
    && anchor.y >= fallbackRect.top - tolerancePx
    && anchor.y <= fallbackRect.bottom + tolerancePx
}

function clampAnchorYToVisibleBounds(value: number, fallbackRect: DOMRect, boundaryRect: DOMRect | null | undefined): number {
  if (!Number.isFinite(value)) return value
  const fallbackTop = Number.isFinite(fallbackRect.top) ? fallbackRect.top : null
  const fallbackBottom = Number.isFinite(fallbackRect.top) && Number.isFinite(fallbackRect.height) && fallbackRect.height > 0
    ? fallbackRect.top + fallbackRect.height
    : null
  const boundaryTop = isFiniteRect(boundaryRect) ? boundaryRect.top : null
  const boundaryBottom = isFiniteRect(boundaryRect) ? boundaryRect.bottom : null
  const minY = Math.max(
    fallbackTop == null ? Number.NEGATIVE_INFINITY : fallbackTop,
    boundaryTop == null ? Number.NEGATIVE_INFINITY : boundaryTop,
  )
  const maxY = Math.min(
    fallbackBottom == null ? Number.POSITIVE_INFINITY : fallbackBottom,
    boundaryBottom == null ? Number.POSITIVE_INFINITY : boundaryBottom,
  )
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY > maxY) {
    if (fallbackTop != null && fallbackBottom != null) return Math.max(fallbackTop, Math.min(fallbackBottom, value))
    return value
  }
  return Math.max(minY, Math.min(maxY, value))
}

export function useStoryboardWidgetOverlayEdges(args: {
  active: boolean
  overlayOnlyModeEnabled: boolean
  resolvedThemeMode: 'light' | 'dark'
  overlayEdgesEnabledRef: React.MutableRefObject<boolean>
  storyboardWidgetSurfaceId: string
  rootRef: React.RefObject<HTMLElement | null>
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  renderGraphDataOverride: GraphData | null
  fixedCardsOwnGraphAuthority: boolean
  overlayEditorNodeIdsRef: React.MutableRefObject<string[]>
  openWidgetNodeIdsRef: React.MutableRefObject<string[]>
  pendingOverlayNodeIdRef: React.MutableRefObject<string | null>
  widgetRegistryRef: React.MutableRefObject<ReadonlyArray<WidgetRegistryEntry>>
  schema: unknown
  toolMode: ToolMode
  pendingEdgeSourceId: string | null
  pendingEdgeSourceIds: ReadonlyArray<string>
  pendingEdgeSourcePortKey: string | null
  frontmatterFlowRenderSettings: { rankdir?: string } | null
}) {
  const schema = args.schema as GraphSchema
  const rankdir: 'LR' | 'TB' = args.frontmatterFlowRenderSettings?.rankdir === 'TB' ? 'TB' : 'LR'
  const storyboardWidgetSelectedPortRowKey = useGraphStore(s => s.storyboardWidgetSelectedPortRowKey || '')
  const overlayEdgesSvgRef = React.useRef<SVGSVGElement | null>(null)
  const overlayEdgePathByIdRef = React.useRef<Map<string, SVGPathElement>>(new Map())
  const overlayPendingEdgePathBySourceIdRef = React.useRef<Map<string, SVGPathElement>>(new Map())
  const overlayEdgeRafRef = React.useRef<number | null>(null)
  const overlayElByNodeIdRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const lastStableOverlayRectByNodeIdRef = React.useRef<Map<string, StableOverlayRectSnapshot>>(new Map())
  const overlayEdgeSocketTypesRef = React.useRef<unknown>(null)
  const overlayEdgeSocketStyleByTypeRef = React.useRef<Map<string, { color: string; edgeWidthPx: number | null }>>(new Map())
  const overlayEdgeLayoutSigRef = React.useRef<string>('')
  const overlayEdgeAnchorCacheRef = React.useRef<Map<string, { x: number; y: number }>>(new Map())
  const overlayEdgeTransientRetryRef = React.useRef<{ key: string; count: number } | null>(null)
  const overlayEdgePartialNodeSetRetryRef = React.useRef<{ key: string; count: number } | null>(null)
  const overlayEdgeReadinessRetryRef = React.useRef<{ key: string; count: number } | null>(null)
  const lastStableOverlayEdgeNodeIdsRef = React.useRef<string[]>([])
  const lastStableOverlayEdgeGraphRef = React.useRef<GraphData | null>(null)
  const overlayEdgeWorkspaceCloseRecoveryUntilRef = React.useRef(0)
  const workspaceOverlayOpenRef = React.useRef(false)
  const scheduleOverlayEdgeUpdateRef = React.useRef<() => void>(() => void 0)
  const overlayEdgeTopPctCacheRef = React.useRef<{
    key: string
    map: Map<string, Map<string, number>>
  } | null>(null)
  const overlayEdgeTraceStateRef = React.useRef<{ key: string; ts: number } | null>(null)
  const pendingEdgePreviewRef = React.useRef<{
    toolMode: ToolMode
    sourceId: string | null
    sourceIds: string[]
    sourcePortKey: string | null
  }>({
    toolMode: 'select',
    sourceId: null,
    sourceIds: [],
    sourcePortKey: null,
  })
  const pendingEdgeCursorRef = React.useRef<null | { x: number; y: number; ts: number }>(null)
  const pendingEdgeStartPointRef = React.useRef<PendingEdgeStartPointSnapshot | null>(null)

  const cancelOverlayEdgeUpdate = React.useCallback(() => {
    if (overlayEdgeRafRef.current != null) {
      try {
        cancelAnimationFrame(overlayEdgeRafRef.current)
      } catch {
        void 0
      }
      overlayEdgeRafRef.current = null
    }
    overlayEdgeLayoutSigRef.current = ''
    overlayEdgeAnchorCacheRef.current.clear()
    overlayEdgeTransientRetryRef.current = null
    overlayEdgePartialNodeSetRetryRef.current = null
    overlayEdgeReadinessRetryRef.current = null
    lastStableOverlayRectByNodeIdRef.current.clear()
    pendingEdgeStartPointRef.current = null
  }, [])

  const cacheFrozenOverlayEdgePaths = React.useCallback(() => {
    const surfaceId = String(args.storyboardWidgetSurfaceId || '').trim()
    if (!surfaceId) return
    const snapshots: FrozenOverlayEdgePathSnapshot[] = []
    for (const [id, pathEl] of overlayEdgePathByIdRef.current.entries()) {
      if (!pathEl) continue
      const attrs = {
        d: pathEl.getAttribute('d') || '',
        [STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR]: pathEl.getAttribute(STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR) || id,
        fill: pathEl.getAttribute('fill') || 'none',
        stroke: pathEl.getAttribute('stroke') || '',
        'stroke-width': pathEl.getAttribute('stroke-width') || '',
        'stroke-linejoin': pathEl.getAttribute('stroke-linejoin') || '',
        'stroke-linecap': pathEl.getAttribute('stroke-linecap') || '',
        'stroke-dasharray': pathEl.getAttribute('stroke-dasharray') || '',
        'marker-start': pathEl.getAttribute('marker-start') || '', 'marker-end': pathEl.getAttribute('marker-end') || '',
        opacity: pathEl.getAttribute('opacity') || '',
        'pointer-events': pathEl.getAttribute('pointer-events') || '',
      }
      snapshots.push({ id, attrs, animation: pathEl.style.animation || '' })
    }
    if (snapshots.length > 0) frozenOverlayEdgePathsBySurfaceId.set(surfaceId, snapshots)
  }, [args.storyboardWidgetSurfaceId])

  const restoreFrozenOverlayEdgePaths = React.useCallback((svg: SVGSVGElement | null): number => {
    if (!svg) return 0
    let restored = 0
    const existingDomPaths = Array.from(svg.querySelectorAll(`path[${STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR}]`))
    if (existingDomPaths.length > 0) {
      overlayEdgePathByIdRef.current.clear()
      for (let i = 0; i < existingDomPaths.length; i += 1) {
        const pathEl = existingDomPaths[i] as SVGPathElement
        const edgeId = String(pathEl.getAttribute(STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR) || '').trim()
        if (!edgeId) continue
        overlayEdgePathByIdRef.current.set(edgeId, pathEl)
      }
      return 0
    }
    for (const pathEl of overlayEdgePathByIdRef.current.values()) {
      if (!pathEl) continue
      if (pathEl.parentNode !== svg) {
        try {
          svg.appendChild(pathEl)
          restored += 1
        } catch {
          void 0
        }
      }
    }
    if (restored === 0) {
      const surfaceId = String(args.storyboardWidgetSurfaceId || '').trim()
      const snapshots = surfaceId ? frozenOverlayEdgePathsBySurfaceId.get(surfaceId) || [] : []
      for (let i = 0; i < snapshots.length; i += 1) {
        const snapshot = snapshots[i]
        if (!snapshot?.id) continue
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        const attrs = snapshot.attrs || {}
        for (const [name, value] of Object.entries(attrs)) {
          if (value) pathEl.setAttribute(name, value)
        }
        if (snapshot.animation) pathEl.style.animation = snapshot.animation
        try {
          svg.appendChild(pathEl)
          overlayEdgePathByIdRef.current.set(snapshot.id, pathEl)
          restored += 1
        } catch {
          void 0
        }
      }
    }
    for (const pendingPathEl of overlayPendingEdgePathBySourceIdRef.current.values()) {
      if (pendingPathEl.parentNode !== svg) {
        try {
          svg.appendChild(pendingPathEl)
          restored += 1
        } catch {
          void 0
        }
      }
    }
    return restored
  }, [args.storyboardWidgetSurfaceId])

  const pushOverlayEdgeTrace = React.useCallback((phase: string, details?: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    const win = window as StoryboardWidgetQeTraceWindow
    if (!isStoryboardWidgetQeTraceEnabled(win)) return
    const safeDetails = details || {}
    const traceKey = `${String(phase || '').trim()}:${hashRecordSignature32(safeDetails, { maxEntries: 40, maxDepth: 3 })}`
    const now = Date.now()
    const prev = overlayEdgeTraceStateRef.current
    if (prev && prev.key === traceKey && now - prev.ts < 250) return
    overlayEdgeTraceStateRef.current = { key: traceKey, ts: now }
    pushStoryboardWidgetQeTrace(win, {
      kind: 'overlay-edge',
      phase,
      surfaceId: args.storyboardWidgetSurfaceId,
      ...safeDetails,
      ts: now,
    })
  }, [args.storyboardWidgetSurfaceId])

  const readOverlayEdgeHarnessSnapshot = React.useCallback((label?: string, extras?: Record<string, unknown>) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    const win = window as StoryboardWidgetQeTraceWindow
    if (!isStoryboardWidgetQeTraceEnabled(win)) return null
    const root = args.rootRef.current
    const svg = overlayEdgesSvgRef.current
    const surfaceId = String(args.storyboardWidgetSurfaceId || '').trim()
    const escapeForAttr = (value: string): string => {
      const cssApi = (globalThis as unknown as { CSS?: { escape?: (input: string) => string } }).CSS
      if (cssApi?.escape) return cssApi.escape(value)
      return value.replace(/[^a-zA-Z0-9_\-]/g, ch => `\\${ch}`)
    }
    const surfaceRoot = surfaceId
      ? document.querySelector<HTMLElement>(`[${STORYBOARD_WIDGET_OVERLAY_SURFACE_ROOT_ATTR}="${escapeForAttr(surfaceId)}"]`)
      : null
    // Overlay widgets are portal-mounted, so scope by surface id instead of DOM ancestry.
    const overlayRoots = !surfaceId
      ? []
      : Array.from(document.querySelectorAll<HTMLElement>(CANVAS_OVERLAY_PROXY_ROOT_SELECTOR))
        .filter(el => readStoryboardWidgetOverlaySurfaceId(el) === surfaceId)
    const rootRect = root ? root.getBoundingClientRect() : null
    const svgRect = svg ? svg.getBoundingClientRect() : null
    const samplePaths = svg
      ? Array.from(svg.querySelectorAll<SVGPathElement>('path[data-kg-overlay-edge-id], path[data-kg-overlay-pending-edge]')).slice(0, 3).map((path, index) => {
          const computed = getComputedStyle(path)
          let bbox: { x: number; y: number; width: number; height: number } | null = null
          try {
            const next = path.getBBox()
            bbox = { x: next.x, y: next.y, width: next.width, height: next.height }
          } catch {
            bbox = null
          }
          return {
            index,
            stroke: computed.stroke,
            strokeWidth: computed.strokeWidth,
            opacity: computed.opacity,
            bbox,
          }
        })
      : []
    const svgStyle = svg ? getComputedStyle(svg) : null
    const snapshot: Record<string, unknown> = {
      label: String(label || '').trim() || 'snapshot',
      active: args.active ? 1 : 0,
      overlayOnlyModeEnabled: args.overlayOnlyModeEnabled ? 1 : 0,
      overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
      workspaceOverlayOpen: workspaceOverlayOpenRef.current ? 1 : 0,
      rootPresent: root ? 1 : 0,
      svgPresent: svg ? 1 : 0,
      rootWidth: rootRect ? Math.round(rootRect.width) : 0,
      rootHeight: rootRect ? Math.round(rootRect.height) : 0,
      svgWidthAttr: svg?.getAttribute('width') || '',
      svgHeightAttr: svg?.getAttribute('height') || '',
      svgViewBox: svg?.getAttribute('viewBox') || '',
      svgClientWidth: svgRect ? Math.round(svgRect.width) : 0,
      svgClientHeight: svgRect ? Math.round(svgRect.height) : 0,
      svgPathCount: svg ? svg.querySelectorAll('path[data-kg-overlay-edge-id], path[data-kg-overlay-pending-edge]').length : 0,
      svgZIndex: svgStyle?.zIndex || '',
      svgVisibility: svgStyle?.visibility || '',
      svgOpacity: svgStyle?.opacity || '',
      overlayRootCount: overlayRoots.length,
      overlayIdsHead: overlayRoots.slice(0, 8).map(readCanvasOverlayNodeId).filter(Boolean).join(','),
      pathSamples: JSON.stringify(samplePaths),
      ...extras,
    }
    pushOverlayEdgeTrace(`harness:${snapshot.label}`, snapshot)
    return snapshot
  }, [args.active, args.storyboardWidgetSurfaceId, args.overlayEdgesEnabledRef, args.overlayOnlyModeEnabled, args.rootRef, pushOverlayEdgeTrace])

  React.useEffect(() => {
    const sourceId = args.pendingEdgeSourceId ? String(args.pendingEdgeSourceId || '').trim() : null
    const nextPendingEdgePreview = {
      toolMode: args.toolMode,
      sourceId,
      sourceIds: normalizeStoryboardWidgetPendingSourceIds(args.pendingEdgeSourceIds, sourceId),
      sourcePortKey: args.pendingEdgeSourcePortKey ? String(args.pendingEdgeSourcePortKey || '').trim() : null,
    }
    pendingEdgePreviewRef.current = nextPendingEdgePreview
    overlayEdgeLayoutSigRef.current = ''
    if (!args.active) return
    if (nextPendingEdgePreview.toolMode !== 'addEdge' || !nextPendingEdgePreview.sourceId) {
      pendingEdgeStartPointRef.current = null
      removeAllPaths(overlayPendingEdgePathBySourceIdRef)
    }
    scheduleOverlayEdgeUpdateRef.current()
  }, [args.active, args.pendingEdgeSourceId, args.pendingEdgeSourceIds, args.pendingEdgeSourcePortKey, args.toolMode])

  const scheduleTransientOverlayEdgeRetry = React.useCallback((parts: string[]): boolean => {
    const retryKey = hashSignatureParts(['transient-overlay-edges', ...parts.map(part => String(part || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))])
    const prevRetry = overlayEdgeTransientRetryRef.current
    const nextCount = prevRetry && prevRetry.key === retryKey ? prevRetry.count + 1 : 1
    overlayEdgeTransientRetryRef.current = { key: retryKey, count: nextCount }
    if (nextCount > 12) return false
    if (overlayEdgeRafRef.current == null) {
      overlayEdgeRafRef.current = requestAnimationFrame(() => {
        overlayEdgeRafRef.current = null
        overlayEdgeLayoutSigRef.current = ''
        scheduleOverlayEdgeUpdateRef.current()
      })
    }
    return true
  }, [])

  const scheduleOverlayEdgeReadinessRetry = React.useCallback((reason: string): boolean => {
    const retryKey = hashSignatureParts(['overlay-edge-readiness', reason])
    const prevRetry = overlayEdgeReadinessRetryRef.current
    const nextCount = prevRetry && prevRetry.key === retryKey ? prevRetry.count + 1 : 1
    overlayEdgeReadinessRetryRef.current = { key: retryKey, count: nextCount }
    if (nextCount > 12) return false
    if (overlayEdgeRafRef.current == null) {
      overlayEdgeRafRef.current = requestAnimationFrame(() => {
        overlayEdgeRafRef.current = null
        scheduleOverlayEdgeUpdateRef.current()
      })
    }
    return true
  }, [])

  const setOverlayEdgesSvgRef = React.useCallback((node: SVGSVGElement | null) => {
    overlayEdgesSvgRef.current = node
    if (!node) {
      cacheFrozenOverlayEdgePaths()
      args.overlayEdgesEnabledRef.current = false
      pushOverlayEdgeTrace('svg-detached', {
        overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
      })
      return
    }
    args.overlayEdgesEnabledRef.current = true
    ensureEdgeMarkerRegistry(node)
    overlayEdgeReadinessRetryRef.current = null
    overlayEdgeLayoutSigRef.current = ''
    // Contract marker: const restoredFrozenPathCount = restoreFrozenOverlayEdgePaths(node)
    const restoredFrozenPathCount = workspaceOverlayOpenRef.current ? (removeAllPaths(overlayEdgePathByIdRef), 0) : restoreFrozenOverlayEdgePaths(node)
    pushOverlayEdgeTrace('svg-attached', {
      overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
      svgWidthAttr: node.getAttribute('width') || '',
      svgHeightAttr: node.getAttribute('height') || '',
      svgViewBox: node.getAttribute('viewBox') || '',
      restoredFrozenPathCount,
    })
    scheduleOverlayEdgeUpdateRef.current()
  }, [args.overlayEdgesEnabledRef, cacheFrozenOverlayEdgePaths, pushOverlayEdgeTrace, restoreFrozenOverlayEdgePaths])

  const scheduleOverlayEdgeUpdate = React.useCallback((immediate = false) => {
    if (!args.active) {
      pushOverlayEdgeTrace('schedule-skip-inactive', {
        overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
      })
      return
    }
    if (!args.overlayEdgesEnabledRef.current) {
      pushOverlayEdgeTrace('schedule-skip-disabled', {
        workspaceOverlayOpen: workspaceOverlayOpenRef.current ? 1 : 0,
      })
      return
    }
    if (overlayEdgeRafRef.current != null) {
      if (!immediate) return
      cancelAnimationFrame(overlayEdgeRafRef.current)
      overlayEdgeRafRef.current = null
    }
    const updateOverlayEdges = () => {
      overlayEdgeRafRef.current = null
      const graphMutationBlocked = isWorkspaceGraphMutationBlocked(useGraphStore.getState())
      const workspaceOverlayOpen = workspaceOverlayOpenRef.current
      const root = args.rootRef.current
      if (!root) {
        pushOverlayEdgeTrace('missing-root', {
          overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
        })
        scheduleOverlayEdgeReadinessRetry('missing-root')
        return
      }
      const svg = overlayEdgesSvgRef.current
      if (!svg) {
        pushOverlayEdgeTrace('missing-svg', {
          rootWidth: Math.round(root.getBoundingClientRect().width),
          rootHeight: Math.round(root.getBoundingClientRect().height),
        })
        scheduleOverlayEdgeReadinessRetry('missing-svg')
        return
      }
      overlayEdgeReadinessRetryRef.current = null
      const domOverlayRootEntries = (() => {
        if (typeof document === 'undefined') return [] as Array<{ id: string; el: HTMLElement }>
        const entries: Array<{ id: string; el: HTMLElement }> = []
        const surfaceId = String(args.storyboardWidgetSurfaceId || '').trim()
        if (!surfaceId) return entries
        const root = args.rootRef.current
        if (typeof document === 'undefined' && !root) return entries
        const queryRoot: ParentNode = typeof document !== 'undefined' ? document : root
        // Overlay widgets are portal-mounted, so scope by surface id instead of DOM ancestry.
        const els = Array.from(queryRoot.querySelectorAll<HTMLElement>(CANVAS_OVERLAY_PROXY_ROOT_SELECTOR))
        for (let i = 0; i < els.length; i += 1) {
          const el = els[i]
          if (readStoryboardWidgetOverlaySurfaceId(el) !== surfaceId) continue
          const id = readCanonicalStoryboardWidgetOverlayIdentity(readCanvasOverlayNodeId(el))
          if (!id) continue
          entries.push({ id, el })
        }
        return entries
      })()
      const domStoryboardFixedCardEntries = (() => {
        const entries: Array<{ id: string; el: HTMLElement }> = []
        const root = args.rootRef.current
        const queryRoot: ParentNode | null = root || (typeof document !== 'undefined' ? document : null)
        if (!queryRoot) return entries
        const els = Array.from(queryRoot.querySelectorAll<HTMLElement>('[data-kg-storyboard-fixed-card-id]'))
        for (let i = 0; i < els.length; i += 1) {
          const el = els[i]
          const id = readCanonicalStoryboardWidgetOverlayIdentity(el.dataset.kgStoryboardFixedCardId)
          if (!id) continue
          entries.push({ id, el })
        }
        return entries
      })()
      const liveGraph = resolveStoryboardWidgetOverlayEdgeGraphAuthority({
        draftGraphData: args.draftGraphDataRef.current,
        renderedGraphData: args.renderGraphDataOverride,
        fixedCardsOwnGraphAuthority: args.fixedCardsOwnGraphAuthority,
      })
      const now = Date.now()
      const liveGraphNodeCount = Array.isArray(liveGraph?.nodes) ? liveGraph.nodes.length : 0
      const liveGraphEdgeCount = Array.isArray(liveGraph?.edges) ? liveGraph.edges.length : 0
      const liveGraphMetaKind = String(((liveGraph?.metadata || {}) as Record<string, unknown>).kind || '').trim()
      const liveGraphRevision = readGraphDataRevision(liveGraph)
      const stableGraph = lastStableOverlayEdgeGraphRef.current
      const stableGraphNodeCount = Array.isArray(stableGraph?.nodes) ? stableGraph.nodes.length : 0
      const stableGraphEdgeCount = Array.isArray(stableGraph?.edges) ? stableGraph.edges.length : 0
      const stableGraphRevision = readGraphDataRevision(stableGraph)
      const requestedOverlayIdentityIdsBase = collectRequestedOverlayIdentityIds({
        overlayEditorNodeIds: args.overlayEditorNodeIdsRef.current,
        openWidgetNodeIds: args.openWidgetNodeIdsRef.current,
        pendingOverlayNodeId: args.pendingOverlayNodeIdRef.current,
        pendingEdgeSourceId: args.pendingEdgeSourceId,
        pendingEdgeSourceIds: args.pendingEdgeSourceIds,
        pendingPreviewSourceId: pendingEdgePreviewRef.current.sourceId,
        domOverlayRootEntries,
      })
      const requestedOverlayIdentityIds = Array.from(new Set([
        ...requestedOverlayIdentityIdsBase,
        ...domStoryboardFixedCardEntries.map(entry => entry.id),
      ])).sort((a, b) => a.localeCompare(b))
      const stableGraphContainsRequestedOverlayIdentities = graphContainsRequestedOverlayIdentities(stableGraph, requestedOverlayIdentityIds)
      const withinWorkspaceCloseRecoveryWindow = now <= overlayEdgeWorkspaceCloseRecoveryUntilRef.current
      const canReuseMetadataLessStableGraph =
        !!liveGraph
        && liveGraphNodeCount > 0
        && liveGraphEdgeCount > 0
        && !liveGraphMetaKind
        && lastStableOverlayEdgeNodeIdsRef.current.length > 0
        && (
          (
            liveGraphRevision > 0
            && stableGraphRevision > 0
            && liveGraphRevision === stableGraphRevision
          )
          || (
            liveGraphRevision === 0
            && stableGraphRevision === 0
            && liveGraphNodeCount === stableGraphNodeCount
            && liveGraphEdgeCount === stableGraphEdgeCount
          )
        )
      const shouldReuseStableGraph =
        !!stableGraph
        && stableGraphNodeCount > 0
        && stableGraphEdgeCount > 0
        && stableGraphContainsRequestedOverlayIdentities
        && (
          graphMutationBlocked
          || stableGraphRevision > liveGraphRevision
          || workspaceOverlayOpen
          || withinWorkspaceCloseRecoveryWindow
          || (
            canReuseMetadataLessStableGraph
          )
        )
        && (
          graphMutationBlocked
          || workspaceOverlayOpen
          || !liveGraph
          || liveGraph === stableGraph
          || liveGraphNodeCount === 0
          || liveGraphEdgeCount === 0
          || !liveGraphMetaKind
        )
      const graph = shouldReuseStableGraph ? stableGraph : liveGraph
      if (stableGraphRevision > liveGraphRevision && shouldReuseStableGraph) {
        pushOverlayEdgeTrace('schedule-newer-stable-revision', { liveGraphRevision, stableGraphRevision })
      } else if (graphMutationBlocked && shouldReuseStableGraph) {
        pushOverlayEdgeTrace('schedule-graph-mutation-lock-stable-geometry', {
          existingPathCount: overlayEdgePathByIdRef.current.size,
          stableGraphNodeCount,
          stableGraphEdgeCount,
        })
      } else if (workspaceOverlayOpen && shouldReuseStableGraph) {
        pushOverlayEdgeTrace('schedule-workspace-open-live-geometry', {
          overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
          stableGraphNodeCount,
          stableGraphEdgeCount,
          liveGraphNodeCount,
          liveGraphEdgeCount,
        })
      } else if (workspaceOverlayOpen) {
        const hasLiveGraphGeometry = !!liveGraph && liveGraphNodeCount > 0 && liveGraphEdgeCount > 0
        if (hasLiveGraphGeometry) {
          pushOverlayEdgeTrace('schedule-workspace-open-live-graph-bootstrap', {
            overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
            stableGraphNodeCount,
            stableGraphEdgeCount,
            liveGraphNodeCount,
            liveGraphEdgeCount,
          })
        } else {
          removeAllPaths(overlayEdgePathByIdRef)
          overlayEdgeLayoutSigRef.current = ''
          overlayEdgeAnchorCacheRef.current.clear()
          pushOverlayEdgeTrace('schedule-skip-workspace-open', {
            overlayEdgesEnabled: args.overlayEdgesEnabledRef.current ? 1 : 0,
            restoredFrozenPathCount: 0,
          })
          return
        }
      }
      if (!graph) {
        pushOverlayEdgeTrace('missing-graph-data', {
          withinWorkspaceCloseRecoveryWindow: withinWorkspaceCloseRecoveryWindow ? 1 : 0,
          lastStableNodeCount: lastStableOverlayEdgeNodeIdsRef.current.length,
          existingPathCount: overlayEdgePathByIdRef.current.size,
        })
        if (
          (overlayEdgePathByIdRef.current.size > 0 || lastStableOverlayEdgeNodeIdsRef.current.length > 0)
          && scheduleTransientOverlayEdgeRetry(['missing-graph-data', String(lastStableOverlayEdgeNodeIdsRef.current.length), String(overlayEdgePathByIdRef.current.size)])
        ) return
        removeAllPaths(overlayEdgePathByIdRef)
        overlayEdgeLayoutSigRef.current = ''
        overlayEdgeAnchorCacheRef.current.clear()
        removeAllPaths(overlayPendingEdgePathBySourceIdRef)
        return
      }

      const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as Array<{ id?: unknown; type?: unknown; properties?: unknown }>) : []
      const rawEdges = Array.isArray(graph.edges)
        ? (graph.edges as Array<{ id?: unknown; source?: unknown; target?: unknown; type?: unknown; properties?: unknown }>)
        : []

      const socketStyleByType = (() => {
        const meta = (graph.metadata || {}) as Record<string, unknown>
        const st = meta.socketTypes
        if (st === overlayEdgeSocketTypesRef.current) return overlayEdgeSocketStyleByTypeRef.current
        overlayEdgeSocketTypesRef.current = st
        const next = new Map<string, { color: string; edgeWidthPx: number | null }>()
        if (!isRecord(st)) {
          overlayEdgeSocketStyleByTypeRef.current = next
          return next
        }
        for (const k of Object.keys(st)) {
          const spec = st[k]
          if (!isRecord(spec)) continue
          const color = pickString(spec.color)
          if (!color) continue
          const edgeWidthPx = typeof spec.edgeWidthPx === 'number' && Number.isFinite(spec.edgeWidthPx) ? spec.edgeWidthPx : null
          next.set(String(k || ''), { color, edgeWidthPx })
        }
        overlayEdgeSocketStyleByTypeRef.current = next
        return next
      })()

      const overlayIdSet = (() => {
        const liveIds = Array.isArray(args.overlayEditorNodeIdsRef.current) && args.overlayEditorNodeIdsRef.current.length > 0
          ? args.overlayEditorNodeIdsRef.current
          : (Array.isArray(args.openWidgetNodeIdsRef.current) ? args.openWidgetNodeIdsRef.current : [])
        const sel = String(args.pendingOverlayNodeIdRef.current || '').trim()
        const set = new Set<string>()
        for (let i = 0; i < liveIds.length; i += 1) {
          const id = readCanonicalStoryboardWidgetOverlayIdentity(liveIds[i])
          if (id) set.add(id)
        }
        for (let i = 0; i < domOverlayRootEntries.length; i += 1) {
          const id = readCanonicalStoryboardWidgetOverlayIdentity(domOverlayRootEntries[i]?.id)
          if (id) set.add(id)
        }
        for (let i = 0; i < domStoryboardFixedCardEntries.length; i += 1) {
          const id = readCanonicalStoryboardWidgetOverlayIdentity(domStoryboardFixedCardEntries[i]?.id)
          if (id) set.add(id)
        }
        if (sel) set.add(readCanonicalStoryboardWidgetOverlayIdentity(sel))
        const liveSetSize = set.size
        const stableIds = lastStableOverlayEdgeNodeIdsRef.current
          .map(id => readCanonicalStoryboardWidgetOverlayIdentity(id))
          .filter(Boolean)
        const stableSetSize = stableIds.length
        if (
          liveSetSize > 0
          && stableSetSize > liveSetSize
          && overlayEdgePathByIdRef.current.size > 0
        ) {
          const retryKey = hashSignatureParts([
            'partial-overlay-node-set',
            `live:${Array.from(set).sort((a, b) => a.localeCompare(b)).join(',')}`,
            `stable:${stableIds.join(',')}`,
          ])
          const prevRetry = overlayEdgePartialNodeSetRetryRef.current
          const nextCount = prevRetry && prevRetry.key === retryKey ? prevRetry.count + 1 : 1
          overlayEdgePartialNodeSetRetryRef.current = { key: retryKey, count: nextCount }
          if (workspaceOverlayOpen) {
            removeAllPaths(overlayEdgePathByIdRef)
            overlayEdgeLayoutSigRef.current = ''
            overlayEdgeAnchorCacheRef.current.clear()
            if (overlayEdgeRafRef.current == null) {
              overlayEdgeRafRef.current = requestAnimationFrame(() => {
                overlayEdgeRafRef.current = null
                scheduleOverlayEdgeUpdateRef.current()
              })
            }
          } else if (nextCount <= 12) {
            for (let i = 0; i < stableIds.length; i += 1) {
              const id = stableIds[i]
              if (id) set.add(id)
            }
            if (overlayEdgeRafRef.current == null) {
              overlayEdgeRafRef.current = requestAnimationFrame(() => {
                overlayEdgeRafRef.current = null
                overlayEdgeLayoutSigRef.current = ''
                scheduleOverlayEdgeUpdateRef.current()
              })
            }
          }
        } else {
          overlayEdgePartialNodeSetRetryRef.current = null
        }
        if (set.size > 0) {
          lastStableOverlayEdgeNodeIdsRef.current = Array.from(set)
          return set
        }
        if (workspaceOverlayOpen) return set
        for (let i = 0; i < lastStableOverlayEdgeNodeIdsRef.current.length; i += 1) {
          const id = String(lastStableOverlayEdgeNodeIdsRef.current[i] || '').trim()
          if (id) set.add(id)
        }
        return set
      })()
      if (overlayIdSet.size === 0) {
        pushOverlayEdgeTrace('empty-overlay-node-set', {
          domOverlayRootCount: domOverlayRootEntries.length,
          lastStableNodeCount: lastStableOverlayEdgeNodeIdsRef.current.length,
          existingPathCount: overlayEdgePathByIdRef.current.size,
        })
        if (
          (overlayEdgePathByIdRef.current.size > 0 || lastStableOverlayEdgeNodeIdsRef.current.length > 0)
          && scheduleTransientOverlayEdgeRetry(['empty-overlay-node-set', String(lastStableOverlayEdgeNodeIdsRef.current.length), String(overlayEdgePathByIdRef.current.size)])
        ) return
        removeAllPaths(overlayEdgePathByIdRef)
        overlayEdgeLayoutSigRef.current = ''
        overlayEdgeAnchorCacheRef.current.clear()
        return
      }

      const overlayNodeIdsForLookup = Array.from(overlayIdSet).sort((a, b) => a.localeCompare(b))
      const graphLookup = getCachedStoryboardWidgetOverlayEdgeGraph({
        graphData: graph,
        graphRevision: readGraphDataRevision(graph),
        overlayNodeIds: overlayNodeIdsForLookup,
        preferCurrentGraphDataRefs: true,
      })
      const graphSemanticKey = graphLookup?.graphSemanticKey || ''
      const graphMetaKind = graphLookup?.graphMetaKind || null
      const nodeIds = graphLookup?.nodeIds || new Set<string>()
      const nodes = graphLookup?.nodes || []
      const focusedEdges = resolveStoryboardWidgetFocusedEdgeIds(graph, storyboardWidgetSelectedPortRowKey)
      const focusedEdgeIds = new Set(focusedEdges.edgeIds)
      const defaultPortKeyByNodeId = graphLookup?.defaultPortKeyByNodeId || new Map<string, { in: string; out: string }>()
      const edgeCurveById = graphLookup?.edgeCurveById || new Map<string, { bend: number; orbitShift: number; orbital: boolean; phase: -1 | 1 } | null>()
      const edges = (graphLookup?.edges || []).map(edge => {
        const style = edge.edgeType ? socketStyleByType.get(edge.edgeType) || null : null
        const rawEdge = graphLookup?.rawEdgeById.get(edge.id)
        const stroke = style?.color || getEdgeBaseStroke(rawEdge as GraphEdge, schema)
        const strokeWidth = style?.edgeWidthPx != null ? String(style.edgeWidthPx) : String(getEdgeStrokeWidth(rawEdge as GraphEdge, schema))
        return { ...edge, stroke, strokeWidth }
      })
      const overlayNodeById = buildFrontmatterOverlayNodeLookup(nodes)
      const overlayFlowOrderByNodeId = buildGraphFlowOrderIndexByNodeId(nodes, { rankdir, extraOrderKeys: STORYBOARD_WIDGET_OVERLAY_FLOW_ORDER_EXTRA_KEYS })

      if (nodeIds.size === 0) {
        pushOverlayEdgeTrace('empty-filtered-edge-set', {
          reusedStableGraph: shouldReuseStableGraph ? 1 : 0,
          withinWorkspaceCloseRecoveryWindow: withinWorkspaceCloseRecoveryWindow ? 1 : 0,
          overlayIdCount: overlayIdSet.size,
          filteredNodeCount: nodeIds.size,
          filteredEdgeCount: edges.length,
          rawEdgeCount: rawEdges.length,
          existingPathCount: overlayEdgePathByIdRef.current.size,
        })
        if (
          (overlayEdgePathByIdRef.current.size > 0 || shouldReuseStableGraph)
          && scheduleTransientOverlayEdgeRetry(['empty-filtered-edge-set', String(nodeIds.size), String(edges.length), String(overlayIdSet.size), String(rawEdges.length)])
        ) return
        removeAllPaths(overlayEdgePathByIdRef)
        overlayEdgeLayoutSigRef.current = ''
        overlayEdgeAnchorCacheRef.current.clear()
        return
      }
      const preserveExistingOverlayPathsForTransientEmptyEdges = (() => {
        if (edges.length > 0) return false
        pushOverlayEdgeTrace('empty-filtered-edge-set', {
          reusedStableGraph: shouldReuseStableGraph ? 1 : 0,
          withinWorkspaceCloseRecoveryWindow: withinWorkspaceCloseRecoveryWindow ? 1 : 0,
          overlayIdCount: overlayIdSet.size,
          filteredNodeCount: nodeIds.size,
          filteredEdgeCount: edges.length,
          rawEdgeCount: rawEdges.length,
          existingPathCount: overlayEdgePathByIdRef.current.size,
        })
        return (
          overlayEdgePathByIdRef.current.size > 0
          && scheduleTransientOverlayEdgeRetry(['empty-filtered-edge-set', String(nodeIds.size), String(edges.length), String(overlayIdSet.size), String(rawEdges.length)])
        )
      })()
      if (rawNodes.length > 0 && rawEdges.length > 0) {
        lastStableOverlayEdgeGraphRef.current = graph
      }

      const transientOffscreenOverlayIds: string[] = []
      const overlayRectsByNodeId = (() => {
        for (let i = 0; i < domOverlayRootEntries.length; i += 1) {
          const entry = domOverlayRootEntries[i]
          const el = entry?.el
          const id = entry?.id
          if (!id || !nodeIds.has(id)) continue
          const rect = el.getBoundingClientRect()
          if (isTransientOffscreenRichMediaOverlayRoot(el, rect)) {
            transientOffscreenOverlayIds.push(id)
          }
        }
        const map = new Map<string, DOMRect>()
        const elById = new Map<string, HTMLElement>()
        const canonicalEntries = collectCanonicalStoryboardWidgetOverlayRectEntries(domOverlayRootEntries.map(entry => entry.el))
        for (let i = 0; i < canonicalEntries.length; i += 1) {
          const entry = canonicalEntries[i]
          const id = readCanonicalStoryboardWidgetOverlayIdentity(entry.id)
          if (!id || !nodeIds.has(id)) continue
          map.set(id, entry.rect)
          elById.set(id, entry.el)
        }
        overlayElByNodeIdRef.current = elById
        const stableRects = lastStableOverlayRectByNodeIdRef.current
        const nextTs = Date.now()
        for (const [id, rect] of map.entries()) {
          stableRects.set(id, { rect: cloneDomRect(rect), ts: nextTs })
        }
        for (const [id, snapshot] of Array.from(stableRects.entries())) {
          if (map.has(id)) continue
          if (nextTs - snapshot.ts > 1500) stableRects.delete(id)
        }
        return map
      })()
      if (transientOffscreenOverlayIds.length > 0) {
        scheduleTransientOverlayEdgeRetry(['offscreen-rich-media-bootstrap', ...transientOffscreenOverlayIds])
      }
      if (overlayRectsByNodeId.size === 0) {
        pushOverlayEdgeTrace('empty-overlay-rects', {
          domOverlayRootCount: domOverlayRootEntries.length,
          overlayIdCount: overlayIdSet.size,
          filteredNodeCount: nodeIds.size,
          transientOffscreenCount: transientOffscreenOverlayIds.length,
          existingPathCount: overlayEdgePathByIdRef.current.size,
        })
        if (overlayEdgeRafRef.current == null) {
          overlayEdgeRafRef.current = requestAnimationFrame(() => {
            overlayEdgeRafRef.current = null
            scheduleOverlayEdgeUpdate()
          })
        }
        return
      }

      const topPctByNodeAndHandle = (() => {
        const overlayNodeIds = nodes.map(n => String(n.id || '').trim()).filter(Boolean)
        const overlayNodeIdsKey = hashScopedStringArraySignature('topPct-overlay-node-ids', overlayNodeIds, {
          unique: true,
          sort: true,
        })
        const overlayEdgeKeyParts: string[] = []
        for (let i = 0; i < edges.length; i += 1) {
          const e = edges[i]
          const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(e)
          overlayEdgeKeyParts.push(`${e.id}:${sourceId}->${targetId}:${e.sourcePortKey}|${e.targetPortKey}`)
        }
        const overlayEdgeKey = hashScopedStringArraySignature('topPct-overlay-edges', overlayEdgeKeyParts, {
          sort: true,
        })
        const reg = Array.isArray(args.widgetRegistryRef.current) ? (args.widgetRegistryRef.current as ReadonlyArray<WidgetRegistryEntry>) : null
        const registryKeyParts: Array<string | number | boolean> = ['registry', Array.isArray(reg) ? reg.length : 0]
        if (Array.isArray(reg)) {
          for (let i = 0; i < reg.length; i += 1) {
            const entry = reg[i]
            registryKeyParts.push(
              String(entry?.nodeTypeId || ''),
              String(entry?.widgetTypeId || ''),
              String(entry?.formId || ''),
              entry?.isEnabled === true,
              hashRecordSignature32({ fields: entry?.fields || [], ports: entry?.ports || [], mappings: entry?.schemaMappings || [] }, { maxEntries: 3, maxDepth: 4 }),
            )
          }
        }
        const cacheKey = hashSignatureParts([
          'topPct',
          graphSemanticKey,
          overlayNodeIdsKey,
          overlayEdgeKey,
          hashSignatureParts(registryKeyParts),
        ])
        const cached = overlayEdgeTopPctCacheRef.current
        if (cached && cached.key === cacheKey) return cached.map

        const handlesByNodeId = computeFlowHandlesByNode({
          nodes,
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            properties: { [FLOW_EDGE_SOURCE_PORT_KEY]: e.sourcePortKey, [FLOW_EDGE_TARGET_PORT_KEY]: e.targetPortKey },
          })),
          widgetRegistry: reg,
        })
        const map = new Map<string, Map<string, number>>()
        for (const [id, handles] of Object.entries(handlesByNodeId)) {
          const hm = new Map<string, number>()
          for (let i = 0; i < (handles.in || []).length; i += 1) hm.set(handles.in[i].id, handles.in[i].topPct)
          for (let i = 0; i < (handles.out || []).length; i += 1) hm.set(handles.out[i].id, handles.out[i].topPct)
          map.set(id, hm)
        }
        overlayEdgeTopPctCacheRef.current = { key: cacheKey, map }
        return map
      })()

      const rootRect = root.getBoundingClientRect()
      const baseLeft = Number.isFinite(rootRect.left) ? rootRect.left : null
      const baseTop = Number.isFinite(rootRect.top) ? rootRect.top : null
      const svgWidth = Number.isFinite(rootRect.width) ? Math.max(1, Math.round(rootRect.width)) : 1
      const svgHeight = Number.isFinite(rootRect.height) ? Math.max(1, Math.round(rootRect.height)) : 1
      if (baseLeft == null || baseTop == null) return
      const svgViewBox = `0 0 ${svgWidth} ${svgHeight}`
      if (svg.getAttribute('width') !== String(svgWidth)) svg.setAttribute('width', String(svgWidth))
      if (svg.getAttribute('height') !== String(svgHeight)) svg.setAttribute('height', String(svgHeight))
      if (svg.getAttribute('viewBox') !== svgViewBox) svg.setAttribute('viewBox', svgViewBox)
      if (svg.getAttribute('preserveAspectRatio') !== 'none') svg.setAttribute('preserveAspectRatio', 'none')
      const edgeMarkerRegistry = ensureEdgeMarkerRegistry(svg); const round2 = roundOverlayEdgeGeometryValue
      const buildRectAnchorCacheKey = (nodeId: string, dir: 'in' | 'out', portKey: string, rect: DOMRect, scrollSignature: string): string => [
        nodeId,
        dir,
        portKey,
        round2(rect.left),
        round2(rect.top),
        round2(rect.width),
        round2(rect.height),
        scrollSignature,
      ].join('|')
      const globalEdgeType = readGlobalEdgeType(schema)
      const globalEdgeColor = readGlobalEdgeColor(schema)
      const edgeAnimated = readGlobalEdgeAnimationEnabled(schema)
      const globalEdgeThickness = readGlobalEdgeThicknessPx(schema)
      if (edgeAnimated) ensureEdgeAnimationStyleElement(typeof document !== 'undefined' ? document : null)

      const layoutSig = (() => {
        const nodeIdsSorted = Array.from(overlayRectsByNodeId.keys()).sort((a, b) => a.localeCompare(b))
        const nodeParts: string[] = []
        for (let i = 0; i < nodeIdsSorted.length; i += 1) {
          const nodeId = nodeIdsSorted[i]
          const rect = overlayRectsByNodeId.get(nodeId)
          if (!rect) continue
          const overlayEl = overlayElByNodeIdRef.current.get(nodeId) || null
          const scrollTop = overlayEl && Number.isFinite(overlayEl.scrollTop) ? round2(overlayEl.scrollTop) : 0
          const scrollLeft = overlayEl && Number.isFinite(overlayEl.scrollLeft) ? round2(overlayEl.scrollLeft) : 0
          const nestedScrollSignature = readOverlayScrollSurfaceSignature(overlayEl)
          nodeParts.push(`${nodeId}:${round2(rect.left)}:${round2(rect.top)}:${round2(rect.width)}:${round2(rect.height)}:${scrollLeft}:${scrollTop}:${nestedScrollSignature}:${readStoryboardOverlayPortHandleSignature(overlayEl)}`)
        }
        const edgeParts = edges
          .map(e => {
            const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(e)
            return `${e.id}:${sourceId}->${targetId}:${e.sourcePortKey}|${e.targetPortKey}:${e.stroke}:${e.strokeWidth}`
          })
          .sort((a, b) => a.localeCompare(b))
        const pending = pendingEdgePreviewRef.current
        const cursor = pendingEdgeCursorRef.current
        const pendingSig =
          pending.toolMode === 'addEdge' && pending.sourceId && cursor
            ? `${pending.toolMode}:${pending.sourceIds.join(',')}:${pending.sourceId}:${String(pending.sourcePortKey || '')}:${round2(cursor.x)}:${round2(cursor.y)}`
            : ''
        const focusSig = focusedEdges.active
          ? `focus:${storyboardWidgetSelectedPortRowKey}:${focusedEdges.edgeIds.join(',')}`
          : 'focus:none'
        return `${workspaceOverlayOpen ? 'workspace-open' : 'workspace-closed'}:${round2(rootRect.left)}:${round2(rootRect.top)}:${round2(rootRect.width)}:${round2(rootRect.height)}|${graphSemanticKey}|${nodeParts.join(',')}|${edgeParts.join(',')}|${pendingSig}|${focusSig}`
      })()
      if (overlayEdgeLayoutSigRef.current === layoutSig) return
      overlayEdgeLayoutSigRef.current = layoutSig
      const keep = new Set<string>()

      const overlayElByNodeId = overlayElByNodeIdRef.current
      const esc = (s: string) => {
        const v = String(s || '')
        const c = (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS
        if (c?.escape) return c.escape(v)
        return v.replace(/[^a-zA-Z0-9_\-]/g, ch => `\\${ch}`)
      }
      const readAnchor = (anchorArgs: {
        nodeId: string
        dir: 'in' | 'out'
        portKey: string
        fallbackRect: DOMRect
        fallbackPct: number
      }): { x: number; y: number } | null => {
        const el = overlayElByNodeId.get(anchorArgs.nodeId)
        const portKey = String(anchorArgs.portKey || '').trim()
        const rect = anchorArgs.fallbackRect
        const overlayScrollSignature = `${readOverlayScrollSurfaceSignature(el || null)}|${readStoryboardOverlayPortHandleSignature(el || null)}`
        const anchorCacheKey = buildRectAnchorCacheKey(anchorArgs.nodeId, anchorArgs.dir, portKey, rect, overlayScrollSignature)
        let portHandleCandidates: HTMLElement[] = []
        if (el && portKey) {
          const baseSel = `[data-kg-port-handle="1"][data-kg-port-dir="${anchorArgs.dir}"][data-kg-port-key="${esc(portKey)}"]`
          const dotBtn = el.querySelector(`button${baseSel}[data-kg-port-handle-kind="dot"]`) as HTMLElement | null
          const railBtn = el.querySelector(`button${baseSel}[data-kg-port-handle-kind="rail"]`) as HTMLElement | null
          const fallbackBtn = el.querySelector(`button${baseSel}`) as HTMLElement | null
          const directionalRailBtn = railBtn || el.querySelector(`button[data-kg-port-handle="1"][data-kg-port-handle-kind="rail"][data-kg-port-dir="${anchorArgs.dir}"]`) as HTMLElement | null
          portHandleCandidates = [dotBtn, directionalRailBtn, fallbackBtn].filter((btn, index, items): btn is HTMLElement => !!btn && items.indexOf(btn) === index)
          const resolveFromButton = (btn: HTMLElement | null): { anchor: { x: number; y: number }; boundaryRect: DOMRect } | null => {
            if (!btn) return null
            if (!isUsablePortHandleForOverlay(el, btn)) return null
            const dotEl = btn.querySelector('span') as HTMLElement | null
            const r = dotEl ? dotEl.getBoundingClientRect() : btn.getBoundingClientRect()
            const x = Number.isFinite(r.left) && Number.isFinite(r.width)
              ? r.left + r.width / 2
              : anchorArgs.dir === 'out'
                ? r.right
                : r.left
            const y = r.top + r.height / 2
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null
            return {
              anchor: { x, y },
              boundaryRect: readPortHandleVisibleBoundaryRect(el, btn),
            }
          }
          const dotAnchor = resolveFromButton(dotBtn)
          const dotVisible = !!(dotAnchor && isAnchorVisibleInBoundary(dotAnchor.anchor, dotAnchor.boundaryRect))
          const railAnchor = resolveFromButton(directionalRailBtn)
          const fallbackAnchor = resolveFromButton(fallbackBtn)
          const nextAnchor = (dotVisible ? dotAnchor : null) || railAnchor || dotAnchor || fallbackAnchor
          if (nextAnchor) {
            const clampedY = clampAnchorYToVisibleBounds(nextAnchor.anchor.y, anchorArgs.fallbackRect, nextAnchor.boundaryRect)
            const resolved = { x: nextAnchor.anchor.x, y: clampedY }
            if (Number.isFinite(resolved.x) && Number.isFinite(resolved.y)) {
              overlayEdgeAnchorCacheRef.current.set(anchorCacheKey, resolved)
              return resolved
            }
          }
          if (portHandleCandidates.length > 0) overlayEdgeAnchorCacheRef.current.delete(anchorCacheKey)
        }
        const canUseCachedAnchor = portHandleCandidates.length === 0
        if (canUseCachedAnchor) {
          const cached = overlayEdgeAnchorCacheRef.current.get(anchorCacheKey)
          if (isCachedAnchorAlignedWithFallbackRect(cached || null, rect)) return cached
          overlayEdgeAnchorCacheRef.current.delete(anchorCacheKey)
        }
        if (!(Number.isFinite(rect.top) && Number.isFinite(rect.left) && Number.isFinite(rect.right) && Number.isFinite(rect.height) && rect.height > 0)) return null
        const fallbackPct = el?.matches('[data-kg-rich-media-overlay="1"], [data-kg-storyboard-fixed-card="1"]') ? 50 : anchorArgs.fallbackPct
        return readStoryboardOverlayFallbackRectAnchor({ dir: anchorArgs.dir, fallbackPct, rect })
      }

      const transientMissingEdgeAnchorParts: string[] = []
      const pending = pendingEdgePreviewRef.current
      const cursor = pendingEdgeCursorRef.current
      const pendingSourceIds = normalizeStoryboardWidgetPendingSourceIds(pending.sourceIds, pending.sourceId)
      const wantsPending = pending.toolMode === 'addEdge' && pendingSourceIds.length > 0 && !!cursor && Date.now() - cursor.ts < 4000
      if (!wantsPending) {
        removeAllPaths(overlayPendingEdgePathBySourceIdRef)
      } else {
        const keepPendingSourceIds = new Set<string>()
        for (const rawSourceId of pendingSourceIds) {
          const sourceId = readCanonicalStoryboardWidgetOverlayIdentity(rawSourceId)
          if (!sourceId) continue
          const stableRectSnapshot = lastStableOverlayRectByNodeIdRef.current.get(sourceId) || null
          const cachedSourceRect = stableRectSnapshot && Date.now() - stableRectSnapshot.ts <= 1500
            ? stableRectSnapshot.rect
            : null
          const startPointSnapshot = pendingEdgeStartPointRef.current
          const cachedStartPoint = sourceId === readCanonicalStoryboardWidgetOverlayIdentity(pending.sourceId)
            && startPointSnapshot
            && readCanonicalStoryboardWidgetOverlayIdentity(startPointSnapshot.sourceId) === sourceId
            && Date.now() - startPointSnapshot.ts <= 4000
            ? startPointSnapshot
            : null
          const sRect = overlayRectsByNodeId.get(sourceId) || cachedSourceRect
          if (!sRect && !cachedStartPoint) continue
          const handleKey = String(
            (sourceId === readCanonicalStoryboardWidgetOverlayIdentity(pending.sourceId)
              ? pending.sourcePortKey
              : null)
            || defaultPortKeyByNodeId.get(sourceId)?.out
            || FLOW_HANDLE_DEFAULT_EDGE_ID,
          ).trim()
          const outHandleId = buildFlowHandleId({ dir: 'out', edgeId: handleKey })
          const sPct = topPctByNodeAndHandle.get(sourceId)?.get(outHandleId) ?? 50
          const a = sRect ? readAnchor({ nodeId: sourceId, dir: 'out', portKey: handleKey, fallbackRect: sRect, fallbackPct: sPct }) : null
          const sx = a
            ? a.x - baseLeft
            : sRect
              ? sRect.right - baseLeft
              : cachedStartPoint!.x
          const sy = a
            ? a.y - baseTop
            : sRect
              ? sRect.top - baseTop + (Math.max(0, Math.min(100, sPct)) / 100) * sRect.height
              : cachedStartPoint!.y
          const tx = cursor.x
          const ty = cursor.y
          if (Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(tx) && Number.isFinite(ty)) {
            const d = buildEdgePathD({ edgeType: globalEdgeType, sx, sy, tx, ty, rankdir })
            const existing = overlayPendingEdgePathBySourceIdRef.current.get(sourceId)
            const pathEl = existing || document.createElementNS('http://www.w3.org/2000/svg', 'path')
            if (!existing) {
              pathEl.setAttribute('fill', 'none')
              pathEl.setAttribute('stroke', globalEdgeColor)
              pathEl.setAttribute('stroke-width', String(globalEdgeThickness))
              pathEl.setAttribute('stroke-linejoin', 'round')
              pathEl.setAttribute('stroke-linecap', 'round')
              pathEl.setAttribute('stroke-dasharray', edgeAnimated ? '7 5' : '4 4')
              pathEl.style.animation = edgeAnimated ? 'kg-edge-dash-flow 1.25s linear infinite' : ''
              pathEl.setAttribute('pointer-events', 'none')
              pathEl.setAttribute('data-kg-overlay-pending-edge', 'true')
              pathEl.setAttribute('data-kg-overlay-pending-edge-source-id', sourceId)
              pathEl.setAttribute('marker-end', edgeMarkerRegistry.urlFor('arrow-open', 'medium'))
              svg.appendChild(pathEl)
              overlayPendingEdgePathBySourceIdRef.current.set(sourceId, pathEl)
            }
            const pendingDash = edgeAnimated ? '7 5' : '4 4'
            const pendingOpacity = sourceId === readCanonicalStoryboardWidgetOverlayIdentity(pending.sourceId) ? '0.78' : '0.52'
            if (pathEl.getAttribute('stroke') !== globalEdgeColor) pathEl.setAttribute('stroke', globalEdgeColor)
            if (pathEl.getAttribute('stroke-width') !== String(globalEdgeThickness)) pathEl.setAttribute('stroke-width', String(globalEdgeThickness))
            if (pathEl.getAttribute('stroke-dasharray') !== pendingDash) pathEl.setAttribute('stroke-dasharray', pendingDash)
            if (pathEl.getAttribute('marker-end') !== edgeMarkerRegistry.urlFor('arrow-open', 'medium')) pathEl.setAttribute('marker-end', edgeMarkerRegistry.urlFor('arrow-open', 'medium'))
            if (pathEl.getAttribute('opacity') !== pendingOpacity) pathEl.setAttribute('opacity', pendingOpacity)
            pathEl.style.animation = edgeAnimated ? 'kg-edge-dash-flow 1.25s linear infinite' : ''
            if (pathEl.getAttribute('d') !== d) pathEl.setAttribute('d', d)
            keepPendingSourceIds.add(sourceId)
          }
        }
        for (const [sourceId, pathEl] of overlayPendingEdgePathBySourceIdRef.current) {
          if (keepPendingSourceIds.has(sourceId)) continue
          try { pathEl.remove() } catch { void 0 }
          overlayPendingEdgePathBySourceIdRef.current.delete(sourceId)
        }
      }

      for (let i = 0; i < edges.length; i += 1) {
        const e = edges[i]
        const edgeId = String(e?.id || '').trim()
        const source = readEdgeEndpointId(e?.source)
        const target = readEdgeEndpointId(e?.target)
        if (!edgeId || !source || !target) continue
        const sRect = overlayRectsByNodeId.get(source)
        const tRect = overlayRectsByNodeId.get(target)
        const existing = overlayEdgePathByIdRef.current.get(edgeId) || null
        if (!sRect || !tRect || !(sRect.height > 0 && tRect.height > 0)) {
          transientMissingEdgeAnchorParts.push(`${edgeId}:${source}:${target}`)
          if (existing) keep.add(edgeId)
          continue
        }
        const outHandleId = buildFlowHandleId({ dir: 'out', edgeId: e.sourcePortKey || FLOW_HANDLE_DEFAULT_EDGE_ID })
        const inHandleId = buildFlowHandleId({ dir: 'in', edgeId: e.targetPortKey || FLOW_HANDLE_DEFAULT_EDGE_ID })
        const sPct = topPctByNodeAndHandle.get(source)?.get(outHandleId) ?? 50
        const tPct = topPctByNodeAndHandle.get(target)?.get(inHandleId) ?? 50
        const rawEdge = graphLookup?.rawEdgeById.get(edgeId) || null
        const semanticCardMediaOutputAnchors = isStoryboardCardMediaDropOverlayEdge(rawEdge, overlayNodeById.get(source) || null, target)
          ? readStoryboardOutputCardLeftSideAnchors({ sourceCardRect: tRect, outputCardRect: sRect })
          : null
        const containedProjectionAnchors = rawEdge
          && readWorkflowMaterializationProjectionSourceNodeId(rawEdge.properties)
          ? readStoryboardContainedProjectionEdgeAnchors({
              sourceRect: sRect,
              targetRect: tRect,
            })
          : null
        const sAnchor = semanticCardMediaOutputAnchors?.source
          || containedProjectionAnchors?.source
          || readAnchor({ nodeId: source, dir: 'out', portKey: e.sourcePortKey || FLOW_HANDLE_DEFAULT_EDGE_ID, fallbackRect: sRect, fallbackPct: sPct })
        const tAnchor = semanticCardMediaOutputAnchors?.target
          || containedProjectionAnchors?.target
          || readAnchor({ nodeId: target, dir: 'in', portKey: e.targetPortKey || FLOW_HANDLE_DEFAULT_EDGE_ID, fallbackRect: tRect, fallbackPct: tPct })
        const sx = (sAnchor ? sAnchor.x : sRect.right) - baseLeft
        const tx = (tAnchor ? tAnchor.x : tRect.left) - baseLeft
        const sy = (sAnchor ? sAnchor.y : sRect.top + (Math.max(0, Math.min(100, sPct)) / 100) * sRect.height) - baseTop
        const ty = (tAnchor ? tAnchor.y : tRect.top + (Math.max(0, Math.min(100, tPct)) / 100) * tRect.height) - baseTop
        if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(tx) || !Number.isFinite(ty)) continue
        const overlayCurve = edgeCurveById.get(edgeId) || null
        const frontmatterShotEdgeCrowdingLift = resolveFrontmatterOverlayEdgeCrowdingLiftPx({
          graphMetaKind, edge: rawEdge, sourceNode: overlayNodeById.get(source) || null, targetNode: overlayNodeById.get(target) || null,
          sourceId: source, targetId: target, sourceY: sy, targetY: ty, sourceHeight: sRect.height, targetHeight: tRect.height,
        })
        const adjustedSy = frontmatterShotEdgeCrowdingLift > 0 ? sy - frontmatterShotEdgeCrowdingLift : sy
        const adjustedTy = frontmatterShotEdgeCrowdingLift > 0 ? ty + frontmatterShotEdgeCrowdingLift * 0.25 : ty
        const flowForwardTrack = resolveGraphEdgeFlowOrderDirection({
          edgeLabel: rawEdge?.label || e.edgeType,
          sourceId: source,
          targetId: target,
          orderByNodeId: overlayFlowOrderByNodeId,
        }) === 'forward'

        const d = containedProjectionAnchors?.trackSide
          ? buildStoryboardContainedProjectionEdgePath({
              source: { x: sx, y: adjustedSy },
              target: { x: tx, y: adjustedTy },
              trackSide: containedProjectionAnchors.trackSide,
            })
          : buildStoryboardOverlayEdgePathD({
              outputCardLeftSide: !!semanticCardMediaOutputAnchors,
              flowForwardTrack,
              edgeType: globalEdgeType,
              sx,
              sy: adjustedSy,
              tx,
              ty: adjustedTy,
              rankdir: containedProjectionAnchors
                ? containedProjectionAnchors.source.side === 'top'
                  || containedProjectionAnchors.source.side === 'bottom'
                  ? 'TB'
                  : 'LR'
                : rankdir,
              curve: containedProjectionAnchors
                ? null
                : overlayCurve || readEdgePathCurveOptions(e as unknown as GraphEdge, schema),
            })
        keep.add(edgeId)
        const pathEl = existing || document.createElementNS('http://www.w3.org/2000/svg', 'path')
        const stroke = e.stroke
        const strokeWidth = e.strokeWidth
        const edgeFocused = focusedEdges.active && focusedEdgeIds.has(edgeId)
        const edgeDimmed = focusedEdges.active && !focusedEdgeIds.has(edgeId)
        const edgeOpacity = edgeDimmed ? STORYBOARD_WIDGET_OVERLAY_EDGE_DIMMED_OPACITY : STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY
        if (!existing) {
          pathEl.setAttribute(STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR, edgeId)
          pathEl.setAttribute('fill', 'none')
          pathEl.setAttribute('stroke', stroke)
          pathEl.setAttribute('stroke-width', strokeWidth)
          pathEl.setAttribute('opacity', STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY)
          if (edgeOpacity !== STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY) pathEl.setAttribute('opacity', edgeOpacity)
          pathEl.setAttribute('data-kg-storyboard-widget-edge-focused', edgeFocused ? 'true' : 'false')
          pathEl.setAttribute('data-kg-storyboard-widget-edge-dimmed', edgeDimmed ? 'true' : 'false')
          pathEl.setAttribute('stroke-linejoin', 'round')
          pathEl.setAttribute('stroke-linecap', 'round')
          pathEl.setAttribute('stroke-dasharray', edgeAnimated ? '7 5' : '')
          pathEl.style.animation = edgeAnimated ? 'kg-edge-dash-flow 1.25s linear infinite' : ''
          svg.appendChild(pathEl)
          overlayEdgePathByIdRef.current.set(edgeId, pathEl)
        }
        if (pathEl.getAttribute(STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR) !== edgeId) pathEl.setAttribute(STORYBOARD_WIDGET_OVERLAY_EDGE_ID_ATTR, edgeId)
        if (pathEl.getAttribute('stroke') !== stroke) pathEl.setAttribute('stroke', stroke)
        if (pathEl.getAttribute('stroke-width') !== strokeWidth) pathEl.setAttribute('stroke-width', strokeWidth)
        if (pathEl.getAttribute('opacity') !== STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY) pathEl.setAttribute('opacity', STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY)
        if (edgeOpacity !== STORYBOARD_WIDGET_OVERLAY_EDGE_OPACITY && pathEl.getAttribute('opacity') !== edgeOpacity) pathEl.setAttribute('opacity', edgeOpacity)
        if (pathEl.getAttribute('data-kg-storyboard-widget-edge-focused') !== (edgeFocused ? 'true' : 'false')) pathEl.setAttribute('data-kg-storyboard-widget-edge-focused', edgeFocused ? 'true' : 'false')
        if (pathEl.getAttribute('data-kg-storyboard-widget-edge-dimmed') !== (edgeDimmed ? 'true' : 'false')) pathEl.setAttribute('data-kg-storyboard-widget-edge-dimmed', edgeDimmed ? 'true' : 'false')
        const edgeDash = edgeAnimated ? '7 5' : ''
        if (pathEl.getAttribute('stroke-dasharray') !== edgeDash) pathEl.setAttribute('stroke-dasharray', edgeDash)
        pathEl.style.animation = edgeAnimated ? 'kg-edge-dash-flow 1.25s linear infinite' : ''
        if (rawEdge) applyEdgeMarkerAttributes(pathEl, rawEdge, schema, edgeMarkerRegistry)
        if (pathEl.getAttribute('d') !== d) pathEl.setAttribute('d', d)
      }

      if (preserveExistingOverlayPathsForTransientEmptyEdges) {
        for (const id of overlayEdgePathByIdRef.current.keys()) keep.add(id)
      }
      for (const [id, el] of overlayEdgePathByIdRef.current.entries()) {
        if (keep.has(id)) continue
        try {
          el.remove()
        } catch {
          void 0
        }
        overlayEdgePathByIdRef.current.delete(id)
      }
      cacheFrozenOverlayEdgePaths()
      if (transientMissingEdgeAnchorParts.length > 0) {
        const retryKey = hashScopedStringArraySignature('missing-edge-anchors', transientMissingEdgeAnchorParts, {
          sort: true,
        })
        const prevRetry = overlayEdgeTransientRetryRef.current
        const nextCount = prevRetry && prevRetry.key === retryKey ? prevRetry.count + 1 : 1
        overlayEdgeTransientRetryRef.current = { key: retryKey, count: nextCount }
        if (nextCount <= 8 && overlayEdgeRafRef.current == null) {
          overlayEdgeRafRef.current = requestAnimationFrame(() => {
            overlayEdgeRafRef.current = null
            overlayEdgeLayoutSigRef.current = ''
            scheduleOverlayEdgeUpdate()
          })
        }
      } else {
        overlayEdgeTransientRetryRef.current = null
      }
      pushOverlayEdgeTrace('drawn', {
        overlayIdCount: overlayIdSet.size,
        domOverlayRootCount: domOverlayRootEntries.length,
        filteredNodeCount: nodeIds.size,
        filteredEdgeCount: edges.length,
        overlayRectCount: overlayRectsByNodeId.size,
        missingAnchorCount: transientMissingEdgeAnchorParts.length,
        keptEdgeCount: keep.size,
        existingPathCount: overlayEdgePathByIdRef.current.size,
        cachedStartPointAvailable: !!pendingEdgeStartPointRef.current,
        svgWidth: svgWidth,
        svgHeight: svgHeight,
        svgWidthAttr: svg.getAttribute('width') || '',
        svgHeightAttr: svg.getAttribute('height') || '',
        svgViewBox: svg.getAttribute('viewBox') || '',
        svgPathCount: svg.querySelectorAll('path[data-kg-overlay-edge-id], path[data-kg-overlay-pending-edge]').length,
        rootWidth: Math.round(rootRect.width),
        rootHeight: Math.round(rootRect.height),
      })
      if (keep.size === 0) overlayEdgeLayoutSigRef.current = ''
    }
    if (immediate) updateOverlayEdges()
    else overlayEdgeRafRef.current = requestAnimationFrame(updateOverlayEdges)
  }, [args.active, args.draftGraphDataRef, args.fixedCardsOwnGraphAuthority, args.storyboardWidgetSurfaceId, args.openWidgetNodeIdsRef, args.overlayEdgesEnabledRef, args.overlayEditorNodeIdsRef, args.pendingEdgeSourceId, args.pendingEdgeSourceIds, args.pendingOverlayNodeIdRef, args.renderGraphDataOverride, args.rootRef, args.widgetRegistryRef, cacheFrozenOverlayEdgePaths, storyboardWidgetSelectedPortRowKey, pushOverlayEdgeTrace, rankdir, restoreFrozenOverlayEdgePaths, scheduleOverlayEdgeReadinessRetry, scheduleTransientOverlayEdgeRetry, schema])
  scheduleOverlayEdgeUpdateRef.current = scheduleOverlayEdgeUpdate

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const win = window as StoryboardWidgetQeTraceWindow
    if (!isStoryboardWidgetQeTraceEnabled(win)) return
    const harness = {
      surfaceId: args.storyboardWidgetSurfaceId,
      mark: (label: string, extras?: Record<string, unknown>) => {
        const nextLabel = String(label || '').trim() || 'mark'
        pushOverlayEdgeTrace(`mark:${nextLabel}`, { label: nextLabel, ...(extras || {}) })
      },
      snapshot: (label?: string, extras?: Record<string, unknown>) => {
        return readOverlayEdgeHarnessSnapshot(label, extras)
      },
      schedule: (label?: string) => {
        const nextLabel = String(label || '').trim() || 'schedule'
        overlayEdgeLayoutSigRef.current = ''
        overlayEdgeAnchorCacheRef.current.clear()
        pushOverlayEdgeTrace(`schedule:${nextLabel}`, { label: nextLabel })
        scheduleOverlayEdgeUpdate()
      },
    }
    win.__KG_STORYBOARD_WIDGET_EDGE_HARNESS__ = harness
    pushOverlayEdgeTrace('harness-ready', { surfaceId: args.storyboardWidgetSurfaceId })
    return () => {
      if (win.__KG_STORYBOARD_WIDGET_EDGE_HARNESS__ === harness) win.__KG_STORYBOARD_WIDGET_EDGE_HARNESS__ = null
    }
  }, [args.storyboardWidgetSurfaceId, pushOverlayEdgeTrace, readOverlayEdgeHarnessSnapshot, scheduleOverlayEdgeUpdate])

  React.useEffect(() => {
    const readWorkspaceOverlayOpen = () => isWorkspaceEditorOverlayOpen(useGraphStore.getState())
    workspaceOverlayOpenRef.current = readWorkspaceOverlayOpen()
    if (workspaceOverlayOpenRef.current) scheduleOverlayEdgeUpdate()
    const unsub = useGraphStore.subscribe(
      s => [s.workspaceViewMode, s.workspaceCanvasPaneOpen, s.markdownWorkspaceIndexingInFlight] as const,
      () => {
        const wasOpen = workspaceOverlayOpenRef.current
        const isOpen = readWorkspaceOverlayOpen()
        workspaceOverlayOpenRef.current = isOpen
        if (isOpen) {
          overlayEdgeLayoutSigRef.current = ''
          overlayEdgeAnchorCacheRef.current.clear()
          scheduleOverlayEdgeUpdate()
          return
        }
        if (wasOpen) {
          overlayEdgeWorkspaceCloseRecoveryUntilRef.current = Date.now() + 1500
          scheduleOverlayEdgeUpdate()
        }
      },
    )
    return () => unsub()
  }, [cancelOverlayEdgeUpdate, scheduleOverlayEdgeUpdate])

  React.useEffect(() => {
    if (!args.active) return
    if (!args.overlayOnlyModeEnabled) return
    overlayEdgeLayoutSigRef.current = ''
    overlayEdgeAnchorCacheRef.current.clear()
    pushOverlayEdgeTrace('theme-change', { resolvedThemeMode: args.resolvedThemeMode })
    scheduleOverlayEdgeUpdate()
  }, [args.active, args.overlayOnlyModeEnabled, args.resolvedThemeMode, pushOverlayEdgeTrace, scheduleOverlayEdgeUpdate])

  React.useEffect(() => {
    if (!args.active) return
    if (!args.overlayOnlyModeEnabled) return
    overlayEdgeLayoutSigRef.current = ''
    scheduleOverlayEdgeUpdate()
  }, [args.active, args.overlayOnlyModeEnabled, storyboardWidgetSelectedPortRowKey, scheduleOverlayEdgeUpdate])

  React.useEffect(() => {
    if (!args.active) return
    const writeCursor = (clientX: number, clientY: number, source?: { id: string; portKey: string | null; phase: string } | null) => {
      const root = args.rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return
      if (source) {
        const currentSourceIds = pendingEdgePreviewRef.current.sourceIds
        pendingEdgePreviewRef.current = source.phase === 'cancel'
          ? { toolMode: 'select', sourceId: null, sourceIds: [], sourcePortKey: null }
          : {
              toolMode: 'addEdge',
              sourceId: source.id,
              sourceIds: currentSourceIds.includes(source.id) ? currentSourceIds : [source.id],
              sourcePortKey: source.portKey,
            }
      }
      const x = (Number.isFinite(clientX) ? clientX : rect.left) - rect.left
      const y = (Number.isFinite(clientY) ? clientY : rect.top) - rect.top
      if (source?.phase === 'start' && source.id && Number.isFinite(x) && Number.isFinite(y)) {
        pendingEdgeStartPointRef.current = { sourceId: source.id, x, y, ts: Date.now() }
      } else if (source?.phase === 'cancel') {
        pendingEdgeStartPointRef.current = null
      }
      pendingEdgeCursorRef.current = { x, y, ts: Date.now() }
      overlayEdgeLayoutSigRef.current = ''
      scheduleOverlayEdgeUpdate()
    }
    const onMove = (e: MouseEvent | PointerEvent) => writeCursor(e.clientX, e.clientY)
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<FlowPortHandlePreviewDetail>).detail
      const id = String(detail?.sourceNodeId || '').trim(); if (id) writeCursor(detail.clientX, detail.clientY, { id, portKey: String(detail.sourcePortKey || '').trim() || null, phase: detail.phase })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, onPreview)
    return () => { try { window.removeEventListener('mousemove', onMove); document.removeEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, onPreview) } catch { void 0 } }
  }, [args.active, args.rootRef, scheduleOverlayEdgeUpdate])

  React.useEffect(() => {
    if (!args.active) return
    scheduleOverlayEdgeUpdate()
    const onInteractionFrame = () => {
      if (overlayEdgeRafRef.current != null) {
        cancelAnimationFrame(overlayEdgeRafRef.current)
        overlayEdgeRafRef.current = null
      }
      overlayEdgeLayoutSigRef.current = ''
      overlayEdgeAnchorCacheRef.current.clear()
      scheduleOverlayEdgeUpdate()
    }
    const onGeometryCommitted = () => {
      overlayEdgeLayoutSigRef.current = ''
      overlayEdgeAnchorCacheRef.current.clear()
      scheduleOverlayEdgeUpdate(true)
    }
    window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, onInteractionFrame as EventListener)
    window.addEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, onGeometryCommitted as EventListener)
    const onAny = () => {
      overlayEdgeLayoutSigRef.current = ''
      overlayEdgeAnchorCacheRef.current.clear()
      scheduleOverlayEdgeUpdate()
    }
    const root = args.rootRef.current
    const overlayEdgeAnchorCache = overlayEdgeAnchorCacheRef.current
    window.addEventListener('resize', onAny)
    window.addEventListener('scroll', onAny, true)
    document.addEventListener('scroll', onAny, true)
    document.addEventListener('wheel', onAny, { capture: true, passive: true })
    root?.addEventListener('scroll', onAny, true)
    root?.addEventListener('wheel', onAny, { capture: true, passive: true })
    return () => {
      try {
        window.removeEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, onInteractionFrame as EventListener)
        window.removeEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, onGeometryCommitted as EventListener)
      } catch {
        void 0
      }
      window.removeEventListener('resize', onAny)
      window.removeEventListener('scroll', onAny, true)
      document.removeEventListener('scroll', onAny, true)
      document.removeEventListener('wheel', onAny, true)
      root?.removeEventListener('scroll', onAny, true)
      root?.removeEventListener('wheel', onAny, true)
      removeAllPaths(overlayEdgePathByIdRef)
      overlayEdgeLayoutSigRef.current = ''
      overlayEdgeAnchorCache.clear()
      lastStableOverlayRectByNodeIdRef.current.clear()
      lastStableOverlayEdgeNodeIdsRef.current = []
      removeAllPaths(overlayPendingEdgePathBySourceIdRef)
      cancelOverlayEdgeUpdate()
    }
  }, [args.active, args.rootRef, cancelOverlayEdgeUpdate, scheduleOverlayEdgeUpdate])

  return { overlayEdgesSvgRef: setOverlayEdgesSvgRef, scheduleOverlayEdgeUpdate }
}
