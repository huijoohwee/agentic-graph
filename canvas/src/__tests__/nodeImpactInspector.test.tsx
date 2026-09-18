import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import type { GraphData } from '@/lib/graph/types'
import { inspectNodeImpact, rankImpactNodes, rankImpactModules, filterImpactNodes } from '@/features/graph-inspector/lib/nodeImpact'
import { styleAgentGraphNode, styleAgentGraphEdge, styleAgentGraphProjection, agentGraphGroupColor } from '@/features/agent-graph/agentGraphVisualEvidence'
import NodeImpactInspector from '@/features/graph-inspector/ui/NodeImpactInspector'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { getNodeRadiusFromSchema, defaultSchema } from '@/lib/graph/schema'
import { buildAgentGraphCanvasProjection } from '@/features/agent-graph/agentGraphCanvasProjection'
import { agentGraphResult } from './agentGraphWorkspaceArtifact.test'
import NativeGraphStatsSection from '@/features/graph-inspector/ui/NativeGraphStatsSection'
import GraphStatsPanel from '@/features/graph-stats/GraphStatsPanel'
import OrchestratorSettingsSection from '@/features/panels/views/OrchestratorSettingsSection'
import * as d3 from 'd3'
import { startAgentGraphObservation } from '../../../mcp/agent-graph/operation-observation.mjs'
import { applyZoomRequest } from '@/components/GraphCanvas/zoomController'
import { useZoomEffects } from '@/components/GraphCanvas/hooks/useZoomEffects'

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

test('selection fit follows rendered positions after snapshot reopening and layout changes without mutating source', () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  document.body.append(element)
  const svg = d3.select(element), zoom = d3.zoom<SVGSVGElement, unknown>().extent([[0, 0], [1000, 800]])
  const source = { type: 'Graph', nodes: [{ id: 'left', type: 'SourceFile', label: 'left' }, { id: 'right', type: 'Function', label: 'right' }], edges: [] } as unknown as GraphData
  const bytes = JSON.stringify(source)
  const rendered = source.nodes.map((node, i) => ({ ...node, x: 2000 + i * 200, y: 3000 + i * 100 }))
  try {
    svg.call(zoom)
    svg.selectAll('circle').data(rendered).join('circle').attr('data-node-id', node => node.id)
    useGraphStore.setState({ schema: defaultSchema, graphDataRevision: 7654, zoomDurationSelectionMs: 0 })
    const fit = () => {
      applyZoomRequest({ type: 'selection', at: Date.now() }, { svg, zoom, graphData: source, width: 1000, height: 800,
        selectedNodeId: 'left', selectedNodeIds: ['left', 'right'], selectedEdgeId: null })
      const transform = d3.zoomTransform(element)
      for (const node of rendered) {
        const [x, y] = transform.apply([node.x, node.y])
        assert(x >= 0 && x <= 1000 && y >= 0 && y <= 800, `selected node must be visible: ${x}, ${y}`)
      }
      assert.equal(JSON.stringify(source), bytes)
    }
    fit()
    for (const node of rendered) { node.x += 5000; node.y -= 4000 }
    fit()
  } finally { element.remove(); useGraphStore.setState(before, true); restore() }
})

