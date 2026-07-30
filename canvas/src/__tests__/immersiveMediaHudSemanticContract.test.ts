import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')
const hudSource = readFileSync(
  resolve(repoRoot, 'canvas/src/features/immersive-media/ImmersiveMediaHud.tsx'),
  'utf8',
)

test('Partial overlay reuses the shared bounded semantic media surface', () => {
  assert.match(hudSource, /resolveMediaPreviewSelectableDataAttr/)
  assert.match(
    hudSource,
    /<figure[\s\S]*className=\{cn\([\s\S]*pointer-events-auto absolute bottom-4 left-4[\s\S]*m-0/,
  )
  assert.match(hudSource, /aria-label="Partial immersive media overlay"/)
  assert.match(hudSource, /data-kg-immersive-media-partial-overlay="1"/)
  assert.match(
    hudSource,
    /data-kg-rich-media-selectable-surface=\{selectableSurfaceDataAttr\}/,
  )
  assert.match(hudSource, /<figcaption>/)
  assert.doesNotMatch(hudSource, /aria-hidden/)
  assert.doesNotMatch(hudSource, /<div\b/)
})
