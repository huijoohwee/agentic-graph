import * as d3 from 'd3'
import type { FlowHandleId, FlowNodeHandles } from '@/components/FlowCanvas/handles'
import { parseFlowHandleKey } from '@/components/FlowCanvas/handles'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import type { GraphEdge } from '@/lib/graph/types'
import { computeConvexRing, type Point2d } from '@/lib/geometry/convexRing'
import { routeFlowEdgeOrtho, type Rect } from '@/components/FlowCanvas/edgeRouting'
import { computeGroupDepthStyle } from '@/lib/graph/groupDepthStyle'
import { aabbOverlaps, type AabbRect } from '@/lib/ui/labels/aabb'
import { estimateLabelCharWidthPx, estimateMaxCharsForWidthPx, truncateTextWithEllipsis, truncateTextWithWordEllipsis, wrapTextByMaxChars } from '@/lib/ui/text/labelText'
import { getKgTokenFallback, getKgThemeFromDom, readRootCssStateKey, resolveCssVarWithKgFallback } from '@/lib/ui/tokens-ssot'
import { readCanvasGridStrokeFallbacks } from '@/lib/canvas/canvasGridPaint'
import { screenToWorld as screenToWorldViewport } from '@/lib/zoom/viewport'
import { computeDynamicGroupResizeHandlePx, pxToWorld, readGroupResizeHandleConfig } from '@/lib/canvas/groupResizeHandleConfig'
import { computeDynamicNodePortHandlePx, computeZoomScaledPortHandlePx, shouldRenderNodePortHandleAsDot } from '@/components/GraphCanvas/portHandlesConfig'
import { drawInfiniteGridInWorldContext } from '@/lib/canvas/infiniteGrid'
import { readEdgePathCurveOptions, traceEdgePathOnCanvas } from '@/lib/graph/edgeTypes'
import { computeWidgetScale, computeWidgetScaledSize } from '@/lib/canvas/overlayWidgetZoom'
import { computeNestedGroupPadding } from '@/lib/canvas/subFlow'

export type FlowNativeNodeShape = 'circle' | 'rect' | 'diamond' | 'hex'

export type FlowNativeNode = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  zIndex?: number
  opacity?: number
  fill?: string
  stroke?: string
  strokeWidthPx?: number
  shape: FlowNativeNodeShape
  handles: FlowNodeHandles
  inHandleTopPctById: Partial<Record<FlowHandleId, number>>
  outHandleTopPctById: Partial<Record<FlowHandleId, number>>
  handleColorById?: Partial<Record<FlowHandleId, string>>
  handleStrokeWidthById?: Partial<Record<FlowHandleId, number>>
}

export type FlowNativeEdge = {
  id: string
  source: string
  target: string
  inHandleId: FlowHandleId
  outHandleId: FlowHandleId
  label?: string
  displayLabel?: string
  color?: string
  widthPx?: number
  zIndex?: number
  svgPathD?: string
  svgArrowD?: string
  svgPathTx?: number
  svgPathTy?: number
  labelX?: number
  labelY?: number
  drawAboveNodes?: boolean
  flowForwardTrack?: boolean
}
export type FlowNativeScene = {
  nodes: FlowNativeNode[]
  edges: FlowNativeEdge[]
  nodeById: Map<string, FlowNativeNode>
  overlayAabbByNodeId?: Record<string, FlowOverlayNodeAabb>
  groups?: GraphGroup[]
  groupIdsByNodeId?: Map<string, string[]>
}

export type FlowOverlayNodeAabb = { minX: number; minY: number; maxX: number; maxY: number }

export type FlowNativePortHandlesPresentation = {
  enabled: boolean
  placement: 'cardinal'
  sizePx: number
  offsetPx: number
  strokeWidthPx: number
}

export type FlowNativeGroupsPresentation = {
  enabled: boolean
  shape: 'rect' | 'geo'
  paddingPx: number
  labelTopExtraPx: number
  cornerRadiusPx: number
  strokeWidthPx: number
  fillOpacity: number
  resizeHandle?: {
    dotRadiusPx: number
    hitRadiusPx: number
    strokeWidthPx: number
    minBoundsSizePx: number
    dragSensitivity: number
    dragDeadzonePx: number
  }
  depthStyle: {
    enabled: boolean
    outerMaxBoostSteps: number
    outerStrokeWidthStepPx: number
    outerFillOpacityStep: number
  }
}

export type FlowNativePresentation = {
  labels: {
    nodeFontSizePx: number
    groupFontSizePx: number
    edgeFontSizePx: number
    color?: string
    haloColor?: string
    haloWidthPx?: number
  }
  portHandles: FlowNativePortHandlesPresentation
  groups: FlowNativeGroupsPresentation
  edges: {
    edgeType: 'bezier' | 'straight' | 'step' | 'smoothstep'
    strokeColor: string
    strokeWidthPx: number
    animated: boolean
    routing: {
      enabled: boolean
      mode: 'bezier' | 'ortho'
      obstacleAvoidance: boolean
      marginPx: number
      laneStepPx: number
      maxLanes: number
    }
    underlay: {
      enabled: boolean
      groupFadeAlpha: number
    }
  }
}

export type FlowNativeTheme = {
  bg: string
  nodeFill: string
  nodeStroke: string
  nodeStrokeSelected: string
  text: string
  edge: string
  edgeSelected: string
}

export type FlowNativeRuntime = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  viewportW: number
  viewportH: number
  dpr: number
  transform: d3.ZoomTransform
  rankdir: 'TB' | 'LR'
  scene: FlowNativeScene | null
  positionsReady: boolean
  theme: FlowNativeTheme
  fontFamily: string
  cssKey: string
  presentation: FlowNativePresentation
  pendingRaf: number | null
  dirty: boolean
  idSetCache: {
    selectedNodeIdsRef: string[] | null
    selectedNodeIds: Set<string>
    selectedEdgeIdsRef: string[] | null
    selectedEdgeIds: Set<string>
    focusedEdgeIdsRef: string[] | null
    focusedEdgeIds: Set<string>
    hideNodeIdsRef: string[] | null
    hideNodeIds: Set<string>
    hidePortHandleNodeIdsRef: string[] | null
    hidePortHandleNodeIds: Set<string>
  }
  groupAabbByIdCache: Map<string, FlowGroupAabb>
}

export const defaultFlowTheme = (): FlowNativeTheme => ({
  bg: getKgTokenFallback('--kg-canvas-bg', 'light'),
  nodeFill: getKgTokenFallback('--kg-surface-bg', 'light'),
  nodeStroke: getKgTokenFallback('--kg-canvas-node-stroke', 'light'),
  nodeStrokeSelected: getKgTokenFallback('--kg-canvas-accent', 'light'),
  text: getKgTokenFallback('--kg-text-primary', 'light'),
  edge: getKgTokenFallback('--kg-canvas-edge-stroke', 'light'),
  edgeSelected: getKgTokenFallback('--kg-canvas-accent', 'light'),
})

export const readFlowFontFamilyFromCss = (): string => {
  const fallback = '-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif'
  if (typeof document === 'undefined') return fallback
  try {
    const raw = String(getComputedStyle(document.documentElement).fontFamily || '').trim()
    return raw || fallback
  } catch {
    return fallback
  }
}

export const readFlowCssKey = (): string => {
  return readRootCssStateKey()
}

export const readFlowThemeFromCss = (): FlowNativeTheme => {
  try {
    if (typeof document === 'undefined') return defaultFlowTheme()
    const theme = getKgThemeFromDom()
    return {
      bg: resolveCssVarWithKgFallback('--kg-canvas-bg', theme),
      nodeFill: resolveCssVarWithKgFallback('--kg-surface-bg', theme),
      nodeStroke: resolveCssVarWithKgFallback('--kg-canvas-node-stroke', theme),
      nodeStrokeSelected: resolveCssVarWithKgFallback('--kg-canvas-accent', theme),
      text: resolveCssVarWithKgFallback('--kg-text-primary', theme),
      edge: resolveCssVarWithKgFallback('--kg-canvas-edge-stroke', theme),
      edgeSelected: resolveCssVarWithKgFallback('--kg-canvas-accent', theme),
    }
  } catch {
    return defaultFlowTheme()
  }
}

