import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { register } from 'node:module'
import { JSDOM } from 'jsdom'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { VideoSequenceSourceAnnotationLayer } from '../components/timeline/VideoSequenceFrameSampleRail'
import * as sync from '../lib/render/richMediaTimelineSync'
import { normalizeRichMediaPanelInlineSrcDoc } from '../lib/render/richMediaPanelSrcDoc'
const { createRichMediaTimelineTargetController } = sync
register(`data:text/javascript,${encodeURIComponent("export function load(u,c,n){if(u.startsWith('file:')&&new URL(u).pathname.endsWith('.css'))return{format:'module',shortCircuit:true,source:'export {};'};return n(u,c)}")}`, import.meta.url)

test('annotation disclosure exposes exact source samples without another filmstrip or frame reader', async () => {
  const { restore } = initJsdomHarness()
  const host = document.createElement('section')
  document.body.append(host)
  const root = createRoot(host)
  const samples = Array.from({ length: 16 }, (_, index) => ({ timestampSeconds: index * 0.173,
    url: `/__video_frame?url=https%3A%2F%2Fexample.test%2Fvideo.mp4&time=${(index * 0.173).toFixed(3)}` }))
  const selected: typeof samples = []
  const original = JSON.stringify(samples)
  try {
    await act(async () => root.render(<VideoSequenceSourceAnnotationLayer samples={samples}
      selectedTimeSeconds={samples[3].timestampSeconds} onSelect={sample => selected.push(sample)} />))
    const disclosure = host.querySelector('details')!
    assert.equal(disclosure.open, false)
    assert.equal(disclosure.querySelector('summary')?.textContent, 'Annotations (16)')
    disclosure.open = true
    const buttons = Array.from(disclosure.querySelectorAll<HTMLButtonElement>('button'))
    assert.equal(buttons.length, 16)
    delete (document as unknown as Record<string, unknown>).activeElement
    buttons[3].focus()
    assert.ok(document.activeElement === buttons[3], 'native marker participates in keyboard focus')
    assert.equal(buttons[3].getAttribute('aria-pressed'), 'true')
    await act(async () => buttons[3].click())
    assert.deepEqual(selected, [samples[3]], 'selection retains the exact source timestamp and authored URL')
    assert.equal(host.querySelectorAll('img,video,canvas,div,[aria-hidden]').length, 0)
    assert.equal(JSON.stringify(samples), original, 'presentation cannot mutate persisted samples')
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
})

const request = { documentKey: 'doc', overlayId: 'analysis', sourceUrl: 'https://example.test/video.mp4',
  sourceTimestampMs: 6173, position: 2.4, frameSampleUrl: '/__video_frame?url=video&time=6.173' }
const scope = { documentKey: 'doc', overlayId: 'analysis', sourceUrl: request.sourceUrl,
  position: 2.4, playing: false, playbackRate: 1 }

test('targeted annotation pin retains source time across paused retries and cannot target another panel', () => {
  const controller = createRichMediaTimelineTargetController()
  assert.equal(controller.request(request), 1)
  assert.equal(controller.resolve({ ...scope, overlayId: 'unrelated', documentKey: 'foreign', position: 0 }), null)
  const frame = controller.resolve(scope)!
  assert.equal(frame.timeMs, 6173)
  assert.equal(frame.position, 2.4)
  assert.equal(frame.sourcePlayback, false)
  assert.equal(frame.frameSampleUrl, request.frameSampleUrl)
  assert.deepEqual(controller.resolve(scope), frame)
  assert.equal(controller.resolve({ ...scope, playing: true }), null)
  assert.equal(controller.resolve(scope), null, 'playing releases the paused source override')
})

test('new seek, document, or source identity releases the annotation pin; invalid requests are rejected', () => {
  const controller = createRichMediaTimelineTargetController()
  for (const changed of [{ position: 2.5 }, { documentKey: 'new-document' }, { sourceUrl: 'foreign' }]) {
    controller.request(request)
    assert.ok(controller.resolve(scope))
    assert.equal(controller.resolve({ ...scope, ...changed }), null)
    assert.equal(controller.resolve(scope), null)
  }
  assert.equal(controller.request({ ...request, sourceTimestampMs: NaN }), null)
  assert.equal(controller.request({ ...request, position: -1 }), null)
  assert.equal(controller.request({ ...request, overlayId: '' }), null)
  assert.equal(controller.resolve(scope), null)
  controller.request(request); controller.observeTransportScope(scope)
  assert.ok(controller.resolve(scope), 'first owner observation preserves a matching queued pin')
  controller.observeTransportScope({ ...scope, documentKey: 'other-document' }); controller.observeTransportScope(scope)
  assert.equal(controller.resolve(scope), null)
  controller.request({ ...request, documentKey: 'other-document' }); controller.observeTransportScope({ ...scope, documentKey: 'other-document' })
  assert.ok(controller.resolve({ ...scope, documentKey: 'other-document' }), 'a prior store listener may already have queued the new owner')
})

test('actual document switches release absent-target pins even when A returns at the same position', async () => {
  const env = initJsdomHarness()
  const { useGraphStore: store } = await import('../hooks/useGraphStore')
  const initial = store.getState()
  try {
    store.setState({ markdownDocumentName: 'doc', timelineTransportPlaying: false, timelineTransportPosition: 2.4 })
    await import('../features/gitgraph/useGanttTimelineTransportSurfaceModel')
    const generation = sync.requestRichMediaTimelineTargetFrame(request)!
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope)?.timeMs, 6173)
    store.setState({ timelineTransportDocumentKey: 'separate-runtime' })
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope)?.targetRequestId, generation, 'runtime identity is not a document change')
    store.setState({ markdownDocumentName: 'other-document' })
    assert.equal(sync.resolveRichMediaTimelineTargetFrame({ ...scope, documentKey: 'other-document', overlayId: 'absent-target' }), null)
    store.setState({ markdownDocumentName: 'doc' })
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope), null, 'returning to A cannot revive the old queued frame')
    assert.ok(sync.requestRichMediaTimelineTargetFrame(request)! > generation)
    store.setState({ markdownDocumentName: '' })
    store.setState({ markdownDocumentName: 'doc' })
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope), null, 'closing the document also releases ownership')
    sync.requestRichMediaTimelineTargetFrame(request)
    store.setState({ timelineTransportPosition: 3 }); store.setState({ timelineTransportPosition: 2.4 })
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope), null, 'absent-target seek A→B→A cannot revive the old source frame')
    sync.requestRichMediaTimelineTargetFrame(request)
    store.setState({ timelineTransportPlaying: true }); store.setState({ timelineTransportPlaying: false })
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope), null, 'absent-target play/pause releases the pin')
  } finally { sync.clearRichMediaTimelineTargetFrame(); store.setState(initial); env.restore() }
})

