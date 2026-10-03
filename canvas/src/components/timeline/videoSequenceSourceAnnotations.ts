import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { isPlainObject } from '@/lib/graph/value'
import { hashSignatureParts } from '@/lib/hash/signature'
import { buildMermaidGanttTimelineModel, readGanttTaskTokens } from '@/lib/mermaid/mermaidGanttTimelineModel'
import { readMermaidGanttTaskSourceRangeSeconds, type MermaidGanttTimelineTaskSpan as Span } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { readMermaidGanttFrameSamples } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'
import { isCompactSourceMediaSpan, resolveVideoSequenceTimelineLane, type VideoSequenceTimelineSource as Source } from './videoSequenceTimeline'

export type VideoSequenceSourceAnnotation = {
  schema: 'source-annotations/v1'
  videoTrackId: string
  annotationTrackId: string
  sourceId: string
  frameAnalysisNodeId: string
  annotationStartMinutes: number
  annotationDurationMinutes: number
  sourceStartSeconds: number
  sourceEndSeconds: number
}
export type VideoSequenceSourceAnnotationGroup = {
  association: VideoSequenceSourceAnnotation
  videoSpan: Span
  annotationSpan: Span
  samples: { timestampSeconds: number; url: string }[]
  sourceWindow: { sourceStartSeconds: number; sourceEndSeconds: number }
}
const MAX_ASSOCIATIONS = 64
const MAX_SECONDS = 43200
// Only reader-created legacy links may carry the immutable producer's rounding proof.
const legacyDurations = new WeakMap<VideoSequenceSourceAnnotation, { sourceId: string; sourceUrl: string; registered: number; exact: number }>()
const isId = (value: unknown): value is string => typeof value === 'string' && value.length <= 256 && /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value)
const isTime = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
const isAssociation = (value: unknown): value is VideoSequenceSourceAnnotation => isPlainObject(value)
  && value.schema === 'source-annotations/v1'
  && [value.videoTrackId, value.annotationTrackId, value.sourceId, value.frameAnalysisNodeId].every(isId)
  && value.videoTrackId !== value.annotationTrackId
  && isTime(value.annotationStartMinutes, MAX_SECONDS / 60)
  && isTime(value.annotationDurationMinutes, MAX_SECONDS / 60) && value.annotationDurationMinutes > 0
  && isTime(value.sourceStartSeconds, MAX_SECONDS)
  && isTime(value.sourceEndSeconds, MAX_SECONDS) && value.sourceEndSeconds > value.sourceStartSeconds

export function readVideoSequenceSourceAnnotations(markdownText: string): VideoSequenceSourceAnnotation[] {
  if (typeof markdownText !== 'string' || markdownText.length > 500000 || new TextEncoder().encode(markdownText).length > 500000) return []
  try {
    const parsed = parseMarkdownFrontmatter(splitMarkdownLines(markdownText), { maxNodes: 12000, maxDepth: 32 })
    const links = isPlainObject(parsed.meta) ? parsed.meta.kgVideoSequenceAnnotations : null
    if (parsed.warnings.length) return []
    if (Object.prototype.hasOwnProperty.call(parsed.meta, 'kgVideoSequenceAnnotations')) return Array.isArray(links) && links.length <= MAX_ASSOCIATIONS && links.every(isAssociation) ? links : []
    return readLegacySourceAnnotations(parsed.meta)
  } catch { return [] }
}

const isUrl = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f]/.test(value)
const sameSamples = (left: readonly { timestampSeconds: number; url: string }[], right: readonly { timestampSeconds: number; url: string }[]): boolean => left.length === right.length
  && left.every((sample, index) => sample.timestampSeconds === right[index].timestampSeconds && sample.url === right[index].url)
