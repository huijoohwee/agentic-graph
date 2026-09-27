import { memo, useMemo } from 'react'
import { WarehouseBoxes } from './LearningWarehouseStructure'
import { DRONE002_DIMENSIONS as D } from './learningDockAssets'

type Part = { position: [number, number, number]; size: [number, number, number]; rotation?: [number, number, number] }

/** Photo-informed visual proportions only. The 140 mm span is an explicit unmeasured assumption. */
export const LearningEsp32DroneModel = memo(function LearningEsp32DroneModel({ rotorPhase = 0 }: { rotorPhase?: number }) {
  const parts = useMemo(() => {
    const frame: Part[] = [], pins: Part[] = [], red: Part[] = [], blue: Part[] = [], chips: Part[] = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      frame.push({ position: [sx * 0.029, 0.018, sz * 0.029], size: [0.051, 0.0035, 0.008], rotation: [0, -sx * sz * Math.PI / 4, 0] })
      frame.push({ position: [sx * D.motorOffset, 0.005, sz * D.motorOffset], size: [0.003, 0.01, 0.009] })
      const rotation: [number, number, number] = [0, -Math.atan2(sz * 0.03, sx * 0.03), 0]
      red.push({ position: [sx * 0.031, 0.022, sz * 0.03], size: [0.042, 0.0012, 0.0012], rotation })
      blue.push({ position: [sx * 0.031, 0.023, sz * 0.032], size: [0.042, 0.0012, 0.0012], rotation })
    }
    for (const side of [-1, 1]) for (let index = 0; index < 16; index++) pins.push({ position: [-0.028 + index * 0.0036, 0.028, side * 0.018], size: [0.0015, 0.0007, 0.0015] })
    for (let index = 0; index < 5; index++) chips.push({ position: [0.003 + index * 0.0045, 0.029, 0.001], size: [0.0028, 0.0018, 0.009] })
    return { frame, pins, red, blue, chips }
  }, [])
  const phase = Number.isFinite(rotorPhase) ? rotorPhase : 0
  return <group name="learning-drone002">
    <WarehouseBoxes parts={parts.frame} color="#20272b" roughness={0.65} />
    <mesh castShadow receiveShadow position={[0, 0.019, 0]}><boxGeometry args={[0.071, 0.002, 0.049]} /><meshStandardMaterial color="#202f32" roughness={0.8} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.026, 0]}><boxGeometry args={[0.066, 0.002, 0.038]} /><meshStandardMaterial color="#253633" roughness={0.77} /></mesh>
    <mesh castShadow position={[-0.013, 0.029, 0]}><boxGeometry args={[0.025, 0.003, 0.026]} /><meshStandardMaterial color="#a4adb0" metalness={0.74} roughness={0.41} /></mesh>
    <mesh position={[0.031, 0.0285, 0]}><boxGeometry args={[0.006, 0.004, 0.01]} /><meshStandardMaterial color="#b8bcb9" metalness={0.65} roughness={0.4} /></mesh>
    <mesh position={[0.0341, 0.0285, 0]}><boxGeometry args={[0.0003, 0.002, 0.007]} /><meshBasicMaterial color="#17222a" /></mesh>
    <WarehouseBoxes parts={parts.pins} color="#c8b681" metalness={0.65} roughness={0.5} castShadow={false} />
    <WarehouseBoxes parts={parts.chips} color="#141e24" castShadow={false} />
    <WarehouseBoxes parts={parts.red} color="#ad3e46" castShadow={false} />
    <WarehouseBoxes parts={parts.blue} color="#3f71ad" castShadow={false} />
    {[-1, 1].flatMap(sx => [-1, 1].map(sz => <group key={`${sx}:${sz}`} position={[sx * D.motorOffset, 0, sz * D.motorOffset]}>
      <mesh castShadow position={[0, 0.028, 0]}><cylinderGeometry args={[0.0048, 0.0048, 0.021, 12]} /><meshStandardMaterial color="#b59b65" metalness={0.7} roughness={0.4} /></mesh>
      <mesh castShadow position={[0, 0.0175, 0]}><cylinderGeometry args={[0.006, 0.0065, 0.006, 12]} /><meshStandardMaterial color="#1b252c" roughness={0.75} /></mesh>
      <group rotation={[0, phase * sx * sz + sx * Math.PI / 6, 0]} position={[0, 0.044, 0]}>
        <mesh castShadow scale={[D.rotorRadius, 0.0014, 0.0043]}><sphereGeometry args={[1, 16, 6]} /><meshStandardMaterial color="#252d32" roughness={0.55} metalness={0.1} /></mesh>
        <mesh castShadow position={[0, 0.001, 0]}><cylinderGeometry args={[0.001, 0.0034, 0.013, 10]} /><meshStandardMaterial color="#1c252b" roughness={0.52} /></mesh>
      </group>
    </group>))}
    {/* A planned camera fixture is displayed separately from the photo-observed PCB details. */}
    <group name="drone002-planned-camera" position={[0.028, 0.012, 0]}>
      <mesh castShadow><boxGeometry args={[0.009, 0.008, 0.012]} /><meshStandardMaterial color="#303c44" roughness={0.62} /></mesh>
      <mesh position={[0.0047, 0, 0]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.0028, 12]} /><meshStandardMaterial color="#172e41" metalness={0.5} roughness={0.22} /></mesh>
    </group>
  </group>
})
