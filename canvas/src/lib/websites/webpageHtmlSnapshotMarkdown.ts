import { escapeMarkdownText, resolveUrl } from './webpageHtmlToMarkdownArtifactPrivate'

type HtmlSnapshotMeta = {
  name?: string
  property?: string
  httpEquiv?: string
  charset?: string
  content?: string
}

type HtmlSnapshotLink = {
  rel?: string
  href?: string
  as?: string
  type?: string
  sizes?: string
}

const renderFencedBlock = (content: string, info: string = ''): string => {
  const raw = String(content || '').replace(/\r/g, '')
  const matches = raw.match(/`+/g)
  const longest = Array.isArray(matches) ? matches.reduce((m, s) => Math.max(m, s.length), 0) : 0
  const fence = '`'.repeat(Math.max(3, longest + 1))
  const open = info ? `${fence}${info}` : fence
  const body = raw.endsWith('\n') ? raw : raw + '\n'
  return [open, body + fence].join('\n')
}

const normalizeRel = (rel: string | null): string => {
  return String(rel || '')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .join(' ')
}

const safeAttr = (value: string | null): string => {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const extractHtmlSnapshotHead = (doc: Document, url: string): {
  doctype: string
  htmlLang: string
  title: string
  baseHref: string
  resolvedBaseUrl: string
  metas: HtmlSnapshotMeta[]
  links: HtmlSnapshotLink[]
} => {
  const doctype = safeAttr(doc.doctype?.name || '')
  const htmlLang = safeAttr(doc.documentElement?.getAttribute?.('lang') || '')

  const title = safeAttr(doc.title || '')
  const baseHrefRaw = safeAttr(doc.querySelector('base[href]')?.getAttribute('href') || '')
  const resolvedBaseUrl = baseHrefRaw ? resolveUrl(url, baseHrefRaw) : url

  const metas: HtmlSnapshotMeta[] = []
  doc.querySelectorAll('meta').forEach((el) => {
    const name = safeAttr(el.getAttribute('name'))
    const property = safeAttr(el.getAttribute('property'))
    const httpEquiv = safeAttr(el.getAttribute('http-equiv'))
    const charset = safeAttr(el.getAttribute('charset'))
    const content = safeAttr(el.getAttribute('content'))
    if (name || property || httpEquiv || charset || content) {
      metas.push({
        name: name || undefined,
        property: property || undefined,
        httpEquiv: httpEquiv || undefined,
        charset: charset || undefined,
        content: content || undefined,
      })
    }
  })

  const links: HtmlSnapshotLink[] = []
  doc.querySelectorAll('link').forEach((el) => {
    const rel = normalizeRel(el.getAttribute('rel'))
    const href = safeAttr(el.getAttribute('href'))
    const as = safeAttr(el.getAttribute('as'))
    const type = safeAttr(el.getAttribute('type'))
    const sizes = safeAttr(el.getAttribute('sizes'))
    const hrefResolved = href ? resolveUrl(resolvedBaseUrl, href) : ''
    if (rel || hrefResolved || as || type || sizes) {
      links.push({
        rel: rel || undefined,
        href: hrefResolved || undefined,
        as: as || undefined,
        type: type || undefined,
        sizes: sizes || undefined,
      })
    }
  })

  return {
    doctype,
    htmlLang,
    title,
    baseHref: baseHrefRaw,
    resolvedBaseUrl,
    metas,
    links,
  }
}

export const renderHtmlSnapshotMarkdown = (htmlSanitized: string, url: string): string => {
  const raw = String(htmlSanitized || '').trim()
  if (!raw) return ''
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    const head = extractHtmlSnapshotHead(doc, url)
    const lines: string[] = []
    lines.push('- doctype: ' + (head.doctype || 'html'))
    if (head.htmlLang) lines.push('- htmlLang: ' + escapeMarkdownText(head.htmlLang))
    if (head.title) lines.push('- title: ' + escapeMarkdownText(head.title))
    if (head.baseHref) lines.push('- baseHref: ' + escapeMarkdownText(head.baseHref))
    if (head.resolvedBaseUrl) lines.push('- resolvedBaseUrl: ' + escapeMarkdownText(head.resolvedBaseUrl))
    if (head.metas.length > 0) {
      lines.push('- meta:')
      head.metas.forEach((m) => {
        lines.push('  -')
        if (m.name) lines.push('    name: ' + escapeMarkdownText(m.name))
        if (m.property) lines.push('    property: ' + escapeMarkdownText(m.property))
        if (m.httpEquiv) lines.push('    httpEquiv: ' + escapeMarkdownText(m.httpEquiv))
        if (m.charset) lines.push('    charset: ' + escapeMarkdownText(m.charset))
        if (m.content) lines.push('    content: ' + escapeMarkdownText(m.content))
      })
    }
    if (head.links.length > 0) {
      lines.push('- link:')
      head.links.forEach((l) => {
        lines.push('  -')
        if (l.rel) lines.push('    rel: ' + escapeMarkdownText(l.rel))
        if (l.href) lines.push('    href: ' + escapeMarkdownText(l.href))
        if (l.as) lines.push('    as: ' + escapeMarkdownText(l.as))
        if (l.type) lines.push('    type: ' + escapeMarkdownText(l.type))
        if (l.sizes) lines.push('    sizes: ' + escapeMarkdownText(l.sizes))
      })
    }
    return lines.join('\n').trim()
  } catch {
    return renderFencedBlock(raw)
  }
}

