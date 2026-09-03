import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  CanvasTexture,
  Color,
  Fog,
  LinearFilter,
  Shape,
  SRGBColorSpace,
  type Group,
  type Object3D,
} from 'three'
import {
  XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION,
  XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION,
  readSharedXrNativeControllerDemoFrame,
  type XrNativeControllerDemoObjective,
} from './xrNativeControllerDemoRuntime'
import { XrNativeControllerDemoAerialSetpieces } from './XrNativeControllerDemoAerialSetpieces'
import { XrStagePresetGeometry } from './XrStagePresetGeometry'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'
import {
  XR_NATIVE_CONTROLLER_FOG_COLOR,
  XR_NATIVE_CONTROLLER_SKY_COLOR,
} from './xrNativeControllerPresentation'
import {
  readFlightSimTrainingScenario,
  resolveFlightSimTrainingMission,
  subscribeFlightSimTrainingScenario,
} from '@/features/game-flight-sim/flightSimTrainingScenario'

export const XR_NATIVE_DYNAMIC_BODY_Y_OFFSETS: Readonly<Record<string, number>> = Object.freeze({
  'native-crate-a': 0.72,
  'native-crate-b': 0.72,
  'native-crate-c': 0.92,
  'native-cannonball-left': 0.26,
  'native-cannonball-right': 0.26,
  ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`native-pin-${index + 1}`, 0.59])),
})

type RegisterBodyRef = (subjectId: string, node: Object3D | null) => void

export function XrNativeControllerDemoSceneAtmosphere({ stageScale }: { stageScale: number }) {
  const { scene } = useThree()
  const trainingScenario = React.useSyncExternalStore(
    subscribeFlightSimTrainingScenario,
    readFlightSimTrainingScenario,
    readFlightSimTrainingScenario,
  )
  const night = resolveFlightSimTrainingMission(trainingScenario.missionId).night
  React.useEffect(() => {
    const previousBackground = scene.background
    const previousFog = scene.fog
    const background = new Color(night ? '#050a1a' : XR_NATIVE_CONTROLLER_SKY_COLOR)
    const fog = new Fog(
      night ? '#101a30' : XR_NATIVE_CONTROLLER_FOG_COLOR,
      stageScale * (night ? 24 : 38),
      stageScale * (night ? 70 : 92),
    )
    scene.background = background
    scene.fog = fog
    return () => {
      if (scene.background === background) scene.background = previousBackground
      if (scene.fog === fog) scene.fog = previousFog
    }
  }, [night, scene, stageScale])
  return null
}

function useInstructionTexture(kind: 'ball' | 'rocket') {
  const texture = React.useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 280
    const context = canvas.getContext('2d')
    if (!context) return null
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#26334a'
    context.lineWidth = 12
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20)
    context.fillStyle = '#26334a'
    context.textAlign = 'left'
    context.font = '700 38px system-ui, sans-serif'
    context.fillText(kind === 'ball' ? 'BEACH BALL' : 'ROCKET', 42, 62)
    context.font = '700 27px system-ui, sans-serif'
    const rows = kind === 'ball'
      ? [['W A S D', 'move'], ['SPACE', 'jump'], ['SHIFT', 'turbo (hold)']]
      : [['W A S D', 'move'], ['SPACE', 'booster'], ['SHIFT', 'lander (hold)']]
    rows.forEach(([key, label], index) => {
      const y = 112 + index * 55
      context.fillStyle = 'rgba(244, 248, 233, 0.76)'
      context.strokeStyle = '#26334a'
      context.lineWidth = 4
      context.beginPath()
      context.roundRect(42, y - 32, 255, 43, 7)
      context.fill()
      context.stroke()
      context.fillStyle = '#26334a'
      context.font = '700 23px ui-monospace, monospace'
      context.fillText(key, 61, y - 4)
      context.font = '600 25px system-ui, sans-serif'
      context.fillText(label, 340, y - 4)
    })
    const next = new CanvasTexture(canvas)
    next.colorSpace = SRGBColorSpace
    next.minFilter = LinearFilter
    next.needsUpdate = true
    return next
  }, [kind])
  React.useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

