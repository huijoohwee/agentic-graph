import { fetchRemoteTextDetailed } from '@/lib/net/fetchRemoteText'
import { describeFetchRemoteTextFailure } from '@/lib/net/fetchRemoteTextFailure'
import { buildRedditJsonUrl, convertRedditListingJsonToMarkdown, toSafeBasename } from './apiNativeReddit'
export { convertRedditListingJsonToMarkdown } from './apiNativeReddit'
import type { JSONValue } from '@/lib/graph/types'
import { isJsonValue } from '@/lib/graph/jsonValue'
import { deriveFilenameFromUrl } from '@/lib/url'
import { fetchWebpageHtmlAuto } from '@/lib/websites/webpageIframeSrcdoc'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL } from 'grph-shared/browser/apiNativeBrowserMcpSsot'
import { looksLowFidelityWebpageMarkdown } from '@/lib/websites/webpageClientConvert'
import { plainTextToMarkdown } from '@/lib/markdown/plainTextToMarkdown'
import { restoreWebpageMarkdownSyntaxFidelity } from '@/lib/markdown/webpageMarkdownSyntaxFidelity'
import { readApiNativeBrowserMarkdownPayload, readApiNativeBrowserResponseSourceUrl, readApiNativeBrowserResponseText } from './apiNativeResponse'
import { shouldAcceptWorkspaceImportSourceContent } from './sourceUrlIdentity'

export type ApiNativeMarkdownResult = {
  normalizedUrl: string
  name: string
  title?: string
  upstreamMarkdown: string
  thinkingMarkdown?: string
  diagnostics?: string
  browserSessionId?: string
}

type TryFetchApiNativeMarkdownArgs = {
  url: string
  mode?: 'import' | 'refresh'
  viewHint?: 'markdown' | 'json' | 'html' | ''
  onProgress?: (percentage: number) => void
  browserSessionId?: string
  signal?: AbortSignal
}

type ApiNativeBrowserSession = {
  id: string
  url?: string
  title?: string
  domain?: string
}

const API_NATIVE_BROWSER_SESSION_TIMEOUT_MS = 3_500
const API_NATIVE_BROWSER_CONTENT_TIMEOUT_MS = 12_000

function extractTitleFromHtml(html: string): string {
  const h = String(html || '')
  const m = h.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  const title = m && m[1] ? String(m[1]).replace(/\s+/g, ' ').trim() : ''
  return title
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!normalized) return false
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true
  return /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

function readApiNativeBrowserRuntimeUrl(): string {
  const fallback = API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : null
    const configured = storage?.getItem(LS_KEYS.apiNativeBrowserMcpRuntimeUrl) || ''
    return String(configured || fallback).trim() || fallback
  } catch {
    return fallback
  }
}

function normalizeApiNativeBrowserRuntimeUrl(rawUrl: string): string | null {
  const candidate = String(rawUrl || '').trim()
  if (!candidate) return null
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!isLoopbackHostname(parsed.hostname)) return null
    parsed.hash = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

function joinApiNativeBrowserRuntimePath(runtimeUrl: string, apiPath: string): string {
  const base = new URL(runtimeUrl)
  const basePath = base.pathname.replace(/\/+$/, '')
  const nextPath = String(apiPath || '').replace(/^\/+/, '')
  base.pathname = `${basePath}/${nextPath}`.replace(/\/{2,}/g, '/')
  return base.toString()
}

async function fetchApiNativeBrowserRuntime(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => {
    try {
      ctrl.abort()
    } catch {
      void 0
    }
  }, timeoutMs)
  const onAbort = () => ctrl.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return await fetchFn(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
  }
}

