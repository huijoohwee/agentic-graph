import assert from 'node:assert/strict'
import { test } from 'node:test'

import { confirmXrV2ConnectedPreviewChannelRoundTrip } from '../browserRuntimeEvidence'
import { settleXrV2ConnectedPreviewChannel } from '../xrV2ConnectedPreviewWarmup'

function channelPair(deliver = true) {
  const authorTarget = new EventTarget()
  const viewerTarget = new EventTarget()
  const authorSent: string[] = []
  const viewerSent: string[] = []
  const author = Object.assign(authorTarget, {
    readyState: 'open',
    send: (data: string) => {
      authorSent.push(data)
      if (deliver) queueMicrotask(() => viewerTarget.dispatchEvent(new MessageEvent('message', { data })))
    },
  }) as unknown as RTCDataChannel
  const viewer = Object.assign(viewerTarget, {
    readyState: 'open',
    send: (data: string) => {
      viewerSent.push(data)
      if (deliver) queueMicrotask(() => authorTarget.dispatchEvent(new MessageEvent('message', { data })))
    },
  }) as unknown as RTCDataChannel
  return { author, viewer, authorSent, viewerSent }
}

test('connected-preview confirms one exact application round trip before measuring edits', async () => {
  const pair = channelPair()
  const challenge = 'kg-xr-v2-channel-ready:test1234'
  await confirmXrV2ConnectedPreviewChannelRoundTrip(
    pair.author,
    pair.viewer,
    new AbortController().signal,
    { challenge, timeoutMs: 100 },
  )
  assert.deepEqual(pair.authorSent, [challenge])
  assert.deepEqual(pair.viewerSent, [`${challenge}:ack`])
})

test('connected-preview readiness confirmation fails closed on timeout and cancellation', async () => {
  const silent = channelPair(false)
  await assert.rejects(confirmXrV2ConnectedPreviewChannelRoundTrip(
    silent.author,
    silent.viewer,
    new AbortController().signal,
    { challenge: 'kg-xr-v2-channel-ready:timeout1', timeoutMs: 10 },
  ), /round trip timed out/)

  const cancelled = channelPair(false)
  const abort = new AbortController()
  const pending = confirmXrV2ConnectedPreviewChannelRoundTrip(
    cancelled.author,
    cancelled.viewer,
    abort.signal,
    { challenge: 'kg-xr-v2-channel-ready:cancel1', timeoutMs: 100 },
  )
  abort.abort()
  await assert.rejects(pending, /observation was aborted/)
})

test('connected-preview channel quiescence is bounded and abortable', async () => {
  await settleXrV2ConnectedPreviewChannel(new AbortController().signal, 1)
  await assert.rejects(
    settleXrV2ConnectedPreviewChannel(new AbortController().signal, 1_001),
    /quiescence delay is invalid/,
  )
  const abort = new AbortController()
  const pending = settleXrV2ConnectedPreviewChannel(abort.signal, 100)
  abort.abort()
  await assert.rejects(pending, /observation was aborted/)
})
