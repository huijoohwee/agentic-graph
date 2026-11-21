import { hashStringToHex } from '../hash/stringHash.js'

export type YouTubeEmbedOptions = {
  noCookie?: boolean
  includeOrigin?: boolean
  origin?: string | null
}

export type RichMediaPreviewProvider = 'youtube' | 'bilibili' | 'remote-video'

export type RichMediaPreviewKind = 'timestamp-embed' | 'timestamp-frame' | 'thumbnail'

export type RichMediaPreviewDescriptor = {
  provider: RichMediaPreviewProvider
  kind: RichMediaPreviewKind
  sourceUrl: string
  semanticKey: string
  timestampLabel?: string
  startSeconds?: number
  embedUrl?: string
  thumbnailUrl?: string
}

export function buildRichMediaPreviewSemanticKey(parts: Array<string | number | boolean | null | undefined>): string {
  const signature = parts
    .map(part => {
      if (part == null) return ''
      if (typeof part === 'boolean') return part ? '1' : '0'
      if (typeof part === 'number') return Number.isFinite(part) ? String(part) : ''
      return String(part)
    })
    .join('|')
  return `rich-media-preview:${hashStringToHex(signature)}`
}

export const DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH = '/__video_frame'
export const DEFAULT_REMOTE_VIDEO_FRAME_FORMAT = 'png'
export const REMOTE_VIDEO_FRAME_FORMAT_LABELS = { png: 'PNG', jpg: 'JPEG', webp: 'WebP' } as const
export type RemoteVideoFrameFormat = keyof typeof REMOTE_VIDEO_FRAME_FORMAT_LABELS
export const VIDEO_FRAME_FILE_RE = /^frame-([a-f0-9]+)-t(\d+(?:_\d+)?)\.(png|jpg|webp)$/i

export function remoteVideoFrameMimeType(format: RemoteVideoFrameFormat): string {
  return format === 'jpg' ? 'image/jpeg' : 'image/' + format
}

export function normalizeRemoteVideoFrameSeconds(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(raw)) return null
  const seconds = Math.max(0, Number(raw.toFixed(3)))
  return Number.isFinite(seconds) ? seconds : null
}

function formatRemoteVideoFrameSecondsForFileName(value: number): string {
  return String(normalizeRemoteVideoFrameSeconds(value) ?? 0).replace(/\./g, '_')
}

export function normalizeRemoteVideoFrameFormat(value: unknown): RemoteVideoFrameFormat {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'jpeg' || raw === 'jpg') return 'jpg'
  return raw === 'webp' ? 'webp' : DEFAULT_REMOTE_VIDEO_FRAME_FORMAT
}

export function buildRemoteVideoFrameSemanticKey(args: {
  sourceUrl: string
  timeSeconds: number
  format?: string
}): string {
  const sourceUrl = String(args.sourceUrl || '').trim()
  const timeSeconds = normalizeRemoteVideoFrameSeconds(args.timeSeconds) ?? 0
  const format = normalizeRemoteVideoFrameFormat(args.format || DEFAULT_REMOTE_VIDEO_FRAME_FORMAT)
  return buildRichMediaPreviewSemanticKey(['remote-video-frame', sourceUrl, timeSeconds, format])
}

export function buildRemoteVideoFrameFileName(args: {
  sourceUrl: string
  timeSeconds: number
  format?: string
}): string {
  const timeSeconds = normalizeRemoteVideoFrameSeconds(args.timeSeconds) ?? 0
  const format = normalizeRemoteVideoFrameFormat(args.format || DEFAULT_REMOTE_VIDEO_FRAME_FORMAT)
  const semanticKey = buildRemoteVideoFrameSemanticKey({ ...args, timeSeconds, format })
  const hash = semanticKey.split(':').pop() || hashStringToHex(semanticKey)
  return `frame-${hash}-t${formatRemoteVideoFrameSecondsForFileName(timeSeconds)}.${format}`
}

export function buildRemoteVideoFrameRequestUrl(args: {
  sourceUrl: string
  timeSeconds: number
  routePath?: string
  format?: string
  emit?: 'image' | 'json'
}): string {
  const sourceUrl = String(args.sourceUrl || '').trim()
  const timeSeconds = normalizeRemoteVideoFrameSeconds(args.timeSeconds)
  if (!sourceUrl || timeSeconds == null) return ''
  const routePath = String(args.routePath || DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH).trim() || DEFAULT_REMOTE_VIDEO_FRAME_ROUTE_PATH
  const format = normalizeRemoteVideoFrameFormat(args.format || DEFAULT_REMOTE_VIDEO_FRAME_FORMAT)
  const qs = new URLSearchParams()
  qs.set('url', sourceUrl)
  qs.set('time', String(timeSeconds))
  qs.set('format', format)
  if (args.emit === 'json') qs.set('emit', 'json')
  return `${routePath}?${qs.toString()}`
}

