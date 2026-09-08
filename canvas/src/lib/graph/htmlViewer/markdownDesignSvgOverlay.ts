import type { MarkdownDesignBlock } from '@/features/markdown-edgeless/markdownDesignLayout'
import {
  PANEL_FRAME_BODY_STYLE,
  PANEL_FRAME_HEADER_STYLE,
  PANEL_FRAME_HEADER_TITLE_STYLE,
  PANEL_FRAME_ROOT_STYLE,
  type CssStyle,
} from '@/lib/ui/panelFrame'

const toKebab = (k: string): string => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)

const styleToString = (s: CssStyle): string => {
  const parts: string[] = []
  for (const k of Object.keys(s)) {
    const v = s[k]
    if (v === undefined) continue
    const key = toKebab(k)
    const value = typeof v === 'number' ? String(v) : String(v)
    parts.push(`${key}:${value}`)
  }
  return parts.join(';')
}

const createEl = (doc: Document, tag: string): HTMLElement => doc.createElementNS(XHTML_NS, tag) as HTMLElement

const appendText = (el: HTMLElement, text: string): void => {
  el.textContent = String(text || '')
}

const renderBodyContent = (doc: Document, block: MarkdownDesignBlock): HTMLElement => {
  const body = createEl(doc, 'div')
  body.setAttribute('style', styleToString(PANEL_FRAME_BODY_STYLE))

  const preview = block.preview
  if (preview.kind === 'table' && preview.table) {
    const table = createEl(doc, 'table')
    table.setAttribute(
      'style',
      [
        'width:100%',
        'border-collapse:collapse',
        'font-size:11px',
        'line-height:1.25',
        'color:var(--kg-text)',
      ].join(';'),
    )

    const cols = Array.isArray(preview.table.columns) ? preview.table.columns : []
    const rows = Array.isArray(preview.table.rows) ? preview.table.rows : []

    if (cols.length > 0) {
      const thead = createEl(doc, 'thead')
      const tr = createEl(doc, 'tr')
      for (let i = 0; i < cols.length; i += 1) {
        const th = createEl(doc, 'th')
        th.setAttribute(
          'style',
          [
            'text-align:left',
            'border:1px solid var(--kg-border)',
            'padding:2px 4px',
            'background:rgba(0,0,0,0.04)',
            'font-weight:600',
          ].join(';'),
        )
        appendText(th, cols[i] || '')
        tr.appendChild(th)
      }
      thead.appendChild(tr)
      table.appendChild(thead)
    }

    const tbody = createEl(doc, 'tbody')
    const maxRows = Math.max(1, Math.min(10, rows.length))
    for (let r = 0; r < maxRows; r += 1) {
      const tr = createEl(doc, 'tr')
      const row = Array.isArray(rows[r]) ? rows[r] : []
      const cells = cols.length > 0 ? cols.length : row.length
      for (let c = 0; c < cells; c += 1) {
        const td = createEl(doc, 'td')
        td.setAttribute('style', ['border:1px solid var(--kg-border)', 'padding:2px 4px', 'vertical-align:top'].join(';'))
        appendText(td, String(row[c] ?? ''))
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    body.appendChild(table)
    return body
  }

  if (preview.kind === 'code' && preview.code) {
    const pre = createEl(doc, 'pre')
    pre.setAttribute(
      'style',
      [
        'margin:0',
        'padding:6px',
        'border-radius:8px',
        'background:rgba(0,0,0,0.06)',
        'font-size:11px',
        'line-height:1.35',
        'overflow:hidden',
        'font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        'white-space:pre',
        'color:var(--kg-text)',
      ].join(';'),
    )
    const lines = Array.isArray(preview.code.lines) ? preview.code.lines : []
    appendText(pre, lines.slice(0, 14).join('\n'))
    body.appendChild(pre)
    return body
  }

  if (preview.kind === 'blockquote' && preview.blockquote) {
    const box = createEl(doc, 'div')
    box.setAttribute(
      'style',
      [
        'border-left:3px solid var(--kg-border)',
        'padding-left:8px',
        'color:var(--kg-text)',
        'font-size:12px',
        'line-height:1.35',
        'white-space:pre-wrap',
      ].join(';'),
    )
    const lines = Array.isArray(preview.blockquote.lines) ? preview.blockquote.lines : []
    appendText(box, lines.slice(0, 8).join('\n'))
    body.appendChild(box)
    return body
  }

  if (preview.kind === 'list' && Array.isArray(preview.listItems) && preview.listItems.length > 0) {
    const ul = createEl(doc, 'ul')
    ul.setAttribute('style', ['margin:0', 'padding:0 0 0 16px', 'font-size:12px', 'line-height:1.35'].join(';'))
    const max = Math.min(10, preview.listItems.length)
    for (let i = 0; i < max; i += 1) {
      const it = preview.listItems[i]
      const li = createEl(doc, 'li')
      li.setAttribute('style', ['margin:0', 'padding:0', 'color:var(--kg-text)'].join(';'))
      const prefix = it.task ? (it.checked ? '[x] ' : '[ ] ') : ''
      appendText(li, `${prefix}${String(it.text || '').trim()}`)
      ul.appendChild(li)
    }
    body.appendChild(ul)
    return body
  }

  if (preview.kind === 'heading') {
    const h = createEl(doc, 'div')
    const depth = typeof preview.headingDepth === 'number' && Number.isFinite(preview.headingDepth)
      ? Math.max(1, Math.min(6, Math.floor(preview.headingDepth)))
      : 2
    const size = depth <= 2 ? 14 : depth === 3 ? 13 : 12
    h.setAttribute('style', [`font-weight:700`, `font-size:${size}px`, 'line-height:1.2', 'color:var(--kg-text)'].join(';'))
    appendText(h, block.title)
    body.appendChild(h)
    return body
  }

  const p = createEl(doc, 'div')
  p.setAttribute('style', ['font-size:12px', 'line-height:1.35', 'color:var(--kg-text)', 'white-space:pre-wrap'].join(';'))
  appendText(p, block.summary || block.title)
  body.appendChild(p)
  return body
}

export function injectMarkdownDesignBlocksIntoSvgEl(args: {
  svgEl: SVGSVGElement
  blocks: MarkdownDesignBlock[]
  maxBlocks?: number
}): void {
  const svgEl = args.svgEl
  const blocks = Array.isArray(args.blocks) ? args.blocks : []
  if (!svgEl || blocks.length === 0) return

  const maxBlocksRaw = typeof args.maxBlocks === 'number' && Number.isFinite(args.maxBlocks) ? Math.floor(args.maxBlocks) : 0
  const maxBlocks = maxBlocksRaw > 0 ? Math.max(1, Math.min(600, maxBlocksRaw)) : 240

  const doc = svgEl.ownerDocument
  if (!doc) return
  const ns = svgEl.namespaceURI || 'http://www.w3.org/2000/svg'

  const zoomRoot = (() => {
    const kids = Array.from(svgEl.children)
    for (let i = 0; i < kids.length; i += 1) {
      const el = kids[i] as Element
      if (String((el as any).tagName || '').toLowerCase() === 'g') return el as SVGGElement
    }
    return null
  })()
  if (!zoomRoot) return

  let layer = zoomRoot.querySelector('g[data-kg-layer="markdown-design-blocks"]') as SVGGElement | null
  if (!layer) {
    layer = doc.createElementNS(ns, 'g') as SVGGElement
    layer.setAttribute('data-kg-layer', 'markdown-design-blocks')
    zoomRoot.appendChild(layer)
  }
  while (layer.firstChild) layer.removeChild(layer.firstChild)

  for (let i = 0; i < blocks.length && i < maxBlocks; i += 1) {
    const b = blocks[i]!
    const x = Number(b.x)
    const y = Number(b.y)
    const w = Number(b.w)
    const h = Number(b.h)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue

    const fo = doc.createElementNS(ns, 'foreignObject') as unknown as SVGForeignObjectElement
    fo.setAttribute('x', String(x))
    fo.setAttribute('y', String(y))
    fo.setAttribute('width', String(w))
    fo.setAttribute('height', String(h))
    fo.setAttribute('data-kg-markdown-block-id', String(b.id || ''))
    ;(fo.style as any).overflow = 'hidden'
    ;(fo.style as any).pointerEvents = 'none'

    const root = createEl(doc, 'section')
    ensureXmlNamespaceDeclaration(root, 'xmlns', XHTML_NS)
    root.setAttribute('style', `${styleToString(PANEL_FRAME_ROOT_STYLE)};width:100%;height:100%;pointer-events:none`)

    const header = createEl(doc, 'header')
    header.setAttribute('style', `${styleToString(PANEL_FRAME_HEADER_STYLE)};pointer-events:none`)
    const title = createEl(doc, 'h3')
    title.setAttribute('style', styleToString(PANEL_FRAME_HEADER_TITLE_STYLE))
    appendText(title, b.title || 'Block')
    header.appendChild(title)
    root.appendChild(header)
    root.appendChild(renderBodyContent(doc, b))

    fo.appendChild(root)
    layer.appendChild(fo)
  }
}

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'

export const ensureXmlNamespaceDeclaration = (element: Element, name: string, value: string): void => {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name === name && attribute.namespaceURI !== XMLNS_NS) element.removeAttributeNode(attribute)
  }
  element.setAttributeNS(XMLNS_NS, name, value)
}

