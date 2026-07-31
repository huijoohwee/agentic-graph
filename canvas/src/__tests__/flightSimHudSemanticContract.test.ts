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

test('Flight reuses the shared bounded semantic media surface in every presentation', () => {
  assert.match(
    hudSource,
    /resolveMediaPreviewSelectableDataAttr/,
  )
  assert.match(
    hudSource,
    /<figure[\s\S]*className=\{`\$\{mediaPointerClassName\} absolute inset-\[8%_8%_13%_8%\] m-0`\}/,
  )
  assert.match(
    hudSource,
    /<figure[\s\S]*aria-label="Flight Sim media surface"/,
  )
  assert.match(
    hudSource,
    /data-kg-flight-sim-media-surface="1"/,
  )
  assert.match(
    hudSource,
    /data-kg-rich-media-selectable-surface=\{selectableSurfaceDataAttr\}/,
  )
  assert.match(hudSource, /<figcaption/)
  assert.match(
    hudSource,
    /Flight Sim media · \{camera\.view\} · \{flight\.phase\}/,
  )
  assert.match(hudSource, /FLIGHT_SIM_AIRCRAFT_ASSET_SPEC/)
  assert.match(
    hudSource,
    /<button[\s\S]*aria-label=\{`Select \$\{FLIGHT_SIM_AIRCRAFT_ASSET_SPEC\.label\} Flight media subject`\}/,
  )
  assert.match(hudSource, /aria-pressed=\{aircraftSelected\}/)
  assert.match(
    hudSource,
    /data-kg-flight-sim-aircraft-media=\{FLIGHT_SIM_AIRCRAFT_ASSET_SPEC\.id\}/,
  )
  assert.match(
    hudSource,
    /data-kg-media-xr-asset=\{FLIGHT_SIM_AIRCRAFT_ASSET_SPEC\.id\}/,
  )
  assert.match(hudSource, /data-kg-media-xr-asset-category="vehicles"/)
  assert.match(hudSource, /data-kg-media-xr-thumbnail="flight-subject"/)
  assert.match(hudSource, /requestFlightSimPointerCapture\(\)/)
  assert.match(hudSource, /<Plane[\s\S]*role="img"/)
  assert.doesNotMatch(hudSource, /<div\b/)
  assert.doesNotMatch(hudSource, /aria-hidden/)
})

test('Geo+XR retains semantic Flight selection without intercepting the MapLibre owner', () => {
  assert.match(
    hudSource,
    /export type FlightSimHudProps = Readonly<\{[\s\S]*geospatialComposite\?: boolean/,
  )
  assert.match(
    hudSource,
    /data-kg-flight-sim-media-pointer-owner=\{[\s\S]*geospatialComposite \? 'geo' : 'flight'/,
  )
  assert.match(
    hudSource,
    /const mediaPointerClassName = geospatialComposite[\s\S]*\? 'pointer-events-none'[\s\S]*: 'pointer-events-auto'/,
  )
  assert.match(
    hudSource,
    /<figcaption[\s\S]*className=\{`\$\{mediaPointerClassName\}/,
  )
  assert.match(
    hudSource,
    /<button[\s\S]*className=\{`\$\{mediaPointerClassName\}/,
  )
})
