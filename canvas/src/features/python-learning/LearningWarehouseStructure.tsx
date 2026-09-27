import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import type { KgTheme } from '@/lib/ui/tokens-ssot'
import { WAREHOUSE_DOCKS, WAREHOUSE_ZONES } from './warehouseLayout'

type Vector = [number, number, number]
type BoxPart = { position: Vector; size: Vector; rotation?: Vector; color?: string }

/** Repeated structural details share one geometry, material and draw call per batch. */
export function WarehouseBoxes({ parts, color, metalness = 0, roughness = 0.8, castShadow = true }: {
  parts: readonly BoxPart[]; color: string; metalness?: number; roughness?: number; castShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Object3D(), tint = new Color()
    parts.forEach((part, index) => {
      transform.position.set(...part.position)
      transform.scale.set(...part.size)
      transform.rotation.set(...(part.rotation ?? [0, 0, 0] as Vector))
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
      if (part.color) mesh.setColorAt(index, tint.set(part.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [parts])
  if (!parts.length) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow={castShadow} receiveShadow>
    <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  </instancedMesh>
}

/** Detail fits inside the supplied obstacle envelope, including its authoritative height. */
export function WarehouseRack({ width, depth, height }: { width: number; depth: number; height: number }) {
  const batches = useMemo(() => {
    const blue: BoxPart[] = [], orange: BoxPart[] = [], timber: BoxPart[] = [], cartons: BoxPart[] = [], labels: BoxPart[] = []
    const bays = Math.max(1, Math.floor(width / 2.4)), bayWidth = (width - 0.16) / bays
    const levels = Math.max(1, Math.floor(height / 1.35)), levelHeight = (height - 0.18) / levels
    for (let column = 0; column <= bays; column++) {
      const x = -width / 2 + 0.08 + column * bayWidth
      for (const side of [-1, 1]) blue.push({ position: [x, height / 2, side * (depth / 2 - 0.055)], size: [0.08, height, 0.09] })
      for (let tier = 0; tier < levels; tier++) {
        const spanY = levelHeight * 0.78, spanZ = depth - 0.18
        blue.push({ position: [x, (tier + 0.5) * levelHeight, 0], size: [0.04, Math.hypot(spanY, spanZ), 0.04], rotation: [Math.atan2(spanZ, spanY) * (tier % 2 ? -1 : 1), 0, 0] })
      }
    }
    for (let tier = 0; tier < levels; tier++) {
      const y = tier * levelHeight + 0.16
      for (const side of [-1, 1]) orange.push({ position: [0, y, side * (depth / 2 - 0.055)], size: [width - 0.08, 0.13, 0.1] })
      for (let bay = 0; bay < bays; bay++) {
        const x = -width / 2 + 0.08 + (bay + 0.5) * bayWidth, boxHeight = levelHeight * 0.62
        timber.push({ position: [x, y + 0.1, 0], size: [bayWidth - 0.16, 0.08, depth - 0.15] })
        for (const side of [-1, 1]) {
          const boxX = x + side * bayWidth * 0.23, front = depth / 2 - 0.11
          cartons.push({ position: [boxX, y + 0.18 + boxHeight / 2, 0], size: [bayWidth * 0.41, boxHeight, depth - 0.22], color: (tier + bay) % 2 ? '#c1a079' : '#cdb18a' })
          for (const face of [-1, 1]) {
            labels.push({ position: [boxX + bayWidth * 0.1, y + 0.18 + boxHeight * 0.58, face * front], size: [0.2, 0.13, 0.007] })
            timber.push({ position: [boxX, y + 0.185 + boxHeight, 0], size: [0.045, 0.008, depth - 0.22] })
          }
        }
      }
    }
    return { blue, orange, timber, cartons, labels }
  }, [width, depth, height])
  return <>
    <WarehouseBoxes parts={batches.blue} color="#285d7a" metalness={0.58} roughness={0.43} />
    <WarehouseBoxes parts={batches.orange} color="#e98535" metalness={0.3} roughness={0.55} />
    <WarehouseBoxes parts={batches.timber} color="#9d8059" />
    <WarehouseBoxes parts={batches.cartons} color="#ffffff" />
    <WarehouseBoxes parts={batches.labels} color="#e5e6d9" castShadow={false} />
  </>
}

function LoadingBay({ dock }: { dock: typeof WAREHOUSE_DOCKS[number] }) {
  const west = dock.side === 'inbound', edge = west ? -30 : 30, centerZ = dock.z + dock.depth / 2
  const parts = useMemo(() => {
    const white: BoxPart[] = [], steel: BoxPart[] = [], rubber: BoxPart[] = [], cargo: BoxPart[] = []
    for (const side of [-1, 1]) {
      white.push({ position: [dock.x + dock.width / 2, -0.165, centerZ + side * (dock.depth / 2 - 0.1)], size: [dock.width, 0.012, 0.09] })
      rubber.push({ position: [edge + (west ? -0.08 : 0.08), 0.3, centerZ + side * 1.37], size: [0.16, 0.7, 0.18] })
    }
    steel.push({ position: [edge + (west ? -0.65 : 0.65), -0.015, centerZ], size: [1.4, 0.12, 2.4] })
    // A stationary container occupies one bay per side; the companion bay shows the leveler.
    if (dock.id.endsWith('1')) {
      const x = west ? -37.2 : 37.2
      cargo.push({ position: [x, 1.1, centerZ], size: [12, 2.55, 2.43] })
      for (let rib = 0; rib < 24; rib++) for (const side of [-1, 1]) steel.push({ position: [x - 5.75 + rib * 0.5, 1.1, centerZ + side * 1.23], size: [0.055, 2.5, 0.045] })
      for (const side of [-1, 1]) steel.push({ position: [x + side * 5.97, 1.1, centerZ], size: [0.07, 2.56, 2.45] })
    }
    return { white, steel, rubber, cargo }
  }, [dock, west, edge, centerZ])
  return <group name={`warehouse-dock-${dock.id}`}>
    <WarehouseBoxes parts={parts.white} color="#d3d1bb" castShadow={false} />
    <WarehouseBoxes parts={parts.steel} color="#7c8a91" metalness={0.55} />
    <WarehouseBoxes parts={parts.rubber} color="#30383d" />
    <WarehouseBoxes parts={parts.cargo} color={west ? '#607f91' : '#91735f'} />
  </group>
}

/** The full facility is architectural context. Only lesson-owned obstacles are simulated. */
export function LearningWarehouseStructure({ palette }: { palette: KgTheme }) {
  const light = palette === 'light'
  const wall = light ? '#c2cdd2' : '#485866', floor = light ? '#d2d9db' : '#3b4853'
  const structure = useMemo(() => {
    const walls: BoxPart[] = [{ position: [0, 3.6, -20.08], size: [60.2, 7.2, 0.16] }]
    const columns: BoxPart[] = [], windows: BoxPart[] = [], lines: BoxPart[] = []
    // The front and side walls are cut away; partitions remain outside the inspection cell.
    for (const x of [-30, -20, -6, 12, 30]) walls.push({ position: [x, 1.65, -15], size: [0.16, 3.3, 10] })
    for (const x of [-30, -6, 6, 30]) walls.push({ position: [x, 0.7, 16], size: [0.12, 1.4, 8] })
    for (const x of [-25, -15, -5, 5, 15, 25]) {
      columns.push({ position: [x, 3.6, -19.8], size: [0.2, 7.2, 0.24] })
      windows.push({ position: [x, 5.4, -19.97], size: [7.8, 1.8, 0.04] })
    }
    for (const z of [-17, 15]) {
      columns.push({ position: [0, 7.1, z], size: [60, 0.24, 0.22] })
      for (const x of [-29.7, 29.7]) columns.push({ position: [x, 3.55, z], size: [0.22, 7.1, 0.22] })
    }
    for (let mark = -7.5; mark <= 7.5; mark += 1) for (const side of [-1, 1]) {
      lines.push({ position: [mark, 0.012, side * 8], size: [0.55, 0.007, 0.06] })
      lines.push({ position: [side * 8, 0.012, mark], size: [0.06, 0.007, 0.55] })
    }
    return { walls, columns, windows, lines }
  }, [])
  return <group name="warehouse-architectural-context">
    <mesh name="learning-room-floor" receiveShadow position={[0, -0.09, 0]}><boxGeometry args={[60, 0.18, 40]} /><meshStandardMaterial color={floor} roughness={0.75} metalness={0.12} /></mesh>
    {[-39, 39].map(x => <mesh key={x} receiveShadow position={[x, -0.24, 0]}><boxGeometry args={[18, 0.12, 40]} /><meshStandardMaterial color={light ? '#77838b' : '#26333d'} roughness={0.95} /></mesh>)}
    {[-54, 54].map(x => <mesh key={x} receiveShadow position={[x, -0.24, 0]}><boxGeometry args={[12, 0.12, 40]} /><meshStandardMaterial color={light ? '#89949b' : '#303d47'} roughness={0.95} /></mesh>)}
    <mesh receiveShadow position={[0, -0.24, 24]}><boxGeometry args={[120, 0.12, 8]} /><meshStandardMaterial color={light ? '#89949b' : '#303d47'} roughness={0.95} /></mesh>
    <gridHelper args={[60, 60, light ? '#a9b6bc' : '#52616c', light ? '#bec8cc' : '#465460']} position={[0, 0.005, 0]} scale={[1, 1, 2 / 3]} />
    {WAREHOUSE_ZONES.map(zone => {
      const [x, z, width, depth] = zone.rect
      return <group key={zone.id} name={`warehouse-zone-${zone.id}`}>
        <mesh position={[x + width / 2, 0.009, z + depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width - 0.08, depth - 0.08]} /><meshBasicMaterial color={zone.color} transparent opacity={light ? 0.16 : 0.09} depthWrite={false} />
        </mesh>
        <mesh position={[x + width / 2, 0.011, z + depth - 0.08]}><boxGeometry args={[width - 0.16, 0.004, 0.04]} /><meshBasicMaterial color={zone.color} /></mesh>
      </group>
    })}
    <WarehouseBoxes parts={structure.walls} color={wall} />
    <WarehouseBoxes parts={structure.columns} color={light ? '#748b9c' : '#637989'} metalness={0.45} />
    <WarehouseBoxes parts={structure.windows} color={light ? '#e7efed' : '#9eafb7'} castShadow={false} />
    <WarehouseBoxes parts={structure.lines} color="#367cb7" castShadow={false} />
    {WAREHOUSE_DOCKS.map(dock => <LoadingBay key={dock.id} dock={dock} />)}
    {[-5, 4].map(z => <group key={z} name="warehouse-zone-pallet" position={[-15, 0, z]}><WarehouseRack width={8} depth={1.5} height={4.5} /></group>)}
    {[-5, 4].map(z => <group key={z} name="warehouse-zone-shelving" position={[16, 0, z]}><WarehouseRack width={6} depth={0.8} height={2.4} /></group>)}
    <group name="warehouse-zone-bulk"><WarehouseBoxes color="#b79771" parts={[
      { position: [-25, 0.7, 3], size: [2.4, 1.4, 2.4] }, { position: [-25, 0.5, 7], size: [2.4, 1, 2.4] },
    ]} /></group>
    <group name="warehouse-zone-kitting"><WarehouseBoxes color="#9e937c" parts={[
      { position: [0, 0.5, -15], size: [5, 1, 1.5] }, { position: [7, 0.5, -15], size: [5, 1, 1.5] },
    ]} /></group>
    <group name="warehouse-zone-packing"><WarehouseBoxes color="#bea580" parts={[
      { position: [16, 0.6, -15], size: [2.4, 1.2, 2.4] }, { position: [22, 0.6, -15], size: [2.4, 1.2, 2.4] },
    ]} /></group>
  </group>
}
