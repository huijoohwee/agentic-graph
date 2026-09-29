import { pickBestContentRoot } from './htmlContentRoot'
import { hashText } from '../../features/parsers/hash'
import { LRUCache } from '../cache/LRUCache'
import { postprocessWebpageMarkdownSsot } from './webpageMarkdownPostprocess'
import { pickFirstSrcsetUrl } from 'grph-shared/markdown/mediaHtml'
import { looksLikePlaceholderMediaSrc, shouldPreserveRawHtmlMarkdownLine } from './htmlToMarkdownHeuristics'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

type HastNode = {
  type?: unknown
  tagName?: unknown
  children?: unknown
  properties?: unknown
  value?: unknown
}

type HtmlHeadArtifactMeta = {
  name?: string
  property?: string
  httpEquiv?: string
  charset?: string
  content?: string
}

type HtmlHeadArtifactLink = {
  rel?: string
  href?: string
  as?: string
  type?: string
  sizes?: string
}

type HtmlHeadArtifacts = {
  title?: string
  baseHref?: string
  metas: HtmlHeadArtifactMeta[]
  links: HtmlHeadArtifactLink[]
}

const stripHastElements = (node: HastNode, banned: Set<string>): void => {
  const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null
  if (!kids || kids.length === 0) return
  const next: HastNode[] = []
  for (const k of kids) {
    const t = typeof k?.type === 'string' ? k.type : ''
    const tag = t === 'element' && typeof k?.tagName === 'string' ? k.tagName.toLowerCase() : ''
    if (tag && banned.has(tag)) continue
    stripHastElements(k, banned)
    next.push(k)
  }
  node.children = next
}

const filterHastElements = (node: HastNode, args: { remove: Set<string>; unwrap: Set<string> }): void => {
  const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null
  if (!kids || kids.length === 0) return
  const next: HastNode[] = []
  for (const k of kids) {
    const t = typeof k?.type === 'string' ? k.type : ''
    const tag = t === 'element' && typeof k?.tagName === 'string' ? k.tagName.toLowerCase() : ''
    if (tag && args.remove.has(tag)) continue
    filterHastElements(k, args)
    if (tag && args.unwrap.has(tag)) {
      const unwrappedKids = Array.isArray(k.children) ? (k.children as HastNode[]) : []
      next.push(...unwrappedKids)
      continue
    }
    next.push(k)
  }
  node.children = next
}

const stripHastComments = (node: HastNode): void => {
  const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null
  if (!kids || kids.length === 0) return
  const next: HastNode[] = []
  for (const k of kids) {
    const t = typeof k?.type === 'string' ? k.type : ''
    if (t === 'comment') continue
    stripHastComments(k)
    next.push(k)
  }
  node.children = next
}

const fillEmptyAnchorText = (root: HastNode): void => {
  const getProp = (node: HastNode, key: string): string => {
    const props = node && typeof node.properties === 'object' && node.properties ? (node.properties as Record<string, unknown>) : null
    if (!props) return ''
    const v = props[key]
    if (typeof v === 'string') return v
    if (Array.isArray(v)) return v.map(x => String(x || '')).join(' ').trim()
    return ''
  }

  const visit = (node: HastNode): void => {
    const t = typeof node?.type === 'string' ? node.type : ''
    const tag = t === 'element' && typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : ''
    const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null

    if (tag === 'a') {
      const text = extractHastText(node).replace(/\s+/g, ' ').trim()
      if (!text) {
        const label =
          getProp(node, 'aria-label') ||
          getProp(node, 'ariaLabel') ||
          getProp(node, 'title') ||
          getProp(node, 'data-label') ||
          ''
        const href = getProp(node, 'href')
        const nextText = (label || href || '').trim()
        if (nextText) {
          node.children = [{ type: 'text', value: nextText }] as unknown as HastNode[]
        }
      }
    }

    if (!kids || kids.length === 0) return
    for (const k of kids) visit(k)
  }

  visit(root)
}

