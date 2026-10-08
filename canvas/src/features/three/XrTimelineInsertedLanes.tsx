import React from 'react'
import { Activity, Box, Camera, UserRound } from 'lucide-react'
import type { VideoSequenceTimelineInsertedLane } from '@/components/timeline/VideoSequenceTimelineLanes'
import { TimelineTransportTimeAxisClip } from '@/components/timeline/TimelineTransportControls'
import { cn } from '@/lib/utils'
import { CameraMotionMarkRetime, createXrTimelineMarkOnDoubleClick } from './CameraMotionMarkRetime'
import { sampleXrTimelineSceneObject } from './xrTimelineSceneProjection'
import { resolveXrTimelineObjectPathCaption, type XrRehearsalTimelineBeat } from './xrRehearsalTimelineBeats'
import type { XrShotTarget } from './xrShotTargets'
import type { XrTimelineLaneSelection } from './useXrTimelineLaneSelection'
import type { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import type { readGameFpsSnapshot } from '@/features/game-fps/gameFpsRuntime'

const GAME_FPS_NPC_TIMELINE_COLORS = Object.freeze({ hold: '#60a5fa', alert: '#facc15', engage: '#ef4444', flee: '#c084fc' })

type XrTimelineInsertedLaneOptions = {
  runtime: ReturnType<typeof readXrMotionReferenceRuntime>
  gameMission: ReturnType<typeof readGameFpsSnapshot>
  objectTargets: readonly XrShotTarget[]
  currentRehearsalBeat: XrRehearsalTimelineBeat | null
  selectedTimelineLaneId: XrTimelineLaneSelection | null
  sceneScaleDurationSeconds: number
  documentLoaded: boolean
  simulationPhase: string
  simulationBodyCount: number
  simulationRuntime: string
  selectObjectTimelineLane: (id: string) => void
  selectCameraTimelineLane: () => void
  selectSimulationTimelineLane: () => void
  selectNpcTimelineLane: (id: string) => void
}

/** XR supplies lane content and domain actions; the shared ruler owns selection and scrub gestures. */
export function buildXrTimelineInsertedLanes({
  runtime, gameMission, objectTargets, currentRehearsalBeat, selectedTimelineLaneId,
  sceneScaleDurationSeconds, documentLoaded, simulationPhase, simulationBodyCount, simulationRuntime,
  selectObjectTimelineLane, selectCameraTimelineLane, selectSimulationTimelineLane, selectNpcTimelineLane,
}: XrTimelineInsertedLaneOptions): readonly VideoSequenceTimelineInsertedLane[] {
  const cameraTimelineLaneSelected = selectedTimelineLaneId === 'camera'
  const simulationTimelineLaneSelected = selectedTimelineLaneId === 'simulation'
  return [
  ...objectTargets.map(target => {
    const object = sampleXrTimelineSceneObject(runtime.plan, target, runtime.playheadSeconds)
    const track = target.castActorId
      ? runtime.plan.cast.find(candidate => candidate.actorId === target.castActorId) || null
      : null
    const selected = selectedTimelineLaneId === `object:${target.id}`
    const pathCaption = resolveXrTimelineObjectPathCaption({
      label: target.label,
      motion: object.motion,
      beatLabel: currentRehearsalBeat?.label,
    })
    return {
      id: `xr-object:${target.id}`,
        ariaLabel: `${target.label} object timeline lane`,
      selectRowKey: `xr-lane:object:${target.id}`,
      insertAfterLaneId: 'scene',
      selected,
      label: (
        <button
          type="button"
          className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
          aria-label={`Link SHOOT to 3D Object ${target.label}`}
          aria-pressed={selected}
          onClick={() => selectObjectTimelineLane(target.id)}
          data-kg-xr-shot-target-lane-label={target.id}
          data-kg-xr-choreography-cast-lane-label={track?.actorId}
          data-kg-xr-timeline-lane-hit-target={`object-label:${target.id}`}
        >
          <Box role="img" aria-label={`${target.label} object`} style={{ color: target.color }} />
          <b title={target.label}>{target.label}</b>
          <small>{track?.marks.length || 'shot'}</small>
        </button>
      ),
      content: ({ selectRowKey }) => (
        <TimelineTransportTimeAxisClip
          laneStyle="video"
          className={cn(
            'xr-camera-motion-retime-time-axis-rail',
          )}
          aria-label={`${target.label} linked SHOOT time rail`}
          aria-current={selected ? 'true' : undefined}
          data-kg-xr-choreography-shared-axis-rail={track ? 'cast' : 'object'}
          data-kg-xr-timeline-lane-affordance={`object:${target.id}`}
          data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
        >
          <section
            className="xr-shot-target-timeline-lane"
              role="group"
              aria-label="Timeline lane controls"
            onDoubleClick={event => createXrTimelineMarkOnDoubleClick(event, target.id, sceneScaleDurationSeconds, !documentLoaded)}
            data-kg-xr-shot-target-lane={target.id}
            data-kg-xr-shot-target-selected={selected ? '1' : undefined}
            data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
          >
            <button
              type="button"
              className={cn('timeline-transport-time-axis-bar xr-shot-target-timeline-bar', selected && 'timeline-transport-track-clip--selected')}
              style={{ '--kg-xr-shot-target-color': target.color } as React.CSSProperties}
              aria-label={`Link SHOOT to ${target.label} for the full scene. Drag to scrub XR timeline.`}
              aria-pressed={selected}
              onClick={() => selectObjectTimelineLane(target.id)}
              title={`${target.label} · ${pathCaption} · (${object.position.map(value => value.toFixed(1)).join(', ')}) m · drag to scrub; double-click to add mark`}
              data-kg-xr-shot-target-bar={target.id}
              data-kg-xr-rehearsal-caption={pathCaption}
              data-kg-xr-timeline-lane-drag="scrub"
              disabled={!documentLoaded}
              data-kg-video-sequence-ruler-scrub-target="1"
              data-kg-video-sequence-ruler-scrub-intent="drag"
              data-kg-video-sequence-ruler-scrub-row-key={selectRowKey}
              data-kg-xr-timeline-lane-hit-target={`object:${target.id}`}
            >
              <span>{target.label} · {pathCaption} · ({object.position.map(value => value.toFixed(1)).join(', ')}) m</span>
            </button>
            {track ? (
              <CameraMotionMarkRetime
                layout="lane"
                laneTarget={{ kind: 'cast', actorId: track.actorId }}
              />
            ) : null}
          </section>
        </TimelineTransportTimeAxisClip>
      ),
    }
  }),
  {
    id: 'xr-camera',
      ariaLabel: 'Camera choreography timeline lane',
    selectRowKey: 'xr-lane:camera',
    insertAfterLaneId: 'scene',
    selected: cameraTimelineLaneSelected,
    label: (
      <button
        type="button"
        className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
        aria-label="Select Camera choreography lane"
        aria-pressed={cameraTimelineLaneSelected}
        onClick={selectCameraTimelineLane}
        data-kg-xr-choreography-camera-lane-label="1"
        data-kg-xr-timeline-lane-hit-target="camera-label"
      >
        <Camera role="img" aria-label="Camera" />
        <b>Camera</b>
        <small>{runtime.plan.camera.length}</small>
      </button>
    ),
    content: ({ selectRowKey }) => (
      <TimelineTransportTimeAxisClip
        laneStyle="audio"
        className={cn(
          'xr-camera-motion-retime-time-axis-rail',
        )}
        aria-label="Camera choreography time rail"
        aria-current={cameraTimelineLaneSelected ? 'true' : undefined}
        data-kg-xr-choreography-shared-axis-rail="camera"
        data-kg-xr-timeline-lane-affordance="camera"
        data-kg-xr-timeline-lane-selected={cameraTimelineLaneSelected ? '1' : undefined}
      >
        <section
          className="xr-shot-target-timeline-lane"
              role="group"
              aria-label="Timeline lane controls"
          data-kg-xr-camera-lane="1"
          data-kg-xr-timeline-lane-selected={cameraTimelineLaneSelected ? '1' : undefined}
        >
          <button
            type="button"
            className={cn('timeline-transport-time-axis-bar xr-shot-target-timeline-bar', cameraTimelineLaneSelected && 'timeline-transport-track-clip--selected')}
            style={{ '--kg-xr-shot-target-color': '#64748b' } as React.CSSProperties}
            aria-label="Select Camera choreography lane. Drag to scrub XR timeline."
            aria-pressed={cameraTimelineLaneSelected}
            onClick={selectCameraTimelineLane}
            title="Camera marks · drag to scrub"
            data-kg-xr-camera-lane-bar="1"
            data-kg-xr-timeline-lane-drag="scrub"
              disabled={!documentLoaded}
              data-kg-video-sequence-ruler-scrub-target="1"
              data-kg-video-sequence-ruler-scrub-intent="drag"
              data-kg-video-sequence-ruler-scrub-row-key={selectRowKey}
            data-kg-xr-timeline-lane-hit-target="camera"
          >
            <span>Camera marks · {runtime.plan.camera.length}</span>
          </button>
          <CameraMotionMarkRetime
            layout="lane"
            laneTarget={{ kind: 'camera' }}
          />
        </section>
      </TimelineTransportTimeAxisClip>
    ),
  },
  {
    id: 'xr-simulation',
      ariaLabel: 'Simulation timeline lane',
    selectRowKey: 'xr-lane:simulation',
    insertAfterLaneId: 'scene',
    selected: simulationTimelineLaneSelected,
    label: (
      <button
        type="button"
        className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
        aria-label="Open XR Simulation workbench"
        aria-pressed={simulationTimelineLaneSelected}
        onClick={selectSimulationTimelineLane}
        data-kg-xr-simulation-lane-label="1"
        data-kg-xr-timeline-lane-hit-target="simulation-label"
      >
        <Activity role="img" aria-label="Simulation" />
        <b>Simulation</b>
        <small>{simulationBodyCount}</small>
      </button>
    ),
    content: ({ selectRowKey }) => (
      <TimelineTransportTimeAxisClip
        laneStyle="audio"
        className={cn(
          'xr-camera-motion-retime-time-axis-rail',
        )}
        aria-label="XR Simulation runtime lane"
        aria-current={simulationTimelineLaneSelected ? 'true' : undefined}
        data-kg-xr-simulation-lane="1"
        data-kg-xr-timeline-lane-affordance="simulation"
        data-kg-xr-timeline-lane-selected={simulationTimelineLaneSelected ? '1' : undefined}
      >
        <section
          className="xr-shot-target-timeline-lane"
              role="group"
              aria-label="Timeline lane controls"
          data-kg-xr-simulation-phase={simulationPhase}
          data-kg-xr-simulation-runtime={simulationRuntime}
          data-kg-xr-timeline-lane-selected={simulationTimelineLaneSelected ? '1' : undefined}
        >
          <button
            type="button"
            className={cn('timeline-transport-time-axis-bar xr-shot-target-timeline-bar', simulationTimelineLaneSelected && 'timeline-transport-track-clip--selected')}
            style={{ '--kg-xr-shot-target-color': '#22c55e' } as React.CSSProperties}
            aria-label={`Open XR Simulation workbench. ${simulationPhase}; ${simulationBodyCount} bodies. Drag to scrub XR timeline.`}
            aria-pressed={simulationTimelineLaneSelected}
            onClick={selectSimulationTimelineLane}
            title={`${simulationPhase} · ${simulationBodyCount} bodies · drag to scrub`}
            data-kg-xr-simulation-bar="full-scene"
            data-kg-xr-timeline-lane-drag="scrub"
              disabled={!documentLoaded}
              data-kg-video-sequence-ruler-scrub-target="1"
              data-kg-video-sequence-ruler-scrub-intent="drag"
              data-kg-video-sequence-ruler-scrub-row-key={selectRowKey}
            data-kg-xr-timeline-lane-hit-target="simulation"
          >
            <span>{simulationPhase} · {simulationBodyCount} bod{simulationBodyCount === 1 ? 'y' : 'ies'}</span>
          </button>
        </section>
      </TimelineTransportTimeAxisClip>
    ),
  },
  ...gameMission.npcs.map(npc => {
    const selected = selectedTimelineLaneId === `npc:${npc.id}`
    const npcColor = GAME_FPS_NPC_TIMELINE_COLORS[npc.action]
    return {
      id: `xr-gameplay-npc:${npc.id}`,
        ariaLabel: `${npc.id} character timeline lane`,
      selectRowKey: `xr-lane:npc:${npc.id}`,
      insertAfterLaneId: 'scene',
      selected,
      label: (
        <button
          type="button"
          className="xr-camera-motion-retime-lane-label xr-shot-target-lane-label"
          aria-label={`Select gameplay NPC ${npc.id}`}
          aria-pressed={selected}
          onClick={() => selectNpcTimelineLane(npc.id)}
          data-kg-xr-gameplay-npc-lane-label={npc.id}
          data-kg-xr-timeline-lane-hit-target={`npc-label:${npc.id}`}
        >
          <UserRound role="img" aria-label={`${npc.id} character`} style={{ color: npcColor }} />
          <b title={npc.id}>{npc.id}</b>
          <small>{Math.round(npc.health)}</small>
        </button>
      ),
      content: ({ selectRowKey }) => (
        <TimelineTransportTimeAxisClip
          laneStyle="video"
          className={cn(
            'xr-camera-motion-retime-time-axis-rail',
          )}
          aria-label={`${npc.id} gameplay NPC time rail`}
          aria-current={selected ? 'true' : undefined}
          data-kg-xr-gameplay-npc-shared-axis-rail={npc.id}
          data-kg-xr-timeline-lane-affordance={`npc:${npc.id}`}
          data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
        >
          <section
            className="xr-shot-target-timeline-lane"
              role="group"
              aria-label="Timeline lane controls"
            data-kg-xr-gameplay-npc-lane={npc.id}
            data-kg-xr-gameplay-npc-action={npc.action}
            data-kg-xr-gameplay-npc-selected={selected ? '1' : undefined}
            data-kg-xr-timeline-lane-selected={selected ? '1' : undefined}
          >
            <button
              type="button"
              className={cn('timeline-transport-time-axis-bar xr-shot-target-timeline-bar', selected && 'timeline-transport-track-clip--selected')}
              style={{ '--kg-xr-shot-target-color': npcColor } as React.CSSProperties}
              aria-label={`Select ${npc.id} for shared 3D for XR controls. Drag to scrub XR timeline.`}
              aria-pressed={selected}
              onClick={() => selectNpcTimelineLane(npc.id)}
              title={`${npc.id} · ${npc.action} · ${Math.round(npc.health)} HP · drag to scrub`}
              data-kg-xr-gameplay-npc-bar={npc.id}
              data-kg-xr-shared-asset-target={npc.id}
              data-kg-xr-timeline-lane-drag="scrub"
              disabled={!documentLoaded}
              data-kg-video-sequence-ruler-scrub-target="1"
              data-kg-video-sequence-ruler-scrub-intent="drag"
              data-kg-video-sequence-ruler-scrub-row-key={selectRowKey}
              data-kg-xr-timeline-lane-hit-target={`npc:${npc.id}`}
            >
              <span>{npc.id} · {npc.action} · {Math.round(npc.health)} HP</span>
            </button>
          </section>
        </TimelineTransportTimeAxisClip>
      ),
    }
  }),
]
}