export const ensureSvgNamespaces = (svg: SVGSVGElement): void => {
  ensureXmlNamespaceDeclaration(svg, 'xmlns', SVG_NS)
  ensureXmlNamespaceDeclaration(svg, 'xmlns:xlink', XLINK_NS)
}

export const DEFAULT_STYLE_PROPS: readonly string[] = [
  'color', 'opacity', 'display', 'visibility',
  'pointer-events', 'cursor', 'fill', 'fill-opacity',
  'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-opacity', 'marker', 'marker-start', 'marker-mid',
  'marker-end', 'paint-order', 'vector-effect', 'shape-rendering',
  'text-rendering', 'overflow', 'clip-rule', 'transform',
  'transform-origin', 'transform-box', 'animation', 'animation-name',
  'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count',
  'animation-direction', 'animation-fill-mode', 'animation-play-state', 'transition',
  'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'baseline-shift', 'filter', 'mix-blend-mode', 'clip-path',
  'mask', 'stop-color', 'stop-opacity',
] as const

export const MARKDOWN_DESIGN_BLOCK_SELECTOR = '[data-md-id]'

const readMarkdownDesignBlockId = (el: Element): string => {
  return String(el.getAttribute('data-md-id') || '').trim()
}

export const inlineComputedStylesIntoClone = (srcSvg: Element, dstSvg: Element, props: readonly string[]) => {
  const srcAll = [srcSvg, ...Array.from(srcSvg.querySelectorAll('*'))]
  const dstAll = [dstSvg, ...Array.from(dstSvg.querySelectorAll('*'))]
  const len = Math.min(srcAll.length, dstAll.length)
  for (let i = 0; i < len; i += 1) {
    const src = srcAll[i] as Element
    const dst = dstAll[i] as Element
    let cs: CSSStyleDeclaration | null = null
    try {
      cs = getComputedStyle(src)
    } catch {
      cs = null
    }
    if (!cs) continue

    const kv: string[] = []
    for (let p = 0; p < props.length; p += 1) {
      const prop = props[p] || ''
      let v = ''
      try {
        v = String(cs.getPropertyValue(prop) || '').trim()
      } catch {
        v = ''
      }
      if (!v) continue
      kv.push(`${prop}:${v}`)
    }
    if (kv.length > 0) {
      try {
        dst.setAttribute('style', kv.join(';'))
      } catch {
        void 0
      }
    } else {
      try {
        dst.removeAttribute('style')
      } catch {
        void 0
      }
    }
  }
}

