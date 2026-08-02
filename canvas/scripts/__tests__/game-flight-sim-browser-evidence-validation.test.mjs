import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasExactCityHandoffEvidence,
  hasExactCityMapLibreSurfaceEvidence,
  hasExactCityMapRetentionEvidence,
  hasExactCityRegionalPoiEvidence,
  hasExactCityRegionalPoiTeardownEvidence,
  hasExactGeoXrUiPathEvidence,
} from '../lib/game-flight-sim-browser-evidence-validation.mjs'
import {
  hasExactGeoXrRendererLifecycleEvidence,
} from '../lib/geo-xr-renderer-browser-evidence.mjs'
import {
  hasViewportScopedRegionalPoiRendering,
} from '../lib/regional-poi-browser-evidence.mjs'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'

const exactPoiIds = Object.freeze(
  SINGAPORE_MAJOR_POI_GEO_PROFILE.pois.map(poi => poi.id).sort(),
)
const surfaceCountByPoiId = Object.freeze(Object.fromEntries(
  exactPoiIds.map(poiId => [
    poiId,
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.filter(
      surface => surface.poiId === poiId,
    ).length,
  ]),
))

test('saved Geo+XR evidence distinguishes active, retained, and absent Three ownership', () => {
  const exact = {
    geoXrSurfaceActive: true,
    geoXrSurfaceCount: 1,
    rendererPointerTransparent: true,
    rendererSurfaceVisible: true,
    threeCanvasActiveCount: 1,
    threeCanvasInactiveCount: 0,
    threeCanvasOwnerCount: 1,
  }
  assert.equal(
    hasExactGeoXrRendererLifecycleEvidence(exact, 'active'),
    true,
  )
  for (const [field, value] of [
    ['geoXrSurfaceCount', 2],
    ['rendererPointerTransparent', false],
    ['rendererSurfaceVisible', false],
    ['threeCanvasActiveCount', 0],
    ['threeCanvasInactiveCount', 1],
    ['threeCanvasOwnerCount', 2],
  ]) {
    assert.equal(
      hasExactGeoXrRendererLifecycleEvidence(
        { ...exact, [field]: value },
        'active',
      ),
      false,
      `${field} drift must fail closed`,
    )
  }
  assert.equal(hasExactGeoXrRendererLifecycleEvidence({
    ...exact,
    rendererSurfaceVisible: false,
    threeCanvasActiveCount: 0,
    threeCanvasInactiveCount: 1,
  }, 'retained-inactive'), true)
  assert.equal(hasExactGeoXrRendererLifecycleEvidence({
    ...exact,
    rendererSurfaceVisible: false,
    threeCanvasActiveCount: 0,
    threeCanvasInactiveCount: 0,
    threeCanvasOwnerCount: 0,
  }, 'absent'), true)
  assert.equal(hasExactGeoXrRendererLifecycleEvidence(exact, 'legacy'), false)
})

test('Geo+XR evidence requires the trusted toolbar and panel path', () => {
  const exact = {
    cameraPrestateClicked: true,
    modeTriggerClicked: true,
    surfaceModeClicked: true,
    geoXrModeClicked: true,
    cameraResetClicked: true,
    geoTriggerClicked: true,
    geoXrOpenedGeoPanel: true,
    geoTriggerOpenedGeoPanel: true,
  }
  assert.equal(hasExactGeoXrUiPathEvidence(exact), true)
  assert.equal(hasExactGeoXrUiPathEvidence({
    ...exact,
    geoTriggerClicked: false,
  }), false)
  assert.equal(hasExactGeoXrUiPathEvidence({
    ...exact,
    geoXrOpenedGeoPanel: undefined,
  }), false)
})

