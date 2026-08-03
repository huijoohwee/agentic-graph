import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createXrV2RgbaStereoSynthesizer,
  synthesizeXrV2RgbaStereoPair,
} from '../stereoSynthesis'

const red = [255, 0, 0, 255]
const green = [0, 255, 0, 255]
const blue = [0, 0, 255, 255]

test('RGBA synthesis deterministically warps a frame into a stereo pair', () => {
  const sourceData = new Uint8ClampedArray([...red, ...green, ...blue])
  const pair = synthesizeXrV2RgbaStereoPair({
    frameIndex: 7,
    capturedAtMs: 120,
    frame: { width: 3, height: 1, data: sourceData },
    estimate: {
      depth: {
        width: 3,
        height: 1,
        values: new Float32Array([0, 1, 0]),
      },
      confidence: 1,
    },
    configuration: { maxDisparityPixels: 1 },
  })

  assert.equal(pair.schema, 'knowgrph-xr-stereo-pair/v2')
  assert.equal(pair.frameIndex, 7)
  assert.deepEqual([...pair.left.data], [...green, ...green, ...blue])
  assert.deepEqual([...pair.right.data], [...red, ...green, ...green])
  assert.deepEqual([...sourceData], [...red, ...green, ...blue])
})

test('RGBA synthesizer adapter preserves source identity fields', async () => {
  const synthesizer = createXrV2RgbaStereoSynthesizer({ maxDisparityPixels: 0 })
  const pair = await synthesizer.synthesize({
    frame: {
      frameIndex: 2,
      capturedAtMs: 45,
      frame: {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray(red),
      },
    },
    estimate: {
      depth: { width: 1, height: 1, values: new Float32Array([0.5]) },
      confidence: 0.8,
    },
  })

  assert.equal(pair.frameIndex, 2)
  assert.equal(pair.capturedAtMs, 45)
  assert.deepEqual([...pair.left.data], red)
  assert.deepEqual([...pair.right.data], red)
})

test('RGBA synthesis rejects malformed frame and depth contracts', () => {
  assert.throws(() => synthesizeXrV2RgbaStereoPair({
    frameIndex: 0,
    capturedAtMs: 0,
    frame: { width: 1, height: 1, data: new Uint8ClampedArray(red) },
    estimate: {
      depth: { width: 2, height: 1, values: new Float32Array([0, 1]) },
      confidence: 1,
    },
    configuration: { maxDisparityPixels: 1 },
  }), /dimensions must match/)
})