export const HTML_STYLE_PROPS: readonly string[] = [
  ...DEFAULT_STYLE_PROPS,
  'background', 'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat',
  'border', 'border-radius', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-color', 'border-width', 'border-style',
  'border-top-color', 'border-top-width', 'border-top-style',
  'border-right-color', 'border-right-width', 'border-right-style',
  'border-bottom-color', 'border-bottom-width', 'border-bottom-style',
  'border-left-color', 'border-left-width', 'border-left-style',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'overflow', 'overflow-wrap', 'white-space', 'text-overflow', 'word-break',
  'text-decoration', 'text-transform', 'line-height', 'list-style', 'position',
  'top', 'left', 'right', 'bottom', 'z-index', 'transform', 'transform-origin',
  'align-items', 'justify-content', 'flex-direction', 'flex-wrap', 'display', 'gap',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-area', 'grid-template-areas', 'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'vertical-align',
  'box-shadow', 'backdrop-filter', 'outline', 'outline-color', 'outline-width', 'outline-style', 'outline-offset',
  'text-indent', 'text-shadow', 'border-collapse', 'border-spacing', 'table-layout', 'empty-cells'
]

export const cloneMarkdownBlockForSvg = (block: HTMLElement, inlineStyles = true): HTMLElement => {
  const content = block.cloneNode(true) as HTMLElement
  content.removeAttribute('style')
  content.style.margin = '0'
  content.style.padding = '0'
  content.style.width = '100%'
  content.style.height = '100%'
  content.style.overflow = 'hidden'
  content.style.pointerEvents = 'none'
  if (inlineStyles) inlineComputedStylesIntoClone(block, content, HTML_STYLE_PROPS)
  ensureXmlNamespaceDeclaration(content, 'xmlns', XHTML_NS)
  return content
}

