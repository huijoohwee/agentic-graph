import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  resolveRenderableVideoSequenceTimelineSpans,
  resolveVisibleVideoSequenceTimelineLanes,
  shouldRenderVideoSequenceTimelineSpan,
  type VideoSequenceTimelineSource,
} from '@/components/timeline/videoSequenceTimeline'
import {
  buildTimelinePreviewSyncPlan,
  buildTimelinePreviewThumbnailPlan,
  resolveTimelinePlanSourceTimeAtPosition,
} from '@/components/timeline/timelinePlanSync'
import { resolveTimelineVideoPreviewTargetSeconds } from '@/components/timeline/timelinePreviewSync'
import { resolveGanttTimelineDisplaySourceTime } from '@/features/gitgraph/useGanttTimelineDisplayModel'
import { resolveGanttTimelinePlaybackStartPosition } from '@/features/gitgraph/useGanttTimelinePlaybackControls'
import {
  buildRichMediaTimelineTransportFrame,
  resolveRichMediaTimelineMediaTargetSeconds,
} from '@/lib/render/richMediaTimelineSync'

const root = process.cwd()

function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}

export function testSelectedVideoPreviewSyncUsesStableSourceRanges() {
  const source: VideoSequenceTimelineSource = {
    byteSize: 100,
    id: 'clip_opening',
    importMode: 'url',
    mimeHint: 'video/mp4',
    originalName: 'opening.mp4',
    relativePath: 'opening.mp4',
    sourceUrl: 'https://media.example.test/opening.mp4',
    durationSeconds: 15,
    workspacePath: '',
  }
  const code = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  source-clip.mp4 : clip_opening, 00:03, 1m',
    '  source-clip.mp4 splice : clip_opening_splice, 00:01, 1m',
  ].join('\n')
  const selectedSpan = buildMermaidGanttTimelineModel(code).taskSpans.find(span => span.label === 'source-clip.mp4 splice')
  const previewPlan = buildTimelinePreviewSyncPlan({
    code,
    filenameHint: 'Sequence.md',
    selectedRowKey: selectedSpan?.rowKey,
    sources: [source],
  })
  const thumbnailPlan = buildTimelinePreviewThumbnailPlan({
    code,
    filenameHint: 'Sequence.md',
    sources: [source],
  })
  const thumbnailSpliceSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: thumbnailPlan,
    positionMinutes: 1.5,
    source,
    sourceDurationSeconds: 15,
  })
  const selectedSpliceSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: previewPlan,
    positionMinutes: 1.5,
    source,
    sourceDurationSeconds: 15,
  })
  const selectedExplicitRangePlan = buildTimelinePreviewSyncPlan({
    code: [
      'gantt',
      '  title Video Sequence',
      '  section Video',
      '  source-clip.mp4 : clip_opening, kgsrc_8_9, 00:08, 1m',
    ].join('\n'),
    filenameHint: 'Sequence.md',
    selectedRowKey: buildMermaidGanttTimelineModel([
      'gantt',
      '  title Video Sequence',
      '  section Video',
      '  source-clip.mp4 : clip_opening, kgsrc_8_9, 00:08, 1m',
    ].join('\n')).taskSpans[0]?.rowKey,
    sources: [source],
  })
  const selectedExplicitSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: selectedExplicitRangePlan,
    positionMinutes: 8,
    source,
    sourceDurationSeconds: 15,
  })
  const repeatedSpliceResizeCode = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  source-clip.mp4 : clip_opening, kgsrc_0_1, 00:00, 1m',
    '  source-clip.mp4 splice : clip_opening_splice, kgsrc_1_2, 00:01, 1m',
    '  source-clip.mp4 splice splice : clip_opening_splice_splice, kgsrc_2_3, 00:02, 1m',
    '  source-clip.mp4 splice splice splice : clip_opening_splice_splice_splice, kgsrc_3_4, 00:03, 1m',
    '  source-clip.mp4 splice splice splice splice : clip_opening_splice_splice_splice_splice, kgsrc_4_5, 00:00, 1m',
  ].join('\n')
  const repeatedSpliceSpan = buildMermaidGanttTimelineModel(repeatedSpliceResizeCode).taskSpans.find(span => span.label === 'source-clip.mp4 splice splice splice splice')
  const repeatedSplicePreviewPlan = buildTimelinePreviewSyncPlan({
    code: repeatedSpliceResizeCode,
    filenameHint: 'Sequence.md',
    selectedRowKey: repeatedSpliceSpan?.rowKey,
    sources: [source],
  })
  const repeatedSpliceThumbnailPlan = buildTimelinePreviewThumbnailPlan({
    code: repeatedSpliceResizeCode,
    filenameHint: 'Sequence.md',
    sources: [source],
  })
  const repeatedSplicePreviewSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: repeatedSplicePreviewPlan,
    positionMinutes: 0.5,
    source,
    sourceDurationSeconds: 15,
  })
  const repeatedSpliceThumbnailSourceTime = resolveTimelinePlanSourceTimeAtPosition({
    plan: repeatedSpliceThumbnailPlan,
    positionMinutes: 0.5,
    source,
    sourceDurationSeconds: 15,
  })
  if (
    !selectedSpan ||
    Math.abs((selectedSpliceSourceTime?.sourceTimeSeconds || 0) - 5.625) > 0.0001 ||
    Math.abs((thumbnailSpliceSourceTime?.sourceTimeSeconds || 0) - 5.625) > 0.0001 ||
    Math.abs((selectedExplicitSourceTime?.sourceTimeSeconds || 0) - 8) > 0.0001 ||
    !repeatedSpliceSpan ||
    Math.abs((repeatedSplicePreviewSourceTime?.sourceTimeSeconds || 0) - 4.5) > 0.0001 ||
    Math.abs((repeatedSpliceThumbnailSourceTime?.sourceTimeSeconds || 0) - 4.5) > 0.0001
  ) {
    throw new Error(`expected selected video preview sync and thumbnail strips to follow the selected row source window instead of rebasing to sequence start, got ${JSON.stringify({ previewPlan, repeatedSplicePreviewPlan, repeatedSplicePreviewSourceTime, repeatedSpliceSpan, repeatedSpliceThumbnailPlan, repeatedSpliceThumbnailSourceTime, selectedExplicitRangePlan, selectedExplicitSourceTime, selectedSpan, selectedSpliceSourceTime, thumbnailPlan, thumbnailSpliceSourceTime })}`)
  }
}