function readApiNativeBrowserSessions(rawText: string): ApiNativeBrowserSession[] {
  try {
    const parsed = JSON.parse(String(rawText || '')) as unknown
    const list = (() => {
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        if (Array.isArray(record.sessions)) return record.sessions
        if (Array.isArray(record.data)) return record.data
        if (record.data && typeof record.data === 'object' && Array.isArray((record.data as Record<string, unknown>).sessions)) {
          return (record.data as Record<string, unknown>).sessions as unknown[]
        }
      }
      return []
    })()
    return list
      .map((entry): ApiNativeBrowserSession | null => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, unknown>
        const id = [record.id, record.session_id, record.sessionId].find(value => typeof value === 'string' && String(value).trim()) || ''
        if (!id) return null
        const domain = [record.domain, record.host, record.hostname].find(value => typeof value === 'string' && String(value).trim()) || ''
        const url = [record.url, record.href, record.current_url, record.currentUrl].find(value => typeof value === 'string' && String(value).trim()) || ''
        const title = [record.title, record.name].find(value => typeof value === 'string' && String(value).trim()) || ''
        return {
          id: String(id).trim(),
          domain: String(domain || '').trim(),
          url: String(url || '').trim(),
          title: String(title || '').trim(),
        }
      })
      .filter((value): value is ApiNativeBrowserSession => Boolean(value))
  } catch {
    return []
  }
}

function pickApiNativeBrowserSessions(url: string, sessions: ApiNativeBrowserSession[]): ApiNativeBrowserSession[] {
  let hostname = ''
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return []
  }
  const scoreSession = (session: ApiNativeBrowserSession): number => {
    const domain = String(session.domain || '').trim().toLowerCase()
    const currentUrl = String(session.url || '').trim().toLowerCase()
    if (currentUrl === String(url || '').trim().toLowerCase()) return 5
    if (currentUrl && hostname && currentUrl.includes(hostname)) return 4
    if (domain && hostname && (domain === hostname || hostname.endsWith(`.${domain}`) || domain.endsWith(`.${hostname}`))) return 3
    return 0
  }
  return sessions.map(session => ({ session, score: scoreSession(session) })).filter(item => item.score > 0 && item.session.id).sort((a, b) => b.score - a.score).map(item => item.session)
}

export async function tryFetchApiNativeBrowserSessionMarkdown(args: TryFetchApiNativeMarkdownArgs): Promise<ApiNativeMarkdownResult | null> {
  const normalizedRuntimeUrl = normalizeApiNativeBrowserRuntimeUrl(readApiNativeBrowserRuntimeUrl())
  if (!normalizedRuntimeUrl) return null
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch
  if (typeof fetchFn !== 'function') return null
  try {
    const sessionsRes = await fetchApiNativeBrowserRuntime(fetchFn, joinApiNativeBrowserRuntimePath(normalizedRuntimeUrl, '/v1/sessions'), {
      method: 'GET',
      headers: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' },
    }, API_NATIVE_BROWSER_SESSION_TIMEOUT_MS, args.signal)
    if (!sessionsRes.ok) return null
    const availableSessions = readApiNativeBrowserSessions(await sessionsRes.text())
    const matchingSessions = args.browserSessionId
      ? availableSessions.filter(session => session.id === args.browserSessionId)
      : availableSessions
    const sessions = pickApiNativeBrowserSessions(args.url, matchingSessions)
    if (sessions.length === 0) return null

    for (const session of sessions) {
      args.signal?.throwIfAborted()
      const sessionId = session.id
      const markdownRes = await fetchApiNativeBrowserRuntime(fetchFn, joinApiNativeBrowserRuntimePath(normalizedRuntimeUrl, '/v1/browser/markdown'), {
        method: 'POST',
        headers: {
          Accept: 'application/json,text/markdown,text/plain;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: args.url,
          session_id: sessionId,
          dry_run: true,
          confirm_unsafe: false,
          confirm_third_party_terms: false,
          confirm_cookie_import: false,
        }),
      }, API_NATIVE_BROWSER_CONTENT_TIMEOUT_MS, args.signal)
      if (!markdownRes.ok) continue
      const markdownPayload = readApiNativeBrowserMarkdownPayload(await markdownRes.text())
      if (!shouldAcceptWorkspaceImportSourceContent(args.url, markdownPayload.sourceUrl, session.url)) continue
      const markdownText = markdownPayload.markdown
      if (markdownText && !looksLowFidelityWebpageMarkdown(markdownText)) {
        return {
          normalizedUrl: args.url,
          name: deriveFilenameFromUrl(args.url, 'webpage.md'),
          ...(markdownPayload.title || session.title ? { title: markdownPayload.title || session.title } : {}),
          upstreamMarkdown: restoreWebpageMarkdownSyntaxFidelity(markdownText),
          ...(markdownPayload.thinkingMarkdown ? { thinkingMarkdown: restoreWebpageMarkdownSyntaxFidelity(markdownPayload.thinkingMarkdown) } : {}),
          diagnostics: `api-native-browser-session:${sessionId}`,
          browserSessionId: sessionId,
        }
      }

      const textRes = await fetchApiNativeBrowserRuntime(fetchFn, joinApiNativeBrowserRuntimePath(normalizedRuntimeUrl, '/v1/browser/text'), {
        method: 'POST',
        headers: {
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: args.url,
          session_id: sessionId,
          dry_run: true,
          confirm_unsafe: false,
          confirm_third_party_terms: false,
          confirm_cookie_import: false,
        }),
      }, API_NATIVE_BROWSER_CONTENT_TIMEOUT_MS, args.signal)
      if (!textRes.ok) continue
      const textRaw = await textRes.text()
      if (!shouldAcceptWorkspaceImportSourceContent(args.url, readApiNativeBrowserResponseSourceUrl(textRaw), session.url)) continue
      const textBody = readApiNativeBrowserResponseText(textRaw)
      if (!textBody || textBody.length < 220) continue
      const plainMarkdown = restoreWebpageMarkdownSyntaxFidelity(plainTextToMarkdown(textBody))
      if (!looksLowFidelityWebpageMarkdown(plainMarkdown)) {
        return { normalizedUrl: args.url, name: deriveFilenameFromUrl(args.url, 'webpage.md'), ...(session.title ? { title: session.title } : {}), upstreamMarkdown: plainMarkdown, diagnostics: `api-native-browser-session:${sessionId}:text`, browserSessionId: sessionId }
      }
    }
  } catch {
    return null
  }
  return null
}

