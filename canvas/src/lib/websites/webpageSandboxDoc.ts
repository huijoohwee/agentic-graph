import { buildWebpageAssetPathProxyUrl, shouldUseWebpageAssetPathProxyUrl } from '../url'
import { pickFirstSrcsetUrl } from 'grph-shared/markdown/mediaHtml'

export type WebpageSandboxScriptPolicy = 'strip' | 'allow'

export type WebpageSandboxBuildResult = {
  html: string
  scriptPolicy: WebpageSandboxScriptPolicy
  tooLargeForSrcdoc: boolean
}

const revealHiddenContentRoots = (html: string): string => {
  const raw = String(html || '')
  if (!/\b(?:id|class)\s*=\s*("|')[^"']*(?:js_content|rich_media_content)[^"']*\1/i.test(raw)) return raw
  const stripHiddenInlineStyle = (s: string): string => {
    const input = String(s || '')
    if (!/(?:js_content|rich_media_content)/i.test(input) || !/style\s*=/.test(input)) return input
    return input.replace(/(<[^>]+\b(?:id|class)\s*=\s*("|')[^"']*(?:js_content|rich_media_content)[^"']*\2[^>]*\bstyle\s*=\s*("|'))([^"']*)(\3)/gi, (_m, head: string, _q1: string, q: string, styleValue: string, tail: string) => {
      let next = String(styleValue || '')
      next = next.replace(/\bvisibility\s*:\s*hidden\s*;?/gi, '')
      next = next.replace(/\bopacity\s*:\s*0\s*;?/gi, '')
      next = next.replace(/\bdisplay\s*:\s*none\s*;?/gi, '')
      next = next.replace(/\s{2,}/g, ' ').trim()
      return `${head}${next}${tail}`
    })
  }
  const cleaned = stripHiddenInlineStyle(raw)
  const css = [
    '#js_content{visibility:visible !important;opacity:1 !important;}',
    '.rich_media_content{visibility:visible !important;opacity:1 !important;}',
    '.rich_media_content *{visibility:visible !important;}',
    '.rich_media_content img{visibility:visible !important;opacity:1 !important;}',
    'img{visibility:visible !important;opacity:1 !important;}',
    'img{max-width:100% !important;height:auto !important;}',
    'body{opacity:1 !important;}',
  ].join('')
  const styleTag = `<style data-kg-content-unhide="1">${css}</style>`
  const lower = cleaned.toLowerCase()
  const headClose = lower.indexOf('</head>')
  if (headClose >= 0) return `${cleaned.slice(0, headClose)}\n${styleTag}\n${cleaned.slice(headClose)}`
  const headOpen = lower.indexOf('<head')
  if (headOpen >= 0) {
    const headEnd = lower.indexOf('>', headOpen)
    if (headEnd >= 0) return `${cleaned.slice(0, headEnd + 1)}\n${styleTag}\n${cleaned.slice(headEnd + 1)}`
  }
  const htmlOpen = lower.indexOf('<html')
  if (htmlOpen >= 0) {
    const htmlEnd = lower.indexOf('>', htmlOpen)
    if (htmlEnd >= 0) return `${cleaned.slice(0, htmlEnd + 1)}\n<head>\n${styleTag}\n</head>\n${cleaned.slice(htmlEnd + 1)}`
  }
  return `<!doctype html><html><head>${styleTag}</head><body>${cleaned}</body></html>`
}

const hash32 = (s: string): string => {
  const str = String(s || '')
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

const escapeHtml = (raw: string): string =>
  String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const stripWebpageCspMeta = (html: string): string => {
  const raw = String(html || '')
  if (!/content-security-policy/i.test(raw)) return raw
  return raw.replace(/<meta\s+[^>]*http-equiv\s*=\s*("|')?content-security-policy\1?[^>]*>/gi, '')
}

export const stripWebpageRefreshMeta = (html: string): string => {
  const raw = String(html || '')
  if (!/http-equiv/i.test(raw)) return raw
  return raw.replace(/<meta\s+[^>]*http-equiv\s*=\s*("|')?refresh\1?[^>]*>/gi, '')
}

export const stripWebpageScriptTags = (html: string): string => {
  const raw = String(html || '')
  if (!/<script\b/i.test(raw)) return raw
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
}

export const stripWebpageInlineEventHandlers = (html: string): string => {
  const raw = String(html || '')
  if (!/\son[a-z]+\s*=/.test(raw)) return raw
  return raw.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

const normalizeInlineUrl = (value: string): string => {
  let s = String(value || '').trim()
  if (!s) return ''
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/\\&/g, '&')
  if (s.startsWith('//')) s = `https:${s}`
  s = s.replace(/https?:\/\/[^\s/]+(\/__(?:webpage_proxy|webpage_asset_path|webpage_asset_proxy|fetch_remote)\b[^\s"'<>)]*)/gi, '$1')
  return s
}

const readRuntimeOrigin = (): string => {
  try {
    return typeof window !== 'undefined' && window.location && typeof window.location.origin === 'string' ? window.location.origin : ''
  } catch {
    return ''
  }
}

const absolutizeLocalProxyPaths = (html: string, origin: string): string => {
  const raw = String(html || '')
  const o = String(origin || '').trim().replace(/\/+$/, '')
  if (!o) return raw
  if (!/\/__\w/.test(raw)) return raw

  const prefix = (path: string): string => `${o}${path}`
  const localProxyPathRe = /\/(__(?:webpage_proxy|webpage_asset_path|webpage_asset_proxy|fetch_remote)\b[^\s"'<>)]*)/gi

  let next = raw
  next = next.replace(/\b(src|href)\s*=\s*("|')\s*\/(__(?:webpage_proxy|webpage_asset_path|webpage_asset_proxy|fetch_remote)\b[^"']*)\2/gi, (_m, a: string, q: string, rest: string) => {
    return `${a}=${q}${prefix(`/${rest}`)}${q}`
  })
  next = next.replace(/\b(srcset|data-srcset)\s*=\s*("|')([\s\S]*?)\2/gi, (_m, a: string, q: string, v: string) => {
    const patched = String(v || '').replace(localProxyPathRe, (_mm, p1: string) => prefix(`/${p1}`))
    return `${a}=${q}${patched}${q}`
  })
  next = next.replace(/url\(\s*\/(__(?:webpage_proxy|webpage_asset_path|webpage_asset_proxy|fetch_remote)\b[^\s)]*)\s*\)/gi, (_m, rest: string) => {
    return `url(${prefix(`/${rest}`)})`
  })
  return next
}

const proxyAssetPathImages = (html: string): string => {
  const raw = String(html || '')
  if (!/<img\b/i.test(raw)) return raw
  return raw.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)
    const srcValue = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? '') : ''
    const normalizedSrc = normalizeInlineUrl(srcValue)
    if (!normalizedSrc || !shouldUseWebpageAssetPathProxyUrl(normalizedSrc)) return tag
    const proxied = buildWebpageAssetPathProxyUrl(normalizedSrc)
    if (!proxied) return tag
    const injected = `src="${escapeHtml(proxied)}"`
    return srcMatch ? tag.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*')/i, injected) : tag
  })
}

const buildWebpageAssetProxyUrl = (absUrl: string): string => {
  const raw = String(absUrl || '').trim()
  if (!raw) return ''
  if (raw.startsWith('/__webpage_asset_proxy?url=')) return raw
  if (!/^https?:\/\//i.test(raw)) return raw
  return `/__webpage_asset_proxy?url=${encodeURIComponent(raw)}`
}

const proxyAllRemoteImages = (html: string): string => {
  const raw = String(html || '')
  if (!/<img\b/i.test(raw)) return raw
  return raw.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)
    const srcValue = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? '') : ''
    const normalizedSrc = normalizeInlineUrl(srcValue)
    if (!/^https?:\/\//i.test(normalizedSrc)) return tag
    const proxied = shouldUseWebpageAssetPathProxyUrl(normalizedSrc)
      ? buildWebpageAssetPathProxyUrl(normalizedSrc)
      : buildWebpageAssetProxyUrl(normalizedSrc)
    if (!proxied) return tag
    const injected = `src="${escapeHtml(proxied)}"`
    return srcMatch ? tag.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*')/i, injected) : tag
  })
}

const promoteLazyLoadedImages = (html: string): string => {
  const raw = String(html || '')
  if (!/<img\b/i.test(raw)) return raw
  if (!/\bdata-(src|original|actualsrc|srcset)\s*=\s*("|')/i.test(raw) && !/\bsrcset\s*=\s*("|')/i.test(raw)) return raw

  const isSafeSrc = (v: string): boolean => {
    const s = normalizeInlineUrl(v)
    if (!s) return false
    if (/^https?:\/\//i.test(s)) return true
    if (/^\/__webpage_asset_proxy\?url=/i.test(s)) return true
    if (/^\/__webpage_asset_path\//i.test(s)) return true
    if (/^\/__fetch_remote\?url=/i.test(s)) return true
    return false
  }

  return raw.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)
    const srcValue = srcMatch ? (srcMatch[2] ?? srcMatch[3] ?? '') : ''
    const hasUsableSrc = !!srcValue && !/^data:/i.test(srcValue)
    if (hasUsableSrc) return tag

    const dataSrcMatch = /\bdata-(src|original|actualsrc)\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)
    const dataSrcValue = dataSrcMatch ? (dataSrcMatch[3] ?? dataSrcMatch[4] ?? '') : ''
    const dataSrcsetMatch = /\bdata-srcset\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)
    const dataSrcsetValue = dataSrcsetMatch ? (dataSrcsetMatch[2] ?? dataSrcsetMatch[3] ?? '') : ''
    const srcsetMatch = /\bsrcset\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag)
    const srcsetValue = srcsetMatch ? (srcsetMatch[2] ?? srcsetMatch[3] ?? '') : ''

    const candidateRaw = dataSrcValue || pickFirstSrcsetUrl(dataSrcsetValue) || pickFirstSrcsetUrl(srcsetValue)
    const normalizedCandidate = normalizeInlineUrl(candidateRaw)
    if (!isSafeSrc(normalizedCandidate)) return tag

    const promoted = shouldUseWebpageAssetPathProxyUrl(normalizedCandidate)
      ? buildWebpageAssetPathProxyUrl(normalizedCandidate)
      : normalizedCandidate

    const injected = `src="${escapeHtml(promoted)}"`
    if (srcMatch) {
      return tag.replace(/\bsrc\s*=\s*("[^"]*"|'[^']*')/i, injected)
    }
    return tag.replace(/<img\b/i, `<img ${injected}`)
  })
}

const upsertSandboxCspMeta = (html: string, csp: string): string => {
  const raw = String(html || '')
  const content = String(csp || '').trim()
  if (!content) return raw
  const injection = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(content)}">`
  if (/http-equiv\s*=\s*("|')?content-security-policy\1?/i.test(raw)) {
    return raw.replace(/<meta\s+[^>]*http-equiv\s*=\s*("|')?content-security-policy\1?[^>]*>/i, injection)
  }
  const headMatch = /<head\b[^>]*>/i.exec(raw)
  if (headMatch && typeof headMatch.index === 'number') {
    const end = headMatch.index + headMatch[0].length
    return `${raw.slice(0, end)}\n${injection}\n${raw.slice(end)}`
  }
  const htmlMatch = /<html\b[^>]*>/i.exec(raw)
  if (htmlMatch && typeof htmlMatch.index === 'number') {
    const end = htmlMatch.index + htmlMatch[0].length
    return `${raw.slice(0, end)}\n<head>\n${injection}\n</head>\n${raw.slice(end)}`
  }
  return `<!doctype html><html><head>\n${injection}\n</head><body>\n${raw}\n</body></html>`
}

const upsertBaseTag = (html: string, baseHref: string): string => {
  const raw = String(html || '')
  const href = String(baseHref || '').trim()
  if (!href) return raw
  const injection = `<base href="${escapeHtml(href)}">`
  if (/<\s*base\b/i.test(raw)) {
    return raw.replace(/<\s*base\b[^>]*>/i, injection)
  }
  const headMatch = /<head\b[^>]*>/i.exec(raw)
  if (headMatch && typeof headMatch.index === 'number') {
    const end = headMatch.index + headMatch[0].length
    return `${raw.slice(0, end)}\n${injection}\n${raw.slice(end)}`
  }
  const htmlMatch = /<html\b[^>]*>/i.exec(raw)
  if (htmlMatch && typeof htmlMatch.index === 'number') {
    const end = htmlMatch.index + htmlMatch[0].length
    return `${raw.slice(0, end)}\n<head>\n${injection}\n</head>\n${raw.slice(end)}`
  }
  return `<!doctype html><html><head>\n${injection}\n</head><body>\n${raw}\n</body></html>`
}

const SCROLL_SYNC_SCRIPT = (() => {
  const lines = [
    '<script>',
    '(function(){',
    '  var AG_SCROLL_SYNC_KIND = "kg-scroll-sync";',
    '  var lockOwner = null;',
    '  var lockUntil = 0;',
    '  var now = function(){ return Date.now ? Date.now() : +new Date(); };',
    '  var canSync = function(owner){',
    '    var t = now();',
    '    if (!lockOwner || t > lockUntil) { lockOwner = null; lockUntil = 0; return true; }',
    '    return lockOwner === owner;',
    '  };',
    '  var getScrollEl = function(){ return document.scrollingElement || document.documentElement || document.body; };',
    '  var clamp01 = function(n){ return n <= 0 ? 0 : n >= 1 ? 1 : 1 * n; };',
    '  var getRatio = function(){',
    '    var el = getScrollEl();',
    '    if (!el) return 0;',
    '    var max = Math.max(1, el.scrollHeight - el.clientHeight);',
    '    return clamp01(el.scrollTop / max);',
    '  };',
    '  var setRatio = function(r){',
    '    var el = getScrollEl();',
    '    if (!el) return;',
    '    var max = Math.max(0, el.scrollHeight - el.clientHeight);',
    '    el.scrollTop = Math.round(clamp01(r) * max);',
    '  };',
    '  var postRatio = function(){',
    '    try { window.parent && window.parent.postMessage({ kind: AG_SCROLL_SYNC_KIND, ratio: getRatio() }, "*"); } catch { void 0; }',
    '  };',
    '  var onScroll = function(){',
    '    if (!canSync("iframe")) return;',
    '    lockOwner = "iframe"; lockUntil = now() + 160;',
    '    postRatio();',
    '  };',
    '  try {',
    '    var el = getScrollEl();',
    '    if (el && el.addEventListener) el.addEventListener("scroll", onScroll, { passive: true });',
    '    window.addEventListener("message", function(e){',
    '      var d = e && e.data;',
    '      if (!d || d.kind !== AG_SCROLL_SYNC_KIND || typeof d.ratio !== "number") return;',
    '      if (!canSync("parent")) return;',
    '      lockOwner = "parent"; lockUntil = now() + 160;',
    '      setRatio(d.ratio);',
    '    });',
    '  } catch {',
    '    void 0;',
    '  }',
    '})();',
    '</script>',
  ]
  return lines.join('\n')
})()

export const injectScrollSync = (html: string): string => {
  const raw = String(html || '')
  if (raw.includes('kg-scroll-sync')) return raw
  const injection = SCROLL_SYNC_SCRIPT
  const headMatch = /<head\b[^>]*>/i.exec(raw)
  if (headMatch && typeof headMatch.index === 'number') {
    const end = headMatch.index + headMatch[0].length
    return `${raw.slice(0, end)}\n${injection}\n${raw.slice(end)}`
  }
  const htmlMatch = /<html\b[^>]*>/i.exec(raw)
  if (htmlMatch && typeof htmlMatch.index === 'number') {
    const end = htmlMatch.index + htmlMatch[0].length
    return `${raw.slice(0, end)}\n<head>\n${injection}\n</head>\n${raw.slice(end)}`
  }
  return `<!doctype html><html><head>\n${injection}\n</head><body>\n${raw}\n</body></html>`
}

export const buildCodeViewerSrcdoc = (args: { baseHref: string; title: string; mode: 'json' | 'text'; text: string }): string => {
  const title = escapeHtml(args.title)
  const baseHref = String(args.baseHref || '').trim() || 'https://example.invalid/'
  const label = args.mode === 'json' ? 'JSON' : 'Text'
  const rawText = String(args.text || '')
  const clippedText = rawText.length > 450_000 ? `${rawText.slice(0, 450_000)}\n\n…(clipped ${rawText.length - 450_000} chars)…` : rawText
  const body = escapeHtml(clippedText)
  const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">`,
    `<base href="${escapeHtml(baseHref)}">`,
    `<title>${title}</title>`,
    '<style>',
    '  :root{color-scheme: dark light;}',
    '  body{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}',
    '  header{position:sticky;top:0;z-index:1;background:rgba(0,0,0,0.72);backdrop-filter:blur(8px);color:#fff;padding:8px 12px;font-size:12px;display:flex;gap:8px;align-items:center;}',
    '  main{padding:12px;}',
    '  pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.45;}',
    '</style>',
    '</head>',
    '<body>',
    `<header><strong>${label}</strong><span style="opacity:.7">sandboxed</span></header>`,
    `<main><pre>${body}</pre></main>`,
    '</body>',
    '</html>',
  ].join('\n')
  return injectScrollSync(html)
}

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0))

const SRCDOC_CACHE = new Map<string, string>()
const SRCDOC_INFLIGHT = new Map<string, Promise<string>>()

const SRCDOC_CACHE_VERSION = 4

const SRCDOC_CACHE_MAX = 24
const MAX_CACHE_VALUE_CHARS = 650_000

function writeCachedSrcdoc(cacheKey: string, value: string): void {
  if (value.length > MAX_CACHE_VALUE_CHARS) return
  SRCDOC_CACHE.set(cacheKey, value)
  if (SRCDOC_CACHE.size > SRCDOC_CACHE_MAX) {
    const oldest = SRCDOC_CACHE.keys().next().value as string | undefined
    if (oldest) SRCDOC_CACHE.delete(oldest)
  }
}

const stripHtmlComments = (html: string): string => {
  const s = String(html || '')
  if (!s.includes('<!--')) return s
  return s.replace(/<!--[\s\S]*?-->/g, '')
}

const stripOversizeStyleTags = (html: string, maxStyleChars: number): string => {
  const s = String(html || '')
  if (!/<style\b/i.test(s)) return s
  return s.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, (m) => {
    if (m.length <= maxStyleChars) return m
    return '<style>/* omitted */</style>'
  })
}

const stripOversizeInlineSvg = (html: string, maxSvgChars: number): string => {
  const s = String(html || '')
  if (!/<svg\b/i.test(s)) return s
  return s.replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, (m) => {
    if (m.length <= maxSvgChars) return m
    return ''
  })
}

