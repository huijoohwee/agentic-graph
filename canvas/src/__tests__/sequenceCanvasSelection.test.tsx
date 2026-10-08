import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { useGraphStore } from '../hooks/useGraphStore'
import { defaultSchema } from '../lib/graph/schema'
import { useSequenceDocument } from '../features/sequence/useSequenceDocument'
import type { GraphData, GraphNode } from '../lib/graph/types'
import { parseSequence } from '../features/sequence/sequenceModel'
import { projectSequenceGraph } from '../features/sequence/sequenceGraphProjection'
import { bindSequenceGraph, measureSequenceGraph } from '../features/sequence/sequenceCanvasSelection'

const aliases = Array.from({ length: 6 }, (_, i) => `P${i}`)
const source = ['sequenceDiagram', ...aliases.map(id => `participant ${id} as Repeated label`),
  ...[[0, 1], [1, 2], [3, 4], [4, 5], [0, 1]].map(([a, b]) => `${aliases[a!]}->>${aliases[b!]}: Repeated message`)].join('\n')
function project(code = source, diagram = 'parser-scope'): GraphData {
  const graph: GraphData = { type: 'Graph', nodes: [], edges: [] }
  projectSequenceGraph(code, { gid: 'graph', docId: 'document', diagramId: diagram, startIndex: 17,
    mkMeta: (first, last) => ({ first, last }), ensureNode: node => graph.nodes.push({
      id: String(node['@id']), label: String(node.name), type: String(node['@type']), properties: node.properties as GraphNode['properties'],
    }), addRel: (from, key, to, properties) => {
      if (key === 'pointsTo') graph.edges.push({ id: `${diagram}:edge:${graph.edges.length}`, source: from, target: to,
        label: String(properties?.label), properties: properties as GraphNode['properties'] })
    },
  })
  return graph
}

test('sequence selection joins canonical occurrences across parser/view scopes without label lookup', () => {
  const model = parseSequence(source + '\n', 'view-scope'), graph = project()
  const binding = bindSequenceGraph(model, graph)!
  assert.equal(binding.participants.size, 6)
  assert.equal(binding.events.size, 5)
  assert.notEqual(model.events[0]!.id, graph.edges[0]!.properties.sequenceEventId)
  assert.equal(binding.events.get(model.events[0]!.id)?.id, graph.edges[0]!.id)
  assert.equal(binding.events.get(model.events[4]!.id)?.id, graph.edges[4]!.id)
  assert.notEqual(binding.participants.get('P0')!.id, binding.participants.get('P1')!.id)
})

test('missing, stale, ambiguous and endpoint-mismatched sequence bindings fail closed', () => {
  const model = parseSequence(source)
  assert.equal(bindSequenceGraph(model, null), null)
  assert.equal(bindSequenceGraph(parseSequence(source + '\nP5-->>P0: Later'), project()), null)
  const duplicate = project(source, 'other-diagram'), graph = project()
  assert.equal(bindSequenceGraph(model, { ...graph, nodes: [...graph.nodes, ...duplicate.nodes], edges: [...graph.edges, ...duplicate.edges] }), null)
  const wrongEndpoint = project(); wrongEndpoint.edges[0]!.target = wrongEndpoint.nodes[5]!.id
  assert.equal(bindSequenceGraph(model, wrongEndpoint), null)
  const wrongOccurrence = project(); wrongOccurrence.edges[4]!.properties.sequenceOrdinal = 1
  assert.equal(bindSequenceGraph(model, wrongOccurrence), null)
  const partial = project(); partial.nodes.pop()
  assert.equal(bindSequenceGraph(model, partial), null)
})

// Minimal affine values exercise the public SVG geometry boundary, independent of a browser camera.
function affine(k = 1, x = 0, y = 0): DOMMatrix {
  return { a: k, b: 0, c: 0, d: k, e: x, f: y,
    inverse: () => affine(1 / k, -x / k, -y / k),
    multiply: (m: DOMMatrix) => affine(k * m.a, k * m.e + x, k * m.f + y),
  } as DOMMatrix
}

