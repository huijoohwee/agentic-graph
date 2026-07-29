import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoOverlay,
  markFlightGeoOverlayReadyFramePresented,
  readFlightGeoOverlayReadyFramePresented,
  setFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  applyFlightGeoEnvironmentToMap,
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  mapHasExactFlightGeoEnvironment,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'
import {
  applyFlightGeoOverlayToMap,
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  mapHasExactFlightGeoOverlay,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  beginMapLibreFlightBootstrap,
  disposeMapLibreFlightBootstrap,
  markMapLibreFlightBootstrapApplied,
  markMapLibreFlightOverlayPresented,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap'
import {
  deferFlightGeoPresentationForBootstrapRecovery,
} from '../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation'
import {
  flightOverlay,
  presentationHarness,
  withEnvironment,
} from './helpers/flightSimMapLibrePresentationHarness'

const flushMicrotasks = () => new Promise<void>(resolve => setImmediate(resolve))

test('consumed Ready recovery restores exact MapLibre sources without re-acknowledging its earned deadline', async context => {
  const requestId = 73
  const ready = withEnvironment(
    flightOverlay('ready', 'ready:consumed-recovery', requestId),
  )
  clearFlightGeoOverlay()
  setFlightGeoOverlay(ready)
  assert.equal(
    markFlightGeoOverlayReadyFramePresented(ready.revision, requestId),
    true,
  )
  const consumed = {
    ...ready,
    readyFrameRequestId: null,
  }
  setFlightGeoOverlay(consumed)
  assert.equal(readFlightGeoOverlayReadyFramePresented(), true)

  const harness = presentationHarness(
    consumed,
    undefined,
    { bootstrapApplied: false },
  )
  harness.setWidth(100)
  context.after(() => {
    harness.gate.dispose()
    disposeMapLibreFlightBootstrap(harness.map)
    clearFlightGeoOverlay()
  })
  const bootstrapStyle = {
    version: 8,
    name: 'local-flight-bootstrap',
    sources: {},
    layers: [{
      id: 'kg-flight-sim:geo-bootstrap-background',
      type: 'background',
    }],
  }
  reconcileMapLibreFlightBootstrap({
    bootstrapStyle,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => ({
      version: 8,
      name: 'provider-flight',
      sources: {},
      layers: [],
    }),
    map: harness.map,
    scheduleProviderStyleApply: apply => {
      apply()
      return () => void 0
    },
    retainFlightOverlay: (_previous, next) => ({ ...next }),
  })
  markMapLibreFlightBootstrapApplied(harness.map)
  markMapLibreFlightOverlayPresented(harness.map, consumed)
  harness.emitRender()
  await flushMicrotasks()
  const presentationCallbacksBeforeRecovery = harness.presentations.length

  harness.setCurrentPreservingSourceData(consumed)
  harness.replaceSourceData(null)
  for (const layerId of [
    ...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
    ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  ]) {
    harness.setLayerPresent(layerId, false)
  }
  beginMapLibreFlightBootstrap(harness.map, bootstrapStyle)
  harness.map.setStyle(bootstrapStyle)
  assert.equal(
    deferFlightGeoPresentationForBootstrapRecovery(
      harness.map,
      consumed,
      false,
    ),
    true,
  )

  markMapLibreFlightBootstrapApplied(harness.map)
  assert.equal(
    deferFlightGeoPresentationForBootstrapRecovery(
      harness.map,
      consumed,
      false,
    ),
    false,
    'the settled local bootstrap must release the production apply path',
  )
  assert.equal(
    applyFlightGeoEnvironmentToMap(harness.map, consumed, '3d'),
    true,
  )
  assert.equal(applyFlightGeoOverlayToMap(harness.map, consumed), true)
  assert.equal(
    mapHasExactFlightGeoEnvironment(harness.map, consumed),
    true,
  )
  assert.equal(mapHasExactFlightGeoOverlay(harness.map, consumed), true)
  harness.gate.request(consumed)
  harness.emitRender()
  assert.equal(
    readFlightGeoOverlayReadyFramePresented(),
    true,
    'visual recovery must preserve the deadline marker earned before request consumption',
  )
  assert.equal(
    harness.presentations.length,
    presentationCallbacksBeforeRecovery + 1,
    'the repaired visuals are presented once through the normal gate',
  )
  assert.equal(
    harness.presentations.at(-1)?.readyFrameRequestId,
    null,
    'the visual-only callback cannot complete an already-consumed deadline',
  )
})
