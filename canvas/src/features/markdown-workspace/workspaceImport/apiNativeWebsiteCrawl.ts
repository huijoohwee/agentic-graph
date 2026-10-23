import { tryFetchApiNativeBrowserSessionMarkdown } from './apiNative'

export type AuthenticatedWebsitePage = { url: string; path: string; title?: string }
export type AuthenticatedWebsiteDiscovery = {
  pages: AuthenticatedWebsitePage[]
  browserSessionId: string
  limited: boolean
}

const MAX_DISCOVERY_PAGES = 500
const MAX_DISCOVERY_MS = 45_000
const MAX_MARKDOWN_SCAN_CHARS = 2_000_000

function extractMarkdownLinkTargets(markdown: string): string[] {
  const source = String(markdown || '').slice(0, MAX_MARKDOWN_SCAN_CHARS)
  const targets: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const value = String(raw || '').trim().replace(/\\([()])/g, '$1')
    if (value && !seen.has(value)) {
      seen.add(value)
      targets.push(value)
    }
  }
  const inline = /!?\[[^\]]{0,2000}\]\(\s*(?:<([^>]+)>|([^\s)]+))/g
  const references = /^\s*\[[^\]]{1,500}\]:\s*<?([^\s>]+)>?/gm
  const anchors = /\bhref\s*=\s*(["'])(.*?)\1/gi
  for (const pattern of [inline, references, anchors]) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source))) add(match[1] || match[2] || '')
  }
  return targets
}

function normalizeSameSiteTarget(raw: string, baseUrl: string, rootUrl: string): string | null {
  try {
    const candidate = new URL(raw, baseUrl)
    const root = new URL(rootUrl)
    if (!['http:', 'https:'].includes(candidate.protocol) || candidate.username || candidate.password) return null
    if (candidate.host.toLowerCase() !== root.host.toLowerCase()) return null
    candidate.hash = ''
    return candidate.href
  } catch {
    return null
  }
}

/** Discover same-site routes from rendered Markdown in an existing authenticated browser session. */
export async function discoverAuthenticatedWebsitePages(args: {
  rootUrl: string
  url: string
  signal?: AbortSignal
}): Promise<AuthenticatedWebsiteDiscovery | null> {
  const rootUrl = normalizeSameSiteTarget(args.rootUrl, args.rootUrl, args.rootUrl)
  const startUrl = normalizeSameSiteTarget(args.url, args.rootUrl, args.rootUrl)
  if (!rootUrl || !startUrl) return null

  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(args.signal?.reason)
  if (args.signal?.aborted) abortFromCaller()
  else args.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const deadline = setTimeout(() => controller.abort(new Error('Authenticated website discovery reached its time limit')), MAX_DISCOVERY_MS)
  const queue = [startUrl]
  const queued = new Set(queue)
  const pages: AuthenticatedWebsitePage[] = []
  let browserSessionId = ''
  let limited = false

  try {
    while (queue.length && pages.length < MAX_DISCOVERY_PAGES) {
      controller.signal.throwIfAborted()
      const url = queue.shift()!
      const captured = await tryFetchApiNativeBrowserSessionMarkdown({
        url,
        mode: 'import',
        viewHint: 'markdown',
        ...(browserSessionId ? { browserSessionId } : {}),
        signal: controller.signal,
      })
      if (!captured?.browserSessionId || !captured.upstreamMarkdown.trim()) {
        if (!pages.length) return null
        limited = true
        break
      }
      if (browserSessionId && captured.browserSessionId !== browserSessionId) {
        limited = true
        break
      }
      browserSessionId = captured.browserSessionId
      const pageUrl = normalizeSameSiteTarget(captured.normalizedUrl || url, rootUrl, rootUrl)
      if (!pageUrl) continue
      pages.push({ url: pageUrl, path: new URL(pageUrl).pathname, ...(captured.title ? { title: captured.title } : {}) })
      for (const target of extractMarkdownLinkTargets(captured.upstreamMarkdown)) {
        const normalized = normalizeSameSiteTarget(target, pageUrl, rootUrl)
        if (!normalized || queued.has(normalized)) continue
        queued.add(normalized)
        queue.push(normalized)
      }
    }
    if (queue.length) limited = true
    return pages.length && browserSessionId ? { pages, browserSessionId, limited } : null
  } catch (error) {
    if (args.signal?.aborted) throw error
    if (!pages.length) return null
    return { pages, browserSessionId, limited: true }
  } finally {
    clearTimeout(deadline)
    args.signal?.removeEventListener('abort', abortFromCaller)
  }
}
