const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

const jsonResponse = (body, status = 200, method = 'GET') =>
  new Response(method === 'HEAD' ? null : JSON.stringify(body), { status, headers: JSON_HEADERS })

const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim()

const readVideoId = value => {
  try {
    const url = new URL(String(value || '').trim())
    if (/youtu\.be$/i.test(url.hostname)) return cleanText(url.pathname.split('/').filter(Boolean)[0])
    if (/youtube\.com$/i.test(url.hostname) || /youtube-nocookie\.com$/i.test(url.hostname)) {
      const byQuery = cleanText(url.searchParams.get('v'))
      if (byQuery) return byQuery
      const parts = url.pathname.split('/').filter(Boolean)
      const markerIndex = parts.findIndex(part => ['embed', 'shorts', 'live'].includes(part))
      if (markerIndex >= 0) return cleanText(parts[markerIndex + 1])
    }
  } catch {
    void 0
  }
  return ''
}

const extractJsonAfter = (text, marker) => {
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return null
  const start = text.indexOf('{', markerIndex)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  return null
}

const parsePlayerResponse = html => {
  for (const marker of ['ytInitialPlayerResponse =', 'ytInitialPlayerResponse=']) {
    const raw = extractJsonAfter(html, marker)
    if (!raw) continue
    try {
      return JSON.parse(raw)
    } catch {
      void 0
    }
  }
  return null
}

const pickCaptionTrack = (tracks, lang) => {
  const normalizedLang = cleanText(lang || 'en').toLowerCase()
  return tracks.find(track => cleanText(track.languageCode).toLowerCase() === normalizedLang)
    || tracks.find(track => cleanText(track.languageCode).toLowerCase().startsWith(normalizedLang.split('-')[0]))
    || tracks.find(track => cleanText(track.kind) !== 'asr')
    || tracks[0]
    || null
}

const withJsonCaptionFormat = baseUrl => {
  const url = new URL(baseUrl)
  url.searchParams.set('fmt', 'json3')
  return url.toString()
}

const parseCaptionJson3 = payload => {
  const events = Array.isArray(payload?.events) ? payload.events : []
  return events
    .map(event => {
      const text = Array.isArray(event.segs)
        ? cleanText(event.segs.map(seg => seg?.utf8 || '').join(''))
        : ''
      const start = Number(event.tStartMs) / 1000
      const duration = Number(event.dDurationMs || 0) / 1000
      return text && Number.isFinite(start) ? { text, start, duration: Number.isFinite(duration) ? duration : 0 } : null
    })
    .filter(Boolean)
}

const decodeXmlText = value => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")

const parseCaptionXml = text => {
  const out = []
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi
  let match = null
  while ((match = re.exec(String(text || '')))) {
    const attrs = match[1] || ''
    const start = Number(attrs.match(/\bstart="([^"]+)"/i)?.[1])
    const duration = Number(attrs.match(/\bdur="([^"]+)"/i)?.[1] || 0)
    const segmentText = cleanText(decodeXmlText(match[2] || ''))
    if (segmentText && Number.isFinite(start)) out.push({ text: segmentText, start, duration: Number.isFinite(duration) ? duration : 0 })
  }
  return out
}

