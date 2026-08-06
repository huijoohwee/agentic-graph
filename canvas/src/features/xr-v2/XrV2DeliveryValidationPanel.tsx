import React from 'react'
import { PackageCheck, Radio } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import type { XrV2ConnectedPreviewBrowserObservation } from './browserRuntimeEvidence'
import {
  runXrV2BrowserPackagingAction,
  runXrV2ConnectedPreviewAction,
  XR_V2_CROSS_DEVICE_BLOCKER,
  XR_V2_SAVED_ASSET_SCOPE,
  type XrV2BrowserPackagingEvidence,
  type XrV2BrowserPackagingLease,
} from './xrV2DeliveryValidationRuntime'
import {
  beginXrV2DeliveryCriterionObservation,
  reportXrV2DeliveryCriterionObservation,
} from './xrV2WorkspaceReadinessRuntime'
import {
  readXrV2SavedAssetPresentation,
  subscribeXrV2SavedAssetPresentation,
} from './xrV2SavedAssetPresentationRuntime'
import {
  readXrAuthoringEcsRuntime,
  subscribeXrAuthoringEcsRuntime,
} from '@/features/agentic-ecs/xrAuthoringEcsRuntime'
import {
  createXrV2ConnectedPreviewCanvasSession,
  type XrV2ConnectedPreviewViewerSession,
} from './xrV2ConnectedPreviewViewerRuntime'
import { applyXrV2MountedAuthoringVisibilityEdit } from './xrV2MountedAuthoringEditRuntime'

type ActionPhase = 'not-observed' | 'running' | 'browser-observed' | 'failed'
const useBrowserLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function savedAssetSourceKey(selected: ReturnType<typeof readXrV2SavedAssetPresentation>['selected']): string {
  if (!selected) return ''
  return [
    selected.asset.asset_id, selected.asset.session_id, selected.asset.raw_clip_ref,
    selected.asset.metadata.depth_metadata_ref, selected.rawClip.type, selected.rawClip.size,
  ].join('\u0000')
}

