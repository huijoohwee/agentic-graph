import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type { XrAuthoringEcsRuntimeSnapshot } from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import {
  isXrPhysicsRunReadyDemoActive,
  isXrPhysicsRuntimeRunReadyDemoActive,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  BEHAVIOR_GRAPH_SCHEMA,
  createKgcBehaviorGraphContract,
} from '@/features/xr-v2/behaviorDispatcher'
import type { MountedAuthoringEvidenceSnapshot } from '@/features/xr-v2/mountedAuthoringEvidence'
import {
  XR_V2_SPATIAL_ASSET_METADATA_FIELDS,
  createXrV2SpatialAssetMetadata,
  isXrV2SpatialAssetMetadata,
} from '@/features/xr-v2/xrV2SpatialAssetMetadata'
import { XrV2WorkspaceReadinessPanelView } from '@/features/xr-v2/XrV2WorkspaceReadinessPanel'
import {
  beginXrV2DeliveryCriterionObservation,
  probeXrV2WorkspaceReadiness,
  readXrV2WorkspaceReadiness,
  reportXrV2DeliveryCriterionObservation,
  startXrV2WorkspaceReadinessRuntime,
  stopXrV2WorkspaceReadinessRuntime,
  type XrV2DeliveryObservation,
  type XrV2ViewerObservation,
} from '@/features/xr-v2/xrV2WorkspaceReadinessRuntime'

const AUTHORING_READY: XrAuthoringEcsRuntimeSnapshot = Object.freeze({
  schema: 'agenticgraph-xr-authoring-ecs-runtime/v1',
  status: 'ready',
  documentKey: 'xr-v2-test',
  graphDataRevision: 1,
  sourceDigest: 'fnv1a32:12345678',
  plan: Object.freeze({
    sourceDigest: 'fnv1a32:12345678', graphDataRevision: 1,
  }) as XrAuthoringEcsRuntimeSnapshot['plan'],
  counts: Object.freeze({ entities: 2, materials: 1, behaviors: 1, particles: 1, timelines: 1 }),
  error: null,
  revision: 1,
})

const MOUNTED_READY = Object.freeze({
  schema: 'agenticgraph-xr-v2-mounted-authoring-evidence/v1',
  status: 'ready',
  reason: null,
  source: Object.freeze({
    documentKey: 'xr-v2-test',
    graphDataRevision: 1,
    sourceDigest: 'test-source',
    componentQueries: Object.freeze({ transformed: [0, 1], renderable: [0], particles: [0], rigs: [0] }),
    expected: Object.freeze({
      entityIds: [0, 1], meshEntityIds: [0], materialGraphEntityIds: [0],
      mappedMaterialEntityIds: [0], particleEntityIds: [0], bones: [],
      behaviorEffectRequired: true,
    }),
  }),
  observation: Object.freeze({
    canvas: Object.freeze({ identity: 'test-canvas', connected: true, width: 800, height: 600 }),
    entityIds: [0, 1],
    meshes: [Object.freeze({
      entityId: 0, meshUuid: 'mesh', materialUuid: 'material', mapUuid: 'map',
      bindingStatus: 'ready', visible: true,
    })],
    particles: [],
    bones: [],
    canonicalTimeline: Object.freeze({ playheadSeconds: 0, motionRevision: 1 }),
    behavior: Object.freeze({
      revision: 1, effectCount: 1, successfulDispatchCount: 1,
      lastDispatchEffectCount: 1, lastEventId: 'event', lastTrigger: 'select',
      lastStatus: 'dispatched', lastInvokedActionIds: ['action'],
    }),
    renderer: Object.freeze({
      compileMethod: 'compile', compileStatus: 'ready', compileCallCount: 1,
      observedFrameCount: 2, renderCallCount: 2,
    }),
    observedResourceIds: ['mesh', 'material', 'map'],
  }),
  resources: Object.freeze({ observedCount: 3, disposeEventCount: 0 }),
  revision: 2,
}) as MountedAuthoringEvidenceSnapshot

