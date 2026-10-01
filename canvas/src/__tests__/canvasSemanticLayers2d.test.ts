import { applyGraphCanvasZOrder } from '@/components/GraphCanvas/zOrder'
import assert from 'node:assert/strict'
import * as d3 from 'd3'
import { bindGraphSemanticTargets2d } from '@/components/GraphCanvas/semanticTargets2d'
import { createNodesLayer } from '@/components/GraphCanvas/layers/nodes'
import { defaultSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { startMediaOverlayLayoutLoop2d } from '@/lib/render/mediaOverlayLayoutLoop2d'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export function testCanvasSemanticTargetsReuseActions() {
  const { dom, restore } = initJsdomHarness(`<!doctype html><svg><g id="root">
    <g data-kg-layer="nodes"><circle data-node-id="a"/><rect data-node-id="b" data-kg-covered-by-media="1"/></g>
    <g data-kg-layer="labels"><text data-node-id="a">Alpha</text><text data-node-id="b">Beta</text></g>
    <g data-kg-layer="links-hit"><path data-edge-id="e"/></g>
    <g data-kg-layer="groups-hit"><rect data-kg-group-id="g"/></g>
    <text data-kg-group-label="1" data-kg-group-id="g" data-label-full="Collection">Collection</text>
  </g></svg>`)
  try {
    const root = dom.window.document.querySelector<SVGGElement>('#root')!
    const graph: GraphData = { type: 'graph', nodes: [
      { id: 'a', label: 'Alpha', type: 'Entity', properties: {} },
      { id: 'b', label: 'Beta', type: 'Entity', properties: {} },
    ], edges: [{ id: 'e', source: 'a', target: 'b', label: 'relates', type: 'relates', properties: {} }] }
    const target = root.querySelector<SVGElement>('circle')!
    const clicks: boolean[] = []
    target.addEventListener('click', event => clicks.push((event as MouseEvent).shiftKey))
    bindGraphSemanticTargets2d(root, graph)
    bindGraphSemanticTargets2d(root, graph)
    assert.equal(target.getAttribute('aria-label'), 'Node Alpha')
    assert.equal(target.getAttribute('role'), 'button')
    assert.equal(target.getAttribute('tabindex'), '0')
    target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, shiftKey: true }))
    target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', repeat: true }))
    assert.deepEqual(clicks, [true, false], 'rebinding must not duplicate activation; modifiers survive')
    assert.equal(root.querySelector('path')?.getAttribute('aria-label'), 'relates: Alpha → Beta')
    assert.equal(root.querySelector('[data-kg-layer="groups-hit"] rect')?.getAttribute('aria-label'), 'Cluster Collection')
    for (const covered of root.querySelectorAll<SVGElement>('[data-node-id="b"]')) {
      assert.equal(covered.style.pointerEvents, 'none')
      assert.equal(covered.hasAttribute('tabindex'), false)
    }
  } finally { restore() }
}

export function testCanvasNodesPaintLargerUnderneath() {
  const { dom, restore } = initJsdomHarness('<!doctype html><svg></svg>')
  try {
    const root = d3.select(dom.window.document.querySelector('svg')!).append('g')
    const nodes: GraphNode[] = [
      { id: 'small', label: 'Small', type: 'Entity', properties: { 'visual:width': 30, 'visual:height': 30, 'visual:shape': 'rect' } },
      { id: 'large', label: 'Large', type: 'Entity', properties: { 'visual:width': 300, 'visual:height': 300, 'visual:shape': 'rect' } },
      { id: 'raised', label: 'Raised', type: 'Entity', properties: { 'visual:width': 500, 'visual:height': 500, 'visual:shape': 'rect', 'visual:zIndex': 2 } },
    ]
    const graph: GraphData = { type: 'graph', nodes, edges: [] }
    const simulation = d3.forceSimulation(nodes).stop()
    createNodesLayer({ g: root as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
      graphData: graph, schema: { ...defaultSchema, behavior: { ...defaultSchema.behavior, allowNodeDrag: false } },
      nodeZKeyById: new Map(nodes.map((node, i) => [node.id, { id: node.id, groupDepth: i, groupSize: 3 - i,
        zIndex: node.id === 'raised' ? 2 : 0, zMode: 'group' as const, yIndex: i, xIndex: i }])),
      zoomOnDoubleClick: false, renderMediaAsNodes: false, mediaPanelDensity: 'default',
      tempLinkSelRef: { current: null }, linkDragRef: { current: null }, simulation,
      addEdge: () => {}, updateEdge: () => {}, getSelectedEdgeId: () => null,
      selectNode: () => {}, selectEdge: () => {}, setSelectionSource: () => {}, requestZoomSelection: () => {}, toggleGroupCollapsed: () => {},
    })
    assert.deepEqual(Array.from(root.node()!.querySelectorAll('[data-kg-layer="nodes"] > [data-node-id]'))
      .map(element => element.getAttribute('data-node-id')), ['large', 'small', 'raised'])
  } finally { restore() }
}

