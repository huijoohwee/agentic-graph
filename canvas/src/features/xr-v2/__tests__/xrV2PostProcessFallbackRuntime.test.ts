import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  createXrV2MemoryArtifactStore,
  type XrV2CaptureArtifactStore,
  type XrV2StoredCaptureFrameBundle,
  type XrV2StoredPostProcessJob,
} from '../xrV2CaptureArtifactStore'
import {
  XR_V2_DEPTH_MODEL_MANIFEST,
  type XrV2DepthInferenceSnapshot,
  type XrV2LocalDepthInferenceAdapter,
} from '../xrV2DepthInferenceRuntime'
import {
  installXrV2PostProcessFallbackRuntimeTestDefaults,
  readXrV2PostProcessFallback,
  requestXrV2PostProcessFallbackScan,
  startXrV2PostProcessFallbackRuntime,
  stopXrV2PostProcessFallbackRuntime,
} from '../xrV2PostProcessFallbackLifecycle'
import { runXrV2PostProcessFallbackPass } from '../xrV2PostProcessFallbackRuntime'
import { loadXrV2SavedSpatialAsset } from '../xrV2SavedAssetCatalog'
import { resolveXrV2SavedAssetRgbaTracks } from '../xrV2SavedAssetPackagingRuntime'
import { createXrV2CaptureFallbackPersister } from '../spatialCapturePostProcess'
import { XR_V2_SPATIAL_ASSET_METADATA_FIELDS } from '../xrV2SpatialAssetMetadata'
import { XR_V2_POST_PROCESS_LEASE_MS } from '../xrV2PostProcessStoreContract'

const FALLBACK = Object.freeze({
  triggeredAtFrameIndex: 0,
  observedDurationMs: 101,
  reason: 'budget-breach' as const,
})

function frameBundle(sessionId: string, count = 4): XrV2StoredCaptureFrameBundle {
  return Object.freeze({
    schema: 'agenticgraph-xr-v2-capture-frame-bundle/v1',
    sessionId,
    snapshot: Object.freeze({
      schema: 'agenticgraph-xr-capture-snapshot/v2',
      contractVersion: '2.0.0',
      sessionId,
      phase: 'capturing-raw',
      frameBudgetMs: 100,
      consecutiveBudgetBreachesRequired: 3,
      maxFrames: 180,
      rawFrameCount: count,
      depthFrameCount: 0,
      synthesizedFrameCount: 0,
      consecutiveBudgetBreaches: 3,
      lastFrameIndex: count - 1,
      fallback: FALLBACK,
    }),
    frames: Object.freeze(Array.from({ length: count }, (_, frameIndex) => Object.freeze({
      frameIndex,
      capturedAtMs: frameIndex + 1,
      frame: Object.freeze({
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([frameIndex, 10, 20, 255, 30, 40, 50, 255]),
      }),
      estimate: null,
    }))),
    createdAtMs: 90,
  })
}

async function seedFallback(
  store: XrV2CaptureArtifactStore,
  sessionId: string,
  admitted = true,
  count = 4,
) {
  const raw = new Blob([`raw-${sessionId}`], { type: 'video/webm' })
  const rawClipRef = await store.putRawClip(sessionId, raw)
  const depthMetadataRef = await store.putFrameBundle(frameBundle(sessionId, count))
  const assetId = `${sessionId}:asset`
  const jobId = `${sessionId}:post-process:1`
  await createXrV2CaptureFallbackPersister({ persistence: store }).persist({
    idempotencyKey: `${sessionId}:fallback`,
    sessionId,
    flatAssetId: assetId,
    jobId,
    rawClipRef,
    rawClipMimeType: raw.type,
    rawClipByteLength: raw.size,
    depthMetadataRef,
    queuedAtMs: 100,
    fallback: FALLBACK,
    admittedDepthModel: admitted ? XR_V2_DEPTH_MODEL_MANIFEST : null,
  })
  return Object.freeze({ sessionId, raw, rawClipRef, depthMetadataRef, assetId, jobId, count })
}