export function buildRemoteVideoTimestampFramePreviewDescriptor(args: {
  provider?: RichMediaPreviewProvider
  sourceUrl: string
  timeSeconds: number
  routePath?: string
  format?: string
}): RichMediaPreviewDescriptor | null {
  const sourceUrl = String(args.sourceUrl || '').trim()
  const startSeconds = normalizeRemoteVideoFrameSeconds(args.timeSeconds)
  if (!sourceUrl || startSeconds == null) return null
  const thumbnailUrl = buildRemoteVideoFrameRequestUrl({
    sourceUrl,
    timeSeconds: startSeconds,
    routePath: args.routePath,
    format: args.format,
  })
  if (!thumbnailUrl) return null
  const format = normalizeRemoteVideoFrameFormat(args.format || DEFAULT_REMOTE_VIDEO_FRAME_FORMAT)
  return {
    provider: args.provider || 'remote-video',
    kind: 'timestamp-frame',
    sourceUrl,
    startSeconds,
    timestampLabel: formatMediaTimestampSeconds(startSeconds),
    thumbnailUrl,
    semanticKey: buildRemoteVideoFrameSemanticKey({ sourceUrl, timeSeconds: startSeconds, format }),
  }
}

const normalizeYouTubeIdLikeValue = (value: string): string | null => {
  const raw = String(value || '').trim()
  if (!raw) return null
  return /^[A-Za-z0-9_-]{6,128}$/.test(raw) ? raw : null
}

const readYouTubeIdFromUrl = (href: string): string | null => {
  try {
    const url = new URL(String(href || '').trim())
    const host = String(url.hostname || '').toLowerCase()
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0]?.trim() || ''
      return normalizeYouTubeIdLikeValue(id)
    }
    if (
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' ||
      host.endsWith('.youtube-nocookie.com')
    ) {
      const v = String(url.searchParams.get('v') || '').trim()
      if (v) return normalizeYouTubeIdLikeValue(v)
      const parts = url.pathname.split('/').filter(Boolean)
      const head = parts[0] || ''
      const id = parts[1] || ''
      if ((head === 'embed' || head === 'shorts' || head === 'live') && id) return normalizeYouTubeIdLikeValue(id)
      if (head === 'watch') {
        const maybe = String(url.searchParams.get('v') || '').trim()
        return normalizeYouTubeIdLikeValue(maybe)
      }
    }
  } catch {
    return null
  }
  return null
}

export function stripYouTubeUrlTrailingPunctuation(value: string): string {
  let raw = String(value || '').trim().replace(/^<|>$/g, '').trim()
  while (/[),.;:!?]$/.test(raw)) {
    const next = raw.slice(0, -1).trim()
    if (!next) break
    const currentId = readYouTubeIdFromUrl(raw)
    const nextId = readYouTubeIdFromUrl(next)
    if (!nextId) break
    if (currentId && currentId !== nextId) break
    raw = next
  }
  return raw
}

export function getYouTubeId(href: string): string | null {
  return readYouTubeIdFromUrl(stripYouTubeUrlTrailingPunctuation(href))
}

