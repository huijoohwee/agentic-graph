import { pickFirstSrcsetUrl } from 'grph-shared/markdown/mediaHtml'
import { looksLikePlaceholderMediaSrc } from './htmlToMarkdownHeuristics'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'

export type HastNode = {
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

export type HtmlHeadArtifacts = {
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

export const filterHastElements = (node: HastNode, args: { remove: Set<string>; unwrap: Set<string> }): void => {
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

export const stripHastComments = (node: HastNode): void => {
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

export const fillEmptyAnchorText = (root: HastNode): void => {
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

export const fillMissingMediaSrc = (node: HastNode): void => {
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

export const resolveUrlLoose = (rawValue: unknown, baseUrl: string): string => {
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

export const resolveHastUrls = (node: HastNode, baseUrl: string): void => {
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

export const collectHeadArtifacts = (tree: HastNode): HtmlHeadArtifacts => {
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

export const renderHeadSectionMarkdown = (head: HtmlHeadArtifacts, baseUrl: string): string => {
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


/** Discard oversized inert JSON hydration attributes, never rendered body text. */
export const stripOversizedHydrationAttributes = (html: string): string => {
  if (html.length <= 64 * 1024) return html
  return html.replace(/<[a-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi, tag =>
    tag.replace(/\sdata-[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (attribute, doubleQuoted, singleQuoted) => {
      const value = String(doubleQuoted ?? singleQuoted ?? '')
      return value.length > 64 * 1024 && /^[\[{]/.test(value.trimStart()) ? '' : attribute
    }))
}
