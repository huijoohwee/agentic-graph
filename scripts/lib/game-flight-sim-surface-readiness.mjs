import { requireSourceMarkers } from './source-readiness-assertions.mjs'

export async function assertFlightSimSurfaceReadiness({
  readText,
  flightFeatureRoot,
}) {
  const missionStageSource = await readText(`${flightFeatureRoot}/FlightSimMissionStage.tsx`)
  requireSourceMarkers(missionStageSource, [
    'export function FlightSimMissionStage',
    'runtimeController.readSnapshot',
    'runtimeController.subscribe',
    'useFlightSimSurfaceControls({',
    'const removeAfterRender = addAfterEffect(() => {',
    'if (geospatialComposite) {',
    "canvas.dataset.kgFlightSimFirstFrame = '1'",
    'completeFlightSimReadyFrame(presentation.runId, presentation.tick)',
    'return null',
  ], 'Flight Sim actor stage')
  if (
    /<(?:Canvas|Environment|Sky|Stars|FlightSimHud|group|mesh|primitive)\b/.test(missionStageSource)
    || /\b(?:assetSpec|terrain|arena|fallback world|procedural vehicle)\b/i.test(missionStageSource)
  ) {
    throw new Error('FlightSimMissionStage must remain a visual-free simulation and frame-lifecycle follower')
  }

  const surfaceControlsSource = await readText(`${flightFeatureRoot}/useFlightSimSurfaceControls.ts`)
  requireSourceMarkers(surfaceControlsSource, [
    "shouldPauseOnPointerRelease: () => readXrNativeControllerCamera().mode === 'fixed-follow'",
    'blocksProgrammaticCamera: false',
    'readFlightSimTouchInput()',
    'readStandardFlightSimGamepad()',
    'flightSimInputFromMotionController(',
    'isFlightSimReadyFramePresentationPending(',
    'runFlightSimStageSimulationStep({',
  ], 'shared Flight Sim surface controls')

  const environmentGeoButtonSource = await readText('canvas/src/features/command-menu/XrEnvironmentGeoButton.tsx')
  requireSourceMarkers(environmentGeoButtonSource, [
    'requestXrEnvironmentGeoHandoff(',
    'await prepareBeforeRoute?.()',
    "emitFloatingPanelOpen({ tab: 'geo', open: true })",
    'data-kg-media-xr-environment-geo={stageId}',
  ], 'shared XR environment Geo handoff')
  if (
    environmentGeoButtonSource.includes('setGeospatialViewMode(')
    || environmentGeoButtonSource.includes('openFlightSimSurface(')
  ) {
    throw new Error('Environment selection must preserve Geo presentation without activating Flight gameplay')
  }

  const canvasViewportSource = await readText('canvas/src/components/CanvasViewport.tsx')
  requireSourceMarkers(canvasViewportSource, [
    'flightSimActive,',
    '<CanvasViewportGeospatialOverlayLazy',
    '<FlightSimHud />',
  ], 'Flight Sim Geo viewport composition')
  if (canvasViewportSource.includes('FlightSimGeoSurfaceOverlay')) {
    throw new Error('CanvasViewport must not retain a second Flight Geo renderer')
  }
  if (
    canvasViewportSource.includes('FlightSimHudLazy')
    || canvasViewportSource.includes('loadFlightSimHud')
  ) {
    throw new Error('The deadline-critical Flight HUD must not suspend its MapLibre viewport owner')
  }

  const geoXrPublisherSource = await readText(
    'canvas/src/features/geospatial/useGeoXrOverlayPublisher.ts',
  )
  requireSourceMarkers(geoXrPublisherSource, [
    'projectFlightSimToGeospatialOverlay',
    'readCurrentFlightSimReadyFrameRequestId()',
    'publishGeoXrOverlayComposition({',
    'projectXrEnvironmentToFlightGeo(',
  ], 'shared City/Flight Geo+XR publisher')
  const geoXrCompositionSource = await readText(
    'canvas/src/features/geospatial/geoXrFlightOverlayComposition.ts',
  )
  requireSourceMarkers(geoXrCompositionSource, [
    'clearFlightOverlay: input.store.clearFlightGeoOverlay',
    'setFlightOverlay: input.store.setFlightGeoOverlay',
  ], 'shared City/Flight Geo+XR publication arbitration')

  const geospatialOverlaySource = await readText('canvas/src/components/CanvasViewportGeospatialOverlay.tsx')
  requireSourceMarkers(geospatialOverlaySource, [
    'completeFlightSimMapLibreReadyFrame(',
    'completeFlightSimStagePreparation(requestId, {',
    'framePresented: true',
    'onFlightOverlayPresented={handleFlightOverlayPresented}',
    "data-kg-geo-xr-layer={composedWithXr ? 'geo-background' : undefined}",
  ], 'Flight Sim Geo presentation bridge')
  if (geospatialOverlaySource.includes('shared-xr-stage')) {
    throw new Error('Geo+XR must retain the native MapLibre provider surface')
  }

  const flightGeoOverlaySource = await readText('gympgrph/src/flightGeoOverlay.ts')
  requireSourceMarkers(flightGeoOverlaySource, [
    'export type FlightGeoOverlaySnapshot',
    'export type FlightGeoOverlayPresentation',
    'export function setFlightGeoOverlay(',
    'export function flightGeoOverlayFeatureCollection(',
    "kgFlightOverlayKind: 'aircraft'",
    "kgFlightOverlayKind: 'objective-guide'",
  ], 'Flight Sim geospatial overlay contract')

  const flightGeoMapLibreSource = await readText('gympgrph/src/flightGeoOverlayMapLibre.ts')
  requireSourceMarkers(flightGeoMapLibreSource, [
    'export function applyFlightGeoOverlayToMap(',
    "from './flightGeoOverlayMapLibreLayers.js'",
  ], 'Flight Sim native MapLibre application')
  const flightGeoMapLibreLayersSource = await readText(
    'gympgrph/src/flightGeoOverlayMapLibreLayers.ts',
  )
  requireSourceMarkers(flightGeoMapLibreLayersSource, [
    "FLIGHT_GEO_OVERLAY_SOURCE_ID = 'kg-flight-sim:geo-overlay'",
    'FLIGHT_GEO_OVERLAY_LAYER_IDS.objectiveGuide',
    'FLIGHT_GEO_OVERLAY_LAYER_IDS.route',
    'FLIGHT_GEO_OVERLAY_LAYER_IDS.routePoints',
    'FLIGHT_GEO_OVERLAY_LAYER_IDS.aircraft',
  ], 'Flight Sim native MapLibre layers')

  const geospatialHostSource = await readText('gympgrph/src/GeospatialHost.tsx')
  const geospatialPresentationSource = await readText(
    'gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
  )
  const geospatialPresentationGateSource = await readText(
    'gympgrph/src/features/geospatial/flightGeoOverlayPresentationGate.ts',
  )
  const mapLibreFlightBootstrapSource = await readText(
    'gympgrph/src/features/geospatial/mapLibreFlightBootstrap.ts',
  )
  const mapLibreFlightProviderPromotionSource = await readText(
    'gympgrph/src/features/geospatial/mapLibreFlightProviderPromotion.ts',
  )
  requireSourceMarkers(geospatialHostSource, [
    'useFlightGeoOverlayMapLibrePresentation({',
  ], 'Flight Sim native MapLibre host composition')
  requireSourceMarkers(geospatialPresentationSource, [
    'applyFlightGeoOverlayToMap(map, overlay)',
    'readyFrameRequestId',
    "root.dataset.kgFlightGeospatialOverlay = 'active'",
    'root.dataset.kgFlightGeospatialRevision = overlay.revision',
  ], 'Flight Sim native MapLibre presentation owner')
  requireSourceMarkers(geospatialPresentationGateSource, [
    "map.on('render', listener)",
    "canvas.dataset.kgFlightSimFirstFrameSurface = 'maplibre'",
    'onPresented?.(presentation)',
    "overlay.phase !== 'stopped'",
    'pending.attempts += 1',
  ], 'Flight Sim native MapLibre presentation gate')
  requireSourceMarkers(mapLibreFlightBootstrapSource, [
    'scheduleProviderStyleApply',
    'cancelMapLibreFlightProviderStyleApply(state)',
    'retainOverlay',
  ], 'Flight Sim MapLibre bootstrap composition')
  requireSourceMarkers(mapLibreFlightProviderPromotionSource, [
    'requestIdleCallback',
    'cancelMapLibreFlightProviderStyleApply(state)',
    'retainOverlay',
  ], 'Flight Sim non-blocking MapLibre provider promotion')
  const stagePreparationSource = await readText(
    'canvas/src/features/game-flight-sim/flightSimStagePreparationRuntime.ts',
  )
  const flightHudSource = await readText(
    'canvas/src/features/game-flight-sim/FlightSimHud.tsx',
  )
  requireSourceMarkers(stagePreparationSource, [
    'completeFlightSimHudStagePreparation',
    'request.hudRevision !== request.surfaceRevision',
    'request.surfacePrepared',
    'surfaceRevision',
  ], 'Flight Sim MapLibre and HUD preparation barrier')
  requireSourceMarkers(flightHudSource, [
    'subscribeFlightSimHudSnapshot',
    'completeFlightSimHudStagePreparation(requestId, flight.revision)',
    'onClick={requestFlightSimPointerCapture}',
  ], 'Flight Sim deadline-critical HUD ownership')
  if (
    flightHudSource.includes('FLIGHT_SIM_AIRCRAFT_ASSET_SPEC')
    || flightHudSource.includes('data-kg-flight-sim-aircraft-media')
    || flightHudSource.includes('data-kg-media-xr-asset')
    || /<Plane\b/.test(flightHudSource)
  ) {
    throw new Error('Flight HUD must not duplicate the canonical MapLibre aircraft subject')
  }
  if (
    geospatialHostSource.includes('shared-xr-stage')
    || geospatialPresentationSource.includes('shared-xr-stage')
  ) {
    throw new Error('Gympgrph must not replace native MapLibre with an XR-local stage')
  }

  const xrCanonicalPhysicsStageSource = await readText('canvas/src/features/three/XrCanonicalPhysicsStage.tsx')
  requireSourceMarkers(xrCanonicalPhysicsStageSource, [
    'environmentVisible={!geospatialComposite}',
  ], 'Flight Sim transparent environment suppression')
  const threeGameplayOverlaySource = await readText('canvas/src/lib/three/ThreeGameplayOverlay.tsx')
  requireSourceMarkers(threeGameplayOverlaySource, [
    'const FlightSimMissionStageLazy = React.lazy(loadFlightSimMissionStage)',
    '<FlightSimMissionStageLazy',
    'geospatialComposite={props.geospatialComposite}',
  ], 'Flight Sim transparent runtime layer')

  const canvasSurfaceOwnershipSource = await readText(
    'canvas/src/lib/canvas/canvasSurfaceOwnershipRuntime.ts',
  )
  requireSourceMarkers(canvasSurfaceOwnershipSource, [
    'input.flightSimActive',
    'input.geospatialModeEnabled',
    'if (flightSimGeoOverlayActive)',
    "activeSurface: 'geo'",
    'geospatialOverlayOwnsViewport: true',
    'if (input.gameplayOverlayActive)',
  ], 'Flight Sim Geo renderer ownership')
}