test('iframe bridge fences ownership and global paused overwrites while forwarding the existing sample', () => {
  const srcDoc = '<html><head></head><body><section>Boxes</section></body></html>'
  const html = normalizeRichMediaPanelInlineSrcDoc({ srcDoc, timelineOwner: scope })
  assert.notEqual(html, normalizeRichMediaPanelInlineSrcDoc({ srcDoc, timelineOwner: { ...scope, overlayId: 'foreign' } }))
  const dom = new JSDOM(html, { runScripts: 'outside-only' }), w = dom.window
  const events: { timeMs: number; frameSampleUrl?: string }[] = []
  let channel!: { onmessage: (event: { data: unknown }) => void }
  w.requestAnimationFrame = () => 1; w.cancelAnimationFrame = () => {}; w.setInterval = () => 1
  w.BroadcastChannel = class { constructor() { channel = this as unknown as typeof channel } }
  w.addEventListener('agentic-graph:render-frame', event => events.push((event as CustomEvent).detail))
  const prior = globalThis.window
  try {
    w.eval(w.document.getElementById('kg-rich-media-panel-srcdoc-timeline-transport')!.textContent!)
    const controller = createRichMediaTimelineTargetController(); controller.request(request)
    const target = controller.resolve(scope)!
    const send = (data: unknown, source: unknown = w) => w.dispatchEvent(new w.MessageEvent('message', { data, source: source as Window }))
    send(target, {}); send({ ...target, targetOverlayId: 'foreign' }); send({ ...target, documentKey: 'foreign' })
    assert.equal(events.length, 0)
    send(target); assert.equal(events.at(-1)?.timeMs, 6173); assert.equal(events.at(-1)?.frameSampleUrl, request.frameSampleUrl)
    channel.onmessage({ data: { ...target, targetOverlayId: undefined, timeMs: 0 } }); assert.equal(events.at(-1)?.timeMs, 6173)
    send({ ...target, targetRequestId: 2, timeMs: 7173 }); send(target); assert.equal(events.at(-1)?.timeMs, 7173)
    send({ ...target, targetOverlayId: undefined, frameSampleUrl: undefined, timeMs: 3000 }); assert.equal(events.at(-1)?.timeMs, 3000)
    globalThis.window = w as unknown as Window & typeof globalThis
    let published = 0
    w.addEventListener(sync.RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, () => { published += 1 })
    sync.publishRichMediaTimelineTransportFrame(target)
    assert.equal(published, 0); assert.equal(Reflect.get(w, sync.RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY), undefined)
  } finally { globalThis.window = prior; dom.window.close() }
})

