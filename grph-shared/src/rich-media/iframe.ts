import { isDirectIframeEmbedUrl } from '../url.js'
import { buildYouTubeEmbedUrl } from './providers.js'

export type IframeSandboxMode = 'direct' | 'proxied'

const ALLOW_SANDBOX_DIRECT =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation allow-presentation'
const ALLOW_SANDBOX_PROXIED = 'allow-scripts allow-presentation'

const allowedHostsCache = new Map<string, string[]>()

export function shouldForceSnapshotIframeUrl(rawUrl: string): boolean {
  const u = String(rawUrl || '').trim()
  if (!u) return false
  if (!/^https?:\/\//i.test(u)) return false
  try {
    const parsed = new URL(u)
    const host = String(parsed.hostname || '').toLowerCase()
    if (!host) return false
    if (host === 'reddit.com' || host.endsWith('.reddit.com')) return true
    if (host === 'redd.it' || host.endsWith('.redd.it')) return true
    return false
  } catch {
    return false
  }
}

function parseAllowedHostsCsv(value: string): string[] {
  const raw = String(value || '').trim()
  const cached = allowedHostsCache.get(raw)
  if (cached) return cached
  const out = raw
    .split(/[\s,]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  allowedHostsCache.set(raw, out)
  return out
}

export function buildWebpageProxyUrl(rawUrl: string): string {
  const u = String(rawUrl || '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) return u
  return `/__webpage_proxy?url=${encodeURIComponent(u)}`
}

export function normalizeIframeUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const youtube = buildYouTubeEmbedUrl(raw, { includeOrigin: false })
    if (youtube) return youtube

    const u = new URL(raw)
    const host = u.hostname.toLowerCase()

    if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
      const m = u.pathname.match(/^\/(\d+)(\/|$)/)
      if (m && m[1]) return `https://player.vimeo.com/video/${m[1]}`
    }
  } catch {
    void 0
  }
  return raw
}

export function resolveIframeSandbox(mode: IframeSandboxMode): string {
  return mode === 'direct' ? ALLOW_SANDBOX_DIRECT : ALLOW_SANDBOX_PROXIED
}

export function isSafeIframeUrl(
  rawUrl: string,
  opts?: {
    allowedHostsCsv?: string
    allowYouTube?: boolean
    allowInternalPaths?: boolean
  },
): boolean {
  const allowInternalPaths = opts?.allowInternalPaths !== false
  const allowYouTube = opts?.allowYouTube === true
  const raw = String(rawUrl || '').trim()
  if (!raw) return false
  if (allowInternalPaths) {
    if (raw.startsWith('/__webpage_proxy?url=')) return true
    if (raw.startsWith('/__codebase_asset?path=')) return true
    if (raw.startsWith('/__codebase_file?path=')) return true
  }
  try {
    const u = new URL(raw)
    if (u.username || u.password) return false
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    if (!allowYouTube) {
      if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be')) return false
      if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) return false
    }
    const allowed = parseAllowedHostsCsv(opts?.allowedHostsCsv || '')
    if (allowed.length === 0) return true
    return allowed.some(h => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export function resolveIframeEmbed(args: {
  url: string
  embedMode?: 'auto' | 'direct' | 'proxy'
  scriptPolicy?: 'strip' | 'allow'
}): { iframeSrc: string; sandbox: string; direct: boolean } {
  const raw = String(args.url || '').trim()
  const normalized = normalizeIframeUrl(raw)
  const direct = args.embedMode === 'direct' ? true : args.embedMode === 'proxy' ? false : isDirectIframeEmbedUrl(normalized)
  const effectiveScriptPolicy: 'strip' | 'allow' | '' = (() => {
    const p = args.scriptPolicy === 'allow' ? 'allow' : args.scriptPolicy === 'strip' ? 'strip' : ''
    if (!p) return ''
    try {
      const u = new URL(normalized)
      const host = String(u.hostname || '').toLowerCase()
      if (host === 'aljazeera.com' || host.endsWith('.aljazeera.com')) return 'strip'
    } catch {
      void 0
    }
    return p
  })()
  const iframeSrc = (() => {
    if (direct) return normalized
    const base = buildWebpageProxyUrl(normalized)
    if (!effectiveScriptPolicy) return base
    const joiner = base.includes('?') ? '&' : '?'
    return `${base}${joiner}agentic_os_script_policy=${encodeURIComponent(effectiveScriptPolicy)}`
  })()
  const sandbox = resolveIframeSandbox(direct ? 'direct' : 'proxied')
  return { iframeSrc, sandbox, direct }
}
