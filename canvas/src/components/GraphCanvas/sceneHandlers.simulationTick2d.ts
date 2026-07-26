import * as d3 from 'd3'
import type { MutableRefObject } from 'react'
import type { GraphNode, GraphEdge } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import type { EdgeWithRuntime } from '@/components/GraphCanvas/utils'
import { getRenderNodeRadius2d } from '@/components/GraphCanvas/helpers'
import { getPortHandlePosition, getPortHandlesConfig, type PortHandleDatum } from '@/components/GraphCanvas/portHandles'
import { getFlowPortHandlePosition2d, type FlowPortHandleDatum2d } from '@/components/GraphCanvas/flowPortHandles2d'
import { getNodeRectDimensions2d, getNodeRenderShape2d } from '@/components/GraphCanvas/nodeSizing2d'
import { buildNodeShapePathD } from '@/components/GraphCanvas/shapePaths2d'
import { buildChevronPathD } from '@/components/GraphCanvas/layers/svgChevron'
import { getEdgeEndpointFromPorts } from '@/components/GraphCanvas/portHandles'
import { computeOverlayHalfExtentsWorld, readOverlaySizingConfigForDensity, type OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'
import { readLabelPresentation2d } from '@/lib/canvas/labelPresentation2d'
import { computeIdealSpacing2d, computeMaxSpeed2d, readPhysics2dTuning } from '@/lib/graph/physics2dTuning'
import { buildCanonicalNodeLookup, getCanonicalNodeLookupValue } from '@/lib/graph/canonicalNodeIds'
import { applyStrictOverlapRelax2d, type StrictOverlapState2d } from '@/components/GraphCanvas/sceneHandlers.simulationTick2d.strictOverlap'
import { renderLabels2d, type LabelRelaxState2d } from '@/components/GraphCanvas/sceneHandlers.simulationTick2d.labels'
import { buildEdgePathD, readEdgePathCurveOptions, readEffectiveEdgeTypeFor2dRenderer, type GlobalEdgeType } from '@/lib/graph/edgeTypes'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { readRadarForceConfig } from '@/lib/graph/radarForces'
import { readEdgeMarkerPresentation } from '@/lib/graph/edgeMarkers'

type OrbitMode = 'flat' | 'solar' | 'atomic'

type OrbitConfig = {
  enabled: boolean
  mode: OrbitMode
  speedDeg: number
  orbitSize: number
  ringGapPx: number
  depthSpeedScale: number
}

const ORBIT_PARENT_EDGE_LABELS = new Set([
  'hasSection',
  'hasBlock',
  'hasItem',
  'hasMermaidNode',
  'hasMermaidSubgraph',
  'embedsImage',
  'embedsMedia',
  'mentions',
])

const readRadialOrbitConfig = (schema: GraphSchema): OrbitConfig => {
  const f = (schema.layout?.forces || {}) as Record<string, unknown>
  const modeRaw = typeof f.radialOrbitMode === 'string' ? f.radialOrbitMode : 'flat'
  const mode: OrbitMode = modeRaw === 'solar' || modeRaw === 'atomic' ? modeRaw : 'flat'
  const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : fallback
  }
  return {
    enabled: f.radialOrbitEnabled !== false,
    mode,
    speedDeg: Math.max(0, Math.min(120, num(f.radialOrbitSpeedDeg, 18))),
    orbitSize: Math.max(1.2, Math.min(8, num(f.radialOrbitSize, 2.95))),
    ringGapPx: Math.max(12, Math.min(360, num(f.radialOrbitRingGapPx, 58))),
    depthSpeedScale: Math.max(0, Math.min(1.2, num(f.radialOrbitDepthSpeedScale, 0.12))),
  }
}

