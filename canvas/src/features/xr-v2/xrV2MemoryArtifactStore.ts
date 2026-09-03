import type { XrV2DepthEstimate } from './captureContracts'
import type {
  XrV2CaptureArtifactStore,
  XrV2StoredCaptureFrameBundle,
  XrV2StoredPostProcessJob,
} from './xrV2CaptureArtifactStore'
import {
  assertXrV2AtomicPostProcessCompletion,
  completedXrV2PostProcessJob,
} from './xrV2PostProcessPersistence'
import type {
  XrV2FlatCaptureAssetRecord,
} from './spatialCapturePostProcess'
import type { XrV2NormalizedDepthMap, XrV2RgbaFrame } from './stereoSynthesis'
import {
  createXrV2PublishedSpatialAsset,
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
} from './xrV2SpatialAssetMetadata'
import {
  XR_V2_POST_PROCESS_LEASE_MS,
  createXrV2PostProcessLeaseId,
  isXrV2PostProcessJobClaimable,
} from './xrV2PostProcessStoreContract'

const MAX_FRAMES = 180
const MAX_BLOB_BYTES = 256 * 1024 * 1024
const PORTABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/

function identifier(label: string, value: string): string {
  const normalized = String(value || '').trim()
  if (!PORTABLE_ID.test(normalized)) throw new Error(`${label} must be a bounded portable identifier`)
  return normalized
}

function timestamp(value = Date.now()): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('timestamp must be a non-negative safe integer')
  return value
}

function copyFrame(frame: XrV2RgbaFrame): XrV2RgbaFrame {
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || frame.width > 1_024
    || !Number.isSafeInteger(frame.height) || frame.height < 1 || frame.height > 1_024
    || !(frame.data instanceof Uint8ClampedArray)
    || frame.data.length !== frame.width * frame.height * 4) {
    throw new Error('capture frame is not a bounded RGBA frame')
  }
  return Object.freeze({ width: frame.width, height: frame.height, data: frame.data.slice() })
}

function copyEstimate(
  estimate: XrV2DepthEstimate<XrV2NormalizedDepthMap>,
): XrV2DepthEstimate<XrV2NormalizedDepthMap> {
  const { depth } = estimate
  if (!Number.isFinite(estimate.confidence) || estimate.confidence < 0 || estimate.confidence > 1
    || !Number.isSafeInteger(depth.width) || depth.width < 1
    || !Number.isSafeInteger(depth.height) || depth.height < 1
    || !(depth.values instanceof Float32Array)
    || depth.values.length !== depth.width * depth.height) {
    throw new Error('capture depth estimate is malformed')
  }
  return Object.freeze({
    confidence: estimate.confidence,
    depth: Object.freeze({ width: depth.width, height: depth.height, values: depth.values.slice() }),
  })
}

function cloneBundle(bundle: XrV2StoredCaptureFrameBundle): XrV2StoredCaptureFrameBundle {
  const sessionId = identifier('sessionId', bundle.sessionId)
  if (bundle.schema !== 'agentic-graph-xr-v2-capture-frame-bundle/v1'
    || !Array.isArray(bundle.frames) || bundle.frames.length < 1 || bundle.frames.length > MAX_FRAMES) {
    throw new Error('capture frame bundle is outside the admitted bound')
  }
  const seen = new Set<number>()
  const frames = bundle.frames.map(source => {
    if (!Number.isSafeInteger(source.frameIndex) || source.frameIndex < 0 || seen.has(source.frameIndex)
      || !Number.isFinite(source.capturedAtMs) || source.capturedAtMs < 0) {
      throw new Error('capture frame bundle contains an invalid or duplicate frame')
    }
    seen.add(source.frameIndex)
    return Object.freeze({
      frameIndex: source.frameIndex,
      capturedAtMs: source.capturedAtMs,
      frame: copyFrame(source.frame),
      estimate: source.estimate ? copyEstimate(source.estimate) : null,
    })
  }).sort((left, right) => left.frameIndex - right.frameIndex)
  return Object.freeze({
    schema: bundle.schema,
    sessionId,
    snapshot: structuredClone(bundle.snapshot),
    frames: Object.freeze(frames),
    createdAtMs: timestamp(bundle.createdAtMs),
  })
}

function cloneAsset(asset: XrV2PublishedSpatialAsset): XrV2PublishedSpatialAsset {
  const copy = structuredClone(asset)
  if (!isXrV2PublishedSpatialAsset(copy)) throw new Error('published spatial asset is malformed')
  return Object.freeze({ ...copy, metadata: Object.freeze({ ...copy.metadata }) })
}

