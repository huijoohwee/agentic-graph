import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { indexedDB } from 'fake-indexeddb'

import {
  createXrV2IndexedDbArtifactStore,
  type XrV2StoredCaptureFrame,
  type XrV2StoredCaptureFrameBundle,
} from '../xrV2CaptureArtifactStore'
import {
  createXrV2SavedAssetViewerLease,
  drawXrV2DepthParallaxFrame,
  listXrV2SavedSpatialAssets,
  loadXrV2SavedSpatialAsset,
  resolveXrV2ParallaxPoint,
  type XrV2SavedSpatialAssetResource,
} from '../xrV2SavedAssetCatalog'
import { createXrV2SavedAssetThreePresentation } from '../xrV2SavedAssetThreePresentation'
import {
  createXrV2SavedAssetImmersiveRenderGate,
  readXrV2SavedAssetPresentation,
  selectXrV2SavedAssetForPresentation,
} from '../xrV2SavedAssetPresentationRuntime'
import {
  XR_V2_SPATIAL_ASSET_METADATA_FIELDS,
  createXrV2PublishedSpatialAsset,
  createXrV2SpatialAssetMetadata,
  type XrV2PublishedSpatialAsset,
} from '../xrV2SpatialAssetMetadata'

function uniqueDatabaseName(): string {
  return `agentic-graph-xr-v2-catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('test database deletion failed'))
  })
}

function captureBundle(sessionId: string, frameCount = 1): XrV2StoredCaptureFrameBundle {
  const frames = Array.from({ length: frameCount }, (_, frameIndex) => Object.freeze({
    frameIndex,
    capturedAtMs: 1 + frameIndex * 100,
    frame: Object.freeze({
      width: 4,
      height: 1,
      data: new Uint8ClampedArray([
        10 + frameIndex, 0, 0, 255,
        50 + frameIndex, 0, 0, 255,
        100 + frameIndex, 0, 0, 255,
        200 + frameIndex, 0, 0, 255,
      ]),
    }),
    estimate: Object.freeze({
      confidence: 0.9,
      depth: Object.freeze({
        width: 4,
        height: 1,
        values: frameIndex % 2
          ? new Float32Array([1, 0.75, 0.25, 0])
          : new Float32Array([0, 0.25, 0.75, 1]),
      }),
    }),
  }))
  return Object.freeze({
    schema: 'agentic-graph-xr-v2-capture-frame-bundle/v1',
    sessionId,
    snapshot: Object.freeze({
      schema: 'agentic-graph-xr-capture-snapshot/v2',
      contractVersion: '2.0.0',
      sessionId,
      phase: 'completed',
      frameBudgetMs: 100,
      consecutiveBudgetBreachesRequired: 3,
      maxFrames: 180,
      rawFrameCount: frameCount,
      depthFrameCount: frameCount,
      synthesizedFrameCount: frameCount,
      consecutiveBudgetBreaches: 0,
      lastFrameIndex: frameCount - 1,
      fallback: null,
    }),
    frames: Object.freeze(frames),
    createdAtMs: 1_700_000_000_000,
  })
}

async function seedLiveAsset(databaseName: string): Promise<XrV2PublishedSpatialAsset> {
  const store = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  const sessionId = 'catalog-live-session'
  const rawClipRef = await store.putRawClip(sessionId, new Blob(['saved-video'], { type: 'video/webm' }))
  const depthMetadataRef = await store.putFrameBundle(captureBundle(sessionId))
  const asset = createXrV2PublishedSpatialAsset({
    assetId: `${sessionId}:asset`,
    sessionId,
    rawClipRef,
    metadata: createXrV2SpatialAssetMetadata({
      tier: 'pseudo-ar-depth-parallax',
      synthesisMode: 'live',
      depthMetadataRef,
      fallbackTriggered: false,
    }),
    createdAtMs: 1_700_000_000_000,
  })
  await store.putPublishedSpatialAsset(asset)
  store.close()
  return asset
}

test('persisted spatial asset catalog validates, enumerates, and loads blobs + frames after reload', async () => {
  const databaseName = uniqueDatabaseName()
  const asset = await seedLiveAsset(databaseName)
  const reader = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  const catalog = await listXrV2SavedSpatialAssets(reader)
  assert.deepEqual(catalog, [asset])
  assert.deepEqual(Object.keys(catalog[0].metadata), [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS])
  const loaded = await loadXrV2SavedSpatialAsset(reader, asset.asset_id)
  assert.equal(await loaded.rawClip.text(), 'saved-video')
  assert.equal(loaded.frameBundle?.sessionId, asset.session_id)
  assert.equal(loaded.depthFrame?.estimate?.depth.values[3], 1)
  assert.deepEqual(loaded.asset.metadata, asset.metadata)
  reader.close()
  await deleteDatabase(databaseName)
})

function fakeCanvas(connected = true) {
  let rendered = new Uint8ClampedArray()
  const context = {
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (image: ImageData) => { rendered = image.data.slice() },
  }
  const canvas = {
    width: 0,
    height: 0,
    isConnected: connected,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 100, height: 50 }),
  } as unknown as HTMLCanvasElement
  return Object.freeze({ canvas, rendered: () => rendered })
}

test('persisted RGBA + depth data draws connected pointer-driven parallax and rejects detached canvas', () => {
  const frame = captureBundle('draw-session').frames[0] as XrV2StoredCaptureFrame
  const target = fakeCanvas()
  assert.deepEqual(resolveXrV2ParallaxPoint(target.canvas, 110, 45), { x: 1, y: 0 })
  assert.equal(drawXrV2DepthParallaxFrame(target.canvas, frame, { x: -1, y: 0 }), true)
  const left = target.rendered()
  assert.equal(drawXrV2DepthParallaxFrame(target.canvas, frame, { x: 1, y: 0 }), true)
  assert.notDeepEqual(target.rendered(), left)
  assert.equal(drawXrV2DepthParallaxFrame(fakeCanvas(false).canvas, frame, { x: 0, y: 0 }), false)
})

function resource(tier: 'pseudo-ar-depth-parallax' | 'flat-fallback'): XrV2SavedSpatialAssetResource {
  const bundle = captureBundle(`${tier}-session`, 2)
  const metadata = createXrV2SpatialAssetMetadata({
    tier,
    synthesisMode: tier === 'flat-fallback' ? 'post-process' : 'live',
    depthMetadataRef: `indexeddb://agentic-graph-xr-v2/frame-bundle/${tier}-session`,
    fallbackTriggered: tier === 'flat-fallback',
  })
  return Object.freeze({
    asset: createXrV2PublishedSpatialAsset({
      assetId: `${tier}:asset`,
      sessionId: `${tier}-session`,
      rawClipRef: `indexeddb://agentic-graph-xr-v2/raw-clip/${tier}-session`,
      metadata,
      createdAtMs: 1,
    }),
    rawClip: new Blob(['video'], { type: 'video/webm' }),
    frameBundle: bundle,
    depthFrame: tier === 'pseudo-ar-depth-parallax' ? bundle.frames[0] : null,
  })
}