export const refreshFlowNativeCss = (rt: FlowNativeRuntime): void => {
  const nextKey = readFlowCssKey()
  if (nextKey && nextKey !== rt.cssKey) {
    rt.cssKey = nextKey
    rt.theme = readFlowThemeFromCss()
    rt.fontFamily = readFlowFontFamilyFromCss()
    rt.dirty = true
  }
}

let cachedCssVarKey = ''
let cachedCssVarValues: Map<string, string> | null = null

const resolveCssVarCached = (rt: FlowNativeRuntime, name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback
  if (!name) return fallback
  if (!rt.cssKey) return fallback

  if (rt.cssKey !== cachedCssVarKey) {
    cachedCssVarKey = rt.cssKey
    cachedCssVarValues = new Map()
  }
  const cache = cachedCssVarValues
  const cached = cache?.get(name)
  if (cached) return cached
  try {
    const styles = getComputedStyle(document.documentElement)
    const v = styles.getPropertyValue(name).trim()
    const resolved = v || fallback
    cache?.set(name, resolved)
    return resolved
  } catch {
    return fallback
  }
}

export const clampScale = (k: number, args: { minK: number; maxK: number }) => {
  const minK = Number.isFinite(args.minK) ? args.minK : 0.05
  const maxK = Number.isFinite(args.maxK) ? args.maxK : 20
  return Math.max(minK, Math.min(maxK, k))
}

export const createFlowNativeRuntime = (args: {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  viewportW: number
  viewportH: number
  dpr: number
  rankdir: 'TB' | 'LR'
  initialTransform?: d3.ZoomTransform
}): FlowNativeRuntime => {
  const cssKey = readFlowCssKey()
  return {
    canvas: args.canvas,
    ctx: args.ctx,
    viewportW: Math.max(1, Math.floor(args.viewportW)),
    viewportH: Math.max(1, Math.floor(args.viewportH)),
    dpr: Math.max(1, args.dpr),
    transform: args.initialTransform || d3.zoomIdentity,
    rankdir: args.rankdir,
    scene: null,
    positionsReady: false,
    theme: readFlowThemeFromCss(),
    fontFamily: readFlowFontFamilyFromCss(),
    cssKey,
    presentation: {
      labels: { nodeFontSizePx: 14, groupFontSizePx: 16, edgeFontSizePx: 12 },
      portHandles: { enabled: false, placement: 'cardinal', sizePx: 4, offsetPx: 2, strokeWidthPx: 1.5 },
      groups: {
        enabled: false,
        shape: 'rect',
        paddingPx: 24,
        labelTopExtraPx: 0,
        cornerRadiusPx: 12,
        strokeWidthPx: 1.5,
        fillOpacity: 0.08,
        depthStyle: { enabled: true, outerMaxBoostSteps: 3, outerStrokeWidthStepPx: 0.55, outerFillOpacityStep: 0.035 },
      },
      edges: {
        edgeType: 'bezier',
        strokeColor: 'var(--kg-canvas-accent)',
        strokeWidthPx: 1.5,
        animated: true,
        routing: { enabled: true, mode: 'ortho', obstacleAvoidance: true, marginPx: 10, laneStepPx: 56, maxLanes: 10 },
        underlay: { enabled: true, groupFadeAlpha: 0.65 },
      },
    },
    pendingRaf: null,
    dirty: true,
    idSetCache: {
      selectedNodeIdsRef: null,
      selectedNodeIds: new Set<string>(),
      selectedEdgeIdsRef: null,
      selectedEdgeIds: new Set<string>(),
      focusedEdgeIdsRef: null,
      focusedEdgeIds: new Set<string>(),
      hideNodeIdsRef: null,
      hideNodeIds: new Set<string>(),
      hidePortHandleNodeIdsRef: null,
      hidePortHandleNodeIds: new Set<string>(),
    },
    groupAabbByIdCache: new Map<string, FlowGroupAabb>(),
  }
}

export const computeFlowGroupAabb = (args: {
  scene: FlowNativeScene
  group: GraphGroup
  paddingPx: number
  labelTopExtraPx: number
  overlayAabbByNodeId?: Record<string, FlowOverlayNodeAabb> | null
}): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  const explicit = args.group.autoBounds === true ? undefined : (args.group as unknown as { bounds?: unknown }).bounds
  const explicitAabb = (() => {
    if (!explicit || typeof explicit !== 'object' || Array.isArray(explicit)) return null
    const x = typeof (explicit as any).x === 'number' ? (explicit as any).x : Number.NaN
    const y = typeof (explicit as any).y === 'number' ? (explicit as any).y : Number.NaN
    const w = typeof (explicit as any).width === 'number' ? (explicit as any).width : Number.NaN
    const h = typeof (explicit as any).height === 'number' ? (explicit as any).height : Number.NaN
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return { minX: x, minY: y, maxX: x + w, maxY: y + h }
  })()
  const memberIds = Array.isArray(args.group.memberNodeIds) ? args.group.memberNodeIds : []
  if (memberIds.length === 0) return explicitAabb
  const padding = computeNestedGroupPadding({ basePadding: args.paddingPx, group: args.group, groups: args.scene.groups || [] })
  const topExtra = Math.max(0, args.labelTopExtraPx)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let j = 0; j < memberIds.length; j += 1) {
    const id = String(memberIds[j] || '').trim()
    if (!id) continue
    const n = args.scene.nodeById.get(id)
    if (n) {
      const x0 = n.x - padding
      const y0 = n.y - padding
      const x1 = n.x + n.width + padding
      const y1 = n.y + n.height + padding
      minX = Math.min(minX, x0)
      minY = Math.min(minY, y0)
      maxX = Math.max(maxX, x1)
      maxY = Math.max(maxY, y1)
    }
    const overlayAabb = args.scene.overlayAabbByNodeId?.[id] || args.overlayAabbByNodeId?.[id]
    if (overlayAabb) {
      const ox0 = Number(overlayAabb.minX)
      const oy0 = Number(overlayAabb.minY)
      const ox1 = Number(overlayAabb.maxX)
      const oy1 = Number(overlayAabb.maxY)
      if (Number.isFinite(ox0) && Number.isFinite(oy0) && Number.isFinite(ox1) && Number.isFinite(oy1) && ox1 > ox0 && oy1 > oy0) {
        const overlayPadding = n ? 0 : padding
        minX = Math.min(minX, ox0 - overlayPadding)
        minY = Math.min(minY, oy0 - overlayPadding)
        maxX = Math.max(maxX, ox1 + overlayPadding)
        maxY = Math.max(maxY, oy1 + overlayPadding)
      }
    }
  }
  const computed =
    !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)
      ? null
      : ({ minX, minY: minY - topExtra, maxX, maxY } as { minX: number; minY: number; maxX: number; maxY: number })

  if (explicitAabb && computed) {
    return {
      minX: Math.min(explicitAabb.minX, computed.minX),
      minY: Math.min(explicitAabb.minY, computed.minY),
      maxX: Math.max(explicitAabb.maxX, computed.maxX),
      maxY: Math.max(explicitAabb.maxY, computed.maxY),
    }
  }
  if (explicitAabb) return explicitAabb
  return computed
}

export type FlowGroupAabb = NonNullable<ReturnType<typeof computeFlowGroupAabb>>

export const setFlowNativePresentation = (rt: FlowNativeRuntime, p: FlowNativePresentation) => {
  rt.presentation = p
  rt.dirty = true
}

export const setFlowNativeViewport = (rt: FlowNativeRuntime, args: { viewportW: number; viewportH: number; dpr: number }) => {
  rt.viewportW = Math.max(1, Math.floor(args.viewportW))
  rt.viewportH = Math.max(1, Math.floor(args.viewportH))
  rt.dpr = Math.max(1, args.dpr)
}

export const setFlowNativeRankdir = (rt: FlowNativeRuntime, rankdir: 'TB' | 'LR') => {
  rt.rankdir = rankdir
}

export const setFlowNativeTransform = (rt: FlowNativeRuntime, t: d3.ZoomTransform) => {
  rt.transform = t
  rt.dirty = true
}

