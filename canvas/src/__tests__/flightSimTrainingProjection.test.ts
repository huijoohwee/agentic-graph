import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const projectionOwners = Object.freeze({
  media: 'src/features/command-menu/MediaCatalogPanelView.tsx',
  animation: 'src/features/three/XrAnimationFloatingPanelView.tsx',
  'motion-control': 'src/features/three/MotionControlFloatingPanelView.tsx',
  'game-mode': 'src/features/game-fps/GameModeFloatingPanelView.tsx',
  'flight-sim': 'src/features/game-flight-sim/FlightSimFloatingPanelView.tsx',
  camera: 'src/features/strybldr/StrybldrCameraFloatingPanelView.tsx',
})

test('one source-authored training projection reaches all six FloatingPanel owners', () => {
  for (const [surface, path] of Object.entries(projectionOwners)) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /FlightSimTrainingSurfaceProjection/)
    assert.match(source, new RegExp(`surface="${surface}"`))
  }
})

test('night training changes the native MapLibre overlay and shared HUD only', () => {
  const mapLibreOverlay = readFileSync(
    '../gympgrph/src/flightGeoOverlayMapLibre.ts',
    'utf8',
  )
  const mapLibreOverlayLayers = readFileSync(
    '../gympgrph/src/flightGeoOverlayMapLibreLayers.ts',
    'utf8',
  )
  const projection = readFileSync(
    'src/features/game-flight-sim/flightSimGeospatialProjection.ts',
    'utf8',
  )
  const publisher = readFileSync(
    'src/features/geospatial/useGeoXrOverlayPublisher.ts',
    'utf8',
  )
  const hud = readFileSync(
    'src/features/game-flight-sim/FlightSimHud.tsx',
    'utf8',
  )
  const missionStage = readFileSync(
    'src/features/game-flight-sim/FlightSimMissionStage.tsx',
    'utf8',
  )
  assert.match(projection, /night: boolean/)
  assert.match(publisher, /readFlightSimTrainingSnapshot\(\)\.night/)
  assert.match(
    mapLibreOverlay,
    /from '\.\/flightGeoOverlayMapLibreLayers\.js'/,
  )
  assert.match(mapLibreOverlayLayers, /FLIGHT_GEO_NIGHT_EXPRESSION/)
  assert.match(mapLibreOverlayLayers, /#a78bfa/)
  assert.match(hud, /data-kg-flight-sim-night/)
  assert.match(hud, /bg-indigo-950\/80/)
  assert.match(
    missionStage,
    /geospatialComposite \? \([\s\S]*name="agentic_os_flight_sim_geospatial_actor_lighting"[\s\S]*userData=\{\{ actorOnly: true, preservesTransparentBackground: true \}\}[\s\S]*<ambientLight intensity=\{0\.9\} \/>[\s\S]*<hemisphereLight args=\{\['#ffffff', '#cbd5e1', 0\.6\]\} \/>[\s\S]*<pointLight position=\{\[120, 120, 120\]\} intensity=\{0\.9\} \/>/,
  )
  assert.doesNotMatch(missionStage, /<directionalLight/)
  assert.doesNotMatch(
    missionStage,
    /<Canvas\b|<color attach="background"|<fog\b|FlightSimHud|name="[^"]*(?:world|terrain|hud)/i,
  )
})

test('mission-stage entry owns a bounded transient dynamic-import retry', () => {
  const loader = readFileSync(
    'src/lib/three/flightSimMissionStageLoader.ts',
    'utf8',
  )
  assert.match(loader, /importWithRetry\(importMissionStage/)
  assert.match(loader, /retries: 2/)
  assert.match(loader, /retryDelayMs: 50/)
})