test('mounted media owner replays queued pins only to its own ready iframe and fences obsolete bursts', async () => {
  const { useGraphStore: store } = await import('../hooks/useGraphStore')
  const { useRichMediaPanelMediaState } = await import('../components/useRichMediaPanelMediaState')
  const env = initJsdomHarness(), initial = store.getState(), host = document.createElement('section')
  document.body.append(host); const root = createRoot(host), messages: sync.RichMediaTimelineTransportFrame[] = [], callbacks: (() => void)[] = []
  let model!: ReturnType<typeof useRichMediaPanelMediaState>
  function Harness() {
    model = useRichMediaPanelMediaState({ overlayId: request.overlayId, title: 'Boxes', url: '', srcDoc: '<section>Boxes</section>' })
    return <section><iframe ref={model.inlineSrcDocFrameRef} title="Boxes" /><iframe ref={model.directVideoFallbackFrameRef} title="Fallback" /></section>
  }
  const w = env.dom.window, oldTimeout = w.setTimeout, oldClear = w.clearTimeout
  try {
    store.setState({ markdownDocumentName: 'doc', timelineTransportDocumentKey: 'doc', timelineTransportPosition: 2.4, timelineTransportPlaying: false,
      graphData: { type: 'graph', nodes: [{ id: 'analysis', label: 'Boxes', type: 'RichMediaPanel', properties: { kind: 'video-agent-frame-analysis', sourceUrl: request.sourceUrl } }], edges: [] } })
    sync.requestRichMediaTimelineTargetFrame(request)
    await act(async () => root.render(<Harness />))
    for (const frame of [model.inlineSrcDocFrameRef.current!, model.directVideoFallbackFrameRef.current!]) frame.contentWindow!.postMessage = (message: sync.RichMediaTimelineTransportFrame) => messages.push(message)
    const ready = (source: unknown) => w.dispatchEvent(new w.MessageEvent('message', { source: source as Window, data: { type: sync.RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE } }))
    ready({}); assert.equal(messages.length, 0)
    ready(model.inlineSrcDocFrameRef.current!.contentWindow); assert.equal(messages.at(-1)?.timeMs, 6173)
    const queuedGeneration = sync.resolveRichMediaTimelineTargetFrame(scope)!.targetRequestId
    await act(async () => root.render(null))
    assert.equal(sync.resolveRichMediaTimelineTargetFrame(scope)?.targetRequestId, queuedGeneration, 'closing Inspector alone preserves its existing queued pin')
    sync.requestRichMediaTimelineTargetFrame(request)
    await act(async () => root.render(<Harness />))
    model.inlineSrcDocFrameRef.current!.contentWindow!.postMessage = (message: sync.RichMediaTimelineTransportFrame) => messages.push(message)
    ready(model.inlineSrcDocFrameRef.current!.contentWindow)
    assert.equal(messages.at(-1)?.timeMs, 6173, 'same-document Inspector remount retains a legitimate queued pin')
    w.setTimeout = ((fn: () => void) => { callbacks.push(fn); return callbacks.length }) as typeof w.setTimeout; w.clearTimeout = () => {}
    model.scheduleInlineSrcDocTimelineFrameBurst({ ...scope, timeMs: 0 })
    const stale = callbacks.slice(); sync.requestRichMediaTimelineTargetFrame({ ...request, sourceTimestampMs: 7173 })
    const count = messages.length; stale.forEach(fn => fn()); assert.equal(messages.length, count); assert.equal(messages.at(-1)?.timeMs, 7173)
    await act(async () => store.setState({ timelineTransportPosition: 3 }))
    const before = messages.length; callbacks.forEach(fn => fn()); assert.equal(messages.length, before)
    w.dispatchEvent(new w.CustomEvent('agentic-graph:timeline-transport-playback-request', { detail: { ...scope, position: 3, timeMs: 3000 } }))
    assert.equal(messages.at(-1)?.timeMs, 3000); assert.equal(messages.at(-1)?.frameSampleUrl, undefined)
  } finally { w.setTimeout = oldTimeout; w.clearTimeout = oldClear; sync.clearRichMediaTimelineTargetFrame(); await act(async () => root.unmount()); store.setState(initial); host.remove(); env.restore() }
})