export function extractJsonLdFromHtmlText(html: string, opts?: { maxScripts?: number; maxCharsPerScript?: number }): JSONValue[] {
  const srcRaw = String(html || '')
  const src = srcRaw.length > 1_500_000 ? srcRaw.slice(0, 1_500_000) : srcRaw
  if (!src.trim()) return []

  const maxScripts = Number.isFinite(opts?.maxScripts) ? Math.max(0, Math.floor(opts!.maxScripts as number)) : 12
  const maxCharsPerScript = Number.isFinite(opts?.maxCharsPerScript)
    ? Math.max(1_000, Math.floor(opts!.maxCharsPerScript as number))
    : 220_000

  const out: JSONValue[] = []
  const re = /<script\b[^>]*type\s*=\s*(["'])application\/(?:ld\+json)\1[^>]*>([\s\S]*?)<\/script\s*>/gi
  let match: RegExpExecArray | null
  let seen = 0
  while ((match = re.exec(src))) {
    if (seen >= maxScripts) break
    seen += 1
    let raw = match[2] ? String(match[2]) : ''
    raw = raw.replace(/^\s*<!--/, '').replace(/-->\s*$/g, '').trim()
    if (!raw) continue
    if (raw.length > maxCharsPerScript) raw = raw.slice(0, maxCharsPerScript)

    try {
      const parsed = JSON.parse(raw) as unknown
      if (!isJsonValue(parsed)) continue
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!isJsonValue(item)) continue
          out.push(item)
        }
      } else {
        out.push(parsed)
      }
    } catch {
      void 0
    }
    if (out.length >= 30) break
  }
  return out
}