test('selection geometry removes pan/zoom, includes arranged bounds and never mutates source graph', () => {
  const dom = new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"><g data-kg-svg-zoom-content="1"></g></svg>')
  try {
    const svg = dom.window.document.querySelector('svg')! as unknown as SVGSVGElement
    const content = svg.firstElementChild! as SVGGraphicsElement
    const graph = project(), before = JSON.stringify(graph), model = parseSequence(source)
    let camera = affine(2, 70, -30), arranged = 0
    content.getScreenCTM = () => camera
    aliases.forEach((id, index) => {
      const node = dom.window.document.createElementNS(svg.namespaceURI, 'g') as SVGGraphicsElement
      node.setAttribute('data-sequence-participant', id)
      node.getBBox = () => ({ x: 0, y: 0, width: 80, height: 40 } as DOMRect)
      node.getScreenCTM = () => camera.multiply(affine(1, index * 150 + arranged, index * 30))
      content.appendChild(node)
    })
    const first = measureSequenceGraph(svg, model, graph)!
    assert.deepEqual(first.nodes.map(n => [n.x, n.y]), aliases.map((_, i) => [i * 150 + 40, i * 30 + 20]))
    assert.equal(first.nodes[0]!.properties['visual:width'], 80)
    assert.deepEqual(first.edges.map(e => e.id), graph.edges.map(e => e.id))
    camera = affine(.35, -420, 900)
    assert.deepEqual(measureSequenceGraph(svg, model, graph), first)
    arranged = 25
    const moved = measureSequenceGraph(svg, model, graph)!
    assert.equal(moved.nodes[0]!.x, 65)
    assert.equal(JSON.stringify(graph), before)
    assert.equal(model.code, source)
    content.lastElementChild!.remove()
    assert.equal(measureSequenceGraph(svg, model, graph), null)
  } finally { dom.window.close() }
})

test('participant and inspector selections share canonical store semantics and reject a replaced source', async () => {
  const env = initJsdomHarness(), previous = useGraphStore.getState()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), graph = project()
  let api: ReturnType<typeof useSequenceDocument> | undefined
  function Harness() { api = useSequenceDocument(); return null }
  try {
    useGraphStore.setState({ graphData: graph, markdownDocumentText: `\x60\x60\x60mermaid\n${source}\n\x60\x60\x60`, markdownDocumentName: 'generated.md',
      markdownDocumentSourceUrl: null, markdownDocumentApplyRevision: previous.markdownDocumentApplyRevision + 1,
      schema: structuredClone(defaultSchema), selectedNodeId: null, selectedEdgeId: null, selectedGroupId: null,
      selectedNodeIds: [], selectedEdgeIds: [], selectedGroupIds: [] })
    await act(async () => root.render(<Harness/>))
    await act(async () => api!.selectParticipant('P0'))
    assert.deepEqual(useGraphStore.getState().selectedNodeIds, [graph.nodes[0]!.id])
    await act(async () => api!.selectParticipant('P1', { shiftKey: true }))
    assert.deepEqual(useGraphStore.getState().selectedNodeIds, [graph.nodes[0]!.id, graph.nodes[1]!.id])
    await act(async () => api!.selectParticipant('P2'))
    assert.deepEqual(useGraphStore.getState().selectedNodeIds, [graph.nodes[2]!.id], 'plain activation replaces a multi selection')
    await act(async () => api!.selectEvent(api!.model.events[4]!.id))
    assert.equal(useGraphStore.getState().selectedEdgeId, graph.edges[4]!.id)
    await act(async () => api!.selectParticipant('P3'))
    assert.deepEqual(useGraphStore.getState().selectedEdgeIds, [])
    const retained = api!, before = useGraphStore.getState()
    await act(async () => {
      useGraphStore.setState({ markdownDocumentText: 'Replacement source', markdownDocumentApplyRevision: before.markdownDocumentApplyRevision + 1 })
      retained.selectParticipant('P4', { shiftKey: true })
      retained.selectEvent(retained.model.events[0]!.id)
      assert.deepEqual(useGraphStore.getState().selectedNodeIds, before.selectedNodeIds)
      assert.deepEqual(useGraphStore.getState().selectedEdgeIds, before.selectedEdgeIds)
      assert.equal(useGraphStore.getState().schema, before.schema, 'stale modifier gesture cannot mutate the new schema')
    })
  } finally { await act(async () => root.unmount()); useGraphStore.setState(previous, true); env.restore() }
})