export const injectLiveMarkdownDesignBlocksIntoSvgMarkup = (svgMarkup: string): string => {
  const raw = String(svgMarkup || '').trim()
  if (!raw) return ''
  if (typeof document === 'undefined') return raw
  const noXml = raw.replace(/^<\?xml[^>]*>\s*/i, '')

  let parsedDoc: Document
  try {
    const parser = new DOMParser()
    parsedDoc = parser.parseFromString(noXml, 'image/svg+xml')
  } catch {
    return raw
  }

  const parsedSvg = parsedDoc.querySelector('svg') as unknown as SVGSVGElement | null
  if (!parsedSvg) return raw

  const svg = (() => {
    try {
      return document.importNode(parsedSvg, true) as unknown as SVGSVGElement
    } catch {
      return parsedSvg.cloneNode(true) as SVGSVGElement
    }
  })()

  const doc = svg.ownerDocument
  if (!doc) return raw

  ensureSvgNamespaces(svg)

  const findScopeEl = (): Element | null => {
    try {
      const root = typeof document !== 'undefined' ? document.getElementById('kg-root') : null
      if (root) return root
    } catch {
      void 0
    }
    try {
      return typeof document !== 'undefined' ? document.body : null
    } catch {
      return null
    }
  }

  const scopeEl = findScopeEl()
  const blocks = scopeEl ? scopeEl.querySelectorAll(MARKDOWN_DESIGN_BLOCK_SELECTOR) : null
  if (!blocks || blocks.length === 0) return raw

  const zoomRoot = (svg.querySelector('g') as unknown as SVGGElement | null) || null
  if (!zoomRoot) return raw

  let mdLayer = zoomRoot.querySelector('g[data-kg-layer="markdown-design-blocks"]') as SVGGElement | null
  if (!mdLayer) {
    mdLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'g') as unknown as SVGGElement
    mdLayer.setAttribute('data-kg-layer', 'markdown-design-blocks')
    zoomRoot.appendChild(mdLayer)
  }
  while (mdLayer.firstChild) mdLayer.removeChild(mdLayer.firstChild)

  for (let i = 0; i < blocks.length; i += 1) {
    try {
      const block = blocks[i] as HTMLElement
      const wx = Number(block.getAttribute('data-kg-world-x'))
      const wy = Number(block.getAttribute('data-kg-world-y'))
      const ww = Number(block.getAttribute('data-kg-world-w'))
      const wh = Number(block.getAttribute('data-kg-world-h'))
      if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(ww) || !Number.isFinite(wh) || ww <= 0 || wh <= 0) continue

      const fo = doc.createElementNS('http://www.w3.org/2000/svg', 'foreignObject') as unknown as SVGForeignObjectElement
      fo.setAttribute('x', String(wx))
      fo.setAttribute('y', String(wy))
      fo.setAttribute('width', String(ww))
      fo.setAttribute('height', String(wh))
      try {
        ;(fo.style as any).overflow = 'visible'
      } catch {
        void 0
      }

      const content = cloneMarkdownBlockForSvg(block)
      fo.appendChild(content)
      mdLayer.appendChild(fo)
    } catch {
      void 0
    }
  }

  try {
    const out = new XMLSerializer().serializeToString(svg)
    const trimmed = String(out || '').trim()
    if (!trimmed) return raw
    return raw.startsWith('<?xml') ? `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}\n` : trimmed
  } catch {
    try {
      const alt = String((svg as unknown as { outerHTML?: unknown }).outerHTML || '').trim()
      if (alt) return alt
    } catch {
      void 0
    }
    return raw
  }
}