test('viewer leases credit only real tier evidence and revoke/demote with asset identity', () => {
  const observations: Array<Record<string, unknown>> = []
  const revoked: string[] = []
  let createdUrls = 0
  const dependencies = {
    createObjectUrl: () => { createdUrls += 1; return `blob:flat-${createdUrls}` },
    revokeObjectUrl: (url: string) => revoked.push(url),
    reportObservation: (observation: Record<string, unknown>) => observations.push(observation),
  }

  const pseudo = createXrV2SavedAssetViewerLease(resource('pseudo-ar-depth-parallax'), dependencies)
  assert.equal(pseudo.playbackUrl, null)
  assert.equal(pseudo.markFlatPlaybackCanPlay(), false, 'raw video cannot credit pseudo depth evidence')
  assert.equal(pseudo.markDepthParallaxDraw(false, true, 0, 1), false)
  assert.equal(pseudo.markDepthParallaxDraw(true, true, 0, 1), false, 'one attached draw is not temporal evidence')
  assert.equal(pseudo.markDepthParallaxDraw(true, true, 1, 101), true)
  pseudo.release()
  pseudo.release()
  assert.equal(createdUrls, 0, 'pseudo viewer never creates a raw-video playback URL')

  const flat = createXrV2SavedAssetViewerLease(resource('flat-fallback'), dependencies)
  assert.equal(flat.playbackUrl, 'blob:flat-1')
  assert.equal(flat.markDepthParallaxDraw(true, true, 0, 1), false)
  assert.equal(flat.markFlatPlaybackCanPlay(), false, 'canplay alone is not temporal evidence')
  assert.equal(flat.markFlatPlaybackProgress(true, 0), false)
  assert.equal(flat.markFlatPlaybackProgress(true, 20), true)
  flat.release()
  assert.deepEqual(revoked, ['blob:flat-1'])
  assert.deepEqual(observations.map(value => ({
    assetRef: value.assetRef,
    tier: value.tier,
    mounted: value.mounted,
    metadataKeys: Object.keys(value.metadata as object),
  })), [
    { assetRef: 'pseudo-ar-depth-parallax:asset', tier: 'pseudo-ar-depth-parallax', mounted: true, metadataKeys: [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS] },
    { assetRef: 'pseudo-ar-depth-parallax:asset', tier: 'pseudo-ar-depth-parallax', mounted: false, metadataKeys: [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS] },
    { assetRef: 'flat-fallback:asset', tier: 'flat-fallback', mounted: true, metadataKeys: [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS] },
    { assetRef: 'flat-fallback:asset', tier: 'flat-fallback', mounted: false, metadataKeys: [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS] },
  ])
})

