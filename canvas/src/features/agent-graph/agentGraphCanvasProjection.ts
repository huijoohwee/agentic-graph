import { useGraphStore } from '@/hooks/useGraphStore'
import { persistGraphDataToLocalStorage } from '@/hooks/store/graphDataPersistence'
import type { WorkspaceAgentGraphImportProgress, WorkspaceAgentGraphImportResult } from '@/features/markdown-explorer/workspaceActionBridge'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { hasSameReadOnlyAgentGraphProjectionIdentity } from './agentGraphProjectionPolicy'
import { fitAgentGraphProjectionRecords, retainBoundedAgentGraphProjectionRecord } from '../../../../mcp/agent-graph/projection-budget.mjs'
import {
  AgentGraphProjectionError, AGENT_GRAPH_CANVAS_MAX_BYTES, AGENT_GRAPH_CANVAS_MAX_EDGES, AGENT_GRAPH_CANVAS_MAX_NODES,
  AGENT_GRAPH_CANVAS_PREVIEW_SCHEMA, buildAgentGraphCanvasProjection, cleanString, cloneAgentGraphNodeWithDirectory,
  cloneEdge, cloneNode, isLogicalRelativePath, isPositiveInteger, validateGraphData,
} from './agentGraphCanvasProjectionBuilder'
export {
  AGENT_GRAPH_CANVAS_MAX_BYTES, AGENT_GRAPH_CANVAS_MAX_EDGES, AGENT_GRAPH_CANVAS_MAX_NODES, AGENT_GRAPH_CANVAS_MAX_RECORD_BYTES,
  AGENT_GRAPH_CANVAS_PREVIEW_SCHEMA, AGENT_GRAPH_CANVAS_PROJECTION_SCHEMA, AgentGraphProjectionError,
  buildAgentGraphCanvasProjection, cloneAgentGraphNodeWithDirectory,
} from './agentGraphCanvasProjectionBuilder'

let nextAgentGraphPreviewSessionId = 1

type ValidatedAgentGraphProgress = Omit<WorkspaceAgentGraphImportProgress, 'graphData'> & { graphData: GraphData }

function validateAgentGraphProgress(
  progress: WorkspaceAgentGraphImportProgress,
): ValidatedAgentGraphProgress {
  if (
    !progress
    || progress.schema !== 'agentic-graph-agent-graph-import-progress/v1'
    || progress.kind !== 'source-parsed'
    || !/^kg:graph:[0-9a-f]{32}$/.test(cleanString(progress.graphId))
    || !/^[0-9a-f]{64}$/.test(cleanString(progress.parserRegistryDigest))
    || !cleanString(progress.sourcePath)
    || !isLogicalRelativePath(cleanString(progress.sourcePath))
    || !isPositiveInteger(progress.sourceIndex)
    || !isPositiveInteger(progress.sourceTotal)
    || progress.sourceIndex > progress.sourceTotal
    || typeof progress.truncated !== 'boolean'
  ) {
    throw new AgentGraphProjectionError('invalid-progress-frame', 'Knowledge graph import progress did not return a valid source fragment.')
  }
  const graphData = validateGraphData(progress.graphData, {
    sources: progress.sourceIndex,
    nodes: Array.isArray(progress.graphData?.nodes) ? progress.graphData.nodes.length : 0,
    edges: Array.isArray(progress.graphData?.edges) ? progress.graphData.edges.length : 0,
  })
  return {
    ...progress,
    graphData: {
      ...graphData,
      nodes: graphData.nodes.map(cloneNode),
      edges: graphData.edges.map(cloneEdge),
    },
  }
}

function isAgentGraphPreview(graphData: GraphData | null | undefined, sessionId: string): boolean {
  const preview = graphData?.metadata?.agentGraphPreview as Record<string, unknown> | undefined
  return preview?.owner === 'agent-graph-runtime-preview'
    && preview.sessionId === sessionId
}

