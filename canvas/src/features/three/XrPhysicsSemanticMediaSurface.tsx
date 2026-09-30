import React from 'react'
import type { Canvas3dModeId } from '@/lib/config.render'
import type { LearningLesson, LearningSceneSnapshot } from '@/features/python-learning/learningLessons'
import { SemanticMediaFigure } from '@/lib/cards/SemanticMediaFigure'
import {
  XR_PHYSICS_MEDIA_STAGE_DATA_ATTRIBUTES,
  XR_PHYSICS_MEDIA_STAGE_LABEL,
} from './xrPhysicsMediaSurface'

const ThreeGraphLazy = React.lazy(() => import('@/lib/three/ThreeGraph.impl'))

export function resolveThreeCanvasSemanticLabel(mode: Canvas3dModeId, physicsRunReady: boolean): string {
  if (physicsRunReady) return XR_PHYSICS_MEDIA_STAGE_LABEL
  return `Interactive ${mode === '3d' ? '3D' : mode === 'xr' ? 'XR' : 'Voxel'} graph`
}

export function XrPhysicsSemanticMediaSurface({
  active,
  geospatialComposite,
  mode,
  physicsRunReady,
  learningScene,
}: Readonly<{
  active: boolean
  geospatialComposite: boolean
  mode: Canvas3dModeId
  physicsRunReady: boolean
  learningScene?: { lesson: LearningLesson; scene?: LearningSceneSnapshot }
}>) {
  const semanticActive = active
  const label = resolveThreeCanvasSemanticLabel(mode, physicsRunReady)
  return (
    <SemanticMediaFigure
      active={semanticActive}
      activeDataAttributes={physicsRunReady ? XR_PHYSICS_MEDIA_STAGE_DATA_ATTRIBUTES : undefined}
      label={label}
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
            learningScene={learningScene}
            semanticMediaOwner={semanticActive ? {
              captionId,
              label,
            } : undefined}
          />
        </section>
      )}
    </SemanticMediaFigure>
  )
}