test('selection zoom survives render-graph rebinding and applies the latest queued request', async () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const request = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame
  const pending = new Map<number, FrameRequestCallback>(); let frameId = 0
  globalThis.requestAnimationFrame = callback => { pending.set(++frameId, callback); return frameId }
  globalThis.cancelAnimationFrame = id => { pending.delete(id) }
  const container = document.createElement('div'), element = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  document.body.append(container, element)
  const root = createRoot(container), svg = d3.select(element), zoom = d3.zoom<SVGSVGElement, unknown>().extent([[0, 0], [1000, 800]])
  const svgRef = { current: element }, zoomRef = { current: zoom }
  const source = { type: 'Graph', nodes: [{ id: 'picked', type: 'Function', label: 'picked' }], edges: [] } as unknown as GraphData
  const rendered = { ...source.nodes[0], x: 4000, y: -3000 }
  const Probe = ({ data }: { data: GraphData }) => {
    useZoomEffects({ svgRef, zoomRef, width: 1000, height: 800, graphDataOverride: data })
    return null
  }
  try {
    svg.call(zoom); svg.append('circle').datum(rendered).attr('data-node-id', 'picked')
    useGraphStore.setState({ schema: defaultSchema, graphDataRevision: 7655, selectedNodeId: 'picked', selectedNodeIds: ['picked'], zoomRequest: null, zoomDurationSelectionMs: 0 })
    await act(async () => root.render(<Probe data={source} />))
    await act(async () => {
      useGraphStore.getState().requestZoomTransform({ k: 1, x: 0, y: 0 })
      useGraphStore.getState().requestZoom('selection')
    })
    assert.equal(pending.size, 1)
    await act(async () => root.render(<Probe data={{ ...source }} />))
    assert.equal(pending.size, 1, 'rebinding must reschedule the pending selection')
    await act(async () => { for (const [id, callback] of [...pending]) { pending.delete(id); callback(0) } })
    const [x, y] = d3.zoomTransform(element).apply([rendered.x, rendered.y])
    assert(x >= 0 && x <= 1000 && y >= 0 && y <= 800)
    assert.equal(useGraphStore.getState().zoomRequest, null)
  } finally {
    await act(async () => root.unmount()); container.remove(); element.remove(); useGraphStore.setState(before, true)
    globalThis.requestAnimationFrame = request; globalThis.cancelAnimationFrame = cancel; restore()
  }
})

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
    assert.equal(useGraphStore.getState().zoomRequest?.type, 'selection')
    assert.deepEqual(new Set(useGraphStore.getState().selectedNodeIds), new Set(['a', 'b', 'd']))
    assert.equal(JSON.stringify(useGraphStore.getState().graphData), source)
    const input = container.querySelector('input')!
    await act(async () => { Simulate.change(input, { target: { value: 'prov:unreported' } } as never) })
    assert.match(container.textContent || '', /1 matching nodes/)
    useGraphStore.setState({ zoomRequest: null })
    await act(async () => { buttons().find(button => button.textContent === 'ISOLATED')!.click() })
    assert.equal(useGraphStore.getState().selectedNodeId, 'isolated')
    assert.equal(useGraphStore.getState().zoomRequest?.type, 'selection')
    assert.match(container.textContent || '', /ISOLATED/)
    await act(async () => { root.render(<NodeImpactInspector nodeId={null} />) })
    assert.equal(container.querySelector('[aria-label="Blast radius"]'), null)
    assert(container.querySelector('[aria-label="Find a node"]'))
  } finally {
    await act(async () => root.unmount()); container.remove(); useGraphStore.setState(before, true); restore()
  }
})


test('native source styles preserve evidence and do not manufacture certainty', () => {
  const node = graph.nodes[0]!, source = JSON.stringify(node)
  const styled = styleAgentGraphNode(node)
  assert.equal(styled.properties['visual:fill'], agentGraphGroupColor('src'))
  assert.equal(styled.properties['visual:layer'], 'src')
  assert.equal(JSON.stringify(node), source)
  const edge = graph.edges[0]!, original = JSON.stringify(edge)
  assert.equal(styleAgentGraphEdge(edge).properties['visual:dash'], '1 7')
  for (const [certainty, dash, width] of [['exact', '0', 2], ['inferred', '6 4', 1.5], ['ambiguous', '1 4', 1]] as const) {
    const result = styleAgentGraphEdge({ ...edge, properties: { ...edge.properties, 'evidence:certainty': certainty } })
    assert.equal(result.properties['visual:dash'], dash)
    assert.equal(result.properties['visual:strokeWidth'], width)
    assert.equal(result.properties['evidence:explanation'], edge.properties['evidence:explanation'])
  }
  assert.equal(JSON.stringify(edge), original)
})

test('source presentation remains bounded and marks a trimmed projection as partial', () => {
  const input = { ...graph, nodes: Array.from({ length: 1000 }, (_, index) => ({
    id: `node:${index}`, label: 'Source', type: 'Symbol', properties: { 'corpus:sourcePath': `src/${index}.ts`, content: 'x'.repeat(2400) },
  })), edges: [] } as GraphData
  const original = JSON.stringify(input)
  const styled = styleAgentGraphProjection(input)
  assert.ok(Buffer.byteLength(JSON.stringify(styled)) <= 2 * 1024 * 1024)
  assert.ok(styled.nodes.length < input.nodes.length)
  assert.equal((styled.metadata?.agentGraphProjection as Record<string, unknown>).projectionTruncated, true)
  assert.equal(JSON.stringify(input), original)
})

