import React from 'react'
import { useTimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'
import { buildTimelineAnimationState } from '@/components/timeline/timelineAnimationEngine'
import { resolveTimelinePlanSourceUrl } from '@/components/timeline/timelinePlanSync'
import { readVideoSequenceTimelineModelFromMarkdown } from '@/components/timeline/videoSequenceTimeline'
import { MarkdownTocExpandGlyph } from '@/features/markdown/ui/MarkdownTocChrome'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  MermaidDiagramPanelView,
  type MermaidDiagramPanelRowFilter,
  type MermaidDiagramPanelRowTreeResolver,
} from './MermaidDiagramPanelView'
import { useStoryboardWidgetDiagramSelectionBridge } from './useStoryboardWidgetDiagramSelectionBridge'
import { useGanttFloatingPanelSelectionTransportSync } from './useGanttFloatingPanelSelectionTransportSync'
import { useMermaidGanttDocument } from './useMermaidGanttDocument'
import { useMermaidTimelineDocument } from './useMermaidTimelineDocument'
import { PanelCheckbox } from '@/lib/ui/panelFormControls'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

const VIDEO_SEQUENCE_FLOATING_PANEL_LANES = ['Video', 'Mask', 'Grade', 'Audio'] as const
type VideoSequenceFloatingPanelLane = (typeof VIDEO_SEQUENCE_FLOATING_PANEL_LANES)[number]
type VideoSequenceFloatingPanelLaneVisibility = Record<VideoSequenceFloatingPanelLane, boolean>

const createDefaultLaneVisibility = (): VideoSequenceFloatingPanelLaneVisibility => ({
  Audio: true,
  Grade: false,
  Mask: false,
  Video: true,
})

const normalizeVideoSequenceFloatingPanelLane = (value: unknown): VideoSequenceFloatingPanelLane | '' => {
  const normalized = String(value || '').trim().toLowerCase()
  return VIDEO_SEQUENCE_FLOATING_PANEL_LANES.find(lane => lane.toLowerCase() === normalized) || ''
}

function buildVideoSequenceFloatingPanelSectionRowFilter(args: {
  expanded: boolean
  laneVisibility: VideoSequenceFloatingPanelLaneVisibility
  rows: readonly { kind: string; label: string; lineIndex: number }[]
}): MermaidDiagramPanelRowFilter {
  const laneByLineIndex = new Map<number, VideoSequenceFloatingPanelLane | ''>()
  let currentLane: VideoSequenceFloatingPanelLane | '' = ''
  for (const row of args.rows) {
    if (row.kind === 'section') currentLane = normalizeVideoSequenceFloatingPanelLane(row.label)
    laneByLineIndex.set(row.lineIndex, currentLane)
  }
  return row => {
    if (row.kind === 'section') {
      return true
    }
    if (row.kind !== 'task') return true
    const lane = laneByLineIndex.get(row.lineIndex) || ''
    return args.expanded && (!lane || args.laneVisibility[lane])
  }
}

