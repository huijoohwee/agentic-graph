import {
  SVG_NS, XLINK_NS, DEFAULT_STYLE_PROPS, MARKDOWN_DESIGN_BLOCK_SELECTOR,
  ensureSvgNamespaces, inlineComputedStylesIntoClone, cloneMarkdownBlockForSvg,
} from '@/lib/graph/htmlViewer/markdownDesignSvgOverlay'

// Preserve the snapshot API used by toolbar, panel and standalone HTML exporters.
export {
  HTML_STYLE_PROPS, inlineComputedStylesIntoClone,
  injectLiveMarkdownDesignBlocksIntoSvgMarkup, injectLiveMarkdownDesignBlocksIntoSvgMarkupAnchored,
} from '@/lib/graph/htmlViewer/markdownDesignSvgOverlay'

export type SvgSnapshotOptions = {
  includeXmlDeclaration?: boolean
  paddingPx?: number
  inlineComputedStyles?: boolean
  removeCssClasses?: boolean
  removeDataAttributes?: boolean
  removeZoomTransformOnFirstGroup?: boolean
  styleProperties?: readonly string[]
}

const clampFinite = (n: unknown, min: number, max: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : NaN
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

const removeDataAttrsDeep = (root: Element) => {
  const all = root.querySelectorAll('*')
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i] as Element
    const attrs = el.attributes
    for (let j = attrs.length - 1; j >= 0; j -= 1) {
      const a = attrs.item(j)
      const name = a?.name || ''
      if (name.startsWith('data-')) {
        try {
          el.removeAttribute(name)
        } catch {
          void 0
        }
      }
    }
  }
}

const removeClassesDeep = (root: Element) => {
  const all = root.querySelectorAll('*')
  for (let i = 0; i < all.length; i += 1) {
    const el = all[i] as Element
    try {
      el.removeAttribute('class')
    } catch {
      void 0
    }
  }
}

const computeContentBBoxFromClone = (
  svgClone: SVGSVGElement,
  opts: { removeZoomTransformOnFirstGroup?: boolean },
): { x: number; y: number; width: number; height: number } | null => {
  if (typeof document === 'undefined') return null
  const host = document.createElement('section')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '-100000px'
  host.style.width = '0'
  host.style.height = '0'
  host.style.overflow = 'hidden'
  host.style.opacity = '0'
  host.style.pointerEvents = 'none'

  const g = svgClone.querySelector('g')
  if (opts.removeZoomTransformOnFirstGroup !== false && g) {
    try {
      g.removeAttribute('transform')
    } catch {
      void 0
    }
  }

  try {
    document.body.appendChild(host)
    host.appendChild(svgClone)
    const target = (g || svgClone) as unknown as SVGGraphicsElement
    if (typeof target.getBBox !== 'function') return null
    const bbox = target.getBBox()
    const x = bbox && Number.isFinite(bbox.x) ? bbox.x : NaN
    const y = bbox && Number.isFinite(bbox.y) ? bbox.y : NaN
    const width = bbox && Number.isFinite(bbox.width) ? bbox.width : NaN
    const height = bbox && Number.isFinite(bbox.height) ? bbox.height : NaN
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null
    if (width <= 0 || height <= 0) return null
    return { x, y, width, height }
  } catch {
    return null
  } finally {
    try {
      host.remove()
    } catch {
      void 0
    }
  }
}

