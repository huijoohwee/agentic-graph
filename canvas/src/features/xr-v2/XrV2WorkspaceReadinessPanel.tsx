import React from 'react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  readXrV2WorkspaceReadiness,
  subscribeXrV2WorkspaceReadiness,
  type XrV2WorkspaceReadinessSnapshot,
} from './xrV2WorkspaceReadinessRuntime'
import { XrV2SpatialCapturePanel } from './XrV2SpatialCapturePanel'
import { XrV2DeliveryValidationPanel } from './XrV2DeliveryValidationPanel'
import {
  readXrV2ImmersiveSession,
  startXrV2ImmersiveSession,
  stopXrV2ImmersiveSession,
  subscribeXrV2ImmersiveSession,
  synchronizeXrV2ImmersiveAvailability,
} from './xrV2ImmersiveSessionRuntime'

function evidenceClass(evidence: string): string {
  if (evidence === 'browser-observed') return 'text-emerald-700 dark:text-emerald-300'
  if (evidence === 'deterministic-proven') return 'text-cyan-700 dark:text-cyan-300'
  if (evidence === 'adapter-available') return 'text-blue-700 dark:text-blue-300'
  if (evidence === 'probing') return 'text-amber-700 dark:text-amber-300'
  return UI_THEME_TOKENS.text.tertiary
}

