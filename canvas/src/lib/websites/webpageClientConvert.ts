import { exportWebpageDomViaHiddenIframe } from './webpageDomExport'
import { looksLikeWebpageShellText } from './webpageShellHeuristics'
import { plainTextToMarkdown } from '@/lib/markdown/plainTextToMarkdown'
import { convertHtmlToMarkdownUnified } from '@/lib/markdown/htmlToMarkdownUnified'
import { postprocessWebpageMarkdownSsot } from '@/lib/markdown/webpageMarkdownPostprocess'
import { shouldSkipUnifiedMarkdownConversion } from './webpageMarkdownConversionBudget'

export type WebpageClientConvertResult =
  | { ok: true; markdown: string; title: string }
  | { ok: false; error: string }

export const looksSyntheticWebpageArtifactMarkdown = (markdown: string): boolean => {
  const s = String(markdown || '')
  if (!s.trim()) return false
  if (/\n###\s+Icons\s*\n/i.test(s)) return true
  if (/##\s+📋\s*TABLE OF CONTENTS/i.test(s)) return true
  if (/##\s+🗂️\s*ASSET CATALOG/i.test(s)) return true
  if (/\bFidelity Level:\s*100% Source-Faithful\b/i.test(s)) return true
  return false
}

export const looksLowFidelityWebpageMarkdown = (markdown: string): boolean =>
  looksSyntheticWebpageArtifactMarkdown(markdown) || looksLikeWebpageShellText(markdown)

type WebpageDomExportFn = typeof exportWebpageDomViaHiddenIframe

let webpageClientConvertDomExportOverride: WebpageDomExportFn | null = null
let webpageClientConvertJsdomLikeOverride: boolean | null = null

const readWebpageClientConvertDomExport = (): WebpageDomExportFn =>
  webpageClientConvertDomExportOverride || exportWebpageDomViaHiddenIframe

export function setWebpageClientConvertDomExportForTests(fn: WebpageDomExportFn | null): void {
  webpageClientConvertDomExportOverride = fn
}

export function setWebpageClientConvertJsdomLikeForTests(value: boolean | null): void {
  webpageClientConvertJsdomLikeOverride = typeof value === 'boolean' ? value : null
}

const decodeHtmlEntitiesBasic = (text: string): string => {
  const src = String(text || '')
  if (!src.includes('&')) return src
  return src
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

const htmlFallbackToMarkdownAllText = (html: string): string => {
  const src = String(html || '').replace(/\r/g, '')
  const stripTags = (s: string) =>
    decodeHtmlEntitiesBasic(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

  let out = src
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, '')
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner) => `\n# ${stripTags(String(inner || ''))}\n`)
  out = out.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner) => `\n## ${stripTags(String(inner || ''))}\n`)
  out = out.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, inner) => `\n### ${stripTags(String(inner || ''))}\n`)
  out = out.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => `\n\n${stripTags(String(inner || ''))}\n\n`)
  out = decodeHtmlEntitiesBasic(out.replace(/<[^>]+>/g, ''))
  out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return out
}

const isJsdomLike = (): boolean => {
  if (typeof webpageClientConvertJsdomLikeOverride === 'boolean') return webpageClientConvertJsdomLikeOverride
  try {
    const p = (globalThis as unknown as { process?: unknown }).process as { versions?: { node?: unknown } } | undefined
    if (p && p.versions && p.versions.node) return true
  } catch {
    void 0
  }
  try {
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : ''
    if (ua && /jsdom/i.test(ua)) return true
  } catch {
    void 0
  }
  return false
}

const extractTitleFromHtml = (html: string): string => {
  const raw = String(html || '')
  const m = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
  const t = m ? String(m[1] || '') : ''
  return t.replace(/\s+/g, ' ').trim()
}

