import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import DocumentPassageInsights from '@/features/panels/views/DocumentPassageInsights'
import { applyDocumentPassageLayer, registerDocumentInsightsSource } from '@/features/markdown-workspace/documentInsightsRuntime'
import type { GraphData } from '@/lib/graph/types'
import { indexDocumentSignals } from '@/lib/websites/signalTokens'
import { deriveDocumentPassageGraph, type PassageGraphResult } from '@/lib/parsers/documentPassageGraph'
import type { PassageAnalyzer } from '@/lib/parsers/documentPassageGraphWorker'

test('passage inspection is lazy, follows source lines and rejects stale navigation', async () => {
  const env = initJsdomHarness(), host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host), visited: number[] = []
  const text = '# Notes\n\nCopper lamps illuminate rooms.\n\nCopper lamps brighten rooms.'
  const source = { key: 'source-one', text, signals: indexDocumentSignals(text), revealLine: (line: number) => visited.push(line) }
  let dispose = registerDocumentInsightsSource(source), calls = 0
  const analyze: PassageAnalyzer = async input => { calls++; return deriveDocumentPassageGraph(input) }
  try {
    await act(async () => root.render(<DocumentPassageInsights source={source} analyze={analyze} />))
    assert.equal(calls, 0)
    await act(async () => { host.querySelector('details')!.open = true; Simulate.toggle(host.querySelector('details')!) })
    assert.equal(calls, 1)
    const select = host.querySelector('select')!
    await act(async () => { select.value = select.options[1]!.value; Simulate.change(select) })
    assert.match(host.textContent!, /Lexical group/)
    const jump = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.startsWith('Jump to passage'))!
    await act(async () => jump.click())
    assert.deepEqual(visited, [3])
    dispose(); dispose = registerDocumentInsightsSource({ ...source, text: 'New source.' })
    await act(async () => jump.click())
    assert.deepEqual(visited, [3]); assert.match(host.textContent!, /Source changed/)
  } finally { dispose(); await act(async () => root.unmount()); env.restore() }
})

test('late results from replaced sources never become current and unmount aborts work', async () => {
  const env = initJsdomHarness(), host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const source = (text: string) => ({ key: 'same-key', text, signals: indexDocumentSignals(text), revealLine: () => {} })
  const first = source('Old copper lamps.'), second = source('New basalt islands.')
  const pending: Array<{ signal: AbortSignal; resolve: (value: PassageGraphResult) => void }> = []
  const analyze: PassageAnalyzer = (_input, signal) => new Promise(resolve => pending.push({ signal, resolve }))
  let dispose = registerDocumentInsightsSource(first)
  try {
    await act(async () => root.render(<DocumentPassageInsights source={first} analyze={analyze} />))
    await act(async () => { host.querySelector('details')!.open = true; Simulate.toggle(host.querySelector('details')!) })
    dispose(); dispose = registerDocumentInsightsSource(second)
    await act(async () => root.render(<DocumentPassageInsights source={second} analyze={analyze} />))
    assert.equal(pending[0]!.signal.aborted, true)
    await act(async () => pending[1]!.resolve(deriveDocumentPassageGraph({ documentId: second.key, text: second.text })))
    await act(async () => pending[0]!.resolve(deriveDocumentPassageGraph({ documentId: first.key, text: first.text })))
    assert.match(host.textContent!, /New basalt islands/); assert.doesNotMatch(host.textContent!, /Old copper/)
    await act(async () => root.unmount())
    assert.equal(pending[1]!.signal.aborted, true)
  } finally { dispose(); env.restore() }
})

