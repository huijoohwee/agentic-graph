import test from 'node:test'
import assert from 'node:assert/strict'
import { bindSourceTimeline } from '../sourceTimelineBridge'

test('native Timeline alone drives exact UTC and clamps endpoints without a second clock', async () => {
  const timeline = { documentKey: 'source:exact', startUtc: '2026-10-04T02:24:42.724Z', durationSeconds: 115.432 }
  let source = { loading: false, timeline, atUtc: '2026-10-04T02:25:30.000Z', snapshot: {} }
  let listener = () => {}, sourceListener = () => {}, requests: string[] = []
  const transport = { timelineTransportDocumentKey: 'other', timelineTransportPosition: 0, playing: true,
    setTimelineTransportState(update: any) { Object.assign(transport, { ...(update.documentKey !== undefined ? { timelineTransportDocumentKey: update.documentKey } : {}), ...(update.position !== undefined ? { timelineTransportPosition: update.position } : {}), ...(update.playing !== undefined ? { playing: update.playing } : {}) }); listener() },
  }
  const dispose = bindSourceTimeline(timeline, { readSource: () => source, readTransport: () => transport,
    subscribe: cb => { listener = cb; return () => { listener = () => {} } }, subscribeSource: cb => { sourceListener = cb; return () => { sourceListener = () => {} } }, setTime: async time => { requests.push(time) },
  })
  assert.equal(transport.playing, false); assert.equal(transport.timelineTransportDocumentKey, timeline.documentKey)
  assert.ok(Math.abs(transport.timelineTransportPosition * 60000 - 47276) < 1e-6)
  transport.setTimelineTransportState({ position: 0.001 }); assert.deepEqual(requests, ['2026-10-04T02:24:42.784Z'])
  listener(); assert.equal(requests.length, 1)
  source.loading = true; transport.setTimelineTransportState({ position: 0.5 }); assert.equal(requests.length, 1)
  source.loading = false; sourceListener(); assert.equal(requests.at(-1), '2026-10-04T02:25:12.724Z')
  transport.setTimelineTransportState({ position: 999 }); assert.equal(requests.at(-1), '2026-10-04T02:26:38.156Z')
  transport.setTimelineTransportState({ position: -2 }); assert.equal(requests.at(-1), timeline.startUtc)
  transport.setTimelineTransportState({ position: NaN }); assert.equal(requests.length, 4)
  dispose(); transport.setTimelineTransportState({ position: 1 }); assert.equal(requests.length, 4)
})

test('source replacement and unmount cannot seize or stop another document transport', () => {
  const timeline = { documentKey: 'source:first', startUtc: '2026-10-04T02:24:42.724Z', durationSeconds: 10 }
  let source: { timeline: typeof timeline | null; atUtc: string; snapshot: unknown } = { timeline, atUtc: timeline.startUtc, snapshot: {} }
  let listener = () => {}, count = 0, stops = 0
  const transport = { timelineTransportDocumentKey: '', timelineTransportPosition: 0,
    setTimelineTransportState(update: any) { if (update.documentKey) transport.timelineTransportDocumentKey = update.documentKey; if (update.position !== undefined) transport.timelineTransportPosition = update.position; if (update.playing === false) stops++ },
  }
  const deps = { readSource: () => source, readTransport: () => transport, subscribe: (cb: () => void) => { listener = cb; return () => { listener = () => {} } }, setTime: async () => { count++ } }
  const dispose = bindSourceTimeline(timeline, deps)
  source = { ...source, timeline: null, snapshot: null }; transport.timelineTransportPosition = 0.01; listener(); assert.equal(count, 0)
  transport.timelineTransportDocumentKey = 'different'; const prior = stops; dispose(); assert.equal(stops, prior)
  bindSourceTimeline(timeline, deps)(); assert.equal(transport.timelineTransportDocumentKey, 'different'); assert.equal(stops, prior)
})
