import { HTML_VIDEO_ENGINE_IDS, type RenderSpec } from '@/features/html-video-renderer'
import { hashSignatureParts } from '@/lib/hash/signature'
import {
  buildVideoAgentDatasetRuntime,
  type VideoAgentDatasetRuntime,
} from './videoAgentDatasetRuntime'
import { CAPABILITY_META, DEFAULT_CAPABILITIES, REASONING_META } from './videoAgentPipelineMeta'
import {
  buildVideoAgentFrameBoundingBoxes,
  type VideoAgentFrameBoundingBox,
} from './videoAgentFrameBoxes'
import {
  buildVideoAgentWorkspaceOutputArtifactPath,
  buildVideoAgentWorkspaceOutputPath,
  normalizeVideoAgentWorkspaceOutputRootPath,
} from './videoAgentWorkspaceOutput'
import {
  buildVideoAgentTimelineFrameSamples,
  type VideoAgentTimelineFrameSample,
} from './videoAgentTimelineFrameSamples'
import { buildVideoAgentSourcePlaybackUrl } from './videoAgentSourcePlayback'

export type { VideoAgentFrameBoundingBox, VideoAgentFrameDetection } from './videoAgentFrameBoxes'
export const VIDEO_AGENT_SCHEMA_VERSION = 'agenticgraph-video-agent/v1' as const
export const VIDEO_AGENT_CAPABILITIES = Object.freeze({
  ingest: 'ingest',
  parse: 'parse',
  annotate: 'annotate',
  dataset: 'dataset',
  zoneCount: 'zone_count',
  search: 'search',
  edit: 'edit',
  compile: 'compile',
  generate: 'generate',
  stream: 'stream',
} as const)

export const VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES = [
  'RichMediaPanel:stream',
  'RichMediaPanel:source-playback',
  'RichMediaPanel:transcript',
  'RichMediaPanel:frame-analysis',
  'RichMediaPanel:multi-dimensional-table',
  'RichMediaPanel:floatingpanel-annotation',
] as const

export const VIDEO_AGENT_REFERENCE_BOUNDARY = Object.freeze({
  kind: 'inspiration-only',
  implementation: 'native-agenticgraph',
  copyPolicy: 'no-external-code-copy',
  dependencyPolicy: 'no-external-video-agent-runtime',
  runtimeDependency: false,
} as const)

export type VideoAgentCapability = typeof VIDEO_AGENT_CAPABILITIES[keyof typeof VIDEO_AGENT_CAPABILITIES]

export type VideoAgentPipelineInput = {
  sourceUrl: string
  intent?: string
  requestedCapabilities?: readonly string[]
  width?: number
  height?: number
  fps?: number
  durationMs?: number
  engineHint?: string
  workspaceOutputRoot?: string
}

export type VideoAgentPipelineStage = {
  id: string
  phase: 'ingestion' | 'parsing' | 'rendering'
  capability: VideoAgentCapability
  label: string
  output: string
  startMs: number
  durationMs: number
}

export type VideoAgentReasoningArtifact = {
  capability: VideoAgentCapability
  task: string
  decision: string
  evidence: string
  outputArtifact: string
  streamSignal: string
}

export type VideoAgentTimelineTrack = {
  id: string
  label: string
  trackIndex: number
  startMs: number
  durationMs: number
  phase: VideoAgentPipelineStage['phase']
  output: string
  timelineLane: 'video' | 'fbf' | 'audio'
  source: 'source-video' | 'frame-bounding-boxes' | 'source-audio'
  bbox?: VideoAgentFrameBoundingBox['bbox']
  confidence?: number
  frameIndex?: number
  frameSamples?: readonly VideoAgentTimelineFrameSample[]
  frameSampleCount?: number
  thumbnailUrl?: string
}