export const buildStandaloneSvgMarkupFromElement = (svgEl: SVGSVGElement, options?: SvgSnapshotOptions): string | null => {
  try {
    const opts: SvgSnapshotOptions = options || {}
    const paddingPx = clampFinite(opts.paddingPx, 0, 2000)
    const includeXmlDeclaration = opts.includeXmlDeclaration !== false
    const inlineComputedStyles = opts.inlineComputedStyles !== false
    const removeCssClasses = opts.removeCssClasses !== false
    const removeDataAttributes = opts.removeDataAttributes === true
    const removeZoomTransformOnFirstGroup = opts.removeZoomTransformOnFirstGroup !== false
    const styleProps = Array.isArray(opts.styleProperties) && opts.styleProperties.length > 0 ? opts.styleProperties : DEFAULT_STYLE_PROPS

    const clone = svgEl.cloneNode(true) as SVGSVGElement
    try {
      clone.removeAttribute('style')
    } catch {
      void 0
    }
    ensureSvgNamespaces(clone)

    if (removeCssClasses) removeClassesDeep(clone)
    if (removeDataAttributes) removeDataAttrsDeep(clone)

    if (inlineComputedStyles) {
      inlineComputedStylesIntoClone(svgEl, clone, styleProps)
    }

    const bbox = computeContentBBoxFromClone(clone, { removeZoomTransformOnFirstGroup })

    const applyFallbackSize = () => {
      const vb = clone.viewBox && clone.viewBox.baseVal ? clone.viewBox.baseVal : null
      const w = vb && vb.width > 0 ? vb.width : svgEl.clientWidth || 800
      const h = vb && vb.height > 0 ? vb.height : svgEl.clientHeight || 600
      const width = Math.max(1, Math.floor(w))
      const height = Math.max(1, Math.floor(h))
      try {
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
        clone.setAttribute('width', String(width))
        clone.setAttribute('height', String(height))
      } catch {
        void 0
      }
    }

    if (bbox) {
      const x = bbox.x - paddingPx
      const y = bbox.y - paddingPx
      const w = bbox.width + paddingPx * 2
      const h = bbox.height + paddingPx * 2
      const width = Math.max(1, Math.ceil(w))
      const height = Math.max(1, Math.ceil(h))
      try {
        clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
        clone.setAttribute('width', String(width))
        clone.setAttribute('height', String(height))
        clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      } catch {
        void 0
      }
    } else {
      applyFallbackSize()
    }

    const markup = new XMLSerializer().serializeToString(clone)
    const trimmed = String(markup || '').trim()
    if (!trimmed) return null
    return includeXmlDeclaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}\n` : trimmed
  } catch {
    return null
  }
}

export const buildViewportSvgMarkupFromElement = (svgEl: SVGSVGElement, options?: SvgSnapshotOptions): string | null => {
  try {
    const opts: SvgSnapshotOptions = options || {}
    const includeXmlDeclaration = opts.includeXmlDeclaration !== false
    const inlineComputedStyles = opts.inlineComputedStyles !== false
    const removeCssClasses = opts.removeCssClasses !== false
    const removeDataAttributes = opts.removeDataAttributes === true
    const styleProps = Array.isArray(opts.styleProperties) && opts.styleProperties.length > 0 ? opts.styleProperties : DEFAULT_STYLE_PROPS

    const clone = svgEl.cloneNode(true) as SVGSVGElement
    try {
      clone.removeAttribute('style')
    } catch {
      void 0
    }
    ensureSvgNamespaces(clone)

    if (removeCssClasses) removeClassesDeep(clone)
    if (removeDataAttributes) removeDataAttrsDeep(clone)

    if (inlineComputedStyles) {
      inlineComputedStylesIntoClone(svgEl, clone, styleProps)
    }

    try {
      const findScopeEl = (): Element | null => {
        let cur: Element | null = svgEl
        for (let i = 0; i < 24 && cur; i += 1) {
          const id = String((cur as any).id || '')
          if (id === 'kg-root') return cur
          cur = cur.parentElement
        }
        return svgEl.ownerDocument?.body ?? null
      }

      const scopeEl = findScopeEl()
      const blocks = scopeEl ? scopeEl.querySelectorAll(MARKDOWN_DESIGN_BLOCK_SELECTOR) : null
      if (blocks && blocks.length > 0) {
        const zoomRoot = (() => {
          const kids = Array.from(clone.children)
          for (let i = 0; i < kids.length; i += 1) {
            const el = kids[i] as Element
            if (String((el as any).tagName || '').toLowerCase() === 'g') return el as SVGGElement
          }
          return null
        })()
        if (zoomRoot) {
          let mdLayer = zoomRoot.querySelector('g[data-kg-layer="markdown-design-blocks"]')
          if (!mdLayer) {
            mdLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
            mdLayer.setAttribute('data-kg-layer', 'markdown-design-blocks')
            zoomRoot.appendChild(mdLayer)
          }
          for (let i = 0; i < blocks.length; i += 1) {
            const block = blocks[i] as HTMLElement
            const wx = Number(block.getAttribute('data-kg-world-x'))
            const wy = Number(block.getAttribute('data-kg-world-y'))
            const ww = Number(block.getAttribute('data-kg-world-w'))
            const wh = Number(block.getAttribute('data-kg-world-h'))
            if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(ww) || !Number.isFinite(wh)) continue

            const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject')
            fo.setAttribute('x', String(wx))
            fo.setAttribute('y', String(wy))
            fo.setAttribute('width', String(ww))
            fo.setAttribute('height', String(wh))
            fo.style.overflow = 'visible'

            const content = cloneMarkdownBlockForSvg(block, inlineComputedStyles)
            fo.appendChild(content)
            mdLayer.appendChild(fo)
          }
        }
      }
    } catch (err) {
      console.warn('Failed to snapshot markdown design blocks', err)
    }

    const rect = (() => {
      try {
        return svgEl.getBoundingClientRect()
      } catch {
        return null
      }
    })()
    const w = rect && Number.isFinite(rect.width) && rect.width > 0 ? Math.floor(rect.width) : svgEl.clientWidth || 800
    const h = rect && Number.isFinite(rect.height) && rect.height > 0 ? Math.floor(rect.height) : svgEl.clientHeight || 600
    const width = Math.max(1, Math.floor(w))
    const height = Math.max(1, Math.floor(h))

    try {
      const viewBox = String(svgEl.getAttribute('viewBox') || '').trim()
      if (viewBox) clone.setAttribute('viewBox', viewBox)
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      const par = String(svgEl.getAttribute('preserveAspectRatio') || '').trim()
      if (par) clone.setAttribute('preserveAspectRatio', par)
    } catch {
      void 0
    }

    const markup = new XMLSerializer().serializeToString(clone)
    const trimmed = String(markup || '').trim()
    if (!trimmed) return null
    return includeXmlDeclaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${trimmed}\n` : trimmed
  } catch {
    return null
  }
}