async function readySnapshot(
  observed = true,
  mountedAuthoringEvidence: MountedAuthoringEvidenceSnapshot = MOUNTED_READY,
  observedViewer?: XrV2ViewerObservation,
  deliveryObservation?: XrV2DeliveryObservation,
  authoringSnapshot: XrAuthoringEcsRuntimeSnapshot = AUTHORING_READY,
) {
  const navigatorValue = {
    maxTouchPoints: 0,
    platform: 'test-platform',
    xr: {
      isSessionSupported: async (mode: string) => mode === 'immersive-ar',
    },
  } as unknown as Navigator
  return probeXrV2WorkspaceReadiness({
    navigator: navigatorValue,
    authoringSnapshot,
    ...(observed ? {
      mountedAuthoringEvidence,
      viewerObservation: observedViewer || Object.freeze({
        webXrArSavedAssetRendered: false,
        webXrVrSavedAssetRendered: false,
        depthParallaxAssetMounted: false,
        flatFallbackMounted: true,
        savedAssetRef: 'indexeddb://agenticgraph-xr-v2/assets/test',
        savedAssetMetadata: Object.freeze({
          xr_capability_tier: 'flat-fallback',
          synthesis_mode: 'post-process',
          depth_metadata_ref: 'indexeddb://agenticgraph-xr-v2/frame-bundle/test',
          fallback_triggered: true,
        }),
        revision: 1,
      }),
    } : {}),
    ...(deliveryObservation ? { deliveryObservation } : {}),
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
  const behavior = createKgcBehaviorGraphContract({
    graphId: 'test-graph',
    nodes: [{ id: 'trigger', type: 'trigger', config: { event: 'select' } }],
    edges: [],
    boundEntity: '0',
  })
  assert.deepEqual(Object.keys(behavior), ['graph_id', 'nodes', 'edges', 'bound_entity'])
  const metadata = createXrV2SpatialAssetMetadata({
    tier: 'flat-fallback',
    synthesisMode: 'post-process',
    depthMetadataRef: 'indexeddb://agenticgraph-xr-v2/frame-bundle/test',
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

test('XR v2 shares the dedicated XR world without starting a second Physics lifecycle owner', () => {
  const path = '/docs/workspace-seeds/agenticgraph-ar-vr-xr-runtime-readiness-demo.md'
  const source = readFileSync(
    new URL('../../../docs/workspace-seeds/agenticgraph-ar-vr-xr-runtime-readiness-demo.md', import.meta.url),
    'utf8',
  )
  assert.equal(isXrPhysicsRunReadyDemoActive(path, source), true)
  assert.equal(isXrPhysicsRuntimeRunReadyDemoActive(path, source), false)
})

test('workspace readiness does not promote projected counts or an unmounted viewer', async () => {
  const snapshot = await readySnapshot(false)
  assert.equal(snapshot.progressiveViewer?.status, 'unavailable')
  assert.equal(snapshot.progressiveViewer?.renderedTier, null)
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-4')?.localEvidence, 'not-observed')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-6')?.localEvidence, 'deterministic-proven')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-7')?.localEvidence, 'deterministic-proven')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-11')?.localEvidence, 'not-observed')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-12')?.localEvidence, 'not-observed')
})

test('workspace readiness observes mounted renderer and saved viewer without requesting permissions', async () => {
  const snapshot = await readySnapshot()
  assert.equal(snapshot.status, 'ready')
  assert.equal(snapshot.capabilityTier, 'webxr-ar')
  assert.equal(snapshot.progressiveViewer?.renderedTier, 'flat-fallback')
  assert.deepEqual(snapshot.assetMetadata, {
    xr_capability_tier: 'flat-fallback',
    synthesis_mode: 'post-process',
    depth_metadata_ref: 'indexeddb://agenticgraph-xr-v2/frame-bundle/test',
    fallback_triggered: true,
  })
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
    snapshot.criteria.find(item => item.id === 'AC-4')?.externalEvidenceRequired,
    [
      'progressiveViewerMatrix',
      'sharedStorageWorkspaceAuthAndServerDigest',
      'physicalCrossDeviceReopen',
    ],
  )
  assert.deepEqual(
    snapshot.criteria.find(item => item.id === 'AC-11')?.externalEvidenceRequired,
    ['trackPreservingContainerMux'],
  )
  assert.deepEqual(
    snapshot.criteria.find(item => item.id === 'AC-12')?.externalEvidenceRequired,
    ['connectedPreviewTransport'],
  )
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-11')?.localEvidence, 'not-observed')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-12')?.localEvidence, 'not-observed')
})

