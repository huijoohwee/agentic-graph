import React from 'react'

type VehicleSize = readonly [number, number, number]

function Paint({ color, metalness = 0.06, roughness = 0.58 }: {
  color: string
  metalness?: number
  roughness?: number
}) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
}

function CarGeometry({ color, size }: { color: string; size: VehicleSize }) {
  const [width, height, depth] = size
  const wheelRadius = height * 0.2
  const tireWidth = width * 0.12
  const wheelX = width * 0.44
  const wheelY = depth * 0.31
  return (
    <group name="kg_xr_procedural_car" userData={{ vehicleKind: 'car' }}>
      <mesh name="kg_xr_car_chassis" position={[0, 0, height * 0.34]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.94, depth * 0.86, height * 0.34]} />
        <Paint color={color} metalness={0.12} roughness={0.42} />
      </mesh>
      <mesh position={[0, -depth * 0.31, height * 0.55]} castShadow>
        <boxGeometry args={[width * 0.88, depth * 0.23, height * 0.18]} />
        <Paint color={color} />
      </mesh>
      <mesh position={[0, depth * 0.34, height * 0.52]} castShadow>
        <boxGeometry args={[width * 0.86, depth * 0.16, height * 0.15]} />
        <Paint color={color} />
      </mesh>
      <mesh name="kg_xr_car_glass" position={[0, depth * 0.01, height * 0.7]} scale={[width * 0.38, depth * 0.25, height * 0.25]} castShadow>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color="#102b3d" roughness={0.22} metalness={0.18} />
      </mesh>
      <mesh position={[0, depth * 0.02, height * 0.91]} castShadow>
        <boxGeometry args={[width * 0.58, depth * 0.34, height * 0.08]} />
        <Paint color={color} />
      </mesh>
      {[-1, 1].map(side => (
        <React.Fragment key={side}>
          <mesh position={[side * width * 0.33, -depth * 0.435, height * 0.5]}>
            <boxGeometry args={[width * 0.18, depth * 0.025, height * 0.11]} />
            <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.35} roughness={0.3} />
          </mesh>
          <mesh position={[side * width * 0.33, depth * 0.435, height * 0.49]}>
            <boxGeometry args={[width * 0.17, depth * 0.025, height * 0.1]} />
            <meshStandardMaterial color="#fb7185" emissive="#be123c" emissiveIntensity={0.3} roughness={0.4} />
          </mesh>
        </React.Fragment>
      ))}
      <mesh position={[0, -depth * 0.45, height * 0.28]}>
        <boxGeometry args={[width * 0.82, depth * 0.055, height * 0.1]} />
        <Paint color="#dbeafe" metalness={0.72} roughness={0.3} />
      </mesh>
      <mesh position={[0, depth * 0.45, height * 0.28]}>
        <boxGeometry args={[width * 0.82, depth * 0.055, height * 0.1]} />
        <Paint color="#dbeafe" metalness={0.72} roughness={0.3} />
      </mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => (
        <group key={`${x}:${y}`} position={[x * wheelX, y * wheelY, height * 0.2]}>
          <mesh name="kg_xr_car_wheel" rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[wheelRadius, wheelRadius, tireWidth, 20]} />
            <meshStandardMaterial color="#111827" roughness={0.92} />
          </mesh>
          <mesh position={[x * tireWidth * 0.51, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelRadius * 0.5, wheelRadius * 0.5, tireWidth * 1.04, 16]} />
            <Paint color="#94a3b8" metalness={0.64} roughness={0.32} />
          </mesh>
        </group>
      )))}
    </group>
  )
}

