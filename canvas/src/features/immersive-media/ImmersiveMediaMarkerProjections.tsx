import React from 'react'
import { Compass, Map as MapIcon, MapPinned } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import type { ImmersiveMediaMarker, ImmersiveMediaProjection, ImmersiveMediaSnapshot } from './immersiveMediaModel'
import {
  focusImmersiveMediaMarker,
  setHoveredImmersiveMediaMarker,
} from './immersiveMediaRuntime'

type ProjectionDefinition = Readonly<{
  id: ImmersiveMediaProjection
  label: string
  Icon: typeof Compass
}>

const PROJECTIONS: readonly ProjectionDefinition[] = Object.freeze([
  { id: 'compass', label: 'Compass', Icon: Compass },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'plan', label: 'Plan', Icon: MapPinned },
])

function visibleMarkers(snapshot: ImmersiveMediaSnapshot, projection: ImmersiveMediaProjection): readonly ImmersiveMediaMarker[] {
  const visibleLayers = new Map(snapshot.layers.map(layer => [layer.id, layer.visible]))
  return snapshot.markers.filter(marker => marker.projections.includes(projection) && visibleLayers.get(marker.layerId) !== false)
}

function markerPosition(marker: ImmersiveMediaMarker, projection: ImmersiveMediaProjection): Readonly<{ left: number; top: number }> {
  if (projection === 'compass') {
    const angle = (marker.yawDegrees - 90) * Math.PI / 180
    return { left: 50 + Math.cos(angle) * 37, top: 50 + Math.sin(angle) * 37 }
  }
  if (projection === 'map') {
    return {
      left: 50 + marker.yawDegrees / 3.9,
      top: 50 - marker.pitchDegrees / 2.2,
    }
  }
  const angle = (marker.yawDegrees - 90) * Math.PI / 180
  const radius = 16 + (80 - marker.pitchDegrees) / 5.2
  return { left: 50 + Math.cos(angle) * radius, top: 50 + Math.sin(angle) * radius }
}

function ProjectionSurface({
  definition,
  markers,
  selectedMarkerId,
}: {
  definition: ProjectionDefinition
  markers: readonly ImmersiveMediaMarker[]
  selectedMarkerId: string | null
}) {
  const { id, label, Icon } = definition
  const selectedMarkerIndex = markers.findIndex(marker => marker.id === selectedMarkerId)
  const cycleMarker = markers[(selectedMarkerIndex + 1) % markers.length]
  return (
    <section
      className={cn('relative min-h-20 overflow-hidden rounded border p-1', UI_THEME_TOKENS.panel.border)}
      aria-label={`${label} marker projection`}
      data-kg-immersive-media-projection-surface={id}
      data-kg-immersive-media-projection-active={selectedMarkerIndex >= 0 ? '1' : '0'}
    >
      <button
        type="button"
        className={cn(
          'absolute left-1 top-1 z-10 flex items-center gap-1 rounded px-1 py-0.5 text-[9px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70',
          selectedMarkerIndex >= 0 ? UI_THEME_TOKENS.status.info : UI_THEME_TOKENS.text.secondary,
        )}
        aria-label={`Cycle ${label} projection markers`}
        disabled={!cycleMarker}
        title={cycleMarker ? `Focus ${cycleMarker.label} in the shared Camera` : `No visible ${label} markers`}
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation()
          if (cycleMarker) focusImmersiveMediaMarker(cycleMarker.id, id)
        }}
      >
        <Icon className="h-3 w-3" aria-hidden="true" /> {label}
      </button>
      {id === 'compass' ? <span className={cn('absolute left-1/2 top-1 -translate-x-1/2 text-[8px]', UI_THEME_TOKENS.text.tertiary)}>N</span> : null}
      <span
        className={cn('absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate text-[8px]', UI_THEME_TOKENS.text.tertiary)}
        aria-live="polite"
      >
        {selectedMarkerIndex >= 0 ? markers[selectedMarkerIndex]?.label : `${markers.length} visible`}
      </span>
      {markers.map(marker => {
        const position = markerPosition(marker, id)
        const selected = selectedMarkerId === marker.id
        return (
          <button
            key={marker.id}
            type="button"
            className={cn(
              'absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-transform hover:scale-125 focus:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
              selected ? 'scale-125 ring-2 ring-white/70' : '',
            )}
            style={{
              left: `${Math.max(7, Math.min(93, position.left))}%`,
              top: `${Math.max(10, Math.min(90, position.top))}%`,
              borderColor: marker.color,
              backgroundColor: `${marker.color}66`,
            }}
            aria-label={`${label}: ${marker.label}`}
            aria-pressed={selected}
            title={`${marker.label}: ${marker.tooltip}`}
            data-kg-immersive-media-projection-marker={`${id}:${marker.id}`}
            onPointerDown={event => event.stopPropagation()}
            onPointerEnter={() => setHoveredImmersiveMediaMarker(marker.id)}
            onPointerLeave={() => setHoveredImmersiveMediaMarker(null)}
            onFocus={() => setHoveredImmersiveMediaMarker(marker.id)}
            onBlur={() => setHoveredImmersiveMediaMarker(null)}
            onClick={event => {
              event.stopPropagation()
              focusImmersiveMediaMarker(marker.id, id)
            }}
          />
        )
      })}
    </section>
  )
}

export function ImmersiveMediaMarkerProjections({ snapshot }: { snapshot: ImmersiveMediaSnapshot }) {
  return (
    <section
      className="grid grid-cols-3 gap-1"
      aria-label="Interactive marker projections"
      data-kg-immersive-media-marker-projections="compass,map,plan"
    >
      {PROJECTIONS.map(definition => (
        <ProjectionSurface
          key={definition.id}
          definition={definition}
          markers={visibleMarkers(snapshot, definition.id)}
          selectedMarkerId={snapshot.selectedMarkerId}
        />
      ))}
    </section>
  )
}

export default ImmersiveMediaMarkerProjections
