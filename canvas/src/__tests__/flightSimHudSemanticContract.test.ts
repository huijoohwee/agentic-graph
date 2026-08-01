import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')
const hudSource = readFileSync(
  resolve(
    repoRoot,
    'canvas/src/features/game-flight-sim/FlightSimHud.tsx',
  ),
  'utf8',
)

test('Flight HUD remains semantic controls without owning a second aircraft presentation', () => {
  assert.match(hudSource, /<section[\s\S]*aria-label="Flight Sim HUD"/)
  assert.match(hudSource, /<FlightSimNavigationInset/)
  assert.match(hudSource, /aria-label="Capture flight pointer"/)
  assert.match(hudSource, /requestFlightSimPointerCapture/)
  assert.doesNotMatch(hudSource, /FLIGHT_SIM_AIRCRAFT_ASSET_SPEC/)
  assert.doesNotMatch(hudSource, /data-kg-flight-sim-aircraft-media/)
  assert.doesNotMatch(hudSource, /data-kg-media-xr-asset/)
  assert.doesNotMatch(hudSource, /<figure\b/)
  assert.doesNotMatch(hudSource, /<Plane\b/)
  assert.doesNotMatch(hudSource, /<div\b/)
  assert.doesNotMatch(hudSource, /aria-hidden/)
})