export function testVideoSequenceTimelineSkipsEmptyBarsAndLanes() {
  const spans = buildMermaidGanttTimelineModel([
    'gantt',
    '  title Video Sequence',
    '  section Audio',
    '  Audible audio : clip_audio, 00:01, 1m',
  ].join('\n')).taskSpans
  const audioSpan = spans.find(span => span.label === 'Audible audio')
  if (!audioSpan) throw new Error('expected audio fixture span')
  const emptySpan = {
    ...audioSpan,
    durationMinutes: 0,
    endMinutes: audioSpan.startMinutes,
    label: 'Empty video',
    raw: 'Empty video : clip_empty, 00:01, 0m',
    rowKey: 'empty-video',
  }
  const lanes = resolveVisibleVideoSequenceTimelineLanes([emptySpan, audioSpan])
  if (
    shouldRenderVideoSequenceTimelineSpan(emptySpan) ||
    !shouldRenderVideoSequenceTimelineSpan(audioSpan) ||
    lanes.map(lane => lane.id).join(' ') !== 'audio'
  ) {
    throw new Error(`expected zero-duration video spans to stay out of rendered bars and visible lanes, got ${JSON.stringify({ emptySpan, lanes })}`)
  }
  const sourceGapSpans = buildMermaidGanttTimelineModel([
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  Shot A : clip_a, kgsrc_0_1, 00:00, 1m',
    '  Shot B : clip_b, kgsrc_2_3, 00:02, 1m',
    '  section Grade',
    '  Invalid grade bridge : clip_grade, kgsrc_0_3, 00:00, 3m',
    '  section Audio',
    '  Valid audio hit : clip_audio, kgsrc_2_3, 00:02, 1m',
  ].join('\n')).taskSpans
  const renderableLabels = resolveRenderableVideoSequenceTimelineSpans(sourceGapSpans, { sourceCoverageMode: 'source-covered' }).map(span => span.label).join(' | ')
  const sourceGapLanes = resolveVisibleVideoSequenceTimelineLanes(sourceGapSpans, { sourceCoverageMode: 'source-covered' }).map(lane => lane.id).join(' ')
  const editorLabels = resolveRenderableVideoSequenceTimelineSpans(sourceGapSpans).map(span => span.label).join(' | ')
  const editorLanes = resolveVisibleVideoSequenceTimelineLanes(sourceGapSpans).map(lane => lane.id).join(' ')
  if (
    renderableLabels.includes('Invalid grade bridge') ||
    !renderableLabels.includes('Valid audio hit') ||
    sourceGapLanes !== 'video audio' ||
    !editorLabels.includes('Invalid grade bridge') ||
    editorLanes !== 'video grade audio'
  ) {
    throw new Error(`expected source-covered projection to hide invalid bridges while authored BottomPanel editing keeps lanes visible, got ${JSON.stringify({ editorLabels, editorLanes, renderableLabels, sourceGapLanes })}`)
  }

  const sourceVideoDuplicateSpans = buildMermaidGanttTimelineModel([
    'gantt', '  title Video Sequence', '  dateFormat HH:mm', '  axisFormat %H:%M', '  section Source video',
    '  Source video : operator_source_video, kgsrc_0_0_86, kgpos_0, 0.86m', '  Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4 : operator_source_video, kgsrc_0_0_867, kgpos_0_37, 0.867m',
  ].join('\n')).taskSpans
  const sourceVideoDuplicateLabels = resolveRenderableVideoSequenceTimelineSpans(sourceVideoDuplicateSpans).map(span => span.label).join(' | ')
  const sourceVideoDuplicateLanes = resolveVisibleVideoSequenceTimelineLanes(sourceVideoDuplicateSpans).map(lane => lane.id).join(' ')
  if (sourceVideoDuplicateLabels.includes('Source video') || sourceVideoDuplicateLabels !== 'Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4' || sourceVideoDuplicateLanes !== 'video') throw new Error(`expected generic Source video scaffold to disappear when a real video media row exists, got ${JSON.stringify({ sourceVideoDuplicateLabels, sourceVideoDuplicateLanes })}`)
}

