import assert from 'node:assert/strict'
import test from 'node:test'

import {
  claimActiveFlightGeoOverlayPublisherLease,
} from '@/features/game-flight-sim/flightGeoOverlayPublisherLease'

test('inactive Geo surfaces cannot supersede the active Flight publisher', async () => {
  const activePublisher = claimActiveFlightGeoOverlayPublisherLease(
    true,
    true,
  )
  assert.ok(activePublisher)
  let activePublications = 0
  const stopActivation = activePublisher.onBecameCurrent(() => {
    activePublications += 1
  })
  assert.equal(activePublisher.isCurrent(), true)
  assert.equal(activePublications, 1)

  const inactivePublisher = await Promise.resolve().then(() => (
    claimActiveFlightGeoOverlayPublisherLease(false, true)
  ))
  const nonComposedPublisher = await Promise.resolve().then(() => (
    claimActiveFlightGeoOverlayPublisherLease(true, false)
  ))

  assert.equal(inactivePublisher, null)
  assert.equal(nonComposedPublisher, null)
  assert.equal(
    activePublisher.isCurrent(),
    true,
    'a later inactive async resolution must not invalidate the active owner',
  )

  const replacement = claimActiveFlightGeoOverlayPublisherLease(true, true)
  assert.ok(replacement)
  const stopReplacement = replacement.onBecameCurrent(() => void 0)
  assert.equal(activePublisher.isCurrent(), false)
  assert.equal(replacement.isCurrent(), true)
  assert.equal(
    replacement.release(),
    false,
    'the restored prior owner must retain the shared overlay',
  )
  assert.equal(activePublisher.isCurrent(), true)
  assert.equal(
    activePublications,
    2,
    'releasing a temporary active owner must republish through the prior owner',
  )

  let disposed = false
  const capturedPublish = () => (
    !disposed && activePublisher.isCurrent()
  )
  assert.equal(capturedPublish(), true)
  disposed = true
  stopReplacement()
  stopActivation()
  assert.equal(activePublisher.release(), true)
  assert.equal(activePublisher.canClearAfterRelease(), true)
  assert.equal(
    capturedPublish(),
    false,
    'a callback captured before cleanup must not publish after lease release',
  )

  const latePublisher = claimActiveFlightGeoOverlayPublisherLease(true, true)
  assert.ok(latePublisher)
  assert.equal(
    activePublisher.canClearAfterRelease(),
    false,
    'an asynchronous retired cleanup must not clear a later publisher',
  )
  assert.equal(latePublisher.release(), true)
})
