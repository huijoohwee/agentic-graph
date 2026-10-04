import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseSequence, sequencePlaybackEvents, sequenceEventAt, sequenceTimedEvents, sequenceEventAtTime, SEQUENCE_LIMITS } from '../features/sequence/sequenceModel'
import { sequenceNativeSvg } from '../features/sequence/sequenceNativeSvg'
import { sequenceTopologySvg } from '../features/sequence/sequenceTopologySvg'
import { sequenceEventState, sequenceParticipantLabel } from '../features/sequence/sequencePresentation'
import { projectSequenceGraph } from '../features/sequence/sequenceGraphProjection'
import { bindSequenceSvg } from '../features/sequence/sequenceSvgBinding'
import { JSDOM } from 'jsdom'
import { buildMarkdownJsonLd } from '../lib/parsers/markdownJsonLd.impl'
import { parseJsonLd } from '../lib/graph/jsonld/parse'
import { renderMermaidWithRuntime } from '../lib/mermaid/mermaidRuntime'
import { startTimelineTransportPlayback } from '../components/timeline/timelineTransport'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { useGraphStore } from '../hooks/useGraphStore'
import { useSequenceDocument } from '../features/sequence/useSequenceDocument'

const demo = readFileSync(new URL('../features/sequence/fixtures/order-payment-sequence-diagram-demo.md', import.meta.url), 'utf8')
const code = demo.match(/```mermaid\n([\s\S]*?)\n```/)![1]!

test('fidelity fixture keeps actors, aliases, eight messages, activations and both alternatives', () => {
  const model = parseSequence(code)
  assert.deepEqual(model.diagnostics, [])
  assert.equal(model.participants.length, 4)
  assert.equal(model.participants[0]!.actor, true)
  assert.equal(model.participants[1]!.label, 'Web Shop')
  assert.equal(model.events.length, 8)
  assert.equal(model.activations.length, 2)
  assert.deepEqual(model.branches.map(b => b.label), ['Payment approved', 'Payment declined'])
  const approved = sequencePlaybackEvents(model)
  const declinedBranch = model.branches[1]!
  const declined = sequencePlaybackEvents(model, { [declinedBranch.groupId]: declinedBranch.id })
  assert.equal(approved.length, 6); assert.equal(declined.length, 6)
  assert.deepEqual(approved.map(e => e.ordinal), [1, 2, 3, 4, 5, 6])
  assert.deepEqual(declined.map(e => e.ordinal), [1, 2, 3, 4, 7, 8])
  assert.equal(sequenceEventAt(approved, 6)?.ordinal, 6)
  assert.equal(sequenceEventAt(declined, 4.9)?.ordinal, 7)
})

test('source identity and duplicate messages remain distinct through native rendering and graph projection', () => {
  const source = 'sequenceDiagram\nactor A\nparticipant B\nA->>B: Same\nA->>B: Same'
  const model = parseSequence(source, 'doc:diagram')
  assert.notEqual(model.events[0]!.id, model.events[1]!.id)
  assert.equal(parseSequence(source, 'doc:diagram').key, model.key)
  assert.notEqual(parseSequence(`${source}\nB-->>A: Done`, 'doc:diagram').key, model.key)
  const svg = sequenceNativeSvg(model)
  assert.equal((svg.match(/data-sequence-event=/g) || []).length, 2)
  const dom = new JSDOM(svg)
  try {
    const participants = [...dom.window.document.querySelectorAll('[data-sequence-participant]')]
    assert.deepEqual(participants.map(element => element.getAttribute('data-sequence-participant')), model.participants.map(person => person.id))
    assert.ok(participants[0]!.querySelector('circle'), 'actor geometry retains participant ownership')
    assert.ok(participants.every(element => element.querySelector('line') && element.querySelector('.sequence-participant')), 'active-state styling reaches each lifeline and participant')
  } finally { dom.window.close() }
  const relations: Array<Record<string, unknown>> = []
  projectSequenceGraph(source, { gid: 'g', docId: 'doc', diagramId: 'd', startIndex: 10, ensureNode: () => {}, mkMeta: (first, last) => ({ first, last }), addRel: (_a, key, _b, properties) => { if (key === 'pointsTo') relations.push(properties!) } })
  assert.equal(relations.length, 2)
  assert.notEqual(relations[0]!.sequenceEventId, relations[1]!.sequenceEventId)
  assert.equal(relations[0]!.sourceLine, 13)
})