export const convertWebpageUrlToMarkdownViaProxyFetch = async (url: string): Promise<WebpageClientConvertResult> => {
  try {
    const res = await fetch(`/__webpage_proxy?url=${encodeURIComponent(url)}&agentic_os_script_policy=strip`, { headers: { Accept: 'text/html,*/*;q=0.9' } })
    const html = await res.text()
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const title = extractTitleFromHtml(html)
    const bounded = html.length > 8_000_000 ? html.slice(0, 8_000_000) : html
    const auto = (() => {
      const h = bounded
      const isSubstackLike = /substackcdn\.com/i.test(h) || /\bdata-page\s*=\s*["'][^"']+/i.test(h)
      const includeImages = isSubstackLike ? true : h.length <= 6_000_000
      const fidelityLevel: 1 | 2 | 3 | 4 = isSubstackLike ? 4 : h.length > 5_000_000 ? 2 : 4
      return { includeImages, fidelityLevel }
    })()
    if (!shouldSkipUnifiedMarkdownConversion(bounded)) {
      try {
        const converted = await convertHtmlToMarkdownUnified({
          html: bounded,
          baseUrl: url,
          maxInputChars: 8_000_000,
          includeImages: auto.includeImages,
          fidelityLevel: auto.fidelityLevel,
          includeHeadSection: false,
        })
        if (converted.ok === true && converted.markdown.trim()) {
          const processed = postprocessWebpageMarkdownSsot(converted.markdown)
          if (processed.trim()) return { ok: true, markdown: processed.trim(), title }
        }
      } catch {
        void 0
      }
    }
    const fallbackMd = htmlFallbackToMarkdownAllText(bounded)
    if (fallbackMd.trim()) return { ok: true, markdown: fallbackMd.trim(), title }
    return { ok: false, error: 'No convertible content extracted' }
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
    return { ok: false, error: msg || 'Fetch failed' }
  }
}

export async function convertWebpageUrlToMarkdownViaBrowser(args: {
  url: string
}): Promise<WebpageClientConvertResult> {
  const url = String(args.url || '').trim()
  if (!url) return { ok: false, error: 'Missing url' }
  if (isJsdomLike()) {
    return await convertWebpageUrlToMarkdownViaProxyFetch(url)
  }
  try {
    const fast = await convertWebpageUrlToMarkdownViaProxyFetch(url)
    if (fast.ok === true && String(fast.markdown || '').trim().length >= 1400 && !looksLowFidelityWebpageMarkdown(fast.markdown)) {
      return fast
    }

    const exportDom = readWebpageClientConvertDomExport()
    const htmlRes = await exportDom({
      url,
      mode: 'html',
      scrollCrawl: true,
      expandFaq: true,
      timeoutMs: 35_000,
      maxChars: 12_000_000,
      minWaitAfterLoadMs: 650,
    })
    const title = String(htmlRes?.title || '').trim()
    const html = htmlRes && !htmlRes.clipped ? String(htmlRes.text || '').trim() : ''

    if (html) {
      const bounded = html.length > 8_000_000 ? html.slice(0, 8_000_000) : html
      const auto = (() => {
        const h = bounded
        const isSubstackLike = /substackcdn\.com/i.test(h) || /\bdata-page\s*=\s*["'][^"']+/i.test(h)
        const includeImages = isSubstackLike ? true : h.length <= 6_000_000
        const fidelityLevel: 1 | 2 | 3 | 4 = isSubstackLike ? 4 : h.length > 5_000_000 ? 2 : 4
        return { includeImages, fidelityLevel }
      })()
      try {
        const converted = await convertHtmlToMarkdownUnified({
          html: bounded,
          baseUrl: url,
          maxInputChars: 8_000_000,
          includeImages: auto.includeImages,
          fidelityLevel: auto.fidelityLevel,
          includeHeadSection: false,
        })
        if (converted.ok === true && converted.markdown.trim()) {
          const processed = postprocessWebpageMarkdownSsot(converted.markdown)
          if (processed.trim() && !looksLowFidelityWebpageMarkdown(processed)) return { ok: true, markdown: processed.trim(), title }
        }
      } catch {
        void 0
      }
      const fallbackMd = htmlFallbackToMarkdownAllText(bounded)
      if (fallbackMd.trim() && !looksLowFidelityWebpageMarkdown(fallbackMd)) return { ok: true, markdown: fallbackMd.trim(), title }
    }

    const textRes = await exportDom({
      url,
      mode: 'text',
      scrollCrawl: true,
      expandFaq: true,
      timeoutMs: 35_000,
      maxChars: 12_000_000,
      minWaitAfterLoadMs: 650,
    })
    const textTitle = String(textRes?.title || '').trim()
    const text = String(textRes?.text || '').trim()
    const resolvedTitle = String(title || textTitle || '').trim()
    if (!html && !text) {
      const fallback = await convertWebpageUrlToMarkdownViaProxyFetch(url)
      if (fallback.ok === true && !looksLowFidelityWebpageMarkdown(fallback.markdown)) return fallback
      return { ok: false, error: 'No DOM content extracted' }
    }
    if (text && !looksLikeWebpageShellText(text)) return { ok: true, markdown: plainTextToMarkdown(text, resolvedTitle || undefined), title: resolvedTitle }
    const fallback = await convertWebpageUrlToMarkdownViaProxyFetch(url)
    if (fallback.ok === true && !looksLowFidelityWebpageMarkdown(fallback.markdown)) return fallback
    return { ok: false, error: 'No DOM content extracted' }
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
    if (msg) {
      const fallback = await convertWebpageUrlToMarkdownViaProxyFetch(url)
      if (fallback.ok === true && !looksLowFidelityWebpageMarkdown(fallback.markdown)) return fallback
    }
    return { ok: false, error: msg || 'Browser conversion failed' }
  }
}