test('Gantt followers retain calibrated time and playback ownership across READY and queued retries', async () => {
  const position = 0.5976664375
  const args = { localDocumentKey: 'doc', transportDocumentKey: 'doc', transportPosition: position,
    transportPlaying: false, transportPlaybackRate: 1 }
  const clock = sync.buildRichMediaTimelineTransportFrame({ ...args, override: { timeMs: 35860, sourcePlayback: false } })!
  const clockScope = { documentKey: 'doc', transportDocumentKey: 'doc', position, playing: false, playbackRate: 1 }
  assert.deepEqual(sync.resolvePublishedRichMediaTimelineTransportFrame(clock, clockScope), clock)
  for (const changed of [{ documentKey: 'foreign' }, { position: 0 }, { playing: true }, { playbackRate: 2 }])
    assert.equal(sync.resolvePublishedRichMediaTimelineTransportFrame(clock, { ...clockScope, ...changed }), null)
  assert.equal(sync.resolvePublishedRichMediaTimelineTransportFrame({ ...clock, sourcePlayback: true }, clockScope), null)
  assert.equal(sync.resolvePublishedRichMediaTimelineTransportFrame({ ...clock, targetOverlayId: 'analysis' }, clockScope), null)
  assert.equal(sync.buildRichMediaTimelineTransportFrame({ ...args, transportPosition: 20 })?.timeMs, 20000, 'generic units remain seconds')
  const { useGraphStore: store } = await import('../hooks/useGraphStore')
  const { useRichMediaPanelMediaState } = await import('../components/useRichMediaPanelMediaState')
  const { buildVideoAgentUrlImportMarkdown } = await import('../features/markdown-workspace/workspaceImport/videoAgentUrlImport')
  const { loadGraphDataFromTextViaParser } = await import('../features/parsers/loader')
  const documentText = buildVideoAgentUrlImportMarkdown({ sourceUrl: request.sourceUrl, sourceText: '# Source\n',
    sourceTranscriptJsonText: JSON.stringify({ segments: [{ start: 0, duration: 60, text: 'Source' }] }) })
  const parsed = await loadGraphDataFromTextViaParser('clock.video-agent.md', documentText, { applyToStore: false })
  assert.ok(sync.resolveRichMediaTimelineDurationUnits(parsed?.graphData) > 0, 'the current producer supplies actual Gantt units')
  const env = initJsdomHarness(), initial = store.getState(), host = document.createElement('section')
  document.body.append(host); const root = createRoot(host), messages: sync.RichMediaTimelineTransportFrame[] = [], callbacks: (() => void)[] = []
  let model!: ReturnType<typeof useRichMediaPanelMediaState>, overlayId = 'source-panel', published = 0
  function Harness() {
    model = useRichMediaPanelMediaState({ overlayId, title: 'Source', url: '', srcDoc: '<section>Source</section>' })
    return <iframe ref={model.inlineSrcDocFrameRef} title="Source" />
  }
  const w = env.dom.window, oldTimeout = w.setTimeout, oldClear = w.clearTimeout
  const ready = () => w.dispatchEvent(new w.MessageEvent('message', { source: model.inlineSrcDocFrameRef.current!.contentWindow,
    data: { type: sync.RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE } }))
  const capture = () => { model.inlineSrcDocFrameRef.current!.contentWindow!.postMessage = (message: sync.RichMediaTimelineTransportFrame) => {
    if (message.type === sync.RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_MESSAGE) messages.push(message)
  } }
  try {
    store.setState({ markdownDocumentName: 'doc', timelineTransportDocumentKey: 'doc', timelineTransportPosition: position,
      timelineTransportPlaying: false, timelineTransportPlaybackRate: 1, graphData: { ...parsed!.graphData!, nodes: [...parsed!.graphData!.nodes,
        { id: 'analysis', label: 'Boxes', type: 'RichMediaPanel', properties: { kind: 'video-agent-frame-analysis', sourceUrl: request.sourceUrl } },
      ] } })
    Reflect.deleteProperty(w, sync.RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY)
    w.setTimeout = ((fn: () => void) => { callbacks.push(fn); return callbacks.length }) as typeof w.setTimeout; w.clearTimeout = () => {}
    w.addEventListener(sync.RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, () => { published++ })
    await act(async () => root.render(<Harness />)); capture(); ready()
    assert.equal(messages.length, 0, 'a Gantt follower waits rather than inventing a milliseconds conversion')
    sync.publishRichMediaTimelineTransportFrame(clock)
    assert.equal(messages.at(-1)?.timeMs, 35860)
    ready(); model.scheduleInlineSrcDocTimelineFrameBurst(); callbacks.splice(0).forEach(fn => fn())
    assert.ok(messages.length > 2); assert.ok(messages.every(frame => frame.timeMs === 35860 && frame.sourcePlayback === false))
    assert.equal(published, 1, 'READY and retries cannot republish a follower frame as a clock owner')
    assert.equal(Reflect.get(w, sync.RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY), clock)
    overlayId = 'analysis'; sync.requestRichMediaTimelineTargetFrame({ ...request, position })
    await act(async () => root.render(<Harness />)); capture(); ready()
    assert.equal(messages.at(-1)?.timeMs, 6173, 'trimmed-source annotation time takes priority over composition time')
    assert.equal(messages.at(-1)?.frameSampleUrl, request.frameSampleUrl)
    const stale = callbacks.slice()
    await act(async () => store.setState({ markdownDocumentName: 'other', timelineTransportDocumentKey: 'other' }))
    const count = messages.length; stale.forEach(fn => fn()); ready()
    assert.equal(messages.length, count, 'foreign document and old delayed retries cannot replay the prior clock')
  } finally { w.setTimeout = oldTimeout; w.clearTimeout = oldClear; sync.clearRichMediaTimelineTargetFrame(); await act(async () => root.unmount()); store.setState(initial); host.remove(); env.restore() }
})