test('missing depth or parallax adapter degrades a pseudo asset to revocable raw flat playback', () => {
  const degraded = Object.freeze({
    ...resource('pseudo-ar-depth-parallax'),
    frameBundle: null,
    depthFrame: null,
  })
  const observations: Array<Record<string, unknown>> = []
  const revoked: string[] = []
  const lease = createXrV2SavedAssetViewerLease(degraded, {
    createObjectUrl: () => 'blob:degraded-pseudo',
    revokeObjectUrl: url => revoked.push(url),
    reportObservation: value => observations.push(value as unknown as Record<string, unknown>),
  })
  assert.equal(lease.presentationTier, 'flat-fallback')
  assert.equal(lease.markDepthParallaxDraw(true, true, 0, 1), false)
  assert.equal(lease.markFlatPlaybackCanPlay(), false)
  assert.equal(lease.markFlatPlaybackProgress(true, 0), false)
  assert.equal(lease.markFlatPlaybackProgress(true, 10), true)
  lease.release()
  assert.deepEqual(observations.map(value => ({ tier: value.tier, mounted: value.mounted })), [
    { tier: 'flat-fallback', mounted: true },
    { tier: 'flat-fallback', mounted: false },
  ])
  assert.deepEqual(revoked, ['blob:degraded-pseudo'])
})

test('selected asset identity reaches the textured XR surface and only a later connected render credits WebXR', () => {
  const selected = resource('pseudo-ar-depth-parallax')
  const releaseSelection = selectXrV2SavedAssetForPresentation(selected)
  assert.equal(readXrV2SavedAssetPresentation().selected?.asset.asset_id, selected.asset.asset_id)
  const surface = createXrV2SavedAssetThreePresentation(selected)
  assert.ok(surface)
  assert.equal(surface.depthDisplaced, true)
  assert.equal(surface.texture.image.width, selected.depthFrame?.frame.width)
  const observations: Array<Record<string, unknown>> = []
  const gate = createXrV2SavedAssetImmersiveRenderGate({
    resource: selected,
    mode: 'immersive-ar',
    baselineRenderFrame: 7,
    reportObservation: value => observations.push(value as unknown as Record<string, unknown>),
  })
  assert.equal(gate.observe({
    selectedAssetId: selected.asset.asset_id,
    mode: 'immersive-ar',
    canvasConnected: true,
    textureBound: true,
    renderFrame: 7,
    frameIndex: 0,
    capturedAtMs: 1,
  }), false, 'session/mount without a completed render is not evidence')
  assert.equal(gate.observe({
    selectedAssetId: 'another-asset',
    mode: 'immersive-ar',
    canvasConnected: true,
    textureBound: true,
    renderFrame: 8,
    frameIndex: 0,
    capturedAtMs: 1,
  }), false)
  assert.equal(gate.observe({
    selectedAssetId: selected.asset.asset_id,
    mode: 'immersive-ar',
    canvasConnected: true,
    textureBound: true,
    renderFrame: 8,
    frameIndex: 0,
    capturedAtMs: 1,
  }), false, 'the first attached persisted frame is not temporal advancement')
  assert.equal(gate.observe({
    selectedAssetId: selected.asset.asset_id,
    mode: 'immersive-ar',
    canvasConnected: true,
    textureBound: true,
    renderFrame: 9,
    frameIndex: 1,
    capturedAtMs: 101,
  }), true)
  gate.release()
  assert.deepEqual(observations.map(value => ({
    assetRef: value.assetRef,
    mode: value.mode,
    mounted: value.mounted,
  })), [
    { assetRef: selected.asset.asset_id, mode: 'immersive-ar', mounted: true },
    { assetRef: selected.asset.asset_id, mode: 'immersive-ar', mounted: false },
  ])
  surface.release()
  surface.geometry.dispose()
  surface.material.dispose()
  surface.texture.dispose()
  releaseSelection()
  assert.equal(readXrV2SavedAssetPresentation().selected, null)
  const mountedScene = readFileSync(new URL('../XrV2MountedAuthoringScene.tsx', import.meta.url), 'utf8')
  assert.match(mountedScene, /<XrV2SavedAssetImmersiveSurface\s*\/>/u)
})