const fillMissingMediaSrc = (node: HastNode): void => {
  const t = typeof node?.type === 'string' ? node.type : ''
  const tag = t === 'element' && typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : ''
  const props = node && typeof node.properties === 'object' && node.properties ? (node.properties as Record<string, unknown>) : null
  const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null

  if (tag === 'picture' && kids && kids.length) {
    try {
      const img = kids.find(
        k =>
          (k as unknown as { type?: unknown; tagName?: unknown })?.type === 'element' &&
          String((k as unknown as { tagName?: unknown }).tagName || '').toLowerCase() === 'img',
      )
      const sources = kids.filter(
        k =>
          (k as unknown as { type?: unknown; tagName?: unknown })?.type === 'element' &&
          String((k as unknown as { tagName?: unknown }).tagName || '').toLowerCase() === 'source',
      )
      const imgProps =
        img && typeof (img as unknown as { properties?: unknown }).properties === 'object' && (img as unknown as { properties?: unknown }).properties
          ? ((img as unknown as { properties?: unknown }).properties as Record<string, unknown>)
          : null
      const imgSrc = imgProps && typeof imgProps.src === 'string' ? String(imgProps.src || '').trim() : ''
      if (imgProps && (!imgSrc || looksLikePlaceholderMediaSrc(imgSrc))) {
        const firstSource = sources[0]
        const sProps =
          firstSource &&
          typeof (firstSource as unknown as { properties?: unknown }).properties === 'object' &&
          (firstSource as unknown as { properties?: unknown }).properties
            ? ((firstSource as unknown as { properties?: unknown }).properties as Record<string, unknown>)
            : null
        const srcset =
          (sProps && typeof sProps.srcset === 'string' ? String(sProps.srcset || '').trim() : '') ||
          (sProps && typeof sProps['data-srcset'] === 'string' ? String(sProps['data-srcset'] || '').trim() : '')
        const picked = pickFirstSrcsetUrl(srcset)
        if (picked) imgProps.src = picked
      }
    } catch {
      void 0
    }
  }

  if (props && tag === 'img') {
    const src = typeof props.src === 'string' ? props.src.trim() : ''
    if (!src || looksLikePlaceholderMediaSrc(src)) {
      const dataSrc =
        (typeof props['data-src'] === 'string' ? String(props['data-src'] || '').trim() : '') ||
        (typeof props.dataSrc === 'string' ? String(props.dataSrc || '').trim() : '')
      const srcset =
        (typeof props.srcset === 'string' ? String(props.srcset || '').trim() : '') ||
        (typeof props['data-srcset'] === 'string' ? String(props['data-srcset'] || '').trim() : '') ||
        (typeof props.dataSrcset === 'string' ? String(props.dataSrcset || '').trim() : '')
      const picked = dataSrc || pickFirstSrcsetUrl(srcset)
      if (picked) props.src = picked
    }
  }

  if (!kids || kids.length === 0) return
  for (const k of kids) fillMissingMediaSrc(k)
}

const resolveUrlLoose = (rawValue: unknown, baseUrl: string): string => {
  const raw = typeof rawValue === 'string' ? rawValue.trim() : ''
  if (!raw) return ''
  if (/^(data:|mailto:|tel:|javascript:)/i.test(raw)) return raw
  if (!baseUrl) return raw
  try {
    return new URL(raw, baseUrl).toString()
  } catch {
    return raw
  }
}

const resolveSrcsetLoose = (rawValue: unknown, baseUrl: string): string => {
  const raw = typeof rawValue === 'string' ? rawValue.trim() : ''
  if (!raw) return ''
  if (!baseUrl) return raw
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^(\S+)(?:\s+(.+))?$/)
      const urlPart = m?.[1] || ''
      const desc = (m?.[2] || '').trim()
      const resolved = resolveUrlLoose(urlPart, baseUrl) || urlPart
      return desc ? `${resolved} ${desc}` : resolved
    })
  return parts.join(', ')
}

