import assert from 'node:assert/strict'
import test from 'node:test'

import {
  markMapLibreFlightBootstrapApplied,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap'
import {
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  acquireFlightSimGeospatialBootstrapRequest,
  readFlightSimGeospatialBootstrapRequested,
} from '../features/game-flight-sim/flightSimSurfaceOpenLifecycle'
import {
  beginFlightSimStagePreparation,
  cancelFlightSimStagePreparation,
  completeFlightSimHudStagePreparation,
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
  resetFlightSimStagePreparationForTests,
  waitForFlightSimStagePreparation,
} from '../features/game-flight-sim/flightSimStagePreparationRuntime'
import {
  flightOverlay,
  presentationHarness,
  withEnvironment,
} from './helpers/flightSimMapLibrePresentationHarness'

test('cold Geo+XR preparation waits for both Flight sources to settle', async context => {
  resetFlightSimStagePreparationForTests()
  const releaseBootstrapRequest =
    acquireFlightSimGeospatialBootstrapRequest()
  const requestId = beginFlightSimStagePreparation()
  let harness: ReturnType<typeof presentationHarness> | null = null
  context.after(() => {
    harness?.gate.dispose()
    releaseBootstrapRequest()
    cancelFlightSimStagePreparation(requestId)
    resetFlightSimStagePreparationForTests()
  })

  const surfaceRevision = 41
  const stopped = withEnvironment(
    flightOverlay('stopped', 'stopped:cold-source-settlement', null),
  )
  harness = presentationHarness(
    stopped,
    presentation => {
      assert.equal(presentation.phase, 'stopped')
      assert.equal(
        completeFlightSimStagePreparation(requestId, {
          framePresented: true,
          revision: surfaceRevision,
        }),
        true,
      )
    },
    {
      bootstrapApplied: false,
      environmentSourceLoaded: false,
      overlaySourceLoaded: false,
    },
  )
  harness.setWidth(100)

  let prepared = false
  const preparation = waitForFlightSimStagePreparation(
    requestId,
    { limitMs: 1_000 },
  ).then(() => {
    prepared = true
  })
  assert.equal(
    completeFlightSimHudStagePreparation(requestId, surfaceRevision),
    true,
  )
  assert.equal(readFlightSimGeospatialBootstrapRequested(), true)

  harness.gate.request(stopped)
  assert.equal(harness.repaintCount(), 0)
  for (let paint = 0; paint < 200; paint += 1) harness.emitRender()
  await Promise.resolve()
  assert.equal(harness.presentations.length, 0)
  assert.equal(
    harness.listenerCount(),
    1,
    'unloaded sources must not exhaust the painter-attempt budget',
  )
  assert.equal(
    harness.repaintCount(),
    0,
    'worker settlement must not be delayed by a speculative repaint loop',
  )
  assert.equal(prepared, false)
  assert.equal(readCurrentFlightSimStagePreparationRequest(), requestId)

  markMapLibreFlightBootstrapApplied(harness.map)
  harness.emitRender()
  await Promise.resolve()
  assert.equal(harness.presentations.length, 0)
  assert.equal(prepared, false)
  assert.equal(readCurrentFlightSimStagePreparationRequest(), requestId)

  harness.setOverlaySourceLoaded(true)
  harness.emitSourceData('provider-background-source')
  harness.emitSourceData(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  await Promise.resolve()
  assert.equal(
    harness.presentations.length,
    0,
    'the environment worker must settle before the stopped frame can commit',
  )
  assert.equal(prepared, false)
  assert.equal(readCurrentFlightSimStagePreparationRequest(), requestId)
  assert.equal(harness.repaintCount(), 0)

  harness.setEnvironmentSourceLoaded(true)
  harness.emitSourceData(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
  harness.emitSourceData(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
  harness.emitSourceData(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  assert.equal(
    harness.repaintCount(),
    1,
    'duplicate loaded events should coalesce into one exact painter frame',
  )
  harness.setEnvironmentSourceLoaded(false)
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)
  assert.equal(prepared, false)

  harness.setEnvironmentSourceLoaded(true)
  harness.emitSourceData(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)
  assert.equal(
    harness.repaintCount(),
    2,
    'a source unloaded before paint must wait for a fresh settlement event',
  )
  harness.emitRender()
  await preparation

  assert.equal(harness.presentations.length, 1)
  assert.equal(prepared, true)
  assert.equal(readCurrentFlightSimStagePreparationRequest(), null)
  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.sourceDataListenerCount(), 1)

  releaseBootstrapRequest()
  assert.equal(readFlightSimGeospatialBootstrapRequested(), false)

  harness.gate.dispose()
  assert.equal(harness.sourceDataListenerCount(), 0)
})

test('owned source settlement cancels a stale Flight presentation request', () => {
  const stopped = withEnvironment(
    flightOverlay('stopped', 'stopped:stale-source-settlement', null),
  )
  const harness = presentationHarness(stopped, undefined, {
    environmentSourceLoaded: false,
    overlaySourceLoaded: false,
  })
  harness.setWidth(100)
  harness.gate.request(stopped)

  harness.setCurrentPreservingSourceData({
    ...stopped,
    phase: 'ready',
    readyFrameRequestId: 17,
    runId: 1,
  })
  harness.setOverlaySourceLoaded(true)
  harness.setEnvironmentSourceLoaded(true)
  harness.emitSourceData(FLIGHT_GEO_ENVIRONMENT_SOURCE_ID)

  assert.equal(harness.listenerCount(), 0)
  assert.equal(harness.repaintCount(), 0)
  assert.equal(harness.presentations.length, 0)
  harness.gate.dispose()
  assert.equal(harness.sourceDataListenerCount(), 0)
})

test('a failed owned GeoJSON worker cannot present serialized but stale data', () => {
  const stopped = flightOverlay(
    'stopped',
    'stopped:failed-source-worker',
    null,
  )
  const harness = presentationHarness(stopped, undefined, {
    overlaySourceLoaded: false,
  })
  harness.setWidth(100)
  harness.gate.request(stopped)

  harness.emitSourceDataLoading(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  harness.setOverlaySourceLoaded(true)
  harness.emitSourceDataError(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  harness.emitRender()
  harness.emitRender()

  assert.equal(
    harness.presentations.length,
    0,
    'loaded serialized data must not substitute for successful worker output',
  )
  assert.equal(harness.listenerCount(), 1)
  assert.equal(harness.repaintCount(), 0)

  harness.emitSourceData('provider-background-source')
  harness.emitRender()
  assert.equal(harness.presentations.length, 0)

  harness.emitSourceData(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  assert.equal(harness.repaintCount(), 1)
  harness.emitRender()
  assert.equal(harness.presentations.length, 1)

  harness.gate.dispose()
  assert.equal(harness.sourceLifecycleListenerCount(), 0)
})

test('owned GeoJSON tile loading does not poison source-worker settlement', () => {
  const stopped = flightOverlay(
    'stopped',
    'stopped:source-tile-loading',
    null,
  )
  const harness = presentationHarness(stopped)
  harness.setWidth(100)
  harness.gate.request(stopped)

  harness.emitSourceDataLoading(FLIGHT_GEO_OVERLAY_SOURCE_ID, true)
  harness.emitSourceTileData(FLIGHT_GEO_OVERLAY_SOURCE_ID)
  harness.emitRender()

  assert.equal(harness.presentations.length, 1)
  assert.equal(harness.listenerCount(), 0)
  harness.gate.dispose()
  assert.equal(harness.sourceLifecycleListenerCount(), 0)
})
