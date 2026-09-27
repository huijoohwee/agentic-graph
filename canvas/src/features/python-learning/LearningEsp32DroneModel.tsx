import { memo, useMemo } from 'react'
import { CatmullRomCurve3, Shape, Vector3 } from 'three'
import { WarehouseBoxes } from './LearningWarehouseStructure'
import { DRONE002_DIMENSIONS as D } from './learningDockAssets'

type Part = { position: [number, number, number]; size: [number, number, number]; rotation?: [number, number, number] }

function propellerBlade() {
  const blade = new Shape(), radius = D.rotorRadius
  blade.moveTo(0.0015, -0.001)
  blade.bezierCurveTo(radius * 0.36, -0.0045, radius * 0.78, -0.004, radius, 0)
  blade.bezierCurveTo(radius * 0.84, 0.0027, radius * 0.46, 0.0036, 0.0015, 0.001)
  blade.closePath()
  return blade
}

/** Photo-informed visual proportions only. The 140 mm span is an explicit unmeasured assumption. */
export const LearningEsp32DroneModel = memo(function LearningEsp32DroneModel({ rotorPhase = 0 }: { rotorPhase?: number }) {
  const blade = useMemo(propellerBlade, [])
  const bladeExtrusion = useMemo(() => ({ depth: 0.0008, bevelEnabled: false, steps: 1, curveSegments: 8 }), [])
  const parts = useMemo(() => {
    const frame: Part[] = [], pins: Part[] = [], chips: Part[] = [], ivory: Part[] = [], traces: Part[] = [], printing: Part[] = []
    const wires: { curve: CatmullRomCurve3; color: string }[] = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      frame.push({ position: [sx * 0.029, 0.018, sz * 0.029], size: [0.051, 0.0035, 0.008], rotation: [0, -sx * sz * Math.PI / 4, 0] })
      frame.push({ position: [sx * D.motorOffset, 0.005, sz * D.motorOffset], size: [0.003, 0.01, 0.009] })
      ivory.push({ position: [sx * 0.027, 0.023, sz * 0.023], size: [0.007, 0.004, 0.004] })
      for (const [offset, color] of [[-0.001, '#ba454b'], [0.001, '#426f9a']] as const) {
        wires.push({ color, curve: new CatmullRomCurve3([
          new Vector3(sx * 0.027, 0.024, sz * 0.024 + offset),
          new Vector3(sx * 0.035, 0.027, sz * 0.031 + offset),
          new Vector3(sx * 0.041, 0.024, sz * 0.039 + offset),
          new Vector3(sx * 0.044, 0.023, sz * 0.044 + offset),
        ]) })
      }
    }
    for (const side of [-1, 1]) for (let index = 0; index < 16; index++) pins.push({ position: [-0.028 + index * 0.0036, 0.028, side * 0.018], size: [0.0015, 0.0007, 0.0015] })
    for (let index = 0; index < 5; index++) chips.push({ position: [0.003 + index * 0.0045, 0.029, 0.001], size: [0.0028, 0.0018, 0.009] })
    for (const side of [-1, 1]) {
      printing.push({ position: [0, 0.02715, side * 0.016], size: [0.056, 0.00015, 0.0004] })
      for (let index = 0; index < 9; index++) {
        const x = -0.014 + index * 0.0047
        traces.push({ position: [x, 0.02712, side * 0.012], size: [0.00035, 0.00015, 0.0045] })
        printing.push({ position: [x, 0.0272, side * 0.0149], size: [0.0015, 0.00015, 0.00045] })
      }
    }
    for (let index = 0; index < 4; index++) printing.push({ position: [-0.015, 0.0306, -0.006 + index * 0.0034], size: [0.015 - index * 0.002, 0.00015, 0.0005] })
    return { frame, pins, chips, ivory, traces, printing, wires }
  }, [])
  const phase = Number.isFinite(rotorPhase) ? rotorPhase : 0
  return <group name="learning-drone002">
    <WarehouseBoxes parts={parts.frame} color="#20272b" roughness={0.65} />
    <mesh castShadow receiveShadow position={[0, 0.019, 0]}><boxGeometry args={[0.071, 0.002, 0.049]} /><meshStandardMaterial color="#172a2d" roughness={0.68} /></mesh>
    <mesh castShadow receiveShadow position={[0, 0.026, 0]}><boxGeometry args={[0.066, 0.002, 0.038]} /><meshStandardMaterial color="#1c3532" roughness={0.58} /></mesh>
    <mesh castShadow position={[-0.013, 0.029, 0]}><boxGeometry args={[0.025, 0.003, 0.026]} /><meshStandardMaterial color="#a4adb0" metalness={0.74} roughness={0.41} /></mesh>
    <mesh position={[0.031, 0.0285, 0]}><boxGeometry args={[0.006, 0.004, 0.01]} /><meshStandardMaterial color="#b8bcb9" metalness={0.65} roughness={0.4} /></mesh>
    <mesh position={[0.0341, 0.0285, 0]}><boxGeometry args={[0.0003, 0.002, 0.007]} /><meshBasicMaterial color="#17222a" /></mesh>
    <WarehouseBoxes parts={parts.pins} color="#c8b681" metalness={0.65} roughness={0.5} castShadow={false} />
    <WarehouseBoxes parts={parts.chips} color="#141e24" castShadow={false} />
    <WarehouseBoxes parts={parts.ivory} color="#d8d7c5" roughness={0.67} castShadow={false} />
    <WarehouseBoxes parts={parts.traces} color="#9b8857" metalness={0.4} roughness={0.65} castShadow={false} />
    <WarehouseBoxes parts={parts.printing} color="#becac1" roughness={0.85} castShadow={false} />
    {parts.wires.map((wire, index) => <mesh key={index}>
      <tubeGeometry args={[wire.curve, 10, 0.0005, 5, false]} /><meshStandardMaterial color={wire.color} roughness={0.65} />
    </mesh>)}
    {[-1, 1].flatMap(sx => [-1, 1].map(sz => <group key={`mount:${sx}:${sz}`} position={[sx * 0.03, 0.021, sz * 0.02]}>
      <mesh><cylinderGeometry args={[0.0013, 0.0013, 0.004, 8]} /><meshStandardMaterial color="#8b947e" metalness={0.65} roughness={0.46} /></mesh>
      <mesh position={[0, -0.00085, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.0014, 0.0024, 12]} /><meshStandardMaterial color="#b19d67" metalness={0.5} roughness={0.6} /></mesh>
    </group>))}
    {[-1, 1].flatMap(sx => [-1, 1].map(sz => <group key={`${sx}:${sz}`} position={[sx * D.motorOffset, 0, sz * D.motorOffset]}>
      <mesh castShadow position={[0, 0.028, 0]}><cylinderGeometry args={[0.0048, 0.0048, 0.021, 20]} /><meshStandardMaterial color="#b8a477" metalness={0.65} roughness={0.34} /></mesh>
      <mesh position={[0, 0.037, 0]}><cylinderGeometry args={[0.00495, 0.00495, 0.002, 20]} /><meshStandardMaterial color="#738087" metalness={0.72} roughness={0.4} /></mesh>
      <mesh castShadow position={[0, 0.0175, 0]}><cylinderGeometry args={[0.006, 0.0065, 0.006, 12]} /><meshStandardMaterial color="#1b252c" roughness={0.75} /></mesh>
      <group rotation={[0, phase * sx * sz + sx * Math.PI / 6, 0]} position={[0, 0.044, 0]}>
        {[0, Math.PI].map(angle => <group key={angle} rotation={[0, angle, 0]}>
          <mesh castShadow rotation={[-Math.PI / 2, 0, 0]}><extrudeGeometry args={[blade, bladeExtrusion]} /><meshStandardMaterial color="#242b31" roughness={0.39} metalness={0.12} /></mesh>
        </group>)}
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