export function testVideoSequencePreviewSyncKeepsVideoGapsEmpty() {
  const source: VideoSequenceTimelineSource = {
    byteSize: 100,
    id: 'clip_opening',
    importMode: 'url',
    mimeHint: 'video/mp4',
    originalName: 'opening.mp4',
    relativePath: 'opening.mp4',
    sourceUrl: 'https://media.example.test/opening.mp4',
    durationSeconds: 15,
    workspacePath: '',
  }
  const code = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  Shot A : clip_opening, kgsrc_0_1, 00:00, 1m',
    '  Shot B : clip_opening_splice, kgsrc_2_3, 00:02, 1m',
  ].join('\n')
  const previewPlan = buildTimelinePreviewSyncPlan({
    code,
    filenameHint: 'Sequence.md',
    sources: [source],
  })
  const firstClipTarget = resolveTimelineVideoPreviewTargetSeconds({
    exportPlan: previewPlan,
    maxPosition: 3,
    positionMinutes: 0.5,
    source,
    sourceDurationSeconds: 15,
  })
  const gapTarget = resolveTimelineVideoPreviewTargetSeconds({
    exportPlan: previewPlan,
    maxPosition: 3,
    positionMinutes: 1.5,
    source,
    sourceDurationSeconds: 15,
  })
  const secondClipTarget = resolveTimelineVideoPreviewTargetSeconds({
    exportPlan: previewPlan,
    maxPosition: 3,
    positionMinutes: 2.5,
    source,
    sourceDurationSeconds: 15,
  })
  const selectedShotA = buildMermaidGanttTimelineModel(code).taskSpans.find(span => span.label === 'Shot A')
  const selectedShotAPlan = buildTimelinePreviewSyncPlan({
    code,
    filenameHint: 'Sequence.md',
    selectedRowKey: selectedShotA?.rowKey,
    sources: [source],
  })
  const selectedSectionPlan = buildTimelinePreviewSyncPlan({
    code,
    filenameHint: 'Sequence.md',
    selectedRowKey: 'section:Grade',
    sources: [source],
  })
  const operationCode = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  Shot A : clip_opening, kgsrc_0_1, 00:00, 1m',
    '  section Grade',
    '  Grade A : clip_opening_grade, kgsrc_0_1, 00:00, 1m',
    '  section Audio',
    '  Audio A : clip_opening_audio, kgsrc_0_1, 00:00, 1m',
  ].join('\n')
  const operationSpans = buildMermaidGanttTimelineModel(operationCode).taskSpans
  const selectedGradePlan = buildTimelinePreviewSyncPlan({
    code: operationCode,
    filenameHint: 'Sequence.md',
    selectedRowKey: operationSpans.find(span => span.label === 'Grade A')?.rowKey,
    sources: [source],
  })
  const selectedVideoBackedAudioPlan = buildTimelinePreviewSyncPlan({
    code: operationCode,
    filenameHint: 'Sequence.md',
    selectedRowKey: operationSpans.find(span => span.label === 'Audio A')?.rowKey,
    sources: [source],
  })
  const selectedRowGapTarget = resolveTimelineVideoPreviewTargetSeconds({
    exportPlan: selectedShotAPlan,
    maxPosition: 3,
    positionMinutes: 2.5,
    source,
    sourceDurationSeconds: 15,
  })
  const clampedGapTarget = resolveTimelinePlanSourceTimeAtPosition({
    allowNearestSegment: true,
    plan: previewPlan,
    positionMinutes: 1.5,
    source,
    sourceDurationSeconds: 15,
  })
  const previewSurfaceText = readSource('components', 'timeline', 'TimelinePreviewSurface.tsx')
  const timelinePlanSyncText = readSource('components', 'timeline', 'timelinePlanSync.ts')
  const previewVideoBindingText = readSource('components', 'timeline', 'useTimelinePreviewVideoBinding.ts')
  if (
    Math.abs((firstClipTarget || 0) - 0.5) > 0.0001 ||
    gapTarget !== null ||
    selectedRowGapTarget !== null ||
    selectedSectionPlan !== null ||
    selectedGradePlan !== null ||
    selectedVideoBackedAudioPlan?.segments.length !== 1 ||
    selectedVideoBackedAudioPlan.segments[0]?.label !== 'Audio A' ||
    selectedVideoBackedAudioPlan.segments[0]?.source.id !== 'clip_opening' ||
    selectedShotAPlan?.segments.length !== 1 ||
    Math.abs((secondClipTarget || 0) - 2.5) > 0.0001 ||
    Math.abs((clampedGapTarget?.sourceTimeSeconds || 0) - 1) > 0.0001
    || !timelinePlanSyncText.includes('canTimelineSegmentDriveMediaPreview')
    || !timelinePlanSyncText.includes("if (lane === 'audio') return sourceKind === 'audio' || sourceKind === 'video'")
    || !timelinePlanSyncText.includes("return lane === 'video' && sourceKind === 'video'")
    || !timelinePlanSyncText.includes('if (args.mediaPreviewOnly && !canTimelineSegmentDriveMediaPreview(segment, source)) return []')
    || !previewSurfaceText.includes('data-kg-video-sequence-playback-gap')
    || !previewSurfaceText.includes('data-kg-video-sequence-empty-playback-surface')
    || !previewSurfaceText.includes("visibility: playbackGap ? 'hidden' : undefined")
    || !previewVideoBindingText.includes('resolveTimelineVideoPreviewTargetSeconds')
    || !previewVideoBindingText.includes('playbackGap')
  ) {
    throw new Error(`expected source-backed video preview sync to preserve empty timeline gaps instead of jumping to adjacent media, got ${JSON.stringify({ clampedGapTarget, firstClipTarget, gapTarget, previewPlan, secondClipTarget, selectedGradePlan, selectedRowGapTarget, selectedSectionPlan, selectedShotAPlan, selectedVideoBackedAudioPlan })}`)
  }
}

