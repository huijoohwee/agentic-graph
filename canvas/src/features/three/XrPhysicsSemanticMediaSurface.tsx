import React from 'react'
import type { Canvas3dModeId } from '@/lib/config.render'
import { SemanticMediaFigure } from '@/lib/cards/SemanticMediaFigure'
import {
  XR_PHYSICS_MEDIA_STAGE_DATA_ATTRIBUTES,
  XR_PHYSICS_MEDIA_STAGE_LABEL,
} from './xrPhysicsMediaSurface'

const ThreeGraphLazy = React.lazy(() => import('@/lib/three/ThreeGraph.impl'))

export function XrPhysicsSemanticMediaSurface({
  active,
  geospatialComposite,
  mode,
  physicsRunReady,
}: Readonly<{
  active: boolean
  geospatialComposite: boolean
  mode: Canvas3dModeId
  physicsRunReady: boolean
}>) {
  const semanticActive = active && physicsRunReady
  return (
    <SemanticMediaFigure
      active={semanticActive}
      activeDataAttributes={XR_PHYSICS_MEDIA_STAGE_DATA_ATTRIBUTES}
      label={XR_PHYSICS_MEDIA_STAGE_LABEL}
      pointerEvents={active && !geospatialComposite ? 'auto' : 'none'}
      selectionTarget="descendant"
    >
      {captionId => (
        <section
          className={`absolute inset-0 z-[10] ${active
            ? `${geospatialComposite ? 'pointer-events-none' : 'pointer-events-auto'} opacity-100`
            : 'pointer-events-none opacity-0'}`}
          data-kg-three-canvas-active={active ? '1' : '0'}
        >
          <ThreeGraphLazy
            active={active}
            geospatialComposite={geospatialComposite}
            mode={mode}
            semanticMediaOwner={semanticActive ? {
              captionId,
              label: XR_PHYSICS_MEDIA_STAGE_LABEL,
            } : undefined}
          />
        </section>
      )}
    </SemanticMediaFigure>
  )
}
