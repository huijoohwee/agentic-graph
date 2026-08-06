import assert from 'node:assert/strict'
import test from 'node:test'

import { probeXrV2BrowserCapability } from '../xrV2CapabilityRuntime'
import {
  XR_V2_DEPTH_MODEL_ROOT,
  XR_V2_TRANSFORMERS_WASM_ROOT,
  createXrV2LocalDepthInferenceAdapter,
  type XrV2TransformersModule,
} from '../xrV2DepthInferenceRuntime'
import {
  XR_V2_PINNED_INVOCATION_REGISTRY,
  readXrV2InvocationRegistration,
} from '../xrV2InvocationRegistry'

test('browser capability probes do not request camera or sensor permission', async () => {
  const observation = await probeXrV2BrowserCapability({
    navigator: { maxTouchPoints: 0 } as Navigator,
    depthParallaxAssetAdmitted: true,
  })
  assert.equal(observation.cameraPermissionRequested, false)
  assert.equal(observation.sensorPermissionRequested, false)
  assert.equal(observation.probesCompleted, true)
})

test('local depth adapter remains same-origin, bounded, and disposable', async () => {
  let loadCount = 0
  let disposeCount = 0
  const wasm = { wasmPaths: '' }
  class RawImage {
    constructor(readonly data: Uint8ClampedArray) {}
  }
  const module = {
    RawImage,
    env: { backends: { onnx: { wasm } } },
    pipeline: async (_task, model, options) => {
      assert.equal(model, XR_V2_DEPTH_MODEL_ROOT)
      assert.deepEqual(options, { local_files_only: true, dtype: 'q4f16' })
      const pipeline = Object.assign(async () => ({
        depth: { data: new Uint8Array([0, 255]), width: 2, height: 1, channels: 1 },
      }), { dispose: () => { disposeCount += 1 } })
      return pipeline
    },
  } as unknown as XrV2TransformersModule
  const adapter = createXrV2LocalDepthInferenceAdapter({
    loadTransformers: async () => { loadCount += 1; return module },
  })
  await adapter.prepare()
  const estimate = await adapter.estimate({
    frameIndex: 0,
    capturedAtMs: 0,
    frame: { width: 2, height: 1, data: new Uint8ClampedArray(8) },
  })
  assert.deepEqual([...estimate.depth.values], [0, 1])
  assert.equal(wasm.wasmPaths, XR_V2_TRANSFORMERS_WASM_ROOT)
  assert.equal(loadCount, 1)
  await adapter.dispose()
  assert.equal(disposeCount, 1)
})

test('pinned invocation registry exposes only closed zero-cost local/read entries', () => {
  assert.equal(XR_V2_PINNED_INVOCATION_REGISTRY.length, 8)
  for (const entry of XR_V2_PINNED_INVOCATION_REGISTRY) {
    assert.equal(entry.tokenCost, 0)
    assert.equal(readXrV2InvocationRegistration(entry.token), entry)
  }
  assert.equal(readXrV2InvocationRegistration('/unknown'), null)
})
