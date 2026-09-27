import type { KgTheme } from '@/lib/ui/tokens-ssot'
import type { LearningLesson } from './learningLessons'
import { LearningWarehouseStructure, WarehouseBoxes, WarehouseRack } from './LearningWarehouseStructure'

const FLOOR = -Math.PI / 2

function LandingPad({ position, color, goal = false }: { position: [number, number]; color: string; goal?: boolean }) {
  return <group name={goal ? 'learning-goal-pad' : 'learning-launch-pad'} position={[position[0], 0, position[1]]}>
    <mesh receiveShadow position={[0, 0.025, 0]} rotation={[FLOOR, 0, 0]}>
      <circleGeometry args={[0.54, 48]} /><meshStandardMaterial color="#293941" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
    <mesh position={[0, 0.029, 0]} rotation={[FLOOR, 0, 0]}>
      <ringGeometry args={[0.49, 0.52, 48]} /><meshBasicMaterial color={color} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
    </mesh>
    <mesh position={[0, 0.031, 0]} rotation={[FLOOR, 0, 0]}>
      <ringGeometry args={[0.18, 0.3, 32]} /><meshBasicMaterial color={color} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
    </mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * 0.36, 0.032, 0]}>
      <boxGeometry args={[0.12, 0.004, 0.025]} /><meshBasicMaterial color={color} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
    </mesh>)}
  </group>
}

function PalletLoad({ width, depth, height }: { width: number; depth: number; height: number }) {
  const timber = Math.min(0.12, height * 0.15)
  return <>
    <mesh castShadow receiveShadow position={[0, timber + (height - timber) / 2, 0]}>
      <boxGeometry args={[width, height - timber, depth]} /><meshStandardMaterial color="#c5a477" roughness={0.87} />
    </mesh>
    <WarehouseBoxes color="#917750" parts={[-1, 0, 1].map(side => ({ position: [side * width * 0.36, timber / 2, 0], size: [width * 0.19, timber, depth] }))} />
    <WarehouseBoxes color="#667578" metalness={0.3} parts={[-1, 1].map(side => ({ position: [side * width * 0.27, height / 2, depth / 2 - 0.008], size: [0.025, height, 0.012] }))} />
    <mesh position={[0, height * 0.67, depth / 2 - 0.001]}>
      <boxGeometry args={[width * 0.35, height * 0.17, 0.002]} /><meshStandardMaterial color="#e5e5d9" roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  </>
}

function WarehouseObstacle({ obstacle }: { obstacle: LearningLesson['obstacles'][number] }) {
  const [width, depth] = obstacle.size, height = obstacle.height ?? 1
  return <group name={`learning-obstacle-${obstacle.id}`} position={[obstacle.position[0], 0, obstacle.position[1]]}>
    {obstacle.id.startsWith('rack-') ? <WarehouseRack width={width} depth={depth} height={height} /> : <PalletLoad width={width} depth={depth} height={height} />}
  </group>
}

/** The marked inspection cell retains the bounded lesson physics within a larger facility cutaway. */
export function LearningDroneRoom({ lesson, palette }: { lesson: LearningLesson; palette: KgTheme }) {
  return <group name="learning-drone-training-room">
    <hemisphereLight args={['#e8f3ff', '#667581', 1.3]} />
    <ambientLight intensity={0.4} />
    <directionalLight position={[-3, 11, -6]} intensity={2.7} color="#fff0d5" castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9}
      shadow-camera-top={9} shadow-camera-bottom={-9} shadow-camera-near={0.5}
      shadow-camera-far={32} shadow-bias={-0.0005} shadow-normalBias={0.025} />
    <directionalLight position={[5, 7, 5]} intensity={0.9} color="#b9d9ff" />
    <LearningWarehouseStructure palette={palette} />
    <LandingPad position={[0, 0]} color="#83c8ef" />
    <LandingPad position={[lesson.goal[0], lesson.goal[1]]} color="#92efb5" goal />
    {lesson.obstacles.map(obstacle => <WarehouseObstacle key={obstacle.id} obstacle={obstacle} />)}
  </group>
}
