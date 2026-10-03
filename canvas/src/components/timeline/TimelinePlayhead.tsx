import React from 'react'

export function TimelinePlayhead({ maxMinutes, positionMinutes, frameRate = 0, onSeek, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  maxMinutes: number
  positionMinutes: number
  frameRate?: number
  onSeek: (minutes: number) => void
}) {
  const maximum = Number.isFinite(maxMinutes) ? Math.max(0, maxMinutes) : 0
  const position = Math.min(maximum, Math.max(0, Number.isFinite(positionMinutes) ? positionMinutes : 0))
  const step = 1 / (60 * (Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 1))
  return <button {...props} type="button" role="slider" className={`timeline-playhead-control ${className}`}
    disabled={maximum <= 0} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={maximum * 60}
    aria-valuenow={position * 60} aria-valuetext={`${(position * 60).toFixed(2)} seconds`}
    data-kg-video-sequence-ruler-scrub-target="1"
    title="Drag to seek; Arrow keys step; Page keys jump; Home/End seek bounds"
    onKeyDown={event => {
      const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step
        : event.key === 'PageUp' ? step * 10 : event.key === 'PageDown' ? -step * 10 : 0
      if (!delta && event.key !== 'Home' && event.key !== 'End') return
      event.preventDefault()
      event.stopPropagation()
      onSeek(event.key === 'Home' ? 0 : event.key === 'End' ? maximum : Math.min(maximum, Math.max(0, position + delta)))
    }} />
}
