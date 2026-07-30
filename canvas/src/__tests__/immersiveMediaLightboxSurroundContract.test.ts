import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')
const projectionSource = readFileSync(
  resolve(repoRoot, 'canvas/src/features/immersive-media/ImmersiveMediaGeoProjection.tsx'),
  'utf8',
)

test('immersive media dims only the surround with the shared opaque lightbox utility', () => {
  assert.match(projectionSource, /MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME/)
  assert.match(projectionSource, /data-kg-immersive-media-lightbox-surround="1"/)
  assert.match(projectionSource, /top-0 bottom-\[92%\]/)
  assert.match(projectionSource, /bottom-0 top-\[87%\]/)
  assert.match(projectionSource, /bottom-\[13%\] left-0 top-\[8%\] right-\[92%\]/)
  assert.match(projectionSource, /bottom-\[13%\] right-0 top-\[8%\] left-\[92%\]/)
  assert.doesNotMatch(projectionSource, /aria-hidden/)
})