export const setFlowNativeScene = (rt: FlowNativeRuntime, scene: FlowNativeScene | null) => {
  rt.scene = scene
  rt.dirty = true
}

export const hitTestNode = (rt: FlowNativeRuntime, p: { sx: number; sy: number }): string | null => {
  const scene = rt.scene
  if (!scene) return null
  const w = screenToWorldViewport({ transform: rt.transform, sx: p.sx, sy: p.sy })
  for (let i = scene.nodes.length - 1; i >= 0; i -= 1) {
    const n = scene.nodes[i]
    if (w.x >= n.x && w.x <= n.x + n.width && w.y >= n.y && w.y <= n.y + n.height) return n.id
  }
  return null
}

export const hitTestGroup = (rt: FlowNativeRuntime, p: { sx: number; sy: number }): string | null => {
  const cfg = rt.presentation.groups
  if (!cfg.enabled) return null
  const scene = rt.scene
  if (!scene?.groups || scene.groups.length === 0) return null
  const w = screenToWorldViewport({ transform: rt.transform, sx: p.sx, sy: p.sy })
  const padding = Math.max(0, cfg.paddingPx)
  const topExtra = Math.max(0, cfg.labelTopExtraPx)
  const groups = scene.groups
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i]
    const aabb = computeFlowGroupAabb({ scene, group: g, paddingPx: padding, labelTopExtraPx: topExtra })
    if (!aabb) continue
    if (w.x >= aabb.minX && w.x <= aabb.maxX && w.y >= aabb.minY && w.y <= aabb.maxY) return String(g.id || '')
  }
  return null
}

const clearCanvas = (rt: FlowNativeRuntime) => {
  const ctx = rt.ctx
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, rt.canvas.width, rt.canvas.height)
}

const applyDprAndWorldTransform = (rt: FlowNativeRuntime) => {
  const ctx = rt.ctx
  const dpr = rt.dpr
  const t = rt.transform
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(t.x, t.y)
  ctx.scale(t.k, t.k)
}

const resolveColor = (rt: FlowNativeRuntime, value: string | null | undefined, fallback: string): string => {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return fallback
  const m = v.match(/^var\((--[^)\s]+)\)$/)
  if (m) return resolveCssVarCached(rt, m[1], fallback)
  return v
}

const readLabelPaint = (rt: FlowNativeRuntime) => {
  const cfg = rt.presentation.labels || ({} as FlowNativePresentation['labels'])
  const fillFallback = resolveCssVarCached(rt, '--kg-canvas-label-fill', rt.theme.text)
  const haloFallback = resolveCssVarCached(rt, '--kg-canvas-label-halo', rt.theme.bg)
  const fill = resolveColor(rt, cfg.color || null, fillFallback)
  const halo = resolveColor(rt, cfg.haloColor || null, haloFallback)
  const haloWidthRaw = cfg.haloWidthPx
  const haloWidth = typeof haloWidthRaw === 'number' && Number.isFinite(haloWidthRaw) && haloWidthRaw > 0 ? haloWidthRaw : 3
  return { fill, halo, haloWidth }
}

const drawTextHalo = (
  ctx: CanvasRenderingContext2D,
  args: { text: string; x: number; y: number; fill: string; halo: string; haloWidth: number },
) => {
  ctx.fillStyle = args.fill
  const strokeText = (ctx as unknown as { strokeText?: unknown }).strokeText
  if (typeof strokeText === 'function') {
    ctx.strokeStyle = args.halo
    ctx.lineWidth = args.haloWidth
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.strokeText(args.text, args.x, args.y)
  }
  ctx.fillText(args.text, args.x, args.y)
}

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(Math.floor(r), Math.floor(Math.min(w, h) / 2)))
  if (typeof (ctx as unknown as { roundRect?: unknown }).roundRect === 'function') {
    ;(ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, w, h, rr)
    return
  }
  const r0 = rr
  ctx.moveTo(x + r0, y)
  ctx.lineTo(x + w - r0, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r0)
  ctx.lineTo(x + w, y + h - r0)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r0, y + h)
  ctx.lineTo(x + r0, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r0)
  ctx.lineTo(x, y + r0)
  ctx.quadraticCurveTo(x, y, x + r0, y)
}

