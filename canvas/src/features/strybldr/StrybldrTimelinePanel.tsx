import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import {
  buildStoryboardTimelineItems,
  formatStoryboardTimelinePositionLabel,
  resolveStoryboardTimelineIndex,
} from '@/components/StoryboardCanvas/storyboardTimeline'
import { VideoSequenceTimelineRuler } from '@/components/timeline/VideoSequenceTimelineRuler'
import { useGanttTimelineInteractions } from '@/features/gitgraph/useGanttTimelineInteractions'
import { resolveVideoSequenceTimelineScaleMaxMinutes } from '@/components/timeline/videoSequenceTimelineZoom'
import { TimelineTransportChrome } from '@/components/timeline/TimelineTransportControls'
import {
  TIMELINE_TRANSPORT_PLAYBACK_RATES,
  clampTimelineTransportValue,
  resolveTimelineTransportPlayheadPercent,
  splitTimelineTransportCurrentTotalLabel,
  type TimelineTransportPlaybackRate,
  useTimelineTransportPlayback,
} from '@/components/timeline/timelineTransport'

const STRYBLDR_TIMELINE_UNIT_MS = 1000

export function StrybldrTimelinePanel({ active = true }: { active?: boolean }) {
  const graphData = useActiveGraphRenderData(active)
  const { graphRevision, selectedNodeId, selectNode } = useGraphStore(
    useShallow(s => ({
      graphRevision: s.graphDataRevision || 0,
      selectedNodeId: String(s.selectedNodeId || '').trim(),
      selectNode: s.selectNode,
    })),
  )
  const board = React.useMemo(() => buildStoryboardBoardModel({ graphData, graphRevision }), [graphData, graphRevision])
  const timelineItems = React.useMemo(() => buildStoryboardTimelineItems(board), [board])
  const [position, setPosition] = React.useState(0)
  const [playing, setPlaying] = React.useState(false)
  const [playbackRate, setPlaybackRate] = React.useState<TimelineTransportPlaybackRate>(1)
  const maxPosition = Math.max(0, timelineItems.length - 1)
  const activeIndex = resolveStoryboardTimelineIndex(position, timelineItems.length)
  const activeItem = activeIndex >= 0 ? timelineItems[activeIndex] || null : null
  const hasSelectedTimelineItem = React.useMemo(() => {
    if (!selectedNodeId) return false
    return timelineItems.some(item => item.id === selectedNodeId)
  }, [selectedNodeId, timelineItems])
  const positionLabel = formatStoryboardTimelinePositionLabel(activeIndex, timelineItems.length)
  const { currentLabel, totalLabel } = React.useMemo(
    () => splitTimelineTransportCurrentTotalLabel(positionLabel),
    [positionLabel],
  )
  const playheadPercent = resolveTimelineTransportPlayheadPercent(position, Math.max(1, maxPosition))

  React.useEffect(() => {
    setPosition(current => clampTimelineTransportValue(current, 0, maxPosition))
    if (timelineItems.length <= 1) setPlaying(false)
  }, [board.semanticKey, maxPosition, timelineItems.length])

  React.useEffect(() => {
    if (!selectedNodeId) return
    const selectedIndex = timelineItems.findIndex(item => item.id === selectedNodeId)
    if (selectedIndex < 0) return
    setPosition(current => (Math.abs(current - selectedIndex) < 0.001 ? current : selectedIndex))
  }, [selectedNodeId, timelineItems])

  React.useEffect(() => {
    if (selectedNodeId && !hasSelectedTimelineItem) return
    if (!activeItem || selectedNodeId === activeItem.id) return
    selectNode(activeItem.id)
  }, [activeItem, hasSelectedTimelineItem, selectNode, selectedNodeId])

  useTimelineTransportPlayback({
    active,
    playing,
    position,
    max: maxPosition,
    playbackRate,
    unitsPerMs: 1 / STRYBLDR_TIMELINE_UNIT_MS,
    onPositionChange: setPosition,
    onPlaybackEnd: () => setPlaying(false),
  })

  const handleTogglePlayback = React.useCallback(() => {
    if (timelineItems.length <= 1) return
    if (position >= maxPosition) setPosition(0)
    setPlaying(current => !current)
  }, [maxPosition, position, timelineItems.length])

  const handleTimelineValueChange = React.useCallback(
    (nextValue: number) => {
      const nextPosition = clampTimelineTransportValue(Math.round(nextValue), 0, maxPosition)
      setPlaying(false)
      setPosition(nextPosition)
      const nextItem = timelineItems[resolveStoryboardTimelineIndex(nextPosition, timelineItems.length)] || null
      if (nextItem) selectNode(nextItem.id)
    },
    [maxPosition, selectNode, timelineItems],
  )

  const contentRef = React.useRef<HTMLElement>(null)
  const viewportRef = React.useRef<HTMLElement>(null)
  const maxMinutes = Math.max(1, timelineItems.length) / 60
  const spans = React.useMemo(() => timelineItems.map((item, index) => ({
    rowKey: item.id, label: item.title, raw: item.title, lineIndex: index,
    startMinutes: index / 60, durationMinutes: 1 / 60, endMinutes: (index + 1) / 60,
  })), [timelineItems])
  const scaleMinutes = resolveVideoSequenceTimelineScaleMaxMinutes({ maxMinutes, mediaDurationSeconds: timelineItems.length })
  const interactions = useGanttTimelineInteractions({
    autoSnappingEnabled: false, markdownDocumentName: '', markdownText: '',
    maxMinutes, scrubMaxMinutes: scaleMinutes, positionMinutes: position / 60,
    resolveRowKeyAtPosition: () => '', selectedRowKey: selectedNodeId, selectionFollowsPlayhead: false,
    setSelectedRowKey: key => { if (key) selectNode(key) }, spans, onCommitDrag: () => {},
    setTransportPlaying: setPlaying, setTransportPlaybackPosition: minutes => handleTimelineValueChange(minutes * 60),
  })

  return (
    <TimelineTransportChrome
      ariaLabel="Storyboard timeline"
      chromeClassName="timeline-transport-chrome--mermaid-gantt"
      showRange={false}
      showInlineProgress
      rulerClassName="timeline-transport-ruler--video-sequence"
      ruler={<VideoSequenceTimelineRuler contentRef={contentRef} viewportRef={viewportRef}
        displayTicks={[]} dragPreview={null} draggingMode={null} draggingRowKey="" editable={false}
        maxMinutes={maxMinutes} mediaDurationSeconds={timelineItems.length}
        playheadPercent={timelineItems.length ? position / timelineItems.length * 100 : 0}
        projectionMode="workflow" selectedRowKey={selectedNodeId} taskSpans={spans} timelineZoom={1}
        timeAxisControls={<span>Seconds</span>} onRulerPointerDown={interactions.handleRulerPointerScrub}
        onSelectRowKey={key => { if (key) selectNode(key) }}
        onSelectRowPosition={(_key, minutes) => handleTimelineValueChange(minutes * 60)}
        onDropMedia={() => false} onTrackPointerStart={() => {}} />}
      currentLabel={currentLabel}
      disabled={timelineItems.length <= 1}
      max={maxPosition}
      playbackRate={playbackRate}
      playbackRates={TIMELINE_TRANSPORT_PLAYBACK_RATES}
      playing={playing}
      rootProps={{
        'aria-label': 'Storyboard timeline',
        'data-kg-strybldr-timeline-panel': '1',
        'data-kg-timeline-transport-playhead-percent': String(Math.round(playheadPercent)),
      } as React.HTMLAttributes<HTMLElement>}
      step={1}
      totalLabel={totalLabel}
      value={position}
      onPlaybackRateChange={setPlaybackRate}
      onTogglePlayback={handleTogglePlayback}
      onValueChange={handleTimelineValueChange}
    />
  )
}
