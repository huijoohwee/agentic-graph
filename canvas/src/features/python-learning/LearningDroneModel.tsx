import type { LearningSceneSnapshot } from './learningLessons'

/** Render-only aircraft detail; the simulation remains the sole pose/tick owner. */
export function LearningDroneModel({ scene, groundOffset = .25 }: { scene?: LearningSceneSnapshot; groundOffset?: number }) {
  const x = scene?.x ?? 0, z = scene?.z ?? 0, altitude = scene?.altitude ?? 0
  const rotorPhase = altitude > 0 ? (scene?.ticks ?? 0) * 1.7 : 0
  return <group name="learning-drone" position={[x, groundOffset + altitude, z]} rotation={[0, -(scene?.heading ?? 0) * Math.PI / 180, 0]}>
    <mesh castShadow receiveShadow position={[0, -0.011, 0]} scale={[1, 0.23, 0.63]}>
      <sphereGeometry args={[0.119, 24, 12]} /><meshStandardMaterial color="#354750" metalness={0.25} roughness={0.53} />
    </mesh>
    <mesh castShadow receiveShadow scale={[1, 0.38, 0.62]}>
      <sphereGeometry args={[0.12, 24, 12]} /><meshStandardMaterial color="#b8d9e5" metalness={0.28} roughness={0.33} />
    </mesh>
    <mesh castShadow position={[0, -0.02, 0]}><boxGeometry args={[0.15, 0.055, 0.075]} /><meshStandardMaterial color="#253640" metalness={0.25} roughness={0.48} /></mesh>
    <mesh position={[0.02, 0.043, 0]}><boxGeometry args={[0.075, 0.008, 0.034]} /><meshStandardMaterial color="#476471" metalness={0.4} roughness={0.5} /></mesh>
    <mesh position={[0.02, 0.0472, 0]}><boxGeometry args={[0.06, 0.0008, 0.02]} /><meshStandardMaterial color="#76929d" metalness={0.45} roughness={0.46} /></mesh>
    {/* Amber nose and camera identify +X without changing the heading contract. */}
    <mesh castShadow position={[0.104, -0.005, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[0.024, 0.03, 0.026, 12]} /><meshStandardMaterial color="#e3a45d" roughness={0.42} metalness={0.35} />
    </mesh>
    <mesh position={[0.12, -0.005, 0]} rotation={[0, Math.PI / 2, 0]}>
      <circleGeometry args={[0.017, 16]} /><meshStandardMaterial color="#182c40" metalness={0.6} roughness={0.2} />
    </mesh>
    <mesh position={[0.1204, -0.005, 0]} rotation={[0, Math.PI / 2, 0]}>
      <ringGeometry args={[0.0125, 0.0175, 24]} /><meshStandardMaterial color="#56666d" metalness={0.72} roughness={0.3} />
    </mesh>
    <mesh position={[0.1206, -0.005, 0]} rotation={[0, Math.PI / 2, 0]}>
      <circleGeometry args={[0.011, 24]} /><meshStandardMaterial color="#182c38" metalness={0.38} roughness={0.1} />
    </mesh>
    {[-1, 1].flatMap(sx => [-1, 1].map(sz => <group key={`${sx}:${sz}`} position={[sx * 0.1, 0, sz * 0.1]}>
      <mesh castShadow position={[-sx * 0.027, -0.015, -sz * 0.027]} rotation={[0, -sx * sz * Math.PI / 4, 0]}>
        <boxGeometry args={[0.11, 0.021, 0.021]} /><meshStandardMaterial color="#526a76" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.015, 0]}><cylinderGeometry args={[0.018, 0.02, 0.045, 12]} /><meshStandardMaterial color="#3d5664" metalness={0.65} roughness={0.38} /></mesh>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <torusGeometry args={[0.05, 0.004, 6, 24]} /><meshStandardMaterial color="#b8cbd1" metalness={0.45} roughness={0.42} />
      </mesh>
      <group rotation={[0, rotorPhase * sx * sz + Math.PI / 4, 0]} position={[0, 0.042, 0]}>
        <mesh castShadow><boxGeometry args={[0.092, 0.003, 0.012]} /><meshStandardMaterial color="#3b515c" metalness={0.25} roughness={0.6} /></mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.072, 0.003, 0.009]} /><meshStandardMaterial color="#607985" roughness={0.55} /></mesh>
      </group>
      <mesh position={[0, -0.055, 0]}><cylinderGeometry args={[0.007, 0.009, 0.07, 8]} /><meshStandardMaterial color="#566d78" roughness={0.8} /></mesh>
      <mesh position={[0, 0.002, sz * 0.021]}><sphereGeometry args={[0.006, 8, 6]} /><meshBasicMaterial color={sx > 0 ? '#8fe4be' : '#f6b37f'} /></mesh>
    </group>))}
  </group>
}
