import type {
  XrV2AtomicPostProcessCompletion,
  XrV2StoredPostProcessJob,
} from './xrV2CaptureArtifactStore'
import {
  isXrV2PublishedSpatialAsset,
  type XrV2PublishedSpatialAsset,
} from './xrV2SpatialAssetMetadata'

const STEREO_REFERENCE_PREFIX = 'indexeddb://agentic-graph-xr-v2/stereo-container/'

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Validates the compare-and-set inputs used by both durable store adapters. */
export function assertXrV2AtomicPostProcessCompletion(
  input: XrV2AtomicPostProcessCompletion,
  currentJob: XrV2StoredPostProcessJob | null,
  currentAsset: XrV2PublishedSpatialAsset | null,
): void {
  const claimed = input.claimedJob
  const job = claimed.job
  const source = input.sourceAsset
  const published = input.publishedAsset
  const output = input.output
  if (!currentJob || !sameValue(currentJob, claimed)
    || claimed.status !== 'running' || claimed.attempts !== 1
    || claimed.attempts > job.maxAttempts || !claimed.leaseId
    || !Number.isSafeInteger(claimed.leaseExpiresAtMs)) {
    throw new Error('XR post-process completion lost its exclusive running-job claim')
  }
  if (!currentAsset || !sameValue(currentAsset, source)
    || !isXrV2PublishedSpatialAsset(source)
    || !isXrV2PublishedSpatialAsset(published)) {
    throw new Error('XR post-process source asset changed after the job was claimed')
  }
  if (source.asset_id !== job.flatAssetId
    || source.session_id !== job.sessionId
    || source.raw_clip_ref !== job.rawClipRef
    || source.created_at_ms !== job.queuedAtMs
    || source.metadata.xr_capability_tier !== 'flat-fallback'
    || source.metadata.synthesis_mode !== 'post-process'
    || source.metadata.depth_metadata_ref !== job.depthMetadataRef
    || source.metadata.fallback_triggered !== true) {
    throw new Error('XR post-process source asset identity does not match its queued job')
  }
  if (published.asset_id !== source.asset_id
    || published.session_id !== source.session_id
    || published.raw_clip_ref !== source.raw_clip_ref
    || published.created_at_ms !== source.created_at_ms
    || published.metadata.xr_capability_tier !== 'pseudo-ar-depth-parallax'
    || published.metadata.synthesis_mode !== 'post-process'
    || published.metadata.depth_metadata_ref !== job.depthMetadataRef
    || published.metadata.fallback_triggered !== true) {
    throw new Error('XR post-process publication changed immutable source identity')
  }
  if (output.containerRef !== `${STEREO_REFERENCE_PREFIX}${claimed.leaseId}`
    || output.mimeType !== 'video/webm'
    || !Number.isSafeInteger(output.byteLength) || output.byteLength < 1
    || output.trackCount !== 2
    || !Number.isSafeInteger(output.completedAtMs) || output.completedAtMs < claimed.updatedAtMs
    || output.completedAtMs > claimed.leaseExpiresAtMs!
    || output.browserPlaybackEvidence !== 'not-observed') {
    throw new Error('XR post-process completion output is malformed or identity-mismatched')
  }
  const bundle = input.frameBundle
  if (bundle.schema !== 'agentic-graph-xr-v2-capture-frame-bundle/v1'
    || bundle.sessionId !== job.sessionId || bundle.snapshot.sessionId !== job.sessionId
    || bundle.frames.length < 1 || bundle.frames.some(frame => frame.estimate === null)) {
    throw new Error('XR post-process completion frame bundle is malformed or incomplete')
  }
}

export function completedXrV2PostProcessJob(
  input: XrV2AtomicPostProcessCompletion,
): XrV2StoredPostProcessJob {
  return Object.freeze({
    ...input.claimedJob,
    status: 'completed',
    leaseId: null,
    leaseExpiresAtMs: null,
    output: input.output,
    error: null,
    updatedAtMs: input.output.completedAtMs,
  })
}
