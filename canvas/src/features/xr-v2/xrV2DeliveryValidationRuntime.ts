import {
  probeXrV2ConnectedPreviewOverWebRtc,
  type XrV2ConnectedPreviewAuthoringEdit,
  type XrV2ConnectedPreviewBrowserObservation,
} from './browserRuntimeEvidence'
import type { XrV2SavedSpatialAssetResource } from './xrV2SavedAssetCatalog'
import {
  createXrV2SavedAssetEncodedTrackFixture,
  type XrV2SavedAssetEncodedTrackFixture,
} from './xrV2SavedAssetPackagingRuntime'
import type { XrV2ConnectedPreviewViewerSession } from './xrV2ConnectedPreviewViewerRuntime'
import { XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER } from './xrV2CrossDeviceAssetManifest'
import { XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS } from './connectedPreviewTransport'

export const XR_V2_DELIVERY_ACTION_TIMEOUT_MS = 12_000
export const XR_V2_CONNECTED_PREVIEW_ACTION_TIMEOUT_MS = 12_000
export const XR_V2_SAVED_ASSET_SCOPE = 'local-first-explicit-existing-storage' as const
export const XR_V2_CROSS_DEVICE_BLOCKER = XR_V2_CROSS_DEVICE_EXTERNAL_PROMOTION_BLOCKER

export type XrV2BrowserPackagingEvidence = Readonly<{
  schema: 'knowgrph-xr-v2-browser-packaging-action/v1'
  sourceAssetId: string
  sourceSessionId: string
  sourceFrameCount: number
  sourceRawClipRef: string
  sourceRawClipMimeType: string
  sourceRawClipByteSize: number
  sourceRawClipSha256: `sha256:${string}`
  sourceDepthMetadataRef: string
  sourceTrackProducer: 'captured-frame-bundle-webcodecs'
  sourceTracksProducedBeforeMux: true
  byteSize: number
  trackCount: number
  codecs: readonly string[]
  sampleCounts: readonly number[]
  exactPayloadsVerified: boolean
  decodedWidth: number
  decodedHeight: number
  durationSeconds: number
  playbackObserved: true
}>

export type XrV2BrowserPackagingLease = Readonly<{
  evidence: XrV2BrowserPackagingEvidence
  release(): void
}>

type PlaybackObservation = Readonly<{
  decodedWidth: number
  decodedHeight: number
  durationSeconds: number
  currentTimeSeconds: number
  attached: true
}>

type PackagingDependencies = Readonly<{
  createFixture?: (
    resource: XrV2SavedSpatialAssetResource,
    signal: AbortSignal,
  ) => Promise<XrV2SavedAssetEncodedTrackFixture>
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
  observePlayback?: (
    video: HTMLVideoElement,
    playbackUrl: string,
    signal: AbortSignal,
  ) => Promise<PlaybackObservation>
}>

function normalizeError(error: unknown, fallback: string): Error {
  return error instanceof Error && error.message.trim() ? error : new Error(fallback)
}

function cleanupVideo(video: HTMLVideoElement): void {
  try { video.pause() } catch { /* media may already be detached */ }
  video.removeAttribute('src')
  try { video.load() } catch { /* detached test elements need no reload */ }
}

