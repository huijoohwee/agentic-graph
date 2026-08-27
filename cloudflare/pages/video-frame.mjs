import {
  buildRemoteVideoFrameFileName,
  buildRemoteVideoFrameSemanticKey,
  normalizeRemoteVideoFrameFormat,
  normalizeRemoteVideoFrameSeconds,
  parseYouTubeStartSeconds,
} from '../grph-shared/dist/rich-media/providers.js'

const PUBLIC_PREFIX = '/image/agenticgraph/video-frame'
const MAX_URL_LENGTH = 4096
const MAX_TIME_SECONDS = 12 * 60 * 60
const FRAME_FILE_RE = /^frame-[a-f0-9]+-t\d+\.(?:png|jpg)$/i

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'accept, content-type',
}

const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim()

const jsonResponse = (body, status = 200, method = 'GET') =>
  new Response(method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const textResponse = (body, status = 200, method = 'GET') =>
  new Response(method === 'HEAD' ? null : body, {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const hostMatches = (host, allowed) => host === allowed || host.endsWith(`.${allowed}`)

const readAllowedHosts = env => {
  const raw = cleanText(env?.AG_VIDEO_FRAME_ALLOWED_HOSTS)
  if (raw) return raw.split(',').map(part => cleanText(part).toLowerCase()).filter(Boolean)
  return ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'bilibili.com', 'b23.tv']
}

const unwrapUrlInput = value => cleanText(value).replace(/^<|>$/g, '').trim()

const isAllowedSourceUrl = (sourceUrl, env) => {
  try {
    const parsed = new URL(sourceUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    return readAllowedHosts(env).some(allowed => hostMatches(host, allowed))
  } catch {
    return false
  }
}

const readFrameRequest = (request, env) => {
  const parsed = new URL(request.url)
  const sourceUrl = unwrapUrlInput(parsed.searchParams.get('url') || '')
  if (!sourceUrl) return { error: 'Missing url parameter' }
  if (sourceUrl.length > MAX_URL_LENGTH) return { error: 'Video URL is too long' }
  if (!isAllowedSourceUrl(sourceUrl, env)) return { error: 'Video frame extraction is limited to supported remote video hosts' }

  const parsedTime = normalizeRemoteVideoFrameSeconds(parsed.searchParams.get('time')) ?? parseYouTubeStartSeconds(sourceUrl)
  if (parsedTime == null) return { error: 'Missing time parameter' }
  const timeSeconds = Math.min(MAX_TIME_SECONDS, Math.max(0, parsedTime))
  const format = normalizeRemoteVideoFrameFormat(parsed.searchParams.get('format') || 'png')
  const fileName = buildRemoteVideoFrameFileName({ sourceUrl, timeSeconds, format })
  if (!FRAME_FILE_RE.test(fileName)) return { error: 'Invalid frame cache key' }
  const publicUrl = `${PUBLIC_PREFIX}/${fileName}`
  return {
    sourceUrl,
    timeSeconds,
    format,
    fileName,
    publicUrl,
    semanticKey: buildRemoteVideoFrameSemanticKey({ sourceUrl, timeSeconds, format }),
  }
}

const fetchStaticAsset = async (context, publicUrl, method) => {
  const assetUrl = new URL(publicUrl, context.request.url)
  const assetRequest = new Request(assetUrl.toString(), { method })
  if (typeof context.env?.ASSETS?.fetch === 'function') {
    return await context.env.ASSETS.fetch(assetRequest)
  }
  return await fetch(assetRequest)
}

const missingFrameMessage = frame =>
  `Frame has not been generated yet. Run the local video-frame extractor and publish ${frame.publicUrl}.`

const imageResponseHeaders = (asset, frame) => {
  const headers = new Headers()
  headers.set('content-type', frame.format === 'jpg' ? 'image/jpeg' : 'image/png')
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('access-control-allow-origin', '*')
  const contentLength = asset.headers.get('content-length')
  if (contentLength) headers.set('content-length', contentLength)
  const etag = asset.headers.get('etag')
  if (etag) headers.set('etag', etag)
  return headers
}

export async function onRequest(context) {
  const request = context.request
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse('Method not allowed', 405, request.method)
  }

  const emitJson = new URL(request.url).searchParams.get('emit') === 'json'
  const frame = readFrameRequest(request, context.env || {})
  if ('error' in frame) {
    return emitJson
      ? jsonResponse({ ok: false, error: frame.error }, 400, request.method)
      : textResponse(frame.error, 400, request.method)
  }

  const assetMethod = emitJson && request.method !== 'HEAD'
    ? 'GET'
    : emitJson || request.method === 'HEAD'
      ? 'HEAD'
      : 'GET'
  const asset = await fetchStaticAsset(context, frame.publicUrl, assetMethod)
  if (!asset.ok) {
    const error = missingFrameMessage(frame)
    return emitJson
      ? jsonResponse({ ok: false, error, publicUrl: frame.publicUrl, semanticKey: frame.semanticKey }, 404, request.method)
      : textResponse(error, 404, request.method)
  }

  if (emitJson) {
    let bytes = Number(asset.headers.get('content-length') || 0)
    if ((!Number.isFinite(bytes) || bytes <= 0) && request.method !== 'HEAD') {
      bytes = (await asset.arrayBuffer()).byteLength
    }
    return jsonResponse({
      ok: true,
      imageUrl: frame.publicUrl,
      publicUrl: frame.publicUrl,
      semanticKey: frame.semanticKey,
      cached: true,
      bytes: Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0,
      timeSeconds: frame.timeSeconds,
      format: frame.format,
    }, 200, request.method)
  }

  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: 200,
    headers: imageResponseHeaders(asset, frame),
  })
}