test('explicit layers preserve authored graphs and reject wrong-source, stale and connected removals', () => {
  const text = 'Copper lamps glow.\n\nCopper lamps shine.'
  const source = { key: 'source-layer', text, signals: indexDocumentSignals(text), revealLine: () => {} }
  let dispose = registerDocumentInsightsSource(source)
  const base: GraphData = { type: 'Graph', metadata: { source: 'markdown:source-layer' }, nodes: [{ id: 'authored', label: 'My note', type: 'Note', properties: { pinned: true } }], edges: [] }
  let graph = base, commits = 0
  const target = () => ({ graphData: graph, setGraphData: (value: GraphData) => { graph = value; commits++ } })
  const derived = deriveDocumentPassageGraph({ documentId: source.key, text }).graph
  try {
    assert.equal(applyDocumentPassageLayer(source, derived, target()), true)
    assert.deepEqual(graph.nodes[0], base.nodes[0])
    const count = graph.nodes.length
    assert.equal(applyDocumentPassageLayer(source, derived, target()), true)
    assert.equal(graph.nodes.length, count)
    graph = { ...graph, edges: [...graph.edges, { id: 'my-edge', source: 'authored', target: derived.nodes[0]!.id, label: 'my connection', properties: {} }] }
    assert.equal(applyDocumentPassageLayer(source, null, target()), false)
    graph = { ...graph, edges: graph.edges.filter(e => e.id !== 'my-edge') }
    assert.equal(applyDocumentPassageLayer(source, null, target()), true)
    assert.deepEqual(graph, base)
    graph = { ...base, metadata: { source: 'another-source' } }
    assert.equal(applyDocumentPassageLayer(source, derived, target()), false)
    graph = base
    const newer = { ...source, text: 'Changed document.' }
    dispose(); dispose = registerDocumentInsightsSource(newer)
    assert.equal(applyDocumentPassageLayer(source, derived, target()), false)
    assert.equal(applyDocumentPassageLayer(newer, derived, target()), false)
    assert.equal(commits, 3)
  } finally { dispose() }
})

test('native document inspector exposes passage analysis lazily and uses its source navigation', async () => {
  const { DocumentInsights } = await import('@/features/panels/views/DocumentInsights')
  await import('@/features/panels/views/DocumentKeywordInsights')
  const env = initJsdomHarness(), host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host), visited: number[] = []
  const text = '# Field notes\n\nCopper lamps illuminate rooms.\n\nCopper lamps brighten rooms.'
  const source = { key: 'integrated-source', text, signals: indexDocumentSignals(text), revealLine: (line: number) => visited.push(line) }
  const dispose = registerDocumentInsightsSource(source)
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  let started = 0, terminated = 0
  class TestWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null
    postMessage(input: Parameters<typeof deriveDocumentPassageGraph>[0]) {
      started++
      queueMicrotask(() => this.onmessage?.({ data: { ok: true, result: deriveDocumentPassageGraph(input) } }))
    }
    terminate() { terminated++ }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, value: TestWorker })
  try {
    await act(async () => root.render(<DocumentInsights />))
    assert.equal(started, 0)
    assert.equal(host.querySelector('[aria-label="Passage insights"]'), null)
    const outer = host.querySelector('details')!
    await act(async () => { outer.open = true; Simulate.toggle(outer) })
    const passageDetails = Array.from(host.querySelectorAll('details')).find(el => el.querySelector('summary')?.textContent === 'Passages and relationships')
    assert.ok(passageDetails, 'The normal document inspector must expose passage analysis')
    assert.equal(started, 0, 'Opening the parent must not start a passage worker')
    await act(async () => { passageDetails.open = true; Simulate.toggle(passageDetails) })
    assert.equal(started, 1); assert.equal(terminated, 1)
    const panel = host.querySelector('[aria-label="Passage insights"]')!
    assert.match(panel.textContent!, /Passage analysis complete/)
    const select = panel.querySelector('select')!
    await act(async () => { select.value = select.options[1]!.value; Simulate.change(select) })
    const jump = Array.from(panel.querySelectorAll('button')).find(button => button.textContent?.startsWith('Jump to passage'))!
    await act(async () => jump.click())
    assert.deepEqual(visited, [3])
    await act(async () => { outer.open = false; Simulate.toggle(outer) })
    assert.equal(host.querySelector('[aria-label="Passage insights"]'), null)
  } finally {
    await act(async () => { dispose(); root.unmount() }); env.restore()
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker)
    else Reflect.deleteProperty(globalThis, 'Worker')
  }
})
