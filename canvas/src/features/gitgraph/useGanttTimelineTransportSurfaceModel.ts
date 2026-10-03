import React from 'react'
import { useTimelineMediaReaderSummaries, useTimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'
import { resolveTimelinePlanSourceUrl } from '@/components/timeline/timelinePlanSync'
import type { VideoSequenceTimelineClipOverlayRenderer, VideoSequenceTimelineInsertedLane, VideoSequenceTimelineSourceThumbnailSet, VideoSequenceTimelineThumbnailWindow } from '@/components/timeline/VideoSequenceTimelineRuler'
import { VideoSequenceSourceAnnotationLayer } from '@/components/timeline/VideoSequenceFrameSampleRail'
import { readVideoSequenceSourceAnnotations, resolveVideoSequenceSourceAnnotations, resolveVideoSequenceAnnotationTimelinePosition } from '@/components/timeline/videoSequenceSourceAnnotations'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { observeRichMediaTimelineTargetScope, requestRichMediaTimelineTargetFrame } from '@/lib/render/richMediaTimelineSync'
import { useGanttTimelineTransportChromeModel } from './useGanttTimelineTransportChromeModel'
import { useGanttTimelineTransportCommandModel } from './useGanttTimelineTransportCommandModel'
import { useGanttTimelineTransportInteractionModel } from './useGanttTimelineTransportInteractionModel'
import { useGanttTimelineTransportPlaybackModel } from './useGanttTimelineTransportPlaybackModel'
import {
  useGanttTimelineTransportRulerModel,
  type GanttTimelineTransportRulerModel,
} from './useGanttTimelineTransportRulerModel'
import { useGanttTimelineTransportSession } from './useGanttTimelineTransportSession'
import {
  useGanttTimelineTransportShellModel,
  type GanttTimelineTransportShellModel,
} from './useGanttTimelineTransportShellModel'
import type { GanttTimelineTransportChromeModel } from './useGanttTimelineTransportChromeModel'
import { useGanttTimelineDisplayModel } from './useGanttTimelineDisplayModel'
import {
  VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  isCompactSourceMediaSpan,
  readVideoSequenceTimelineModelFromMarkdown,
  resolveVideoSequenceTimelineLane,
  resolveVisibleVideoSequenceTimelineLaneCount, resolveVideoSequenceTimelineDisplayLaneId,
  type VideoSequenceTimelineSource,
} from '@/components/timeline/videoSequenceTimeline'
import { resolveVideoSequenceTimelineScaleMaxMinutes } from '@/components/timeline/videoSequenceTimelineZoom'
import { useGraphStore } from '@/hooks/useGraphStore'
import { type GanttTimelineTransportAudioPlaybackBridgeModel } from './GanttTimelineTransportAudioPlaybackBridge'
import { readTimelineTransportMediaPreviewKind, type GanttTimelineTransportMediaPlayerModel } from './GanttTimelineTransportMediaPlayer'
import type { GanttTimelineTransportMode } from './ganttTimelineTransportMode'
import type { GanttTimelineTransportCommandAdapter } from './ganttTimelineTransportCommandAdapter'

export type GanttTimelineTransportSurfaceModel = {
  audioPlaybackBridgeModel: GanttTimelineTransportAudioPlaybackBridgeModel
  chromeModel: GanttTimelineTransportChromeModel
  mediaPlayerModel: GanttTimelineTransportMediaPlayerModel
  rulerModel: GanttTimelineTransportRulerModel
  shellModel: GanttTimelineTransportShellModel
  renderAnnotationOverlay?: VideoSequenceTimelineClipOverlayRenderer
  annotationLanes?: readonly VideoSequenceTimelineInsertedLane[]
}

type TimelineTransportThumbnailSourceItem = {
  kind: 'image' | 'video'
  label: string
  source: VideoSequenceTimelineSource
  src: string
}

const clean = (value: unknown): string => String(value || '').trim()

// Ownership and seeks outlive panel mounts; closing Inspector alone retains queued READY replay.
const stopObservingTargetScope = useGraphStore.subscribe(
  state => [clean(state.markdownDocumentName), state.timelineTransportPlaying, state.timelineTransportPosition] as const,
  ([documentKey, playing, position]) => observeRichMediaTimelineTargetScope({ documentKey, playing, position }),
  { fireImmediately: true, equalityFn: (a, b) => a.every((value, index) => value === b[index]) },
)
import.meta.hot?.dispose(stopObservingTargetScope)

const readTimelineTransportSourceLabel = (source: VideoSequenceTimelineSource): string => (
  clean(source.originalName)
  || clean(source.relativePath).split('/').filter(Boolean).pop()
  || clean(source.sourceUrl)
  || 'Media source'
)

const readTimelineTransportThumbnailSourceKind = (source: VideoSequenceTimelineSource): TimelineTransportThumbnailSourceItem['kind'] => {
  const signature = [
    source.mimeHint,
    source.originalName,
    source.relativePath,
    source.sourceUrl,
  ].join(' ').toLowerCase()
  return /\bimage\b|\.avif\b|\.gif\b|\.jpe?g\b|\.png\b|\.svg\b|\.webp\b/.test(signature) ? 'image' : 'video'
}

const collectTimelineTransportThumbnailSourceItems = (plans: readonly (ReturnType<typeof useGanttTimelineTransportSession>['exportPlan'])[]): TimelineTransportThumbnailSourceItem[] => {
  const itemBySrc = new Map<string, TimelineTransportThumbnailSourceItem>()
  for (const plan of plans) {
    for (const segment of plan?.segments || []) {
      const src = resolveTimelinePlanSourceUrl(segment.source)
      if (!src || itemBySrc.has(src)) continue
      const kind = readTimelineTransportThumbnailSourceKind(segment.source)
      if (kind !== 'image' && kind !== 'video') continue
      itemBySrc.set(src, {
        kind,
        label: readTimelineTransportSourceLabel(segment.source),
        source: segment.source,
        src,
      })
    }
  }
  return Array.from(itemBySrc.values())
}

export function useGanttTimelineTransportSurfaceModel(args: {
  code: string
  clockActive?: boolean
  compact: boolean
  commandAdapter?: GanttTimelineTransportCommandAdapter
  editable?: boolean
  mode: GanttTimelineTransportMode
  publishPlaybackRequest?: boolean
  runtimeDocumentKey?: string
  runtimeDurationSeconds?: number
  runtimeFrameRate?: number
  timelineInsertedLanes?: readonly VideoSequenceTimelineInsertedLane[]
  onSelectedRowKeyChange?: (rowKey: string | null) => void
}): GanttTimelineTransportSurfaceModel {
  const rulerContentRef = React.useRef<HTMLElement | null>(null)
  const rulerViewportRef = React.useRef<HTMLElement | null>(null)
  const [mediaPlayerVisible, setMediaPlayerVisible] = React.useState(false)
  const workflowMode = args.mode === 'workflow'
  const videoSequenceTimelineLaneVisibility = useGraphStore(state => state.videoSequenceTimelineLaneVisibility)
  const disabledLaneIds = React.useMemo(() => (
    workflowMode
      ? []
      : VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS.filter(laneId => videoSequenceTimelineLaneVisibility?.[laneId] !== true)
  ), [videoSequenceTimelineLaneVisibility, workflowMode])
  const transportSession = useGanttTimelineTransportSession({
    code: args.code,
    disabledLaneIds,
    mode: args.mode,
    runtimeDocumentKey: args.runtimeDocumentKey,
    runtimeDurationSeconds: args.runtimeDurationSeconds,
  })
  const onSelectedRowKeyChange = args.onSelectedRowKeyChange
  const setTransportSelectedRowKey = transportSession.setSelectedRowKey
  const handleSelectedRowKeyChange = React.useCallback((rowKey: string) => {
    const nextRowKey = clean(rowKey)
    setTransportSelectedRowKey(nextRowKey)
    onSelectedRowKeyChange?.(nextRowKey || null)
  }, [onSelectedRowKeyChange, setTransportSelectedRowKey])
  const annotationSources = React.useMemo(() => readVideoSequenceTimelineModelFromMarkdown(transportSession.markdownText)?.sources || [], [transportSession.markdownText])
  const annotationGroups = React.useMemo(() => resolveVideoSequenceSourceAnnotations({
    associations: readVideoSequenceSourceAnnotations(transportSession.markdownText),
    taskSpans: transportSession.timelineModel.taskSpans,
    sources: annotationSources,
  }), [annotationSources, transportSession.markdownText, transportSession.timelineModel.taskSpans])
  const presentedSpans = React.useMemo(() => {
    const folded = new Set(annotationGroups.map(group => group.annotationSpan.rowKey))
    return transportSession.timelineModel.taskSpans.filter(span => !folded.has(span.rowKey))
  }, [annotationGroups, transportSession.timelineModel.taskSpans])
  React.useEffect(() => {
    const foldedSelection = annotationGroups.find(group => group.annotationSpan.rowKey === transportSession.selectedRowKey)
    if (foldedSelection) handleSelectedRowKeyChange(foldedSelection.videoSpan.rowKey)
  }, [annotationGroups, handleSelectedRowKeyChange, transportSession.selectedRowKey])
  const [expandedAnnotations, setExpandedAnnotations] = React.useState<{ documentKey: string; ids: string[] }>({ documentKey: '', ids: [] })
  const expandedIds = expandedAnnotations.documentKey === transportSession.documentKey ? expandedAnnotations.ids : []
  React.useEffect(() => {
    const valid = new Set(annotationGroups.map(group => group.association.videoTrackId))
    setExpandedAnnotations(previous => {
      const ids = previous.documentKey === transportSession.documentKey ? previous.ids.filter(id => valid.has(id)) : []
      return previous.documentKey === transportSession.documentKey && ids.length === previous.ids.length ? previous : { documentKey: transportSession.documentKey, ids }
    })
  }, [annotationGroups, transportSession.documentKey])
  const annotationLanes = React.useMemo<VideoSequenceTimelineInsertedLane[]>(() => annotationGroups.filter(group => expandedIds.includes(group.association.videoTrackId)).map(group => {
    const anchor = resolveVideoSequenceTimelineDisplayLaneId(group.videoSpan, presentedSpans, { disabledLaneIds })
    return { id: `source-annotations:${group.association.videoTrackId}`, insertAfterLaneId: anchor, dragLaneId: anchor,
      label: 'Annotations', selectRowKey: group.videoSpan.rowKey, content: null }
  }), [annotationGroups, disabledLaneIds, expandedIds, presentedSpans])
  const [selectedAnnotation, setSelectedAnnotation] = React.useState<{ rowKey: string; timestampSeconds: number } | null>(null)
  React.useEffect(() => setSelectedAnnotation(null), [transportSession.documentKey, transportSession.playing])
  const renderAnnotationOverlay = React.useCallback<VideoSequenceTimelineClipOverlayRenderer>(({ span }) => {
    const group = annotationGroups.find(item => item.videoSpan.rowKey === span.rowKey)
    if (!group) return null
    return React.createElement(VideoSequenceSourceAnnotationLayer, {
      samples: group.samples,
      open: expandedIds.includes(group.association.videoTrackId),
      onOpenChange: open => setExpandedAnnotations(previous => {
        const ids = previous.documentKey === transportSession.documentKey ? previous.ids : []
        const id = group.association.videoTrackId
        return { documentKey: transportSession.documentKey, ids: open ? [...new Set([...ids, id])] : ids.filter(item => item !== id) }
      }),
      selectedTimeSeconds: selectedAnnotation?.rowKey === span.rowKey ? selectedAnnotation.timestampSeconds : undefined,
      onSelect: sample => {
        const position = resolveVideoSequenceAnnotationTimelinePosition(group, sample.timestampSeconds)
        const source = annotationSources.find(item => item.id === group.association.sourceId)
        const sourceUrl = source ? resolveTimelinePlanSourceUrl(source) : ''
        const state = useGraphStore.getState()
        if (position === null || !sourceUrl || !state.graphData?.nodes.some(node => node.id === group.association.frameAnalysisNodeId)) return
        transportSession.setTransportPlaying(false)
        transportSession.setTransportPlaybackPosition(position)
        handleSelectedRowKeyChange(span.rowKey)
        setMediaPlayerVisible(true)
        setSelectedAnnotation({ rowKey: span.rowKey, timestampSeconds: sample.timestampSeconds })
        state.setSelectionSource('editor')
        state.selectNodesExpanded({ nodeIds: [group.association.frameAnalysisNodeId], activeNodeId: group.association.frameAnalysisNodeId, edgeIds: [], groupIds: [] })
        requestRichMediaTimelineTargetFrame({ documentKey: transportSession.documentKey,
          overlayId: group.association.frameAnalysisNodeId, sourceUrl, position,
          sourceTimestampMs: sample.timestampSeconds * 1000, frameSampleUrl: sample.url })
        emitMainPanelOpen({ tab: 'workflowManager', workflowManagerTab: 'graph', workflowManagerEntryLabel: 'Inspector' })
      },
    })
  }, [annotationGroups, annotationSources, expandedIds, handleSelectedRowKeyChange, selectedAnnotation, transportSession])
  const compactSourceTimeline = React.useMemo(() => (
    !workflowMode
    && transportSession.timelineModel.taskSpans.length > 0
    && transportSession.timelineModel.taskSpans.every(span => isCompactSourceMediaSpan(span, resolveVideoSequenceTimelineLane(span)))
  ), [transportSession.timelineModel.taskSpans, workflowMode])
  const rulerVisibleLaneCount = React.useMemo(() => (
    workflowMode
      ? (transportSession.timelineModel.taskSpans.length ? 1 : 0)
      : resolveVisibleVideoSequenceTimelineLaneCount(presentedSpans, { disabledLaneIds })
  ), [disabledLaneIds, presentedSpans, transportSession.timelineModel.taskSpans, workflowMode])
  const selectedPreviewEmpty = !!transportSession.selectedSpan && !transportSession.previewPlan
  const mediaPreviewSourceUrl = React.useMemo(() => {
    if (selectedPreviewEmpty) return ''
    const source = transportSession.previewPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))?.source
      || transportSession.thumbnailPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))?.source
      || transportSession.exportPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))?.source
      || null
    return source ? resolveTimelinePlanSourceUrl(source) : ''
  }, [selectedPreviewEmpty, transportSession.exportPlan, transportSession.previewPlan, transportSession.thumbnailPlan])
  const mediaPlayerSourceSegment = React.useMemo(() => {
    if (selectedPreviewEmpty) return null
    return transportSession.previewPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))
      || transportSession.thumbnailPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))
      || transportSession.exportPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))
      || null
  }, [selectedPreviewEmpty, transportSession.exportPlan, transportSession.previewPlan, transportSession.thumbnailPlan])
  const mediaPlayerSourceUrl = React.useMemo(() => (
    mediaPlayerSourceSegment ? resolveTimelinePlanSourceUrl(mediaPlayerSourceSegment.source) : mediaPreviewSourceUrl
  ), [mediaPlayerSourceSegment, mediaPreviewSourceUrl])
  const mediaPlayerKind = React.useMemo(() => (
    readTimelineTransportMediaPreviewKind(mediaPlayerSourceSegment?.source || null, mediaPlayerSourceUrl)
  ), [mediaPlayerSourceSegment, mediaPlayerSourceUrl])
  const mediaPlayerAvailable = !!mediaPlayerSourceUrl && !selectedPreviewEmpty
  const mediaPlayerEnabled = mediaPlayerVisible && mediaPlayerAvailable && !transportSession.disabled
  const handleToggleMediaPlayer = React.useCallback(() => {
    setMediaPlayerVisible(value => !value)
  }, [])
  const timelinePlanSourceDurationSeconds = React.useMemo(() => {
    if (selectedPreviewEmpty) return 0
    const source = transportSession.previewPlan?.segments.find(segment => Number(segment.source.durationSeconds) > 0)?.source
      || transportSession.thumbnailPlan?.segments.find(segment => Number(segment.source.durationSeconds) > 0)?.source
      || transportSession.exportPlan?.segments.find(segment => Number(segment.source.durationSeconds) > 0)?.source
      || null
    const durationSeconds = Number(source?.durationSeconds)
    return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0
  }, [selectedPreviewEmpty, transportSession.exportPlan, transportSession.previewPlan, transportSession.thumbnailPlan])
  const timelinePlanSourceFrameRate = React.useMemo(() => {
    if (selectedPreviewEmpty) return 0
    const source = transportSession.previewPlan?.segments.find(segment => Number(segment.source.frameRate) > 0)?.source
      || transportSession.thumbnailPlan?.segments.find(segment => Number(segment.source.frameRate) > 0)?.source
      || transportSession.exportPlan?.segments.find(segment => Number(segment.source.frameRate) > 0)?.source
      || null
    const frameRate = Number(source?.frameRate)
    return Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 0
  }, [selectedPreviewEmpty, transportSession.exportPlan, transportSession.previewPlan, transportSession.thumbnailPlan])
  const thumbnailSourceUrl = React.useMemo(() => {
    const source = transportSession.thumbnailPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))?.source
      || transportSession.previewPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))?.source
      || transportSession.exportPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source))?.source
      || null
    return source ? resolveTimelinePlanSourceUrl(source) : ''
  }, [transportSession.exportPlan, transportSession.previewPlan, transportSession.thumbnailPlan])
  const mediaPreviewSummary = useTimelineMediaReaderSummary({
    active: !workflowMode && !!mediaPreviewSourceUrl,
    url: mediaPreviewSourceUrl,
  })
  const displaySourceDurationSeconds = timelinePlanSourceDurationSeconds || mediaPreviewSummary.durationSeconds
  const rulerMediaDurationSeconds = transportSession.maxMinutes > 0 ? transportSession.maxMinutes * 60 : (transportSession.mediaDurationSeconds || displaySourceDurationSeconds)
  const rulerScaleMaxMinutes = React.useMemo(() => resolveVideoSequenceTimelineScaleMaxMinutes({
    maxMinutes: transportSession.maxMinutes,
    mediaDurationSeconds: rulerMediaDurationSeconds,
  }), [rulerMediaDurationSeconds, transportSession.maxMinutes])
  const thumbnailSummary = useTimelineMediaReaderSummary({
    active: !workflowMode && !!thumbnailSourceUrl,
    url: thumbnailSourceUrl,
  })
  const sourceThumbnailItems = React.useMemo(() => collectTimelineTransportThumbnailSourceItems([
    transportSession.thumbnailPlan,
    transportSession.previewPlan,
    transportSession.exportPlan,
  ]), [transportSession.exportPlan, transportSession.previewPlan, transportSession.thumbnailPlan])
  const sourceThumbnailUrls = React.useMemo(() => sourceThumbnailItems.map(item => item.src), [sourceThumbnailItems])
  const sourceThumbnailSummaries = useTimelineMediaReaderSummaries({
    active: !workflowMode && sourceThumbnailUrls.length > 0,
    urls: sourceThumbnailUrls,
  })
  const sourceThumbnailWindows = React.useMemo<VideoSequenceTimelineThumbnailWindow[]>(() => {
    const durationSeconds = thumbnailSummary.durationSeconds
    const thumbnailPlan = transportSession.thumbnailPlan || transportSession.exportPlan
    if (!thumbnailPlan?.segments.length || !thumbnailSourceUrl || durationSeconds <= 0) return []
    return thumbnailPlan.segments
      .filter(segment => resolveTimelinePlanSourceUrl(segment.source) === thumbnailSourceUrl)
      .map(segment => ({
        sourceEndSeconds: segment.sourceEndRatio * durationSeconds,
        sourceStartSeconds: segment.sourceStartRatio * durationSeconds,
        timelineEndMinutes: segment.timelineEndMinutes,
        timelineStartMinutes: segment.timelineStartMinutes,
      }))
  }, [thumbnailSourceUrl, thumbnailSummary.durationSeconds, transportSession.exportPlan, transportSession.thumbnailPlan])
  const sourceThumbnailSets = React.useMemo<VideoSequenceTimelineSourceThumbnailSet[]>(() => {
    const thumbnailPlan = transportSession.thumbnailPlan || transportSession.exportPlan
    if (!thumbnailPlan?.segments.length) return []
    const collected = sourceThumbnailItems.flatMap((item): VideoSequenceTimelineSourceThumbnailSet[] => {
      const summary = sourceThumbnailSummaries[item.src]
      const durationSeconds = Number(item.source.durationSeconds) > 0 ? Number(item.source.durationSeconds) : Number(summary?.durationSeconds || 0)
      const thumbnails = summary?.thumbnails || []
      if (!thumbnails.length && !summary?.audioWaveformSamples.length && item.kind !== 'image' && item.kind !== 'video') return []
      return [{
        kind: item.kind,
        label: item.label,
        sourceAudioWaveformSamples: summary?.audioWaveformSamples || [],
        sourceId: item.source.id,
        sourceThumbnailWindows: thumbnailPlan.segments
          .filter(segment => resolveTimelinePlanSourceUrl(segment.source) === item.src)
          .map(segment => ({
            sourceEndSeconds: segment.sourceEndRatio * Math.max(0.0001, durationSeconds || 1),
            sourceStartSeconds: segment.sourceStartRatio * Math.max(0.0001, durationSeconds || 1),
            timelineEndMinutes: segment.timelineEndMinutes,
            timelineStartMinutes: segment.timelineStartMinutes,
          })),
        sourceThumbnails: thumbnails,
        sourceUrl: item.src,
      }]
    })
    if (thumbnailSourceUrl && thumbnailSummary.audioWaveformSamples.length && !collected.some(set => set.sourceUrl === thumbnailSourceUrl)) collected.push({ kind: 'video', label: 'Source video', sourceAudioWaveformSamples: thumbnailSummary.audioWaveformSamples, sourceId: '', sourceThumbnailWindows, sourceThumbnails: thumbnailSummary.thumbnails, sourceUrl: thumbnailSourceUrl })
    return collected
  }, [sourceThumbnailItems, sourceThumbnailSummaries, sourceThumbnailWindows, thumbnailSourceUrl, thumbnailSummary.audioWaveformSamples, thumbnailSummary.thumbnails, transportSession.exportPlan, transportSession.thumbnailPlan])
  const transportClockDisplayModel = useGanttTimelineDisplayModel({
    maxMinutes: transportSession.maxMinutes,
    mediaDurationSeconds: transportSession.mediaDurationSeconds,
    positionMinutes: transportSession.positionMinutes,
    previewPlan: selectedPreviewEmpty ? null : transportSession.previewPlan,
    sourceDurationSeconds: selectedPreviewEmpty ? 0 : displaySourceDurationSeconds,
    ticks: transportSession.ticks,
  })
  const positionOnlySelectedRowKeys = React.useMemo(() => new Set(
    (args.timelineInsertedLanes || [])
      .map(lane => clean(lane.selectRowKey))
      .filter(Boolean),
  ), [args.timelineInsertedLanes])
  const selectedAudioPlaybackSegment = React.useMemo(() => {
    if (!transportSession.selectedSpan || resolveVideoSequenceTimelineLane(transportSession.selectedSpan) !== 'audio') return null
    return transportSession.previewPlan?.segments.find(segment => resolveTimelinePlanSourceUrl(segment.source)) || null
  }, [transportSession.previewPlan, transportSession.selectedSpan])
  const audioPlaybackBridgeModel = React.useMemo<GanttTimelineTransportAudioPlaybackBridgeModel>(() => {
    const mediaKey = selectedAudioPlaybackSegment ? resolveTimelinePlanSourceUrl(selectedAudioPlaybackSegment.source) : ''
    return {
      active: !!selectedAudioPlaybackSegment && !!mediaKey && !transportSession.disabled,
      documentKey: transportSession.documentKey,
      exportPlan: selectedAudioPlaybackSegment ? transportSession.previewPlan : null,
      maxMinutes: transportSession.maxMinutes,
      mediaKey,
      source: selectedAudioPlaybackSegment?.source || null,
    }
  }, [
    selectedAudioPlaybackSegment,
    transportSession.disabled,
    transportSession.documentKey,
    transportSession.maxMinutes,
    transportSession.previewPlan,
  ])
  const mediaPlayerModel = React.useMemo<GanttTimelineTransportMediaPlayerModel>(() => ({
    active: mediaPlayerEnabled,
    documentKey: transportSession.documentKey,
    exportPlan: mediaPlayerSourceSegment ? (transportSession.previewPlan || transportSession.thumbnailPlan || transportSession.exportPlan) : null,
    kind: mediaPlayerKind,
    maxMinutes: transportSession.maxMinutes,
    playbackRate: transportSession.playbackRate,
    playing: transportSession.playing,
    positionMinutes: transportSession.positionMinutes,
    readerDurationSeconds: displaySourceDurationSeconds,
    setTransportPlaybackPosition: transportSession.setTransportPlaybackPosition,
    setTransportPlaying: transportSession.setTransportPlaying,
    source: mediaPlayerSourceSegment?.source || null,
    title: mediaPlayerSourceSegment ? readTimelineTransportSourceLabel(mediaPlayerSourceSegment.source) : 'Media output',
    url: mediaPlayerSourceUrl,
  }), [
    displaySourceDurationSeconds,
    mediaPlayerEnabled,
    mediaPlayerKind,
    mediaPlayerSourceSegment,
    mediaPlayerSourceUrl,
    transportSession.documentKey,
    transportSession.maxMinutes,
    transportSession.playbackRate,
    transportSession.playing,
    transportSession.positionMinutes,
    transportSession.previewPlan,
    transportSession.thumbnailPlan,
    transportSession.exportPlan,
    transportSession.setTransportPlaybackPosition,
    transportSession.setTransportPlaying,
  ])
  const transportCommandModel = useGanttTimelineTransportCommandModel({
    code: args.code,
    commandAdapter: args.commandAdapter,
    documentKey: transportSession.documentKey,
    exportPlan: transportSession.exportPlan,
    markdownDocumentName: transportSession.markdownDocumentName,
    markdownText: transportSession.markdownText,
    maxMinutes: transportSession.maxMinutes,
    positionMinutes: transportSession.positionMinutes,
    selectedSpan: transportSession.selectedSpan,
    selectedRowKey: transportSession.selectedRowKey,
    setSelectedRowKey: transportSession.setSelectedRowKey,
    setTransportPlaying: transportSession.setTransportPlaying,
  })
  const transportInteractionModel = useGanttTimelineTransportInteractionModel({
    autoSnappingEnabled: transportCommandModel.chromeModelCommands.autoSnappingEnabled,
    disabled: transportSession.disabled,
    markdownDocumentName: transportSession.markdownDocumentName,
    markdownText: transportSession.markdownText,
    maxMinutes: transportSession.maxMinutes,
    playing: transportSession.playing,
    positionMinutes: transportSession.positionMinutes,
    rulerViewportRef,
    scrubMaxMinutes: rulerScaleMaxMinutes,
    selectedRowKey: transportSession.selectedRowKey,
    setSelectedRowKey: handleSelectedRowKeyChange,
    setTransportPlaybackPosition: transportSession.setTransportPlaybackPosition,
    setTransportPlaying: transportSession.setTransportPlaying,
    timelineModel: transportSession.timelineModel,
    positionOnlySelectedRowKeys,
    selectionFollowsPlayhead: args.commandAdapter?.selectionFollowsPlayhead,
    onCommitDrag: transportCommandModel.handleCommittedDragUpdate,
  })
  const editable = args.editable !== false
  const baseChromeModel = useGanttTimelineTransportChromeModel({
    canFitTimeline: transportInteractionModel.canFitTimeline,
    canZoomIn: transportInteractionModel.canZoomIn,
    canZoomOut: transportInteractionModel.canZoomOut,
    centerTimelinePlayhead: transportInteractionModel.centerTimelinePlayhead,
    disabled: transportSession.disabled,
    exportPlanError: transportSession.exportPlanError,
    handleFitTimeline: transportInteractionModel.handleFitTimeline,
    handleZoomIn: transportInteractionModel.handleZoomIn,
    handleZoomOut: transportInteractionModel.handleZoomOut,
    maxMinutes: transportSession.maxMinutes,
    mediaPlayerAvailable,
    mediaPlayerEnabled,
    mediaDurationSeconds: transportSession.mediaDurationSeconds,
    onToggleMediaPlayer: handleToggleMediaPlayer,
    playheadMinutes: transportSession.positionMinutes,
    selectedSpan: transportSession.selectedSpan,
    spans: transportSession.timelineModel.taskSpans,
    timelineZoom: transportInteractionModel.timelineZoom,
    timelineZoomPercent: transportInteractionModel.timelineZoomPercent,
    toolStatus: transportSession.toolStatus,
    ...transportCommandModel.chromeModelCommands,
  })
  const chromeModel = React.useMemo<GanttTimelineTransportChromeModel>(() => {
    if (editable) return baseChromeModel
    return {
      ...baseChromeModel,
      headerTools: {
        ...baseChromeModel.headerTools,
        runtimeOnly: true,
        actionButtons: baseChromeModel.headerTools.actionButtons.map(button => ({ ...button, disabled: true })),
        clipActionButtons: baseChromeModel.headerTools.clipActionButtons.map(button => ({ ...button, disabled: true })),
        mediaPlayerButton: { ...baseChromeModel.headerTools.mediaPlayerButton, disabled: true },
        syncModeButton: { ...baseChromeModel.headerTools.syncModeButton, disabled: true },
        toolButtons: baseChromeModel.headerTools.toolButtons.map(button => ({ ...button, disabled: true })),
      },
    }
  }, [baseChromeModel, editable])
  const rulerModel = useGanttTimelineTransportRulerModel({
    compact: args.compact,
    contentRef: rulerContentRef,
    displayTicks: transportClockDisplayModel.displayTicks,
    disabledLaneIds,
    dragPreview: transportInteractionModel.dragPreview,
    draggingMode: transportInteractionModel.draggingMode,
    draggingRowKey: transportInteractionModel.draggingRowKey,
    editable,
    canEditTrack: args.commandAdapter?.canEditTrack,
    maxMinutes: transportSession.maxMinutes,
    mediaDurationSeconds: rulerMediaDurationSeconds,
    mediaFrameRate: Number(args.runtimeFrameRate) > 0
      ? Number(args.runtimeFrameRate)
      : selectedPreviewEmpty ? 0 : (timelinePlanSourceFrameRate || thumbnailSummary.averageVideoFrameRate),
    mode: args.mode,
    onDropMedia: workflowMode || !editable ? () => false : transportCommandModel.handleMediaDrop,
    onRulerWheel: transportInteractionModel.handleRulerWheelZoom,
    onRulerPointerDown: transportInteractionModel.handleRulerPointerScrub,
    onSelectRowKey: handleSelectedRowKeyChange,
    onSelectRowPosition: (rowKey, positionMinutes) => {
      transportSession.setTransportPlaybackPosition(positionMinutes)
      handleSelectedRowKeyChange(rowKey)
    },
    onTrackPointerStart: (event, span, mode) => { if (editable || args.commandAdapter?.canEditTrack?.(span.rowKey, mode)) transportInteractionModel.handleTrackPointerStart(event, span, mode) },
    playheadPercent: transportInteractionModel.playheadPercent,
    positionMinutes: transportSession.positionMinutes,
    scopes: compactSourceTimeline || workflowMode ? [] : transportSession.monitorScopes,
    selectedRowKey: transportSession.selectedRowKey,
    sourceThumbnails: thumbnailSummary.thumbnails,
    sourceThumbnailWindows,
    sourceThumbnailSets,
    taskSpans: presentedSpans,
    timelineZoom: transportInteractionModel.timelineZoom,
    totalLabel: transportClockDisplayModel.totalLabel,
    viewportRef: rulerViewportRef,
    visibleLaneCount: rulerVisibleLaneCount,
  })
  const transportPlaybackModel = useGanttTimelineTransportPlaybackModel({
    clockActive: args.clockActive === true,
    disabled: transportSession.disabled,
    documentKey: transportSession.documentKey,
    maxMinutes: transportSession.maxMinutes,
    onPositionChange: transportInteractionModel.handlePositionChange,
    playbackRate: transportSession.playbackRate,
    playbackUnitsPerMs: transportClockDisplayModel.playbackUnitsPerMs,
    playing: transportSession.playing,
    positionMinutes: transportSession.positionMinutes,
    publishPlaybackRequest: args.publishPlaybackRequest !== false,
    setTransportPlaying: transportSession.setTransportPlaying,
  })
  const shellModel = useGanttTimelineTransportShellModel({
    currentLabel: transportClockDisplayModel.currentLabel,
    disabled: transportSession.disabled,
    hasMediaDurationScale: transportClockDisplayModel.hasMediaDurationScale,
    maxMinutes: transportSession.maxMinutes,
    mediaDurationSeconds: transportSession.mediaDurationSeconds,
    mediaReaderSummary: mediaPreviewSummary,
    onPlaybackRateChange: transportSession.setTransportPlaybackRate,
    onTogglePlayback: transportPlaybackModel.handleTogglePlayback,
    onValueChange: transportInteractionModel.handlePositionChange,
    playbackRate: transportSession.playbackRate,
    playing: transportSession.playing,
    timelineMode: workflowMode ? 'workflow' : (selectedPreviewEmpty ? 'empty' : 'source-backed'),
  })

  return {
    audioPlaybackBridgeModel,
    chromeModel,
    mediaPlayerModel,
    rulerModel,
    shellModel,
    renderAnnotationOverlay, annotationLanes,
  }
}
