import assert from 'node:assert/strict'
import { test } from 'node:test'
import { indexedDB } from 'fake-indexeddb'

import { createXrV2CaptureFallbackPersister } from '../spatialCapturePostProcess'
import {
  createXrV2IndexedDbArtifactStore,
  preflightXrV2IndexedDbArtifactStore,
} from '../xrV2CaptureArtifactStore'
import {
  XR_V2_SPATIAL_ASSET_METADATA_FIELDS,
  createXrV2PublishedSpatialAsset,
  createXrV2SpatialAssetMetadata,
} from '../xrV2SpatialAssetMetadata'
import { XR_V2_POST_PROCESS_LEASE_MS } from '../xrV2PostProcessStoreContract'

function uniqueDatabaseName(label: string): string {
  return `knowgrph-xr-v2-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function deleteDatabase(databaseName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('test database deletion failed'))
    request.onblocked = () => reject(new Error('test database deletion was blocked'))
  })
}

test('real IndexedDB preflight and reload preserve the exact live asset metadata contract', async () => {
  const databaseName = uniqueDatabaseName('live')
  await preflightXrV2IndexedDbArtifactStore({ indexedDB, databaseName, timeoutMs: 500 })
  const metadata = createXrV2SpatialAssetMetadata({
    tier: 'pseudo-ar-depth-parallax',
    synthesisMode: 'live',
    depthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/live-session',
    fallbackTriggered: false,
  })
  const asset = createXrV2PublishedSpatialAsset({
    assetId: 'live-session:asset',
    sessionId: 'live-session',
    rawClipRef: 'indexeddb://knowgrph-xr-v2/raw-clip/live-session',
    metadata,
    createdAtMs: 1_700_000_000_000,
  })
  const writer = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  await writer.putPublishedSpatialAsset(asset)
  writer.close()

  const reader = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  const reloaded = await reader.readPublishedSpatialAsset(asset.asset_id)
  assert.deepEqual(reloaded, asset)
  assert.deepEqual(Object.keys(reloaded!.metadata), [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS])
  assert.deepEqual(await reader.listPublishedSpatialAssets(), [asset])
  reader.close()
  await deleteDatabase(databaseName)
})

test('fallback transaction durably commits exact metadata and compensation is idempotent', async () => {
  const databaseName = uniqueDatabaseName('fallback')
  const writer = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  const persisted = await createXrV2CaptureFallbackPersister({ persistence: writer }).persist({
    idempotencyKey: 'fallback-session:fallback',
    sessionId: 'fallback-session',
    flatAssetId: 'fallback-session:asset',
    jobId: 'fallback-session:post-process:1',
    rawClipRef: 'indexeddb://knowgrph-xr-v2/raw-clip/fallback-session',
    rawClipMimeType: 'video/webm',
    rawClipByteLength: 4,
    depthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/fallback-session',
    queuedAtMs: 1_700_000_000_001,
    fallback: {
      triggeredAtFrameIndex: 1,
      observedDurationMs: 101,
      reason: 'budget-breach',
    },
  })
  assert.equal(persisted.outcome, 'inserted')
  writer.close()

  const reader = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  const reloaded = await reader.readPublishedSpatialAsset('fallback-session:asset')
  assert.deepEqual(Object.keys(reloaded!.metadata), [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS])
  assert.deepEqual(reloaded!.metadata, {
    xr_capability_tier: 'flat-fallback',
    synthesis_mode: 'post-process',
    depth_metadata_ref: 'indexeddb://knowgrph-xr-v2/frame-bundle/fallback-session',
    fallback_triggered: true,
  })
  const keys = {
    rawClipRef: 'indexeddb://knowgrph-xr-v2/raw-clip/fallback-session',
    depthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/fallback-session',
    spatialAssetId: 'fallback-session:asset',
    fallback: {
      flatAssetId: 'fallback-session:asset',
      jobId: 'fallback-session:post-process:1',
      idempotencyKey: 'fallback-session:fallback',
    },
  } as const
  await reader.deleteCapturePersistence(keys)
  await reader.deleteCapturePersistence(keys)
  assert.equal(await reader.readPublishedSpatialAsset(keys.spatialAssetId), null)
  assert.equal(await reader.readFlatAsset(keys.fallback.flatAssetId), null)
  assert.equal(await reader.readPostProcessJob(keys.fallback.jobId), null)
  reader.close()
  await deleteDatabase(databaseName)
})

test('IndexedDB crash leases persist across store remount and expire into one fenced reclaim', async () => {
  const databaseName = uniqueDatabaseName('crash-lease')
  const firstStore = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  await createXrV2CaptureFallbackPersister({ persistence: firstStore }).persist({
    idempotencyKey: 'crash-lease:fallback',
    sessionId: 'crash-lease',
    flatAssetId: 'crash-lease:asset',
    jobId: 'crash-lease:post-process:1',
    rawClipRef: 'indexeddb://knowgrph-xr-v2/raw-clip/crash-lease',
    rawClipMimeType: 'video/webm',
    rawClipByteLength: 4,
    depthMetadataRef: 'indexeddb://knowgrph-xr-v2/frame-bundle/crash-lease',
    queuedAtMs: 100,
    fallback: { triggeredAtFrameIndex: 0, observedDurationMs: 101, reason: 'budget-breach' },
  })
  const crashedClaim = await firstStore.claimNextQueuedPostProcessJob(200, 'lease:crashed')
  assert.equal(crashedClaim?.status, 'running')
  const abandonedContainerRef = await firstStore.putStereoContainer(
    crashedClaim!.leaseId!, new Blob(['abandoned-stereo'], { type: 'video/webm' }),
  )
  assert.ok(await firstStore.readBlob(abandonedContainerRef))
  firstStore.close()

  const remounted = createXrV2IndexedDbArtifactStore({ indexedDB, databaseName })
  assert.equal(await remounted.claimNextQueuedPostProcessJob(
    200 + XR_V2_POST_PROCESS_LEASE_MS - 1, 'lease:too-early',
  ), null)
  const reclaimed = await remounted.claimNextQueuedPostProcessJob(
    200 + XR_V2_POST_PROCESS_LEASE_MS, 'lease:remounted',
  )
  assert.equal(reclaimed?.leaseId, 'lease:remounted')
  assert.equal(reclaimed?.attempts, 1)
  assert.equal(await remounted.readBlob(abandonedContainerRef), null)
  await assert.rejects(
    remounted.failPostProcessJob(crashedClaim!, 'stale owner', 500),
    /lost its lease/,
  )
  await remounted.releasePostProcessJob(reclaimed!, 501)
  assert.equal((await remounted.readPostProcessJob(reclaimed!.job.jobId))?.status, 'queued')
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(
    remounted.claimNextQueuedPostProcessJob(502, 'lease:cancelled', aborted.signal),
    error => error instanceof DOMException && error.name === 'AbortError',
  )
  assert.equal((await remounted.readPostProcessJob(reclaimed!.job.jobId))?.status, 'queued')
  assert.equal('completePostProcessJob' in remounted, false)
  remounted.close()
  await deleteDatabase(databaseName)
})
