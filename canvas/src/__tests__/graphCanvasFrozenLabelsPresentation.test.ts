import * as d3 from 'd3'
import { createLabelsLayer } from '@/components/GraphCanvas/layers/labels'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testFrozenNodeLabelsKeepPositionsOnPresentationRefresh() {
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
    // Paint and repaint after a user move without allowing any simulation tick.
    for (let pass = 0; pass < 2; pass += 1) {
      g.selectAll('*').remove()
      createLabelsLayer({
        g, nodes, schema: defaultSchema, labelsSelRef: { current: null },
        selectNode: () => {}, selectEdge: () => {}, setSelectionSource: () => {},
      })
      for (const node of nodes) {
        const label = svg.querySelector(`text[data-node-id="${node.id}"]`)
        if (!label || label.textContent !== node.label ||
          label.getAttribute('x') !== String(node.x) || label.getAttribute('y') !== String(node.y)) {
          throw new Error(`Frozen label ${node.id} lost its text or position during paint ${pass}`)
        }
      }
      nodes[0]!.x = 0
      nodes[0]!.y = 320
    }
  } finally {
    simulation.stop()
    restore()
  }
}
