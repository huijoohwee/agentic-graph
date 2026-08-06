import React from 'react'
import { Camera, VideoOff } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS,
  XR_V2_SPATIAL_CAPTURE_CONSECUTIVE_BREACHES,
  XR_V2_SPATIAL_CAPTURE_FRAME_BUDGET_MS,
  bindXrV2SpatialCapturePreview,
  cancelXrV2SpatialCapture,
  readXrV2SpatialCapture,
  startXrV2SpatialCapture,
  stopXrV2SpatialCapture,
  subscribeXrV2SpatialCapture,
} from './xrV2SpatialCaptureRuntime'
import { XrV2SavedAssetCatalogViewer } from './XrV2SavedAssetCatalogViewer'
import { XrV2PostProcessFallbackStatus } from './XrV2PostProcessFallbackStatus'
import { requestXrV2PostProcessFallbackScan } from './xrV2PostProcessFallbackLifecycle'

export function XrV2SpatialCapturePanel({
  actionsEnabled,
  disabledReason,
}: Readonly<{ actionsEnabled: boolean; disabledReason: string | null }>) {
  const capture = React.useSyncExternalStore(
    subscribeXrV2SpatialCapture,
    readXrV2SpatialCapture,
    readXrV2SpatialCapture,
  )
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const leftRef = React.useRef<HTMLCanvasElement | null>(null)
  const rightRef = React.useRef<HTMLCanvasElement | null>(null)
  const notifiedJobRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    bindXrV2SpatialCapturePreview({
      video: videoRef.current,
      left: leftRef.current,
      right: rightRef.current,
    })
    return () => bindXrV2SpatialCapturePreview({ video: null, left: null, right: null })
  }, [])
  React.useEffect(() => {
    if (capture.phase !== 'saved' || !capture.postProcessJobId
      || notifiedJobRef.current === capture.postProcessJobId) return
    notifiedJobRef.current = capture.postProcessJobId
    requestXrV2PostProcessFallbackScan()
  }, [capture.phase, capture.postProcessJobId])

  const active = capture.phase === 'preparing'
    || capture.phase === 'capturing-live'
    || capture.phase === 'capturing-raw'
    || capture.phase === 'stopping'
  const canStop = capture.phase === 'preparing'
    || capture.phase === 'capturing-live'
    || capture.phase === 'capturing-raw'
  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border)}
      aria-label="XR v2 spatial capture"
      data-kg-xr-v2-spatial-capture="1"
      data-kg-xr-v2-spatial-capture-phase={capture.phase}
      data-kg-xr-v2-spatial-camera-requested={capture.cameraPermissionRequested ? 'true' : 'false'}
      data-kg-xr-v2-spatial-sensors-requested="false"
      data-kg-xr-v2-spatial-actions-enabled={actionsEnabled ? 'true' : 'false'}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <section>
          <h5 className="m-0 text-[10px] font-semibold">Spatial capture · local depth + DIBR</h5>
          <p className={cn('m-0 text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Uses the canonical camera after Start · depth/DIBR is separate · bounded to {XR_V2_SPATIAL_CAPTURE_MAX_DURATION_MS / 1_000}s
          </p>
          <p className={cn('m-0 text-[8px]', UI_THEME_TOKENS.text.tertiary)}>
            Raw fallback after {XR_V2_SPATIAL_CAPTURE_CONSECUTIVE_BREACHES} consecutive frames over {XR_V2_SPATIAL_CAPTURE_FRAME_BUDGET_MS}ms
          </p>
        </section>
        <div className="flex flex-wrap gap-1" aria-label="XR spatial capture actions">
          <button
            type="button"
            className="App-toolbar__btn"
            disabled={!actionsEnabled || !capture.cameraSourceAvailable || active}
            onClick={() => void startXrV2SpatialCapture()}
            data-kg-xr-v2-spatial-capture-start="1"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Start XR capture
          </button>
          <button
            type="button"
            className="App-toolbar__btn"
            disabled={!canStop}
            onClick={() => void (capture.phase === 'preparing'
              ? cancelXrV2SpatialCapture()
              : stopXrV2SpatialCapture())}
            data-kg-xr-v2-spatial-capture-stop="1"
          >
            <VideoOff className="h-3.5 w-3.5" aria-hidden="true" /> {capture.phase === 'preparing' ? 'Cancel capture' : 'Stop & save'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-1" aria-label="Spatial capture live and stereo previews">
        <video ref={videoRef} className="aspect-video w-full rounded bg-black object-cover" muted playsInline aria-label="XR spatial camera preview" />
        <canvas ref={leftRef} className="aspect-video w-full rounded bg-black object-contain" aria-label="Synthesized left-eye preview" />
        <canvas ref={rightRef} className="aspect-video w-full rounded bg-black object-contain" aria-label="Synthesized right-eye preview" />
      </div>

      <div className={cn('grid grid-cols-3 gap-1 text-[9px]', UI_THEME_TOKENS.text.secondary)}>
        <span><b>Raw</b><br />{capture.rawFrameCount}</span>
        <span><b>Depth</b><br />{capture.depthFrameCount}</span>
        <span><b>Stereo</b><br />{capture.synthesizedFrameCount}</span>
      </div>
      <p className={cn('m-0 text-[9px]', capture.phase === 'error' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.text.tertiary)} role="status" aria-live="polite">
        {capture.message}
      </p>
      {!capture.cameraSourceAvailable ? (
        <p className="m-0 text-[9px] text-amber-700 dark:text-amber-300" data-kg-xr-v2-spatial-capture-camera-gate="start-camera-first">
          Start the pose camera above first. XR capture never requests or stops the camera itself.
        </p>
      ) : null}
      {!actionsEnabled && disabledReason ? (
        <p className="m-0 text-[9px] text-amber-700 dark:text-amber-300" data-kg-xr-v2-spatial-capture-gate={disabledReason}>
          {disabledReason}
        </p>
      ) : null}
      {capture.assetMetadata ? (
        <code className={cn('break-all text-[8px]', UI_THEME_TOKENS.text.tertiary)} data-kg-xr-v2-captured-asset-metadata="1">
          {JSON.stringify(capture.assetMetadata)}
        </code>
      ) : null}
      <XrV2PostProcessFallbackStatus />
      <XrV2SavedAssetCatalogViewer refreshKey={capture.rawClipRef} />
    </section>
  )
}
