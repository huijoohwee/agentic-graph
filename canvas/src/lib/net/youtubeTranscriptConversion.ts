import { unwrapUserProvidedText } from '@/lib/url'
import type { JSONValue } from '@/lib/graph/types'
import { buildYouTubeThumbnailUrl, formatMediaTimestampSeconds, getYouTubeId, parseYouTubeStartSeconds, stripYouTubeUrlTrailingPunctuation } from 'grph-shared/rich-media/providers'
import { fetchRemoteVideoTimestampFrame } from './videoFrameExtraction'

export type YouTubeTranscriptConversionOk = {
  ok: true
  name: string
  markdown: string
  transcriptJsonText: string | null
  transcript: Record<string, JSONValue> | null
  sourceUrl: string
}

export type YouTubeTranscriptConversionErr = {
  ok: false
  error: string
}

export type YouTubeTranscriptConversionResult = YouTubeTranscriptConversionOk | YouTubeTranscriptConversionErr

const YOUTUBE_TRANSCRIPT_CACHE_LIMIT = 4
const YOUTUBE_TRANSCRIPT_CACHE_TTL_MS = 2 * 60_000
const YOUTUBE_TRANSCRIPT_TIMEOUT_MS = 120_000

const transcriptCache = new Map<string, { result: YouTubeTranscriptConversionResult; atMs: number }>()
const transcriptInflight = new Map<string, Promise<YouTubeTranscriptConversionResult | null>>()

const readErrorMessage = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

const normalizeTranscript = (value: unknown): Record<string, JSONValue> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const text = JSON.stringify(value)
    const parsed = JSON.parse(text) as JSONValue
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, JSONValue>
  } catch {
    return null
  }
}

const readTranscriptJsonText = (raw: unknown, transcript: Record<string, JSONValue> | null): string | null => {
  if (typeof raw === 'string' && raw.trim()) return raw
  if (!transcript) return null
  try {
    return JSON.stringify(transcript, null, 2)
  } catch {
    return null
  }
}

const readSourceUrl = (transcript: Record<string, JSONValue> | null, fallback: string): string => {
  const sourceUrl = typeof transcript?.source_url === 'string' ? transcript.source_url.trim() : ''
  return sourceUrl || fallback
}

