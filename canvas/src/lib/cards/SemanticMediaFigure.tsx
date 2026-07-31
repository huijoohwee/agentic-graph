import React from 'react'
import { resolveMediaPreviewSelectableDataAttr } from './mediaPreviewSurfaceSelection'

export function SemanticMediaFigure({
  active,
  activeDataAttributes,
  children,
  label,
  selectionTarget,
}: Readonly<{
  active: boolean
  activeDataAttributes?: Readonly<Record<string, string>>
  children: (captionId: string) => React.ReactNode
  label: string
  selectionTarget: 'descendant' | 'figure'
}>) {
  const captionId = React.useId()

  return (
    <figure
      className="pointer-events-auto absolute inset-0 m-0"
      aria-label={active ? label : undefined}
      role={active ? undefined : 'presentation'}
      {...(active ? activeDataAttributes : undefined)}
      data-kg-rich-media-selectable-surface={
        resolveMediaPreviewSelectableDataAttr(
          active && selectionTarget === 'figure',
        )
      }
    >
      {children(captionId)}
      {active ? (
        <figcaption className="sr-only" id={captionId}>
          {label}
        </figcaption>
      ) : null}
    </figure>
  )
}
