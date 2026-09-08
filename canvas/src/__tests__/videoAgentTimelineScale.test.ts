import { buildVideoAgentPipeline } from '@/features/video-agent'
import { buildVideoAgentUrlImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoAgentUrlImport'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  buildMermaidGanttCodeFromNeutralTimelinePayload,
  buildMermaidGanttWorkflowCodeFromEventModelingCode,
  buildMermaidGanttWorkflowCodeFromFlowchartCode,
  readYamlFrontmatterMermaidDiagramCodes,
} from '@/lib/mermaid/mermaidDiagramCode'
import {
  VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  isCompactSourceMediaSpan,
  resolveVideoSequenceTimelineDisplayLaneId,
  resolveVideoSequenceTimelineLane,
  resolveVisibleVideoSequenceTimelineDisplayLanes,
  resolveVisibleVideoSequenceTimelineLanes,
} from '@/components/timeline/videoSequenceTimeline'
import { readMermaidGanttFrameSamples } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (...parts: string[]): string => readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf8')

export function testVideoAgentTimelineKeepsSecondsScaleForBottomPanel() {
  const code = buildMermaidGanttCodeFromNeutralTimelinePayload({
    title: 'Video Sequence Timeline',
    timelineLanes: [
      { id: 'video', label: 'Source video', tracks: ['source_video'] },
      { id: 'fbf', label: 'Frame-by-frame boxes', tracks: ['frame_box_0_fbf', 'frame_box_1_fbf'] },
      { id: 'audio', label: 'Source audio', tracks: ['source_audio'] },
    ],
    timelineTracks: [
      { durationMs: 60000, id: 'source_video', label: 'Source video', source: 'source-video', startMs: 0, timelineLane: 'video' },
      { durationMs: 700, id: 'frame_box_0_fbf', label: 'Frame-by-frame bbox 0.0s tracked subject', source: 'frameBoundingBox', startMs: 0, timelineLane: 'fbf' },
      { durationMs: 700, id: 'frame_box_1_fbf', label: 'Frame-by-frame bbox 0.7s context object', source: 'frameBoundingBox', startMs: 700, timelineLane: 'fbf' },
      { durationMs: 60000, id: 'source_audio', label: 'Source audio waveform', startMs: 0, timelineLane: 'audio' },
    ],
  })
  const model = buildMermaidGanttTimelineModel(code)
  const secondFrame = model.taskSpans.find(span => /frame_box_1_fbf/.test(span.raw))
  const sourceAudio = model.taskSpans.find(span => /source_audio/.test(span.raw))
  if (!code.includes('kgpos_0_011667')) throw new Error(`expected fractional timeline position token, got ${code}`)
  if (!secondFrame || Math.abs(secondFrame.startMinutes - 0.011667) > 0.0001 || secondFrame.durationMinutes >= 0.02) {
    throw new Error(`expected FBF span to stay at 0.7s scale, got ${JSON.stringify(secondFrame)}`)
  }
  if (!sourceAudio || Math.abs(sourceAudio.durationMinutes - 1) > 0.0001 || model.durationMinutes > 1.01) {
    throw new Error(`expected one-minute source audio to keep BottomPanel duration near 1:00, got ${JSON.stringify(model)}`)
  }
}