const resolveAttr = (props: Record<string, unknown>, key: string, baseUrl: string) => {
  const v = props[key]
  if (typeof v !== 'string') return
  const next = resolveUrlLoose(v, baseUrl)
  if (next) props[key] = next
}

const resolveAttrSrcset = (props: Record<string, unknown>, key: string, baseUrl: string) => {
  const v = props[key]
  if (typeof v !== 'string') return
  const next = resolveSrcsetLoose(v, baseUrl)
  if (next) props[key] = next
}

const resolveHastUrls = (node: HastNode, baseUrl: string): void => {
  const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null
  const t = typeof node?.type === 'string' ? node.type : ''
  const tag = t === 'element' && typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : ''
  const props = node && typeof node.properties === 'object' && node.properties ? (node.properties as Record<string, unknown>) : null
  if (props && tag) {
    if (tag === 'a' || tag === 'link' || tag === 'use') resolveAttr(props, 'href', baseUrl)
    if (tag === 'form') resolveAttr(props, 'action', baseUrl)
    if (tag === 'img' || tag === 'iframe' || tag === 'audio' || tag === 'video' || tag === 'source' || tag === 'track' || tag === 'embed') {
      resolveAttr(props, 'src', baseUrl)
      resolveAttr(props, 'data-src', baseUrl)
      resolveAttr(props, 'dataSrc', baseUrl)
      resolveAttrSrcset(props, 'srcset', baseUrl)
      resolveAttrSrcset(props, 'data-srcset', baseUrl)
      resolveAttrSrcset(props, 'dataSrcset', baseUrl)
    }
    if (tag === 'img') {
      resolveAttr(props, 'longdesc', baseUrl)
    }
    if (tag === 'video') {
      resolveAttr(props, 'poster', baseUrl)
      resolveAttr(props, 'data-poster', baseUrl)
      resolveAttr(props, 'dataPoster', baseUrl)
    }
    if (tag === 'object') resolveAttr(props, 'data', baseUrl)
    if (tag === 'image') {
      resolveAttr(props, 'href', baseUrl)
      resolveAttr(props, 'xlink:href', baseUrl)
      resolveAttr(props, 'xlinkHref', baseUrl)
    }
    if (tag === 'use') {
      resolveAttr(props, 'xlink:href', baseUrl)
      resolveAttr(props, 'xlinkHref', baseUrl)
    }
  }
  if (!kids || kids.length === 0) return
  for (const k of kids) resolveHastUrls(k, baseUrl)
}

const extractHastText = (node: HastNode): string => {
  const t = typeof node?.type === 'string' ? node.type : ''
  if (t === 'text') return typeof node.value === 'string' ? node.value : ''
  const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null
  if (!kids || kids.length === 0) return ''
  return kids.map(k => extractHastText(k)).join('')
}

const normalizeLinkRel = (rel: unknown): string => {
  if (Array.isArray(rel)) return rel.map(v => String(v || '').trim()).filter(Boolean).join(' ')
  return typeof rel === 'string' ? rel.trim() : ''
}

