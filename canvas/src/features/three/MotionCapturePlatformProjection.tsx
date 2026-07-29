import React from 'react'
import { Download, Network, Radio, ShieldCheck, Upload } from 'lucide-react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { downloadBlob } from '@/lib/graph/save'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { PanelCheckbox } from '@/lib/ui/panelFormControls'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  readMediaCatalogMode,
  subscribeMediaCatalogMode,
} from '@/features/command-menu/mediaCatalogModeRuntime'
import type { MotionCaptureExportFormat, MotionCaptureSourceState } from './motionCapturePlatformContract'
import { buildMotionControlExportInvocation, buildMotionControlInvocation, inspectLocalMotionControl } from './motionControlMcpRuntime'
import { motionCapturePlatformUiAdapter } from './motionCapturePlatformUiAdapter'
import { motionControlCaptureSurfaceIsOpen } from './motionControlSurfaceRuntime'

export type MotionCapturePlatformProjectionVariant = 'full' | 'skills' | 'media'
const MAX_RESEARCH_EVIDENCE_BYTES = 256 * 1024

const tierLabel = (tier: string | null): string => {
  if (tier === 'calibrated-metric-reconstruction') return 'Calibrated metric reconstruction'
  if (tier === 'time-aligned-multi-source') return 'Time-aligned multi-source'
  if (tier === 'single-view-control') return 'Single-view control'
  return 'No capture evidence'
}

const shortOpaqueId = (value: string): string => {
  const normalized = String(value || '')
  return normalized.length > 20 ? `${normalized.slice(0, 9)}…${normalized.slice(-6)}` : normalized
}

const warningLabel = (value: string): string => value
  .replace(/^capture-/u, '')
  .split('-')
  .join(' ')

const sourceDetail = (source: MotionCaptureSourceState): string => {
  const dimensions = source.dimensions ? `${source.dimensions.width}×${source.dimensions.height}` : 'dimensions pending'
  const frameRate = source.nominalFps ? `${source.nominalFps.toFixed(1)} FPS` : 'rate observed live'
  return `${source.captureKind} · ${source.coordinateSpace} · ${dimensions} · ${frameRate}`
}

function MotionCaptureInvocationChip({ variant }: { variant: Exclude<MotionCapturePlatformProjectionVariant, 'full'> }) {
  const invocation = variant === 'media'
    ? buildMotionControlExportInvocation('json')
    : buildMotionControlInvocation('open')
  return (
    <code
      className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'min-w-0 overflow-hidden font-mono text-[9px]', UI_THEME_TOKENS.text.secondary)}
      data-kg-motion-capture-invocation="canonical"
      data-kg-motion-capture-invocation-chip-renderer="shared-markdown-sigil"
    >
      {renderMarkdownSigilInlineText(invocation, {
        renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
      })}
    </code>
  )
}

