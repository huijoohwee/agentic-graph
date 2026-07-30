import React from 'react'
import { resolveMediaPreviewSelectableDataAttr } from '@/lib/cards/mediaPreviewSurfaceSelection'

export function ThreeCanvasMediaFigure({
  children,
  citySimActive,
}: Readonly<{
  children: React.ReactNode
  citySimActive: boolean
}>) {
  const label = 'Interactive City simulation media stage'

  return (
    <figure
      className="absolute inset-0 m-0"
      aria-label={citySimActive ? label : undefined}
      role={citySimActive ? undefined : 'presentation'}
      data-kg-city-sim-semantic-media={citySimActive ? 'active' : undefined}
      data-kg-rich-media-selectable-surface={
        resolveMediaPreviewSelectableDataAttr(citySimActive)
      }
    >
      {children}
      {citySimActive ? <figcaption className="sr-only">{label}</figcaption> : null}
    </figure>
  )
}
