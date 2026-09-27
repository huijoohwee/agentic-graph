import { getKgTokenFallback, type KgTheme } from '@/lib/ui/tokens-ssot'
import type { LearningLesson } from './learningLessons'

const FLOOR = -Math.PI / 2
const panelSlots = [-6, -2, 2, 6]

function LandingPad({ position, color, goal = false }: { position: [number, number]; color: string; goal?: boolean }) {
  return <group name={goal ? 'learning-goal-pad' : 'learning-launch-pad'} position={[position[0], 0, position[1]]}>
    <mesh receiveShadow position={[0, 0.012, 0]} rotation={[FLOOR, 0, 0]}>
      <circleGeometry args={[0.54, 48]} /><meshStandardMaterial color="#293941" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
    <mesh position={[0, 0.016, 0]} rotation={[FLOOR, 0, 0]}>
      <ringGeometry args={[0.49, 0.52, 48]} /><meshBasicMaterial color={color} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
    </mesh>
    {/* The inner ring retains the existing goal location and scale. */}
    <mesh position={[0, 0.018, 0]} rotation={[FLOOR, 0, 0]}>
      <ringGeometry args={[0.18, 0.3, 32]} /><meshBasicMaterial color={color} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
    </mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * 0.36, 0.019, 0]}>
      <boxGeometry args={[0.12, 0.004, 0.025]} /><meshBasicMaterial color={color} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
    </mesh>)}
  </group>
}

function TrainingCrate({ obstacle }: { obstacle: LearningLesson['obstacles'][number] }) {
  const [width, depth] = obstacle.size
  return <group name={`learning-obstacle-${obstacle.id}`} position={[obstacle.position[0], 0, obstacle.position[1]]}>
    {/* All detail stays inside the existing one-metre collision box. */}
    <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
      <boxGeometry args={[width, 1, depth]} /><meshStandardMaterial color="#b39163" roughness={0.86} />
    </mesh>
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x}:${z}`} castShadow position={[x * (width / 2 - 0.035), 0.5, z * (depth / 2 - 0.035)]}>
      <boxGeometry args={[0.07, 1, 0.07]} /><meshStandardMaterial color="#59656c" metalness={0.55} roughness={0.48} />
    </mesh>))}
    {[0.08, 0.91].map(y => <group key={y}>
      {[-1, 1].map(side => <mesh key={side} castShadow position={[0, y, side * (depth / 2 - 0.009)]}>
        <boxGeometry args={[width - 0.05, 0.055, 0.018]} /><meshStandardMaterial color="#d9c3a0" roughness={0.8} />
      </mesh>)}
    </group>)}
    {[-1, 1].map(side => <mesh key={side} position={[side * width * 0.27, 0.997, 0]}>
      <boxGeometry args={[0.045, 0.006, depth]} /><meshStandardMaterial color="#56636c" metalness={0.5} roughness={0.6} />
    </mesh>)}
    <mesh position={[0, 0.66, depth / 2 - 0.001]}>
      <boxGeometry args={[width * 0.35, 0.17, 0.002]} /><meshStandardMaterial color="#e5dbc6" roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
    {[0, 1, 2].map(index => <mesh key={index} position={[-width * 0.1 + index * width * 0.09, 0.66, depth / 2 - 0.00025]}>
      <boxGeometry args={[0.025, 0.09, 0.0005]} /><meshBasicMaterial color="#53606a" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>)}
  </group>
}

/** Architectural cutaway of the existing ±8 m training bounds, with no new colliders. */
export function LearningDroneRoom({ lesson, palette }: { lesson: LearningLesson; palette: KgTheme }) {
  const light = palette === 'light'
  const floor = light ? '#d8dfe4' : palette === 'black' ? '#252a2f' : '#263447'
  const wall = light ? '#aebdc8' : palette === 'black' ? '#363d44' : '#34465d'
  const trim = light ? '#8f9eaa' : '#62768a'
  const line = light ? '#aab8c3' : '#445368'
  const panel = light ? '#c9d4dd' : '#425469'
  return <group name="learning-drone-training-room">
    <hemisphereLight args={['#e8f3ff', '#65717e', 1.3]} />
    <ambientLight intensity={0.35} />
    <directionalLight position={[2, 9, 5]} intensity={2.8} color="#fff3df" castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9}
      shadow-camera-top={9} shadow-camera-bottom={-9} shadow-camera-near={0.5}
      shadow-camera-far={28} shadow-bias={-0.0005} shadow-normalBias={0.025} />
    <directionalLight position={[-5, 5, -3]} intensity={0.9} color="#b9d9ff" />
    <mesh name="learning-room-floor" receiveShadow position={[0, -0.08, 0]}>
      <boxGeometry args={[16, 0.16, 16]} /><meshStandardMaterial color={floor} roughness={0.87} metalness={0.08} />
    </mesh>
    <gridHelper args={[16, 32, line, light ? '#c0cbd3' : '#354253']} position={[0, 0.003, 0]} />
    {/* Two open sides keep the route visible, as in an architectural cutaway. */}
    {[false, true].map(side => <group key={String(side)} rotation={[0, side ? Math.PI / 2 : 0, 0]}>
      <mesh name="learning-boundary-wall" receiveShadow position={[0, 1.6, -8.1]}>
        <boxGeometry args={[16.2, 3.2, 0.18]} /><meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.13, -7.97]}><boxGeometry args={[16, 0.26, 0.08]} /><meshStandardMaterial color={trim} roughness={0.7} /></mesh>
      <mesh position={[0, 3.17, -8.06]}><boxGeometry args={[16.2, 0.06, 0.25]} /><meshStandardMaterial color={trim} metalness={0.35} roughness={0.55} /></mesh>
      {panelSlots.map(x => <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, 1.8, -7.97]}><boxGeometry args={[3.65, 1.85, 0.08]} /><meshStandardMaterial color={panel} roughness={0.85} /></mesh>
        <mesh position={[0, 2.9, -7.97]}><boxGeometry args={[2.4, 0.045, 0.08]} /><meshStandardMaterial color="#c4dcea" emissive="#90b9d9" emissiveIntensity={0.7} toneMapped={false} /></mesh>
      </group>)}
    </group>)}
    {/* Low-profile boundary marks coincide with the original simulation envelope. */}
    {[-1, 1].flatMap(side => [false, true].map(rotate => <mesh key={`${side}:${rotate}`} position={rotate ? [side * 7.87, 0.009, 0] : [0, 0.009, side * 7.87]}>
      <boxGeometry args={rotate ? [0.025, 0.005, 15.75] : [15.75, 0.005, 0.025]} /><meshBasicMaterial color={trim} />
    </mesh>))}
    <mesh position={[4, 0.012, 0]}><boxGeometry args={[8, 0.004, 0.022]} /><meshBasicMaterial color="#68cfff" /></mesh>
    <mesh position={[0, 0.012, 4]}><boxGeometry args={[0.022, 0.004, 8]} /><meshBasicMaterial color="#ff8a91" /></mesh>
    <LandingPad position={[0, 0]} color="#83c8ef" />
    <LandingPad position={[lesson.goal[0], lesson.goal[1]]} color="#92efb5" goal />
    {lesson.obstacles.map(obstacle => <TrainingCrate key={obstacle.id} obstacle={obstacle} />)}
    <mesh position={[0, -0.175, 0]}><boxGeometry args={[16.04, 0.03, 16.04]} /><meshStandardMaterial color={getKgTokenFallback('--kg-canvas-bg', palette)} /></mesh>
  </group>
}
