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
    'readFlightSimDefaultAssetLoadReport',
    'kg_flight_sim_optional_beacon',
    'useFlightSimSurfaceControls({',
    "snapshot.phase === 'ready' || snapshot.phase === 'flying'",
    'const removeAfterRender = addAfterEffect(() => {',
    'if (!actorsVisible) {',
    "canvas.dataset.kgFlightSimFirstFrame = '1'",
    'completeFlightSimReadyFrame(presentation.runId, presentation.tick)',
  ], 'Flight Sim actor stage')
  if (
    /<(?:Canvas|ambientLight|directionalLight|hemisphereLight|pointLight|spotLight|Environment|Sky|Stars|FlightSimHud)\b/.test(missionStageSource)
    || /\b(?:terrain|arena|fallback world)\b/i.test(missionStageSource)
  ) {
    throw new Error('FlightSimMissionStage must render only Flight actors and objective overlays')
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

  const geoSurfaceSource = await readText(`${flightFeatureRoot}/FlightSimGeoSurfaceOverlay.tsx`)
  requireSourceMarkers(geoSurfaceSource, [
    'export function FlightSimGeoSurfaceOverlay',
    'projectFlightSimNavigation(',
    'useFlightSimSurfaceControls({',
    'completeFlightSimStagePreparation(requestId)',
    'completeFlightSimReadyFrame(flight.runId, flight.tick)',
    'data-kg-flight-sim-geo-overlay="1"',
    'data-kg-flight-sim-geo-aircraft="1"',
  ], 'Flight Sim Geo surface overlay')
  const environmentGeoButtonSource = await readText(`${flightFeatureRoot}/FlightSimEnvironmentGeoButton.tsx`)
  requireSourceMarkers(environmentGeoButtonSource, [
    'selectFlightSimGeoEnvironment(',
    'geospatialComposite: true,',
    'openPanel: false,',
  ], 'Flight Sim local Geo handoff')
  if (environmentGeoButtonSource.includes('setGeospatialViewMode(')) {
    throw new Error('Flight environment handoff must preserve the selected Geo presentation')
  }

  const canvasViewportSource = await readText('canvas/src/components/CanvasViewport.tsx')
  requireSourceMarkers(canvasViewportSource, [
    'flightSimActive,',
    '<CanvasViewportGeospatialOverlayLazy',
    '<FlightSimGeoSurfaceOverlayLazy />',
    '<FlightSimHud />',
  ], 'Flight Sim Geo viewport composition')
  if (
    canvasViewportSource.includes('FlightSimHudLazy')
    || canvasViewportSource.includes('loadFlightSimHud')
  ) {
    throw new Error('The deadline-critical Flight HUD must not suspend its MapLibre viewport owner')
  }

  const geospatialOverlaySource = await readText('canvas/src/components/CanvasViewportGeospatialOverlay.tsx')
  requireSourceMarkers(geospatialOverlaySource, [
    'projectFlightSimToGeospatialOverlay',
    'module.setFlightGeoOverlay?.(',
    'module.clearFlightGeoOverlay?.()',
    'readCurrentFlightSimReadyFrameRequestId()',
    'completeFlightSimMapLibreReadyFrame(',
    'completeFlightSimStagePreparation(requestId, {',
    'framePresented: true',
    'onFlightOverlayPresented={handleFlightOverlayPresented}',
    "data-kg-geo-xr-layer={composedWithXr ? 'geo-background' : undefined}",
  ], 'Flight Sim Geo projection bridge')
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
  ], 'Flight Sim deadline-critical HUD ownership')
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
    'actorsVisible',
    'coordinateScale={props.coordinateScale}',
  ], 'Flight Sim transparent runtime layer')
  if (threeGameplayOverlaySource.includes('props.geospatialComposite')) {
    throw new Error('Flight Sim actor visibility must not depend on a removed City/Geo composition alias')
  }

  const rendererLifecycleSource = await readText('canvas/src/lib/three/threeRendererLifecycle.ts')
  requireSourceMarkers(rendererLifecycleSource, [
    'input.flightSimActive',
    'input.geospatialModeEnabled',
    'if (flightSimGeoOverlayActive)',
    "activeSurface: 'geo'",
    'geospatialOverlayOwnsViewport: true',
    'if (input.gameplayOverlayActive)',
  ], 'Flight Sim Geo renderer ownership')
}
