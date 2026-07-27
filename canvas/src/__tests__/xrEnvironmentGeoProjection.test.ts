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
  const geoView = readSource('lib', 'toolbar', 'ToolbarToolMenuGeoView.tsx')
  const flightPanel = readSource('features', 'game-flight-sim', 'FlightSimFloatingPanelView.tsx')
  const viewport = readSource('components', 'CanvasViewport.tsx')

  for (const marker of [
    'requestXrEnvironmentGeoHandoff',
    "emitFloatingPanelOpen({ tab: 'geo', open: true })",
    'onAfterRoute?.()',
    'data-kg-media-xr-environment-geo={stageId}',
  ]) {
    if (!geoButton.includes(marker)) {
      throw new Error(`expected Environment Kits to reuse the canonical Geo handoff through ${marker}`)
    }
  }
  if (!mediaLibrary.includes('<FlightSimEnvironmentGeoButton')
    || !flightGeoButton.includes("openFlightSimSurface({ openPanel: false })")
    || !flightGeoButton.includes("setGeospatialViewMode('2d-svg')")
    || !flightGeoButton.includes('await settleWorkspaceSourceTextWrites()')
    || !flightGeoOverlay.includes('data-kg-flight-sim-geo-overlay="1"')
    || !flightGeoOverlay.includes('data-kg-flight-sim-geo-aircraft="1"')
    || !geoView.includes('data-kg-geo-xr-environment={selectedEnvironment.id}')
    || !flightPanel.includes('data-kg-flight-sim-environment={environment.id}')
    || !viewport.includes('<FlightSimGeoSurfaceOverlayLazy />')) {
    throw new Error('expected Media selection, settled source persistence, Geo projection, and Flight overlay to share one authored environment')
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
