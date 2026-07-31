import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasExactCityHandoffEvidence,
  hasExactCityMapLibreSurfaceEvidence,
  hasExactCityMapRetentionEvidence,
  hasExactCityRegionalPoiEvidence,
  hasExactCityRegionalPoiTeardownEvidence,
  hasExactGeoXrRendererEvidence,
} from '../lib/game-flight-sim-browser-evidence-validation.mjs'
import {
  hasViewportScopedRegionalPoiRendering,
} from '../lib/regional-poi-browser-evidence.mjs'

const exactPoiIds = Object.freeze([
  'gardens-by-the-bay',
  'marina-bay-sands',
  'singapore-flyer',
])

test('saved Geo+XR evidence requires one active wrapper and one visible Three layer', () => {
  const exact = {
    geoXrSurfaceActive: true,
    geoXrSurfaceCount: 1,
    rendererPointerTransparent: true,
    rendererSurfaceVisible: true,
    threeCanvasActiveCount: 1,
    threeCanvasInactiveCount: 0,
    threeCanvasOwnerCount: 1,
  }
  assert.equal(hasExactGeoXrRendererEvidence(exact, true), true)
  for (const [field, value] of [
    ['geoXrSurfaceCount', 2],
    ['rendererPointerTransparent', false],
    ['rendererSurfaceVisible', false],
    ['threeCanvasActiveCount', 0],
    ['threeCanvasInactiveCount', 1],
    ['threeCanvasOwnerCount', 2],
  ]) {
    assert.equal(
      hasExactGeoXrRendererEvidence({ ...exact, [field]: value }, true),
      false,
      `${field} drift must fail closed`,
    )
  }
})

test('Flight follow-camera evidence accepts only a non-empty POI subset from the source', () => {
  const source = {
    environmentPoiIds: [...exactPoiIds],
    renderedEnvironmentPoiIds: ['marina-bay-sands'],
  }
  assert.equal(hasViewportScopedRegionalPoiRendering(source), true)
  assert.equal(hasViewportScopedRegionalPoiRendering({
    ...source,
    renderedEnvironmentPoiIds: [],
  }), false)
  assert.equal(hasViewportScopedRegionalPoiRendering({
    ...source,
    renderedEnvironmentPoiIds: ['legacy-local-poi'],
  }), false)
  assert.equal(hasViewportScopedRegionalPoiRendering({
    ...source,
    renderedEnvironmentPoiIds: ['marina-bay-sands', 'marina-bay-sands'],
  }), false)
})

function exactRegionalPoiEvidence() {
  return {
    datasetFeatureCount: 12,
    datasetProfileId: 'adm0:SGP:major-pois/v1',
    datasetProfileRevision: '2026-07-31.1',
    exactFeatures: true,
    exactPresentation: true,
    expectedPois: [...exactPoiIds],
    featureCount: 12,
    layerCount: 5,
    locatorCount: 3,
    locatorPois: [...exactPoiIds],
    poiVisualProof: [
      {
        anchor: { x: 120, y: 210 },
        boundsInsideAperture: true,
        labelRendered: true,
        locatorAnchor: { x: 121, y: 209 },
        locatorInsideAperture: true,
        locatorRenderedAtAnchor: true,
        poiId: 'gardens-by-the-bay',
        renderedIdentityAtAnchor: true,
        surfaceCount: 4,
      },
      {
        anchor: { x: 220, y: 180 },
        boundsInsideAperture: true,
        labelRendered: true,
        locatorAnchor: { x: 221, y: 179 },
        locatorInsideAperture: true,
        locatorRenderedAtAnchor: true,
        poiId: 'marina-bay-sands',
        renderedIdentityAtAnchor: true,
        surfaceCount: 4,
      },
      {
        anchor: { x: 290, y: 130 },
        boundsInsideAperture: true,
        labelRendered: true,
        locatorAnchor: { x: 291, y: 129 },
        locatorInsideAperture: true,
        locatorRenderedAtAnchor: true,
        poiId: 'singapore-flyer',
        renderedIdentityAtAnchor: true,
        surfaceCount: 1,
      },
    ],
    profileFeatureCount: 9,
    profileId: 'adm0:SGP:major-pois/v1',
    profileRevision: '2026-07-31.1',
    sourcePois: [...exactPoiIds],
    visiblePoiAnchors: [...exactPoiIds],
  }
}

