import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')
const geoSurface = readFileSync(
  resolve(
    repoRoot,
    'canvas/src/features/game-flight-sim/FlightSimGeoSurfaceOverlay.tsx',
  ),
  'utf8',
)

test('Flight Geo reuses the shared selectable semantic media surface', () => {
  assert.match(
    geoSurface,
    /resolveMediaPreviewSelectableDataAttr/,
  )
  assert.match(
    geoSurface,
    /const \[inputElement, setInputElement\] = React\.useState<HTMLElement \| null>/,
  )
  assert.match(
    geoSurface,
    /<figure[\s\S]*ref=\{setInputElement\}[\s\S]*className="pointer-events-auto/,
  )
  assert.match(
    geoSurface,
    /<figure[\s\S]*data-kg-rich-media-selectable-surface=\{selectableSurfaceDataAttr\}/,
  )
  assert.match(geoSurface, /<figcaption/)
  assert.match(
    geoSurface,
    /<svg[\s\S]*className="pointer-events-none/,
  )
  assert.match(
    geoSurface,
    /<button[\s\S]*data-kg-flight-sim-geo-aircraft="1"/,
  )
  assert.doesNotMatch(geoSurface, /<div\b/)
  assert.doesNotMatch(geoSurface, /aria-hidden/)
})
