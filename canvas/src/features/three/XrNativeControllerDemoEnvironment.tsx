import { DEFAULT_XR_SCENE_APPEARANCE, type XrSceneAppearance } from './xrSceneAppearance'
import { XrPlaygroundHorizon } from './XrPlaygroundHorizon'
import { XrSceneSkyAtmosphere } from './XrSceneSkyAtmosphere'
import { XrTropicalPlaygroundTerrain } from './XrTropicalPlaygroundTerrain'
import { XrPlaygroundCannon, XrPlaygroundPalm, XrTropicalPlaygroundLandmarks } from './XrTropicalPlaygroundLandmarks'
import React from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CanvasTexture,
  LinearFilter,
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

export function XrNativeControllerDemoSceneAtmosphere({ stageScale, appearance = DEFAULT_XR_SCENE_APPEARANCE }: { stageScale: number; appearance?: XrSceneAppearance }) {
  const trainingScenario = React.useSyncExternalStore(
    subscribeFlightSimTrainingScenario,
    readFlightSimTrainingScenario,
    readFlightSimTrainingScenario,
  )
  const night = resolveFlightSimTrainingMission(trainingScenario.missionId).night
  return <XrSceneSkyAtmosphere appearance={appearance} night={night} stageScale={stageScale} />
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
        <mesh position={[0, 0.18, 0.54]} castShadow>
          <boxGeometry args={[2.35, 0.28, 1.4]} />
          <meshStandardMaterial color="#8b4d31" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.38, 0.54]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.68, 0.68, 2.28, 16, 1, false, 0, Math.PI]} />
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

function XrNativeControllerTerrainEnvironment({
  objective,
  stage,
  appearance = DEFAULT_XR_SCENE_APPEARANCE,
}: {
  objective: XrNativeControllerDemoObjective
  stage: XrMotionReferenceStagePreset
  appearance?: XrSceneAppearance
}) {
  return (
    <group name={`agentic_os_xr_native_terrain_${stage.id}`} userData={{ objective, terrainId: stage.id }}>
      <XrStagePresetGeometry
        stage={stage}
        appearance={appearance}
        span={Math.max(...stage.sizeMeters)}
        showAxes={false}
        showGrid={false}
        shadows={appearance.shadows}
        minFloorThickness={0.16}
      />
      <XrPlaygroundHorizon appearance={appearance} stage={stage} />
      <TutorialMarkings />
      <Treasure objective={objective} />
      <Key collected={objective !== 'find-key'} />
      <XrPlaygroundCannon position={[1.6, 0, -6.25]} />
      <XrPlaygroundCannon position={[4.15, 0, -6.25]} />
      {stage.id === 'singapore' ? (
        <>
          <XrPlaygroundPalm position={[-9.4, 0, 3.2]} scale={1.08} lean={-0.08} />
          <XrPlaygroundPalm position={[8.8, 0, 2.6]} scale={0.94} lean={0.1} />
        </>
      ) : null}
    </group>
  )
}

export function XrNativeControllerDemoEnvironment({
  objective,
  stage,
  appearance = DEFAULT_XR_SCENE_APPEARANCE,
}: {
  objective: XrNativeControllerDemoObjective
  stage: XrMotionReferenceStagePreset
  appearance?: XrSceneAppearance
}) {
  if (stage.id !== 'tropical-playground') {
    return <XrNativeControllerTerrainEnvironment objective={objective} stage={stage} appearance={appearance} />
  }
  return (
    <group name="agentic_os_xr_native_tropical_playground" userData={{ objective, environmentId: stage.id }}>
      <XrTropicalPlaygroundTerrain appearance={appearance} shadows={appearance.shadows} />
      <XrNativeControllerDemoAerialSetpieces />
      <TutorialMarkings />
      <XrTropicalPlaygroundLandmarks />
      <Treasure objective={objective} />
      <Key collected={objective !== 'find-key'} />
    </group>
  )
}

function BarrelStack() {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.44, 0.92, 14]} />
        <meshStandardMaterial color="#c57b55" roughness={0.78} />
      </mesh>
      {[-0.28, 0.02, 0.32].map(y => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.42, 0.045, 8, 16]} />
          <meshStandardMaterial color="#4b5057" roughness={0.45} metalness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.06, 14]} />
        <meshStandardMaterial color="#a85c3d" roughness={0.82} />
      </mesh>
    </group>
  )
}

function BowlingPin() {
  return (
    <group>
      <mesh position={[0, -0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.12, 0.22, 0.72, 12]} />
        <meshStandardMaterial color="#f8f4e7" roughness={0.64} />
      </mesh>
      <mesh position={[0, 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 0.22, 12]} />
        <meshStandardMaterial color="#f8f4e7" roughness={0.64} />
      </mesh>
      <mesh position={[0, 0.52, 0]} castShadow>
        <sphereGeometry args={[0.16, 12, 8]} />
        <meshStandardMaterial color="#f8f4e7" roughness={0.64} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <torusGeometry args={[0.14, 0.032, 6, 12]} />
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
