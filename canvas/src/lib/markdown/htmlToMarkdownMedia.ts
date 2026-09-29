import type { HastNode } from './htmlToMarkdownHast'

export function buildHtmlToMarkdownHandlers(toHtml: (node: never) => string, fidelityLevel: number, svgSymbolHtmlById: Map<string, string>) {
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
      value = value.replace(/\saria-hidden\s*=\s*["'][^"']*["']/gi, '')
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
      const maxSvgBase64Chars = 32_000
      const altMatch =
        value.match(/\baria-label\s*=\s*["']([^"']+)["']/i) ||
        value.match(/\bdata-icon\s*=\s*["']([^"']+)["']/i) ||
        value.match(/<\s*title[^>]*>([^<]{1,80})<\/\s*title\s*>/i)
      const alt = String(altMatch?.[1] || 'SVG image').trim()
      const withoutScripts = value.length <= maxSvgCharsForDataUri
        ? value.replace(/<\s*script\b[\s\S]*?<\/\s*script\s*>/gi, '')
        : ''
      let url = ''
      try {
        const b64 = withoutScripts ? encodeUtf8ToBase64(withoutScripts) : ''
        const cappedB64 = b64 && b64.length <= maxSvgBase64Chars ? b64 : ''
        url = cappedB64 ? `data:image/svg+xml;base64,${cappedB64}` : ''
      } catch {
        url = ''
      }
      if (!url) return { type: 'text', value: `${alt} (exceeds inline image limit)`, position: null }
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

  return handlers
}

export const replaceMediaEmbedsWithLinks = (tree: HastNode) => {
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
