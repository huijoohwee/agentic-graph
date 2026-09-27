import { memo, useMemo } from 'react'
import { Shape, Path } from 'three'
import { WarehouseBoxes } from './LearningWarehouseStructure'
import { CHARGE_TRUCK_DIMENSIONS as D, chargeTruckLidPose } from './learningDockAssets'

type Part = { position: [number, number, number]; size: [number, number, number]; rotation?: [number, number, number] }
function trackOutline() {
  const length = 0.208, radius = D.trackHeight / 2, straight = length / 2 - radius
  const shape = new Shape()
  shape.moveTo(-straight, radius); shape.lineTo(straight, radius)
  shape.absarc(straight, 0, radius, Math.PI / 2, -Math.PI / 2, true)
  shape.lineTo(-straight, -radius); shape.absarc(-straight, 0, radius, -Math.PI / 2, Math.PI / 2, true)
  const hole = new Path(), inner = radius - 0.004
  hole.moveTo(-straight, inner); hole.absarc(-straight, 0, inner, Math.PI / 2, Math.PI * 1.5, false)
  hole.lineTo(straight, -inner); hole.absarc(straight, 0, inner, -Math.PI / 2, Math.PI / 2, false); hole.closePath()
  shape.holes.push(hole)
  return shape
}

/** Original presentation geometry; dimensions describe a concept shell, not manufacturing CAD. */
export const LearningChargeTruckModel = memo(function LearningChargeTruckModel({ lidAngleRadians = 0 }: { lidAngleRadians?: number }) {
  const [length, height, width] = D.shell, wall = D.wall
  const outline = useMemo(trackOutline, [])
  const extrusion = useMemo(() => ({ depth: D.trackWidth, bevelEnabled: false, steps: 1, curveSegments: 8 }), [])
  const batches = useMemo(() => {
    const shell: Part[] = [{ position: [0, wall / 2, 0], size: [length, wall, width] }]
    const treads: Part[] = [], metal: Part[] = [], sensors: Part[] = []
    for (const side of [-1, 1]) {
      shell.push({ position: [0, (height - wall) / 2, side * (width - wall) / 2], size: [length, height - wall, wall] })
      shell.push({ position: [side * (length - wall) / 2, (height - wall) / 2, 0], size: [wall, height - wall, width - wall * 2] })
      shell.push({ position: [side * 0.115, 0.01, 0], size: [0.01, 0.006, 0.13] })
      const z = side * (width + D.trackWidth) / 2
      for (let index = 0; index < 13; index++) for (const top of [-1, 1]) treads.push({ position: [-0.078 + index * 0.013, D.trackHeight / 2 + top * (D.trackHeight / 2 - 0.001), z], size: [0.007, 0.002, D.trackWidth] })
      for (const end of [-1, 1]) for (let index = 1; index < 8; index++) {
        const theta = -Math.PI / 2 + index * Math.PI / 8, r = D.trackHeight / 2 - 0.001
        treads.push({ position: [end * (0.0815 + r * Math.cos(theta)), D.trackHeight / 2 + r * Math.sin(theta), z], size: [0.002, 0.007, D.trackWidth], rotation: [0, 0, end * theta] })
      }
      for (let index = 0; index < 10; index++) metal.push({ position: [-0.09 + index * 0.02, 0.071, side * (width / 2 + 0.0004)], size: [0.002, 0.002, 0.001] })
      sensors.push({ position: [length / 2 + 0.0005, 0.061, side * 0.052], size: [0.001, 0.009, 0.015] })
    }
    metal.push({ position: [-0.078, height - 0.005, -width / 2 - 0.008], size: [0.012, 0.01, 0.016] })
    return { shell, treads, metal, sensors }
  }, [height, length, width, wall])
  return <group name="learning-charge-truck">
    <WarehouseBoxes parts={batches.shell} color="#252c32" metalness={0.28} roughness={0.63} />
    {([-1, 1] as const).map(side => {
      const lid = chargeTruckLidPose(side, lidAngleRadians)
      return <group key={side}>
      <mesh castShadow receiveShadow position={[0, D.trackHeight / 2, side * (width + D.trackWidth) / 2 - D.trackWidth / 2]}>
        <extrudeGeometry args={[outline, extrusion]} /><meshStandardMaterial color="#161c21" roughness={0.94} />
      </mesh>
      {[-0.0815, -0.028, 0.028, 0.0815].map(x => <mesh key={x} castShadow position={[x, D.trackHeight / 2, side * (width + D.trackWidth) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0165, 0.0165, D.trackWidth * 0.86, 16]} /><meshStandardMaterial color="#465059" metalness={0.45} roughness={0.62} />
      </mesh>)}
      <group name={side < 0 ? 'truck-lid-left' : 'truck-lid-right'} position={lid.hinge} rotation={[lid.rotationX, 0, 0]}>
        <mesh castShadow receiveShadow position={lid.leafCenter}><boxGeometry args={[...lid.leafSize]} /><meshStandardMaterial color="#343e46" metalness={0.3} roughness={0.55} /></mesh>
        <mesh position={[0.064, 0.0005, -side * width * 0.38]}><boxGeometry args={[0.024, 0.002, 0.008]} /><meshStandardMaterial color="#141c22" roughness={0.8} /></mesh>
      </group>
      {[-0.078, 0.078].map(x => <mesh key={x} position={[x, lid.hinge[1], lid.hinge[2]]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.003, 0.003, 0.024, 12]} /><meshStandardMaterial color="#65717a" metalness={0.7} roughness={0.4} />
      </mesh>)}
      <mesh position={[length / 2 + 0.0085, 0.019, side * 0.048]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.005, 0.0015, 6, 16]} /><meshStandardMaterial color="#647078" metalness={0.65} roughness={0.5} />
      </mesh>
    </group>})}
    <WarehouseBoxes parts={batches.treads} color="#42494c" roughness={0.95} />
    <WarehouseBoxes parts={batches.metal} color="#78838a" metalness={0.7} castShadow={false} />
    <WarehouseBoxes parts={batches.sensors} color="#79939e" metalness={0.3} roughness={0.3} castShadow={false} />
    <mesh position={[-0.078, height + D.antennaHeight / 2, -width / 2 - 0.008]}>
      <cylinderGeometry args={[0.0008, 0.0014, D.antennaHeight, 8]} /><meshStandardMaterial color="#171d22" roughness={0.8} />
    </mesh>
    <mesh position={[-0.078, height, -width / 2 - 0.008]}><cylinderGeometry args={[0.004, 0.004, 0.006, 12]} /><meshStandardMaterial color="#4d5962" metalness={0.4} /></mesh>
    <mesh position={[0, wall + 0.0003, 0]}><boxGeometry args={[D.bay[0] - 0.012, 0.0006, D.bay[2] - 0.012]} /><meshStandardMaterial color="#121b20" roughness={0.92} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * 0.025, wall + 0.0007, 0]}><boxGeometry args={[0.014, 0.0004, 0.008]} /><meshStandardMaterial color="#ab9561" metalness={0.72} roughness={0.43} /></mesh>)}
  </group>
})
