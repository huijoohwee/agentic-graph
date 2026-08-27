import type { GraphData } from '@/lib/graph/types'
import { applyCanvasRenderBudget, resolveCanvasRenderBudgetSurface } from '@/lib/graph/canvasRenderBudget'
import { readGraphTopologySummary, withGraphTopologyMetadata } from '@/lib/graph/graphTopology'
import { DEFAULT_CANVAS_2D_RENDERER, isFrontmatterOnlyPolicyActive, resolveCanvas2dRendererId } from '@/lib/config.render'
import { readSubgraphs } from '@/lib/graph/subgraphs'
import { deriveFlowchartFrontmatterActiveViewGraph, deriveGraphDataForActiveView } from '@/hooks/active-graph-data/activeViewGraph'

type LocalCanvasTopologyInspectionArgs = {
  graphData: GraphData | null | undefined
  graphDataRevision: number | null | undefined
  markdownDocumentName?: unknown
  markdownDocumentText?: unknown
  canvasRenderMode?: unknown
  canvas2dRenderer?: unknown
  documentSemanticMode?: unknown
  frontmatterModeEnabled?: unknown
  multiDimTableModeEnabled?: unknown
  documentStructureBaselineLock?: unknown
  collapsedGroupIds?: unknown
  selectedNodeId?: unknown
  selectedEdgeId?: unknown
}

const normalizeString = (value: unknown): string => String(value || '').trim()

const readCollapsedGroupIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (let i = 0; i < value.length; i += 1) {
    const id = normalizeString(value[i])
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const readTopologyGraph = (graphData: GraphData | null, graphDataRevision: number, stage: string): GraphData | null => {
  if (!graphData) return null
  if (readGraphTopologySummary(graphData)) return graphData
  return withGraphTopologyMetadata({
    graphData,
    graphRevision: graphDataRevision,
    stage,
    annotate: false,
  }) || graphData
}

const readGraphNodeIds = (graphData: GraphData | null): string[] => {
  if (!graphData || !Array.isArray(graphData.nodes)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const node of graphData.nodes) {
    const id = normalizeString(node?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

const readGraphEdgeIds = (graphData: GraphData | null): string[] => {
  if (!graphData || !Array.isArray(graphData.edges)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const edge of graphData.edges) {
    const id = normalizeString(edge?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export const inspectLocalCanvasTopology = (args: LocalCanvasTopologyInspectionArgs) => {
  const graphData = args.graphData || null
  const documentName = normalizeString(args.markdownDocumentName)
  const markdownText = typeof args.markdownDocumentText === 'string' ? args.markdownDocumentText : null
  const canvasRenderMode = normalizeString(args.canvasRenderMode) || '2d'
  const canvas2dRenderer = resolveCanvas2dRendererId(args.canvas2dRenderer) || DEFAULT_CANVAS_2D_RENDERER
  const documentSemanticMode = normalizeString(args.documentSemanticMode) || 'document'
  const graphDataRevision = typeof args.graphDataRevision === 'number' && Number.isFinite(args.graphDataRevision)
    ? args.graphDataRevision
    : 0
  const selectedNodeId = normalizeString(args.selectedNodeId) || null
  const selectedEdgeId = normalizeString(args.selectedEdgeId) || null

  if (!graphData) {
    return {
      available: false,
      sourceKind: 'browser-local-canvas',
      graphScope: 'none',
      documentName: documentName || '',
      canvasRenderMode,
      canvas2dRenderer,
      documentSemanticMode,
      selectedNodeId,
      selectedEdgeId,
      message: 'No active canvas graph is loaded in the local AgenticGraph workspace.',
    }
  }

  const graphScope = documentSemanticMode === 'keyword' ? 'baseline-graph' : 'active-render-graph'
  const frontmatterOnlyPolicyActive = isFrontmatterOnlyPolicyActive({
    canvasRenderMode,
    canvas2dRenderer: canvas2dRenderer as Parameters<typeof isFrontmatterOnlyPolicyActive>[0]['canvas2dRenderer'],
  })
  const effectiveDocumentSemanticMode = frontmatterOnlyPolicyActive ? 'document' : documentSemanticMode
  const effectiveFrontmatterModeEnabled = frontmatterOnlyPolicyActive ? true : args.frontmatterModeEnabled === true
  const effectiveMultiDimTableModeEnabled = frontmatterOnlyPolicyActive ? false : args.multiDimTableModeEnabled === true
  const renderSurface = resolveCanvasRenderBudgetSurface({ canvasRenderMode, canvas2dRenderer })
  const collapsedGroupIds = readCollapsedGroupIds(args.collapsedGroupIds)

  const activeViewGraph = (() => {
    if (documentSemanticMode === 'keyword') return graphData
    if (canvasRenderMode === '2d' && canvas2dRenderer === 'flowchart') {
      return deriveFlowchartFrontmatterActiveViewGraph({
        graphData,
        markdownText,
      }) || graphData
    }
    return deriveGraphDataForActiveView({
      graphData,
      frontmatterModeEnabled: effectiveFrontmatterModeEnabled,
      multiDimTableModeEnabled: effectiveMultiDimTableModeEnabled,
      documentSemanticMode: effectiveDocumentSemanticMode,
      documentStructureBaselineLock: args.documentStructureBaselineLock === true,
      collapsedGroupIds,
    })
  })()

  const activeViewTopologyGraph = readTopologyGraph(activeViewGraph, graphDataRevision, 'webmcp-local-canvas-active-view')
  const budgetedGraph = applyCanvasRenderBudget({
    graphData: activeViewTopologyGraph,
    graphRevision: graphDataRevision,
    surface: renderSurface,
    documentSemanticMode: effectiveDocumentSemanticMode,
  })
  const renderTopologyGraph = readTopologyGraph(budgetedGraph, graphDataRevision, 'webmcp-local-canvas-render')
  const graphTopology = readGraphTopologySummary(renderTopologyGraph)

  return {
    available: true,
    sourceKind: 'browser-local-canvas',
    graphScope,
    activeViewAccurate: documentSemanticMode !== 'keyword',
    documentName: documentName || 'document.md',
    canvasRenderMode,
    canvas2dRenderer,
    renderSurface,
    documentSemanticMode,
    selectedNodeId,
    selectedEdgeId,
    collapsedGroupCount: collapsedGroupIds.length,
    subgraphCount: readSubgraphs(renderTopologyGraph).length,
    graphNodeIds: readGraphNodeIds(renderTopologyGraph),
    graphEdgeIds: readGraphEdgeIds(renderTopologyGraph),
    graphTopology,
    message: documentSemanticMode === 'keyword'
      ? 'Keyword semantic mode currently reports baseline graph topology because the active keyword render graph is not bridged into WebMCP yet.'
      : null,
  }
}