test('explicit delivery observations promote canonical criteria and reruns clear only their own evidence', async () => {
  const observed = Object.freeze({
    packagingObserved: true,
    packagingSource: Object.freeze({
      assetId: 'indexeddb://agenticgraph-xr-v2/assets/test', sessionId: 'session-test',
      rawClipRef: 'indexeddb://agenticgraph-xr-v2/raw-clip/session-test',
      depthMetadataRef: 'indexeddb://agenticgraph-xr-v2/frame-bundle/session-test',
      rawClipSha256: `sha256:${'1'.repeat(64)}` as const,
    }),
    connectedPreviewObserved: true,
    connectedPreviewSource: Object.freeze({
      sourceDigest: 'fnv1a32:12345678', graphDataRevision: 1,
      entityRef: 'scene.hero', authoringEditRevision: 1,
    }),
    revision: 2,
  })
  const snapshot = await readySnapshot(true, MOUNTED_READY, undefined, observed)
  assert.deepEqual(snapshot.deliveryObservation, observed)
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-11')?.localEvidence, 'browser-observed')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-12')?.localEvidence, 'browser-observed')

  beginXrV2DeliveryCriterionObservation('AC-11')
  reportXrV2DeliveryCriterionObservation('AC-11', observed.packagingSource)
  const both = reportXrV2DeliveryCriterionObservation('AC-12', observed.connectedPreviewSource)
  assert.deepEqual({
    packagingObserved: both.packagingObserved,
    connectedPreviewObserved: both.connectedPreviewObserved,
  }, { packagingObserved: true, connectedPreviewObserved: true })
  const rerun = beginXrV2DeliveryCriterionObservation('AC-11')
  assert.deepEqual({
    packagingObserved: rerun.packagingObserved,
    connectedPreviewObserved: rerun.connectedPreviewObserved,
  }, { packagingObserved: false, connectedPreviewObserved: true })
  beginXrV2DeliveryCriterionObservation('AC-12')
})

test('canonical delivery evidence closes when the saved asset or authored source changes', async () => {
  const observed: XrV2DeliveryObservation = Object.freeze({
    packagingObserved: true,
    packagingSource: Object.freeze({
      assetId: 'asset-a', sessionId: 'session-a', rawClipRef: 'raw-a', depthMetadataRef: 'depth-a',
      rawClipSha256: `sha256:${'2'.repeat(64)}`,
    }),
    connectedPreviewObserved: true,
    connectedPreviewSource: Object.freeze({
      sourceDigest: 'fnv1a32:12345678', graphDataRevision: 1,
      entityRef: 'scene.hero', authoringEditRevision: 1,
    }),
    revision: 2,
  })
  const viewerB = Object.freeze({
    webXrArSavedAssetRendered: false, webXrVrSavedAssetRendered: false,
    depthParallaxAssetMounted: false, flatFallbackMounted: true,
    savedAssetRef: 'asset-b',
    savedAssetMetadata: Object.freeze({
      xr_capability_tier: 'flat-fallback' as const, synthesis_mode: 'post-process' as const,
      depth_metadata_ref: 'indexeddb://agenticgraph-xr-v2/frame-bundle/session-b', fallback_triggered: true,
    }),
    revision: 2,
  })
  const driftedAuthoring = Object.freeze({
    ...AUTHORING_READY,
    sourceDigest: 'fnv1a32:87654321',
    plan: Object.freeze({ sourceDigest: 'fnv1a32:87654321', graphDataRevision: 2 }) as XrAuthoringEcsRuntimeSnapshot['plan'],
    graphDataRevision: 2,
  })
  const snapshot = await readySnapshot(true, MOUNTED_READY, viewerB, observed, driftedAuthoring)
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-11')?.localEvidence, 'not-observed')
  assert.equal(snapshot.criteria.find(item => item.id === 'AC-12')?.localEvidence, 'not-observed')
})

