import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { XrV2StoredCaptureFrameBundle } from '../xrV2CaptureArtifactStore'
import {
  decodeXrV2CrossDeviceFrameBundle,
  encodeXrV2CrossDeviceFrameBundle,
} from '../xrV2CrossDeviceFrameBundleCodec'

function bundle(): XrV2StoredCaptureFrameBundle {
  return Object.freeze({
    schema: 'agentic-graph-xr-v2-capture-frame-bundle/v1',
    sessionId: 'cross-device-session',
    snapshot: Object.freeze({
      schema: 'agentic-graph-xr-capture-snapshot/v2',
      contractVersion: '2.0.0',
      sessionId: 'cross-device-session',
      phase: 'completed',
      frameBudgetMs: 100,
      consecutiveBudgetBreachesRequired: 3,
      maxFrames: 180,
      rawFrameCount: 2,
      depthFrameCount: 1,
      synthesizedFrameCount: 1,
      consecutiveBudgetBreaches: 0,
      lastFrameIndex: 2,
      fallback: null,
    }),
    frames: Object.freeze([
      Object.freeze({
        frameIndex: 2,
        capturedAtMs: 102,
        frame: Object.freeze({
          width: 2,
          height: 1,
          data: new Uint8ClampedArray([5, 6, 7, 255, 8, 9, 10, 255]),
        }),
        estimate: null,
      }),
      Object.freeze({
        frameIndex: 0,
        capturedAtMs: 100,
        frame: Object.freeze({
          width: 2,
          height: 1,
          data: new Uint8ClampedArray([1, 2, 3, 255, 2, 3, 4, 255]),
        }),
        estimate: Object.freeze({
          confidence: 0.75,
          depth: Object.freeze({
            width: 2,
            height: 1,
            values: new Float32Array([0.125, 0.875]),
          }),
        }),
      }),
    ]),
    createdAtMs: 1_700_000_000_000,
  })
}

test('cross-device frame bundle codec is deterministic and round-trips RGBA/depth typed arrays', async () => {
  const first = await encodeXrV2CrossDeviceFrameBundle(bundle())
  const second = await encodeXrV2CrossDeviceFrameBundle(bundle())
  assert.deepEqual(first, second)
  assert.match(first.contentHash, /^sha256:[0-9a-f]{64}$/)

  const decoded = await decodeXrV2CrossDeviceFrameBundle(first.bytes, first.contentHash)
  assert.equal(decoded.sessionId, 'cross-device-session')
  assert.deepEqual(decoded.frames.map(frame => frame.frameIndex), [0, 2])
  assert.ok(decoded.frames[0]?.frame.data instanceof Uint8ClampedArray)
  assert.ok(decoded.frames[0]?.estimate?.depth.values instanceof Float32Array)
  assert.deepEqual([...decoded.frames[0]!.frame.data], [1, 2, 3, 255, 2, 3, 4, 255])
  assert.deepEqual([...decoded.frames[0]!.estimate!.depth.values], [0.125, 0.875])
  assert.equal(decoded.frames[1]?.estimate, null)
})

test('cross-device frame bundle decoder rejects digest mismatches and trailing bytes', async () => {
  const encoded = await encodeXrV2CrossDeviceFrameBundle(bundle())
  await assert.rejects(
    decodeXrV2CrossDeviceFrameBundle(encoded.bytes, `sha256:${'0'.repeat(64)}`),
    /SHA-256/,
  )
  const withTrailingByte = new Uint8Array(encoded.bytes.byteLength + 1)
  withTrailingByte.set(encoded.bytes)
  const reencoded = await globalThis.crypto.subtle.digest('SHA-256', withTrailingByte)
  const hash = `sha256:${Array.from(new Uint8Array(reencoded), byte => byte.toString(16).padStart(2, '0')).join('')}`
  await assert.rejects(
    decodeXrV2CrossDeviceFrameBundle(withTrailingByte, hash),
    /trailing bytes/,
  )
})

test('cross-device frame bundle encoder rejects non-finite depth and cancellation', async () => {
  const invalid = bundle()
  invalid.frames[1]!.estimate!.depth.values[0] = Number.NaN
  await assert.rejects(encodeXrV2CrossDeviceFrameBundle(invalid), /finite/)

  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    encodeXrV2CrossDeviceFrameBundle(bundle(), controller.signal),
    error => error instanceof DOMException && error.name === 'AbortError',
  )
})