test('mounted Gantt YouTube source receives exact clock through its owned iframe', async () => {
  const { GanttTimelineTransportMediaPlayer, readTimelineTransportMediaPreviewKind } = await import('../features/gitgraph/GanttTimelineTransportMediaPlayer')
  const { default: RichMediaPanel } = await import('../components/RichMediaPanel')
  const { useGraphStore } = await import('../hooks/useGraphStore')
  const { dom, restore } = initJsdomHarness(), previousStore = useGraphStore.getState()
  const url = 'https://www.youtube.com/watch?v=77FAnT935IE', documentKey = 'source-player.md', position = 35.86 / 60
  useGraphStore.setState({ markdownDocumentName: documentKey, timelineTransportDocumentKey: documentKey,
    timelineTransportPosition: position, timelineTransportPlaying: false, timelineTransportPlaybackRate: 1,
    graphData: { type: 'graph', nodes: [], edges: [], metadata: { frontmatterMeta: { mermaid: 'gantt\n  Source : clip, 00:00, 1m' } } } })
  const host = dom.window.document.createElement('section'), root = createRoot(host)
  dom.window.document.body.append(host)
  const item: import('../components/timeline/videoSequenceTimeline').VideoSequenceTimelineSource = { id: 'source-player.mp4', originalName: 'source-player.mp4', relativePath: 'source-player.mp4', workspacePath: '', sourceUrl: url, mimeHint: 'video/mp4', byteSize: 4, importMode: 'url' }
  const model: import('../features/gitgraph/GanttTimelineTransportMediaPlayer').GanttTimelineTransportMediaPlayerModel = { active: true, documentKey, exportPlan: null,
    kind: readTimelineTransportMediaPreviewKind(item, url), maxMinutes: 1, playbackRate: 1, playing: false,
    positionMinutes: position, readerDurationSeconds: 60, source: item, title: 'Source player', url,
    setTransportPlaybackPosition: () => {}, setTransportPlaying: () => {} }
  try {
    assert.equal(model.kind, 'iframe')
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(GanttTimelineTransportMediaPlayer, { model }), React.createElement('aside', null,
        React.createElement(RichMediaPanel, { title: 'Baseline', kind: 'iframe', url: '', srcDoc: '<main>Baseline</main>', frameMode: 'surface' })))))
    assert.equal(host.querySelector('video'), null)
    const ownedFrame = () => host.querySelector<HTMLIFrameElement>('[data-kg-video-sequence-media-player] iframe[srcdoc]')
    for (let attempt = 0; attempt < 20 && !ownedFrame(); attempt++) await act(async () => new Promise(resolve => setTimeout(resolve, 50)))
    const outer = ownedFrame()
    assert.ok(outer, 'the actual source player must mount within the bounded lazy readiness wait')
    const content = dom.window.document.createElement('template'); content.innerHTML = outer.srcdoc
    const embed = new URL(content.content.querySelector('[data-kg-video-agent-source-playback] iframe')!.getAttribute('src')!)
    assert.equal(embed.hostname, 'www.youtube-nocookie.com'); assert.equal(embed.pathname, '/embed/77FAnT935IE')
    assert.equal(embed.searchParams.get('enablejsapi'), '1'); assert.equal(embed.searchParams.get('origin'), dom.window.location.origin)
    assert.equal(content.content.querySelector('footer a')?.getAttribute('href'), url)
    const frame = sync.buildRichMediaTimelineTransportFrame({ localDocumentKey: documentKey, transportDocumentKey: documentKey,
      transportPlaybackRate: 1, transportPlaying: false, transportPosition: position, override: { sourcePlayback: false, timeMs: 35860 } })!
    await act(async () => { sync.publishRichMediaTimelineTransportFrame(frame); outer.removeAttribute(sync.RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR); dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: sync.RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE }, source: outer.contentWindow })) })
    const delivered = JSON.parse(outer.getAttribute(sync.RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR)!)
    assert.equal(delivered.timeMs, 35860); assert.equal(delivered.sourcePlayback, true)
    assert.equal(Reflect.get(dom.window, sync.RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY).sourcePlayback, false)
    assert.equal(JSON.parse(host.querySelector('aside iframe')!.getAttribute(sync.RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR)!).sourcePlayback, false)
    assert.equal(model.url, url); assert.deepEqual(model.source, item)
  } finally {
    await act(async () => root.unmount()); host.remove(); useGraphStore.setState(previousStore); restore()
  }
})