export function parseYouTubeStartSeconds(href: string): number | null {
  const parseChunk = (raw: string): number | null => {
    const s = String(raw || '').trim()
    if (!s) return null
    if (/^\d+$/.test(s)) return Number(s)
    const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i)
    if (!m) return null
    const h = m[1] ? Number(m[1]) : 0
    const mm = m[2] ? Number(m[2]) : 0
    const sec = m[3] ? Number(m[3]) : 0
    const out = h * 3600 + mm * 60 + sec
    return out > 0 && Number.isFinite(out) ? out : null
  }
  try {
    const u = new URL(stripYouTubeUrlTrailingPunctuation(href))
    const fromQuery = u.searchParams.get('t') || u.searchParams.get('start') || ''
    const fromHash = u.hash ? new URLSearchParams(u.hash.replace(/^#/, '')).get('t') || '' : ''
    return parseChunk(fromQuery) ?? parseChunk(fromHash)
  } catch {
    return null
  }
}

export function formatMediaTimestampSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function buildYouTubeEmbedUrl(href: string, opts?: YouTubeEmbedOptions): string | null {
  const id = getYouTubeId(href)
  if (!id) return null
  const start = parseYouTubeStartSeconds(href)
  const params = new URLSearchParams()
  if (start != null) params.set('start', String(start))
  params.set('rel', '0')
  params.set('modestbranding', '1')
  params.set('playsinline', '1')
  params.set('enablejsapi', '1')
  const includeOrigin = opts?.includeOrigin !== false
  const explicitOrigin = typeof opts?.origin === 'string' ? String(opts.origin || '').trim() : ''
  if (includeOrigin) {
    const origin = explicitOrigin || ''
    if (origin) params.set('origin', origin)
  }
  const host = opts?.noCookie === false ? 'www.youtube.com' : 'www.youtube-nocookie.com'
  const q = params.toString()
  return `https://${host}/embed/${id}${q ? `?${q}` : ''}`
}

export function buildYouTubeThumbnailUrl(value: string): string | null {
  const id = getYouTubeId(value) || normalizeYouTubeIdLikeValue(value)
  if (!id) return null
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
}

export function buildYouTubeThumbnailPreviewDescriptor(value: string): RichMediaPreviewDescriptor | null {
  const sourceUrl = stripYouTubeUrlTrailingPunctuation(value)
  const id = getYouTubeId(sourceUrl) || normalizeYouTubeIdLikeValue(sourceUrl)
  if (!id) return null
  const thumbnailUrl = buildYouTubeThumbnailUrl(id)
  if (!thumbnailUrl) return null
  return {
    provider: 'youtube',
    kind: 'thumbnail',
    sourceUrl,
    thumbnailUrl,
    semanticKey: buildRichMediaPreviewSemanticKey(['youtube', 'thumbnail', id, thumbnailUrl]),
  }
}

export function buildYouTubeTimestampPreviewDescriptor(
  href: string,
  opts?: YouTubeEmbedOptions,
): RichMediaPreviewDescriptor | null {
  const sourceUrl = stripYouTubeUrlTrailingPunctuation(href)
  const id = getYouTubeId(sourceUrl)
  const startSeconds = parseYouTubeStartSeconds(sourceUrl)
  if (!id || startSeconds == null || !Number.isFinite(startSeconds)) return null
  const embedUrl = buildYouTubeEmbedUrl(sourceUrl, opts)
  if (!embedUrl) return null
  const timestampLabel = formatMediaTimestampSeconds(startSeconds)
  return {
    provider: 'youtube',
    kind: 'timestamp-embed',
    sourceUrl,
    embedUrl,
    startSeconds,
    timestampLabel,
    semanticKey: buildRichMediaPreviewSemanticKey(['youtube', 'timestamp-embed', id, startSeconds, embedUrl]),
  }
}

export function buildYouTubeTimestampFramePreviewDescriptor(
  href: string,
  opts?: { routePath?: string; format?: string },
): RichMediaPreviewDescriptor | null {
  const sourceUrl = stripYouTubeUrlTrailingPunctuation(href)
  const id = getYouTubeId(sourceUrl)
  const startSeconds = parseYouTubeStartSeconds(sourceUrl)
  if (!id || startSeconds == null || !Number.isFinite(startSeconds)) return null
  return buildRemoteVideoTimestampFramePreviewDescriptor({
    provider: 'youtube',
    sourceUrl,
    timeSeconds: startSeconds,
    routePath: opts?.routePath,
    format: opts?.format,
  })
}

export function getTwitterStatusId(href: string): string | null {
  try {
    const u = new URL(String(href || '').trim())
    const host = String(u.hostname || '').toLowerCase()
    if (!(host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com'))) return null
    const m = u.pathname.match(/\/status\/(\d+)(?:\/|$)/)
    return m && m[1] ? m[1] : null
  } catch {
    return null
  }
}

export function buildTwitterEmbedUrl(href: string): string | null {
  const id = getTwitterStatusId(href)
  if (!id) return null
  return `https://platform.twitter.com/embed/Tweet.html?id=${id}`
}

export function getVimeoId(href: string): string | null {
  try {
    const url = new URL(String(href || '').trim())
    if (!String(url.hostname || '').toLowerCase().endsWith('vimeo.com')) return null
    const parts = url.pathname.split('/').filter(Boolean)
    const last = parts[parts.length - 1] || ''
    return /^\d+$/.test(last) ? last : null
  } catch {
    return null
  }
}

export function buildVimeoEmbedUrl(href: string): string | null {
  const id = getVimeoId(href)
  if (!id) return null
  return `https://player.vimeo.com/video/${id}`
}

export function getBilibiliVideoId(href: string): string | null {
  try {
    const url = new URL(String(href || '').trim())
    const host = String(url.hostname || '').toLowerCase()
    if (!(host === 'www.bilibili.com' || host.endsWith('.bilibili.com'))) return null
    const m = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)(?:\/|$)/)
    return m && m[1] ? m[1] : null
  } catch {
    return null
  }
}

export function buildBilibiliEmbedUrl(href: string): string | null {
  const bvid = getBilibiliVideoId(href)
  if (!bvid) return null
  return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=1&autoplay=0`
}
