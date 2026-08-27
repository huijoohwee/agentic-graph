import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertExactFlightSimBrowserVerificationLedger,
} from '../../../scripts/lib/game-flight-sim-browser-evidence.mjs'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import { hasExactGeoXrRendererLifecycleEvidence } from './geo-xr-renderer-browser-evidence.mjs'
import { hasViewportScopedRegionalPoiRendering } from './regional-poi-browser-evidence.mjs'

function hasMeterSurface(view, expected) {
  const surface = view?.environmentSurfaceMeters?.find(
    candidate => candidate?.id === expected.id,
  )
  const close = (actual, value, tolerance = 0.12) => (
    Number.isFinite(actual) && Math.abs(actual - value) <= tolerance
  )
  return Boolean(
    surface
    && close(surface.baseHeightMeters, expected.baseHeightMeters, 0.01)
    && close(surface.heightMeters, expected.heightMeters, 0.01)
    && close(surface.widthMeters, expected.widthMeters)
    && close(surface.depthMeters, expected.depthMeters)
    && (!expected.viewportBounded || surface.viewportBounded === true),
  )
}

export function hasExactCityMapRetentionEvidence(retention) {
  return retention?.sameMap === true && retention?.removeCalls === 0
}

export function hasExactGeoXrUiPathEvidence(uiPath) {
  return [
    'cameraPrestateClicked',
    'modeTriggerClicked',
    'surfaceModeClicked',
    'geoXrModeClicked',
    'cameraResetClicked',
    'geoTriggerClicked',
    'geoXrOpenedGeoPanel',
    'geoTriggerOpenedGeoPanel',
  ].every(key => uiPath?.[key] === true)
}

const CITY_REGIONAL_POI_PROFILE_ID = SINGAPORE_MAJOR_POI_GEO_PROFILE.id
const CITY_REGIONAL_POI_PROFILE_REVISION = SINGAPORE_MAJOR_POI_GEO_PROFILE.revision
const CITY_REGIONAL_POI_IDS = Object.freeze(
  SINGAPORE_MAJOR_POI_GEO_PROFILE.pois.map(poi => poi.id).sort(),
)
const CITY_REGIONAL_POI_SURFACE_COUNTS = Object.freeze(Object.fromEntries(
  CITY_REGIONAL_POI_IDS.map(poiId => [
    poiId,
    SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.filter(surface => (
      surface.poiId === poiId
    )).length,
  ]),
))
const CITY_REGIONAL_POI_SURFACE_COUNT = SINGAPORE_MAJOR_POI_GEO_PROFILE.surfaces.length
const CITY_REGIONAL_POI_LOCATOR_COUNT = SINGAPORE_MAJOR_POI_GEO_PROFILE.pois.length
const CITY_REGIONAL_POI_FEATURE_COUNT = CITY_REGIONAL_POI_SURFACE_COUNT + CITY_REGIONAL_POI_LOCATOR_COUNT
const CITY_REGIONAL_POI_LAYER_COUNT = 5
function hasExactCityRegionalPoiIds(value) {
  return JSON.stringify(value) === JSON.stringify(CITY_REGIONAL_POI_IDS)
}

function hasExactCityRegionalPoiVisualProof(value) {
  if (!Array.isArray(value) || value.length !== CITY_REGIONAL_POI_IDS.length) {
    return false
  }
  const proofByPoiId = new Map(value.map(proof => [proof?.poiId, proof]))
  if (proofByPoiId.size !== CITY_REGIONAL_POI_IDS.length) return false
  return CITY_REGIONAL_POI_IDS.every(poiId => {
    const proof = proofByPoiId.get(poiId)
    return proof?.boundsInsideAperture === true
      && proof?.renderedIdentityAtAnchor === true
      && proof?.labelRendered === true
      && proof?.locatorInsideAperture === true
      && proof?.locatorRenderedAtAnchor === true
      && proof?.surfaceCount === CITY_REGIONAL_POI_SURFACE_COUNTS[poiId]
      && Number.isFinite(proof?.anchor?.x)
      && Number.isFinite(proof?.anchor?.y)
      && Number.isFinite(proof?.locatorAnchor?.x)
      && Number.isFinite(proof?.locatorAnchor?.y)
  })
}

