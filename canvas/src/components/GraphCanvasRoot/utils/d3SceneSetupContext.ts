import { withD3FlowchartSceneSchema } from '@/lib/canvas/d3FlowchartSchemaOverrides'
import { isD3Like2dRenderer } from '@/lib/config.render'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { sketchPresentationKey } from '@/lib/graph/canvasSketch'
import { hashSignatureParts } from '@/lib/hash/signature'

export type D3SceneSetupContext = {
  graphKind: string
  isD3LikeRenderer: boolean
  isFlowchart: boolean
  schemaForScene: GraphSchema
  hoverEnabled: boolean
  zoomOnDoubleClick: boolean
  graphMetaKey: string
  buildKey: string
  isMermaidLayout: boolean
}

export function buildD3SceneGraphShapeKey(graphData: GraphData): string {
  const nodes = Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : []
  const edges = Array.isArray(graphData.edges) ? (graphData.edges as GraphEdge[]) : []
  const nodeParts = nodes
    .map(node => {
      const props = node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
        ? (node.properties as Record<string, unknown>)
        : {}
      return [
        String(node.id || ''),
        String(node.type || ''),
        String(props['visual:shape'] || ''),
        String(props.mermaidScope || ''),
        String(props['visual:parentId'] || ''),
      ].join(':')
    })
    .sort((left, right) => left.localeCompare(right))
  const edgeParts = edges
    .map(edge => {
      const endpoints = readGraphEdgeEndpoints(edge)
      return [
        String((edge as unknown as { id?: unknown }).id || ''),
        String(edge.label || ''),
        String(endpoints.src || ''),
        String(endpoints.tgt || ''),
      ].join(':')
    })
    .sort((left, right) => left.localeCompare(right))
  return hashSignatureParts([
    'd3-scene-graph-shape',
    nodes.length,
    edges.length,
    ...nodeParts,
    ...edgeParts,
  ])
}

export function buildD3SceneSetupContext(args: {
  sceneGraphData: GraphData
  schema: GraphSchema
  canvasRenderMode: '2d' | '3d'
  canvas2dRenderer: string | null
  coarsePointer: boolean
  schemaLayoutEngineJson: string
  effectiveFrontmatterModeEnabled: boolean
  documentSemanticMode: 'document' | 'keyword'
  renderMediaAsNodes: boolean
  mediaPanelDensity: 'default' | 'compact'
  collapsedGroupIdsKey: string
  enableEditorGestures: boolean
  graphContentRevision: number
  infiniteCanvasInteractionMode: string
}): D3SceneSetupContext {
  const graphKind = (() => {
    const metadata = (args.sceneGraphData.metadata || {}) as Record<string, unknown>
    return typeof metadata.graphKind === 'string' ? metadata.graphKind : ''
  })()
  const isD3LikeRenderer = args.canvasRenderMode === '2d' && isD3Like2dRenderer((args.canvas2dRenderer || null) as never)
  const isFlowchart = isD3LikeRenderer && graphKind === 'flowchart'
  const schemaForScene = withD3FlowchartSceneSchema({
    schema: args.schema,
    graphData: args.sceneGraphData,
    canvasRenderMode: args.canvasRenderMode,
    canvas2dRenderer: String(args.canvas2dRenderer || ''),
  })
  const hoverEnabled = args.schema.behavior?.hover?.enabled !== false && !args.coarsePointer
  const expansionCfg = args.schema.behavior?.expansion || {}
  const expansionEnabled = expansionCfg.enabled !== false
  const zoomOnDoubleClick = expansionEnabled && expansionCfg.zoomOnDoubleClick !== false
  const graphMetaKey = `${buildGraphMetaKeyIgnoringPending(args.sceneGraphData)}:shape:${buildD3SceneGraphShapeKey(args.sceneGraphData)}`
  // Keep scene rebuilds semantic-only so pane/viewport changes do not drift layout.
  const buildKey = [
    String(args.graphContentRevision || 0),
    sketchPresentationKey(args.sceneGraphData.nodes),
    args.schemaLayoutEngineJson,
    String(args.effectiveFrontmatterModeEnabled ? 1 : 0),
    String(args.documentSemanticMode),
    graphMetaKey,
    `${String(args.sceneGraphData?.nodes?.length ?? 0)}:${String(args.sceneGraphData?.edges?.length ?? 0)}`,
    String(isFlowchart ? 0 : (args.renderMediaAsNodes ? 1 : 0)),
    String(isFlowchart ? '' : args.mediaPanelDensity),
    args.collapsedGroupIdsKey,
    String(args.infiniteCanvasInteractionMode),
  ].join('|')
  const isMermaidLayout = (() => {
    const graphData = args.sceneGraphData as unknown as { context?: unknown; metadata?: unknown } | null
    if (!graphData) return false
    if (String(graphData.context || '') === 'frontmatter-mermaid') return true
    const metadata = graphData.metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
    return String((metadata as Record<string, unknown>).layoutEngine || '') === 'mermaid'
  })()

  return {
    graphKind,
    isD3LikeRenderer,
    isFlowchart,
    schemaForScene,
    hoverEnabled,
    zoomOnDoubleClick,
    graphMetaKey,
    buildKey,
    isMermaidLayout,
  }
}
