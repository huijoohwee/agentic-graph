import React from 'react'
import type { WebGLRenderer } from 'three'
import { CanvasXrEntryPanel } from '@/lib/three/ThreeGraphXr'

export function XrSpatialCaptureFallbackSmokePage() {
  const rendererRef = React.useRef<WebGLRenderer | null>(null)

  return (
    <main
      data-kg-xr-spatial-capture-smoke-page="1"
      className="min-h-screen bg-[var(--kg-canvas-bg)] px-6 py-8 text-[var(--kg-text)]"
      aria-label="XR spatial capture fallback browser smoke"
    >
      <header className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <h1 className="text-2xl font-semibold">XR Spatial Capture Fallback Browser Smoke</h1>
        <p className="max-w-3xl text-sm text-[var(--kg-text-secondary)]">
          Dev-only runtime harness for verifying the browser-native XR spatial-capture
          capability contract, including monocular fallback and readable entry-mode markers.
        </p>
      </header>
      <section
        data-kg-xr-spatial-capture-smoke-surface="1"
        className="relative mx-auto mt-8 min-h-[22rem] w-full max-w-5xl overflow-hidden rounded-3xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] shadow-sm"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_52%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.75))]" />
        <div className="relative z-10 flex h-full min-h-[22rem] items-end justify-start p-6 text-sm text-[var(--kg-text-secondary)]">
          <div className="max-w-md rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur">
            <p className="font-medium text-[var(--kg-text)]">Smoke surface</p>
            <p className="mt-2">
              This page mounts the exact XR entry owner used by the canvas and leaves it in
              spatial-capture mode so browser smoke can assert the resolved fallback contract.
            </p>
          </div>
        </div>
        <CanvasXrEntryPanel
          active
          rendererRef={rendererRef}
          surfaceKind="spatial-capture"
          spatialRuntimeStatus="idle"
          spatialRuntimeFidelity="idle"
        />
      </section>
    </main>
  )
}