const parseCaptionResponseText = (text, contentType) => {
  const raw = String(text || '').trim()
  if (!raw) return []
  if (String(contentType || '').toLowerCase().includes('json') || raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return parseCaptionJson3(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return parseCaptionXml(raw)
}

const formatTimestamp = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const secs = String(total % 60).padStart(2, '0')
  return `${minutes}:${secs}`
}

const timestampUrl = (sourceUrl, start) => {
  const url = new URL(sourceUrl)
  url.searchParams.set('t', `${Math.max(0, Math.floor(Number(start) || 0))}s`)
  return url.toString()
}

const buildMarkdown = ({ title, sourceUrl, videoId, authorName, thumbnailUrl, segments }) => [
  `# ${title || `YouTube ${videoId}`}`,
  '',
  `Video ID: ${videoId}`,
  authorName ? `Author: ${authorName}` : '',
  `Source: [${sourceUrl}](${sourceUrl})`,
  thumbnailUrl ? `[![${title || videoId}](${thumbnailUrl})](${sourceUrl})` : '',
  '',
  segments.length > 0 ? '## Transcript' : '## Video Source',
  '',
  ...(segments.length > 0
    ? segments.map(segment => `[${formatTimestamp(segment.start)}](${timestampUrl(sourceUrl, segment.start)}) ${segment.text}`)
    : [
        'Captions were not available from the source at import time.',
        'The source URL, title, author, and thumbnail remain available for downstream storyboard reconstruction.',
      ]),
  '',
].filter(line => line !== '').join('\n')

const buildPayload = ({ videoId, sourceUrl, title, authorName, thumbnailUrl, lang, languageCode, segments, captionStatus }) => {
  const transcript = {
    type: 'rag:YouTubeTranscript',
    video_id: videoId,
    source_url: sourceUrl,
    title,
    author_name: authorName,
    thumbnail_url: thumbnailUrl,
    language_code: cleanText(languageCode) || lang,
    caption_status: captionStatus,
    segment_count: segments.length,
    duration: segments.reduce((max, segment) => Math.max(max, segment.start + segment.duration), 0),
    segments,
  }
  return {
    ok: true,
    name: `youtube-${videoId.toLowerCase()}.md`,
    markdown: buildMarkdown({ title, sourceUrl, videoId, authorName, thumbnailUrl, segments }),
    transcript,
  }
}

export async function buildYouTubeTranscriptPayload({ sourceUrl, lang = 'en', fetchImpl = fetch }) {
  const videoId = readVideoId(sourceUrl)
  if (!videoId) return { ok: false, error: 'unsupported_youtube_url' }
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
  const [oembedResponse, watchResponse] = await Promise.all([
    fetchImpl(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      headers: { accept: 'application/json' },
    }).catch(() => null),
    fetchImpl(watchUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'user-agent': 'Mozilla/5.0 agentic-graph YouTube transcript importer',
      },
    }),
  ])
  const oembed = oembedResponse?.ok ? await oembedResponse.json().catch(() => ({})) : {}
  const player = watchResponse.ok ? parsePlayerResponse(await watchResponse.text()) : null
  const title = cleanText(oembed.title) || cleanText(player?.videoDetails?.title) || `YouTube ${videoId}`
  const authorName = cleanText(oembed.author_name) || cleanText(player?.videoDetails?.author)
  const thumbnailUrl = cleanText(oembed.thumbnail_url) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (!watchResponse.ok) {
    return buildPayload({
      videoId,
      sourceUrl: watchUrl,
      title,
      authorName,
      thumbnailUrl,
      lang,
      languageCode: lang,
      segments: [],
      captionStatus: `watch-fetch-${watchResponse.status}`,
    })
  }
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  const track = pickCaptionTrack(Array.isArray(tracks) ? tracks : [], lang)
  if (!track?.baseUrl) {
    return buildPayload({
      videoId,
      sourceUrl: watchUrl,
      title,
      authorName,
      thumbnailUrl,
      lang,
      languageCode: lang,
      segments: [],
      captionStatus: 'captions-unavailable',
    })
  }
  const captionsResponse = await fetchImpl(withJsonCaptionFormat(track.baseUrl), {
    headers: {
      accept: 'application/json,text/xml,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 agentic-graph YouTube transcript importer',
    },
  }).catch(() => null)
  const captionText = captionsResponse ? await captionsResponse.text().catch(() => '') : ''
  const segments = captionsResponse?.ok
    ? parseCaptionResponseText(captionText, captionsResponse.headers.get('content-type'))
    : []
  const captionStatus = segments.length > 0
    ? 'available'
    : captionsResponse?.ok
      ? 'captions-empty'
      : `captions-fetch-${captionsResponse?.status || 'failed'}`
  return buildPayload({
    videoId,
    sourceUrl: watchUrl,
    title,
    authorName,
    thumbnailUrl,
    lang,
    languageCode: track.languageCode,
    segments,
    captionStatus,
  })
}

export async function onRequest(context) {
  const request = context.request
  const method = String(request.method || 'GET').toUpperCase()
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS })
  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') return jsonResponse({ ok: false, error: 'unsupported_method' }, 405, method)
  const url = new URL(request.url)
  const sourceUrl = cleanText(url.searchParams.get('url'))
  const lang = cleanText(url.searchParams.get('lang')) || 'en'
  if (!sourceUrl) return jsonResponse({ ok: false, error: 'missing_url' }, 400, method)
  try {
    const payload = await buildYouTubeTranscriptPayload({ sourceUrl, lang })
    return jsonResponse(payload, payload.ok ? 200 : 502, method)
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error
      ? cleanText(error.message)
      : ''
    return jsonResponse({ ok: false, error: message || 'youtube_conversion_failed' }, 502, method)
  }
}