function exactRegionalPoiTeardownEvidence() {
  return {
    expectedLayerCount: 5,
    presentEvidenceKeys: [],
    presentLayerIds: [],
    sourcePresent: false,
  }
}

function exactCityMapLibreSurfaceEvidence() {
  return {
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
    citySemanticSurfaceSelectableMarker: '',
    citySemanticSurfaceVisibleMapLibreCanvasCount: 1,
    cityMapLibreCanvasAccessibleName:
      'Interactive City simulation media stage',
    cityMapLibreCanvasAriaHidden: false,
    cityMapLibreCanvasAriaLabelledBy: 'city-semantic-media-caption',
    cityMapLibreCanvasAriaLabelledByName:
      'Interactive City simulation media stage',
    cityMapLibreCanvasSelectableMarker: '1',
    cityMapLibreCanvasSelectableOwnerIsCanvas: true,
    cityMapLibreCanvasSelectableOwnerNodeName: 'CANVAS',
    environmentId: '',
    environmentLayerCount: 0,
    environmentPoiIds: [],
    environmentSourceExactlyMatchesOverlay: true,
    environmentSourceFeatures: 0,
    environmentSourcePresent: false,
    flightActive: false,
    flightHudCount: 0,
    flightLayersReady: true,
    flightSourceFeatures: 7,
    flightSourcePresent: true,
    floatingPanelOpen: true,
    floatingPanelView: 'cityBuilder',
    geoXrLayerCount: 1,
    geoXrSurfaceActive: true,
    geoXrSurfaceCount: 1,
    geospatialEnabled: true,
    geospatialPreferenceEnabled: true,
    hudVisible: false,
    mapLibreCanvasCount: 1,
    overlayPhase: 'stopped',
    overlayRoutePointCount: 5,
    renderMode: '3d',
    renderedEnvironmentFeatureCount: 0,
    renderedEnvironmentKinds: [],
    renderedEnvironmentPoiIds: [],
    renderedFeatureCount: 4,
    sourceKinds: ['aircraft', 'route', 'route-point'],
    cityLayerCount: 4,
    cityLayersReady: true,
    cityExpectedParcelCount: 12,
    cityParcelsUseAuthoredMeters: true,
    citySourceFeatures: 12,
    citySourcePresent: true,
    cityGeoXrLayerOrderExact: true,
    canvasStable: true,
    flightR3fVisualCount: 0,
    rendererPointerTransparent: true,
    rendererSurfaceVisible: false,
    threeCanvasActiveCount: 0,
    threeCanvasInactiveCount: 1,
    threeCanvasOwnerCount: 1,
    visibleMapLibreCanvasCount: 1,
  }
}

