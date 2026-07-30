import React from 'react'
import { resolveMediaPreviewSelectableDataAttr } from '@/lib/cards/mediaPreviewSurfaceSelection'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  readImmersiveMediaSnapshot,
  setSelectedImmersiveMediaMarker,
  subscribeImmersiveMediaSnapshot,
} from './immersiveMediaRuntime'
import { ImmersiveMediaGeoProjection } from './ImmersiveMediaGeoProjection'

export function ImmersiveMediaHud({
  geospatialComposite = false,
}: {
  geospatialComposite?: boolean
}) {
  const snapshot = React.useSyncExternalStore(
    subscribeImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
    readImmersiveMediaSnapshot,
  )
  if (!snapshot.active) return null
  const hoveredMarker = snapshot.markers.find(marker => marker.id === snapshot.hoveredMarkerId)
  const selectedMarker = snapshot.markers.find(marker => marker.id === snapshot.selectedMarkerId)
  const tooltipMarker = selectedMarker || hoveredMarker
  const selectableSurfaceDataAttr = resolveMediaPreviewSelectableDataAttr(true)
  return (
    <>
      {geospatialComposite ? <ImmersiveMediaGeoProjection snapshot={snapshot} /> : null}
      {snapshot.overlay.enabled ? (
        <figure
          className={cn(
            'pointer-events-auto absolute bottom-4 left-4 z-20 m-0 rounded border p-3 backdrop-blur',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          aria-label="Partial immersive media overlay"
          style={{
            width: `${snapshot.overlay.widthPercent}%`,
            opacity: snapshot.overlay.opacity,
          }}
          data-kg-immersive-media-partial-overlay="1"
          data-kg-rich-media-selectable-surface={selectableSurfaceDataAttr}
        >
          <figcaption>
            <b className="block text-xs">{snapshot.overlay.title}</b>
            <span className="block text-[10px]">{snapshot.overlay.description}</span>
          </figcaption>
        </figure>
      ) : null}
      {selectedMarker?.kind === 'youtube' && selectedMarker.mediaUrl ? (
        <aside
          className={cn(
            'pointer-events-auto absolute right-4 top-4 z-30 w-[min(480px,45vw)] overflow-hidden rounded border p-2 shadow-xl backdrop-blur',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          data-kg-immersive-media-youtube-element={selectedMarker.id}
        >
          <header className="mb-2 flex items-center justify-between gap-2">
            <b className="truncate text-xs">{selectedMarker.label}</b>
            <button type="button" className="App-toolbar__btn" onClick={() => setSelectedImmersiveMediaMarker(null)}>
              Close
            </button>
          </header>
          <iframe
            className="aspect-video w-full rounded"
            src={selectedMarker.mediaUrl}
            title={selectedMarker.label}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </aside>
      ) : null}
      {tooltipMarker && !(selectedMarker?.kind === 'youtube' && selectedMarker.mediaUrl) ? (
        <aside
          className={cn(
            'pointer-events-none absolute left-1/2 top-4 z-30 max-w-64 -translate-x-1/2 rounded border px-3 py-2 text-center backdrop-blur',
            UI_THEME_TOKENS.panel.border,
            UI_THEME_TOKENS.panel.bg,
          )}
          data-kg-immersive-media-tooltip={tooltipMarker.id}
        >
          <b className="block text-xs">{tooltipMarker.label}</b>
          <span className={cn('block text-[10px]', UI_THEME_TOKENS.text.secondary)}>
            {tooltipMarker.tooltip}
          </span>
        </aside>
      ) : null}
    </>
  )
}

export default ImmersiveMediaHud