const blobToDataUrl = async (blob: Blob): Promise<string | null> => {
  try {
    const res = await new Promise<string | null>(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
    return res
  } catch {
    return null
  }
}

export const readImageSizeFromBlob = async (blob: Blob): Promise<{ w: number; h: number } | null> => {
  try {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob)
        const w = bitmap && Number.isFinite(bitmap.width) ? bitmap.width : NaN
        const h = bitmap && Number.isFinite(bitmap.height) ? bitmap.height : NaN
        try {
          bitmap.close()
        } catch {
          void 0
        }
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w: Math.floor(w), h: Math.floor(h) }
      } catch {
        void 0
      }
    }

    const url = URL.createObjectURL(blob)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image load failed'))
        img.src = url
      })
      const w = Number.isFinite(img.naturalWidth) ? img.naturalWidth : NaN
      const h = Number.isFinite(img.naturalHeight) ? img.naturalHeight : NaN
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w: Math.floor(w), h: Math.floor(h) }
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

export const wrapPngBlobAsSvgMarkup = async (
  pngBlob: Blob,
  options?: { includeXmlDeclaration?: boolean; width?: number; height?: number },
): Promise<string | null> => {
  try {
    const dataUrl = await blobToDataUrl(pngBlob)
    if (!dataUrl) return null

    const size = await readImageSizeFromBlob(pngBlob)
    const w = Math.max(1, Math.floor(options?.width && options.width > 0 ? options.width : size?.w || 0))
    const h = Math.max(1, Math.floor(options?.height && options.height > 0 ? options.height : size?.h || 0))
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null

    const includeXmlDeclaration = options?.includeXmlDeclaration !== false
    const svg =
      `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<image href="${dataUrl}" xlink:href="${dataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>` +
      `</svg>`
    return includeXmlDeclaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n` : svg
  } catch {
    return null
  }
}

export const readCanvasViewportSizeFromDom = (): { w: number; h: number } => {
  const pickRect = (): DOMRect | null => {
    const candidate =
      (document.querySelector('section[aria-label="Canvas viewport"]') as HTMLElement | null) ||
      (document.querySelector('section[aria-label="Canvas Preview Only"]') as HTMLElement | null) ||
      (document.querySelector('main[aria-label="Graph Canvas"]') as HTMLElement | null) ||
      (document.querySelector('section[aria-label="Design Canvas"]') as HTMLElement | null) ||
      (document.querySelector('section[aria-label="Flow Canvas"]') as HTMLElement | null) ||
      (document.querySelector('section[aria-label="Storyboard Widget"]') as HTMLElement | null)
    if (!candidate) return null
    try {
      return candidate.getBoundingClientRect()
    } catch {
      return null
    }
  }
  const rect = pickRect()
  const w = rect && rect.width ? Math.max(1, Math.floor(rect.width)) : 1280
  const h = rect && rect.height ? Math.max(1, Math.floor(rect.height)) : 720
  return { w, h }
}

export const captureVisibleCanvasPngBlobFromDom = async (): Promise<Blob | null> => {
  try {
    const root =
      (document.querySelector('section[aria-label="Canvas viewport"]') as HTMLElement | null) ||
      (document.querySelector('section[aria-label="Canvas Preview Only"]') as HTMLElement | null) ||
      document.body
    const candidates = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[]
    if (candidates.length === 0) return null

    const isVisible = (el: HTMLCanvasElement): { ok: boolean; area: number } => {
      if (!el.isConnected) return { ok: false, area: 0 }
      let rect: DOMRect | null = null
      try {
        rect = el.getBoundingClientRect()
      } catch {
        rect = null
      }
      const w = rect && Number.isFinite(rect.width) ? rect.width : 0
      const h = rect && Number.isFinite(rect.height) ? rect.height : 0
      if (!(w > 2 && h > 2)) return { ok: false, area: 0 }
      try {
        const cs = getComputedStyle(el)
        if (cs.display === 'none') return { ok: false, area: 0 }
        if (cs.visibility === 'hidden') return { ok: false, area: 0 }
        const op = Number(cs.opacity)
        if (Number.isFinite(op) && op <= 0.01) return { ok: false, area: 0 }
      } catch {
        void 0
      }
      return { ok: true, area: w * h }
    }

    const prefer = (el: HTMLCanvasElement): number => {
      const cls = String(el.className || '')
      if (cls.includes('maplibregl-canvas') || cls.includes('mapboxgl-canvas')) return 10_000_000
      return 0
    }

    let best: HTMLCanvasElement | null = null
    let bestScore = -1
    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i]!
      const vis = isVisible(c)
      if (!vis.ok) continue
      const score = vis.area + prefer(c)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    if (!best) return null

    const blob = await new Promise<Blob | null>(resolve => best!.toBlob(b => resolve(b), 'image/png'))
    return blob || null
  } catch {
    return null
  }
}
