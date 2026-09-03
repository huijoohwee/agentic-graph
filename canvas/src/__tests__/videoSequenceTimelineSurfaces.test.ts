import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildVideoSequenceTimelineCueSamples,
  buildVideoSequenceTimelineFrameSamples,
  buildVideoSequenceTimelineScopes,
  buildVideoSequenceTimelineWaveformSamples,
  VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  formatVideoSequenceTimelineSecondsOffset,
  resolveRenderableVideoSequenceTimelineSpans,
  resolveVideoSequenceTimelineMediaSeconds,
  resolveVideoSequenceTimelineLane,
  resolveVideoSequenceTimelinePositionMinutes,
  resolveVideoSequenceTimelineUnitsPerMs,
  resolveVideoSequenceTimelineDisplayLaneId,
  resolveVisibleVideoSequenceTimelineLaneCount,
  resolveVisibleVideoSequenceTimelineDisplayLanes,
  resolveVisibleVideoSequenceTimelineLanes,
  type VideoSequenceTimelineSource,
} from '@/components/timeline/videoSequenceTimeline'
import {
  areVideoSequenceExportSourcesEqual,
  buildVideoSequenceExportPlan,
} from '@/components/timeline/videoSequenceExport'
import {
  buildTimelinePreviewSyncPlan,
  resolveTimelinePlanSegmentAtPosition,
  resolveTimelinePlanPositionFromSourceTime,
  resolveTimelinePlanSourceTimeAtPosition,
} from '@/components/timeline/timelinePlanSync'
import {
  buildMermaidGanttTimelineModel,
  insertMermaidGanttVideoSequenceOperationRow,
  reorderMermaidGanttVideoSequenceClipDisplayLane,
  resolveMermaidGanttTimelineDragEffectiveDelta,
  resolveMermaidGanttTimelineDragPreviewSpan,
  splitMermaidGanttVideoSequenceClipAtOffset,
  updateMermaidGanttCodeRowTiming,
  updateMermaidGanttVideoSequenceClipTiming,
  updateMermaidGanttVideoSequenceClipGroupTiming,
} from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  normalizeVideoSequenceClipEditDeltaMinutes,
  resolveVideoSequenceClipEditStepMinutes,
} from '@/components/timeline/videoSequenceClipEdit'
import { resolveVideoSequenceClipThumbnails } from '@/components/timeline/videoSequenceClipThumbnailSelection'
import type { TimelineMediaReaderThumbnail } from '@/components/timeline/timelineMediaReader'
const root = process.cwd()
function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}
function buildTestThumbnail(timestampSeconds: number, rasterDataUrl: string): TimelineMediaReaderThumbnail {
  return { dataUrl: rasterDataUrl, format: 'png', height: 90, mimeType: 'image/png', rasterDataUrl, rasterFormat: 'png', rasterMimeType: 'image/png', timestampSeconds, width: 160 }
}