export function testVideoSequenceMediaCanvasUsesTransportPositionForPreviewSync() {
  const scaledArtifactTarget = resolveRichMediaTimelineMediaTargetSeconds({
    mediaDurationSeconds: 17.775,
    positionUnits: 4.8,
    timelineDurationUnits: 6,
  })
  if (Math.abs(scaledArtifactTarget - 14.22) > 0.001) {
    throw new Error(`expected Rich Media rendered artifact sync to scale timeline position into media duration, got ${scaledArtifactTarget}`)
  }
  const restartPosition = resolveGanttTimelinePlaybackStartPosition({
    maxMinutes: 6,
    playing: false,
    positionMinutes: 6,
  })
  if (restartPosition !== 0) {
    throw new Error(`expected terminal Gantt transport play action to restart from the source timeline start, got ${restartPosition}`)
  }
  const srcDocFrameFromTransportKey = buildRichMediaTimelineTransportFrame({
    localDocumentKey: '',
    transportDocumentKey: 'workspace/imported-video-agent.md',
    transportPlaybackRate: 1.25,
    transportPlaying: true,
    transportPosition: 20,
    override: { sourcePlayback: false },
  })
  const srcDocFrameWithExplicitTime = buildRichMediaTimelineTransportFrame({
    localDocumentKey: '',
    transportDocumentKey: 'workspace/imported-video-agent.md',
    transportPlaybackRate: 1,
    transportPlaying: true,
    transportPosition: 0.25,
    override: { sourcePlayback: false, timeMs: 13000 },
  })
  const rejectedForeignDocumentFrame = buildRichMediaTimelineTransportFrame({
    localDocumentKey: 'workspace/other.md',
    transportDocumentKey: 'workspace/imported-video-agent.md',
    transportPlaybackRate: 1,
    transportPlaying: true,
    transportPosition: 20,
  })
  if (
    !srcDocFrameFromTransportKey ||
    srcDocFrameFromTransportKey.documentKey !== 'workspace/imported-video-agent.md' ||
    srcDocFrameFromTransportKey.timeMs !== 20000 ||
    srcDocFrameWithExplicitTime?.timeMs !== 13000 ||
    srcDocFrameFromTransportKey.playing !== true ||
    srcDocFrameFromTransportKey.playbackRate !== 1.25 ||
    srcDocFrameFromTransportKey.sourcePlayback !== false ||
    rejectedForeignDocumentFrame !== null
  ) {
    throw new Error(`expected Rich Media srcdoc frame payloads to follow the active BottomPanel transport key and explicit render time without syncing unrelated documents, got ${JSON.stringify({ rejectedForeignDocumentFrame, srcDocFrameFromTransportKey, srcDocFrameWithExplicitTime })}`)
  }
  const bindingText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasBinding.ts')
  const routeEntryText = readSource('components', 'timeline', 'useTimelinePreviewRouteEntry.ts')
  const mediaSessionText = readSource('components', 'timeline', 'useTimelinePreviewMediaSession.ts')
  const previewCollectionText = readSource('components', 'timeline', 'useTimelinePreviewCollection.ts')
  const previewSurfaceText = readSource('components', 'timeline', 'TimelinePreviewSurface.tsx')
  const previewSyncText = readSource('components', 'timeline', 'timelinePreviewSync.ts')
  const sourceActivityText = readSource('components', 'timeline', 'useTimelineSourceActivityModel.ts')
  const activitySurfaceText = readSource('components', 'timeline', 'useTimelinePreviewActivitySurfaceModel.ts')
  const richMediaPanelText = [
    readSource('components', 'RichMediaPanel.types.ts'),
    readSource('components', 'RichMediaPanelDirectMediaSurface.tsx'),
    readSource('components', 'RichMediaPanelIframeSurface.tsx'),
    readSource('components', 'useRichMediaPanelMediaState.ts'),
  ].join('\n')
  const widgetEditorFormText = [readSource('components', 'StoryboardWidget', 'WidgetEditorForm.tsx'), readSource('components', 'StoryboardWidget', 'WidgetEditorFormContent.tsx'), readSource('components', 'StoryboardWidget', 'useWidgetEditorCompactPreviewTimelineSync.ts')].join('\n')
  const richMediaTimelineSyncText = readSource('lib', 'render', 'richMediaTimelineSync.ts')
  const ganttPlaybackControlsText = readSource('features', 'gitgraph', 'useGanttTimelinePlaybackControls.ts')
  const ganttTransportPlaybackModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPlaybackModel.ts')
  const htmlVideoFlowNodeText = readSource('features', 'html-video-renderer', 'htmlVideoFlowNode.ts')
  const cardMediaPreviewText = readSource('lib', 'cards', 'CardMediaPreview.tsx')
  if (
    !bindingText.includes('useTimelineTransportStoreBinding') ||
    !bindingText.includes('transportDocumentKey === previewRouteEntry.bootstrap.documentKey') ||
    !bindingText.includes('clampTimelineTransportValue(transportPosition, 0, previewRouteEntry.maxMinutes)') ||
    !bindingText.includes('positionMinutes,') ||
    !routeEntryText.includes("positionMinutes: args.intent === 'media' ? 0 : args.positionMinutes") ||
    !mediaSessionText.includes('readTimelinePreviewMediaSourceKind') ||
    !mediaSessionText.includes("return 'audio'") ||
    !mediaSessionText.includes("return 'image'") ||
    !previewCollectionText.includes('kind: sourceItem.kind') ||
    !sourceActivityText.includes("export type TimelineSourceActivityMode = 'selection' | 'playhead' | 'fallback' | 'empty'") ||
    !sourceActivityText.includes('if (args.selectionActive) return args.collection.previewPlan || null') ||
    !sourceActivityText.includes('selectedSegmentResolution?.contains ? selectedSegmentResolution.segment : null') ||
    !sourceActivityText.includes("selectionActive ? null : args.surfaceModel.groups[0] || null") ||
    !sourceActivityText.includes("? 'empty'") ||
    !activitySurfaceText.includes("if (args.activityMode === 'empty')") ||
    !activitySurfaceText.includes('families: []') ||
    !previewSurfaceText.includes("args.item.kind === 'video' || args.item.kind === 'audio'") ||
    !previewSurfaceText.includes('onMediaElement=') ||
    !previewSyncText.includes('enableVideoSequenceAudioPlayback') ||
    !previewSyncText.includes("video.setAttribute('data-kg-video-sequence-audio-playback', 'audible')") ||
    !previewSyncText.includes('enableVideoSequenceAudioPlayback(video)') ||
    !richMediaPanelText.includes('onMediaElement?: (element: HTMLMediaElement | null) => void') ||
    !richMediaTimelineSyncText.includes('buildRichMediaTimelineTransportFrame') ||
    !richMediaTimelineSyncText.includes('publishRichMediaTimelineTransportFrame') ||
    !richMediaTimelineSyncText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE') ||
    !richMediaTimelineSyncText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_BROADCAST_CHANNEL') ||
    !richMediaTimelineSyncText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_EVENT') ||
    !richMediaTimelineSyncText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR') ||
    !richMediaTimelineSyncText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY') ||
    !richMediaTimelineSyncText.includes('localDocumentKey || transportDocumentKey') ||
    !richMediaTimelineSyncText.includes('localDocumentKey && transportDocumentKey && localDocumentKey !== transportDocumentKey') ||
    !richMediaTimelineSyncText.includes('sourcePlayback: args.override?.sourcePlayback !== false') ||
    !richMediaPanelText.includes('buildRichMediaTimelineTransportFrame') ||
    !richMediaPanelText.includes('publishRichMediaTimelineTransportFrame(payload)') ||
    !richMediaPanelText.includes('inlineSrcDocMessageTargetRef.current?.postMessage') ||
    !richMediaPanelText.includes('deliverTimelineFrameToSrcDocPreview') ||
    !richMediaPanelText.includes('frame.setAttribute(RICH_MEDIA_TIMELINE_TRANSPORT_FRAME_ATTR, serialized)') ||
    !richMediaPanelText.includes('RICH_MEDIA_TIMELINE_TRANSPORT_READY_MESSAGE') ||
    !richMediaPanelText.includes('resolveTimelineTransportFrame') ||
    !richMediaPanelText.includes('postInlineSrcDocTimelineFrame') ||
    !richMediaPanelText.includes('scheduleInlineSrcDocTimelineFrameBurst') ||
    !richMediaPanelText.includes('[50, 150, 350, 750, 1200]') ||
    !richMediaPanelText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    !richMediaPanelText.includes('syncDirectMediaElementToTimeline(directMediaElementRef.current, detail)') ||
    !richMediaPanelText.includes('iframeRef={model.directVideoFallbackFrameRef}') ||
    !richMediaPanelText.includes('const directVideoUsesInlinePreview = kind ===') ||
    !richMediaPanelText.includes('open={Boolean(model.mediaSrc) || model.directVideoUsesInlinePreview}') ||
    !richMediaPanelText.includes('model.directVideoUsesInlinePreview ? (') ||
    !richMediaPanelText.includes('iframeLoading="eager"') ||
    !richMediaPanelText.includes('iframeSelectableSurfaceDataAttr') ||
    !richMediaPanelText.includes('directMediaElementRef') ||
    !richMediaPanelText.includes('resolveRichMediaPlayableUrl') ||
    !richMediaPanelText.includes('const playableRawUrl = React.useMemo') ||
    !richMediaPanelText.includes('applyImageLikeProxySrc(playableRawUrl)') ||
    !richMediaPanelText.includes('resolveRichMediaTimelineDurationUnits') ||
    !richMediaPanelText.includes('resolveRichMediaTimelineMediaTargetSeconds') ||
    !richMediaPanelText.includes("media.addEventListener('loadedmetadata', sync)") ||
    !richMediaPanelText.includes("media.removeEventListener('durationchange', sync)") ||
    !richMediaPanelText.includes('media.currentTime = targetSeconds') ||
    !richMediaPanelText.includes('media.play(') ||
    !widgetEditorFormText.includes('compactPreviewMediaElementRef') ||
    !widgetEditorFormText.includes('compactPreviewMediaElementHandler') ||
    !widgetEditorFormText.includes('syncCompactPreviewMediaToTimeline(media, detail)') ||
    !widgetEditorFormText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    !widgetEditorFormText.includes('resolveRichMediaTimelineMediaTargetSeconds') ||
    !widgetEditorFormText.includes('onMediaElement={compactPreviewIsPlayableMedia ? compactPreviewMediaElementHandler : undefined}') ||
    !richMediaTimelineSyncText.includes('resolveRichMediaTimelineDurationUnits') ||
    !richMediaTimelineSyncText.includes('buildMermaidGanttTimelineModel(ganttCode).durationMinutes') ||
    !ganttPlaybackControlsText.includes('resolveGanttTimelinePlaybackStartPosition') ||
    !ganttPlaybackControlsText.includes('useGraphStore.getState()') ||
    !ganttPlaybackControlsText.includes('readCurrentTransportPlaybackState') ||
    !ganttPlaybackControlsText.includes('positionMinutes: current.positionMinutes') ||
    !ganttPlaybackControlsText.includes('args.setTransportPlaybackPosition(nextPosition)') ||
    !ganttPlaybackControlsText.includes('requestTimelineTransportPlayback(nextPlaying, nextPosition)') ||
    !ganttTransportPlaybackModelText.includes('maxMinutes: args.maxMinutes') ||
    !ganttTransportPlaybackModelText.includes('setTransportPlaybackPosition: args.onPositionChange') ||
    !ganttTransportPlaybackModelText.includes('publishRichMediaTimelineTransportFrame(payload)') ||
    !ganttTransportPlaybackModelText.includes('onPlaybackFrame: position => publishTimelineTransportFrame(position, true)') ||
    !ganttPlaybackControlsText.includes('resolveGanttTimelineTransportRenderTimeMs') ||
    !ganttPlaybackControlsText.includes('timeMs: resolveGanttTimelineTransportRenderTimeMs') ||
    !ganttTransportPlaybackModelText.includes('timeMs: resolveGanttTimelineTransportRenderTimeMs') ||
    !richMediaTimelineSyncText.includes('typeof args.override?.timeMs === \'number\'') ||
    !richMediaTimelineSyncText.includes(': position * RICH_MEDIA_TIMELINE_TRANSPORT_MS_PER_UNIT') ||
    !htmlVideoFlowNodeText.includes('window.__agenticGraphRenderFrame=async function(timeMs)') ||
    !htmlVideoFlowNodeText.includes('window.__agenticGraphRenderFrame(0)') ||
    !htmlVideoFlowNodeText.includes('window.__AGENTIC_OS_TIMELINE_TRANSPORT_NATIVE_LOOP__=true') ||
    !htmlVideoFlowNodeText.includes('payload.type!=="agentic-graph:timeline-transport-frame"') ||
    !htmlVideoFlowNodeText.includes('startTransportPlayback(timeMs,payload.playbackRate)') ||
    !htmlVideoFlowNodeText.includes('cancelTransportPlayback()') ||
    !htmlVideoFlowNodeText.includes('node.style.animationDelay="-"+Math.max(0,seconds)+"s"') ||
    !cardMediaPreviewText.includes('onMediaElement?: (element: HTMLMediaElement | null) => void') ||
    !cardMediaPreviewText.includes('ref={onMediaElement}')
  ) {
    throw new Error('expected Media canvas and Rich Media iframe previews to use shared transport position and native image/audio/video source kinds so timeline preview bars stay in sync with Rich Media preview')
  }
  if (richMediaPanelText.includes('postInlineSrcDocTimelineFrame(timelineTransportPlaying')
    || richMediaPanelText.includes('if (!timelineTransportPlaying) postInlineSrcDocTimelineFrame()')
    || richMediaPanelText.includes('if (!timelineTransportPlaying) scheduleInlineSrcDocTimelineFrameBurst()')) {
    throw new Error('expected Rich Media srcdoc sync to avoid store-unit fallback emissions during BottomPanel playback/pause')
  }
}