function readySnapshot(): XrV2DepthInferenceSnapshot {
  return Object.freeze({
    phase: 'ready',
    modelId: XR_V2_DEPTH_MODEL_MANIFEST.modelId,
    revision: XR_V2_DEPTH_MODEL_MANIFEST.revision,
    sameOriginPath: XR_V2_DEPTH_MODEL_MANIFEST.sameOriginPath,
    remoteFallbackAllowed: false,
    inferenceCount: 0,
    error: null,
  })
}

function depthAdapter(observed: number[], disposed: () => void): XrV2LocalDepthInferenceAdapter {
  return Object.freeze({
    prepare: async () => readySnapshot(),
    snapshot: readySnapshot,
    subscribe: () => () => undefined,
    estimate: async input => {
      observed.push(input.frameIndex)
      return Object.freeze({
        confidence: 0.75,
        depth: Object.freeze({
          width: input.frame.width,
          height: input.frame.height,
          values: new Float32Array([input.frameIndex / 10, 1]),
        }),
      })
    },
    dispose: async () => disposed(),
  })
}

function clock(start = 200) {
  let value = start
  return () => { value += 1; return value }
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

async function waitForJobStatus(
  store: XrV2CaptureArtifactStore,
  jobId: string,
  status: 'queued' | 'running' | 'completed' | 'failed',
): Promise<void> {
  const deadline = Date.now() + 1_000
  while ((await store.readPostProcessJob(jobId))?.status !== status) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for job status ${status}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

test('one admitted pass infers every frame, persists stereo output, and atomically promotes exact metadata', async () => {
  const store = createXrV2MemoryArtifactStore()
  const seeded = await seedFallback(store, 'post-process-success', true, 6)
  const inferred: number[] = []
  let disposed = 0
  let claims = 0
  const events: Array<{ phase: string; processedFrames: number }> = []
  const instrumented = Object.freeze({
    ...store,
    claimNextQueuedPostProcessJob: async (nowMs?: number) => {
      claims += 1
      return store.claimNextQueuedPostProcessJob(nowMs)
    },
  })
  const result = await runXrV2PostProcessFallbackPass({
    store: instrumented,
    createDepthAdapter: () => depthAdapter(inferred, () => { disposed += 1 }),
    packageStereo: async resource => {
      assert.equal(resource.frameBundle?.frames.length, seeded.count)
      assert.equal(resource.frameBundle?.frames.every(frame => frame.estimate !== null), true)
      const tracks = resolveXrV2SavedAssetRgbaTracks(resource)
      assert.deepEqual(tracks.map(track => track.length), [seeded.count, seeded.count])
      return { blob: new Blob(['two-track-webm'], { type: 'video/webm' }), trackCount: 2 }
    },
    now: clock(),
  }, value => events.push(value))

  assert.equal(result.phase, 'completed')
  assert.equal(claims, 1)
  assert.deepEqual(inferred, [0, 1, 2, 3, 4, 5])
  assert.equal(disposed, 1)
  assert.deepEqual(events.filter(value => value.phase === 'processing')
    .map(value => value.processedFrames), [1, 2, 3, 4, 5, 6])
  const job = await store.readPostProcessJob(seeded.jobId)
  assert.equal(job?.status, 'completed')
  assert.equal(job?.attempts, 1)
  assert.equal(job?.output?.trackCount, 2)
  assert.equal(await (await store.readBlob(job!.output!.containerRef))?.text(), 'two-track-webm')
  const asset = await store.readPublishedSpatialAsset(seeded.assetId)
  assert.equal(asset?.raw_clip_ref, seeded.rawClipRef, 'the raw source reference remains immutable')
  assert.deepEqual(Object.keys(asset!.metadata), [...XR_V2_SPATIAL_ASSET_METADATA_FIELDS])
  assert.deepEqual(asset?.metadata, {
    xr_capability_tier: 'pseudo-ar-depth-parallax',
    synthesis_mode: 'post-process',
    depth_metadata_ref: seeded.depthMetadataRef,
    fallback_triggered: true,
  })
  const loaded = await loadXrV2SavedSpatialAsset(store, seeded.assetId)
  assert.equal(await loaded.rawClip.text(), await seeded.raw.text())
  assert.ok(loaded.depthFrame?.estimate)
  assert.equal(loaded.frameBundle?.frames.every(frame => frame.estimate !== null), true)
})

test('blocked model state is typed degraded-flat without creating an adapter or packager', async () => {
  const store = createXrV2MemoryArtifactStore()
  const seeded = await seedFallback(store, 'post-process-blocked', false)
  const result = await runXrV2PostProcessFallbackPass({
    store,
    createDepthAdapter: () => { throw new Error('adapter must not be created') },
    packageStereo: async () => { throw new Error('packager must not run') },
    now: clock(),
  })
  assert.equal(result.phase, 'degraded-flat')
  assert.equal(result.reason, 'no-admitted-depth-model')
  assert.equal((await store.readPostProcessJob(seeded.jobId))?.status, 'failed')
  assert.equal((await store.readPublishedSpatialAsset(seeded.assetId))?.metadata.xr_capability_tier, 'flat-fallback')
})

test('source drift and atomic publication failure both fail closed without pseudo metadata', async t => {
  await t.test('raw inventory drift prevents inference', async () => {
    const store = createXrV2MemoryArtifactStore()
    const seeded = await seedFallback(store, 'post-process-drift')
    await store.putRawClip(seeded.sessionId, new Blob(['changed'], { type: 'video/webm' }))
    const inferred: number[] = []
    const result = await runXrV2PostProcessFallbackPass({
      store,
      createDepthAdapter: () => depthAdapter(inferred, () => undefined),
      packageStereo: async () => ({ blob: new Blob(['never'], { type: 'video/webm' }), trackCount: 2 }),
      now: clock(),
    })
    assert.equal(result.phase, 'failed')
    assert.match(result.error || '', /raw fallback does not match/)
    assert.deepEqual(inferred, [])
    assert.equal((await store.readPublishedSpatialAsset(seeded.assetId))?.metadata.xr_capability_tier, 'flat-fallback')
  })

  await t.test('failed atomic commit never overwrites the authoritative frame bundle', async () => {
    const base = createXrV2MemoryArtifactStore()
    const seeded = await seedFallback(base, 'post-process-atomic-failure')
    let temporaryContainerRef: string | null = null
    const failing = Object.freeze({
      ...base,
      putStereoContainer: async (id: string, blob: Blob, signal?: AbortSignal) => {
        temporaryContainerRef = await base.putStereoContainer(id, blob, signal)
        return temporaryContainerRef
      },
      completePostProcessJobAndPublishAssetAtomically: async () => { throw new Error('atomic commit rejected') },
    })
    const result = await runXrV2PostProcessFallbackPass({
      store: failing,
      createDepthAdapter: () => depthAdapter([], () => undefined),
      packageStereo: async () => ({ blob: new Blob(['stereo'], { type: 'video/webm' }), trackCount: 2 }),
      now: clock(),
    })
    assert.equal(result.phase, 'failed')
    assert.equal((await base.readPostProcessJob(seeded.jobId))?.status, 'failed')
    assert.equal((await base.readPublishedSpatialAsset(seeded.assetId))?.metadata.xr_capability_tier, 'flat-fallback')
    assert.equal((await base.readFrameBundle(seeded.depthMetadataRef))?.frames.every(frame => frame.estimate === null), true)
    assert.ok(temporaryContainerRef)
    assert.notEqual(temporaryContainerRef, 'indexeddb://agenticgraph-xr-v2/stereo-container/post-process-atomic-failure')
    assert.equal(await base.readBlob(temporaryContainerRef!), null, 'the immutable temporary container is compensated')
  })
})

test('expired persisted leases are reclaimed as the same logical attempt and stale owners are fenced', async () => {
  const store = createXrV2MemoryArtifactStore()
  const seeded = await seedFallback(store, 'post-process-crash-reclaim')
  const first = await store.claimNextQueuedPostProcessJob(1_000, 'lease:first')
  assert.equal(first?.status, 'running')
  assert.equal(first?.attempts, 1)
  const abandonedContainerRef = await store.putStereoContainer(
    first!.leaseId!, new Blob(['abandoned-stereo'], { type: 'video/webm' }),
  )
  assert.ok(await store.readBlob(abandonedContainerRef))
  assert.equal(await store.claimNextQueuedPostProcessJob(
    1_000 + XR_V2_POST_PROCESS_LEASE_MS - 1, 'lease:early',
  ), null)
  assert.ok(await store.readBlob(abandonedContainerRef))
  const reclaimed = await store.claimNextQueuedPostProcessJob(
    1_000 + XR_V2_POST_PROCESS_LEASE_MS, 'lease:reclaimed',
  )
  assert.equal(reclaimed?.job.jobId, seeded.jobId)
  assert.equal(reclaimed?.attempts, 1)
  assert.equal(reclaimed?.leaseId, 'lease:reclaimed')
  assert.equal(await store.readBlob(abandonedContainerRef), null)
  await assert.rejects(
    store.failPostProcessJob(first!, 'stale crash owner', 2_000),
    /lost its lease/,
  )
  assert.equal((await store.readPostProcessJob(seeded.jobId))?.leaseId, 'lease:reclaimed')
  await store.releasePostProcessJob(reclaimed!, 2_001)
  const resumed = await store.claimNextQueuedPostProcessJob(2_002, 'lease:resumed')
  assert.equal(resumed?.attempts, 1)
  assert.equal(resumed?.leaseId, 'lease:resumed')
  const releasedContainerRef = await store.putStereoContainer(
    resumed!.leaseId!, new Blob(['released-stereo'], { type: 'video/webm' }),
  )
  await store.releasePostProcessJob(resumed!, 2_003)
  assert.equal(await store.readBlob(releasedContainerRef), null)
  assert.equal('completePostProcessJob' in store, false)
})

test('abort reconciles a claim that becomes visible after the pass cancellation boundary', async () => {
  const base = createXrV2MemoryArtifactStore()
  const seeded = await seedFallback(base, 'post-process-late-claim')
  const controller = new AbortController()
  let claimCommitted!: () => void
  let returnClaim!: () => void
  const committed = new Promise<void>(resolve => { claimCommitted = resolve })
  const gate = new Promise<void>(resolve => { returnClaim = resolve })
  const store = Object.freeze({
    ...base,
    claimNextQueuedPostProcessJob: async (nowMs?: number) => {
      const claimed = await base.claimNextQueuedPostProcessJob(nowMs, 'lease:late')
      claimCommitted()
      await gate
      return claimed
    },
  })
  const pass = runXrV2PostProcessFallbackPass({
    store,
    createDepthAdapter: () => depthAdapter([], () => undefined),
    packageStereo: async () => ({ blob: new Blob(['unused'], { type: 'video/webm' }), trackCount: 2 }),
    signal: controller.signal,
    now: clock(4_000),
  })
  await committed
  assert.equal((await base.readPostProcessJob(seeded.jobId))?.status, 'running')
  controller.abort()
  returnClaim()
  await pass
  assert.equal((await base.readPostProcessJob(seeded.jobId))?.status, 'queued')
})

test('mounted lifecycle drains the bounded persisted queue, accepts saved-job notification, and fences unmount state', async () => {
  stopXrV2PostProcessFallbackRuntime()
  const base = createXrV2MemoryArtifactStore()
  const first = await seedFallback(base, 'post-process-mount-1', false)
  const second = await seedFallback(base, 'post-process-mount-2', false)
  let claims = 0
  const failedJobs: string[] = []
  const store = Object.freeze({
    ...base,
    claimNextQueuedPostProcessJob: async (nowMs?: number) => {
      claims += 1
      return base.claimNextQueuedPostProcessJob(nowMs)
    },
    failPostProcessJob: async (claimed: XrV2StoredPostProcessJob, error: string, nowMs?: number) => {
      await base.failPostProcessJob(claimed, error, nowMs)
      failedJobs.push(claimed.job.jobId)
    },
  })
  const restore = installXrV2PostProcessFallbackRuntimeTestDefaults({
    createStore: () => store,
    createDepthAdapter: () => { throw new Error('blocked jobs do not create adapters') },
    packageStereo: async () => { throw new Error('blocked jobs do not package') },
    now: clock(),
  })
  try {
    startXrV2PostProcessFallbackRuntime()
    await waitFor(() => failedJobs.length === 2, 'initial mounted queue drain')
    await waitFor(() => claims === 3, 'bounded drain empty-queue proof')
    assert.deepEqual(failedJobs, [first.jobId, second.jobId])
    assert.equal((await base.readPostProcessJob(first.jobId))?.status, 'failed')
    assert.equal((await base.readPostProcessJob(second.jobId))?.status, 'failed')
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(claims, 3, 'mounted runtime stops after the empty-queue proof')
    const third = await seedFallback(base, 'post-process-mount-3', false)
    requestXrV2PostProcessFallbackScan()
    await waitFor(() => failedJobs.includes(third.jobId), 'saved capture scan')
    await waitFor(() => claims === 5, 'saved capture empty-queue proof')
    stopXrV2PostProcessFallbackRuntime()
    assert.equal(readXrV2PostProcessFallback().reason, 'runtime-stopped')
  } finally {
    stopXrV2PostProcessFallbackRuntime()
    restore()
  }
})

test('unmount releases an in-flight lease and remount resumes the persisted job', async () => {
  stopXrV2PostProcessFallbackRuntime()
  const store = createXrV2MemoryArtifactStore()
  const seeded = await seedFallback(store, 'post-process-remount-resume')
  let adapterCount = 0
  const restore = installXrV2PostProcessFallbackRuntimeTestDefaults({
    createStore: () => store,
    createDepthAdapter: () => {
      adapterCount += 1
      const ready = depthAdapter([], () => undefined)
      return adapterCount === 1
        ? Object.freeze({
          ...ready,
          prepare: () => new Promise<XrV2DepthInferenceSnapshot>(() => undefined),
        })
        : ready
    },
    packageStereo: async () => ({ blob: new Blob(['resumed-stereo'], { type: 'video/webm' }), trackCount: 2 }),
    now: clock(3_000),
  })
  try {
    startXrV2PostProcessFallbackRuntime()
    await waitFor(() => readXrV2PostProcessFallback().phase === 'preparing', 'claimed pre-unmount job')
    stopXrV2PostProcessFallbackRuntime()
    await waitForJobStatus(store, seeded.jobId, 'queued')
    assert.equal((await store.readPostProcessJob(seeded.jobId))?.attempts, 1)
    startXrV2PostProcessFallbackRuntime()
    await waitForJobStatus(store, seeded.jobId, 'completed')
    assert.equal(adapterCount, 2)
    assert.equal((await store.readPostProcessJob(seeded.jobId))?.attempts, 1)
  } finally {
    stopXrV2PostProcessFallbackRuntime()
    restore()
  }
})

test('fallback harness sources request no browser permissions or external network', () => {
  const source = [
    readFileSync(new URL('../xrV2PostProcessFallbackRuntime.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../xrV2PostProcessFallbackLifecycle.ts', import.meta.url), 'utf8'),
  ].join('\n')
  assert.doesNotMatch(source, /getUserMedia|mediaDevices|requestSession|DeviceOrientationEvent/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)
  assert.doesNotMatch(source, /putFrameBundle\(inferredBundle\)/)
  assert.match(source, /frameBundle: inferredBundle/)
})