export function createXrV2MemoryArtifactStore(): XrV2CaptureArtifactStore {
  const blobs = new Map<string, Blob>()
  const bundles = new Map<string, XrV2StoredCaptureFrameBundle>()
  const spatialAssets = new Map<string, XrV2PublishedSpatialAsset>()
  const assets = new Map<string, XrV2FlatCaptureAssetRecord>()
  const commits = new Map<string, string>()
  const jobs = new Map<string, XrV2StoredPostProcessJob>()
  const stereoContainerRef = (leaseId: string) => `indexeddb://agentic-graph-xr-v2/stereo-container/${leaseId}`
  const putBlob = async (kind: 'raw-clip' | 'stereo-container', id: string, blob: Blob, signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException(`${kind} persistence cancelled`, 'AbortError')
    if (!(blob instanceof Blob) || blob.size < 1 || blob.size > MAX_BLOB_BYTES) {
      throw new Error(`${kind} blob is outside the admitted persistence bound`)
    }
    const ref = `indexeddb://agentic-graph-xr-v2/${kind}/${identifier('sessionId', id)}`
    blobs.set(ref, blob)
    return ref
  }
  return Object.freeze({
    putRawClip: (sessionId, blob) => putBlob('raw-clip', sessionId, blob),
    putStereoContainer: (sessionId, blob, signal) => putBlob('stereo-container', sessionId, blob, signal),
    readBlob: async ref => blobs.get(ref) || null,
    deleteBlob: async ref => { blobs.delete(ref) },
    putFrameBundle: async input => {
      const bundle = cloneBundle(input)
      const ref = `indexeddb://agentic-graph-xr-v2/frame-bundle/${bundle.sessionId}`
      bundles.set(ref, bundle)
      return ref
    },
    readFrameBundle: async ref => bundles.has(ref) ? cloneBundle(bundles.get(ref)!) : null,
    importSavedAssetAtomically: async input => {
      if (!(input.rawClip instanceof Blob) || input.rawClip.size < 1 || input.rawClip.size > MAX_BLOB_BYTES) {
        throw new Error('saved asset raw clip is outside the admitted persistence bound')
      }
      const source = cloneAsset(input.asset)
      const bundle = input.frameBundle ? cloneBundle(input.frameBundle) : null
      if ((source.metadata.depth_metadata_ref && !bundle) || (bundle && bundle.sessionId !== source.session_id)) {
        throw new Error('XR saved asset import parts do not match its session')
      }
      const rawRef = `indexeddb://agentic-graph-xr-v2/${input.rawKind}/${source.session_id}`
      const bundleRef = bundle ? `indexeddb://agentic-graph-xr-v2/frame-bundle/${source.session_id}` : null
      const asset = createXrV2PublishedSpatialAsset({
        assetId: source.asset_id, sessionId: source.session_id, rawClipRef: rawRef,
        metadata: { ...source.metadata, depth_metadata_ref: source.metadata.depth_metadata_ref ? bundleRef : null },
        createdAtMs: source.created_at_ms,
      })
      blobs.set(rawRef, input.rawClip)
      if (bundle && bundleRef) bundles.set(bundleRef, bundle)
      spatialAssets.set(asset.asset_id, asset)
      return cloneAsset(asset)
    },
    putPublishedSpatialAsset: async input => {
      const asset = cloneAsset(input)
      spatialAssets.set(asset.asset_id, asset)
    },
    readPublishedSpatialAsset: async id => spatialAssets.has(id) ? cloneAsset(spatialAssets.get(id)!) : null,
    listPublishedSpatialAssets: async () => Object.freeze([...spatialAssets.values()]
      .map(cloneAsset)
      .sort((left, right) => right.created_at_ms - left.created_at_ms
        || left.asset_id.localeCompare(right.asset_id))),
    putFlatAssetAndQueuedJobAtomically: async commit => {
      const previous = commits.get(commit.idempotencyKey)
      if (previous && previous !== commit.canonicalPayload) throw new Error('XR capture idempotency payload mismatch')
      if (previous) return Object.freeze({
        outcome: 'existing' as const,
        idempotencyKey: commit.idempotencyKey,
        canonicalPayload: commit.canonicalPayload,
      })
      const spatialAsset = cloneAsset(commit.spatialAsset)
      commits.set(commit.idempotencyKey, commit.canonicalPayload)
      assets.set(commit.flatAsset.assetId, commit.flatAsset)
      spatialAssets.set(spatialAsset.asset_id, spatialAsset)
      jobs.set(commit.queuedJob.jobId, Object.freeze({
        job: commit.queuedJob,
        status: 'queued', attempts: 0, leaseId: null, leaseExpiresAtMs: null, output: null, error: null,
        updatedAtMs: commit.queuedJob.queuedAtMs,
      }))
      return Object.freeze({
        outcome: 'inserted' as const,
        idempotencyKey: commit.idempotencyKey,
        canonicalPayload: commit.canonicalPayload,
      })
    },
    readFlatAsset: async assetId => assets.get(assetId) || null,
    listFlatAssets: async () => Object.freeze([...assets.values()].sort((a, b) => b.createdAtMs - a.createdAtMs)),
    readPostProcessJob: async jobId => jobs.get(jobId) || null,
    claimNextQueuedPostProcessJob: async (nowMs = Date.now(), requestedLeaseId, signal) => {
      timestamp(nowMs)
      if (signal?.aborted) throw new DOMException('XR job claim cancelled', 'AbortError')
      const current = [...jobs.values()].find(job => isXrV2PostProcessJobClaimable(job, nowMs))
      if (!current) return null
      const leaseId = identifier('leaseId', requestedLeaseId || createXrV2PostProcessLeaseId(nowMs))
      if (current.leaseId) blobs.delete(stereoContainerRef(current.leaseId))
      const claimed = Object.freeze({
        ...current,
        status: 'running' as const,
        attempts: Math.max(1, current.attempts),
        leaseId,
        leaseExpiresAtMs: nowMs + XR_V2_POST_PROCESS_LEASE_MS,
        error: null,
        updatedAtMs: nowMs,
      })
      jobs.set(current.job.jobId, claimed)
      return claimed
    },
    completePostProcessJobAndPublishAssetAtomically: async (input, signal) => {
      if (signal?.aborted) throw new DOMException('XR post-process atomic completion cancelled', 'AbortError')
      const currentJob = jobs.get(input.claimedJob.job.jobId) || null
      const currentAsset = spatialAssets.get(input.sourceAsset.asset_id) || null
      assertXrV2AtomicPostProcessCompletion(input, currentJob, currentAsset)
      const published = cloneAsset(input.publishedAsset)
      const bundle = cloneBundle(input.frameBundle)
      const completed = completedXrV2PostProcessJob(input)
      jobs.set(input.claimedJob.job.jobId, completed)
      spatialAssets.set(published.asset_id, published)
      bundles.set(`indexeddb://agentic-graph-xr-v2/frame-bundle/${bundle.sessionId}`, bundle)
    },
    failPostProcessJob: async (claimed, error, nowMs = Date.now()) => {
      const current = jobs.get(claimed.job.jobId)
      if (!current) throw new Error('XR v2 post-process job was not found')
      if (JSON.stringify(current) !== JSON.stringify(claimed)) throw new Error('XR post-process failure lost its lease')
      if (current.leaseId) blobs.delete(stereoContainerRef(current.leaseId))
      jobs.set(claimed.job.jobId, Object.freeze({
        ...current, status: 'failed', leaseId: null, leaseExpiresAtMs: null, output: null,
        error: String(error || 'XR post-process failed').slice(0, 1_024),
        updatedAtMs: timestamp(nowMs),
      }))
    },
    releasePostProcessJob: async (claimed, nowMs = Date.now()) => {
      const current = jobs.get(claimed.job.jobId)
      if (!current || JSON.stringify(current) !== JSON.stringify(claimed)) {
        throw new Error('XR post-process release lost its lease')
      }
      if (current.leaseId) blobs.delete(stereoContainerRef(current.leaseId))
      jobs.set(claimed.job.jobId, Object.freeze({
        ...current, status: 'queued', leaseId: null, leaseExpiresAtMs: null,
        output: null, error: null, updatedAtMs: timestamp(nowMs),
      }))
    },
    deleteCapturePersistence: async input => {
      blobs.delete(input.rawClipRef)
      bundles.delete(input.depthMetadataRef)
      spatialAssets.delete(input.spatialAssetId)
      if (!input.fallback) return
      assets.delete(input.fallback.flatAssetId)
      const job = jobs.get(input.fallback.jobId)
      if (job?.leaseId) blobs.delete(stereoContainerRef(job.leaseId))
      if (job?.output) blobs.delete(job.output.containerRef)
      jobs.delete(input.fallback.jobId)
      commits.delete(input.fallback.idempotencyKey)
    },
    close: () => undefined,
  })
}
