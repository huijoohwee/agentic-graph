import { readXrMotionReferencePlan } from './xrMotionReferenceModel'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GanttTimelineTransportCommandAdapter } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { controlLocalAnimation } from './xrAnimationMcpRuntime'
import { readXrMotionReferenceRuntime, setXrMotionReferenceDuration } from './xrMotionReferenceRuntime'
import { xrMotionReferenceTimelineDocumentKey } from './xrMotionReferenceTimeline'

/** The native Scene end handle edits the authored duration, never generated Mermaid text. */
export const xrTimelineCommandAdapter: GanttTimelineTransportCommandAdapter = {
  selectionFollowsPlayhead: false,
  canEditTrack: (rowKey, mode) => rowKey.includes('xr_stage_scene') && mode === 'resize-end',
  handleCommand(command) {
    const rejected = { status: 'rejected', reason: 'Resize the Scene end to change the shared authored duration.' } as const
    const state = useGraphStore.getState()
    if (command.target.documentKey !== xrMotionReferenceTimelineDocumentKey(state.markdownDocumentName)
      || command.kind !== 'drag-edit' || command.mode !== 'resize-end'
      || !command.target.selectedRowKey?.includes('xr_stage_scene') || command.displayLaneDelta !== 0) return rejected
    const { plan, playheadSeconds } = readXrMotionReferenceRuntime()
    const seconds = (command.sourceEndMinutes + command.effectiveDeltaMinutes) * 60
    if (Math.abs(command.sourceEndMinutes * 60 - plan.durationSeconds) > 0.001 || !Number.isFinite(seconds) || !controlLocalAnimation({ operation: 'pause' }).ok) return rejected
    const duration = readXrMotionReferencePlan({ durationSeconds: Math.round(seconds * plan.fps) / plan.fps }).durationSeconds
    const next = setXrMotionReferenceDuration(duration)
    if (next.plan.durationSeconds !== duration) return { status: 'rejected', reason: 'Scene duration violates the authored motion constraints.' }
    controlLocalAnimation({ operation: 'scrub', timeSeconds: Math.min(playheadSeconds, next.plan.durationSeconds) })
    return { status: 'handled' }
  },
}