test('modules aggregate captured file membership and count shared relationships once', () => {
  const modules = rankImpactModules(lookup())
  assert.deepEqual(modules.map(row => [row.path, row.nodeIds.length, row.degree]), [['src/core.ts', 1, 6], ['src/use.ts', 3, 6]])
  assert.equal(filterImpactNodes(modules, 'kind:module path:use prov:extracted').length, 1)
  assert.equal(modules.some(row => row.nodeIds.includes('isolated')), false)
  const styled = styleAgentGraphProjection(graph)
  const sizes = new Map(styled.nodes.map(node => [node.id, getNodeRadiusFromSchema(node, defaultSchema)]))
  assert.equal(sizes.get('isolated'), 6)
  assert(sizes.get('a')! > sizes.get('b')!)
  assert.deepEqual(styleAgentGraphProjection(styled).nodes, styled.nodes)
  assert.equal(styled.edges.find(edge => edge.id === 'ab')!.properties['evidence:explanation'], graph.edges[0]!.properties['evidence:explanation'])
})

test('native statistics share module selection, source groups, evidence and stable connectivity sizes', async () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    const native = buildAgentGraphCanvasProjection(agentGraphResult())
    const data = styleAgentGraphProjection({ ...graph, metadata: native.metadata })
    useGraphStore.getState().resetAll()
    useGraphStore.setState({ graphData: data, graphDataRevision: 44, canvasRenderMode: '2d', canvas2dRenderer: 'd3' })
    await act(async () => { root.render(<NativeGraphStatsSection />) })
    assert.match(container.textContent || '', /source-file modules/)
    assert.match(container.textContent || '', /2 matching modules/)
    assert.match(container.textContent || '', /Node size/)
    assert.match(container.textContent || '', /Edge provenance/)
    assert.match(container.textContent || '', /Execution measurements are unavailable/)
    assert.doesNotMatch(container.textContent || '', /No clusters detected|co-occurrence/)
    const moduleButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'src/use.ts')!
    await act(async () => { moduleButton.click() })
    assert.deepEqual(new Set(useGraphStore.getState().selectedNodeIds), new Set(['b', 'c', 'd']))
    assert.equal(useGraphStore.getState().zoomRequest?.type, 'selection')
    assert.deepEqual(useGraphStore.getState().graphData!.nodes.map(node => node.properties['visual:nodeSize']), data.nodes.map(node => node.properties['visual:nodeSize']))
    await act(async () => { Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Nodes')!.click() })
    assert.match(container.textContent || '', /5 matching nodes/)
  } finally { await act(async () => root.unmount()); container.remove(); useGraphStore.setState(before, true); restore() }
})

test('native statistics render captured measurements with process attribution and unknown values', async () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    const imported = agentGraphResult()
    const observation = startAgentGraphObservation('ingest', { clock: () => 0,
      cpu: () => { throw Error('unavailable') }, memory: () => ({ rss: 2048, heapUsed: 1024 }) })({ ok: true, counts: { parsed: 1, reused: 1, admittedBytes: 128 } }).observation
    const data = buildAgentGraphCanvasProjection({ ...imported, observation })
    useGraphStore.getState().resetAll()
    useGraphStore.setState({ graphData: data, graphDataRevision: 45, canvasRenderMode: '2d', canvas2dRenderer: 'd3' })
    await act(async () => root.render(<NativeGraphStatsSection />))
    assert.match(container.textContent || '', /Elapsed: 0 ms/)
    assert.match(container.textContent || '', /Host CPU: Unknown/)
    assert.match(container.textContent || '', /Parsed: 1 files · Reused: 1 files/)
    assert.match(container.textContent || '', /exclude parser subprocesses/)
    assert.match(container.textContent || '', /peak use is unknown/)
    assert.match(container.textContent || '', /Model cost excludes adapters and infrastructure/)
  } finally { await act(async () => root.unmount()); container.remove(); useGraphStore.setState(before, true); restore() }
})


