import type { XrV2CaptureFrame } from './captureContracts'
import {
  type XrV2CaptureArtifactStore,
  type XrV2StoredCaptureFrame,
  type XrV2StoredCaptureFrameBundle,
  type XrV2StoredPostProcessJob,
} from './xrV2CaptureArtifactStore'
import {
  XR_V2_DEPTH_MODEL_MANIFEST,
  type XrV2LocalDepthInferenceAdapter,
} from './xrV2DepthInferenceRuntime'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'
import {
  XR_V2_FLAT_CAPTURE_ASSET_SCHEMA,
  type XrV2FlatCaptureAssetRecord,
} from './spatialCapturePostProcess'
import {
  XR_V2_SPATIAL_ASSET_METADATA_FIELDS,
  createXrV2PublishedSpatialAsset,
  createXrV2SpatialAssetMetadata,
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
} from './xrV2SpatialAssetMetadata'

export const XR_V2_POST_PROCESS_FALLBACK_SCHEMA =
  'agentic-graph-xr-v2-post-process-fallback/v1' as const
export const XR_V2_POST_PROCESS_STEP_TIMEOUT_MS = 30_000
export const XR_V2_POST_PROCESS_PASS_TIMEOUT_MS = 180_000

type HarnessStore = Pick<XrV2CaptureArtifactStore,
  | 'claimNextQueuedPostProcessJob'
  | 'readFlatAsset'
  | 'readBlob'
  | 'deleteBlob'
  | 'readFrameBundle'
  | 'putStereoContainer'
  | 'readPublishedSpatialAsset'
  | 'readPostProcessJob'
  | 'completePostProcessJobAndPublishAssetAtomically'
  | 'failPostProcessJob'
  | 'releasePostProcessJob'>

export type XrV2PostProcessFallbackReason =
  | 'runtime-stopped'
  | 'no-queued-job'
  | 'no-admitted-depth-model'
  | 'admitted-model-mismatch'
  | 'processing-failed'
  | null

export type XrV2PostProcessFallbackPhase =
  | 'idle'
  | 'scanning'
  | 'degraded-flat'
  | 'preparing'
  | 'processing'
  | 'packaging'
  | 'persisting'
  | 'completed'
  | 'failed'

export type XrV2PostProcessFallbackEvent = Readonly<{
  phase: XrV2PostProcessFallbackPhase
  reason: XrV2PostProcessFallbackReason
  jobId: string | null
  assetId: string | null
  processedFrames: number
  totalFrames: number
  progressPercent: number
  achievedTier: 'flat-fallback' | 'pseudo-ar-depth-parallax' | null
  message: string
  error: string | null
}>

export type XrV2PostProcessFallbackSnapshot = XrV2PostProcessFallbackEvent & Readonly<{
  schema: typeof XR_V2_POST_PROCESS_FALLBACK_SCHEMA
  runtimeActive: boolean
  catalogRevision: number
  revision: number
}>

export type XrV2PostProcessStereoPackage = Readonly<{
  blob: Blob
  trackCount: number
}>

export type XrV2PostProcessFallbackDependencies = Readonly<{
  store: HarnessStore
  createDepthAdapter: () => XrV2LocalDepthInferenceAdapter
  packageStereo: (
    resource: XrV2SavedSpatialAssetResource,
    signal: AbortSignal,
  ) => Promise<XrV2PostProcessStereoPackage>
  now: () => number
  signal?: AbortSignal
  stepTimeoutMs?: number
  passTimeoutMs?: number
}>

export const createXrV2PostProcessStoppedEvent = (): XrV2PostProcessFallbackEvent => Object.freeze({
  phase: 'idle', reason: 'runtime-stopped', jobId: null, assetId: null,
  processedFrames: 0, totalFrames: 0, progressPercent: 0, achievedTier: null,
  message: 'Post-process fallback resumes when the XR workspace is mounted.', error: null,
})

function message(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.slice(0, 1_024)
    : String(error || 'XR post-process fallback failed').slice(0, 1_024)
}

