import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isSourceAuthoredFlightSimGeoOverlayDocument,
} from '@/features/game-flight-sim/FlightSimEnvironmentGeoButton'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

export function testXrEnvironmentSelectionProjectsThroughGeoAndFlight() {
  const mediaLibrary = readSource('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
  const geoButton = readSource('features', 'command-menu', 'XrEnvironmentGeoButton.tsx')
  const flightGeoButton = readSource('features', 'game-flight-sim', 'FlightSimEnvironmentGeoButton.tsx')
  const flightGeoOverlay = readSource('features', 'game-flight-sim', 'FlightSimGeoSurfaceOverlay.tsx')
  const flightHud = readSource('features', 'game-flight-sim', 'FlightSimHud.tsx')
  const geoView = readSource('lib', 'toolbar', 'ToolbarToolMenuGeoView.tsx')
  const flightPanel = readSource('features', 'game-flight-sim', 'FlightSimFloatingPanelView.tsx')
  const xrStage = readSource('features', 'three', 'XrCanonicalPhysicsStage.tsx')
  const geoOverlayBridge = readSource('components', 'CanvasViewportGeospatialOverlay.tsx')
  const viewport = readSource('components', 'CanvasViewport.tsx')
  const geospatialPresentation = readFileSync(
    resolve(
      process.cwd(),
      '..',
      'gympgrph',
      'src',
      'features',
      'geospatial',
      'useFlightGeoOverlayMapLibrePresentation.ts',
    ),
    'utf8',
  )
  const geospatialHost = readFileSync(
    resolve(process.cwd(), '..', 'gympgrph', 'src', 'GeospatialHost.tsx'),
    'utf8',
  )

  for (const marker of [
    'requestXrEnvironmentGeoHandoff',
    "emitFloatingPanelOpen({ tab: 'geo', open: true })",
    'await prepareBeforeRoute?.()',
    'inFlightRef.current',
    'data-kg-media-xr-environment-geo={stageId}',
  ]) {
    if (!geoButton.includes(marker)) {
      throw new Error(`expected Environment Kits to reuse the canonical Geo handoff through ${marker}`)
    }
  }
  if (!mediaLibrary.includes('<FlightSimEnvironmentGeoButton')
    || !flightGeoButton.includes('geospatialComposite: true')
    || !flightGeoButton.includes('openPanel: false')
    || flightGeoButton.includes('setGeospatialViewMode(')
    || !flightGeoButton.includes('await settleWorkspaceSourceTextWrites()')
    || !flightGeoButton.includes('Select the source-authored Flight Sim document after Source Files finishes loading.')
    || !flightGeoOverlay.includes('data-kg-flight-sim-geo-overlay="1"')
    || flightGeoOverlay.includes('data-kg-flight-sim-geo-aircraft="1"')
    || !flightHud.includes('data-kg-flight-sim-aircraft-media={FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.id}')
    || !flightGeoOverlay.includes('data-kg-flight-sim-geography-boundary="not-rendered"')
    || !geoView.includes('data-kg-geo-xr-environment={selectedEnvironment.id}')
    || !flightPanel.includes('data-kg-flight-sim-environment={environment.id}')
    || !flightPanel.includes('data-kg-flight-sim-geography-boundary="not-rendered"')
    || !xrStage.includes('environmentVisible={!geospatialComposite}')
    || !geoOverlayBridge.includes('setFlightGeoOverlay')
    || !geoOverlayBridge.includes('projectFlightSimToGeospatialOverlay')
    || !geospatialPresentation.includes('applyFlightGeoOverlayToMap(map, overlay)')
    || !geospatialHost.includes("data-kg-flight-sim-geography-boundary={flightOverlayActive ? 'not-rendered' : undefined}")
    || !viewport.includes('<FlightSimGeoSurfaceOverlayLazy />')) {
    throw new Error('expected one canonical Media aircraft, settled source persistence, native MapLibre projection, and transparent Flight composition')
  }
  const flightSource = [
    '---',
    'run_ready_demo:',
    '  id: "flight-sim"',
    '---',
  ].join('\n')
  if (!isSourceAuthoredFlightSimGeoOverlayDocument('knowgrph-game-flight-sim-demo.md', flightSource)
    || isSourceAuthoredFlightSimGeoOverlayDocument('generic.md', '---\nrun_ready_demo:\n  id: "xr-physics"\n---')) {
    throw new Error('expected only the source-authored Flight document to reactivate Flight after the Geo route')
  }
}
