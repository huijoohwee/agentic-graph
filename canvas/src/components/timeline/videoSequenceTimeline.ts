import type { MermaidGanttSourceRangeSeconds, MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { buildMermaidGanttTimelineModel, readMermaidGanttTaskSourceRangeSeconds } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { clampTimelineTransportValue } from './timelineTransport'
import { isLikelyAbsoluteFsPath, buildLocalFsFetchPath } from '@/lib/url'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { isPlainObject } from '@/lib/graph/value'
import { buildRuntimeStorageMediaAccessUrl, normalizeRuntimeStorageMediaUrl } from '@/lib/storage/runtimeMediaUrl'
export type VideoSequenceTimelineToolId = 'cut' | 'splice' | 'mask' | 'grade' | 'speed' | 'adjustment' | 'transition' | 'keyframe' | 'fbf' | 'detached' | 'nested' | 'morph' | 'text' | 'modifier' | 'record' | 'filter' | 'effect'
export type VideoSequenceTimelineLaneId = 'video' | 'image' | 'scene' | 'mask' | 'grade' | 'effect' | 'adjustment' | 'transition' | 'keyframe' | 'fbf' | 'detached' | 'nested' | 'morph' | 'text' | 'modifier' | 'record' | 'filter' | 'audio'
export type VideoSequenceTimelineImportMode = 'file' | 'folder' | 'url' | 'workspace'
export type VideoSequenceTimelineSourceCoverageMode = 'authored' | 'source-covered'
export type VideoSequenceTimelineScopeId = 'live-preview' | 'luma-waveform' | 'chroma-vectorscope' | 'histogram' | 'audio-waveform' | 'audio-mix'
export type VideoSequenceTimelineProjectionOptions = {
  disabledLaneIds?: readonly VideoSequenceTimelineLaneId[]
  sourceCoverageMode?: VideoSequenceTimelineSourceCoverageMode
}
export const VIDEO_SEQUENCE_LANE_HEIGHT_PX = 61
const COMPACT_SOURCE_MEDIA_LABEL_BY_LANE: Readonly<Partial<Record<VideoSequenceTimelineLaneId, RegExp>>> = {
  audio: /^source audio(?: waveform)?$/i,
  fbf: /^frame[-\s]by[-\s]frame (?:boxes|annotation samples)(?: \(\d+\))?$/i,
  image: /^(?:source image|.+\.(?:avif|gif|jpe?g|png|svg|webp)(?:\s+image)?)$/i,
  scene: /^(?:source scene|.+\.(?:avif|gif|jpe?g|png|svg|webp)(?:\s+scene)?)$/i,
  video: /^(?:source video|.+\.(?:m4v|mov|mp4|webm)(?:\s+video)?)(?:\s+(?:splice|split left|split right|copy))*$/i,
}
const SOURCE_BACKED_MEDIA_LANES = new Set<VideoSequenceTimelineLaneId>(['audio', 'image', 'scene', 'video'])
const isSourceBackedMediaSpan = (span: MermaidGanttTimelineTaskSpan, lane: VideoSequenceTimelineLaneId): boolean => (
  SOURCE_BACKED_MEDIA_LANES.has(lane)
  && /:\s*[^,\s]+\s*,/i.test(span.raw)
  && /(?:^|,\s*)kgsrc_\d+(?:_\d+)?_\d+(?:_\d+)?(?:\s*,|$)/i.test(span.raw)
)
export function isCompactSourceMediaSpan(span: MermaidGanttTimelineTaskSpan, lane: VideoSequenceTimelineLaneId): boolean {
  const labelPattern = COMPACT_SOURCE_MEDIA_LABEL_BY_LANE[lane]
  return !!labelPattern?.test(span.label.trim()) || isSourceBackedMediaSpan(span, lane)
}
const MERMAID_GANTT_SECTION_LINE_PATTERN = /^\s*section\s+/i
const filterMermaidGanttCodeByTaskSpan = (
  code: string,
  predicate: (span: MermaidGanttTimelineTaskSpan) => boolean,
): string => {
  const sourceCode = String(code || '').replace(/\r/g, '').trim()
  if (!sourceCode) return ''
  const lines = sourceCode.split('\n')
  const timelineModel = buildMermaidGanttTimelineModel(sourceCode)
  if (!timelineModel.taskSpans.length) return ''
  const taskLineIndexes = new Set(timelineModel.taskSpans
    .filter(predicate)
    .map(span => span.lineIndex))
  if (!taskLineIndexes.size) return ''
  const keptLineIndexes = new Set<number>()
  const firstTaskLineIndex = Math.min(...timelineModel.taskSpans.map(span => span.lineIndex))
  for (let index = 0; index < firstTaskLineIndex; index += 1) {
    if (!MERMAID_GANTT_SECTION_LINE_PATTERN.test(lines[index] || '')) keptLineIndexes.add(index)
  }
  let currentSectionLineIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || ''
    if (MERMAID_GANTT_SECTION_LINE_PATTERN.test(line)) {
      currentSectionLineIndex = index
      continue
    }
    if (!taskLineIndexes.has(index)) continue
    if (currentSectionLineIndex >= 0) keptLineIndexes.add(currentSectionLineIndex)
    keptLineIndexes.add(index)
  }
  return lines.filter((_, index) => keptLineIndexes.has(index)).join('\n').trim()
}
export function filterVideoSequenceMediaEditorGanttCode(code: string): string {
  return filterMermaidGanttCodeByTaskSpan(code, span => isCompactSourceMediaSpan(span, resolveVideoSequenceTimelineLane(span)))
}
export function filterVideoSequenceWorkflowGanttCode(code: string): string {
  return filterMermaidGanttCodeByTaskSpan(code, span => !isCompactSourceMediaSpan(span, resolveVideoSequenceTimelineLane(span)))
}
export function isVideoSequenceMediaEditorGanttCode(code: string): boolean {
  return !!filterVideoSequenceMediaEditorGanttCode(code)
}
export type VideoSequenceTimelineTool = {
  id: VideoSequenceTimelineToolId
  label: string
  title: string
}
export type VideoSequenceTimelineLane = {
  id: VideoSequenceTimelineLaneId
  label: string
}
export type VideoSequenceTimelineDisplayLane = {
  append?: boolean
  id: string
  label: string
  semanticId: VideoSequenceTimelineLaneId
  sourceKey?: string
}
export type VideoSequenceTimelineScope = {
  active: boolean
  activeFamilyId: string
  activityMode: string
  id: VideoSequenceTimelineScopeId
  label: string
  samples: number[]
  selectionActive: boolean
  value: number
}
export type TimelineTransportPlaybackRequestDetail = {
  documentKey: string
  playbackRate: number
  playing: boolean
  position: number
  sourcePlayback?: boolean
  timeMs?: number
}
export type VideoSequenceTimelineSource = {
  id: string
  originalName: string
  relativePath: string
  workspacePath: string
  sourceUrl: string
  mimeHint: string
  byteSize: number | null
  durationSeconds?: number
  frameRate?: number
  displayWidth?: number
  displayHeight?: number
  importMode: VideoSequenceTimelineImportMode | ''
}
export type VideoSequenceTimelineFrontmatterModel = {
  enabled: boolean
  sources: VideoSequenceTimelineSource[]
}
export const TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT = 'agenticgraph:timeline-transport-playback-request'
export const VIDEO_SEQUENCE_TIMELINE_TOOLS: readonly VideoSequenceTimelineTool[] = [
  { id: 'cut', label: 'Cut', title: 'Cut selected clip at playhead' },
  { id: 'splice', label: 'Splice', title: 'Splice selected clip to playhead' },
  { id: 'mask', label: 'Mask', title: 'Add mask lane for selected clip' },
  { id: 'grade', label: 'Grade', title: 'Add color grade lane for selected clip' },
  { id: 'speed', label: 'Speed', title: 'Add speed control lane for selected clip' },
  { id: 'adjustment', label: 'Adjustment', title: 'Add adjustment layer for selected clip' },
  { id: 'transition', label: 'Transition', title: 'Add transition lane for selected clip' },
  { id: 'keyframe', label: 'Keyframe', title: 'Add keyframe lane for selected clip' },
  { id: 'fbf', label: 'FBF', title: 'Add frame-by-frame cel lane with onion skinning' },
  { id: 'detached', label: 'Detached', title: 'Add persistent detached layer lane' },
  { id: 'nested', label: 'Nested', title: 'Add nested timeline and frame-by-frame composition lane' },
  { id: 'morph', label: 'Morph', title: 'Add vector morph lane for selected clip' },
  { id: 'text', label: 'Text', title: 'Add text animation lane for selected clip' },
  { id: 'modifier', label: 'Modifier', title: 'Add stroke trim, follow path, or loop mode without keyframes' },
  { id: 'record', label: 'Record', title: 'Enable playhead recording for automatic keyframes' },
  { id: 'filter', label: 'Filter', title: 'Add filter lane for selected clip' },
  { id: 'effect', label: 'Effect', title: 'Add effect lane for selected clip' },
] as const
export const VIDEO_SEQUENCE_TIMELINE_LANES: readonly VideoSequenceTimelineLane[] = [
  { id: 'video', label: 'Video' },
  { id: 'image', label: 'Image' },
  { id: 'scene', label: 'Scene' },
  { id: 'mask', label: 'Mask' },
  { id: 'grade', label: 'Grade' },
  { id: 'effect', label: 'Effect' },
  { id: 'adjustment', label: 'Adjust' },
  { id: 'transition', label: 'Trans' },
  { id: 'keyframe', label: 'Keys' },
  { id: 'fbf', label: 'FBF' },
  { id: 'detached', label: 'Persist' },
  { id: 'nested', label: 'Nest' },
  { id: 'morph', label: 'Morph' },
  { id: 'text', label: 'Text' },
  { id: 'modifier', label: 'Mods' },
  { id: 'record', label: 'Rec' },
  { id: 'filter', label: 'Filter' },
  { id: 'audio', label: 'Audio' },
] as const
const VIDEO_SEQUENCE_TIMELINE_EMPTY_LANE_IDS: readonly VideoSequenceTimelineLaneId[] = ['video', 'image', 'scene', 'effect'] as const
export const VIDEO_SEQUENCE_BOTTOM_PANEL_DISABLED_LANE_IDS: readonly VideoSequenceTimelineLaneId[] = ['mask', 'grade'] as const
const VIDEO_SEQUENCE_TIMELINE_SCOPE_DEFS: readonly Pick<VideoSequenceTimelineScope, 'id' | 'label'>[] = [{ id: 'live-preview', label: 'Live preview' }, { id: 'luma-waveform', label: 'Luma waveform' }, { id: 'chroma-vectorscope', label: 'Chroma vectorscope' }, { id: 'histogram', label: 'Histogram' }, { id: 'audio-waveform', label: 'Audio waveform' }, { id: 'audio-mix', label: 'Audio mix' }] as const
export const VIDEO_SEQUENCE_TIMELINE_OPERATION_TOOL_IDS: readonly VideoSequenceTimelineToolId[] = ['mask', 'grade', 'speed', 'adjustment', 'transition', 'keyframe', 'fbf', 'detached', 'nested', 'morph', 'text', 'modifier', 'record', 'filter', 'effect'] as const
const clean = (value: unknown): string => String(value || '').trim()
const cleanPath = (value: unknown): string => clean(value).replace(/\\/g, '/').trim()
const normalizeVideoSequenceDisplayLaneKey = (value: unknown): string => clean(value).toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '_').replace(/^_+|_+$/g, '')
const SOURCE_MEDIA_DISPLAY_LANE_EXTENSION_BY_LANE: Readonly<Partial<Record<VideoSequenceTimelineLaneId, RegExp>>> = { image: /\.(?:avif|gif|jpe?g|png|svg|webp)\b/i, scene: /\.(?:avif|gif|jpe?g|png|svg|webp)\b/i, video: /\.(?:m4v|mov|mp4|webm)\b/i }
const SOURCE_MEDIA_DISPLAY_LANE_PREFIX_BY_LANE: Readonly<Partial<Record<VideoSequenceTimelineLaneId, string>>> = { image: 'I', scene: 'S', video: 'V' }
const stripSourceMediaLabelSuffix = (value: unknown, lane: VideoSequenceTimelineLaneId): string => clean(value).replace(new RegExp(`\\s+${lane}$`, 'i'), '').trim()
const readVideoSequenceSourceBackedTaskId = (span: MermaidGanttTimelineTaskSpan): string => clean(span.raw.split(':').slice(1).join(':').split(',')[0])
const readBoolean = (value: unknown): boolean => {
  if (value === true) return true
  const normalized = clean(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}
const readByteSize = (value: unknown): number | null => {
  const size = Number(value)
  if (!Number.isFinite(size) || size < 0) return null
  return Math.floor(size)
}
const readPositiveNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}
const readImportMode = (value: unknown): VideoSequenceTimelineImportMode | '' => {
  const mode = clean(value)
  return mode === 'file' || mode === 'folder' || mode === 'url' || mode === 'workspace' ? mode : ''
}
export function dispatchTimelineTransportPlaybackRequest(detail: TimelineTransportPlaybackRequestDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT, { detail }))
}
const normalizeVideoSequenceSource = (value: unknown): VideoSequenceTimelineSource | null => {
  if (!isPlainObject(value)) return null
  const record = value as Record<string, unknown>
  const id = clean(record.id)
  const originalName = clean(record.originalName)
  const relativePath = cleanPath(record.relativePath)
  const workspacePath = cleanPath(record.workspacePath)
  const sourceUrl = clean(record.sourceUrl)
  const mimeHint = clean(record.mimeHint)
  if (!id && !originalName && !relativePath && !workspacePath && !sourceUrl) return null
  return {
    id,
    originalName,
    relativePath,
    workspacePath,
    sourceUrl,
    mimeHint,
    byteSize: readByteSize(record.byteSize),
    displayHeight: readPositiveNumber(record.displayHeight),
    displayWidth: readPositiveNumber(record.displayWidth),
    durationSeconds: readPositiveNumber(record.durationSeconds),
    frameRate: readPositiveNumber(record.frameRate),
    importMode: readImportMode(record.importMode),
  }
}
export function readVideoSequenceTimelineModelFromMarkdown(rawText: string): VideoSequenceTimelineFrontmatterModel | null {
  const lines = splitMarkdownLines(String(rawText || ''))
  const parsed = parseMarkdownFrontmatter(lines)
  const meta = isPlainObject(parsed.meta) ? parsed.meta : null
  if (!meta) return null
  const sources = Array.isArray(meta.kgVideoSequenceSources)
    ? meta.kgVideoSequenceSources.map(normalizeVideoSequenceSource).filter((item): item is VideoSequenceTimelineSource => !!item)
    : []
  const enabled = readBoolean(meta.kgVideoSequenceTimeline) || sources.length > 0
  return enabled ? { enabled, sources } : null
}
export function isVideoSequenceTimelineMarkdown(rawText: string): boolean {
  return readVideoSequenceTimelineModelFromMarkdown(rawText)?.enabled === true
}
const resolvePlayableSourceCandidate = (value: unknown): string => {
  const normalizedCandidate = normalizeRuntimeStorageMediaUrl(clean(value))
  const candidate = buildRuntimeStorageMediaAccessUrl({ publicUrl: normalizedCandidate }) || normalizedCandidate
  if (!candidate) return ''
  if (/^(?:https?:|blob:|data:(?:audio|image|video)\/)/i.test(candidate)) return candidate
  if (candidate.startsWith('/@fs/')) return candidate
  if (/^file:\/\//i.test(candidate)) return buildLocalFsFetchPath(candidate.replace(/^file:\/\//i, '')) || ''
  const localFsPath = buildLocalFsFetchPath(candidate)
  if (localFsPath) return localFsPath
  if (candidate.startsWith('/') && !isLikelyAbsoluteFsPath(candidate)) return candidate
  return ''
}
export function readVideoSequenceSourcePlayableUrl(source: VideoSequenceTimelineSource | null | undefined): string {
  if (!source) return ''
  return resolvePlayableSourceCandidate(source.sourceUrl)
    || resolvePlayableSourceCandidate(source.relativePath)
}
export function resolveVideoSequenceTimelineLane(span: MermaidGanttTimelineTaskSpan): VideoSequenceTimelineLaneId {
  const label = String(span.label || '').trim()
  const signature = `${span.label} ${span.raw}`.toLowerCase()
  if (/\.(?:3g2|3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|ogv|webm|wmv)$/i.test(label)) return 'video'
  if (/\.(?:aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav)$/i.test(label)) return 'audio'
  if (/\baudio|sound|voice|music\b/.test(signature)) return 'audio'
  if (/\bimage\b/.test(signature) && /\b(?:frame|still|photo|plate)\b/.test(signature)) return 'image'
  if (/\bsource[-_\s]?video\b/.test(signature) || /\bvideo_agent_source_video\b/.test(signature)) return 'video'
  if (/\bnested|composite|child timeline|timeline inside|inside timeline|timeline[-\s]?in[-\s]?fbf|fbf[-\s]?in[-\s]?timeline|timeline inside frame[-\s]?by[-\s]?frame|frame[-\s]?by[-\s]?frame inside timeline\b/.test(signature) || /_nested\b/.test(signature)) return 'nested'
  if (/\bfbf|frame[-\s]?by[-\s]?frame|cel|onion|onion skin\b/.test(signature) || /_fbf\b/.test(signature)) return 'fbf'
  if (/\bdetached|persistent|continuous|background|ui chrome\b/.test(signature) || /_detached\b/.test(signature)) return 'detached'
  if (/\bimage|still|plate|photo|frame\b/.test(signature) || /_image\b/.test(signature)) return 'image'
  if (/\bscene\b/.test(signature) || /_scene\b/.test(signature)) return 'scene'
  if (/\bkeyframe|key\b/.test(signature) || /_keyframe\b/.test(signature)) return 'keyframe'
  if (/\bmorph|shape|vector|path|rectangle|ellipse|polygon|star|boolean|union|subtract|intersect|exclude\b/.test(signature) || /_morph\b/.test(signature)) return 'morph'
  if (/\btext|caption|title|subtitle|type|font|font size|letter spacing|line height|tracking\b/.test(signature) || /_text\b/.test(signature)) return 'text'
  if (/\bmodifier|stroke trim|follow path|loop|ping-pong|ping pong\b/.test(signature) || /_modifier\b/.test(signature)) return 'modifier'
  if (/\brecord|recording|auto[-\s]?key\b/.test(signature) || /_record\b/.test(signature)) return 'record'
  if (/\btransition|dissolve|wipe|fade\b/.test(signature) || /_transition\b/.test(signature)) return 'transition'
  if (/\badjust|adjustment|layer\b/.test(signature) || /_adjustment\b/.test(signature)) return 'adjustment'
  if (/\bfilter|blur|sharpen|denoise\b/.test(signature) || /_filter\b/.test(signature)) return 'filter'
  if (/\beffect|fx|speed|retime|stabilize\b/.test(signature) || /_(?:effect|speed)\b/.test(signature)) return 'effect'
  if (/\bmask|matte|roto|alpha\b/.test(signature)) return 'mask'
  if (/\bgrade|color|lut|exposure|contrast\b/.test(signature)) return 'grade'
  return 'video'
}
function resolveVideoSequenceSourceTrackKey(span: MermaidGanttTimelineTaskSpan, lane: VideoSequenceTimelineLaneId): string {
  const extensionPattern = SOURCE_MEDIA_DISPLAY_LANE_EXTENSION_BY_LANE[lane]
  if (!extensionPattern) return ''
  const label = stripSourceMediaLabelSuffix(span.label, lane)
  if (extensionPattern.test(label)) return normalizeVideoSequenceDisplayLaneKey(label)
  const stableToken = clean(span.raw.split(':').slice(1).join(':').split(',').map(token => token.trim()).find(token =>
    extensionPattern.test(token),
  ))
  if (stableToken) return normalizeVideoSequenceDisplayLaneKey(stableToken)
  if (isSourceBackedMediaSpan(span, lane)) return normalizeVideoSequenceDisplayLaneKey(readVideoSequenceSourceBackedTaskId(span))
  return ''
}
function resolveVideoSequenceDisplayLaneId(args: {
  multiSourceTrackLaneIds: ReadonlySet<VideoSequenceTimelineLaneId>
  span: MermaidGanttTimelineTaskSpan
}): string {
  const lane = resolveVideoSequenceTimelineLane(args.span)
  if (!args.multiSourceTrackLaneIds.has(lane)) return lane
  const sourceKey = resolveVideoSequenceSourceTrackKey(args.span, lane)
  return sourceKey ? `${lane}:${sourceKey}` : lane
}
function buildVideoSequenceSourceTrackKeysByLane(
  taskSpans: readonly MermaidGanttTimelineTaskSpan[],
  options: VideoSequenceTimelineProjectionOptions = {},
): ReadonlyMap<VideoSequenceTimelineLaneId, readonly string[]> {
  const renderableSpans = resolveRenderableVideoSequenceTimelineSpans(taskSpans, options)
  const orderedSourceTrackKeysByLane = new Map<VideoSequenceTimelineLaneId, readonly string[]>()
  for (const lane of Object.keys(SOURCE_MEDIA_DISPLAY_LANE_PREFIX_BY_LANE) as VideoSequenceTimelineLaneId[]) {
    const orderedSourceTrackKeys = Array.from(new Map(renderableSpans
      .filter(span => resolveVideoSequenceTimelineLane(span) === lane)
      .map(span => [resolveVideoSequenceSourceTrackKey(span, lane), span] as const)
      .filter(([sourceTrackKey]) => !!sourceTrackKey))
      .entries())
      .sort((left, right) => {
        const [, leftSpan] = left
        const [, rightSpan] = right
        return leftSpan.lineIndex - rightSpan.lineIndex
          || left[0].localeCompare(right[0])
      })
      .map(([sourceTrackKey]) => sourceTrackKey)
    if (orderedSourceTrackKeys.length > 1) orderedSourceTrackKeysByLane.set(lane, orderedSourceTrackKeys)
  }
  return orderedSourceTrackKeysByLane
}
export function shouldUseTimelineSecondsForVideoSequenceClipEdit(span: MermaidGanttTimelineTaskSpan | null | undefined): boolean {
  if (!span) return false
  if (resolveVideoSequenceTimelineLane(span) !== 'fbf') return false
  if (/\bkgpos_\d+(?:_\d+)?\b/i.test(span.raw)) return false
  return /\b\d+(?:\.\d+)?s\b/i.test(`${span.label} ${span.raw}`)
}
export function shouldRenderVideoSequenceTimelineSpan(span: MermaidGanttTimelineTaskSpan): boolean {
  if (/(^|[:,\s])vert([,\s]|$)/i.test(span.raw)) return true
  return clean(span.label).length > 0 && span.durationMinutes > 0.0001 && span.endMinutes > span.startMinutes
}
const isVideoSequenceSourceVideoScaffoldSpan = (span: MermaidGanttTimelineTaskSpan): boolean => /^source video$/i.test(clean(span.label))
const filterVideoSequenceSourceVideoScaffoldSpans = (
  spans: readonly MermaidGanttTimelineTaskSpan[],
): readonly MermaidGanttTimelineTaskSpan[] => {
  const hasRealVideoMediaSpan = spans.some(span => resolveVideoSequenceTimelineLane(span) === 'video' && !isVideoSequenceSourceVideoScaffoldSpan(span) && isCompactSourceMediaSpan(span, 'video'))
  return hasRealVideoMediaSpan ? spans.filter(span => resolveVideoSequenceTimelineLane(span) !== 'video' || !isVideoSequenceSourceVideoScaffoldSpan(span)) : spans
}
const readVideoSequenceSpanSourceRange = (span: MermaidGanttTimelineTaskSpan): MermaidGanttSourceRangeSeconds =>
  readMermaidGanttTaskSourceRangeSeconds(span.raw) || { endSeconds: span.endMinutes, startSeconds: span.startMinutes }
const isVideoSequenceSourceRangeCovered = (
  range: MermaidGanttSourceRangeSeconds,
  videoRanges: readonly MermaidGanttSourceRangeSeconds[],
): boolean => {
  const epsilon = 0.0001
  let cursor = range.startSeconds
  for (const videoRange of videoRanges) {
    if (videoRange.endSeconds <= cursor + epsilon) continue
    if (videoRange.startSeconds > cursor + epsilon) return false
    cursor = Math.max(cursor, videoRange.endSeconds)
    if (cursor >= range.endSeconds - epsilon) return true
  }
  return false
}
export function resolveRenderableVideoSequenceTimelineSpans(
  taskSpans: readonly MermaidGanttTimelineTaskSpan[],
  options: VideoSequenceTimelineProjectionOptions = {},
): readonly MermaidGanttTimelineTaskSpan[] {
  const baseSpans = filterVideoSequenceSourceVideoScaffoldSpans(taskSpans.filter(shouldRenderVideoSequenceTimelineSpan))
  const disabledLaneIds = new Set(options.disabledLaneIds || [])
  const enabledBaseSpans = disabledLaneIds.size
    ? baseSpans.filter(span => !disabledLaneIds.has(resolveVideoSequenceTimelineLane(span)))
    : baseSpans
  if (options.sourceCoverageMode !== 'source-covered') return enabledBaseSpans
  const videoRanges = baseSpans
    .filter(span => resolveVideoSequenceTimelineLane(span) === 'video')
    .map(readVideoSequenceSpanSourceRange)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  if (!videoRanges.length) return enabledBaseSpans
  return enabledBaseSpans.filter(span => {
    const lane = resolveVideoSequenceTimelineLane(span)
    if (lane === 'video' || lane === 'image' || lane === 'scene') return true
    return isVideoSequenceSourceRangeCovered(readVideoSequenceSpanSourceRange(span), videoRanges)
  })
}
export function resolveVisibleVideoSequenceTimelineLanes(
  taskSpans: readonly MermaidGanttTimelineTaskSpan[],
  options: VideoSequenceTimelineProjectionOptions = {},
): readonly VideoSequenceTimelineLane[] {
  const activeLaneIds = new Set(resolveRenderableVideoSequenceTimelineSpans(taskSpans, options).map(span => resolveVideoSequenceTimelineLane(span)))
  const disabledLaneIds = new Set(options.disabledLaneIds || [])
  const candidateLanes = disabledLaneIds.size
    ? VIDEO_SEQUENCE_TIMELINE_LANES.filter(lane => !disabledLaneIds.has(lane.id))
    : VIDEO_SEQUENCE_TIMELINE_LANES
  const visibleLanes = candidateLanes.filter(lane => activeLaneIds.has(lane.id))
  if (visibleLanes.length) return visibleLanes
  return candidateLanes.filter(lane => VIDEO_SEQUENCE_TIMELINE_EMPTY_LANE_IDS.includes(lane.id))
}
export function resolveVisibleVideoSequenceTimelineDisplayLanes(
  taskSpans: readonly MermaidGanttTimelineTaskSpan[],
  options: VideoSequenceTimelineProjectionOptions = {},
): readonly VideoSequenceTimelineDisplayLane[] {
  const renderableSpans = resolveRenderableVideoSequenceTimelineSpans(taskSpans, options)
  const sourceTrackKeysByLane = buildVideoSequenceSourceTrackKeysByLane(taskSpans, options)
  const multiSourceTrackLaneIds = new Set(sourceTrackKeysByLane.keys())
  const displayLaneById = new Map<string, VideoSequenceTimelineDisplayLane>()
  const activeDisplayLaneIds = new Set(renderableSpans.map(span => resolveVideoSequenceDisplayLaneId({ multiSourceTrackLaneIds, span })))
  for (const lane of resolveVisibleVideoSequenceTimelineLanes(taskSpans, options)) {
    const sourceTrackKeys = sourceTrackKeysByLane.get(lane.id) || []
    const lanePrefix = SOURCE_MEDIA_DISPLAY_LANE_PREFIX_BY_LANE[lane.id]
    if (lanePrefix && sourceTrackKeys.length > 1) {
      sourceTrackKeys.forEach((sourceKey, index) => {
        const id = `${lane.id}:${sourceKey}`
        if (activeDisplayLaneIds.has(id)) {
          displayLaneById.set(id, {
            id,
            label: `${lanePrefix}${index + 1}`,
            semanticId: lane.id,
            sourceKey,
          })
        }
      })
      displayLaneById.set(`${lane.id}:append:${sourceTrackKeys.length + 1}`, {
        append: true,
        id: `${lane.id}:append:${sourceTrackKeys.length + 1}`,
        label: `${lanePrefix}${sourceTrackKeys.length + 1}`,
        semanticId: lane.id,
      })
      if (activeDisplayLaneIds.has(lane.id)) {
        displayLaneById.set(lane.id, { id: lane.id, label: lane.label, semanticId: lane.id })
      }
      continue
    }
    displayLaneById.set(lane.id, { id: lane.id, label: lane.label, semanticId: lane.id })
  }
  const displayLanes = Array.from(displayLaneById.values())
  return displayLanes.length ? displayLanes : resolveVisibleVideoSequenceTimelineLanes(taskSpans, options).map(lane => ({
    id: lane.id,
    label: lane.label,
    semanticId: lane.id,
  }))
}
export function resolveVideoSequenceTimelineDisplayLaneId(
  span: MermaidGanttTimelineTaskSpan,
  taskSpans: readonly MermaidGanttTimelineTaskSpan[],
  options: VideoSequenceTimelineProjectionOptions = {},
): string {
  const displayLaneIds = new Set(resolveVisibleVideoSequenceTimelineDisplayLanes(taskSpans, options).map(lane => lane.id))
  const multiSourceTrackLaneIds = new Set(buildVideoSequenceSourceTrackKeysByLane(taskSpans, options).keys())
  const displayLaneId = resolveVideoSequenceDisplayLaneId({ multiSourceTrackLaneIds, span })
  if (displayLaneIds.has(displayLaneId)) return displayLaneId
  return resolveVideoSequenceTimelineLane(span)
}
export function resolveVisibleVideoSequenceTimelineLaneCount(
  taskSpans: readonly MermaidGanttTimelineTaskSpan[],
  options: VideoSequenceTimelineProjectionOptions = {},
): number {
  return resolveVisibleVideoSequenceTimelineDisplayLanes(taskSpans, options).length
}
export function formatVideoSequenceTimelineSecondsOffset(valueSeconds: number): string {
  const totalSeconds = Math.max(0, Math.round(Number.isFinite(valueSeconds) ? valueSeconds : 0))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
export function resolveVideoSequenceTimelineMediaSeconds(args: {
  durationSeconds: number
  maxMinutes: number
  positionMinutes: number
}): number {
  if (!Number.isFinite(args.durationSeconds) || args.durationSeconds <= 0 || args.maxMinutes <= 0) return 0
  const ratio = clampTimelineTransportValue(args.positionMinutes, 0, args.maxMinutes) / args.maxMinutes
  return clampTimelineTransportValue(ratio * args.durationSeconds, 0, args.durationSeconds)
}
export function resolveVideoSequenceTimelinePositionMinutes(args: {
  currentTimeSeconds: number
  durationSeconds: number
  maxMinutes: number
}): number {
  if (!Number.isFinite(args.currentTimeSeconds) || !Number.isFinite(args.durationSeconds) || args.durationSeconds <= 0 || args.maxMinutes <= 0) return 0
  const ratio = clampTimelineTransportValue(args.currentTimeSeconds, 0, args.durationSeconds) / args.durationSeconds
  return clampTimelineTransportValue(ratio * args.maxMinutes, 0, args.maxMinutes)
}
export function resolveVideoSequenceTimelineUnitsPerMs(args: {
  durationSeconds: number
  fallbackUnitsPerMs: number
  maxMinutes: number
}): number {
  if (!Number.isFinite(args.durationSeconds) || args.durationSeconds <= 0 || args.maxMinutes <= 0) return args.fallbackUnitsPerMs
  return args.maxMinutes / (args.durationSeconds * 1000)
}
export function buildVideoSequenceTimelineScopes(args: {
  activeFamilyId?: string
  activityMode?: string
  maxMinutes: number
  positionMinutes: number
  selectionActive?: boolean
  sourceCount: number
  spanCount: number
}): VideoSequenceTimelineScope[] {
  const maxMinutes = Math.max(0, Number.isFinite(args.maxMinutes) ? args.maxMinutes : 0)
  const progress = maxMinutes > 0 ? clampTimelineTransportValue(args.positionMinutes, 0, maxMinutes) / maxMinutes : 0
  const density = Math.max(1, args.sourceCount + args.spanCount)
  const activityKey = String(args.activeFamilyId || '').trim()
  const activitySeed = Array.from(activityKey).reduce((total, char, index) => total + char.charCodeAt(0) * (index + 5), density * 19)
  const activityMode = String(args.activityMode || 'fallback').trim() || 'fallback'
  const selectionActive = !!args.selectionActive
  return VIDEO_SEQUENCE_TIMELINE_SCOPE_DEFS.map((scope, scopeIndex) => {
    const samples = Array.from({ length: 12 }, (_, sampleIndex) => {
      const phase = (sampleIndex + 1) * (scopeIndex + 2) * 0.37 + progress * Math.PI * 2 + activitySeed * 0.0009
      const shaped = Math.sin(phase) * 0.34 + Math.cos(phase / Math.max(1, density)) * 0.18 + (selectionActive ? 0.56 : 0.5)
      return Math.round(clampTimelineTransportValue(shaped, 0.06, 0.96) * 100)
    })
    const value = Math.round(samples.reduce((total, sample) => total + sample, 0) / samples.length)
    return {
      ...scope,
      active: scopeIndex === 0 && activityKey.length > 0,
      activeFamilyId: activityKey,
      activityMode,
      samples,
      selectionActive,
      value,
    }
  })
}
type VideoSequenceTimelineSampleArgs = {
  sampleCount: number
  seedText: string
}
function buildVideoSequenceTimelineSeededSamples(args: VideoSequenceTimelineSampleArgs, options: { maxValue: number; minValue: number; maxCount?: number; phaseStep: number }): number[] {
  const maxCount = Math.max(4, Math.round(options.maxCount || 96))
  const count = Math.max(4, Math.min(maxCount, Math.round(Number.isFinite(args.sampleCount) ? args.sampleCount : 0)))
  const seedText = clean(args.seedText)
  const seed = Array.from(seedText).reduce((total, char, index) => total + (char.charCodeAt(0) * (index + 3)), count * 17)
  return Array.from({ length: count }, (_, sampleIndex) => {
    const phase = (sampleIndex + 1) * options.phaseStep + seed * 0.013
    const shaped = Math.sin(phase) * 0.32 + Math.cos(phase * 0.47) * 0.22 + 0.52
    return Math.round(clampTimelineTransportValue(shaped * 100, options.minValue, options.maxValue))
  })
}
export function buildVideoSequenceTimelineCueSamples(args: VideoSequenceTimelineSampleArgs): number[] {
  return buildVideoSequenceTimelineSeededSamples(args, { minValue: 18, maxValue: 100, phaseStep: 0.53 })
}
export function buildVideoSequenceTimelineFrameSamples(args: VideoSequenceTimelineSampleArgs): number[] {
  return buildVideoSequenceTimelineSeededSamples(args, { minValue: 28, maxValue: 100, phaseStep: 0.41 })
}
export function buildVideoSequenceTimelineWaveformSamples(args: VideoSequenceTimelineSampleArgs): number[] {
  return buildVideoSequenceTimelineSeededSamples(args, { minValue: 8, maxValue: 96, maxCount: 1024, phaseStep: 0.71 })
}
export function buildVideoSequenceTimelineToolStatus(args: {
  selectedSpan: MermaidGanttTimelineTaskSpan | null
  positionMinutes: number
}): Record<VideoSequenceTimelineToolId, boolean> {
  const span = args.selectedSpan
  if (!span) {
    return VIDEO_SEQUENCE_TIMELINE_TOOLS.reduce((out, tool) => {
      out[tool.id] = false
      return out
    }, {} as Record<VideoSequenceTimelineToolId, boolean>)
  }
  const playhead = Math.round(args.positionMinutes)
  const canCut = playhead > span.startMinutes && playhead < span.endMinutes
  return {
    cut: canCut,
    splice: playhead >= 0 && playhead !== span.startMinutes,
    mask: true,
    grade: true,
    speed: true,
    adjustment: true,
    transition: true,
    keyframe: true,
    fbf: true,
    detached: true,
    nested: true,
    morph: true,
    text: true,
    modifier: true,
    record: true,
    filter: true,
    effect: true,
  }
}
