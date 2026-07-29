import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FLIGHT_GEO_OVERLAY_LAYER_ORDER,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
  retainFlightGeoOverlayDuringStyleSwap,
} from '../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../gympgrph/src/flightGeoEnvironmentMapLibre'

test('provider-style handoff retains the complete Flight environment below its route and aircraft', () => {
  const environmentSource = {
    data: {
      type: 'FeatureCollection',
      features: [{
        id: 'singapore:skyline-center',
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[103.8519, 1.2902], [103.852, 1.2902], [103.852, 1.2903], [103.8519, 1.2902]]],
        },
        properties: {
          kgBaseHeightMeters: 0,
          kgHeightMeters: 12,
          kgSurfaceKind: 'skyline',
        },
      }],
    },
    type: 'geojson',
  }
  const overlaySource = {
    data: { type: 'FeatureCollection', features: [{ id: 'aircraft' }] },
    type: 'geojson',
  }
  const environmentLayers = FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER.map((id, index) => ({
    id,
    source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
    type: index === 1 ? 'fill-extrusion' : index === 2 ? 'line' : 'fill',
  }))
  const overlayLayers = FLIGHT_GEO_OVERLAY_LAYER_ORDER.map(id => ({
    id,
    source: FLIGHT_GEO_OVERLAY_SOURCE_ID,
  }))
  const previousStyle = {
    version: 8,
    sources: {
      [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: environmentSource,
      [FLIGHT_GEO_OVERLAY_SOURCE_ID]: overlaySource,
    },
    layers: [
      { id: 'kg-flight-sim:geo-bootstrap-background', type: 'background' },
      ...environmentLayers,
      ...overlayLayers,
    ],
  }
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [
      { id: 'provider-background', type: 'background' },
      { id: FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER[0], type: 'fill' },
      { id: FLIGHT_GEO_OVERLAY_LAYER_ORDER[0], type: 'line' },
    ],
  }

  const promoted = retainFlightGeoOverlayDuringStyleSwap(previousStyle, nextStyle)

  assert.equal(promoted.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID], environmentSource)
  assert.equal(promoted.sources[FLIGHT_GEO_OVERLAY_SOURCE_ID], overlaySource)
  assert.equal(promoted.sources.provider.type, 'vector')
  assert.deepEqual(
    promoted.layers.map((layer: { id: string }) => layer.id),
    [
      'provider-background',
      ...FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER,
      ...FLIGHT_GEO_OVERLAY_LAYER_ORDER,
    ],
  )
  assert.equal(
    promoted.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID].data.features[0].properties.kgHeightMeters,
    12,
    'the authored 12m skyline survives the handoff unchanged',
  )
})

test('provider-style handoff refuses a partial environment stack', () => {
  const nextStyle = {
    version: 8,
    sources: { provider: { type: 'vector' } },
    layers: [{ id: 'provider-background', type: 'background' }],
  }
  const promoted = retainFlightGeoOverlayDuringStyleSwap({
    version: 8,
    sources: {
      [FLIGHT_GEO_ENVIRONMENT_SOURCE_ID]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [{ id: 'stale' }] },
      },
    },
    layers: FLIGHT_GEO_ENVIRONMENT_LAYER_ORDER
      .slice(0, -1)
      .map(id => ({ id, source: FLIGHT_GEO_ENVIRONMENT_SOURCE_ID })),
  }, nextStyle)

  assert.equal(
    promoted.sources[FLIGHT_GEO_ENVIRONMENT_SOURCE_ID],
    undefined,
    'a later exact application must rebuild instead of retaining stale fragments',
  )
  assert.deepEqual(promoted.layers, nextStyle.layers)
})