const stripDataImageSrc = (html: string): string => {
  const s = String(html || '')
  if (!s.includes('data:image/')) return s
  return s
    .replace(/\bsrc\s*=\s*("|')\s*data:image\/[a-zA-Z0-9.+-]+;base64,[^"']*\1/gi, 'src="data:,"')
    .replace(/url\(\s*("|')?\s*data:image\/[a-zA-Z0-9.+-]+;base64,[^)"']*("|')?\s*\)/gi, 'url(data:,)')
}

const compactWhitespace = (html: string): string => {
  const s = String(html || '')
  if (s.length < 50_000) return s
  let next = s
  next = next.replace(/\r/g, '')
  next = next.replace(/\n{3,}/g, '\n\n')
  next = next.replace(/>\s{2,}</g, '><')
  next = next.replace(/[\t ]{2,}/g, ' ')
  return next
}

const injectViewportCss = (html: string): string => {
  const css = [
    'html,body{margin:0;padding:0;width:100%;max-width:100%;overflow-x:hidden!important;}',
    'body{min-width:0!important;overscroll-behavior-x:none;}',
    '*{box-sizing:border-box;}',
    'img,video,svg,canvas,iframe{max-width:100%!important;height:auto;}',
    'pre,code{white-space:pre-wrap;word-break:break-word;}',
  ].join('')
  const tag = `<style data-kg-srcdoc-viewport="1">${css}</style>`
  const meta = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />'
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (m) => `${m}${meta}${tag}`)
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${meta}${tag}</head>`)
  }
  return `<head>${meta}${tag}</head>${html}`
}

function chooseSandboxBaseHref(args: { rawHtml: string; baseHref: string }): string {
  const baseHref = String(args.baseHref || '').trim() || 'https://example.invalid/'
  return baseHref
}

export function buildWebpageSandboxCsp(scriptPolicy: WebpageSandboxScriptPolicy): string {
  return scriptPolicy === 'allow'
    ? "default-src https: http: data: blob:; img-src https: http: data: blob:; media-src https: http: data: blob:; style-src 'unsafe-inline' https: http:; font-src https: http: data: blob:; connect-src https: http: ws: wss:; frame-src https: http:; worker-src blob: data:; script-src 'unsafe-inline' 'unsafe-eval' https: http: blob: data:"
    : "default-src 'none'; img-src https: http: data: blob:; media-src https: http: data: blob:; style-src 'unsafe-inline' https: http:; font-src https: http: data: blob:; connect-src https: http:; frame-src https: http:; script-src 'unsafe-inline'"
}

async function buildSandboxHtmlAsync(args: {
  html: string
  baseHref: string
  scriptPolicy: WebpageSandboxScriptPolicy
  onProgress?: (step: string) => void
}): Promise<string> {
  const rawHtml = String(args.html || '')
  const baseHref = String(args.baseHref || '').trim() || 'https://example.invalid/'
  const scriptPolicy = args.scriptPolicy

  const cacheKey = `srcdoc:v${SRCDOC_CACHE_VERSION}:${scriptPolicy}:${baseHref}:${readRuntimeOrigin()}:${rawHtml.length}:${hash32(rawHtml)}`
  const cached = SRCDOC_CACHE.get(cacheKey)
  if (cached) return cached
  const inflight = SRCDOC_INFLIGHT.get(cacheKey)
  if (inflight) return await inflight

  const p = (async () => {
    if (rawHtml.length > 50_000) await yieldToMain()

    let current = rawHtml
    const stepYield = async (label: string) => {
      if (args.onProgress) args.onProgress(label)
      if (current.length > 50_000) await yieldToMain()
    }

    if (scriptPolicy === 'allow') {
      await stepYield('Sanitizing CSP')
      current = stripWebpageCspMeta(current)

      await stepYield('Sanitizing Refresh')
      current = stripWebpageRefreshMeta(current)

      await stepYield('Unhiding Content')
      current = revealHiddenContentRoots(current)

      await stepYield('Fixing Lazy Images')
      current = proxyAssetPathImages(promoteLazyLoadedImages(current))
    } else {
      await stepYield('Sanitizing CSP')
      current = stripWebpageCspMeta(current)

      await stepYield('Sanitizing Refresh')
      current = stripWebpageRefreshMeta(current)

      await stepYield('Unhiding Content')
      current = revealHiddenContentRoots(current)

      await stepYield('Fixing Lazy Images')
      current = proxyAssetPathImages(promoteLazyLoadedImages(current))

      await stepYield('Stripping Scripts')
      current = stripWebpageScriptTags(current)

      await stepYield('Stripping Handlers')
      current = stripWebpageInlineEventHandlers(current)
    }

    if (current.length > 1_500_000) {
      await stepYield('Shrinking HTML')
      current = stripHtmlComments(current)
      current = stripDataImageSrc(current)
      current = stripOversizeInlineSvg(current, 180_000)
      current = stripOversizeStyleTags(current, 220_000)
      current = compactWhitespace(current)
    }

    const runtimeOrigin = readRuntimeOrigin()
    if (runtimeOrigin) {
      await stepYield('Absolutizing Local Paths')
      current = absolutizeLocalProxyPaths(current, runtimeOrigin)
    }

    await stepYield('Injecting Base')
    const chosenBaseHref = chooseSandboxBaseHref({ rawHtml: current, baseHref })
    const withBase = upsertBaseTag(current, chosenBaseHref)

    await stepYield('Injecting CSP')
    const withCsp = upsertSandboxCspMeta(withBase, buildWebpageSandboxCsp(scriptPolicy))

    await stepYield('Injecting Viewport CSS')
    const withViewport = injectViewportCss(withCsp)

    await stepYield('Injecting Scroll Sync')
    const built = injectScrollSync(withViewport)

    writeCachedSrcdoc(cacheKey, built)
    return built
  })()

  SRCDOC_INFLIGHT.set(cacheKey, p)
  try {
    return await p
  } finally {
    SRCDOC_INFLIGHT.delete(cacheKey)
  }
}

export async function buildWebpageSandboxHtmlAsync(args: {
  html: string
  baseHref: string
  scriptPolicy?: WebpageSandboxScriptPolicy
  onProgress?: (step: string) => void
  maxSrcdocChars?: number
}): Promise<WebpageSandboxBuildResult> {
  const maxSrcdocChars = typeof args.maxSrcdocChars === 'number' && Number.isFinite(args.maxSrcdocChars) ? Math.max(50_000, Math.floor(args.maxSrcdocChars)) : 1_500_000
  const scriptPolicy: WebpageSandboxScriptPolicy = args.scriptPolicy === 'allow' ? 'allow' : 'strip'
  const html = await buildSandboxHtmlAsync({
    html: args.html,
    baseHref: args.baseHref,
    scriptPolicy,
    onProgress: args.onProgress,
  })
  return { html, scriptPolicy, tooLargeForSrcdoc: html.length > maxSrcdocChars }
}

export function buildWebpageHtmlSrcdoc(args: { html: string; baseHref: string; scriptPolicy?: WebpageSandboxScriptPolicy }): string {
  const baseHref = String(args.baseHref || '').trim() || 'https://example.invalid/'
  const rawHtml = String(args.html || '')
  const scriptPolicy: WebpageSandboxScriptPolicy = args.scriptPolicy === 'allow' ? 'allow' : 'strip'

  let current = rawHtml
  if (scriptPolicy === 'allow') {
    current = proxyAssetPathImages(
      proxyAllRemoteImages(promoteLazyLoadedImages(revealHiddenContentRoots(stripWebpageRefreshMeta(stripWebpageCspMeta(current))))),
    )
  } else {
    current = proxyAssetPathImages(
      proxyAllRemoteImages(promoteLazyLoadedImages(
        revealHiddenContentRoots(
          stripWebpageInlineEventHandlers(stripWebpageScriptTags(stripWebpageRefreshMeta(stripWebpageCspMeta(current)))),
        )
      )),
    )
  }

  if (current.length > 1_500_000) {
    current = compactWhitespace(stripOversizeStyleTags(stripOversizeInlineSvg(stripDataImageSrc(stripHtmlComments(current)), 180_000), 220_000))
  }

  const runtimeOrigin = readRuntimeOrigin()
  if (runtimeOrigin) {
    current = absolutizeLocalProxyPaths(current, runtimeOrigin)
  }

  const chosenBaseHref = chooseSandboxBaseHref({ rawHtml: current, baseHref })
  const withBase = upsertBaseTag(current, chosenBaseHref)
  const withCsp = upsertSandboxCspMeta(withBase, buildWebpageSandboxCsp(scriptPolicy))
  const withViewport = injectViewportCss(withCsp)
  return injectScrollSync(withViewport)
}

export function clearWebpageSandboxDocCaches(): void {
  SRCDOC_CACHE.clear()
  SRCDOC_INFLIGHT.clear()
}