export function testSourceMediaTimelineChromeUsesSemanticLaneLabels() {
  const code = `gantt
  title Video Sequence Timeline
  dateFormat HH:mm
  axisFormat %H:%M
  section Source video
  Source video : clip_neutral_hash, kgpos_0, 0.25m
  section Frame-by-frame boxes
  Frame-by-frame boxes : frames_neutral_hash, kgpos_0, 0.25m
  section Source audio
  Source audio waveform : audio_neutral_hash, kgpos_0, 0.25m`
  const spans = buildMermaidGanttTimelineModel(code).taskSpans
  if (!spans.length || !spans.every(span => isCompactSourceMediaSpan(span, resolveVideoSequenceTimelineLane(span)))) {
    throw new Error(`expected semantic source-media labels to activate shared compact timeline chrome: ${JSON.stringify(spans)}`)
  }
  const filenameSpan = { ...spans[0], label: 'operator-source.mp4', raw: 'operator-source.mp4 : producer_specific_id, kgpos_0, 0.25m' }
  if (!isCompactSourceMediaSpan(filenameSpan, 'video')) {
    throw new Error('expected video-file timeline clips to reuse shared compact source-media chrome')
  }
  const unrelatedSpan = { ...spans[0], label: 'Operator review', raw: 'Operator review : producer_specific_id, kgpos_0, 0.25m' }
  if (isCompactSourceMediaSpan(unrelatedSpan, 'video')) {
    throw new Error('expected non-media video-lane tasks to keep standard timeline chrome')
  }
  const droppedNodeMediaSpan = {
    ...spans[0],
    label: 'Node media Youtube 77fant935ie',
    raw: 'Node media Youtube 77fant935ie : clip_2354348120, kgsrc_0_1, kgpos_2_119, 1m',
  }
  const droppedNodeMediaLane = resolveVideoSequenceTimelineLane(droppedNodeMediaSpan)
  if (droppedNodeMediaLane !== 'video' || !isCompactSourceMediaSpan(droppedNodeMediaSpan, droppedNodeMediaLane)) {
    throw new Error(`expected source-backed node media to use shared compact video chrome, got ${droppedNodeMediaLane}`)
  }
  const explicitTextSpan = { ...droppedNodeMediaSpan, label: 'Node title', raw: 'Node title : clip_2354348120_text, kgsrc_0_1, kgpos_2_119, 1m' }
  if (resolveVideoSequenceTimelineLane(explicitTextSpan) !== 'text') {
    throw new Error('expected explicit text semantics to retain the text operation lane')
  }
  const imageSpan = { ...spans[0], label: 'buddydrone.jpg image', raw: 'buddydrone.jpg image : buddydrone_jpg, kgpos_0_15, 13s' }
  if (!isCompactSourceMediaSpan(imageSpan, 'image')) {
    throw new Error('expected source image timeline clips to reuse shared compact source-media chrome')
  }
  const sourceVideoFrameImageSpan = { ...spans[0], label: 'Source video frame 0 03 image', raw: 'Source video frame 0 03 image : clip_frame_image, kgsrc_0_0_001389, kgpos_0_37, 0.001389m' }
  if (resolveVideoSequenceTimelineLane(sourceVideoFrameImageSpan) !== 'image') {
    throw new Error('expected extracted source-video frame images to use the image lane, not the source-video lane')
  }
}

export function testVideoAgentImportRoutesProcessToFlowchartAndMediaToTimeline() {
  const sourceUrl = 'https://youtu.be/panelRouteVideo01'
  const result = buildVideoAgentPipeline({ durationMs: 60000, sourceUrl })
  if (result.ok === false) throw new Error(result.reason)
  const ganttCode = buildMermaidGanttCodeFromNeutralTimelinePayload(result.pipeline.renderSpec.data)
  for (const token of ['Source video', 'Frame-by-frame boxes', 'Source audio']) {
    if (!ganttCode.includes(token)) throw new Error(`expected media timeline to include ${token}`)
  }
  for (const token of ['Video agent stages', 'Ingest source', 'Parse multimodal context']) {
    if (ganttCode.includes(token)) throw new Error(`expected media timeline to exclude agent workflow token ${token}`)
  }
  const markdown = buildVideoAgentUrlImportMarkdown({ sourceUrl })
  for (const token of [
    'video_agent_process:',
    'type: "mermaid_flowchart"',
    'floatingPanelView: "flowchart"',
    'bottomPanelTab: "flowchart"',
    'flowchart LR',
    'video_media_timeline:',
    'type: "mermaid_gantt"',
    'floatingPanelView: "timeline"',
    'bottomPanelTab: "timeline"',
  ]) {
    if (!markdown.includes(token)) throw new Error(`expected imported document to split process flowchart and media timeline: ${token}`)
  }
  const flowchartCodes = readYamlFrontmatterMermaidDiagramCodes(markdown, 'flowchart')
  const ganttCodes = readYamlFrontmatterMermaidDiagramCodes(markdown, 'gantt')
  const processFlowchart = flowchartCodes.find(code => code.includes('flowchart LR') && code.includes('Ingest source'))
  const mediaGantt = ganttCodes.find(code => code.includes('Source video') && code.includes('Frame-by-frame boxes') && code.includes('Source audio'))
  if (!processFlowchart) throw new Error(`expected Flowchart panels to resolve video-agent process from frontmatter: ${flowchartCodes.join('\n')}`)
  if (!mediaGantt) throw new Error(`expected Timeline panels to resolve media lanes from frontmatter: ${ganttCodes.join('\n')}`)
  if (mediaGantt.includes('Video agent stages') || mediaGantt.includes('Parse multimodal context')) {
    throw new Error(`expected media Timeline panels to exclude video-agent workflow stages: ${mediaGantt}`)
  }
  const mediaTimelineModel = buildMermaidGanttTimelineModel(mediaGantt)
  const mediaVideoSpan = mediaTimelineModel.taskSpans.find(span => /video_agent_source_video/.test(span.raw))
  const mediaFbfSpan = mediaTimelineModel.taskSpans.find(span => /video_agent_frame_by_frame_boxes/.test(span.raw))
  const mediaFbfFrameSamples = readMermaidGanttFrameSamples(mediaFbfSpan?.raw || '')
  const mediaLaneIds = resolveVisibleVideoSequenceTimelineLanes(mediaTimelineModel.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  }).map(lane => lane.id).join(',')
  if (
    mediaTimelineModel.taskSpans.length !== 3
    || !mediaVideoSpan
    || !mediaFbfSpan
    || !mediaTimelineModel.taskSpans.some(span => /video_agent_source_audio/.test(span.raw))
    || mediaLaneIds !== 'video,fbf,audio'
    || mediaTimelineModel.taskSpans.some(span => /frame_box_\d+_fbf/.test(span.raw))
    || readMermaidGanttFrameSamples(mediaVideoSpan.raw).length < 3
    || mediaFbfFrameSamples.length < 3
    || mediaFbfFrameSamples.some(sample => !sample.url.startsWith('/__video_frame?'))
    || mediaGantt.includes('kgthumb_')
  ) {
    throw new Error(`expected imported media Timeline to keep compact VIDEO/FBF/AUDIO tracks with frame samples on FBF: ${JSON.stringify({ mediaGantt, mediaLaneIds })}`)
  }
}

