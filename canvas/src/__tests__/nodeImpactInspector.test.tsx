import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import type { GraphData } from '@/lib/graph/types'
import { inspectNodeImpact, rankImpactNodes, filterImpactNodes } from '@/features/graph-inspector/lib/nodeImpact'
import NodeImpactInspector from '@/features/graph-inspector/ui/NodeImpactInspector'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const graph = {
  type: 'Graph',
  nodes: ['a', 'b', 'c', 'd', 'isolated'].map(id => ({ id, label: id.toUpperCase(), type: 'Function',
    properties: id === 'isolated' ? {} : { 'corpus:sourcePath': id === 'a' ? 'src/core.ts' : 'src/use.ts' } })),
  edges: [['ab', 'a', 'b'], ['ca', 'c', 'a'], ['da', 'd', 'a'], ['dc', 'd', 'c'], ['ad', 'a', 'd'], ['ca2', 'c', 'a'], ['aa', 'a', 'a']]
    .map(([id, source, target]) => ({ id, source, target, label: 'uses', properties: {
      'evidence:kind': id === 'ab' ? 'inferred' : 'extracted', 'evidence:explanation': `${source} explicitly uses ${target}`,
    } })),
  metadata: { agentGraphProjection: { complete: true, projectionComplete: true, projectionTruncated: false } },
} as unknown as GraphData
const lookup = () => getCachedGraphLookup({ cacheScope: 'impact-test', graphData: graph, graphRevision: 1 })

test('impact reuses bounded traversal, excludes its root, deduplicates cycles/files, and keeps shortest hops', () => {
  const incoming = inspectNodeImpact(lookup(), 'a', 3, 'incoming')!
  assert.deepEqual(incoming.affected.map(row => [row.node.id, row.hops]), [['c', 1], ['d', 1]])
  assert.equal(incoming.fileCount, 1)
  assert.equal(incoming.incoming.length, 4)
  assert.equal(incoming.outgoing.length, 3)
  assert.equal(incoming.incomplete, false)
  const outgoing = inspectNodeImpact(lookup(), 'a', 2, 'outgoing')!
  assert.deepEqual(outgoing.affected.map(row => [row.node.id, row.hops]), [['b', 1], ['d', 1], ['c', 2]])
  assert.equal(inspectNodeImpact(lookup(), 'isolated', 3, 'incoming')!.affected.length, 0)
  assert.equal(inspectNodeImpact(lookup(), 'missing', 1, 'incoming'), null)
  assert.throws(() => inspectNodeImpact(lookup(), 'a', 4, 'incoming'), /Invalid/)
  const partial = { ...graph, metadata: { agentGraphProjection: { projectionTruncated: true } } } as unknown as GraphData
  assert.equal(inspectNodeImpact(getCachedGraphLookup({ cacheScope: 'impact-partial', graphData: partial }), 'a', 2, 'incoming')!.incomplete, true)
})

test('filters combine kind, path and provenance; ranking counts distinct edges without inventing node provenance', () => {
  const rows = filterImpactNodes(rankImpactNodes(lookup()), 'kind:function path:src/ prov:extracted')
  assert.deepEqual(rows.map(row => row.node.id), ['a', 'c', 'd'])
  assert.equal(rows[0].degree, 6)
  assert.equal(rows[0].provenanceBasis, 'incident edges')
  assert.deepEqual(filterImpactNodes(rankImpactNodes(lookup()), 'prov:unreported').map(row => row.node.id), ['isolated'])
  assert.deepEqual(filterImpactNodes(rankImpactNodes(lookup()), 'kind:function path:src/core.ts "a"').map(row => row.node.id), ['a'])
  assert.equal(filterImpactNodes(rankImpactNodes(lookup()), 'path:').length, 0)
})

test('inspector changes depth/direction, renders filters and legend, and highlights without changing graph bytes', async () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container), source = JSON.stringify(graph)
  try {
    useGraphStore.setState({ graphData: graph, graphDataRevision: 31, selectedNodeId: 'a' })
    await act(async () => { root.render(<NodeImpactInspector nodeId="a" />) })
    assert.match(container.textContent || '', /Most connected/)
    assert.match(container.textContent || '', /Legend/)
    assert.match(container.textContent || '', /2 nodes across 1 file could be affected within 2 hops/)
    const buttons = () => Array.from(container.querySelectorAll('button'))
    await act(async () => { buttons().find(button => button.textContent === 'Outgoing')!.click() })
    assert.match(container.textContent || '', /3 nodes across 1 file could be affected within 2 hops/)
    await act(async () => { buttons().find(button => button.textContent === '1')!.click() })
    assert.match(container.textContent || '', /2 nodes across 1 file could be affected within 1 hop/)
    await act(async () => { buttons().find(button => button.textContent === 'Show on canvas')!.click() })
    assert.deepEqual(new Set(useGraphStore.getState().selectedNodeIds), new Set(['a', 'b', 'd']))
    assert.equal(JSON.stringify(useGraphStore.getState().graphData), source)
    const input = container.querySelector('input')!
    await act(async () => { Simulate.change(input, { target: { value: 'prov:unreported' } } as never) })
    assert.match(container.textContent || '', /1 matching nodes/)
    assert.match(container.textContent || '', /ISOLATED/)
    await act(async () => { root.render(<NodeImpactInspector nodeId={null} />) })
    assert.equal(container.querySelector('[aria-label="Blast radius"]'), null)
    assert(container.querySelector('[aria-label="Find a node"]'))
  } finally {
    await act(async () => root.unmount()); container.remove(); useGraphStore.setState(before, true); restore()
  }
})