export function hasExactCityRegionalPoiEvidence(regionalPoi) {
  return (
    regionalPoi?.profileId === CITY_REGIONAL_POI_PROFILE_ID
    && regionalPoi?.profileRevision === CITY_REGIONAL_POI_PROFILE_REVISION
    && regionalPoi?.datasetProfileId === CITY_REGIONAL_POI_PROFILE_ID
    && regionalPoi?.datasetProfileRevision
      === CITY_REGIONAL_POI_PROFILE_REVISION
    && regionalPoi?.profileFeatureCount === CITY_REGIONAL_POI_SURFACE_COUNT
    && regionalPoi?.featureCount === CITY_REGIONAL_POI_FEATURE_COUNT
    && regionalPoi?.datasetFeatureCount === CITY_REGIONAL_POI_FEATURE_COUNT
    && regionalPoi?.layerCount === CITY_REGIONAL_POI_LAYER_COUNT
    && regionalPoi?.locatorCount === CITY_REGIONAL_POI_LOCATOR_COUNT
    && typeof regionalPoi?.regionalBoundsApertureCoverage === 'number'
    && Number.isFinite(regionalPoi.regionalBoundsApertureCoverage)
    && regionalPoi.regionalBoundsApertureCoverage >= 0.45
    && regionalPoi.regionalBoundsApertureCoverage <= 1
    && hasExactCityRegionalPoiIds(regionalPoi?.expectedPois)
    && hasExactCityRegionalPoiIds(regionalPoi?.cityParcelIds)
    && hasExactCityRegionalPoiIds(regionalPoi?.sourcePois)
    && hasExactCityRegionalPoiIds(regionalPoi?.locatorPois)
    && hasExactCityRegionalPoiIds(regionalPoi?.visiblePoiAnchors)
    && regionalPoi?.exactFeatures === true
    && regionalPoi?.exactPresentation === true
    && regionalPoi?.exactCityPresentation === true
    && regionalPoi?.cityPresentationStateCount
      === CITY_REGIONAL_POI_SURFACE_COUNT
    && hasExactCityRegionalPoiVisualProof(regionalPoi?.poiVisualProof)
  )
}

export function hasExactCityRegionalPoiTeardownEvidence(regionalPoi) {
  return regionalPoi?.expectedLayerCount === CITY_REGIONAL_POI_LAYER_COUNT
    && regionalPoi?.sourcePresent === false
    && Array.isArray(regionalPoi?.presentLayerIds)
    && regionalPoi.presentLayerIds.length === 0
    && Array.isArray(regionalPoi?.presentEvidenceKeys)
    && regionalPoi.presentEvidenceKeys.length === 0
}