export function testFlowchartBottomPanelReusesWorkflowTimelineBars() {
  const flowchartCode = `flowchart LR
  source["Source URL and operator notes"]
  ideation["/memory.seed ideation @source.body"]
  invocation["/harness.define invocation #harness"]
  generation["/canvas.project generation @canvas"]
  source --> ideation --> invocation --> generation`
  const workflowCode = buildMermaidGanttWorkflowCodeFromFlowchartCode(flowchartCode)
  const workflowModel = buildMermaidGanttTimelineModel(workflowCode)
  const labels = workflowModel.taskSpans.map(span => span.label).join('|')
  if (
    !workflowCode.includes('title Flowchart Workflow') ||
    !workflowCode.includes('section Workflow') ||
    workflowModel.taskSpans.length !== 4 ||
    labels !== 'Source URL and operator notes|/memory.seed ideation @source.body|/harness.define invocation #harness|/canvas.project generation @canvas' ||
    workflowModel.taskSpans.some(span => !/flowchart_/.test(span.raw) || Math.abs(span.durationMinutes - 0.167) > 0.0001)
  ) {
    throw new Error(`expected Flowchart workflow to convert into reusable Timeline bars, got ${JSON.stringify({ workflowCode, labels, workflowModel })}`)
  }
  const flowchartBottomText = readSource('features', 'gitgraph', 'FlowchartBottomPanelView.tsx')
  const strybldrBottomText = readSource('features', 'strybldr', 'StrybldrTimelineBottomPanel.tsx')
  if (
    !flowchartBottomText.includes('buildMermaidGanttWorkflowCodeFromFlowchartCode(code)') ||
    !flowchartBottomText.includes('<GanttTimelineTransportPanel code={flowchartTimelineCode} compact={compact} mode="workflow" />') ||
    flowchartBottomText.includes('MermaidDiagramPanelView') ||
    !strybldrBottomText.includes("view === 'documentVersionGraph' || view === 'flowchart' || view === 'gitGraph'")
  ) {
    throw new Error('expected BottomPanel Flowchart to reuse workflow Timeline bar transport instead of the Mermaid SVG panel')
  }
}

