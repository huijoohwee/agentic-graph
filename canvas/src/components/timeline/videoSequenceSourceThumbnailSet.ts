import type { VideoSequenceTimelineSourceThumbnailSet, VideoSequenceTimelineThumbnailWindow } from './VideoSequenceTimelineRuler'
import type { VideoSequenceTimelineLaneId } from './videoSequenceTimeline'
import { buildVideoSequenceAuthoredFrameThumbnails } from './videoSequenceGeneratedFrameThumbnails'
import { readMermaidGanttTaskSourceRangeSeconds, type MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { readGanttTaskTokens } from '@/lib/mermaid/mermaidGanttTimelineModel'
import { readMermaidGanttFrameSamples, readMermaidGanttFrameThumbnailUrl } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'

const VIDEO_SEQUENCE_AUTHORED_SOURCE_SAMPLE_MAX_COUNT = 16
const SOURCE_THUMBNAIL_WINDOW_EPSILON = 0.001

const normalizeSourceThumbnailLabel = (value: unknown): string => String(value || '')
  .toLowerCase()
  .replace(/\.(?:avif|gif|jpe?g|png|svg|webp|mp4|mov|m4v|webm)(?=\s|$)/g, '')
  .replace(/\b(?:source|image|scene|video|media)\b/g, ' ')
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
  .trim()

const isGenericSourcePlaceholderSpan = (span: MermaidGanttTimelineTaskSpan): boolean => {
  const label = String(span.label || '').trim().toLowerCase()
  return /^source\s+(?:image|scene|video)$/.test(label)
}

export const normalizeSourceThumbnailId = (value: unknown): string => String(value || '')
  .trim()
  .replace(/_(?:video|image|scene|mask|grade|effect|adjustment|transition|keyframe|filter|audio|speed)(?=(?:_splice|_split_left|_split_right|_copy)*$|$)/gi, '')
  .replace(/(?:_(?:splice|split_left|split_right|copy))+$/gi, '')

export function readVideoSequenceSpanStableSourceId(span: MermaidGanttTimelineTaskSpan): string {
  return normalizeSourceThumbnailId(readGanttTaskTokens(span.raw).find(token =>
    !/^kg(?:src|pos|thumb|frames)_/i.test(token) &&
    !/^\d+(?:\.\d+)?m$/i.test(token) &&
    !/^(?:active|done|crit|milestone|vert)$/i.test(token) &&
    !/^after\b/i.test(token) &&
    !/^until\b/i.test(token),
  ))
}

export function resolveVideoSequenceSourceThumbnailSet(args: {
  lane: VideoSequenceTimelineLaneId
  sets: readonly VideoSequenceTimelineSourceThumbnailSet[]
  span: MermaidGanttTimelineTaskSpan
}): VideoSequenceTimelineSourceThumbnailSet | null {
  const expectedKind = args.lane === 'image' || args.lane === 'scene' ? 'image' : args.lane === 'video' || args.lane === 'audio' ? 'video' : null
  if (!expectedKind) return null
  const candidates = args.sets.filter(set => set.kind === expectedKind && (args.lane === 'audio' ? set.sourceAudioWaveformSamples.length || set.sourceThumbnails.length : set.sourceThumbnails.length || ((expectedKind === 'image' || expectedKind === 'video') && !!set.sourceUrl)))
  const spanSourceId = readVideoSequenceSpanStableSourceId(args.span)
  const genericPlaceholder = isGenericSourcePlaceholderSpan(args.span)
  if (genericPlaceholder && args.lane !== 'video') return null
  const idMatched = candidates.find(set => {
    const setSourceId = normalizeSourceThumbnailId(set.sourceId)
    return !!setSourceId && !!spanSourceId && setSourceId === spanSourceId
  })
  const spanLabel = normalizeSourceThumbnailLabel(args.span.label)
  const labelMatched = genericPlaceholder ? null : candidates.find(set => {
    const setLabel = normalizeSourceThumbnailLabel(set.label || set.sourceUrl)
    return !!setLabel && !!spanLabel && (spanLabel.includes(setLabel) || setLabel.includes(spanLabel))
  })
  const matched = idMatched || labelMatched || (!genericPlaceholder && candidates.length === 1 ? candidates[0] : null)
  if (args.lane !== 'video') return matched
  if (matched?.sourceThumbnails.length) {
    return !genericPlaceholder || readMermaidGanttFrameSamples(args.span.raw).length || readMermaidGanttFrameThumbnailUrl(args.span.raw) ? matched : null
  }
  const sourceRange = readMermaidGanttTaskSourceRangeSeconds(args.span.raw)
  const existingWindow = matched?.sourceThumbnailWindows.find(window => (
    Math.abs(window.timelineStartMinutes - args.span.startMinutes) <= SOURCE_THUMBNAIL_WINDOW_EPSILON &&
    Math.abs(window.timelineEndMinutes - args.span.endMinutes) <= SOURCE_THUMBNAIL_WINDOW_EPSILON
  ))
  const durationSeconds = Math.max(0.0001, args.span.durationMinutes * 60)
  const thumbnailWindow: VideoSequenceTimelineThumbnailWindow = {
    sourceEndSeconds: sourceRange?.endSeconds ?? existingWindow?.sourceEndSeconds ?? durationSeconds,
    sourceStartSeconds: sourceRange?.startSeconds ?? existingWindow?.sourceStartSeconds ?? 0,
    timelineEndMinutes: args.span.endMinutes,
    timelineStartMinutes: args.span.startMinutes,
  }
  const authoredThumbnails = buildVideoSequenceAuthoredFrameThumbnails({
    maxSampleCount: VIDEO_SEQUENCE_AUTHORED_SOURCE_SAMPLE_MAX_COUNT,
    restrictToSourceWindow: !!(sourceRange || existingWindow),
    sourceWindow: thumbnailWindow,
    span: args.span,
  })
  if (!authoredThumbnails.length) return genericPlaceholder ? null : matched
  if (!sourceRange && !existingWindow && readMermaidGanttFrameSamples(args.span.raw).length) {
    thumbnailWindow.sourceStartSeconds = authoredThumbnails[0]!.timestampSeconds
    thumbnailWindow.sourceEndSeconds = Math.max(
      thumbnailWindow.sourceStartSeconds + durationSeconds,
      authoredThumbnails[authoredThumbnails.length - 1]!.timestampSeconds,
    )
  }
  return {
    kind: 'video',
    label: matched?.label || args.span.label,
    sourceAudioWaveformSamples: matched?.sourceAudioWaveformSamples || [],
    sourceId: matched?.sourceId || spanSourceId,
    sourceThumbnailWindows: [thumbnailWindow],
    sourceThumbnails: authoredThumbnails,
    sourceUrl: matched?.sourceUrl || '',
  }
}
