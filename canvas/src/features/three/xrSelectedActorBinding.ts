import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readXrMotionReferenceRuntime,
  selectXrMotionReferenceActor,
  selectXrMotionReferenceShotTarget,
  type XrMotionReferenceRuntimeSnapshot,
} from './xrMotionReferenceRuntime'
import { resolveXrShotTarget } from './xrShotTargets'

const cleanId = (value: unknown): string => String(value || '').trim()

export function readBoundXrSelectedActorId(): string {
  const runtime = readXrMotionReferenceRuntime()
  const selectedNodeId = cleanId(useGraphStore.getState().selectedNodeId)
  if (selectedNodeId && runtime.plan.cast.some(track => track.actorId === selectedNodeId)) return selectedNodeId
  const selectedShotTargetId = cleanId(runtime.selectedShotTargetId)
  if (selectedShotTargetId && runtime.plan.subjects.some(subject => subject.id === selectedShotTargetId)) {
    return selectedShotTargetId
  }
  return runtime.plan.cast.some(track => track.actorId === runtime.selectedActorId)
    ? runtime.selectedActorId
    : ''
}

export function selectBoundXrActor(actorIdValue: string): XrMotionReferenceRuntimeSnapshot {
  const actorId = cleanId(actorIdValue)
  const state = useGraphStore.getState()
  selectXrMotionReferenceActor(actorId)
  const runtime = selectXrMotionReferenceShotTarget(actorId)
  if (!runtime.plan.cast.some(track => track.actorId === actorId)) return runtime
  const actorIsGraphNode = Boolean(state.graphData?.nodes?.some(node => cleanId(node.id) === actorId))
  if (actorIsGraphNode) {
    state.selectNode(actorId)
  } else if (cleanId(state.selectedNodeId)) {
    state.selectNode(null)
  }
  return runtime
}

export function selectBoundXrShotTarget(targetIdValue: string): XrMotionReferenceRuntimeSnapshot {
  const targetId = cleanId(targetIdValue)
  const runtime = readXrMotionReferenceRuntime()
  const target = resolveXrShotTarget(runtime.plan, targetId)
  if (!target) return runtime
  if (target.castActorId) return selectBoundXrActor(target.castActorId)
  const state = useGraphStore.getState()
  if (cleanId(state.selectedNodeId)) state.selectNode(null)
  return selectXrMotionReferenceShotTarget(target.id)
}

export function synchronizeBoundXrActorFromGraphSelection(): XrMotionReferenceRuntimeSnapshot {
  const selectedNodeId = cleanId(useGraphStore.getState().selectedNodeId)
  const runtime = readXrMotionReferenceRuntime()
  if (!selectedNodeId || !runtime.plan.cast.some(track => track.actorId === selectedNodeId)) return runtime
  selectXrMotionReferenceActor(selectedNodeId)
  return selectXrMotionReferenceShotTarget(selectedNodeId)
}