function bounded<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', onAbort)
      action()
    }
    const onAbort = () => finish(() => reject(new DOMException(`${label} cancelled`, 'AbortError')))
    const timeout = setTimeout(() => finish(() => {
      onTimeout?.()
      reject(new Error(`${label} timed out`))
    }), timeoutMs)
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    operation.then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error)),
    )
  })
}

function admittedModelMatches(job: Awaited<ReturnType<HarnessStore['claimNextQueuedPostProcessJob']>>): boolean {
  if (!job || job.job.executor.state !== 'awaiting-executor') return false
  const model = job.job.executor.admittedModel
  return model.modelId === XR_V2_DEPTH_MODEL_MANIFEST.modelId
    && model.revision === XR_V2_DEPTH_MODEL_MANIFEST.revision
    && model.sha256 === XR_V2_DEPTH_MODEL_MANIFEST.sha256
    && model.sameOriginPath === XR_V2_DEPTH_MODEL_MANIFEST.sameOriginPath
}

function adapterMatches(adapter: XrV2LocalDepthInferenceAdapter): boolean {
  const state = adapter.snapshot()
  return state.phase === 'ready'
    && state.modelId === XR_V2_DEPTH_MODEL_MANIFEST.modelId
    && state.revision === XR_V2_DEPTH_MODEL_MANIFEST.revision
    && state.sameOriginPath === XR_V2_DEPTH_MODEL_MANIFEST.sameOriginPath
    && state.remoteFallbackAllowed === false
}

function event(input: Partial<XrV2PostProcessFallbackEvent>): XrV2PostProcessFallbackEvent {
  const processedFrames = input.processedFrames ?? 0
  const totalFrames = input.totalFrames ?? 0
  return Object.freeze({
    phase: input.phase || 'idle',
    reason: input.reason ?? null,
    jobId: input.jobId ?? null,
    assetId: input.assetId ?? null,
    processedFrames,
    totalFrames,
    progressPercent: totalFrames > 0 ? Math.round(processedFrames / totalFrames * 100) : 0,
    achievedTier: input.achievedTier ?? null,
    message: input.message || '',
    error: input.error ?? null,
  })
}

async function equalBlob(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size || left.type !== right.type) return false
  const [leftBytes, rightBytes] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()])
  const leftView = new Uint8Array(leftBytes)
  const rightView = new Uint8Array(rightBytes)
  for (let index = 0; index < leftView.length; index += 1) {
    if (leftView[index] !== rightView[index]) return false
  }
  return true
}

function sameTypedValues(
  left: Uint8ClampedArray | Float32Array,
  right: Uint8ClampedArray | Float32Array,
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) return false
  }
  return true
}

function verifyAsset(
  candidate: XrV2PublishedSpatialAsset | null,
  expected: XrV2PublishedSpatialAsset,
): void {
  if (!candidate || !isXrV2PublishedSpatialAsset(candidate)
    || candidate.asset_id !== expected.asset_id
    || candidate.session_id !== expected.session_id
    || candidate.raw_clip_ref !== expected.raw_clip_ref
    || candidate.created_at_ms !== expected.created_at_ms
    || Object.keys(candidate.metadata).join(',') !== XR_V2_SPATIAL_ASSET_METADATA_FIELDS.join(',')
    || JSON.stringify(candidate.metadata) !== JSON.stringify(expected.metadata)) {
    throw new Error('post-process spatial metadata read-back did not match the exact published asset')
  }
}

function verifyBundle(
  candidate: XrV2StoredCaptureFrameBundle | null,
  expected: XrV2StoredCaptureFrameBundle,
): void {
  if (!candidate || candidate.schema !== expected.schema
    || candidate.sessionId !== expected.sessionId
    || candidate.createdAtMs !== expected.createdAtMs
    || JSON.stringify(candidate.snapshot) !== JSON.stringify(expected.snapshot)
    || candidate.frames.length !== expected.frames.length
    || candidate.frames.some((frame, index) => {
      const source = expected.frames[index]
      const estimate = frame.estimate
      const sourceEstimate = source.estimate
      return frame.frameIndex !== source.frameIndex
        || frame.capturedAtMs !== source.capturedAtMs
        || frame.frame.width !== source.frame.width
        || frame.frame.height !== source.frame.height
        || !sameTypedValues(frame.frame.data, source.frame.data)
        || !estimate || !sourceEstimate
        || estimate.confidence !== sourceEstimate.confidence
        || estimate.depth.width !== sourceEstimate.depth.width
        || estimate.depth.height !== sourceEstimate.depth.height
        || !sameTypedValues(estimate.depth.values, sourceEstimate.depth.values)
    })) {
    throw new Error('post-process frame bundle read-back did not preserve every inferred frame')
  }
}

