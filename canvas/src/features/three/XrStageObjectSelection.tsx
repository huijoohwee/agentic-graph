import React from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, Box3Helper, Matrix4, type Group } from 'three'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { controlXrSharedAssetControls } from './xrSharedAssetControlRuntime'
import { resolveXrStageObjects } from './xrSceneLibrary'

/** Select the existing stage object; selection never creates or persists a second subject. */
export function selectXrStageObject(targetId: string): boolean {
  const before = readXrMotionReferenceRuntime()
  if (!resolveXrStageObjects(before.plan.stageId).some(object => object.id === targetId)) return false
  const selected = controlXrSharedAssetControls({ operation: 'select-target', targetId })
  if (!selected.ok || selected.snapshot.selectedTargetId !== targetId) return false
  const state = useGraphStore.getState()
  state.setBottomSurfaceTab('timeline')
  state.setBottomSurfaceCollapsed(false)
  state.setMermaidDiagramSelectedRowKey('gantt', `xr-lane:object:${targetId}`)
  return true
}

/** Wrap the original geometry, including moving bodies; no replacement mesh or extra clock. */
export function XrStageObjectSelection({ objectId, children }: { objectId: string; children: React.ReactNode }) {
  const runtime = React.useSyncExternalStore(subscribeXrMotionReferenceRuntime, readXrMotionReferenceRuntime, readXrMotionReferenceRuntime)
  const targetId = `xr-stage:${objectId}`
  const eligible = resolveXrStageObjects(runtime.plan.stageId).some(object => object.id === targetId)
  const selected = eligible && runtime.selectedShotTargetId === targetId
  const root = React.useRef<Group>(null)
  const helper = React.useMemo(() => new Box3Helper(new Box3(), 0xfacc15), [])
  const inverse = React.useMemo(() => new Matrix4(), [])
  React.useEffect(() => () => {
    helper.geometry.dispose()
    for (const material of Array.isArray(helper.material) ? helper.material : [helper.material]) material.dispose()
  }, [helper])
  useFrame(() => {
    if (!selected || !root.current) return
    root.current.updateWorldMatrix(true, true)
    helper.box.setFromObject(root.current)
    helper.matrixAutoUpdate = true
    helper.updateMatrixWorld(true)
    if (root.current.parent) {
      inverse.copy(root.current.parent.matrixWorld).invert()
      helper.matrix.premultiply(inverse)
      helper.matrixAutoUpdate = false
      helper.matrixWorldNeedsUpdate = true
    }
  })
  return <>
    <group ref={root} userData={{ selectable: eligible, subjectId: targetId, kgXrSharedAssetTarget: targetId, selected }}
      onClick={eligible ? event => { if (event.delta > 4) return; event.stopPropagation(); selectXrStageObject(targetId) } : undefined}>
      {children}
    </group>
    {selected ? <primitive object={helper} raycast={() => null} /> : null}
  </>
}
