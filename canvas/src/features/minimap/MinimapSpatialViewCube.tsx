import React from 'react'
import {
  readSpatialCaptureAxis,
  setSpatialCaptureAxis,
  subscribeSpatialCaptureAxis,
} from '@/features/three/xrSpatialCaptureTools'
import type { SpatialCaptureAxisId } from '@/features/three/xrSpatialCaptureTools'

export function MinimapSpatialViewCube() {
  const [spatialAxis, setSpatialAxisState] = React.useState<SpatialCaptureAxisId>(readSpatialCaptureAxis())

  React.useEffect(() => subscribeSpatialCaptureAxis(setSpatialAxisState), [])

  return (
    <nav
      aria-label="Minimap XR spatial view cube"
      data-kg-minimap-xr-view-cube="1"
      data-kg-minimap-xr-view-cube-axis={spatialAxis}
      className="kg-minimap-root kg-minimap-xr-view-cube grid size-[92px] place-items-center rounded-md border border-sky-400/60 bg-slate-950/36 text-xs font-bold text-white shadow-[var(--kg-shadow-overlay)] backdrop-blur"
    >
      <svg viewBox="0 0 92 92" role="img" aria-label="Minimap XR spatial view cube guide" className="absolute inset-0 h-full w-full" data-kg-minimap-xr-view-cube-guide="1">
        <line x1="42" y1="45" x2="68" y2="34" stroke="#fb7185" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="42" y1="45" x2="52" y2="14" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="42" y1="45" x2="70" y2="60" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="25" cy="40" r="11" fill="none" stroke="#fb7185" strokeWidth="2" opacity="0.9" />
        <circle cx="44" cy="70" r="11" fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.9" />
        <circle cx="56" cy="26" r="11" fill="none" stroke="#3b82f6" strokeWidth="2" opacity="0.9" />
        <circle cx="42" cy="45" r="5" fill="#93c5fd" stroke="#e0f2fe" strokeWidth="1.4" />
      </svg>
      {(['x', 'y', 'z'] as const).map(axis => (
        <button
          key={axis}
          type="button"
          aria-label={`XR view ${axis.toUpperCase()} axis`}
          aria-pressed={spatialAxis === axis}
          data-kg-minimap-xr-view-cube-axis-option={axis}
          className={`absolute grid size-6 place-items-center rounded-full border border-white/35 shadow-none ${axis === 'x' ? 'right-3 top-6 bg-rose-400 text-white' : axis === 'y' ? 'right-7 top-0 bg-emerald-400 text-slate-950' : 'right-1 top-12 bg-indigo-500 text-white'} ${spatialAxis === axis ? 'ring-2 ring-sky-200' : ''}`}
          onClick={() => setSpatialCaptureAxis(axis)}
        >
          {axis.toUpperCase()}
        </button>
      ))}
    </nav>
  )
}
