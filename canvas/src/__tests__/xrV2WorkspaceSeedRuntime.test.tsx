import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type { XrAuthoringEcsRuntimeSnapshot } from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import { BEHAVIOR_GRAPH_SCHEMA } from '@/features/xr-v2/behaviorDispatcher'
import {
  XR_V2_SPATIAL_ASSET_METADATA_FIELDS,
  createXrV2SpatialAssetMetadata,
  isXrV2SpatialAssetMetadata,
} from '@/features/xr-v2/xrV2SpatialAssetMetadata'
import { XrV2WorkspaceReadinessPanelView } from '@/features/xr-v2/XrV2WorkspaceReadinessPanel'
import { probeXrV2WorkspaceReadiness } from '@/features/xr-v2/xrV2WorkspaceReadinessRuntime'

const AUTHORING_READY: XrAuthoringEcsRuntimeSnapshot = Object.freeze({
  schema: 'knowgrph-xr-authoring-ecs-runtime/v1',
  status: 'ready',
  documentKey: 'xr-v2-test',
  graphDataRevision: 1,
  sourceDigest: 'test-source',
  plan: null,
  counts: Object.freeze({ entities: 2, materials: 1, behaviors: 1, particles: 1, timelines: 1 }),
  error: null,
  revision: 1,
})

async function readySnapshot() {
  const navigatorValue = {
    maxTouchPoints: 0,
    platform: 'test-platform',
    xr: {
      isSessionSupported: async (mode: string) => mode === 'immersive-ar',
    },
  } as unknown as Navigator
  return probeXrV2WorkspaceReadiness({
    navigator: navigatorValue,
    flatFallbackMounted: true,
    authoringSnapshot: AUTHORING_READY,
  }, {
    detectBrowserApis: () => Object.freeze({
      indexedDb: true,
      mediaCapture: true,
      mediaRecorder: true,
      webCodecs: true,
      browserVideoPlayback: true,
      connectedPreviewTransport: true,
    }),
  })
}

test('pinned behavior and spatial asset contracts expose exact runtime schemas', () => {
  assert.equal(BEHAVIOR_GRAPH_SCHEMA, 'kgc-behavior-graph/v1')
  const metadata = createXrV2SpatialAssetMetadata({
    tier: 'flat-fallback',
    synthesisMode: 'post-process',
    depthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/test',
    fallbackTriggered: true,
  })
  assert.deepEqual(Object.keys(metadata), [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS])
  assert.equal(isXrV2SpatialAssetMetadata(metadata), true)
  assert.equal(Object.isFrozen(metadata), true)

  assert.throws(() => createXrV2SpatialAssetMetadata({
    tier: 'flat-fallback',
    synthesisMode: 'none',
    depthMetadataRef: null,
    fallbackTriggered: 'false' as unknown as boolean,
  }), /fallback_triggered must be a boolean/)
  assert.equal(isXrV2SpatialAssetMetadata({
    xr_capability_tier: 'flat-fallback',
    synthesis_mode: 'none',
    depth_metadata_ref: null,
    fallback_triggered: 'false',
  }), false)
  assert.equal(isXrV2SpatialAssetMetadata({ ...metadata, unexpected: true }), false)
})

test('workspace readiness observes one tier, mounts flat fallback, and never requests permissions', async () => {
  const snapshot = await readySnapshot()
  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.capabilityTier, 'webxr-ar')
  assert.equal(snapshot.progressiveViewer?.renderedTier, 'flat-fallback')
  assert.equal(snapshot.progressiveViewer?.permissionRequested, false)
  assert.deepEqual(snapshot.permissionRequests, {
    camera: false,
    sensors: false,
    immersiveSession: false,
  })
  assert.equal(snapshot.canOfferUserActions, true)
  assert.equal(snapshot.criteria.length, 12)
  assert.deepEqual(snapshot.criteria.map(criterion => criterion.id), [
    'AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5', 'AC-6',
    'AC-7', 'AC-8', 'AC-9', 'AC-10', 'AC-11', 'AC-12',
  ])
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-6')?.localEvidence, 'browser-observed')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-7')?.localEvidence, 'browser-observed')
  assert.deepEqual(
    snapshot.criteria.find(item => item.id === 'AC-11')?.externalEvidenceRequired,
    ['trackPreservingContainerMux'],
  )
  assert.deepEqual(
    snapshot.criteria.find(item => item.id === 'AC-12')?.externalEvidenceRequired,
    ['connectedPreviewTransport'],
  )
})

test('mounted seed surface renders capability tier before disabled capture actions', async () => {
  const snapshot = await readySnapshot()
  const html = renderToStaticMarkup(<XrV2WorkspaceReadinessPanelView snapshot={snapshot} />)
  const tierIndex = html.indexOf('data-kg-xr-v2-capability-tier-output="1"')
  const captureIndex = html.indexOf('data-kg-xr-v2-spatial-capture-start="1"')
  assert.ok(tierIndex >= 0)
  assert.ok(captureIndex > tierIndex)
  assert.match(html, /data-kg-xr-v2-capability-tier="webxr-ar"/)
  assert.match(html, /data-kg-xr-v2-viewer-tier="flat-fallback"/)
  assert.match(html, /data-kg-xr-v2-camera-auto-request="false"/)
  assert.match(html, /data-kg-xr-v2-sensor-auto-request="false"/)
  assert.match(html, /data-kg-xr-v2-physical-certification="external-required"/)
  assert.match(html.slice(captureIndex - 200, captureIndex + 100), /disabled=""/)
  for (let criterion = 1; criterion <= 12; criterion += 1) {
    assert.match(html, new RegExp(`data-kg-xr-v2-ac="AC-${criterion}"`))
  }
})

test('spatial capture consumes only the injected canonical camera source', () => {
  const runtimeSource = readFileSync(
    new URL('../features/xr-v2/xrV2SpatialCaptureRuntime.ts', import.meta.url),
    'utf8',
  )
  const motionViewSource = readFileSync(
    new URL('../features/three/MotionControlFloatingPanelView.tsx', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(runtimeSource, /getUserMedia|navigator\.mediaDevices/)
  assert.doesNotMatch(runtimeSource, /getTracks\(\)\.forEach\([^)]*\.stop/)
  assert.match(runtimeSource, /configuredSource/)
  assert.match(runtimeSource, /source\.createRecorder\(acquired\)/)
  assert.match(motionViewSource, /configureXrV2SpatialCaptureSource/)
  assert.match(motionViewSource, /createXrV2RawClipRecorder/)
  assert.match(motionViewSource, /await cancelXrV2SpatialCapture\(\)/)
  assert.match(motionViewSource, /data-kg-motion-control-stop="1"/)
})