test('workspace readiness deactivation resets both delivery observations', () => {
  startXrV2WorkspaceReadinessRuntime()
  reportXrV2DeliveryCriterionObservation('AC-11', {
    assetId: 'asset', sessionId: 'session', rawClipRef: 'raw', depthMetadataRef: 'depth',
    rawClipSha256: `sha256:${'1'.repeat(64)}`,
  })
  reportXrV2DeliveryCriterionObservation('AC-12', {
    sourceDigest: 'fnv1a32:12345678', graphDataRevision: 1,
    entityRef: 'scene.hero', authoringEditRevision: 1,
  })
  stopXrV2WorkspaceReadinessRuntime()
  assert.deepEqual(readXrV2WorkspaceReadiness().deliveryObservation, {
    packagingObserved: false,
    packagingSource: null,
    connectedPreviewObserved: false,
    connectedPreviewSource: null,
    revision: 0,
  })
})

test('saved viewer re-plans pseudo degradation and credits WebXR only for actual selected-asset render evidence', async () => {
  const metadata = Object.freeze({
    xr_capability_tier: 'pseudo-ar-depth-parallax' as const,
    synthesis_mode: 'live' as const,
    depth_metadata_ref: 'indexeddb://agenticgraph-xr-v2/frame-bundle/selected',
    fallback_triggered: false,
  })
  const pseudo = await readySnapshot(true, MOUNTED_READY, Object.freeze({
    webXrArSavedAssetRendered: false,
    webXrVrSavedAssetRendered: false,
    depthParallaxAssetMounted: true,
    flatFallbackMounted: false,
    savedAssetRef: 'selected:asset',
    savedAssetMetadata: metadata,
    revision: 1,
  }))
  assert.equal(pseudo.capabilityTier, 'webxr-ar')
  assert.equal(pseudo.progressiveViewer?.renderedTier, 'pseudo-ar-depth-parallax')
  assert.deepEqual(pseudo.assetMetadata, metadata)

  const degraded = await readySnapshot(true, MOUNTED_READY, Object.freeze({
    ...pseudo.viewerObservation,
    depthParallaxAssetMounted: false,
    flatFallbackMounted: true,
    revision: 2,
  }))
  assert.equal(degraded.progressiveViewer?.renderedTier, 'flat-fallback')
  assert.deepEqual(degraded.assetMetadata, metadata, 'degradation keeps exact persisted source metadata')

  const immersive = await readySnapshot(true, MOUNTED_READY, Object.freeze({
    ...pseudo.viewerObservation,
    webXrArSavedAssetRendered: true,
    revision: 3,
  }))
  assert.equal(immersive.progressiveViewer?.renderedTier, 'webxr-ar')
  assert.deepEqual(immersive.assetMetadata, metadata)
})

