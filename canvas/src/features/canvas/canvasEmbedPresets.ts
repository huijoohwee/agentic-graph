import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import { XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH } from '@/features/workspace-fs/workspaceRunReadyDemos'

export const CANONICAL_STARTUP_DOCUMENT_PATH = XR_PHYSICS_DEMO_PUBLISHED_CANONICAL_PATH
const CANONICAL_STARTUP_SHARE_PATH = `/agenticgraph/share/${encodePublishedDocShareToken({
  canonicalPath: CANONICAL_STARTUP_DOCUMENT_PATH,
})}`
const LOCAL_RUNTIME_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0'])
const CLOUDFLARE_PAGES_RUNTIME_SUFFIX = '.joohwee.pages.dev'

const isSameDeploymentRuntimeHost = (hostname: string): boolean => {
  const normalizedHostname = hostname.toLowerCase()
  return LOCAL_RUNTIME_HOSTS.has(normalizedHostname)
    || normalizedHostname === 'joohwee.pages.dev'
    || normalizedHostname.endsWith(CLOUDFLARE_PAGES_RUNTIME_SUFFIX)
}

export const CANONICAL_STARTUP_CANVAS_EMBED_URL = `https://airvio.co${CANONICAL_STARTUP_SHARE_PATH}`

const applyCanonicalStartupShellIsolation = (url: URL): URL => {
  url.searchParams.set('kgPreview', '1')
  return url
}

export function resolveCanonicalStartupCanvasEmbedRuntimeUrl(runtimeOrigin?: string | null): string {
  const rawOrigin = String(runtimeOrigin || (typeof window !== 'undefined' ? window.location?.origin : '') || '').trim()
  const embed = new URL(CANONICAL_STARTUP_CANVAS_EMBED_URL)
  if (!rawOrigin) return applyCanonicalStartupShellIsolation(embed).toString()
  try {
    const origin = new URL(rawOrigin)
    if (isSameDeploymentRuntimeHost(origin.hostname)) {
      embed.protocol = origin.protocol
      embed.host = origin.host
    }
  } catch {
    // Keep the canonical production origin when the runtime origin is malformed.
  }
  return applyCanonicalStartupShellIsolation(embed).toString()
}

export function normalizeLiveCanvasHeroCanvasEmbedUrl(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const supportedOrigin = url.origin === 'https://airvio.co' || isSameDeploymentRuntimeHost(url.hostname)
    if (!supportedOrigin || url.pathname !== CANONICAL_STARTUP_SHARE_PATH) return raw
    url.searchParams.set('kgPreview', '1')
    url.searchParams.delete('kgLiveHero')
    url.searchParams.delete('kgCanvasSurfaceMode')
    url.searchParams.delete('kgCanvasRenderMode')
    url.searchParams.delete('kgCanvas2dRenderer')
    url.searchParams.delete('openEditorWorkspace')
    const runtimeOrigin = typeof window !== 'undefined' ? String(window.location?.origin || '').trim() : ''
    if (runtimeOrigin) {
      const runtime = new URL(runtimeOrigin)
      if (isSameDeploymentRuntimeHost(runtime.hostname)) {
        url.protocol = runtime.protocol
        url.host = runtime.host
      }
    }
    return url.toString()
  } catch {
    return raw
  }
}