export function testEventModelBottomPanelReusesWorkflowTimelineBars() {
  const eventModelCode = `eventmodeling
tf 01 ui IdeaSubmitted
tf 02 cmd RunComputeFlow
tf 03 evt InputsValidated
tf 04 pcr ComputeAgent
tf 05 cmd RequestApproval`
  const workflowCode = buildMermaidGanttWorkflowCodeFromEventModelingCode(eventModelCode)
  const workflowModel = buildMermaidGanttTimelineModel(workflowCode)
  const labels = workflowModel.taskSpans.map(span => span.label).join('|')
  if (
    !workflowCode.includes('title Event Model Workflow') ||
    !workflowCode.includes('section Workflow') ||
    workflowModel.taskSpans.length !== 5 ||
    labels !== 'IdeaSubmitted|RunComputeFlow|InputsValidated|ComputeAgent|RequestApproval' ||
    workflowModel.taskSpans.some(span => !/event_model_/.test(span.raw) || Math.abs(span.durationMinutes - 0.167) > 0.0001)
  ) {
    throw new Error(`expected Event Model workflow to convert into reusable Timeline bars, got ${JSON.stringify({ workflowCode, labels, workflowModel })}`)
  }
  const eventModelBottomText = readSource('features', 'gitgraph', 'EventModelingBottomPanelView.tsx')
  if (
    !eventModelBottomText.includes('buildMermaidGanttWorkflowCodeFromEventModelingCode(code)') ||
    !eventModelBottomText.includes('<GanttTimelineTransportPanel code={eventModelTimelineCode} compact={compact} mode="workflow" />') ||
    eventModelBottomText.includes('MermaidDiagramPanelView')
  ) {
    throw new Error('expected BottomPanel Event Model to reuse workflow Timeline bar transport instead of the Mermaid SVG panel')
  }
}

export function testVideoSequenceBottomPanelExpandsMultipleVideoSourcesIntoDisplayLanes() {
  const code = `gantt
  title Video Sequence Timeline
  dateFormat HH:mm
  axisFormat %H:%M
  section Source video
  flower.mp4 : flower_mp4, kgpos_0, 5m
  港岛仿生局.mp4 : hong_kong_mp4, kgpos_0, 5m
  section Source audio
  Source audio waveform : source_audio, kgpos_0, 5m`
  const model = buildMermaidGanttTimelineModel(code)
  const displayLanes = resolveVisibleVideoSequenceTimelineDisplayLanes(model.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  })
  const displayLaneIds = displayLanes.map(lane => lane.id).join(',')
  const semanticLaneIds = resolveVisibleVideoSequenceTimelineLanes(model.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  }).map(lane => lane.id).join(',')
  const flowerSpan = model.taskSpans.find(span => span.label === 'flower.mp4')
  const hongKongSpan = model.taskSpans.find(span => span.label === '港岛仿生局.mp4')
  if (
    !flowerSpan ||
    !hongKongSpan ||
    semanticLaneIds !== 'video,audio' ||
    displayLaneIds !== 'video:flower,video:港岛仿生局,video:append:3,audio' ||
    resolveVideoSequenceTimelineDisplayLaneId(flowerSpan, model.taskSpans, { disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS }) !== 'video:flower' ||
    resolveVideoSequenceTimelineDisplayLaneId(hongKongSpan, model.taskSpans, { disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS }) !== 'video:港岛仿生局' ||
    displayLanes.map(lane => lane.label).join(',') !== 'V1,V2,V3,Audio' ||
    displayLanes.find(lane => lane.id === 'video:append:3')?.append !== true
  ) {
    throw new Error(`expected BottomPanel Timeline to expand multiple video sources into native display lanes: ${JSON.stringify({ displayLaneIds, semanticLaneIds, displayLanes })}`)
  }
}

export function testVideoSequenceBottomPanelKeepsExistingVideoLaneOrderWhenLaterSourceIsInsertedEarlierInCode() {
  const code = `gantt
  title Video Sequence Timeline
  dateFormat HH:mm
  axisFormat %H:%M
  section Source video
  港岛仿生局.mp4 : clip_harbor, kgsrc_0_0_252, kgpos_0_337, 0.252m
  Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4 : clip_seedance, kgsrc_0_0_863, kgpos_0, 0.863m`
  const model = buildMermaidGanttTimelineModel(code)
  const harborSpan = model.taskSpans.find(span => span.label === '港岛仿生局.mp4')
  const seedanceSpan = model.taskSpans.find(span => span.label === 'Seedance_2.0_is_on_Artlist-77FAnT935IE.mp4')
  const displayLanes = resolveVisibleVideoSequenceTimelineDisplayLanes(model.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  })
  if (
    !harborSpan ||
    !seedanceSpan ||
    resolveVideoSequenceTimelineDisplayLaneId(seedanceSpan, model.taskSpans, { disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS }) !== 'video:seedance_2_0_is_on_artlist_77fant935ie' ||
    resolveVideoSequenceTimelineDisplayLaneId(harborSpan, model.taskSpans, { disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS }) !== 'video:港岛仿生局' ||
    displayLanes.map(lane => lane.id).join(',') !== 'video:seedance_2_0_is_on_artlist_77fant935ie,video:港岛仿生局,video:append:3' ||
    displayLanes.map(lane => lane.label).join(',') !== 'V1,V2,V3'
  ) {
    throw new Error(`expected BottomPanel Timeline to keep the earliest-starting source on V1 even when a later source is inserted earlier in code: ${JSON.stringify({ displayLanes, harborSpan, seedanceSpan })}`)
  }
}

