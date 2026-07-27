export const MEDIA_PROXY_ENDPOINT = '/__fetch_remote' as const

const getOrigin = (): string => {
  try {
    const w = (globalThis as unknown as { window?: unknown }).window as { location?: { origin?: unknown } } | undefined
    const origin = w?.location?.origin
    const s = typeof origin === 'string' ? origin.trim() : ''
    return s
  } catch {
    return ''
  }
}

const normalizeGithubBlobUrl = (input: string): string => {
  const s = String(input || '').trim()
  if (!s.startsWith('https://github.com/')) return s
  const parts = s.split('/').filter(Boolean)
  const blobIdx = parts.indexOf('blob')
  if (blobIdx < 0) return s
  if (blobIdx + 2 >= parts.length) return s
  const owner = parts[1] || ''
  const repo = parts[2] || ''
  const ref = parts[blobIdx + 1] || ''
  const pathParts = parts.slice(blobIdx + 2)
  if (!owner || !repo || !ref || pathParts.length === 0) return s
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathParts.join('/')}`
}

const shouldProxyUrlOnLocalhost = (url: string): boolean => {
  const origin = getOrigin()
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
  if (!isLocalhost) return false
  const u = String(url || '').trim()
  if (!u) return false
  if (u.startsWith('/')) return false
  return u.startsWith('http://') || u.startsWith('https://')
}

export const applyMediaProxySrc = (rawSrc: string): string => {
  const normalized = normalizeGithubBlobUrl(rawSrc)
  if (!shouldProxyUrlOnLocalhost(normalized)) return normalized
  const origin = getOrigin()
  if (!origin) return normalized
  const src = String(normalized || '').trim()
  const shouldProxy = src.includes('tiles.openfreemap.org/') || src.includes('raw.githubusercontent.com/')
  if (!shouldProxy) return normalized
  return `${MEDIA_PROXY_ENDPOINT}?url=${encodeURIComponent(src)}`
}

export const applyDevCrossOriginProxy = (rawSrc: string): string => {
  const src = String(rawSrc || '').trim()
  if (!src || !shouldProxyUrlOnLocalhost(src)) return src
  const origin = getOrigin()
  if (!origin) return src
  try {
    if (new URL(src, origin).origin === origin) return src
  } catch {
    return src
  }
  return `${MEDIA_PROXY_ENDPOINT}?url=${encodeURIComponent(src)}`
}

export const coerceFetchUrl = (rawUrl: string): string | null => {
  const u = String(rawUrl || '').trim()
  if (!u) return null
  if (u.startsWith('file:')) return null
  const origin = getOrigin()
  if (!origin) return u
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/@fs/')) return `${origin}${u}`
  if (u.startsWith('/')) {
    const looksLikeAbsFs = /^\/[A-Za-z]\//.test(u) || u.startsWith('/Users/') || u.startsWith('/Volumes/')
    if (looksLikeAbsFs) return `${origin}/@fs${encodeURI(u)}`
    return `${origin}${u}`
  }
  return `${origin}/${encodeURI(u)}`
}
