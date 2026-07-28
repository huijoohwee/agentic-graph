import assert from 'node:assert/strict'
import test from 'node:test'
import {
  claimFlightGeoOverlayPublisherLease,
} from '@/features/game-flight-sim/flightGeoOverlayPublisherLease'

test('a newer Geo overlay publisher fences stale asynchronous cleanup', () => {
  const superseded = claimFlightGeoOverlayPublisherLease()
  assert.equal(superseded.isCurrent(), true)

  const current = claimFlightGeoOverlayPublisherLease()
  assert.equal(superseded.isCurrent(), false)
  assert.equal(current.isCurrent(), true)
})