const collectHeadArtifacts = (tree: HastNode): HtmlHeadArtifacts => {
  const artifacts: HtmlHeadArtifacts = { metas: [], links: [] }

  const visit = (node: HastNode, inHead: boolean): void => {
    const t = typeof node?.type === 'string' ? node.type : ''
    const tag = t === 'element' && typeof node?.tagName === 'string' ? node.tagName.toLowerCase() : ''
    const kids = Array.isArray(node.children) ? (node.children as HastNode[]) : null
    const props = node && typeof node.properties === 'object' && node.properties ? (node.properties as Record<string, unknown>) : null

    const nextInHead = inHead || tag === 'head'
    const isHeadishTag = nextInHead || tag === 'title' || tag === 'base' || tag === 'meta' || tag === 'link'
    if (isHeadishTag && tag) {
      if (tag === 'title' && !artifacts.title) {
        const text = extractHastText(node).replace(/\s+/g, ' ').trim()
        if (text) artifacts.title = text
      }
      if (tag === 'base' && props && !artifacts.baseHref && typeof props.href === 'string') {
        const href = String(props.href || '').trim()
        if (href) artifacts.baseHref = href
      }
      if (tag === 'meta' && props) {
        const name = typeof props.name === 'string' ? String(props.name || '').trim() : ''
        const property = typeof props.property === 'string' ? String(props.property || '').trim() : ''
        const httpEquiv = typeof props['http-equiv'] === 'string' ? String(props['http-equiv'] || '').trim() : ''
        const charset = typeof props.charset === 'string' ? String(props.charset || '').trim() : ''
        const content = typeof props.content === 'string' ? String(props.content || '').trim() : ''
        if (name || property || httpEquiv || charset || content) {
          artifacts.metas.push({
            name: name || undefined,
            property: property || undefined,
            httpEquiv: httpEquiv || undefined,
            charset: charset || undefined,
            content: content || undefined,
          })
        }
      }
      if (tag === 'link' && props) {
        const rel = normalizeLinkRel(props.rel)
        const href = typeof props.href === 'string' ? String(props.href || '').trim() : ''
        const as = typeof props.as === 'string' ? String(props.as || '').trim() : ''
        const type = typeof props.type === 'string' ? String(props.type || '').trim() : ''
        const sizes = typeof props.sizes === 'string' ? String(props.sizes || '').trim() : ''
        if (rel || href || as || type || sizes) {
          artifacts.links.push({
            rel: rel || undefined,
            href: href || undefined,
            as: as || undefined,
            type: type || undefined,
            sizes: sizes || undefined,
          })
        }
      }
    }

    if (!kids || kids.length === 0) return
    for (const k of kids) visit(k, nextInHead)
  }

  visit(tree, false)
  return artifacts
}

