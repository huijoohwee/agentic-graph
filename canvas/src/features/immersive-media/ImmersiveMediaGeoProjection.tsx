import React from 'react'
import { resolveMediaPreviewSelectableDataAttr } from '@/lib/cards/mediaPreviewSurfaceSelection'
import { MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME } from '@/lib/ui/mediaExpandedPreviewLayout'
import {
  completeImmersiveMediaTransition,
  setHoveredImmersiveMediaMarker,
  setSelectedImmersiveMediaMarker,
} from './immersiveMediaRuntime'
import type {
  ImmersiveMediaMarker,
  ImmersiveMediaSnapshot,
  ImmersiveMediaView,
} from './immersiveMediaModel'

type ProjectedMarker = Readonly<{
  edge: boolean
  left: number
  marker: ImmersiveMediaMarker
  opacity: number
  top: number
}>

function normalizeYawDegrees(value: number): number {
  return ((value + 540) % 360) - 180
}

export function projectImmersiveMarkerToGeoViewport(
  marker: ImmersiveMediaMarker,
  view: ImmersiveMediaView,
): Omit<ProjectedMarker, 'marker'> {
  const halfFieldOfView = Math.max(14, view.fieldOfViewDegrees / 2)
  const yawDelta = normalizeYawDegrees(marker.yawDegrees - view.yawDegrees)
  const pitchDelta = marker.pitchDegrees - view.pitchDegrees
  const rawLeft = 50 + yawDelta / halfFieldOfView * 42
  const rawTop = 50 - pitchDelta / Math.max(18, halfFieldOfView * 0.72) * 38
  const edge = rawLeft < 6 || rawLeft > 94 || rawTop < 12 || rawTop > 88
  return {
    edge,
    left: Math.max(6, Math.min(94, rawLeft)),
    opacity: edge ? 0.46 : 1,
    top: Math.max(12, Math.min(88, rawTop)),
  }
}

function readVisibleMarkers(snapshot: ImmersiveMediaSnapshot): readonly ProjectedMarker[] {
  const layers = new Map(snapshot.layers.map(layer => [layer.id, layer]))
  return snapshot.markers
    .filter(marker => layers.get(marker.layerId)?.visible !== false)
    .map(marker => {
      const projection = projectImmersiveMarkerToGeoViewport(marker, snapshot.view)
      return {
        marker,
        ...projection,
        opacity: (layers.get(marker.layerId)?.opacity ?? 1) * projection.opacity,
      }
    })
}

