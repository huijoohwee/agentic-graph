import React from 'react'
import { TimelineTransportTimeAxisMark } from '@/components/timeline/TimelineTransportControls'
import { XR_MOTION_REFERENCE_SELECTION_COLOR } from './xrMotionReferenceModel'
import { jumpToXrTimelineCue } from './xrTimelineCueRuntime'
import type { XrRehearsalTimelineBeat } from './xrRehearsalTimelineBeats'

export function XrRehearsalTimelineBeatMarks({
  beats,
  activeMarkId,
  durationSeconds,
}: {
  beats: readonly XrRehearsalTimelineBeat[]
  activeMarkId?: string
  durationSeconds: number
}) {
  return (
    <section
      className="xr-camera-motion-retime-lane xr-camera-motion-retime-lane--scene"
      aria-label="Playable rehearsal beats"
      data-kg-xr-choreography-lane-axis="1"
      data-kg-xr-rehearsal-beats="1"
    >
      {beats.map((beat, index) => {
        const active = activeMarkId === beat.markId
        const percent = durationSeconds > 0 ? Math.min(100, Math.max(0, beat.timeSeconds / durationSeconds * 100)) : 0
        return (
          <TimelineTransportTimeAxisMark
            key={beat.markId}
            laneStyle="video"
            className="xr-camera-motion-retime-lane-mark"
            style={{ '--kg-xr-retime-mark-left': `${percent}%` } as React.CSSProperties}
            title={`${beat.label} · ${beat.timeSeconds}s · click to seek`}
            aria-label={`${beat.label} at ${beat.timeSeconds} seconds`}
            aria-pressed={active}
            role="button"
            tabIndex={0}
            onClick={event => {
              event.stopPropagation()
              jumpToXrTimelineCue({
                kind: 'camera',
                targetId: beat.anchorId,
                markId: beat.markId,
                timeSeconds: beat.timeSeconds,
              })
            }}
            data-kg-xr-lane-scene-beat={index + 1}
            data-kg-xr-lane-mark-shape="circle-only"
          >
            <span style={{ backgroundColor: active ? XR_MOTION_REFERENCE_SELECTION_COLOR : '#64748b' }}>{index + 1}</span>
          </TimelineTransportTimeAxisMark>
        )
      })}
    </section>
  )
}
