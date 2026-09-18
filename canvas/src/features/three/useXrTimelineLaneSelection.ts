import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { resolveXrTimelineAnimationTrack } from './xrMotionReferenceTimeline'
import { XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID } from './xrShotTargets'

export type XrTimelineLaneSelection = 'scene' | 'simulation' | 'camera' | `object:${string}` | `npc:${string}`
const prefix = 'xr-lane:'

/** Native Gantt rows and inserted XR lanes share the existing selection store. */
export function useXrTimelineLaneSelection(code: string, targetId: string, sharedKind: string, sharedId: string, markKey: string) {
  const rowKey = useGraphStore(state => state.mermaidDiagramSelectedRowKeyByKind.gantt || '')
  const sceneKey = React.useMemo(() => buildMermaidGanttTimelineModel(code).taskSpans.find(span => span.rowKey.includes('xr_stage_scene'))?.rowKey || '', [code])
  const setLane = React.useCallback((lane: XrTimelineLaneSelection) => {
    useGraphStore.getState().setMermaidDiagramSelectedRowKey('gantt', lane === 'scene' ? sceneKey : `${prefix}${lane}`)
  }, [sceneKey])
  React.useEffect(() => {
    const runtime = readXrMotionReferenceRuntime()
    const currentKey = useGraphStore.getState().mermaidDiagramSelectedRowKeyByKind.gantt || ''
    if (resolveXrTimelineAnimationTrack(runtime.plan, currentKey)?.actorId === targetId && sharedKind !== 'npc') return
    setLane(sharedKind === 'npc' && sharedId ? `npc:${sharedId}` : runtime.selectedMark?.kind === 'camera' ? 'camera'
      : targetId === XR_MOTION_REFERENCE_SCENE_SHOT_TARGET_ID ? 'scene' : `object:${targetId}`)
  }, [targetId, sharedKind, sharedId, markKey, setLane])
  const lane = rowKey === sceneKey ? 'scene' : rowKey.startsWith(prefix) ? rowKey.slice(prefix.length) as XrTimelineLaneSelection : null
  return [lane, setLane] as const
}
