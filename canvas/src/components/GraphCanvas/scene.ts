import * as d3 from 'd3'
import type { MutableRefObject, RefObject } from 'react'
import type { GraphNode, GraphEdge, GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { createZoom } from '@/components/GraphCanvas/zoom'
import { buildSimulation } from '@/components/GraphCanvas/simulation'
import { readFitAllOptions, readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { fitAllTransform } from '@/components/GraphCanvas/fit'
import { relaxNodesWithCollision } from '@/components/GraphCanvas/layout/relax'
import { postFitNodesToViewport } from '@/components/GraphCanvas/layout/postFit'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import type { PendingLink, TempLinkSelection } from '@/features/edge-creation'
import { hideTempLink, cancelPendingEdge } from '@/features/edge-creation'
import type { HoverInfo } from '@/components/GraphHoverTooltip'
import { applySelectionHighlight } from '@/components/GraphCanvas/highlight'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import { createDefs, createGroupsLayer, createLinksHitLayer, createLinksLayer, createEdgeLabelsLayer, createNodesLayer, createTempLink, createLabelsLayer, createResizeHandlesLayer } from '@/components/GraphCanvas/sceneLayers'
import { attachGlobalHandlers, attachSimulationTick } from '@/components/GraphCanvas/sceneHandlers'
import { applyGraphCanvasZOrder } from '@/components/GraphCanvas/zOrder'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import type { PortHandleDatum } from '@/components/GraphCanvas/portHandles'
import type { FlowPortHandleDatum2d } from '@/components/GraphCanvas/flowPortHandles2d'
import { buildNodeZKeyById } from '@/lib/canvas/groupZOrder'
import {
  initializeGraphLayout,
  applyBaselineDocumentPositionsToKeywordGraph,
  seedKeywordEntityNodesFromBaselineSources,
  layoutLooksUnstableForViewport,
} from '@/components/GraphCanvas/layout/initialization'
import { pickLayoutPositionsSource } from '@/components/GraphCanvas/layout/positionSource'
import { applyCollectiveGraphLayout } from '@/components/GraphCanvas/layout/collectiveFit'
import { detectKeywordGraph } from '@/components/GraphCanvas/layout/graphKind'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { readDocumentViewModeContext } from '@/lib/graph/documentViewMode'
import type { ViewportControlsPreset } from '@/lib/config.viewport-controls'
import { readFitPadding } from '@/lib/graph/layoutDefaults'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { pipelinePerfMeasureSync } from '@/lib/pipelinePerf'
import { createUniqueId } from '@/lib/ids'
import type { OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'
import {
  clearGraphCanvasUserInteracted,
  hasGraphCanvasUserInteracted,
  resetGraphCanvasUserInteracted,
} from '@/components/GraphCanvas/userInteractionFlag'
import { computeOverlayHalfExtentsByNodeId2d } from '@/lib/render/overlayHalfExtentsByNodeId2d'
import { resolveContextualZoomDetail } from '@/lib/zoom/viewport'
import { readGraphElementCenterPoint } from '@/lib/canvas/graph-elements/centroid'
import { resolveWorkspaceVisibleViewport } from '@/lib/zoom/workspaceVisibleViewport'
import { filterGraphCanvasViewportFitNodes } from '@/components/GraphCanvas/viewportFitNodes'

type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>

type SetupGraphSceneArgs = {
  active: () => boolean
  svgEl: SVGSVGElement
  svgRef: RefObject<SVGSVGElement>
  graphData: GraphData
  graphDataRevision: number
  schema: GraphSchema
  documentSemanticMode?: 'document' | 'keyword'
  frontmatterModeEnabled?: boolean
  multiDimTableModeEnabled?: boolean
  documentStructureBaselineLock?: boolean
  canvas2dRenderer?: string
  edgesForSim: GraphEdge[]
  width: number
  height: number
  hoverEnabled: boolean
  zoomOnDoubleClick: boolean
  renderMediaAsNodes: boolean
  mediaOverlayNodeIdSet?: Set<string>
  panelOnlyNodeIdSet?: Set<string>
  mediaPanelDensity: 'default' | 'compact'
  overlaySizing?: OverlayDensitySizingConfigInput | null
  enableTightInitialLayout?: boolean
  fitToScreenMode?: boolean
  viewportControlsPreset: ViewportControlsPreset
  initialZoomTransform?: { k: number; x: number; y: number } | null
  layoutPositionsForMode?: Record<string, { x: number; y: number }> | null
  baselineLayoutPositions?: Record<string, { x: number; y: number }> | null
  prevPositions?: Record<string, { x: number; y: number }> | null
  skipInitialLayout?: boolean
  freezeSimulation?: boolean
  enableContinuousForceLayout?: boolean
  groupsForBboxCollide: GraphGroup[]
  layoutGroupKeyByNodeId: Record<string, string> | null
  gRef: MutableRefObject<GSelection | null>
  nodesSelRef: MutableRefObject<d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null>
  groupChevronSelRef: MutableRefObject<d3.Selection<SVGPathElement, GraphNode, SVGGElement, unknown> | null>
  mediaSelRef: MutableRefObject<d3.Selection<SVGGraphicsElement, GraphNode, SVGGElement, unknown> | null>
  portHandlesSelRef: MutableRefObject<
    d3.Selection<SVGCircleElement, PortHandleDatum | FlowPortHandleDatum2d, SVGGElement, unknown> | null
  >
  linksHitSelRef: MutableRefObject<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>
  linksSelRef: MutableRefObject<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>
  labelsSelRef: MutableRefObject<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>
  zoomRef: MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  tempLinkSelRef: MutableRefObject<TempLinkSelection>
  linkDragRef: MutableRefObject<PendingLink | null>
  simulationRef: MutableRefObject<d3.Simulation<GraphNode, GraphEdge> | null>
  sceneGraphDataRef: MutableRefObject<GraphData | null>
  beforeRenderFrameRef: MutableRefObject<(() => void) | null>
  selectedEdgeIdRef: MutableRefObject<string | null>
  selectedNodeIdRef: MutableRefObject<string | null>
  selectedNodeIdsRef: MutableRefObject<string[] | undefined>
  selectedEdgeIdsRef: MutableRefObject<string[] | undefined>
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  selectGroup: (id: string | null) => void
  selectGroupExpanded: (args: { id: string; nodeIds: string[]; edgeIds: string[] }) => void
  toggleGroupCollapsed: (id: string) => void
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void
  addEdge: (e: GraphEdge) => void
  updateEdge: (id: string, u: Partial<GraphEdge>) => void
  addNode: (n: GraphNode) => void
  updateNode: (id: string, u: Partial<GraphNode>) => void
  setHoverInfo: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void
  setLifecycleStageRendering: () => void
  requestZoomSelection: () => void
  onZoomTransform: (t: { k: number; x: number; y: number }) => void
  edgeScrollEnabled?: () => boolean
  getSchema: () => GraphSchema
  getRenderMediaAsNodes: () => boolean
  enableEditorGestures?: boolean
  layoutCacheKey: string | null
  setLayoutPositionsForMode: ((key: string, positions: Record<string, { x: number; y: number }> | null) => void) | null
}

export const setupGraphScene = (args: SetupGraphSceneArgs) => {
  const {
    active,
    svgEl,
    svgRef,
    graphData,
    schema,
    edgesForSim,
    width,
    height,
    hoverEnabled,
    zoomOnDoubleClick,
    renderMediaAsNodes,
    mediaOverlayNodeIdSet,
    panelOnlyNodeIdSet,
    mediaPanelDensity,
    overlaySizing,
    fitToScreenMode,
    viewportControlsPreset,
    initialZoomTransform,
    layoutPositionsForMode,
    baselineLayoutPositions,
    prevPositions,
    skipInitialLayout,
    gRef,
    nodesSelRef,
    groupChevronSelRef,
    mediaSelRef,
    portHandlesSelRef,
    linksHitSelRef,
    linksSelRef,
    labelsSelRef,
    zoomRef,
    tempLinkSelRef,
    linkDragRef,
    simulationRef,
    sceneGraphDataRef,
    beforeRenderFrameRef,
    selectedEdgeIdRef,
    selectedNodeIdRef,
    selectedNodeIdsRef,
    selectedEdgeIdsRef,
    selectNode,
    selectEdge,
    selectGroup,
    selectGroupExpanded,
    toggleGroupCollapsed,
    setSelectionSource,
    setHoverInfo,
    setLifecycleStageRendering,
    requestZoomSelection,
    onZoomTransform,
    getSchema,
    getRenderMediaAsNodes,
    enableEditorGestures,
    layoutCacheKey,
    setLayoutPositionsForMode,
  } = args

  const svg = d3.select(svgEl)
  resetGraphCanvasUserInteracted(svgEl)
  svg.selectAll('*').remove()
  svg.attr('data-kg-layout-frozen', null)

  const g = svg.append('g')
    .attr('data-kg-layer', 'scene-root')
    .attr('role', 'presentation')
    .attr('aria-hidden', 'true')
    .attr('focusable', 'false')
    .style('pointer-events', 'none')
  gRef.current = g

  const edgeMarkerRegistry = createDefs(svg)

  const display = deriveSceneDisplayGraph({ graphData, edges: Array.isArray(edgesForSim) ? edgesForSim : null })
  const graphDataForDisplay = display?.displayGraphData || graphData
  const displayGraphLookup = getCachedGraphLookup({
    cacheScope: 'graph-canvas-scene-display-graph',
    graphData: graphDataForDisplay,
    graphRevision: args.graphDataRevision,
    // Simulation tick reads live display-node refs, so this path must keep current graph objects.
    preferCurrentGraphDataRefs: true,
  })
  const displayNodeById = display?.nodeById || displayGraphLookup?.nodeById || null
  const forceDocumentStructure = readDocumentViewModeContext({
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentSemanticMode: String(args.documentSemanticMode || 'document'),
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
  }).forceDocumentStructureGroups
  sceneGraphDataRef.current = graphDataForDisplay
  const displayNodes = Array.isArray(graphDataForDisplay.nodes) ? (graphDataForDisplay.nodes as GraphNode[]) : []
  const displayNodesForViewportFit = filterGraphCanvasViewportFitNodes({
    nodes: displayNodes,
    panelOnlyNodeIdSet,
    mediaOverlayNodeIdSet,
  })
  const edgesForDisplayUnsorted = Array.isArray(graphDataForDisplay.edges) ? (graphDataForDisplay.edges as GraphEdge[]) : []
  const edgesForDisplay = (() => {
    const edges = edgesForDisplayUnsorted
    const needsSort = edges.some(e => {
      const props = (e as unknown as { properties?: unknown }).properties
      return props && typeof props === 'object' && !Array.isArray(props) && typeof (props as Record<string, unknown>)['visual:zIndex'] !== 'undefined'
    })
    if (!needsSort) return edges
    const getZ = (e: GraphEdge): number => {
      const props = (e as unknown as { properties?: unknown }).properties
      if (!props || typeof props !== 'object' || Array.isArray(props)) return 0
      const raw = (props as Record<string, unknown>)['visual:zIndex']
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
      return typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0
    }
    return edges.slice().sort((a, b) => {
      const az = getZ(a)
      const bz = getZ(b)
      if (az !== bz) return az - bz
      return String((a as any).id || '').localeCompare(String((b as any).id || ''))
    })
  })()

  const zoom = createZoom(svg, g, labelsSelRef, schema, viewportControlsPreset, onZoomTransform, () => {
    if (!nodesSelRef.current && !labelsSelRef.current && !linksSelRef.current && !mediaSelRef.current) return
    const schemaValue = getSchema()
    applySelectionHighlight(
      nodesSelRef.current,
      mediaSelRef.current,
      labelsSelRef.current,
      linksSelRef.current,
          graphDataForDisplay,
          schemaValue,
          selectedNodeIdRef.current,
          selectedEdgeIdRef.current,
          selectedNodeIdsRef.current,
          selectedEdgeIdsRef.current,
          getRenderMediaAsNodes(),
        )
  },
  active)
  zoomRef.current = zoom
  const applyInitialTransform = (t: { k: number; x: number; y: number } | null) => {
    if (!t) return
    const k = typeof t.k === 'number' && Number.isFinite(t.k) ? t.k : 1
    const x = typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 0
    const y = typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 0
    const next = d3.zoomIdentity.translate(x, y).scale(k)
    svg.call(
      zoom.transform as unknown as (
        sel: d3.Selection<SVGSVGElement, unknown, null, undefined>,
        t: d3.ZoomTransform,
      ) => void,
      next,
    )
  }
  const readViewportFitNodes = (): GraphNode[] => {
    try {
      const mountedNodes = nodesSelRef.current?.data()
      if (Array.isArray(mountedNodes) && mountedNodes.length > 0) return mountedNodes as GraphNode[]
    } catch {
      void 0
    }
    return displayNodesForViewportFit
  }
  const readVisibleViewportFitFrame = () => {
    const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen(useGraphStore.getState())
    return resolveWorkspaceVisibleViewport({
      viewportW: Math.max(1, width),
      viewportH: Math.max(1, Math.floor(height)),
      workspaceEditorOverlayOpen,
      surfaceElement: svgEl,
    })
  }
  const buildViewportFitNodesPositionSignature = (nodes: GraphNode[]): string => {
    if (!Array.isArray(nodes) || nodes.length === 0) return '0'
    const parts: string[] = [String(nodes.length)]
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const xy = readGraphElementCenterPoint(n)
      if (!xy) {
        parts.push(String(n?.id || ''), '', '')
        continue
      }
      parts.push(
        String(n.id || ''),
        String(Math.round(xy.x * 10) / 10),
        String(Math.round(xy.y * 10) / 10),
      )
    }
    return parts.join('|')
  }
  let postInitialFitRafId: number | null = null
  let postInitialFitTimerId: ReturnType<typeof setTimeout> | null = null
  let postInitialFitChecks = 0
  let postInitialFitStableChecks = 0
  let postInitialFitLastSignature = ''
  const cancelPostInitialFitToScreenTransform = () => {
    if (postInitialFitRafId != null) {
      cancelAnimationFrame(postInitialFitRafId)
      postInitialFitRafId = null
    }
    if (postInitialFitTimerId != null) {
      clearTimeout(postInitialFitTimerId)
      postInitialFitTimerId = null
    }
  }
  const schedulePostInitialFitToScreenTransform = () => {
    if (initialZoomTransform) return
    if (!fitToScreenMode) return
    if (postInitialFitRafId != null) return
    if (postInitialFitTimerId != null) return
    const run = () => {
      postInitialFitTimerId = null
      postInitialFitRafId = requestAnimationFrame(() => {
        postInitialFitRafId = null
        if (!active()) return
        if (hasGraphCanvasUserInteracted(svgEl)) return
        const fitNodes = readViewportFitNodes()
        const signature = buildViewportFitNodesPositionSignature(fitNodes)
        if (signature === postInitialFitLastSignature) {
          postInitialFitStableChecks += 1
        } else {
          postInitialFitStableChecks = 0
          postInitialFitLastSignature = signature
        }
        postInitialFitChecks += 1
        applyInitialTransform(computeViewportFitTransform('fitToScreen'))
        if (postInitialFitStableChecks >= 4 || postInitialFitChecks >= 24) return
        const delayMs = postInitialFitChecks < 10 ? 160 : 400
        postInitialFitTimerId = setTimeout(run, delayMs)
      })
    }
    postInitialFitTimerId = setTimeout(run, 0)
  }

  const computeAutoCenterTransform = (): { k: number; x: number; y: number } | null => {
    if (initialZoomTransform) return null
    if (fitToScreenMode) return null

    if (readLayoutMode(schema) !== 'radial' && schema.layout?.forces?.disjointComponents !== false) {
      const visibleViewport = readVisibleViewportFitFrame()
      return { k: 1, x: visibleViewport.centerX, y: visibleViewport.centerY }
    }

    const nodes = readViewportFitNodes()
    if (!nodes || nodes.length === 0) return null
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let count = 0
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      const x = typeof n.x === 'number' && Number.isFinite(n.x) ? (n.x as number) : NaN
      const y = typeof n.y === 'number' && Number.isFinite(n.y) ? (n.y as number) : NaN
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      count += 1
    }
    if (count === 0) return null
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
    const visibleViewport = readVisibleViewportFitFrame()
    const x = visibleViewport.centerX - cx
    const y = visibleViewport.centerY - cy
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { k: 1, x, y }
  }

  const computeViewportFitTransform = (intent: 'initialFit' | 'fitToScreen'): { k: number; x: number; y: number } | null => {
    const nodes = readViewportFitNodes()
    if (!nodes || nodes.length === 0) return null
    const fitGraphData = nodes === displayNodes
      ? graphDataForDisplay
      : { ...graphDataForDisplay, nodes }
    const schemaValue = getSchema()
    const mode = readLayoutMode(schemaValue)
    const fillRatioOverride = (() => {
      try {
        const v = useGraphStore.getState().viewportFitFillRatio
        return typeof v === 'number' && Number.isFinite(v) ? v : undefined
      } catch {
        return undefined
      }
    })()
    const baseOpts = readFitAllOptions({ schema: schemaValue, mode, intent, targetFillRatioOverride: fillRatioOverride })
    const opts = {
      ...baseOpts,
      centerMode: 'centroid' as const,
      graphData: fitGraphData,
      deriveGroupsOptions: { forceDocumentStructure },
    }
    const visibleViewport = readVisibleViewportFitFrame()
    const t = fitAllTransform(
      nodes,
      Math.max(1, visibleViewport.width),
      Math.max(1, Math.floor(visibleViewport.height)),
      opts,
    )
    const k = typeof t.k === 'number' && Number.isFinite(t.k) && t.k > 0 ? t.k : 1
    const x = typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : 0
    const y = typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : 0
    if (!Number.isFinite(k) || !Number.isFinite(x) || !Number.isFinite(y)) return null
    return { k, x: x + visibleViewport.left, y: y + visibleViewport.top }
  }

  const computeInitialViewportFitTransform = (): { k: number; x: number; y: number } | null => {
    if (initialZoomTransform) return null
    return computeViewportFitTransform(fitToScreenMode ? 'fitToScreen' : 'initialFit')
  }

  const layoutPositionsSource = (() => {
    const cached = layoutPositionsForMode && Object.keys(layoutPositionsForMode).length > 0 ? layoutPositionsForMode : null
    const prev = prevPositions && Object.keys(prevPositions).length > 0 ? prevPositions : null
    return pickLayoutPositionsSource({ nodes: displayNodes, cached, prev })
  })()

  const seedCenter = (() => {
    if (!initialZoomTransform) {
      if (readLayoutMode(schema) !== 'radial' && schema.layout?.forces?.disjointComponents !== false) {
        return { x: 0, y: 0 }
      }
      return null
    }
    const k =
      typeof initialZoomTransform.k === 'number' && Number.isFinite(initialZoomTransform.k) && initialZoomTransform.k > 0
        ? initialZoomTransform.k
        : 1
    const x = typeof initialZoomTransform.x === 'number' && Number.isFinite(initialZoomTransform.x) ? initialZoomTransform.x : 0
    const y = typeof initialZoomTransform.y === 'number' && Number.isFinite(initialZoomTransform.y) ? initialZoomTransform.y : 0
    return { x: (width / 2 - x) / k, y: (height / 2 - y) / k }
  })()

  const isKeywordGraph = detectKeywordGraph({
    metadata: graphDataForDisplay.metadata,
    nodes: Array.isArray(graphDataForDisplay.nodes) ? (graphDataForDisplay.nodes as GraphNode[]) : [],
    edges: edgesForDisplay,
  })

  const isMermaidLayout = (() => {
    const gd = args.graphData as unknown as { context?: unknown; metadata?: unknown } | null
    if (!gd) return false
    if (String(gd.context || '') === 'frontmatter-mermaid') return true
    const meta = gd.metadata
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
    return String((meta as Record<string, unknown>).layoutEngine || '') === 'mermaid'
  })()

  const groupKeyByNodeId = args.layoutGroupKeyByNodeId
  const groupKeyOf = (n: GraphNode): string | null => {
    const id = String(n.id || '').trim()
    if (!id || !groupKeyByNodeId) return null
    return groupKeyByNodeId[id] || null
  }

  if (isKeywordGraph && baselineLayoutPositions) {
    const overwriteExisting =
      !skipInitialLayout
    seedKeywordEntityNodesFromBaselineSources({
      keywordNodes: displayNodes,
      allNodes: Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : ([] as GraphNode[]),
      allEdges: Array.isArray(graphData.edges) ? (graphData.edges as GraphEdge[]) : ([] as GraphEdge[]),
      baseline: baselineLayoutPositions,
      overwriteExisting,
    })
    applyBaselineDocumentPositionsToKeywordGraph({
      nodes: displayNodes,
      edges: edgesForDisplay,
      baseline: baselineLayoutPositions,
      overwriteExisting,
    })
  }

  if (!isMermaidLayout) {
    pipelinePerfMeasureSync({
      name: 'render',
      stage: 'layout:init',
      detail: {
        nodes: displayNodes.length,
        edges: edgesForDisplay.length,
        hasCachedPositions: !!layoutPositionsSource,
        skipInitialLayout: !!skipInitialLayout,
      },
      run: () =>
        initializeGraphLayout({
          nodes: displayNodes,
          edges: edgesForDisplay,
          width,
          height,
          schema,
          seedCenter,
          groupKeyOf,
          layoutPositions: layoutPositionsSource,
          groupsForBboxCollide: args.groupsForBboxCollide,
        }),
    })
  }

  const overlayFitViewport = readVisibleViewportFitFrame()
  const overlayHalfExtentsByNodeId = computeOverlayHalfExtentsByNodeId2d({
    nodes: displayNodes,
    panelOnlyNodeIdSet: panelOnlyNodeIdSet || null,
    mediaOverlayNodeIdSet: mediaOverlayNodeIdSet || null,
    viewportW: Math.max(1, Math.floor(overlayFitViewport.width)),
    viewportH: Math.max(1, Math.floor(overlayFitViewport.height)),
    zoomK: typeof initialZoomTransform?.k === 'number' && Number.isFinite(initialZoomTransform.k) ? Math.max(0.001, initialZoomTransform.k) : 1,
    mediaPanelDensity,
    overlaySizing: overlaySizing || null,
  })

  const effectiveSkipInitialLayout = (() => {
    if (isMermaidLayout) return true
    if (!skipInitialLayout) return false
    return true
  })()

  const simulation = buildSimulation(displayNodes, edgesForDisplay, Math.max(1, width), Math.max(1, Math.floor(height)), schema, {
    skipInitialLayout: !!effectiveSkipInitialLayout,
    groupKeyOf,
    groupsForBboxCollide: args.groupsForBboxCollide,
    treatKeywordGraphAsDocument: isKeywordGraph,
    nodeHalfExtentsByNodeId: overlayHalfExtentsByNodeId,
  })
  simulationRef.current = simulation

  const continuousForceLayout = args.enableContinuousForceLayout === true && args.freezeSimulation !== true

  if (effectiveSkipInitialLayout && readLayoutMode(schema) !== 'radial' && args.freezeSimulation !== true && !continuousForceLayout) {
    try {
      simulation.alphaTarget(0)
      simulation.alpha(0)
      simulation.stop()
    } catch {
      void 0
    }
    svg.attr('data-kg-layout-frozen', '1')
  }

  const disjointEnabled = schema.layout?.forces?.disjointComponents !== false
  const shouldApplyInitialTightLayout = !isMermaidLayout && args.enableTightInitialLayout === true && !disjointEnabled

  if (!isMermaidLayout && !effectiveSkipInitialLayout && displayNodes.length > 1) {
    const dupCounts = new Map<string, number>()
    for (let i = 0; i < displayNodes.length; i += 1) {
      const n = displayNodes[i]
      const x = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : 0
      const y = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : 0
      n.x = x
      n.y = y
      const key = `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
      dupCounts.set(key, (dupCounts.get(key) || 0) + 1)
    }

    const jitterFor = (id: string): { dx: number; dy: number } => {
      let h = 0
      for (let i = 0; i < id.length; i += 1) {
        h = (h * 31 + id.charCodeAt(i)) >>> 0
      }
      const sx = ((h % 7) - 3) * 0.11
      const sy = (((h >>> 3) % 7) - 3) * 0.11
      return { dx: sx, dy: sy }
    }

    for (let i = 0; i < displayNodes.length; i += 1) {
      const n = displayNodes[i]
      const x = n.x as number
      const y = n.y as number
      const key = `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
      if ((dupCounts.get(key) || 0) <= 1) continue
      const j = jitterFor(String(n.id || ''))
      n.x = x + j.dx
      n.y = y + j.dy
    }

  }

  if (shouldApplyInitialTightLayout && displayNodes.length > 1) {
    relaxNodesWithCollision({
      nodes: displayNodes,
      edges: edgesForDisplay,
      schema,
      defaultSteps: (args.groupsForBboxCollide || []).length > 0 ? 18 : 12,
      groupKeyOf,
      groups: args.groupsForBboxCollide,
      nodeHalfExtentsByNodeId: overlayHalfExtentsByNodeId,
    })

    for (let i = 0; i < displayNodes.length; i += 1) {
      const n = displayNodes[i]
      n.vx = 0
      n.vy = 0
    }

    const padPx = Math.max(24, Math.floor(readFitPadding(schema)))
    if (schema.layout?.forces?.postFitForce === true) {
      postFitNodesToViewport({
        nodes: displayNodes,
        width: Math.max(1, width),
        height: Math.max(1, Math.floor(height)),
        paddingPx: padPx,
        minScale: 0.06,
        maxScale: 2.2,
        viewportCenter: seedCenter || undefined,
      })
    }

    if (readLayoutMode(schema) !== 'radial' && args.freezeSimulation !== true && !continuousForceLayout) {
      try {
        simulation.alphaTarget(0)
        simulation.alpha(0)
        simulation.stop()
      } catch {
        void 0
      }
      svg.attr('data-kg-layout-frozen', '1')
    }
  }

  if (continuousForceLayout) {
    try {
      svg.attr('data-kg-layout-frozen', '0')
    } catch {
      void 0
    }
  }

  if (initialZoomTransform) {
    applyInitialTransform(initialZoomTransform)
  } else {
    applyInitialTransform(computeInitialViewportFitTransform() || computeAutoCenterTransform())
    schedulePostInitialFitToScreenTransform()
  }

  if (args.freezeSimulation === true) {
    try {
      simulation.alpha(0)
      simulation.alphaTarget(0)
      simulation.stop()
    } catch {
      void 0
    }
    svg.attr('data-kg-layout-frozen', '1')
  }

  const allGroupsForZOrder = deriveGraphGroups(graphData, { forceDocumentStructure })
  const nodeZKeyById = buildNodeZKeyById({ nodes: displayNodes, groups: allGroupsForZOrder })

  const groupsLayer = createGroupsLayer({
    g,
    graphData,
    edgesForDisplay,
    schema,
    documentSemanticMode: args.documentSemanticMode,
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
    simulation,
    groupsOverride: allGroupsForZOrder,
    updateNode: args.updateNode,
    hoverEnabled,
    setHoverInfo,
    setSelectionSource,
    selectNode,
    selectGroup,
    selectGroupExpanded,
    toggleGroupCollapsed,
  })
  const groupsUpdate = groupsLayer?.update ? () => groupsLayer.update() : null
  beforeRenderFrameRef.current = groupsUpdate
  // Legacy layout sync removed to prevent infinite re-render loop in Force layout mode.

  const linkHitSel = createLinksHitLayer({
    g,
    edgesForDisplay,
    schema,
    nodeById: displayNodeById,
    simulation,
    hoverEnabled,
    setHoverInfo,
    setSelectionSource,
    selectNode,
    selectEdge,
  })
  linksHitSelRef.current = linkHitSel

  const { nodeSel, mediaSel, portHandlesSel, groupChevronSel } = createNodesLayer({
    g,
    graphData: graphDataForDisplay,
    schema,
    renderMediaAsNodes,
    mediaOverlayNodeIdSet,
    panelOnlyNodeIdSet,
    preferDomMediaOverlays: true,
    mediaPanelDensity,
    zoomOnDoubleClick,
    nodeZKeyById,
    tempLinkSelRef,
    linkDragRef,
    simulation,
    addEdge: args.addEdge,
    updateEdge: args.updateEdge,
    getSelectedEdgeId: () => selectedEdgeIdRef.current,
    enableEditorGestures,
    onCommitNodePosition: enableEditorGestures
      ? ({ id, x, y }) => {
          args.updateNode(id, { x, y })
        }
      : undefined,
    hoverEnabled,
    setHoverInfo,
    selectNode,
    selectEdge,
    setSelectionSource,
    requestZoomSelection,
    toggleGroupCollapsed,
    edgeScroll: {
      enabled: () => (typeof args.edgeScrollEnabled === 'function' ? args.edgeScrollEnabled() : true),
      panByPx: (dx, dy) => {
        svg.call(
          zoom.translateBy as unknown as (
            sel: d3.Selection<SVGSVGElement, unknown, null, undefined>,
            x: number,
            y: number,
          ) => void,
          dx,
          dy,
        )
      },
    },
  })
  nodesSelRef.current = nodeSel
  groupChevronSelRef.current = groupChevronSel
  mediaSelRef.current = mediaSel
  portHandlesSelRef.current = portHandlesSel

  const resizeLayer = enableEditorGestures
    ? createResizeHandlesLayer({
        g,
        svgRef,
        getSchema,
        nodeById: displayNodeById,
        getSelectedNodeId: () => selectedNodeIdRef.current,
        hiddenNodeIdSet: (() => {
          if (!panelOnlyNodeIdSet && !mediaOverlayNodeIdSet) return null
          const set = new Set<string>()
          if (panelOnlyNodeIdSet) for (const id of panelOnlyNodeIdSet) set.add(id)
          if (mediaOverlayNodeIdSet) for (const id of mediaOverlayNodeIdSet) set.add(id)
          return set
        })(),
        enabled: true,
        commitResize: ({ id, properties }) => {
          args.updateNode(id, { properties })
        },
      })
    : null
  beforeRenderFrameRef.current = () => {
    groupsUpdate?.()
    resizeLayer?.update()
  }

  const linkSel = createLinksLayer({
    g,
    edgesForDisplay,
    schema,
    nodeById: displayNodeById,
    edgeMarkerRegistry,
  })
  linksSelRef.current = linkSel

  const edgeLabelSel = createEdgeLabelsLayer({
    g,
    edgesForDisplay,
    schema,
    hoverEnabled,
    setHoverInfo,
    setSelectionSource,
    selectEdge,
  })

  createTempLink(g, tempLinkSelRef, schema)

  createLabelsLayer({
    g,
    nodes: graphDataForDisplay.nodes,
    schema,
    documentSemanticMode: args.documentSemanticMode,
    nodeZKeyById,
    panelOnlyNodeIdSet,
    labelsSelRef,
    hoverEnabled,
    setHoverInfo,
    selectNode,
    selectEdge,
    setSelectionSource,
  })

  const isForceLayout = readLayoutMode(schema) !== 'radial'

  const storeLayoutPositions = () => {
    const isMermaidLayout = (() => {
      if (args.freezeSimulation === true) return true
      const gd = args.graphData as unknown as { context?: unknown; metadata?: unknown } | null
      if (!gd) return false
      if (String(gd.context || '') === 'frontmatter-mermaid') return true
      const meta = gd.metadata
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
      return String((meta as Record<string, unknown>).layoutEngine || '') === 'mermaid'
    })()
    if (isMermaidLayout) return
    if (!layoutCacheKey || typeof setLayoutPositionsForMode !== 'function') return
    const positions: Record<string, { x: number; y: number }> = {}
    for (let i = 0; i < graphDataForDisplay.nodes.length; i += 1) {
      const node = graphDataForDisplay.nodes[i]
      const id = String(node.id)
      if (!id) continue
      const x = typeof node.x === 'number' ? node.x : null
      const y = typeof node.y === 'number' ? node.y : null
      if (x == null || y == null) continue
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      positions[id] = { x, y }
    }
    if (Object.keys(positions).length > 0) {
      setLayoutPositionsForMode(layoutCacheKey, positions)
    }
  }
  if (labelsSelRef.current) {
    const k = d3.zoomTransform(svgEl).k || 1
    const hidden = resolveContextualZoomDetail({ k, contentThreshold: schema.performance?.lod?.hideLabelsBelowScale ?? 0 }).hidden
    labelsSelRef.current.attr('data-zoom-lod-hidden', hidden ? '1' : '0')
  }

  let stableTicks = 0
  let finalFitApplied = false
  attachSimulationTick({
    svgEl,
    simulation,
    nodeSelRef: nodesSelRef,
    groupChevronSelRef,
    mediaSelRef,
    portHandlesSelRef,
    linkHitSelRef: linksHitSelRef,
    linkSelRef: linksSelRef,
    edgeLabelSel,
    labelsSelRef,
    nodes: graphDataForDisplay.nodes,
    edges: edgesForDisplay,
    nodeById: displayNodeById,
    groupsForBboxCollide: args.groupsForBboxCollide,
    getSchema,
    documentSemanticMode: args.documentSemanticMode,
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    canvas2dRenderer: typeof args.canvas2dRenderer === 'string' ? args.canvas2dRenderer : '',
    width,
    height,
    panelOnlyNodeIdSet: panelOnlyNodeIdSet || null,
    mediaOverlayNodeIdSet: mediaOverlayNodeIdSet || null,
    mediaPanelDensity,
    overlaySizing: overlaySizing || null,
    beforeRenderFrameRef,
    afterRenderFrame: ({ alpha, tick }) => {
      if (isMermaidLayout) return
      if (!isForceLayout) return
      if (finalFitApplied) return
      if (args.freezeSimulation === true) return
      if (effectiveSkipInitialLayout) return
      if (tick < 40) return

      if (alpha < 0.03) {
        stableTicks += 1
      } else {
        stableTicks = 0
      }
      if (stableTicks < 18) return

      try {
        simulation.alphaTarget(0)
        simulation.stop()
      } catch {
        void 0
      }
      svg.attr('data-kg-layout-frozen', '1')
      storeLayoutPositions()
      if (!initialZoomTransform && !hasGraphCanvasUserInteracted(svgEl)) {
        applyInitialTransform(computeViewportFitTransform(fitToScreenMode ? 'fitToScreen' : 'initialFit'))
      }
      finalFitApplied = true
    },
  })

  applyGraphCanvasZOrder(g, args.schema)

  simulation.on('end.layoutCache', storeLayoutPositions)

  const layoutMode = readLayoutMode(schema)
  if (layoutMode === 'radial') {
    simulation.stop()
    storeLayoutPositions()
    svg.attr('data-kg-layout-frozen', '1')
  }

  setLifecycleStageRendering()

  const cleanupHandlers = attachGlobalHandlers({
    svgRef,
    svg,
    tempLinkSelRef,
    linkDragRef,
    selectNode,
    enableEditorGestures,
    onCanvasShiftDoubleClick: ({ x, y }) => {
      if (!enableEditorGestures) return
      const base = args.graphData
      const used = new Set<string>((base?.nodes || []).map(n => String(n.id || '')))
      const id = createUniqueId('n', used)
      const n: GraphNode = {
        id,
        label: `Node ${id}`,
        type: 'Node',
        x,
        y,
        properties: {},
      }
      args.addNode(n)
      try {
        args.setSelectionSource('editor')
        args.selectNode(id)
      } catch {
        void 0
      }
    },
    hideTemp: () => hideTempLink(tempLinkSelRef),
    cancelPending: () => cancelPendingEdge(linkDragRef),
  })

  return () => {
    cancelPostInitialFitToScreenTransform()
    const any = svgEl as unknown as { __kgViewportControllerDestroy?: (() => void) | null; __kgWindowGestureDestroy?: (() => void) | null }
    if (typeof any.__kgViewportControllerDestroy === 'function') {
      try {
        any.__kgViewportControllerDestroy()
      } catch {
        void 0
      }
      any.__kgViewportControllerDestroy = null
    }
    if (typeof any.__kgWindowGestureDestroy === 'function') {
      try {
        any.__kgWindowGestureDestroy()
      } catch {
        void 0
      }
      any.__kgWindowGestureDestroy = null
    }
    storeLayoutPositions()
    clearGraphCanvasUserInteracted(svgEl)
    simulation.on('end.layoutCache', null)
    simulation.stop()
    simulationRef.current = null
    sceneGraphDataRef.current = null
    beforeRenderFrameRef.current = null
    try {
      resizeLayer?.destroy()
    } catch {
      void 0
    }
    cleanupHandlers()
  }
}

export const updateGraphSceneNodesPresentation = (args: {
  svgEl: SVGSVGElement
  gRef: MutableRefObject<GSelection | null>
  zoomRef: MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  edgeScrollEnabled?: () => boolean
  schema: GraphSchema
  documentSemanticMode?: 'document' | 'keyword'
  frontmatterModeEnabled?: boolean
  multiDimTableModeEnabled?: boolean
  documentStructureBaselineLock?: boolean
  hoverEnabled: boolean
  zoomOnDoubleClick: boolean
  renderMediaAsNodes: boolean
  mediaOverlayNodeIdSet?: Set<string>
  panelOnlyNodeIdSet?: Set<string>
  mediaPanelDensity: 'default' | 'compact'
  tempLinkSelRef: MutableRefObject<TempLinkSelection>
  linkDragRef: MutableRefObject<PendingLink | null>
  simulationRef: MutableRefObject<d3.Simulation<GraphNode, GraphEdge> | null>
  sceneGraphDataRef: MutableRefObject<GraphData | null>
  nodesSelRef: MutableRefObject<d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null>
  groupChevronSelRef: MutableRefObject<d3.Selection<SVGPathElement, GraphNode, SVGGElement, unknown> | null>
  mediaSelRef: MutableRefObject<d3.Selection<SVGGraphicsElement, GraphNode, SVGGElement, unknown> | null>
  portHandlesSelRef: MutableRefObject<
    d3.Selection<SVGCircleElement, PortHandleDatum | FlowPortHandleDatum2d, SVGGElement, unknown> | null
  >
  labelsSelRef: MutableRefObject<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>
  setHoverInfo: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void
  addEdge: (e: GraphEdge) => void
  updateEdge: (id: string, u: Partial<GraphEdge>) => void
  getSelectedEdgeId: () => string | null
  enableEditorGestures?: boolean
  onCommitNodePosition?: (args: { id: string; x: number; y: number }) => void
  requestZoomSelection: () => void
  toggleGroupCollapsed: (id: string) => void
}) => {
  const g = args.gRef.current
  const sim = args.simulationRef.current
  const graphData = args.sceneGraphDataRef.current
  if (!g || !sim || !graphData) return

  const forceDocumentStructure = readDocumentViewModeContext({
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentSemanticMode: String(args.documentSemanticMode || 'document'),
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
  }).forceDocumentStructureGroups
  const allGroupsForZOrder = deriveGraphGroups(graphData, { forceDocumentStructure })
  const nodeZKeyById = buildNodeZKeyById({ nodes: Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : [], groups: allGroupsForZOrder })

  const zoom = args.zoomRef.current
  const svgEl = args.svgEl
  const svg = d3.select(svgEl)

  g.selectAll('[data-kg-layer="media"]').remove()
  g.selectAll('[data-kg-layer="nodes"]').remove()
  g.selectAll('[data-kg-layer="node-chevrons"]').remove()
  g.selectAll('[data-kg-layer="port-handles"]').remove()
  g.selectAll('[data-kg-layer="labels"]').remove()

  const { nodeSel, mediaSel, portHandlesSel, groupChevronSel } = createNodesLayer({
    g,
    graphData,
    schema: args.schema,
    renderMediaAsNodes: args.renderMediaAsNodes,
    mediaOverlayNodeIdSet: args.mediaOverlayNodeIdSet,
    panelOnlyNodeIdSet: args.panelOnlyNodeIdSet,
    preferDomMediaOverlays: true,
    mediaPanelDensity: args.mediaPanelDensity,
    zoomOnDoubleClick: args.zoomOnDoubleClick,
    nodeZKeyById,
    tempLinkSelRef: args.tempLinkSelRef,
    linkDragRef: args.linkDragRef,
    simulation: sim,
    addEdge: args.addEdge,
    updateEdge: args.updateEdge,
    getSelectedEdgeId: args.getSelectedEdgeId,
    enableEditorGestures: args.enableEditorGestures,
    onCommitNodePosition: args.onCommitNodePosition,
    hoverEnabled: args.hoverEnabled,
    setHoverInfo: args.setHoverInfo,
    selectNode: args.selectNode,
    selectEdge: args.selectEdge,
    setSelectionSource: args.setSelectionSource,
    requestZoomSelection: args.requestZoomSelection,
    toggleGroupCollapsed: args.toggleGroupCollapsed,
    edgeScroll:
      zoom && svgEl
        ? {
            enabled: () => (typeof args.edgeScrollEnabled === 'function' ? args.edgeScrollEnabled() : true),
            panByPx: (dx, dy) => {
              svg.call(
                zoom.translateBy as unknown as (
                  sel: d3.Selection<SVGSVGElement, unknown, null, undefined>,
                  x: number,
                  y: number,
                ) => void,
                dx,
                dy,
              )
            },
          }
        : undefined,
  })

  args.nodesSelRef.current = nodeSel
  args.groupChevronSelRef.current = groupChevronSel
  args.mediaSelRef.current = mediaSel
  args.portHandlesSelRef.current = portHandlesSel

  createLabelsLayer({
    g,
    nodes: graphData.nodes,
    schema: args.schema,
    documentSemanticMode: args.documentSemanticMode,
    nodeZKeyById,
    panelOnlyNodeIdSet: args.panelOnlyNodeIdSet,
    labelsSelRef: args.labelsSelRef,
    hoverEnabled: args.hoverEnabled,
    setHoverInfo: args.setHoverInfo,
    selectNode: args.selectNode,
    selectEdge: args.selectEdge,
    setSelectionSource: args.setSelectionSource,
  })

  applyGraphCanvasZOrder(g, args.schema)
}

export const updateGraphSceneGroupsPresentation = (args: {
  gRef: MutableRefObject<GSelection | null>
  schema: GraphSchema
  graphData: GraphData
  documentSemanticMode?: 'document' | 'keyword'
  frontmatterModeEnabled?: boolean
  multiDimTableModeEnabled?: boolean
  documentStructureBaselineLock?: boolean
  beforeRenderFrameRef: MutableRefObject<(() => void) | null>
  simulationRef: MutableRefObject<d3.Simulation<GraphNode, GraphEdge> | null>
  hoverEnabled: boolean
  setHoverInfo: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void
  selectNode: (id: string | null) => void
  selectGroup: (id: string | null) => void
  selectGroupExpanded: (args: { id: string; nodeIds: string[]; edgeIds: string[] }) => void
  toggleGroupCollapsed: (id: string) => void
}) => {
  const g = args.gRef.current
  if (!g) return
  g.selectAll('[data-kg-layer="groups"]').remove()
  g.selectAll('[data-kg-layer="group-labels"]').remove()
  const display = deriveSceneDisplayGraph({ graphData: args.graphData })
  const edgesForDisplay = display ? display.displayEdges : ([] as GraphEdge[])

  const sim = args.simulationRef.current
  const forceDocumentStructure = readDocumentViewModeContext({
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentSemanticMode: String(args.documentSemanticMode || 'document'),
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
  }).forceDocumentStructureGroups
  const allGroupsForZOrder = deriveGraphGroups(args.graphData, { forceDocumentStructure })
  const groupsLayer = createGroupsLayer({
    g,
    graphData: args.graphData,
    edgesForDisplay,
    schema: args.schema,
    documentSemanticMode: args.documentSemanticMode,
    frontmatterModeEnabled: args.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled === true,
    documentStructureBaselineLock: args.documentStructureBaselineLock === true,
    groupsOverride: allGroupsForZOrder,
    simulation: sim,
    hoverEnabled: args.hoverEnabled,
    setHoverInfo: args.setHoverInfo,
    setSelectionSource: args.setSelectionSource,
    selectNode: args.selectNode,
    selectGroup: args.selectGroup,
    selectGroupExpanded: args.selectGroupExpanded,
    toggleGroupCollapsed: args.toggleGroupCollapsed,
  })
  args.beforeRenderFrameRef.current = groupsLayer?.update ? () => groupsLayer.update() : null
  
  applyGraphCanvasZOrder(g, args.schema)
}