test('unsupported, hostile, malformed and oversized inputs fail loudly and never play', () => {
  for (const tail of ['loop forever', '%%{init: {securityLevel: loose}}%%', 'A->>B: %%{init: {securityLevel: loose}}%%', 'A->>B: hi\nend', 'alt yes\nA->>B: hi', 'deactivate A']) {
    const model = parseSequence(`sequenceDiagram\nparticipant A\nparticipant B\n${tail}`)
    assert.ok(model.diagnostics.length)
    assert.deepEqual(sequencePlaybackEvents(model), [])
  }
  assert.ok(parseSequence('a'.repeat(SEQUENCE_LIMITS.bytes + 1)).diagnostics.length)
  const escaped = sequenceNativeSvg(parseSequence('sequenceDiagram\nA->>B: <script>alert(1)</script>'))
  assert.ok(!escaped.includes('<script>'))
  assert.ok(escaped.includes('&lt;script&gt;'))
})

test('SVG mapping binds repeated labels by exact authored occurrence and rejects incomplete output', () => {
  const model = parseSequence('sequenceDiagram\nA->>B: Same\nA->>B: Same')
  const dom = new JSDOM('<div id="host"><svg xmlns="http://www.w3.org/2000/svg"><line class="messageLine0"/><text class="messageText">Same</text><line marker-start="url(#diagram-sequencenumber)"/><text class="sequenceNumber">1</text><line class="messageLine0"/><text class="messageText">Same</text><line marker-start="url(#diagram-sequencenumber)"/><text class="sequenceNumber">2</text></svg></div>')
  const priorDocument = globalThis.document
  globalThis.document = dom.window.document
  Object.defineProperty(dom.window.SVGElement.prototype, 'getBBox', { value: () => ({ x: 0, y: 0, width: 100, height: 20 }) })
  try {
    const host = dom.window.document.getElementById('host')!
    bindSequenceSvg(host, model, true)
    const bindings = [...host.querySelectorAll('[data-sequence-event]')]
    assert.deepEqual(bindings.map(element => element.getAttribute('data-sequence-event')), model.events.map(event => event.id))
    assert.ok(bindings.every(element => element.getAttribute('role') === 'button' && element.getAttribute('tabindex') === '0'))
    assert.ok(bindings.every(element => element.querySelector('[marker-start]') && element.querySelector('.sequenceNumber')))
    host.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><line class="messageLine0"/><text class="messageText">Same</text></svg>'
    assert.throws(() => bindSequenceSvg(host, model, true), /does not match authored/)
  } finally { globalThis.document = priorDocument; dom.window.close() }
})

test('nested outcomes filter by all parent branches and self messages retain identity', () => {
  const model = parseSequence('sequenceDiagram\nA->>A: start\nalt outer\nalt inner\nA->>B: one\nelse inner other\nA->>B: two\nend\nelse outer other\nB-->>A: three\nend')
  assert.deepEqual(model.diagnostics, [])
  assert.deepEqual(sequencePlaybackEvents(model).map(e => e.label), ['start', 'one'])
  const branch = model.branches.find(b => b.label === 'outer other')!
  assert.deepEqual(sequencePlaybackEvents(model, { [branch.groupId]: branch.id }).map(e => e.label), ['start', 'three'])
})