export function testCanvasMediaLayersRerankOnResize() {
  const { dom, restore } = initJsdomHarness('<!doctype html><section></section>')
  try {
    const panels = new Map(['small', 'large'].map(id => [id, dom.window.document.createElement('section')]))
    for (const panel of panels.values()) dom.window.document.body.appendChild(panel)
    let smallWidth = 100
    const loop = startMediaOverlayLayoutLoop2d({ enabled: true, loop: 'onDemand', anchorToNode: true,
      items: [...panels.keys()].map(id => ({ id })), density: 'default', viewportW: 1000, viewportH: 800,
      readTransform: () => d3.zoomIdentity, getElementForId: id => panels.get(id)!,
      getNodeWorldCenterForId: () => ({ x: 400, y: 300 }),
      getPanelSizeForId: id => ({ w: id === 'small' ? smallWidth : 200, h: 100 }),
      sizingConfig: { widthRatio: 0.2, widthMinPx: 24, widthMaxPx: 800 }, collision: { enabled: false },
    })
    try {
      loop.flush()
      assert.ok(Number(panels.get('large')!.style.zIndex) < Number(panels.get('small')!.style.zIndex))
      smallWidth = 500
      loop.flush()
      assert.ok(Number(panels.get('small')!.style.zIndex) < Number(panels.get('large')!.style.zIndex))
      const observer = new dom.window.MutationObserver(() => {})
      for (const panel of panels.values()) observer.observe(panel, { attributes: true })
      loop.flush()
      assert.equal(observer.takeRecords().length, 0, 'settled layering must not mutate the DOM')
      observer.disconnect()
    } finally { loop.stop() }
  } finally { restore() }
}

export function testClustersStayBelowForegroundWithAuthoredOrder() {
  const { dom, restore } = initJsdomHarness('<!doctype html><svg><g></g></svg>')
  try {
    const root = d3.select(dom.window.document.querySelector<SVGGElement>('g')!)
    for (const id of ['nodes', 'groups-hit', 'links-hit', 'groups', 'links']) root.append('g').attr('data-kg-layer', id)
    const schema = structuredClone(defaultSchema)
    schema.layout = { ...schema.layout, mermaid: { ...schema.layout?.mermaid,
      renderOrder: { groups: 100, 'groups-hit': 200, nodes: -40, links: -50 } } }
    applyGraphCanvasZOrder(root, schema)
    const order = Array.from((root.node() as SVGGElement).children).map(e => e.getAttribute('data-kg-layer'))
    for (const cluster of ['groups', 'groups-hit']) for (const foreground of ['nodes', 'links', 'links-hit']) {
      assert.ok(order.indexOf(cluster) < order.indexOf(foreground), `${cluster} must stay below ${foreground}`)
    }
    applyGraphCanvasZOrder(root, schema)
    assert.deepEqual(Array.from((root.node() as SVGGElement).children).map(e => e.getAttribute('data-kg-layer')), order)
  } finally { restore() }
}
