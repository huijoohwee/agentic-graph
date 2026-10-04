import test from 'node:test'
import assert from 'node:assert/strict'
import { TIMELINE_TRANSPORT_PLAYBACK_RATES, resolveTimelineTransportPlaybackRate, startTimelineTransportPlayback } from '@/components/timeline/timelineTransport'
import { applyRichMediaTimelinePlaybackRate, isRichMediaTimelineRateSeekOnly } from '@/lib/render/richMediaTimelineSync'

test('the shared rate policy admits rates through 20x and rejects invalid input', () => {
  assert.equal(TIMELINE_TRANSPORT_PLAYBACK_RATES.at(-1), 20)
  assert.equal(new Set(TIMELINE_TRANSPORT_PLAYBACK_RATES).size, TIMELINE_TRANSPORT_PLAYBACK_RATES.length)
  for (const rate of TIMELINE_TRANSPORT_PLAYBACK_RATES) assert.equal(resolveTimelineTransportPlaybackRate(String(rate), 1), rate)
  for (const value of [-1, 0, 21, Infinity, NaN, 'bad']) assert.equal(resolveTimelineTransportPlaybackRate(value, 1), 1)
})

test('20x uses the native Timeline driver and ends exactly at the source boundary', () => {
  let frame: FrameRequestCallback = () => {}, ended = 0, current = true
  const state = { position: 0, max: 115.432 / 60, playbackRate: 20, unitsPerMs: 1 / 60000,
    onPositionChange: (position: number) => { state.position = position }, onPlaybackEnd: () => { ended++ },
  }
  const stop = startTimelineTransportPlayback({ readState: () => state, requestFrame: cb => { frame = cb; return 1 }, cancelFrame() {}, now: () => 0, isCurrent: () => current })
  frame(0); frame(1000)
  assert.ok(Math.abs(state.position * 60 - 20) < 1e-9)
  frame(5771.6)
  assert.equal(state.position, state.max); assert.equal(ended, 1)
  stop(); current = false; frame(7000); assert.equal(ended, 1)
})

test('unsupported native rates seek on the shared clock and recover without repeated exceptions', () => {
  let rate = 1, writes = 0, pauses = 0
  const attributes = new Map<string, string>()
  const media = { paused: false, get playbackRate() { return rate }, set playbackRate(value: number) {
    writes++; if (value > 16) throw new DOMException('Unsupported rate', 'NotSupportedError'); rate = value
  }, setAttribute: (key: string, value: string) => attributes.set(key, value), removeAttribute: (key: string) => attributes.delete(key),
  pause() { pauses++; assert.equal(isRichMediaTimelineRateSeekOnly(media as HTMLMediaElement), true); this.paused = true },
  } as unknown as HTMLMediaElement
  assert.equal(applyRichMediaTimelinePlaybackRate(media, 20), false)
  assert.equal(attributes.get('data-kg-timeline-rate-fallback'), 'seek')
  assert.equal(applyRichMediaTimelinePlaybackRate(media, 20), false)
  assert.equal(writes, 1); assert.equal(pauses, 1)
  assert.equal(applyRichMediaTimelinePlaybackRate(media, 10), true)
  assert.equal(isRichMediaTimelineRateSeekOnly(media), false)
  assert.equal(attributes.size, 0); assert.equal(rate, 10)
})

test('unexpected native media failures stay visible', () => {
  const media = { get playbackRate(): number { throw new Error('Disconnected media') } } as unknown as HTMLMediaElement
  assert.throws(() => applyRichMediaTimelinePlaybackRate(media, 20), /Disconnected media/)
})