function pickTitleFromJsonLd(items: JSONValue[]): string {
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const obj = item as Record<string, JSONValue>
    const candidates = [obj.headline, obj.name, obj.title]
    for (const v of candidates) {
      if (typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

export function buildJsonLdMarkdown(args: { url: string; htmlTitle?: string; jsonLd: JSONValue[]; maxJsonChars?: number }): string {
  const url = String(args.url || '').trim()
  const title = pickTitleFromJsonLd(args.jsonLd) || String(args.htmlTitle || '').replace(/\s+/g, ' ').trim() || 'Webpage'
  const maxJsonChars = Number.isFinite(args.maxJsonChars) ? Math.max(40_000, Math.floor(args.maxJsonChars as number)) : 260_000

  const jsonText = (() => {
    const payload: JSONValue = args.jsonLd.length === 1 ? args.jsonLd[0] : args.jsonLd
    const pretty = JSON.stringify(payload, null, 2)
    if (pretty.length <= maxJsonChars) return pretty
    return `${pretty.slice(0, maxJsonChars)}\n\n…(clipped ${pretty.length - maxJsonChars} chars)…`
  })()

  return [`# ${title}`, '', url ? `[](${url})` : '', '', '```json', jsonText, '```', ''].filter(Boolean).join('\n')
}

export async function tryFetchApiNativeMarkdown(args: TryFetchApiNativeMarkdownArgs): Promise<ApiNativeMarkdownResult | null> {
  const url = String(args.url || '').trim()
  if (!url) return null

  const mode: 'import' | 'refresh' = args.mode === 'refresh' ? 'refresh' : 'import'
  const viewHint = args.viewHint === 'json' ? 'json' : args.viewHint === 'markdown' ? 'markdown' : args.viewHint === 'html' ? 'html' : ''

  if (mode === 'import' && viewHint === 'markdown') {
    const browserSessionMarkdown = await tryFetchApiNativeBrowserSessionMarkdown(args)
    if (browserSessionMarkdown) return browserSessionMarkdown
  }

  const reddit = buildRedditJsonUrl(url)
  if (reddit) {
    args.onProgress?.(12)
    const res = await fetchRemoteTextDetailed(reddit.jsonUrl, {
      timeoutMs: 12_000,
      maxBytes: 6_000_000,
      preferProxy: true,
      headers: { Accept: 'application/json,*/*' },
    })
    args.onProgress?.(55)
    if (!res.ok) {
      return {
        normalizedUrl: reddit.canonicalUrl,
        name: deriveFilenameFromUrl(reddit.canonicalUrl, 'reddit.md'),
        upstreamMarkdown: `[](${reddit.canonicalUrl})\n\nReddit import failed: ${describeFetchRemoteTextFailure(res as any)}\n`,
        diagnostics: describeFetchRemoteTextFailure(res as any),
      }
    }

    const converted = convertRedditListingJsonToMarkdown({ jsonText: res.text, sourceUrl: reddit.canonicalUrl })
    if (converted.ok === false) {
      return {
        normalizedUrl: reddit.canonicalUrl,
        name: deriveFilenameFromUrl(reddit.canonicalUrl, 'reddit.md'),
        upstreamMarkdown: `[](${reddit.canonicalUrl})\n\nReddit JSON parse failed: ${converted.error}\n`,
        diagnostics: converted.error,
      }
    }

    const base = converted.title ? `${toSafeBasename(converted.title)}.md` : deriveFilenameFromUrl(reddit.canonicalUrl, 'reddit.md')
    args.onProgress?.(100)
    return {
      normalizedUrl: reddit.canonicalUrl,
      name: base,
      upstreamMarkdown: converted.markdown,
    }
  }

  if (viewHint === 'json') {
    const ctrl = new AbortController()
    const abortFromCaller = () => ctrl.abort(args.signal?.reason)
    if (args.signal?.aborted) abortFromCaller()
    else args.signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timeoutMs = mode === 'refresh' ? 12_000 : 5_000
    const timeoutId =
      timeoutMs > 0
        ? (setTimeout(() => {
            try {
              ctrl.abort()
            } catch {
              void 0
            }
          }, timeoutMs) as unknown as number)
        : 0
    try {
      args.onProgress?.(10)
      args.signal?.throwIfAborted()
      const html = await fetchWebpageHtmlAuto({ url, signal: ctrl.signal, bypassCache: false })
      args.signal?.throwIfAborted()
      args.onProgress?.(55)
      const jsonLd = extractJsonLdFromHtmlText(html)
      if (jsonLd.length > 0) {
        const htmlTitle = extractTitleFromHtml(html)
        const upstreamMarkdown = buildJsonLdMarkdown({ url, htmlTitle, jsonLd })
        const baseName = toSafeBasename(pickTitleFromJsonLd(jsonLd) || htmlTitle || deriveFilenameFromUrl(url, 'webpage'))
        args.onProgress?.(100)
        return { normalizedUrl: url, name: `${baseName}.md`, upstreamMarkdown }
      }
    } catch {
      void 0
    } finally {
      try {
        if (timeoutId) clearTimeout(timeoutId)
      } catch {
        void 0
      }
      args.signal?.removeEventListener('abort', abortFromCaller)
      try {
        ctrl.abort()
      } catch {
        void 0
      }
    }
  }

  return null
}
