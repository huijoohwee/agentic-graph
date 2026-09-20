import React from 'react'
import { BackSide, Color, Fog } from 'three'
import { useThree } from '@react-three/fiber'
import { DEFAULT_XR_SCENE_APPEARANCE, xrSceneSunPosition, type XrSceneAppearance } from './xrSceneAppearance'

export function XrSceneSkyAtmosphere({
  appearance = DEFAULT_XR_SCENE_APPEARANCE,
  night = false,
  stageScale,
}: {
  appearance?: XrSceneAppearance
  night?: boolean
  stageScale: number
}) {
  const { scene } = useThree()
  React.useEffect(() => {
    const previousBackground = scene.background
    const previousFog = scene.fog
    const background = new Color(night ? '#050a1a' : appearance.skyColor)
    const fog = new Fog(
      night ? '#101a30' : appearance.fogColor,
      stageScale * (night ? 24 : appearance.fogDistanceMeters * 0.4),
      stageScale * (night ? 70 : appearance.fogDistanceMeters),
    )
    scene.background = background
    scene.fog = fog
    return () => {
      if (scene.background === background) scene.background = previousBackground
      if (scene.fog === fog) scene.fog = previousFog
    }
  }, [appearance, night, scene, stageScale])
  const radius = Math.max(48, stageScale * 42)
  const sun = xrSceneSunPosition(appearance, stageScale)
  const sunDistance = radius * 0.72
  const sunLength = Math.hypot(sun[0], sun[1], sun[2]) || 1
  return (
    <group name="agentic_os_xr_scene_sky">
      <mesh name="agentic_os_xr_scene_sky_dome" renderOrder={-10}>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial
          color={night ? '#071018' : appearance.skyColor}
          side={BackSide}
          fog={false}
          depthWrite={false}
        />
      </mesh>
      <mesh
        name="agentic_os_xr_scene_sky_horizon"
        position={[0, -radius * 0.12, 0]}
        scale={[1, 0.18, 1]}
        renderOrder={-9}
      >
        <sphereGeometry args={[radius * 0.99, 24, 12]} />
        <meshBasicMaterial
          color={night ? '#1e293b' : '#fde68a'}
          side={BackSide}
          fog={false}
          depthWrite={false}
          transparent
          opacity={night ? 0.22 : 0.32}
        />
      </mesh>
      <mesh
        name="agentic_os_xr_scene_sky_sun"
        position={[
          sun[0] / sunLength * sunDistance,
          sun[1] / sunLength * sunDistance,
          sun[2] / sunLength * sunDistance,
        ]}
        renderOrder={-9}
      >
        <sphereGeometry args={[night ? stageScale * 0.7 : stageScale * 1.55, 16, 12]} />
        <meshBasicMaterial color={night ? '#cbd5e1' : appearance.lightColor} fog={false} depthWrite={false} />
      </mesh>
    </group>
  )
}