const drawNode = (rt: FlowNativeRuntime, n: FlowNativeNode, args: { selected: boolean }) => {
  const ctx = rt.ctx
  const nodeOpacity = (() => {
    const raw = (n as unknown as { opacity?: unknown }).opacity
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.min(1, raw))
    return 1
  })()
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha * nodeOpacity))
  ctx.beginPath()
  if (n.shape === 'circle') {
    const r = Math.max(1, Math.min(n.width, n.height) / 2)
    ctx.arc(n.x + n.width / 2, n.y + n.height / 2, r, 0, Math.PI * 2)
  } else if (n.shape === 'diamond') {
    const cx = n.x + n.width / 2
    const cy = n.y + n.height / 2
    ctx.moveTo(cx, n.y)
    ctx.lineTo(n.x + n.width, cy)
    ctx.lineTo(cx, n.y + n.height)
    ctx.lineTo(n.x, cy)
    ctx.closePath()
  } else if (n.shape === 'hex') {
    const cx = n.x + n.width / 2
    const cy = n.y + n.height / 2
    const rx = n.width / 2
    const k = 0.58
    ctx.moveTo(cx - rx * k, n.y)
    ctx.lineTo(cx + rx * k, n.y)
    ctx.lineTo(n.x + n.width, cy)
    ctx.lineTo(cx + rx * k, n.y + n.height)
    ctx.lineTo(cx - rx * k, n.y + n.height)
    ctx.lineTo(n.x, cy)
    ctx.closePath()
  } else {
    ctx.rect(n.x, n.y, n.width, n.height)
  }
  ctx.fillStyle = resolveColor(rt, (n as unknown as { fill?: unknown }).fill as string | null, rt.theme.nodeFill)
  ctx.fill()
  ctx.lineWidth = (() => {
    const raw = (n as unknown as { strokeWidthPx?: unknown }).strokeWidthPx
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1
    return Math.max(0, Math.min(24, v))
  })()
  ctx.strokeStyle =
    args.selected
      ? rt.theme.nodeStrokeSelected
      : resolveColor(rt, (n as unknown as { stroke?: unknown }).stroke as string | null, rt.theme.nodeStroke)
  ctx.stroke()

  const label = String(n.label || '').trim()
  if (!label) {
    ctx.restore()
    return
  }
  const paint = readLabelPaint(rt)
  const fontSizePx = Math.max(10, rt.presentation.labels?.nodeFontSizePx ?? 12)
  ctx.font = `${fontSizePx}px ${rt.fontFamily}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const padX = 8
  const padY = 4
  const availW = Math.max(8, n.width - padX * 2)
  const availH = Math.max(8, n.height - padY * 2)
  const base = truncateTextWithWordEllipsis(label, 20)
  const maxCharsPerLine = Math.max(4, Math.min(80, estimateMaxCharsForWidthPx(availW, fontSizePx)))
  const wrapped = wrapTextByMaxChars(base, maxCharsPerLine)
  const rawLines = String(wrapped).replace(/\r\n?/g, '\n').split('\n')
  const lineH = fontSizePx * 1.2
  const maxLines = Math.max(1, Math.min(4, Math.floor(availH / Math.max(1, lineH))))
  const visibleLines =
    rawLines.length > maxLines
      ? (() => {
          const v = rawLines.slice(0, maxLines)
          const last = String(v[v.length - 1] || '')
          v[v.length - 1] = last.endsWith('…') ? last : truncateTextWithEllipsis(last, Math.max(1, last.length))
          if (!v[v.length - 1].endsWith('…')) v[v.length - 1] = `${v[v.length - 1]}…`
          return v
        })()
      : rawLines
  const cx = n.x + n.width / 2
  const cy = n.y + n.height / 2
  for (let i = 0; i < visibleLines.length; i += 1) {
    const line = String(visibleLines[i] || '').trim()
    if (!line) continue
    drawTextHalo(ctx, {
      text: line,
      x: cx,
      y: cy + (i - (visibleLines.length - 1) / 2) * lineH,
      fill: paint.fill,
      halo: paint.halo,
      haloWidth: paint.haloWidth,
    })
  }
  ctx.restore()
}

const drawPortHandles = (rt: FlowNativeRuntime, n: FlowNativeNode) => {
  const cfg = rt.presentation.portHandles
  if (!cfg.enabled) return
  if (cfg.placement !== 'cardinal') return
  const ctx = rt.ctx
  const nodeOpacity = (() => {
    const raw = (n as unknown as { opacity?: unknown }).opacity
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.min(1, raw))
    return 1
  })()
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha * nodeOpacity))
  const k = rt.transform.k || 1
  const nodeScaledBase = computeDynamicNodePortHandlePx({
    sizePx: cfg.sizePx,
    strokeWidthPx: cfg.strokeWidthPx,
    offsetPx: cfg.offsetPx,
    nodeWidth: n.width,
    nodeHeight: n.height,
  })
  const nodeScaled = computeZoomScaledPortHandlePx({
    sizePx: nodeScaledBase.sizePx,
    strokeWidthPx: nodeScaledBase.strokeWidthPx,
    offsetPx: nodeScaledBase.offsetPx,
    zoomK: k,
  })
  const rScreen = Math.max(0.8, nodeScaled.sizePx)
  const offsetScreen = Math.max(0, nodeScaled.offsetPx)
  const strokeWScreenDefault = Math.max(0.5, nodeScaled.strokeWidthPx)
  const r = rScreen / k
  const offset = offsetScreen / k

  const fill = resolveCssVarCached(rt, '--kg-panel-bg', rt.theme.nodeFill)
  const defaultStroke = rt.theme.nodeStrokeSelected
  const handleColorById = (n as unknown as { handleColorById?: Partial<Record<FlowHandleId, string>> }).handleColorById || null
  const handleStrokeWidthById = (n as unknown as { handleStrokeWidthById?: Partial<Record<FlowHandleId, number>> }).handleStrokeWidthById || null

  const axisFor = (pct: number, length: number) => (Math.max(0, Math.min(100, pct)) / 100) * length
  const inHandles = n.handles?.in || []
  const outHandles = n.handles?.out || []

  const drawCircle = (x: number, y: number, handleId: FlowHandleId) => {
    const renderDot = shouldRenderNodePortHandleAsDot(rScreen)
    const fallbackKey = parseFlowHandleKey(handleId)
    const byId = (handleColorById && handleColorById[handleId]) || ''
    const byPortKey = (handleColorById && (handleColorById as unknown as Record<string, string | undefined>)[fallbackKey]) || ''
    const strokeColor = byId || byPortKey || defaultStroke
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = renderDot ? strokeColor : fill
    ctx.fill()
    if (renderDot) return
    const strokeWScreen = (() => {
      const byId = handleStrokeWidthById && handleStrokeWidthById[handleId]
      const byPortKey = handleStrokeWidthById && (handleStrokeWidthById as unknown as Record<string, number | undefined>)[fallbackKey]
      const raw = typeof byId === 'number' && Number.isFinite(byId) ? byId : typeof byPortKey === 'number' && Number.isFinite(byPortKey) ? byPortKey : null
      return raw != null ? Math.max(1, Math.min(12, raw)) : strokeWScreenDefault
    })()
    ctx.lineWidth = strokeWScreen / k
    ctx.strokeStyle = strokeColor
    ctx.stroke()
  }

  if (rt.rankdir === 'LR') {
    for (let i = 0; i < inHandles.length; i += 1) {
      const pct = n.inHandleTopPctById[inHandles[i].id] ?? 50
      const y = n.y + axisFor(pct, n.height)
      drawCircle(n.x - offset, y, inHandles[i].id)
    }
    for (let i = 0; i < outHandles.length; i += 1) {
      const pct = n.outHandleTopPctById[outHandles[i].id] ?? 50
      const y = n.y + axisFor(pct, n.height)
      drawCircle(n.x + n.width + offset, y, outHandles[i].id)
    }
    ctx.restore()
    return
  }

  for (let i = 0; i < inHandles.length; i += 1) {
    const pct = n.inHandleTopPctById[inHandles[i].id] ?? 50
    const x = n.x + axisFor(pct, n.width)
    drawCircle(x, n.y - offset, inHandles[i].id)
  }
  for (let i = 0; i < outHandles.length; i += 1) {
    const pct = n.outHandleTopPctById[outHandles[i].id] ?? 50
    const x = n.x + axisFor(pct, n.width)
    drawCircle(x, n.y + n.height + offset, outHandles[i].id)
  }
  ctx.restore()
}

const drawEdge = (
  rt: FlowNativeRuntime,
  e: FlowNativeEdge,
  args: {
    selected: boolean
    dimmed?: boolean
    source: FlowNativeNode
    target: FlowNativeNode
    routingObstacles: Rect[] | null
  },
) => {
  const ctx = rt.ctx
  const rankdir = rt.rankdir
  const s = args.source
  const t = args.target
  const k = rt.transform.k || 1
  const edgeType = rt.presentation.edges.edgeType
  const edgeColorDefault = rt.presentation.edges.strokeColor || rt.theme.edge
  const edgeAnimated = rt.presentation.edges.animated !== false
  const dimAlpha = args.dimmed ? 0.16 : 1

  const svgPathD = typeof e.svgPathD === 'string' ? e.svgPathD.trim() : ''
  if (edgeType === 'bezier' && svgPathD) {
    const widthPx = typeof e.widthPx === 'number' && Number.isFinite(e.widthPx)
      ? Math.max(1, Math.min(12, e.widthPx))
      : Math.max(0.5, Math.min(12, rt.presentation.edges.strokeWidthPx))
    ctx.save()
    ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha * dimAlpha))
    const tx = typeof e.svgPathTx === 'number' && Number.isFinite(e.svgPathTx) ? e.svgPathTx : 0
    const ty = typeof e.svgPathTy === 'number' && Number.isFinite(e.svgPathTy) ? e.svgPathTy : 0
    if (tx || ty) ctx.translate(tx, ty)
    ctx.lineWidth = (args.selected ? Math.max(2, widthPx + 1) : widthPx) / Math.max(1e-6, k)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = args.selected ? rt.theme.edgeSelected : (e.color || edgeColorDefault)
    if (edgeAnimated) {
      ctx.setLineDash?.([Math.max(4, widthPx * 3), Math.max(3, widthPx * 2)])
      ctx.lineDashOffset = -(performance.now() * 0.02)
    } else {
      ctx.setLineDash?.([])
      ctx.lineDashOffset = 0
    }
    try {
      const p = new Path2D(svgPathD)
      ctx.stroke(p)
    } catch {
      void 0
    }

    const arrowD = typeof e.svgArrowD === 'string' ? e.svgArrowD.trim() : ''
    if (arrowD) {
      ctx.fillStyle = args.selected ? rt.theme.edgeSelected : (e.color || edgeColorDefault)
      try {
        const a = new Path2D(arrowD)
        ctx.fill(a)
      } catch {
        void 0
      }
    }
    ctx.restore()
    void s
    void t
    void rankdir
    return
  }
  const portHandlesEnabled = rt.presentation.portHandles.enabled
  const sPct = portHandlesEnabled ? ((s.outHandleTopPctById[e.outHandleId] ?? 50) as number) : 50
  const tPct = portHandlesEnabled ? ((t.inHandleTopPctById[e.inHandleId] ?? 50) as number) : 50
  const sAxis = Math.max(0, Math.min(100, sPct)) / 100
  const tAxis = Math.max(0, Math.min(100, tPct)) / 100

  const sxx = rankdir === 'LR' ? s.x + s.width : s.x + sAxis * s.width
  const txx = rankdir === 'LR' ? t.x : t.x + tAxis * t.width
  const syy = rankdir === 'LR' ? s.y + sAxis * s.height : s.y + s.height
  const tyy = rankdir === 'LR' ? t.y + tAxis * t.height : t.y

  const edgesCfg = rt.presentation.edges
  const routingCfg = edgesCfg.routing
  const useOrtho = edgeType === 'step' && routingCfg.enabled && routingCfg.mode === 'ortho'
  const useObstacles = useOrtho && e.flowForwardTrack !== true && routingCfg.obstacleAvoidance
  const obstacles = useObstacles && args.routingObstacles ? args.routingObstacles : []
  const points = useOrtho && e.flowForwardTrack !== true
    ? routeFlowEdgeOrtho({
        rankdir,
        start: { x: sxx, y: syy },
        end: { x: txx, y: tyy },
        obstacles,
        marginPx: routingCfg.marginPx,
        laneStepPx: routingCfg.laneStepPx,
        maxLanes: routingCfg.maxLanes,
        ignorePoints: useObstacles ? [{ x: sxx, y: syy }, { x: txx, y: tyy }] : undefined,
      })
    : []

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, ctx.globalAlpha * dimAlpha))
  ctx.beginPath()
  if (points.length >= 2) {
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y)
  } else {
    traceEdgePathOnCanvas({
      ctx,
      edgeType,
      sx: sxx,
      sy: syy,
      tx: txx,
      ty: tyy,
      rankdir, flowForwardTrack: e.flowForwardTrack === true,
      curve: readEdgePathCurveOptions(e as unknown as GraphEdge, null),
    })
  }
  const widthPx = typeof e.widthPx === 'number' && Number.isFinite(e.widthPx)
    ? Math.max(1, Math.min(12, e.widthPx))
    : Math.max(0.5, Math.min(12, rt.presentation.edges.strokeWidthPx))
  ctx.lineWidth = (args.selected ? Math.max(2, widthPx + 1) : widthPx) / Math.max(1e-6, k)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = args.selected ? rt.theme.edgeSelected : (e.color || edgeColorDefault)
  if (edgeAnimated) {
    ctx.setLineDash?.([Math.max(4, widthPx * 3), Math.max(3, widthPx * 2)])
    ctx.lineDashOffset = -(performance.now() * 0.02)
  } else {
    ctx.setLineDash?.([])
    ctx.lineDashOffset = 0
  }
  ctx.stroke()
  ctx.restore()
}

const buildRoutingObstacles = (rt: FlowNativeRuntime, scene: FlowNativeScene, groupAabbById: Map<string, FlowGroupAabb> | null): Rect[] => {
  const obstacles: Rect[] = []
  const handleExtra = (() => {
    const cfg = rt.presentation.portHandles
    if (!cfg.enabled) return 0
    const size = Number.isFinite(cfg.sizePx) ? Math.max(0, cfg.sizePx) : 0
    const offset = Number.isFinite(cfg.offsetPx) ? Math.max(0, cfg.offsetPx) : 0
    return (size + offset) / Math.max(1e-6, rt.transform.k || 1)
  })()
  for (let i = 0; i < scene.nodes.length; i += 1) {
    const n = scene.nodes[i]
    obstacles.push({ x: n.x - handleExtra, y: n.y - handleExtra, w: n.width + handleExtra * 2, h: n.height + handleExtra * 2 })
  }

  const gCfg = rt.presentation.groups
  if (!gCfg.enabled || !scene.groups || scene.groups.length === 0) return obstacles

  for (let i = 0; i < scene.groups.length; i += 1) {
    const g = scene.groups[i]
    const aabb =
      (groupAabbById ? groupAabbById.get(g.id) || null : null) ||
      computeFlowGroupAabb({
        scene,
        group: g,
        paddingPx: gCfg.paddingPx,
        labelTopExtraPx: gCfg.labelTopExtraPx,
      })
    if (!aabb) continue
    const w = aabb.maxX - aabb.minX
    const h = aabb.maxY - aabb.minY
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue
    obstacles.push({ x: aabb.minX, y: aabb.minY, w, h })
  }

  return obstacles
}

const fadeEdgesUnderGeometry = (rt: FlowNativeRuntime, groupAabbById: Map<string, FlowGroupAabb> | null) => {
  const ctx = rt.ctx
  const scene = rt.scene
  if (!scene) return

  const underlayCfg = rt.presentation.edges.underlay
  if (!underlayCfg.enabled) return

  ctx.save()
  ctx.fillStyle = rt.theme.bg

  const gCfg = rt.presentation.groups
  const padding = Math.max(0, gCfg.paddingPx)
  const topExtra = Math.max(0, gCfg.labelTopExtraPx)
  const radius = Math.max(0, gCfg.cornerRadiusPx)

  if (gCfg.enabled && scene.groups && scene.groups.length > 0) {
    const groups = scene.groups
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i]
      const aabb = (groupAabbById ? groupAabbById.get(g.id) || null : null) || computeFlowGroupAabb({ scene, group: g, paddingPx: padding, labelTopExtraPx: topExtra })
      if (!aabb) continue
      const w = Math.max(1, aabb.maxX - aabb.minX)
      const h = Math.max(1, aabb.maxY - aabb.minY)
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, underlayCfg.groupFadeAlpha))
      ctx.beginPath()
      if (gCfg.shape === 'rect') {
        roundRectPath(ctx, aabb.minX, aabb.minY, w, h, radius)
      } else {
        const memberIds = Array.isArray(g.memberNodeIds) ? g.memberNodeIds : []
        const geoPoints: Point2d[] = []
        for (let j = 0; j < memberIds.length; j += 1) {
          const id = String(memberIds[j] || '').trim()
          if (!id) continue
          const n = scene.nodeById.get(id)
          if (!n) continue
          const x0 = n.x - padding
          const y0 = n.y - padding
          const x1 = n.x + n.width + padding
          const y1 = n.y + n.height + padding
          geoPoints.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 })
        }
        const ring = computeConvexRing(geoPoints)
        if (ring.length >= 3) {
          ctx.moveTo(ring[0].x, ring[0].y)
          for (let k = 1; k < ring.length; k += 1) ctx.lineTo(ring[k].x, ring[k].y)
          ctx.closePath()
        } else {
          roundRectPath(ctx, aabb.minX, aabb.minY, w, h, radius)
        }
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  ctx.restore()
}

const drawEdgeLabels = (
  rt: FlowNativeRuntime,
  args: {
    selectedEdgeIds: Set<string>
    edgeFocusActive: boolean
    focusedEdgeIds: Set<string>
    routingObstacles: Rect[] | null
    groupAabbById: Map<string, FlowGroupAabb> | null
    hiddenNodeIds: Set<string>
  },
) => {
  const scene = rt.scene
  if (!scene) return
  const edges = scene.edges
  if (!edges || edges.length === 0) return
  if (edges.length > 250) return

  const k = rt.transform.k || 1
  if (k < 0.55) return
  if (!rt.positionsReady) return
  const ctx = rt.ctx
  const paint = readLabelPaint(rt)
  const fontSizePx = Math.max(9, rt.presentation.labels?.edgeFontSizePx ?? 12)
  const charWWorld = estimateLabelCharWidthPx(fontSizePx)
  const lineHWorld = fontSizePx * 1.2
  const padX = 6
  const padY = 3

  const blockers: AabbRect[] = []
  for (let i = 0; i < scene.nodes.length; i += 1) {
    const n = scene.nodes[i]
    if (args.hiddenNodeIds.has(n.id)) continue
    const cx = n.x + n.width / 2
    const cy = n.y + n.height / 2
    blockers.push({ x: cx, y: cy, halfW: n.width / 2 + 4, halfH: n.height / 2 + 4 })
  }

  const groupLabelBlockers: AabbRect[] = []
  const gCfg = rt.presentation.groups
  if (gCfg.enabled && scene.groups && scene.groups.length > 0) {
    for (let i = 0; i < scene.groups.length; i += 1) {
      const g = scene.groups[i]
      const label = String(g.label || '').trim()
      if (!label) continue
      const aabb =
        (args.groupAabbById ? args.groupAabbById.get(g.id) || null : null) ||
        computeFlowGroupAabb({ scene, group: g, paddingPx: gCfg.paddingPx, labelTopExtraPx: gCfg.labelTopExtraPx })
      if (!aabb) continue
      const w = Math.max(1, aabb.maxX - aabb.minX)
      const minX = aabb.minX
      const minY = aabb.minY
      const maxChars = estimateMaxCharsForWidthPx(Math.max(0, w - 20), fontSizePx)
      const clipped = truncateTextWithEllipsis(label, maxChars)
      const textW = Math.max(6, clipped.length * charWWorld)
      const halfW = textW / 2 + padX
      const halfH = lineHWorld / 2 + padY
      const cx = minX + 10 + halfW
      const cy = minY + 8 + halfH
      groupLabelBlockers.push({ x: cx, y: cy, halfW, halfH })
    }
  }
  blockers.push(...groupLabelBlockers)

  const placed: AabbRect[] = []

  const rankdir = rt.rankdir
  const portHandlesEnabled = rt.presentation.portHandles.enabled
  const routingCfg = rt.presentation.edges.routing
  const useOrtho = routingCfg.enabled && routingCfg.mode === 'ortho'
  const useObstacles = useOrtho && routingCfg.obstacleAvoidance
  const routingObstacles = useObstacles ? (args.routingObstacles || []) : []

  const pillBg = resolveCssVarCached(rt, '--kg-panel-bg', rt.theme.bg)
  const pillStrokeDefault = resolveCssVarCached(rt, '--kg-border-subtle', rt.theme.edge)

  const offsets = [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -14 },
    { dx: 0, dy: 14 },
    { dx: 16, dy: 0 },
    { dx: -16, dy: 0 },
  ]

  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    const labelRaw = String(e.displayLabel || e.label || '').trim()
    if (!labelRaw) continue
    const s = scene.nodeById.get(e.source)
    const t = scene.nodeById.get(e.target)
    if (!s || !t) continue
    if (args.hiddenNodeIds.has(s.id) || args.hiddenNodeIds.has(t.id)) continue

    const sPct = portHandlesEnabled ? ((s.outHandleTopPctById[e.outHandleId] ?? 50) as number) : 50
    const tPct = portHandlesEnabled ? ((t.inHandleTopPctById[e.inHandleId] ?? 50) as number) : 50
    const sAxis = Math.max(0, Math.min(100, sPct)) / 100
    const tAxis = Math.max(0, Math.min(100, tPct)) / 100

    const sxx = rankdir === 'LR' ? s.x + s.width : s.x + sAxis * s.width
    const txx = rankdir === 'LR' ? t.x : t.x + tAxis * t.width
    const syy = rankdir === 'LR' ? s.y + sAxis * s.height : s.y + s.height
    const tyy = rankdir === 'LR' ? t.y + tAxis * t.height : t.y

    const points = useOrtho && e.flowForwardTrack !== true
      ? routeFlowEdgeOrtho({
          rankdir,
          start: { x: sxx, y: syy },
          end: { x: txx, y: tyy },
          obstacles: useObstacles && routingObstacles ? routingObstacles : [],
          marginPx: routingCfg.marginPx,
          laneStepPx: routingCfg.laneStepPx,
          maxLanes: routingCfg.maxLanes,
          ignorePoints: useObstacles ? [{ x: sxx, y: syy }, { x: txx, y: tyy }] : undefined,
        })
      : []

    const mid = (() => {
      if (points.length >= 2) {
        let best: { x: number; y: number } = points[0]
        let bestLen = -Infinity
        for (let j = 0; j < points.length - 1; j += 1) {
          const a = points[j]
          const b = points[j + 1]
          const len = Math.hypot(b.x - a.x, b.y - a.y)
          if (len > bestLen) {
            bestLen = len
            best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          }
        }
        return best
      }
      return { x: (sxx + txx) / 2, y: (syy + tyy) / 2 }
    })()

    const lx = typeof (e as unknown as { labelX?: unknown }).labelX === 'number' ? ((e as unknown as { labelX: number }).labelX) : Number.NaN
    const ly = typeof (e as unknown as { labelY?: unknown }).labelY === 'number' ? ((e as unknown as { labelY: number }).labelY) : Number.NaN
    const mid2 = Number.isFinite(lx) && Number.isFinite(ly) ? { x: lx, y: ly } : mid

    const maxChars = estimateMaxCharsForWidthPx(Math.max(0, 160), fontSizePx)
    const clipped = truncateTextWithEllipsis(labelRaw, Math.max(6, Math.min(60, maxChars)))
    const textW = Math.max(6, clipped.length * charWWorld)
    const halfW = textW / 2 + padX
    const halfH = lineHWorld / 2 + padY

    let placedRect: AabbRect | null = null
    for (let oi = 0; oi < offsets.length; oi += 1) {
      const o = offsets[oi]
      const rect: AabbRect = { x: mid2.x + o.dx, y: mid2.y + o.dy, halfW, halfH }
      let ok = true
      for (let bi = 0; bi < blockers.length; bi += 1) {
        if (aabbOverlaps(rect, blockers[bi])) { ok = false; break }
      }
      if (ok) {
        for (let pi = 0; pi < placed.length; pi += 1) {
          if (aabbOverlaps(rect, placed[pi])) { ok = false; break }
        }
      }
      if (!ok) continue
      placedRect = rect
      break
    }
    if (!placedRect) continue
    placed.push(placedRect)

    ctx.save()
    ctx.font = `${fontSizePx}px ${rt.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = pillBg
    ctx.strokeStyle = args.selectedEdgeIds.has(e.id) ? rt.theme.edgeSelected : (e.color || pillStrokeDefault)
    ctx.globalAlpha = args.edgeFocusActive && !args.focusedEdgeIds.has(e.id) ? 0.24 : (args.selectedEdgeIds.has(e.id) ? 0.98 : 0.9)
    ctx.lineWidth = 1
    ctx.beginPath()
    roundRectPath(ctx, placedRect.x - placedRect.halfW, placedRect.y - placedRect.halfH, placedRect.halfW * 2, placedRect.halfH * 2, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.globalAlpha = 1
    drawTextHalo(ctx, { text: clipped, x: placedRect.x, y: placedRect.y, fill: paint.fill, halo: paint.halo, haloWidth: Math.max(2, paint.haloWidth * 0.85) })
    ctx.restore()
  }
}

