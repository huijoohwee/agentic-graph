import React from 'react'
import { Camera, Cpu, ShieldCheck, VideoOff } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  FloatingPanelCatalogHeader,
  floatingPanelCatalogBodyClassName,
  floatingPanelCatalogSurfaceClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { PanelCheckbox, PanelField, PanelSelect } from '@/lib/ui/panelFormControls'
import { resolveCssVar, UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { cn } from '@/lib/utils'
import {
  buildMotionControlBoundingBoxInvocation,
  buildMotionControlExportInvocation,
  buildMotionControlInvocation,
  buildMotionControlShareInvocation,
  controlLocalMotionControl,
  inspectLocalMotionControl,
  type MotionControlOperation,
} from './motionControlMcpRuntime'
import {
  MOTION_CONTROL_INVOCATION_BINDINGS,
  MOTION_CONTROL_INVOCATION_COMMANDS,
  MOTION_CONTROL_INVOCATION_SEMANTICS,
} from './motionControlMcpContract.mjs'
import {
  bindMotionControlPreview,
  readMotionControlSnapshot,
  stopMotionControl,
  subscribeMotionControl,
  type MotionControlBackendPreference,
  type MotionControlSnapshot,
} from './motionControlRuntime'
import { MotionControlTargetCards } from './MotionControlTargetCards'
import { MotionCapturePlatformProjection } from './MotionCapturePlatformProjection'
import { motionCapturePlatformUiAdapter } from './motionCapturePlatformUiAdapter'
import { readMotionCapturePeerSharingSnapshot, subscribeMotionCapturePeerSharing } from './motionCapturePeerRuntime'
import {
  MOTION_CONTROL_XR_UNAVAILABLE_MESSAGE,
  openMotionControlSurface,
  type MotionControlCompanionTarget,
} from './motionControlSurfaceRuntime'

const POSE_CONNECTIONS = Object.freeze([
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
] as const)
const MOTION_CONTROL_GRAMMAR_SIGILS = ['/', '#', '@'] as const
const MOTION_CONTROL_REQUIRED_METADATA_TOKENS = Object.freeze([
  ...Object.values(MOTION_CONTROL_INVOCATION_COMMANDS).map(token => ({ kind: 'command' as const, token })),
  ...Object.values(MOTION_CONTROL_INVOCATION_SEMANTICS).map(token => ({ kind: 'semantic' as const, token })),
  ...Object.values(MOTION_CONTROL_INVOCATION_BINDINGS).map(token => ({ kind: 'binding' as const, token })),
])

function MotionInvocationChip({ invocation, operation }: { invocation: string; operation: string }) {
  return (
    <code
      className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'min-w-0 overflow-hidden font-mono text-[9px]', UI_THEME_TOKENS.text.secondary)}
      data-kg-motion-control-invocation={operation}
      data-kg-motion-control-invocation-chip-renderer="shared-markdown-sigil"
    >
      {renderMarkdownSigilInlineText(invocation, {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
      })}
    </code>
  )
}

function MotionInvocation({ operation, backend, boundingBox }: { operation: Exclude<MotionControlOperation, 'export' | 'share'>; backend?: MotionControlBackendPreference; boundingBox?: boolean }) {
  const invocation = boundingBox === undefined
    ? buildMotionControlInvocation(operation, backend)
    : buildMotionControlBoundingBoxInvocation(boundingBox)
  return <MotionInvocationChip invocation={invocation} operation={boundingBox === undefined ? operation : `bounding-box-${boundingBox ? 'enable' : 'disable'}`} />
}

function drawPoseOverlay(canvas: HTMLCanvasElement, state: MotionControlSnapshot): void {
  const width = Math.max(1, Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)))
  const height = Math.max(1, Math.round(canvas.clientHeight * (window.devicePixelRatio || 1)))
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  const landmarks = state.pose?.landmarks
  context.lineCap = 'round'
  context.lineWidth = Math.max(2, width / 160)
  context.strokeStyle = resolveCssVar('--kg-canvas-accent', '#22d3ee')
  if (state.boundingBoxEnabled && state.boundingBox) {
    const boundingBox = state.boundingBox
    context.strokeRect(
      (1 - (boundingBox.x + boundingBox.width)) * width,
      boundingBox.y * height,
      boundingBox.width * width,
      boundingBox.height * height,
    )
  }
  if (!landmarks) return
  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const start = landmarks[startIndex]
    const end = landmarks[endIndex]
    if (!start || !end || Math.min(start.visibility, end.visibility) < 0.5) continue
    context.beginPath()
    context.moveTo((1 - start.x) * width, start.y * height)
    context.lineTo((1 - end.x) * width, end.y * height)
    context.stroke()
  }
  context.fillStyle = resolveCssVar('--kg-text-primary', '#f8fafc')
  landmarks.slice(0, 33).forEach(landmark => {
    if (landmark.visibility < 0.5) return
    context.beginPath()
    context.arc((1 - landmark.x) * width, landmark.y * height, Math.max(2.2, width / 90), 0, Math.PI * 2)
    context.fill()
  })
}

