import assert from 'node:assert/strict'
import test from 'node:test'
import { insertStoryboardWorkflowNodeOnEdge } from '@/components/StoryboardWidgetCanvas/runtime/storyboardEdgeNodeInsertion'
import type { GraphData } from '@/lib/graph/types'

const buildGraph = (): GraphData => ({
  type: 'Graph',
  nodes: [
    { id: 'source', type: 'input', label: 'Source', x: 20, y: 40, properties: {} },
    { id: 'target', type: 'output', label: 'Target', x: 220, y: 140, properties: {} },
  ],
  edges: [{
    id: 'edge-1',
    source: 'source',
    target: 'target',
    label: 'flowsTo',
    properties: {
      'flow:sourcePortKey': 'result',
      'flow:targetPortKey': 'input',
      'flow:displayLabel': 'result → input',
      retained: true,
    },
  }],
})

for (const [kind, expectedType, expectedLabel] of [
  ['transform', 'TransformNode', 'Transform Node'],
  ['join', 'JoinNode', 'Join Node'],
  ['branch', 'BranchNode', 'Branch Node'],
] as const) {
  test(`inserts a ${expectedLabel} while preserving edge continuity`, () => {
    const original = buildGraph()
    const result = insertStoryboardWorkflowNodeOnEdge({
      graphData: original,
      edgeId: 'edge-1',
      kind,
    })
    assert.ok(result)
    assert.equal(result.insertedNode.type, expectedType)
    assert.equal(result.insertedNode.label, expectedLabel)
    assert.equal(result.insertedNode.x, 120)
    assert.equal(result.insertedNode.y, 90)
    assert.equal(result.incomingEdge.source, 'source')
    assert.equal(result.incomingEdge.target, result.insertedNode.id)
    assert.equal(result.outgoingEdge.source, result.insertedNode.id)
    assert.equal(result.outgoingEdge.target, 'target')
    assert.equal(result.incomingEdge.id, 'edge-1')
    assert.notEqual(result.outgoingEdge.id, 'edge-1')
    assert.equal(result.incomingEdge.properties?.retained, true)
    assert.equal(result.outgoingEdge.properties?.retained, true)
    assert.equal(result.incomingEdge.properties?.['flow:targetPortKey'], undefined)
    assert.equal(result.outgoingEdge.properties?.['flow:sourcePortKey'], undefined)
    assert.equal(original.nodes.length, 2)
    assert.equal(original.edges.length, 1)
  })
}

test('uses the activated edge position when supplied', () => {
  const result = insertStoryboardWorkflowNodeOnEdge({
    graphData: buildGraph(),
    edgeId: 'edge-1',
    kind: 'transform',
    position: { x: 88, y: 144 },
  })
  assert.deepEqual(
    result && { x: result.insertedNode.x, y: result.insertedNode.y },
    { x: 88, y: 144 },
  )
})

test('does not mutate when the edge is unavailable', () => {
  const graphData = buildGraph()
  assert.equal(insertStoryboardWorkflowNodeOnEdge({
    graphData,
    edgeId: 'missing',
    kind: 'branch',
  }), null)
  assert.equal(graphData.nodes.length, 2)
  assert.equal(graphData.edges.length, 1)
})
