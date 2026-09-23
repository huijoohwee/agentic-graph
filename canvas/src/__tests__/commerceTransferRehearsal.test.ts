import assert from 'node:assert/strict'
import test from 'node:test'
import { createCommerceTransferRehearsalStore } from '../features/panels/views/commerceTransferModel'

test('review binds every editable demo term and expires before confirmation', () => {
  let currentTime = 1_000
  let sequence = 0
  const store = createCommerceTransferRehearsalStore(() => currentTime, () => `demo-${++sequence}`)
  for (const patch of [
    { recipient: 'demo-partner' as const },
    { amountMinor: '2000' },
    { asset: 'DEMO-USD' as const },
    { network: 'local-b' as const },
  ]) {
    store.review()
    assert.ok(store.getSnapshot().reviewed)
    store.edit(patch)
    assert.equal(store.getSnapshot().reviewed, null)
    store.confirm()
    assert.equal(store.getSnapshot().activity.length, 0)
  }
  store.review()
  currentTime += 5 * 60_000
  store.confirm()
  assert.equal(store.getSnapshot().activity.length, 0)
  assert.match(store.getSnapshot().message, /expired/)
})

test('unsupported recipient and invalid amount fail closed', () => {
  const store = createCommerceTransferRehearsalStore(() => 1_000, () => 'demo-1')
  store.edit({ recipient: 'unsupported' })
  store.review()
  assert.equal(store.getSnapshot().reviewed, null)
  assert.match(store.getSnapshot().message, /unavailable/)
  store.edit({ recipient: 'demo-merchant', amountMinor: '1.5' })
  store.review()
  assert.equal(store.getSnapshot().reviewed, null)
  store.confirm()
  assert.equal(store.getSnapshot().activity.length, 0)
  store.edit({ amountMinor: '1000', network: 'unknown' as never })
  store.review()
  assert.equal(store.getSnapshot().reviewed, null)
  assert.equal(store.getSnapshot().activity.length, 0)
})

test('offline confirmation and replay retain one local operation without a payment receipt', () => {
  let sequence = 0
  const store = createCommerceTransferRehearsalStore(() => 1_000, () => `demo-${++sequence}`)
  store.setDisconnected(true)
  store.review()
  store.confirm()
  store.confirm()
  const queued = store.getSnapshot().activity
  assert.equal(queued.length, 1)
  assert.equal(queued[0]?.state, 'queued_offline')
  assert.equal(queued[0]?.operationId, 'demo-1')
  store.retry()
  assert.equal(store.getSnapshot().activity[0]?.state, 'queued_offline')
  store.setDisconnected(false)
  store.retry()
  store.retry()
  assert.equal(store.getSnapshot().activity.length, 1)
  assert.equal(store.getSnapshot().activity[0]?.operationId, 'demo-1')
  assert.equal(store.getSnapshot().activity[0]?.state, 'simulated')
  assert.match(store.getSnapshot().message, /No queued simulation/)
  store.clear()
  assert.equal(store.getSnapshot().activity.length, 0)
})
