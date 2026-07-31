import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canClearGeoXrOverlaysAfterPublisherRelease,
  clearGeoXrOverlaysAfterPublisherRelease,
  claimActiveGeoXrOverlayPublisherLease,
} from '@/features/geospatial/geoXrOverlayPublisherLease'

test('inactive Geo+XR surfaces cannot supersede the active overlay publisher', async () => {
  const activePublisher = claimActiveGeoXrOverlayPublisherLease(true, true)
  assert.ok(activePublisher)
  let activePublications = 0
  const stopActivation = activePublisher.onBecameCurrent(() => {
    activePublications += 1
  })
  assert.equal(activePublisher.isCurrent(), true)
  assert.equal(activePublications, 1)

  const inactivePublisher = await Promise.resolve().then(() => (
    claimActiveGeoXrOverlayPublisherLease(false, true)
  ))
  const nonComposedPublisher = await Promise.resolve().then(() => (
    claimActiveGeoXrOverlayPublisherLease(true, false)
  ))
  assert.equal(inactivePublisher, null)
  assert.equal(nonComposedPublisher, null)
  assert.equal(activePublisher.isCurrent(), true)

  const replacement = claimActiveGeoXrOverlayPublisherLease(true, true)
  assert.ok(replacement)
  const stopReplacement = replacement.onBecameCurrent(() => void 0)
  assert.equal(activePublisher.isCurrent(), false)
  assert.equal(replacement.isCurrent(), true)
  assert.equal(replacement.release(), false)
  assert.equal(activePublisher.isCurrent(), true)
  assert.equal(activePublications, 2)

  let disposed = false
  const capturedPublish = () => !disposed && activePublisher.isCurrent()
  assert.equal(capturedPublish(), true)
  disposed = true
  stopReplacement()
  stopActivation()
  assert.equal(activePublisher.release(), true)
  assert.equal(activePublisher.canClearAfterRelease(), true)
  assert.equal(
    canClearGeoXrOverlaysAfterPublisherRelease(activePublisher, true),
    false,
  )
  assert.equal(
    canClearGeoXrOverlaysAfterPublisherRelease(activePublisher, false),
    true,
  )
  assert.equal(capturedPublish(), false)

  const latePublisher = claimActiveGeoXrOverlayPublisherLease(true, true)
  assert.ok(latePublisher)
  assert.equal(activePublisher.canClearAfterRelease(), false)
  assert.equal(latePublisher.release(), true)
})

test('deferred cleanup clears City and Flight stores only after gameplay exits', async () => {
  const cleared = { city: 0, flight: 0 }
  let gameplayRuntimeActive = true
  const runtimeListeners = new Set<() => void>()
  const subscribeGameplayRuntime = (listener: () => void) => {
    runtimeListeners.add(listener)
    return () => runtimeListeners.delete(listener)
  }
  const publishGameplayRuntime = () => {
    for (const listener of [...runtimeListeners]) listener()
  }
  const overlayModule = {
    clearCityGeoOverlay: () => {
      cleared.city += 1
    },
    clearFlightGeoOverlay: () => {
      cleared.flight += 1
    },
  }
  let resolveModule!: (module: typeof overlayModule) => void
  const pendingModule = new Promise<typeof overlayModule>(resolve => {
    resolveModule = resolve
  })
  const lease = claimActiveGeoXrOverlayPublisherLease(true, true)
  assert.ok(lease)
  assert.equal(lease.release(), true)
  const cleanup = clearGeoXrOverlaysAfterPublisherRelease(
    lease,
    () => gameplayRuntimeActive,
    subscribeGameplayRuntime,
    () => pendingModule,
  )
  resolveModule(overlayModule)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.deepEqual(cleared, { city: 0, flight: 0 })
  assert.equal(runtimeListeners.size, 1)

  gameplayRuntimeActive = false
  publishGameplayRuntime()
  assert.equal(await cleanup, true)
  assert.deepEqual(cleared, { city: 1, flight: 1 })
  assert.equal(runtimeListeners.size, 0)
})

test('replacement publisher fences retired cleanup for both overlay stores', async () => {
  const cleared = { city: 0, flight: 0 }
  let gameplayRuntimeActive = true
  const runtimeListeners = new Set<() => void>()
  const subscribeGameplayRuntime = (listener: () => void) => {
    runtimeListeners.add(listener)
    return () => runtimeListeners.delete(listener)
  }
  const overlayModule = {
    clearCityGeoOverlay: () => {
      cleared.city += 1
    },
    clearFlightGeoOverlay: () => {
      cleared.flight += 1
    },
  }
  let resolveModule!: (module: typeof overlayModule) => void
  const pendingModule = new Promise<typeof overlayModule>(resolve => {
    resolveModule = resolve
  })
  const retiredLease = claimActiveGeoXrOverlayPublisherLease(true, true)
  assert.ok(retiredLease)
  assert.equal(retiredLease.release(), true)
  const cleanup = clearGeoXrOverlaysAfterPublisherRelease(
    retiredLease,
    () => gameplayRuntimeActive,
    subscribeGameplayRuntime,
    () => pendingModule,
  )
  resolveModule(overlayModule)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(runtimeListeners.size, 1)

  const replacementLease = claimActiveGeoXrOverlayPublisherLease(true, true)
  assert.ok(replacementLease)
  assert.equal(await cleanup, false)
  assert.deepEqual(cleared, { city: 0, flight: 0 })
  assert.equal(runtimeListeners.size, 0)

  gameplayRuntimeActive = false
  assert.equal(replacementLease.release(), true)
  assert.equal(
    await clearGeoXrOverlaysAfterPublisherRelease(
      replacementLease,
      () => gameplayRuntimeActive,
      subscribeGameplayRuntime,
      async () => overlayModule,
    ),
    true,
  )
  assert.deepEqual(cleared, { city: 1, flight: 1 })
})