function exactCityHandoffEvidence() {
  return {
    before: {
      activeMapPresent: true,
      flightActive: true,
      geoXrSurfaceActive: true,
      geoXrSurfaceCount: 1,
      geospatialEnabled: true,
      geospatialPreferenceEnabled: true,
      hudVisible: true,
      rendererPointerTransparent: true,
      rendererSurfaceVisible: true,
      threeCanvasActiveCount: 1,
      threeCanvasInactiveCount: 0,
      threeCanvasOwnerCount: 1,
    },
    city: exactCityMapLibreSurfaceEvidence(),
    mapRetention: { removeCalls: 0, sameMap: true },
    regionalPoi: exactRegionalPoiEvidence(),
    regionalPoiAfterCityExit: exactRegionalPoiTeardownEvidence(),
    regionalPoiAfterFlightReopen: exactRegionalPoiTeardownEvidence(),
    reopened: {
      activeMapPresent: true,
      cityActive: false,
      cityMapLibreCanvasAccessibleName: 'Map',
      cityMapLibreCanvasAriaHidden: false,
      cityMapLibreCanvasAriaLabelledBy: '',
      cityMapLibreCanvasSelectableMarker: '',
      cityMapLibreCanvasSelectableOwnerIsCanvas: false,
      cityMapLibreCanvasSelectableOwnerNodeName: '',
      cityMapLibreOwnerCount: 0,
      citySemanticSurfaceActive: false,
      cityLayerCount: 0,
      cityLayersReady: false,
      citySourceFeatures: 0,
      citySourcePresent: false,
      environmentSourceFeatures: 10,
      flightActive: true,
      flightSourceFeatures: 7,
      hudVisible: true,
      mapLibreCanvasCount: 1,
      renderedEnvironmentFeatureCount: 3,
      renderedFeatureCount: 4,
      geoXrSurfaceActive: true,
      geoXrSurfaceCount: 1,
      rendererPointerTransparent: true,
      rendererSurfaceVisible: true,
      threeCanvasActiveCount: 1,
      threeCanvasInactiveCount: 0,
      threeCanvasOwnerCount: 1,
      visibleMapLibreCanvasCount: 1,
    },
    restored: {
      activeMapPresent: true,
      canvas3dMode: 'xr',
      cityActive: false,
      cityMapLibreCanvasAccessibleName: 'Map',
      cityMapLibreCanvasAriaHidden: false,
      cityMapLibreCanvasAriaLabelledBy: '',
      cityMapLibreCanvasSelectableMarker: '',
      cityMapLibreCanvasSelectableOwnerIsCanvas: false,
      cityMapLibreCanvasSelectableOwnerNodeName: '',
      cityMapLibreOwnerCount: 0,
      cityPanelVisible: false,
      citySemanticSurfaceActive: false,
      cityLayerCount: 0,
      cityLayersReady: false,
      citySourceFeatures: 0,
      citySourcePresent: false,
      environmentSourceFeatures: 0,
      flightActive: false,
      flightHudCount: 0,
      flightSourceFeatures: 0,
      floatingPanelOpen: true,
      floatingPanelView: 'flightSim',
      geoXrLayerCount: 1,
      geoXrSurfaceActive: true,
      geospatialEnabled: true,
      geospatialPreferenceEnabled: true,
      hudVisible: false,
      mapLibreCanvasCount: 1,
      renderMode: '3d',
      renderedEnvironmentFeatureCount: 0,
      renderedFeatureCount: 0,
      geoXrSurfaceCount: 1,
      rendererPointerTransparent: true,
      rendererSurfaceVisible: true,
      threeCanvasActiveCount: 1,
      threeCanvasInactiveCount: 0,
      threeCanvasOwnerCount: 1,
      visibleMapLibreCanvasCount: 1,
    },
  }
}

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
  const city = exactCityMapLibreSurfaceEvidence()

  assert.equal(hasExactCityMapLibreSurfaceEvidence(city), true)
  for (const [field, value] of [
    ['citySemanticSurfaceActive', false],
    ['cityMapLibreCanvasAccessibleName', 'Map'],
    ['cityMapLibreCanvasAriaHidden', true],
    ['cityMapLibreCanvasSelectableMarker', ''],
    ['cityMapLibreCanvasSelectableOwnerIsCanvas', false],
    ['cityMapLibreOwnerCount', 0],
    ['canvasStable', false],
    ['flightR3fVisualCount', 1],
    ['rendererPointerTransparent', false],
    ['rendererSurfaceVisible', true],
    ['geoXrSurfaceCount', 2],
    ['threeCanvasActiveCount', 1],
    ['threeCanvasInactiveCount', 0],
    ['threeCanvasOwnerCount', 0],
    ['flightLayersReady', false],
    ['environmentSourcePresent', true],
    ['environmentLayerCount', 1],
    ['cityLayerCount', 3],
    ['citySourceFeatures', 11],
    ['overlayPhase', 'ready'],
    ['sourceKinds', ['aircraft', 'objective-guide', 'route', 'route-point']],
  ]) {
    assert.equal(
      hasExactCityMapLibreSurfaceEvidence({ ...city, [field]: value }),
      false,
      `${field} drift must fail closed`,
    )
  }
})

