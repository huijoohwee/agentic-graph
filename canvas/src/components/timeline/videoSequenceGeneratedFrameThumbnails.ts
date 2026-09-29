import { UI_FONT_MONO } from 'grph-shared/ui/typography'
import type { TimelineMediaReaderThumbnail } from './timelineMediaReader'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  readMermaidGanttFrameSamples,
  readMermaidGanttFrameThumbnailUrl,
} from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'

type VideoSequenceGeneratedFrameWindow = {
  sourceEndSeconds: number
  sourceStartSeconds: number
}
export type VideoSequenceGeneratedFrameThumbnailOrigin = 'frame-by-frame'

const GENERATED_FRAME_THUMBNAIL_WIDTH = 160
const GENERATED_FRAME_THUMBNAIL_HEIGHT = 90
const GENERATED_FRAME_THUMBNAIL_MAX_COUNT = 3

const escapeXml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const toSvgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const hashText = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const cleanFrameLabel = (span: MermaidGanttTimelineTaskSpan): string => (
  String(span.label || 'Frame-by-frame sample').replace(/\s+/g, ' ').trim().slice(0, 42)
)

const readLabelTimestampSeconds = (span: MermaidGanttTimelineTaskSpan): number | null => {
  const match = /\b(\d+(?:\.\d+)?)s\b/i.exec(`${span.label} ${span.raw}`)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const formatSeconds = (value: number): string => `${Math.max(0, value).toFixed(1)}s`

const resolveGeneratedFrameTimestamp = (
  span: MermaidGanttTimelineTaskSpan,
  window: VideoSequenceGeneratedFrameWindow,
  index: number,
  count: number,
): number => {
  const labelledTimestamp = readLabelTimestampSeconds(span)
  if (labelledTimestamp != null && count === 1) return labelledTimestamp
  const sourceStart = Math.min(window.sourceStartSeconds, window.sourceEndSeconds)
  const sourceEnd = Math.max(window.sourceStartSeconds, window.sourceEndSeconds)
  const sourceSpan = Math.max(0.0001, sourceEnd - sourceStart)
  const ratio = count === 1 ? 0.5 : (index + 0.5) / count
  return sourceStart + sourceSpan * ratio
}

const resolveGeneratedFrameThumbnailCount = (
  span: MermaidGanttTimelineTaskSpan,
): number => {
  return Math.min(
    GENERATED_FRAME_THUMBNAIL_MAX_COUNT,
    Math.max(1, Math.round(span.durationMinutes)),
  )
}

const buildSourceFrameThumbnail = (args: {
  timestampSeconds: number
  url: string
}): TimelineMediaReaderThumbnail => ({
  dataUrl: args.url,
  format: 'png',
  height: GENERATED_FRAME_THUMBNAIL_HEIGHT,
  mimeType: 'image/png',
  rasterDataUrl: args.url,
  rasterFormat: 'png',
  rasterMimeType: 'image/png',
  timestampSeconds: args.timestampSeconds,
  width: GENERATED_FRAME_THUMBNAIL_WIDTH,
})

const buildGeneratedFrameThumbnailSvg = (args: {
  label: string
  sampleIndex: number
  timestampSeconds: number
}): string => {
  const seed = hashText(`${args.label}:${args.sampleIndex}:${args.timestampSeconds.toFixed(3)}`)
  const boxX = 16 + (seed % 30)
  const boxY = 17 + ((seed >>> 5) % 17)
  const boxWidth = 50 + ((seed >>> 10) % 18)
  const boxHeight = 30 + ((seed >>> 15) % 16)
  const title = `${args.label} frame image ${formatSeconds(args.timestampSeconds)}`
  const sourceDescription = 'Native frame-by-frame timeline image generated from source span timing when playable source thumbnails are unavailable.'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GENERATED_FRAME_THUMBNAIL_WIDTH}" height="${GENERATED_FRAME_THUMBNAIL_HEIGHT}" viewBox="0 0 ${GENERATED_FRAME_THUMBNAIL_WIDTH} ${GENERATED_FRAME_THUMBNAIL_HEIGHT}" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><desc>${escapeXml(sourceDescription)}</desc><metadata>{"kind":"generated-frame-thumbnail","source":"frame-by-frame","timestampSeconds":${Number(args.timestampSeconds.toFixed(6))}}</metadata><defs><linearGradient id="kgFrameBg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#123456"/><stop offset="0.55" stop-color="#0b1220"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs><rect width="160" height="90" rx="8" fill="url(#kgFrameBg)"/><rect x="34" y="16" width="88" height="50" rx="5" fill="none" stroke="#5eead4" stroke-width="1.6" opacity="0.8"/><rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="4" fill="#fbbf24" fill-opacity="0.12" stroke="#fbbf24" stroke-width="2"/><text x="8" y="15" fill="#5eead4" font-family="${UI_FONT_MONO}" font-size="9" font-weight="800">FBF</text><text x="8" y="82" fill="#f8fafc" font-family="${UI_FONT_MONO}" font-size="9" font-weight="800">${escapeXml(formatSeconds(args.timestampSeconds))}</text><text x="45" y="82" fill="#cbd5e1" font-family="${UI_FONT_MONO}" font-size="8">${escapeXml(args.label)}</text></svg>`
}

export const buildVideoSequenceGeneratedFrameThumbnails = (args: {
  sourceWindow: VideoSequenceGeneratedFrameWindow | null
  span: MermaidGanttTimelineTaskSpan
}): readonly TimelineMediaReaderThumbnail[] => {
  const sourceWindow = args.sourceWindow || {
    sourceEndSeconds: args.span.endMinutes,
    sourceStartSeconds: args.span.startMinutes,
  }
  if (args.span.durationMinutes <= 0) return []
  const sourceFrameSamples = readMermaidGanttFrameSamples(args.span.raw)
  if (sourceFrameSamples.length) {
    return sourceFrameSamples.map(sample => buildSourceFrameThumbnail({
      timestampSeconds: sample.timestampSeconds,
      url: sample.url,
    }))
  }
  const frameThumbnailUrl = readMermaidGanttFrameThumbnailUrl(args.span.raw)
  if (frameThumbnailUrl) {
    return [buildSourceFrameThumbnail({
      timestampSeconds: resolveGeneratedFrameTimestamp(args.span, sourceWindow, 0, 1),
      url: frameThumbnailUrl,
    })]
  }
  const count = resolveGeneratedFrameThumbnailCount(args.span)
  const label = cleanFrameLabel(args.span)
  return Array.from({ length: count }, (_, index): TimelineMediaReaderThumbnail => {
    const timestampSeconds = resolveGeneratedFrameTimestamp(args.span, sourceWindow, index, count)
    const dataUrl = toSvgDataUrl(buildGeneratedFrameThumbnailSvg({
      label,
      sampleIndex: index,
      timestampSeconds,
    }))
    return {
      dataUrl,
      format: 'svg',
      height: GENERATED_FRAME_THUMBNAIL_HEIGHT,
      mimeType: 'image/svg+xml',
      rasterDataUrl: dataUrl,
      rasterFormat: 'png',
      rasterMimeType: 'image/png',
      timestampSeconds,
      width: GENERATED_FRAME_THUMBNAIL_WIDTH,
    }
  })
}
