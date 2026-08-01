import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function canvasSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

function workspaceSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), '..', relativePath), 'utf8')
}

export function testXrEnvironmentSelectionProjectsThroughGeoAndFlight() {
  const mediaLibrary = canvasSource(
    'features',
    'command-menu',
    'XrMediaLibraryPanel.tsx',
  )
  const geoButton = canvasSource(
    'features',
    'command-menu',
    'XrEnvironmentGeoButton.tsx',
  )
  const viewport = canvasSource('components', 'CanvasViewport.tsx')
  const flightHud = canvasSource(
    'features',
    'game-flight-sim',
    'FlightSimHud.tsx',
  )
  const geoView = canvasSource(
    'lib',
    'toolbar',
    'ToolbarToolMenuGeoView.tsx',
  )
  const publisher = canvasSource(
    'features',
    'geospatial',
    'useGeoXrOverlayPublisher.ts',
  )
  const composition = canvasSource(
    'features',
    'geospatial',
    'geoXrFlightOverlayComposition.ts',
  )
  const flightPresentation = workspaceSource(
    'gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
  )
  const cityPresentation = workspaceSource(
    'gympgrph/src/features/geospatial/useCityGeoOverlayMapLibrePresentation.ts',
  )

  for (const marker of [
    'requestXrEnvironmentGeoHandoff',
    "emitFloatingPanelOpen({ tab: 'geo', open: true })",
    'await prepareBeforeRoute?.()',
    'data-kg-media-xr-environment-geo={stageId}',
  ]) {
    if (!geoButton.includes(marker)) {
      throw new Error(`expected Environment Kits to reuse the Geo handoff through ${marker}`)
    }
  }
  if (
    !mediaLibrary.includes('<XrEnvironmentGeoButton')
    || mediaLibrary.includes('/game-flight-sim/')
    || !publisher.includes('const environment = projectXrEnvironmentToFlightGeo(')
    || !publisher.includes('projectCityOverlay: projectCitySimToGeospatialOverlay')
    || !composition.includes('input.store.clearCityGeoOverlay()')
    || !composition.includes('input.store.setCityGeoOverlay(input.projectCityOverlay(input.city))')
    || !flightPresentation.includes('applyFlightGeoEnvironmentToMap(')
    || !flightPresentation.includes('applyFlightGeoOverlayToMap(map, overlay)')
    || !cityPresentation.includes('beforeLayerId: FLIGHT_GEO_OVERLAY_LAYER_IDS.route')
    || !viewport.includes('<CanvasViewportGeospatialOverlayLazy')
    || viewport.includes('FlightSimGeoSurfaceOverlay')
    || flightHud.includes('FLIGHT_SIM_AIRCRAFT_ASSET_SPEC')
    || flightHud.includes('data-kg-flight-sim-aircraft-media')
    || !geoView.includes('data-kg-geo-xr-environment={selectedEnvironment.id}')
  ) {
    throw new Error(
      'expected Media environment selection, City POIs, and Flight to share one native Geo presentation without duplicate aircraft ownership',
    )
  }
}