export function prepareAgentGraphCanvasView(options: { activateSource?: boolean } = {}): void {
  const initialState = useGraphStore.getState()
  if (
    initialState.documentStructureBaselineLock === true
    && initialState.canvas2dRenderer !== 'd3'
  ) {
    throw new AgentGraphProjectionError(
      'graph-view-unavailable',
      'Knowledge graph import cannot change the renderer while the document baseline is locked.',
    )
  }
  if (options.activateSource) {
    initialState.setMarkdownDocument(null, null, { autoEnableFrontmatter: false, applyViewPreset: false })
    initialState.setMarkdownDocumentSourceUrl(null)
  }
  if (initialState.canvasRenderMode !== '2d') initialState.setCanvasRenderMode('2d')
  const modeState = useGraphStore.getState()
  if (modeState.canvas2dRenderer !== 'd3') modeState.setCanvas2dRenderer('d3')
  const graphViewState = useGraphStore.getState()
  if (graphViewState.canvasRenderMode !== '2d' || graphViewState.canvas2dRenderer !== 'd3') {
    throw new AgentGraphProjectionError(
      'graph-view-unavailable',
      'Knowledge graph import could not open the required 2D Graph view.',
    )
  }
}
export type AgentGraphCanvasPreviewSession = { apply: (progress: WorkspaceAgentGraphImportProgress) => GraphData; commit: (result: WorkspaceAgentGraphImportResult) => GraphData; rollback: () => void }

