import { useEffect, useMemo } from 'react'
import { GanttTimelineTransportPanel } from '@/features/gitgraph/GanttTimelineTransportPanel'
import type { GanttTimelineTransportCommandAdapter } from '@/features/gitgraph/ganttTimelineTransportCommandAdapter'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { resolveVideoSequenceTimelineScaleDurationSeconds } from '@/components/timeline/videoSequenceTimelineZoom'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useWarehouseInspection } from './useWarehouseInspection'
import { WAREHOUSE_INSPECTION, WAREHOUSE_INSPECTION_FPS } from './warehouseCoverageRoutes'
import { WarehouseInspectionFeed } from './WarehouseInspectionFeed'

// Generated presentation lanes never write back into the learner's Python source.
const readOnlyScenario: GanttTimelineTransportCommandAdapter = {
  selectionFollowsPlayhead: false,
  canEditTrack: () => false,
  handleCommand: () => ({ status: 'rejected', reason: 'Warehouse inspection cues are a fixed simulation. Edit the Python lesson separately.' }),
}
const names: Record<string, string> = {
  'charging-truck': 'Mobile charging truck', drone001: 'Drone 001', drone002: 'Drone 002',
  door: 'Dock door', lid: 'Drone lid', camera: 'Camera frames', wifi: 'Wi-Fi delivery', yolo: 'Simulated detections',
}
const colors = ['#477fa1', '#008e8a', '#9a62b1', '#b07835', '#596baf', '#34765f']

export function WarehouseTimelinePanel({ compact = true }: { compact?: boolean }) {
  const inspection = useWarehouseInspection()
  const { active, available, canEnable, seconds, duration, sample, documentKey, enable, disable } = inspection
  useEffect(() => {
    if (!active) return
    return () => {
      const transport = useGraphStore.getState()
      if (transport.timelineTransportDocumentKey === documentKey) transport.setTimelineTransportState({ playing: false })
    }
  }, [active, documentKey])
  const code = useMemo(() => [
    'gantt', '  title Video Sequence', '  dateFormat HH:mm', '  axisFormat %M:%S',
    '  section Warehouse inspection',
    `  Warehouse inspection scene : warehouse_inspection_scene, kgpos_0, ${duration / 60}m`,
  ].join('\n'), [duration])
  const laneGroups = useMemo(() => {
    const groups = new Map<string, typeof WAREHOUSE_INSPECTION.cues[number][]>()
    for (const cue of WAREHOUSE_INSPECTION.cues) {
      const list = groups.get(cue.actorId) ?? []
      list.push(cue); groups.set(cue.actorId, list)
    }
    return [...groups.entries()]
  }, [])
  const scaleSeconds = resolveVideoSequenceTimelineScaleDurationSeconds(duration)
  const seek = (time: number) => {
    if (!active || !documentKey) return
    useGraphStore.getState().setTimelineTransportState({ documentKey, position: Math.max(0, Math.min(duration, time)) / 60, playing: false })
  }
  if (!available) return <p role="status" className="p-3 text-xs">Open the drone Python lesson to inspect this warehouse scenario.</p>
  if (!active) return <section className="space-y-2 p-3 text-xs" aria-label="Warehouse inspection timeline">
    <strong className="block text-sm">Warehouse inspection</strong>
    <p>Replay the truck, two drones and dock cycle with the shared Timeline. Camera frames, Wi-Fi delivery and detections are simulated locally.</p>
    <button type="button" className="min-h-11 rounded border px-3" disabled={!canEnable} onClick={enable}>Open warehouse inspection</button>
    {!canEnable && <p role="status">Pause or stop Python before opening the inspection preview.</p>}
  </section>
  return <section className="min-w-0 space-y-2" aria-label="Warehouse inspection timeline" data-warehouse-inspection="active" data-warehouse-frame={sample.frameIndex}>
    <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-xs">
      <div><strong>Warehouse inspection</strong><p>{sample.phase} · rack checks {sample.coverage.rackVisited}/{sample.coverage.rackTotal} · aisle checks {sample.coverage.aisleVisited}/{sample.coverage.aisleTotal}</p></div>
      <button type="button" className="min-h-11 rounded border px-3" onClick={disable}>Return to Python flight</button>
    </div>
    <div className="grid min-w-0 items-start gap-2 md:grid-cols-[minmax(0,3fr)_minmax(240px,2fr)]">
    <div className="min-w-0 overflow-x-auto">
    <GanttTimelineTransportPanel code={code} compact={compact} clockActive editable={false}
      commandAdapter={readOnlyScenario} mode="media" publishPlaybackRequest={false}
      runtimeDocumentKey={documentKey} runtimeDurationSeconds={duration} runtimeFrameRate={WAREHOUSE_INSPECTION_FPS}
      timelineInsertedLanes={laneGroups.map(([id, cues], index) => ({
        id: `warehouse:${id}`, insertAfterLaneId: 'scene', label: names[id] ?? id,
        content: <TimelineTransportTimeAxisClip laneStyle="video" aria-label={`${names[id] ?? id} inspection cues`}>
          <div className="relative h-12 w-full">
            {cues.map(cue => <button key={cue.id} type="button" title={`${cue.label} · ${cue.startSeconds.toFixed(1)}–${cue.endSeconds.toFixed(1)} s`}
              aria-label={`Seek ${cue.label}`} onClick={() => seek(cue.startSeconds)}
              className="absolute top-0 h-11 overflow-hidden rounded border px-1 text-left text-[10px] text-white"
              style={{ left: `${cue.startSeconds / scaleSeconds * 100}%`, width: `${Math.max(0.15, (cue.endSeconds - cue.startSeconds) / scaleSeconds * 100)}%`, background: colors[index % colors.length] }}>
              {cue.label}
            </button>)}
            <span className="pointer-events-none absolute inset-y-0 w-px bg-sky-500" style={{ left: `${seconds / scaleSeconds * 100}%` }} />
          </div>
        </TimelineTransportTimeAxisClip>,
      }))} />
    </div>
    <WarehouseInspectionFeed seconds={seconds} sample={sample} />
    </div>
  </section>
}