export function testVideoSequenceTransportReadoutUsesPreviewSourceTime() {
  const source: VideoSequenceTimelineSource = {
    byteSize: 100,
    id: 'clip_opening',
    importMode: 'url',
    mimeHint: 'video/mp4',
    originalName: 'opening.mp4',
    relativePath: 'opening.mp4',
    sourceUrl: 'https://media.example.test/opening.mp4',
    durationSeconds: 15,
    workspacePath: '',
  }
  const code = [
    'gantt',
    '  title Video Sequence',
    '  section Video',
    '  Shot A : clip_opening, kgsrc_0_1, 00:04, 1m',
    '  Shot B : clip_opening_splice, kgsrc_1_2, 00:08, 1m',
  ].join('\n')
  const selectedSpan = buildMermaidGanttTimelineModel(code).taskSpans.find(span => span.label === 'Shot B')
  const previewPlan = buildTimelinePreviewSyncPlan({
    code,
    filenameHint: 'Sequence.md',
    selectedRowKey: selectedSpan?.rowKey,
    sources: [source],
  })
  const readoutStart = resolveGanttTimelineDisplaySourceTime({
    positionMinutes: 8,
    previewPlan,
    sourceDurationSeconds: 15,
  })
  const readoutMid = resolveGanttTimelineDisplaySourceTime({
    positionMinutes: 8.5,
    previewPlan,
    sourceDurationSeconds: 15,
  })
  const readoutGap = resolveGanttTimelineDisplaySourceTime({
    positionMinutes: 7,
    previewPlan,
    sourceDurationSeconds: 15,
  })
  const readoutFromLateSourceRange = resolveGanttTimelineDisplaySourceTime({
    positionMinutes: 0,
    previewPlan: buildTimelinePreviewSyncPlan({
      code: [
        'gantt',
        '  title Video Sequence',
        '  section Video',
        '  Shot C : clip_opening_splice_splice, kgsrc_4_5, 00:00, 1m',
      ].join('\n'),
      filenameHint: 'Sequence.md',
      sources: [source],
    }),
    sourceDurationSeconds: 15,
  })
  const displayModelText = readSource('features', 'gitgraph', 'useGanttTimelineDisplayModel.ts')
  const surfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const timelinePlanSyncText = readSource('components', 'timeline', 'timelinePlanSync.ts')
  const previewSessionText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPreviewSession.ts')
  const transportSessionText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSession.ts')
  if (
    Math.abs((readoutStart?.currentSeconds || 0) - 1) > 0.0001 ||
    Math.abs((readoutMid?.currentSeconds || 0) - 1.5) > 0.0001 ||
    readoutMid?.totalSeconds !== 15 ||
    readoutGap !== null ||
    Math.abs((readoutFromLateSourceRange?.currentSeconds || 0) - 4) > 0.0001 ||
    readoutFromLateSourceRange?.totalSeconds !== 15 ||
    !displayModelText.includes('sourceDurationSeconds') ||
    !surfaceModelText.includes('transportClockDisplayModel') ||
    !timelinePlanSyncText.includes('source?.durationSeconds || 0') ||
    !timelinePlanSyncText.includes('segment.sourceRangeSeconds.endSeconds') ||
    !surfaceModelText.includes('const selectedPreviewEmpty = !!transportSession.selectedSpan && !transportSession.previewPlan') ||
    !surfaceModelText.includes("if (selectedPreviewEmpty) return ''") ||
    surfaceModelText.includes('transportSession.disabled || selectedPreviewEmpty') ||
    surfaceModelText.includes('selectedPreviewEmpty || !transportSession.playing') ||
    surfaceModelText.includes('transportSession.setTransportPlaying(false)') ||
    !surfaceModelText.includes('disabled: transportSession.disabled') ||
    surfaceModelText.includes('emptySelectionCurrentLabel') ||
    surfaceModelText.includes('emptySelectionTotalLabel') ||
    surfaceModelText.includes('hasMediaDurationScale: selectedPreviewEmpty ? false') ||
    surfaceModelText.includes('mediaDurationSeconds: selectedPreviewEmpty ? 0 : transportSession.mediaDurationSeconds') ||
    !surfaceModelText.includes('hasMediaDurationScale: transportClockDisplayModel.hasMediaDurationScale') ||
    !surfaceModelText.includes('mediaDurationSeconds: transportSession.mediaDurationSeconds') ||
    !surfaceModelText.includes('const mediaPreviewSourceUrl = React.useMemo') ||
    !surfaceModelText.includes('const thumbnailSourceUrl = React.useMemo') ||
    !surfaceModelText.includes('const timelinePlanSourceDurationSeconds = React.useMemo') ||
    !surfaceModelText.includes('const displaySourceDurationSeconds = timelinePlanSourceDurationSeconds || mediaPreviewSummary.durationSeconds') || !surfaceModelText.includes('const rulerMediaDurationSeconds = transportSession.maxMinutes > 0 ? transportSession.maxMinutes * 60') ||
    !surfaceModelText.includes('sourceDurationSeconds: selectedPreviewEmpty ? 0 : displaySourceDurationSeconds') ||
    !surfaceModelText.includes('sourceThumbnails: thumbnailSummary.thumbnails') ||
    !surfaceModelText.includes('mediaReaderSummary: mediaPreviewSummary') ||
    !surfaceModelText.includes("timelineMode: workflowMode ? 'workflow' : (selectedPreviewEmpty ? 'empty' : 'source-backed')") ||
    !surfaceModelText.includes('transportSession.previewPlan?.segments.find') ||
    !previewSessionText.includes('buildTimelinePreviewSyncPlan') ||
    !previewSessionText.includes('previewPlan') ||
    !transportSessionText.includes('previewPlan = previewSession.previewPlan') ||
    !transportSessionText.includes('previewPlan,')
  ) {
    throw new Error(`expected BottomPanel transport readout to use media-reader source time instead of whole exported media duration, got ${JSON.stringify({ previewPlan, readoutFromLateSourceRange, readoutGap, readoutMid, readoutStart, selectedSpan })}`)
  }
}