test('FloatingPanel owns native inspection while Dashboard restores scoped statistics without duplication', async () => {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const native = buildAgentGraphCanvasProjection(agentGraphResult())
  const data = { ...graph, metadata: native.metadata, edges: [], nodes: Array.from({ length: 500 }, (_, i) => ({
    id: `node-${i}`, label: i === 499 ? 'Unique selection token' : `Function ${i}`,
    type: i === 499 ? 'DocumentText' : 'Function', properties: { 'corpus:sourcePath': `src/file-${i}.ts` },
  })) } as GraphData
  const buttons = () => Array.from(container.querySelectorAll<HTMLElement>('[role="button"], button'))
  const expand = async (title: string) => {
    const header = buttons().find(button => button.getAttribute('aria-expanded') === 'false' && button.textContent?.includes(title))
    if (header) await act(async () => header.click())
  }
  const distribution = () => Array.from(container.querySelectorAll('span')).find(span => span.textContent === 'Node type distribution')!.parentElement!
  const keyword = (name: string) => buttons().find(button => button.textContent?.startsWith(`#${name}`))
  try {
    useGraphStore.getState().resetAll()
    useGraphStore.setState({ graphData: data, graphDataRevision: 86, canvasRenderMode: '2d', canvas2dRenderer: 'd3', schema: defaultSchema })
    await act(async () => root.render(<GraphStatsPanel />))
    for (const title of ['Dataset Inspector', 'Keywords', 'Word frequencies by node', 'Clusters', 'Edges (co-occurrence + similarity)']) {
      assert.ok(container.textContent?.includes(title), title)
      await expand(title)
    }
    assert.equal(container.querySelector('[aria-label="Native graph statistics"]'), null)
    assert.doesNotMatch(container.textContent || '', /Most connected|Find a module|Source groups/)
    assert.match(container.textContent || '', /Loaded graph: 500 nodes/)
    assert.match(container.textContent || '', /Rendered: 420 nodes/)
    assert.equal(distribution().querySelectorAll('rect').length, 2, 'charts include the loaded type outside the canvas budget')
    assert.equal(keyword('Function')?.getAttribute('title'), '499 nodes')
    await act(async () => keyword('DocumentText')!.click())
    assert.deepEqual(useGraphStore.getState().selectedNodeIds, ['node-499'])
    assert.equal(distribution().querySelectorAll('rect').length, 1, 'Auto charts follow the selection')
    assert.equal(keyword('Function'), undefined, 'keyword inventory follows the same scope')
    assert.match(container.textContent || '', /Unique selection token/)
    const scope = container.querySelector('[aria-label="Stats scope"]')!
    await act(async () => Array.from(scope.querySelectorAll('button')).find(button => button.textContent === 'Loaded graph')!.click())
    assert.equal(distribution().querySelectorAll('rect').length, 2, 'loaded scope restores every loaded type despite selection')
    assert.equal(keyword('Function')?.getAttribute('title'), '499 nodes')
    assert.equal(container.querySelectorAll('[aria-label="Stats scope"]').length, 1)
    assert.match(container.textContent || '', /No clusters detected/)
    const noop = () => {}
    await act(async () => root.render(<OrchestratorSettingsSection graphRagCollapsed presetsCollapsed editorCollapsed contextCollapsed indexingCollapsed tracingCollapsed
      setGraphRagCollapsed={noop} setPresetsCollapsed={noop} setEditorCollapsed={noop} setContextCollapsed={noop} setIndexingCollapsed={noop} setTracingCollapsed={noop} />))
    assert.equal(container.querySelectorAll('[aria-label="Native graph statistics"]').length, 1)
    assert.equal(Array.from(container.querySelectorAll('h3')).filter(heading => heading.textContent === 'Most connected').length, 1)
    assert.match(container.textContent || '', /Source groups/)
    assert.doesNotMatch(container.textContent || '', /Word frequencies by node|GraphRAG Workflow/)
  } finally { await act(async () => root.unmount()); container.remove(); useGraphStore.setState(before, true); restore() }
})
