import React from 'react'
import { XrSelectionBounds } from './XrSelectionBounds'
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
  return <>
    <group userData={{ selectable: eligible, subjectId: targetId, kgXrSharedAssetTarget: targetId, selected }}
      onClick={eligible ? event => { if (event.delta > 4) return; event.stopPropagation(); selectXrStageObject(targetId) } : undefined}>
      <XrSelectionBounds selected={selected} targetId={targetId}>{children}</XrSelectionBounds>
    </group>
  </>
}
