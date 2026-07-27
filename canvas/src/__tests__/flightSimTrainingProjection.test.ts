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

test('night training changes atmosphere and lights only at shared XR owners', () => {
  const environment = readFileSync(
    'src/features/three/XrNativeControllerDemoEnvironment.tsx',
    'utf8',
  )
  const stage = readFileSync(
    'src/features/three/XrNativeControllerDemoStage.tsx',
    'utf8',
  )
  const missionStage = readFileSync(
    'src/features/game-flight-sim/FlightSimMissionStage.tsx',
    'utf8',
  )
  assert.match(environment, /resolveFlightSimTrainingMission/)
  assert.match(environment, /night \? '#050a1a'/)
  assert.match(
    stage,
    /const ambientIntensity = environmentPresentation\?\.ambientIntensity\s*\?\? \(night \? 0\.13 : 0\.4\)/,
  )
  assert.match(stage, /<ambientLight intensity=\{ambientIntensity\}/)
  assert.doesNotMatch(missionStage, /ambientLight|directionalLight|hemisphereLight/)
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