test('connections retain exact repeated, reply, async and self events with participant aliases', () => {
  const model = parseSequence('sequenceDiagram\nactor A as Reviewer\nparticipant B as Local worker\nA->>B: [HTTP] Same\nA->>B: [HTTP] Same\nB-->>A: Rejected\nB-)A: Retry available\nA->>A: Review again\nNote over A: Rehearsal only')
  const dom = new JSDOM(sequenceTopologySvg(model))
  try {
    const bindings = [...dom.window.document.querySelectorAll('[data-sequence-event]')]
    assert.deepEqual(bindings.map(element => element.getAttribute('data-sequence-event')), model.events.map(event => event.id))
    assert.equal(dom.window.document.querySelectorAll('[data-sequence-participant]').length, 2)
    assert.notEqual(bindings[0]!.querySelector('.sequence-message')!.getAttribute('d'), bindings[1]!.querySelector('.sequence-message')!.getAttribute('d'))
    assert.ok(bindings[0]!.textContent!.includes('HTTP'))
    assert.ok(bindings[2]!.querySelector('.sequence-message')!.hasAttribute('stroke-dasharray'))
    assert.ok(bindings.every(element => element.getAttribute('tabindex') === '0'))
    assert.equal(sequenceParticipantLabel(model, 'B'), 'Local worker')
    const events = sequenceTimedEvents(model.events)
    assert.deepEqual([sequenceEventState(events[1], 0), sequenceEventState(events[1], 1000), sequenceEventState(events[1], 2000), sequenceEventState(undefined, 0)], ['pending', 'active', 'complete', 'skipped'])
    assert.ok(!sequenceTopologySvg(parseSequence('sequenceDiagram\nA->>B: <script>unsafe</script>')).includes('<script>'))
  } finally { dom.window.close() }
})

test('timed projection uses half-open millisecond intervals and zero-duration notes', () => {
  const model = parseSequence('sequenceDiagram\nA->>B: [HTTPS] Reserve\nNote over A,B: Authored rehearsal\nB-->>A: Reservation failed\nA-)B: Release reservation')
  assert.deepEqual(model.diagnostics, [])
  assert.equal(model.events[0]!.protocol, 'HTTPS')
  assert.deepEqual(model.events.map(event => event.kind), ['call', 'note', 'reply', 'async'])
  const events = sequenceTimedEvents(sequencePlaybackEvents(model))
  assert.deepEqual(events.map(event => [event.startMs, event.durationMs]), [[0, 1000], [1000, 0], [1000, 1000], [2000, 1000]])
  assert.equal(sequenceEventAtTime(events, 999)!.label, '[HTTPS] Reserve')
  assert.equal(sequenceEventAtTime(events, 1000)!.label, 'Reservation failed')
  assert.equal(sequenceEventAtTime(events, 3000)!.label, 'Release reservation')
  assert.equal((sequenceNativeSvg(model).match(/data-sequence-event=/g) || []).length, 4)
})

test('Markdown ingestion preserves repeated sequence messages and absolute source lines', () => {
  const graph = parseJsonLd(buildMarkdownJsonLd('repeat.md', '```mermaid\nsequenceDiagram\nA->>B: Same\nA->>B: Same\n```'))
  const edges = graph.edges.filter(edge => edge.properties.sequenceEventId)
  assert.equal(edges.length, 2)
  assert.notEqual(edges[0]!.id, edges[1]!.id)
  assert.notEqual(edges[0]!.properties.sequenceEventId, edges[1]!.properties.sequenceEventId)
  assert.deepEqual(edges.map(edge => edge.properties.sourceLine).sort(), [3, 4])
  assert.ok(graph.nodes.some(node => node.properties.diagramKind === 'sequence'))
})

test('shared Mermaid owner serializes configuration with rendering and recovers after failure', async () => {
  const testGlobal = globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }
  const prior = testGlobal.__AG_TEST_MERMAID_API__
  let theme = '', release: () => void = () => {}, started: () => void = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  const firstStarted = new Promise<void>(resolve => { started = resolve })
  const seen: string[] = []
  testGlobal.__AG_TEST_MERMAID_API__ = {
    initialize: (config: Record<string, unknown>) => { theme = String(config.theme) },
    render: async (id: string) => {
      seen.push(`${id}:${theme}`)
      if (id === 'first') { started(); await held; assert.equal(theme, 'neutral') }
      if (id === 'failed') throw new Error('authored failure')
      return { svg: `<svg>${id}</svg>` }
    },
  }
  try {
    const first = renderMermaidWithRuntime({ renderId: 'first', code: 'sequenceDiagram', config: { theme: 'neutral' } })
    await firstStarted
    const second = renderMermaidWithRuntime({ renderId: 'second', code: 'sequenceDiagram', config: { theme: 'dark' } })
    const stale = new AbortController()
    const rejected = assert.rejects(renderMermaidWithRuntime({ renderId: 'stale', code: 'sequenceDiagram', config: { theme: 'forest' }, signal: stale.signal }), /superseded/)
    stale.abort()
    assert.deepEqual(seen, ['first:neutral'])
    release(); await Promise.all([first, second, rejected])
    assert.deepEqual(seen, ['first:neutral', 'second:dark'])
    await assert.rejects(renderMermaidWithRuntime({ renderId: 'failed', code: 'sequenceDiagram', config: {} }), /authored failure/)
    assert.ok((await renderMermaidWithRuntime({ renderId: 'recovered', code: 'sequenceDiagram', config: {} })).svg.includes('recovered'))
  } finally { testGlobal.__AG_TEST_MERMAID_API__ = prior }
})

