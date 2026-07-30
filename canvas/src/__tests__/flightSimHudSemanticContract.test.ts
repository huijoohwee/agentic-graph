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
    /<figure[\s\S]*className="pointer-events-auto absolute inset-\[8%_8%_13%_8%\] m-0"/,
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
  assert.doesNotMatch(hudSource, /<div\b/)
  assert.doesNotMatch(hudSource, /aria-hidden/)
})