function verifySourceArtifacts(input: Readonly<{
  claimed: XrV2StoredPostProcessJob
  flat: XrV2FlatCaptureAssetRecord | null
  rawClip: Blob | null
  bundle: XrV2StoredCaptureFrameBundle | null
  asset: XrV2PublishedSpatialAsset | null
}>): asserts input is Readonly<{
  claimed: XrV2StoredPostProcessJob
  flat: XrV2FlatCaptureAssetRecord
  rawClip: Blob
  bundle: XrV2StoredCaptureFrameBundle
  asset: XrV2PublishedSpatialAsset
}> {
  const { claimed, flat, rawClip, bundle, asset } = input
  const job = claimed.job
  if (claimed.status !== 'running' || claimed.attempts !== 1
    || claimed.attempts > job.maxAttempts || !claimed.leaseId
    || !Number.isSafeInteger(claimed.leaseExpiresAtMs) || claimed.output !== null) {
    throw new Error('claimed post-process job is not one exclusive first attempt')
  }
  if (!flat || flat.schema !== XR_V2_FLAT_CAPTURE_ASSET_SCHEMA
    || flat.assetId !== job.flatAssetId || flat.sessionId !== job.sessionId
    || flat.rawClipRef !== job.rawClipRef || flat.depthMetadataRef !== job.depthMetadataRef
    || flat.createdAtMs !== job.queuedAtMs || flat.kind !== 'flat-video-capture'
    || flat.xrCapabilityTier !== 'flat-fallback' || flat.synthesisMode !== 'none') {
    throw new Error('persisted flat fallback identity does not match its queued job')
  }
  if (!(rawClip instanceof Blob) || rawClip.size !== flat.rawClipByteLength
    || rawClip.type !== flat.rawClipMimeType || rawClip.size < 1) {
    throw new Error('persisted raw fallback does not match its flat asset inventory')
  }
  if (!asset || !isXrV2PublishedSpatialAsset(asset)
    || asset.asset_id !== job.flatAssetId || asset.session_id !== job.sessionId
    || asset.raw_clip_ref !== job.rawClipRef || asset.created_at_ms !== job.queuedAtMs
    || Object.keys(asset.metadata).join(',') !== XR_V2_SPATIAL_ASSET_METADATA_FIELDS.join(',')
    || asset.metadata.xr_capability_tier !== 'flat-fallback'
    || asset.metadata.synthesis_mode !== 'post-process'
    || asset.metadata.depth_metadata_ref !== job.depthMetadataRef
    || asset.metadata.fallback_triggered !== true
    || JSON.stringify(asset.metadata) !== JSON.stringify(flat.metadata)) {
    throw new Error('published flat fallback identity does not match its queued job')
  }
  const expectedRawRef = `indexeddb://agentic-graph-xr-v2/raw-clip/${job.sessionId}`
  const expectedBundleRef = `indexeddb://agentic-graph-xr-v2/frame-bundle/${job.sessionId}`
  if (job.rawClipRef !== expectedRawRef || job.depthMetadataRef !== expectedBundleRef
    || !bundle || bundle.schema !== 'agentic-graph-xr-v2-capture-frame-bundle/v1'
    || bundle.sessionId !== job.sessionId || bundle.snapshot.sessionId !== job.sessionId
    || bundle.snapshot.phase !== 'capturing-raw'
    || JSON.stringify(bundle.snapshot.fallback) !== JSON.stringify(job.fallback)
    || bundle.frames.length < 1 || bundle.frames.length !== bundle.snapshot.rawFrameCount
    || bundle.snapshot.lastFrameIndex !== bundle.frames.at(-1)?.frameIndex
    || bundle.frames.some((frame, index) => frame.frameIndex !== index)) {
    throw new Error('persisted frame bundle identity or full frame inventory is inconsistent')
  }
}