function buildVideoSequenceFloatingPanelRowTree({
  expanded,
  laneVisibility,
  onLaneVisibilityChange,
  onToggleExpanded,
}: {
  expanded: boolean
  laneVisibility: VideoSequenceFloatingPanelLaneVisibility
  onLaneVisibilityChange: (lane: VideoSequenceFloatingPanelLane, visible: boolean) => void
  onToggleExpanded: () => void
}): MermaidDiagramPanelRowTreeResolver {
  return ({ row }) => {
    if (row.kind === 'task') return { depth: 2 }
    if (row.kind !== 'section') return { depth: 1 }

    const lane = normalizeVideoSequenceFloatingPanelLane(row.label)
    const laneVisible = lane ? laneVisibility[lane] : true
    const sectionExpanded = expanded && laneVisible
    return {
      depth: 1,
      expanded: sectionExpanded,
      hasChildren: true,
      leadingControl: (
        <section
          className="flex shrink-0 items-center gap-1"
          aria-label={`${row.label} row tree controls`}
          data-kg-video-sequence-floating-panel-tree-controls="1"
        >
          <button
            type="button"
            className={cn('rounded p-0.5 transition-colors', UI_THEME_TOKENS.button.hoverBg, UI_THEME_TOKENS.text.tertiary)}
            aria-label={sectionExpanded ? `Collapse ${row.label} rows` : `Expand ${row.label} rows`}
            aria-expanded={sectionExpanded}
            title={sectionExpanded ? `Collapse ${row.label} rows` : `Expand ${row.label} rows`}
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              onToggleExpanded()
            }}
            data-kg-video-sequence-floating-panel-disclosure={sectionExpanded ? 'expanded' : 'collapsed'}
          >
            <MarkdownTocExpandGlyph isExpanded={sectionExpanded} className="h-3.5 w-3.5" />
          </button>
          {lane ? (
            <label
              className={cn('inline-flex items-center', UI_THEME_TOKENS.text.secondary)}
              data-kg-video-sequence-floating-panel-lane-control={lane.toLowerCase()}
              onClick={event => event.stopPropagation()}
            >
              <PanelCheckbox
                checked={laneVisible}
                aria-label={`Show ${lane} rows`}
                onChange={event => onLaneVisibilityChange(lane, event.currentTarget.checked)}
                data-kg-video-sequence-floating-panel-lane-checkbox={lane.toLowerCase()}
              />
            </label>
          ) : null}
        </section>
      ),
    }
  }
}