test('shared RAF advances one millisecond playhead and rejects a stale document frame', () => {
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0, valid = true, ended = 0
  const positions: number[] = []
  const state = { position: 0, max: 6000, playbackRate: 2, unitsPerMs: 1, onPositionChange: (value: number) => { positions.push(value) }, onPlaybackEnd: () => { ended++ } }
  const stop = startTimelineTransportPlayback({ readState: () => state, requestFrame: callback => { frames.set(++nextId, callback); return nextId }, cancelFrame: id => { frames.delete(id) }, now: () => 0, isCurrent: () => valid })
  const tick = (time: number) => { const [id, callback] = frames.entries().next().value!; frames.delete(id); callback(time) }
  tick(0); tick(500)
  assert.deepEqual(positions, [0, 1000])
  assert.equal(frames.size, 1)
  valid = false; tick(1000)
  assert.deepEqual(positions, [0, 1000]); assert.equal(ended, 0)
  stop(); assert.equal(frames.size, 0)
})

test('marker selection and branch/source changes fence old transport callbacks', async () => {
  const env = initJsdomHarness('<div id="root"></div>')
  const initialState = useGraphStore.getState()
  let sequence: ReturnType<typeof useSequenceDocument>
  const Probe = () => { sequence = useSequenceDocument(); return null }
  const root = createRoot(env.dom.window.document.getElementById('root')!)
  try {
    useGraphStore.setState({ markdownDocumentText: '# Fixture\n\n```mermaid\nsequenceDiagram\nA->>B: First\nNote over A,B: Marker\nalt approved\nB-->>A: Yes\nelse declined\nB-->>A: No\nend\n```', markdownDocumentName: 'marker.md', markdownDocumentApplyRevision: 100 })
    await act(async () => { root.render(React.createElement(Probe)) })
    assert.equal(sequence!.model.events[0]!.line, 5)
    await act(async () => { sequence!.selectEvent(sequence!.model.events.find(event => event.kind === 'note')!.id) })
    assert.equal(sequence!.current!.label, 'Marker')
    assert.equal(sequence!.transport.playbackPosition, 1000)
    const staleBranchTransport = sequence!.transport
    const declined = sequence!.model.branches.find(branch => branch.label === 'declined')!
    await act(async () => { sequence!.chooseBranch(declined.groupId, declined.id) })
    await act(async () => { staleBranchTransport.setTransportPlaybackPosition(5000) })
    assert.equal(sequence!.transport.playbackPosition, 0)
    assert.equal(sequence!.transport.playing, false)
    assert.equal(sequence!.events[sequence!.events.length - 1]!.label, 'No')
    const staleSourceTransport = sequence!.transport
    await act(async () => { useGraphStore.setState({ markdownDocumentText: '```mermaid\nsequenceDiagram\nC->>D: New source\n```', markdownDocumentApplyRevision: 101 }) })
    await act(async () => { staleSourceTransport.setTransportPlaying(true); staleSourceTransport.setTransportPlaybackPosition(800) })
    assert.equal(sequence!.transport.playbackPosition, 0)
    assert.equal(sequence!.transport.playing, false)
    assert.equal(sequence!.current!.label, 'New source')
    assert.equal(sequence!.current!.line, 3)
    await act(async () => { useGraphStore.setState({ markdownDocumentText: '---\nmermaid: |\n  sequenceDiagram\n  C->>D: Frontmatter source\n---', markdownDocumentApplyRevision: 102 }) })
    assert.equal(sequence!.current!.line, 4)
  } finally { await act(async () => { root.unmount() }); useGraphStore.setState(initialState); env.restore() }
})
