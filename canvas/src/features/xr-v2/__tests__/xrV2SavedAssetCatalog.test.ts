import assert from 'node:assert/strict'
import { test } from 'node:test'
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
import {
  XR_V2_SPATIAL_ASSET_METADATA_FIELDS,
  createXrV2PublishedSpatialAsset,
  createXrV2SpatialAssetMetadata,
  type XrV2PublishedSpatialAsset,
} from '../xrV2SpatialAssetMetadata'

function uniqueDatabaseName(): string {
  return `knowgrph-xr-v2-catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('test database deletion failed'))
  })
}

function captureBundle(sessionId: string): XrV2StoredCaptureFrameBundle {
  return Object.freeze({
    schema: 'knowgrph-xr-v2-capture-frame-bundle/v1',
    sessionId,
    snapshot: Object.freeze({
      schema: 'knowgrph-xr-capture-snapshot/v2',
      contractVersion: '2.0.0',
      sessionId,
      phase: 'completed',
      frameBudgetMs: 100,
      consecutiveBudgetBreachesRequired: 3,
      maxFrames: 180,
      rawFrameCount: 1,
      depthFrameCount: 1,
      synthesizedFrameCount: 1,
      consecutiveBudgetBreaches: 0,
      lastFrameIndex: 0,
      fallback: null,
    }),
    frames: [Object.freeze({
      frameIndex: 0,
      capturedAtMs: 1,
      frame: Object.freeze({
        width: 4,
        height: 1,
        data: new Uint8ClampedArray([
          10, 0, 0, 255,
          50, 0, 0, 255,
          100, 0, 0, 255,
          200, 0, 0, 255,
        ]),
      }),
      estimate: Object.freeze({
        confidence: 0.9,
        depth: Object.freeze({ width: 4, height: 1, values: new Float32Array([0, 0.25, 0.75, 1]) }),
      }),
    })],
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
  assert.equal(loaded.frameBundle.sessionId, asset.session_id)
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
  const bundle = captureBundle(`${tier}-session`)
  const metadata = createXrV2SpatialAssetMetadata({
    tier,
    synthesisMode: tier === 'flat-fallback' ? 'post-process' : 'live',
    depthMetadataRef: `indexeddb://knowgrph-xr-v2/frame-bundle/${tier}-session`,
    fallbackTriggered: tier === 'flat-fallback',
  })
  return Object.freeze({
    asset: createXrV2PublishedSpatialAsset({
      assetId: `${tier}:asset`,
      sessionId: `${tier}-session`,
      rawClipRef: `indexeddb://knowgrph-xr-v2/raw-clip/${tier}-session`,
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
  assert.equal(pseudo.markDepthParallaxDraw(false, true), false)
  assert.equal(pseudo.markDepthParallaxDraw(true, true), true)
  pseudo.release()
  pseudo.release()
  assert.equal(createdUrls, 0, 'pseudo viewer never creates a raw-video playback URL')

  const flat = createXrV2SavedAssetViewerLease(resource('flat-fallback'), dependencies)
  assert.equal(flat.playbackUrl, 'blob:flat-1')
  assert.equal(flat.markDepthParallaxDraw(true, true), false)
  assert.equal(flat.markFlatPlaybackCanPlay(), true)
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
