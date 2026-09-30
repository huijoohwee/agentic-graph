import { stripOversizedHydrationAttributes, filterHastElements, stripHastComments, fillEmptyAnchorText, fillMissingMediaSrc, resolveUrlLoose, resolveHastUrls, collectHeadArtifacts, renderHeadSectionMarkdown, type HastNode, type HtmlHeadArtifacts } from './htmlToMarkdownHast'
import { buildHtmlToMarkdownHandlers, replaceMediaEmbedsWithLinks } from './htmlToMarkdownMedia'
import { postprocessMarkdownLayout, dedupeMarkdownParagraphs } from './htmlToMarkdownLayout'
import { pickBestContentRoot } from './htmlContentRoot'
import { hashText } from '../../features/parsers/hash'
import { LRUCache } from '../cache/LRUCache'
import { postprocessWebpageMarkdownSsot } from './webpageMarkdownPostprocess'

export type HtmlToMarkdownUnifiedResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string; code?: 'HTML_INPUT_LIMIT_EXCEEDED' }

export function assertHtmlInputBudget(html: string, maxChars: number): void {
  if (html.length > maxChars) throw Object.assign(new Error(`HTML input exceeds the ${maxChars}-character limit; no partial Markdown was produced`), { code: 'HTML_INPUT_LIMIT_EXCEEDED' })
}

type HtmlToMarkdownProgressPhase = 'parse' | 'transform' | 'toMarkdown' | 'stringify'

const CACHE = new LRUCache<string, string>(60, 5 * 60_000)

const SOURCE_JOINED_ASCII_TOKEN_RE = /\b([A-Za-z][A-Za-z0-9]{1,}) ([A-Za-z0-9]{2,})\b/g