export function TimelineFloatingPanelView() {
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const videoSequenceTimelineLaneVisibility = useGraphStore(state => state.videoSequenceTimelineLaneVisibility)
  const setVideoSequenceTimelineLaneVisibility = useGraphStore(state => state.setVideoSequenceTimelineLaneVisibility)
  const { code: timelineCode, graphData, themeMode, timelineModel } = useMermaidTimelineDocument()
  const { code: ganttCode, ganttModel, graphData: ganttGraphData, themeMode: ganttThemeMode } = useMermaidGanttDocument({ purpose: 'media' })
  const videoSequenceModel = React.useMemo(() => readVideoSequenceTimelineModelFromMarkdown(markdownDocumentText), [markdownDocumentText])
  const [floatingRowsExpanded, setFloatingRowsExpanded] = React.useState(true)
  const laneVisibility = React.useMemo<VideoSequenceFloatingPanelLaneVisibility>(() => {
    const defaults = createDefaultLaneVisibility()
    return VIDEO_SEQUENCE_FLOATING_PANEL_LANES.reduce<VideoSequenceFloatingPanelLaneVisibility>((next, lane) => {
      const laneId = lane.toLowerCase()
      next[lane] = videoSequenceTimelineLaneVisibility?.[laneId] ?? defaults[lane]
      return next
    }, { ...defaults })
  }, [videoSequenceTimelineLaneVisibility])
  const handleLaneVisibilityChange = React.useCallback((lane: VideoSequenceFloatingPanelLane, visible: boolean) => {
    setVideoSequenceTimelineLaneVisibility(lane.toLowerCase(), visible)
  }, [setVideoSequenceTimelineLaneVisibility])
  const toggleFloatingRowsExpanded = React.useCallback(() => {
    setFloatingRowsExpanded(current => !current)
  }, [])
  const mediaMetadataSourceUrl = React.useMemo(() => {
    const source = videoSequenceModel?.sources.find(candidate => resolveTimelinePlanSourceUrl(candidate))
    return source ? resolveTimelinePlanSourceUrl(source) : ''
  }, [videoSequenceModel])
  const videoSequenceFloatingRowFilter = React.useMemo(() => (
    buildVideoSequenceFloatingPanelSectionRowFilter({
      expanded: floatingRowsExpanded,
      laneVisibility,
      rows: ganttModel.rows,
    })
  ), [floatingRowsExpanded, ganttModel.rows, laneVisibility])
  const videoSequenceFloatingRowTree = React.useMemo(() => (
    videoSequenceModel?.enabled
      ? buildVideoSequenceFloatingPanelRowTree({
        expanded: floatingRowsExpanded,
        laneVisibility,
        onLaneVisibilityChange: handleLaneVisibilityChange,
        onToggleExpanded: toggleFloatingRowsExpanded,
      })
      : undefined
  ), [floatingRowsExpanded, handleLaneVisibilityChange, laneVisibility, toggleFloatingRowsExpanded, videoSequenceModel?.enabled])
  const mediaReaderSummary = useTimelineMediaReaderSummary({
    active: !!mediaMetadataSourceUrl,
    url: mediaMetadataSourceUrl,
  })
  const metadataAttrs = {
    'data-kg-timeline-floating-panel-media-metadata': mediaMetadataSourceUrl ? mediaReaderSummary.status : undefined,
    'data-kg-timeline-floating-panel-media-metadata-byte-size': mediaReaderSummary.byteSize > 0 ? mediaReaderSummary.byteSize : undefined,
    'data-kg-timeline-floating-panel-media-metadata-bytes-read': mediaReaderSummary.bytesRead > 0 ? mediaReaderSummary.bytesRead : undefined,
    'data-kg-timeline-floating-panel-media-metadata-duration': mediaReaderSummary.durationSeconds > 0 ? mediaReaderSummary.durationSeconds : undefined,
    'data-kg-timeline-floating-panel-media-metadata-format': mediaReaderSummary.formatName || undefined,
    'data-kg-timeline-floating-panel-media-metadata-mime-type': mediaReaderSummary.mimeType || undefined,
    'data-kg-timeline-floating-panel-media-metadata-resolution': mediaReaderSummary.displayWidth > 0 && mediaReaderSummary.displayHeight > 0 ? `${mediaReaderSummary.displayWidth}x${mediaReaderSummary.displayHeight}` : undefined,
    'data-kg-timeline-floating-panel-media-metadata-video-codec': mediaReaderSummary.primaryVideoCodec || undefined,
  } as React.HTMLAttributes<HTMLElement>
  const animationState = React.useMemo(() => buildTimelineAnimationState({
    active: !!timelineCode || !!ganttCode,
    itemCount: timelineModel.rows.length || ganttModel.rows.length,
    progress: mediaReaderSummary.metadataReadRatio || 0,
    surface: 'floating-timeline',
  }), [ganttCode, ganttModel.rows.length, mediaReaderSummary.metadataReadRatio, timelineCode, timelineModel.rows.length])
  const { style: animationStyle, ...animationAttributes } = animationState.attributes
  const { handleDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({
    graphData,
    diagramModel: timelineModel,
    kind: 'timeline',
  })
  const { handleDiagramSelectedRowKeyChange: handleGanttDiagramSelectedRowKeyChange } = useStoryboardWidgetDiagramSelectionBridge({
    graphData: ganttGraphData,
    diagramModel: ganttModel,
    kind: 'gantt',
  })
  const handleGanttSelectedRowKeyChange = useGanttFloatingPanelSelectionTransportSync({
    code: ganttCode,
    onSelectedRowKeyChange: handleGanttDiagramSelectedRowKeyChange,
  })
  if (!timelineCode && ganttCode) {
    return (
      <section className="h-full min-h-0" data-kg-timeline-floating-panel="1" {...metadataAttrs} {...animationAttributes} style={animationStyle}>
        <MermaidDiagramPanelView
          code={ganttCode}
          model={ganttModel}
          kind="gantt"
          title="Gantt-Timeline"
          emptyLabel="No Gantt-Timeline Mermaid frontmatter."
          rootThemeMode={ganttThemeMode}
          surface="floatingPanel"
          renderMode="list"
          rowFilter={videoSequenceModel?.enabled ? videoSequenceFloatingRowFilter : undefined}
          rowTree={videoSequenceFloatingRowTree}
          onSelectedRowKeyChange={handleGanttSelectedRowKeyChange}
        />
      </section>
    )
  }
  return (
    <section className="h-full min-h-0" data-kg-timeline-floating-panel="1" {...metadataAttrs} {...animationAttributes} style={animationStyle}>
      <MermaidDiagramPanelView
        code={timelineCode}
        model={timelineModel}
        kind="timeline"
        title="Timeline"
        emptyLabel="No Timeline Mermaid frontmatter."
        rootThemeMode={themeMode}
        surface="floatingPanel"
        renderMode="list"
        onSelectedRowKeyChange={handleDiagramSelectedRowKeyChange}
      />
    </section>
  )
}
