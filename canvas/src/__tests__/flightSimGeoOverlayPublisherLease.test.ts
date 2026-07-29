import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canClearFlightGeoOverlayAfterPublisherRelease,
  clearFlightGeoOverlayAfterPublisherRelease,
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
    canClearFlightGeoOverlayAfterPublisherRelease(activePublisher, true),
    false,
    'a temporary zero-publisher window cannot clear an active Flight runtime',
  )
  assert.equal(
    canClearFlightGeoOverlayAfterPublisherRelease(activePublisher, false),
    true,
    'the last released publisher may clear after the Flight runtime exits',
  )
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

test('deferred publisher cleanup reads live Flight and replacement ownership after module load', async () => {
  let clearCount = 0
  let flightRuntimeActive = true
  const runtimeListeners = new Set<() => void>()
  const subscribeFlightRuntime = (listener: () => void) => {
    runtimeListeners.add(listener)
    return () => runtimeListeners.delete(listener)
  }
  const publishFlightRuntime = () => {
    for (const listener of [...runtimeListeners]) listener()
  }
  let resolveActiveModule!: (
    module: Readonly<{ clearFlightGeoOverlay: () => void }>,
  ) => void
  const activeModule = new Promise<
    Readonly<{ clearFlightGeoOverlay: () => void }>
  >(resolve => {
    resolveActiveModule = resolve
  })
  const activeLease = claimActiveFlightGeoOverlayPublisherLease(true, true)
  assert.ok(activeLease)
  assert.equal(activeLease.release(), true)
  const activeCleanup = clearFlightGeoOverlayAfterPublisherRelease(
    activeLease,
    () => flightRuntimeActive,
    subscribeFlightRuntime,
    () => activeModule,
  )
  resolveActiveModule({
    clearFlightGeoOverlay: () => {
      clearCount += 1
    },
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(
    clearCount,
    0,
    'a released surface cannot clear while the Flight runtime remains active',
  )
  assert.equal(runtimeListeners.size, 1)
  flightRuntimeActive = false
  publishFlightRuntime()
  assert.equal(await activeCleanup, true)
  assert.equal(clearCount, 1)
  assert.equal(runtimeListeners.size, 0)

  flightRuntimeActive = true
  let resolveReplacedModule!: (
    module: Readonly<{ clearFlightGeoOverlay: () => void }>,
  ) => void
  const replacedModule = new Promise<
    Readonly<{ clearFlightGeoOverlay: () => void }>
  >(resolve => {
    resolveReplacedModule = resolve
  })
  const retiredLease = claimActiveFlightGeoOverlayPublisherLease(true, true)
  assert.ok(retiredLease)
  assert.equal(retiredLease.release(), true)
  const replacedCleanup = clearFlightGeoOverlayAfterPublisherRelease(
    retiredLease,
    () => flightRuntimeActive,
    subscribeFlightRuntime,
    () => replacedModule,
  )
  resolveReplacedModule({
    clearFlightGeoOverlay: () => {
      clearCount += 1
    },
  })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(runtimeListeners.size, 1)
  const replacementLease = claimActiveFlightGeoOverlayPublisherLease(true, true)
  assert.ok(replacementLease)
  assert.equal(await replacedCleanup, false)
  assert.equal(
    clearCount,
    1,
    'a later publisher claim must fence the retired asynchronous cleanup',
  )
  assert.equal(runtimeListeners.size, 0)
  flightRuntimeActive = false
  publishFlightRuntime()
  assert.equal(clearCount, 1)
  assert.equal(replacementLease.release(), true)
})
