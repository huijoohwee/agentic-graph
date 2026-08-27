import React from 'react'
import { MeshStandardMaterial } from 'three'
import {
  applyXrV2MountedAuthoringVisibilityEdit,
  bindMaterialGraphToMeshStandardMaterial,
  createXrV2ReadinessSnapshot,
  MATERIAL_GRAPH_SCHEMA,
  projectCanonicalAuthoringEcsWorld,
  runXrV2PinnedContractConformanceProbe,
  validateXrV2DevRuntimeEvidence,
  validateXrV2PinnedContractConformanceEvidence,
  XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
  type XrV2DevRuntimeEvidence,
  type XrV2PinnedContractConformanceEvidence,
} from '@/features/xr-v2'
import { XrV2MountedAuthoringSmokeSurface } from '@/features/xr-v2/XrV2MountedAuthoringSmokeSurface'
import { type GanttTimelineTransportCommandAdapter } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { renderVideoSequenceExport } from '@/components/timeline/videoSequenceExport'
import {
  createXrV2EditedMediaPlan,
  createXrV2EncodedTrackWebmFixture,
  observeXrV2Playback,
  probeXrV2ConnectedPreviewOverWebRtc,
  probeMountedXrV2TimelinePanel,
  readXrV2MediaError,
  releaseXrV2ObservedMedia,
  seekXrV2Playback,
  SMOKE_MEDIA_GANTT_CODE,
  SMOKE_RUNTIME_DOCUMENT_KEY,
  waitForXrV2DecodedMetadata,
  waitForXrV2MountedAuthoringBrowserEvidence,
  waitForXrV2ObservationQuiescence,
  waitForXrV2ReleasedMediaState,
  type XrV2ExternalTimelineOwnerState,
  type XrV2ConnectedPreviewBrowserObservation,
  type XrV2EncodedTrackBrowserObservation,
  type XrV2MediaCleanupObservation,
  type XrV2MediaErrorObservation,
  type XrV2TimelineCommandObservation,
} from './xrV2BrowserObservationSupport'
import { allocateEntity, createWorld, registerComponent } from '../../../../ecs/index.js'
import { disposeWorld } from '../../../../ecs/world.js'
type SmokeState = Readonly<{
  phase: 'running' | 'observed' | 'failed'
  snapshot: ReturnType<typeof createXrV2ReadinessSnapshot>
  pinnedConformance: XrV2PinnedContractConformanceEvidence | null
  pinnedConformanceValidation: 'not-run' | 'valid'
  rawObservation: XrV2DevRuntimeEvidence
  observationValidation: 'not-run' | 'valid'
  timelineCommandObservation: XrV2TimelineCommandObservation
  playbackCurrentTime: number
  playbackEnded: boolean
  mediaCleanup: XrV2MediaCleanupObservation
  mediaErrors: readonly XrV2MediaErrorObservation[]
  connectedPreview: XrV2ConnectedPreviewBrowserObservation | null
  encodedTrackContainer: XrV2EncodedTrackBrowserObservation | null
  error: string
}>
const SOURCE_READINESS_SNAPSHOT = createXrV2ReadinessSnapshot({ entryMode: 'monocular-capture' })
const EMPTY_RAW_OBSERVATION: XrV2DevRuntimeEvidence = Object.freeze({
  schema: XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
  authoringAdapters: Object.freeze({
    canonicalEcsEntityZero: false,
    materialApplied: false,
    timelineCommandRouted: false,
  }),
  editedMedia: Object.freeze({
    byteSize: 0,
    mimeType: '',
    decodedWidth: 0,
    decodedHeight: 0,
    durationSeconds: null,
    unboundedDuration: false,
    playbackObserved: false,
  }),
})
const INITIAL_STATE: SmokeState = Object.freeze({
  phase: 'running',
  snapshot: SOURCE_READINESS_SNAPSHOT,
  pinnedConformance: null,
  pinnedConformanceValidation: 'not-run',
  rawObservation: EMPTY_RAW_OBSERVATION,
  observationValidation: 'not-run',
  timelineCommandObservation: Object.freeze({
    commandAction: 'nudge-forward',
    commandKind: 'clip-edit',
    handledCount: 0,
    panelRouteProven: false,
    targetIdentity: '',
  }),
  playbackCurrentTime: 0,
  playbackEnded: false,
  mediaCleanup: Object.freeze({
    browserQuiescent: false,
    objectUrlRevoked: false,
    revokedObjectUrl: '',
    videoNetworkStateEmpty: false,
    videoSrcAttributeRemoved: false,
  }),
  mediaErrors: Object.freeze([]),
  connectedPreview: null,
  encodedTrackContainer: null,
  error: '',
})
function EvidenceRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <li className="flex items-center justify-between gap-4 border-b border-white/10 py-2 last:border-b-0">
      <span>{label}</span>
      <strong className="font-mono text-xs uppercase tracking-wide">{value}</strong>
    </li>
  )
}
export function XrV2RuntimeSmokePage() {
  const [state, setState] = React.useState<SmokeState>(INITIAL_STATE)
  const playbackVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const encodedTrackVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const timelinePanelWrapperRef = React.useRef<HTMLElement | null>(null)
  const externalTimelineOwnerRef = React.useRef<XrV2ExternalTimelineOwnerState>({
    commandAction: '',
    handledCount: 0,
    targetIdentity: '',
  })
  const timelineCommandAdapter = React.useMemo<GanttTimelineTransportCommandAdapter>(() => ({
    handleCommand: command => {
      if (command.kind !== 'clip-edit' || command.action !== 'nudge-forward') {
        return { reason: 'unsupported mounted Timeline smoke command', status: 'rejected' }
      }
      const owner = externalTimelineOwnerRef.current
      owner.commandAction = command.action
      owner.handledCount += 1
      owner.targetIdentity = [
        command.target.documentKey,
        command.target.selectedRowKey,
        command.target.playheadMinutes,
      ].join('|')
      return { status: 'handled' }
    },
  }), [])
  React.useEffect(() => {
    const abortController = new AbortController()
    let active = true
    let objectUrl = ''
    let encodedTrackObjectUrl = ''
    let activeWorld: object | null = null
    let disposeMaterial: (() => unknown) | null = null
    const video = playbackVideoRef.current
    const encodedTrackVideo = encodedTrackVideoRef.current
    const mediaErrors: XrV2MediaErrorObservation[] = []
    const onMediaError = () => {
      if (!video) return
      mediaErrors.push(readXrV2MediaError(video))
      if (active) {
        setState(previous => Object.freeze({
          ...previous,
          phase: previous.phase === 'observed' ? 'failed' : previous.phase,
          mediaErrors: Object.freeze([...mediaErrors]),
          error: previous.phase === 'observed'
            ? 'HTMLMediaElement emitted an error after the observation settled.'
            : previous.error,
        }))
      }
    }
    video?.addEventListener('error', onMediaError)
    const cleanupMedia = () => {
      const release = releaseXrV2ObservedMedia(video, objectUrl)
      objectUrl = ''
      return release
    }
    const cleanupEncodedTrackMedia = () => {
      const release = releaseXrV2ObservedMedia(encodedTrackVideo, encodedTrackObjectUrl)
      encodedTrackObjectUrl = ''
      return release
    }
    const run = async () => {
      try {
        externalTimelineOwnerRef.current = {
          commandAction: '',
          handledCount: 0,
          targetIdentity: '',
        }
        activeWorld = createWorld()
        registerComponent(activeWorld, 'Transform', { x: 'f32', y: 'f32' })
        const entityId = allocateEntity(activeWorld, {
          entityRef: 'xr.v2.runtime.smoke.entity-zero',
          components: { Transform: { x: 4, y: 8 } },
        })
        const ecsResult = projectCanonicalAuthoringEcsWorld(activeWorld, ['Transform'])
        const canonicalEcsEntityZero = entityId === 0
          && ecsResult.status === 'ready'
          && ecsResult.projection.entities.length === 1
          && ecsResult.projection.entities[0]?.entityId === 0
          && ecsResult.projection.entities[0]?.components.Transform?.x === 4
        disposeWorld(activeWorld)
        activeWorld = null
        const material = new MeshStandardMaterial({ color: '#000000', roughness: 1 })
        const bindingResult = bindMaterialGraphToMeshStandardMaterial(material)
        if (bindingResult.status !== 'ready') throw new Error('Three.js material binding was rejected.')
        disposeMaterial = () => {
          bindingResult.binding.dispose()
          material.dispose()
        }
        const applied = bindingResult.binding.apply({
          schema: MATERIAL_GRAPH_SCHEMA,
          nodes: [
            { id: 'albedo', type: 'color', value: '#336699' },
            { id: 'roughness', type: 'number', value: 0.25 },
            {
              id: 'output',
              type: 'mesh-standard-output',
              bindings: { color: 'albedo', roughness: 'roughness' },
            },
          ],
        })
        const materialApplied = applied.status === 'ready'
          && material.color.getHexString() === '336699'
          && material.roughness === 0.25
        const disposedMaterial = bindingResult.binding.dispose()
        material.dispose()
        disposeMaterial = null
        if (!disposedMaterial.bindingDisposed) throw new Error('Three.js material binding was not disposed.')

        const timelinePanelWrapper = timelinePanelWrapperRef.current
        if (!timelinePanelWrapper) throw new Error('Mounted Timeline observation wrapper is unavailable.')
        const timelineCommandProbe = await probeMountedXrV2TimelinePanel({
          externalOwner: externalTimelineOwnerRef.current,
          signal: abortController.signal,
          wrapper: timelinePanelWrapper,
        })
        const mountedAuthoring = await waitForXrV2MountedAuthoringBrowserEvidence(abortController.signal)
        if (!mountedAuthoring.source) throw new Error('Mounted authoring source identity is unavailable.')
        const authoredEdit = await applyXrV2MountedAuthoringVisibilityEdit({
          entityRef: 'scene.hero',
          visible: false,
          sourceDigest: mountedAuthoring.source.sourceDigest,
          graphDataRevision: mountedAuthoring.source.graphDataRevision,
          signal: abortController.signal,
        })
        const connectedPreview = await probeXrV2ConnectedPreviewOverWebRtc(
          abortController.signal,
          authoredEdit,
        )
        if (!connectedPreview.withinCeiling
          || !connectedPreview.editApplied
          || connectedPreview.authorRevision !== connectedPreview.viewerRevision
          || connectedPreview.navigationEntryCountAfter !== connectedPreview.navigationEntryCountBefore
          || !connectedPreview.documentIdentityPreserved) {
          throw new Error('Connected WebRTC preview observation did not satisfy the bounded no-reload contract.')
        }
        if (!encodedTrackVideo) throw new Error('Encoded-track WebM playback element is unavailable.')
        const encodedTrackFixture = await createXrV2EncodedTrackWebmFixture(abortController.signal)
        encodedTrackVideo.muted = true
        encodedTrackVideo.playsInline = true
        encodedTrackObjectUrl = URL.createObjectURL(encodedTrackFixture.blob)
        encodedTrackVideo.src = encodedTrackObjectUrl
        const encodedTrackDecoded = await waitForXrV2DecodedMetadata(
          encodedTrackVideo,
          abortController.signal,
        )
        if (!Number.isFinite(encodedTrackDecoded.duration) || encodedTrackDecoded.duration <= 0) {
          throw new Error('Encoded-track WebM did not expose a finite duration.')
        }
        const seekTarget = Math.min(0.14, encodedTrackDecoded.duration * 0.55)
        const seekTimeSeconds = await seekXrV2Playback(
          encodedTrackVideo,
          seekTarget,
          abortController.signal,
        )
        await seekXrV2Playback(encodedTrackVideo, 0, abortController.signal)
        const encodedTrackPlayback = await observeXrV2Playback(
          encodedTrackVideo,
          abortController.signal,
          false,
        )
        const encodedTrackPlaybackObserved = encodedTrackPlayback.currentTime >= 0.05
          || encodedTrackPlayback.ended
        const releasedEncodedTrack = cleanupEncodedTrackMedia()
        const releasedEncodedTrackState = await waitForXrV2ReleasedMediaState(
          encodedTrackVideo,
          abortController.signal,
        )
        const encodedTrackContainer = Object.freeze({
          schema: 'agenticgraph-xr-v2-encoded-track-browser-observation/v1' as const,
          byteSize: encodedTrackFixture.blob.size,
          trackCount: encodedTrackFixture.inventory.tracks.length,
          sourceCodecs: encodedTrackFixture.sourceCodecs,
          packagedCodecs: Object.freeze(encodedTrackFixture.inventory.tracks.map(track => track.codec)),
          sourceSampleCounts: encodedTrackFixture.sourceSampleCounts,
          decodedSourceFrameCounts: encodedTrackFixture.decodedSourceFrameCounts,
          packagedSampleCounts: Object.freeze(encodedTrackFixture.inventory.tracks.map(track => track.sampleCount)),
          exactPayloadsVerified: encodedTrackFixture.exactPayloadsVerified,
          seekHeadEntryCount: encodedTrackFixture.inventory.seekHeadEntryCount,
          cuePointCount: encodedTrackFixture.inventory.cuePointCount,
          decodedWidth: encodedTrackDecoded.width,
          decodedHeight: encodedTrackDecoded.height,
          durationSeconds: encodedTrackDecoded.duration,
          seekTimeSeconds,
          playbackObserved: encodedTrackPlaybackObserved,
          sourceReleased: releasedEncodedTrack.objectUrlRevoked
            && releasedEncodedTrack.videoSrcAttributeRemoved
            && releasedEncodedTrackState.videoNetworkStateEmpty
            && releasedEncodedTrackState.videoSrcAttributeRemoved,
        })
        if (encodedTrackContainer.trackCount !== 2
          || encodedTrackContainer.sourceCodecs.join(',') !== encodedTrackContainer.packagedCodecs.join(',')
          || encodedTrackContainer.sourceSampleCounts.join(',') !== encodedTrackContainer.packagedSampleCounts.join(',')
          || encodedTrackContainer.decodedSourceFrameCounts.join(',') !== encodedTrackContainer.sourceSampleCounts.join(',')
          || !encodedTrackContainer.exactPayloadsVerified
          || encodedTrackContainer.seekHeadEntryCount < 3
          || encodedTrackContainer.cuePointCount < 2
          || encodedTrackContainer.decodedWidth <= 0
          || encodedTrackContainer.decodedHeight <= 0
          || encodedTrackContainer.seekTimeSeconds < 0.05
          || !encodedTrackContainer.playbackObserved
          || !encodedTrackContainer.sourceReleased) {
          throw new Error('Encoded-track WebM browser observation did not preserve, seek, play, and release its tracks.')
        }
        const pinnedConformance = await runXrV2PinnedContractConformanceProbe()
        const pinnedValidation = validateXrV2PinnedContractConformanceEvidence(pinnedConformance)
        if (pinnedValidation.status !== 'valid' || pinnedConformance.overall !== 'partial') {
          throw new Error('Pinned AC-1 through AC-12 conformance evidence exceeded partial authority.')
        }
        const blob = await renderVideoSequenceExport({
          kind: 'video',
          plan: createXrV2EditedMediaPlan(),
          signal: abortController.signal,
        })
        if (blob.size <= 0 || !blob.type.toLowerCase().startsWith('video/')) {
          throw new Error('Edited-media export returned an invalid video Blob.')
        }
        if (!video) throw new Error('Edited-media playback element is unavailable.')
        video.muted = true
        video.playsInline = true
        objectUrl = URL.createObjectURL(blob)
        video.src = objectUrl
        const decoded = await waitForXrV2DecodedMetadata(video, abortController.signal)
        const initiallyUnbounded = decoded.duration === Number.POSITIVE_INFINITY
        if (decoded.width <= 0 || decoded.height <= 0) {
          throw new Error('Edited-media decode did not expose positive video dimensions.')
        }
        if (!(Number.isFinite(decoded.duration) && decoded.duration > 0) && !initiallyUnbounded) {
          throw new Error('Edited-media decode did not expose valid duration semantics.')
        }
        const playback = await observeXrV2Playback(video, abortController.signal, initiallyUnbounded)
        const playbackObserved = playback.currentTime >= 0.05 || playback.ended
        const finalDuration = Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : Number.isFinite(decoded.duration) && decoded.duration > 0
            ? decoded.duration
            : null
        const unboundedDuration = finalDuration === null && initiallyUnbounded
        const rawObservation: XrV2DevRuntimeEvidence = Object.freeze({
          schema: XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
          authoringAdapters: Object.freeze({
            canonicalEcsEntityZero,
            materialApplied,
            timelineCommandRouted: timelineCommandProbe.routed,
          }),
          editedMedia: Object.freeze({
            byteSize: blob.size,
            mimeType: blob.type,
            decodedWidth: decoded.width,
            decodedHeight: decoded.height,
            durationSeconds: finalDuration,
            unboundedDuration,
            playbackObserved,
          }),
        })
        const validation = validateXrV2DevRuntimeEvidence(rawObservation)
        if (validation.status !== 'valid') {
          throw new Error(`Raw browser observation was invalid: ${validation.reason}`)
        }
        const releasedMedia = cleanupMedia()
        const releasedMediaState = await waitForXrV2ReleasedMediaState(
          video,
          abortController.signal,
        )
        await waitForXrV2ObservationQuiescence(abortController.signal)
        const mediaCleanup = Object.freeze({
          browserQuiescent: true,
          objectUrlRevoked: releasedMedia.objectUrlRevoked,
          revokedObjectUrl: releasedMedia.revokedObjectUrl,
          videoNetworkStateEmpty: releasedMediaState.videoNetworkStateEmpty,
          videoSrcAttributeRemoved: releasedMedia.videoSrcAttributeRemoved
            && releasedMediaState.videoSrcAttributeRemoved,
        })
        if (!mediaCleanup.browserQuiescent
          || !mediaCleanup.objectUrlRevoked
          || !mediaCleanup.revokedObjectUrl
          || !mediaCleanup.videoNetworkStateEmpty
          || !mediaCleanup.videoSrcAttributeRemoved) {
          throw new Error('Edited-media cleanup observation was incomplete.')
        }
        if (mediaErrors.length) throw new Error('Edited-media element emitted an error event.')
        if (SOURCE_READINESS_SNAPSHOT.overall !== 'source-ready') {
          throw new Error('Browser observation page exceeded source-readiness authority.')
        }
        if (active) {
          setState(Object.freeze({
            phase: 'observed',
            snapshot: SOURCE_READINESS_SNAPSHOT,
            pinnedConformance,
            pinnedConformanceValidation: 'valid',
            rawObservation,
            observationValidation: 'valid',
            timelineCommandObservation: timelineCommandProbe.observation,
            playbackCurrentTime: playback.currentTime,
            playbackEnded: playback.ended,
            mediaCleanup,
            mediaErrors: Object.freeze([...mediaErrors]),
            connectedPreview,
            encodedTrackContainer,
            error: '',
          }))
        }
      } catch (error) {
        cleanupMedia()
        cleanupEncodedTrackMedia()
        if (active && !abortController.signal.aborted) {
          setState(Object.freeze({
            ...INITIAL_STATE,
            phase: 'failed',
            mediaErrors: Object.freeze([...mediaErrors]),
            error: error instanceof Error ? error.message : String(error),
          }))
        }
      } finally {
        disposeMaterial?.()
        disposeMaterial = null
        if (activeWorld) disposeWorld(activeWorld)
        activeWorld = null
      }
    }
    void run()
    return () => {
      active = false
      abortController.abort()
      disposeMaterial?.()
      if (activeWorld) disposeWorld(activeWorld)
      cleanupMedia()
      cleanupEncodedTrackMedia()
      video?.removeEventListener('error', onMediaError)
    }
  }, [])
  const { editedMedia } = state.rawObservation
  const durationValue = editedMedia.durationSeconds === null ? '' : String(editedMedia.durationSeconds)
  const pinnedConformanceJson = state.pinnedConformance
    ? JSON.stringify(state.pinnedConformance)
    : ''
  return (
    <main
      className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100"
      aria-label="XR v2 deterministic browser observation"
      data-kg-xr-v2-runtime-smoke="1"
      data-kg-xr-v2-browser-observation-state={state.phase}
      data-kg-xr-v2-readiness-schema={state.snapshot.schema}
      data-kg-xr-v2-readiness-scope={state.snapshot.scope}
      data-kg-xr-v2-readiness-status={state.snapshot.overall}
      data-kg-xr-v2-raw-observation-schema={state.rawObservation.schema}
      data-kg-xr-v2-raw-observation-validation={state.observationValidation}
      data-kg-xr-v2-entry-mode={state.snapshot.entryMode}
      data-kg-xr-v2-capability-status={state.snapshot.evidence.capabilityDetection}
      data-kg-xr-v2-capture-status={state.snapshot.evidence.captureFallback}
      data-kg-xr-v2-authoring-status={state.snapshot.evidence.authoringAdapters}
      data-kg-xr-v2-model-asset-status={state.snapshot.evidence.liveDepthSynthesis}
      data-kg-xr-v2-browser-status={state.snapshot.evidence.browserPlayback}
      data-kg-xr-v2-physical-device-status={state.snapshot.evidence.physicalDevice}
      data-kg-xr-v2-blocked-reasons={state.snapshot.blockedReasons.join('|')}
      data-kg-xr-v2-ecs-entity-zero-probe={String(state.rawObservation.authoringAdapters.canonicalEcsEntityZero)}
      data-kg-xr-v2-material-applied-probe={String(state.rawObservation.authoringAdapters.materialApplied)}
      data-kg-xr-v2-timeline-command-probe={String(state.rawObservation.authoringAdapters.timelineCommandRouted)}
      data-kg-xr-v2-timeline-command-kind={state.timelineCommandObservation.commandKind}
      data-kg-xr-v2-timeline-command-action={state.timelineCommandObservation.commandAction}
      data-kg-xr-v2-timeline-command-handled-count={String(state.timelineCommandObservation.handledCount)}
      data-kg-xr-v2-timeline-panel-route-probe={String(state.timelineCommandObservation.panelRouteProven)}
      data-kg-xr-v2-timeline-command-target-identity={state.timelineCommandObservation.targetIdentity}
      data-kg-xr-v2-blob-byte-size={String(editedMedia.byteSize)}
      data-kg-xr-v2-blob-mime-type={editedMedia.mimeType}
      data-kg-xr-v2-decoded-width={String(editedMedia.decodedWidth)}
      data-kg-xr-v2-decoded-height={String(editedMedia.decodedHeight)}
      data-kg-xr-v2-decoded-duration-seconds={durationValue}
      data-kg-xr-v2-unbounded-duration={String(editedMedia.unboundedDuration)}
      data-kg-xr-v2-playback-observed={String(editedMedia.playbackObserved)}
      data-kg-xr-v2-playback-current-time={String(state.playbackCurrentTime)}
      data-kg-xr-v2-playback-ended={String(state.playbackEnded)}
      data-kg-xr-v2-media-errors={JSON.stringify(state.mediaErrors)}
      data-kg-xr-v2-video-src-attribute-removed={String(state.mediaCleanup.videoSrcAttributeRemoved)}
      data-kg-xr-v2-video-network-state-empty={String(state.mediaCleanup.videoNetworkStateEmpty)}
      data-kg-xr-v2-object-url-revoked={String(state.mediaCleanup.objectUrlRevoked)}
      data-kg-xr-v2-revoked-object-url={state.mediaCleanup.revokedObjectUrl}
      data-kg-xr-v2-browser-quiescent={String(state.mediaCleanup.browserQuiescent)}
      data-kg-xr-v2-pinned-conformance-validation={state.pinnedConformanceValidation}
      data-kg-xr-v2-connected-preview-schema={state.connectedPreview?.schema || ''}
      data-kg-xr-v2-connected-preview-transport={state.connectedPreview?.transport || ''}
      data-kg-xr-v2-connected-preview-author-revision={String(state.connectedPreview?.authorRevision ?? 0)}
      data-kg-xr-v2-connected-preview-viewer-revision={String(state.connectedPreview?.viewerRevision ?? 0)}
      data-kg-xr-v2-connected-preview-applied={String(state.connectedPreview?.editApplied ?? false)}
      data-kg-xr-v2-connected-preview-latency-ms={String(state.connectedPreview?.latencyMs ?? -1)}
      data-kg-xr-v2-connected-preview-within-ceiling={String(state.connectedPreview?.withinCeiling ?? false)}
      data-kg-xr-v2-connected-preview-navigation-before={String(state.connectedPreview?.navigationEntryCountBefore ?? -1)}
      data-kg-xr-v2-connected-preview-navigation-after={String(state.connectedPreview?.navigationEntryCountAfter ?? -1)}
      data-kg-xr-v2-connected-preview-document-preserved={String(state.connectedPreview?.documentIdentityPreserved ?? false)}
      data-kg-xr-v2-encoded-track-schema={state.encodedTrackContainer?.schema || ''}
      data-kg-xr-v2-encoded-track-byte-size={String(state.encodedTrackContainer?.byteSize ?? 0)}
      data-kg-xr-v2-encoded-track-count={String(state.encodedTrackContainer?.trackCount ?? 0)}
      data-kg-xr-v2-encoded-track-source-codecs={state.encodedTrackContainer?.sourceCodecs.join(',') || ''}
      data-kg-xr-v2-encoded-track-packaged-codecs={state.encodedTrackContainer?.packagedCodecs.join(',') || ''}
      data-kg-xr-v2-encoded-track-source-samples={state.encodedTrackContainer?.sourceSampleCounts.join(',') || ''}
      data-kg-xr-v2-encoded-track-decoded-source-frames={state.encodedTrackContainer?.decodedSourceFrameCounts.join(',') || ''}
      data-kg-xr-v2-encoded-track-packaged-samples={state.encodedTrackContainer?.packagedSampleCounts.join(',') || ''}
      data-kg-xr-v2-encoded-track-payloads-verified={String(state.encodedTrackContainer?.exactPayloadsVerified ?? false)}
      data-kg-xr-v2-encoded-track-seek-head-count={String(state.encodedTrackContainer?.seekHeadEntryCount ?? 0)}
      data-kg-xr-v2-encoded-track-cue-count={String(state.encodedTrackContainer?.cuePointCount ?? 0)}
      data-kg-xr-v2-encoded-track-decoded-width={String(state.encodedTrackContainer?.decodedWidth ?? 0)}
      data-kg-xr-v2-encoded-track-decoded-height={String(state.encodedTrackContainer?.decodedHeight ?? 0)}
      data-kg-xr-v2-encoded-track-duration={String(state.encodedTrackContainer?.durationSeconds ?? 0)}
      data-kg-xr-v2-encoded-track-seek-time={String(state.encodedTrackContainer?.seekTimeSeconds ?? 0)}
      data-kg-xr-v2-encoded-track-playback={String(state.encodedTrackContainer?.playbackObserved ?? false)}
      data-kg-xr-v2-encoded-track-source-released={String(state.encodedTrackContainer?.sourceReleased ?? false)}
      data-kg-xr-v2-observation-error={state.error}
    >
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-2xl">
        <header>
          <p className="m-0 text-xs uppercase tracking-[0.2em] text-sky-300">Review-candidate observation</p>
          <h1 className="mt-2 text-2xl font-semibold">XR v2 browser behavior</h1>
          <p className="text-sm text-slate-300">
            This page exercises canonical ECS, Three.js material, Timeline command, export, decode,
            playback, and cleanup without promoting its source-ready readiness snapshot.
          </p>
        </header>
        <XrV2MountedAuthoringSmokeSurface />
        <section
          ref={timelinePanelWrapperRef}
          className="mt-5 overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
          aria-label="XR v2 mounted Timeline panel route proof"
          data-kg-xr-v2-timeline-panel-route="mounted"
        >
          <GanttTimelineTransportPanel
            code={SMOKE_MEDIA_GANTT_CODE}
            compact
            commandAdapter={timelineCommandAdapter}
            editable
            mode="media"
            publishPlaybackRequest={false}
            runtimeDocumentKey={SMOKE_RUNTIME_DOCUMENT_KEY}
            runtimeDurationSeconds={0.4}
            runtimeFrameRate={30}
          />
        </section>
        <video
          ref={playbackVideoRef}
          className="mt-5 aspect-video w-full rounded-xl bg-black"
          aria-label="XR v2 edited-media playback proof"
          muted
          playsInline
          preload="auto"
        />
        <video
          ref={encodedTrackVideoRef}
          className="mt-5 aspect-video w-full rounded-xl bg-black"
          aria-label="XR v2 encoded-track WebM playback proof"
          muted
          playsInline
          preload="auto"
        />
        <section
          hidden
          aria-hidden="true"
          data-kg-xr-v2-pinned-conformance-artifact="1"
          data-kg-xr-v2-pinned-conformance-evidence={pinnedConformanceJson}
        />
        <ul className="mt-6 rounded-2xl border border-slate-700 bg-black/20 px-4 text-sm">
          <EvidenceRow label="Observation state" value={state.phase} />
          <EvidenceRow label="Page readiness" value={state.snapshot.overall} />
          <EvidenceRow label="Raw observation validation" value={state.observationValidation} />
          <EvidenceRow label="Canonical ECS entity zero" value={String(state.rawObservation.authoringAdapters.canonicalEcsEntityZero)} />
          <EvidenceRow label="Three.js material applied" value={String(state.rawObservation.authoringAdapters.materialApplied)} />
          <EvidenceRow label="Timeline command routed" value={String(state.rawObservation.authoringAdapters.timelineCommandRouted)} />
          <EvidenceRow label="Connected preview transport" value={state.connectedPreview?.transport || 'not-observed'} />
          <EvidenceRow label="Connected preview latency" value={state.connectedPreview ? `${state.connectedPreview.latencyMs.toFixed(2)} ms` : 'not-observed'} />
          <EvidenceRow label="Encoded tracks preserved" value={String(state.encodedTrackContainer?.exactPayloadsVerified ?? false)} />
          <EvidenceRow label="Encoded-track browser playback" value={String(state.encodedTrackContainer?.playbackObserved ?? false)} />
          <EvidenceRow label="Edited-media bytes" value={String(editedMedia.byteSize)} />
          <EvidenceRow label="Media source attribute removed" value={String(state.mediaCleanup.videoSrcAttributeRemoved)} />
          <EvidenceRow label="Object URL revoked" value={String(state.mediaCleanup.objectUrlRevoked)} />
          <EvidenceRow label="Pinned AC-1–AC-12 authority" value={state.pinnedConformance?.overall || 'not-observed'} />
          <EvidenceRow label="Depth model assets" value={state.snapshot.evidence.liveDepthSynthesis} />
          <EvidenceRow label="Physical device" value={state.snapshot.evidence.physicalDevice} />
        </ul>
        {state.error ? <p className="mt-4 text-xs text-red-300">{state.error}</p> : null}
        <p className="mt-4 text-xs text-amber-200" data-kg-xr-v2-blocked-summary="1">
          {state.snapshot.blockedReasons.join('; ')}
        </p>
      </section>
    </main>
  )
}
