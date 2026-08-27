import type { VideoAgentTranscriptSegment } from '@/features/video-agent'
import { expandInlineTranscriptMarkdownLines } from '@/lib/markdown/transcriptMarkdownLines'
import {
  isWorkspaceImportTranscriptControlLine,
  readWorkspaceImportTranscriptStatus,
} from './transcriptImportText'

const TRANSCRIPT_UNAVAILABLE_REMOTE_VIDEO_FALLBACK_DURATION_MS = 60_000

const cleanInline = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim()

const readNumber = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const secondsToMs = (value: unknown): number | null => {
  const n = readNumber(value)
  return n === null ? null : Math.max(0, Math.round(n * 1000))
}

const readTranscriptSegmentsFromJson = (text: string): VideoAgentTranscriptSegment[] => {
  if (!text.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const rawSegments = Array.isArray((parsed as { segments?: unknown })?.segments)
    ? (parsed as { segments?: unknown[] }).segments || []
    : []
  return rawSegments.map((segment, index) => {
    const record = segment as Record<string, unknown>
    const startMs = secondsToMs(record.start) ?? secondsToMs(record.start_seconds) ?? readNumber(record.startMs) ?? 0
    const durationMs = Math.max(1, secondsToMs(record.duration) ?? readNumber(record.durationMs) ?? 1000)
    const endMs = Math.max(startMs + 1, secondsToMs(record.end) ?? readNumber(record.endMs) ?? startMs + durationMs)
    return { durationMs, endMs, index, startMs, text: cleanInline(record.text) }
  }).filter(segment => !!segment.text)
}

const readTranscriptSegmentsFromMarkdown = (text: string, durationMs: number): VideoAgentTranscriptSegment[] => {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .flatMap(line => expandInlineTranscriptMarkdownLines(line).map(cleanInline))
    .filter(line => !isWorkspaceImportTranscriptControlLine(line))
  const stepMs = Math.max(1, Math.floor(Math.max(1, durationMs) / Math.max(1, lines.length)))
  return lines.map((line, index) => {
    const startMs = index * stepMs
    const endMs = index === lines.length - 1 ? Math.max(startMs + 1, durationMs) : startMs + stepMs
    return { durationMs: Math.max(1, endMs - startMs), endMs, index, startMs, text: line.replace(/^#+\s*/, '') }
  }).filter(segment => !!segment.text)
}

export const readVideoAgentTranscriptDurationMs = (args: {
  hasRemoteVideoSource: boolean
  sourceTranscriptJsonText?: string | null
}): number => {
  const segments = readTranscriptSegmentsFromJson(String(args.sourceTranscriptJsonText || ''))
  const transcriptDurationMs = segments.reduce((durationMs, segment) => Math.max(durationMs, segment.endMs), 0)
  return transcriptDurationMs || (args.hasRemoteVideoSource ? TRANSCRIPT_UNAVAILABLE_REMOTE_VIDEO_FALLBACK_DURATION_MS : 0)
}

export const buildVideoAgentTranscriptImportArtifacts = (args: {
  durationMs: number
  frameBoundingBoxes: ReadonlyArray<{ frameIndex: number; timestampMs: number }>
  sourceText: string
  sourceTranscriptJsonText?: string | null
}) => {
  const jsonSegments = readTranscriptSegmentsFromJson(String(args.sourceTranscriptJsonText || ''))
  const segments = jsonSegments.length > 0
    ? jsonSegments
    : readTranscriptSegmentsFromMarkdown(args.sourceText, args.durationMs)
  const transcriptStatus = readWorkspaceImportTranscriptStatus(args.sourceText)
  const transcriptSource = jsonSegments.length > 0
    ? 'youtube-transcript-json'
    : segments.length > 0
      ? 'youtube-transcript-markdown'
      : transcriptStatus
        ? 'youtube-transcript-unavailable'
        : 'youtube-transcript-empty'
  const transcriptFormat = jsonSegments.length > 0
    ? 'json'
    : segments.length > 0
      ? 'markdown'
      : transcriptStatus
        ? 'status'
        : 'empty'
  const segmentForTime = (timestampMs: number, fallbackIndex: number): VideoAgentTranscriptSegment | null => {
    const active = segments.find(segment => timestampMs >= segment.startMs && timestampMs < segment.endMs)
    if (active) return active
    return segments.reduce<VideoAgentTranscriptSegment | null>((best, segment) => {
      const bestDistance = best ? Math.min(Math.abs(timestampMs - best.startMs), Math.abs(timestampMs - best.endMs)) : Number.POSITIVE_INFINITY
      const distance = Math.min(Math.abs(timestampMs - segment.startMs), Math.abs(timestampMs - segment.endMs))
      return distance < bestDistance ? segment : best
    }, null) || segments[Math.min(segments.length - 1, fallbackIndex % Math.max(1, segments.length))] || null
  }
  return {
    sourceTranscript: {
      schemaVersion: 'agenticgraph-video-agent-transcript/v1',
      source: transcriptSource,
      format: transcriptFormat,
      status: segments.length > 0 ? 'available' : transcriptStatus ? 'unavailable' : 'empty',
      message: transcriptStatus || undefined,
      segmentCount: segments.length,
      segments,
    },
    frameByFrameTranscript: args.frameBoundingBoxes.map((box, index) => {
      const segment = segmentForTime(box.timestampMs, index)
      return {
        frameIndex: box.frameIndex,
        timestampMs: box.timestampMs,
        transcriptSegmentIndex: segment?.index ?? -1,
        segmentStartMs: segment?.startMs ?? 0,
        segmentEndMs: segment?.endMs ?? 0,
        text: segment?.text || '',
      }
    }),
  }
}
