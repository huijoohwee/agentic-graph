import {
  WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
  WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { createStoryboardWidgetTextOutputHarness as createTextOutputHarness } from '@/tests/lib/storyboardWidgetTextOutputHarness'

export function testSelectedGenerationConnectsResultDuringRunAll() {
  const selectedChild: GraphNode = {
    id: 'mcp-response-n1-qa1',
    type: 'TextGeneration',
    label: 'Selected Probe child',
    properties: { parentNodeId: 'n1', probeTreeThreadRootId: 'n1', cardTypeLabel: 'Probe-Tree Card' },
  }
  const secondSelectedChild: GraphNode = {
    ...selectedChild,
    id: 'mcp-response-n1-qa2',
    label: 'Second selected Probe child',
  }
  const graph: GraphData = { type: 'Graph', nodes: [selectedChild, secondSelectedChild], edges: [] }
  const harness = createTextOutputHarness(graph, graph, false)

  for (const [index, anchorNode] of [selectedChild, secondSelectedChild].entries()) harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode,
    outputText: `# Generated result ${index + 1}`,
    title: 'Generated Result',
    model: 'test-model',
    outputKey: 'probe-tree-generated-result',
    outputGroupId: 'probe-tree:n1',
    panelLabel: 'Generated Result',
    panelProperties: { probeTreeTerminalGeneration: true },
    allowCreateStandaloneOutput: true,
    connectCreatedOutputToAnchor: true,
  })

  const published = harness.readGraph()
  const resultPanels = published.nodes.filter(node => node.label === 'Generated Result')
  const resultEdges = published.edges.filter(edge => edge.properties?.workflowOutputEdge === true)
  if (
    published.nodes.length !== 4
    || resultPanels.length !== 2
    || resultEdges.length !== 2
    || resultEdges.some(edge => edge.label !== 'probe-tree-generated-result')
    || resultEdges.some(edge => edge.properties?.[FLOW_EDGE_SOURCE_PORT_KEY] !== 'text_out')
    || resultEdges.some(edge => edge.properties?.[FLOW_EDGE_TARGET_PORT_KEY] !== 'output')
    || resultPanels.some(panel => panel.properties.workflowOutputKey !== 'probe-tree-generated-result')
    || resultPanels.some(panel => panel.properties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY])
    || ![selectedChild.id, secondSelectedChild.id].every(sourceId => resultEdges.some(edge => edge.source === sourceId))
  ) {
    throw new Error(`expected Run All terminal generation to publish one connected result per selected child, got ${JSON.stringify(published)}`)
  }
}

export function testRunAllReconcilesTypedPersistedStandaloneResult() {
  const selectedChild: GraphNode = {
    id: 'mcp-response-card-01',
    type: 'TextGeneration',
    label: 'Selected Probe child',
    properties: { parentNodeId: 'n2', probeTreeThreadRootId: 'n2', cardTypeLabel: 'Probe-Tree Card' },
  }
  const persistedResult: GraphNode = {
    id: 'persisted-generated-result',
    type: 'RichMediaPanel',
    label: 'Generated Result',
    properties: {
      key: 'properties',
      type: 'object',
      value: {
        media_interactive: true,
        output: '# Previous generated result',
        workflowOutputAnchorNodeId: 'mcp-response-card-01',
        workflowOutputKey: 'probe-tree-generated-result',
        workflowOutputGroupId: 'probe-tree:n2',
        [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
      },
    } as never,
  }
  const runGraph: GraphData = { type: 'Graph', nodes: [selectedChild], edges: [] }
  const canonicalGraph: GraphData = { type: 'Graph', nodes: [selectedChild, persistedResult], edges: [] }
  const harness = createTextOutputHarness(runGraph, canonicalGraph, false, { commitPublishedGraphData: false })

  const published = harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: selectedChild,
    baseGraphData: runGraph,
    outputText: '# Refreshed generated result',
    title: 'Generated Result',
    model: 'test-model',
    outputKey: 'probe-tree-generated-result',
    outputGroupId: 'probe-tree:n2',
    panelLabel: 'Generated Result',
    panelProperties: { probeTreeTerminalGeneration: true },
    allowCreateStandaloneOutput: true,
    connectCreatedOutputToAnchor: true,
  })
  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: selectedChild,
    baseGraphData: runGraph,
    outputText: '# Refreshed generated result',
    title: 'Generated Result',
    model: 'test-model',
    outputKey: 'probe-tree-generated-result',
    outputGroupId: 'probe-tree:n2',
    panelLabel: 'Generated Result',
    panelProperties: { probeTreeTerminalGeneration: true },
    allowCreateStandaloneOutput: true,
    connectCreatedOutputToAnchor: true,
  })

  const reconciled = harness.readGraph()
  const resultPanels = reconciled.nodes.filter(node => node.label === 'Generated Result')
  const resultEdge = reconciled.edges.find(edge => edge.source === selectedChild.id && edge.target === persistedResult.id)
  const resultProperties = resultPanels[0]?.properties as unknown as {
    key?: unknown
    type?: unknown
    value?: Record<string, unknown>
  }
  if (
    !published
    || reconciled.nodes.length !== 2
    || reconciled.edges.length !== 1
    || resultEdge?.label !== 'probe-tree-generated-result'
    || resultEdge?.properties?.workflowOutputEdge !== true
    || resultPanels.length !== 1
    || resultPanels[0]?.id !== 'persisted-generated-result'
    || resultProperties.key !== 'properties'
    || resultProperties.type !== 'object'
    || resultProperties.value?.output !== '# Refreshed generated result'
    || resultProperties.value?.workflowOutputAnchorNodeId !== 'mcp-response-card-01'
    || resultProperties.value?.[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]
  ) {
    throw new Error(`expected Run All to atomically reconnect the typed persisted result without duplicates, got ${JSON.stringify(reconciled)}`)
  }
}