export function MotionControlFloatingPanelView() {
  const grammarCatalog = useAgenticOsRemoteGrammarCatalog({ sigils: MOTION_CONTROL_GRAMMAR_SIGILS })
  const state = React.useSyncExternalStore(subscribeMotionControl, readMotionControlSnapshot, readMotionControlSnapshot)
  const capture = React.useSyncExternalStore(
    motionCapturePlatformUiAdapter.subscribeSession,
    motionCapturePlatformUiAdapter.readSession,
    motionCapturePlatformUiAdapter.readSession,
  )
  const peerSharing = React.useSyncExternalStore(subscribeMotionCapturePeerSharing, readMotionCapturePeerSharingSnapshot, readMotionCapturePeerSharingSnapshot)
  const pushUiToast = useGraphStore(store => store.pushUiToast)
  const [backend, setBackend] = React.useState<MotionControlBackendPreference>(state.requestedBackend)
  const [startPending, setStartPending] = React.useState(false)
  const [stopPending, setStopPending] = React.useState(false)
  const [boundingBoxPending, setBoundingBoxPending] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const overlayRef = React.useRef<HTMLCanvasElement | null>(null)

  React.useEffect(() => setBackend(state.requestedBackend), [state.requestedBackend])
  React.useEffect(() => bindMotionControlPreview(videoRef.current), [state.cameraActive])
  React.useEffect(() => {
    const canvas = overlayRef.current
    if (canvas) drawPoseOverlay(canvas, state)
  }, [state])
  const runControl = React.useCallback(async (operation: Extract<MotionControlOperation, 'start' | 'stop'>) => {
    const setOperationPending = operation === 'start' ? setStartPending : setStopPending
    setOperationPending(true)
    try {
      const result = await controlLocalMotionControl(operation === 'start' ? { operation, backend } : { operation })
      pushUiToast({
        id: `motion-control:${operation}:${result.ok ? 'ok' : 'error'}`,
        kind: result.ok ? 'success' : 'error',
        message: result.message,
      })
    } finally {
      setOperationPending(false)
    }
  }, [backend, pushUiToast])

  const setBoundingBoxEnabled = React.useCallback(async (enabled: boolean) => {
    setBoundingBoxPending(true)
    try {
      const result = await controlLocalMotionControl({ operation: 'open', boundingBox: enabled })
      pushUiToast({
        id: `motion-control:bounding-box:${enabled ? 'enabled' : 'disabled'}:${result.ok ? 'ok' : 'error'}`,
        kind: result.ok ? 'success' : 'error',
        message: result.message,
      })
    } finally {
      setBoundingBoxPending(false)
    }
  }, [pushUiToast])

  const openTarget = React.useCallback((target: MotionControlCompanionTarget) => {
    const opened = openMotionControlSurface(target)
    pushUiToast({
      id: `motion-control:target:${target}:${opened ? 'ok' : 'error'}`,
      kind: opened ? 'success' : 'error',
      message: opened
        ? `Motion Control remains available while ${target === 'xr-3d' ? '3D for XR' : target === 'game-mode' ? 'Game Mode' : 'Animation'} is open.`
        : MOTION_CONTROL_XR_UNAVAILABLE_MESSAGE,
    })
  }, [pushUiToast])

  const inspection = inspectLocalMotionControl()
  const sourceMetadataReady = grammarCatalog.hydration.status === 'fresh'
    && MOTION_CONTROL_REQUIRED_METADATA_TOKENS.every(required => grammarCatalog.entries.some(entry => entry.token === required.token && entry.kind === required.kind))
  const sourceMetadataLoading = grammarCatalog.hydration.status === 'idle' || grammarCatalog.hydration.status === 'loading'
  const nativeInvocationReady = Boolean(inspection.invocationGrammar)
  const runtimeBusy = state.phase === 'requesting-camera' || state.phase === 'loading-model' || state.phase === 'running'
  const canStop = startPending || runtimeBusy || state.cameraActive
    || capture.sources.length > 0 || capture.recording.status === 'recording' || peerSharing.enabled
  return (
    <section
      className={floatingPanelCatalogSurfaceClassName()}
      aria-label="Motion Control"
      data-kg-motion-control-floating-panel="1"
      data-kg-motion-control-mcp="knowgrph.control_local_motion_control"
      data-kg-motion-control-runtime={state.phase}
      data-kg-motion-control-metadata-status={grammarCatalog.hydration.status}
      data-kg-motion-control-metadata-version={String(grammarCatalog.version)}
    >
      <FloatingPanelCatalogHeader
        title="Motion Control"
        subtitle="Local camera pose → XR"
        actionsLabel="Motion Control actions"
        dataAttributes={{ 'data-kg-motion-control-header': '1' }}
        actions={<>
          <button type="button" className="App-toolbar__btn" disabled={startPending || stopPending || runtimeBusy} onClick={() => void runControl('start')} data-kg-motion-control-start="1">
            <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Start
          </button>
          <button type="button" className="App-toolbar__btn" disabled={stopPending || !canStop} onClick={() => void runControl('stop')} data-kg-motion-control-stop="1">
            <VideoOff className="h-3.5 w-3.5" aria-hidden="true" /> Stop
          </button>
        </>}
      />
      <section className={floatingPanelCatalogBodyClassName('grid content-start gap-2 px-1 pb-2')}>
        <section className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-motion-control-preview="local-only">
          <div className="relative aspect-square w-full overflow-hidden rounded bg-[var(--kg-canvas-bg)]">
            <video ref={videoRef} className="h-full w-full scale-x-[-1] object-cover" aria-label="Local Motion Control camera preview" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
            {!state.cameraActive ? <div className={cn('absolute inset-0 grid place-items-center text-center text-xs', UI_THEME_TOKENS.text.secondary)}>Camera stays off until Start.</div> : null}
          </div>
          <PanelField label="LiteRT accelerator">
            <PanelSelect value={backend} disabled={startPending || stopPending || runtimeBusy} onChange={event => setBackend(event.currentTarget.value as MotionControlBackendPreference)} data-kg-motion-control-backend="1">
              <option value="auto">Auto · WebGPU with Wasm fallback</option>
              <option value="webgpu">WebGPU preferred</option>
              <option value="wasm">Wasm CPU</option>
            </PanelSelect>
          </PanelField>
          <label className={cn('flex items-center gap-2 text-[10px]', UI_THEME_TOKENS.text.secondary)}>
            <PanelCheckbox
              checked={state.boundingBoxEnabled}
              disabled={boundingBoxPending}
              onChange={event => void setBoundingBoxEnabled(event.currentTarget.checked)}
              data-kg-motion-control-bounding-box="1"
            />
            Bounding box · {state.boundingBoxEnabled ? 'Enabled' : 'Disabled (default)'}
          </label>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Shows the live pose ROI and catalog-authored XR object bounds.</p>
          <div role="status" aria-live="polite" aria-atomic="true" data-kg-motion-control-live-status="1">
            <p className={cn('text-[10px]', state.phase === 'error' ? UI_THEME_TOKENS.status.error : UI_THEME_TOKENS.text.secondary)}>{state.message}</p>
            {state.fallbackReason ? <p className={cn('text-[10px]', UI_THEME_TOKENS.status.warning)}>{state.fallbackReason}</p> : null}
          </div>
        </section>

        <section className={cn('grid grid-cols-2 gap-2 rounded border p-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Motion Control telemetry">
          <span><b>Status</b><br />{state.phase}</span>
          <span><b>Permission</b><br />{state.permission}</span>
          <span><b>Backend</b><br />{state.effectiveBackend}</span>
          <span><b>Confidence</b><br />{(state.confidence * 100).toFixed(0)}%</span>
          <span><b>Inference</b><br />{state.latencyMs.toFixed(1)} ms · {state.framesPerSecond.toFixed(1)} FPS</span>
        </section>

        <MotionCapturePlatformProjection variant="full" />

        <MotionControlTargetCards livePoseActive={Boolean(state.pose)} onOpenTarget={openTarget} />

        <section className={cn('grid gap-1 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} data-kg-motion-control-invocations="shared-catalog">
          <h3 className="text-[11px] font-semibold">MCP · / · @ · #</h3>
          {!sourceMetadataReady ? (
            <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>
              {sourceMetadataLoading
                ? `ACOS Motion Control invocation metadata is loading.${nativeInvocationReady ? ' Native Motion Control remains ready.' : ''}`
                : `ACOS Motion Control invocation metadata is unavailable.${nativeInvocationReady ? ' Native Motion Control remains ready.' : ''}`}
            </p>
          ) : null}
          <MotionInvocation operation="start" backend={backend} />
          <MotionInvocation operation="stop" />
          <MotionInvocation operation="record" />
          <MotionInvocation operation="finish" />
          <MotionInvocation operation="clear" />
          <MotionInvocation operation="open" boundingBox={true} />
          <MotionInvocation operation="open" boundingBox={false} />
          <MotionInvocationChip invocation={buildMotionControlExportInvocation('json')} operation="export-json" />
          <MotionInvocationChip invocation={buildMotionControlExportInvocation('csv')} operation="export-csv" />
          <MotionInvocationChip invocation={buildMotionControlShareInvocation(true)} operation="share-enable" />
          <MotionInvocationChip invocation={buildMotionControlShareInvocation(false)} operation="share-disable" />
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>WebMCP: {inspection.webMcpTools.control}</p>
        </section>

        <section className={cn('grid gap-1 rounded border p-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}>
          <p className="flex items-center gap-1 font-semibold"><Cpu className="h-3.5 w-3.5" aria-hidden="true" /> Official LiteRT.js + Google BlazePose GHUM Full</p>
          <p>Center one person’s full body. Pose drives a selected humanoid and the native XR physics controller.</p>
          <p className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Frames are neither uploaded nor persisted.</p>
        </section>
      </section>
    </section>
  )
}

export default MotionControlFloatingPanelView
