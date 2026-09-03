import { createStoryboardWidgetWorkflowPublicationTransaction } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowPublicationTransaction'
import { mergeStoryboardWidgetRunInputTopology } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextPublicationGraph'
import type { GraphData } from '@/lib/graph/types'

export function testTerminalPublicationRepairsLaggingCanonicalAuthorityFromUnchangedDraft() {
  const draft: GraphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'n1', type: 'TextGeneration', label: 'Widget Card', properties: { prompt: '@agentic-graph.probe-tree' } },
      {
        id: 'n2',
        type: 'RichMediaPanel',
        label: 'Probe-Tree Branches',
        properties: {
          output: '# Probe-Tree Branches',
          richMediaActiveTab: 'text',
          workflowOutputKey: 'probe-tree-branches',
        },
      },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'probe-tree-branches', properties: {} }],
  }
  let published: GraphData | null = null
  let refreshCount = 0
  const transaction = createStoryboardWidgetWorkflowPublicationTransaction({
    readLiveDraftGraphData: () => draft,
    commitDraftGraphDataUpdate: () => { throw new Error('unchanged terminal draft must not take the draft-only path') },
    commitPublishedGraphData: graphData => { published = graphData },
    updateNode: () => undefined,
    scheduleWorkflowOutputEdgeRefresh: () => { refreshCount += 1 },
  })
  const committed = transaction?.finish({
    preferPublishedGraphCommit: true,
    updatedNodeIds: ['n2'],
  })
  if (!committed || published !== draft || refreshCount !== 1) {
    throw new Error(`expected explicit terminal publication to republish the current draft, got ${JSON.stringify({ committed, published: Boolean(published), refreshCount })}`)
  }
}

export function testTextPublicationPreservesIncomingRichMediaWidgetTopology() {
  const richMediaToWidget = {
    id: 'rich-media-to-widget',
    source: 'n2',
    target: 'n3',
    label: 'output',
    properties: {},
  }
  const sourceGraph: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'TextGeneration', label: 'Widget Card', properties: {} },
      { id: 'n2', type: 'RichMediaPanel', label: 'Rich Media Panel', properties: {} },
      { id: 'n3', type: 'TextGeneration', label: 'Widget Card', properties: {} },
    ],
    edges: [
      { id: 'widget-to-rich-media', source: 'n1', target: 'n2', label: 'output', properties: {} },
      richMediaToWidget,
    ],
  }
  const mutatedPublicationGraph: GraphData = {
    ...sourceGraph,
    edges: [sourceGraph.edges[0]!],
  }
  const repaired = mergeStoryboardWidgetRunInputTopology({
    graphData: mutatedPublicationGraph,
    sourceGraphData: sourceGraph,
    anchorNodeId: 'n3',
  })
  const stable = mergeStoryboardWidgetRunInputTopology({
    graphData: repaired,
    sourceGraphData: sourceGraph,
    anchorNodeId: 'n3',
  })
  if (
    repaired.edges.length !== 2
    || repaired.edges[0]?.id !== 'widget-to-rich-media'
    || repaired.edges[1] !== richMediaToWidget
    || stable !== repaired
  ) {
    throw new Error(`expected n1 -> Rich Media n2 -> Widget n3 topology to survive publication without edge mutation, got ${JSON.stringify(repaired)}`)
  }
}