function HelicopterGeometry({ color, size }: { color: string; size: VehicleSize }) {
  const [width, height, depth] = size
  const cabinWidth = Math.min(width * 0.4, depth * 0.34)
  const skidX = cabinWidth * 0.38
  return (
    <group name="kg_xr_procedural_helicopter" userData={{ vehicleKind: 'helicopter' }}>
      <mesh name="kg_xr_helicopter_cabin" position={[0, -depth * 0.24, height * 0.48]} scale={[cabinWidth * 0.5, depth * 0.18, height * 0.3]} castShadow>
        <sphereGeometry args={[1, 20, 14]} />
        <Paint color={color} metalness={0.12} roughness={0.4} />
      </mesh>
      <mesh name="kg_xr_helicopter_windshield" position={[0, -depth * 0.4, height * 0.54]} scale={[cabinWidth * 0.38, depth * 0.045, height * 0.2]}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color="#15364c" roughness={0.18} metalness={0.2} />
      </mesh>
      <mesh name="kg_xr_helicopter_tail_boom" position={[0, depth * 0.16, height * 0.5]} rotation={[0.04, 0, 0]} castShadow>
        <boxGeometry args={[cabinWidth * 0.18, depth * 0.68, height * 0.13]} />
        <Paint color={color} metalness={0.12} roughness={0.44} />
      </mesh>
      <mesh position={[0, depth * 0.47, height * 0.72]} rotation={[-0.18, 0, 0]} castShadow>
        <boxGeometry args={[cabinWidth * 0.12, depth * 0.12, height * 0.38]} />
        <Paint color="#f8fafc" roughness={0.5} />
      </mesh>
      <mesh name="kg_xr_helicopter_mast" position={[0, -depth * 0.16, height * 0.86]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[height * 0.035, height * 0.045, height * 0.28, 10]} />
        <Paint color="#475569" metalness={0.5} roughness={0.35} />
      </mesh>
      <group name="kg_xr_helicopter_main_rotor" position={[0, -depth * 0.16, height]}>
        <mesh castShadow>
          <boxGeometry args={[width * 0.96, depth * 0.035, height * 0.025]} />
          <Paint color="#1e293b" metalness={0.34} roughness={0.48} />
        </mesh>
        <mesh castShadow>
          <boxGeometry args={[width * 0.045, width * 0.96, height * 0.025]} />
          <Paint color="#334155" metalness={0.34} roughness={0.48} />
        </mesh>
        <mesh><cylinderGeometry args={[height * 0.08, height * 0.08, height * 0.09, 12]} /><Paint color="#e2e8f0" metalness={0.54} roughness={0.3} /></mesh>
      </group>
      <group name="kg_xr_helicopter_tail_rotor" position={[cabinWidth * 0.09, depth * 0.49, height * 0.62]} rotation={[0, Math.PI / 2, 0]}>
        <mesh><torusGeometry args={[height * 0.18, height * 0.025, 8, 20]} /><Paint color="#e2e8f0" metalness={0.42} roughness={0.38} /></mesh>
        <mesh><boxGeometry args={[height * 0.04, height * 0.42, height * 0.035]} /><Paint color="#1e293b" /></mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[height * 0.04, height * 0.42, height * 0.035]} /><Paint color="#1e293b" /></mesh>
      </group>
      {[-1, 1].map(side => (
        <React.Fragment key={side}>
          <mesh name="kg_xr_helicopter_skid" position={[side * skidX, -depth * 0.2, height * 0.1]} castShadow>
            <boxGeometry args={[cabinWidth * 0.055, depth * 0.43, height * 0.055]} />
            <Paint color="#334155" metalness={0.5} roughness={0.4} />
          </mesh>
          {[-0.34, -0.12].map(y => (
            <mesh key={y} position={[side * skidX, depth * y, height * 0.23]} rotation={[0, side * 0.12, 0]}>
              <boxGeometry args={[cabinWidth * 0.04, height * 0.04, height * 0.28]} />
              <Paint color="#475569" metalness={0.46} roughness={0.42} />
            </mesh>
          ))}
        </React.Fragment>
      ))}
      <mesh position={[0, -depth * 0.385, height * 0.42]}>
        <sphereGeometry args={[height * 0.06, 10, 8]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.42} />
      </mesh>
    </group>
  )
}

export function XrProceduralVehicleGeometry({
  color,
  kind,
  size,
}: {
  color: string
  kind: 'car' | 'helicopter'
  size: VehicleSize
}) {
  if (kind === 'car') return <CarGeometry color={color} size={size} />
  return <HelicopterGeometry color={color} size={size} />
}