const renderHeadSectionMarkdown = (head: HtmlHeadArtifacts, baseUrl: string): string => {
  const inline = (v: unknown): string => {
    return String(v ?? '')
      .replace(/\r/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const lines: string[] = []
  lines.push('## HTML Head')
  lines.push('')
  if (head.title) lines.push(`- Title: ${inline(head.title)}`)
  if (head.baseHref) lines.push(`- Base Href: ${inline(head.baseHref)}`)
  if (baseUrl) lines.push(`- Resolved Base URL: ${inline(baseUrl)}`)

  if (head.metas.length > 0) {
    const filtered = head.metas.filter(m => {
      const name = String(m.name || '').toLowerCase()
      if (name === 'csrf-param' || name === 'csrf-token') return false
      return true
    })
    if (filtered.length === 0) return lines.join('\n')
    lines.push('')
    lines.push(...serializeMarkdownPipeTable({
      columns: ['name', 'property', 'httpEquiv', 'charset', 'content'],
      rows: filtered.map(m => [inline(m.name), inline(m.property), inline(m.httpEquiv), inline(m.charset), inline(m.content)]),
    }))
  }

  if (head.links.length > 0) {
    lines.push('')
    lines.push(...serializeMarkdownPipeTable({
      columns: ['rel', 'href', 'as', 'type', 'sizes'],
      rows: head.links.map(l => [inline(l.rel), inline(l.href), inline(l.as), inline(l.type), inline(l.sizes)]),
    }))
  }

  return lines.join('\n')
}

export type HtmlToMarkdownUnifiedResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string }

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
    const raw = String(args.html || '')
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
    const html = (() => {
      const sliced = raw.length > maxInputChars ? raw.slice(0, maxInputChars) : raw
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

    const preserveAsHtmlHandler = () => {
      return (_state: unknown, node: unknown) => {
        const value = toHtml(node as never)
        return { type: 'html', value, position: null }
      }
    }

    const preserveSvgAsImageHandler = () => {
      const encodeUtf8ToBase64 = (text: string): string => {
        const raw = String(text ?? '')
        const anyGlobal = globalThis as unknown as {
          Buffer?: { from: (input: string, enc: string) => { toString: (enc: string) => string } }
        }
        if (anyGlobal.Buffer && typeof anyGlobal.Buffer.from === 'function') {
          return anyGlobal.Buffer.from(raw, 'utf8').toString('base64')
        }
        const encoder = new TextEncoder()
        const bytes = encoder.encode(raw)
        let binary = ''
        const chunk = 0x8000
        for (let i = 0; i < bytes.length; i += chunk) {
          const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk))
          binary += String.fromCharCode(...Array.from(slice))
        }
        return btoa(binary)
      }

      return (_state: unknown, node: unknown) => {
        let value = String(toHtml(node as never) || '')
        if (!value.trim()) return { type: 'html', value, position: null }
        const useRef = value.match(/<(?:\s*use\b)[^>]*\s(?:xlink:href|href)\s*=\s*["']\s*#([^"'\s>]+)\s*["'][^>]*>/i)
        if (useRef) {
          const id = String(useRef[1] || '').trim()
          const alreadyHasSymbol = new RegExp(`<\\s*symbol\\b[^>]*\\bid\\s*=\\s*["']\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*["']`, 'i').test(value)
          if (!alreadyHasSymbol) {
            const symbolHtml = svgSymbolHtmlById.get(id)
            if (symbolHtml) {
              if (/<\s*defs\b/i.test(value)) {
                value = value.replace(/<\s*defs\b([^>]*)>/i, (m, attrs) => `<defs${attrs || ''}>${symbolHtml}`)
              } else {
                value = value.replace(/<\s*svg\b([^>]*)>/i, (m, attrs) => `<svg${attrs || ''}><defs>${symbolHtml}</defs>`)
              }
            } else {
              return { type: 'html', value, position: null }
            }
          }
        }
        const maxSvgCharsForDataUri = 24_000
        const maxSvgBase64Chars = 100
        const altMatch =
          value.match(/\baria-label\s*=\s*["']([^"']+)["']/i) ||
          value.match(/\bdata-icon\s*=\s*["']([^"']+)["']/i) ||
          value.match(/<\s*title[^>]*>([^<]{1,80})<\/\s*title\s*>/i)
        const alt = String(altMatch?.[1] || '').trim()
        const withoutScripts = value.length <= maxSvgCharsForDataUri
          ? value.replace(/<\s*script\b[\s\S]*?<\/\s*script\s*>/gi, '')
          : ''
        const placeholderSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
        let url = ''
        try {
          const b64 = withoutScripts ? encodeUtf8ToBase64(withoutScripts) : ''
          const cappedB64 = b64 && b64.length <= maxSvgBase64Chars ? b64 : encodeUtf8ToBase64(placeholderSvg)
          url = cappedB64 ? `data:image/svg+xml;base64,${cappedB64}` : ''
        } catch {
          url = ''
        }
        if (!url) return { type: 'html', value, position: null }
        return { type: 'image', url, alt, title: null, position: null }
      }
    }

    const preserveLayoutDivHandler = () => {
      return (state: unknown, node: unknown) => {
        const el = node as unknown as { properties?: Record<string, unknown>; children?: unknown }
        const props = el?.properties || {}
        const classProp = props.className
        const className = Array.isArray(classProp) ? classProp.map(v => String(v || '')).join(' ') : String(classProp || '')
        const style = String(props.style || '')
        const classLower = className.toLowerCase()
        const styleLower = style.toLowerCase()
        const looksGridOrColumnsOrFlex =
          /\bgrid\b|\binline-grid\b|\bgrid-cols-\[|\bgrid-rows-\[|\bgrid-cols-\d+|\bgrid-rows-\d+|\bgrid-flow-|\bcolumns-\d+/.test(
            classLower,
          ) ||
          /\bflex\b|\binline-flex\b|\bflex-row\b|\bflex-col\b|\bflex-wrap\b|\bgap-\d+|\bspace-[xy]-\d+/.test(classLower) ||
          /display\s*:\s*(grid|inline-grid|flex|inline-flex)/.test(styleLower) ||
          /grid-template-columns|grid-template-rows|grid-auto-flow|column-count|column-width|flex-wrap|gap\s*:/.test(styleLower)
        if (looksGridOrColumnsOrFlex) {
          const kids = Array.isArray(el.children) ? (el.children as Array<{ type?: unknown }>) : []
          const elementKids = kids.filter(k => typeof k?.type === 'string' && k.type === 'element')
          if (elementKids.length < 2) {
            const anyState = state as unknown as { all?: (n: unknown) => unknown }
            if (typeof anyState?.all === 'function') return anyState.all(node)
            return preserveAsHtmlHandler()(state, node)
          }
          const value = toHtml(node as never)
          const divTagCount = (value.match(/<\s*div\b/gi) || []).length
          const anchorCount = (value.match(/<\s*a\b/gi) || []).length
          const lower = value.toLowerCase()
          if (lower.includes('<script') || lower.includes('<style')) {
            void 0
          } else if (anchorCount === 0 && value.length <= 6000 && divTagCount <= 14) {
            return { type: 'html', value, position: null }
          }
        }
        const anyState = state as unknown as { all?: (n: unknown) => unknown }
        if (typeof anyState?.all === 'function') {
          const children = anyState.all(node)
          // Linearize a visual row as its own paragraph; adjacent cells need a separator.
          const phrasing = new Set(['text', 'link', 'image', 'inlineCode', 'strong', 'emphasis', 'delete', 'break'])
          if (looksGridOrColumnsOrFlex && Array.isArray(children) && children.length > 1 && children.every(child => phrasing.has(String(child?.type)))) {
            return { type: 'paragraph', children: children.flatMap((child, index) => index ? [{ type: 'text', value: ' ' }, child] : [child]) }
          }
          return children
        }
        return preserveAsHtmlHandler()(state, node)
      }
    }

    const handlers: Record<string, unknown> = {}
    if (fidelityLevel >= 2) {
      handlers.table = preserveAsHtmlHandler()
    }
    if (fidelityLevel >= 3) {
      handlers.video = preserveAsHtmlHandler()
      handlers.audio = preserveAsHtmlHandler()
      handlers.iframe = preserveAsHtmlHandler()
    }
    if (fidelityLevel >= 4) {
      handlers.div = preserveLayoutDivHandler()
      handlers.section = preserveLayoutDivHandler()
      handlers.svg = preserveSvgAsImageHandler()
    }

    try {
      args.onProgress?.('transform', 35)
    } catch {
      void 0
    }

    let extractedHead: HtmlHeadArtifacts | null = null
    let resolvedBaseUrl = baseUrl

    const replaceMediaEmbedsWithLinks = (tree: HastNode) => {
      const getProp = (node: HastNode, key: string): string => {
        const el = node as unknown as { properties?: Record<string, unknown> }
        const props = el?.properties || {}
        const v = props[key]
        if (typeof v === 'string') return v
        if (Array.isArray(v)) return v.map(x => String(x || '')).join(' ').trim()
        return ''
      }

      const makeLinkPara = (label: string, href: string): HastNode => {
        return {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            { type: 'text', value: `${label}: ` },
            { type: 'element', tagName: 'a', properties: { href }, children: [{ type: 'text', value: href }] },
          ],
        } as unknown as HastNode
      }

      const makeLinksList = (label: string, hrefs: string[]): HastNode => {
        const items = hrefs.map(href => ({
          type: 'element',
          tagName: 'li',
          properties: {},
          children: [{ type: 'element', tagName: 'a', properties: { href }, children: [{ type: 'text', value: href }] }],
        }))
        return {
          type: 'element',
          tagName: 'section',
          properties: {},
          children: [
            { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: `${label}:` }] },
            { type: 'element', tagName: 'ul', properties: {}, children: items as unknown as HastNode[] },
          ],
        } as unknown as HastNode
      }

      const uniq = (items: string[]): string[] => {
        const out: string[] = []
        const seen = new Set<string>()
        for (const it of items) {
          const t = String(it || '').trim()
          if (!t) continue
          if (seen.has(t)) continue
          seen.add(t)
          out.push(t)
        }
        return out
      }

      const visit = (node: HastNode) => {
        const el = node as unknown as { type?: string; tagName?: string; children?: HastNode[] }
        const type = String(el?.type || '')
        if (type !== 'element' && type !== 'root') return
        const children = Array.isArray(el.children) ? el.children : []
        for (let i = 0; i < children.length; i += 1) {
          const child = children[i] as HastNode
          const cEl = child as unknown as { type?: string; tagName?: string; children?: HastNode[] }
          if (cEl?.type === 'element') {
            const tag = String(cEl.tagName || '').toLowerCase()
            if (tag === 'iframe') {
              const src = getProp(child, 'src')
              if (src) {
                children[i] = makeLinkPara('Embed', src)
                continue
              }
            }
            if (tag === 'embed') {
              const src = getProp(child, 'src')
              if (src) {
                children[i] = makeLinkPara('Embed', src)
                continue
              }
            }
            if (tag === 'object') {
              const data = getProp(child, 'data')
              if (data) {
                children[i] = makeLinkPara('Embed', data)
                continue
              }
            }
            if (tag === 'video' || tag === 'audio') {
              const src = getProp(child, 'src')
              const sourceEls = Array.isArray(cEl.children) ? cEl.children : []
              const sources = sourceEls
                .filter(n => (n as unknown as { type?: string; tagName?: string }).type === 'element')
                .filter(n => String((n as unknown as { tagName?: string }).tagName || '').toLowerCase() === 'source')
                .map(n => getProp(n as HastNode, 'src'))
              const all = uniq([src, ...sources])
              if (all.length === 1) {
                children[i] = makeLinkPara(tag === 'video' ? 'Video' : 'Audio', all[0] || '')
                continue
              }
              if (all.length > 1) {
                children[i] = makeLinksList(tag === 'video' ? 'Video' : 'Audio', all)
                continue
              }
            }
          }
          visit(child)
        }
      }

      visit(tree)
    }

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

    const postprocessMarkdownLayout = (input: string): string => {
      const raw = String(input || '').replace(/\r/g, '').trim()
      if (!raw) return ''
      const lines = raw.split('\n')
      const out: string[] = []
      let inFence = false
      for (const line of lines) {
        const t = line.trim()
        if (t.startsWith('```')) {
          inFence = !inFence
          out.push(line)
          continue
        }
        if (inFence) {
          out.push(line)
          continue
        }
        if (shouldPreserveRawHtmlMarkdownLine(line)) { out.push(line); continue }
        let next = line
        next = next.replace(/\)\[/g, ') [')
        next = next.replace(/\)\!\[/g, ')\n\n![')
        next = next.replace(/(\S)(\[[^\]]+\]\([^)]+\))/g, (m, a: string, b: string) => {
          if (a === '!') return `${a}${b}`
          return `${a} ${b}`
        })
        next = next.replace(/(<https?:\/\/[^>]+>)(?=<https?:\/\/)/g, '$1\n')
        const applyWordBreaks = (s: string): string => {
          const src = String(s || '')
          if (!src) return ''
          let inCode = false
          let inLinkDest = false
          let inAutoUrl = false
          let res = ''
          for (let i = 0; i < src.length; i += 1) {
            const ch = src[i] || ''
            const prev = res.length ? res[res.length - 1] || '' : ''
            const look2 = src.slice(i, i + 2)
            const nextCh = i + 1 < src.length ? src[i + 1] || '' : ''
            if (!inCode && !inAutoUrl && look2 === '](') {
              inLinkDest = true
              res += ']('
              i += 1
              continue
            }
            if (inLinkDest) {
              res += ch
              if (ch === ')') inLinkDest = false
              continue
            }
            if (!inCode && !inAutoUrl && src.slice(i, i + 5).toLowerCase() === '<http') {
              inAutoUrl = true
              res += ch
              continue
            }
            if (inAutoUrl) {
              res += ch
              if (ch === '>') inAutoUrl = false
              continue
            }
            if (ch === '`') {
              inCode = !inCode
              res += ch
              continue
            }
            if (!inCode) {
              const isPrevLower = /[a-z]/.test(prev)
              const isPrevUpper = /[A-Z]/.test(prev)
              const isPrevDigit = /[0-9]/.test(prev)
              const isChUpper = /[A-Z]/.test(ch)
              const isChLower = /[a-z]/.test(ch)
              const isChLetter = /[A-Za-z]/.test(ch)
              const isChDigit = /[0-9]/.test(ch)
              if (prev && !/\s/.test(prev)) {
                if (isPrevLower && isChUpper) {
                  let j = res.length - 1
                  while (j >= 0 && /[A-Za-z]/.test(res[j] || '')) j -= 1
                  const token = res.slice(j + 1)
                  const tokenLen = token.length
                  const hasUpperBeyondFirst = /[A-Z]/.test(token.slice(1))
                  if (tokenLen >= 4 && !hasUpperBeyondFirst) {
                    res += ` ${ch}`
                    continue
                  }
                }
                if ((isPrevLower || isPrevUpper) && isChDigit) {
                  let j = res.length - 1
                  while (j >= 0 && /[A-Za-z]/.test(res[j] || '')) j -= 1
                  const token = res.slice(j + 1)
                  const tokenLen = token.length
                  const allUpper = tokenLen > 0 && /^[A-Z]+$/.test(token)
                  if (!(allUpper && tokenLen <= 3)) {
                    res += ` ${ch}`
                    continue
                  }
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  res += ` ${ch}`
                  continue
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChLetter && !isChUpper && !isChLower) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && !/[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLetter && !isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLetter && !isChUpper && !/[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChDigit) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChUpper && !/[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChDigit) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && !/[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChLower) {
                  void 0
                }
                if (isPrevDigit && isChDigit) {
                  void 0
                }
                if (isPrevDigit && isChLetter && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChUpper && /[a-z]/.test(nextCh)) {
                  void 0
                }
                if (isPrevDigit && isChDigit) {
                  void 0
                }
                if (isPrevDigit && isChLetter) {
                  void 0
                }
                if (isPrevDigit && isChDigit) {
                  void 0
                }
                if (isPrevDigit && isChLetter) {
                  void 0
                }
              }
            }
            res += ch
          }
          return res
        }
        next = applyWordBreaks(next)
        out.push(next)
      }
      return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    }

    const dedupeMarkdownParagraphs = (input: string): string => {
      const raw = String(input || '').replace(/\r/g, '').trim()
      if (!raw) return ''
      const lines = raw.split('\n')
      const out: string[] = []
      const seen = new Set<string>()
      let buf: string[] = []
      let inFence = false

      const flush = () => {
        if (buf.length === 0) return
        const block = buf.join('\n').trimEnd()
        const normalized = block.replace(/\s+/g, ' ').trim()
        const eligible = normalized.length >= 120
        if (!eligible) {
          out.push(block)
          buf = []
          return
        }
        if (!seen.has(normalized)) {
          seen.add(normalized)
          out.push(block)
        }
        buf = []
      }

      for (const line of lines) {
        const t = line.trim()
        if (t.startsWith('```')) {
          flush()
          inFence = !inFence
          out.push(line)
          continue
        }
        if (inFence) {
          out.push(line)
          continue
        }
        if (!t) {
          flush()
          if (out.length > 0 && out[out.length - 1]?.trim() !== '') out.push('')
          continue
        }
        buf.push(line)
      }
      flush()
      return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    }

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
    return { ok: false, error: msg || 'Unified conversion failed' }
  }
}
