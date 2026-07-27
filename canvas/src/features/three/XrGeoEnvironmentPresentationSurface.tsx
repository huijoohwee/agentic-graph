import React from 'react'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'
import type { GeoXrEnvironmentPresentation } from './xrGeoEnvironmentPresentation'

export function XrGeoEnvironmentPresentationSurface({
  presentation,
  stage,
}: {
  presentation: GeoXrEnvironmentPresentation
  stage: XrMotionReferenceStagePreset
}) {
  const span = Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
  const divisions = Math.max(
    8,
    Math.round(span * presentation.gridDivisionsPerMeter),
  )
  return (
    <group
      name="kg_geo_xr_environment_presentation"
      userData={{
        presentation: presentation.id,
        dimension: presentation.dimension,
        theme: presentation.theme,
        stageId: stage.id,
      }}
    >
      <mesh
        name="kg_geo_xr_environment_surface_wash"
        position={[0, 0.045, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <planeGeometry args={[stage.sizeMeters[0], stage.sizeMeters[1]]} />
        <meshBasicMaterial
          color={presentation.surfaceColor}
          depthWrite={false}
          opacity={presentation.surfaceOpacity}
          polygonOffset
          polygonOffsetFactor={-1}
          transparent
        />
      </mesh>
      <gridHelper
        name="kg_geo_xr_environment_grid"
        args={[
          span,
          divisions,
          presentation.gridCenterColor,
          presentation.gridColor,
        ]}
        position={[0, 0.06, 0]}
        renderOrder={2}
      />
    </group>
  )
}