export function MotionCapturePlatformProjection({
  variant,
}: {
  variant: MotionCapturePlatformProjectionVariant
}) {
  const session = React.useSyncExternalStore(
    motionCapturePlatformUiAdapter.subscribeSession,
    motionCapturePlatformUiAdapter.readSession,
    motionCapturePlatformUiAdapter.readSession,
  )
  const peerSharing = React.useSyncExternalStore(
    motionCapturePlatformUiAdapter.subscribePeerSharing,
    motionCapturePlatformUiAdapter.readPeerSharing,
    motionCapturePlatformUiAdapter.readPeerSharing,
  )
  const mediaCatalogMode = React.useSyncExternalStore(
    subscribeMediaCatalogMode,
    readMediaCatalogMode,
    readMediaCatalogMode,
  )
  const captureSurfaceActive = useGraphStore(state => motionControlCaptureSurfaceIsOpen({
    canvas3dMode: state.canvas3dMode,
    canvasRenderMode: state.canvasRenderMode,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    mediaCatalogMode,
  }))
  const pushUiToast = useGraphStore(state => state.pushUiToast)
  const [pendingAction, setPendingAction] = React.useState('')
  const evidence = session.evidence
  const recording = session.recording
  const exportReady = recording.status === 'stopped' && recording.sampleCount > 0
  const webMcpControlTool = inspectLocalMotionControl().webMcpTools.control

  const runAction = React.useCallback((id: string, action: () => void, successMessage: string) => {
    try {
      action()
      pushUiToast({ id: `motion-capture:${id}`, kind: 'success', message: successMessage })
    } catch (error) {
      pushUiToast({
        id: `motion-capture:${id}:error`,
        kind: 'error',
        message: error instanceof Error ? error.message : 'Motion capture action failed.',
      })
    }
  }, [pushUiToast])

  const exportRecording = React.useCallback(async (format: MotionCaptureExportFormat) => {
    if (pendingAction) return
    setPendingAction(`export-${format}`)
    try {
      const artifact = await motionCapturePlatformUiAdapter.exportRecording(format)
      downloadBlob(new Blob([artifact.content], { type: artifact.mimeType }), artifact.fileName)
      pushUiToast({
        id: `motion-capture:export:${format}`,
        kind: 'success',
        message: `Exported ${artifact.sampleCount} derived samples with SHA-256 provenance.`,
      })
    } catch (error) {
      pushUiToast({
        id: `motion-capture:export:${format}:error`,
        kind: 'error',
        message: error instanceof Error ? error.message : 'Motion capture export failed.',
      })
    } finally {
      setPendingAction('')
    }
  }, [pendingAction, pushUiToast])

  const importResearchEvidence = React.useCallback(async (file: File) => {
    if (pendingAction) return
    if (file.size > MAX_RESEARCH_EVIDENCE_BYTES) {
      pushUiToast({ id: 'motion-capture:evidence:size', kind: 'error', message: 'Research evidence exceeds the 256 KiB browser-local limit.' })
      return
    }
    setPendingAction('research-evidence')
    try {
      await motionCapturePlatformUiAdapter.applyResearchEvidenceManifest(JSON.parse(await file.text()))
      pushUiToast({
        id: 'motion-capture:evidence:applied',
        kind: 'success',
        message: 'Metric calibration, clock, scale, and reconstruction evidence were validated and bound.',
      })
    } catch (error) {
      pushUiToast({
        id: 'motion-capture:evidence:error',
        kind: 'error',
        message: error instanceof Error ? error.message : 'Research evidence import failed.',
      })
    } finally {
      setPendingAction('')
    }
  }, [pendingAction, pushUiToast])

  const peerStatus = !captureSurfaceActive
    ? 'Off outside approved XR capture surfaces'
    : peerSharing.lastError
    ? peerSharing.lastError
    : !peerSharing.available
    ? 'Unavailable until a WebRTC collaboration session is ready'
    : !peerSharing.enabled
      ? 'Off'
      : peerSharing.connectedPeerCount > 0
        ? `On · ${peerSharing.connectedPeerCount} connected peer${peerSharing.connectedPeerCount === 1 ? '' : 's'}`
        : 'On · no connected peers'
  const compactPeerStatus = captureSurfaceActive && peerSharing.enabled
    ? peerSharing.connectedPeerCount > 0 ? `${peerSharing.connectedPeerCount} peers` : 'waiting'
    : 'off'

  if (variant !== 'full') {
    return (
      <section
        className={cn('mx-1 mb-2 grid gap-1 rounded border p-2 text-[10px]', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
        aria-label={`${variant === 'skills' ? 'Skills and Commands' : 'Media'} motion capture runtime`}
        data-kg-motion-capture-projection={variant}
        data-kg-motion-capture-runtime-ready={captureSurfaceActive ? '1' : '0'}
        data-kg-motion-capture-research-ready={evidence.researchReady ? '1' : '0'}
      >
        <header className="flex min-w-0 items-center justify-between gap-2">
          <span className="flex items-center gap-1 font-semibold"><Radio className="h-3.5 w-3.5" aria-hidden="true" /> Motion Capture</span>
          <span className={evidence.researchReady ? UI_THEME_TOKENS.status.success : UI_THEME_TOKENS.text.tertiary}>
            {evidence.researchReady ? 'Research-ready evidence' : 'Evidence incomplete'}
          </span>
        </header>
        <p className={UI_THEME_TOKENS.text.secondary}>
          {captureSurfaceActive ? tierLabel(evidence.tier) : 'Open an approved XR capture surface'} · {session.sources.length} source{session.sources.length === 1 ? '' : 's'} · {recording.status} · peer {compactPeerStatus}
        </p>
        <MotionCaptureInvocationChip variant={variant} />
        <p className={UI_THEME_TOKENS.text.tertiary} data-kg-motion-capture-web-mcp="1">WebMCP · {webMcpControlTool}</p>
        {variant === 'media' ? (
          <section className="flex flex-wrap gap-1" aria-label="Motion capture Media exports">
            <button type="button" className="App-toolbar__btn" disabled={!exportReady || Boolean(pendingAction)} onClick={() => void exportRecording('json')} data-kg-motion-capture-media-export="json">
              <Download className="h-3 w-3" aria-hidden="true" /> JSON
            </button>
            <button type="button" className="App-toolbar__btn" disabled={!exportReady || Boolean(pendingAction)} onClick={() => void exportRecording('csv')} data-kg-motion-capture-media-export="csv">
              <Download className="h-3 w-3" aria-hidden="true" /> CSV
            </button>
          </section>
        ) : null}
      </section>
    )
  }

  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="Motion capture platform"
      data-kg-motion-capture-platform="1"
      data-kg-motion-capture-schema={session.schema}
      data-kg-motion-capture-runtime-ready={captureSurfaceActive ? '1' : '0'}
      data-kg-motion-capture-research-ready={evidence.researchReady ? '1' : '0'}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <span>
          <h3 className="text-[11px] font-semibold">Capture platform</h3>
          <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Provider-neutral · derived landmarks only</p>
        </span>
        <span className={cn('rounded border px-1.5 py-0.5 text-[9px]', UI_THEME_TOKENS.panel.border, evidence.researchReady ? UI_THEME_TOKENS.status.success : UI_THEME_TOKENS.status.warning)}>
          {evidence.researchReady ? 'Research-ready evidence' : 'Not research-ready'}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]" aria-label="Motion capture session evidence">
        <dt className={UI_THEME_TOKENS.text.tertiary}>Session</dt><dd>{shortOpaqueId(session.sessionId)}</dd>
        <dt className={UI_THEME_TOKENS.text.tertiary}>Quality tier</dt><dd>{tierLabel(evidence.tier)}</dd>
        <dt className={UI_THEME_TOKENS.text.tertiary}>Sources / synced</dt><dd>{evidence.activeSourceCount} / {evidence.synchronizedSourceCount}</dd>
        <dt className={UI_THEME_TOKENS.text.tertiary}>Max skew / jitter</dt><dd>{evidence.maxSkewMs === null ? '—' : `${evidence.maxSkewMs.toFixed(1)} ms`} / {evidence.maxJitterMs.toFixed(1)} ms</dd>
        <dt className={UI_THEME_TOKENS.text.tertiary}>Missing / drop rate</dt><dd>{evidence.missingSamples} / {(evidence.dropRate * 100).toFixed(1)}%</dd>
        <dt className={UI_THEME_TOKENS.text.tertiary}>Recording budget</dt><dd>{recording.sampleCount} / {recording.maxSamples}</dd>
      </dl>

      <section className="grid gap-1" aria-label="Motion capture sources" data-kg-motion-capture-sources={session.sources.length}>
        {session.sources.length === 0 ? (
          <p className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Start Motion Control to register the built-in, session-scoped source. Peer and hardware adapters register through the same runtime contract.</p>
        ) : session.sources.map((source, index) => (
          <article key={source.sourceId} className={cn('grid gap-1 rounded border p-1.5 text-[9px]', UI_THEME_TOKENS.panel.border)} data-kg-motion-capture-source={index + 1}>
            <span className="flex flex-wrap items-center justify-between gap-1">
              <b>Source {index + 1} · {shortOpaqueId(source.sourceId)}</b>
              <span>{source.calibration.status} · {source.clockAlignment.status}</span>
            </span>
            <p className={UI_THEME_TOKENS.text.tertiary}>{sourceDetail(source)}</p>
            <p className={UI_THEME_TOKENS.text.tertiary}>Research window {source.quality.researchDurationMs.toFixed(0)} ms · manifest {source.calibration.researchValidation ? 'bound' : 'unbound'}</p>
            <span className="flex flex-wrap gap-1">
              <button type="button" className="App-toolbar__btn" disabled={source.calibration.status === 'calibrating'} onClick={() => runAction(`calibrate:${source.sourceId}`, () => { motionCapturePlatformUiAdapter.setCalibrationStatus(source.sourceId, 'begin') }, 'Calibration evidence collection started.')} data-kg-motion-capture-calibration="begin">Begin calibration</button>
              <button type="button" className="App-toolbar__btn" disabled={source.calibration.status === 'uncalibrated'} onClick={() => runAction(`calibration-reset:${source.sourceId}`, () => { motionCapturePlatformUiAdapter.setCalibrationStatus(source.sourceId, 'reset') }, 'Calibration status reset.')} data-kg-motion-capture-calibration="reset">Reset</button>
            </span>
          </article>
        ))}
        <p className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Research readiness requires a validated SI-frame manifest; manual calibration status never qualifies it.</p>
      </section>

      <label className={cn('App-toolbar__btn w-fit cursor-pointer', recording.status === 'recording' || Boolean(pendingAction) ? 'pointer-events-none opacity-50' : '')} data-kg-motion-capture-research-evidence="import">
        <Upload className="h-3 w-3" aria-hidden="true" /> Import research evidence
        <input
          type="file"
          className="sr-only"
          accept="application/json,.json"
          disabled={recording.status === 'recording' || Boolean(pendingAction)}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void importResearchEvidence(file)
          }}
        />
      </label>

      <section className="flex flex-wrap gap-1" aria-label="Motion capture recording controls" data-kg-motion-capture-recording={recording.status}>
        <button type="button" className="App-toolbar__btn" disabled={!captureSurfaceActive || session.sources.length === 0 || recording.status !== 'idle'} onClick={() => runAction('record', motionCapturePlatformUiAdapter.startRecording, 'Bounded local recording started.')} data-kg-motion-capture-record="start">Record</button>
        <button type="button" className="App-toolbar__btn" disabled={recording.status !== 'recording'} onClick={() => runAction('record-stop', motionCapturePlatformUiAdapter.stopRecording, 'Recording stopped and retained for local export.')} data-kg-motion-capture-record="stop">Finish</button>
        <button type="button" className="App-toolbar__btn" disabled={recording.status === 'recording' || recording.status === 'idle'} onClick={() => runAction('record-clear', motionCapturePlatformUiAdapter.clearRecording, 'Local derived recording cleared.')} data-kg-motion-capture-record="clear">Clear</button>
        <button type="button" className="App-toolbar__btn" disabled={!exportReady || Boolean(pendingAction)} onClick={() => void exportRecording('json')} data-kg-motion-capture-export="json"><Download className="h-3 w-3" aria-hidden="true" /> JSON</button>
        <button type="button" className="App-toolbar__btn" disabled={!exportReady || Boolean(pendingAction)} onClick={() => void exportRecording('csv')} data-kg-motion-capture-export="csv"><Download className="h-3 w-3" aria-hidden="true" /> CSV</button>
      </section>

      <label className={cn('flex items-start gap-2 text-[10px]', UI_THEME_TOKENS.text.secondary)}>
        <PanelCheckbox checked={peerSharing.enabled} disabled={!captureSurfaceActive || !peerSharing.available} onChange={event => {
          const enabled = event.currentTarget.checked
          runAction('peer-sharing', () => {
            const next = motionCapturePlatformUiAdapter.setPeerSharingEnabled(enabled)
            if (next.enabled !== enabled) throw new Error(next.lastError || 'Peer-derived sharing could not change state.')
          }, `Peer-derived sharing ${enabled ? 'enabled' : 'disabled'}.`)
        }} data-kg-motion-capture-peer-sharing="1" />
        <span><b className="flex items-center gap-1"><Network className="h-3 w-3" aria-hidden="true" /> Peer-derived sharing</b>{peerStatus}. Derived observations only; no frames, raw tensors, stable device IDs, or endpoints.</span>
      </label>

      {evidence.warnings.length > 0 ? <p className={cn('text-[9px]', UI_THEME_TOKENS.status.warning)} data-kg-motion-capture-warnings="1">Evidence: {evidence.warnings.map(warningLabel).join(' · ')}</p> : null}
      <p className={cn('flex items-center gap-1 text-[9px]', UI_THEME_TOKENS.text.tertiary)}><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Recording and export stay browser-local and bounded.</p>
    </section>
  )
}