const escapeMarkdownAlt = (value: string): string => {
  const raw = String(value || '').trim()
  return raw.replace(/[\[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim() || 'YouTube thumbnail'
}

const cleanSemanticLabelText = (value: string): string => {
  const raw = String(value || '')
    .replace(/\[[^\]]*\]\(([^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[`*~#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return raw.replace(/^[\s,.;:!?-]+|[\s,.;:!?-]+$/g, '')
}

const isGenericTranscriptTitle = (title: string, videoId: string): boolean => {
  const raw = cleanSemanticLabelText(title)
  if (!raw) return true
  const lower = raw.toLowerCase()
  const id = String(videoId || '').toLowerCase()
  if (id && lower === id) return true
  if (id && lower.startsWith('youtube transcript') && lower.includes(id)) return true
  if (/^(youtube\s+)?transcript$/i.test(raw)) return true
  return false
}

const readSegmentRows = (transcript: Record<string, JSONValue> | null): Array<{ text: string; start: number | null }> => {
  const rawSegments = Array.isArray(transcript?.segments) ? transcript.segments : []
  const rows: Array<{ text: string; start: number | null }> = []
  for (const segment of rawSegments) {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) continue
    const record = segment as Record<string, JSONValue>
    const text = cleanSemanticLabelText(typeof record.text === 'string' ? record.text : '')
    if (!text) continue
    const rawStart = typeof record.start === 'number' ? record.start : typeof record.start_s === 'number' ? record.start_s : NaN
    rows.push({ text, start: Number.isFinite(rawStart) ? rawStart : null })
  }
  return rows
}

const readFirstMarkdownExcerpt = (markdown: string, videoId: string): string => {
  const id = String(videoId || '').toLowerCase()
  for (const line of String(markdown || '').split(/\r?\n/).slice(0, 80)) {
    const text = cleanSemanticLabelText(line)
    const lower = text.toLowerCase()
    if (!text || text.length < 3) continue
    if (lower === id || lower.includes('youtube transcript') || lower.startsWith('video id')) continue
    if (readStandaloneLineUrl(line)) continue
    return text
  }
  return ''
}

const buildSemanticYouTubeThumbnailLabel = (args: {
  markdown: string
  transcript: Record<string, JSONValue> | null
  sourceUrl: string
  videoId: string
  imageSource?: string
}): string => {
  const title = typeof args.transcript?.title === 'string' ? args.transcript.title : ''
  const meaningfulTitle = isGenericTranscriptTitle(title, args.videoId) ? '' : cleanSemanticLabelText(title)
  if (meaningfulTitle) return escapeMarkdownAlt(meaningfulTitle)

  const rows = readSegmentRows(args.transcript)
  const timestamp = parseYouTubeStartSeconds(args.imageSource || '') ?? parseYouTubeStartSeconds(args.sourceUrl)
  const byTime = timestamp == null
    ? null
    : rows.reduce<{ text: string; start: number | null; distance: number } | null>((best, row) => {
        if (row.start == null) return best
        const distance = Math.abs(row.start - timestamp)
        return !best || distance < best.distance ? { ...row, distance } : best
      }, null)
  const row = byTime || rows[0] || null
  const excerpt = row?.text || readFirstMarkdownExcerpt(args.markdown, args.videoId)
  const timestampForLabel = timestamp ?? row?.start ?? null
  const timeLabel = timestampForLabel == null || !Number.isFinite(timestampForLabel) || timestampForLabel < 0
    ? ''
    : formatMediaTimestampSeconds(timestampForLabel)
  const label = excerpt
    ? `YouTube thumbnail: ${excerpt}${timeLabel ? ` at ${timeLabel}` : ''}`
    : 'YouTube thumbnail'
  return escapeMarkdownAlt(label.length > 120 ? `${label.slice(0, 117).trim()}...` : label)
}

const readThumbnailUrl = (transcript: Record<string, JSONValue> | null, sourceUrl: string, thumbnailOverrideUrl?: string): string => {
  const override = String(thumbnailOverrideUrl || '').trim()
  if (override) return override
  const existing = typeof transcript?.thumbnail_url === 'string' ? transcript.thumbnail_url.trim() : ''
  if (existing) return existing
  const bySource = buildYouTubeThumbnailUrl(sourceUrl)
  if (bySource) return bySource
  const videoId = typeof transcript?.video_id === 'string' ? transcript.video_id.trim() : ''
  return videoId ? buildYouTubeThumbnailUrl(videoId) || '' : ''
}

const isGenericThumbnailAlt = (alt: string, videoId: string): boolean => {
  const raw = cleanSemanticLabelText(alt)
  if (!raw) return true
  const lower = raw.toLowerCase()
  const id = String(videoId || '').toLowerCase()
  if (/^(youtube\s+)?(video\s+)?thumbnail$/i.test(raw)) return true
  if (/^(youtube\s+)?preview( image)?$/i.test(raw)) return true
  if (id && lower.includes(id) && /^(youtube\s+)?transcript\b/i.test(raw)) return true
  return /^image$/i.test(raw)
}

const normalizeEarlyYouTubeMarkdownImage = (
  markdown: string,
  thumbnailUrl: string,
  videoId: string,
  alt: string,
): { markdown: string; found: boolean } => {
  const lines = String(markdown || '').split('\n')
  const escapedId = videoId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const imageRe = /!\[([^\]]*)\]\((https?:\/\/(?:(?:i|img)\.ytimg\.com|img\.youtube\.com)\/vi\/([A-Za-z0-9_-]{6,128})\/[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/i
  const videoIdRe = escapedId ? new RegExp(`https?://(?:(?:i|img)\\.ytimg\\.com|img\\.youtube\\.com)/vi/${escapedId}/`, 'i') : null
  for (let i = 0; i < Math.min(lines.length, 24); i += 1) {
    const line = lines[i] || ''
    const image = line.match(imageRe)
    if (!image?.[2]) continue
    const imageUrl = image[2]
    const imageVideoId = String(image[3] || '')
    const sameThumbnail = (thumbnailUrl && imageUrl === thumbnailUrl) || (videoId && imageVideoId === videoId) || !!(videoIdRe && videoIdRe.test(line))
    if (!sameThumbnail) continue
    if (!isGenericThumbnailAlt(image[1] || '', videoId)) return { markdown, found: true }
    lines[i] = line.replace(imageRe, `![${alt}](${imageUrl})`)
    return { markdown: lines.join('\n'), found: true }
  }
  return { markdown, found: false }
}

const readStandaloneLineUrl = (line: string): string => {
  const raw = String(line || '').trim()
  if (!raw) return ''
  const angle = raw.match(/^<([^<>\s]+)>$/)
  if (angle?.[1]) return stripYouTubeUrlTrailingPunctuation(angle[1])
  const link = raw.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/)
  if (link?.[2]) {
    const label = String(link[1] || '').trim()
    const href = stripYouTubeUrlTrailingPunctuation(link[2])
    if (!label || label === href || label === link[2]) return href
  }
  if (/^https?:\/\/\S+$/i.test(raw)) return stripYouTubeUrlTrailingPunctuation(raw)
  return ''
}

const getYouTubeVideoKey = (value: string): string => getYouTubeId(String(value || '').trim()) || ''

const isSameYouTubeSourceLine = (line: string, sourceUrl: string, videoId: string): string => {
  const lineUrl = readStandaloneLineUrl(line)
  if (!lineUrl) return ''
  const source = String(sourceUrl || '').trim()
  if (lineUrl === source) return lineUrl
  const lineId = getYouTubeVideoKey(lineUrl)
  const sourceId = getYouTubeVideoKey(source)
  const expectedId = videoId || sourceId
  return lineId && expectedId && lineId === expectedId ? lineUrl : ''
}

const isTranscriptTextLineCandidate = (line: string): boolean => {
  const raw = String(line || '').trim()
  if (!raw) return false
  if (readStandaloneLineUrl(raw)) return false
  if (/^(---|\+\+\+|```|~~~)/.test(raw)) return false
  if (/^(#{1,6}\s|!\[|\[!\[)/.test(raw)) return false
  if (/^(video id|source)\s*:/i.test(raw)) return false
  return true
}

const normalizeYouTubeTranscriptTimestampLinks = (
  markdown: string,
  sourceUrl: string,
  videoId: string,
): string => {
  const expectedId = videoId || getYouTubeVideoKey(sourceUrl)
  if (!expectedId) return markdown
  const lines = String(markdown || '').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] || ''
    const lineUrl = readStandaloneLineUrl(line)
    const timestamp = lineUrl ? parseYouTubeStartSeconds(lineUrl) : null
    const nextLine = lines[i + 1] || ''
    if (
      lineUrl &&
      timestamp != null &&
      getYouTubeVideoKey(lineUrl) === expectedId &&
      isTranscriptTextLineCandidate(nextLine)
    ) {
      out.push(`[${formatMediaTimestampSeconds(timestamp)}](${lineUrl}) ${String(nextLine || '').trim()}`)
      i += 1
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

const ensureYouTubeMarkdownThumbnail = (
  markdown: string,
  transcript: Record<string, JSONValue> | null,
  sourceUrl: string,
  thumbnailOverrideUrl?: string,
): string => {
  const md = String(markdown || '')
  const source = String(sourceUrl || '').trim()
  const thumbnailUrl = readThumbnailUrl(transcript, source, thumbnailOverrideUrl)
  const videoId = getYouTubeVideoKey(source) || (typeof transcript?.video_id === 'string' ? transcript.video_id.trim() : '')
  const timestampLinkedMarkdown = normalizeYouTubeTranscriptTimestampLinks(md, source, videoId)
  const alt = buildSemanticYouTubeThumbnailLabel({ markdown: timestampLinkedMarkdown, transcript, sourceUrl: source, videoId })
  if (!thumbnailUrl) return timestampLinkedMarkdown
  const normalizedImage = normalizeEarlyYouTubeMarkdownImage(timestampLinkedMarkdown, thumbnailUrl, videoId, alt)
  if (normalizedImage.found) return normalizedImage.markdown
  const lines = timestampLinkedMarkdown.split('\n')
  const standaloneIndex = lines.findIndex(line => !!isSameYouTubeSourceLine(line, source, videoId))
  if (standaloneIndex >= 0) {
    const matchedSource = isSameYouTubeSourceLine(lines[standaloneIndex] || '', source, videoId)
    const imageSource = matchedSource || source
    const imageAlt = buildSemanticYouTubeThumbnailLabel({ markdown: timestampLinkedMarkdown, transcript, sourceUrl: source, videoId, imageSource })
    lines[standaloneIndex] = imageSource ? `[![${imageAlt}](${thumbnailUrl})](${imageSource})` : `![${imageAlt}](${thumbnailUrl})`
    return lines.join('\n')
  }
  const imageLine = source ? `[![${alt}](${thumbnailUrl})](${source})` : `![${alt}](${thumbnailUrl})`
  const sourceIndex = lines.findIndex(line => /^\s*Source\s*:/i.test(line))
  if (sourceIndex >= 0) {
    lines.splice(sourceIndex + 1, 0, imageLine)
    return lines.join('\n')
  }
  if (lines[0]?.startsWith('# ')) {
    lines.splice(1, 0, '', imageLine)
    return lines.join('\n')
  }
  return `${imageLine}\n\n${timestampLinkedMarkdown}`
}

const readCached = (key: string): YouTubeTranscriptConversionResult | null => {
  const cached = transcriptCache.get(key) || null
  if (!cached) return null
  if (Date.now() - cached.atMs > YOUTUBE_TRANSCRIPT_CACHE_TTL_MS) {
    transcriptCache.delete(key)
    return null
  }
  transcriptCache.delete(key)
  transcriptCache.set(key, cached)
  return cached.result
}

const writeCached = (key: string, result: YouTubeTranscriptConversionResult): YouTubeTranscriptConversionResult => {
  transcriptCache.set(key, { result, atMs: Date.now() })
  if (transcriptCache.size > YOUTUBE_TRANSCRIPT_CACHE_LIMIT) {
    const oldestKey = transcriptCache.keys().next().value
    if (typeof oldestKey === 'string') transcriptCache.delete(oldestKey)
  }
  return result
}

const fetchTimestampFrameThumbnailUrl = async (sourceUrl: string, timeoutMs: number): Promise<string> => {
  const startSeconds = parseYouTubeStartSeconds(sourceUrl)
  if (startSeconds == null || !Number.isFinite(startSeconds)) return ''
  const result = await fetchRemoteVideoTimestampFrame({
    sourceUrl,
    timeSeconds: startSeconds,
    timeoutMs: Math.min(timeoutMs, 75_000),
  }).catch(() => null)
  return result?.ok === true ? String(result.imageUrl || result.publicUrl || '').trim() : ''
}

export async function fetchYouTubeTranscriptConversion(rawUrl: string, opts?: {
  lang?: string
  timeoutMs?: number
}): Promise<YouTubeTranscriptConversionResult | null> {
  const cleaned = unwrapUserProvidedText(String(rawUrl || '').trim()) || String(rawUrl || '').trim()
  if (!cleaned) return null
  const lang = typeof opts?.lang === 'string' ? opts.lang.trim() : ''
  const key = `youtube-transcript:v7:${lang || 'default'}:${cleaned}`
  const cached = readCached(key)
  if (cached) return cached
  const inflight = transcriptInflight.get(key)
  if (inflight) return await inflight

  const timeoutMs = (() => {
    const raw = Number(opts?.timeoutMs)
    if (!Number.isFinite(raw)) return YOUTUBE_TRANSCRIPT_TIMEOUT_MS
    return Math.max(10_000, Math.min(10 * 60_000, Math.floor(raw)))
  })()

  const request = (async () => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const qs = new URLSearchParams({ url: cleaned, emit: 'json' })
      if (lang && lang !== 'en') qs.set('lang', lang)
      const res = await fetch(`/__youtube_transcript?${qs.toString()}`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      const json = (await res.json()) as {
        ok?: unknown
        markdown?: unknown
        error?: unknown
        name?: unknown
        transcript?: unknown
        transcriptJsonText?: unknown
      }
      if (json && json.ok === true && typeof json.markdown === 'string') {
        const transcript = normalizeTranscript(json.transcript)
        const transcriptJsonText = readTranscriptJsonText(json.transcriptJsonText, transcript)
        const sourceUrl = readSourceUrl(transcript, cleaned)
        const timestampFrameThumbnailUrl = await fetchTimestampFrameThumbnailUrl(sourceUrl, timeoutMs)
        return writeCached(key, {
          ok: true,
          name: typeof json.name === 'string' && json.name.trim() ? json.name.trim() : 'youtube-transcript.md',
          markdown: ensureYouTubeMarkdownThumbnail(json.markdown, transcript, sourceUrl, timestampFrameThumbnailUrl),
          transcriptJsonText,
          transcript,
          sourceUrl,
        })
      }
      const err = readErrorMessage(json?.error, '')
      if (err) return { ok: false as const, error: err }
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` }
      return { ok: false as const, error: 'YouTube conversion failed' }
    } catch (error) {
      if (controller.signal.aborted) return { ok: false as const, error: `YouTube conversion timed out after ${timeoutMs}ms` }
      const message = error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : ''
      return { ok: false as const, error: message.trim() || 'Request failed' }
    } finally {
      clearTimeout(timeoutId)
    }
  })()

  transcriptInflight.set(key, request)
  try {
    return await request
  } finally {
    transcriptInflight.delete(key)
  }
}
