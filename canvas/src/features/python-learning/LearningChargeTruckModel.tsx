import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D, Shape, Path } from 'three'
import { WarehouseBoxes } from './LearningWarehouseStructure'
import { CHARGE_TRUCK_DIMENSIONS as D, chargeTruckLidPose } from './learningDockAssets'

type Part = { position: [number, number, number]; size: [number, number, number]; rotation?: [number, number, number] }
type WheelPart = { position: [number, number, number]; radius: number; depth: number }
const LID_RELIEF = 0.0008

/** All road wheels or hubs share one cylinder and one draw call. */
const WheelBatch = memo(function WheelBatch({ parts, color, metalness, roughness, shadow = false }: {
  parts: readonly WheelPart[]; color: string; metalness: number; roughness: number; shadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Object3D()
    transform.rotation.x = Math.PI / 2
    parts.forEach((part, index) => {
      transform.position.set(...part.position); transform.scale.set(part.radius, part.depth, part.radius)
      transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere()
  }, [parts])
  return <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow={shadow} receiveShadow>
    <cylinderGeometry args={[1, 1, 1, 20]} /><meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  </instancedMesh>
})

function lidDetails(side: -1 | 1, length: number, width: number) {
  const depth = width / 2, center = -side * width / 4
  const rims: Part[] = [], panels: Part[] = [{ position: [0, -0.0005, center], size: [length - 0.012, 0.0006, depth - 0.012] }]
  for (const sign of [-1, 1]) {
    rims.push({ position: [sign * (length - 0.003) / 2, -LID_RELIEF / 2, center], size: [0.003, LID_RELIEF, depth] })
    rims.push({ position: [0, -LID_RELIEF / 2, center + sign * (depth - 0.003) / 2], size: [length - 0.006, LID_RELIEF, 0.003] })
  }
  // Raised relative to the recessed field, but flush with the original leaf top.
  for (const x of [-0.078, -0.052, -0.026, 0, 0.026, 0.052, 0.078])
    rims.push({ position: [x, -0.0001, center], size: [0.0016, 0.0002, depth - 0.026] })
  panels.push({ position: [0.064, -0.0001, -side * (depth - 0.009)], size: [0.024, 0.0002, 0.006] })
  return { rims, panels }
}

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
    const treads: Part[] = [], metal: Part[] = [], sensors: Part[] = [], panels: Part[] = [], seams: Part[] = []
    const wheels: WheelPart[] = [], wheelFaces: WheelPart[] = [], hubs: WheelPart[] = []
    for (const side of [-1, 1] as const) {
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
      // Exterior fittings stay between the specified hull and existing track envelope.
      panels.push({ position: [0, 0.059, side * (width / 2 + 0.0003)], size: [0.188, 0.02, 0.0006] })
      for (const x of [-0.078, -0.052, -0.026, 0, 0.026, 0.052, 0.078])
        panels.push({ position: [x, 0.059, side * (width / 2 + 0.0008)], size: [0.0018, 0.017, 0.0004] })
      for (const y of [0.048, 0.07]) seams.push({ position: [0, y, side * (width / 2 + 0.00025)], size: [0.192, 0.0007, 0.0005] })
      for (const edge of [-1, 1]) {
        panels.push({ position: [side * (length / 2 + 0.0007), 0.075, edge * 0.05], size: [0.0014, 0.012, 0.009] })
        metal.push({ position: [side * (length / 2 + 0.0015), 0.075, edge * 0.05], size: [0.0006, 0.003, 0.006] })
        seams.push({ position: [side * (length / 2 + 0.00145), 0.0785, edge * 0.05], size: [0.0001, 0.0006, 0.005] })
      }
      for (const x of [-0.0815, -0.028, 0.028, 0.0815]) {
        wheels.push({ position: [x, D.trackHeight / 2, z], radius: 0.0165, depth: D.trackWidth * 0.86 })
        wheelFaces.push({ position: [x, D.trackHeight / 2, side * 0.10076], radius: 0.0143, depth: 0.0006 })
        hubs.push({ position: [x, D.trackHeight / 2, side * 0.101], radius: 0.0068, depth: 0.0018 })
        for (let bolt = 0; bolt < 5; bolt++) {
          const angle = bolt * Math.PI * 2 / 5
          metal.push({ position: [x + Math.cos(angle) * 0.0103, D.trackHeight / 2 + Math.sin(angle) * 0.0103, side * 0.1013], size: [0.0015, 0.0015, 0.0006], rotation: [0, 0, angle] })
        }
      }
    }
    metal.push({ position: [-0.078, height - 0.005, -width / 2 - 0.008], size: [0.012, 0.01, 0.016] })
    // Liner relief ends at 3.8 mm, below the unchanged 4 mm drone docking plane.
    for (const x of [-0.08, -0.06, -0.04, 0, 0.04, 0.06, 0.08])
      panels.push({ position: [x, wall + 0.0007, 0], size: [0.0007, 0.0002, D.bay[2] - 0.022] })
    return { shell, treads, metal, sensors, panels, seams, wheels, wheelFaces, hubs,
      lids: [lidDetails(-1, length, width), lidDetails(1, length, width)] }
  }, [height, length, width, wall])
  return <group name="learning-charge-truck">
    <WarehouseBoxes parts={batches.shell} color="#20292f" metalness={0.24} roughness={0.7} />
    <WheelBatch parts={batches.wheels} color="#252e34" metalness={0.3} roughness={0.75} shadow />
    <WheelBatch parts={batches.wheelFaces} color="#4a565e" metalness={0.58} roughness={0.48} />
    <WheelBatch parts={batches.hubs} color="#252f36" metalness={0.52} roughness={0.43} />
    {([-1, 1] as const).map(side => {
      const lid = chargeTruckLidPose(side, lidAngleRadians)
      const detail = batches.lids[side === -1 ? 0 : 1]
      return <group key={side}>
      <mesh castShadow receiveShadow position={[0, D.trackHeight / 2, side * (width + D.trackWidth) / 2 - D.trackWidth / 2]}>
        <extrudeGeometry args={[outline, extrusion]} /><meshStandardMaterial color="#161c21" roughness={0.94} />
      </mesh>
      <group name={side < 0 ? 'truck-lid-left' : 'truck-lid-right'} position={lid.hinge} rotation={[lid.rotationX, 0, 0]}>
        <mesh castShadow receiveShadow position={[lid.leafCenter[0], lid.leafCenter[1] - LID_RELIEF / 2, lid.leafCenter[2]]}>
          <boxGeometry args={[lid.leafSize[0], lid.leafSize[1] - LID_RELIEF, lid.leafSize[2]]} /><meshStandardMaterial color="#111b21" metalness={0.22} roughness={0.76} />
        </mesh>
        <WarehouseBoxes parts={detail.panels} color="#202a31" metalness={0.24} roughness={0.69} castShadow={false} />
        <WarehouseBoxes parts={detail.rims} color="#39464e" metalness={0.34} roughness={0.58} castShadow={false} />
      </group>
      {[-0.078, 0.078].map(x => <mesh key={x} position={[x, lid.hinge[1], lid.hinge[2]]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.003, 0.003, 0.024, 12]} /><meshStandardMaterial color="#65717a" metalness={0.7} roughness={0.4} />
      </mesh>)}
      <mesh position={[length / 2 + 0.0085, 0.019, side * 0.048]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.005, 0.0015, 6, 16]} /><meshStandardMaterial color="#647078" metalness={0.65} roughness={0.5} />
      </mesh>
    </group>})}
    <WarehouseBoxes parts={batches.treads} color="#42494c" roughness={0.95} />
    <WarehouseBoxes parts={batches.panels} color="#354149" metalness={0.24} roughness={0.72} castShadow={false} />
    <WarehouseBoxes parts={batches.seams} color="#111a20" roughness={0.9} castShadow={false} />
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