export function testVideoSequenceBottomPanelExpandsMultipleImageSourcesIntoDisplayLanes() {
  const code = `gantt
  title Video Sequence Timeline
  dateFormat HH:mm
  axisFormat %H:%M
  section Image
  rose.jpg image : clip_rose_image, kgsrc_0_0_001389, kgpos_0, 0.001389m
  空武.jpg image : clip_kongwu_image, kgsrc_0_0_001389, kgpos_0_001389, 0.001389m
  section Source video
  港岛仿生局.mp4 : hong_kong_mp4, kgpos_0, 5m`
  const model = buildMermaidGanttTimelineModel(code)
  const displayLanes = resolveVisibleVideoSequenceTimelineDisplayLanes(model.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  })
  const displayLaneIds = displayLanes.map(lane => lane.id).join(',')
  const semanticLaneIds = resolveVisibleVideoSequenceTimelineLanes(model.taskSpans, {
    disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS,
  }).map(lane => lane.id).join(',')
  const roseSpan = model.taskSpans.find(span => span.label === 'rose.jpg image')
  const kongwuSpan = model.taskSpans.find(span => span.label === '空武.jpg image')
  if (
    !roseSpan ||
    !kongwuSpan ||
    semanticLaneIds !== 'video,image' ||
    displayLaneIds !== 'video,image:rose,image:空武,image:append:3' ||
    resolveVideoSequenceTimelineDisplayLaneId(roseSpan, model.taskSpans, { disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS }) !== 'image:rose' ||
    resolveVideoSequenceTimelineDisplayLaneId(kongwuSpan, model.taskSpans, { disabledLaneIds: VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS }) !== 'image:空武' ||
    displayLanes.map(lane => lane.label).join(',') !== 'Video,I1,I2,I3' ||
    displayLanes.find(lane => lane.id === 'image:append:3')?.append !== true
  ) {
    throw new Error(`expected BottomPanel Timeline to expand multiple image sources into native display lanes: ${JSON.stringify({ displayLaneIds, semanticLaneIds, displayLanes })}`)
  }
}

