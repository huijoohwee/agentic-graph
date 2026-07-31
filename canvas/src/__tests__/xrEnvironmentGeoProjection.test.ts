import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

export function testXrEnvironmentSelectionProjectsThroughGeoAndFlight() {
  const mediaLibrary = readSource(
    'features',
    'command-menu',
    'XrMediaLibraryPanel.tsx',
  )
  const geoButton = readSource(
    'features',
    'command-menu',
    'XrEnvironmentGeoButton.tsx',
  )
  const flightGeoOverlay = readSource(
    'features',
    'game-flight-sim',
    'FlightSimGeoSurfaceOverlay.tsx',
  )
  const flightHud = readSource(
    'features',
    'game-flight-sim',
    'FlightSimHud.tsx',
  )
  const geoView = readSource(
    'lib',
    'toolbar',
    'ToolbarToolMenuGeoView.tsx',
  )
  const geoOverlayBridge = readSource(
    'features',
    'geospatial',
    'useGeoXrOverlayPublisher.ts',
  )
  const geoComposition = readSource(
    'features',
    'geospatial',
    'geoXrFlightOverlayComposition.ts',
  )
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
  const cityPresentation = readFileSync(
    resolve(
      process.cwd(),
      '..',
      'gympgrph',
      'src',
      'features',
      'geospatial',
      'useCityGeoOverlayMapLibrePresentation.ts',
    ),
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
      throw new Error(
        `expected Environment Kits to reuse the canonical Geo handoff through ${marker}`,
      )
    }
  }
  if (
    !mediaLibrary.includes('<XrEnvironmentGeoButton')
    || mediaLibrary.includes('/game-flight-sim/')
    || !geoOverlayBridge.includes(
      'const environment = projectXrEnvironmentToFlightGeo(',
    )
    || !geoOverlayBridge.includes(
      'projectCityAerial: projectCitySimAerialInspectionToGeospatialOverlay',
    )
    || !geoComposition.includes('environment: input.environment')
    || !geospatialPresentation.includes(
      '{ beforeLayerId: CITY_GEO_OVERLAY_LAYER_IDS.fill }',
    )
    || !geospatialPresentation.includes(
      'applyFlightGeoEnvironmentToMap(',
    )
    || !geospatialPresentation.includes(
      'applyFlightGeoOverlayToMap(map, overlay)',
    )
    || !cityPresentation.includes(
      'beforeLayerId: FLIGHT_GEO_OVERLAY_LAYER_IDS.route',
    )
    || !flightGeoOverlay.includes(
      'data-kg-flight-sim-geo-overlay="1"',
    )
    || !flightHud.includes(
      'data-kg-flight-sim-aircraft-media={FLIGHT_SIM_AIRCRAFT_ASSET_SPEC.id}',
    )
    || !geoView.includes(
      'data-kg-geo-xr-environment={selectedEnvironment.id}',
    )
  ) {
    throw new Error(
      'expected generic Media environment selection, one selected-environment publication, ordered native MapLibre layers, and the retained aircraft overlay',
    )
  }
}
