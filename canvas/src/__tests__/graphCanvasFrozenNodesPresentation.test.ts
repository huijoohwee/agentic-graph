import * as d3 from 'd3'
import { createNodesLayer } from '@/components/GraphCanvas/layers/nodes'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import type { TempLinkSelection } from '@/features/edge-creation'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testFrozenCircleNodesKeepPositionsOnPresentationRefresh() {
  const { dom, restore } = initJsdomHarness()
  const nodes: GraphNode[] = [
    { id: 'source-a', type: 'Entity', label: 'Source A', properties: {}, x: 180, y: 240 },
    { id: 'source-b', type: 'Entity', label: 'Source B', properties: {}, x: -120, y: 80 },
    { id: 'source-c', type: 'Entity', label: 'Source C', properties: {}, x: 0, y: -160 },
  ]
  const simulation = d3.forceSimulation<GraphNode, GraphEdge>(nodes).stop()
  try {
    const svg = dom.window.document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    dom.window.document.body.append(svg)
    const g = d3.select(svg).append('g') as d3.Selection<SVGGElement, unknown, null, undefined>
    const render = () => createNodesLayer({
      g, graphData: { type: 'graph', nodes, edges: [] },
      schema: { ...defaultSchema, behavior: { ...defaultSchema.behavior, nodeShapeMode: 'circle' } },
      zoomOnDoubleClick: false, renderMediaAsNodes: false, mediaPanelDensity: 'default',
      tempLinkSelRef: { current: {} as TempLinkSelection }, linkDragRef: { current: null },
      simulation, addEdge: () => {}, updateEdge: () => {}, getSelectedEdgeId: () => null,
      selectNode: () => {}, selectEdge: () => {}, setSelectionSource: () => {},
      requestZoomSelection: () => {}, toggleGroupCollapsed: () => {},
    })
    // Neither initial paint nor a presentation-only rebuild may rely on a tick.
    for (let pass = 0; pass < 2; pass += 1) {
      g.selectAll('*').remove()
      render()
      for (const node of nodes) {
        const circle = svg.querySelector(`circle[data-node-id="${node.id}"]`)
        if (!circle || circle.getAttribute('cx') !== String(node.x) || circle.getAttribute('cy') !== String(node.y)) {
          throw new Error(`Frozen node ${node.id} lost its coordinates during paint ${pass}`)
        }
      }
      // A later rebuild must paint the latest user position, including zero.
      nodes[0]!.x = 0
      nodes[0]!.y = 320
    }
  } finally {
    simulation.stop()
    restore()
  }
}