function useObjectiveTexture() {
  const texture = React.useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 150
    const context = canvas.getContext('2d')
    if (!context) return null
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#26334a'
    context.textAlign = 'center'
    context.font = 'italic 700 52px Georgia, serif'
    context.fillText('Find the key to unlock the treasure!', canvas.width / 2, 95)
    const next = new CanvasTexture(canvas)
    next.colorSpace = SRGBColorSpace
    next.minFilter = LinearFilter
    next.needsUpdate = true
    return next
  }, [])
  React.useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

function TutorialMarkings() {
  const ballTexture = useInstructionTexture('ball')
  const rocketTexture = useInstructionTexture('rocket')
  const objectiveTexture = useObjectiveTexture()
  const sandOverlayY = 0.06
  return (
    <group name="agentic_os_xr_playground_tutorial_markings">
      <mesh position={[-3.2, sandOverlayY, -0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.35, 1.95]} />
        <meshBasicMaterial map={ballTexture || undefined} color={ballTexture ? '#ffffff' : '#fff7cf'} transparent depthWrite={false} />
      </mesh>
      <mesh position={[3.2, sandOverlayY, -0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.35, 1.95]} />
        <meshBasicMaterial map={rocketTexture || undefined} color={rocketTexture ? '#ffffff' : '#fff7cf'} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, sandOverlayY + 0.003, 1.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10.2, 1.05]} />
        <meshBasicMaterial map={objectiveTexture || undefined} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

function Rock({ position, scale, color = '#66747a' }: {
  position: [number, number, number]
  scale: [number, number, number]
  color?: string
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} roughness={0.94} flatShading />
    </mesh>
  )
}

