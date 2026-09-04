import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import { runStoryboardWidgetNativeImportUrlInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowNativeImportUrlRun'
import {
  registerMarkdownWorkspaceActionBridge,
  type WorkspaceAgentGraphImportResult,
} from '@/features/markdown-explorer/workspaceActionBridge'
import { NATIVE_IMPORT_URL_INVOCATION_TEMPLATE } from '@/features/chat/nativeImportUrlInvocation'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export async function testStoryboardImportUrlPreservesImportedCanvasAuthority(): Promise<void> {
  useGraphStore.getState().resetAll()
  const importCard: GraphNode = {
    id: 'import-card',
    type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    label: 'Import URL',
    properties: { prompt: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE },
  }
  let draftGraph: GraphData = { type: 'Graph', nodes: [importCard], edges: [] }
  let liveCanvas = draftGraph
  let bridgeCalls = 0
  let persistCalls = 0
  const publishLiveCanvas = (next: GraphData) => {
    liveCanvas = next
    useGraphStore.setState(state => ({
      graphData: next,
      graphDataRevision: Number(state.graphDataRevision || 0) + 1,
    }))
  }
  publishLiveCanvas(draftGraph)
  const unregister = registerMarkdownWorkspaceActionBridge('storyboard-import-url-authority-test', {
    importUrl: async () => {
      bridgeCalls += 1
      const importedGraph: GraphData = {
        type: 'Graph',
        nodes: [{ id: 'imported', type: 'ImportedDocument', label: 'Imported document', properties: {} }],
        edges: [],
      }
      useGraphStore.setState({ markdownDocumentName: '/imported.md' })
      publishLiveCanvas(importedGraph)
      return { handled: true, createdPaths: ['/imported.md'], removedPaths: [] }
    },
  })
  try {
    const runner = createStoryboardWidgetWorkflowNodeRunner({
      baseGraphKind: 'frontmatter-flow',
      baseGraphData: draftGraph,
      readDraftGraphData: () => draftGraph,
      commitDraftGraphDataUpdate: (_current, next) => {
        draftGraph = next
        publishLiveCanvas(next)
      },
      commitPublishedGraphData: next => {
        draftGraph = next
        publishLiveCanvas(next)
      },
      persistDraftGraphData: next => {
        persistCalls += 1
        draftGraph = next
      },
      renderGraphDataOverride: null,
      markdownDocumentName: '/card.md',
      markdownDocumentSourceUrl: null,
      widgetRegistry: [],
      appendDraftNode: args => {
        const id = String(args.id || `n${draftGraph.nodes.length}`)
        const node: GraphNode = {
          id,
          type: args.type,
          label: args.label || id,
          x: args.x,
          y: args.y,
          properties: (args.properties || {}) as never,
        }
        draftGraph = { ...draftGraph, nodes: [...draftGraph.nodes, node] }
        publishLiveCanvas(draftGraph)
        return id
      },
      updateNode: (id, patch) => {
        draftGraph = {
          ...draftGraph,
          nodes: draftGraph.nodes.map(node => String(node.id) === id ? { ...node, ...patch } : node),
        }
        publishLiveCanvas(draftGraph)
      },
      upsertUiToast: () => undefined,
      scheduleOverlayEdgeUpdate: () => undefined,
    })
    await runner(importCard.id, { propagateErrors: true })
    const liveIds = liveCanvas.nodes.map(node => String(node.id || ''))
    if (bridgeCalls !== 1 || persistCalls !== 0 || liveIds.join(',') !== 'imported') {
      throw new Error(`expected Card Import URL to retain imported Canvas authority, got ${JSON.stringify({ bridgeCalls, persistCalls, liveIds })}`)
    }
  } finally {
    unregister()
    useGraphStore.getState().resetAll()
  }
}

export async function testStoryboardImportUrlRendersAgentGraphSuccessWithoutFilePaths(): Promise<void> {
  useGraphStore.getState().resetAll()
  const importCard: GraphNode = {
    id: 'agent-graph-import-card',
    type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    label: 'Import repository graph',
    properties: { prompt: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE },
  }
  useGraphStore.setState({
    graphData: { type: 'Graph', nodes: [importCard], edges: [] },
    graphDataRevision: 1,
    markdownDocumentName: '/card.md',
  })
  const agentGraphResult: WorkspaceAgentGraphImportResult = {
    handled: true,
    kind: 'agent-graph',
    graphId: 'kg:graph:0123456789abcdef0123456789abcdef',
    snapshotDigest: 'a'.repeat(64),
    parserRegistryDigest: 'f'.repeat(64),
    complete: true,
    counts: { sources: 1, nodes: 2, edges: 1 },
    projection: {
      token: 'kg:projection:0123456789abcdef01234567',
      readOnly: true,
      complete: true,
      truncated: false,
      limit: 1_000,
      graphData: {
        context: 'agentic-graph-agent-graph-projection',
        type: 'Graph',
        nodes: [
          { id: 'node:a', label: 'A', type: 'Symbol', properties: {} },
          { id: 'node:b', label: 'B', type: 'Symbol', properties: {} },
        ],
        edges: [{
          id: 'edge:a-b',
          source: 'node:a',
          target: 'node:b',
          label: 'depends_on',
          properties: {
            'evidence:explanation': 'A names B.',
            'evidence:sourcePath': 'src/index.ts',
            'evidence:sourceDigest': '1'.repeat(64),
            'evidence:excerptHash': '2'.repeat(64),
            'evidence:parserId': 'typescript-ast',
            'evidence:parserDigest': '3'.repeat(64),
            'evidence:ruleId': 'typescript.import',
          },
        }],
      },
    },
  }
  let bridgeCalls = 0
  let authorityChanges = 0
  let nodeProperties: Record<string, unknown> = { ...importCard.properties }
  const failures: string[] = []
  const toasts: string[] = []
  const published: Array<{ outputText: string; outputPath?: string | null; loading?: boolean }> = []
  const unregister = registerMarkdownWorkspaceActionBridge('storyboard-import-url-agent-graph-test', {
    importUrl: async () => {
      bridgeCalls += 1
      return agentGraphResult
    },
  })
  try {
    const handled = await runStoryboardWidgetNativeImportUrlInvocation({
      id: importCard.id,
      prompt: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE,
      node: importCard,
      updateOutput: buildPatch => {
        nodeProperties = buildPatch(nodeProperties)
      },
      publishOutput: output => {
        published.push(output)
        return null
      },
      upsertToast: toast => {
        toasts.push(toast.message)
      },
      reportFailure: message => {
        failures.push(message)
      },
      onCanvasAuthorityChanged: () => {
        authorityChanges += 1
      },
    })
    const graph = useGraphStore.getState().graphData
    if (
      handled !== true
      || bridgeCalls !== 1
      || authorityChanges !== 1
      || failures.length !== 0
      || !toasts.some(message => message.includes('2 nodes and 1 edges'))
      || graph.metadata?.kind !== 'agent-graph'
      || graph.nodes.length !== 2
      || published.length !== 1
      || published[0]?.loading !== true
      || published.some(output => Boolean(output.outputPath))
      || nodeProperties.workflowRunStatus !== 'running'
    ) {
      throw new Error(`expected Card Import URL to accept the path-free graph result, got ${JSON.stringify({
        handled,
        bridgeCalls,
        authorityChanges,
        failures,
        toasts,
        graphKind: graph.metadata?.kind,
        graphNodes: graph.nodes.length,
        published,
        workflowRunStatus: nodeProperties.workflowRunStatus,
      })}`)
    }
  } finally {
    unregister()
    useGraphStore.getState().resetAll()
  }
}
