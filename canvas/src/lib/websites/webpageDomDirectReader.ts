import { looksLikeNetworkSecurityBlockText } from 'grph-shared/rich-media/webpagePreview'
export type WebpageDomExportMode = 'text' | 'html' | 'layout'
export type WebpageDomTextCaptureTarget = 'document' | 'clicked-next-sibling'

export type WebpageDomExportResult = { text: string; title: string; clipped: boolean; diag?: string }

const normalizeRenderedPageTextForExport = (value: unknown): string => {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function createWebpageDomDirectReader(iframe: HTMLIFrameElement, args: {
  url: string; mode: WebpageDomExportMode; maxElements?: number
}, maxChars: number) {
    const isIframeShowingBlockedPage = (): boolean => {
      try {
        const doc = iframe.contentDocument
        const body = doc?.body
        const t = typeof body?.innerText === 'string' ? body.innerText : String(body?.textContent || '')
        return looksLikeNetworkSecurityBlockText(t)
      } catch {
        return false
      }
    }

    const tryDirectRead = (): WebpageDomExportResult | null => {
      try {
        const doc = iframe.contentDocument
        if (!doc) return null
        const title = String(doc.title || '').trim()
        if (isIframeShowingBlockedPage()) return null
        if (args.mode === 'text') {
          const body = doc.body
          const innerText = body && typeof body.innerText === 'string' ? body.innerText : ''
          const visibleText = normalizeRenderedPageTextForExport(innerText)
          const cleanedText = (() => {
            try {
              if (!body) return ''
              const cloned = body.cloneNode(true) as HTMLElement
              try {
                cloned.querySelectorAll('script,style,noscript,template').forEach((el) => el.remove())
              } catch {
                void 0
              }
              const raw = String(cloned.textContent || '').replace(/\s+/g, ' ').trim()
              if (!visibleText && /(^|\\W)(self\\.__next_f|__next_f|__NEXT_DATA__)(\\W|$)/.test(raw)) return ''
              return raw
            } catch {
              return ''
            }
          })()
          const text = visibleText || cleanedText
          if (!text && !title) return null
          const payload = {
            ok: false,
            stage: 'export',
            error: 'No postMessage response; used direct DOM read',
            href: (() => {
              try {
                const w = iframe.contentWindow
                return String(w?.location?.href || '')
              } catch {
                return ''
              }
            })(),
            readyState: String(doc.readyState || ''),
            title,
            usedTextSource: visibleText ? 'innerText' : cleanedText ? 'cleanTextContent' : 'none',
            bodyTextLen: text.length,
            scripts: (() => {
              try {
                return Array.from(doc.querySelectorAll('script[src]'))
                  .slice(0, 80)
                  .map(s => String(s.getAttribute('src') || ''))
              } catch {
                return []
              }
            })(),
            links: (() => {
              try {
                return Array.from(doc.querySelectorAll('link[href]'))
                  .slice(0, 80)
                  .map(l => String(l.getAttribute('href') || ''))
              } catch {
                return []
              }
            })(),
          }
          return { text: text.slice(0, maxChars), title, clipped: text.length > maxChars, diag: JSON.stringify(payload).slice(0, 18000) }
        }
        if (args.mode === 'layout') {
          const win = iframe.contentWindow
          if (!win) return null
          const safeStyleValue = (value: unknown) => {
            try {
              const v = String(value || '').trim()
              if (!v) return ''
              if (v.length > 240) return ''
              if (/url\s*\(|expression\s*\(|@import/i.test(v)) return ''
              if (!/^[a-zA-Z0-9\s().,%:/_+\-'\"#]+$/.test(v)) return ''
              const lower = v.toLowerCase()
              if (/javascript:|data:/.test(lower)) return ''
              return v
            } catch {
              return ''
            }
          }
          const isSkippableTag = (tag: string) => {
            const t = String(tag || '').toUpperCase()
            return (
              t === 'SCRIPT' ||
              t === 'STYLE' ||
              t === 'NOSCRIPT' ||
              t === 'TEMPLATE' ||
              t === 'META' ||
              t === 'LINK' ||
              t === 'HEAD' ||
              t === 'BASE'
            )
          }
          const isVisibleBox = (cs: CSSStyleDeclaration | null, rect: DOMRect | null) => {
            try {
              if (!rect) return false
              const w = Number(rect.width || 0)
              const h = Number(rect.height || 0)
              if (!(w > 2 && h > 2)) return false
              if (w * h < 24) return false
              if (!cs) return true
              const display = String(cs.display || '').toLowerCase()
              if (display === 'none') return false
              const vis = String(cs.visibility || '').toLowerCase()
              if (vis === 'hidden') return false
              const op = Number.parseFloat(String(cs.opacity || '1'))
              if (Number.isFinite(op) && op <= 0.02) return false
              return true
            } catch {
              return true
            }
          }
          const safeAttr = (el: { getAttribute?: ((name: string) => string | null) | null } | null, name: string) => {
            try {
              const v = typeof el?.getAttribute === 'function' ? el.getAttribute(name) || '' : ''
              const s = String(v || '').trim()
              if (!s) return ''
              if (s.length > 240) return ''
              return s
            } catch {
              return ''
            }
          }
          const safeText = (el: { textContent?: unknown } | null) => {
            try {
              const t = String(el?.textContent || '').replace(/\s+/g, ' ').trim()
              return t.length > 240 ? t.slice(0, 240) : t
            } catch {
              return ''
            }
          }
          const pickStyle = (cs: CSSStyleDeclaration | null) => {
            try {
              if (!cs) return null
              return {
                display: safeStyleValue(cs.display),
                position: safeStyleValue(cs.position),
                zIndex: safeStyleValue(cs.zIndex),
                transform: safeStyleValue((cs as unknown as { transform?: unknown }).transform),
                filter: safeStyleValue((cs as unknown as { filter?: unknown }).filter),
                isolation: safeStyleValue((cs as unknown as { isolation?: unknown }).isolation),
                willChange: safeStyleValue((cs as unknown as { willChange?: unknown }).willChange),
                backgroundColor: safeStyleValue((cs as unknown as { backgroundColor?: unknown }).backgroundColor),
                color: safeStyleValue((cs as unknown as { color?: unknown }).color),
                borderRadius: safeStyleValue((cs as unknown as { borderRadius?: unknown }).borderRadius),
                borderColor: safeStyleValue((cs as unknown as { borderColor?: unknown }).borderColor),
                borderWidth: safeStyleValue((cs as unknown as { borderWidth?: unknown }).borderWidth),
                padding: safeStyleValue((cs as unknown as { padding?: unknown }).padding),
                margin: safeStyleValue((cs as unknown as { margin?: unknown }).margin),
                gap: safeStyleValue((cs as unknown as { gap?: unknown }).gap),
                rowGap: safeStyleValue((cs as unknown as { rowGap?: unknown }).rowGap),
                columnGap: safeStyleValue((cs as unknown as { columnGap?: unknown }).columnGap),
                justifyContent: safeStyleValue((cs as unknown as { justifyContent?: unknown }).justifyContent),
                justifyItems: safeStyleValue((cs as unknown as { justifyItems?: unknown }).justifyItems),
                alignItems: safeStyleValue((cs as unknown as { alignItems?: unknown }).alignItems),
                alignContent: safeStyleValue((cs as unknown as { alignContent?: unknown }).alignContent),
                justifySelf: safeStyleValue((cs as unknown as { justifySelf?: unknown }).justifySelf),
                alignSelf: safeStyleValue((cs as unknown as { alignSelf?: unknown }).alignSelf),
                flexDirection: safeStyleValue((cs as unknown as { flexDirection?: unknown }).flexDirection),
                flexWrap: safeStyleValue((cs as unknown as { flexWrap?: unknown }).flexWrap),
                flexGrow: safeStyleValue((cs as unknown as { flexGrow?: unknown }).flexGrow),
                flexShrink: safeStyleValue((cs as unknown as { flexShrink?: unknown }).flexShrink),
                flexBasis: safeStyleValue((cs as unknown as { flexBasis?: unknown }).flexBasis),
                order: safeStyleValue((cs as unknown as { order?: unknown }).order),
                gridTemplateColumns: safeStyleValue((cs as unknown as { gridTemplateColumns?: unknown }).gridTemplateColumns),
                gridTemplateRows: safeStyleValue((cs as unknown as { gridTemplateRows?: unknown }).gridTemplateRows),
                gridAutoFlow: safeStyleValue((cs as unknown as { gridAutoFlow?: unknown }).gridAutoFlow),
                fontSize: safeStyleValue((cs as unknown as { fontSize?: unknown }).fontSize),
                fontWeight: safeStyleValue((cs as unknown as { fontWeight?: unknown }).fontWeight),
                fontFamily: safeStyleValue((cs as unknown as { fontFamily?: unknown }).fontFamily),
                lineHeight: safeStyleValue((cs as unknown as { lineHeight?: unknown }).lineHeight),
                letterSpacing: safeStyleValue((cs as unknown as { letterSpacing?: unknown }).letterSpacing),
                textTransform: safeStyleValue((cs as unknown as { textTransform?: unknown }).textTransform),
                textAlign: safeStyleValue((cs as unknown as { textAlign?: unknown }).textAlign),
                boxShadow: safeStyleValue((cs as unknown as { boxShadow?: unknown }).boxShadow),
                opacity: safeStyleValue((cs as unknown as { opacity?: unknown }).opacity),
              }
            } catch {
              return null
            }
          }
          const idByEl = new WeakMap<object, string>()
          let nextId = 0
          const getId = (el: object | null) => {
            if (!el) return ''
            const prev = idByEl.get(el)
            if (prev) return prev
            nextId += 1
            const id = `e${nextId}`
            idByEl.set(el, id)
            return id
          }
          const root = doc.documentElement || doc.body
          const meta = {
            kind: 'layout',
            title: title || String(win.location?.hostname || '').trim(),
            href: String(args.url || '').trim(),
            viewport: { w: Number(win.innerWidth || 0) || 0, h: Number(win.innerHeight || 0) || 0 },
            scroll: {
              x: Number((win as unknown as { scrollX?: unknown }).scrollX || 0) || 0,
              y: Number((win as unknown as { scrollY?: unknown }).scrollY || 0) || 0,
              height: (() => {
                try {
                  const el = doc.scrollingElement || doc.documentElement || doc.body
                  return Number(el?.scrollHeight || 0) || 0
                } catch {
                  return 0
                }
              })(),
            },
            ts: Date.now(),
          }
          const els = Array.from((root as unknown as { querySelectorAll?: unknown }).querySelectorAll ? root.querySelectorAll('*') : [])
          const out: unknown[] = []
          const limit = typeof args.maxElements === 'number' && Number.isFinite(args.maxElements) ? Math.floor(args.maxElements) : 1400
          for (let i = 0; i < els.length; i += 1) {
            const el = els[i] as unknown as { tagName?: unknown; parentElement?: unknown; getBoundingClientRect?: unknown } | null
            const tagName = el && typeof el.tagName === 'string' ? el.tagName : ''
            if (!tagName) continue
            if (isSkippableTag(tagName)) continue
            let rect: DOMRect | null = null
            try {
              rect = typeof el?.getBoundingClientRect === 'function' ? (el.getBoundingClientRect as () => DOMRect)() : null
            } catch {
              rect = null
            }
            let cs: CSSStyleDeclaration | null = null
            try {
              cs = win.getComputedStyle ? win.getComputedStyle(el as unknown as Element) : null
            } catch {
              cs = null
            }
            if (!isVisibleBox(cs, rect)) continue
            const id = getId(el as unknown as object)
            const parent =
              el && el.parentElement && typeof el.parentElement === 'object' ? (el.parentElement as unknown as object) : null
            const pid = parent ? getId(parent) : ''
            const x = (rect ? Number(rect.left) : 0) + (Number((win as unknown as { scrollX?: unknown }).scrollX || 0) || 0)
            const y = (rect ? Number(rect.top) : 0) + (Number((win as unknown as { scrollY?: unknown }).scrollY || 0) || 0)
            const w = rect ? Number(rect.width) : 0
            const h = rect ? Number(rect.height) : 0
            const tag = String(tagName || '').toUpperCase()
            const attrs = {
              id: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'id'),
              class: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'class'),
              role: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'role'),
              ariaLabel: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'aria-label'),
              placeholder:
                tag === 'INPUT' || tag === 'TEXTAREA'
                  ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'placeholder')
                  : '',
              href: tag === 'A' ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'href') : '',
              src:
                tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME'
                  ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'src')
                  : '',
              alt: tag === 'IMG' ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'alt') : '',
            }
            const inputValue =
              tag === 'INPUT' || tag === 'TEXTAREA'
                ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'value')
                : ''
            const text = (inputValue || '').trim() ? inputValue : attrs.placeholder || safeText(el as unknown as { textContent?: unknown })
            out.push({ id, pid, tag, rect: { x, y, w, h }, text, attrs, style: pickStyle(cs) })
            if (out.length >= Math.max(200, Math.min(3500, limit))) break
          }
          const payload = { meta, elements: out }
          const raw = JSON.stringify(payload)
          return {
            text: raw.slice(0, maxChars),
            title,
            clipped: raw.length > maxChars,
            diag: JSON.stringify({
              ok: false,
              stage: 'export',
              error: 'No postMessage response; used direct DOM read (layout)',
              readyState: String(doc.readyState || ''),
              title,
              elements: out.length,
            }).slice(0, 18000),
          }
        }
        const html = String(doc.documentElement?.outerHTML || '').trim()
        if (!html && !title) return null
        const payload = {
          ok: false,
          stage: 'export',
          error: 'No postMessage response; used direct DOM read',
          readyState: String(doc.readyState || ''),
          title,
          htmlLen: html.length,
        }
        return { text: html.slice(0, maxChars), title, clipped: html.length > maxChars, diag: JSON.stringify(payload).slice(0, 18000) }
      } catch {
        return null
      }
    }

  return { isIframeShowingBlockedPage, tryDirectRead }
}