test('saved asset compatibility never drifts the frozen feature-probed device tier', async () => {
  const metadata = Object.freeze({
    xr_capability_tier: 'pseudo-ar-depth-parallax' as const,
    synthesis_mode: 'live' as const,
    depth_metadata_ref: 'indexeddb://agenticgraph-xr-v2/frame-bundle/frozen-tier',
    fallback_triggered: false,
  })
  const snapshot = await probeXrV2WorkspaceReadiness({
    navigator: { maxTouchPoints: 0 } as Navigator,
    viewerObservation: Object.freeze({
      webXrArSavedAssetRendered: false,
      webXrVrSavedAssetRendered: false,
      depthParallaxAssetMounted: true,
      flatFallbackMounted: false,
      savedAssetRef: 'frozen-tier:asset',
      savedAssetMetadata: metadata,
      revision: 1,
    }),
  }, { detectBrowserApis: () => Object.freeze({
    indexedDb: true, mediaCapture: false, mediaRecorder: true, webCodecs: true,
    browserVideoPlayback: true, connectedPreviewTransport: true,
  }) })
  assert.equal(snapshot.capabilityTier, 'flat-fallback')
  assert.equal(snapshot.capabilityProbe?.decision.tier, 'flat-fallback')
  assert.equal(snapshot.progressiveViewer?.renderedTier, 'pseudo-ar-depth-parallax')
  assert.deepEqual(snapshot.assetCompatibility, {
    schema: 'agenticgraph-xr-v2-saved-asset-compatibility/v1',
    status: 'compatible',
    deviceTier: 'flat-fallback',
    savedAssetRef: 'frozen-tier:asset',
    authoredTier: 'pseudo-ar-depth-parallax',
    presentationTier: 'pseudo-ar-depth-parallax',
  })

  const explicitReprobe = await probeXrV2WorkspaceReadiness({
    navigator: { maxTouchPoints: 0 } as Navigator,
    depthParallaxAssetAdmitted: true,
  }, { detectBrowserApis: () => snapshot.browserApis })
  assert.equal(explicitReprobe.capabilityTier, 'pseudo-ar-depth-parallax')
})

test('workspace readiness never promotes a failed material binding to browser evidence', async () => {
  const invalidMaterial = Object.freeze({
    ...MOUNTED_READY,
    observation: Object.freeze({
      ...MOUNTED_READY.observation!,
      meshes: Object.freeze(MOUNTED_READY.observation!.meshes.map(mesh => Object.freeze({
        ...mesh,
        bindingStatus: 'invalid' as const,
      }))),
    }),
  }) as MountedAuthoringEvidenceSnapshot
  const snapshot = await readySnapshot(true, invalidMaterial)
  const criterion = snapshot.criteria.find(item => item.id === 'AC-7')
  assert.notEqual(criterion?.localEvidence, 'browser-observed')
  assert.deepEqual(criterion?.externalEvidenceRequired, ['compiledShaderMeshRender'])
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
  assert.match(html, /data-kg-xr-v2-saved-asset-catalog="1"/)
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
  assert.match(runtimeSource, /source\.createRecorder\(source\.stream\)/)
  assert.match(runtimeSource, /recorder && recorder\.state\(\) !== 'inactive'/)
  assert.doesNotMatch(runtimeSource, /recorder\?\.state\(\) !== 'inactive'/)
  assert.match(runtimeSource, /queuedAtMs: context\.dependencies\.wallNow\(\)/)
  assert.doesNotMatch(runtimeSource, /queuedAtMs: [^\n]*postProcessJob\.queuedAtMs/)
  assert.match(motionViewSource, /configureXrV2SpatialCaptureSource/)
  assert.match(motionViewSource, /createXrV2RawClipRecorder/)
  assert.match(motionViewSource, /void cancelXrV2SpatialCapture\(\)/)
  assert.doesNotMatch(motionViewSource, /await cancelXrV2SpatialCapture\(\)/)
  assert.doesNotMatch(motionViewSource, /cancelXrV2SpatialCapture\(\)\.finally/)
  assert.match(motionViewSource, /data-kg-motion-control-stop="1"/)
})