export function testVideoAgentStructuredDiagramFloatingPanelOpenEventRoutesMediaAndProcessPanels() {
  const utilsText = readSource('features/canvas/utils.ts')
  const launcherText = readSource('features/toolbar/ToolbarMenuLauncher.tsx')
  const presetText = readSource('features', 'parsers', 'canvasFrontmatterPreset.ts')
  const bottomPanelShellText = readSource('features', 'strybldr', 'StrybldrTimelineBottomPanel.tsx')
  const transportPlaybackRuntimeText = readSource('features', 'gitgraph', 'GanttTimelineTransportPlaybackRuntime.tsx')
  const transportPlaybackModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPlaybackModel.ts')
  const transportAudioBridgeText = readSource('features', 'gitgraph', 'GanttTimelineTransportAudioPlaybackBridge.tsx')
  const transportSurfaceText = readSource('features', 'gitgraph', 'GanttTimelineTransportSurface.tsx')
  const transportSurfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const uiSliceText = readSource('hooks', 'store', 'uiSliceInitialState.ts')
  const timelineBottomText = readSource('features', 'gitgraph', 'TimelineBottomPanelView.tsx')
  const timelineFloatingText = readSource('features', 'gitgraph', 'TimelineFloatingPanelView.tsx')
  for (const tab of ['flowchart', 'gantt', 'timeline']) {
    if (!utilsText.includes(`| '${tab}'`)) throw new Error(`expected floating-panel open event type to include ${tab}`)
    if (!launcherText.includes(`tab === '${tab}'`) || !launcherText.includes(`? '${tab}'`)) {
      throw new Error(`expected ToolbarMenuLauncher to route floating-panel tab ${tab}`)
    }
    if (!uiSliceText.includes(`|| view === '${tab}'`)) {
      throw new Error(`expected floating-panel store setter to accept ${tab} without remapping to propsPanel`)
    }
  }
  for (const token of [
    'shouldRetainVideoSequenceFloatingPanelView',
    "new Set(['timeline', 'flowchart', 'gantt'])",
    '!shouldRetainVideoSequenceFloatingPanelView(current.floatingPanelView)',
    'videoSequenceModel?.enabled',
    '!timelineCode && ganttCode',
    "useMermaidGanttDocument({ purpose: 'media' })",
    'kind="gantt"',
    'renderMode="list"',
    'rowFilter={videoSequenceModel?.enabled ? videoSequenceFloatingRowFilter : undefined}',
    'rowTree={videoSequenceFloatingRowTree}',
  ]) {
    if (!`${presetText}\n${timelineFloatingText}`.includes(token)) throw new Error(`expected video-agent floating panel routing to preserve explicit ${token}`)
  }
  for (const staleToken of ['GanttTimelineTransportPanel', 'TimelineTransportControls', 'data-kg-gantt-timeline-transport']) {
    if (timelineFloatingText.includes(staleToken)) throw new Error(`expected video-agent FloatingPanel Timeline to avoid BottomPanel transport owner token: ${staleToken}`)
  }
  if (!/<GanttTimelineTransportPanel\s+code=\{mediaGanttCode\}\s+compact=\{compact\}\s+mode="media"[^>]*\/>/.test(timelineBottomText)) throw new Error('expected media transport panel with the current callback props')
  for (const token of [
    "useMermaidGanttDocument({ purpose: 'media' })",
    'GanttTimelineTransportPlaybackRuntime',
    '<GanttTimelineTransportPlaybackRuntime />',
    "useGanttTimelineTransportSession({ code, mode: 'media' })",
    'useGanttTimelineTransportPlaybackModel',
    'clockActive: true',
    'clockActive: args.clockActive === true',
    'active: args.clockActive !== false && !args.disabled',
    'GanttTimelineTransportAudioPlaybackBridge',
    '<GanttTimelineTransportAudioPlaybackBridge model={args.model.audioPlaybackBridgeModel} />',
    'data-kg-gantt-timeline-audio-playback-bridge',
  ]) {
    if (!`${timelineBottomText}\n${bottomPanelShellText}\n${transportPlaybackRuntimeText}\n${transportPlaybackModelText}\n${transportAudioBridgeText}\n${transportSurfaceText}\n${transportSurfaceModelText}`.includes(token)) {
      throw new Error(`expected video-agent BottomPanel Timeline to keep transport owner token: ${token}`)
    }
  }
}