const CSS_COLOR_WITH_ALPHA_RE = /^(?:rgba|hsla)\s*\(|^#[\da-f]{4}$|^#[\da-f]{8}$/i

export const resolveFlowGroupPaintVisibility = (args: {
  fill: string
  fillOpacity: number
  fontSizePx: number
  selected?: boolean
  strokeWidthPx: number
  zoom: number
}) => {
  const zoom = typeof args.zoom === 'number' && Number.isFinite(args.zoom) && args.zoom > 0 ? args.zoom : 1
  const fillOpacity = typeof args.fillOpacity === 'number' && Number.isFinite(args.fillOpacity)
    ? Math.max(0, Math.min(1, args.fillOpacity))
    : 1
  const fillOwnsAlpha = CSS_COLOR_WITH_ALPHA_RE.test(String(args.fill || '').trim())
  const selected = args.selected === true
  return {
    fillGlobalAlpha: selected ? Math.max(0.16, fillOpacity) : fillOwnsAlpha ? 1 : fillOpacity,
    fontSizePx: Math.max(Math.max(0, args.fontSizePx), (selected ? 13 : 11) / zoom),
    strokeWidthPx: Math.max(Math.max(0, args.strokeWidthPx), (selected ? 3 : 1.5) / zoom),
  }
}

const drawGroups = (
  rt: FlowNativeRuntime,
  groupAabbById: Map<string, FlowGroupAabb> | null,
  selectedGroupId: string,
) => {
  const cfg = rt.presentation.groups
  if (!cfg.enabled) return
  const scene = rt.scene
  if (!scene?.groups || scene.groups.length === 0) return
  const ctx = rt.ctx

  const stroke = rt.theme.edge
  const fill = rt.theme.edge
  const baseStrokeWidth = Math.max(0, cfg.strokeWidthPx)
  const baseFillOpacity = Math.max(0, Math.min(1, cfg.fillOpacity))
  const padding = Math.max(0, cfg.paddingPx)
  const topExtra = Math.max(0, cfg.labelTopExtraPx)
  const radius = Math.max(0, cfg.cornerRadiusPx)

  const groups = scene.groups
  let maxDepth = 0
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i]
    const depth = typeof g.depth === 'number' && Number.isFinite(g.depth) ? Math.max(0, Math.floor(g.depth)) : 0
    maxDepth = Math.max(maxDepth, depth)
  }
  const depthCfg = cfg.depthStyle
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i]
    const memberIds = Array.isArray(g.memberNodeIds) ? g.memberNodeIds : []
    if (memberIds.length === 0) continue

    const aabb = (groupAabbById ? groupAabbById.get(g.id) || null : null) || computeFlowGroupAabb({ scene, group: g, paddingPx: padding, labelTopExtraPx: topExtra })
    if (!aabb) continue

    const minX = aabb.minX
    const minY = aabb.minY
    const maxX = aabb.maxX
    const maxY = aabb.maxY
    const geoPoints: Point2d[] = []

    for (let j = 0; j < memberIds.length; j += 1) {
      const id = String(memberIds[j] || '').trim()
      if (!id) continue
      const n = scene.nodeById.get(id)
      if (!n) continue
      const x0 = n.x - padding
      const y0 = n.y - padding
      const x1 = n.x + n.width + padding
      const y1 = n.y + n.height + padding
      geoPoints.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 })
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) continue
    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)

    const gStroke = resolveColor(rt, g.style?.stroke, stroke)
    const selected = String(g.id || '') === selectedGroupId
    const gFill = selected ? gStroke : resolveColor(rt, g.style?.fill, fill)
    const depth = typeof g.depth === 'number' && Number.isFinite(g.depth) ? Math.max(0, Math.floor(g.depth)) : 0
    const depthStyle = computeGroupDepthStyle({
      depth,
      maxDepth,
      baseStrokeWidthPx: baseStrokeWidth,
      baseFillOpacity,
      config: depthCfg,
    })
    const gStrokeWidth =
      typeof g.style?.strokeWidth === 'number' && Number.isFinite(g.style.strokeWidth) ? Math.max(0, g.style.strokeWidth) : depthStyle.strokeWidthPx
    const groupPaintVisibility = resolveFlowGroupPaintVisibility({
      fill: gFill,
      fillOpacity: depthStyle.fillOpacity,
      fontSizePx: Math.max(10, rt.presentation.labels?.groupFontSizePx ?? 12),
      selected,
      strokeWidthPx: gStrokeWidth,
      zoom: rt.transform.k,
    })

    ctx.save()
    ctx.globalAlpha = groupPaintVisibility.fillGlobalAlpha
    ctx.fillStyle = gFill
    ctx.strokeStyle = gStroke
    ctx.lineWidth = groupPaintVisibility.strokeWidthPx

    if (cfg.shape === 'geo' && geoPoints.length >= 3) {
      const ring = computeConvexRing(geoPoints)
      if (ring.length >= 3) {
        ctx.beginPath()
        ctx.moveTo(ring[0].x, ring[0].y)
        for (let k = 1; k < ring.length; k += 1) ctx.lineTo(ring[k].x, ring[k].y)
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.stroke()
      }
    } else {
      ctx.beginPath()
      roundRectPath(ctx, minX, minY, w, h, radius)
      ctx.closePath()
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.stroke()
    }

    ctx.restore()

    const label = String(g.label || '').trim()
    if (label) {
      ctx.save()
      const paint = readLabelPaint(rt)
      const fontSizePx = groupPaintVisibility.fontSizePx
      ctx.font = `600 ${fontSizePx}px ${rt.fontFamily}`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      const maxChars = estimateMaxCharsForWidthPx(Math.max(0, w - 20), fontSizePx)
      const clipped = truncateTextWithEllipsis(label, maxChars)
      drawTextHalo(ctx, { text: clipped, x: minX + 10, y: minY + 8, fill: paint.fill, halo: paint.halo, haloWidth: paint.haloWidth })
      ctx.restore()
    }
  }
}