function observeBrowserPlayback(
  video: HTMLVideoElement,
  playbackUrl: string,
  signal: AbortSignal,
): Promise<PlaybackObservation> {
  if (!playbackUrl.startsWith('blob:')) {
    return Promise.reject(new Error('XR packaging playback requires a local blob URL'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      if (timeout !== null) clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('timeupdate', onProgress)
      video.removeEventListener('ended', onProgress)
      video.removeEventListener('error', onError)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else if (!video.isConnected) reject(new Error('XR packaging playback surface detached before evidence'))
      else resolve(Object.freeze({
        decodedWidth: video.videoWidth, decodedHeight: video.videoHeight,
        durationSeconds: video.duration, currentTimeSeconds: video.currentTime, attached: true as const,
      }))
    }
    const onAbort = () => finish(new Error('XR packaging action was cancelled'))
    const onError = () => finish(new Error(`XR packaging playback failed with media code ${video.error?.code || 0}`))
    const onProgress = () => {
      if (video.isConnected && (video.currentTime >= 0.05 || video.ended)
        && video.videoWidth > 0
        && video.videoHeight > 0
        && Number.isFinite(video.duration)
        && video.duration > 0) finish()
    }
    const onLoaded = () => {
      void video.play().then(onProgress, error => finish(normalizeError(error, 'XR packaging playback was rejected')))
    }
    if (signal.aborted) {
      finish(new Error('XR packaging action was cancelled'))
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('timeupdate', onProgress)
    video.addEventListener('ended', onProgress)
    video.addEventListener('error', onError, { once: true })
    timeout = setTimeout(
      () => finish(new Error('XR packaging playback did not advance before the bounded timeout')),
      XR_V2_DELIVERY_ACTION_TIMEOUT_MS,
    )
    video.muted = true
    video.playsInline = true
    video.src = playbackUrl
    video.load()
  })
}

export async function runXrV2BrowserPackagingAction(
  video: HTMLVideoElement,
  signal: AbortSignal,
  resource: XrV2SavedSpatialAssetResource,
  dependencies: PackagingDependencies = {},
): Promise<XrV2BrowserPackagingLease> {
  if (!video?.isConnected) throw new Error('XR packaging action requires its attached browser video element')
  if (signal.aborted) throw new Error('XR packaging action was cancelled')
  const sourceAssetId = String(resource?.asset?.asset_id || '').trim()
  const sourceFrameCount = resource?.frameBundle?.frames.length || 0
  if (!sourceAssetId || sourceFrameCount < 1) {
    throw new Error('Open a persisted XR capture with saved frames before packaging')
  }
  const createFixture = dependencies.createFixture || createXrV2SavedAssetEncodedTrackFixture
  const createObjectUrl = dependencies.createObjectUrl || (blob => URL.createObjectURL(blob))
  const revokeObjectUrl = dependencies.revokeObjectUrl || (url => URL.revokeObjectURL(url))
  const observePlayback = dependencies.observePlayback || observeBrowserPlayback
  const actionAbortController = new AbortController()
  const onAbort = () => actionAbortController.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<never>((_resolve, reject) => {
    deadlineTimer = setTimeout(() => {
      actionAbortController.abort()
      reject(new Error('XR packaging action exceeded its hard overall deadline'))
    }, XR_V2_DELIVERY_ACTION_TIMEOUT_MS)
  })
  const operation = (async () => {
    const fixture = await createFixture(resource, actionAbortController.signal)
    if (!video.isConnected) throw new Error('XR packaging playback surface detached during packaging')
  if (!fixture.exactPayloadsVerified
    || !fixture.sourceTracksProducedBeforeMux
    || fixture.sourceTrackProducer !== 'captured-frame-bundle-webcodecs'
    || fixture.sourceSessionId !== resource.asset.session_id
    || fixture.sourceRawClipRef !== resource.asset.raw_clip_ref
    || fixture.sourceRawClipMimeType !== resource.rawClip.type
    || fixture.sourceRawClipByteSize !== resource.rawClip.size
    || !/^sha256:[0-9a-f]{64}$/.test(fixture.sourceRawClipSha256)
    || fixture.sourceDepthMetadataRef !== resource.asset.metadata.depth_metadata_ref
    || fixture.inventory.tracks.length !== fixture.sourceCodecs.length
    || fixture.inventory.tracks.some((track, index) => track.codec !== fixture.sourceCodecs[index])
    || fixture.inventory.tracks.some((track, index) => track.sampleCount !== fixture.sourceSampleCounts[index])
    || fixture.sourceSampleCounts.some((count, index) => fixture.decodedSourceFrameCounts[index] !== count)) {
    throw new Error('XR packaging action did not preserve the encoded track inventory')
  }
    const playbackUrl = createObjectUrl(fixture.blob)
    let released = false
    const release = () => {
      if (released) return
      released = true
      cleanupVideo(video)
      revokeObjectUrl(playbackUrl)
    }
    try {
      const playback = await observePlayback(video, playbackUrl, actionAbortController.signal)
    if (!playback.attached || !video.isConnected
      || playback.decodedWidth < 1 || playback.decodedHeight < 1
      || !Number.isFinite(playback.durationSeconds) || playback.durationSeconds <= 0
      || !Number.isFinite(playback.currentTimeSeconds) || playback.currentTimeSeconds < 0.05) {
      throw new Error('XR packaging action did not decode a playable browser frame')
    }
    return Object.freeze({
      evidence: Object.freeze({
        schema: 'knowgrph-xr-v2-browser-packaging-action/v1',
        sourceAssetId,
        sourceSessionId: fixture.sourceSessionId,
        sourceFrameCount,
        sourceRawClipRef: fixture.sourceRawClipRef,
        sourceRawClipMimeType: fixture.sourceRawClipMimeType,
        sourceRawClipByteSize: fixture.sourceRawClipByteSize,
        sourceRawClipSha256: fixture.sourceRawClipSha256,
        sourceDepthMetadataRef: fixture.sourceDepthMetadataRef,
        sourceTrackProducer: fixture.sourceTrackProducer,
        sourceTracksProducedBeforeMux: true,
        byteSize: fixture.blob.size,
        trackCount: fixture.inventory.tracks.length,
        codecs: Object.freeze(fixture.inventory.tracks.map(track => track.codec)),
        sampleCounts: Object.freeze(fixture.inventory.tracks.map(track => track.sampleCount)),
        exactPayloadsVerified: true,
        decodedWidth: playback.decodedWidth,
        decodedHeight: playback.decodedHeight,
        durationSeconds: playback.durationSeconds,
        playbackObserved: true,
      }),
      release,
    })
    } catch (error) {
      release()
      throw normalizeError(error, 'XR packaging action failed')
    }
  })()
  try {
    return await Promise.race([operation, deadline])
  } finally {
    if (deadlineTimer !== null) clearTimeout(deadlineTimer)
    signal.removeEventListener('abort', onAbort)
    actionAbortController.abort()
  }
}

export async function runXrV2ConnectedPreviewAction(
  signal: AbortSignal,
  authoringEdit: XrV2ConnectedPreviewAuthoringEdit,
  options: Readonly<{
    viewerSession: XrV2ConnectedPreviewViewerSession
    probe?: (
      signal: AbortSignal,
      edit: XrV2ConnectedPreviewAuthoringEdit,
      viewerSession: XrV2ConnectedPreviewViewerSession,
    ) => Promise<XrV2ConnectedPreviewBrowserObservation>
    deadlineMs?: number
  }>,
): Promise<XrV2ConnectedPreviewBrowserObservation> {
  if (signal.aborted) throw new Error('XR connected-preview action was cancelled')
  if (!options?.viewerSession) throw new Error('XR connected-preview action requires its mounted viewer session')
  const deadlineMs = options.deadlineMs ?? XR_V2_CONNECTED_PREVIEW_ACTION_TIMEOUT_MS
  const probe = options.probe || probeXrV2ConnectedPreviewOverWebRtc
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 10 || deadlineMs > 30_000) {
    throw new Error('XR connected-preview deadline is outside the supported bound')
  }
  const actionAbortController = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | null = null
  let rejectDeadline: ((error: Error) => void) | null = null
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject })
  const onAbort = () => {
    actionAbortController.abort()
    rejectDeadline?.(new Error('XR connected-preview action was cancelled'))
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  timeout = setTimeout(() => {
    actionAbortController.abort()
    rejectDeadline?.(new Error('XR connected-preview action exceeded its hard overall deadline'))
  }, deadlineMs)
  let evidence: XrV2ConnectedPreviewBrowserObservation
  try {
    evidence = await Promise.race([
      probe(actionAbortController.signal, authoringEdit, options.viewerSession),
      deadline,
    ])
  } finally {
    if (timeout !== null) clearTimeout(timeout)
    signal.removeEventListener('abort', onAbort)
    actionAbortController.abort()
  }
  const viewerSnapshot = options.viewerSession.snapshot()
  const checks: readonly (readonly [code: string, passed: boolean])[] = [
    ['transport', evidence.transport === 'webrtc-data-channel'],
    ['schema', evidence.schema === 'knowgrph-xr-v2-connected-preview-browser-observation/v1'],
    ['edit-applied', evidence.editApplied === true],
    ['within-ceiling', evidence.withinCeiling === true],
    ['latency-finite-nonnegative', Number.isFinite(evidence.latencyMs) && evidence.latencyMs >= 0],
    ['latency-at-or-below-ceiling', evidence.latencyMs <= XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS],
    ['author-revision', Number.isSafeInteger(evidence.authorRevision) && evidence.authorRevision >= 1],
    ['viewer-revision', Number.isSafeInteger(evidence.viewerRevision) && evidence.viewerRevision >= 1],
    ['author-viewer-revision-match', evidence.authorRevision === evidence.viewerRevision],
    ['viewer-rendered-frame', evidence.viewerRenderedFrame === true],
    ['viewer-render-revision', Number.isSafeInteger(evidence.viewerRenderRevision) && evidence.viewerRenderRevision >= 1],
    ['viewer-render-revision-match', evidence.viewerRenderRevision === evidence.viewerRevision],
    ['viewer-render-time', Number.isFinite(evidence.viewerRenderedAtMs) && evidence.viewerRenderedAtMs >= 0],
    ['authoring-edit-revision', Number.isSafeInteger(evidence.authoringEditRevision) && evidence.authoringEditRevision >= 1],
    ['author-render-time', Number.isFinite(evidence.authorRenderedAtMs) && evidence.authorRenderedAtMs >= 0],
    ['navigation-before', Number.isSafeInteger(evidence.navigationEntryCountBefore) && evidence.navigationEntryCountBefore >= 0],
    ['navigation-after', Number.isSafeInteger(evidence.navigationEntryCountAfter) && evidence.navigationEntryCountAfter >= 0],
    ['entity-identity', evidence.entityRef === authoringEdit.entityRef],
    ['source-digest', evidence.sourceDigest === authoringEdit.sourceDigest],
    ['graph-data-revision', evidence.graphDataRevision === authoringEdit.graphDataRevision],
    ['authoring-edit-revision-match', evidence.authoringEditRevision === authoringEdit.authoringEditRevision],
    ['author-render-time-match', evidence.authorRenderedAtMs === authoringEdit.authorRenderedAtMs],
    ['requested-visible', evidence.requestedVisible === authoringEdit.visible],
    ['viewer-visible', evidence.viewerVisible === authoringEdit.visible],
    ['navigation-count-preserved', evidence.navigationEntryCountBefore === evidence.navigationEntryCountAfter],
    ['document-identity-preserved', evidence.documentIdentityPreserved === true],
    ['viewer-snapshot-attached', viewerSnapshot?.attached === true],
    ['viewer-snapshot-entity', viewerSnapshot?.entityRef === evidence.entityRef],
    ['viewer-snapshot-visible', viewerSnapshot?.visible === evidence.viewerVisible],
    ['viewer-snapshot-source-digest', viewerSnapshot?.sourceDigest === evidence.sourceDigest],
    ['viewer-snapshot-graph-revision', viewerSnapshot?.graphDataRevision === evidence.graphDataRevision],
    ['viewer-snapshot-edit-revision', viewerSnapshot?.authoringEditRevision === evidence.authoringEditRevision],
    ['viewer-snapshot-author-render-time', viewerSnapshot?.authorRenderedAtMs === evidence.authorRenderedAtMs],
    ['viewer-snapshot-revision', viewerSnapshot?.revision === evidence.viewerRevision],
    ['viewer-snapshot-render-time', viewerSnapshot?.renderedAtMs === evidence.viewerRenderedAtMs],
  ]
  const mismatches = checks.filter(([, passed]) => !passed).map(([code]) => code)
  if (mismatches.length > 0) {
    const diagnostic = JSON.stringify({
      mismatches,
      latencyMs: evidence.latencyMs,
      latencyCeilingMs: XR_V2_CONNECTED_PREVIEW_LATENCY_CEILING_MS,
      authorRevision: evidence.authorRevision,
      viewerRevision: evidence.viewerRevision,
      viewerRenderRevision: evidence.viewerRenderRevision,
      authoringEditRevision: evidence.authoringEditRevision,
      navigationEntryCountBefore: evidence.navigationEntryCountBefore,
      navigationEntryCountAfter: evidence.navigationEntryCountAfter,
      viewerSnapshotAttached: viewerSnapshot?.attached === true,
    })
    throw new Error(`XR connected-preview action did not satisfy edit, acknowledgement, latency, and no-reload evidence: ${diagnostic}`)
  }
  return evidence
}
