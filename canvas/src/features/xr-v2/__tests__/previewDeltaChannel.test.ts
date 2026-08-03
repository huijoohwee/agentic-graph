import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PREVIEW_DELTA_SCHEMA,
  createPreviewDeltaChannel,
  type RevisionedPreviewDelta,
} from '../previewDeltaChannel'

function delta(revision: number, payload: RevisionedPreviewDelta['payload'] = { value: revision }): RevisionedPreviewDelta {
  return {
    schema: PREVIEW_DELTA_SCHEMA,
    streamId: 'scene.preview',
    baseRevision: revision - 1,
    revision,
    payload,
  }
}

test('preview channel rejects stale and out-of-order deltas while bounding replay', () => {
  const channel = createPreviewDeltaChannel({ streamId: 'scene.preview', maxBufferedDeltas: 2 })
  assert.equal(channel.publish(delta(2)).status, 'out-of-order')
  assert.equal(channel.publish(delta(1)).status, 'accepted')
  assert.equal(channel.publish(delta(1)).status, 'stale')
  assert.equal(channel.publish(delta(2)).status, 'accepted')
  assert.equal(channel.publish(delta(3)).status, 'accepted')

  const snapshot = channel.snapshot()
  assert.equal(snapshot.revision, 3)
  assert.deepEqual(snapshot.deltas.map(item => item.revision), [2, 3])
})

test('preview channel clones payloads, isolates subscriber failures, and rejects oversized deltas', () => {
  const channel = createPreviewDeltaChannel({ streamId: 'scene.preview', maxDeltaBytes: 64 })
  const values: number[] = []
  channel.subscribe(item => values.push((item.payload as { value: number }).value))
  channel.subscribe(() => { throw new Error('consumer failed') })
  const payload = { value: 1 }
  const accepted = channel.publish(delta(1, payload))
  payload.value = 9

  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.subscriberErrors, 1)
  assert.deepEqual(values, [1])
  assert.deepEqual(channel.snapshot().deltas[0].payload, { value: 1 })
  assert.equal(channel.publish(delta(2, { text: 'x'.repeat(100) })).status, 'too-large')
  assert.equal(channel.snapshot().revision, 1)
})

test('preview channel rejects reentrant publication and closes subscriptions', () => {
  const channel = createPreviewDeltaChannel({ streamId: 'scene.preview', maxSubscribers: 1 })
  const subscription = channel.subscribe(() => {
    assert.equal(channel.publish(delta(2)).status, 'reentrant')
  })
  assert.equal(subscription.status, 'subscribed')
  assert.equal(channel.subscribe(() => undefined).status, 'full')
  assert.equal(channel.publish(delta(1)).status, 'accepted')
  channel.close()
  assert.equal(channel.publish(delta(2)).status, 'closed')
  assert.equal(channel.snapshot().deltas.length, 0)
})
