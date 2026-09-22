import type { InlineMediaKind, InlineMediaCommandCandidate } from './inlineCommandMenuCatalog'

const INLINE_MEDIA_URL_SOURCE_PATTERN = String.raw`(?:https?:\/\/|\/)[^\s"'<>),\]}]+`
const INLINE_MEDIA_URL_PATTERN = new RegExp(INLINE_MEDIA_URL_SOURCE_PATTERN, 'gi')
const INLINE_MEDIA_KEY_VALUE_PATTERN = new RegExp(String.raw`^\s*["']?([A-Za-z0-9_.-]{1,96})["']?\s*[:=]\s*["']?(${INLINE_MEDIA_URL_SOURCE_PATTERN})`, 'i')
const INLINE_IMAGE_KEY_PATTERN = /(image|img|thumbnail|poster|cover|still|artwork)/i
const INLINE_AUDIO_KEY_PATTERN = /(audio|sound|music|voice|narration|tts)/i
const INLINE_VIDEO_KEY_PATTERN = /(video|clip|movie|trailer|watch|playback|stream)/i
const INLINE_IMAGE_URL_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i
const INLINE_AUDIO_URL_PATTERN = /\.(?:aac|aiff?|flac|m4a|mp3|oga|ogg|opus|wav|weba)(?:[?#].*)?$/i
const INLINE_VIDEO_URL_PATTERN = /\.(?:m3u8|m4v|mov|mp4|mpeg|mpg|ogg|ogv|webm)(?:[?#].*)?$/i
function inferInlineMediaKind(key: string | undefined, url: string): InlineMediaKind | null {
  const sourceKey = String(key || '')
  if (INLINE_IMAGE_KEY_PATTERN.test(sourceKey)) return 'image'
  if (INLINE_AUDIO_KEY_PATTERN.test(sourceKey)) return 'audio'
  if (INLINE_VIDEO_KEY_PATTERN.test(sourceKey)) return 'video'
  let parsed: URL | null = null
  try {
    parsed = new URL(url)
  } catch {
    parsed = null
  }
  const host = parsed?.hostname.toLowerCase() || ''
  if (INLINE_IMAGE_URL_PATTERN.test(url) || host.includes('ytimg') || host.includes('image') || host.startsWith('img.')) return 'image'
  if (INLINE_AUDIO_URL_PATTERN.test(url) || host.includes('audio') || host.includes('sound')) return 'audio'
  if (INLINE_VIDEO_URL_PATTERN.test(url) || host.includes('youtube.') || host === 'youtu.be' || host.includes('vimeo.')) return 'video'
  return null
}
function buildInlineMediaCandidateLabel(kind: InlineMediaKind, sourceKey: string | undefined, url: string): string {
  const key = String(sourceKey || '').trim()
  const label = kind === 'image' ? 'Image' : kind === 'audio' ? 'Audio' : 'Video'
  if (key) return `${label}: ${key}`
  try {
    const parsed = new URL(url)
    const pathName = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
    return `${label}: ${pathName}`
  } catch {
    return `${label} URL`
  }
}
function readYoutubeVideoId(url: string): string {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || ''
    if (host.includes('youtube.')) return parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).at(-1) || ''
  } catch {
    return ''
  }
  return ''
}
function resolveInlineMediaThumbnailUrl(kind: InlineMediaKind, url: string): string | undefined {
  if (kind === 'image') return url
  const youtubeVideoId = readYoutubeVideoId(url)
  if (youtubeVideoId) return `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`
  return undefined
}
function normalizeInlineMediaUrl(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[.,;:]+$/g, '')
}
function escapeInlineMediaHtmlAttr(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function buildInlineMediaMarkdownDestination(raw: string): string {
  const url = String(raw || '').trim()
  if (!url) return 'image-url'
  if (!/[\s<>]/.test(url)) return url
  return `<${url.replace(/\\/g, '\\\\').replace(/>/g, '%3E').replace(/\r?\n/g, ' ')}>`
}
export function collectInlineMediaCommandCandidates(args: {
  sourceLines?: string[]
  draftText?: string
  limit?: number
}): InlineMediaCommandCandidate[] {
  const textParts = [
    Array.isArray(args.sourceLines) ? args.sourceLines.join('\n') : '',
    String(args.draftText || ''),
  ].filter(Boolean)
  const seen = new Set<string>()
  const candidates: InlineMediaCommandCandidate[] = []
  const limit = Number.isFinite(args.limit) && Number(args.limit) > 0 ? Number(args.limit) : 12
  for (const text of textParts) {
    const lines = String(text || '').split(/\r?\n/)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] || ''
      const keyValueMatch = INLINE_MEDIA_KEY_VALUE_PATTERN.exec(line)
      const sourceKey = keyValueMatch?.[1]
      const urls = new Set<string>()
      if (keyValueMatch?.[2]) urls.add(normalizeInlineMediaUrl(keyValueMatch[2]))
      for (const match of line.matchAll(INLINE_MEDIA_URL_PATTERN)) {
        urls.add(normalizeInlineMediaUrl(match[0]))
      }
      for (const url of urls) {
        if (!url) continue
        const kind = inferInlineMediaKind(sourceKey, url)
        if (!kind) continue
        const dedupeKey = `${kind}:${url}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        const label = buildInlineMediaCandidateLabel(kind, sourceKey, url)
        candidates.push({
          id: `media-${kind}-${lineIndex}-${candidates.length}`,
          kind,
          url,
          thumbnailUrl: resolveInlineMediaThumbnailUrl(kind, url),
          label,
          sourceKey,
          description: url,
          keywords: [kind, sourceKey, url].filter(Boolean) as string[],
        })
        if (candidates.length >= limit) return candidates
      }
    }
  }
  return candidates
}
export function buildInlineMediaEmbed(args: {
  kind: InlineMediaKind
  url?: string
  thumbnailUrl?: string
  label?: string
  selectedText?: string
  sourceKey?: string
}): string {
  const selected = String(args.selectedText || '').trim()
  const url = String(args.url || '').trim()
  const label = String(args.label || selected || '').trim()
  if (args.kind === 'image') {
    const sourceKey = String(args.sourceKey || '').trim()
    const alt = (label || (sourceKey ? sourceKey.replace(/Url$/i, '') : 'Image alt'))
      .replace(/[[\]\n\r]/g, ' ')
      .trim() || 'Image alt'
    return `![${alt}](${buildInlineMediaMarkdownDestination(url)})`
  }
  if (args.kind === 'audio') {
    const title = label.replace(/[\n\r<>]/g, ' ').replace(/"/g, '&quot;').trim()
    const titleAttr = title ? ` title="${title}"` : ''
    return `<audio src="${escapeInlineMediaHtmlAttr(url || selected || 'audio-url')}"${titleAttr} controls></audio>`
  }
  const poster = String(args.thumbnailUrl || '').trim()
  const posterAttr = poster ? ` poster="${escapeInlineMediaHtmlAttr(poster)}"` : ''
  const title = label.replace(/[\n\r<>]/g, ' ').replace(/"/g, '&quot;').trim()
  const titleAttr = title ? ` title="${title}"` : ''
  return `<video src="${escapeInlineMediaHtmlAttr(url || selected || 'video-url')}"${posterAttr}${titleAttr} controls></video>`
}