export function XrV2DeliveryValidationPanel({
  actionsEnabled,
}: Readonly<{ actionsEnabled: boolean }>) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const packagingAbortRef = React.useRef<AbortController | null>(null)
  const previewAbortRef = React.useRef<AbortController | null>(null)
  const packagingLeaseRef = React.useRef<XrV2BrowserPackagingLease | null>(null)
  const previewViewerSessionRef = React.useRef<XrV2ConnectedPreviewViewerSession | null>(null)
  const generationRef = React.useRef({ packaging: 0, preview: 0 })
  const [packagingPhase, setPackagingPhase] = React.useState<ActionPhase>('not-observed')
  const [previewPhase, setPreviewPhase] = React.useState<ActionPhase>('not-observed')
  const [packagingEvidence, setPackagingEvidence] = React.useState<XrV2BrowserPackagingEvidence | null>(null)
  const [previewEvidence, setPreviewEvidence] = React.useState<XrV2ConnectedPreviewBrowserObservation | null>(null)
  const presentation = React.useSyncExternalStore(
    subscribeXrV2SavedAssetPresentation,
    readXrV2SavedAssetPresentation,
    readXrV2SavedAssetPresentation,
  )
  const authoring = React.useSyncExternalStore(
    subscribeXrAuthoringEcsRuntime,
    readXrAuthoringEcsRuntime,
    readXrAuthoringEcsRuntime,
  )
  const packagingSourceKey = savedAssetSourceKey(presentation.selected)
  const previewSourceKey = authoring.plan
    ? `${authoring.plan.sourceDigest}\u0000${authoring.plan.graphDataRevision}` : ''
  const previousSourceKeysRef = React.useRef({ packaging: packagingSourceKey, preview: previewSourceKey })
  const [packagingMessage, setPackagingMessage] = React.useState('Run explicitly to package, decode, and play browser-local encoded tracks.')
  const [previewMessage, setPreviewMessage] = React.useState('Run explicitly to create local author/viewer peers and apply one edit without reload.')

  React.useEffect(() => () => {
    generationRef.current.packaging += 1
    generationRef.current.preview += 1
    packagingAbortRef.current?.abort()
    previewAbortRef.current?.abort()
    packagingLeaseRef.current?.release()
    packagingLeaseRef.current = null
    previewViewerSessionRef.current?.dispose()
    previewViewerSessionRef.current = null
    beginXrV2DeliveryCriterionObservation('AC-11')
    beginXrV2DeliveryCriterionObservation('AC-12')
  }, [])

  useBrowserLayoutEffect(() => {
    if (previousSourceKeysRef.current.packaging === packagingSourceKey) return
    previousSourceKeysRef.current.packaging = packagingSourceKey
    generationRef.current.packaging += 1
    packagingAbortRef.current?.abort()
    packagingLeaseRef.current?.release()
    packagingLeaseRef.current = null
    beginXrV2DeliveryCriterionObservation('AC-11')
    setPackagingEvidence(null)
    setPackagingPhase('not-observed')
    setPackagingMessage('Run explicitly to package, decode, and play browser-local encoded tracks.')
  }, [packagingSourceKey])

  useBrowserLayoutEffect(() => {
    if (previousSourceKeysRef.current.preview === previewSourceKey) return
    previousSourceKeysRef.current.preview = previewSourceKey
    generationRef.current.preview += 1
    previewAbortRef.current?.abort()
    previewViewerSessionRef.current?.dispose()
    previewViewerSessionRef.current = null
    beginXrV2DeliveryCriterionObservation('AC-12')
    setPreviewEvidence(null)
    setPreviewPhase('not-observed')
    setPreviewMessage('Run explicitly to create local author/viewer peers and apply one edit without reload.')
  }, [previewSourceKey])

  const runPackaging = React.useCallback(async () => {
    const video = videoRef.current
    const selected = presentation.selected
    if (!video || !selected) return
    const generation = ++generationRef.current.packaging
    packagingAbortRef.current?.abort()
    packagingLeaseRef.current?.release()
    packagingLeaseRef.current = null
    beginXrV2DeliveryCriterionObservation('AC-11')
    setPackagingEvidence(null)
    setPackagingPhase('running')
    setPackagingMessage('Producing decoded-verified tracks from the identity-bound capture, muxing those exact encoded bytes, and waiting for real playback…')
    const abortController = new AbortController()
    packagingAbortRef.current = abortController
    try {
      const lease = await runXrV2BrowserPackagingAction(video, abortController.signal, selected)
      if (generationRef.current.packaging !== generation || abortController.signal.aborted
        || savedAssetSourceKey(readXrV2SavedAssetPresentation().selected) !== packagingSourceKey) {
        lease.release()
        return
      }
      packagingLeaseRef.current = lease
      reportXrV2DeliveryCriterionObservation('AC-11', {
        assetId: lease.evidence.sourceAssetId,
        sessionId: lease.evidence.sourceSessionId,
        rawClipRef: lease.evidence.sourceRawClipRef,
        depthMetadataRef: lease.evidence.sourceDepthMetadataRef,
        rawClipSha256: lease.evidence.sourceRawClipSha256,
      })
      setPackagingEvidence(lease.evidence)
      setPackagingPhase('browser-observed')
      setPackagingMessage(`${lease.evidence.trackCount} tracks (${lease.evidence.codecs.join(', ')}) preserved and played in this video element.`)
    } catch (error) {
      if (generationRef.current.packaging !== generation || abortController.signal.aborted) return
      setPackagingPhase('failed')
      setPackagingMessage(message(error, 'Browser packaging validation failed.'))
    }
  }, [packagingSourceKey, presentation.selected])

  const runPreview = React.useCallback(async () => {
    const entity = authoring.plan?.entities.find(candidate => candidate.renderable !== null)
    const viewerCanvas = previewCanvasRef.current
    if (authoring.status !== 'ready' || !authoring.plan || !entity || !viewerCanvas) return
    const generation = ++generationRef.current.preview
    previewAbortRef.current?.abort()
    previewViewerSessionRef.current?.dispose()
    const viewerSession = createXrV2ConnectedPreviewCanvasSession(viewerCanvas)
    previewViewerSessionRef.current = viewerSession
    beginXrV2DeliveryCriterionObservation('AC-12')
    setPreviewEvidence(null)
    setPreviewPhase('running')
    setPreviewMessage('Connecting bounded local WebRTC author/viewer peers and applying one edit…')
    const abortController = new AbortController()
    previewAbortRef.current = abortController
    try {
      const authoredEdit = await applyXrV2MountedAuthoringVisibilityEdit({
        entityRef: entity.entityRef,
        visible: !(entity.renderable?.visible ?? true),
        sourceDigest: authoring.plan.sourceDigest,
        graphDataRevision: authoring.plan.graphDataRevision,
        signal: abortController.signal,
      })
      const evidence = await runXrV2ConnectedPreviewAction(
        abortController.signal,
        authoredEdit,
        { viewerSession },
      )
      if (generationRef.current.preview !== generation || abortController.signal.aborted) return
      reportXrV2DeliveryCriterionObservation('AC-12', {
        sourceDigest: evidence.sourceDigest,
        graphDataRevision: evidence.graphDataRevision,
        entityRef: evidence.entityRef,
        authoringEditRevision: evidence.authoringEditRevision,
      })
      setPreviewEvidence(evidence)
      setPreviewPhase('browser-observed')
      setPreviewMessage(`Revision ${evidence.viewerRevision} applied and acknowledged in ${evidence.latencyMs.toFixed(1)} ms without reload.`)
    } catch (error) {
      viewerSession.dispose()
      if (previewViewerSessionRef.current === viewerSession) previewViewerSessionRef.current = null
      if (generationRef.current.preview !== generation || abortController.signal.aborted) return
      setPreviewPhase('failed')
      setPreviewMessage(message(error, 'Connected-preview validation failed.'))
    }
  }, [authoring])

  const packagingAvailable = typeof globalThis.VideoEncoder === 'function'
    && typeof globalThis.VideoDecoder === 'function'
    && typeof globalThis.VideoFrame === 'function'
    && typeof globalThis.EncodedVideoChunk === 'function'
    && presentation.selected !== null
    && (presentation.selected.frameBundle?.frames.length ?? 0) > 0
  const previewAvailable = typeof globalThis.RTCPeerConnection === 'function'
  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border)}
      aria-label="XR v2 browser delivery validation"
      data-kg-xr-v2-delivery-validation="1"
      data-kg-xr-v2-saved-asset-scope={XR_V2_SAVED_ASSET_SCOPE}
      data-kg-xr-v2-cross-device-blocker={XR_V2_CROSS_DEVICE_BLOCKER.code}
      data-kg-xr-v2-ac-11-evidence={packagingPhase}
      data-kg-xr-v2-ac-12-evidence={previewPhase}
      data-kg-xr-v2-ac-11-source-asset={presentation.selected?.asset.asset_id || 'none'}
      data-kg-xr-v2-ac-11-source-track-producer={packagingEvidence?.sourceTrackProducer || 'not-observed'}
      data-kg-xr-v2-ac-11-raw-clip-sha256={packagingEvidence?.sourceRawClipSha256 || 'not-observed'}
      data-kg-xr-v2-ac-12-authoring-edit-revision={previewEvidence?.authoringEditRevision ?? 0}
      data-kg-xr-v2-ac-12-author-rendered-at-ms={previewEvidence?.authorRenderedAtMs ?? 0}
      data-kg-xr-v2-ac-12-viewer-render-revision={previewEvidence?.viewerRenderRevision ?? 0}
    >
      <header>
        <strong className="text-[9px]">Browser delivery validation · explicit actions</strong>
        <p className={cn('m-0 text-[8px]', UI_THEME_TOKENS.text.tertiary)}>
          No action runs on mount. Packaging requires the currently opened persisted capture; preview derives its edit from the mounted authored scene. Camera, sensors, immersive sessions, and remote signalling remain untouched.
        </p>
      </header>

      <section className={cn('grid gap-1 rounded border p-1', UI_THEME_TOKENS.panel.border)} aria-label="AC-11 browser packaging action">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <strong className="text-[9px]">AC-11 · package &amp; play</strong>
          <button
            type="button"
            className="App-toolbar__btn"
            disabled={!actionsEnabled || !packagingAvailable || packagingPhase === 'running'}
            onClick={() => void runPackaging()}
            data-kg-xr-v2-ac-11-run="1"
          >
            <PackageCheck className="h-3 w-3" aria-hidden="true" /> Verify packaging
          </button>
        </div>
        <video ref={videoRef} className="aspect-video w-full rounded bg-black" controls muted playsInline aria-label="AC-11 packaged WebM playback" data-kg-xr-v2-ac-11-video="1" />
        <p className={cn('m-0 text-[8px]', UI_THEME_TOKENS.text.tertiary)}>
          {presentation.selected
            ? `Source: persisted asset ${presentation.selected.asset.asset_id}`
            : 'Open a saved capture in the catalog before packaging.'}
        </p>
        <p className={cn('m-0 text-[8px]', packagingPhase === 'failed' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.text.tertiary)} role="status">{packagingMessage}</p>
        {packagingEvidence ? <code className="break-all text-[8px]">{JSON.stringify(packagingEvidence)}</code> : null}
      </section>

      <section className={cn('grid gap-1 rounded border p-1', UI_THEME_TOKENS.panel.border)} aria-label="AC-12 connected preview action">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <strong className="text-[9px]">AC-12 · connected preview</strong>
          <button
            type="button"
            className="App-toolbar__btn"
            disabled={!actionsEnabled || !previewAvailable || previewPhase === 'running'}
            onClick={() => void runPreview()}
            data-kg-xr-v2-ac-12-run="1"
          >
            <Radio className="h-3 w-3" aria-hidden="true" /> Run local preview
          </button>
        </div>
        <canvas
          ref={previewCanvasRef}
          className="aspect-video w-full rounded bg-slate-950"
          aria-label="Connected XR viewer render surface"
          data-kg-xr-v2-connected-viewer-surface="1"
        />
        <p className={cn('m-0 text-[8px]', previewPhase === 'failed' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.text.tertiary)} role="status">{previewMessage}</p>
        {previewEvidence ? <code className="break-all text-[8px]">{JSON.stringify(previewEvidence)}</code> : null}
      </section>

      <p className="m-0 rounded bg-amber-100 px-2 py-1 text-[8px] text-amber-900 dark:bg-amber-950/60 dark:text-amber-100" data-kg-xr-v2-cross-device-scope={XR_V2_SAVED_ASSET_SCOPE}>
        Saved XR assets are local-first with explicit existing-storage publish/reopen. {XR_V2_CROSS_DEVICE_BLOCKER.message}
      </p>
    </section>
  )
}
