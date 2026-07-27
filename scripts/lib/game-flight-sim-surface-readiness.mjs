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

  const canvasViewportSource = await readText('canvas/src/components/CanvasViewport.tsx')
  requireSourceMarkers(canvasViewportSource, [
    'flightSimActive,',
    '<CanvasViewportGeospatialOverlayLazy',
    '<FlightSimGeoSurfaceOverlayLazy />',
  ], 'Flight Sim Geo viewport composition')

  const rendererLifecycleSource = await readText('canvas/src/lib/three/threeRendererLifecycle.ts')
  requireSourceMarkers(rendererLifecycleSource, [
    'input.flightSimActive',
    'input.geospatialModeEnabled',
    'if (input.gameplayOverlayActive && !flightSimGeoOverlayActive)',
  ], 'Flight Sim Geo renderer ownership')
}