export const attachSimulationTick = (args: {
  svgEl: SVGSVGElement
  simulation: d3.Simulation<GraphNode, GraphEdge>
  nodeSelRef: MutableRefObject<d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null>
  groupChevronSelRef: MutableRefObject<d3.Selection<SVGPathElement, GraphNode, SVGGElement, unknown> | null>
  mediaSelRef: MutableRefObject<d3.Selection<SVGGraphicsElement, GraphNode, SVGGElement, unknown> | null>
  portHandlesSelRef: MutableRefObject<
    d3.Selection<SVGCircleElement, PortHandleDatum | FlowPortHandleDatum2d, SVGGElement, unknown> | null
  >
  linkHitSelRef: MutableRefObject<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>
  linkSelRef: MutableRefObject<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>
  edgeLabelSel?: d3.Selection<SVGTextElement, GraphEdge, SVGGElement, unknown> | null
  labelsSelRef: MutableRefObject<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>
  nodes: GraphNode[]
  edges: GraphEdge[]
  nodeById?: Map<string, GraphNode> | null
  groupsForBboxCollide?: GraphGroup[]
  getSchema: () => GraphSchema
  documentSemanticMode?: 'document' | 'keyword'
  frontmatterModeEnabled?: boolean
  multiDimTableModeEnabled?: boolean
  canvas2dRenderer?: string
  width: number
  height: number
  panelOnlyNodeIdSet?: Set<string> | null
  mediaOverlayNodeIdSet?: Set<string> | null
  mediaPanelDensity?: 'default' | 'compact'
  overlaySizing?: OverlayDensitySizingConfigInput | null
  beforeRenderFrameRef?: MutableRefObject<(() => void) | null>
  afterRenderFrame?: (args: { alpha: number; tick: number }) => void
}) => {
  const {
    svgEl,
    simulation,
    nodeSelRef,
    groupChevronSelRef,
    mediaSelRef,
    portHandlesSelRef,
    linkHitSelRef,
    linkSelRef,
    edgeLabelSel,
    labelsSelRef,
    nodes,
    edges,
    getSchema,
    width,
    height,
    panelOnlyNodeIdSet,
    mediaOverlayNodeIdSet,
    mediaPanelDensity,
    overlaySizing,
    beforeRenderFrameRef,
    afterRenderFrame,
  } = args

  const nodeById = args.nodeById || new Map<string, GraphNode>()
  const groupsForBboxCollide = Array.isArray(args.groupsForBboxCollide) ? args.groupsForBboxCollide : []
  const nodeLookup = buildCanonicalNodeLookup(nodeById.entries())

  let lastOverlayHalfExtentsKey = ''
  let lastOverlayHalfExtents: { halfW: number; halfH: number } | null = null
  let lastSchema: GraphSchema | null = null
  const nodeMetricsCache = new Map<string, { width: number; height: number; r: number; key: string }>()
  const labelRelaxState: LabelRelaxState2d = {
    groupLabelNudgeById: new Map<string, { dx: number; dy: number }>(),
    lastLabelRelaxMode: 'wrap',
    lastLabelRelaxTick: -1,
  }
  const strictOverlapState: StrictOverlapState2d = { lastStrictOverlapTick: -1, cache: null }
  const orbitStateById = new Map<string, { parentId: string | null; angle: number; radius: number; depth: number; ring: number }>()
  let lastOrbitFrameAt = 0
  const svgAttrCache = new WeakMap<Element, Record<string, string>>()

  const setSvgAttrIfChanged = (el: Element, name: string, value: string): void => {
    let attrState = svgAttrCache.get(el)
    if (!attrState) {
      attrState = {}
      svgAttrCache.set(el, attrState)
    }
    if (attrState[name] === value) return
    el.setAttribute(name, value)
    attrState[name] = value
  }

  const applyRadialOrbitAnimation = (schema: GraphSchema): boolean => {
    const layoutMode = String(schema.layout?.mode || 'radial')
    if (layoutMode !== 'radial') return false
    const renderer = String(args.canvas2dRenderer || '').trim()
    if (renderer !== 'd3') return false
    const semanticMode = String(args.documentSemanticMode || 'document')
    const semanticAllowed =
      args.frontmatterModeEnabled === true ||
      args.multiDimTableModeEnabled === true ||
      semanticMode === 'document' ||
      semanticMode === 'keyword'
    if (!semanticAllowed) return false
    const hasFlowchartNodes = (() => {
      for (let i = 0; i < nodes.length; i += 1) {
        const props = (nodes[i].properties || {}) as Record<string, unknown>
        if (typeof props['flowchart:side'] === 'string' || props['flowchart:hub'] === true) return true
      }
      return false
    })()
    if (hasFlowchartNodes) return false
    const cfg = readRadialOrbitConfig(schema)
    if (!cfg.enabled || nodes.length < 2) return false
    const now = Date.now()
    const dt = lastOrbitFrameAt > 0 ? Math.max(0.001, Math.min(0.05, (now - lastOrbitFrameAt) / 1000)) : 1 / 60
    lastOrbitFrameAt = now
    const nodeMap = nodeById
    const parentByChild = new Map<string, string>()
    const roots: GraphNode[] = []
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const props = (n.properties || {}) as Record<string, unknown>
      const parentRaw = props['visual:parentId']
      const parentId = typeof parentRaw === 'string' || typeof parentRaw === 'number' ? String(parentRaw).trim() : ''
      if (parentId && parentId !== String(n.id) && nodeMap.has(parentId)) parentByChild.set(String(n.id), parentId)
    }
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]
      const label = String(e.label || '').trim()
      const props = ((e as unknown as { properties?: unknown }).properties || {}) as Record<string, unknown>
      const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(e)
      if (!sourceId || !targetId || sourceId === targetId) continue
      if (label === 'spokeTo' || props['kg:radarSpoke'] === true || props['flowchart:spoke'] === true) {
        const sourceNode = nodeMap.get(sourceId)
        const targetNode = nodeMap.get(targetId)
        const sourceHub = sourceNode && (((sourceNode.properties || {}) as Record<string, unknown>)['kg:radarHub'] === true || ((sourceNode.properties || {}) as Record<string, unknown>)['flowchart:hub'] === true)
        const targetHub = targetNode && (((targetNode.properties || {}) as Record<string, unknown>)['kg:radarHub'] === true || ((targetNode.properties || {}) as Record<string, unknown>)['flowchart:hub'] === true)
        const hubId = sourceHub ? sourceId : targetHub ? targetId : ''
        const nodeId = hubId === sourceId ? targetId : hubId === targetId ? sourceId : ''
        if (hubId && nodeId && !parentByChild.has(nodeId)) parentByChild.set(nodeId, hubId)
        continue
      }
      if (ORBIT_PARENT_EDGE_LABELS.has(label) && !parentByChild.has(targetId)) parentByChild.set(targetId, sourceId)
    }
    const childrenByParent = new Map<string, GraphNode[]>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const id = String(n.id)
      const parentId = parentByChild.get(id)
      if (!parentId || !nodeMap.has(parentId)) {
        roots.push(n)
        continue
      }
      const arr = childrenByParent.get(parentId) || []
      arr.push(n)
      childrenByParent.set(parentId, arr)
    }
    const depthById = new Map<string, number>()
    const depthOf = (id: string): number => {
      const cached = depthById.get(id)
      if (typeof cached === 'number') return cached
      const parent = parentByChild.get(id)
      if (!parent) {
        depthById.set(id, 0)
        return 0
      }
      const d = Math.min(12, depthOf(parent) + 1)
      depthById.set(id, d)
      return d
    }
    for (let i = 0; i < nodes.length; i += 1) depthOf(String(nodes[i].id))
    const centerX = width * 0.5
    const centerY = height * 0.5
    const rootRadius = Math.max(24, Math.min(width, height) * 0.34)
    const ringFromIndex = (idx: number, total: number): { ring: number; slot: number; ringSize: number } => {
      if (cfg.mode === 'solar') return { ring: idx, slot: 0, ringSize: 1 }
      if (cfg.mode === 'atomic') {
        if (idx < 2) return { ring: 0, slot: idx, ringSize: 2 }
        const rest = idx - 2
        return { ring: 1 + Math.floor(rest / 8), slot: rest % 8, ringSize: 8 }
      }
      return { ring: 0, slot: idx, ringSize: Math.max(1, total) }
    }
    const speedBase = (cfg.speedDeg * Math.PI) / 180
    for (let i = 0; i < roots.length; i += 1) {
      const n = roots[i]
      const id = String(n.id)
      const fx = (n as unknown as { fx?: unknown }).fx
      const fy = (n as unknown as { fy?: unknown }).fy
      if (typeof fx === 'number' && Number.isFinite(fx) && typeof fy === 'number' && Number.isFinite(fy)) continue
      const state = orbitStateById.get(id)
      const x = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : centerX
      const y = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : centerY
      const startAngle = Math.atan2(y - centerY, x - centerX)
      const angle = (state?.angle ?? startAngle) + dt * speedBase * 0.18
      orbitStateById.set(id, { parentId: null, angle, radius: rootRadius, depth: 0, ring: 0 })
      n.x = centerX + Math.cos(angle) * rootRadius
      n.y = centerY + Math.sin(angle) * rootRadius
      ;(n as unknown as { vx?: number }).vx = 0
      ;(n as unknown as { vy?: number }).vy = 0
    }
    for (const [parentId, kidsRaw] of childrenByParent) {
      const parent = nodeMap.get(parentId)
      if (!parent) continue
      const px = typeof parent.x === 'number' && Number.isFinite(parent.x) ? parent.x : centerX
      const py = typeof parent.y === 'number' && Number.isFinite(parent.y) ? parent.y : centerY
      const kids = [...kidsRaw].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      for (let k = 0; k < kids.length; k += 1) {
        const n = kids[k]
        const id = String(n.id)
        const fx = (n as unknown as { fx?: unknown }).fx
        const fy = (n as unknown as { fy?: unknown }).fy
        if (typeof fx === 'number' && Number.isFinite(fx) && typeof fy === 'number' && Number.isFinite(fy)) continue
        const depth = depthById.get(id) ?? 1
        const ring = ringFromIndex(k, kids.length)
        const shellR = Math.max(10, rootRadius / Math.max(1.2, Math.pow(cfg.orbitSize, Math.max(1, depth))))
        const targetR = Math.max(10, shellR + ring.ring * cfg.ringGapPx)
        const state = orbitStateById.get(id)
        const dx = (typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : px) - px
        const dy = (typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : py) - py
        const startAngle = Math.atan2(dy, dx)
        const rev = 1 + depth * cfg.depthSpeedScale
        const dir = ring.ring % 2 === 0 ? 1 : -1
        const slotShift = ring.ringSize > 1 ? (Math.PI * 2 * ring.slot) / ring.ringSize : 0
        const angle = (state?.angle ?? startAngle + slotShift) + dt * speedBase * rev * dir
        const radiusPrev = state?.radius ?? Math.max(8, Math.sqrt(dx * dx + dy * dy))
        const radius = radiusPrev + (targetR - radiusPrev) * Math.min(1, dt * 7)
        orbitStateById.set(id, { parentId, angle, radius, depth, ring: ring.ring })
        n.x = px + Math.cos(angle) * radius
        n.y = py + Math.sin(angle) * radius
        ;(n as unknown as { vx?: number }).vx = 0
        ;(n as unknown as { vy?: number }).vy = 0
      }
    }
    return true
  }

  const idealSpacing = computeIdealSpacing2d({ width, height, nodeCount: nodes.length })
  let physicsTuning = readPhysics2dTuning(getSchema())
  let physicsTick = 0

  const applyMotionLimits = () => {
    physicsTick += 1
    if ((physicsTick & 1) !== 0) return
    const alpha = simulation.alpha()
    if (!(alpha > 0.0005)) return
    const maxSpeed = computeMaxSpeed2d({ idealSpacing, alpha, tuning: physicsTuning })

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i] as unknown as { vx?: unknown; vy?: unknown; fx?: unknown; fy?: unknown }
      const hasFx = typeof n.fx === 'number' && Number.isFinite(n.fx as number)
      const hasFy = typeof n.fy === 'number' && Number.isFinite(n.fy as number)
      if (hasFx || hasFy) {
        ;(n as unknown as { vx: number }).vx = 0
        ;(n as unknown as { vy: number }).vy = 0
        continue
      }
      const vx = typeof n.vx === 'number' && Number.isFinite(n.vx) ? n.vx : 0
      const vy = typeof n.vy === 'number' && Number.isFinite(n.vy) ? n.vy : 0
      const s = Math.sqrt(vx * vx + vy * vy)
      if (!(s > maxSpeed)) continue
      const inv = maxSpeed / s
      ;(n as unknown as { vx: number }).vx = vx * inv
      ;(n as unknown as { vy: number }).vy = vy * inv
    }
  }

  const resolveNode = (endpoint: unknown): GraphNode | null => {
    if (endpoint && typeof endpoint === 'object') {
      const maybeNode = endpoint as Partial<GraphNode>
      if (typeof maybeNode.x === 'number' && typeof maybeNode.y === 'number') return maybeNode as GraphNode
      const maybeId = (endpoint as { id?: unknown }).id
      if (typeof maybeId === 'string' || typeof maybeId === 'number') {
        return getCanonicalNodeLookupValue(nodeLookup, maybeId)
      }
    }
    if (typeof endpoint === 'string' || typeof endpoint === 'number') {
      return getCanonicalNodeLookupValue(nodeLookup, endpoint)
    }
    return null
  }

  const getNodeMetrics = (d: GraphNode, schema: GraphSchema): { width: number; height: number; r: number } => {
    const id = String(d.id)
    const props = (d.properties || {}) as Record<string, unknown>
    const key = [
      getNodeRenderShape2d(d, schema),
      String(props['visual:width'] ?? ''),
      String(props['visual:height'] ?? ''),
      String(props['visual:nodeSize'] ?? ''),
    ].join('|')
    const cached = nodeMetricsCache.get(id)
    if (cached && cached.key === key) return cached
    const { width, height } = getNodeRectDimensions2d(d, schema)
    const r0 = getRenderNodeRadius2d(d, schema)
    const r = typeof r0 === 'number' && Number.isFinite(r0) && r0 > 0 ? r0 : 10
    const next = { width, height, r, key }
    nodeMetricsCache.set(id, next)
    return next
  }

  let tick = 0
  let orbitFrameActive = false
  const renderFrame = () => {
    tick += 1
    const beforeRenderFrame = beforeRenderFrameRef ? beforeRenderFrameRef.current : null
    if (beforeRenderFrame) beforeRenderFrame()

    const schema = getSchema()
    if (schema !== lastSchema) {
      nodeMetricsCache.clear()
      strictOverlapState.cache = null
      lastSchema = schema
      physicsTuning = readPhysics2dTuning(schema)
    }
    orbitFrameActive = applyRadialOrbitAnimation(schema)

    const portHandlesCfg = getPortHandlesConfig(schema)
    const portHandlesEnabled = portHandlesCfg.enabled
    const baseDxFallback = schema.labelStyles?.offset?.dx ?? 12
    const baseDyFallback = schema.labelStyles?.offset?.dy ?? 4
    const labelFontSize = readLabelPresentation2d({ schema, documentSemanticMode: args.documentSemanticMode }).nodeFontSizePx
    const labelRelaxCfg = schema.performance?.labelRelax || {}
    const maxNodesForRelaxRaw = (labelRelaxCfg as { maxNodesForRelax?: number }).maxNodesForRelax
    const maxNodesForRelax = (() => {
      if (typeof maxNodesForRelaxRaw !== 'number' || !Number.isFinite(maxNodesForRelaxRaw)) return 3600
      const v = Math.floor(maxNodesForRelaxRaw)
      if (v <= 0) return 0
      return Math.min(8000, v)
    })()
    const maxNodeLabelsRaw = (labelRelaxCfg as { maxNodeLabels?: number }).maxNodeLabels
    const maxNodeLabels = (() => {
      if (typeof maxNodeLabelsRaw !== 'number' || !Number.isFinite(maxNodeLabelsRaw)) return 420
      const v = Math.floor(maxNodeLabelsRaw)
      if (v <= 0) return 0
      return Math.min(1200, v)
    })()
    const zoomK = (() => {
      const t = d3.zoomTransform(svgEl)
      const k = typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0 ? t.k : 1
      return k
    })()
    const overlayHalfExtentsWorld = (() => {
      const hasSets =
        (panelOnlyNodeIdSet && panelOnlyNodeIdSet.size > 0) || (mediaOverlayNodeIdSet && mediaOverlayNodeIdSet.size > 0)
      if (!hasSets) return null
      const density: 'default' | 'compact' = mediaPanelDensity === 'compact' ? 'compact' : 'default'
      const cfg = readOverlaySizingConfigForDensity({ density, sizing: overlaySizing || null })
      const key = `${density}|${width}|${height}|${zoomK}|${cfg.widthRatio}|${cfg.widthMinPx}|${cfg.widthMaxPx}`
      if (key === lastOverlayHalfExtentsKey) return lastOverlayHalfExtents
      const out = computeOverlayHalfExtentsWorld({ density, viewportW: width, viewportH: height, zoomK, config: cfg })
      lastOverlayHalfExtentsKey = key
      lastOverlayHalfExtents = out
      return out
    })()
    const nodeMetricsFrameCache = new Map<GraphNode, { width: number; height: number; r: number }>()
    const getNodeMetricsForFrame = (d: GraphNode): { width: number; height: number; r: number } => {
      const cached = nodeMetricsFrameCache.get(d)
      if (cached) return cached
      const next = getNodeMetrics(d, schema)
      nodeMetricsFrameCache.set(d, next)
      return next
    }

    const isPanelNode = (n: GraphNode): boolean => {
      const id = String(n.id)
      if (panelOnlyNodeIdSet && panelOnlyNodeIdSet.has(id)) return true
      if (mediaOverlayNodeIdSet && mediaOverlayNodeIdSet.has(id)) return true
      return false
    }

    const pickEndpointRectOrCircle = (from: GraphNode, to: GraphNode, padOut: number): { x: number; y: number } => {
      const fx = typeof from.x === 'number' && Number.isFinite(from.x) ? from.x : 0
      const fy = typeof from.y === 'number' && Number.isFinite(from.y) ? from.y : 0
      const tx = typeof to.x === 'number' && Number.isFinite(to.x) ? to.x : fx
      const ty = typeof to.y === 'number' && Number.isFinite(to.y) ? to.y : fy
      const dx = tx - fx
      const dy = ty - fy
      if (dx === 0 && dy === 0) return { x: fx, y: fy }
      const norm = Math.sqrt(dx * dx + dy * dy) || 1
      const ux = dx / norm
      const uy = dy / norm

      if (isPanelNode(from) && overlayHalfExtentsWorld) {
        const halfW = overlayHalfExtentsWorld.halfW
        const halfH = overlayHalfExtentsWorld.halfH
        const absUx = Math.abs(ux)
        const absUy = Math.abs(uy)
        const txRect = absUx > 1e-6 ? halfW / absUx : Number.POSITIVE_INFINITY
        const tyRect = absUy > 1e-6 ? halfH / absUy : Number.POSITIVE_INFINITY
        const padOutWorld = Number.isFinite(padOut) ? padOut / zoomK : 0
        const dist = Math.max(0, Math.min(txRect, tyRect) + padOutWorld)
        return { x: fx + ux * dist, y: fy + uy * dist }
      }

      const shape = getNodeRenderShape2d(from, schema)
      if (shape === 'circle') {
        const r = getNodeMetricsForFrame(from).r
        const dist = Math.max(0, r + padOut)
        return { x: fx + ux * dist, y: fy + uy * dist }
      }
      const { width, height } = getNodeMetricsForFrame(from)
      const halfW = Math.max(1, width / 2)
      const halfH = Math.max(1, height / 2)
      const absUx = Math.abs(ux)
      const absUy = Math.abs(uy)
      const txRect = absUx > 1e-6 ? halfW / absUx : Number.POSITIVE_INFINITY
      const tyRect = absUy > 1e-6 ? halfH / absUy : Number.POSITIVE_INFINITY
      const dist = Math.max(0, Math.min(txRect, tyRect) + padOut)
      return { x: fx + ux * dist, y: fy + uy * dist }
    }

    const endpoint = (from: GraphNode, to: GraphNode, padOut: number): { x: number; y: number } => {
      if (!portHandlesEnabled) return pickEndpointRectOrCircle(from, to, padOut)
      if (isPanelNode(from)) return pickEndpointRectOrCircle(from, to, padOut)
      return getEdgeEndpointFromPorts({ from, to, schema })
    }
    const radarForceCfg = readRadarForceConfig(schema)
    const globalEdgeType = readEffectiveEdgeTypeFor2dRenderer({ schema, canvas2dRenderer: args.canvas2dRenderer })
    const edgeGeometryCache = new Map<GraphEdge, {
      p1: { x: number; y: number }
      p2: { x: number; y: number }
      cx: number
      cy: number
      c1x: number
      c1y: number
      c2x: number
      c2y: number
      tx: number
      ty: number
      curve: boolean
      arrow: boolean
      markerStart: boolean
      orbital: boolean
      arrowLength: number
      arrowHalfWidth: number
      edgeType: GlobalEdgeType
    }>()

    const readEdgePresentation = (
      d: GraphEdge,
    ): {
      curve: boolean
      bend: number
      phase: -1 | 1
      arrow: boolean
      markerStart: boolean
      orbitShift: number
      arrowLength: number
      arrowHalfWidth: number
      orbital: boolean
      edgeType: GlobalEdgeType
    } => {
      const props = d.properties && typeof d.properties === 'object' && !Array.isArray(d.properties)
        ? (d.properties as Record<string, unknown>)
        : null
      const curveOptions = readEdgePathCurveOptions(d, schema)
      const curveMode = String(props?.['visual:curve'] || '').trim().toLowerCase()
      const curve = curveMode === 'quadratic' || props?.['kg:radarFlow'] === true
      const interpolator = String(props?.['visual:curveInterpolator'] || '').trim().toLowerCase()
      const orbital = curve && (interpolator === 'orbital' || props?.['kg:radarFlow'] === true)
      const bend = curveOptions ? curveOptions.bend : radarForceCfg.flowCurveBend
      const orbitShift = curveOptions ? curveOptions.orbitShift : radarForceCfg.flowOrbitShift
      const arrowLenRaw = props?.['visual:arrowLengthPx']
      const arrowLenN = typeof arrowLenRaw === 'number' ? arrowLenRaw : typeof arrowLenRaw === 'string' ? Number(arrowLenRaw) : NaN
      const arrowLength = Number.isFinite(arrowLenN)
        ? Math.max(4, Math.min(30, arrowLenN))
        : radarForceCfg.flowArrowLengthPx
      const arrowHalfRaw = props?.['visual:arrowHalfWidthPx']
      const arrowHalfN = typeof arrowHalfRaw === 'number' ? arrowHalfRaw : typeof arrowHalfRaw === 'string' ? Number(arrowHalfRaw) : NaN
      const arrowHalfWidth = Number.isFinite(arrowHalfN)
        ? Math.max(2, Math.min(14, arrowHalfN))
        : radarForceCfg.flowArrowHalfWidthPx
      const edgeMarkers = readEdgeMarkerPresentation(d, schema)
      const arrow = edgeMarkers.end !== 'none' || props?.['kg:radarFlow'] === true
      const markerStart = edgeMarkers.start !== 'none'
      const allowCurveByType = globalEdgeType === 'bezier'
      return {
        curve: allowCurveByType ? curve : false,
        bend,
        phase: curveOptions ? curveOptions.phase : 1,
        arrow,
        markerStart,
        orbitShift,
        arrowLength,
        arrowHalfWidth,
        orbital: allowCurveByType ? (curveOptions ? curveOptions.orbital : orbital) : false,
        edgeType: globalEdgeType,
      }
    }

    const getEdgeGeometry = (d: GraphEdge): {
      p1: { x: number; y: number }
      p2: { x: number; y: number }
      cx: number
      cy: number
      c1x: number
      c1y: number
      c2x: number
      c2y: number
      tx: number
      ty: number
      curve: boolean
      arrow: boolean
      markerStart: boolean
      orbital: boolean
      arrowLength: number
      arrowHalfWidth: number
      edgeType: GlobalEdgeType
    } => {
      const cached = edgeGeometryCache.get(d)
      if (cached) return cached
      const edge = d as unknown as EdgeWithRuntime
      const src = resolveNode(edge.source)
      const tgt = resolveNode(edge.target)
      const presentation = readEdgePresentation(d)
      if (!src || !tgt) {
        const fallback = {
          p1: { x: 0, y: 0 },
          p2: { x: 0, y: 0 },
          cx: 0,
          cy: 0,
          c1x: 0,
          c1y: 0,
          c2x: 0,
          c2y: 0,
          tx: 0,
          ty: 0,
          curve: presentation.curve,
          arrow: presentation.arrow,
          markerStart: presentation.markerStart,
          orbital: presentation.orbital,
          arrowLength: presentation.arrowLength,
          arrowHalfWidth: presentation.arrowHalfWidth,
          edgeType: presentation.edgeType,
        }
        edgeGeometryCache.set(d, fallback)
        return fallback
      }
      const p1 = endpoint(src, tgt, presentation.markerStart ? 9 : 3)
      const p2 = endpoint(tgt, src, presentation.arrow ? 9 : 3)
      const mx = (p1.x + p2.x) / 2
      const my = (p1.y + p2.y) / 2
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.max(1, Math.hypot(dx, dy))
      const nx = -dy / dist
      const ny = dx / dist
      const curveScale = presentation.curve ? presentation.bend : 0
      const curveMag = dist * curveScale
      const orbitalPolarity = Math.abs(curveScale) > 1e-6 ? (curveScale < 0 ? -1 : 1) : presentation.phase
      const orbitalMag = presentation.orbital ? dist * presentation.orbitShift * orbitalPolarity : 0
      const c1x = p1.x + dx * 0.24 + nx * (curveMag * 0.86 + orbitalMag * 0.5)
      const c1y = p1.y + dy * 0.24 + ny * (curveMag * 0.86 + orbitalMag * 0.5)
      const c2x = p2.x - dx * 0.24 + nx * (curveMag * 1.14 + orbitalMag)
      const c2y = p2.y - dy * 0.24 + ny * (curveMag * 1.14 + orbitalMag)
      const tx = presentation.orbital ? p2.x - c2x : p2.x - (mx + nx * curveMag)
      const ty = presentation.orbital ? p2.y - c2y : p2.y - (my + ny * curveMag)
      const geometry = {
        p1,
        p2,
        cx: mx + nx * curveMag,
        cy: my + ny * curveMag,
        c1x,
        c1y,
        c2x,
        c2y,
        tx,
        ty,
        curve: presentation.curve,
        arrow: presentation.arrow,
        markerStart: presentation.markerStart,
        orbital: presentation.orbital,
        arrowLength: presentation.arrowLength,
        arrowHalfWidth: presentation.arrowHalfWidth,
        edgeType: presentation.edgeType,
      }
      edgeGeometryCache.set(d, geometry)
      return geometry
    }

    const buildEdgeArrowPath = (d: GraphEdge): string => {
      const g = getEdgeGeometry(d)
      if (!g.arrow) return ''
      const tn = Math.max(1, Math.hypot(g.tx, g.ty))
      const ux = g.tx / tn
      const uy = g.ty / tn
      const px = -uy
      const py = ux
      const bx = g.p2.x - ux * g.arrowLength
      const by = g.p2.y - uy * g.arrowLength
      const lx = bx + px * g.arrowHalfWidth
      const ly = by + py * g.arrowHalfWidth
      const rx = bx - px * g.arrowHalfWidth
      const ry = by - py * g.arrowHalfWidth
      return `M${g.p2.x},${g.p2.y} L${lx},${ly} L${rx},${ry} Z`
    }

    const buildEdgeStrokePath = (d: GraphEdge): string => {
      const g = getEdgeGeometry(d)
      if (!g.curve) {
        return buildEdgePathD({
          edgeType: g.edgeType,
          sx: g.p1.x,
          sy: g.p1.y,
          tx: g.p2.x,
          ty: g.p2.y,
          curve: readEdgePathCurveOptions(d, schema),
        })
      }
      if (g.orbital) return `M${g.p1.x},${g.p1.y} C${g.c1x},${g.c1y} ${g.c2x},${g.c2y} ${g.p2.x},${g.p2.y}`
      return `M${g.p1.x},${g.p1.y} Q${g.cx},${g.cy} ${g.p2.x},${g.p2.y}`
    }

    const updateLinkEndpoints = (sel: d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null) => {
      if (!sel) return
      sel.each(function (d) {
        const el = this as SVGElement
        const tag = String(el.tagName || '').toLowerCase()
        const g = getEdgeGeometry(d)
        if (tag === 'line') {
          setSvgAttrIfChanged(el, 'x1', String(g.p1.x))
          setSvgAttrIfChanged(el, 'y1', String(g.p1.y))
          setSvgAttrIfChanged(el, 'x2', String(g.p2.x))
          setSvgAttrIfChanged(el, 'y2', String(g.p2.y))
          return
        }
        if (tag !== 'path') return
        if ((el as SVGPathElement).classList.contains('kg-edge-arrow')) {
          setSvgAttrIfChanged(el, 'd', buildEdgeArrowPath(d))
          return
        }
        setSvgAttrIfChanged(el, 'd', buildEdgeStrokePath(d))
      })
    }

    applyStrictOverlapRelax2d({
      state: strictOverlapState,
      nodes,
      tick,
      alpha: simulation.alpha(),
      schema,
      idealSpacing,
      tuning: physicsTuning,
      groupsForBboxCollide,
    })

    updateLinkEndpoints((linkHitSelRef.current as any) ?? null)
    updateLinkEndpoints((linkSelRef.current as any) ?? null)
    const edgeArrowSel = d3.select(svgEl).selectAll<SVGPathElement, GraphEdge>('path.kg-edge-arrow')
    if (!edgeArrowSel.empty()) {
      edgeArrowSel.each(function (d) {
        setSvgAttrIfChanged(this as SVGPathElement, 'd', buildEdgeArrowPath(d))
      })
    }

    const nodeSel = nodeSelRef.current
    if (nodeSel) {
      nodeSel.each(function (d: GraphNode) {
        const el = this as SVGElement
        const tag = String(el.tagName || '').toLowerCase()
        const x = typeof d.x === 'number' && Number.isFinite(d.x) ? d.x : 0
        const y = typeof d.y === 'number' && Number.isFinite(d.y) ? d.y : 0
        const { width, height, r } = getNodeMetricsForFrame(d)
        if (tag === 'circle') {
          setSvgAttrIfChanged(el, 'cx', String(x))
          setSvgAttrIfChanged(el, 'cy', String(y))
          setSvgAttrIfChanged(el, 'r', String(r))
          return
        }
        if (tag === 'path') {
          const rawShape = String(el.getAttribute('data-kg-node-shape') || '').trim().toLowerCase()
          const shape = rawShape === 'diamond' || rawShape === 'hex' ? rawShape : null
          setSvgAttrIfChanged(el, 'transform', `translate(${x},${y})`)
          setSvgAttrIfChanged(el, 'd', shape ? buildNodeShapePathD({ shape, width, height }) : '')
          return
        }
        setSvgAttrIfChanged(el, 'x', String(x - width / 2))
        setSvgAttrIfChanged(el, 'y', String(y - height / 2))
        setSvgAttrIfChanged(el, 'width', String(width))
        setSvgAttrIfChanged(el, 'height', String(height))
        setSvgAttrIfChanged(el, 'rx', String(r * 0.22))
        setSvgAttrIfChanged(el, 'ry', String(r * 0.22))
      })
    }

    const groupChevronSel = groupChevronSelRef.current
    if (groupChevronSel) {
      groupChevronSel.each(function (d: GraphNode) {
        const el = this as SVGPathElement
        const x = typeof d.x === 'number' && Number.isFinite(d.x) ? d.x : 0
        const y = typeof d.y === 'number' && Number.isFinite(d.y) ? d.y : 0
        const props = (d.properties || {}) as Record<string, unknown>
        const groupId = typeof props['kg:groupId'] === 'string' ? String(props['kg:groupId'] || '').trim() : ''
        if (!groupId) {
          setSvgAttrIfChanged(el, 'd', '')
          return
        }
        const { width, height, r } = getNodeMetricsForFrame(d)
        const pad = Math.max(6, Math.min(12, r * 0.35))
        const cx = x + width / 2 - pad
        const cy = y - height / 2 + pad
        const size = Math.max(8, Math.min(14, r * 0.9))
        setSvgAttrIfChanged(el, 'd', buildChevronPathD({ cx, cy, size, direction: 'right' }))
      })
    }

    const mediaSel = mediaSelRef.current
    if (mediaSel) {
      mediaSel.each(function (d: GraphNode) {
        const el = this as SVGGraphicsElement
        const x = typeof d.x === 'number' && Number.isFinite(d.x) ? d.x : 0
        const y = typeof d.y === 'number' && Number.isFinite(d.y) ? d.y : 0
        setSvgAttrIfChanged(el, 'transform', `translate(${x},${y})`)
      })
    }

    const portHandlesSel = portHandlesSelRef.current
    if (portHandlesSel && portHandlesEnabled) {
      portHandlesSel.each(function (d) {
        const el = this as SVGCircleElement
        const n = nodeById.get(d.nodeId)
        if (!n) {
          setSvgAttrIfChanged(el, 'cx', '0')
          setSvgAttrIfChanged(el, 'cy', '0')
          return
        }
        const anyD = d as any
        const pos =
          anyD && typeof anyD.dir === 'string'
            ? getFlowPortHandlePosition2d({ datum: anyD, node: n, schema })
            : getPortHandlePosition({ datum: d as any, node: n, schema, cfg: portHandlesCfg })
        setSvgAttrIfChanged(el, 'cx', String(pos.x))
        setSvgAttrIfChanged(el, 'cy', String(pos.y))
      })
    }

    const labelsSel = labelsSelRef.current
    if (!labelsSel) return

    renderLabels2d({
      svgEl,
      nodes,
      schema,
      tuning: physicsTuning,
      tick,
      simulationAlpha: simulation.alpha(),
      width,
      height,
      labelsSel,
      edgeLabelSel,
      resolveNode,
      portHandlesEnabled,
      labelFontSize,
      baseDxFallback,
      baseDyFallback,
      maxNodesForRelax,
      maxNodeLabels,
      getNodeMetrics: getNodeMetricsForFrame,
      state: labelRelaxState,
    })

    if (afterRenderFrame) {
      afterRenderFrame({ alpha: simulation.alpha(), tick })
    }
    if (orbitFrameActive) scheduleRender()
  }

  const raf =
    typeof (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'function'
      ? (globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => number }).requestAnimationFrame
      : (cb: (t: number) => void) => {
          return setTimeout(() => cb(Date.now()), 16) as unknown as number
        }

  let rafPending = false
  const scheduleRender = () => {
    if (rafPending) return
    rafPending = true
    raf(() => {
      rafPending = false
      if (!svgEl.isConnected) return
      renderFrame()
    })
  }

  simulation.on('tick', () => {
    applyMotionLimits()
    scheduleRender()
  })
  renderFrame()
}
