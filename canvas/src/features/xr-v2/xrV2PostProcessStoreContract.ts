import type { XrV2PostProcessQueueRecord } from './spatialCapturePostProcess'
import type { XrV2StoredCaptureFrameBundle } from './xrV2CaptureArtifactStore'
import type { XrV2PublishedSpatialAsset } from './xrV2SpatialAssetMetadata'

export const XR_V2_POST_PROCESS_LEASE_MS = 5 * 60_000

export type XrV2PostProcessOutput = Readonly<{
  containerRef: string
  mimeType: 'video/webm'
  byteLength: number
  trackCount: number
  completedAtMs: number
  browserPlaybackEvidence: 'not-observed'
}>

export type XrV2StoredPostProcessJob = Readonly<{
  job: XrV2PostProcessQueueRecord
  status: 'queued' | 'running' | 'completed' | 'failed'
  attempts: number
  leaseId: string | null
  leaseExpiresAtMs: number | null
  output: XrV2PostProcessOutput | null
  error: string | null
  updatedAtMs: number
}>

export type XrV2AtomicPostProcessCompletion = Readonly<{
  claimedJob: XrV2StoredPostProcessJob
  sourceAsset: XrV2PublishedSpatialAsset
  publishedAsset: XrV2PublishedSpatialAsset
  frameBundle: XrV2StoredCaptureFrameBundle
  output: XrV2PostProcessOutput
}>

export function createXrV2PostProcessLeaseId(nowMs = Date.now()): string {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  return `lease:${nowMs}:${random}`.slice(0, 159)
}

export function isXrV2PostProcessJobClaimable(
  job: XrV2StoredPostProcessJob,
  nowMs: number,
): boolean {
  if (job.output !== null || job.status === 'completed' || job.status === 'failed') return false
  if (job.status === 'queued') return job.attempts <= job.job.maxAttempts
  return job.status === 'running'
    && (!Number.isSafeInteger(job.leaseExpiresAtMs) || job.leaseExpiresAtMs! <= nowMs)
}