export function testVideoAgentTimelineDenseFbfClipsDoNotForceOverlap() {
  const rulerText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  const sourceThumbnailSetText = readSource('components', 'timeline', 'videoSequenceSourceThumbnailSet.ts')
  const frameSampleRailText = readSource('components', 'timeline', 'VideoSequenceFrameSampleRail.tsx')
  const mediaReaderText = readSource('components', 'timeline', 'timelineMediaReader.ts')
  const timelinePlanSyncText = readSource('components', 'timeline', 'timelinePlanSync.ts')
  const surfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const sequenceTimelineText = readSource('components', 'timeline', 'videoSequenceTimeline.ts')
  const cssText = [
    readSource('components', 'timeline', 'VideoSequenceTimelineRuler.css'),
    readSource('components', 'timeline', 'VideoSequenceTimelineDenseFbf.css'),
  ].join('\n')
  if (!rulerText.includes('VIDEO_SEQUENCE_DENSE_FBF_MAX_DURATION_MINUTES') || !rulerText.includes("lane === 'fbf' && !verticalMarker")) {
    throw new Error('expected BottomPanel Timeline to mark temporally dense FBF clips')
  }
  for (const token of [
    'data-kg-video-sequence-dense-fbf={denseFbfClip ?',
    'const compactTimelineBar = workflowProjection || compactSourceMedia',
    'data-kg-timeline-clip-compact={compactTimelineBar ?',
    'data-kg-timeline-clip-select-surface={compactTimelineBar && !thumbnailSamples.length ?',
    'compactSourceTimeline',
    'resolveVisibleVideoSequenceTimelineLaneCount(transportSession.timelineModel.taskSpans, { disabledLaneIds })',
    'const compactSourceTimeline = React.useMemo',
    'transportSession.timelineModel.taskSpans.every(span => isCompactSourceMediaSpan(span, resolveVideoSequenceTimelineLane(span)))',
    'scopes: compactSourceTimeline || workflowMode ? [] : transportSession.monitorScopes',
    "const compactSourceVideo = compactSourceMedia && lane === 'video'",
    "const compactSourceFrameSamples = compactSourceMedia && lane === 'fbf'",
    'const showsSourceMediaContent = VIDEO_SEQUENCE_SOURCE_CONTENT_LANES.has(lane) && (compactSourceMedia || !!sourceThumbnailSet)',
    "showMediaCues: showsMediaContent && lane !== 'audio' && !compactSourceMedia",
    'const semanticFrameSamples = compactSourceFrameSamples',
    "thumbnailSamples: compactSourceFrameSamples || (compactSourceMedia && lane === 'audio') ? []",
    '<VideoSequenceFrameSampleRail samples={semanticFrameSamples} span={span} />',
    'data-kg-video-sequence-frame-sample-rail="semantic"',
    "'--kg-video-sequence-frame-sample-count': samples.length",
    "&& !verticalMarker && !compactSourceMedia",
    "lane === 'fbf' && !verticalMarker",
    'compactTimelineBar ? 0 : (index % 2) * 2',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--milestone):not(.timeline-transport-time-axis-mark):not([data-kg-video-sequence-dense-fbf="1"])',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--lane-fbf):not(.timeline-transport-track-clip--milestone):not(.timeline-transport-time-axis-mark):not([data-kg-video-sequence-dense-fbf="1"])',
    '.timeline-transport-track-clip--lane-fbf[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--milestone):not([data-kg-video-sequence-dense-fbf="1"])',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]::before',
    '[data-kg-timeline-clip-compact="1"] .timeline-transport-track-clip-move',
    '[data-kg-timeline-clip-select-surface="1"] .timeline-transport-track-clip-move',
    'pointer-events: auto',
    '[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-clip-timecode',
    '[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-clip-meta',
    '!verticalMarker && !compactSourceMedia',
    '[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-audio-waveform',
    '.timeline-transport-track-clip--lane-fbf[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-frame-sample-rail',
    '.timeline-transport-track-clip--lane-fbf[data-kg-timeline-clip-compact="1"] .timeline-transport-track-clip-move',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--lane-audio):not(.timeline-transport-track-clip--lane-fbf) .timeline-video-sequence-clip-thumbnail-strip',
    '.timeline-transport-track-clip--lane-fbf[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-clip-thumbnail-strip',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--lane-audio):not(.timeline-transport-track-clip--lane-fbf) .timeline-video-sequence-clip-thumbnail-preview',
    '.timeline-transport-track-clip[data-kg-timeline-clip-compact="1"]:not(.timeline-transport-track-clip--lane-audio):not(.timeline-transport-track-clip--lane-fbf) .timeline-video-sequence-clip-thumbnail-strip[data-kg-video-sequence-clip-thumbnail-preview-active="1"] .timeline-video-sequence-clip-thumbnail-strip-preview',
    'transform: translate(-50%, -4px) scale(0.96)',
    'height: var(--kg-compact-source-media-bar-height)',
    'translate: 0 calc((var(--kg-video-sequence-lane-height, 61px) - var(--kg-compact-source-media-bar-height)) / 2)',
    'inset: 16px 10px 4px',
    'z-index: 8',
    'background-size: var(--kg-video-sequence-frame-sample-cell) 100%',
    'inset: 15px 8px 5px',
    'flex: 1 1 0',
    'border-color: var(--kg-canvas-accent',
    'background: var(--kg-panel-bg-hover',
    'COMPACT_SOURCE_MEDIA_LABEL_BY_LANE',
    'sourceThumbnailSets',
    'sourceId: string',
    'readVideoSequenceSpanStableSourceId',
    'normalizeSourceThumbnailId',
    'set.sourceId',
    'stillImageSamples',
    "item.kind !== 'image'",
    'buildVideoSequenceSourceImageThumbnail',
    "set.sourceThumbnails.length || ((expectedKind === 'image' || expectedKind === 'video') && !!set.sourceUrl)",
    'sourceThumbnailSet.sourceThumbnails.length ? sourceThumbnailSet.sourceThumbnails.slice(0, 1) : buildVideoSequenceSourceImageThumbnail(sourceThumbnailSet)',
    'resolveVideoSequenceSourceThumbnailSet',
    'findSourceForSegment',
    'data:(?:audio|image|video)',
    "buildSourceSegmentsForLane(model.taskSpans, 'image')",
    "buildSourceSegmentsForLane(model.taskSpans, 'scene')",
    "lane === 'image' || lane === 'scene' ? 'image'",
    'useTimelineMediaReaderSummaries',
    'loadNativeImageThumbnails',
    '[data-kg-video-sequence-dense-fbf="1"]',
    'min-width: 8px',
    'overflow: hidden',
    '.timeline-video-sequence-clip-thumbnail',
    'min-width: 0',
    '.timeline-transport-track-clip-label',
    '.timeline-video-sequence-clip-timecode',
    '.timeline-video-sequence-clip-meta',
  ]) {
    if (!`${rulerText}\n${sourceThumbnailSetText}\n${frameSampleRailText}\n${mediaReaderText}\n${surfaceModelText}\n${sequenceTimelineText}\n${timelinePlanSyncText}\n${cssText}`.includes(token)) {
      throw new Error(`expected dense FBF no-overlap guard token: ${token}`)
    }
  }
  for (const staleToken of [
    'VideoSequenceCompactMediaLane',
    'VideoSequenceCompactFbfRail',
    'data-kg-video-agent-compact-fbf',
    '[data-kg-video-agent-compact-fbf="1"] .timeline-video-sequence-clip-thumbnail-strip',
    '[data-kg-video-agent-compact-fbf="1"] .timeline-video-sequence-clip-thumbnail-caption',
    'timeline-video-sequence-compact-fbf-preview',
    'data-kg-video-agent-compact-fbf-preview',
    'data-kg-video-agent-compact-fbf-thumbnail',
    'timeline-video-sequence-compact-fbf-thumbnail',
    'hoverPreview',
    'showsGeneratedFrameContent || compactSourceFrameSamples || compactSourceVideo',
    'VIDEO_SEQUENCE_COMPACT_VISUAL_SOURCE_LANES',
    '.timeline-transport-track-clip--lane-video[data-kg-timeline-clip-compact="1"] .timeline-video-sequence-clip-thumbnail > img',
    '.timeline-transport-track-clip--lane-video[data-kg-timeline-clip-compact="1"]',
  ]) {
    if (`${rulerText}\n${cssText}\n${sequenceTimelineText}`.includes(staleToken)) throw new Error(`expected video-agent timeline to avoid stale compact FBF selector: ${staleToken}`)
  }
}