/** Keeps a bounded verified visual preview; the final immutable snapshot replaces it atomically. */
export function createAgentGraphCanvasPreviewSession(): AgentGraphCanvasPreviewSession {
  const baseline = useGraphStore.getState()
  const baselineGraphData = baseline.graphData
  const baselineGraphDataRevision = baseline.graphDataRevision
  const baselineGraphContentRevision = baseline.graphContentRevision
  const baselineDocLocationRevision = baseline.docLocationRevision
  const baselineCanvasRenderMode = baseline.canvasRenderMode
  const baselineCanvas2dRenderer = baseline.canvas2dRenderer
  const sessionId = `agent-graph-preview-${nextAgentGraphPreviewSessionId}`
  nextAgentGraphPreviewSessionId += 1
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  let graphId = ''
  let parserRegistryDigest = ''
  let sourceIndex = 0
  let sourceTotal = 0
  let truncated = false
  let previewPublished = false
  let complete = false
  let publishedBucket = -1

  const buildPreviewGraph = (): GraphData => {
    const buildGraph = (previewNodes: GraphNode[], previewEdges: GraphEdge[], previewTruncated: boolean): GraphData => ({
      context: 'agentic-graph-agent-graph-projection',
      type: 'Graph',
      metadata: {
        kind: 'agent-graph',
        source: graphId,
        agentGraphPreview: {
          schema: AGENT_GRAPH_CANVAS_PREVIEW_SCHEMA,
          owner: 'agent-graph-runtime-preview',
          readOnly: true,
          sessionId,
          graphId,
          parserRegistryDigest,
          complete: false,
          sourceIndex,
          sourceTotal,
          truncated: previewTruncated,
        },
      },
      nodes: previewNodes,
      edges: previewEdges,
    })
    const fitted = fitAgentGraphProjectionRecords({
      nodes: nodes.values(),
      edges: edges.values(),
      maxBytes: AGENT_GRAPH_CANVAS_MAX_BYTES,
      buildGraphData: (previewNodes: GraphNode[], previewEdges: GraphEdge[]) => (
        buildGraph(previewNodes, previewEdges, false)
      ),
    })
    truncated = truncated || fitted.truncated
    nodes.clear()
    edges.clear()
    for (const node of fitted.nodes as GraphNode[]) nodes.set(node.id, node)
    for (const edge of fitted.edges as GraphEdge[]) edges.set(edge.id, edge)
    return validateGraphData(buildGraph(fitted.nodes as GraphNode[], fitted.edges as GraphEdge[], truncated), {
      sources: sourceIndex,
      nodes: fitted.nodes.length,
      edges: fitted.edges.length,
    }, AGENT_GRAPH_CANVAS_MAX_BYTES)
  }

  const publishPreview = (graphData: GraphData): void => {
    prepareAgentGraphCanvasView()
    useGraphStore.setState(state => ({
      graphData,
      graphDataRevision: (state.graphDataRevision || 0) + 1,
      graphContentRevision: (state.graphContentRevision || 0) + 1,
      docLocationRevision: (state.docLocationRevision || 0) + 1,
      graphValidationStatus: null,
      graphValidationTimestamp: null,
      lifecycleStage: 'committed',
    }))
    previewPublished = true
  }

  return {
    apply(progress) {
      if (complete) {
        throw new AgentGraphProjectionError('progress-after-complete', 'Knowledge graph preview received progress after completion.')
      }
      const validated = validateAgentGraphProgress(progress)
      if (!graphId) {
        graphId = validated.graphId
        parserRegistryDigest = validated.parserRegistryDigest
      } else if (graphId !== validated.graphId || parserRegistryDigest !== validated.parserRegistryDigest) {
        throw new AgentGraphProjectionError('progress-identity-mismatch', 'Knowledge graph preview changed graph identity mid-import.')
      }
      if (validated.sourceIndex !== sourceIndex + 1 || (sourceTotal && sourceTotal !== validated.sourceTotal)) {
        throw new AgentGraphProjectionError('progress-order-invalid', 'Knowledge graph preview received out-of-order source progress.')
      }
      sourceIndex = validated.sourceIndex
      sourceTotal = validated.sourceTotal
      truncated = truncated || validated.truncated
      for (const node of validated.graphData.nodes) {
        truncated = retainBoundedAgentGraphProjectionRecord(nodes, node, AGENT_GRAPH_CANVAS_MAX_NODES) || truncated
      }
      for (const edge of validated.graphData.edges) {
        truncated = retainBoundedAgentGraphProjectionRecord(edges, edge, AGENT_GRAPH_CANVAS_MAX_EDGES) || truncated
      }
      const graphData = buildPreviewGraph()
      const bucket = Math.floor((sourceIndex - 1) * 31 / sourceTotal)
      // Keep XR and its document owner intact until the verified final commit.
      // At most 32 preview publications, regardless of source-file count.
      if (baselineCanvasRenderMode === '2d' && (bucket !== publishedBucket || sourceIndex === sourceTotal)) {
        if (graphData.nodes.length || graphData.edges.length) publishPreview(graphData)
        publishedBucket = bucket
      }
      return graphData
    },
    commit(result) {
      const graphData = applyAgentGraphCanvasProjection(result)
      complete = true
      previewPublished = false
      return graphData
    },
    rollback() {
      if (!previewPublished || complete) return
      const current = useGraphStore.getState()
      if (!isAgentGraphPreview(current.graphData, sessionId)) return
      useGraphStore.setState({
        graphData: baselineGraphData,
        graphDataRevision: baselineGraphDataRevision,
        graphContentRevision: baselineGraphContentRevision,
        docLocationRevision: baselineDocLocationRevision,
        graphValidationStatus: null,
        graphValidationTimestamp: null,
        lifecycleStage: 'committed',
      })
      const restored = useGraphStore.getState()
      if (restored.canvasRenderMode !== baselineCanvasRenderMode) {
        restored.setCanvasRenderMode(baselineCanvasRenderMode)
      }
      const rendererState = useGraphStore.getState()
      if (rendererState.canvas2dRenderer !== baselineCanvas2dRenderer) {
        rendererState.setCanvas2dRenderer(baselineCanvas2dRenderer)
      }
      previewPublished = false
    },
  }
}
export function applyAgentGraphCanvasProjection(
  result: WorkspaceAgentGraphImportResult,
  setGraphData: (graphData: GraphData) => void = graphData => {
    prepareAgentGraphCanvasView({ activateSource: true })
    const current = useGraphStore.getState().graphData
    if (current && hasSameReadOnlyAgentGraphProjectionIdentity(current, graphData)) {
      const refreshed = { ...current, metadata: { ...current.metadata, agentGraphProjection: graphData.metadata!.agentGraphProjection } }
      useGraphStore.setState(state => ({ graphData: refreshed, graphDataRevision: state.graphDataRevision + 1 }))
      persistGraphDataToLocalStorage(refreshed)
      return
    }
    useGraphStore.getState().setGraphData(graphData)
  },
): GraphData {
  const graphData = buildAgentGraphCanvasProjection(result)
  setGraphData(graphData)
  return graphData
}
