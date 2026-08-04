import React from 'react'
import { MeshStandardMaterial } from 'three'

import {
  bindMaterialGraphToMeshStandardMaterial,
  createXrV2ReadinessSnapshot,
  MATERIAL_GRAPH_SCHEMA,
  projectCanonicalAuthoringEcsWorld,
  validateXrV2DevRuntimeEvidence,
  XR_V2_DEV_RUNTIME_EVIDENCE_SCHEMA,
  type XrV2DevRuntimeEvidence,
} from '@/features/xr-v2'
import { type GanttTimelineTransportCommandAdapter } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import { renderVideoSequenceExport } from '@/components/timeline/videoSequenceExport'
import {
  createXrV2EditedMediaPlan,
  observeXrV2Playback,
  probeMountedXrV2TimelinePanel,
  readXrV2MediaError,
  releaseXrV2ObservedMedia,
  SMOKE_MEDIA_GANTT_CODE,
  SMOKE_RUNTIME_DOCUMENT_KEY,
  waitForXrV2DecodedMetadata,
  waitForXrV2ObservationQuiescence,
  type XrV2ExternalTimelineOwnerState,
  type XrV2MediaCleanupObservation,
  type XrV2MediaErrorObservation,
  type XrV2TimelineCommandObservation,
} from './xrV2BrowserObservationSupport'
import { allocateEntity, createWorld, registerComponent } from '../../../../ecs/index.js'
import { disposeWorld } from '../../../../ecs/world.js'

type SmokeState = Readonly<{
  phase: 'running' | 'observed' | 'failed'
  snapshot: ReturnType<typeof createXrV2ReadinessSnapshot>
  rawObservation: XrV2DevRuntimeEvidence
  observationValidation: 'not-run' | 'valid'
  timelineCommandObservation: XrV2TimelineCommandObservation
  playbackCurrentTime: number
  playbackEnded: boolean
  mediaCleanup: XrV2MediaCleanupObservation
  mediaErrors: readonly XrV2MediaErrorObservation[]
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
    videoSrcCleared: false,
  }),
  mediaErrors: Object.freeze([]),
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
    let activeWorld: object | null = null
    let disposeMaterial: (() => unknown) | null = null
    const video = playbackVideoRef.current
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
        await waitForXrV2ObservationQuiescence(abortController.signal)
        const mediaCleanup = Object.freeze({
          browserQuiescent: true,
          objectUrlRevoked: releasedMedia.objectUrlRevoked,
          revokedObjectUrl: releasedMedia.revokedObjectUrl,
          videoNetworkStateEmpty: video.networkState === HTMLMediaElement.NETWORK_EMPTY,
          videoSrcCleared: releasedMedia.videoSrcCleared
            && !video.hasAttribute('src')
            && !video.currentSrc,
        })
        if (!mediaCleanup.browserQuiescent
          || !mediaCleanup.objectUrlRevoked
          || !mediaCleanup.revokedObjectUrl
          || !mediaCleanup.videoNetworkStateEmpty
          || !mediaCleanup.videoSrcCleared) {
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
            rawObservation,
            observationValidation: 'valid',
            timelineCommandObservation: timelineCommandProbe.observation,
            playbackCurrentTime: playback.currentTime,
            playbackEnded: playback.ended,
            mediaCleanup,
            mediaErrors: Object.freeze([...mediaErrors]),
            error: '',
          }))
        }
      } catch (error) {
        cleanupMedia()
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
      video?.removeEventListener('error', onMediaError)
    }
  }, [])

  const { editedMedia } = state.rawObservation
  const durationValue = editedMedia.durationSeconds === null ? '' : String(editedMedia.durationSeconds)
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
      data-kg-xr-v2-video-src-cleared={String(state.mediaCleanup.videoSrcCleared)}
      data-kg-xr-v2-video-network-state-empty={String(state.mediaCleanup.videoNetworkStateEmpty)}
      data-kg-xr-v2-object-url-revoked={String(state.mediaCleanup.objectUrlRevoked)}
      data-kg-xr-v2-revoked-object-url={state.mediaCleanup.revokedObjectUrl}
      data-kg-xr-v2-browser-quiescent={String(state.mediaCleanup.browserQuiescent)}
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
        <ul className="mt-6 rounded-2xl border border-slate-700 bg-black/20 px-4 text-sm">
          <EvidenceRow label="Observation state" value={state.phase} />
          <EvidenceRow label="Page readiness" value={state.snapshot.overall} />
          <EvidenceRow label="Raw observation validation" value={state.observationValidation} />
          <EvidenceRow label="Canonical ECS entity zero" value={String(state.rawObservation.authoringAdapters.canonicalEcsEntityZero)} />
          <EvidenceRow label="Three.js material applied" value={String(state.rawObservation.authoringAdapters.materialApplied)} />
          <EvidenceRow label="Timeline command routed" value={String(state.rawObservation.authoringAdapters.timelineCommandRouted)} />
          <EvidenceRow label="Edited-media bytes" value={String(editedMedia.byteSize)} />
          <EvidenceRow label="Media source cleared" value={String(state.mediaCleanup.videoSrcCleared)} />
          <EvidenceRow label="Object URL revoked" value={String(state.mediaCleanup.objectUrlRevoked)} />
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
