import React from 'react'
import { VIDEO_SEQUENCE_LANE_HEIGHT_PX, VIDEO_SEQUENCE_TIMELINE_LANES, type VideoSequenceTimelineDisplayLane } from './videoSequenceTimeline'

export type VideoSequenceTimelineInsertedLaneRenderArgs = {
  selected: boolean
  selectRowKey: string
  selectRow: () => void
}
export type VideoSequenceTimelineInsertedLane = {
  content: React.ReactNode | ((args: VideoSequenceTimelineInsertedLaneRenderArgs) => React.ReactNode)
  id: string
  insertAfterLaneId: string
  dragLaneId?: string
  label: React.ReactNode
  selectRowKey?: string
  selected?: boolean
}
type TimelineLane = VideoSequenceTimelineDisplayLane | VideoSequenceTimelineInsertedLane
type LaneProps = { lanes: readonly TimelineLane[]; selectedDisplayLaneId?: string; selectedRowKey: string }
function laneSelected(lane: TimelineLane, selectedDisplayLaneId?: string, selectedRowKey?: string): boolean {
  return 'content' in lane
    ? lane.selected ?? (!!lane.selectRowKey && lane.selectRowKey === selectedRowKey)
    : lane.id === selectedDisplayLaneId
}
export function buildVideoSequenceLaneSidebarStyle(lanes: readonly { id: string }[] = VIDEO_SEQUENCE_TIMELINE_LANES): React.CSSProperties {
  return { gridTemplateRows: `repeat(${lanes.length}, ${VIDEO_SEQUENCE_LANE_HEIGHT_PX}px)` }
}

export function VideoSequenceTimelineLaneLabels({ lanes, selectedDisplayLaneId, scrollRef, rowKeyToDisplayLaneId, selectedRowKey, onSelectRowKey }: LaneProps & {
  scrollRef: React.RefObject<HTMLElement | null>
  rowKeyToDisplayLaneId: ReadonlyMap<string, string>
  selectedRowKey: string
  onSelectRowKey: (rowKey: string) => void
}) {
  return <section ref={scrollRef} className="timeline-video-sequence-lane-sidebar-scroll" style={buildVideoSequenceLaneSidebarStyle(lanes)}>
    {lanes.map(lane => {
      const inserted = 'content' in lane
      const insertedSelected = laneSelected(lane, selectedDisplayLaneId, selectedRowKey)
      const selectRowKey = inserted ? lane.selectRowKey
        : rowKeyToDisplayLaneId.get(selectedRowKey) === lane.id
          ? selectedRowKey : [...rowKeyToDisplayLaneId].find(([, laneId]) => laneId === lane.id)?.[0]
      const nativeLabel = typeof lane.label === 'string' || typeof lane.label === 'number'
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
      >{nativeLabel && selectRowKey ? <button type="button" className="timeline-video-sequence-lane-select"
        aria-label={`Select ${lane.label} timeline lane`} aria-pressed={insertedSelected}
        onClick={() => onSelectRowKey(selectRowKey)}>{lane.label}</button> : lane.label}</section>
    })}
  </section>
}

export function VideoSequenceTimelineLaneRows({ lanes, selectedDisplayLaneId, selectedRowKey, onSelectRowKey }: LaneProps & {
  onSelectRowKey: (rowKey: string) => void
}) {
  return <>{lanes.map((lane, laneIndex) => {
    const inserted = 'content' in lane
    const insertedSelected = laneSelected(lane, selectedDisplayLaneId, selectedRowKey)
    const laneSelectRowKey = inserted ? lane.selectRowKey || '' : ''
    const laneContent = inserted
      ? typeof lane.content === 'function'
        ? lane.content({ selected: insertedSelected, selectRowKey: laneSelectRowKey,
          selectRow: () => { if (laneSelectRowKey) onSelectRowKey(laneSelectRowKey) } })
        : lane.content
      : null
    return <section key={lane.id}
      className={`timeline-video-sequence-lane-row ${inserted ? 'timeline-video-sequence-inserted-lane' : ''} ${insertedSelected ? 'timeline-video-sequence-lane-row--selected' : ''}`}
      aria-label={`${typeof lane.label === 'string' ? lane.label : lane.id} timeline lane`}
      aria-current={insertedSelected ? 'true' : undefined}
      style={{ top: `${laneIndex * VIDEO_SEQUENCE_LANE_HEIGHT_PX}px` }}
      data-kg-video-sequence-display-lane-row={lane.id}
      data-kg-video-sequence-drag-lane-id={inserted ? lane.dragLaneId || lane.id : lane.id}
      data-kg-video-sequence-lane-selected={insertedSelected ? '1' : undefined}
      data-kg-video-sequence-inserted-lane-content={inserted ? lane.id : undefined}
      data-kg-video-sequence-inserted-lane-selected={inserted && insertedSelected ? '1' : undefined}
      data-kg-video-sequence-inserted-lane-row-selection={inserted && insertedSelected ? lane.id : undefined}
    >{laneContent}</section>
  })}</>
}