export function ImmersiveMediaGeoProjection({
  snapshot,
}: {
  snapshot: ImmersiveMediaSnapshot
}) {
  const [introAnimating, setIntroAnimating] = React.useState(false)
  const [transitionOpacity, setTransitionOpacity] = React.useState(1)

  React.useEffect(() => {
    if (!snapshot.active || typeof window === 'undefined') return
    setIntroAnimating(true)
    let settleFrame = 0
    const startFrame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(() => setIntroAnimating(false))
    })
    return () => {
      window.cancelAnimationFrame(startFrame)
      if (settleFrame) window.cancelAnimationFrame(settleFrame)
    }
  }, [snapshot.active, snapshot.introRevision])

  React.useEffect(() => {
    if (!snapshot.active || typeof window === 'undefined') return
    const durationMs = Math.max(1, snapshot.transitionDurationMs)
    const revision = snapshot.transitionRevision
    setTransitionOpacity(0.28)
    const revealTimer = window.setTimeout(
      () => setTransitionOpacity(1),
      Math.max(1, Math.round(durationMs * 0.45)),
    )
    const completionTimer = window.setTimeout(
      () => completeImmersiveMediaTransition(revision),
      durationMs,
    )
    return () => {
      window.clearTimeout(revealTimer)
      window.clearTimeout(completionTimer)
    }
  }, [
    snapshot.active,
    snapshot.transitionDurationMs,
    snapshot.transitionRevision,
  ])

  const markers = React.useMemo(() => readVisibleMarkers(snapshot), [snapshot])
  const polygonPoints = markers
    .slice(0, 8)
    .map(({ left, top }) => `${left},${top}`)
    .join(' ')
  const selectedMarker = markers.find(
    projected => projected.marker.id === snapshot.selectedMarkerId,
  )
  const lensScale = 1 + snapshot.view.lensStrength * 0.035
  const selectableSurfaceDataAttr = resolveMediaPreviewSelectableDataAttr(true)

  return (
    <section
      className="pointer-events-none absolute inset-0 z-[18] overflow-hidden"
      aria-label="Geo immersive context projection"
      data-kg-immersive-media-geo-projection="active"
      data-kg-immersive-media-geo-revision={snapshot.revision}
      data-kg-immersive-media-geo-fov={Math.round(snapshot.view.fieldOfViewDegrees)}
      data-kg-immersive-media-geo-intro-revision={snapshot.introRevision}
      data-kg-immersive-media-geo-transition-revision={snapshot.transitionRevision}
      data-kg-immersive-media-geo-overlay={snapshot.overlay.enabled ? '1' : '0'}
      data-kg-immersive-media-geo-polygon={snapshot.polygonPattern ? '1' : '0'}
      data-kg-immersive-media-geo-selected-marker={snapshot.selectedMarkerId || ''}
    >
      <section
        className="pointer-events-none absolute inset-0"
        aria-label="Dimmed surround outside immersive flight context media"
        data-kg-immersive-media-lightbox-surround="1"
      >
        <span className={`absolute inset-x-0 top-0 bottom-[92%] ${MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME}`} />
        <span className={`absolute inset-x-0 bottom-0 top-[87%] ${MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME}`} />
        <span className={`absolute bottom-[13%] left-0 top-[8%] right-[92%] ${MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME}`} />
        <span className={`absolute bottom-[13%] right-0 top-[8%] left-[92%] ${MEDIA_EXPANDED_PREVIEW_OVERLAY_CLASS_NAME}`} />
      </section>
      <figure
        className="pointer-events-auto absolute inset-[8%_8%_13%_8%] m-0 overflow-hidden rounded-[2rem] border border-cyan-200/35 transition-all ease-out"
        aria-label="Immersive flight context media"
        data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        style={{
          opacity: transitionOpacity,
          transform: `scale(${introAnimating ? lensScale * 0.92 : lensScale})`,
          transitionDuration: `${snapshot.transitionDurationMs}ms`,
        }}
      >
        {snapshot.overlay.enabled ? (
          <aside
            className="pointer-events-none absolute inset-0"
            aria-label="Immersive panorama visual overlay"
            style={{
              background: [
                'linear-gradient(180deg, rgba(8,47,73,0.14), transparent 28%, transparent 72%, rgba(8,47,73,0.12))',
                'radial-gradient(circle at center, transparent 45%, rgba(6,182,212,0.08) 100%)',
              ].join(','),
            }}
          />
        ) : null}
        <figcaption
          className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-cyan-200/35 bg-slate-950/45 px-3 py-1 text-[9px] font-semibold tracking-[0.16em] text-cyan-50 backdrop-blur"
          aria-label="Immersive flight context media"
          data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        >
          IMMERSIVE FLIGHT CONTEXT · {Math.round(snapshot.view.yawDegrees)}° · FOV {Math.round(snapshot.view.fieldOfViewDegrees)}°
        </figcaption>
        <hr
          className="pointer-events-none absolute left-[8%] right-[8%] top-1/2 m-0 border-0 border-t border-dashed border-cyan-100/30"
          aria-label="Immersive horizon"
        />
        <span
          className="pointer-events-none absolute bottom-[8%] left-1/2 top-[8%] border-l border-dashed border-cyan-100/25"
          role="separator"
          aria-label="Immersive north axis"
          aria-orientation="vertical"
        />
        <abbr
          className="pointer-events-none absolute left-1/2 top-[9%] -translate-x-1/2 text-[9px] font-bold text-cyan-50/80 no-underline"
          title="North"
        >
          N
        </abbr>
        {snapshot.polygonPattern && markers.length > 2 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label="Polygon connecting visible immersive markers"
          >
            <title>Polygon connecting visible immersive markers</title>
            <polygon
              points={polygonPoints}
              fill="rgba(245,158,11,0.06)"
              stroke="rgba(251,191,36,0.62)"
              strokeDasharray="1.5 1.5"
              strokeWidth="0.35"
            />
          </svg>
        ) : null}
        {markers.map(({ edge, left, marker, opacity, top }) => {
          const selected = marker.id === snapshot.selectedMarkerId
          return (
            <button
              type="button"
              key={marker.id}
              className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 border-0 bg-transparent p-0"
              aria-label={`${marker.label} immersive marker${selected ? ', selected' : ''}`}
              aria-pressed={selected}
              onClick={() => setSelectedImmersiveMediaMarker(selected ? null : marker.id)}
              onPointerEnter={() => setHoveredImmersiveMediaMarker(marker.id)}
              onPointerLeave={() => setHoveredImmersiveMediaMarker(null)}
              style={{ left: `${left}%`, opacity, top: `${top}%` }}
              data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
              data-kg-immersive-media-geo-marker={marker.id}
              data-kg-immersive-media-geo-marker-selected={selected ? '1' : '0'}
            >
              <span
                className={`block rounded-full border-2 bg-slate-950/60 transition-transform ${
                  selected ? 'h-5 w-5 scale-125 ring-2 ring-white/60' : 'h-3.5 w-3.5'
                }`}
                style={{ borderColor: marker.color }}
              />
              <strong className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/60 px-1.5 py-0.5 text-[8px] font-normal text-white/90 backdrop-blur">
                {edge ? '‹ ' : ''}{marker.label}{edge ? ' ›' : ''}
              </strong>
            </button>
          )
        })}
        {selectedMarker ? (
          <output
            className="absolute bottom-3 left-1/2 max-w-[70%] -translate-x-1/2 rounded border border-cyan-200/35 bg-slate-950/55 px-3 py-1.5 text-center text-[9px] text-cyan-50 backdrop-blur"
            aria-label="Selected immersive marker details"
            aria-live="polite"
          >
            <strong>{selectedMarker.marker.label}</strong>
            <span className="ml-2 text-white/70">{selectedMarker.marker.tooltip}</span>
          </output>
        ) : null}
      </figure>
    </section>
  )
}

export default ImmersiveMediaGeoProjection
