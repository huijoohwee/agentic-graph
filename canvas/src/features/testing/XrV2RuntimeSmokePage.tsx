import React from 'react'

import { createXrV2ReadinessSnapshot } from '@/features/xr-v2'

const SMOKE_SNAPSHOT = createXrV2ReadinessSnapshot({
  entryMode: 'monocular-capture',
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
  return (
    <main
      className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100"
      aria-label="XR v2 deterministic runtime smoke"
      data-kg-xr-v2-runtime-smoke="1"
      data-kg-xr-v2-runtime-schema={SMOKE_SNAPSHOT.schema}
      data-kg-xr-v2-runtime-status={SMOKE_SNAPSHOT.overall}
      data-kg-xr-v2-entry-mode={SMOKE_SNAPSHOT.entryMode}
      data-kg-xr-v2-capability-status={SMOKE_SNAPSHOT.evidence.capabilityDetection}
      data-kg-xr-v2-capture-status={SMOKE_SNAPSHOT.evidence.captureFallback}
      data-kg-xr-v2-authoring-status={SMOKE_SNAPSHOT.evidence.authoringAdapters}
      data-kg-xr-v2-model-asset-status={SMOKE_SNAPSHOT.evidence.liveDepthSynthesis}
      data-kg-xr-v2-browser-status={SMOKE_SNAPSHOT.evidence.browserPlayback}
      data-kg-xr-v2-physical-device-status={SMOKE_SNAPSHOT.evidence.physicalDevice}
      data-kg-xr-v2-blocked-reasons={SMOKE_SNAPSHOT.blockedReasons.join('|')}
    >
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-700 bg-slate-900/80 p-6 shadow-2xl">
        <header>
          <p className="m-0 text-xs uppercase tracking-[0.2em] text-sky-300">Dev-only contract proof</p>
          <h1 className="mt-2 text-2xl font-semibold">XR v2 runtime adapters</h1>
          <p className="text-sm text-slate-300">
            This deterministic page imports the public XR v2 index and reports its evidence boundaries.
            It does not request a camera, immersive session, depth model, media playback, or physical device.
          </p>
        </header>
        <ul className="mt-6 rounded-2xl border border-slate-700 bg-black/20 px-4 text-sm">
          <EvidenceRow label="Capability adapter" value={SMOKE_SNAPSHOT.evidence.capabilityDetection} />
          <EvidenceRow label="Capture fallback adapter" value={SMOKE_SNAPSHOT.evidence.captureFallback} />
          <EvidenceRow label="Authoring adapters" value={SMOKE_SNAPSHOT.evidence.authoringAdapters} />
          <EvidenceRow label="Depth model assets" value={SMOKE_SNAPSHOT.evidence.liveDepthSynthesis} />
          <EvidenceRow label="Browser playback" value={SMOKE_SNAPSHOT.evidence.browserPlayback} />
          <EvidenceRow label="Physical device" value={SMOKE_SNAPSHOT.evidence.physicalDevice} />
        </ul>
        <p className="mt-4 text-xs text-amber-200" data-kg-xr-v2-blocked-summary="1">
          {SMOKE_SNAPSHOT.blockedReasons.join('; ')}
        </p>
      </section>
    </main>
  )
}