const readLegacySourceAnnotations = (meta: Record<string, unknown>): VideoSequenceSourceAnnotation[] => {
  const typedNodes = isPlainObject(meta.flow_nodes) ? meta.flow_nodes.value : undefined
  const rawNodes = isPlainObject(meta.flow) ? meta.flow.nodes : undefined
  if (typedNodes !== undefined && rawNodes !== undefined) return []
  const nodes = typedNodes ?? rawNodes
  const diagrams = isPlainObject(meta.flow_diagrams) ? meta.flow_diagrams.value : null
  const diagram = isPlainObject(diagrams) ? diagrams.video_media_timeline : null
  if (!Array.isArray(nodes) || nodes.length > 64 || nodes.some(node => !isPlainObject(node) || !isId(node.id) || !isPlainObject(node.properties))
    || new Set(nodes.map(node => node.id)).size !== nodes.length || !isPlainObject(diagram) || diagram.type !== 'mermaid_gantt'
    || typeof diagram.value !== 'string' || diagram.value.length > 500000) return []
  const specs = nodes.filter(node => node.properties['flow:widgetFormId'] === 'htmlVideoRenderSpecInput')
  const panels = nodes.filter(node => node.properties.kind === 'video-agent-frame-analysis')
  if (specs.length !== 1 || panels.length !== 1 || typeof specs[0].properties.data_json !== 'string') return []
  const data = JSON.parse(specs[0].properties.data_json)
  if (!isPlainObject(data) || data.schemaVersion !== 'agentic-graph-video-agent/v1' || !isPlainObject(data.sourceVideo)
    || !isUrl(data.sourceVideo.url) || data.sourceVideo.sourceKey !== `video-agent:${hashSignatureParts([data.schemaVersion, data.sourceVideo.url])}`
    || panels[0].properties.sourceUrl !== data.sourceVideo.url
    || !Array.isArray(data.timelineTracks) || data.timelineTracks.length > 64 || !Array.isArray(meta.kgVideoSequenceSources)) return []
  const sourceVideo = data.sourceVideo
  const tracks = data.timelineTracks
  const sourceMatches = meta.kgVideoSequenceSources.filter(source => isPlainObject(source) && source.sourceUrl === sourceVideo.url)
  if (sourceMatches.length !== 1 || !isId(sourceMatches[0].id) || meta.kgVideoSequenceSources.filter(source => isPlainObject(source) && source.id === sourceMatches[0].id).length !== 1) return []
  const videoTracks = tracks.filter(track => isPlainObject(track) && track.source === 'source-video' && track.timelineLane === 'video')
  const annotationTracks = tracks.filter(track => isPlainObject(track) && track.source === 'frame-bounding-boxes' && track.timelineLane === 'fbf')
  if (videoTracks.length !== 1 || annotationTracks.length !== 1) return []
  const video = videoTracks[0], annotation = annotationTracks[0]
  if (![video, annotation].every(track => isId(track.id) && isTime(track.startMs, MAX_SECONDS * 1000)
    && isTime(track.durationMs, MAX_SECONDS * 1000) && track.durationMs > 0 && Array.isArray(track.frameSamples)
    && track.frameSamples.length > 0 && track.frameSamples.length <= 80
    && track.frameSamples.every(sample => isPlainObject(sample) && isTime(sample.timestampMs, track.durationMs)
      && sample.timestampSeconds === Number((sample.timestampMs / 1000).toFixed(3)) && isUrl(sample.frameImageUrl)))
    || video.startMs !== annotation.startMs || video.durationMs !== annotation.durationMs
    || tracks.some(track => !isPlainObject(track) || tracks.filter(item => isPlainObject(item) && item.id === track.id).length !== 1)) return []
  const exact = video.durationMs / 1000, registered = sourceMatches[0].durationSeconds
  if (registered !== exact && registered !== Math.max(1, Math.round(exact))) return []
  const videoSamples = video.frameSamples.map(sample => ({ timestampSeconds: sample.timestampSeconds, url: sample.frameImageUrl }))
  const annotationSamples = annotation.frameSamples.map(sample => ({ timestampSeconds: sample.timestampSeconds, url: sample.frameImageUrl }))
  const spans = uniqueIndex(buildMermaidGanttTimelineModel(diagram.value).taskSpans, taskId)
  const videoSpan = spans.get(video.id), annotationSpan = spans.get(annotation.id)
  if (!sameSamples(videoSamples, annotationSamples) || !videoSpan || !annotationSpan
    || !sameSamples(videoSamples, readMermaidGanttFrameSamples(videoSpan.raw))
    || !sameSamples(annotationSamples, readMermaidGanttFrameSamples(annotationSpan.raw))) return []
  const association: VideoSequenceSourceAnnotation = { schema: 'source-annotations/v1', videoTrackId: video.id, annotationTrackId: annotation.id,
    sourceId: sourceMatches[0].id, frameAnalysisNodeId: panels[0].id,
    annotationStartMinutes: Number((annotation.startMs / 60000).toFixed(6)),
    annotationDurationMinutes: Math.max(0.001, Number((annotation.durationMs / 60000).toFixed(6))),
    sourceStartSeconds: 0, sourceEndSeconds: exact }
  if (!isAssociation(association)) return []
  if (registered !== exact) legacyDurations.set(association, { sourceId: association.sourceId, sourceUrl: sourceVideo.url as string, registered, exact })
  return [association]
}

