import { finalizeEdgeAuthoring } from '@/features/edge-creation/authoring'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export function testStoryboardManyToOneAuthoringRetainsEveryInboundEdge() {
  const sources: GraphNode[] = [
    { id: 'probe-card-a', type: 'TextGeneration', label: 'Probe A', properties: {} },
    { id: 'probe-card-b', type: 'TextGeneration', label: 'Probe B', properties: {} },
    { id: 'rich-media-panel', type: 'RichMediaPanel', label: 'Rich Media Panel', properties: {} },
  ]
  const target: GraphNode = {
    id: 'widget-card',
    type: 'TextGeneration',
    label: 'Widget Card',
    properties: { prompt: 'Generate a text response for the active request.' },
  }
  let graph: GraphData = { type: 'Graph', nodes: [...sources, target], edges: [] }

  for (const source of sources) {
    const authored = finalizeEdgeAuthoring({
      mode: 'create',
      data: graph,
      schema: null,
      label: 'linksTo',
      selectedEdgeId: null,
      from: { nodeId: source.id, portKey: null },
      to: { nodeId: target.id, portKey: null },
    })
    if (authored.kind !== 'create') {
      throw new Error(`expected independent inbound edge from ${source.id}, got ${JSON.stringify(authored)}`)
    }
    graph = { ...graph, edges: [...graph.edges, authored.edge] }
  }

  const inbound = graph.edges.filter(edge => edge.target === target.id)
  if (
    inbound.length !== sources.length
    || new Set(inbound.map(edge => edge.id)).size !== sources.length
    || inbound.map(edge => edge.source).join(',') !== sources.map(source => source.id).join(',')
  ) {
    throw new Error(`expected all many-to-one inputs to remain authored, got ${JSON.stringify(inbound)}`)
  }
}