const normalizeHtmlSourceForAsciiTokenLookup = (source: string): string =>
  String(source || '')
    .replace(/&(?:nbsp|#160|#x[aA]0);/g, ' ')
    .replace(/\s+/g, ' ')

const restoreSourceJoinedAsciiTokens = (markdown: string, sourceHtml: string): string => {
  const input = String(markdown || '')
  const source = String(sourceHtml || '')
  if (!input || !source) return input
  const sourceLookup = [
    normalizeHtmlSourceForAsciiTokenLookup(source),
    normalizeHtmlSourceForAsciiTokenLookup(source.replace(/<[^>]*>/g, '')),
  ].join('\n')
  return input.replace(SOURCE_JOINED_ASCII_TOKEN_RE, (match: string, left: string, right: string) => {
    const joined = `${left}${right}`
    if (sourceLookup.includes(joined) && !sourceLookup.includes(match)) return joined
    return match
  })
}

export async function convertHtmlToMarkdownUnified(args: {
  html: string
  /** Used only when the captured document has no rendered body content. */
  fallbackMarkdown?: string
  baseUrl?: string
  maxInputChars?: number
  includeImages?: boolean
  fidelityLevel?: 1 | 2 | 3 | 4
  includeHeadSection?: boolean
  preferContentRoot?: boolean
  injectTitleHeading?: boolean
  onProgress?: (phase: HtmlToMarkdownProgressPhase, percentage: number) => void
}): Promise<HtmlToMarkdownUnifiedResult> {
  try {
    const input = String(args.html || '')
    assertHtmlInputBudget(input, 32_000_000)
    const raw = stripOversizedHydrationAttributes(input)
    const baseUrl = typeof args.baseUrl === 'string' ? args.baseUrl.trim() : ''
    const fallbackMarkdown = String(args.fallbackMarkdown || '').trim()
    const includeImages = args.includeImages !== false
    const includeHeadSection = args.includeHeadSection === true
    const preferContentRoot = args.preferContentRoot !== false
    const injectTitleHeading = args.injectTitleHeading === true
    const fidelityLevelRaw = args.fidelityLevel
    const fidelityLevel: 1 | 2 | 3 | 4 =
      fidelityLevelRaw === 1 || fidelityLevelRaw === 2 || fidelityLevelRaw === 3 || fidelityLevelRaw === 4
        ? fidelityLevelRaw
        : 2
    const maxInputChars =
      typeof args.maxInputChars === 'number' && Number.isFinite(args.maxInputChars)
        ? Math.max(10_000, Math.min(12_000_000, Math.floor(args.maxInputChars)))
        : 2_500_000
    assertHtmlInputBudget(raw, maxInputChars)
    const html = (() => {
      const sliced = raw
      if (!sliced.trim()) return sliced

      const scriptCount = (sliced.match(/<script\b/gi) || []).length
      const styleCount = (sliced.match(/<style\b/gi) || []).length
      const looksHeavy = sliced.length > 600_000 || scriptCount >= 8 || styleCount >= 3
      if (!looksHeavy) return sliced

      let next = sliced
      next = next.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      next = next.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
      return next
    })()
    if (!html.trim()) return { ok: false, error: 'Missing HTML' }

    const cacheKey = [
      baseUrl,
      includeImages ? 'img:1' : 'img:0',
      `fid:${fidelityLevel}`,
      includeHeadSection ? 'head:1' : 'head:0',
      hashText(fallbackMarkdown),
      preferContentRoot ? 'root:1' : 'root:0',
      injectTitleHeading ? 'title:1' : 'title:0',
      'post:webpage:3',
      String(html.length),
      hashText(html),
    ].join('|')
    const cached = CACHE.get(cacheKey)
    if (cached) return { ok: true, markdown: cached }

    try {
      args.onProgress?.('parse', 10)
    } catch {
      void 0
    }

    const [{ unified }, rehypeParseMod, rehypeRemarkMod, remarkStringifyMod, remarkGfmMod, hastToHtmlMod] = await Promise.all([
      import('unified'),
      import('rehype-parse'),
      import('rehype-remark'),
      import('remark-stringify'),
      import('remark-gfm'),
      import('hast-util-to-html'),
    ])

    const rehypeParse = (rehypeParseMod as unknown as { default?: unknown }).default
    const rehypeRemark = (rehypeRemarkMod as unknown as { default?: unknown }).default
    const remarkStringify = (remarkStringifyMod as unknown as { default?: unknown }).default
    const remarkGfm = (remarkGfmMod as unknown as { default?: unknown }).default
    const toHtml = (hastToHtmlMod as unknown as { toHtml?: unknown }).toHtml

    if (typeof rehypeParse !== 'function') return { ok: false, error: 'rehype-parse not available' }
    if (typeof rehypeRemark !== 'function') return { ok: false, error: 'rehype-remark not available' }
    if (typeof remarkStringify !== 'function') return { ok: false, error: 'remark-stringify not available' }
    if (typeof toHtml !== 'function') return { ok: false, error: 'hast-util-to-html not available' }

    const svgSymbolHtmlById = new Map<string, string>()

    const handlers = buildHtmlToMarkdownHandlers(toHtml as (node: never) => string, fidelityLevel, svgSymbolHtmlById)

    try {
      args.onProgress?.('transform', 35)
    } catch {
      void 0
    }

    let extractedHead: HtmlHeadArtifacts | null = null
    let resolvedBaseUrl = baseUrl

    const processor = unified()
      .use(rehypeParse as never, { fragment: true } as never)
      .use(() => {
        return (tree: unknown) => {
          try {
            extractedHead = collectHeadArtifacts(tree as HastNode)
            if (!resolvedBaseUrl && extractedHead?.baseHref) {
              const baseHrefResolved = resolveUrlLoose(extractedHead.baseHref, baseUrl)
              resolvedBaseUrl = baseHrefResolved || extractedHead.baseHref
            }
            if (extractedHead?.links?.length && resolvedBaseUrl) {
              extractedHead.links = extractedHead.links.map(l => {
                if (l.href) return { ...l, href: resolveUrlLoose(l.href, resolvedBaseUrl) }
                return l
              })
            }
            const bestRoot = preferContentRoot ? pickBestContentRoot(tree as HastNode) : null
            if (bestRoot && bestRoot !== (tree as HastNode)) {
              ;(tree as HastNode).children = [bestRoot] as unknown as HastNode[]
            }
            if (fidelityLevel <= 2) replaceMediaEmbedsWithLinks(tree as HastNode)
            stripHastComments(tree as HastNode)
            const filter = {
              remove: new Set([
              'script',
              'head',
              'meta',
              'link',
              'title',
              'base',
              'style',
              'input',
              'textarea',
              'select',
              'option',
              'canvas',
              ...(includeImages ? [] : ['img', 'picture']),
            ]),
              unwrap: new Set(['button', 'form', 'noscript']),
            }
            if (fidelityLevel < 4) filter.remove.add('svg')
            if (!includeImages) {
              void 0
            }
            filterHastElements(tree as HastNode, filter)
            fillEmptyAnchorText(tree as HastNode)
            fillMissingMediaSrc(tree as HastNode)
            if (resolvedBaseUrl) resolveHastUrls(tree as HastNode, resolvedBaseUrl)
            try {
              const getPropStr = (props: Record<string, unknown> | undefined, key: string): string => {
                if (!props) return ''
                const v = props[key]
                if (typeof v === 'string') return v
                if (typeof v === 'number') return String(v)
                if (typeof v === 'boolean') return v ? 'true' : ''
                if (Array.isArray(v)) return v.map(x => String(x || '')).join(' ').trim()
                return ''
              }

              const nodeText = (node: HastNode): string => {
                const n = node as unknown as { type?: string; value?: unknown; children?: HastNode[]; tagName?: string }
                const type = String(n?.type || '')
                if (type === 'text') return String(n.value || '')
                if (type !== 'element' && type !== 'root') return ''
                const tag = String(n.tagName || '').toLowerCase()
                if (tag === 'svg' || tag === 'img') return ''
                const kids = Array.isArray(n.children) ? n.children : []
                return kids.map(nodeText).join('')
              }

              const isSvgOrImg = (node: HastNode): boolean => {
                const el = node as unknown as { type?: string; tagName?: string }
                if (String(el?.type || '') !== 'element') return false
                const tag = String(el.tagName || '').toLowerCase()
                return tag === 'svg' || tag === 'img'
              }

              const isHeadingTag = (tag: string): boolean => {
                const t = String(tag || '').toLowerCase()
                return t === 'h1' || t === 'h2' || t === 'h3' || t === 'h4' || t === 'h5' || t === 'h6'
              }

              const isLikelyHeadingPermalinkHref = (href: string, headingId: string, baseUrlHint: string) => {
                const raw = String(href || '').trim()
                if (!raw) return false
                if (raw.startsWith('#')) return true
                const hashIdx = raw.indexOf('#')
                if (hashIdx >= 0) return true
                try {
                  const base = String(baseUrlHint || '').trim()
                  if (!base) return false
                  const a = new URL(raw, base)
                  const b = new URL(base)
                  const aKey = `${a.origin}${a.pathname}`.replace(/\/+$/, '')
                  const bKey = `${b.origin}${b.pathname}`.replace(/\/+$/, '')
                  if (aKey && bKey && aKey === bKey) return true
                  if (headingId && a.hash === `#${headingId}`) return true
                  return false
                } catch {
                  return false
                }
              }

              const isHeadingPermalinkAnchor = (node: HastNode, headingId: string): boolean => {
                const el = node as unknown as {
                  type?: string
                  tagName?: string
                  properties?: Record<string, unknown>
                  children?: HastNode[]
                }
                if (String(el?.type || '') !== 'element') return false
                if (String(el.tagName || '').toLowerCase() !== 'a') return false
                const props = el.properties || {}
                const href = getPropStr(props, 'href')
                const baseUrlHint = String(resolvedBaseUrl || baseUrl || '').trim()
                if (!href || !isLikelyHeadingPermalinkHref(href, headingId, baseUrlHint)) return false
                const cls = (getPropStr(props, 'className') || getPropStr(props, 'class')).toLowerCase()
                const id = (getPropStr(props, 'id') || '').toLowerCase()
                const title = (getPropStr(props, 'title') || '').toLowerCase()
                const ariaLabel = (getPropStr(props, 'ariaLabel') || getPropStr(props, 'aria-label')).toLowerCase()
                const keyText = `${cls} ${id} ${title} ${ariaLabel}`
                const looksLikePermalink =
                  /\b(permalink|anchor|headerlink|hash-link|heading-anchor|octicon-link|anchorjs-link)\b/.test(keyText)
                const kids = Array.isArray(el.children) ? el.children : []
                const nonEmptyText = nodeText(node).trim()
                if (nonEmptyText) {
                  const labelFromAttrs = (ariaLabel || title).trim()
                  const textLower = nonEmptyText.toLowerCase()
                  const labelLower = labelFromAttrs.toLowerCase()
                  const looksLikePermalinkWord = /\b(permalink|direct link|link to heading|anchor)\b/.test(textLower)
                  if (!(looksLikePermalink && looksLikePermalinkWord && labelLower && textLower === labelLower)) return false
                }
                const hasAnyChild = kids.length > 0
                const allKidsAreIconish =
                  hasAnyChild &&
                  kids.every(k => {
                    const t = (k as unknown as { type?: string }).type
                    if (t === 'text') return String((k as unknown as { value?: unknown }).value || '').trim() === ''
                    return isSvgOrImg(k)
                  })
                return looksLikePermalink || allKidsAreIconish
              }

              const removeHeadingPermalinkAnchors = (node: HastNode) => {
                const el = node as unknown as { type?: string; tagName?: string; children?: HastNode[]; properties?: Record<string, unknown> }
                const type = String(el?.type || '')
                if (type !== 'element' && type !== 'root') return
                const tag = String(el.tagName || '').toLowerCase()
                if (type === 'element' && isHeadingTag(tag)) {
                  const headingId = getPropStr(el.properties || {}, 'id')
                  const kids = Array.isArray(el.children) ? el.children : []
                  if (kids.length) {
                    const nextKids = kids.filter(k => !isHeadingPermalinkAnchor(k, headingId))
                    ;(el.children as HastNode[]) = nextKids
                  }
                }
                const kids = Array.isArray(el.children) ? el.children : []
                for (const child of kids) removeHeadingPermalinkAnchors(child)
              }

              const stripIconsAndImagesFromLinksWithText = (node: HastNode) => {
                const el = node as unknown as { type?: string; tagName?: string; children?: HastNode[]; properties?: Record<string, unknown> }
                const type = String(el?.type || '')
                if (type !== 'element' && type !== 'root') return
                const tag = String(el.tagName || '').toLowerCase()
                if (tag === 'a') {
                  const kids = Array.isArray(el.children) ? el.children : []
                  const props = el.properties || {}
                  const ariaLabel = getPropStr(props, 'ariaLabel') || getPropStr(props, 'aria-label')
                  const title = getPropStr(props, 'title')
                  const labelFromAttrs = (ariaLabel || title).trim()
                  const text = nodeText(node).trim()
                  const hasText = text.length > 0 || labelFromAttrs.length > 0
                  if (hasText) {
                    const filtered = kids.filter(k => !isSvgOrImg(k))
                    if (filtered.length === 0 && labelFromAttrs) {
                      ;(el.children as HastNode[]) = [{ type: 'text', value: labelFromAttrs } as unknown as HastNode]
                    } else {
                      ;(el.children as HastNode[]) = filtered
                    }
                  }
                }
                const kids = Array.isArray(el.children) ? el.children : []
                for (const child of kids) stripIconsAndImagesFromLinksWithText(child)
              }

              const unwrapLayoutWrappers = (node: HastNode) => {
                const el = node as unknown as { type?: string; tagName?: string; children?: HastNode[]; properties?: Record<string, unknown> }
                const type = String(el?.type || '')
                if (type !== 'element' && type !== 'root') return
                const kids = Array.isArray(el.children) ? el.children : []
                if (kids.length) {
                  const nextKids: HastNode[] = []
                  for (const child of kids) {
                    const cEl = child as unknown as { type?: string; tagName?: string; children?: HastNode[]; properties?: Record<string, unknown> }
                    if (String(cEl?.type || '') === 'element') {
                      const cTag = String(cEl.tagName || '').toLowerCase()
                      const props = cEl.properties || {}
                      const id = getPropStr(props, 'id')
                      const keep = getPropStr(props, 'data-kg-keep') || getPropStr(props, 'dataKgKeep')
                      const cls = (getPropStr(props, 'className') || getPropStr(props, 'class')).toLowerCase()
                      const looksLayout =
                        /\b(grid|flex|container|columns|col-span|row-span|gap-|gap\d|items-|justify-|space-)\b/.test(cls) ||
                        /\b(grid-cols-|grid-rows-)\b/.test(cls)
                      const hasText = nodeText(child).trim().length > 0
                      const hasInteractive = /<(?:\s*button\b|\s*input\b|\s*textarea\b|\s*select\b|\s*details\b)/i.test(
                        String(toHtml(child as never) || ''),
                      )
                      const canUnwrap =
                        !keep &&
                        !id &&
                        !hasText &&
                        (cTag === 'div' || cTag === 'section') &&
                        looksLayout &&
                        !/\bprose\b/.test(cls) &&
                        !hasInteractive
                      if (canUnwrap) {
                        const grandKids = Array.isArray(cEl.children) ? cEl.children : []
                        for (const g of grandKids) nextKids.push(g)
                        continue
                      }
                    }
                    nextKids.push(child)
                  }
                  ;(el.children as HastNode[]) = nextKids
                }
                const next = Array.isArray(el.children) ? el.children : []
                for (const child of next) unwrapLayoutWrappers(child)
              }

              removeHeadingPermalinkAnchors(tree as HastNode)
              stripIconsAndImagesFromLinksWithText(tree as HastNode)
              unwrapLayoutWrappers(tree as HastNode)
            } catch {
              void 0
            }
            try {
              const visit = (node: HastNode) => {
                const el = node as unknown as { type?: string; tagName?: string; children?: HastNode[]; properties?: Record<string, unknown> }
                if (String(el?.type || '') === 'element') {
                  const tag = String(el.tagName || '').toLowerCase()
                  if (tag === 'symbol') {
                    const idRaw = el.properties?.id
                    const id = typeof idRaw === 'string' ? idRaw : Array.isArray(idRaw) ? idRaw.map(v => String(v || '')).join(' ') : ''
                    const k = id.trim()
                    if (k) {
                      const html = String(toHtml(node as never) || '')
                      if (html) svgSymbolHtmlById.set(k, html)
                    }
                  }
                }
                const kids = Array.isArray(el.children) ? el.children : []
                for (const child of kids) visit(child)
              }
              visit(tree as HastNode)
            } catch {
              void 0
            }
          } catch {
            void 0
          }
        }
      })
      .use(rehypeRemark as never, { handlers } as never)
      .use(remarkGfm as never)

    try {
      args.onProgress?.('toMarkdown', 65)
    } catch {
      void 0
    }

    processor.use(remarkStringify as never, {
      allowDangerousHtml: true,
      bullet: '-',
      fences: true,
      fence: '`',
      listItemIndent: 'one',
      lineWidth: 0,
    } as never)

    try {
      args.onProgress?.('stringify', 85)
    } catch {
      void 0
    }

    const file = await processor.process(html)
    const coreMarkdownRaw = String(file || '').trim()

    const coreMarkdown = dedupeMarkdownParagraphs(postprocessMarkdownLayout(coreMarkdownRaw)) || fallbackMarkdown

    const headSection = (() => {
      if (!extractedHead) return ''
      const hasAnyHead =
        !!extractedHead.title || !!extractedHead.baseHref || extractedHead.metas.length > 0 || extractedHead.links.length > 0
      if (!hasAnyHead) return ''
      if (includeHeadSection) return renderHeadSectionMarkdown(extractedHead, resolvedBaseUrl)
      return ''
    })()

    const titleHeading = (() => {
      if (!injectTitleHeading) return ''
      const title = String(extractedHead?.title || '').trim()
      if (!title) return ''
      const firstLine = (coreMarkdown.split('\n')[0] || '').trim()
      if (firstLine.startsWith('# ')) return ''
      return `# ${title}`
    })()

    const parts = [titleHeading, headSection, coreMarkdown].filter(Boolean)
    const markdownRaw = parts.join('\n\n').trim()
    const markdown = restoreSourceJoinedAsciiTokens(postprocessWebpageMarkdownSsot(markdownRaw), html)
    if (!markdown) return { ok: false, error: 'Conversion produced empty markdown' }

    CACHE.set(cacheKey, markdown)
    try {
      args.onProgress?.('stringify', 100)
    } catch {
      void 0
    }
    return { ok: true, markdown }
  } catch (e) {
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
    return { ok: false, error: msg || 'Unified conversion failed', ...((e as { code?: string })?.code === 'HTML_INPUT_LIMIT_EXCEEDED' ? { code: 'HTML_INPUT_LIMIT_EXCEEDED' as const } : {}) }
  }
}