function XrV2ImmersiveSessionControls({ readiness }: Readonly<{
  readiness: XrV2WorkspaceReadinessSnapshot
}>) {
  const immersive = React.useSyncExternalStore(
    subscribeXrV2ImmersiveSession,
    readXrV2ImmersiveSession,
    readXrV2ImmersiveSession,
  )
  React.useEffect(() => {
    synchronizeXrV2ImmersiveAvailability()
  }, [readiness.canOfferUserActions, readiness.capabilityTier])
  const admitted = readiness.canOfferUserActions
    && (readiness.capabilityTier === 'webxr-ar' || readiness.capabilityTier === 'webxr-vr')
  const active = immersive.phase === 'active'
  const busy = immersive.phase === 'requesting' || immersive.phase === 'ending'
  return (
    <section
      className={cn('grid gap-1 rounded border p-2 text-[9px]', UI_THEME_TOKENS.panel.border)}
      aria-label="XR v2 immersive session"
      data-kg-xr-v2-immersive-session={immersive.phase}
      data-kg-xr-v2-immersive-tier-admitted={admitted ? 'true' : 'false'}
      data-kg-xr-v2-immersive-permission-requested={immersive.permissionRequested ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <strong>Immersive session · explicit action</strong>
        {active ? (
          <button type="button" className="App-toolbar__btn" disabled={busy} onClick={() => void stopXrV2ImmersiveSession()} data-kg-xr-v2-immersive-exit="1">
            Exit XR
          </button>
        ) : (
          <button type="button" className="App-toolbar__btn" disabled={!admitted || !immersive.rendererAvailable || busy} onClick={() => void startXrV2ImmersiveSession()} data-kg-xr-v2-immersive-enter="1">
            {readiness.capabilityTier === 'webxr-vr' ? 'Enter VR' : 'Enter AR'}
          </button>
        )}
      </div>
      <p className={cn('m-0', UI_THEME_TOKENS.text.tertiary)}>{immersive.message}</p>
    </section>
  )
}

export function XrV2WorkspaceReadinessPanelView({
  snapshot,
}: Readonly<{ snapshot: XrV2WorkspaceReadinessSnapshot }>) {
  const tier = snapshot.capabilityTier || 'detecting'
  const viewerTier = snapshot.progressiveViewer?.renderedTier || 'not-mounted'
  const metadata = snapshot.assetMetadata
  return (
    <section
      className={cn('grid gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="XR v2 pinned runtime readiness"
      data-kg-xr-v2-workspace-readiness="1"
      data-kg-xr-v2-probe-status={snapshot.status}
      data-kg-xr-v2-capability-tier={tier}
      data-kg-xr-v2-viewer-tier={viewerTier}
      data-kg-xr-v2-camera-auto-request="false"
      data-kg-xr-v2-sensor-auto-request="false"
      data-kg-xr-v2-immersive-auto-request="false"
      data-kg-xr-v2-physical-certification={snapshot.physicalCertification}
    >
      <header className="flex items-start justify-between gap-2">
        <section className="min-w-0">
          <h4 className={cn('m-0 text-[10px] font-semibold uppercase', UI_THEME_TOKENS.text.secondary)}>
            Pinned XR v2 runtime readiness
          </h4>
          <p className={cn('m-0 text-[9px]', UI_THEME_TOKENS.text.tertiary)}>
            Source 5679d410 · local, zero-token browser probes
          </p>
        </section>
        <output
          className={cn('shrink-0 rounded border px-2 py-1 text-[9px] font-semibold', UI_THEME_TOKENS.panel.border)}
          aria-live="polite"
          data-kg-xr-v2-capability-tier-output="1"
        >
          Tier<br />{tier}
        </output>
      </header>

      <p className="m-0 rounded bg-cyan-100 px-2 py-1 text-[9px] text-cyan-950 dark:bg-cyan-950/60 dark:text-cyan-100">
        Capability is resolved before Start/Enable becomes available. Camera, sensors, and immersive sessions remain three separate explicit user actions; this probe requests none.
      </p>

      <XrV2ImmersiveSessionControls readiness={snapshot} />

      <XrV2SpatialCapturePanel
        actionsEnabled={snapshot.canOfferUserActions
          && snapshot.browserApis.mediaCapture
          && snapshot.browserApis.mediaRecorder
          && snapshot.browserApis.indexedDb}
        disabledReason={!snapshot.canOfferUserActions
          ? 'Capability detection must finish before capture.'
          : !snapshot.browserApis.indexedDb
            ? 'Durable IndexedDB write/delete preflight failed; capture stays disabled.'
            : !snapshot.browserApis.mediaCapture || !snapshot.browserApis.mediaRecorder
              ? 'This browser lacks the admitted camera or MediaRecorder path.'
              : null}
      />

      <XrV2DeliveryValidationPanel actionsEnabled={snapshot.canOfferUserActions} />

      <dl className={cn('m-0 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]', UI_THEME_TOKENS.text.secondary)}>
        <div><dt className="font-semibold">Viewer</dt><dd className="m-0" data-kg-xr-v2-progressive-viewer={viewerTier}>{viewerTier}</dd></div>
        <div><dt className="font-semibold">Physical proof</dt><dd className="m-0">external required</dd></div>
        <div><dt className="font-semibold">Asset tier</dt><dd className="m-0">{metadata?.xr_capability_tier || 'pending'}</dd></div>
        <div><dt className="font-semibold">Synthesis</dt><dd className="m-0">{metadata?.synthesis_mode || 'pending'}</dd></div>
        <div><dt className="font-semibold">Depth metadata</dt><dd className="m-0">{metadata?.depth_metadata_ref || 'null'}</dd></div>
        <div><dt className="font-semibold">Fallback triggered</dt><dd className="m-0">{String(metadata?.fallback_triggered ?? false)}</dd></div>
      </dl>

      <section aria-label="XR browser API probes" className="flex flex-wrap gap-1 text-[8px]">
        {Object.entries(snapshot.browserApis).map(([name, available]) => (
          <span
            key={name}
            className={cn('rounded border px-1 py-0.5', UI_THEME_TOKENS.panel.border, available ? 'text-emerald-700 dark:text-emerald-300' : UI_THEME_TOKENS.text.tertiary)}
            data-kg-xr-v2-browser-api={name}
            data-kg-xr-v2-browser-api-available={available ? 'true' : 'false'}
          >
            {name}: {available ? 'yes' : 'no'}
          </span>
        ))}
      </section>

      <ol className="m-0 grid list-none gap-1 p-0" aria-label="Pinned acceptance evidence AC-1 through AC-12">
        {snapshot.criteria.map(criterion => (
          <li
            key={criterion.id}
            className={cn('rounded border px-2 py-1 text-[9px]', UI_THEME_TOKENS.panel.border)}
            data-kg-xr-v2-ac={criterion.id}
            data-kg-xr-v2-ac-local-evidence={criterion.localEvidence}
            data-kg-xr-v2-ac-external-required={criterion.externalEvidenceRequired.length > 0 ? 'true' : 'false'}
          >
            <div className="flex items-start justify-between gap-2">
              <strong>{criterion.id} · {criterion.title}</strong>
              <span className={cn('shrink-0', evidenceClass(criterion.localEvidence))}>{criterion.localEvidence}</span>
            </div>
            <p className={cn('m-0', UI_THEME_TOKENS.text.tertiary)}>{criterion.detail}</p>
            {criterion.externalEvidenceRequired.length > 0 ? (
              <p className="m-0 text-amber-700 dark:text-amber-300">
                External certification: {criterion.externalEvidenceRequired.join(', ')}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      {snapshot.error ? (
        <p className="m-0 rounded bg-red-100 px-2 py-1 text-[9px] text-red-900 dark:bg-red-950/60 dark:text-red-100" role="alert">
          {snapshot.error}
        </p>
      ) : null}
    </section>
  )
}

export function XrV2WorkspaceReadinessPanel() {
  const snapshot = React.useSyncExternalStore(
    subscribeXrV2WorkspaceReadiness,
    readXrV2WorkspaceReadiness,
    readXrV2WorkspaceReadiness,
  )
  return <XrV2WorkspaceReadinessPanelView snapshot={snapshot} />
}
