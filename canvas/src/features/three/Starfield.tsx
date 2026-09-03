import React, { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Points } from 'three'

export function Starfield({ count, radius, opacity, color, paused }: { count: number; radius: number; opacity: number; color: string; paused?: boolean }) {
  const { camera } = useThree()
  const pointsRef = useRef<Points>(null!)
  const positions = useMemo(() => {
    const n = Math.max(0, Math.floor(count))
    const r = radius > 0 ? radius : 200
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i += 1) {
      const i3 = i * 3
      arr[i3] = (Math.random() - 0.5) * r * 2
      arr[i3 + 1] = (Math.random() - 0.5) * r * 2
      arr[i3 + 2] = (Math.random() - 0.5) * r * 2
    }
    return arr
  }, [count, radius])
  useFrame(() => {
    if (paused) return
    if (!pointsRef.current) return
    pointsRef.current.position.copy(camera.position)
  })
  const n = positions.length / 3
  if (!n) return null
  return (
    <points ref={pointsRef} name="agentic_os_starfield">
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={n}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.7} color={color} transparent opacity={opacity} sizeAttenuation />
    </points>
  )
}