export type VideoAgentPipeline = {
  schemaVersion: typeof VIDEO_AGENT_SCHEMA_VERSION
  source: {
    sourceUrl: string
    sourceKey: string
    externalDependency: false
  }
  referenceBoundary: typeof VIDEO_AGENT_REFERENCE_BOUNDARY
  intent: string
  capabilities: VideoAgentCapability[]
  stages: VideoAgentPipelineStage[]
  reasoningArtifacts: VideoAgentReasoningArtifact[]
  frameBoundingBoxes: VideoAgentFrameBoundingBox[]
  timelineTracks: VideoAgentTimelineTrack[]
  datasetRuntime: VideoAgentDatasetRuntime
  stream: {
    primary: 'video/mp4'
    fallback: 'outputSrcDoc'
    panel: 'RichMediaPanel'
    panels: typeof VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES
  }
  renderSpec: RenderSpec
}

export type VideoAgentPipelineError = {
  ok: false
  errorCode: 'invalid_source' | 'invalid_capability'
  field: string
  reason: string
}

export type VideoAgentPipelineResult =
  | { ok: true; pipeline: VideoAgentPipeline }
  | VideoAgentPipelineError

const isVideoAgentCapability = (value: string): value is VideoAgentCapability => {
  return Object.values(VIDEO_AGENT_CAPABILITIES).includes(value as VideoAgentCapability)
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const clampInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

const normalizeCapabilities = (values?: readonly string[]): VideoAgentCapability[] | VideoAgentPipelineError => {
  const source = Array.isArray(values) && values.length > 0 ? values : DEFAULT_CAPABILITIES
  const out: VideoAgentCapability[] = []
  for (const raw of source) {
    const value = String(raw || '').trim()
    if (!isVideoAgentCapability(value)) {
      return {
        ok: false,
        errorCode: 'invalid_capability',
        field: 'requestedCapabilities',
        reason: `unsupported capability ${value || '<empty>'}`,
      }
    }
    if (!out.includes(value)) out.push(value)
  }
  if (!out.includes(VIDEO_AGENT_CAPABILITIES.ingest)) out.unshift(VIDEO_AGENT_CAPABILITIES.ingest)
  if (!out.includes(VIDEO_AGENT_CAPABILITIES.parse)) {
    const ingestIndex = out.indexOf(VIDEO_AGENT_CAPABILITIES.ingest)
    out.splice(Math.max(0, ingestIndex + 1), 0, VIDEO_AGENT_CAPABILITIES.parse)
  }
  const ensureAfter = (capability: VideoAgentCapability, predecessor: VideoAgentCapability): void => {
    if (out.includes(capability)) return
    const predecessorIndex = out.indexOf(predecessor)
    out.splice(Math.max(0, predecessorIndex + 1), 0, capability)
  }
  ensureAfter(VIDEO_AGENT_CAPABILITIES.annotate, VIDEO_AGENT_CAPABILITIES.parse)
  ensureAfter(VIDEO_AGENT_CAPABILITIES.dataset, VIDEO_AGENT_CAPABILITIES.annotate)
  ensureAfter(VIDEO_AGENT_CAPABILITIES.zoneCount, VIDEO_AGENT_CAPABILITIES.dataset)
  if (!out.includes(VIDEO_AGENT_CAPABILITIES.stream)) out.push(VIDEO_AGENT_CAPABILITIES.stream)
  return out
}

const buildSourceKey = (sourceUrl: string): string =>
  `video-agent:${hashSignatureParts([VIDEO_AGENT_SCHEMA_VERSION, sourceUrl])}`

const buildStages = (capabilities: readonly VideoAgentCapability[], durationMs: number): VideoAgentPipelineStage[] => {
  const stageDurationMs = Math.max(1, Math.floor(durationMs / Math.max(1, capabilities.length)))
  return capabilities.map((capability, index) => {
    const meta = CAPABILITY_META[capability]
    const startMs = index * stageDurationMs
    const isLast = index === capabilities.length - 1
    return {
      id: `video_agent_${capability}`,
      phase: meta.phase,
      capability,
      label: meta.label,
      output: meta.output,
      startMs,
      durationMs: isLast ? Math.max(1, durationMs - startMs) : stageDurationMs,
    }
  })
}

const buildReasoningArtifacts = (
  capabilities: readonly VideoAgentCapability[],
  workspaceOutputRoot: ReturnType<typeof normalizeVideoAgentWorkspaceOutputRootPath>,
): VideoAgentReasoningArtifact[] =>
  capabilities.map(capability => ({
    capability,
    ...REASONING_META[capability],
    outputArtifact: buildVideoAgentWorkspaceOutputArtifactPath(REASONING_META[capability].outputArtifact, workspaceOutputRoot),
  }))

const buildSourceVideoTimelineTrack = (durationMs: number, frameBoundingBoxes: readonly VideoAgentFrameBoundingBox[]): VideoAgentTimelineTrack => ({
  id: 'video_agent_source_video',
  label: 'Source video',
  trackIndex: 0,
  startMs: 0,
  durationMs: Math.max(1, durationMs),
  phase: 'ingestion',
  output: 'audio-capable source frames',
  timelineLane: 'video',
  source: 'source-video',
  frameSamples: buildVideoAgentTimelineFrameSamples(frameBoundingBoxes),
  frameSampleCount: frameBoundingBoxes.length,
})

const buildFrameByFrameTimelineTrack = (durationMs: number, frameBoundingBoxes: readonly VideoAgentFrameBoundingBox[]): VideoAgentTimelineTrack => ({
  id: 'video_agent_frame_by_frame_boxes',
  label: `Frame-by-frame annotation samples (${frameBoundingBoxes.length})`,
  trackIndex: 1,
  startMs: 0,
  durationMs: Math.max(1, durationMs),
  phase: 'parsing',
  output: 'source frame-by-frame annotations and bounding boxes',
  timelineLane: 'fbf',
  source: 'frame-bounding-boxes',
  frameSamples: buildVideoAgentTimelineFrameSamples(frameBoundingBoxes),
  frameSampleCount: frameBoundingBoxes.length,
})

const buildAudioTimelineTrack = (durationMs: number): VideoAgentTimelineTrack => ({
  id: 'video_agent_source_audio',
  label: 'Source audio waveform',
  trackIndex: 0,
  startMs: 0,
  durationMs: Math.max(1, durationMs),
  phase: 'rendering',
  output: 'audio-capable source playback waveform and mix',
  timelineLane: 'audio',
  source: 'source-audio',
})

const buildVideoAgentCss = (): string =>
  [
    'main{--kg-video-agent-progress:0;width:100%;height:100%;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr auto;gap:14px;padding:18px;font-family:Inter,system-ui,sans-serif;background:#07111f;color:#f8fafc;overflow:hidden}',
    'p,h1,h2,h3{margin:0}',
    '.hero{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start}',
    '.eyebrow{color:#5eead4;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}',
    '.hero h1{font-size:30px;line-height:1.05;letter-spacing:0}',
    '.lede{max-width:760px;color:#cbd5e1;font-size:13px;line-height:1.45}',
    '.chip{border:1px solid #334155;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:8px 10px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}',
    '.stage{display:grid;grid-template-columns:1.05fr 1fr;gap:12px;min-height:0}',
    '.source,.reasoning,.stream{min-width:0;border:1px solid #334155;border-radius:8px;background:#0f172a;box-shadow:0 18px 40px rgba(0,0,0,.28);overflow:hidden}',
    '.bar{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #334155;background:#111827}',
    '.dot{width:8px;height:8px;border-radius:50%;background:#06b6d4;box-shadow:14px 0 #22c55e,28px 0 #f59e0b}',
    '.url{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.badge{font-size:11px;color:#5eead4}',
    '.video-card{display:grid;gap:12px;padding:14px}',
    '.tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:7px}',
    '.tasks li{list-style:none;border:1px solid #334155;border-radius:8px;padding:8px;background:#111827;color:#e2e8f0;font-size:11px;text-align:center}',
    '.frame-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:6px;margin:0;padding:0;max-height:116px;overflow:auto}',
    '.frame-strip li{list-style:none;border:1px solid #334155;border-radius:8px;background:#0b1220;padding:7px;display:grid;gap:3px}',
    '.frame-strip li[data-active="1"]{border-color:#5eead4;background:#083344}',
    '.frame-strip strong{font-size:11px;color:#f8fafc}',
    '.frame-strip span,.frame-strip small{font-size:10px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.frame-strip output{font:10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.reasoning{display:grid;grid-template-rows:auto 1fr}',
    '.reasoning header{padding:12px;border-bottom:1px solid #334155}',
    '.agents{display:grid;gap:8px;padding:12px}',
    '.agents li{list-style:none;display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;border:1px solid #334155;border-radius:8px;padding:9px;background:#0b1220;transform:translateX(18px);opacity:.18;animation:kgVideoAgentStep .7s ease-out both}',
    '.num{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#5eead4;color:#042f2e;font-weight:800;font-size:12px}',
    '.agents span{font-size:12px;color:#e2e8f0}',
    '.agents output{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:#93c5fd}',
    '.dataset-ops,.zone-counts{border-top:1px solid #334155;padding:10px 12px;display:grid;gap:7px}',
    '.dataset-ops h3,.zone-counts h3{font-size:12px;color:#5eead4}',
    '.dataset-ops ol,.zone-counts ol{margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));gap:6px}',
    '.dataset-ops li,.zone-counts li{list-style:none;border:1px solid #334155;border-radius:8px;background:#0b1220;padding:7px;display:grid;gap:3px}',
    '.dataset-ops span,.zone-counts span{font-size:10px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.dataset-ops strong,.zone-counts strong{font-size:15px;color:#f8fafc}',
    '.zone-counts output{font:10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#fbbf24;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.timeline{display:grid;gap:8px;border-top:1px solid #334155;padding-top:10px}',
    '.rail{height:8px;border-radius:999px;background:#1f2937;overflow:hidden}',
    '.rail::before{content:"";display:block;height:100%;width:100%;background:#5eead4;transform-origin:left;transform:scaleX(var(--kg-video-agent-progress,0))}',
    '.ticks{display:grid;grid-template-columns:repeat(auto-fit,minmax(54px,1fr));gap:7px}',
    '.ticks li{list-style:none;color:#94a3b8;font-size:10px}',
    '.ticks strong{display:block;color:#f8fafc;font-size:11px}',
    '.stream{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;padding:10px}',
    '.stream p{color:#cbd5e1;font-size:12px;line-height:1.4}',
    '.trace{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;min-height:0}',
    '.trace article{border:1px solid #334155;border-radius:8px;background:#111827;padding:9px;min-width:0}',
    '.trace h3{font-size:12px;color:#5eead4}',
    '.trace p{font-size:11px;color:#cbd5e1;line-height:1.35}',
    '.trace output{display:block;margin-top:6px;font:10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#93c5fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rich-panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-height:0}',
    '.rich-panels article{border:1px solid #334155;border-radius:8px;background:#0f172a;padding:9px;min-width:0}',
    '.rich-panels h3{font-size:12px;color:#5eead4}',
    '.rich-panels p{font-size:11px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.rich-panels output{display:block;margin-top:6px;font:10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#93c5fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '@keyframes kgVideoAgentStep{to{opacity:1;transform:translateX(0)}}',
  ].join('')

const secondsLabel = (ms: number): string => `${(ms / 1000).toFixed(1)}s`

const buildVideoAgentHtml = (args: {
  sourceUrl: string
  intent: string
  stages: readonly VideoAgentPipelineStage[]
  reasoningArtifacts: readonly VideoAgentReasoningArtifact[]
  frameBoundingBoxes: readonly VideoAgentFrameBoundingBox[]
  datasetRuntime: VideoAgentDatasetRuntime
  durationMs: number
}): string => {
  const capabilityItems = args.stages
    .map(stage => `<li>${escapeHtml(stage.capability)}</li>`)
    .join('')
  const stageItems = args.stages
    .map((stage, index) => (
      `<li style="animation-delay:${(index * 0.14).toFixed(2)}s"><strong class="num">${index + 1}</strong><span>${escapeHtml(stage.label)}</span><output>${escapeHtml(stage.output)}</output></li>`
    ))
    .join('')
  const tickItems = args.stages
    .map(stage => `<li><strong>${escapeHtml(secondsLabel(stage.startMs))}</strong>${escapeHtml(stage.capability)}</li>`)
    .join('')
  const traceItems = args.reasoningArtifacts
    .map(artifact => `<article><h3>${escapeHtml(artifact.capability)}</h3><p>${escapeHtml(artifact.decision)}</p><output>${escapeHtml(artifact.streamSignal)}</output></article>`)
    .join('')
  const zoneLabelById = new Map(args.datasetRuntime.zoneCounting.zones.map(zone => [zone.zoneId, zone.label]))
  const zoneFrameByIndex = new Map(args.datasetRuntime.zoneCounting.frames.map(frame => [frame.frameIndex, frame]))
  const mergedSampleByFrame = new Map(args.datasetRuntime.mergedVisualDataset.samples.map(sample => [sample.frameIndex ?? 0, sample]))
  const zoneCountText = (counts: Record<string, number>): string => Object.entries(counts)
    .map(([zoneId, count]) => `${zoneLabelById.get(zoneId) || zoneId}:${count}`)
    .join(' ')
  const frameStripItems = args.frameBoundingBoxes
    .map(box => {
      const zoneFrame = zoneFrameByIndex.get(box.frameIndex)
      const sample = mergedSampleByFrame.get(box.frameIndex)
      return `<li data-kg-video-agent-frame-strip-index="${escapeHtml(box.frameIndex)}"><strong>${escapeHtml(secondsLabel(box.timestampMs))}</strong><span>${escapeHtml(box.label)}</span><output>${escapeHtml(zoneCountText(zoneFrame?.counts || {}))}</output><small>${escapeHtml(sample?.sampleId || `frame-${box.frameIndex}`)}</small></li>`
    })
    .join('')
  const zoneFrameItems = args.datasetRuntime.zoneCounting.frames
    .map(frame => `<li data-kg-video-agent-zone-frame="${escapeHtml(frame.frameIndex)}" hidden><strong>${escapeHtml(secondsLabel(frame.timestampMs ?? 0))}</strong><span>${escapeHtml(zoneCountText(frame.counts))}</span><output>${escapeHtml(zoneCountText(frame.cumulativeCounts))}</output></li>`)
    .join('')
  const datasetOperationItems = [
    ['load', args.datasetRuntime.datasetOperationSummary.loadedSamples],
    ['split', args.datasetRuntime.datasetSplitSummary.total],
    ['merge', args.datasetRuntime.datasetOperationSummary.mergedSamples],
    ['save', args.datasetRuntime.datasetOperationSummary.savedSamples],
    ['zone count', args.datasetRuntime.datasetOperationSummary.zoneCountedFrames],
  ].map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join('')
  const richMediaPanelItems = VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES
    .map(route => {
      const role = route.endsWith(':stream')
        ? 'Stream output'
        : route.endsWith(':source-playback')
          ? 'Source playback'
          : route.endsWith(':transcript')
            ? 'Transcript'
            : route.endsWith(':frame-analysis')
              ? 'Frame analysis'
              : 'Floating annotation'
      const output = route.endsWith(':stream')
        ? 'videoUrl or outputSrcDoc'
        : route.endsWith(':source-playback')
          ? 'sourcePlaybackUrl'
          : route.endsWith(':transcript')
            ? 'sourceTranscript and frameByFrameTranscript'
            : route.endsWith(':frame-analysis')
              ? 'frameBoundingBoxes and zoneCounting'
              : 'visualDataset and annotation JSON'
      return `<article><h3>${escapeHtml(role)}</h3><p>${escapeHtml(route)}</p><output>${escapeHtml(output)}</output></article>`
    })
    .join('')

  return `<main data-composition-id="agenticgraph-video-agent-runtime" data-kg-rich-media-panel-size="viewport" data-start="0" data-duration="${escapeHtml((args.durationMs / 1000).toFixed(3))}" aria-label="AgenticGraph video agent render"><header class="hero"><section><p class="eyebrow">AgenticGraph video agent</p><h1>Reason through video, then stream the result</h1><p class="lede">${escapeHtml(args.intent)}</p></section><p class="chip">${escapeHtml(args.sourceUrl)}</p></header><section class="stage" aria-label="Video agent orchestration"><article class="source" data-start="0.000" data-duration="2.000" data-track-index="0"><header class="bar"><span class="dot" aria-hidden="true"></span><span class="url">${escapeHtml(args.sourceUrl)}</span><span class="badge">ingested</span></header><section class="video-card"><h2>Annotate, count, then stream</h2><p>The pipeline records source metadata, annotation targets, reasoning stages, timeline decisions, dataset operations, zone counts, transcript windows, and stream-ready artifact routes as typed data. Source playback and frame analysis are isolated into route-owned Rich Media panels.</p><ol class="tasks">${capabilityItems}</ol><ol class="frame-strip" aria-label="Granular frame-by-frame dataset strip">${frameStripItems}</ol></section></article><article class="reasoning" data-start="1.200" data-duration="4.800" data-track-index="1"><header><p class="eyebrow">Agent plan</p><h2>Native orchestration without external runtime dependency</h2></header><ol class="agents">${stageItems}</ol><section class="dataset-ops" aria-label="Visual dataset operations"><h3>Dataset operations</h3><ol>${datasetOperationItems}</ol></section><section class="zone-counts" aria-label="Real-time zone counts"><h3>Frame zone counts</h3><ol>${zoneFrameItems}</ol></section></article></section><section class="trace" aria-label="Video agent reasoning trace">${traceItems}</section><section class="rich-panels" aria-label="Rich Media panel routes">${richMediaPanelItems}</section><footer class="timeline" aria-label="Video agent timeline"><section class="rail" aria-label="Instant stream progress"></section><ol class="ticks">${tickItems}</ol><section class="stream" aria-label="Stream output contract"><strong>Instant stream</strong><p>Rich Media Panels receive stream output, source playback, frame analysis, transcript alignment, and annotation dataset payloads through separate route-owned surfaces.</p></section></footer></main>`
}

export function buildVideoAgentPipeline(input: VideoAgentPipelineInput): VideoAgentPipelineResult {
  const sourceUrl = String(input.sourceUrl || '').trim()
  if (!sourceUrl) {
    return {
      ok: false,
      errorCode: 'invalid_source',
      field: 'sourceUrl',
      reason: 'sourceUrl is required',
    }
  }

  const capabilities = normalizeCapabilities(input.requestedCapabilities)
  if (!Array.isArray(capabilities)) return capabilities

  const durationMs = clampInteger(input.durationMs, 7000, 1000, 600000)
  const fps = clampInteger(input.fps, 24, 1, 120)
  const width = clampInteger(input.width, 1280, 1, 7680)
  const height = clampInteger(input.height, 720, 1, 4320)
  const intent = String(input.intent || 'Reason through complex video tasks, then publish a stream-ready result.').trim()
  const workspaceOutputRoot = normalizeVideoAgentWorkspaceOutputRootPath(input.workspaceOutputRoot)
  const stages = buildStages(capabilities, durationMs)
  const reasoningArtifacts = buildReasoningArtifacts(capabilities, workspaceOutputRoot)
  const frameBoundingBoxes = buildVideoAgentFrameBoundingBoxes(durationMs, sourceUrl)
  const datasetRuntime = buildVideoAgentDatasetRuntime({
    frameBoundingBoxes,
    saveFilename: buildVideoAgentWorkspaceOutputPath('visual-dataset.json', workspaceOutputRoot),
    schemaVersion: VIDEO_AGENT_SCHEMA_VERSION,
    sourceUrl,
  })
  const sourceVideoTimelineTrack = buildSourceVideoTimelineTrack(durationMs, frameBoundingBoxes)
  const frameByFrameTimelineTrack = buildFrameByFrameTimelineTrack(durationMs, frameBoundingBoxes)
  const audioTimelineTrack = buildAudioTimelineTrack(durationMs)
  const timelineTracks = [sourceVideoTimelineTrack, frameByFrameTimelineTrack, audioTimelineTrack]
  const stream = {
    primary: 'video/mp4',
    fallback: 'outputSrcDoc',
    panel: 'RichMediaPanel',
    panels: VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES,
  } as const
  const zoneLabelById = new Map(datasetRuntime.zoneCounting.zones.map(zone => [zone.zoneId, zone.label]))
  const readZoneCounts = (counts: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(counts).map(([zoneId, count]) => [zoneLabelById.get(zoneId) || zoneId, count]))
  const sampleByFrame = new Map(datasetRuntime.mergedVisualDataset.samples.map(sample => [sample.frameIndex ?? 0, sample]))
  const zoneFrameByIndex = new Map(datasetRuntime.zoneCounting.frames.map(frame => [frame.frameIndex, frame]))
  const frameByFrameSamples = frameBoundingBoxes.map(box => {
    const zoneFrame = zoneFrameByIndex.get(box.frameIndex)
    const sample = sampleByFrame.get(box.frameIndex)
    return {
      frameIndex: box.frameIndex,
      timestampMs: box.timestampMs,
      label: box.label,
      confidence: box.confidence,
      bbox: box.bbox,
      detections: box.detections,
      frameImageUrl: box.frameImageUrl,
      sampleId: sample?.sampleId || '',
      annotationCount: sample?.annotations.length || 0,
      zoneCounts: readZoneCounts(zoneFrame?.counts || {}),
      cumulativeZoneCounts: readZoneCounts(zoneFrame?.cumulativeCounts || {}),
    }
  })
  const richMediaPanels = VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES.map(route => ({
    route,
    timelineSync: 'agenticgraph:render-frame',
    role: route.endsWith(':stream')
      ? 'stream-output'
      : route.endsWith(':source-playback')
        ? 'source-playback'
        : route.endsWith(':transcript')
          ? 'source-transcript'
          : route.endsWith(':frame-analysis')
            ? 'frame-analysis'
            : route.endsWith(':multi-dimensional-table')
              ? 'multi-dimensional-table'
              : 'visual-annotation-dataset',
    inputs: route.endsWith(':stream')
      ? ['videoUrl', 'outputSrcDoc']
      : route.endsWith(':source-playback')
        ? ['sourcePlaybackUrl']
        : route.endsWith(':transcript')
          ? ['sourceTranscript', 'frameByFrameTranscript']
          : route.endsWith(':frame-analysis')
            ? ['frameBoundingBoxes', 'zoneCounting']
            : route.endsWith(':multi-dimensional-table')
              ? ['frameBoundingBoxes', 'frameByFrameTranscript']
              : ['visualDataset', 'mergedVisualDataset', 'zoneCounting'],
  }))
  const data = {
    schemaVersion: VIDEO_AGENT_SCHEMA_VERSION,
    sourceVideo: {
      url: sourceUrl,
      sourceKey: buildSourceKey(sourceUrl),
      externalDependency: false,
      playbackEmbedUrl: buildVideoAgentSourcePlaybackUrl(sourceUrl),
    },
    referenceBoundary: VIDEO_AGENT_REFERENCE_BOUNDARY,
    intent,
    capabilities,
    stages,
    reasoningArtifacts,
    frameBoundingBoxes,
    frameByFrameSamples,
    richMediaPanels,
    visualAnnotationE2E: {
      schemaVersion: 'agenticgraph-video-agent-visual-annotation-e2e/v1',
      source: 'frameBoundingBoxes',
      implementation: 'native-agenticgraph',
      runtimeDependency: false,
      steps: [
        { id: 'load', owner: 'loadVisualAnnotationDataset', output: 'visualDataset' },
        { id: 'annotate', owner: 'frameBoundingBoxes', output: 'visualDataset.samples.annotations' },
        { id: 'split', owner: 'splitVisualAnnotationDataset', output: 'datasetSplitSummary' },
        { id: 'merge', owner: 'mergeVisualAnnotationDatasets', output: 'mergedVisualDataset' },
        { id: 'save', owner: 'saveVisualAnnotationDataset', output: 'savedDatasetArtifact' },
        { id: 'zone_count', owner: 'countVisualDatasetZones', output: 'zoneCounting' },
      ],
    },
    datasetOperationSummary: datasetRuntime.datasetOperationSummary,
    visualDataset: datasetRuntime.visualDataset,
    mergedVisualDataset: datasetRuntime.mergedVisualDataset,
    datasetSplitSummary: datasetRuntime.datasetSplitSummary,
    savedDatasetArtifact: datasetRuntime.savedDatasetArtifact,
    zoneCounting: datasetRuntime.zoneCounting,
    timelineTracks,
    timelineLanes: [
      { id: 'source-video', label: 'Source video', tracks: [sourceVideoTimelineTrack.id] },
      { id: 'frame-by-frame-boxes', label: 'Frame-by-frame boxes', tracks: [frameByFrameTimelineTrack.id] },
      { id: 'source-audio', label: 'Source audio', tracks: [audioTimelineTrack.id] },
    ],
    bottomPanelTimelineSync: {
      surface: 'BottomPanel Timeline',
      source: 'video+fbf+audio',
      lane: 'video-fbf-audio',
      thumbnailMode: 'semantic-frame-samples',
      trackIds: timelineTracks.map(track => track.id),
    },
    workspaceOutputRoot,
    workspaceFiles: [
      { path: buildVideoAgentWorkspaceOutputPath('source.json', workspaceOutputRoot), kind: 'json', role: 'source-manifest' },
      { path: buildVideoAgentWorkspaceOutputPath('dataset-operations.json', workspaceOutputRoot), kind: 'json', role: 'dataset-operation-summary' },
      { path: buildVideoAgentWorkspaceOutputPath('visual-dataset.json', workspaceOutputRoot), kind: 'json', role: 'visual-annotation-dataset' },
      { path: buildVideoAgentWorkspaceOutputPath('zone-counts.json', workspaceOutputRoot), kind: 'json', role: 'real-time-zone-counting' },
      { path: buildVideoAgentWorkspaceOutputPath('moments.json', workspaceOutputRoot), kind: 'json', role: 'search-index' },
      { path: buildVideoAgentWorkspaceOutputPath('parse.json', workspaceOutputRoot), kind: 'json', role: 'parse-output' },
      { path: buildVideoAgentWorkspaceOutputPath('frame-boxes.json', workspaceOutputRoot), kind: 'json', role: 'frame-bounding-boxes' },
      { path: buildVideoAgentWorkspaceOutputPath('timeline.json', workspaceOutputRoot), kind: 'json', role: 'edit-plan' },
      { path: buildVideoAgentWorkspaceOutputPath('generated-assets.json', workspaceOutputRoot), kind: 'json', role: 'generation-plan' },
      { path: buildVideoAgentWorkspaceOutputPath('render.html', workspaceOutputRoot), kind: 'html', role: 'composition' },
      { path: buildVideoAgentWorkspaceOutputPath('stream-manifest.json', workspaceOutputRoot), kind: 'json', role: 'stream-output' },
    ],
    streaming: stream,
  }

  const renderSpec: RenderSpec = {
    html: buildVideoAgentHtml({ sourceUrl, intent, stages, reasoningArtifacts, frameBoundingBoxes, datasetRuntime, durationMs }),
    css: buildVideoAgentCss(),
    data,
    durationMs,
    fps,
    width,
    height,
    engineHint: String(input.engineHint || HTML_VIDEO_ENGINE_IDS.canvas2d).trim(),
  }

  return {
    ok: true,
    pipeline: {
      schemaVersion: VIDEO_AGENT_SCHEMA_VERSION,
      source: {
        sourceUrl,
        sourceKey: data.sourceVideo.sourceKey,
        externalDependency: false,
      },
      referenceBoundary: VIDEO_AGENT_REFERENCE_BOUNDARY,
      intent,
      capabilities,
      stages,
      reasoningArtifacts,
      frameBoundingBoxes,
      timelineTracks,
      datasetRuntime,
      stream,
      renderSpec,
    },
  }
}
