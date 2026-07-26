import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSource(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')
}

export function testXrEnvironmentSelectionProjectsThroughGeoAndFlight() {
  const mediaLibrary = readSource('features', 'command-menu', 'XrMediaLibraryPanel.tsx')
  const geoButton = readSource('features', 'command-menu', 'XrEnvironmentGeoButton.tsx')
  const geoView = readSource('lib', 'toolbar', 'ToolbarToolMenuGeoView.tsx')
  const flightPanel = readSource('features', 'game-flight-sim', 'FlightSimFloatingPanelView.tsx')

  for (const marker of [
    'requestXrEnvironmentGeoHandoff',
    "emitFloatingPanelOpen({ tab: 'geo', open: true })",
    'data-kg-media-xr-environment-geo={stageId}',
  ]) {
    if (!geoButton.includes(marker)) {
      throw new Error(`expected Environment Kits to reuse the canonical Geo handoff through ${marker}`)
    }
  }
  if (!mediaLibrary.includes('<XrEnvironmentGeoButton')
    || !geoView.includes('data-kg-geo-xr-environment={selectedEnvironment.id}')
    || !flightPanel.includes('data-kg-flight-sim-environment={environment.id}')) {
    throw new Error('expected Media selection, Geo projection, and Flight world projection to share one authored XR environment')
  }
}
