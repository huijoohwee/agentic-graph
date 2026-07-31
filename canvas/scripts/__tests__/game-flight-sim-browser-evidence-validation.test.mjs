import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasExactCityMapLibreSurfaceEvidence,
  hasExactCityMapRetentionEvidence,
} from '../lib/game-flight-sim-browser-evidence-validation.mjs'

test('City retains the exact MapLibre owner throughout the handoff', () => {
  assert.equal(
    hasExactCityMapRetentionEvidence({
      sameMap: true,
      removeCalls: 0,
    }),
    true,
    'the provider map must remain the same live instance',
  )
  assert.equal(
    hasExactCityMapRetentionEvidence({
      sameMap: false,
      removeCalls: 0,
    }),
    false,
    'a replacement map must fail closed',
  )
  assert.equal(
    hasExactCityMapRetentionEvidence({
      sameMap: true,
      removeCalls: 1,
    }),
    false,
    'any provider-map disposal attempt must fail closed',
  )
})

test('City uses one semantic MapLibre surface with stopped Flight route and aircraft layers', () => {
  const city = {
    activeMapPresent: true,
    aircraftGeometryType: 'Polygon',
    aircraftLayerType: 'symbol',
    canvas3dMode: 'xr',
    cityActive: true,
    cityMapLibreOwnerCount: 1,
    cityPanelVisible: true,
    citySemanticSurfaceActive: true,
    citySemanticSurfaceAccessibleName:
      'Interactive City simulation media stage',
    citySemanticSurfaceAriaHidden: false,
    citySemanticSurfaceCaptionId: 'city-semantic-media-caption',
    citySemanticSurfaceCenterMapLibreOwned: true,
    citySemanticSurfaceNodeName: 'FIGURE',
    citySemanticSurfaceSelectableMarker: '1',
    citySemanticSurfaceVisibleMapLibreCanvasCount: 1,
    cityMapLibreCanvasAccessibleName:
      'Interactive City simulation media stage',
    cityMapLibreCanvasAriaHidden: false,
    cityMapLibreCanvasAriaLabelledBy: 'city-semantic-media-caption',
    cityMapLibreCanvasSelectableMarker: '',
    cityMapLibreCanvasSelectableOwnerIsSurface: true,
    cityMapLibreCanvasSelectableOwnerNodeName: 'FIGURE',
    environmentLayersReady: true,
    environmentPoiIds: [
      'gardens-by-the-bay',
      'marina-bay-sands',
      'singapore-flyer',
    ],
    environmentSourceExactlyMatchesOverlay: true,
    environmentSourceFeatures: 9,
    flightActive: false,
    flightHudCount: 0,
    flightLayersReady: true,
    flightSourceFeatures: 7,
    flightSourcePresent: true,
    floatingPanelOpen: true,
    floatingPanelView: 'cityBuilder',
    geoXrLayerCount: 1,
    geoXrSurfaceActive: true,
    geospatialEnabled: true,
    geospatialPreferenceEnabled: true,
    hudVisible: false,
    mapLibreCanvasCount: 1,
    overlayPhase: 'stopped',
    overlayRoutePointCount: 5,
    renderMode: '3d',
    renderedEnvironmentFeatureCount: 3,
    renderedEnvironmentKinds: ['poi'],
    renderedEnvironmentPoiIds: [
      'gardens-by-the-bay',
      'marina-bay-sands',
      'singapore-flyer',
    ],
    renderedFeatureCount: 4,
    sourceKinds: ['aircraft', 'objective-guide', 'route', 'route-point'],
    cityGeoXrLayerOrderExact: true,
    threeCanvasOwnerCount: 0,
    visibleMapLibreCanvasCount: 1,
  }

  assert.equal(hasExactCityMapLibreSurfaceEvidence(city), true)
  for (const [field, value] of [
    ['citySemanticSurfaceActive', false],
    ['cityMapLibreCanvasAccessibleName', 'Map'],
    ['cityMapLibreCanvasAriaHidden', true],
    ['cityMapLibreCanvasSelectableMarker', '1'],
    ['cityMapLibreCanvasSelectableOwnerIsSurface', false],
    ['cityMapLibreOwnerCount', 0],
    ['threeCanvasOwnerCount', 1],
    ['flightLayersReady', false],
    ['overlayPhase', 'ready'],
    ['sourceKinds', ['aircraft', 'route']],
  ]) {
    assert.equal(
      hasExactCityMapLibreSurfaceEvidence({ ...city, [field]: value }),
      false,
      `${field} drift must fail closed`,
    )
  }
})
