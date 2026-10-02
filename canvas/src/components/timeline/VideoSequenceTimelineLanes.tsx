import React from 'react'
import { VIDEO_SEQUENCE_LANE_HEIGHT_PX, VIDEO_SEQUENCE_TIMELINE_LANES, type VideoSequenceTimelineDisplayLane } from './videoSequenceTimeline'

export type VideoSequenceTimelineInsertedLaneRenderArgs = {
  selected: boolean
  selectRowKey: string
}
export type VideoSequenceTimelineInsertedLane = {
  content: React.ReactNode | ((args: VideoSequenceTimelineInsertedLaneRenderArgs) => React.ReactNode)
  id: string
  insertAfterLaneId: string
  label: React.ReactNode
  selectRowKey?: string
  selected?: boolean
}
type TimelineLane = VideoSequenceTimelineDisplayLane | VideoSequenceTimelineInsertedLane
type LaneProps = { lanes: readonly TimelineLane[]; selectedDisplayLaneId?: string }
function laneSelected(lane: TimelineLane, selectedDisplayLaneId?: string): boolean {
  return 'content' in lane ? lane.selected === true : lane.id === selectedDisplayLaneId
}
export function buildVideoSequenceLaneSidebarStyle(lanes: readonly { id: string }[] = VIDEO_SEQUENCE_TIMELINE_LANES): React.CSSProperties {
  return { gridTemplateRows: `repeat(${lanes.length}, ${VIDEO_SEQUENCE_LANE_HEIGHT_PX}px)` }
}

export function VideoSequenceTimelineLaneLabels({ lanes, selectedDisplayLaneId, scrollRef }: LaneProps & {
  scrollRef: React.RefObject<HTMLElement | null>
}) {
  return <section ref={scrollRef} className="timeline-video-sequence-lane-sidebar-scroll" style={buildVideoSequenceLaneSidebarStyle(lanes)}>
    {lanes.map(lane => {
      const inserted = 'content' in lane
      const insertedSelected = laneSelected(lane, selectedDisplayLaneId)
      return <section key={lane.id}
        className={`timeline-video-sequence-lane-label ${insertedSelected ? 'timeline-video-sequence-lane-label--selected' : ''}`}
        aria-current={insertedSelected ? 'true' : undefined}
        data-kg-video-sequence-display-lane-label={lane.id}
        data-kg-video-sequence-lane-selected={insertedSelected ? '1' : undefined}
        data-kg-video-sequence-inserted-lane={inserted ? lane.id : undefined}
        data-kg-video-sequence-inserted-lane-selected={inserted && insertedSelected ? '1' : undefined}
        data-kg-video-sequence-inserted-lane-row-selection={inserted && insertedSelected ? lane.id : undefined}
        data-kg-video-sequence-lane-append={'append' in lane && lane.append ? '1' : undefined}
        data-kg-video-sequence-lane-label={'semanticId' in lane ? lane.semanticId : 'inserted'}
      >{lane.label}</section>
    })}
  </section>
}

export function VideoSequenceTimelineLaneRows({ lanes, selectedDisplayLaneId }: LaneProps) {
  return <>{lanes.map((lane, laneIndex) => {
    const inserted = 'content' in lane
    const insertedSelected = laneSelected(lane, selectedDisplayLaneId)
    const laneSelectRowKey = inserted ? lane.selectRowKey || '' : ''
    const laneContent = inserted
      ? typeof lane.content === 'function'
        ? lane.content({ selected: insertedSelected, selectRowKey: laneSelectRowKey })
        : lane.content
      : null
    return <section key={lane.id}
      className={`timeline-video-sequence-lane-row ${inserted ? 'timeline-video-sequence-inserted-lane' : ''} ${insertedSelected ? 'timeline-video-sequence-lane-row--selected' : ''}`}
      aria-label={`${typeof lane.label === 'string' ? lane.label : lane.id} timeline lane`}
      aria-current={insertedSelected ? 'true' : undefined}
      style={{ top: `${laneIndex * VIDEO_SEQUENCE_LANE_HEIGHT_PX}px` }}
      data-kg-video-sequence-display-lane-row={lane.id}
      data-kg-video-sequence-lane-selected={insertedSelected ? '1' : undefined}
      data-kg-video-sequence-inserted-lane-content={inserted ? lane.id : undefined}
      data-kg-video-sequence-inserted-lane-selected={inserted && insertedSelected ? '1' : undefined}
      data-kg-video-sequence-inserted-lane-row-selection={inserted && insertedSelected ? lane.id : undefined}
    >{laneContent}</section>
  })}</>
}