test('Flight follow-camera evidence accepts only a viewport POI subset from the source', () => {
  const source = {
    environmentPoiIds: [...exactPoiIds],
    renderedEnvironmentPoiIds: ['marina-bay-sands'],
  }
  assert.equal(hasViewportScopedRegionalPoiRendering(source), true)
  assert.equal(hasViewportScopedRegionalPoiRendering({
    ...source,
    renderedEnvironmentPoiIds: [],
  }), true)
  assert.equal(hasViewportScopedRegionalPoiRendering({
    environmentPoiIds: [],
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
  assert.equal(hasViewportScopedRegionalPoiRendering({
    ...source,
    renderedEnvironmentPoiIds: [{ id: 'marina-bay-sands' }],
  }), false)
})

function exactRegionalPoiEvidence() {
  const surfaceCount = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length
  const locatorCount = SINGAPORE_MAJOR_POI_GEO_PROFILE.pois.length
  return {
    datasetFeatureCount: surfaceCount + locatorCount,
    datasetProfileId: SINGAPORE_MAJOR_POI_GEO_PROFILE.id,
    datasetProfileRevision: SINGAPORE_MAJOR_POI_GEO_PROFILE.revision,
    cityParcelIds: [...exactPoiIds],
    cityPresentationStateCount: surfaceCount,
    exactCityPresentation: true,
    exactFeatures: true,
    exactPresentation: true,
    expectedPois: [...exactPoiIds],
    featureCount: surfaceCount + locatorCount,
    layerCount: 5,
    locatorCount,
    locatorPois: [...exactPoiIds],
    poiVisualProof: exactPoiIds.map((poiId, index) => ({
      anchor: { x: 120 + index * 20, y: 210 - index * 10 },
      boundsInsideAperture: true,
      labelRendered: true,
      locatorAnchor: { x: 121 + index * 20, y: 209 - index * 10 },
      locatorInsideAperture: true,
      locatorRenderedAtAnchor: true,
      poiId,
      renderedIdentityAtAnchor: true,
      surfaceCount: surfaceCountByPoiId[poiId],
    })),
    profileFeatureCount: surfaceCount,
    profileId: SINGAPORE_MAJOR_POI_GEO_PROFILE.id,
    profileRevision: SINGAPORE_MAJOR_POI_GEO_PROFILE.revision,
    regionalBoundsApertureCoverage: 0.72,
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
    aircraftGeometryType: '',
    aircraftLayerType: '',
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
    flightLayersReady: false,
    flightSourceFeatures: 0,
    flightSourcePresent: false,
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
    overlayRoutePointCount: 0,
    renderMode: '3d',
    renderedEnvironmentFeatureCount: 0,
    renderedEnvironmentKinds: [],
    renderedEnvironmentPoiIds: [],
    renderedFeatureCount: 0,
    sourceKinds: [],
    cityExpectedParcelCount: exactPoiIds.length,
    cityOwnedLayerCount: 0,
    cityOwnedSourceCount: 0,
    cityPresentationExact: true,
    cityPresentationStateCount:
      SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length,
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
      cityOwnedLayerCount: 0,
      cityOwnedSourceCount: 0,
      environmentSourceFeatures: 10,
      flightActive: true,
      flightSourceFeatures: 7,
      aircraftGeometryType: 'Point',
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
      cityOwnedLayerCount: 0,
      cityOwnedSourceCount: 0,
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

test('City uses one semantic MapLibre surface with POI feature state and no Flight layers', () => {
  const city = exactCityMapLibreSurfaceEvidence()

  assert.equal(hasExactCityMapLibreSurfaceEvidence(city), true)
  assert.equal(hasExactCityMapLibreSurfaceEvidence({
    ...city,
    threeCanvasInactiveCount: 0,
    threeCanvasOwnerCount: 0,
  }), true, 'direct City activation owns no Three canvas')
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
    ['flightLayersReady', true],
    ['environmentSourcePresent', true],
    ['environmentLayerCount', 1],
    ['cityOwnedLayerCount', 1],
    ['cityOwnedSourceCount', 1],
    ['cityPresentationExact', false],
    ['cityPresentationStateCount', 0],
    ['overlayPhase', 'ready'],
    ['sourceKinds', ['aircraft']],
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
    ['cityParcelIds', exactPoiIds.slice(1)],
    ['cityPresentationStateCount', 1],
    ['sourcePois', [...exactPoiIds].reverse()],
    ['locatorPois', exactPoiIds.slice(0, 2)],
    ['visiblePoiAnchors', exactPoiIds.slice(0, 2)],
    ['regionalBoundsApertureCoverage', 0.04],
    ['regionalBoundsApertureCoverage', '0.72'],
    ['regionalBoundsApertureCoverage', true],
    ['regionalBoundsApertureCoverage', Number.POSITIVE_INFINITY],
    ['regionalBoundsApertureCoverage', Number.NaN],
    ['regionalBoundsApertureCoverage', 1.01],
    ['exactFeatures', false],
    ['exactPresentation', false],
    ['exactCityPresentation', false],
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
      ['cityOwnedSourceCount', 1],
      ['cityOwnedLayerCount', 1],
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