export function hasExactCityMapLibreSurfaceEvidence(city) {
  return (
    city?.flightActive === false
    && city?.cityActive === true
    && city?.cityPanelVisible === true
    && city?.citySemanticSurfaceActive === true
    && city?.citySemanticSurfaceNodeName === 'FIGURE'
    && city?.citySemanticSurfaceAccessibleName
      === 'Interactive City simulation media stage'
    && city?.citySemanticSurfaceSelectableMarker === ''
    && city?.citySemanticSurfaceAriaHidden === false
    && city?.citySemanticSurfaceVisibleMapLibreCanvasCount === 1
    && city?.citySemanticSurfaceCenterMapLibreOwned === true
    && city?.citySemanticSurfaceCaptionId
      === city?.cityMapLibreCanvasAriaLabelledBy
    && city?.cityMapLibreCanvasAriaLabelledByName
      === 'Interactive City simulation media stage'
    && city?.cityMapLibreCanvasAccessibleName
      === 'Interactive City simulation media stage'
    && city?.cityMapLibreCanvasAriaHidden === false
    && city?.cityMapLibreCanvasSelectableMarker === '1'
    && city?.cityMapLibreCanvasSelectableOwnerIsCanvas === true
    && city?.cityMapLibreCanvasSelectableOwnerNodeName === 'CANVAS'
    && city?.cityMapLibreOwnerCount === 1
    && city?.floatingPanelOpen === true
    && city?.floatingPanelView === 'cityBuilder'
    && city?.renderMode === '3d'
    && city?.canvas3dMode === 'xr'
    && city?.geospatialEnabled === true
    && city?.geospatialPreferenceEnabled === true
    && city?.geoXrSurfaceActive === true
    && (
      hasExactGeoXrRendererLifecycleEvidence(city, 'retained-inactive')
      || hasExactGeoXrRendererLifecycleEvidence(city, 'absent')
    )
    && city?.geoXrLayerCount === 1
    && city?.activeMapPresent === true
    && city?.mapLibreCanvasCount === 1
    && city?.visibleMapLibreCanvasCount === 1
    && city?.canvasStable === true
    && city?.flightR3fVisualCount === 0
    && city?.hudVisible === false
    && city?.flightHudCount === 0
    && city?.flightSourceFeatures === 0
    && city?.flightSourcePresent === false
    && city?.flightLayersReady === false
    && city?.aircraftLayerType === ''
    && city?.aircraftGeometryType === ''
    && city?.overlayPhase === 'stopped'
    && city?.overlayRoutePointCount === 0
    && JSON.stringify(city?.sourceKinds) === '[]'
    && city?.environmentId === ''
    && city?.environmentSourceFeatures === 0
    && city?.environmentLayerCount === 0
    && JSON.stringify(city?.environmentPoiIds) === '[]'
    && JSON.stringify(city?.renderedEnvironmentPoiIds) === '[]'
    && city?.environmentSourceExactlyMatchesOverlay === true
    && city?.environmentSourcePresent === false
    && Number.isSafeInteger(city?.cityExpectedParcelCount)
    && city?.cityExpectedParcelCount > 0
    && city?.cityPresentationStateCount > 0
    && city?.cityPresentationExact === true
    && city?.cityOwnedSourceCount === 0
    && city?.cityOwnedLayerCount === 0
    && city?.renderedFeatureCount === 0
    && city?.renderedEnvironmentFeatureCount === 0
  )
}