function Palm({ position, scale = 1, lean = 0 }: {
  position: [number, number, number]
  scale?: number
  lean?: number
}) {
  return (
    <group position={position} scale={scale} rotation={[0, 0, lean]}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.34, 3.5, 8]} />
        <meshStandardMaterial color="#98613d" roughness={0.9} flatShading />
      </mesh>
      <group position={[0, 3.52, 0]}>
        {Array.from({ length: 7 }, (_, index) => {
          const angle = index * Math.PI * 2 / 7
          return (
            <mesh key={index} rotation={[0, -angle, -1.2]} position={[Math.cos(angle) * 0.82, 0, Math.sin(angle) * 0.82]} castShadow>
              <coneGeometry args={[0.48, 2.6, 5]} />
              <meshStandardMaterial color={index % 2 ? '#3ca85c' : '#59bd62'} roughness={0.82} flatShading />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

function Fence() {
  return (
    <group position={[0, 0, -9.35]} name="agentic_os_xr_playground_fence">
      {Array.from({ length: 19 }, (_, index) => (
        <mesh key={index} position={[-9 + index, 0.95 + (index % 3) * 0.05, 0]} rotation={[0, 0, (index % 2 ? 1 : -1) * 0.035]} castShadow>
          <boxGeometry args={[0.18, 1.9, 0.22]} />
          <meshStandardMaterial color="#a85c3d" roughness={0.9} />
        </mesh>
      ))}
      {[0.52, 1.22].map(height => (
        <mesh key={height} position={[0, height, 0.04]} castShadow>
          <boxGeometry args={[19, 0.14, 0.2]} />
          <meshStandardMaterial color="#7e432f" roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

function Ramp() {
  return (
    <group position={[-8.8, 0, -0.4]} rotation={[0, 0.08, 0]} name="agentic_os_xr_playground_wood_ramp">
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[0, 0.11 + index * 0.105, 1.25 - index * 0.38]} rotation={[-0.25, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 0.17, 0.58]} />
          <meshStandardMaterial color={index % 2 ? '#c57b55' : '#d98b61'} roughness={0.86} />
        </mesh>
      ))}
      {[-1.45, 1.45].map(x => (
        <mesh key={x} position={[x, 0.48, 0.1]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.16, 0.2, 3.4]} />
          <meshStandardMaterial color="#75432f" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Cannon({ position, yaw = 0 }: { position: [number, number, number]; yaw?: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={1.2}>
      {[-0.48, 0.48].map(x => (
        <mesh key={x} position={[x, 0.38, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.43, 0.43, 0.2, 14]} />
          <meshStandardMaterial color="#55463f" roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 0.62, 0.14]} rotation={[Math.PI / 2 - 0.18, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.42, 1.8, 14]} />
        <meshStandardMaterial color="#4b5057" roughness={0.5} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.3, 0.1]} castShadow>
        <boxGeometry args={[1.25, 0.22, 1.1]} />
        <meshStandardMaterial color="#7b4932" roughness={0.85} />
      </mesh>
    </group>
  )
}

function Treasure({ objective }: { objective: XrNativeControllerDemoObjective }) {
  const open = objective === 'complete'
  const position = XR_NATIVE_CONTROLLER_DEMO_CHEST_POSITION
  return (
    <group position={[position[0], position[1], position[2]]} name="agentic_os_xr_playground_treasure" userData={{ objective }}>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[2.3, 1.2, 1.35]} />
        <meshStandardMaterial color="#74412e" roughness={0.72} />
      </mesh>
      <group position={[0, 1.22, -0.54]} rotation={[open ? -1.05 : 0, 0, 0]}>
        <mesh position={[0, 0.3, 0.54]} castShadow>
          <boxGeometry args={[2.35, 0.62, 1.4]} />
          <meshStandardMaterial color="#8b4d31" roughness={0.7} />
        </mesh>
      </group>
      {[-0.78, 0, 0.78].map(x => (
        <mesh key={x} position={[x, 0.82, 0.69]}>
          <boxGeometry args={[0.13, 1.48, 0.06]} />
          <meshStandardMaterial color="#e2a846" roughness={0.42} metalness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, 0.85, 0.74]}>
        <boxGeometry args={[0.36, 0.42, 0.12]} />
        <meshStandardMaterial color={open ? '#fff06a' : '#e2a846'} emissive={open ? '#f2ba2e' : '#000000'} emissiveIntensity={open ? 1.5 : 0} />
      </mesh>
      {open ? <pointLight position={[0, 2.1, 0]} color="#ffe477" intensity={3.2} distance={7} /> : null}
    </group>
  )
}

function Key({ collected }: { collected: boolean }) {
  const ref = React.useRef<Group | null>(null)
  useFrame(() => {
    if (!ref.current || collected) return
    const elapsedSeconds = readSharedXrNativeControllerDemoFrame().elapsedSeconds
    ref.current.rotation.y = elapsedSeconds * 1.5
    ref.current.position.y = XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION[1] + Math.sin(elapsedSeconds * 2.4) * 0.14
  })
  return (
    <group ref={ref} visible={!collected} position={[...XR_NATIVE_CONTROLLER_DEMO_KEY_POSITION]} name="agentic_os_xr_playground_key">
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.34, 0.105, 10, 22]} />
        <meshStandardMaterial color="#ffd84d" emissive="#be7e12" emissiveIntensity={0.55} metalness={0.62} roughness={0.26} />
      </mesh>
      <mesh position={[0.72, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <boxGeometry args={[0.18, 0.92, 0.16]} />
        <meshStandardMaterial color="#ffd84d" metalness={0.62} roughness={0.26} />
      </mesh>
      <pointLight color="#ffd84d" intensity={2.2} distance={4.5} />
    </group>
  )
}

function SkullGrotto() {
  return (
    <group position={[-11, 0, -7.6]} name="agentic_os_xr_playground_skull_grotto">
      <Rock position={[0, 2.1, 0]} scale={[2.8, 2.35, 2.5]} color="#68736d" />
      <mesh position={[0.5, 1.2, 2.02]} scale={[1.3, 1.45, 0.22]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#202a28" roughness={1} />
      </mesh>
      {[-0.62, 0.62].map(x => (
        <mesh key={x} position={[x, 2.95, 2.15]} scale={[0.48, 0.62, 0.18]}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshBasicMaterial color="#17201e" />
        </mesh>
      ))}
      <mesh position={[0, 2.1, 2.25]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.26, 0.65, 4]} />
        <meshBasicMaterial color="#17201e" />
      </mesh>
    </group>
  )
}

function Skeleton() {
  return (
    <group position={[8.2, 0.18, -6.8]} rotation={[0, -0.35, 0]}>
      {Array.from({ length: 5 }, (_, index) => (
        <mesh key={index} position={[index * 0.42, 0.2 + Math.sin(index) * 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42 + index * 0.035, 0.07, 7, 14, Math.PI]} />
          <meshStandardMaterial color="#e8dfc2" roughness={0.88} />
        </mesh>
      ))}
      <mesh position={[2.2, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 2.1, 7]} />
        <meshStandardMaterial color="#e8dfc2" roughness={0.88} />
      </mesh>
    </group>
  )
}

function MovingHazards() {
  const rootRef = React.useRef<Group | null>(null)
  useFrame(() => {
    const elapsedSeconds = readSharedXrNativeControllerDemoFrame().elapsedSeconds
    const children = rootRef.current?.children || []
    children.forEach((child, index) => {
      child.position.y = 3.7 + Math.sin(elapsedSeconds * 0.72 + index * 1.7) * 0.42
      child.rotation.y = Math.sin(elapsedSeconds * 0.35 + index) * 0.12
    })
  })
  return (
    <group ref={rootRef} name="agentic_os_xr_playground_moving_hazards">
      {[-4.3, 0, 4.4].map((x, index) => (
        <group key={x} position={[x, 3.7, -8.35]}>
          <mesh castShadow>
            <boxGeometry args={[3.1 - index * 0.35, 0.8, 1.7]} />
            <meshStandardMaterial color={index % 2 ? '#6576ba' : '#697dc9'} roughness={0.55} />
          </mesh>
          {[-0.9, 0, 0.9].slice(0, 3 - index).map(spikeX => (
            <mesh key={spikeX} position={[spikeX, 0.72, 0]}>
              <coneGeometry args={[0.22, 0.72, 5]} />
              <meshStandardMaterial color="#d8e2f2" roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function useIrregularIslandShape() {
  return React.useMemo(() => {
    const shape = new Shape()
    const points = Array.from({ length: 28 }, (_, index) => {
      const angle = index * Math.PI * 2 / 28
      const edge = 1 + Math.sin(angle * 3 + 0.4) * 0.055 + Math.cos(angle * 7 - 0.7) * 0.035
      return [Math.cos(angle) * 13.2 * edge, Math.sin(angle) * 12.45 * edge] as const
    })
    points.forEach(([x, z], index) => {
      if (index === 0) shape.moveTo(x, z)
      else shape.lineTo(x, z)
    })
    shape.closePath()
    return shape
  }, [])
}

function XrNativeControllerTerrainEnvironment({
  objective,
  stage,
}: {
  objective: XrNativeControllerDemoObjective
  stage: XrMotionReferenceStagePreset
}) {
  return (
    <group name={`agentic_os_xr_native_terrain_${stage.id}`} userData={{ objective, terrainId: stage.id }}>
      <XrStagePresetGeometry
        stage={stage}
        span={Math.max(...stage.sizeMeters)}
        showAxes={false}
        showGrid={false}
        shadows
        minFloorThickness={0.16}
      />
      <TutorialMarkings />
      <Treasure objective={objective} />
      <Key collected={objective !== 'find-key'} />
      <Cannon position={[1.6, 0, -6.25]} />
      <Cannon position={[4.15, 0, -6.25]} />
      {stage.id === 'singapore' ? null : <MovingHazards />}
    </group>
  )
}

export function XrNativeControllerDemoEnvironment({
  objective,
  stage,
}: {
  objective: XrNativeControllerDemoObjective
  stage: XrMotionReferenceStagePreset
}) {
  const islandShape = useIrregularIslandShape()
  if (stage.id !== 'tropical-playground') {
    return <XrNativeControllerTerrainEnvironment objective={objective} stage={stage} />
  }
  return (
    <group name="agentic_os_xr_native_tropical_playground" userData={{ objective, environmentId: stage.id }}>
      <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial color="#4fc3e8" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, -1.05, 1.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.12, 1.05, 1]} receiveShadow castShadow>
        <extrudeGeometry args={[islandShape, { depth: 1.08, steps: 1, bevelEnabled: false }]} />
        <meshStandardMaterial attach="material-0" color="#e1ead8" roughness={1} flatShading />
        <meshStandardMaterial attach="material-1" color="#aabca8" roughness={0.96} flatShading />
      </mesh>
      <XrNativeControllerDemoAerialSetpieces />
      <TutorialMarkings />
      <Fence />
      <Ramp />
      <SkullGrotto />
      <Treasure objective={objective} />
      <Key collected={objective !== 'find-key'} />
      <Cannon position={[1.6, 0, -6.25]} />
      <Cannon position={[4.15, 0, -6.25]} />
      <Skeleton />
      <MovingHazards />
      <Palm position={[-8.8, 0, -8.8]} scale={1.25} lean={-0.08} />
      <Palm position={[7.5, 0, -9]} scale={1.05} lean={0.1} />
      <Palm position={[11.2, 0, -6.6]} scale={1.18} lean={-0.1} />
      <Palm position={[-12.1, 0, 3.6]} scale={0.95} lean={0.14} />
      <Palm position={[12.2, 0, 3.3]} scale={0.88} lean={-0.12} />
      <Rock position={[-6.8, 1.25, -9.5]} scale={[3.1, 1.8, 1.4]} />
      <Rock position={[0, 1.35, -10]} scale={[4.3, 2.1, 1.25]} />
      <Rock position={[6.4, 1.2, -9.6]} scale={[2.4, 1.8, 1.5]} />
      <Rock position={[11.8, 0.8, -1.5]} scale={[1.45, 1.1, 1.25]} color="#77817c" />
      <Rock position={[-12.3, 0.7, -1.2]} scale={[1.2, 1, 1.4]} color="#77817c" />
    </group>
  )
}

function BarrelStack() {
  return (
    <group>
      {[-0.32, 0, 0.32].map((y, index) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, index % 2 ? Math.PI / 8 : 0]} castShadow receiveShadow>
          <torusGeometry args={[0.53, 0.22, 5, 10]} />
          <meshStandardMaterial color={index === 1 ? '#5f78a8' : '#d9896f'} roughness={0.7} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function BowlingPin() {
  return (
    <group>
      <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.23, 0.86, 12]} />
        <meshStandardMaterial color="#f8f4e7" roughness={0.64} />
      </mesh>
      <mesh position={[0, 0.45, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshStandardMaterial color="#f8f4e7" roughness={0.64} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.15, 0.035, 6, 12]} />
        <meshStandardMaterial color="#ef476f" roughness={0.5} />
      </mesh>
    </group>
  )
}

export function XrNativeControllerDynamicProps({ registerBodyRef }: { registerBodyRef: RegisterBodyRef }) {
  const barrels = [
    ['native-crate-a', 1.22],
    ['native-crate-b', 1.22],
    ['native-crate-c', 1.55],
  ] as const
  return (
    <group name="agentic_os_xr_playground_dynamic_props">
      {barrels.map(([subjectId, scale]) => (
        <group key={subjectId} ref={node => registerBodyRef(subjectId, node)} scale={scale}>
          <BarrelStack />
        </group>
      ))}
      {['left', 'right'].map(side => (
        <mesh key={side} ref={node => registerBodyRef(`native-cannonball-${side}`, node)} castShadow>
          <sphereGeometry args={[0.26, 14, 10]} />
          <meshStandardMaterial color="#3f444a" roughness={0.46} metalness={0.18} />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, index) => (
        <group key={index} ref={node => registerBodyRef(`native-pin-${index + 1}`, node)}>
          <BowlingPin />
        </group>
      ))}
    </group>
  )
}
