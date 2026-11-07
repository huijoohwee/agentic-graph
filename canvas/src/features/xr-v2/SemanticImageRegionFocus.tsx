import React from 'react'
import type { SpaceRegion } from './semanticSpaceRuntime'

const fullImage: SpaceRegion = { x: 0, y: 0, width: 1, height: 1 }
/** Pointer selection plus percent fields for touch, keyboard and precise small-object crops. */
export default function SemanticImageRegionFocus({ imageUrl, value, onChange, disabled, regions = [] }: {
  imageUrl: string; value: SpaceRegion; onChange: (value: SpaceRegion) => void; disabled: boolean
  regions?: readonly SpaceRegion[]
}) {
  const start = React.useRef<{ x: number; y: number } | null>(null)
  const [preview, setPreview] = React.useState<SpaceRegion | null>(null)
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
  }
  const rectangle = (event: React.PointerEvent<HTMLDivElement>): SpaceRegion | null => {
    if (!start.current) return null
    const end = point(event), first = start.current
    return { x: Math.min(first.x, end.x), y: Math.min(first.y, end.y),
      width: Math.abs(first.x - end.x), height: Math.abs(first.y - end.y) }
  }
  const shown = preview || value
  return <fieldset disabled={disabled} className="grid min-w-0 gap-2 rounded border p-2">
    <legend>Focus on one object or surface</legend>
    <p className="m-0">Drag a rectangle, or enter percentages. A smaller focus preserves more detail. Use one region for continuous water, sky or terrain.</p>
    <div className="relative touch-none" aria-label="Image focus selection"
      onPointerDown={event => { if (disabled || event.button !== 0) return
        start.current = point(event); event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (start.current) setPreview(rectangle(event)) }}
      onPointerUp={event => { const next = rectangle(event); start.current = null; setPreview(null)
        if (next && next.width >= 0.002 && next.height >= 0.002) onChange(next) }}
      onPointerCancel={() => { start.current = null; setPreview(null) }}>
      <img src={imageUrl} alt="Choose a focused image area" draggable={false} className="block w-full select-none" />
      {regions.map((region, index) => <span key={index} className="pointer-events-none absolute border border-cyan-500 text-xs text-white"
        style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}>
        <span className="bg-black/80 px-1">{index + 1}</span></span>)}
      <span className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10"
        style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.width * 100}%`, height: `${shown.height * 100}%` }} />
    </div>
    <div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>
      {({ x: 'Left', y: 'Top', width: 'Width', height: 'Height' })[key]} %
      <input type="number" className="min-h-11 w-full min-w-0 rounded border bg-transparent px-2"
        aria-label={`Focus ${key} percent`} min={key === 'x' || key === 'y' ? 0 : 0.2} max="100" step="0.1"
        value={Number((value[key] * 100).toFixed(1))} onChange={event => {
          const raw = Number(event.currentTarget.value) / 100
          if (!Number.isFinite(raw)) return
          const next = { ...value, [key]: Math.max(key === 'x' || key === 'y' ? 0 : 0.002, Math.min(1, raw)) }
          if (key === 'x') next.x = Math.min(next.x, 1 - next.width)
          if (key === 'y') next.y = Math.min(next.y, 1 - next.height)
          if (key === 'width') next.width = Math.min(next.width, 1 - next.x)
          if (key === 'height') next.height = Math.min(next.height, 1 - next.y)
          onChange(next)
        }} />
    </label>)}</div>
    <button type="button" className="App-toolbar__btn min-h-11" onClick={() => onChange(fullImage)}>Reset focus to full image</button>
  </fieldset>
}