test('City saved evidence requires the exact Singapore regional POI profile and visible locators', () => {
  const regionalPoi = exactRegionalPoiEvidence()
  assert.equal(hasExactCityRegionalPoiEvidence(regionalPoi), true)

  for (const [field, value] of [
    ['profileId', 'adm0:SGP:major-pois/legacy'],
    ['profileRevision', '2026-07-31.0'],
    ['datasetProfileId', 'adm0:SGP:major-pois/legacy'],
    ['datasetProfileRevision', '2026-07-31.0'],
    ['profileFeatureCount', 8],
    ['featureCount', 11],
    ['datasetFeatureCount', 9],
    ['layerCount', 4],
    ['locatorCount', 2],
    ['expectedPois', exactPoiIds.slice(1)],
    ['sourcePois', [...exactPoiIds].reverse()],
    ['locatorPois', ['marina-bay-sands', 'singapore-flyer']],
    ['visiblePoiAnchors', exactPoiIds.slice(0, 2)],
    ['exactFeatures', false],
    ['exactPresentation', false],
  ]) {
    assert.equal(
      hasExactCityRegionalPoiEvidence({ ...regionalPoi, [field]: value }),
      false,
      `${field} drift must fail closed`,
    )
  }

  const visualProofDrift = structuredClone(regionalPoi)
  visualProofDrift.poiVisualProof[0].renderedIdentityAtAnchor = false
  assert.equal(hasExactCityRegionalPoiEvidence(visualProofDrift), false)

  for (const field of [
    'labelRendered',
    'locatorInsideAperture',
    'locatorRenderedAtAnchor',
  ]) {
    const locatorVisualDrift = structuredClone(regionalPoi)
    locatorVisualDrift.poiVisualProof[0][field] = false
    assert.equal(
      hasExactCityRegionalPoiEvidence(locatorVisualDrift),
      false,
      `${field} visual drift must fail closed`,
    )
  }

  const duplicateLocatorIdentity = structuredClone(regionalPoi)
  duplicateLocatorIdentity.locatorPois[0] = 'marina-bay-sands'
  assert.equal(hasExactCityRegionalPoiEvidence(duplicateLocatorIdentity), false)
})

test('City saved evidence requires both exact regional POI teardowns', () => {
  const teardown = exactRegionalPoiTeardownEvidence()
  assert.equal(hasExactCityRegionalPoiTeardownEvidence(teardown), true)
  for (const [field, value] of [
    ['expectedLayerCount', 4],
    ['sourcePresent', true],
    ['presentLayerIds', ['kg-geo-xr:regional-poi:locator']],
    ['presentEvidenceKeys', ['kgCityGeospatialPoiRevision']],
  ]) {
    assert.equal(
      hasExactCityRegionalPoiTeardownEvidence({ ...teardown, [field]: value }),
      false,
      `${field} teardown drift must fail closed`,
    )
  }

  const handoff = exactCityHandoffEvidence()
  assert.equal(hasExactCityHandoffEvidence(handoff), true)
  assert.equal(
    hasExactCityHandoffEvidence({ ...handoff, regionalPoi: undefined }),
    false,
  )
  assert.equal(
    hasExactCityHandoffEvidence({
      ...handoff,
      regionalPoiAfterCityExit: {
        ...handoff.regionalPoiAfterCityExit,
        sourcePresent: true,
      },
    }),
    false,
  )
  assert.equal(
    hasExactCityHandoffEvidence({
      ...handoff,
      regionalPoiAfterFlightReopen: {
        ...handoff.regionalPoiAfterFlightReopen,
        expectedLayerCount: 4,
      },
    }),
    false,
  )

  for (const checkpoint of ['restored', 'reopened']) {
    const exactCheckpoint = handoff[checkpoint]
    for (const [field, value] of [
      ['citySemanticSurfaceActive', true],
      ['cityMapLibreCanvasAriaLabelledBy', 'city-semantic-media-caption'],
      [
        'cityMapLibreCanvasAccessibleName',
        'Interactive City simulation media stage',
      ],
      ['cityMapLibreCanvasAriaHidden', true],
      ['cityMapLibreCanvasSelectableMarker', '1'],
      ['cityMapLibreCanvasSelectableOwnerIsCanvas', true],
      ['cityMapLibreCanvasSelectableOwnerNodeName', 'CANVAS'],
      ['cityMapLibreOwnerCount', 1],
      ['citySourcePresent', true],
      ['citySourceFeatures', 1],
      ['cityLayerCount', 1],
      ['cityLayersReady', true],
      ['geoXrSurfaceCount', 2],
      ['threeCanvasActiveCount', 0],
      ['threeCanvasInactiveCount', 1],
      ['rendererPointerTransparent', false],
      ['rendererSurfaceVisible', false],
    ]) {
      assert.equal(
        hasExactCityHandoffEvidence({
          ...handoff,
          [checkpoint]: { ...exactCheckpoint, [field]: value },
        }),
        false,
        `${checkpoint}.${field} teardown drift must fail closed`,
      )
    }
  }
})