export function hasExactCityHandoffEvidence(handoff) {
  const before = handoff?.before
  const city = handoff?.city
  const regionalPoi = handoff?.regionalPoi
  const regionalPoiAfterCityExit = handoff?.regionalPoiAfterCityExit
  const regionalPoiAfterFlightReopen =
    handoff?.regionalPoiAfterFlightReopen
  const retention = handoff?.mapRetention
  const restored = handoff?.restored
  const reopened = handoff?.reopened
  return (
    before?.flightActive === true
    && before?.hudVisible === true
    && before?.geospatialEnabled === true
    && before?.geospatialPreferenceEnabled === true
    && before?.activeMapPresent === true
    && hasExactGeoXrRendererLifecycleEvidence(before, 'active')
    && hasExactCityMapLibreSurfaceEvidence(city)
    && hasExactGeoXrRendererLifecycleEvidence(city, 'retained-inactive')
    && hasExactCityRegionalPoiEvidence(regionalPoi)
    && hasExactCityRegionalPoiTeardownEvidence(regionalPoiAfterCityExit)
    && hasExactCityRegionalPoiTeardownEvidence(
      regionalPoiAfterFlightReopen,
    )
    && hasExactCityMapRetentionEvidence(retention)
    && restored?.flightActive === false
    && restored?.cityActive === false
    && restored?.cityPanelVisible === false
    && restored?.citySemanticSurfaceActive === false
    && restored?.cityMapLibreCanvasAriaLabelledBy === ''
    && restored?.cityMapLibreCanvasAccessibleName === 'Map'
    && restored?.cityMapLibreCanvasAriaHidden === false
    && restored?.cityMapLibreCanvasSelectableMarker === ''
    && restored?.cityMapLibreCanvasSelectableOwnerIsCanvas === false
    && restored?.cityMapLibreCanvasSelectableOwnerNodeName === ''
    && restored?.cityMapLibreOwnerCount === 0
    && restored?.floatingPanelOpen === true
    && restored?.floatingPanelView === 'flightSim'
    && restored?.renderMode === '3d'
    && restored?.canvas3dMode === 'xr'
    && restored?.geospatialEnabled === true
    && restored?.geospatialPreferenceEnabled === true
    && restored?.geoXrSurfaceActive === true
    && restored?.geoXrLayerCount === 1
    && restored?.activeMapPresent === true
    && restored?.mapLibreCanvasCount === 1
    && restored?.visibleMapLibreCanvasCount === 1
    && hasExactGeoXrRendererLifecycleEvidence(restored, 'active')
    && restored?.hudVisible === false
    && restored?.flightHudCount === 0
    && restored?.flightSourceFeatures === 0
    && restored?.environmentSourceFeatures === 0
    && restored?.cityOwnedSourceCount === 0
    && restored?.cityOwnedLayerCount === 0
    && restored?.renderedFeatureCount === 0
    && restored?.renderedEnvironmentFeatureCount === 0
    && reopened?.flightActive === true
    && reopened?.cityActive === false
    && reopened?.citySemanticSurfaceActive === false
    && reopened?.cityMapLibreCanvasAriaLabelledBy === ''
    && reopened?.cityMapLibreCanvasAccessibleName === 'Map'
    && reopened?.cityMapLibreCanvasAriaHidden === false
    && reopened?.cityMapLibreCanvasSelectableMarker === ''
    && reopened?.cityMapLibreCanvasSelectableOwnerIsCanvas === false
    && reopened?.cityMapLibreCanvasSelectableOwnerNodeName === ''
    && reopened?.cityMapLibreOwnerCount === 0
    && reopened?.cityOwnedSourceCount === 0
    && reopened?.cityOwnedLayerCount === 0
    && reopened?.hudVisible === true
    && reopened?.activeMapPresent === true
    && reopened?.mapLibreCanvasCount === 1
    && reopened?.visibleMapLibreCanvasCount === 1
    && hasExactGeoXrRendererLifecycleEvidence(reopened, 'active')
    && reopened?.flightSourceFeatures >= 7
    && reopened?.aircraftGeometryType === 'Point'
    && reopened?.environmentSourceFeatures >= 10
    && reopened?.renderedFeatureCount >= 4
    && reopened?.renderedEnvironmentFeatureCount >= 3
  )
}