const taskId = (span: Span): string => {
  const tokens = readGanttTaskTokens(span.raw)
  const id = tokens.find(token => !/^(?:active|done|crit|milestone|vert)$/i.test(token)
    && !/^kg(?:src|pos|thumb|frames)_/i.test(token)) || ''
  return isId(id) ? id : ''
}
const isSpan = (span: Span): boolean => {
  const id = taskId(span)
  return readGanttTaskTokens(span.raw).filter(token => token === id).length === 1
    && isTime(span.startMinutes, MAX_SECONDS / 60)
    && isTime(span.durationMinutes, MAX_SECONDS / 60) && span.durationMinutes > 0
    && span.endMinutes === span.startMinutes + span.durationMinutes
}
const uniqueIndex = <T>(items: readonly T[], key: (item: T) => string): Map<string, T | null> => {
  const index = new Map<string, T | null>()
  for (const item of items) { const id = key(item); if (id) index.set(id, index.has(id) ? null : item) }
  return index
}
const readWindow = (span: Span, durationSeconds: number) => {
  const rangeTokens = readGanttTaskTokens(span.raw).filter(token => /^kgsrc_/i.test(token))
  if (rangeTokens.length > 1) return null
  const range = readMermaidGanttTaskSourceRangeSeconds(span.raw)
  if (rangeTokens.length && !range) return null
  const start = range?.startSeconds ?? 0
  const end = range?.endSeconds ?? durationSeconds
  return isTime(start, durationSeconds) && isTime(end, durationSeconds) && end > start
    ? { sourceStartSeconds: start, sourceEndSeconds: end } : null
}

export function resolveVideoSequenceSourceAnnotations(args: {
  associations: readonly VideoSequenceSourceAnnotation[]
  taskSpans: readonly Span[]
  sources: readonly Source[]
}): VideoSequenceSourceAnnotationGroup[] {
  if (!Array.isArray(args.associations) || args.associations.length > MAX_ASSOCIATIONS || !args.associations.every(isAssociation)
    || args.taskSpans.length > 4096 || args.sources.length > 4096
    || args.taskSpans.reduce((size, span) => size + span.raw.length, 0) > 500000) return []
  let rawBytes = 0
  for (const span of args.taskSpans) { rawBytes += new TextEncoder().encode(span.raw).length; if (rawBytes > 500000) return [] }
  const spans = uniqueIndex(args.taskSpans, taskId)
  const sources = uniqueIndex(args.sources, source => source.id)
  const links = uniqueIndex(args.associations.flatMap(link => [link.videoTrackId, link.annotationTrackId]), id => id)
  const groups: VideoSequenceSourceAnnotationGroup[] = []
  for (const link of args.associations) {
    if (!links.get(link.videoTrackId) || !links.get(link.annotationTrackId)) continue
    const video = spans.get(link.videoTrackId)
    const annotation = spans.get(link.annotationTrackId)
    const source = sources.get(link.sourceId)
    if (!video || !annotation || !source || !isSpan(video) || !isSpan(annotation)
      || !isTime(source.durationSeconds, MAX_SECONDS) || source.durationSeconds <= 0
      || resolveVideoSequenceTimelineLane(video) !== 'video' || !isCompactSourceMediaSpan(video, 'video')
      || resolveVideoSequenceTimelineLane(annotation) !== 'fbf' || !isCompactSourceMediaSpan(annotation, 'fbf')
      || annotation.startMinutes !== link.annotationStartMinutes
      || annotation.durationMinutes !== link.annotationDurationMinutes) continue
    const proof = legacyDurations.get(link)
    if (proof && (link.sourceId !== proof.sourceId || source.sourceUrl !== proof.sourceUrl || source.durationSeconds !== proof.registered
      || link.sourceStartSeconds !== 0 || link.sourceEndSeconds !== proof.exact
      || args.sources.filter(item => item.sourceUrl === proof.sourceUrl).length !== 1)) continue
    const duration = proof?.exact ?? source.durationSeconds
    const annotationWindow = readWindow(annotation, duration)
    const window = readWindow(video, duration)
    if (!annotationWindow || !window || annotationWindow.sourceStartSeconds !== link.sourceStartSeconds
      || annotationWindow.sourceEndSeconds !== link.sourceEndSeconds) continue
    const authored = readMermaidGanttFrameSamples(annotation.raw)
    if (!authored.length || authored.length > 80 || authored.some(sample => !isTime(sample.timestampSeconds, duration)
      || !sample.url || sample.url.length > 4096 || /[\u0000-\u001f]/.test(sample.url))) continue
    const samples = authored.filter(sample => sample.timestampSeconds >= window.sourceStartSeconds
      && sample.timestampSeconds <= window.sourceEndSeconds).map(({ timestampSeconds, url }) => ({ timestampSeconds, url }))
    groups.push({ association: link, annotationSpan: annotation, videoSpan: video, samples, sourceWindow: window })
  }
  return groups
}

export function resolveVideoSequenceAnnotationTimelinePosition(group: VideoSequenceSourceAnnotationGroup, timestampSeconds: number): number | null {
  const { sourceStartSeconds: start, sourceEndSeconds: end } = group.sourceWindow
  if (!isTime(timestampSeconds, MAX_SECONDS) || !isTime(start, MAX_SECONDS) || !isTime(end, MAX_SECONDS)
    || end <= start || timestampSeconds < start || timestampSeconds > end || !isSpan(group.videoSpan)) return null
  return group.videoSpan.startMinutes + (timestampSeconds - start) / (end - start) * group.videoSpan.durationMinutes
}