export const injectLiveMarkdownDesignBlocksIntoSvgMarkupAnchored = (args: {
  svgMarkup: string
  anchorNodeIdByBlockId?: Record<string, string> | null
  nodePosById?: Record<string, { x: number; y: number }> | null
}): string => {
  const raw = String(args.svgMarkup || '').trim()
  if (!raw) return ''
  if (typeof document === 'undefined') return raw
  const noXml = raw.replace(/^<\?xml[^>]*>\s*/i, '')

  let parsedDoc: Document
  try {
    const parser = new DOMParser()
    parsedDoc = parser.parseFromString(noXml, 'image/svg+xml')
  } catch {
    return raw
  }

  const parsedSvg = parsedDoc.querySelector('svg') as unknown as SVGSVGElement | null
  if (!parsedSvg) return raw

  const svg = (() => {
    try {
      return document.importNode(parsedSvg, true) as unknown as SVGSVGElement
    } catch {
      return parsedSvg.cloneNode(true) as SVGSVGElement
    }
  })()

  const doc = svg.ownerDocument
  if (!doc) return raw

  ensureSvgNamespaces(svg)

  const scopeEl = (() => {
    try {
      const root = document.getElementById('kg-root')
      if (root) return root
    } catch {
      void 0
    }
    try {
      return document.body
    } catch {
      return null
    }
  })()

  const blocks = scopeEl ? scopeEl.querySelectorAll(MARKDOWN_DESIGN_BLOCK_SELECTOR) : null
  if (!blocks || blocks.length === 0) return raw

  const zoomRoot = (svg.querySelector('g') as unknown as SVGGElement | null) || null
  if (!zoomRoot) return raw

  let mdLayer = zoomRoot.querySelector('g[data-kg-layer="markdown-design-blocks"]') as SVGGElement | null
  if (!mdLayer) {
    mdLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'g') as unknown as SVGGElement
    mdLayer.setAttribute('data-kg-layer', 'markdown-design-blocks')
    zoomRoot.appendChild(mdLayer)
  }
  while (mdLayer.firstChild) mdLayer.removeChild(mdLayer.firstChild)

  const anchorMap = args.anchorNodeIdByBlockId || null
  const nodePosById = args.nodePosById || null

  for (let i = 0; i < blocks.length; i += 1) {
    try {
      const block = blocks[i] as HTMLElement
      const blockId = readMarkdownDesignBlockId(block)
      const ww = Number(block.getAttribute('data-kg-world-w'))
      const wh = Number(block.getAttribute('data-kg-world-h'))
      if (!Number.isFinite(ww) || !Number.isFinite(wh) || ww <= 0 || wh <= 0) continue

      const wx0 = Number(block.getAttribute('data-kg-world-x'))
      const wy0 = Number(block.getAttribute('data-kg-world-y'))
      const baseX = Number.isFinite(wx0) ? wx0 : 0
      const baseY = Number.isFinite(wy0) ? wy0 : 0

      const anchorId = blockId && anchorMap && anchorMap[blockId] ? String(anchorMap[blockId] || '').trim() : blockId
      const nodePos = anchorId && nodePosById ? nodePosById[anchorId] : null
      const cx = nodePos && Number.isFinite(nodePos.x) ? nodePos.x : baseX + ww / 2
      const cy = nodePos && Number.isFinite(nodePos.y) ? nodePos.y : baseY + wh / 2
      const x = cx - ww / 2
      const y = cy - wh / 2

      const fo = doc.createElementNS('http://www.w3.org/2000/svg', 'foreignObject') as unknown as SVGForeignObjectElement
      fo.setAttribute('x', String(x))
      fo.setAttribute('y', String(y))
      fo.setAttribute('width', String(ww))
      fo.setAttribute('height', String(wh))
      if (anchorId) fo.setAttribute('data-kg-anchor-node-id', anchorId)
      if (blockId) fo.setAttribute('data-kg-markdown-block-id', blockId)
      try {
        ;(fo.style as any).overflow = 'visible'
      } catch {
        void 0
      }

      const content = cloneMarkdownBlockForSvg(block)
      fo.appendChild(content)
      mdLayer.appendChild(fo)
    } catch {
      void 0
    }
  }

  try {
    const out = new XMLSerializer().serializeToString(svg)
    const trimmed = String(out || '').trim()
    if (!trimmed) return raw
    return raw.startsWith('<?xml') ? `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}\n` : trimmed
  } catch {
    try {
      const alt = String((svg as unknown as { outerHTML?: unknown }).outerHTML || '').trim()
      if (alt) return alt
    } catch {
      void 0
    }
    return raw
  }
}
