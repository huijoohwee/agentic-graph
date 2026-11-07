import type { GanttPanelRoutingSources } from './mermaidGanttPanelRoutingSurfaceAssertions'

export function assertGanttPanelRoutingTransport(
  sources: GanttPanelRoutingSources,
) {
  const {
    floatingTypeText, uiInitialStateText, mediaCanvasText, ganttTransportRouteModelText,
    ganttTransportSurfaceModelText, ganttTransportSurfaceText, ganttTransportCommandModelText,
    ganttDocumentActionsText, ganttDisplayModelText, ganttInteractionsText,
    ganttTransportInteractionModelText, ganttMediaDurationText, ganttPlaybackControlsText,
    ganttTransportPlaybackModelText, ganttSelectionSyncText, ganttTransportViewText, timelineBottomText,
    videoSequenceExportText, timelineTransportText, surfaceBindingsText, timelinePlanSyncText,
    timelinePreviewBootstrapText, timelinePreviewCollectionText, timelinePreviewActivitySurfaceModelText,
    timelinePreviewFamilyCompactionModelText, timelinePreviewFamilyDisclosureControllerText,
    timelinePreviewFamilyDisclosureModelText, timelinePreviewFamilyDisclosureSurfaceModelText,
    timelinePreviewFamilySectionLayoutModelText, timelinePreviewFamilySectionChromeModelText,
    timelinePreviewFamilySectionBodyModelText, timelinePreviewFamilySectionsModelText,
    timelinePreviewMediaContextText, timelinePreviewScopeProjectionText, timelinePreviewMonitorContextText,
    timelinePreviewMonitorBindingText, timelinePreviewMediaCanvasBindingText, timelinePreviewRouteEntryText,
    ganttTransportPreviewSessionText, ganttTransportSessionText, ganttTransportChromeModelText,
    ganttTransportContextControlsText, ganttTransportHeaderToolsText, ganttTransportRulerModelText,
    ganttTransportRulerText, ganttTransportShellModelText, ganttTransportShellText,
    timelinePreviewMediaCanvasRenderModelText, timelinePreviewMediaCanvasRenderText,
    timelinePreviewMediaCanvasFrameModelText, timelinePreviewMediaCanvasFrameText,
    timelinePreviewSurfaceShellModelText, timelineSourceActivityModelText, timelinePreviewSurfaceModelText,
    timelinePreviewSurfaceText, mediaFormatPreferenceText, timelinePreviewSyncText,
    timelinePreviewVideoBindingText, localImportText, urlImportText, urlContentText, videoSequenceImportText,
    resolverText,
  } = sources
  if (
    !videoSequenceExportText.includes('buildVideoSequenceExportPlan') ||
    !timelinePlanSyncText.includes('buildTimelinePreviewSyncPlan') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanSourceTimeAtPosition') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanPositionFromSourceTime') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanDurationSeconds') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanSourceUrl') ||
    !timelinePlanSyncText.includes('loadTimelineMediaReaderSummary') ||
    !timelinePlanSyncText.includes('loadTimelinePlanVideoMetadata') ||
    !timelinePlanSyncText.includes('selectedRowKey') ||
    !timelineTransportText.includes('resolveTimelineTransportSnapshot') ||
    !timelineTransportText.includes('useTimelineDocumentStoreBinding') ||
    !timelineTransportText.includes('useTimelineTransportSnapshotReader') ||
    !timelineTransportText.includes('useTimelineTransportStoreBinding') ||
    !surfaceBindingsText.includes('useTimelineGanttSelectionStoreBinding') ||
    !surfaceBindingsText.includes('useTimelineDocumentMutationStoreBinding') ||
    !surfaceBindingsText.includes('useTimelineDocumentSnapshotReader') ||
    !ganttTransportRouteModelText.includes('useGanttTimelineTransportRouteModel') ||
    !ganttTransportRouteModelText.includes('useGanttTimelineTransportSurfaceModel') ||
    !ganttTransportRouteModelText.includes('surfaceModel: transportSurfaceModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportSurfaceModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportSession') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportCommandModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportChromeModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportRulerModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportShellModel') ||
    !ganttTransportSurfaceModelText.includes('useTimelineMediaReaderSummary') ||
    !ganttTransportSurfaceModelText.includes('const mediaPreviewSourceUrl = React.useMemo') ||
    !ganttTransportSurfaceModelText.includes('const thumbnailSourceUrl = React.useMemo') ||
    !ganttTransportSurfaceModelText.includes('resolveTimelinePlanSourceUrl') ||
    !ganttTransportSurfaceModelText.includes('playbackUnitsPerMs: transportClockDisplayModel.playbackUnitsPerMs') ||
    !ganttTransportSurfaceModelText.includes('const selectedPreviewEmpty = !!transportSession.selectedSpan && !transportSession.previewPlan') ||
    ganttTransportSurfaceModelText.includes('transportSession.disabled || selectedPreviewEmpty') ||
    ganttTransportSurfaceModelText.includes('transportSession.setTransportPlaying(false)') ||
    !ganttTransportSurfaceModelText.includes('transportClockDisplayModel') ||
    ganttTransportSurfaceModelText.includes('emptySelectionCurrentLabel') ||
    ganttTransportSurfaceModelText.includes('emptySelectionTotalLabel') ||
    ganttTransportSurfaceModelText.includes('hasMediaDurationScale: selectedPreviewEmpty ? false') ||
    ganttTransportSurfaceModelText.includes('mediaDurationSeconds: selectedPreviewEmpty ? 0 : transportSession.mediaDurationSeconds') ||
    !ganttTransportSurfaceModelText.includes('hasMediaDurationScale: transportClockDisplayModel.hasMediaDurationScale') ||
    !ganttTransportSurfaceModelText.includes('mediaDurationSeconds: transportSession.mediaDurationSeconds') ||
    !ganttTransportSurfaceModelText.includes("timelineMode: workflowMode ? 'workflow' : (selectedPreviewEmpty ? 'empty' : 'source-backed')") ||
    !ganttTransportSurfaceModelText.includes('sourceThumbnails: thumbnailSummary.thumbnails') || !ganttTransportSurfaceModelText.includes('sourceThumbnailWindows') || !ganttTransportSurfaceModelText.includes('sourceThumbnailSets') ||
    !ganttTransportSurfaceText.includes('GanttTimelineTransportSurface') ||
    !ganttTransportSurfaceText.includes('GanttTimelineTransportShell') ||
    !ganttTransportSurfaceText.includes('model: GanttTimelineTransportSurfaceModel') ||
    !ganttTransportCommandModelText.includes('useGanttTimelineTransportCommandModel') ||
    !ganttTransportCommandModelText.includes('useGanttTimelineDocumentActions') ||
    !ganttTransportCommandModelText.includes('chromeModelCommands') ||
    !ganttTransportCommandModelText.includes('markdownFallback: () => documentActions.handleCommittedDragUpdate(input)') || !ganttTransportCommandModelText.includes("kind: 'drag-edit'") ||
    !ganttTransportCommandModelText.includes('handleToggleVideoSequenceTimingSyncMode: documentActions.handleToggleVideoSequenceTimingSyncMode') ||
    !ganttTransportCommandModelText.includes('timingSyncMode: documentActions.timingSyncMode') ||
    !ganttDocumentActionsText.includes('useGanttTimelineDocumentActions') ||
    !ganttDocumentActionsText.includes('useTimelineDocumentMutationStoreBinding') ||
    !ganttDocumentActionsText.includes('downloadVideoSequenceExport') ||
    !ganttDocumentActionsText.includes('useTimelineTransportTimingSyncStoreBinding') ||
    !ganttDocumentActionsText.includes('setTimelineTransportTimingSyncMode(timingSyncMode ===') ||
    !ganttDocumentActionsText.includes('resolveGanttTimelineVideoSequenceSplitAction') ||
    !ganttDocumentActionsText.includes('insertMermaidGanttVideoSequenceOperationRow') ||
    !ganttDocumentActionsText.includes('useTimelineDocumentSnapshotReader') ||
    !ganttDocumentActionsText.includes('handleCommittedDragUpdate') ||
    !ganttDocumentActionsText.includes('updateGanttTimelineVideoSequenceClipTimingWithRipple') ||
    !ganttDocumentActionsText.includes('handleToggleVideoSequenceTimingSyncMode') ||
    !ganttDocumentActionsText.includes('resolveGanttTimelineVideoSequenceTimingSyncMode') ||
    !ganttDocumentActionsText.includes('syncMode: resolveGanttTimelineVideoSequenceTimingSyncMode({ span: actionContext.selectedSpan, timingSyncMode })') ||
    ganttDocumentActionsText.includes('const nextCode = updateMermaidGanttCodeRowTiming') ||
    !ganttDocumentActionsText.includes('replaceFirstMermaidGanttFrontmatterCode') ||
    !ganttDocumentActionsText.includes('upsertUiToast') ||
    !ganttDocumentActionsText.includes('AbortController') ||
    !ganttDocumentActionsText.includes('resolveVideoSequenceExportEvent') ||
    !ganttDocumentActionsText.includes('resolveVideoSequenceExportOutcome') ||
    !ganttDocumentActionsText.includes('createVideoSequenceExportSessionRecord') ||
    !ganttDocumentActionsText.includes('reduceVideoSequenceExportSessionRecord') ||
    !ganttDocumentActionsText.includes('resolveVideoSequenceExportRetryRequest') ||
    !ganttDocumentActionsText.includes('buildVideoSequenceExportSessionCollection') ||
    !ganttDocumentActionsText.includes('handleRetryEditedMediaExport') ||
    !ganttDocumentActionsText.includes('latestRetryableExportSession') ||
    !ganttDocumentActionsText.includes('handleRetryEditedMediaExportRunId') ||
    !ganttTransportChromeModelText.includes('exportSessionCollection.surface') ||
    !ganttTransportChromeModelText.includes('exportSessionCollection.retryControl') ||
    !ganttTransportChromeModelText.includes('handleRetryEditedMediaExport(args.latestRetryableExportSession)') ||
    !ganttTransportChromeModelText.includes('handleRetryEditedMediaExportRunId') ||
    !ganttTransportChromeModelText.includes('clipActionButtons') ||
    !ganttTransportChromeModelText.includes("action: 'nudge-back'") ||
    !ganttTransportChromeModelText.includes("action: 'trim-start-back'") ||
    !ganttTransportChromeModelText.includes("action: 'snap-to-playhead'") ||
    !ganttTransportChromeModelText.includes("action: 'split-at-playhead'") ||
    !ganttTransportChromeModelText.includes('Download edited video') ||
    !ganttTransportChromeModelText.includes('Download edited audio') ||
    !ganttTransportHeaderToolsText.includes('data-kg-video-sequence-clip-edit={button.action}') ||
    !ganttTransportHeaderToolsText.includes('renderClipActionIcon(button.icon)') ||
    !ganttTransportHeaderToolsText.includes('data-kg-video-sequence-export={button.dataValue}') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-mode') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-retry') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-tone') ||
    !ganttTransportRulerModelText.includes('useGanttTimelineTransportRulerModel') ||
    !ganttTransportRulerModelText.includes('clampTimelineTransportValue') ||
    !ganttTransportRulerModelText.includes("'--kg-video-sequence-lane-count': args.visibleLaneCount") ||
    !ganttTransportRulerModelText.includes("subtitleLabel: `${args.taskSpans.length} timeline rows`") ||
    ganttTransportRulerModelText.includes("titleLabel: 'Gantt-Timeline'") ||
    !ganttTransportRulerModelText.includes('value: clampTimelineTransportValue(args.positionMinutes, 0, Math.max(1, args.maxMinutes))') ||
    !ganttTransportRulerModelText.includes("'data-kg-gantt-timeline-ruler': 'bottomPanel'") ||
    !ganttTransportRulerModelText.includes('sourceThumbnails: readonly TimelineMediaReaderThumbnail[]') || !ganttTransportRulerModelText.includes('sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]') || !ganttTransportRulerModelText.includes('sourceThumbnailSets: readonly VideoSequenceTimelineSourceThumbnailSet[]') ||
    !ganttTransportRulerModelText.includes('onSelectRowPosition: (rowKey: string, positionMinutes: number) => void') ||
    !ganttTransportRulerModelText.includes('scopes: args.scopes') ||
    !ganttTransportRulerText.includes('GanttTimelineTransportRuler') ||
    !ganttTransportRulerText.includes('VideoSequenceTimelineRuler') ||
    !ganttTransportRulerText.includes('projectionMode={args.model.mode}') ||
    !ganttTransportRulerText.includes('onSelectRowKey={args.model.onSelectRowKey}') ||
    !ganttTransportRulerText.includes('onSelectRowPosition={args.model.onSelectRowPosition}') ||
    !ganttTransportRulerText.includes('sourceThumbnails={args.model.sourceThumbnails}') || !ganttTransportRulerText.includes('sourceThumbnailWindows={args.model.sourceThumbnailWindows}') || !ganttTransportRulerText.includes('sourceThumbnailSets={args.model.sourceThumbnailSets}') ||
    !ganttTransportRulerText.includes('scopes={args.model.scopes}') ||
    !ganttTransportShellModelText.includes('useGanttTimelineTransportShellModel') ||
    !ganttTransportShellModelText.includes("ariaLabel: 'Scrub Gantt-timeline position'") ||
    !ganttTransportShellModelText.includes("chromeClassName: 'timeline-transport-chrome--mermaid-gantt p-2'") ||
    !ganttTransportShellModelText.includes("shellClassName: 'timeline-transport-shell--video-sequence'") ||
    !ganttTransportShellModelText.includes("'data-kg-gantt-timeline-transport': 'bottomPanel'") ||
    !ganttTransportShellModelText.includes("'data-kg-video-sequence-media-duration': args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : undefined") ||
    !ganttTransportShellModelText.includes("'data-kg-video-sequence-media-duration-scale': args.hasMediaDurationScale ? '1' : undefined") ||
    !ganttTransportShellModelText.includes("timelineMode: 'empty' | 'source-backed' | 'workflow'") ||
    !ganttTransportShellModelText.includes("'data-kg-video-sequence-timeline': args.timelineMode") ||
    !ganttTransportShellModelText.includes('showInlineProgress: true') ||
    !ganttTransportShellModelText.includes('showRange: false') ||
    !ganttTransportShellText.includes('GanttTimelineTransportShell') ||
    !ganttTransportShellText.includes('TimelineTransportChrome') ||
    !ganttTransportShellText.includes('GanttTimelineTransportContextControls') ||
    !ganttTransportShellText.includes('GanttTimelineTransportHeaderTools') ||
    !ganttTransportShellText.includes('GanttTimelineTransportRuler') ||
    !ganttTransportShellText.includes('contextLabel={args.rulerModel.chrome.subtitleLabel}') ||
    ganttTransportShellText.includes('titleLabel={args.rulerModel.chrome.titleLabel}') ||
    ganttTransportShellText.includes('subtitleLabel={args.rulerModel.chrome.subtitleLabel}') ||
    !ganttTransportShellText.includes('showInlineProgress={args.shellModel.showInlineProgress}') ||
    !ganttTransportShellText.includes('showRange={args.shellModel.showRange}') ||
    !ganttTransportPlaybackModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !ganttTransportPlaybackModelText.includes('useGanttTimelinePlaybackControls') ||
    !ganttTransportPlaybackModelText.includes('useTimelineTransportPlayback') ||
    !ganttTransportPlaybackModelText.includes('onPlaybackEnd: playbackControls.handlePlaybackEnd') ||
    !ganttTransportPlaybackModelText.includes('handleTogglePlayback: playbackControls.handleTogglePlayback') ||
    !ganttTransportPlaybackModelText.includes('active: args.clockActive !== false && !args.disabled') ||
    !ganttTransportPlaybackModelText.includes('unitsPerMs: args.playbackUnitsPerMs') ||
    !ganttDocumentActionsText.includes('upsertVideoSequenceExportSessionHistory') ||
    !ganttDocumentActionsText.includes('recentExportSessions') || !ganttTransportSurfaceModelText.includes('resolveVideoSequenceTimelineScaleMaxMinutes') || !ganttTransportSurfaceModelText.includes('rulerScaleMaxMinutes') || !ganttTransportSurfaceModelText.includes('scrubMaxMinutes: rulerScaleMaxMinutes') ||
    !ganttDisplayModelText.includes('useGanttTimelineDisplayModel') ||
    !ganttDisplayModelText.includes('formatVideoSequenceTimelineSecondsOffset') ||
    !ganttDisplayModelText.includes('resolveVideoSequenceTimelineMediaSeconds') ||
    !ganttDisplayModelText.includes('resolveVideoSequenceTimelineUnitsPerMs') ||
    !ganttDisplayModelText.includes('formatMermaidGanttTimelineOffset') ||
    !ganttDisplayModelText.includes('displayTicks') ||
    !ganttDisplayModelText.includes('playbackUnitsPerMs') ||
    !ganttInteractionsText.includes('useGanttTimelineInteractions') ||
    !ganttInteractionsText.includes('rulerScrubState') || !ganttInteractionsText.includes('scrubMaxMinutes?: number') || !ganttInteractionsText.includes('Math.max(args.maxMinutes, args.scrubMaxMinutes || 0)') ||
    !ganttInteractionsText.includes('resolveMermaidGanttBarDragCommitted') ||
    !ganttInteractionsText.includes('resolveMermaidGanttBarDragPreview') ||
    !ganttInteractionsText.includes('resolveMermaidGanttTimelineDragEffectiveDelta') ||
    !ganttInteractionsText.includes('resolveMermaidGanttTimelineDragPreviewSpan') ||
    !ganttInteractionsText.includes('effectiveDeltaMinutes,') ||
    !ganttInteractionsText.includes('handleRulerPointerScrub') || !ganttInteractionsText.includes('resolveTimelineRulerScrubElement') || !ganttInteractionsText.includes('[data-kg-gantt-timeline-ruler-content="1"],[data-kg-video-sequence-ruler-axis="1"]') || !ganttInteractionsText.includes('const scrubElement = resolveTimelineRulerScrubElement(event.target, event.currentTarget)') || !ganttInteractionsText.includes('const rect = scrubElement.getBoundingClientRect()') || !ganttInteractionsText.includes('isTimelinePlayheadScrubTarget') || !ganttInteractionsText.includes('[data-kg-gantt-timeline-playhead="1"],[data-kg-video-sequence-ruler-playhead-marker="1"]') ||
    !ganttInteractionsText.includes('handleTrackPointerStart') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineInteractions') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineSelectionSync') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineTransportView') || !ganttTransportInteractionModelText.includes('scrubMaxMinutes: args.scrubMaxMinutes') ||
    !ganttTransportInteractionModelText.includes('resolveMermaidGanttTimelineRowKeyAtPosition(args.timelineModel, position)') ||
    !ganttTransportInteractionModelText.includes('centerTimelinePlayhead: transportView.centerTimelinePlayhead') ||
    !ganttTransportInteractionModelText.includes('handleRulerPointerScrub: interactions.handleRulerPointerScrub') ||
    !ganttMediaDurationText.includes('useGanttTimelineMediaDuration') ||
    !ganttMediaDurationText.includes('resolveTimelinePlanDurationSeconds') ||
    !ganttMediaDurationText.includes("from '@/components/timeline/timelinePlanSync'") ||
    !ganttMediaDurationText.includes('setMediaDurationSeconds(0)') ||
    !ganttMediaDurationText.includes('Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0') ||
    !ganttPlaybackControlsText.includes('useGanttTimelinePlaybackControls') ||
    !ganttPlaybackControlsText.includes('dispatchTimelineTransportPlaybackRequest') ||
    !ganttPlaybackControlsText.includes('requestTimelineTransportPlayback') ||
    !ganttPlaybackControlsText.includes('handleTogglePlayback') ||
    !ganttPlaybackControlsText.includes('handlePlaybackEnd') ||
    ganttPlaybackControlsText.includes('handlePlaybackPointerDown') ||
    !ganttSelectionSyncText.includes('useGanttTimelineSelectionSync') ||
    !ganttSelectionSyncText.includes('previousSelectedRowKeyRef') ||
    !ganttSelectionSyncText.includes('if (previousSelectedRowKey === args.selectedRowKey) return') ||
    !ganttSelectionSyncText.includes('args.taskSpans.find(span => span.rowKey === args.selectedRowKey)') ||
    !ganttSelectionSyncText.includes('args.positionMinutes >= selectedSpan.startMinutes') ||
    !ganttSelectionSyncText.includes('args.setTransportPlaybackPosition(selectedSpan.startMinutes)') ||
    !ganttSelectionSyncText.includes('if (selectedSpan && args.positionMinutes >= selectedSpan.startMinutes') ||
    !ganttSelectionSyncText.includes('resolveRowKeyAtPosition: (position: number) => string | null') ||
    !ganttSelectionSyncText.includes('args.resolveRowKeyAtPosition(args.positionMinutes)') ||
    !ganttSelectionSyncText.includes('args.setSelectedRowKey(rowKey)') ||
    !ganttSelectionSyncText.includes('skipNextPositionSelectionSyncRef') ||
    !ganttTransportInteractionModelText.includes('positionMinutes: args.positionMinutes') ||
    !ganttTransportInteractionModelText.includes('setSelectedRowKey: args.setSelectedRowKey') ||
    !ganttTransportViewText.includes('useGanttTimelineTransportView') ||
    !ganttTransportViewText.includes('TIMELINE_TRANSPORT_ZOOM_LEVELS') ||
    !ganttTransportViewText.includes('resolveTimelineTransportNextZoomIndex') ||
    !ganttTransportViewText.includes('resolveTimelineTransportPlayheadPercent') ||
    !ganttTransportViewText.includes('resolveTimelineTransportPlayheadScrollLeft') ||
    !ganttTransportViewText.includes('resolveTimelineTransportZoom') ||
    !ganttTransportViewText.includes('centerTimelinePlayhead') ||
    !ganttTransportViewText.includes('handleZoomOut') ||
    !ganttTransportViewText.includes('handleZoomIn') ||
    !ganttTransportViewText.includes('handleFitTimeline') ||
    !ganttTransportViewText.includes('canZoomOut') ||
    !ganttTransportViewText.includes('canZoomIn') ||
    !ganttTransportViewText.includes('canFitTimeline') ||
    !timelinePreviewSyncText.includes('useTimelineVideoPreviewSyncController') ||
    !timelinePreviewSyncText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    !timelinePreviewSyncText.includes('resolveTimelineVideoPreviewDurationSeconds') ||
    !timelinePreviewSyncText.includes('resolveTimelineVideoPreviewTargetSeconds') ||
    !timelinePreviewSyncText.includes('resolveTimelineVideoPreviewPositionMinutes') ||
    !timelinePreviewSyncText.includes('TimelineTransportSnapshotReader') ||
    !timelinePreviewSyncText.includes('data-kg-video-sequence-playback-fallback') ||
    !timelinePreviewSyncText.includes('if (video.paused || video.ended) writeTransportPosition()') ||
    !timelinePreviewVideoBindingText.includes('useTimelinePreviewVideoBinding') ||
    !timelinePreviewVideoBindingText.includes('useTimelineDocumentTransportController') ||
    !timelinePreviewVideoBindingText.includes('useTimelineTransportSnapshotReader') ||
    !timelinePreviewVideoBindingText.includes('useTimelineTransportStoreBinding') ||
    !timelinePreviewVideoBindingText.includes('useTimelineVideoPreviewSyncController') ||
    !timelinePreviewVideoBindingText.includes('useTimelineMediaReaderSummary') ||
    !timelinePreviewVideoBindingText.includes('mergeTimelineMediaReaderSummaryWithSource') || !timelinePreviewVideoBindingText.includes('readerDurationSeconds: resolvedMediaReaderSummary.durationSeconds') ||
    !timelinePreviewVideoBindingText.includes('handleVideoElement') ||
    !timelinePreviewVideoBindingText.includes('readVideo: () => videoElementRef.current') ||
    !videoSequenceExportText.includes('renderVideoSequenceExport') ||
    !videoSequenceExportText.includes('downloadVideoSequenceExport') ||
    !videoSequenceExportText.includes('MediaRecorder') ||
    !videoSequenceExportText.includes('captureStream') ||
    !videoSequenceExportText.includes('createMediaElementSource') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportEvent') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportOutcome') ||
    !videoSequenceExportText.includes('createVideoSequenceExportSessionRecord') ||
    !videoSequenceExportText.includes('reduceVideoSequenceExportSessionRecord') ||
    !videoSequenceExportText.includes('groupVideoSequenceExportSessions') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportRetryError') ||
    !videoSequenceExportText.includes('buildVideoSequenceExportSessionCollection') ||
    !videoSequenceExportText.includes('selectVideoSequenceExportSessionSurfaceSessions') ||
    !videoSequenceExportText.includes('buildVideoSequenceExportSessionSurfaceModel') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportRetryControl') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportRetryRequest') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportSessionToneStyle') ||
    !videoSequenceExportText.includes('upsertVideoSequenceExportSessionHistory') ||
    !videoSequenceExportText.includes('buildVideoSequenceExportProgress') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportErrorCode') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportErrorFeedback') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportErrorMessage') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportPlanError') ||
    !videoSequenceExportText.includes('completedSegments') ||
    !videoSequenceExportText.includes('totalSegments') ||
    !videoSequenceExportText.includes('onEvent?: (event: VideoSequenceExportEvent) => void') ||
    !videoSequenceExportText.includes('signal?: AbortSignal') ||
    !videoSequenceExportText.includes('downloadBlob') ||
    !videoSequenceExportText.includes('resolveTimelinePlanSourceUrl') ||
    !videoSequenceExportText.includes('loadTimelinePlanVideoMetadata') ||
    videoSequenceExportText.includes('resolveVideoSequenceSourceRuntimeUrl') ||
    !videoSequenceExportText.includes('hasMask') ||
    !videoSequenceExportText.includes('hasGrade') ||
    !ganttTransportChromeModelText.includes('Cancel edited video export') ||
    videoSequenceExportText.includes('/Users/') ||
    videoSequenceExportText.includes(['blender', 'blender'].join('/'))
  ) {
    throw new Error('expected video sequence export to render source-backed edited video/audio downloads through neutral browser media APIs without hardcoded fixture paths')
  }
  if (
    !floatingTypeText.includes('timelineTransportPosition') ||
    !floatingTypeText.includes('setTimelineTransportState') ||
    !uiInitialStateText.includes('timelineTransportPosition: 0') ||
    !uiInitialStateText.includes('setTimelineTransportState') ||
    !mediaCanvasText.includes('useTimelinePreviewMediaCanvasBinding') ||
    !mediaCanvasText.includes('TimelinePreviewMediaCanvasFrame') ||
    !mediaCanvasText.includes('mediaCanvasBinding.frameModel') ||
    !timelinePreviewMediaCanvasBindingText.includes('useCommandMenuRichMediaInventory') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelineDocumentStoreBinding') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelineGanttSelectionStoreBinding') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewMediaContext') ||
    timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewMediaCanvasBindingText.includes('collection: previewRouteEntry.bootstrap.collection') ||
    !timelinePreviewMediaCanvasBindingText.includes('documentKey: previewRouteEntry.bootstrap.documentKey') ||
    !timelinePreviewMediaCanvasBindingText.includes('exportPlan: previewRouteEntry.bootstrap.exportPlan') ||
    !timelinePreviewMediaCanvasBindingText.includes('intent: previewRouteEntry.intent') ||
    !timelinePreviewMediaCanvasBindingText.includes('frameModel: previewMediaContext.mediaCanvasFrame') ||
    !timelinePreviewBootstrapText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewBootstrapText.includes('useTimelinePreviewCollection') ||
    !timelinePreviewBootstrapText.includes('cleanTimelinePreviewDocumentKey') ||
    !timelinePreviewBootstrapText.includes('const documentKey = cleanTimelinePreviewDocumentKey(args.markdownDocumentName)') ||
    !timelinePreviewBootstrapText.includes('() => collection.previewPlan || collection.exportPlan') ||
    !timelinePreviewCollectionText.includes('useTimelinePreviewCollection') ||
    !timelinePreviewCollectionText.includes('useTimelinePreviewMediaSession') ||
    !timelinePreviewCollectionText.includes('shouldIncludeTimelinePreviewCollectionItem') ||
    !timelinePreviewCollectionText.includes("source: 'video-sequence'") ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewMediaContext') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewSurfaceModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionChromeModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionBodyModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionsModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewMediaCanvasRenderModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewMediaCanvasFrameModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewSurfaceShellModel') ||
    !timelinePreviewScopeProjectionText.includes('useTimelinePreviewScopeProjection') ||
    !timelinePreviewScopeProjectionText.includes('buildVideoSequenceTimelineScopes') ||
    !timelinePreviewScopeProjectionText.includes('sourceCount') ||
    !timelinePreviewScopeProjectionText.includes('spanCount') ||
    !timelinePreviewMonitorContextText.includes('useTimelinePreviewMonitorContext') ||
    !timelinePreviewMonitorContextText.includes('useTimelinePreviewMediaContext') ||
    !timelinePreviewMonitorContextText.includes('useTimelinePreviewScopeProjection') ||
    !timelinePreviewMonitorContextText.includes('monitorScopes: scopeProjection.monitorScopes') ||
    !timelinePreviewMonitorBindingText.includes('useTimelinePreviewMonitorBinding') ||
    !timelinePreviewMonitorBindingText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewMonitorBindingText.includes('useTimelinePreviewMonitorContext') ||
    timelinePreviewMonitorBindingText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewMonitorBindingText.includes('collection: previewRouteEntry.bootstrap.collection') ||
    !timelinePreviewMonitorBindingText.includes('documentKey: previewRouteEntry.bootstrap.documentKey') ||
    !timelinePreviewMonitorBindingText.includes('exportPlan: previewRouteEntry.bootstrap.exportPlan') ||
    !timelinePreviewMonitorBindingText.includes('intent: previewRouteEntry.intent') ||
    !timelinePreviewMonitorBindingText.includes('monitorScopes: previewMonitorContext.monitorScopes') ||
    !timelinePreviewRouteEntryText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewRouteEntryText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewRouteEntryText.includes("args.intent === 'media' ? previewBootstrap.collection.sequenceMaxMinutes : args.maxMinutes") ||
    !timelinePreviewRouteEntryText.includes("args.intent === 'media' ? 0 : args.positionMinutes") ||
    !timelinePreviewRouteEntryText.includes('bootstrap: previewBootstrap') ||
    !ganttTransportPreviewSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !ganttTransportPreviewSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !ganttTransportPreviewSessionText.includes('useTimelinePreviewMonitorBinding') ||
    !ganttTransportPreviewSessionText.includes('sourceCount: videoSequenceModel?.sources.length || 0') ||
    !ganttTransportPreviewSessionText.includes('spanCount: args.taskSpans.length') ||
    !ganttTransportPreviewSessionText.includes('buildVideoSequenceExportPlan') ||
    !ganttTransportPreviewSessionText.includes('resolveVideoSequenceExportPlanError') ||
    !ganttTransportSessionText.includes('useGanttTimelineTransportSession') ||
    !ganttTransportSessionText.includes('useTimelineDocumentStoreBinding') ||
    !ganttTransportSessionText.includes('useTimelineGanttSelectionStoreBinding') ||
    !ganttTransportSessionText.includes('useTimelineTransportStoreBinding') ||
    !ganttTransportSessionText.includes('useTimelineDocumentTransportController') ||
    !ganttTransportSessionText.includes('cleanTimelinePreviewDocumentKey') ||
    !ganttTransportSessionText.includes('useGanttTimelineMediaDuration') ||
    !ganttTransportSessionText.includes('useGanttTimelineDisplayModel') ||
    !ganttTransportSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !ganttTransportSessionText.includes('buildVideoSequenceTimelineToolStatus') ||
    ganttTransportSessionText.includes('buildVideoSequenceExportPlan') ||
    ganttTransportSessionText.includes('resolveVideoSequenceExportPlanError') ||
    ganttTransportSessionText.includes('useTimelinePreviewMonitorBinding') ||
    ganttTransportSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !ganttTransportSessionText.includes('resolveVisibleVideoSequenceTimelineLaneCount') ||
    !timelinePreviewActivitySurfaceModelText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !timelinePreviewActivitySurfaceModelText.includes("args.activityMode === 'selection' || args.activityMode === 'playhead'") ||
    !timelinePreviewFamilyCompactionModelText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !timelinePreviewFamilyCompactionModelText.includes("if (args.intent !== 'media') return false") ||
    !timelinePreviewFamilyDisclosureControllerText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('React.useSyncExternalStore') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('React.useEffect') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('EMPTY_TIMELINE_PREVIEW_FAMILY_DISCLOSURE_SET') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('familyIds: readonly string[]') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('if (autoExpandFamilyId && familyIdSet.has(autoExpandFamilyId))') ||
    !timelinePreviewFamilyDisclosureModelText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !timelinePreviewFamilyDisclosureModelText.includes('controller: TimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewFamilyDisclosureModelText.includes('toggleFamily') ||
    timelinePreviewFamilyDisclosureModelText.includes('React.useState') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('headerVisible: toggleVisible') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('cardsLabel') ||
    !timelinePreviewFamilySectionChromeModelText.includes('useTimelinePreviewFamilySectionChromeModel') ||
    !timelinePreviewFamilySectionChromeModelText.includes('handleToggle: () => args.familyDisclosure.toggleFamily') ||
    !timelinePreviewFamilySectionChromeModelText.includes("icon: sectionLayout.familySurface.toggleMode === 'collapse' ? 'collapse' : 'expand'") ||
    !timelinePreviewFamilySectionChromeModelText.includes('dataValue: sectionLayout.familySummaryVisible ? sectionLayout.familySummaryLabel : undefined') ||
    !timelinePreviewFamilySectionBodyModelText.includes('useTimelinePreviewFamilySectionBodyModel') ||
    !timelinePreviewFamilySectionBodyModelText.includes('cardsLabel: sectionLayout.cardsLabel') ||
    !timelinePreviewFamilySectionBodyModelText.includes('props: {') ||
    !timelinePreviewFamilySectionBodyModelText.includes('documentKey: args.documentKey') ||
    !timelinePreviewFamilySectionBodyModelText.includes('exportPlan: args.exportPlan') ||
    !timelinePreviewFamilySectionBodyModelText.includes('sequenceMaxMinutes: args.sequenceMaxMinutes') ||
    !timelinePreviewFamilySectionsModelText.includes('useTimelinePreviewFamilySectionsModel') ||
    !timelinePreviewFamilySectionsModelText.includes('const bodySectionByFamilyId = new Map(') ||
    !timelinePreviewFamilySectionsModelText.includes('const sectionBody = bodySectionByFamilyId.get(sectionChrome.familyId)') ||
    !timelinePreviewFamilySectionsModelText.includes('cardsLabel: sectionBody.cardsLabel') ||
    !timelinePreviewFamilySectionsModelText.includes('surfaces: sectionBody.surfaces') ||
    !timelinePreviewMediaCanvasRenderModelText.includes('useTimelinePreviewMediaCanvasRenderModel') ||
    !timelinePreviewMediaCanvasRenderModelText.includes("contentMode: args.surfaceShell.hasItems ? 'sections' : 'empty'") ||
    !timelinePreviewMediaCanvasRenderModelText.includes('hostAttributes: {') ||
    !timelinePreviewMediaCanvasRenderModelText.includes('listLabel: args.familySections.listLabel') ||
    !timelinePreviewMediaCanvasRenderModelText.includes('shellLabel: args.surfaceShell.shellLabel') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('useTimelinePreviewMediaCanvasFrameModel') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('hostAttributes: args.renderModel.hostAttributes') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('renderModel: args.renderModel') ||
    !timelinePreviewMediaCanvasFrameText.includes('TimelinePreviewMediaCanvasFrame') ||
    !timelinePreviewMediaCanvasFrameText.includes('data-kg-media-canvas-group-count') ||
    !timelinePreviewMediaCanvasFrameText.includes('<TimelinePreviewMediaCanvasRender model={args.model.renderModel} />') ||
    !timelinePreviewSurfaceShellModelText.includes('useTimelinePreviewSurfaceShellModel') ||
    !timelinePreviewSurfaceShellModelText.includes("shellLabel: 'Media canvas'") ||
    !timelinePreviewSurfaceShellModelText.includes("titleLabel: 'Media'") ||
    !timelinePreviewSurfaceShellModelText.includes('collapsedFamilyCount') ||
    !timelinePreviewSurfaceShellModelText.includes('groupCount: args.familySectionLayout.sections.length') ||
    !timelinePreviewMediaContextText.includes("autoExpandFamilyId: sourceActivity.activityMode === 'fallback'") ||
    !timelinePreviewMediaContextText.includes('useTimelineSourceActivityModel') ||
    !timelineSourceActivityModelText.includes('useTimelineSourceActivityModel') ||
    !timelineSourceActivityModelText.includes('resolveTimelinePlanSegmentAtPosition') ||
    !timelineSourceActivityModelText.includes('areVideoSequenceExportSourcesEqual') ||
    !timelineSourceActivityModelText.includes("export type TimelineSourceActivityMode = 'selection' | 'playhead' | 'fallback' | 'empty'") ||
    !timelineSourceActivityModelText.includes('if (args.selectionActive) return args.collection.previewPlan || null') ||
    !timelineSourceActivityModelText.includes('selectedSegmentResolution?.contains ? selectedSegmentResolution.segment : null') ||
    !timelineSourceActivityModelText.includes("? 'empty'") ||
    !timelinePlanSyncText.includes('if (selectedRowKey && !selectedSpan) return null') ||
    !timelinePlanSyncText.includes('canTimelineSegmentDriveMediaPreview') ||
    !timelinePlanSyncText.includes("if (lane === 'audio') return sourceKind === 'audio' || sourceKind === 'video'") ||
    !timelinePlanSyncText.includes("return lane === 'video' && sourceKind === 'video'") ||
    !timelinePlanSyncText.includes('if (args.mediaPreviewOnly && !canTimelineSegmentDriveMediaPreview(segment, source)) return []') ||
    !timelinePreviewActivitySurfaceModelText.includes("if (args.activityMode === 'empty')") ||
    !timelinePreviewActivitySurfaceModelText.includes('families: []') ||
    !timelinePreviewSurfaceModelText.includes('useTimelinePreviewSurfaceModel') ||
    !timelinePreviewSurfaceModelText.includes('resolveTimelinePreviewFamilyId') ||
    !timelinePreviewSurfaceModelText.includes('isTimelinePreviewItemVisibleForSurfaceIntent') ||
    !timelinePreviewSurfaceText.includes('TimelinePreviewSurface') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-sync') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader-duration') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader-frame-rate') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader-resolution') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-count') ||
    timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-strip') ||
    timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-format') ||
    timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-raster-format') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-image-format-preference') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-video-format-preference') ||
    !mediaFormatPreferenceText.includes("MEDIA_IMAGE_FORMAT_PREFERENCE = ['svg', 'webp', 'png', 'jpeg']") ||
    !mediaFormatPreferenceText.includes("MEDIA_VIDEO_FORMAT_PREFERENCE = ['mp4', 'webm']") ||
    !timelinePreviewSurfaceText.includes('videoPoster={videoPoster}') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-active') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-dimmed') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-collapsed') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-disclosure-state') ||
    !timelinePreviewSurfaceText.includes('useTimelinePreviewVideoBinding') ||
    !timelinePreviewSurfaceText.includes('videoControls={syncEnabled ? false : undefined}') ||
    !timelinePreviewSurfaceText.includes('onVideoElement={args.item.kind ===') ||
    !timelinePreviewSurfaceText.includes('buildStaticRichMediaPanelOverlayState') ||
    !mediaCanvasText.includes('<TimelinePreviewMediaCanvasFrame') ||
    !mediaCanvasText.includes('model={mediaCanvasBinding.frameModel}') ||
    !timelinePreviewMediaCanvasRenderText.includes('TimelinePreviewMediaCanvasRender') ||
    !timelinePreviewMediaCanvasRenderText.includes('TimelinePreviewSurface') ||
    !timelinePreviewMediaCanvasRenderText.includes('aria-label={args.model.listLabel}') ||
    !timelinePreviewMediaCanvasRenderText.includes('aria-label={args.model.emptyState.label}') ||
    !timelinePreviewMediaCanvasRenderText.includes('{args.model.emptyState.message}') ||
    !timelinePreviewMediaCanvasRenderText.includes('title={section.toggle.title}') ||
    !timelinePreviewMediaCanvasRenderText.includes('onClick={section.toggle.handleToggle}') ||
    !timelinePreviewMediaCanvasRenderText.includes("section.toggle.icon === 'collapse'") ||
    !timelinePreviewMediaCanvasRenderText.includes('key={surface.renderKey}') ||
    !timelinePreviewMediaCanvasRenderText.includes('{...surface.props}') ||
    mediaCanvasText.includes("querySelector('video')") ||
    mediaCanvasText.includes('useTimelinePreviewVideoBinding') ||
    mediaCanvasText.includes('useTimelineVideoPreviewSyncController') ||
    mediaCanvasText.includes('useTimelineDocumentTransportController') ||
    mediaCanvasText.includes('useTimelineTransportSnapshotReader') ||
    mediaCanvasText.includes('useTimelineTransportStoreBinding') ||
    mediaCanvasText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    mediaCanvasText.includes('useGraphStore.getState()') ||
    mediaCanvasText.includes('markdownDocumentName: s.markdownDocumentName') ||
    mediaCanvasText.includes('markdownText: s.markdownDocumentText') ||
    mediaCanvasText.includes('selectedGanttRowKey: s.mermaidDiagramSelectedRowKeyByKind.gantt') ||
    mediaCanvasText.includes('timelineTransportDocumentKey') ||
    mediaCanvasText.includes('timelineTransportPosition') ||
    mediaCanvasText.includes('timelineTransportPlaying') ||
    mediaCanvasText.includes('timelineTransportPlaybackRate') ||
    mediaCanvasText.includes('resolveVideoSequenceTimelineMediaSeconds') ||
    mediaCanvasText.includes('resolveVideoSequenceTimelinePositionMinutes') ||
    mediaCanvasText.includes('resolveVideoSequenceSourceRuntimeUrl') ||
    mediaCanvasText.includes('transportDocumentKey === documentKey && transportPlaying')
  ) {
    throw new Error('expected Media Canvas video playback and BottomPanel Timeline slider to share the neutral Gantt transport state')
  }
  if (!/<GanttTimelineTransportPanel\b[^>]*code=\{mediaGanttCode\}[^>]*compact=\{compact\}[^>]*mode="media"[^>]*\/>/.test(timelineBottomText) ||
    timelineBottomText.includes('TimelineVideoSequenceEmptyState') ||
    timelineBottomText.includes('TimelineVideoSequenceEmptyDropState') ||
    timelineBottomText.includes('onDropMedia={rulerModel.onDropMedia}')) {
    throw new Error('expected empty BottomPanel Timeline to reuse the shared Gantt transport shell instead of a separate empty Timeline UI')
  }
  if (
    !localImportText.includes('materializeVideoSequenceTimelineImportDocument') ||
    !localImportText.includes('pushLocalVideoSequenceImportAsset') ||
    !localImportText.includes('pruneVideoSequenceSourceDocuments') ||
    !localImportText.includes('args.fs.deleteEntry(path)') ||
    !localImportText.includes("inferCorpusMediaKind(args.originalName || args.relativePath, args.file.type) !== 'video'") ||
    !localImportText.includes('applyToGraph: true') ||
    !urlImportText.includes('materializeVideoSequenceTimelineImportDocument') ||
    !urlImportText.includes("sourceUnit.mediaKind === 'video'") ||
    !urlImportText.includes('removedVideoSourcePaths') ||
    !urlImportText.includes('args.fs.deleteEntry(normalized)') ||
    !urlContentText.includes('looksLikeVideo') ||
    !urlContentText.includes('buildCorpusMediaMetadataMarkdown') ||
    !urlContentText.includes("sourceMediaKind: 'video'") ||
    !videoSequenceImportText.includes('kgVideoSequenceTimeline: true') ||
    !videoSequenceImportText.includes('type: mermaid_gantt')
  ) {
    throw new Error('expected local-file and URL video imports to materialize a shared source-backed video sequence Timeline document')
  }
  for (const forbidden of ['/Users/', 'agentic-graph-research-agent-demo', 'agentic-graph-missalph-demo']) {
    if (
      localImportText.includes(forbidden) ||
      urlImportText.includes(forbidden) ||
      urlContentText.includes(forbidden) ||
      videoSequenceImportText.includes(forbidden)
    ) {
      throw new Error(`expected video sequence import projection to avoid hardcoded fixture token ${forbidden}`)
    }
  }
  if (!resolverText.includes('readTypedMermaidDiagramCodes') || !resolverText.includes('mermaid_gantt')) {
    throw new Error('expected typed Mermaid diagram parsing to live in the shared resolver')
  }
  if (!resolverText.includes('mermaid_timeline') || !resolverText.includes('readTimelineRowKind')) {
    throw new Error('expected typed Timeline parsing to live in the shared resolver')
  }
  if (
    !resolverText.includes('mermaid_architecture') ||
    !resolverText.includes('mermaid_eventmodeling') ||
    !resolverText.includes('readArchitectureRowKind') ||
    !resolverText.includes('readEventModelingRowKind')
  ) {
    throw new Error('expected typed Architecture and Event Modeling parsing to live in the shared resolver')
  }
}
