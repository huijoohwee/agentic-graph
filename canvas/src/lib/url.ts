import { applyMediaProxySrc, isLikelyImageUrl as isLikelySharedImageUrl, unwrapUserProvidedText } from 'grph-shared/url'

export * from 'grph-shared/url'

export function isHttpUrl(value: unknown): boolean {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return false
  return /^https?:\/\//i.test(raw)
}

export function normalizeImportUrlInput(value: unknown): string {
  const raw = typeof value === 'string' ? (unwrapUserProvidedText(value) || value.trim()) : ''
  if (!raw || raw.length > 2048) return ''
  if (/^(?:download|import)\s+failed\s*:/i.test(raw)) return ''
  try {
    const url = new URL(raw)
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.toString() : ''
  } catch {
    return ''
  }
}

export function normalizeWorkspaceImportUrlInput(value: unknown): string {
  const raw = typeof value === 'string' ? (unwrapUserProvidedText(value) || value.trim()) : ''
  if (!raw || raw.length > 4096) return ''
  if (/^(?:download|import)\s+failed\s*:/i.test(raw)) return ''
  if (isLikelyAbsoluteFsPath(raw)) return raw
  if (raw.startsWith('/') && !isLikelyAbsoluteFsPath(raw)) return raw
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    if (url.protocol === 'file:' && isLikelyAbsoluteFsPath(url.pathname)) return url.toString()
    return ''
  } catch {
    return ''
  }
}

export function normalizeCodebaseRelPath(relPath: string): string {
  const trimmed = String(relPath || '')
    .trim()
    .replace(/^file:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0]
  if (!trimmed) return ''
  const parts = trimmed.split('/').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] || ''
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return ''
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

export function buildCodebaseFilePath(relPath: string): string {
  const normalized = normalizeCodebaseRelPath(relPath)
  if (!normalized) return '/__codebase_file'
  return `/__codebase_file?path=${encodeURIComponent(normalized)}`
}

export function buildCodebaseAssetPath(relPath: string): string {
  const normalized = normalizeCodebaseRelPath(relPath)
  if (!normalized) return '/__codebase_asset'
  return `/__codebase_asset?path=${encodeURIComponent(normalized)}`
}

export function decodeCodebasePathFromUrl(rawUrl: string): string | null {
  const raw = String(rawUrl || '').trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw, 'https://example.invalid')
    if (parsed.pathname === '/__codebase_file' || parsed.pathname === '/__codebase_asset') {
      const rel = normalizeCodebaseRelPath(parsed.searchParams.get('path') || '')
      return rel || null
    }
  } catch {
    return null
  }
  return null
}

export function isLikelyAbsoluteFsPath(value: unknown): boolean {
  const raw = typeof value === 'string' ? (unwrapUserProvidedText(value) || value.trim()) : ''
  if (!raw.startsWith('/')) return false
  if (raw.startsWith('/@fs/')) return false
  return /^\/(Users|home|private|var|tmp|Volumes)\//.test(raw)
}

function normalizeLocalFsFetchPath(value: unknown): string {
  const raw = typeof value === 'string' ? (unwrapUserProvidedText(value) || value.trim()) : ''
  const candidate = raw.replace(/^file:\/\//i, '').split(/[?#]/)[0] || ''
  return isLikelyAbsoluteFsPath(candidate) ? candidate : ''
}

export function buildLocalFsFetchPath(value: unknown): string | null {
  const raw = normalizeLocalFsFetchPath(value)
  if (!raw) return null
  return `/@fs${encodeURI(raw)}`
}

export function buildLocalFsRangeFetchPath(value: unknown): string | null {
  const raw = normalizeLocalFsFetchPath(value)
  if (!raw) return null
  return `/__agentic_os_local_file?path=${encodeURIComponent(raw)}`
}

export function isYouTubeUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const raw = unwrapUserProvidedText(value) || value.trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    const host = url.hostname.toLowerCase()
    if (host === 'youtu.be' || host === 'www.youtu.be') return true
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) return true
    return false
  } catch {
    return false
  }
}

export function resolveUrlAgainstBase(baseUrl: string | null | undefined, rawUrl: string): string {
  const raw = String(rawUrl || '').trim()
  if (!raw) return ''
  if (/^(data:|blob:|mailto:|tel:|javascript:)/i.test(raw)) return raw
  const base = String(baseUrl || '').trim()
  if (!base) return raw
  try {
    return new URL(raw, base).toString()
  } catch {
    return raw
  }
}

export function shouldUseWebpageAssetPathProxyUrl(absUrl: string): boolean {
  const raw = String(absUrl || '').trim()
  if (!/^https?:\/\//i.test(raw)) return false
  try {
    const u = new URL(raw)
    if (!isLikelySharedImageUrl(u.toString())) return false
    const pathname = u.pathname || ''
    if (/(^|\/)image\/fetch(\/|$)/i.test(pathname)) return true
    return !/\.(png|jpe?g|gif|webp|svg)$/i.test(pathname)
  } catch {
    return false
  }
}

export function buildWebpageAssetPathProxyUrl(absUrl: string): string {
  const raw = String(absUrl || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/__webpage_asset_path/')) return raw
  if (raw.startsWith('/__webpage_asset_proxy?url=')) return raw
  if (!/^https?:\/\//i.test(raw)) return raw
  try {
    const u = new URL(raw)
    const originEnc = encodeURIComponent(u.origin)
    const p = u.pathname || '/'
    const q = u.search || ''
    return `/__webpage_asset_path/${originEnc}${p}${q}`
  } catch {
    return raw
  }
}

export type WebpageProxyScriptPolicy = 'allow' | 'strip'

export function buildWebpageProxyUrl(rawUrl: string, scriptPolicy?: WebpageProxyScriptPolicy | null): string {
  const raw = String(rawUrl || '').trim()
  if (!raw) return '/__webpage_proxy'
  if (raw.startsWith('/__webpage_proxy?')) return raw
  const params = new URLSearchParams({ url: raw })
  if (scriptPolicy === 'allow' || scriptPolicy === 'strip') params.set('agentic_os_script_policy', scriptPolicy)
  return `/__webpage_proxy?${params.toString()}`
}

export function applyImageLikeProxySrc(src: string): string {
  const raw = String(src || '').trim()
  if (!raw) return ''
  if (/^(data:|blob:)/i.test(raw)) return raw
  if (raw.startsWith('/__binary_download_proxy')) return raw
  if (raw.startsWith('/__codebase_asset')) return raw
  if (raw.startsWith('/__codebase_file')) return raw
  if (raw.startsWith('/__webpage_asset_path/')) return raw
  if (raw.startsWith('/__webpage_asset_proxy?url=')) return raw
  if (raw.startsWith('/__media_proxy?url=')) return raw
  const normalized = raw.startsWith('//') ? `https:${raw}` : raw
  return applyMediaProxySrc(normalized)
}
