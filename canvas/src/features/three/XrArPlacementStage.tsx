import React from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, type Group } from 'three'
import {
  xrArPlacementRuntime,
  shouldShowXrArPlacementContent,
  type XrArFrameLike,
  type XrArMatrix4,
  type XrArPlacementRuntime,
  type XrArPlacementSnapshot,
} from './xrArPlacementRuntime'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

function applyGroupMatrix(
  group: Group | null,
  matrix: XrArMatrix4 | null,
  visible: boolean,
): void {
  if (!group) return
  if (matrix) group.matrix.fromArray(matrix)
  else group.matrix.identity()
  group.matrixWorldNeedsUpdate = true
  group.visible = visible
}

function useRuntimeGroupMatrix(args: {
  runtime: XrArPlacementRuntime
  groupRef: React.MutableRefObject<Group | null>
  selectMatrix: (snapshot: XrArPlacementSnapshot) => XrArMatrix4 | null
  selectVisible: (snapshot: XrArPlacementSnapshot) => boolean
}): void {
  const { runtime, groupRef, selectMatrix, selectVisible } = args
  useIsomorphicLayoutEffect(() => {
    const synchronize = () => {
      const snapshot = runtime.read()
      applyGroupMatrix(groupRef.current, selectMatrix(snapshot), selectVisible(snapshot))
    }
    synchronize()
    return runtime.subscribe(synchronize)
  }, [groupRef, runtime, selectMatrix, selectVisible])
}

const selectHitMatrix = (snapshot: XrArPlacementSnapshot) => snapshot.hitMatrix
const selectPlacementMatrix = (snapshot: XrArPlacementSnapshot) => snapshot.placementMatrix
const selectReticleVisible = (snapshot: XrArPlacementSnapshot) => snapshot.reticleVisible

export function XrArPlacementRoot({
  children,
  runtime = xrArPlacementRuntime,
  hideUntilPlaced = true,
  scale = 1,
  offset = [0, 0, 0],
  name = 'agentic_os_xr_ar_placement_root',
}: {
  children?: React.ReactNode
  runtime?: XrArPlacementRuntime
  hideUntilPlaced?: boolean
  scale?: number
  offset?: readonly [number, number, number]
  name?: string
}) {
  const rootRef = React.useRef<Group | null>(null)
  const contentRef = React.useRef<Group | null>(null)
  const offsetRef = React.useRef<Group | null>(null)
  const [offsetX, offsetY, offsetZ] = offset
  const selectVisible = React.useCallback(
    (snapshot: XrArPlacementSnapshot) => shouldShowXrArPlacementContent(snapshot, hideUntilPlaced),
    [hideUntilPlaced],
  )
  useRuntimeGroupMatrix({
    runtime,
    groupRef: rootRef,
    selectMatrix: selectPlacementMatrix,
    selectVisible,
  })
  useIsomorphicLayoutEffect(() => {
    let lastImmersiveSessionActive: boolean | null = null
    const synchronizeScale = () => {
      const content = contentRef.current
      const offsetGroup = offsetRef.current
      if (!content || !offsetGroup) return
      const immersiveSessionActive = runtime.read().immersiveSessionActive
      if (lastImmersiveSessionActive === immersiveSessionActive) return
      lastImmersiveSessionActive = immersiveSessionActive
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
      const nextScale = immersiveSessionActive ? safeScale : 1
      content.scale.setScalar(nextScale)
      content.matrixWorldNeedsUpdate = true
      offsetGroup.position.set(
        immersiveSessionActive ? offsetX : 0,
        immersiveSessionActive ? offsetY : 0,
        immersiveSessionActive ? offsetZ : 0,
      )
      offsetGroup.matrixWorldNeedsUpdate = true
    }
    synchronizeScale()
    return runtime.subscribe(synchronizeScale)
  }, [offsetX, offsetY, offsetZ, runtime, scale])
  return (
    <group ref={rootRef} name={name} matrixAutoUpdate={false} visible>
      <group ref={contentRef}>
        <group ref={offsetRef}>{children}</group>
      </group>
    </group>
  )
}

export function XrArPlacementStage({
  children,
  runtime = xrArPlacementRuntime,
  hideContentUntilPlaced = true,
  contentScale = 1,
  contentOffset = [0, 0, 0],
  reticleRadius = 0.09,
  reticleColor = '#38bdf8',
}: {
  children?: React.ReactNode
  runtime?: XrArPlacementRuntime
  hideContentUntilPlaced?: boolean
  contentScale?: number
  contentOffset?: readonly [number, number, number]
  reticleRadius?: number
  reticleColor?: string
}) {
  const reticleRef = React.useRef<Group | null>(null)

  useRuntimeGroupMatrix({
    runtime,
    groupRef: reticleRef,
    selectMatrix: selectHitMatrix,
    selectVisible: selectReticleVisible,
  })

  useFrame((_state, _delta, frame) => {
    runtime.updateFrame(frame as unknown as XrArFrameLike | undefined)
  })

  const safeRadius = Number.isFinite(reticleRadius)
    ? Math.min(0.5, Math.max(0.015, reticleRadius))
    : 0.09
  return (
    <group name="agentic_os_xr_ar_placement_stage">
      <group
        ref={reticleRef}
        name="agentic_os_xr_ar_hit_reticle"
        matrixAutoUpdate={false}
        visible={false}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}>
          <ringGeometry args={[safeRadius * 0.68, safeRadius, 40]} />
          <meshBasicMaterial
            color={reticleColor}
            transparent
            opacity={0.9}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={21}>
          <ringGeometry args={[safeRadius * 0.08, safeRadius * 0.18, 20]} />
          <meshBasicMaterial
            color={reticleColor}
            depthTest={false}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
      <XrArPlacementRoot
        runtime={runtime}
        hideUntilPlaced={hideContentUntilPlaced}
        scale={contentScale}
        offset={contentOffset}
      >
        {children}
      </XrArPlacementRoot>
    </group>
  )
}