export function testVideoAgentWorkflowStageBarsAvoidSyntheticMediaMutation() {
  const code = `gantt
  title Video-agent E2E Pipeline
  dateFormat HH:mm
  axisFormat %H:%M
  section Video-agent stages
  Ideation : video_agent_ideation, 00:00, 0.167m
  Invocation : video_agent_invocation, after video_agent_ideation, 0.167m
  Generation dry-run : video_agent_generation, after video_agent_invocation, 0.167m
  Runtime proof : video_agent_runtime_proof, after video_agent_generation, 0.167m`
  const spans = buildMermaidGanttTimelineModel(code).taskSpans
  const stageSpan = spans.find(span => span.label === 'Ideation')
  if (!stageSpan || resolveVideoSequenceTimelineLane(stageSpan) !== 'video' || isCompactSourceMediaSpan(stageSpan, 'video')) {
    throw new Error(`expected workflow stages to remain non-compact even when they default to video lane: ${JSON.stringify(stageSpan)}`)
  }
  const rulerText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  if (
    !rulerText.includes('const showsSourceMediaContent = VIDEO_SEQUENCE_SOURCE_CONTENT_LANES.has(lane) && (compactSourceMedia || !!sourceThumbnailSet)') ||
    !rulerText.includes('const showsMediaContent = !verticalMarker && (showsSourceMediaContent || VIDEO_SEQUENCE_OPERATION_CONTENT_LANES.has(lane) || showsGeneratedFrameContent)')
  ) {
    throw new Error('expected non-media workflow stages to avoid synthetic thumbnail/cue/frame-strip mutation')
  }
}
