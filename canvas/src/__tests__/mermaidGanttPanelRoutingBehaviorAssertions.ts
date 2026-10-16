import type { GanttPanelRoutingSources } from './mermaidGanttPanelRoutingSurfaceAssertions'
import { computeSvgSurfaceWideTimelineFitTransform } from '@/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { buildVideoSequenceExportPlan } from '@/components/timeline/videoSequenceExport'
import {
  readVideoSequenceSourcePlayableUrl,
  readVideoSequenceTimelineModelFromMarkdown,
} from '@/components/timeline/videoSequenceTimeline'
import { buildVideoSequenceSourceRegistryKeys } from '@/components/timeline/videoSequenceSourceRegistry'
import {
  buildVideoSequenceTimelineImportMarkdown,
} from '@/features/markdown-workspace/workspaceImport/videoSequenceTimelineImport'
import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport/urlContent'
import {
  findMermaidDiagramRowKeyForSvgLabel,
  readMermaidDirectSelectionLabels,
} from '@/lib/mermaid/mermaidDiagramSelection'
import {
  MERMAID_GANTT_BAR_DRAG_COMMIT_MIN_DELTA_PX,
  MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_THRESHOLD_PX,
  buildMermaidGanttTimelineModel,
  buildMermaidGanttTimelineTicks,
  formatMermaidGanttTimelineOffset,
  insertMermaidGanttVideoSequenceOperationRow,
  isMermaidGanttBarDragMode,
  resolveMermaidGanttBarDragCommitted,
  resolveMermaidGanttBarDragPreview,
  resolveMermaidGanttTimelineDragEffectiveDelta,
  resolveMermaidGanttTimelineDragPreviewSpan,
  resolveMermaidGanttTimelineRowKeyAtPosition,
  replaceFirstMermaidGanttFrontmatterCode,
  splitMermaidGanttCodeRowAtOffset,
  splitMermaidGanttVideoSequenceClipGroupAtOffset,
  shouldExposeMermaidGanttBarInteraction,
  updateMermaidGanttCodeRowTiming,
  updateMermaidGanttVideoSequenceClipGroupTiming,
} from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  parseMermaidDiagramCodeModel,
  readYamlFrontmatterMermaidDiagramCodes,
  resolveMermaidDiagramCode,
} from '@/lib/mermaid/mermaidDiagramCode'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { normalizeWorkspaceImportUrlInput } from '@/lib/url'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function assertGanttPanelRoutingBehavior(sources: GanttPanelRoutingSources) {
  const { resolverText, panelText, ganttBarInteractionText } = sources
  const sharedGanttModel = parseMermaidDiagramCodeModel([
    'gantt',
    '  title Shared Gantt',
    '  section Compute',
    '  Compute summary :crit, compute_summary, 2026-06-07, 1d',
  ].join('\n'), 'gantt')
  const sharedGanttTask = sharedGanttModel.rows.find(row => row.kind === 'task')
  const sharedGanttRowKey = findMermaidDiagramRowKeyForSvgLabel(sharedGanttModel.rows, 'Compute summary')
  if (!sharedGanttTask || !sharedGanttRowKey || !readMermaidDirectSelectionLabels(sharedGanttTask).includes('Compute summary')) {
    throw new Error('expected shared Mermaid Gantt selection helper to resolve task labels into reusable row keys')
  }
  const wideTimelineTransform = computeSvgSurfaceWideTimelineFitTransform({
    bounds: { minX: 0, minY: 0, width: 11869, height: 194.5 },
    viewportWidth: 1349,
    viewportHeight: 936,
  })
  if (!wideTimelineTransform || wideTimelineTransform.k <= 1 || wideTimelineTransform.x < 20 || wideTimelineTransform.y < 200) {
    throw new Error(`expected wide Gantt timeline fit to keep readable scale and centered vertical placement, got ${JSON.stringify(wideTimelineTransform)}`)
  }
  const sequenceCode = [
    'gantt',
    '  title Sequence',
    '  section Edit',
    '  Opening shot : clip_opening, 09:00, 6m',
  ].join('\n')
  const cutCode = splitMermaidGanttCodeRowAtOffset({ code: sequenceCode, rowLineIndex: 3, splitOffsetMinutes: 2 })
  if (!cutCode?.includes('Opening shot : clip_opening, kgsrc_0_2, 09:00, 2m') || !cutCode.includes('Opening shot splice : clip_opening_splice, kgsrc_2_6, 09:02, 4m')) {
    throw new Error(`expected video sequence cut to split selected Gantt row at playhead, got ${cutCode}`)
  }
  const maskCode = insertMermaidGanttVideoSequenceOperationRow({ code: sequenceCode, rowLineIndex: 3, operation: 'mask' })
  if (!maskCode?.includes('Opening shot mask : clip_opening_mask, kgsrc_0_6, 09:00, 6m')) {
    throw new Error(`expected video sequence mask to insert a source-backed operation lane, got ${maskCode}`)
  }
  const gradeCode = insertMermaidGanttVideoSequenceOperationRow({ code: sequenceCode, rowLineIndex: 3, operation: 'grade' })
  if (!gradeCode?.includes('Opening shot grade : clip_opening_grade, kgsrc_0_6, 09:00, 6m')) {
    throw new Error(`expected video sequence grade to insert a source-backed operation lane, got ${gradeCode}`)
  }
  const groupedSequenceCode = [
    'gantt',
    '  title Sequence',
    '  section Video',
    '  Opening shot : clip_opening, 09:00, 6m',
    '  section Mask',
    '  Opening shot mask : clip_opening_mask, 09:00, 6m',
    '  section Grade',
    '  Opening shot grade : clip_opening_grade, 09:00, 6m',
    '  section Audio',
    '  Opening shot audio : clip_opening_audio, 09:00, 6m',
  ].join('\n')
  const groupedCutCode = splitMermaidGanttVideoSequenceClipGroupAtOffset({
    code: groupedSequenceCode,
    rowLineIndex: 3,
    splitOffsetMinutes: 2,
  })
  if (
    !groupedCutCode?.includes('Opening shot : clip_opening, kgsrc_0_2, 09:00, 2m') ||
    !groupedCutCode.includes('Opening shot splice : clip_opening_splice, kgsrc_2_6, 09:02, 4m') ||
    !groupedCutCode.includes('Opening shot mask : clip_opening_mask, kgsrc_0_2, 09:00, 2m') ||
    !groupedCutCode.includes('Opening shot mask splice : clip_opening_mask_splice, kgsrc_2_6, 09:02, 4m') ||
    !groupedCutCode.includes('Opening shot grade splice : clip_opening_grade_splice, kgsrc_2_6, 09:02, 4m') ||
    !groupedCutCode.includes('Opening shot audio splice : clip_opening_audio_splice, kgsrc_2_6, 09:02, 4m')
  ) {
    throw new Error(`expected video sequence cut to split every source-backed clip lane, got ${groupedCutCode}`)
  }
  const groupedMovedCode = updateMermaidGanttVideoSequenceClipGroupTiming({
    code: groupedSequenceCode,
    rowLineIndex: 3,
    mode: 'move',
    deltaMinutes: 1,
  })
  if (
    !groupedMovedCode?.includes('Opening shot : clip_opening, 09:01, 6m') ||
    !groupedMovedCode.includes('Opening shot mask : clip_opening_mask, kgsrc_0_6, 09:01, 6m') ||
    !groupedMovedCode.includes('Opening shot grade : clip_opening_grade, kgsrc_0_6, 09:01, 6m') ||
    !groupedMovedCode.includes('Opening shot audio : clip_opening_audio, kgsrc_0_6, 09:01, 6m')
  ) {
    throw new Error(`expected generated video sequence bar move to keep companion lanes synchronized, got ${groupedMovedCode}`)
  }
  const duplicateGradeCode = insertMermaidGanttVideoSequenceOperationRow({
    code: groupedSequenceCode,
    rowLineIndex: 3,
    operation: 'grade',
  })
  if (duplicateGradeCode !== groupedSequenceCode) {
    throw new Error(`expected video sequence grade to reuse the existing operation lane without duplication, got ${duplicateGradeCode}`)
  }
  const spliceOnlyMovedCode = groupedCutCode
    ? updateMermaidGanttVideoSequenceClipGroupTiming({
      code: groupedCutCode,
      rowLineIndex: 4,
      mode: 'move',
      deltaMinutes: 1,
    })
    : null
  if (
    !spliceOnlyMovedCode?.includes('Opening shot : clip_opening, kgsrc_0_2, 09:00, 2m') ||
    !spliceOnlyMovedCode.includes('Opening shot splice : clip_opening_splice, kgsrc_2_6, 09:03, 4m') ||
    !spliceOnlyMovedCode.includes('Opening shot mask : clip_opening_mask, kgsrc_0_2, 09:00, 2m') ||
    !spliceOnlyMovedCode.includes('Opening shot mask splice : clip_opening_mask_splice, kgsrc_2_6, 09:03, 4m') ||
    !spliceOnlyMovedCode.includes('Opening shot grade splice : clip_opening_grade_splice, kgsrc_2_6, 09:03, 4m') ||
    !spliceOnlyMovedCode.includes('Opening shot audio splice : clip_opening_audio_splice, kgsrc_2_6, 09:03, 4m')
  ) {
    throw new Error(`expected video sequence splice segment edits to keep companion split strips synchronized, got ${spliceOnlyMovedCode}`)
  }
  const groupedExportPlan = buildVideoSequenceExportPlan({
    code: groupedCutCode || '',
    filenameHint: 'Sequence.md',
    sources: [{
      id: 'clip_opening',
      originalName: 'opening.mp4',
      relativePath: 'opening.mp4',
      workspacePath: '',
      sourceUrl: 'https://media.example.test/opening.mp4',
      mimeHint: 'video/mp4',
      byteSize: 100,
      importMode: 'url',
    }],
  })
  if (
    groupedExportPlan?.segments.length !== 2 ||
    groupedExportPlan.segments[0]?.sourceStartRatio !== 0 ||
    Math.abs((groupedExportPlan.segments[0]?.sourceEndRatio || 0) - (2 / 6)) > 0.0001 ||
    Math.abs((groupedExportPlan.segments[1]?.sourceStartRatio || 0) - (2 / 6)) > 0.0001 ||
    groupedExportPlan.segments[1]?.sourceEndRatio !== 1 ||
    groupedExportPlan.segments.some(segment => !segment.hasMask || !segment.hasGrade) ||
    groupedExportPlan.filenameBase !== 'sequence'
  ) {
    throw new Error(`expected edited video export plan to preserve cut source ranges and mask/grade operations, got ${JSON.stringify(groupedExportPlan)}`)
  }
  const importedSequenceMarkdown = buildVideoSequenceTimelineImportMarkdown([{
    workspacePath: '/workspace/clip-alpha.mp4.source.md',
    relativePath: 'clips/clip-alpha.mp4',
    originalName: 'clip-alpha.mp4',
    mimeHint: 'video/mp4',
    byteSize: 100,
    importMode: 'file',
  }, {
    workspacePath: '/workspace/clip-beta.webm.source.md',
    relativePath: 'clips/clip-beta.webm',
    originalName: 'clip-beta.webm',
    mimeHint: 'video/webm',
    byteSize: 200,
    importMode: 'folder',
  }])
  const importedSequenceCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(importedSequenceMarkdown, 'gantt'),
    'gantt',
  )
  const importedSequenceModel = buildMermaidGanttTimelineModel(importedSequenceCode)
  const importedVideoSequenceModel = readVideoSequenceTimelineModelFromMarkdown(importedSequenceMarkdown)
  const importedSequencePreset = parseCanvasWorkspaceFrontmatterPreset(importedSequenceMarkdown)
  const legacySequencePreset = parseCanvasWorkspaceFrontmatterPreset(importedSequenceMarkdown.replace('kgCanvas2dRenderer: "media"', 'kgCanvas2dRenderer: "gantt"'))
  if (
    !importedSequenceMarkdown.includes('kgCanvas2dRenderer: "media"') ||
    !importedSequenceMarkdown.includes('kgVideoSequenceTimeline: true') ||
    !importedSequenceCode.includes('section Video') ||
    !importedSequenceCode.includes('section Audio') ||
    importedSequenceCode.includes('section Mask') ||
    importedSequenceCode.includes('section Grade') ||
    !/clip-alpha\.mp4\s*:\s*clip_[a-z0-9]+,\s*kgsrc_0_300,\s*00:00,\s*5m/.test(importedSequenceCode) ||
    !/clip-beta\.webm audio\s*:\s*clip_[a-z0-9]+_audio,\s*kgsrc_0_300,\s*00:02,\s*5m/.test(importedSequenceCode) ||
    /\s:\s(?:video|mask|grade|audio|splice),/.test(importedSequenceCode) ||
    importedSequenceModel.durationMinutes !== 7 ||
    importedSequenceModel.taskSpans.length !== 4 ||
    importedSequencePreset?.canvas2dRenderer !== 'media' ||
    importedSequencePreset?.videoSequenceTimelineEnabled !== true ||
    legacySequencePreset?.canvas2dRenderer !== 'media'
  ) {
    throw new Error(`expected video import projection to emit runtime-ready typed Gantt sequence frontmatter, got ${JSON.stringify({ importedSequenceCode, importedSequenceModel })}`)
  }
  if (
    !importedVideoSequenceModel?.enabled ||
    importedVideoSequenceModel.sources.length !== 2 ||
    importedVideoSequenceModel.sources[0]?.originalName !== 'clip-alpha.mp4' ||
    importedVideoSequenceModel.sources[0]?.byteSize !== 100 ||
    readVideoSequenceSourcePlayableUrl(importedVideoSequenceModel.sources[0]!) !== '' ||
    !buildVideoSequenceSourceRegistryKeys(importedVideoSequenceModel.sources[0]!).some(key => key.includes('clip-alpha.mp4|100'))
  ) {
    throw new Error(`expected video sequence frontmatter parser to expose neutral local-source metadata without persisted object URLs, got ${JSON.stringify(importedVideoSequenceModel)}`)
  }
  const importedUrlSequenceMarkdown = buildVideoSequenceTimelineImportMarkdown([{
    sourceUrl: 'https://media.example.test/clip.mp4',
    relativePath: 'https://media.example.test/clip.mp4',
    originalName: 'clip.mp4',
    mimeHint: 'video/mp4',
    importMode: 'url',
  }])
  const importedUrlVideoSequenceModel = readVideoSequenceTimelineModelFromMarkdown(importedUrlSequenceMarkdown)
  const importedUrlSource = importedUrlVideoSequenceModel?.sources[0] || null
  if (!importedUrlSource || readVideoSequenceSourcePlayableUrl(importedUrlSource) !== 'https://media.example.test/clip.mp4') {
    throw new Error(`expected URL video sequence sources to resolve direct playable video URLs, got ${JSON.stringify(importedUrlVideoSequenceModel)}`)
  }
  const localVideoImportInput = '/tmp/agentic-graph-video/clip.mp4'
  if (normalizeWorkspaceImportUrlInput(localVideoImportInput) !== localVideoImportInput) {
    throw new Error('expected workspace Import URL to accept local absolute video paths without hardcoding fixture paths in source')
  }
  const localVideoContent = await fetchWorkspaceUrlContent(localVideoImportInput)
  if (
    localVideoContent.name !== 'clip.mp4.source.md' ||
    localVideoContent.sourceMediaKind !== 'video' ||
    !localVideoContent.text.includes('originalName: "clip.mp4"') ||
    !localVideoContent.text.includes('relativePath: "tmp/agentic-graph-video/clip.mp4"')
  ) {
    throw new Error(`expected local absolute video path import to preserve source basename metadata before binary fetch, got ${JSON.stringify(localVideoContent)}`)
  }
  const store = useGraphStore.getState()
  store.resetAll()
  store.setTimelineTransportState({
    documentKey: 'sequence-a.md',
    position: 2.5,
    playing: true,
    playbackRate: 1.5,
  })
  const afterTransportSet = useGraphStore.getState()
  if (
    afterTransportSet.timelineTransportDocumentKey !== 'sequence-a.md' ||
    afterTransportSet.timelineTransportPosition !== 2.5 ||
    afterTransportSet.timelineTransportPlaying !== true ||
    afterTransportSet.timelineTransportPlaybackRate !== 1.5
  ) {
    throw new Error(`expected shared Gantt transport state to update atomically, got ${JSON.stringify({ documentKey: afterTransportSet.timelineTransportDocumentKey, position: afterTransportSet.timelineTransportPosition, playing: afterTransportSet.timelineTransportPlaying, rate: afterTransportSet.timelineTransportPlaybackRate })}`)
  }
  store.setTimelineTransportState({ documentKey: 'sequence-b.md' })
  const afterTransportDocumentSwitch = useGraphStore.getState()
  if (
    afterTransportDocumentSwitch.timelineTransportDocumentKey !== 'sequence-b.md' ||
    afterTransportDocumentSwitch.timelineTransportPosition !== 0 ||
    afterTransportDocumentSwitch.timelineTransportPlaying !== false ||
    afterTransportDocumentSwitch.timelineTransportPlaybackRate !== 1
  ) {
    throw new Error(`expected shared Gantt transport state to reset on document switch, got ${JSON.stringify({
      documentKey: afterTransportDocumentSwitch.timelineTransportDocumentKey,
      position: afterTransportDocumentSwitch.timelineTransportPosition,
      playing: afterTransportDocumentSwitch.timelineTransportPlaying,
      rate: afterTransportDocumentSwitch.timelineTransportPlaybackRate,
    })}`)
  }
  afterTransportDocumentSwitch.setTimelineTransportTimingSyncMode('selected')
  if (useGraphStore.getState().timelineTransportTimingSyncMode !== 'selected') throw new Error('expected shared Gantt timing sync mode to leave component-local state')
  useGraphStore.getState().setTimelineTransportTimingSyncMode('grouped')
  if (useGraphStore.getState().timelineTransportTimingSyncMode !== 'grouped') throw new Error('expected shared Gantt timing sync mode to toggle back to grouped')
  const visibleFrameGanttTransform = computeSvgSurfaceWideTimelineFitTransform({
    bounds: { minX: 0, minY: 0, width: 1375, height: 196 },
    viewportWidth: 925,
    viewportHeight: 697,
  })
  if (
    !visibleFrameGanttTransform ||
    visibleFrameGanttTransform.k >= 0.7 ||
    visibleFrameGanttTransform.x < 20 ||
    visibleFrameGanttTransform.y < 250
  ) {
    throw new Error(`expected ordinary Gantt timeline fit to stay inside unobscured canvas frame, got ${JSON.stringify(visibleFrameGanttTransform)}`)
  }
  for (const forbidden of ['agentic-graph-research-agent-demo', 'agentic-graph-missalph-demo', '/Users/']) {
    if (resolverText.includes(forbidden) || panelText.includes(forbidden) || ganttBarInteractionText.includes(forbidden)) {
      throw new Error(`expected Mermaid panel path to avoid hardcoded fixture token ${forbidden}`)
    }
  }
  if (!isMermaidGanttBarDragMode('move') || !isMermaidGanttBarDragMode('resize-start') || isMermaidGanttBarDragMode('legacy')) {
    throw new Error('expected Gantt bar drag mode guard to accept only current move/resize modes')
  }
  if (!shouldExposeMermaidGanttBarInteraction({ kind: 'task' }) || shouldExposeMermaidGanttBarInteraction({ kind: 'config' })) {
    throw new Error('expected Gantt bar interaction helper to expose handles only for parsed task rows')
  }
  const movePreview = resolveMermaidGanttBarDragPreview({ mode: 'move', originClientX: 10, clientX: 18 })
  const resizeStartPreview = resolveMermaidGanttBarDragPreview({ mode: 'resize-start', originClientX: 10, clientX: 18 })
  const resizeEndPreview = resolveMermaidGanttBarDragPreview({ mode: 'resize-end', originClientX: 10, clientX: 18 })
  if (movePreview.offsetPx !== 8 || movePreview.widthDeltaPx !== 0) {
    throw new Error('expected Gantt move preview to translate without resizing')
  }
  if (resizeStartPreview.offsetPx !== 8 || resizeStartPreview.widthDeltaPx !== -8) {
    throw new Error('expected Gantt resize-start preview to move the leading edge')
  }
  if (resizeEndPreview.offsetPx !== 0 || resizeEndPreview.widthDeltaPx !== 8) {
    throw new Error('expected Gantt resize-end preview to extend the trailing edge')
  }
  if (
    MERMAID_GANTT_BAR_DRAG_COMMIT_MIN_DELTA_PX !== 4 ||
    MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_THRESHOLD_PX !== 72 ||
    resolveMermaidGanttBarDragCommitted(3) ||
    !resolveMermaidGanttBarDragCommitted(4)
  ) {
    throw new Error('expected Gantt drag thresholds to match the reused Animatic interaction contract')
  }
  const timelineModel = buildMermaidGanttTimelineModel([
    'gantt',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  Initial vert : vert, v1, 17:30, 2m',
    '  Task A : 3m',
    '  Task B : 8m',
    '  Final vert : vert, v2, 17:58, 4m',
  ].join('\n'))
  const taskARowKey = resolveMermaidGanttTimelineRowKeyAtPosition(timelineModel, 3)
  const ticks = buildMermaidGanttTimelineTicks(timelineModel)
  if (
    timelineModel.durationMinutes !== 32 ||
    timelineModel.taskSpans.length !== 4 ||
    !taskARowKey?.includes('Task A : 3m') ||
    ticks[0]?.label !== '0:00' ||
    ticks[ticks.length - 1]?.label !== '0:32' ||
    formatMermaidGanttTimelineOffset(125) !== '2:05'
  ) {
    throw new Error(`expected Gantt scrubber model to normalize HH:mm and relative rows into neutral timeline spans, got ${JSON.stringify({ timelineModel, ticks, taskARowKey })}`)
  }
  const editedGanttCode = updateMermaidGanttCodeRowTiming({
    code: [
      'gantt',
      '  dateFormat HH:mm',
      '  Initial vert : vert, v1, 17:30, 2m',
    ].join('\n'),
    rowLineIndex: 2,
    mode: 'move',
    deltaMinutes: 3,
  })
  if (!editedGanttCode?.includes('Initial vert : vert, v1, 17:33, 2m')) {
    throw new Error('expected Gantt move drag to update explicit HH:mm task timing')
  }
  const resizedGanttCode = updateMermaidGanttCodeRowTiming({
    code: [
      'gantt',
      '  dateFormat HH:mm',
      '  Initial vert : vert, v1, 17:30, 2m',
    ].join('\n'),
    rowLineIndex: 2,
    mode: 'resize-end',
    deltaMinutes: 2,
  })
  if (!resizedGanttCode?.includes('Initial vert : vert, v1, 17:30, 4m')) {
    throw new Error('expected Gantt resize-end drag to update explicit minute duration')
  }
  const initialSpan = timelineModel.taskSpans.find(span => span.label === 'Initial vert')
  if (!initialSpan) {
    throw new Error('expected Gantt timeline model to expose the initial milestone span')
  }
  const initialPreview = resolveMermaidGanttTimelineDragPreviewSpan({
    deltaMinutes: -5,
    maxMinutes: timelineModel.durationMinutes,
    mode: 'move',
    span: initialSpan,
  })
  const initialEffectiveDelta = resolveMermaidGanttTimelineDragEffectiveDelta({
    deltaMinutes: -5,
    maxMinutes: timelineModel.durationMinutes,
    mode: 'move',
    span: initialSpan,
  })
  if (initialPreview.startMinutes !== 0 || initialEffectiveDelta !== 0) {
    throw new Error('expected Gantt timeline transport to suppress source mutation when a start-boundary milestone cannot visually move')
  }
  const relativeMovedGanttCode = updateMermaidGanttCodeRowTiming({
    code: [
      'gantt',
      '  dateFormat HH:mm',
      '  Initial vert : vert, v1, 17:30, 2m',
      '  Task A : 3m',
    ].join('\n'),
    rowLineIndex: 3,
    mode: 'move',
    deltaMinutes: 4,
  })
  if (!relativeMovedGanttCode?.includes('Task A : 17:36, 3m')) {
    throw new Error('expected Gantt move drag to promote relative task rows to explicit HH:mm timing')
  }
  const markdownWithGantt = [
    '---',
    'flow_diagrams:',
    '  value:',
    '    time_flow:',
    '      type: mermaid_gantt',
    '      value: |-',
    '        gantt',
    '          dateFormat HH:mm',
    '          Initial vert : vert, v1, 17:30, 2m',
    '---',
    '',
  ].join('\n')
  const replacedMarkdown = replaceFirstMermaidGanttFrontmatterCode(markdownWithGantt, editedGanttCode || '')
  if (!replacedMarkdown?.includes('          Initial vert : vert, v1, 17:33, 2m')) {
    throw new Error('expected Gantt drag commit to rewrite the typed mermaid_gantt frontmatter block without fixture-specific paths')
  }
}