export async function runXrV2PostProcessFallbackPass(
  dependencies: XrV2PostProcessFallbackDependencies,
  report: (value: XrV2PostProcessFallbackEvent) => void = () => undefined,
): Promise<XrV2PostProcessFallbackEvent> {
  const stepTimeoutMs = dependencies.stepTimeoutMs || XR_V2_POST_PROCESS_STEP_TIMEOUT_MS
  const passTimeoutMs = dependencies.passTimeoutMs || XR_V2_POST_PROCESS_PASS_TIMEOUT_MS
  const startedAt = Date.now()
  const abort = new AbortController()
  const relayAbort = () => abort.abort(dependencies.signal?.reason)
  if (dependencies.signal?.aborted) relayAbort()
  else dependencies.signal?.addEventListener('abort', relayAbort, { once: true })
  const step = <T>(operation: () => Promise<T>, label: string) => {
    const remaining = Math.max(1, passTimeoutMs - (Date.now() - startedAt))
    if (abort.signal.aborted) return Promise.reject(new DOMException(`${label} cancelled`, 'AbortError'))
    return bounded(
      Promise.resolve().then(operation), Math.min(stepTimeoutMs, remaining), label, abort.signal,
      () => abort.abort(new DOMException(`${label} timed out`, 'TimeoutError')),
    )
  }
  const emit = (value: XrV2PostProcessFallbackEvent) => {
    try { report(value) } catch { /* observation cannot break persistence */ }
  }
  emit(event({ phase: 'scanning', message: 'Scanning one persisted XR fallback job.' }))
  let claimed: XrV2StoredPostProcessJob | null = null
  let claimTask: Promise<XrV2StoredPostProcessJob | null> | null = null
  try {
    claimTask = dependencies.store.claimNextQueuedPostProcessJob(
      dependencies.now(), undefined, abort.signal,
    )
    claimed = await step(
      () => claimTask!,
      'post-process job claim',
    )
  } catch (error) {
    if (claimTask && abort.signal.aborted) try {
      const recoveryTimeoutMs = Math.min(stepTimeoutMs, 5_000)
      const reconciliation = claimTask.then(lateClaim => lateClaim
        ? dependencies.store.releasePostProcessJob(lateClaim, dependencies.now())
        : undefined)
      await bounded(reconciliation, recoveryTimeoutMs, 'post-process late claim reconciliation')
    } catch { /* the store owns abort rollback and bounded lease expiry */ }
    const failed = event({
      phase: 'failed', reason: 'processing-failed', message: 'Post-process scan failed before any job was claimed.',
      error: message(error),
    })
    emit(failed)
    dependencies.signal?.removeEventListener('abort', relayAbort)
    return failed
  }
  if (!claimed) {
    const idle = event({ phase: 'idle', reason: 'no-queued-job', message: 'No queued XR fallback job is pending.' })
    emit(idle)
    dependencies.signal?.removeEventListener('abort', relayAbort)
    return idle
  }
  let adapter: XrV2LocalDepthInferenceAdapter | null = null
  let containerRef: string | null = null
  let completionCommitted = false
  try {
    const [flat, bundle, rawClip, asset] = await step(() => Promise.all([
      dependencies.store.readFlatAsset(claimed!.job.flatAssetId),
      dependencies.store.readFrameBundle(claimed!.job.depthMetadataRef),
      dependencies.store.readBlob(claimed!.job.rawClipRef),
      dependencies.store.readPublishedSpatialAsset(claimed!.job.flatAssetId),
    ]), 'post-process source read')
    const sources = { claimed, flat, rawClip, bundle, asset }
    verifySourceArtifacts(sources)
    const degradedReason = claimed.job.executor.state === 'blocked'
      ? 'no-admitted-depth-model' as const
      : !admittedModelMatches(claimed) ? 'admitted-model-mismatch' as const : null
    if (degradedReason) {
      await bounded(
        dependencies.store.failPostProcessJob(claimed, degradedReason, dependencies.now()),
        stepTimeoutMs,
        'post-process degraded job persistence',
      )
      const degraded = event({
        phase: 'degraded-flat', reason: degradedReason, jobId: claimed.job.jobId,
        assetId: claimed.job.flatAssetId, achievedTier: 'flat-fallback',
        message: degradedReason === 'no-admitted-depth-model'
          ? 'Saved flat fallback remains available; no admitted local depth model was recorded.'
          : 'Saved flat fallback remains available; the recorded depth model did not match the pinned local model.',
      })
      emit(degraded)
      return degraded
    }
    adapter = dependencies.createDepthAdapter()
    emit(event({
      phase: 'preparing', jobId: claimed.job.jobId, assetId: claimed.job.flatAssetId,
      totalFrames: sources.bundle.frames.length, message: 'Preparing the admitted local depth model.',
    }))
    await step(() => adapter!.prepare(), 'post-process depth model preparation')
    if (!adapterMatches(adapter)) throw new Error('prepared depth adapter does not match the admitted local model')

    const frames: XrV2StoredCaptureFrame[] = []
    for (let index = 0; index < sources.bundle.frames.length; index += 1) {
      const stored = sources.bundle.frames[index]
      const input: XrV2CaptureFrame<typeof stored.frame> = Object.freeze({
        frameIndex: stored.frameIndex,
        capturedAtMs: stored.capturedAtMs,
        frame: stored.frame,
      })
      const estimate = await step(async () => adapter!.estimate(input), `post-process frame ${index + 1}`)
      frames.push(Object.freeze({ ...stored, estimate }))
      emit(event({
        phase: 'processing', jobId: claimed.job.jobId, assetId: claimed.job.flatAssetId,
        processedFrames: index + 1, totalFrames: sources.bundle.frames.length,
        message: `Batch depth inference ${index + 1}/${sources.bundle.frames.length}.`,
      }))
    }
    const inferredBundle: XrV2StoredCaptureFrameBundle = Object.freeze({
      ...sources.bundle,
      frames: Object.freeze(frames),
    })
    const metadata = createXrV2SpatialAssetMetadata({
      tier: 'pseudo-ar-depth-parallax', synthesisMode: 'post-process',
      depthMetadataRef: claimed.job.depthMetadataRef, fallbackTriggered: true,
    })
    const candidateAsset = createXrV2PublishedSpatialAsset({
      assetId: sources.asset.asset_id, sessionId: sources.asset.session_id,
      rawClipRef: sources.asset.raw_clip_ref, metadata, createdAtMs: sources.asset.created_at_ms,
    })
    const candidateResource: XrV2SavedSpatialAssetResource = Object.freeze({
      asset: candidateAsset, rawClip: sources.rawClip, frameBundle: inferredBundle,
      depthFrame: inferredBundle.frames.find(frame => frame.estimate !== null) || null,
    })
    emit(event({
      phase: 'packaging', jobId: claimed.job.jobId, assetId: claimed.job.flatAssetId,
      processedFrames: frames.length, totalFrames: frames.length,
      message: 'Synthesizing and packaging the inferred stereo tracks.',
    }))
    const packaged = await step(
      () => dependencies.packageStereo(candidateResource, abort.signal),
      'post-process stereo packaging',
    )
    if (!(packaged.blob instanceof Blob) || packaged.blob.size < 1
      || packaged.blob.type !== 'video/webm' || packaged.trackCount !== 2) {
      throw new Error('post-process packager did not produce one verified two-track WebM')
    }
    emit(event({
      phase: 'persisting', jobId: claimed.job.jobId, assetId: claimed.job.flatAssetId,
      processedFrames: frames.length, totalFrames: frames.length,
      message: 'Persisting and validating the achieved pseudo-AR asset.',
    }))
    containerRef = await step(
      () => dependencies.store.putStereoContainer(claimed!.leaseId!, packaged.blob, abort.signal),
      'post-process container persistence',
    )
    const publishedAsset = createXrV2PublishedSpatialAsset({
      assetId: sources.asset.asset_id, sessionId: sources.asset.session_id,
      rawClipRef: sources.asset.raw_clip_ref, metadata, createdAtMs: sources.asset.created_at_ms,
    })
    const storedContainer = await step(
      () => dependencies.store.readBlob(containerRef!), 'post-process container read-back',
    )
    if (!(storedContainer instanceof Blob) || !await equalBlob(storedContainer, packaged.blob)) {
      throw new Error('post-process container read-back did not match the packaged bytes')
    }
    const output = Object.freeze({
      containerRef, mimeType: 'video/webm', byteLength: packaged.blob.size,
      trackCount: packaged.trackCount, completedAtMs: dependencies.now(),
      browserPlaybackEvidence: 'not-observed' as const,
    })
    await step(() => dependencies.store.completePostProcessJobAndPublishAssetAtomically({
      claimedJob: claimed!, sourceAsset: sources.asset, publishedAsset,
      frameBundle: inferredBundle, output,
    }, abort.signal), 'post-process atomic completion')
    completionCommitted = true
    const [storedJob, storedAsset, storedBundle] = await step(() => Promise.all([
      dependencies.store.readPostProcessJob(claimed!.job.jobId),
      dependencies.store.readPublishedSpatialAsset(publishedAsset.asset_id),
      dependencies.store.readFrameBundle(claimed!.job.depthMetadataRef),
    ]), 'post-process completion read-back')
    if (!storedJob || storedJob.status !== 'completed'
      || JSON.stringify(storedJob.output) !== JSON.stringify(output)) {
      throw new Error('post-process completed job read-back did not match its exact output')
    }
    verifyAsset(storedAsset, publishedAsset)
    verifyBundle(storedBundle, inferredBundle)
    const completed = event({
      phase: 'completed', jobId: claimed.job.jobId, assetId: claimed.job.flatAssetId,
      processedFrames: frames.length, totalFrames: frames.length, achievedTier: 'pseudo-ar-depth-parallax',
      message: 'Post-process fallback completed as a verified pseudo-AR stereo asset.',
    })
    emit(completed)
    return completed
  } catch (error) {
    const cancelled = dependencies.signal?.aborted === true
      || (error instanceof DOMException && error.name === 'AbortError')
    abort.abort()
    const failure = message(error)
    let recoveryError: string | null = null
    if (!completionCommitted && containerRef) {
      try {
        await bounded(dependencies.store.deleteBlob(containerRef), stepTimeoutMs, 'post-process container rollback')
      } catch (rollbackError) {
        recoveryError = [recoveryError, message(rollbackError)].filter(Boolean).join('; ')
      }
    }
    if (!completionCommitted) try {
      await bounded(
        cancelled
          ? dependencies.store.releasePostProcessJob(claimed, dependencies.now())
          : dependencies.store.failPostProcessJob(claimed, failure, dependencies.now()),
        stepTimeoutMs,
        cancelled ? 'post-process cancellation release' : 'post-process failure persistence',
      )
    } catch (jobFailure) {
      recoveryError = [recoveryError, message(jobFailure)].filter(Boolean).join('; ')
    }
    const failed = event({
      phase: 'failed', reason: 'processing-failed', jobId: claimed.job.jobId,
      assetId: claimed.job.flatAssetId,
      achievedTier: completionCommitted ? 'pseudo-ar-depth-parallax' : 'flat-fallback',
      message: completionCommitted
        ? 'Post-process completion committed, but its final read-back failed.'
        : 'Post-process fallback failed; the flat saved asset remains authoritative.',
      error: [failure, recoveryError].filter(Boolean).join('; '),
    })
    emit(failed)
    return failed
  } finally {
    abort.abort()
    dependencies.signal?.removeEventListener('abort', relayAbort)
    if (adapter) {
      try { await bounded(adapter.dispose(), 2_000, 'post-process depth adapter disposal') } catch { /* bounded cleanup */ }
    }
  }
}
