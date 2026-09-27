import { memo } from 'react'
import { LearningChargeTruckModel } from './LearningChargeTruckModel'
import { LearningEsp32DroneModel } from './LearningEsp32DroneModel'
import { useWarehouseInspection } from './useWarehouseInspection'
import { WarehouseInspectionSpatialRoutes } from './WarehouseInspectionPaths'
import { LearningDroneModel } from './LearningDroneModel'
import { LearningDroneRoom } from './LearningDroneRoom'
import { XrProceduralVehicleGeometry } from '../three/XrProceduralVehicleGeometry'
import type { LearningLesson, LearningSceneSnapshot } from './learningLessons'
import { getKgTokenFallback, type KgTheme } from '@/lib/ui/tokens-ssot'

const StaticDroneRoom = memo(LearningDroneRoom)

/** Single geometry owner for the Graph lesson Canvas and its phone preview. */
export function LearningSceneGeometry({ lesson, scene, palette = 'dark' }: {
  lesson: LearningLesson; scene?: LearningSceneSnapshot; palette?: KgTheme
}) {
  const inspection = useWarehouseInspection()
  const fleet = inspection.sample
  const facilityDrone = inspection.active ? { ...scene, x: fleet.actors.drone001.position[0], z: fleet.actors.drone001.position[2], altitude: fleet.actors.drone001.position[1], heading: fleet.actors.drone001.heading, ticks: fleet.frameIndex } as LearningSceneSnapshot : scene
  const color = (name: `--kg-${string}`) => getKgTokenFallback(name, palette)
  const x = scene?.x || 0, z = scene?.z || 0, heading = scene?.heading || 0
  if (lesson.vehicle === 'drone') return <>
    <color attach="background" args={[color('--kg-canvas-bg')]} />
    <StaticDroneRoom lesson={lesson} palette={palette} />
    {inspection.active && <WarehouseInspectionSpatialRoutes />}
    <LearningDroneModel scene={facilityDrone} groundOffset={inspection.active ? .09 : .25} />
    <group position={[...fleet.actors.truck.position]} rotation={[0, -fleet.actors.truck.heading * Math.PI / 180, 0]}>
      <LearningChargeTruckModel lidAngleRadians={fleet.lidAngleRadians} />
    </group>
    <group position={[...fleet.actors.drone002.position]} rotation={[0, -fleet.actors.drone002.heading * Math.PI / 180, 0]}>
      <LearningEsp32DroneModel rotorPhase={inspection.active && !fleet.drone002Docked ? fleet.frameIndex * 1.7 : 0} />
    </group>
  </>
  return <>
    <color attach="background" args={[color('--kg-canvas-bg')]} />
    <ambientLight intensity={1.4} /><directionalLight position={[4, 7, 3]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[16, 16]} /><meshStandardMaterial color={color('--kg-surface-bg')} /></mesh>
    <gridHelper args={[16, 16, color('--kg-canvas-edge-stroke'), color('--kg-divider')]} position={[0, 0.01, 0]} />
    <mesh position={[4, 0.02, 0]}><boxGeometry args={[8, 0.015, 0.035]} /><meshBasicMaterial color="#68cfff" /></mesh>
    <mesh position={[0, 0.02, 4]}><boxGeometry args={[0.035, 0.015, 8]} /><meshBasicMaterial color="#ff8a91" /></mesh>
    <mesh position={[lesson.goal[0], 0.025, lesson.goal[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.18, 0.3, 24]} /><meshBasicMaterial color="#92efb5" />
    </mesh>
    {lesson.obstacles.map(o => <mesh key={o.id} position={[o.position[0], 0.5, o.position[1]]}>
      <boxGeometry args={[o.size[0], 1, o.size[1]]} /><meshStandardMaterial color="#e8a869" />
    </mesh>)}
    <group name="learning-vehicle" position={[x, 0.2, z]} rotation={[-Math.PI / 2, 0, -Math.PI / 2 - heading * Math.PI / 180]}>
      <XrProceduralVehicleGeometry color="#87ddff" kind="car" size={[0.3, 0.4, 0.24]} />
    </group>
  </>
}
