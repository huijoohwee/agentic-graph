import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
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
