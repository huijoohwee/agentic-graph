import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA,
  installFlightSimBrowserProofBridge,
} from '@/features/testing/flightSimBrowserProofBridge'

const EXPECTED_MODULE_KEYS = Object.freeze([
  'cameraMcpRuntime',
  'cameraSourceMcpRuntime',
  'flightSimCameraRuntime',
  'flightSimDeadlineRuntime',
  'flightSimInput',
  'flightSimMcpRuntime',
  'flightSimModel',
  'flightSimRuntime',
  'flightSimSurfaceOwnershipStatus',
  'flightSimWebMcpTools',
  'geospatialModeBridge',
  'graphStore',
  'gympgrphStore',
  'agenticgraphRuntimeIdentity',
  'markdownExplorerStore',
  'motionControlSurfaceRuntime',
  'sourceFilesBootstrapReadiness',
  'sourceFilesRuntimeMaterialization',
  'workspaceCanonicalSeedBundle',
  'workspaceFs',
  'workspaceRunReadyDemos',
  'xrCameraPlaybackControlsRuntime',
  'xrMotionReferenceRuntime',
  'xrMotionReferenceTimeline',
  'xrNativeControllerCameraCatalog',
  'xrNativeControllerCameraRuntime',
  'xrNativeControllerDemoRuntime',
  'xrNativeControllerPresentation',
  'xrPhysicsRuntime',
  'xrSceneLibrary',
  'xrSceneSurfaceRuntime',
])

test('Flight browser proof bridge exposes only its exact production module inventory', async () => {
  const priorWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
    writable: true,
  })
  try {
    installFlightSimBrowserProofBridge()
    const bridge = window.__kgFlightSimBrowserProof
    assert.ok(bridge)
    assert.equal(bridge.schema, FLIGHT_SIM_BROWSER_PROOF_BRIDGE_SCHEMA)
    assert.deepEqual(bridge.moduleKeys, EXPECTED_MODULE_KEYS)
    await assert.rejects(
      bridge.importModule('/src/hooks/useGraphStore.ts'),
      /Unknown Flight browser proof module/,
    )
  } finally {
    if (priorWindow === undefined) {
      delete (globalThis as { window?: Window }).window
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: priorWindow,
        writable: true,
      })
    }
  }
})