export function testVideoFilenameAudioTokenKeepsVideoThumbnailLane() {
  const [sourceVideo, derivedAudio] = buildMermaidGanttTimelineModel(['gantt', '  title Video Sequence Timeline', '  dateFormat HH:mm', '  section Source video',
    '  agenticOs_20260713t142754z-video-audio-45-second-master.mp4 : clip_master, kgsrc_0_45, kgpos_0, 45m',
    '  agenticOs_20260713t142754z-video-audio-45-second-master.mp4 audio : clip_master_audio, kgsrc_0_45, kgpos_0, 45m'].join('\n')).taskSpans
  if (!sourceVideo || resolveVideoSequenceTimelineLane(sourceVideo) !== 'video') throw new Error('expected a video filename containing an audio token to remain in the thumbnail-backed Video lane')
  if (!derivedAudio || resolveVideoSequenceTimelineLane(derivedAudio) !== 'audio') throw new Error('expected an explicit derived audio track to remain in the waveform-backed Audio lane')
}
export function testVideoSequenceClipThumbnailsKeepNativeVideoFrameReel() {
  const duplicateNativeFrames = [
    buildTestThumbnail(0, 'data:image/png;base64,same-frame'),
    buildTestThumbnail(1, 'data:image/png;base64,same-frame'),
    buildTestThumbnail(2, 'data:image/png;base64,same-frame'),
  ]
  const distinctNativeFrames = [
    buildTestThumbnail(0, 'data:image/png;base64,frame-a'),
    buildTestThumbnail(1, 'data:image/png;base64,frame-b'),
  ]
  const span = buildMermaidGanttTimelineModel(['gantt', '  title Video Sequence Timeline', '  dateFormat HH:mm', '  section Source video', '  Source video : clip_source, kgsrc_0_3, kgpos_0, 3m'].join('\n')).taskSpans[0]
  const sourceWindow = { sourceEndSeconds: 3, sourceStartSeconds: 0, timelineEndMinutes: 3, timelineStartMinutes: 0 }
  const retainedDuplicates = resolveVideoSequenceClipThumbnails({ sourceThumbnails: duplicateNativeFrames, sourceWindow })
  const retainedDistinctFrames = resolveVideoSequenceClipThumbnails({ sourceThumbnails: distinctNativeFrames, sourceWindow })
  if (retainedDuplicates.length !== duplicateNativeFrames.length || retainedDistinctFrames.length !== distinctNativeFrames.length || !span) {
    throw new Error('expected compact source video thumbnails to keep native frame reels even when sampled frames are visually similar')
  }
}
export function testVideoSequenceTimelineClipEditsPreserveFractionalSourceTiming() {
  const code = ['gantt', '  title Video Sequence Timeline', '  dateFormat HH:mm', '  axisFormat %H:%M', '  section Source video', '  Source video : clip_source, kgsrc_0_0_252, kgpos_0, 0.252m'].join('\n')
  const span = buildMermaidGanttTimelineModel(code).taskSpans[0]
  const editStep = resolveVideoSequenceClipEditStepMinutes(span)
  const nudgeDelta = normalizeVideoSequenceClipEditDeltaMinutes(editStep, editStep), pointerMoveDelta = normalizeVideoSequenceClipEditDeltaMinutes(16 * (1 / 960), editStep)
  const dragArgs = { allowTimelineExpansion: true, deltaMinutes: pointerMoveDelta, maxMinutes: 1, mode: 'resize-end' as const, span, stepMinutes: editStep }
  const pointerResizePreview = resolveMermaidGanttTimelineDragPreviewSpan(dragArgs)
  const pointerResizeDelta = resolveMermaidGanttTimelineDragEffectiveDelta(dragArgs)
  const nudged = updateMermaidGanttVideoSequenceClipTiming({
    code,
    deltaMinutes: nudgeDelta,
    mode: 'move',
    rowLineIndex: 5,
    syncMode: 'selected',
  })
  const trimmed = updateMermaidGanttVideoSequenceClipTiming({
    code,
    deltaMinutes: -nudgeDelta,
    mode: 'resize-end',
    rowLineIndex: 5,
    syncMode: 'selected',
  })
  if (
    editStep !== 1 / 60 ||
    pointerMoveDelta !== 0.017 ||
    Math.abs(pointerResizePreview.durationMinutes - 0.269) > 0.0001 ||
    Math.abs(pointerResizeDelta - 0.017) > 0.0001 ||
    !nudged?.includes('kgpos_0_017') || !nudged.includes('kgsrc_0_0_252') ||
    !nudged.includes('0.252m') ||
    !trimmed?.includes('0.235m') ||
    trimmed.includes('1m')
  ) {
    throw new Error(`expected source clip edit tools to preserve fractional timing: ${JSON.stringify({ editStep, nudgeDelta, pointerMoveDelta, pointerResizePreview, pointerResizeDelta, nudged, trimmed })}`)
  }
}
export function testVideoSequenceDisplayLanesStayStableWhenClipMovesAcrossAnother() {
  const code = [
    'gantt',
    '  title Video Sequence Timeline',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Source video',
    '  Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4 : clip_seedance, kgsrc_0_0_86, kgpos_0, 0.86m',
    '  港岛仿生局.mp4 : clip_harbor, kgsrc_0_0_25, kgpos_0_4, 0.25m',
  ].join('\n')
  const movedCode = updateMermaidGanttVideoSequenceClipTiming({
    code,
    deltaMinutes: -0.35,
    mode: 'move',
    rowLineIndex: 6,
    syncMode: 'selected',
  })
  if (!movedCode) throw new Error('expected moved source video clip code')
  const beforeSpans = buildMermaidGanttTimelineModel(code).taskSpans
  const afterSpans = buildMermaidGanttTimelineModel(movedCode).taskSpans
  const beforeHarbor = beforeSpans.find(span => span.label === '港岛仿生局.mp4')
  const afterHarbor = afterSpans.find(span => span.label === '港岛仿生局.mp4')
  if (!beforeHarbor || !afterHarbor) throw new Error('expected harbor clip before and after drag')
  const beforeLane = resolveVideoSequenceTimelineDisplayLaneId(beforeHarbor, beforeSpans)
  const afterLane = resolveVideoSequenceTimelineDisplayLaneId(afterHarbor, afterSpans)
  if (
    !beforeLane.startsWith('video:') ||
    afterLane !== beforeLane ||
    afterHarbor.startMinutes >= beforeHarbor.startMinutes
  ) {
    throw new Error(`expected horizontal clip drag to preserve source display lane, got ${JSON.stringify({ afterLane, afterHarbor, beforeLane, beforeHarbor, movedCode })}`)
  }
}
export function testVideoSequenceClipVerticalDragReordersDisplayLane() {
  const code = [
    'gantt',
    '  title Video Sequence Timeline',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Source video',
    '  flower.mp4 : clip_flower, kgsrc_0_0_05, kgpos_0, 0.05m',
    '  Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4 : clip_seedance, kgsrc_0_0_86, kgpos_0_22, 0.86m',
  ].join('\n')
  const beforeSpans = buildMermaidGanttTimelineModel(code).taskSpans
  const seedanceBefore = beforeSpans.find(span => span.label === 'Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4')
  if (!seedanceBefore) throw new Error('expected seedance clip before reorder')
  const beforeLane = resolveVideoSequenceTimelineDisplayLaneId(seedanceBefore, beforeSpans)
  const beforeLaneLabel = resolveVisibleVideoSequenceTimelineDisplayLanes(beforeSpans).find(lane => lane.id === beforeLane)?.label
  const reordered = reorderMermaidGanttVideoSequenceClipDisplayLane({
    code,
    displayLaneDelta: -1,
    rowLineIndex: seedanceBefore.lineIndex,
  })
  if (!reordered) throw new Error('expected vertical drag to reorder display lane')
  const afterSpans = buildMermaidGanttTimelineModel(reordered.code).taskSpans
  const seedanceAfter = afterSpans.find(span => span.label === 'Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4')
  if (!seedanceAfter) throw new Error('expected seedance clip after reorder')
  const afterLane = resolveVideoSequenceTimelineDisplayLaneId(seedanceAfter, afterSpans)
  const afterLaneLabel = resolveVisibleVideoSequenceTimelineDisplayLanes(afterSpans).find(lane => lane.id === afterLane)?.label
  if (
    afterLane !== 'video:seedance_2_0_is_on_artlist_77fant935ie' ||
    beforeLaneLabel !== 'V2' ||
    afterLaneLabel !== 'V1' ||
    reordered.lineIndex !== 5 ||
    !reordered.code.includes('  Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4 : clip_seedance, kgsrc_0_0_86, kgpos_0_22, 0.86m\n  flower.mp4 : clip_flower')
  ) {
    throw new Error(`expected vertical clip drag to move Seedance to the upper display lane, got ${JSON.stringify({ afterLane, afterLaneLabel, afterSpans, beforeLane, beforeLaneLabel, reordered })}`)
  }
}
export function testVideoSequenceTimelineSurfacesAreRuntimeReady() {
  const controlsText = readSource('components', 'timeline', 'TimelineTransportControls.tsx')
  const controlsCssText = readSource('components', 'timeline', 'TimelineTransportControls.css')
  const clipEditText = readSource('components', 'timeline', 'videoSequenceClipEdit.ts')
  const mediaCanvasText = readSource('components', 'MediaCanvas.tsx')
  const previewMediaCanvasBindingText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasBinding.ts')
  const previewBootstrapText = readSource('components', 'timeline', 'useTimelinePreviewBootstrap.ts')
  const previewRouteEntryText = readSource('components', 'timeline', 'useTimelinePreviewRouteEntry.ts')
  const previewCollectionText = readSource('components', 'timeline', 'useTimelinePreviewCollection.ts')
  const previewActivitySurfaceModelText = readSource('components', 'timeline', 'useTimelinePreviewActivitySurfaceModel.ts')
  const previewFamilyCompactionModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilyCompactionModel.ts')
  const previewFamilyDisclosureControllerText = readSource('components', 'timeline', 'useTimelinePreviewFamilyDisclosureController.ts')
  const previewFamilyDisclosureModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilyDisclosureModel.ts')
  const previewFamilyDisclosureSurfaceModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilyDisclosureSurfaceModel.ts')
  const previewFamilySectionLayoutModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionLayoutModel.ts')
  const previewFamilySectionChromeModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionChromeModel.ts')
  const previewFamilySectionBodyModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionBodyModel.ts')
  const previewFamilySectionsModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionsModel.ts')
  const previewMediaContextText = readSource('components', 'timeline', 'useTimelinePreviewMediaContext.ts')
  const previewScopeProjectionText = readSource('components', 'timeline', 'useTimelinePreviewScopeProjection.ts')
  const previewMonitorContextText = readSource('components', 'timeline', 'useTimelinePreviewMonitorContext.ts')
  const previewMonitorBindingText = readSource('components', 'timeline', 'useTimelinePreviewMonitorBinding.ts')
  const previewMediaCanvasRenderModelText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasRenderModel.ts')
  const previewMediaCanvasRenderText = readSource('components', 'timeline', 'TimelinePreviewMediaCanvasRender.tsx')
  const previewMediaCanvasFrameModelText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasFrameModel.ts')
  const previewMediaCanvasFrameText = readSource('components', 'timeline', 'TimelinePreviewMediaCanvasFrame.tsx')
  const previewSurfaceShellModelText = readSource('components', 'timeline', 'useTimelinePreviewSurfaceShellModel.ts')
  const timelineSourceActivityModelText = readSource('components', 'timeline', 'useTimelineSourceActivityModel.ts')
  const previewSurfaceModelText = readSource('components', 'timeline', 'useTimelinePreviewSurfaceModel.ts')
  const previewSurfaceText = readSource('components', 'timeline', 'TimelinePreviewSurface.tsx')
  const timelinePlanSyncText = readSource('components', 'timeline', 'timelinePlanSync.ts')
  const previewSyncText = readSource('components', 'timeline', 'timelinePreviewSync.ts')
  const previewVideoBindingText = readSource('components', 'timeline', 'useTimelinePreviewVideoBinding.ts')
  const mediaReaderText = [readSource('components', 'timeline', 'timelineMediaReader.ts'), readSource('components', 'timeline', 'timelineMediaMetadata.ts')].join('\n')
  const mediaFormatPreferenceText = readSource('lib', 'media', 'mediaFormatPreference.ts')
  const richMediaPanelText = [readSource('components', 'RichMediaPanel.tsx'), readSource('components', 'RichMediaPanelDirectMediaSurface.tsx'), readSource('components', 'useRichMediaPanelSurfaceState.ts')].join('\n')
  const commandMenuCatalogText = [
    readSource('features', 'command-menu', 'MediaCatalogPanel.tsx'),
    readSource('features', 'command-menu', 'MediaCatalogPanelView.tsx'),
    readSource('features', 'command-menu', 'mediaCatalogCandidateItems.tsx'),
    readSource('features', 'command-menu', 'mediaCatalogShared.tsx'),
    readSource('features', 'command-menu', 'mediaCatalogTypes.ts'),
    readSource('features', 'command-menu', 'mediaCatalogUploadedFields.tsx'),
    readSource('features', 'command-menu', 'mediaCatalogUploadedItems.tsx'),
  ].join('\n')
  const forbiddenExternalMediaToolkit = ['media', 'bunny'].join('')
  const rulerText = [
    readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx'),
    readSource('components', 'timeline', 'videoSequenceClipThumbnailSelection.ts'),
    readSource('components', 'timeline', 'videoSequenceSourceThumbnailSet.ts'),
    readSource('components', 'timeline', 'VideoSequenceClipThumbnailStrip.tsx'),
  ].join('\n')
  const rulerCssText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.css')
  if (
    controlsCssText.includes('rgb(130 130 226 / 0.88)') ||
    controlsCssText.includes('rgb(59 130 246 / 0.88)') ||
    controlsCssText.includes('rgb(214 211 255 / 0.42)') ||
    controlsCssText.includes('.timeline-transport-track-handle::after') ||
    rulerCssText.includes('linear-gradient(180deg, rgb(96 165 250 / 0.82), rgb(37 99 235 / 0.84))') ||
    rulerCssText.includes('rgb(37 99 235 / 0.7)')
  ) {
    throw new Error('expected video sequence timeline to remove legacy solid blue bars and visible resize grips')
  }
  const transportPanelText = readSource('features', 'gitgraph', 'GanttTimelineTransportPanel.tsx')
  const transportRouteModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportRouteModel.ts')
  const transportSurfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const transportSurfaceText = readSource('features', 'gitgraph', 'GanttTimelineTransportSurface.tsx')
  const transportCommandModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportCommandModel.ts')
  const transportDocumentActionsText = readSource('features', 'gitgraph', 'useGanttTimelineDocumentActions.ts')
  const transportChromeModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportChromeModel.ts')
  const transportContextControlsText = readSource('features', 'gitgraph', 'GanttTimelineTransportContextControls.tsx')
  const transportHeaderToolsText = readSource('features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx')
  const transportRulerModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportRulerModel.ts')
  const transportRulerText = readSource('features', 'gitgraph', 'GanttTimelineTransportRuler.tsx')
  const transportInteractionModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportInteractionModel.ts')
  const transportShellModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportShellModel.ts')
  const transportShellText = readSource('features', 'gitgraph', 'GanttTimelineTransportShell.tsx')
  const transportPlaybackModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPlaybackModel.ts')
  const transportPreviewSessionText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPreviewSession.ts')
  const transportSessionText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSession.ts')
  const displayModelText = readSource('features', 'gitgraph', 'useGanttTimelineDisplayModel.ts')
  const mediaDurationText = readSource('features', 'gitgraph', 'useGanttTimelineMediaDuration.ts')
  const playbackControlsText = readSource('features', 'gitgraph', 'useGanttTimelinePlaybackControls.ts')
  const selectionSyncText = readSource('features', 'gitgraph', 'useGanttTimelineSelectionSync.ts')
  const timelineFloatingText = readSource('features', 'gitgraph', 'TimelineFloatingPanelView.tsx')
  const graphStateTypeText = readSource('hooks', 'store', 'store-types', 'graph-state-chat-import.ts')
  const uiInitialStateText = readSource('hooks', 'store', 'uiSliceInitialState.ts')
  const sequenceText = readSource('components', 'timeline', 'videoSequenceTimeline.ts')
  const animationEngineText = readSource('components', 'timeline', 'timelineAnimationEngine.ts')
  if (
    controlsText.includes('footer?: React.ReactNode') ||
    controlsText.includes('{footer}') ||
    !controlsText.includes('contextControls?: React.ReactNode') ||
    !controlsText.includes('contextLabel?: React.ReactNode') ||
    !controlsText.includes('contextDetailsLabel?: string') ||
    !controlsText.includes('toolbarControls?: React.ReactNode') ||
    controlsText.includes('rulerAside?: React.ReactNode') ||
    controlsText.includes('rulerBelow?: React.ReactNode') ||
    controlsText.includes('timeline-transport-ruler-aside') ||
    controlsText.includes('timeline-transport-ruler-below') ||
    !controlsText.includes('timeline-player-context') ||
    !controlsText.includes('timeline-transport-status-bar') ||
    controlsText.includes('timeline-player-context-label') ||
    controlsText.includes('timeline-player-info-button') ||
    !controlsText.includes('timeline-transport-status-details') ||
    !controlsText.includes('timeline-transport-status-actions') ||
    !controlsText.includes('timeline-player-toolbar') ||
    !controlsText.includes('timeline-rate-button') ||
    controlsText.includes('<select') ||
    controlsCssText.includes('ant-select') ||
    !controlsCssText.includes('.timeline-tool-menu') ||
    !controlsCssText.includes('.timeline-tool-menu-panel') ||
    !controlsText.includes('const inlineHeaderAside = !titleLabel && !subtitleLabel ? headerAside : null') ||
    controlsText.includes('timeline-transport-chrome-header--tools-only') ||
    !controlsText.includes('showInlineProgress?: boolean') ||
    !controlsText.includes('!showRange && showInlineProgress') ||
    !controlsText.includes('onClick={onTogglePlayback}') ||
    controlsText.includes('onPointerDown={onPlaybackPointerDown}') ||
    !controlsCssText.includes('.timeline-player-progress::-webkit-progress-value') ||
    !controlsCssText.includes('.timeline-transport-chrome--mermaid-gantt .timeline-player-progress') ||
    !controlsCssText.includes('min-height: calc(76px + (var(--kg-video-sequence-lane-count, 4) * var(--kg-video-sequence-lane-height)))') ||
    !controlsCssText.includes('line-height: var(--kg-video-sequence-lane-height)') ||
    controlsCssText.includes('.timeline-transport-ruler-layout:has(.timeline-transport-ruler-aside)') ||
    controlsCssText.includes('.timeline-transport-ruler-below') ||
    !clipEditText.includes('buildVideoSequenceClipEditDetailsLabel') ||
    !clipEditText.includes('Selected clip:') ||
    clipEditText.includes('VideoSequenceClipEditPanel') ||
    clipEditText.includes('data-kg-video-sequence-clip-edit-surface="transport"') ||
    clipEditText.includes('timeline-video-sequence-clip-edit-info') ||
    clipEditText.includes('timeline-video-sequence-clip-edit-title') ||
    clipEditText.includes('timeline-video-sequence-clip-edit-timecode') ||
    !clipEditText.includes("'split-at-playhead'") ||
    !clipEditText.includes("'snap-to-playhead'") ||
    clipEditText.includes('timeline-video-sequence-clip-edit-actions') ||
    clipEditText.includes('aria-label="Clip nudge and trim tools"') ||
    clipEditText.includes("label: 'Snap'") ||
    clipEditText.includes("label: 'Split'") ||
    clipEditText.includes('Clip nudge, trim, split, and snap tools') ||
    clipEditText.includes('timeline-video-sequence-clip-edit-actions') ||
    !controlsCssText.includes('.timeline-player-toolbar') ||
    controlsCssText.includes('.timeline-player-info-button') ||
    !controlsCssText.includes('.timeline-transport-status-bar') ||
    !controlsCssText.includes('.timeline-transport-status-details') ||
    !controlsCssText.includes('.timeline-transport-status-actions') ||
    !controlsText.includes('{contextControls}') ||
    !rulerText.includes('VideoSequenceTimelineRuler') ||
    !rulerText.includes('data-kg-video-sequence-clip-cues="1"') ||
    !rulerText.includes('data-kg-video-sequence-clip-frames="1"') ||
    !['data-kg-video-sequence-audio-waveform="1"', "const waveformSamples = lane === 'audio' && !verticalMarker", 'waveformSamples.length ? ('].every(token => rulerText.includes(token)) ||
    !rulerText.includes('data-kg-video-sequence-ruler-scopes="1"') ||
    !rulerText.includes('data-kg-video-sequence-scope-active-family') ||
    !rulerText.includes('data-kg-video-sequence-scope-activity-mode') ||
    !rulerText.includes('data-kg-video-sequence-scope-selection-active') ||
    !rulerText.includes('data-kg-video-sequence-active-resize-mode') ||
    !rulerText.includes('data-kg-video-sequence-trim-start') ||
    !rulerText.includes('data-kg-video-sequence-trim-end') ||
    !rulerText.includes('timeline-transport-track-handle-grip') ||
    !rulerText.includes('timeline-video-sequence-trim-guide') ||
    !rulerText.includes('timeline-video-sequence-ruler-scope-strip') ||
    !rulerText.includes('timeline-video-sequence-ruler-scope-bars') ||
    !rulerText.includes('buildTimelineAnimationState') ||
    !rulerText.includes("surface: 'bottom-timeline'") ||
    !rulerText.includes('data-kg-animation-object-opacity') ||
    !rulerText.includes('data-kg-animation-svg-attribute-target') ||
    !['data-kg-animation-frame-by-frame', 'data-kg-animation-frame-rate', 'data-kg-animation-frame-timing', 'data-kg-animation-vector-morph-path', 'data-kg-animation-layer-modifiers', 'data-kg-animation-layer-panel', 'data-kg-animation-layer-modes', 'data-kg-animation-layer-properties', 'data-kg-animation-recording-enabled'].every(token => rulerText.includes(token)) ||
    !rulerText.includes('strokeDasharray={animationState.svg.dashArray}') ||
    !['data-kg-video-sequence-keyframes="1"', 'data-kg-video-sequence-vector-morph="1"', 'data-kg-video-sequence-vector-morph-boolean-ops', 'data-kg-video-sequence-vector-morph-path', 'data-kg-video-sequence-vector-morph-shapes', 'data-kg-video-sequence-text-animation="1"', 'data-kg-video-sequence-text-keyframes', 'data-kg-video-sequence-text-properties', 'data-kg-video-sequence-text-scopes', 'data-kg-video-sequence-nested-composite-strip="1"'].every(token => rulerText.includes(token)) ||
    rulerText.includes('timeline-video-sequence-grade-strip') ||
    rulerText.includes('Color grading controls') ||
    rulerText.includes('timeline-video-sequence-ruler-scope-header') ||
    rulerText.includes('<meter') ||
    !sequenceText.includes('VIDEO_SEQUENCE_LANE_HEIGHT_PX = 61') ||
    !sequenceText.includes("VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS: readonly VideoSequenceTimelineLaneId[] = ['mask', 'grade']") || !sequenceText.includes("VIDEO_SEQUENCE_TIMELINE_EMPTY_LANE_IDS: readonly VideoSequenceTimelineLaneId[] = ['video', 'image', 'scene', 'effect']") ||
    !sequenceText.includes('disabledLaneIds?: readonly VideoSequenceTimelineLaneId[]') ||
    !sequenceText.includes('const disabledLaneIds = new Set(options.disabledLaneIds || [])') ||
    !sequenceText.includes('!disabledLaneIds.has(resolveVideoSequenceTimelineLane(span))') ||
    !graphStateTypeText.includes('videoSequenceTimelineLaneVisibility: Record<string, boolean>') ||
    !graphStateTypeText.includes('setVideoSequenceTimelineLaneVisibility: (laneId: string, visible: boolean) => void') ||
    !uiInitialStateText.includes('videoSequenceTimelineLaneVisibility: {') ||
    !uiInitialStateText.includes('setVideoSequenceTimelineLaneVisibility: (laneId: string, visible: boolean)') ||
    !rulerText.includes('disabledLaneIds = VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS') ||
    !rulerText.includes('const projectionOptions = React.useMemo<VideoSequenceTimelineProjectionOptions>') ||
    !rulerText.includes('resolveVisibleVideoSequenceTimelineDisplayLanes(taskSpans, projectionOptions)') ||
    !rulerText.includes('resolveRenderableVideoSequenceTimelineSpans(taskSpans, projectionOptions)') ||
    rulerText.includes("sourceCoverageMode: 'source-covered'") ||
    !rulerText.includes('visibleLanes.map(lane =>') ||
    !['resolveVideoSequenceTimelineDisplayLaneId(span, renderableSpans, projectionOptions)', 'visibleLaneIndexById.get(displayLaneId)', 'data-kg-video-sequence-display-lane', 'data-kg-video-sequence-display-lane-label', 'data-kg-video-sequence-lane-append'].every(token => rulerText.includes(token)) ||
    !['buildVideoSequenceTimelineCueSamples', 'buildVideoSequenceTimelineFrameSamples', 'buildVideoSequenceTimelineWaveformSamples', 'buildVideoSequenceClipMediaCache', 'const clipMediaByRowKey = React.useMemo', "const waveformSamples = lane === 'audio' && !verticalMarker", 'sourceAudioWaveformSamples', "sourceAudioWaveformSamples.length ? 'source' : 'synthetic'"].every(token => rulerText.includes(token)) ||
    !rulerText.includes('timeline-video-sequence-clip-timecode') ||
    !['const bodyMinHeight = Math.max(1, minHeight - VIDEO_SEQUENCE_LANE_TOP_OFFSET_PX)', 'data-kg-video-sequence-ruler-body="1"', 'data-kg-video-sequence-ruler-playhead="1"', 'laneIndex * VIDEO_SEQUENCE_LANE_HEIGHT_PX'].every(token => rulerText.includes(token)) ||
    rulerCssText.includes('transform: translateX(var(--kg-motion-translate-x, 0px)) scale(var(--kg-motion-scale, 1));') ||
    !rulerCssText.includes('.timeline-transport-shell--video-sequence') ||
    !['.timeline-transport-track-clip--lane-effect', '.timeline-transport-track-clip--lane-fbf', '.timeline-transport-track-clip--lane-detached', '.timeline-transport-track-clip--lane-nested', '.timeline-transport-track-clip--lane-modifier', '.timeline-transport-track-clip--lane-record'].every(token => rulerCssText.includes(token)) ||
    !rulerCssText.includes('.timeline-video-sequence-ruler-content .timeline-transport-track-clip-move') ||
    !rulerCssText.includes('inset: 0 12px') ||
    !rulerCssText.includes('touch-action: none') ||
    !rulerCssText.includes('.timeline-video-sequence-ruler-content .timeline-transport-track-handle') ||
    !rulerCssText.includes('z-index: 5') ||
    !rulerCssText.includes('.timeline-video-sequence-ruler-content .timeline-transport-track-handle-grip') ||
    !rulerCssText.includes('.timeline-video-sequence-ruler-content .timeline-transport-track-clip[data-kg-video-sequence-active-resize-mode]') ||
    !rulerCssText.includes('.timeline-video-sequence-trim-guide') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-frame-strip') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-frame') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-cues') ||
    !['.timeline-video-sequence-keyframe-strip', '.timeline-video-sequence-morph-strip', '.timeline-video-sequence-text-strip', '.timeline-video-sequence-nested-strip'].every(token => rulerCssText.includes(token)) ||
    !rulerCssText.includes('.timeline-video-sequence-clip-timecode') ||
    !rulerCssText.includes('.timeline-video-sequence-audio-waveform-bar') ||
    !rulerCssText.includes('.timeline-video-sequence-ruler-scope-strip') ||
    !rulerCssText.includes('.timeline-video-sequence-editor[data-kg-animation-engine="native"]') ||
    !rulerCssText.includes('.timeline-video-sequence-motion-vector') ||
    !rulerCssText.includes('--kg-motion-eased') ||
    rulerCssText.includes('rotate(var(--kg-motion-rotation') ||
    !rulerCssText.includes('@media (prefers-reduced-motion: reduce)') ||
    rulerCssText.includes('.timeline-video-sequence-grade-strip') ||
    rulerCssText.includes('.timeline-video-sequence-ruler-scope-header') ||
    !['grid-column: 1 / -1', 'contain: layout paint style', 'height: var(--kg-timeline-bar-height, calc(var(--kg-main-toolbar-height, 38px) * 1.5))', 'top: calc((var(--kg-video-sequence-lane-count, 13) * var(--kg-video-sequence-lane-height, 61px)) + 2px)'].every(token => rulerCssText.includes(token)) ||
    !rulerCssText.includes('grid-template-columns: repeat(6, minmax(5.5rem, 1fr))') ||
    !rulerCssText.includes('.timeline-video-sequence-ruler-scope-bar') ||
    rulerCssText.includes('.timeline-video-sequence-slot-grid') ||
    !sequenceText.includes('Luma waveform') ||
    !sequenceText.includes('Chroma vectorscope') ||
    !sequenceText.includes('Histogram') ||
    !sequenceText.includes('Audio waveform') ||
    !sequenceText.includes('buildVideoSequenceTimelineCueSamples') ||
    !sequenceText.includes('buildVideoSequenceTimelineFrameSamples') ||
    !sequenceText.includes('buildVideoSequenceTimelineWaveformSamples') ||
    !sequenceText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    !["'css-property'", "'svg-attribute'", "'dom-attribute'", "'js-object'", "'html'", "'canvas-2d'", "'webgl-three'"].every(token => animationEngineText.includes(token)) ||
    !animationEngineText.includes('data-kg-animation-inspired-by') ||
    !["'data-kg-animation-inspired-by': 'motionkit'", "'data-kg-animation-reference': 'blender'", 'TimelineAnimationKeyframe', 'TimelineAnimationProperty', 'TimelineAnimationLayerMode', 'TimelineAnimationNestedMode', 'TimelineAnimationRenderPass', 'TimelineTextAnimationKeyframe', 'TimelineTextAnimationScope', 'TimelineTextAnimationProperty', 'TimelineVectorMorphShape', 'TimelineVectorBooleanOperation', 'buildTimelineTextKeyframes', 'buildTimelineVectorMorphPath', 'data-kg-animation-fbf-workflow', 'data-kg-animation-layer-panel', 'data-kg-animation-nested', 'data-kg-animation-nested-composite', 'data-kg-animation-nested-fps', 'data-kg-animation-keyframe-count', 'data-kg-animation-text-range', 'data-kg-animation-text-keyframes', 'data-kg-animation-text-properties', 'data-kg-animation-text-scopes', 'data-kg-animation-text-font-size', 'data-kg-animation-text-color', 'data-kg-animation-text-letter-spacing', 'data-kg-animation-text-line-height', 'data-kg-animation-vector-morph', 'data-kg-animation-vector-morph-interpolated-path', 'data-kg-animation-vector-morph-shapes', 'data-kg-animation-vector-morph-boolean-ops', 'data-kg-animation-work-area', 'data-kg-animation-recording-mode'].every(token => animationEngineText.includes(token)) ||
    animationEngineText.includes("from 'animejs'") ||
    !sequenceText.includes("export type VideoSequenceTimelineToolId = 'cut' | 'splice' | 'mask' | 'grade' | 'speed' | 'adjustment' | 'transition' | 'keyframe' | 'fbf' | 'detached' | 'nested' | 'morph' | 'text' | 'modifier' | 'record' | 'filter' | 'effect'") ||
    !sequenceText.includes("export type VideoSequenceTimelineLaneId = 'video' | 'image' | 'scene' | 'mask' | 'grade' | 'effect' | 'adjustment' | 'transition' | 'keyframe' | 'fbf' | 'detached' | 'nested' | 'morph' | 'text' | 'modifier' | 'record' | 'filter' | 'audio'") ||
    !sequenceText.includes("export type VideoSequenceTimelineSourceCoverageMode = 'authored' | 'source-covered'") ||
    !sequenceText.includes("if (options.sourceCoverageMode !== 'source-covered') return enabledBaseSpans") ||
    !sequenceText.includes('VIDEO_SEQUENCE_TIMELINE_OPERATION_TOOL_IDS') ||
    !transportPanelText.includes('useGanttTimelineTransportRouteModel') ||
    !transportPanelText.includes('GanttTimelineTransportSurface') ||
    transportPanelText.includes('useGanttTimelineTransportSurfaceModel') ||
    transportPanelText.includes('useGanttTimelineTransportSession') ||
    transportPanelText.includes('useGanttTimelineTransportCommandModel') ||
    transportPanelText.includes('useGanttTimelineTransportPlaybackModel') ||
    transportPanelText.includes('useGanttTimelineTransportInteractionModel') ||
    transportPanelText.includes('useGanttTimelineTransportChromeModel') ||
    transportPanelText.includes('useGanttTimelineTransportRulerModel') ||
    transportPanelText.includes('useGanttTimelineTransportShellModel') ||
    transportPanelText.includes('useGanttTimelineDocumentActions') ||
    transportPanelText.includes('useGanttTimelineInteractions') ||
    transportPanelText.includes('useGanttTimelineSelectionSync') ||
    transportPanelText.includes('useGanttTimelineTransportView') ||
    transportPanelText.includes('resolveMermaidGanttTimelineRowKeyAtPosition') ||
    transportPanelText.includes('handleVideoSequenceClipEdit') ||
    transportPanelText.includes('showInlineProgress={false}') ||
    transportPanelText.includes('contextControls={<GanttTimelineTransportContextControls') ||
    transportPanelText.includes('headerAside={<GanttTimelineTransportHeaderTools') ||
    transportPanelText.includes('ruler={<GanttTimelineTransportRuler') ||
    transportPanelText.includes('rulerAside={(') ||
    transportPanelText.includes('rulerBelow={(') ||
    transportPanelText.includes('VideoSequenceClipEditPanel') ||
    transportPanelText.includes('VideoSequenceMonitorPanel') ||
    transportPanelText.includes('VideoSequenceTimelineRuler') ||
    transportPanelText.includes('scopes={monitorScopes}') ||
    transportPanelText.includes('<TimelineTransportChrome') ||
    transportPanelText.includes('useGanttTimelinePlaybackControls') ||
    transportPanelText.includes('useTimelineTransportPlayback({') ||
    transportPanelText.includes('useTimelinePreviewMonitorBinding') ||
    transportPanelText.includes('useTimelinePreviewBootstrap') ||
    transportPanelText.includes('useTimelinePreviewMonitorContext') ||
    transportPanelText.includes('previewMonitorContext.monitorScopes') ||
    transportPanelText.includes('previewBootstrap.collection') ||
    transportPanelText.includes('previewBootstrap.documentKey') ||
    transportPanelText.includes('previewBootstrap.exportPlan') ||
    transportPanelText.includes('buildVideoSequenceExportPlan') ||
    transportPanelText.includes('resolveVisibleVideoSequenceTimelineLaneCount') ||
    transportPanelText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    transportPanelText.includes('buildVideoSequenceTimelineToolStatus') ||
    transportPanelText.includes('useGanttTimelineDisplayModel') ||
    transportPanelText.includes('useGanttTimelineMediaDuration') ||
    transportPanelText.includes('cleanTimelinePreviewDocumentKey') ||
    transportPanelText.includes('data-kg-video-sequence-export="video"') ||
    transportPanelText.includes('data-kg-video-sequence-export="audio"') ||
    transportPanelText.includes('data-kg-video-sequence-export="retry"') ||
    transportPanelText.includes('timeline-transport-export-session') ||
    transportPanelText.includes("'--kg-video-sequence-lane-count': visibleLaneCount") ||
    transportPanelText.includes('subtitleLabel={`${timelineModel.taskSpans.length} timeline rows`}') ||
    transportPanelText.includes('titleLabel="Gantt-Timeline"') ||
    transportPanelText.includes('value={clampTimelineTransportValue(positionMinutes, 0, Math.max(1, maxMinutes))}') ||
    !timelineFloatingText.includes('Grade: false') ||
    !timelineFloatingText.includes('Mask: false') ||
    !timelineFloatingText.includes('Audio: true') ||
    !timelineFloatingText.includes('Video: true') ||
    !timelineFloatingText.includes('buildVideoSequenceFloatingPanelRowTree') ||
    !timelineFloatingText.includes('MarkdownTocExpandGlyph') ||
    !timelineFloatingText.includes('rowTree={videoSequenceFloatingRowTree}') ||
    !timelineFloatingText.includes('rowFilter={videoSequenceModel?.enabled ? videoSequenceFloatingRowFilter : undefined}') ||
    !timelineFloatingText.includes('data-kg-video-sequence-floating-panel-tree-controls="1"') ||
    timelineFloatingText.includes('VideoSequenceFloatingPanelControls') ||
    timelineFloatingText.includes('rowControls={videoSequenceFloatingControls}') ||
    timelineFloatingText.includes('GanttTimelineTransportPanel') ||
    timelineFloatingText.includes('TimelineTransportControls') ||
    timelineFloatingText.includes('data-kg-gantt-timeline-transport') ||
    !mediaCanvasText.includes('useTimelinePreviewMediaCanvasBinding') ||
    !mediaCanvasText.includes('mediaCanvasBinding.frameModel') ||
    !mediaCanvasText.includes('TimelinePreviewMediaCanvasFrame') ||
    !previewMediaCanvasBindingText.includes('useCommandMenuRichMediaInventory') ||
    !previewMediaCanvasBindingText.includes('useTimelineDocumentStoreBinding') ||
    !previewMediaCanvasBindingText.includes('useTimelineGanttSelectionStoreBinding') ||
    !previewMediaCanvasBindingText.includes('useTimelinePreviewRouteEntry') ||
    !previewMediaCanvasBindingText.includes('useTimelinePreviewMediaContext') ||
    previewMediaCanvasBindingText.includes('useTimelinePreviewBootstrap') ||
    !previewMediaCanvasBindingText.includes('collection: previewRouteEntry.bootstrap.collection') ||
    !previewMediaCanvasBindingText.includes('documentKey: previewRouteEntry.bootstrap.documentKey') ||
    !previewMediaCanvasBindingText.includes('exportPlan: previewRouteEntry.bootstrap.exportPlan') ||
    !previewMediaCanvasBindingText.includes('intent: previewRouteEntry.intent') ||
    !previewMediaCanvasBindingText.includes('frameModel: previewMediaContext.mediaCanvasFrame') ||
    !previewBootstrapText.includes('useTimelinePreviewBootstrap') ||
    !previewBootstrapText.includes('useTimelinePreviewCollection') ||
    !previewBootstrapText.includes('cleanTimelinePreviewDocumentKey') ||
    !previewBootstrapText.includes('const documentKey = cleanTimelinePreviewDocumentKey(args.markdownDocumentName)') ||
    !previewBootstrapText.includes('() => collection.previewPlan || collection.exportPlan') ||
    !previewCollectionText.includes('useTimelinePreviewCollection') ||
    !previewCollectionText.includes('useTimelinePreviewMediaSession') ||
    !previewCollectionText.includes('shouldIncludeTimelinePreviewCollectionItem') ||
    !previewMediaContextText.includes('useTimelinePreviewMediaContext') ||
    !previewMediaContextText.includes('useTimelinePreviewSurfaceModel') ||
    !previewMediaContextText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilySectionChromeModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilySectionBodyModel') ||
    !previewMediaContextText.includes('useTimelinePreviewFamilySectionsModel') ||
    !previewMediaContextText.includes('useTimelinePreviewMediaCanvasRenderModel') ||
    !previewMediaContextText.includes('useTimelinePreviewMediaCanvasFrameModel') ||
    !previewMediaContextText.includes('useTimelinePreviewSurfaceShellModel') ||
    !previewScopeProjectionText.includes('useTimelinePreviewScopeProjection') ||
    !previewScopeProjectionText.includes('buildVideoSequenceTimelineScopes') ||
    !previewScopeProjectionText.includes('sourceCount') ||
    !previewScopeProjectionText.includes('spanCount') ||
    !previewMonitorContextText.includes('useTimelinePreviewMonitorContext') ||
    !previewMonitorContextText.includes('useTimelinePreviewMediaContext') ||
    !previewMonitorContextText.includes('useTimelinePreviewScopeProjection') ||
    !previewMonitorContextText.includes('monitorScopes: scopeProjection.monitorScopes') ||
    !previewMonitorBindingText.includes('useTimelinePreviewMonitorBinding') ||
    !previewMonitorBindingText.includes('useTimelinePreviewRouteEntry') ||
    !previewMonitorBindingText.includes('useTimelinePreviewMonitorContext') ||
    previewMonitorBindingText.includes('useTimelinePreviewBootstrap') ||
    !previewMonitorBindingText.includes('collection: previewRouteEntry.bootstrap.collection') ||
    !previewMonitorBindingText.includes('documentKey: previewRouteEntry.bootstrap.documentKey') ||
    !previewMonitorBindingText.includes('exportPlan: previewRouteEntry.bootstrap.exportPlan') ||
    !previewMonitorBindingText.includes('intent: previewRouteEntry.intent') ||
    !previewMonitorBindingText.includes('monitorScopes: previewMonitorContext.monitorScopes') ||
    !previewRouteEntryText.includes('useTimelinePreviewRouteEntry') ||
    !previewRouteEntryText.includes('useTimelinePreviewBootstrap') ||
    !previewRouteEntryText.includes("intent: 'media'") ||
    !previewRouteEntryText.includes("intent: 'monitor'") ||
    !previewRouteEntryText.includes("args.intent === 'media' ? previewBootstrap.collection.sequenceMaxMinutes : args.maxMinutes") ||
    !previewRouteEntryText.includes("args.intent === 'media' ? 0 : args.positionMinutes") ||
    !previewRouteEntryText.includes('bootstrap: previewBootstrap') ||
    !transportChromeModelText.includes('useGanttTimelineTransportChromeModel') ||
    !transportChromeModelText.includes('syncModeButton') ||
    !transportChromeModelText.includes('clipActionButtons') ||
    !transportChromeModelText.includes("action: 'nudge-back'") ||
    !transportChromeModelText.includes("action: 'trim-start-back'") ||
    !transportChromeModelText.includes("action: 'snap-to-playhead'") ||
    !transportChromeModelText.includes("action: 'split-at-playhead'") ||
    !transportChromeModelText.includes("action: 'split-left-at-playhead'") ||
    !transportChromeModelText.includes("action: 'split-right-at-playhead'") ||
    !transportChromeModelText.includes("ariaLabel: 'Split left side of selected clip at the playhead'") ||
    !transportChromeModelText.includes("ariaLabel: 'Split right side of selected clip at the playhead'") ||
    !transportChromeModelText.includes('handleToggleVideoSequenceTimingSyncMode') ||
    !transportChromeModelText.includes("timingSyncMode === 'grouped'") ||
    !transportChromeModelText.includes('VIDEO_SEQUENCE_TIMELINE_TOOLS.map') ||
    !transportChromeModelText.includes('exportSessionCollection.surface.items.map') ||
    !transportChromeModelText.includes('exportSessionCollection.retryControl') ||
    !transportChromeModelText.includes('handleRetryEditedMediaExportRunId') ||
    !transportChromeModelText.includes('handleRetryEditedMediaExport(args.latestRetryableExportSession)') ||
    !transportChromeModelText.includes('Cancel edited video export') ||
    !transportChromeModelText.includes('Download edited video') ||
    !transportChromeModelText.includes('Cancel edited audio export') ||
    !transportChromeModelText.includes('Download edited audio') ||
    !transportContextControlsText.includes('GanttTimelineTransportContextControls') ||
    transportContextControlsText.includes('VideoSequenceClipEditPanel') ||
    !transportShellText.includes('contextDetailsLabel') ||
    !transportChromeModelText.includes('buildVideoSequenceClipEditDetailsLabel') ||
    !transportChromeModelText.includes('detailsLabel: buildVideoSequenceClipEditDetailsLabel') ||
    !transportContextControlsText.includes('timeline-transport-export-session') ||
    !transportContextControlsText.includes('data-kg-video-sequence-export-session-retry') ||
    !transportHeaderToolsText.includes('GanttTimelineTransportHeaderTools') ||
    !transportHeaderToolsText.includes('data-kg-video-sequence-tool="timing-sync"') ||
    !transportHeaderToolsText.includes('data-kg-video-sequence-timing-sync={args.model.syncModeButton.mode}') ||
    !transportHeaderToolsText.includes('data-kg-video-sequence-clip-edit={button.action}') ||
    !transportHeaderToolsText.includes('renderClipActionIcon(button.icon)') ||
    !transportHeaderToolsText.includes('<details className="timeline-tool-menu timeline-tool-menu--clip">') ||
    !transportHeaderToolsText.includes('aria-label="Clip nudge and trim tools"') ||
    !transportHeaderToolsText.includes('<details className="timeline-tool-menu timeline-tool-menu--utilities">') ||
    !transportHeaderToolsText.includes('aria-label="Timeline utility tools"') ||
    !transportHeaderToolsText.includes('TimelineVideoSequenceToolButton') ||
    !sequenceText.includes("{ id: 'grade', label: 'Grade', title: 'Add color grade lane for selected clip' }") ||
    !transportHeaderToolsText.includes('timeline-video-sequence-tool-strip') ||
    !transportHeaderToolsText.includes('timeline-transport-chrome-actions') ||
    !transportHeaderToolsText.includes('data-kg-video-sequence-export={button.dataValue}') ||
    !transportRouteModelText.includes('useGanttTimelineTransportRouteModel') ||
    !transportRouteModelText.includes('useGanttTimelineTransportSurfaceModel') ||
    !transportRouteModelText.includes('surfaceModel: transportSurfaceModel') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportSurfaceModel') ||
    !transportSurfaceModelText.includes('videoSequenceTimelineLaneVisibility') ||
    !transportSurfaceModelText.includes('VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS.filter') ||
    !transportSurfaceModelText.includes('videoSequenceTimelineLaneVisibility?.[laneId] !== true') ||
    !transportSurfaceModelText.includes('disabledLaneIds,') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportSession') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportCommandModel') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportChromeModel') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportRulerModel') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !transportSurfaceModelText.includes('useGanttTimelineTransportShellModel') ||
    !transportSurfaceModelText.includes('const rulerContentRef = React.useRef<HTMLElement | null>(null)') ||
    !transportSurfaceText.includes('GanttTimelineTransportSurface') ||
    !transportSurfaceText.includes('GanttTimelineTransportShell') ||
    !transportSurfaceText.includes('model: GanttTimelineTransportSurfaceModel') ||
    !transportSurfaceText.includes('chromeModel={args.model.chromeModel}') ||
    !transportSurfaceText.includes('rulerModel={args.model.rulerModel}') ||
    !transportSurfaceText.includes('shellModel={args.model.shellModel}') ||
    !transportCommandModelText.includes('useGanttTimelineTransportCommandModel') ||
    !transportCommandModelText.includes('useGanttTimelineDocumentActions') ||
    !transportCommandModelText.includes('chromeModelCommands') ||
    !transportCommandModelText.includes('handleCommittedDragUpdate: documentActions.handleCommittedDragUpdate') ||
    !transportCommandModelText.includes('handleToggleVideoSequenceTimingSyncMode: documentActions.handleToggleVideoSequenceTimingSyncMode') ||
    !transportCommandModelText.includes('timingSyncMode: documentActions.timingSyncMode') ||
    !transportCommandModelText.includes('handleVideoSequenceClipEdit: documentActions.handleVideoSequenceClipEdit') ||
    !transportDocumentActionsText.includes('useTimelineTransportTimingSyncStoreBinding') ||
    !transportDocumentActionsText.includes('setTimelineTransportTimingSyncMode(timingSyncMode ===') ||
    !transportDocumentActionsText.includes('resolveGanttTimelineVideoSequenceSplitAction') ||
    !transportDocumentActionsText.includes('updateGanttTimelineVideoSequenceClipTimingWithRipple') ||
    !transportDocumentActionsText.includes('handleToggleVideoSequenceTimingSyncMode') ||
    !transportDocumentActionsText.includes('resolveGanttTimelineVideoSequenceTimingSyncMode') ||
    !transportDocumentActionsText.includes('syncMode: resolveGanttTimelineVideoSequenceTimingSyncMode({ span: actionContext.selectedSpan, timingSyncMode })') ||
    transportDocumentActionsText.includes('const nextCode = updateMermaidGanttCodeRowTiming') ||
    !transportRulerModelText.includes('useGanttTimelineTransportRulerModel') ||
    !transportRulerModelText.includes('clampTimelineTransportValue') ||
    !transportRulerModelText.includes("'--kg-video-sequence-lane-count': args.visibleLaneCount") ||
    !transportRulerModelText.includes('disabledLaneIds: readonly VideoSequenceTimelineLaneId[]') ||
    !transportRulerModelText.includes("subtitleLabel: `${args.taskSpans.length} timeline rows`") ||
    transportRulerModelText.includes("titleLabel: 'Gantt-Timeline'") ||
    !transportRulerModelText.includes('value: clampTimelineTransportValue(args.positionMinutes, 0, Math.max(1, args.maxMinutes))') ||
    !transportRulerModelText.includes('scopes: args.scopes') ||
    !transportRulerText.includes('GanttTimelineTransportRuler') ||
    !transportRulerText.includes('VideoSequenceTimelineRuler') ||
    !transportRulerText.includes('projectionMode={args.model.mode}') ||
    !transportRulerText.includes('disabledLaneIds={args.model.disabledLaneIds}') ||
    !transportRulerText.includes('scopes={args.model.scopes}') ||
    !transportInteractionModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !transportInteractionModelText.includes('useGanttTimelineInteractions') ||
    !transportInteractionModelText.includes('useGanttTimelineTransportView') ||
    !transportInteractionModelText.includes('useGanttTimelineSelectionSync') ||
    !transportInteractionModelText.includes('resolveMermaidGanttTimelineRowKeyAtPosition(args.timelineModel, position)') ||
    !transportInteractionModelText.includes('taskSpans: args.timelineModel.taskSpans') ||
    !transportShellModelText.includes('useGanttTimelineTransportShellModel') ||
    !transportShellModelText.includes("ariaLabel: 'Scrub Gantt-timeline position'") ||
    !transportShellModelText.includes("chromeClassName: 'timeline-transport-chrome--mermaid-gantt p-2'") ||
    !transportShellModelText.includes("shellClassName: 'timeline-transport-shell--video-sequence'") ||
    !transportShellModelText.includes("'data-kg-gantt-timeline-transport': 'bottomPanel'") ||
    !transportShellModelText.includes("'data-kg-video-sequence-media-duration': args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : undefined") ||
    !transportShellModelText.includes("'data-kg-video-sequence-media-duration-scale': args.hasMediaDurationScale ? '1' : undefined") ||
    !transportShellModelText.includes("timelineMode: 'empty' | 'source-backed' | 'workflow'") ||
    !transportShellModelText.includes("'data-kg-video-sequence-timeline': args.timelineMode") ||
    !transportShellModelText.includes('showInlineProgress: false') ||
    !transportShellModelText.includes('showRange: false') ||
    !transportShellModelText.includes('step: 1') ||
    !transportShellText.includes('GanttTimelineTransportShell') ||
    !transportShellText.includes('TimelineTransportChrome') ||
    !transportShellText.includes('GanttTimelineTransportContextControls') ||
    !transportShellText.includes('GanttTimelineTransportHeaderTools') ||
    !transportShellText.includes('GanttTimelineTransportRuler') ||
    !transportShellText.includes('contextLabel={args.rulerModel.chrome.subtitleLabel}') ||
    transportShellText.includes('titleLabel={args.rulerModel.chrome.titleLabel}') ||
    transportShellText.includes('subtitleLabel={args.rulerModel.chrome.subtitleLabel}') ||
    !transportShellText.includes('showInlineProgress={args.shellModel.showInlineProgress}') ||
    !transportShellText.includes('showRange={args.shellModel.showRange}') ||
    !transportPlaybackModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !transportPlaybackModelText.includes('useGanttTimelinePlaybackControls') ||
    !transportPlaybackModelText.includes('useTimelineTransportPlayback') ||
    !transportPlaybackModelText.includes('onPlaybackEnd: playbackControls.handlePlaybackEnd') ||
    !transportPlaybackModelText.includes('handleTogglePlayback: playbackControls.handleTogglePlayback') ||
    !transportPlaybackModelText.includes('active: args.clockActive !== false && !args.disabled') ||
    !transportPlaybackModelText.includes('unitsPerMs: args.playbackUnitsPerMs') ||
    !transportPreviewSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !transportPreviewSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !transportPreviewSessionText.includes('useTimelinePreviewMonitorBinding') ||
    !transportPreviewSessionText.includes('sourceCount: videoSequenceModel?.sources.length || 0') ||
    !transportPreviewSessionText.includes('spanCount: args.taskSpans.length') ||
    !transportPreviewSessionText.includes('buildVideoSequenceExportPlan') ||
    !transportPreviewSessionText.includes('resolveVideoSequenceExportPlanError') ||
    !transportSessionText.includes('useGanttTimelineTransportSession') ||
    !transportSessionText.includes('useTimelineDocumentStoreBinding') ||
    !transportSessionText.includes('useTimelineGanttSelectionStoreBinding') ||
    !transportSessionText.includes('useTimelineTransportStoreBinding') ||
    !transportSessionText.includes('useTimelineDocumentTransportController') ||
    !transportSessionText.includes('cleanTimelinePreviewDocumentKey') ||
    !transportSessionText.includes('useGanttTimelineMediaDuration') ||
    !transportSessionText.includes('useGanttTimelineDisplayModel') ||
    !transportSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !transportSessionText.includes('buildVideoSequenceTimelineToolStatus') ||
    transportSessionText.includes('buildVideoSequenceExportPlan') ||
    transportSessionText.includes('resolveVideoSequenceExportPlanError') ||
    transportSessionText.includes('useTimelinePreviewMonitorBinding') ||
    transportSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !transportSessionText.includes('resolveVisibleVideoSequenceTimelineLaneCount') ||
    !previewActivitySurfaceModelText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !previewActivitySurfaceModelText.includes("args.activityMode === 'selection' || args.activityMode === 'playhead'") ||
    !previewActivitySurfaceModelText.includes("return 'active'") ||
    !previewFamilyCompactionModelText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !previewFamilyCompactionModelText.includes("if (args.intent !== 'media') return false") ||
    !previewFamilyCompactionModelText.includes('collapsedFamilyCount') ||
    !previewFamilyDisclosureControllerText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !previewFamilyDisclosureControllerText.includes('React.useSyncExternalStore') ||
    !previewFamilyDisclosureControllerText.includes('React.useEffect') ||
    !previewFamilyDisclosureControllerText.includes('EMPTY_TIMELINE_PREVIEW_FAMILY_DISCLOSURE_SET') ||
    !previewFamilyDisclosureControllerText.includes('areTimelinePreviewFamilyDisclosureSetsEqual') ||
    !previewFamilyDisclosureControllerText.includes('autoExpandFamilyId?: string | null') ||
    !previewFamilyDisclosureControllerText.includes('familyIds: readonly string[]') ||
    !previewFamilyDisclosureControllerText.includes('if (autoExpandFamilyId && familyIdSet.has(autoExpandFamilyId))') ||
    !previewFamilyDisclosureModelText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !previewFamilyDisclosureModelText.includes('controller: TimelinePreviewFamilyDisclosureController') ||
    !previewFamilyDisclosureModelText.includes('toggleFamily') ||
    !previewFamilyDisclosureModelText.includes("return args.expanded ? 'expanded' : 'collapsed'") ||
    previewFamilyDisclosureModelText.includes('React.useState') ||
    !previewFamilyDisclosureSurfaceModelText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !previewFamilyDisclosureSurfaceModelText.includes('headerVisible: toggleVisible') ||
    !previewFamilyDisclosureSurfaceModelText.includes('Hide variants') ||
    !previewFamilyDisclosureSurfaceModelText.includes('hidden variant') ||
    !previewFamilySectionLayoutModelText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !previewFamilySectionLayoutModelText.includes('Rich media canvas sources') ||
    !previewFamilySectionLayoutModelText.includes('No rich media sources found in the active document.') ||
    !previewFamilySectionLayoutModelText.includes('sectionAttributes') ||
    !previewFamilySectionChromeModelText.includes('useTimelinePreviewFamilySectionChromeModel') ||
    !previewFamilySectionChromeModelText.includes('handleToggle: () => args.familyDisclosure.toggleFamily') ||
    !previewFamilySectionChromeModelText.includes("icon: sectionLayout.familySurface.toggleMode === 'collapse' ? 'collapse' : 'expand'") ||
    !previewFamilySectionChromeModelText.includes('dataValue: sectionLayout.familySummaryVisible ? sectionLayout.familySummaryLabel : undefined') ||
    !previewFamilySectionBodyModelText.includes('useTimelinePreviewFamilySectionBodyModel') ||
    !previewFamilySectionBodyModelText.includes('cardsLabel: sectionLayout.cardsLabel') ||
    !previewFamilySectionBodyModelText.includes('props: {') ||
    !previewFamilySectionBodyModelText.includes('documentKey: args.documentKey') ||
    !previewFamilySectionBodyModelText.includes('exportPlan: args.exportPlan') ||
    !previewFamilySectionBodyModelText.includes('sequenceMaxMinutes: args.sequenceMaxMinutes') ||
    !previewFamilySectionsModelText.includes('useTimelinePreviewFamilySectionsModel') ||
    !previewFamilySectionsModelText.includes('const bodySectionByFamilyId = new Map(') ||
    !previewFamilySectionsModelText.includes('const sectionBody = bodySectionByFamilyId.get(sectionChrome.familyId)') ||
    !previewFamilySectionsModelText.includes('cardsLabel: sectionBody.cardsLabel') ||
    !previewFamilySectionsModelText.includes('surfaces: sectionBody.surfaces') ||
    !previewMediaCanvasRenderModelText.includes('useTimelinePreviewMediaCanvasRenderModel') ||
    !previewMediaCanvasRenderModelText.includes("contentMode: args.surfaceShell.hasItems ? 'sections' : 'empty'") ||
    !previewMediaCanvasRenderModelText.includes('hostAttributes: {') ||
    !previewMediaCanvasRenderModelText.includes('listLabel: args.familySections.listLabel') ||
    !previewMediaCanvasRenderModelText.includes('shellLabel: args.surfaceShell.shellLabel') ||
    !previewMediaCanvasFrameModelText.includes('useTimelinePreviewMediaCanvasFrameModel') ||
    !previewMediaCanvasFrameModelText.includes('buildTimelineAnimationState') ||
    !previewMediaCanvasFrameModelText.includes('hostAttributes: args.renderModel.hostAttributes') ||
    !previewMediaCanvasFrameModelText.includes('renderModel: args.renderModel') ||
    !previewMediaCanvasFrameText.includes('TimelinePreviewMediaCanvasFrame') ||
    !previewMediaCanvasFrameText.includes('data-kg-media-canvas-group-count') ||
    !previewMediaCanvasFrameText.includes('args.model.animationState.attributes') ||
    !previewMediaCanvasFrameText.includes('<TimelinePreviewMediaCanvasRender model={args.model.renderModel} />') ||
    !previewSurfaceShellModelText.includes('useTimelinePreviewSurfaceShellModel') ||
    !previewSurfaceShellModelText.includes("shellLabel: 'Media canvas'") ||
    !previewSurfaceShellModelText.includes("titleLabel: 'Media'") ||
    !previewSurfaceShellModelText.includes('collapsedFamilyCount') ||
    !previewSurfaceShellModelText.includes('groupCount: args.familySectionLayout.sections.length') ||
    !previewMediaContextText.includes("autoExpandFamilyId: sourceActivity.activityMode === 'fallback'") ||
    !previewMediaContextText.includes('familyIds: familyCompaction.families.map(family => family.familyId)') ||
    !previewMediaContextText.includes('useTimelineSourceActivityModel') ||
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
    !previewActivitySurfaceModelText.includes("if (args.activityMode === 'empty')") ||
    !previewActivitySurfaceModelText.includes('families: []') ||
    !previewSurfaceModelText.includes('useTimelinePreviewSurfaceModel') ||
    !previewSurfaceModelText.includes('resolveTimelinePreviewFamilyId') ||
    !previewSurfaceModelText.includes('isTimelinePreviewItemVisibleForSurfaceIntent') ||
    !mediaCanvasText.includes('<TimelinePreviewMediaCanvasFrame') ||
    !mediaCanvasText.includes('model={mediaCanvasBinding.frameModel}') ||
    !previewMediaCanvasRenderText.includes('TimelinePreviewMediaCanvasRender') ||
    !previewMediaCanvasRenderText.includes('TimelinePreviewSurface') ||
    !previewMediaCanvasRenderText.includes('aria-label={args.model.listLabel}') ||
    !previewMediaCanvasRenderText.includes('aria-label={args.model.emptyState.label}') ||
    !previewMediaCanvasRenderText.includes('{args.model.emptyState.message}') ||
    !previewMediaCanvasRenderText.includes('data-kg-media-canvas-family-toggle="1"') ||
    !previewMediaCanvasRenderText.includes('data-kg-media-canvas-family-surface-tone') ||
    !previewMediaCanvasRenderText.includes('data-kg-media-canvas-family-toggle-mode') ||
    !previewMediaCanvasRenderText.includes('data-kg-media-canvas-family-summary=') ||
    !previewMediaCanvasRenderText.includes('data-kg-media-canvas-family-active-id') ||
    !previewMediaCanvasRenderText.includes('title={section.toggle.title}') ||
    !previewMediaCanvasRenderText.includes('onClick={section.toggle.handleToggle}') ||
    !previewMediaCanvasRenderText.includes("section.toggle.icon === 'collapse'") ||
    !previewMediaCanvasRenderText.includes('key={surface.renderKey}') ||
    !previewMediaCanvasRenderText.includes('{...surface.props}') ||
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
    mediaCanvasText.includes('resolveTargetSeconds') ||
    !previewSurfaceText.includes('TimelinePreviewSurface') ||
    !previewSurfaceText.includes('buildStaticRichMediaPanelOverlayState') ||
    !previewSurfaceText.includes('useTimelinePreviewVideoBinding') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-active') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-dimmed') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-family-collapsed') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-family-disclosure-state') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-family-expanded') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-family-hidden-count') ||
    !previewSurfaceText.includes('data-kg-media-canvas-item-style-mode') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-sync') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader-duration') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader-frame-rate') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader-resolution') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader-audio-channels') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader-time-resolution') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-reader-video-tracks') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-count') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-generated') ||
    previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-strip') ||
    previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-format') ||
    previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-raster-format') ||
    previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-time') ||
    !previewSurfaceText.includes('relative aspect-video min-h-0 overflow-hidden') ||
    previewSurfaceText.includes("minHeight: '18rem'") ||
    !previewSurfaceText.includes('videoPoster={videoPoster}') ||
    !previewSurfaceText.includes('videoControls={syncEnabled ? false : undefined}') ||
    !previewSurfaceText.includes('onVideoElement={args.item.kind ===') ||
    !previewVideoBindingText.includes('useTimelinePreviewVideoBinding') ||
    !previewVideoBindingText.includes('useTimelineMediaReaderSummary') ||
    !previewVideoBindingText.includes('useTimelineDocumentTransportController') ||
    !previewVideoBindingText.includes('useTimelineTransportSnapshotReader') ||
    !previewVideoBindingText.includes('useTimelineTransportStoreBinding') ||
    !previewVideoBindingText.includes('useTimelineVideoPreviewSyncController') ||
    !previewVideoBindingText.includes('handleVideoElement') ||
    !previewVideoBindingText.includes('mergeTimelineMediaReaderSummaryWithSource') || !previewVideoBindingText.includes('readerDurationSeconds: resolvedMediaReaderSummary.durationSeconds') ||
    !previewVideoBindingText.includes('readVideo: () => videoElementRef.current') ||
    !mediaReaderText.includes('loadTimelineMediaReaderSummary') ||
    mediaReaderText.includes(forbiddenExternalMediaToolkit) ||
    !mediaReaderText.includes('fetchNativeMediaContainerBytes') ||
    !mediaReaderText.includes('readNativeIsoBmffContainerSummary') ||
    !mediaReaderText.includes("document.createElement('video')") ||
    !mediaReaderText.includes("headers: { Range: `bytes=0-${NATIVE_MEDIA_CONTAINER_READ_BYTES - 1}` }") ||
    !mediaReaderText.includes('readIsoTrackSummary') ||
    !mediaReaderText.includes('readIsoStsd') ||
    !mediaReaderText.includes('readIsoStts') || !mediaReaderText.includes('readIsoStsz') ||
    !mediaReaderText.includes('readIsoMdhd') ||
    !mediaReaderText.includes('canDecodeCodec') ||
    !mediaReaderText.includes('TimelineMediaReaderThumbnail') || !mediaReaderText.includes('audioWaveformSamples: number[]') || !mediaReaderText.includes('buildNativeAudioPacketWaveformSamples(container.audioSampleSizes)') ||
    !mediaReaderText.includes('loadNativeVideoThumbnails') ||
    !mediaReaderText.includes('resolveThumbnailTimestamps') ||
    !mediaReaderText.includes("document.createElement('canvas')") ||
    !mediaReaderText.includes("canvas.toDataURL('image/webp', 0.78)") ||
    !mediaReaderText.includes("canvas.toDataURL('image/png')") ||
    !mediaReaderText.includes("canvas.toDataURL('image/jpeg', 0.76)") ||
    !mediaReaderText.includes('buildSemanticThumbnailSvgDataUrl') ||
    !mediaReaderText.includes("format: 'svg'") ||
    !mediaReaderText.includes("mimeType: 'image/svg+xml'") ||
    !mediaReaderText.includes('rasterFormat') ||
    !mediaReaderText.includes('toSvgDataUrl') || !mediaReaderText.includes('boxEnd < offset + headerSize') ||
    !mediaFormatPreferenceText.includes("MEDIA_IMAGE_FORMAT_PREFERENCE = ['svg', 'webp', 'png', 'jpeg']") ||
    !mediaFormatPreferenceText.includes("MEDIA_VIDEO_FORMAT_PREFERENCE = ['mp4', 'webm']") ||
    !mediaFormatPreferenceText.includes('readPreferredImageFormat') ||
    !mediaFormatPreferenceText.includes('readPreferredVideoFormat') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-image-format-preference') ||
    !previewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-video-format-preference') ||
    !mediaReaderText.includes("waitForMediaEvent(video, 'seeked'") ||
    !mediaReaderText.includes('NATIVE_MEDIA_THUMBNAIL_MIN_COUNT = 9') ||
    !mediaReaderText.includes('NATIVE_MEDIA_THUMBNAIL_MAX_COUNT = 24') ||
    !mediaReaderText.includes('resolveNativeMediaThumbnailCount(args.durationSeconds)') ||
    !mediaReaderText.includes('thumbnails,') ||
    !transportSurfaceModelText.includes('useTimelineMediaReaderSummary') ||
    !transportSurfaceModelText.includes('const mediaPreviewSourceUrl = React.useMemo') ||
    !transportSurfaceModelText.includes('const thumbnailSourceUrl = React.useMemo') ||
    !['const timelinePlanSourceDurationSeconds = React.useMemo', 'const displaySourceDurationSeconds = timelinePlanSourceDurationSeconds || mediaPreviewSummary.durationSeconds', 'sourceDurationSeconds: selectedPreviewEmpty ? 0 : displaySourceDurationSeconds'].every(token => transportSurfaceModelText.includes(token)) ||
    !transportSurfaceModelText.includes('mediaReaderSummary: mediaPreviewSummary') ||
    !transportSurfaceModelText.includes('resolveTimelinePlanSourceUrl') ||
    !transportSurfaceModelText.includes('sourceThumbnails: thumbnailSummary.thumbnails') || !transportSurfaceModelText.includes('sourceThumbnailWindows') || !transportSurfaceModelText.includes('sourceAudioWaveformSamples: summary?.audioWaveformSamples || []') ||
    !transportRulerModelText.includes('sourceThumbnails: readonly TimelineMediaReaderThumbnail[]') || !transportRulerModelText.includes('sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]') ||
    !transportRulerModelText.includes('onSelectRowPosition: (rowKey: string, positionMinutes: number) => void') ||
    !transportRulerText.includes('sourceThumbnails={args.model.sourceThumbnails}') || !transportRulerText.includes('sourceThumbnailWindows={args.model.sourceThumbnailWindows}') ||
    !transportRulerText.includes('onSelectRowPosition={args.model.onSelectRowPosition}') ||
    !rulerText.includes('sourceThumbnails = []') || !rulerText.includes('sourceThumbnailWindows = []') || !rulerText.includes('resolveVideoSequenceClipThumbnails') || !rulerText.includes("args.lane === 'video' || args.lane === 'audio' ? 'video'") ||
    !rulerText.includes("VIDEO_SEQUENCE_SOURCE_CONTENT_LANES = new Set<VideoSequenceTimelineLaneId>(['video', 'image', 'scene'])") ||
    !rulerText.includes("VIDEO_SEQUENCE_OPERATION_CONTENT_LANES = new Set<VideoSequenceTimelineLaneId>(['mask', 'grade', 'audio'])") ||
    !rulerText.includes('resolveVideoSequenceSpanThumbnailWindow') ||
    rulerText.indexOf('const existingWindow = resolveVideoSequenceThumbnailWindow') > rulerText.indexOf('const sourceRange = readMermaidGanttTaskSourceRangeSeconds(args.span.raw)') ||
    !rulerText.includes('if (sourceRange) {') ||
    !rulerText.includes('if (!sourceRange && !args.allowTimelineFallback) return null') ||
    !rulerText.includes('if (!window) return []') ||
    rulerText.includes('sort((left, right) => Math.abs(left.timestampSeconds') ||
    !rulerText.includes('readMermaidGanttTaskSourceRangeSeconds(args.span.raw)') ||
    !rulerText.includes('allowTimelineFallback: VIDEO_SEQUENCE_SOURCE_CONTENT_LANES.has(lane) || showsGeneratedFrameContent') ||
    !rulerText.includes('resolveVideoSequenceThumbnailTimelinePosition') ||
    !rulerText.includes('thumbnailWindow') ||
    !rulerText.includes('onSelectRowPosition(span.rowKey') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-strip') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-format') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-raster-format') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-time') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-microsecond-time') || !rulerText.includes('data-kg-video-sequence-clip-thumbnail-source-start') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-preview') ||
    !rulerText.includes('timeline-video-sequence-clip-thumbnail-preview-caption') ||
    !rulerText.includes('timeline-video-sequence-clip-thumbnail-caption') ||
    !rulerText.includes('onClick={event =>') ||
    !rulerText.includes('onPointerDown={event =>') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-image-format-preference') ||
    !rulerText.includes('data-kg-video-sequence-clip-thumbnail-video-format-preference') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-thumbnail-strip') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-thumbnail img') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-thumbnail-caption') ||
    !rulerCssText.includes('.timeline-video-sequence-clip-thumbnail-preview') ||
    !rulerCssText.includes('.timeline-transport-track-clip--lane-mask .timeline-video-sequence-clip-thumbnail-strip') ||
    !rulerCssText.includes('.timeline-transport-track-clip--lane-grade .timeline-video-sequence-clip-thumbnail-strip') ||
    !rulerCssText.includes('.timeline-transport-track-clip--lane-audio .timeline-video-sequence-clip-thumbnail-strip') ||
    !rulerCssText.includes('pointer-events: none') ||
    !rulerCssText.includes('aspect-ratio: 16 / 9') ||
    !richMediaPanelText.includes('MEDIA_IMAGE_FORMAT_PREFERENCE_ATTR') ||
    !richMediaPanelText.includes('MEDIA_VIDEO_FORMAT_PREFERENCE_ATTR') ||
    !richMediaPanelText.includes('data-kg-rich-media-shared-pan-drag-zoom') ||
    !richMediaPanelText.includes('ZoomPanViewport') ||
    !richMediaPanelText.includes('data-kg-rich-media-zoom-pan-viewport') ||
    !richMediaPanelText.includes('wheelZoomBehavior="active"') ||
    !richMediaPanelText.includes('contentFillsFrame') ||
    !richMediaPanelText.includes('mediaThumbnailDataAttr') ||
    !commandMenuCatalogText.includes('useNativeVideoMediaThumbnail') ||
    !commandMenuCatalogText.includes('useTimelineMediaReaderSummary') ||
    !commandMenuCatalogText.includes('readPreferredImageFormat') ||
    !commandMenuCatalogText.includes('readPreferredVideoFormat') ||
    !commandMenuCatalogText.includes('buildTimelineAnimationState') ||
    !commandMenuCatalogText.includes("surface: 'floating-media'") ||
    !commandMenuCatalogText.includes('animationAttributes') ||
    !commandMenuCatalogText.includes('data-kg-media-image-format-preference') ||
    !commandMenuCatalogText.includes('data-kg-media-video-format-preference') ||
    !commandMenuCatalogText.includes('MediaThumbnailCaption') || !commandMenuCatalogText.includes('MediaSourceMetadataRow') || !commandMenuCatalogText.includes('data-kg-command-menu-media-thumbnail-caption') || !commandMenuCatalogText.includes('data-kg-media-source-metadata') ||
    !commandMenuCatalogText.includes('contentType: item.contentType') ||
    !commandMenuCatalogText.includes('data-kg-command-menu-media-thumbnail-format') ||
    !commandMenuCatalogText.includes('data-kg-command-menu-media-thumbnail-raster-format') ||
    !commandMenuCatalogText.includes('data-kg-command-menu-media-thumbnail-time') ||
    ['data-kg-command-menu-media-metadata-video-codec', 'data-kg-command-menu-media-metadata-audio-codec', 'data-kg-command-menu-media-metadata-frame-rate', 'data-kg-command-menu-media-metadata-bitrate', 'data-kg-command-menu-media-metadata-audio-sample-rate'].some(attr => !commandMenuCatalogText.includes(attr)) ||
    commandMenuCatalogText.indexOf('{mediaActions.map(action => (') < commandMenuCatalogText.indexOf('{uploadedMediaItems.map(item => (') ||
    !playbackControlsText.includes('dispatchTimelineTransportPlaybackRequest') ||
    !playbackControlsText.includes('handleTogglePlayback') ||
    !playbackControlsText.includes('handlePlaybackEnd') ||
    playbackControlsText.includes('handlePlaybackPointerDown') ||
    !selectionSyncText.includes('previousSelectedRowKeyRef') ||
    !selectionSyncText.includes('if (previousSelectedRowKey === args.selectedRowKey) return') ||
    !selectionSyncText.includes('args.taskSpans.find(span => span.rowKey === args.selectedRowKey)') ||
    !selectionSyncText.includes('args.positionMinutes >= selectedSpan.startMinutes') ||
    !selectionSyncText.includes('if (selectedSpan && args.positionMinutes >= selectedSpan.startMinutes') ||
    !displayModelText.includes('formatVideoSequenceTimelineSecondsOffset') ||
    !displayModelText.includes('resolveVideoSequenceTimelineMediaSeconds') ||
    !displayModelText.includes('resolveVideoSequenceTimelineUnitsPerMs') ||
    !mediaDurationText.includes('resolveTimelinePlanDurationSeconds') ||
    !transportShellModelText.includes("'data-kg-video-sequence-media-duration': args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : undefined") ||
    !transportShellModelText.includes("'data-kg-video-sequence-media-duration-scale': args.hasMediaDurationScale ? '1' : undefined") ||
    !transportSurfaceModelText.includes('const selectedPreviewEmpty = !!transportSession.selectedSpan && !transportSession.previewPlan') ||
    transportSurfaceModelText.includes('transportSession.disabled || selectedPreviewEmpty') ||
    transportSurfaceModelText.includes('selectedPreviewEmpty || !transportSession.playing') ||
    transportSurfaceModelText.includes('transportSession.setTransportPlaying(false)') ||
    !transportSurfaceModelText.includes('disabled: transportSession.disabled') ||
    !transportSurfaceModelText.includes('transportClockDisplayModel') ||
    transportSurfaceModelText.includes('emptySelectionCurrentLabel') ||
    transportSurfaceModelText.includes('emptySelectionTotalLabel') ||
    transportSurfaceModelText.includes('hasMediaDurationScale: selectedPreviewEmpty ? false') ||
    transportSurfaceModelText.includes('mediaDurationSeconds: selectedPreviewEmpty ? 0 : transportSession.mediaDurationSeconds') ||
    !transportSurfaceModelText.includes('hasMediaDurationScale: transportClockDisplayModel.hasMediaDurationScale') ||
    !transportSurfaceModelText.includes('mediaDurationSeconds: transportSession.mediaDurationSeconds') ||
    !transportSurfaceModelText.includes("timelineMode: workflowMode ? 'workflow' : (selectedPreviewEmpty ? 'empty' : 'source-backed')") ||
    !previewSyncText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    !previewSyncText.includes('resolveTimelineVideoPreviewDurationSeconds') ||
    !previewSyncText.includes('resolveTimelineVideoPreviewTargetSeconds') ||
    !previewSyncText.includes('resolveTimelineVideoPreviewPositionMinutes') ||
    !previewSyncText.includes('TimelineTransportSnapshotReader') ||
    !previewSyncText.includes('if (video.paused || video.ended) writeTransportPosition()') ||
    !previewSyncText.includes('data-kg-video-sequence-playback-fallback') ||
    mediaCanvasText.includes('transportDocumentKey === documentKey && transportPlaying')
  ) {
    throw new Error('expected video sequence surfaces to expose embedded ruler scopes, clip cues, audio waveform/mix, header tools, and direct playback sync through shared owners')
  }
  if (rulerText.includes('TimelineVideoSequenceEmptyState') || rulerText.includes('timeline-video-sequence-empty-dropzone') || controlsCssText.includes('.timeline-video-sequence-empty-dropzone')) throw new Error('expected empty video sequence Timeline to reuse the shared Gantt transport shell')
  if (
    formatVideoSequenceTimelineSecondsOffset(15.09) !== '0:15' ||
    resolveVideoSequenceTimelineMediaSeconds({ durationSeconds: 15, maxMinutes: 1, positionMinutes: 0.5 }) !== 7.5 ||
    resolveVideoSequenceTimelinePositionMinutes({ currentTimeSeconds: 7.5, durationSeconds: 15, maxMinutes: 1 }) !== 0.5 ||
    resolveVideoSequenceTimelineUnitsPerMs({ durationSeconds: 15, maxMinutes: 1, fallbackUnitsPerMs: 1 / 1000 }) !== 1 / 15000
  ) {
    throw new Error('expected video sequence timeline units to map Gantt geometry to playable media seconds')
  }
  const scopes = buildVideoSequenceTimelineScopes({
    activeFamilyId: 'video-sequence:opening',
    activityMode: 'selection',
    maxMinutes: 6,
    positionMinutes: 3,
    selectionActive: true,
    sourceCount: 1,
    spanCount: 8,
  })
  if (
    scopes.length !== 6 ||
    scopes.some(scope => scope.samples.length !== 12 || scope.value < 0 || scope.value > 100) ||
    !scopes.some(scope => scope.id === 'luma-waveform') ||
    !scopes.some(scope => scope.id === 'chroma-vectorscope') ||
    !scopes.some(scope => scope.id === 'audio-waveform') ||
    scopes[0]?.active !== true ||
    scopes[0]?.activeFamilyId !== 'video-sequence:opening' ||
    scopes[0]?.activityMode !== 'selection' ||
    scopes[0]?.selectionActive !== true
  ) {
    throw new Error(`expected bounded luma/chroma/audio scope samples, got ${JSON.stringify(scopes)}`)
  }
  const waveformSamples = buildVideoSequenceTimelineWaveformSamples({ sampleCount: 16, seedText: 'narration source-clip.mp4 audio' }), denseWaveformSamples = buildVideoSequenceTimelineWaveformSamples({ sampleCount: 640, seedText: 'source-backed clip audio' })
  const frameSamples = buildVideoSequenceTimelineFrameSamples({ sampleCount: 10, seedText: 'source-clip.mp4 video' })
  const cueSamples = buildVideoSequenceTimelineCueSamples({ sampleCount: 12, seedText: 'source-clip.mp4 video' })
  if (
    waveformSamples.length !== 16 ||
    waveformSamples.some(sample => sample < 0 || sample > 100) ||
    waveformSamples.join(',') !== buildVideoSequenceTimelineWaveformSamples({ sampleCount: 16, seedText: 'narration source-clip.mp4 audio' }).join(',') || denseWaveformSamples.length !== 640
  ) {
    throw new Error(`expected deterministic dense audio waveform samples for timeline ruler, got ${JSON.stringify({ dense: denseWaveformSamples.length, waveformSamples })}`)
  }
  if (
    frameSamples.length !== 10 ||
    frameSamples.some(sample => sample < 0 || sample > 100) ||
    frameSamples.join(',') !== buildVideoSequenceTimelineFrameSamples({ sampleCount: 10, seedText: 'source-clip.mp4 video' }).join(',')
  ) {
    throw new Error(`expected deterministic bounded media frame samples for timeline ruler, got ${JSON.stringify(frameSamples)}`)
  }
  if (
    cueSamples.length !== 12 ||
    cueSamples.some(sample => sample < 0 || sample > 100) ||
    cueSamples.join(',') !== buildVideoSequenceTimelineCueSamples({ sampleCount: 12, seedText: 'source-clip.mp4 video' }).join(',')
  ) {
    throw new Error(`expected deterministic bounded media cue samples for timeline ruler, got ${JSON.stringify(cueSamples)}`)
  }
  const code = [
    'gantt',
    '  title Sequence',
    '  section Video',
    '  Opening shot : clip_opening, 09:00, 6m',
  ].join('\n')
  const fullWidthSpan = {
    durationMinutes: 15,
    endMinutes: 15,
    label: 'source-clip.mp4',
    lineIndex: 5,
    raw: 'source-clip.mp4 : clip_hk, 09:00, 15m',
    rowKey: '5:task:source-clip.mp4 : clip_hk, 09:00, 15m',
    startMinutes: 0,
  }
  const clampedMovePreview = resolveMermaidGanttTimelineDragPreviewSpan({
    deltaMinutes: 3,
    maxMinutes: 15,
    mode: 'move',
    span: fullWidthSpan,
  })
  const expandableMovePreview = resolveMermaidGanttTimelineDragPreviewSpan({
    allowTimelineExpansion: true,
    deltaMinutes: 3,
    maxMinutes: 15,
    mode: 'move',
    span: fullWidthSpan,
  })
  const expandableDelta = resolveMermaidGanttTimelineDragEffectiveDelta({
    allowTimelineExpansion: true,
    deltaMinutes: 3,
    maxMinutes: 15,
    mode: 'move',
    span: fullWidthSpan,
  })
  if (
    clampedMovePreview.startMinutes !== 0 ||
    expandableMovePreview.startMinutes !== 3 ||
    expandableDelta !== 3
  ) {
    throw new Error(`expected video sequence move edits to allow full-width clips to create leading gap, got ${JSON.stringify({ clampedMovePreview, expandableMovePreview, expandableDelta })}`)
  }
  const fullWidthSequenceCode = [
    'gantt',
    '  title Video Sequence',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Video',
    '  source-clip.mp4 : clip_hk, 00:00, 15m',
    '  section Mask',
    '  source-clip.mp4 mask : clip_hk_mask, 00:00, 15m',
    '  section Grade',
    '  source-clip.mp4 grade : clip_hk_grade, 00:00, 15m',
    '  section Audio',
    '  source-clip.mp4 audio : clip_hk_audio, 00:00, 15m',
  ].join('\n')
  const movedFullWidthSequenceCode = updateMermaidGanttVideoSequenceClipGroupTiming({
    code: fullWidthSequenceCode,
    rowLineIndex: 5,
    mode: 'move',
    deltaMinutes: 3,
  })
  const selectedOnlyMovedFullWidthSequenceCode = updateMermaidGanttVideoSequenceClipTiming({
    code: fullWidthSequenceCode,
    rowLineIndex: 11,
    mode: 'move',
    deltaMinutes: 3,
    syncMode: 'selected',
  })
  const groupedModeMovedFullWidthSequenceCode = updateMermaidGanttVideoSequenceClipTiming({
    code: fullWidthSequenceCode,
    rowLineIndex: 11,
    mode: 'move',
    deltaMinutes: 3,
    syncMode: 'grouped',
  })
  const movedFullWidthSequenceModel = buildMermaidGanttTimelineModel(movedFullWidthSequenceCode || '')
  const movedFullWidthVideoSpan = movedFullWidthSequenceModel.taskSpans.find(span => span.label === 'source-clip.mp4')
  const visibleSequenceLanes = resolveVisibleVideoSequenceTimelineLanes(movedFullWidthSequenceModel.taskSpans)
  const bottomPanelVisibleSequenceLanes = resolveVisibleVideoSequenceTimelineLanes(movedFullWidthSequenceModel.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  })
  const bottomPanelRenderableSequenceLabels = resolveRenderableVideoSequenceTimelineSpans(movedFullWidthSequenceModel.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  }).map(span => span.label).join(' | ')
  const enabledBottomPanelVisibleSequenceLanes = resolveVisibleVideoSequenceTimelineLanes(movedFullWidthSequenceModel.taskSpans, {
    disabledLaneIds: [],
  })
  const enabledBottomPanelRenderableSequenceLabels = resolveRenderableVideoSequenceTimelineSpans(movedFullWidthSequenceModel.taskSpans, {
    disabledLaneIds: [],
  }).map(span => span.label).join(' | ')
  const preciseTrimmedSequenceCode = updateMermaidGanttVideoSequenceClipGroupTiming({
    code: fullWidthSequenceCode,
    rowLineIndex: 5,
    mode: 'resize-start',
    deltaMinutes: 2,
  })
  const preciseExtendedSequenceCode = updateMermaidGanttVideoSequenceClipGroupTiming({
    code: preciseTrimmedSequenceCode || '',
    rowLineIndex: 5,
    mode: 'resize-end',
    deltaMinutes: 1,
  })
  if (
    !movedFullWidthSequenceCode?.includes('source-clip.mp4 : clip_hk, 00:03, 15m') ||
    !movedFullWidthSequenceCode.includes('source-clip.mp4 mask : clip_hk_mask, kgsrc_0_15, 00:03, 15m') ||
    !movedFullWidthSequenceCode.includes('source-clip.mp4 grade : clip_hk_grade, kgsrc_0_15, 00:03, 15m') ||
    !movedFullWidthSequenceCode.includes('source-clip.mp4 audio : clip_hk_audio, kgsrc_0_15, 00:03, 15m') ||
    movedFullWidthSequenceModel.durationMinutes !== 18 ||
    movedFullWidthVideoSpan?.startMinutes !== 3 ||
    movedFullWidthVideoSpan?.endMinutes !== 18 ||
    resolveVisibleVideoSequenceTimelineLaneCount(movedFullWidthSequenceModel.taskSpans) !== 4 ||
    visibleSequenceLanes.map(lane => lane.id).join(',') !== 'video,mask,grade,audio'
  ) {
    throw new Error(`expected moved full-width video sequence clip to remain visibly editable in a compact active-lane stack, got ${JSON.stringify({ movedFullWidthSequenceCode, movedFullWidthSequenceModel, movedFullWidthVideoSpan, visibleSequenceLanes })}`)
  }
  if (
    bottomPanelVisibleSequenceLanes.map(lane => lane.id).join(',') !== 'video,audio' ||
    bottomPanelRenderableSequenceLabels.includes('mask') ||
    bottomPanelRenderableSequenceLabels.includes('grade')
  ) {
    throw new Error(`expected BottomPanel Timeline to keep Mask and Grade disabled by default without visible lanes or clips, got ${JSON.stringify({ bottomPanelRenderableSequenceLabels, bottomPanelVisibleSequenceLanes })}`)
  }
  if (
    enabledBottomPanelVisibleSequenceLanes.map(lane => lane.id).join(',') !== 'video,mask,grade,audio' ||
    !enabledBottomPanelRenderableSequenceLabels.includes('source-clip.mp4 mask') ||
    !enabledBottomPanelRenderableSequenceLabels.includes('source-clip.mp4 grade')
  ) {
    throw new Error(`expected FloatingPanel-enabled Mask and Grade lanes to activate authorable BottomPanel Timeline clips, got ${JSON.stringify({ enabledBottomPanelRenderableSequenceLabels, enabledBottomPanelVisibleSequenceLanes })}`)
  }
  if (
    !selectedOnlyMovedFullWidthSequenceCode?.includes('source-clip.mp4 : clip_hk, 00:00, 15m') ||
    !selectedOnlyMovedFullWidthSequenceCode.includes('source-clip.mp4 mask : clip_hk_mask, 00:00, 15m') ||
    !selectedOnlyMovedFullWidthSequenceCode.includes('source-clip.mp4 grade : clip_hk_grade, 00:00, 15m') ||
    !selectedOnlyMovedFullWidthSequenceCode.includes('source-clip.mp4 audio : clip_hk_audio, 00:03, 15m') ||
    !groupedModeMovedFullWidthSequenceCode?.includes('source-clip.mp4 : clip_hk, kgsrc_0_15, 00:03, 15m') ||
    !groupedModeMovedFullWidthSequenceCode.includes('source-clip.mp4 mask : clip_hk_mask, kgsrc_0_15, 00:03, 15m') ||
    !groupedModeMovedFullWidthSequenceCode.includes('source-clip.mp4 grade : clip_hk_grade, kgsrc_0_15, 00:03, 15m') ||
    !groupedModeMovedFullWidthSequenceCode.includes('source-clip.mp4 audio : clip_hk_audio, 00:03, 15m')
  ) {
    throw new Error(`expected group/ungroup timing sync modes to choose between companion-lane sync and selected-lane edits, got ${JSON.stringify({ groupedModeMovedFullWidthSequenceCode, selectedOnlyMovedFullWidthSequenceCode })}`)
  }
  if (
    !preciseTrimmedSequenceCode?.includes('source-clip.mp4 : clip_hk, kgsrc_2_15, 00:02, 13m') ||
    !preciseTrimmedSequenceCode.includes('source-clip.mp4 mask : clip_hk_mask, kgsrc_2_15, 00:02, 13m') ||
    !preciseTrimmedSequenceCode.includes('source-clip.mp4 grade : clip_hk_grade, kgsrc_2_15, 00:02, 13m') ||
    !preciseTrimmedSequenceCode.includes('source-clip.mp4 audio : clip_hk_audio, kgsrc_2_15, 00:02, 13m') ||
    !preciseExtendedSequenceCode?.includes('source-clip.mp4 : clip_hk, kgsrc_2_16, 00:02, 14m') ||
    !preciseExtendedSequenceCode.includes('source-clip.mp4 mask : clip_hk_mask, kgsrc_2_16, 00:02, 14m') ||
    !preciseExtendedSequenceCode.includes('source-clip.mp4 grade : clip_hk_grade, kgsrc_2_16, 00:02, 14m') ||
    !preciseExtendedSequenceCode.includes('source-clip.mp4 audio : clip_hk_audio, kgsrc_2_16, 00:02, 14m')
  ) {
    throw new Error(`expected generated BottomPanel companion lanes to stay synchronized with Media canvas clip timing, got ${JSON.stringify({ preciseTrimmedSequenceCode, preciseExtendedSequenceCode })}`)
  }
  const splitSequenceCode = [
    'gantt',
    '  title Video Sequence',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  section Video',
    '  source-clip.mp4 : clip_hk, 00:00, 1m',
    '  source-clip.mp4 splice : clip_hk_splice, 00:01, 4m',
    '  section Mask',
    '  source-clip.mp4 mask : clip_hk_mask, 00:00, 1m',
    '  source-clip.mp4 mask splice : clip_hk_mask_splice, 00:01, 4m',
    '  section Grade',
    '  source-clip.mp4 grade : clip_hk_grade, 00:00, 1m',
    '  source-clip.mp4 grade splice : clip_hk_grade_splice, 00:01, 4m',
    '  section Audio',
    '  source-clip.mp4 audio : clip_hk_audio, 00:00, 1m',
    '  source-clip.mp4 audio splice : clip_hk_audio_splice, 00:01, 4m',
  ].join('\n')
  const splitSequenceModel = buildMermaidGanttTimelineModel(splitSequenceCode)
  const splitSpliceSpan = splitSequenceModel.taskSpans.find(span => span.label === 'source-clip.mp4 splice')
  const movedSplitSequenceCode = splitSpliceSpan
    ? updateMermaidGanttVideoSequenceClipGroupTiming({
        code: splitSequenceCode,
        rowLineIndex: splitSpliceSpan.lineIndex,
        mode: 'move',
        deltaMinutes: 1,
      })
    : null
  const trimmedSplitSequenceCode = splitSpliceSpan
    ? updateMermaidGanttVideoSequenceClipGroupTiming({
        code: splitSequenceCode,
        rowLineIndex: splitSpliceSpan.lineIndex,
        mode: 'resize-start',
        deltaMinutes: 1,
      })
    : null
  const selectedOnlySplitSequenceCode = splitMermaidGanttVideoSequenceClipAtOffset({
    code: fullWidthSequenceCode,
    rowLineIndex: 11,
    splitOffsetMinutes: 2,
    syncMode: 'selected',
  })
  const groupedModeSplitSequenceCode = splitMermaidGanttVideoSequenceClipAtOffset({
    code: fullWidthSequenceCode,
    rowLineIndex: 11,
    splitOffsetMinutes: 2,
    syncMode: 'grouped',
  })
  const repeatedSpliceSplitSequenceCode = splitMermaidGanttVideoSequenceClipAtOffset({
    code: splitSequenceCode,
    rowLineIndex: 6,
    splitOffsetMinutes: 1,
    syncMode: 'grouped',
  })
  if (
    !splitSpliceSpan ||
    !movedSplitSequenceCode?.includes('source-clip.mp4 splice : clip_hk_splice, 00:02, 4m') ||
    !movedSplitSequenceCode.includes('source-clip.mp4 mask splice : clip_hk_mask_splice, kgsrc_1_5, 00:02, 4m') ||
    !movedSplitSequenceCode.includes('source-clip.mp4 grade splice : clip_hk_grade_splice, kgsrc_1_5, 00:02, 4m') ||
    !movedSplitSequenceCode.includes('source-clip.mp4 audio splice : clip_hk_audio_splice, kgsrc_1_5, 00:02, 4m') ||
    !trimmedSplitSequenceCode?.includes('source-clip.mp4 splice : clip_hk_splice, kgsrc_2_5, 00:02, 3m') ||
    !trimmedSplitSequenceCode.includes('source-clip.mp4 mask splice : clip_hk_mask_splice, kgsrc_2_5, 00:02, 3m') ||
    !trimmedSplitSequenceCode.includes('source-clip.mp4 grade splice : clip_hk_grade_splice, kgsrc_2_5, 00:02, 3m') ||
    !trimmedSplitSequenceCode.includes('source-clip.mp4 audio splice : clip_hk_audio_splice, kgsrc_2_5, 00:02, 3m')
  ) {
    throw new Error(`expected split/splice companion lanes to remain synchronized as a source-backed Media canvas group, got ${JSON.stringify({ movedSplitSequenceCode, splitSpliceSpan, trimmedSplitSequenceCode })}`)
  }
  if (
    !selectedOnlySplitSequenceCode?.includes('source-clip.mp4 audio : clip_hk_audio, kgsrc_0_2, 00:00, 2m') ||
    !selectedOnlySplitSequenceCode.includes('source-clip.mp4 audio splice : clip_hk_audio_splice, kgsrc_2_15, 00:02, 13m') ||
    selectedOnlySplitSequenceCode.includes('source-clip.mp4 mask splice') ||
    !groupedModeSplitSequenceCode?.includes('source-clip.mp4 splice : clip_hk_splice, kgsrc_2_15, 00:02, 13m') ||
    !groupedModeSplitSequenceCode.includes('source-clip.mp4 mask splice : clip_hk_mask_splice, kgsrc_2_15, 00:02, 13m') ||
    !groupedModeSplitSequenceCode.includes('source-clip.mp4 grade splice : clip_hk_grade_splice, kgsrc_2_15, 00:02, 13m') ||
    !groupedModeSplitSequenceCode.includes('source-clip.mp4 audio splice : clip_hk_audio_splice, kgsrc_2_15, 00:02, 13m')
  ) {
    throw new Error(`expected selected/grouped split sync modes to preserve user group/ungroup intent, got ${JSON.stringify({ groupedModeSplitSequenceCode, selectedOnlySplitSequenceCode })}`)
  }
  if (
    !repeatedSpliceSplitSequenceCode?.includes('source-clip.mp4 splice : clip_hk_splice, kgsrc_1_2, 00:01, 1m') ||
    !repeatedSpliceSplitSequenceCode.includes('source-clip.mp4 splice splice : clip_hk_splice_splice, kgsrc_2_5, 00:02, 3m') ||
    !repeatedSpliceSplitSequenceCode.includes('source-clip.mp4 mask splice : clip_hk_mask_splice, kgsrc_1_2, 00:01, 1m') ||
    !repeatedSpliceSplitSequenceCode.includes('source-clip.mp4 mask splice splice : clip_hk_mask_splice_splice, kgsrc_2_5, 00:02, 3m') ||
    !repeatedSpliceSplitSequenceCode.includes('source-clip.mp4 grade splice splice : clip_hk_grade_splice_splice, kgsrc_2_5, 00:02, 3m') ||
    !repeatedSpliceSplitSequenceCode.includes('source-clip.mp4 audio splice splice : clip_hk_audio_splice_splice, kgsrc_2_5, 00:02, 3m')
  ) {
    throw new Error(`expected repeated video-sequence cuts to create unique splice-depth ids while keeping companion lanes synchronized, got ${repeatedSpliceSplitSequenceCode}`)
  }
  const transitionCode = insertMermaidGanttVideoSequenceOperationRow({ code, rowLineIndex: 3, operation: 'transition' })
  const filterCode = insertMermaidGanttVideoSequenceOperationRow({ code: transitionCode || code, rowLineIndex: 3, operation: 'filter' })
  if (
    !transitionCode?.includes('Opening shot transition : clip_opening_transition, kgsrc_0_6, 09:00, 6m') ||
    !filterCode?.includes('Opening shot filter : clip_opening_filter, kgsrc_0_6, 09:00, 6m')
  ) {
    throw new Error(`expected expanded operation rows for transition and filter, got ${JSON.stringify({ transitionCode, filterCode })}`)
  }
  const sequenceSource: VideoSequenceTimelineSource = {
    byteSize: 100,
    id: 'clip_opening',
    importMode: 'url',
    mimeHint: 'video/mp4',
    originalName: 'opening.mp4',
    relativePath: 'opening.mp4',
    sourceUrl: 'https://media.example.test/opening.mp4',
    workspacePath: '',
  }
  const exportPlan = buildVideoSequenceExportPlan({
    code: [
      'gantt',
      '  title Sequence',
      '  section Video',
      '  Opening shot : clip_opening, 09:00, 2m',
      '  Opening shot splice : clip_opening_splice, 09:02, 4m',
    ].join('\n'),
    filenameHint: 'Sequence.md',
    sources: [sequenceSource],
  })
  const sourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: exportPlan,
    positionMinutes: 3,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const sourcePosition = resolveTimelinePlanPositionFromSourceTime({
    currentTimeSeconds: 7.5,
    plan: exportPlan,
    preferredPositionMinutes: 3,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const playheadSegment = resolveTimelinePlanSegmentAtPosition({
    plan: exportPlan,
    positionMinutes: 3,
  })
  if (
    Math.abs((sourceTime?.sourceTimeSeconds || 0) - 7.5) > 0.0001 ||
    Math.abs((sourcePosition || 0) - 3) > 0.0001 ||
    playheadSegment?.segment.label !== 'Opening shot splice' ||
    playheadSegment.contains !== true
  ) {
    throw new Error(`expected edited video sequence preview sync to resolve through source ranges, got ${JSON.stringify({ playheadSegment, sourcePosition, sourceTime })}`)
  }
  const movedSpliceOrderPlan = buildVideoSequenceExportPlan({
    code: [
      'gantt',
      '  title Video Sequence',
      '  section Video',
      '  source-clip.mp4 : clip_opening, 00:03, 1m',
      '  source-clip.mp4 splice : clip_opening_splice, 00:01, 1m',
    ].join('\n'),
    filenameHint: 'Sequence.md',
    sources: [sequenceSource],
  })
  const movedBaseSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: movedSpliceOrderPlan,
    positionMinutes: 3.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const movedSpliceSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: movedSpliceOrderPlan,
    positionMinutes: 1.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const movedBasePosition = resolveTimelinePlanPositionFromSourceTime({
    currentTimeSeconds: 3.75,
    plan: movedSpliceOrderPlan,
    preferredPositionMinutes: 3.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  if (
    Math.abs((movedBaseSourceTime?.sourceTimeSeconds || 0) - 3.75) > 0.0001 ||
    Math.abs((movedSpliceSourceTime?.sourceTimeSeconds || 0) - 11.25) > 0.0001 ||
    Math.abs((movedBasePosition || 0) - 3.5) > 0.0001
  ) {
    throw new Error(`expected moved split clips to preserve source order instead of visible timeline order, got ${JSON.stringify({ movedBasePosition, movedBaseSourceTime, movedSpliceSourceTime })}`)
  }
  const decoupledAudioPreviewCode = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  source-clip.mp4 : clip_opening, 00:00, 5m',
    '  section Grade',
    '  source-clip.mp4 grade : clip_opening_grade, 00:00, 15m',
    '  section Audio',
    '  source-clip.mp4 audio : clip_opening_audio, 00:04, 1m',
  ].join('\n')
  const decoupledAudioModel = buildMermaidGanttTimelineModel(decoupledAudioPreviewCode)
  const decoupledAudioSpan = decoupledAudioModel.taskSpans.find(span => span.label === 'source-clip.mp4 audio')
  const decoupledVideoExportPlan = buildVideoSequenceExportPlan({
    code: decoupledAudioPreviewCode,
    filenameHint: 'Sequence.md',
    sources: [sequenceSource],
  })
  const decoupledAudioPreviewPlan = buildTimelinePreviewSyncPlan({
    code: decoupledAudioPreviewCode,
    filenameHint: 'Sequence.md',
    selectedRowKey: decoupledAudioSpan?.rowKey,
    sources: [sequenceSource],
  })
  const decoupledVideoSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: decoupledVideoExportPlan,
    positionMinutes: 4.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const decoupledAudioSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: decoupledAudioPreviewPlan,
    positionMinutes: 4.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const decoupledAudioPosition = resolveTimelinePlanPositionFromSourceTime({
    currentTimeSeconds: 4.5,
    plan: decoupledAudioPreviewPlan,
    preferredPositionMinutes: 4.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  if (
    !decoupledAudioSpan ||
    Math.abs((decoupledVideoSourceTime?.sourceTimeSeconds || 0) - 13.5) > 0.0001 ||
    decoupledAudioPreviewPlan?.segments.length !== 1 || decoupledAudioPreviewPlan.segments[0]?.label !== 'source-clip.mp4 audio' ||
    Math.abs((decoupledAudioSourceTime?.sourceTimeSeconds || 0) - 4.5) > 0.0001 || Math.abs((decoupledAudioPosition || 0) - 4.5) > 0.0001
  ) {
    throw new Error(`expected Media canvas preview sync to play selected audio strips through their source-backed video media, got ${JSON.stringify({ decoupledAudioPosition, decoupledAudioPreviewPlan, decoupledAudioSourceTime, decoupledAudioSpan, decoupledVideoSourceTime })}`)
  }
  const multiLanePreviewCode = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  source-clip.mp4 : clip_opening, 00:03, 1m',
    '  source-clip.mp4 splice : clip_opening_splice, 00:01, 1m',
    '  section Mask',
    '  source-clip.mp4 mask : clip_opening_mask, 00:00, 1m',
    '  source-clip.mp4 mask splice : clip_opening_mask_splice, 00:01, 1m',
    '  source-clip.mp4 mask splice splice : clip_opening_mask_splice_splice, 00:02, 3m',
    '  section Grade',
    '  source-clip.mp4 grade : clip_opening_grade, 00:00, 1m',
    '  source-clip.mp4 grade splice : clip_opening_grade_splice, 00:01, 1m',
    '  source-clip.mp4 grade splice splice : clip_opening_grade_splice_splice, 00:02, 3m',
    '  section Audio',
    '  source-clip.mp4 audio : clip_opening_audio, 00:00, 1m',
    '  source-clip.mp4 audio splice : clip_opening_audio_splice, 00:06, 1m',
    '  source-clip.mp4 audio splice splice : clip_opening_audio_splice_splice, 00:13, 2m',
  ].join('\n')
  const multiLaneModel = buildMermaidGanttTimelineModel(multiLanePreviewCode)
  const selectedMaskSpan = multiLaneModel.taskSpans.find(span => span.label === 'source-clip.mp4 mask splice splice')
  const selectedMaskPreviewPlan = buildTimelinePreviewSyncPlan({
    code: multiLanePreviewCode,
    filenameHint: 'Sequence.md',
    selectedRowKey: selectedMaskSpan?.rowKey,
    sources: [sequenceSource],
  })
  const selectedMaskSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: selectedMaskPreviewPlan,
    positionMinutes: 2.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const selectedMaskPosition = resolveTimelinePlanPositionFromSourceTime({
    currentTimeSeconds: 2.5,
    plan: selectedMaskPreviewPlan,
    preferredPositionMinutes: 2.5,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  if (
    !selectedMaskSpan ||
    selectedMaskPreviewPlan !== null ||
    selectedMaskSourceTime !== null ||
    selectedMaskPosition !== null
  ) {
    throw new Error(`expected selected mask operation rows to stay empty instead of inheriting video media, got ${JSON.stringify({ selectedMaskPosition, selectedMaskPreviewPlan, selectedMaskSourceTime, selectedMaskSpan })}`)
  }
  const boundedAudioPreviewCode = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  source-clip.mp4 : clip_opening, 00:01, 3m',
    '  section Mask',
    '  source-clip.mp4 mask : clip_opening_mask, 00:03, 1m',
    '  section Grade',
    '  source-clip.mp4 grade : clip_opening_grade, 00:03, 12m',
    '  section Audio',
    '  source-clip.mp4 audio : clip_opening_audio, 00:02, 2m',
  ].join('\n')
  const boundedAudioModel = buildMermaidGanttTimelineModel(boundedAudioPreviewCode)
  const boundedAudioSpan = boundedAudioModel.taskSpans.find(span => span.label === 'source-clip.mp4 audio')
  const boundedAudioPreviewPlan = buildTimelinePreviewSyncPlan({
    code: boundedAudioPreviewCode,
    filenameHint: 'Sequence.md',
    selectedRowKey: boundedAudioSpan?.rowKey,
    sources: [sequenceSource],
  })
  const boundedAudioSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    allowNearestSegment: true,
    plan: boundedAudioPreviewPlan,
    positionMinutes: 15,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  const boundedAudioPosition = resolveTimelinePlanPositionFromSourceTime({
    currentTimeSeconds: 15,
    plan: boundedAudioPreviewPlan,
    preferredPositionMinutes: 15,
    source: sequenceSource,
    sourceDurationSeconds: 15,
  })
  if (
    !boundedAudioSpan ||
    boundedAudioPreviewPlan?.segments.length !== 1 || boundedAudioPreviewPlan.segments[0]?.label !== 'source-clip.mp4 audio' ||
    Math.abs((boundedAudioSourceTime?.sourceTimeSeconds || 0) - 4) > 0.0001 || Math.abs((boundedAudioPosition || 0) - 4) > 0.0001
  ) {
    throw new Error(`expected selected audio rows backed by video media to resolve to the bounded source audio window, got ${JSON.stringify({ boundedAudioPosition, boundedAudioPreviewPlan, boundedAudioSourceTime, boundedAudioSpan })}`)
  }
  const sourceMirror: VideoSequenceTimelineSource = {
    ...sequenceSource,
    id: '',
    sourceUrl: '',
    workspacePath: 'workspace/opening.mp4',
  }
  const sourceSibling: VideoSequenceTimelineSource = {
    ...sequenceSource,
    id: 'closing',
    originalName: 'closing.mp4',
    relativePath: 'closing.mp4',
    sourceUrl: 'https://media.example.test/closing.mp4',
    workspacePath: '',
  }
  if (
    !areVideoSequenceExportSourcesEqual(sequenceSource, sourceMirror) ||
    areVideoSequenceExportSourcesEqual(sequenceSource, sourceSibling)
  ) {
    throw new Error('expected video sequence source identity matching to stay source-owned and avoid broad filename fallbacks')
  }
  const multiSourcePlan = buildVideoSequenceExportPlan({
    code: [
      'gantt',
      '  title Sequence',
      '  section Video',
      '  Opening shot : clip_opening, 09:00, 2m',
      '  Insert shot : closing, 09:04, 2m',
      '  Opening shot splice : clip_opening_splice, 09:08, 4m',
      '  Opening shot splice grade : clip_opening_grade_splice, 09:08, 4m',
      '  Opening shot splice transition : clip_opening_transition_splice, 09:08, 4m',
    ].join('\n'),
    filenameHint: 'Sequence.md',
    sources: [sequenceSource, sourceSibling],
  })
  const segments = multiSourcePlan?.segments || []
  const firstOpening = segments.find(segment => segment.label === 'Opening shot')
  const insertShot = segments.find(segment => segment.label === 'Insert shot')
  const openingSplice = segments.find(segment => segment.label === 'Opening shot splice')
  if (
    multiSourcePlan?.durationMinutes !== 12 ||
    segments.length !== 3 ||
    !firstOpening ||
    !insertShot ||
    !openingSplice ||
    firstOpening.sourceStartRatio !== 0 ||
    Math.abs(firstOpening.sourceEndRatio - (2 / 6)) > 0.0001 ||
    insertShot.source !== sourceSibling ||
    insertShot.timelineStartMinutes !== 4 ||
    insertShot.timelineEndMinutes !== 6 ||
    Math.abs(openingSplice.sourceStartRatio - (2 / 6)) > 0.0001 ||
    openingSplice.sourceEndRatio !== 1 ||
    !openingSplice.hasGrade ||
    openingSplice.hasMask ||
    resolveTimelinePlanSourceTimeAtPosition({
      plan: multiSourcePlan,
      positionMinutes: 8,
      source: sequenceSource,
      sourceDurationSeconds: 18,
    })?.sourceTimeSeconds !== 6
  ) {
    throw new Error(`expected gaps, multiple sources, splice ranges, and operation lanes to compile into a stable preview plan, got ${JSON.stringify(multiSourcePlan)}`)
  }
}