function hasExactInitialReadyFrameEvidence(initialReadyFrame) {
  const overlay = initialReadyFrame?.overlay
  const presentation = initialReadyFrame?.presentation
  const map = initialReadyFrame?.map
  return (
    map?.environment?.loaded === true
    && map?.overlay?.loaded === true
    && presentation?.stoppedEnvironmentLoaded === '1'
    && presentation?.stoppedOverlayLoaded === '1'
    && presentation?.stoppedProfileId === overlay?.profileId
    && presentation?.stoppedRunId === '0'
    && typeof presentation?.stoppedRevision === 'string'
    && presentation.stoppedRevision.length > 0
    && typeof presentation?.stoppedCameraSignature === 'string'
    && presentation.stoppedCameraSignature.length > 0
    && presentation.stoppedCameraSignature
      === presentation?.cameraSignature
    && /^\d+$/.test(String(presentation?.attempts || ''))
  )
}
export async function readValidatedFlightSimBrowserRunEvidence({
  candidateBranch,
  candidateHead,
  candidateTree,
  outputRoot,
  repoRoot,
  runCount,
  runIndex,
  sourceSha256,
  websocketProbePath,
}) {
  const evidencePath = path.join(
    outputRoot,
    `game-flight-sim-browser-smoke-run-${runIndex}.json`,
  )
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
  const expectedWebSocketProbeUrl = new URL(
    websocketProbePath,
    evidence?.targetUrl,
  )
  expectedWebSocketProbeUrl.protocol = (
    expectedWebSocketProbeUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  )
  const expectedWebSocketOperation = (
    `websocket:${expectedWebSocketProbeUrl.toString()}`
  )
  const deadlineContracts = {
    webglAdmission: {
      limitMs: 100,
      source: 'browser-webgl-probe',
      synchronous: true,
    },
    readyFrame: {
      limitMs: 100,
      source: 'native-maplibre-flight-ready-frame',
      synchronous: false,
    },
    hudUpdate: {
      limitMs: 100,
      source: 'runtime-publish-to-hud-layout',
      synchronous: false,
    },
    gameplayNetworkBlock: {
      limitMs: 1_000,
      source: 'flight-runtime-network-guard',
      synchronous: true,
    },
    gameplayWebSocketBlock: {
      limitMs: 1_000,
      source: 'flight-runtime-network-guard',
      synchronous: true,
    },
  }
  const deadlinesPassed = Object.entries(deadlineContracts).every(
    ([name, contract]) => {
      const observation = evidence?.deadlines?.[name]
      return (
        observation?.withinLimit === true
        && observation?.source === contract.source
        && observation?.synchronous === contract.synchronous
        && observation?.limitMs === contract.limitMs
        && Number.isFinite(observation?.elapsedMs)
        && observation.elapsedMs <= contract.limitMs
      )
    },
  ) && (
    evidence?.deadlines?.webglAdmission?.available === true
    && evidence?.deadlines?.readyFrame?.tick === 0
    && evidence?.deadlines?.gameplayNetworkBlock?.operation
      === 'fetch:GET:/api/storage/flight-sim-browser-deadline-proof'
    && evidence?.deadlines?.gameplayNetworkExecutorInvoked === false
    && evidence?.deadlines?.gameplayNetworkMissionStateRetained === true
    && evidence?.deadlines?.gameplayNetworkBlockedSnapshot?.runtimeError
      === 'Flight Sim blocked gameplay network operation: fetch:GET:/api/storage/flight-sim-browser-deadline-proof'
    && evidence?.deadlines?.gameplayNetworkTransportObserved === false
    && evidence?.deadlines?.gameplayWebSocketBlock?.operation
      === expectedWebSocketOperation
    && evidence?.deadlines?.gameplayWebSocketExecutorInvoked === false
    && evidence?.deadlines?.gameplayWebSocketBlockedSnapshot?.runtimeError
      === `Flight Sim blocked gameplay network operation: ${expectedWebSocketOperation}`
    && evidence?.deadlines?.gameplayWebSocketFlightActive === true
    && evidence?.deadlines?.gameplayWebSocketMissionStateRetained === true
    && evidence?.deadlines?.gameplayWebSocketTransportObserved === false
    && evidence?.deadlines?.gameplayWebSocketFenceEscapeObserved === false
    && evidence?.deadlines?.gameplayWebSocketEvents?.length === 0
    && evidence?.deadlines?.gameplayWebSocketRouteHits?.length === 0
    && evidence?.deadlines?.hudUpdate?.browserElapsedMs <= 100
    && hasExactInitialReadyFrameEvidence(
      evidence?.deadlines?.initialReadyFrame,
    )
  )
  const expectedGeoXrViews = [
    {
      viewMode: '2d',
      projection: 'mercator',
      styleUrl: 'https://demotiles.maplibre.org/style.json',
    },
    {
      viewMode: '2d-modern',
      projection: 'mercator',
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    },
    {
      viewMode: '3d',
      projection: 'globe',
      styleUrl: 'https://demotiles.maplibre.org/globe.json',
    },
    {
      viewMode: '3d-modern',
      projection: 'globe',
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    },
  ]
  const geoXrViews = evidence?.geoXrPresentation?.views
  const geoXrPresentationPassed = (
    Array.isArray(geoXrViews)
    && geoXrViews.length === expectedGeoXrViews.length
    && geoXrViews.every((view, index) => {
      const expected = expectedGeoXrViews[index]
      return (
        hasExactGeoXrRendererLifecycleEvidence(view, 'active')
        && view?.viewMode === expected.viewMode
        && view?.projection === expected.projection
        && view?.styleUrl === expected.styleUrl
        && view?.hostActive === true
        && typeof view?.hostRevision === 'string'
        && view.hostRevision.length > 0
        && view?.visibleMapLibreCanvasCount === 1
        && view?.rendererCanvasCount === 1
        && view?.rendererAlpha === true
        && view?.nativeVisualCount === 0
        && view?.flightR3fVisualCount === 0
        && JSON.stringify(view?.flightR3fVisualNames) === '[]'
        && view?.visualProjection === ''
        && view?.rendererPointerTransparent === true
        && view?.exclusivePlainGeoOverlayCount === 0
        && view?.flightLayersReady === true
        && view?.flightLayersTopmost === true
        && view?.aircraftLayerType === 'symbol'
        && view?.aircraftGeometryType === 'Point'
        && view?.aircraftImagesReady === true
        && Number(view?.aircraftImagePixelWidth || 0) >= 40
        && view?.environmentId === 'singapore'
        && JSON.stringify(view?.environmentPresentationBounds)
          === JSON.stringify([[103.605, 1.158], [104.09, 1.48]])
        && view?.environmentLayersReady === true
        && Number(view?.environmentSourceFeatures || 0) >= 10
        && hasMeterSurface(view, {
          id: 'singapore:footprint',
          baseHeightMeters: 0,
          heightMeters: 0.08,
          widthMeters: 32,
          depthMeters: 24,
          viewportBounded: true,
        })
        && hasMeterSurface(view, {
          id: 'marina-bay-sands:tower-2',
          baseHeightMeters: 0,
          heightMeters: 193,
          widthMeters: 71.82,
          depthMeters: 76.45,
        })
        && JSON.stringify(view?.environmentPoiIds)
          === JSON.stringify(CITY_REGIONAL_POI_IDS)
        && hasViewportScopedRegionalPoiRendering(view)
        && view?.selectedEnvironmentSubjectsExact === true
        && view?.environmentSourceExactlyMatchesOverlay === true
        && ['stage-footprint', 'subject'].every(kind =>
          view?.renderedEnvironmentKinds?.includes(kind),
        )
        && (
          view?.renderedEnvironmentPoiIds?.length === 0
          || view?.renderedEnvironmentKinds?.includes('poi')
        )
        && view?.renderedEnvironmentSubjectIds?.some(subjectId =>
          String(subjectId).includes('vehicle-'),
        )
        && view?.objectiveGuideFeatureCount === 1
        && view?.routeInViewport === true
        && view?.aircraftInViewport === true
        && Number(view?.center?.[0]) >= 103.605
        && Number(view?.center?.[0]) <= 104.09
        && Number(view?.center?.[1]) >= 1.158
        && Number(view?.center?.[1]) <= 1.48
        && (
          expected.viewMode.startsWith('3d')
            ? Number(view?.pitch || 0) >= 22
            : Math.abs(Number(view?.pitch || 0)) < 0.01
        )
        && Math.max(
          Number(view?.routeScreenSpan?.x || 0),
          Number(view?.routeScreenSpan?.y || 0),
        ) >= 80
        && JSON.stringify(view?.renderedKinds)
          === JSON.stringify([
            'aircraft',
            'objective-guide',
            'route',
            'route-point',
          ])
        && Number(view?.renderedFeatureCount || 0) >= 4
        && Number.isFinite(view?.mapPointerHit?.x)
        && Number.isFinite(view?.mapPointerHit?.y)
      )
    })
    && evidence?.geoXrPresentation?.sourceView
      === evidence?.geoXrPresentation?.restoredView?.viewMode
    && evidence?.geoXrPresentation?.sourceStyleUrl
      === evidence?.geoXrPresentation?.restoredView?.styleUrl
    && hasExactGeoXrUiPathEvidence(evidence?.geoXrPresentation?.uiPath)
    && hasExactGeoXrRendererLifecycleEvidence(
      evidence?.geoXrPresentation?.restoredView,
      'active',
    )
    && hasExactCityHandoffEvidence(
      evidence?.geoXrPresentation?.cityHandoff,
    )
    && evidence?.geoXrPresentation?.liveMovement?.after?.flightTick
      > evidence?.geoXrPresentation?.liveMovement?.before?.flightTick
    && evidence?.geoXrPresentation?.liveMovement?.after?.overlayRevision
      !== evidence?.geoXrPresentation?.liveMovement?.before?.overlayRevision
    && JSON.stringify(
      evidence?.geoXrPresentation?.liveMovement?.after?.aircraftCoordinate,
    ) !== JSON.stringify(
      evidence?.geoXrPresentation?.liveMovement?.before?.aircraftCoordinate,
    )
  )
  await assertExactFlightSimBrowserVerificationLedger(
    evidence?.verificationLedger,
  )
  if (
    evidence?.schema !== 'agenticgraph-flight-sim-browser-run/v5'
    || evidence?.candidate?.head !== candidateHead
    || evidence?.candidate?.tree !== candidateTree
    || evidence?.candidate?.branch !== candidateBranch
    || evidence?.candidate?.runtimeRevision !== candidateHead
    || evidence?.candidate?.runtimeBranch !== candidateBranch
    || evidence?.source?.sha256 !== sourceSha256
    || evidence?.source?.authoredSeedSha256 !== sourceSha256
    || evidence?.source?.workspaceSourceSha256 !== sourceSha256
    || evidence?.runIndex !== runIndex
    || evidence?.runCount !== runCount
    || evidence?.inputProof?.touchInteraction?.exercised !== true
    || evidence?.inputProof?.touchInteraction?.runId
      !== evidence?.missionProof?.runId
    || evidence?.inputProof?.motionControlPanelHandoff?.flightPreservedWhileMotionPanelOpen !== true
    || evidence?.inputProof?.motionControlPanelHandoff?.captureSurfacePreservedAfterFlightReturn !== true
    || JSON.stringify(evidence?.navigation?.views)
      !== JSON.stringify(['chase', 'cockpit', 'survey'])
    || evidence?.navigation?.buttonSelection !== 'cockpit'
    || evidence?.navigation?.keyboardCycle !== 'survey'
    || evidence?.navigation?.restored !== 'chase'
    || evidence?.navigation?.routePointCount !== 5
    || evidence?.navigation?.activeRoutePointCount !== 1
    || evidence?.navigation?.sharedCameraSourceRetained !== true
    || evidence?.navigation?.singleCanvasRetained !== true
    || evidence?.navigation?.tickAfter <= evidence?.navigation?.tickBefore
    || !Object.values(evidence?.navigation?.forwardAlignment || {})
      .every(value => Number.isFinite(value) && value > 0.2)
    || evidence?.missionProof?.phase !== 'completed'
    || evidence?.missionProof?.waypointIndex !== 3
    || evidence?.missionProof?.transitions?.length !== 3
    || evidence?.missionProof?.pendingUntilExplicitSave !== true
    || evidence?.webSocketProbe?.url
      !== expectedWebSocketProbeUrl.toString()
    || evidence?.webSocketProbe?.productionFenceEscapeObserved !== false
    || evidence?.webSocketProbe?.serverTransportAllowed !== false
    || evidence?.webSocketProbe?.transportObserved !== false
    || evidence?.webSocketProbe?.events?.length !== 0
    || evidence?.webSocketProbe?.routeHits?.length !== 0
    || evidence?.webSocketAttempts?.routePattern !== '**/*'
    || evidence?.webSocketAttempts?.serverTransportAllowed !== false
    || evidence?.webSocketAttempts?.events?.length !== 0
    || evidence?.webSocketAttempts?.routeHits?.length !== 0
    || evidence?.webSocketAttempts?.unexpectedEvents?.length !== 0
    || evidence?.webSocketAttempts?.unexpectedRouteHits?.length !== 0
    || evidence?.renderer?.mapLibreCanvasCount !== 1
    || evidence?.renderer?.visibleMapLibreCanvasCount !== 1
    || evidence?.renderer?.transparentFlightRuntimeCanvas !== true
    || evidence?.renderer?.nativeXrVisualsSuppressed !== true
    || !geoXrPresentationPassed
    || !Array.isArray(evidence?.geoProviderRequests)
    || evidence.geoProviderRequests.length === 0
    || evidence?.unexpectedNonLocalRequests?.length !== 0
    || evidence?.blockedRequests?.length !== 0
    || !deadlinesPassed
  ) {
    throw new Error(
      `Browser proof run ${runIndex} did not preserve identity, trusted touch, `
      + 'local navigation, ordered mission completion, blocked transports, deadlines, and named '
      + 'verifications',
    )
  }
  return evidence
}
