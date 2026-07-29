import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clearFlightGeoPresentationAttemptDebug,
  recordFlightGeoStoppedPresentation,
  writeFlightGeoPresentationDebug,
} from '../../../gympgrph/src/features/geospatial/flightGeoPresentationDebug'
import type {
  FlightGeoOverlaySnapshot,
} from '../../../gympgrph/src/flightGeoOverlay'
import {
  clearFlightGeoOverlayFromMap,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'

test('Flight overlay disposal clear is idempotent and never creates a missing source', () => {
  let sourceData: Readonly<{
    type: 'FeatureCollection'
    features: readonly unknown[]
  }> = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature' }],
  }
  let sourceWrites = 0
  let sourceAdds = 0
  const source = {
    serialize: () => ({ data: sourceData }),
    setData: (data: typeof sourceData) => {
      sourceWrites += 1
      sourceData = data
    },
  }
  const map = {
    style: { _loaded: true },
    addSource: () => {
      sourceAdds += 1
    },
    getSource: () => source,
  }

  assert.equal(clearFlightGeoOverlayFromMap(map), true)
  assert.equal(sourceWrites, 1)
  assert.equal(clearFlightGeoOverlayFromMap(map), true)
  assert.equal(sourceWrites, 1, 'an empty source must not be dirtied again')

  assert.equal(
    clearFlightGeoOverlayFromMap({
      ...map,
      getSource: () => null,
    }),
    true,
  )
  assert.equal(sourceAdds, 0, 'disposal must not create a missing source')
})

test('a provider style attempt reset preserves the exact stopped settlement audit', () => {
  const root = { dataset: {} as DOMStringMap } as HTMLElement
  const stopped = {
    phase: 'stopped',
    profileId: 'singapore',
    readyFrameRequestId: null,
    revision: 'stopped:provider-swap',
    runId: 0,
  } as FlightGeoOverlaySnapshot
  writeFlightGeoPresentationDebug(root, stopped, 3, 'stopped-camera')
  recordFlightGeoStoppedPresentation(root, stopped, 'stopped-camera')

  clearFlightGeoPresentationAttemptDebug(root)

  assert.equal(root.dataset.kgFlightGeospatialPresentationRevision, undefined)
  assert.equal(root.dataset.kgFlightGeospatialRenderAttempts, undefined)
  assert.equal(
    root.dataset.kgFlightGeospatialStoppedRevision,
    'stopped:provider-swap',
  )
  assert.equal(
    root.dataset.kgFlightGeospatialStoppedCameraSignature,
    'stopped-camera',
  )
})