export type FlowNativeDrawArgs = {
  selectedNodeIds: string[]
  selectedEdgeIds: string[]
  edgeFocusActive?: boolean
  focusedEdgeIds?: string[]
  selectedGroupId?: string | null
  showGroupResizeHandle?: boolean
  hideNodeIds?: string[]
  hidePortHandleNodeIds?: string[]
  grid?: { enabled: boolean; size: number; sizeX?: number; sizeY?: number; variant?: 'lines' | 'dots'; majorEvery?: number; dotRadiusPx?: number } | null
  storyboardWidgetOpenNodeIds?: string[]
  storyboardWidgetPinnedByNodeId?: Record<string, boolean>
  storyboardWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }>
}

const drawGroupResizeHandleOverlay = (rt: FlowNativeRuntime, args: { groupAabbById: Map<string, FlowGroupAabb> | null; selectedGroupId: string; enabled: boolean }) => {
  if (!args.enabled) return
  const id = String(args.selectedGroupId || '').trim()
  if (!id) return
  const scene = rt.scene
  if (!scene?.groups || scene.groups.length === 0) return
  const selectedGroup = scene.groups.find(group => String(group.id || '').trim() === id) || null
  if (selectedGroup?.autoBounds === true) return
  const aabb = (args.groupAabbById ? args.groupAabbById.get(id) || null : null) || null
  if (!aabb) return
  const ctx = rt.ctx
  const k = typeof rt.transform?.k === 'number' && Number.isFinite(rt.transform.k) && rt.transform.k > 0 ? rt.transform.k : 1
  const cfg = rt.presentation.groups.resizeHandle || readGroupResizeHandleConfig(null)
  const w = Math.max(1, aabb.maxX - aabb.minX)
  const h = Math.max(1, aabb.maxY - aabb.minY)
  const effective = computeDynamicGroupResizeHandlePx({
    dotRadiusPx: cfg.dotRadiusPx,
    hitRadiusPx: cfg.hitRadiusPx,
    strokeWidthPx: cfg.strokeWidthPx,
    groupWidth: w,
    groupHeight: h,
  })
  const rWorld = pxToWorld(effective.dotRadiusPx, k)
  const strokeWorld = pxToWorld(effective.strokeWidthPx, k)
  const cx = aabb.maxX
  const cy = aabb.maxY
  ctx.save()
  ctx.globalAlpha = 0.98
  ctx.fillStyle = rt.theme.bg
  ctx.strokeStyle = rt.theme.edgeSelected
  ctx.lineWidth = strokeWorld
  ctx.beginPath()
  ctx.arc(cx, cy, rWorld, 0, Math.PI * 2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

export const drawFlowNative = (rt: FlowNativeRuntime, args: FlowNativeDrawArgs) => {
  refreshFlowNativeCss(rt)
  if (!rt.dirty) return
  rt.dirty = false
  clearCanvas(rt)

  const ctx = rt.ctx
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = rt.theme.bg
  ctx.fillRect(0, 0, rt.canvas.width, rt.canvas.height)

  applyDprAndWorldTransform(rt)

  const grid = args.grid
  if (grid && grid.enabled === true) {
    const fallbacks = readCanvasGridStrokeFallbacks()
    const minorStroke = (typeof (grid as any).minorStroke === 'string' && String((grid as any).minorStroke).trim() !== '')
      ? String((grid as any).minorStroke).trim()
      : resolveCssVarCached(rt, '--kg-canvas-grid-minor', fallbacks.minor)
    const majorStroke = (typeof (grid as any).majorStroke === 'string' && String((grid as any).majorStroke).trim() !== '')
      ? String((grid as any).majorStroke).trim()
      : resolveCssVarCached(rt, '--kg-canvas-grid-major', fallbacks.major)
    drawInfiniteGridInWorldContext(rt.ctx, {
      enabled: true,
      viewportW: rt.viewportW,
      viewportH: rt.viewportH,
      dpr: rt.dpr,
      transform: { k: rt.transform.k, x: rt.transform.x, y: rt.transform.y },
      gridSize: (grid as any).sizeX || grid.size,
      gridSizeY: (grid as any).sizeY,
      anchor: (grid as any).anchor,
      lockToBaseStep: (grid as any).lockToBaseStep,
      paint: {
        minorStroke,
        majorStroke,
        minorAlpha: (grid as any).minorAlpha,
        majorAlpha: (grid as any).majorAlpha,
        minorWidthPx: (grid as any).minorWidthPx,
        majorWidthPx: (grid as any).majorWidthPx,
        variant: grid.variant,
        majorEvery: grid.majorEvery,
        dotRadiusPx: grid.dotRadiusPx,
      },
    })
  }

  const scene = rt.scene
  if (!scene) return
  const idCache = rt.idSetCache
  const selectedNodeIds = (() => {
    const ids = Array.isArray(args.selectedNodeIds) ? args.selectedNodeIds : []
    if (idCache.selectedNodeIdsRef === ids) return idCache.selectedNodeIds
    idCache.selectedNodeIdsRef = ids
    idCache.selectedNodeIds.clear()
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] || '').trim()
      if (id) idCache.selectedNodeIds.add(id)
    }
    return idCache.selectedNodeIds
  })()
  const selectedEdgeIds = (() => {
    const ids = Array.isArray(args.selectedEdgeIds) ? args.selectedEdgeIds : []
    if (idCache.selectedEdgeIdsRef === ids) return idCache.selectedEdgeIds
    idCache.selectedEdgeIdsRef = ids
    idCache.selectedEdgeIds.clear()
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] || '').trim()
      if (id) idCache.selectedEdgeIds.add(id)
    }
    return idCache.selectedEdgeIds
  })()
  const focusedEdgeIds = (() => {
    const ids = Array.isArray(args.focusedEdgeIds) ? args.focusedEdgeIds : []
    if (idCache.focusedEdgeIdsRef === ids) return idCache.focusedEdgeIds
    idCache.focusedEdgeIdsRef = ids
    idCache.focusedEdgeIds.clear()
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] || '').trim()
      if (id) idCache.focusedEdgeIds.add(id)
    }
    return idCache.focusedEdgeIds
  })()
  const edgeFocusActive = args.edgeFocusActive === true
  const hiddenNodeIds = (() => {
    const ids = Array.isArray(args.hideNodeIds) ? args.hideNodeIds : []
    if (idCache.hideNodeIdsRef === ids) return idCache.hideNodeIds
    idCache.hideNodeIdsRef = ids
    idCache.hideNodeIds.clear()
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] || '').trim()
      if (id) idCache.hideNodeIds.add(id)
    }
    return idCache.hideNodeIds
  })()
  const hiddenPortHandleNodeIds = (() => {
    const ids = Array.isArray(args.hidePortHandleNodeIds) ? args.hidePortHandleNodeIds : []
    if (idCache.hidePortHandleNodeIdsRef === ids) return idCache.hidePortHandleNodeIds
    idCache.hidePortHandleNodeIdsRef = ids
    idCache.hidePortHandleNodeIds.clear()
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] || '').trim()
      if (id) idCache.hidePortHandleNodeIds.add(id)
    }
    return idCache.hidePortHandleNodeIds
  })()
  const selectedGroupId = String(args.selectedGroupId || '').trim()
  const showGroupResizeHandle = args.showGroupResizeHandle === true
  const widgetOverlayAabbByNodeId = (() => {
    const openIds = Array.isArray(args.storyboardWidgetOpenNodeIds) ? args.storyboardWidgetOpenNodeIds : []
    if (openIds.length === 0) return null
    const pinnedByNodeId = args.storyboardWidgetPinnedByNodeId || {}
    const worldPosByNodeId = args.storyboardWidgetWorldPosByNodeId || {}
    const zoomK = typeof rt.transform?.k === 'number' && Number.isFinite(rt.transform.k) && rt.transform.k > 0 ? rt.transform.k : 1
    const panelScale = computeWidgetScale(zoomK, null, { mode: 'pinnedInCanvas' })
    const panelScreen = computeWidgetScaledSize(panelScale)
    const panelWorldW = panelScreen.width / Math.max(0.001, zoomK)
    const panelWorldH = panelScreen.height / Math.max(0.001, zoomK)
    const out: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {}
    for (let i = 0; i < openIds.length; i += 1) {
      const id = String(openIds[i] || '').trim()
      if (!id) continue
      const pinnedRaw = pinnedByNodeId[id]
      const pinned = typeof pinnedRaw === 'boolean' ? pinnedRaw : true
      if (!pinned) continue
      const world = worldPosByNodeId[id]
      if (!world || !Number.isFinite(world.x) || !Number.isFinite(world.y)) continue
      out[id] = { minX: world.x, minY: world.y, maxX: world.x + panelWorldW, maxY: world.y + panelWorldH }
    }
    return Object.keys(out).length > 0 ? out : null
  })()

  const groupAabbById = (() => {
    const gCfg = rt.presentation.groups
    if (!gCfg.enabled) return null
    if (!scene.groups || scene.groups.length === 0) return null
    const padding = Math.max(0, gCfg.paddingPx)
    const topExtra = Math.max(0, gCfg.labelTopExtraPx)
    const m = rt.groupAabbByIdCache
    m.clear()
    for (let i = 0; i < scene.groups.length; i += 1) {
      const g = scene.groups[i]
      const aabb = computeFlowGroupAabb({
        scene,
        group: g,
        paddingPx: padding,
        labelTopExtraPx: topExtra,
        overlayAabbByNodeId: widgetOverlayAabbByNodeId,
      })
      if (!aabb) continue
      m.set(g.id, aabb)
    }
    return m
  })()

  drawGroups(rt, groupAabbById, selectedGroupId)

  const normalEdges: FlowNativeEdge[] = []
  const overlayEdges: FlowNativeEdge[] = []
  for (let i = 0; i < scene.edges.length; i += 1) {
    const e = scene.edges[i]
    if ((e as unknown as { drawAboveNodes?: unknown }).drawAboveNodes === true) overlayEdges.push(e)
    else normalEdges.push(e)
  }

  const routingObstacles = (() => {
    const routingCfg = rt.presentation.edges.routing
    const useOrtho = routingCfg.enabled && routingCfg.mode === 'ortho'
    const useObstacles = useOrtho && routingCfg.obstacleAvoidance
    return useObstacles ? buildRoutingObstacles(rt, scene, groupAabbById) : null
  })()

  for (let i = 0; i < normalEdges.length; i += 1) {
    const e = normalEdges[i]
    const s = scene.nodeById.get(e.source)
    const t = scene.nodeById.get(e.target)
    if (!s || !t) continue
    if (hiddenNodeIds.has(s.id) || hiddenNodeIds.has(t.id)) continue
    drawEdge(rt, e, { selected: selectedEdgeIds.has(e.id), dimmed: edgeFocusActive && !focusedEdgeIds.has(e.id), source: s, target: t, routingObstacles })
  }

  fadeEdgesUnderGeometry(rt, groupAabbById)

  for (let i = 0; i < scene.nodes.length; i += 1) {
    const n = scene.nodes[i]
    if (hiddenNodeIds.has(n.id)) {
      if (!hiddenPortHandleNodeIds.has(n.id)) drawPortHandles(rt, n)
      continue
    }
    drawNode(rt, n, { selected: selectedNodeIds.has(n.id) })
    if (!hiddenPortHandleNodeIds.has(n.id)) drawPortHandles(rt, n)
  }

  for (let i = 0; i < overlayEdges.length; i += 1) {
    const e = overlayEdges[i]
    const s = scene.nodeById.get(e.source)
    const t = scene.nodeById.get(e.target)
    if (!s || !t) continue
    if (hiddenNodeIds.has(s.id) || hiddenNodeIds.has(t.id)) continue
    drawEdge(rt, e, { selected: selectedEdgeIds.has(e.id), dimmed: edgeFocusActive && !focusedEdgeIds.has(e.id), source: s, target: t, routingObstacles })
  }
  drawEdgeLabels(rt, { selectedEdgeIds, edgeFocusActive, focusedEdgeIds, routingObstacles, groupAabbById, hiddenNodeIds })

  if (selectedGroupId) drawGroupResizeHandleOverlay(rt, { groupAabbById, selectedGroupId, enabled: showGroupResizeHandle })
}

export const requestFlowNativeDraw = (
  rt: FlowNativeRuntime,
  args: FlowNativeDrawArgs,
) => {
  if (rt.pendingRaf != null) return
  rt.pendingRaf = requestAnimationFrame(() => {
    rt.pendingRaf = null
    drawFlowNative(rt, args)
  })
}
