import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { inferMediaKindFromUrl } from 'grph-shared/rich-media/mediaKind'
import { normalizeSemanticHtmlContainers } from '@/lib/html/semanticHtml'

export type HtmlViewerMediaNode = {
  id: string
  title: string
  url: string
  openUrl?: string
  interactive: boolean
  kind: 'iframe' | 'image' | 'svg' | 'video' | 'audio'
}

export type HtmlViewerMarkdownSeed = {
  id: string
  anchorNodeId?: string
  title: string
  summary: string
  preview: { kind: 'other' }
  x: number
  y: number
  w: number
  h: number
}

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const readNumAttr = (el: Element, name: string): number | null => {
  const raw = String(el.getAttribute(name) || '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const readRichMediaPanelTitle = (el: Element): string => {
  const titleAttr = String(el.getAttribute('data-kg-title') || '').trim()
  if (titleAttr) return titleAttr
  const labeledLink = el.querySelector('a[aria-label]') as HTMLElement | null
  const linkLabel = String(labeledLink?.getAttribute('aria-label') || '').trim()
  if (linkLabel) return linkLabel
  const titledFrame = el.querySelector('iframe[title]') as HTMLElement | null
  const frameTitle = String(titledFrame?.getAttribute('title') || '').trim()
  if (frameTitle) return frameTitle
  const titledMedia = el.querySelector('video[title],audio[title],img[alt]') as HTMLElement | null
  const mediaTitle = String(
    titledMedia?.getAttribute('title') || titledMedia?.getAttribute('alt') || '',
  ).trim()
  if (mediaTitle) return mediaTitle
  return ''
}

const readMarkdownOverlayIdFromElement = (el: Element): string => {
  return String(el.getAttribute('data-md-id') || '').trim()
}

const readMarkdownOverlayAnchorNodeIdFromElement = (el: Element): string => {
  return String(el.getAttribute('data-kg-anchor-node-id') || '').trim()
}

const canonicalizeMarkdownOverlayElement = (el: Element, args: { id: string; anchorNodeId?: string }): void => {
  try {
    el.setAttribute('data-md-id', args.id)
  } catch {
    void 0
  }
  try {
    if (args.anchorNodeId) el.setAttribute('data-kg-anchor-node-id', args.anchorNodeId)
    else el.removeAttribute('data-kg-anchor-node-id')
  } catch {
    void 0
  }
}

export const inferMediaKind = (rawUrl: string): HtmlViewerMediaNode['kind'] => {
  const inferred = inferMediaKindFromUrl(rawUrl)
  if (inferred === 'image' || inferred === 'svg' || inferred === 'video' || inferred === 'audio') return inferred
  return 'iframe'
}

const buildGraphNodeIdentity = (args: { graph: GraphData | null | undefined; svgMarkup: string }): {
  nodeIdSet: Set<string>
  edgeLinkedNodeIdSet: Set<string>
  resolveNodeId: (raw: string) => string
} => {
  const graph = args.graph
  const svgMarkup = String(args.svgMarkup || '')
  const nodes = Array.isArray(graph?.nodes) ? (graph!.nodes as GraphNode[]) : []
  const nodeIdSet = new Set<string>()
  for (let i = 0; i < nodes.length; i += 1) {
    const rawId = String(nodes[i]?.id || '').trim()
    if (!rawId) continue
    nodeIdSet.add(rawId)
  }

  if (svgMarkup.trim()) {
    const re = /\bdata-node-id\s*=\s*(?:"([^"]+)"|'([^']+)')/gi
    let m: RegExpExecArray | null = null
    while ((m = re.exec(svgMarkup))) {
      const rawId = String(m[1] || m[2] || '').trim()
      if (!rawId) continue
      nodeIdSet.add(rawId)
    }
  }

  const nodeIdBySuffix: Record<string, string> = {}
  for (const rawId of nodeIdSet) {
    const suffix = rawId.split('::').pop() || ''
    if (suffix && !nodeIdBySuffix[suffix]) nodeIdBySuffix[suffix] = rawId
  }

  const shouldSkipSuffixResolve = (id: string): boolean => {
    const s = String(id || '').trim()
    if (!s) return true
    const lower = s.toLowerCase()
    if (lower.includes('::blk:')) return true
    if (lower.includes('::block:')) return true
    if (lower.startsWith('blk:')) return true
    return false
  }

  const resolveNodeId = (raw: string): string => {
    const id = String(raw || '').trim()
    if (!id) return ''
    if (nodeIdSet.has(id)) return id
    if (shouldSkipSuffixResolve(id)) return id
    const suffix = id.split('::').pop() || ''
    if (!suffix) return id
    return nodeIdBySuffix[suffix] || id
  }
  const edges = Array.isArray(graph?.edges) ? (graph!.edges as GraphEdge[]) : []
  const edgeLinkedNodeIdSet = new Set<string>()

  const readEdgeEndpointId = (raw: unknown): string => {
    if (typeof raw === 'string') return String(raw || '').trim()
    if (raw && typeof raw === 'object') {
      const maybeId = (raw as { id?: unknown }).id
      if (typeof maybeId === 'string') return String(maybeId || '').trim()
    }
    return String(raw || '').trim()
  }

  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    const rawSource = (e as unknown as { source?: unknown; sourceId?: unknown; source_id?: unknown }).source
    const rawTarget = (e as unknown as { target?: unknown; targetId?: unknown; target_id?: unknown }).target
    const rawSourceAlt = (e as unknown as { sourceId?: unknown; source_id?: unknown }).sourceId ?? (e as unknown as { source_id?: unknown }).source_id
    const rawTargetAlt = (e as unknown as { targetId?: unknown; target_id?: unknown }).targetId ?? (e as unknown as { target_id?: unknown }).target_id
    const s = resolveNodeId(readEdgeEndpointId(rawSource ?? rawSourceAlt))
    const t = resolveNodeId(readEdgeEndpointId(rawTarget ?? rawTargetAlt))
    if (s && nodeIdSet.has(s)) edgeLinkedNodeIdSet.add(s)
    if (t && nodeIdSet.has(t)) edgeLinkedNodeIdSet.add(t)
  }

  if (svgMarkup.trim()) {
    const epRe = /\bdata-(?:source-id|source|target-id|target)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi
    let mm: RegExpExecArray | null = null
    while ((mm = epRe.exec(svgMarkup))) {
      const raw = String(mm[1] || mm[2] || '').trim()
      if (!raw) continue
      const id = resolveNodeId(raw)
      if (id && nodeIdSet.has(id)) edgeLinkedNodeIdSet.add(id)
    }
  }
  return { nodeIdSet, edgeLinkedNodeIdSet, resolveNodeId }
}

const filterStandaloneOverlayHtml = (args: {
  overlayHtml: string
  hasGraphNodeIdentity: boolean
  resolveOverlayNodeId: (raw: string) => string
  shouldKeepOverlayLinkedToGraph: (args0: { nodeId?: string; anchorNodeId?: string }) => boolean
}): string => {
  const raw = String(args.overlayHtml || '')
  if (!raw.trim()) return ''
  if (!args.hasGraphNodeIdentity) return raw
  const buildMarkdownOverlayKey = (args0: {
    idRaw?: string
    idNorm?: string
    anchorRaw?: string
    anchorNorm?: string
  }): string => {
    const anchor = String(args0.anchorNorm || args0.anchorRaw || '').trim()
    if (anchor) return `md:${anchor}`
    const id = String(args0.idNorm || args0.idRaw || '').trim()
    if (id) return `md:${id}`
    return ''
  }
  const readStyleScore = (styleRaw: string): number => {
    const style = String(styleRaw || '').toLowerCase()
    if (!style) return 0
    if (/(?:^|;)\s*display\s*:\s*none\b/i.test(style)) return -200
    if (/(?:^|;)\s*visibility\s*:\s*hidden\b/i.test(style)) return -180
    if (/(?:^|;)\s*opacity\s*:\s*0(?:\D|$)/i.test(style)) return -160
    const isFixed = /(?:^|;)\s*position\s*:\s*(?:fixed|sticky)\b/i.test(style)
    const hasExplicitAnchor = /(?:^|;)\s*(?:left|top|right|bottom|inset)\s*:/i.test(style)
    if (isFixed && hasExplicitAnchor) return -40
    if (isFixed) return -20
    return 0
  }
  const filterByRegex = (src: string): string => {
    const text = String(src || '')
    if (!text.trim()) return ''
    const upsertAttr = (tag: string, name: string, value: string): string => {
      if (!value) return tag
      const cleaned = String(tag || '').replace(new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, 'i'), '')
      return cleaned.replace(/>$/, ` ${name}="${value}">`)
    }
    const stripAttr = (tag: string, name: string): string => {
      return String(tag || '').replace(new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, 'ig'), '')
    }
    const readAttr = (tag: string, name: string): string => {
      const s = String(tag || '')
      const key1 = `${name}="`
      const key2 = `${name}='`
      const i1 = s.indexOf(key1)
      if (i1 >= 0) {
        const start = i1 + key1.length
        const end = s.indexOf('"', start)
        return end > start ? s.slice(start, end).trim() : ''
      }
      const i2 = s.indexOf(key2)
      if (i2 >= 0) {
        const start = i2 + key2.length
        const end = s.indexOf("'", start)
        return end > start ? s.slice(start, end).trim() : ''
      }
      return ''
    }
    const canonicalizeMarkdownOverlayTag = (tag: string, id: string, anchorNodeId: string): string => {
      let nextTag = tag
      nextTag = stripAttr(nextTag, 'data-kg-anchor-node-id')
      nextTag = upsertAttr(nextTag, 'data-md-id', id)
      if (anchorNodeId) nextTag = upsertAttr(nextTag, 'data-kg-anchor-node-id', anchorNodeId)
      return nextTag
    }
    const out: string[] = []
    let sawOverlayCandidate = false
    const mediaBestByKey = new Map<string, { chunk: string; score: number }>()
    const mdBestByKey = new Map<string, { chunk: string; score: number }>()
    const mediaRe = /<article\b[^>]*data-kg-rich-media-panel=(?:"1"|'1')[^>]*>[\s\S]*?<\/article>/gi
    let mm: RegExpExecArray | null = null
    while ((mm = mediaRe.exec(text))) {
      sawOverlayCandidate = true
      const chunk = mm[0] || ''
      const tag = chunk.match(/<article\b[^>]*>/i)?.[0] || ''
      const nodeId = args.resolveOverlayNodeId(readAttr(tag, 'data-node-id'))
      const key = nodeId ? `media:${nodeId}` : ''
      if (!nodeId || !key) continue
      if (!args.shouldKeepOverlayLinkedToGraph({ nodeId })) continue
      const normalized = chunk.replace(tag, upsertAttr(tag, 'data-node-id', nodeId))
      const score = readStyleScore(readAttr(tag, 'style'))
      const prev = mediaBestByKey.get(key)
      if (!prev || score > prev.score) {
        mediaBestByKey.set(key, { chunk: normalized, score })
      }
    }
    const mdRe = /<article\b[^>]*data-md-id[^>]*>[\s\S]*?<\/article>/gi
    let mdm: RegExpExecArray | null = null
    while ((mdm = mdRe.exec(text))) {
      sawOverlayCandidate = true
      const chunk = mdm[0] || ''
      const tag = chunk.match(/<article\b[^>]*>/i)?.[0] || ''
      const idRaw = readAttr(tag, 'data-md-id')
      const anchorRaw = readAttr(tag, 'data-kg-anchor-node-id')
      const idNorm = args.resolveOverlayNodeId(idRaw)
      const anchorNorm = args.resolveOverlayNodeId(anchorRaw)
      const key = buildMarkdownOverlayKey({ idRaw, idNorm, anchorRaw, anchorNorm })
      if (!key) continue
      if (!args.shouldKeepOverlayLinkedToGraph({ nodeId: idNorm || idRaw, anchorNodeId: anchorNorm || anchorRaw })) continue
      const nextTag = canonicalizeMarkdownOverlayTag(tag, idNorm || idRaw, anchorNorm || anchorRaw)
      const normalized = chunk.replace(tag, nextTag)
      const score = readStyleScore(readAttr(tag, 'style'))
      const prev = mdBestByKey.get(key)
      if (!prev || score > prev.score) {
        mdBestByKey.set(key, { chunk: normalized, score })
      }
    }
    for (const item of mediaBestByKey.values()) {
      if (item.score <= -100) continue
      out.push(item.chunk)
    }
    for (const item of mdBestByKey.values()) {
      if (item.score <= -100) continue
      out.push(item.chunk)
    }
    if (out.length <= 0) return sawOverlayCandidate ? '' : text
    return out.join('')
  }
  try {
    if (typeof DOMParser === 'undefined') return filterByRegex(raw)
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><body><section id="kg-overlay-filter-root">${raw}</section></body></html>`,
      'text/html',
    )
    const root = doc.querySelector('#kg-overlay-filter-root')
    if (!root) return raw
    const mediaBestByKey = new Map<string, { el: Element; score: number }>()
    const mediaEls = root.querySelectorAll('[data-kg-rich-media-panel="1"][data-kg-rich-media-render-surface="1"][data-node-id]')
    for (let i = 0; i < mediaEls.length; i += 1) {
      const el = mediaEls[i] as Element
      const rawId = String(el.getAttribute('data-node-id') || '').trim()
      const nodeId = args.resolveOverlayNodeId(rawId)
      const key = nodeId ? `media:${nodeId}` : ''
      const keep = !!nodeId && args.shouldKeepOverlayLinkedToGraph({ nodeId })
      if (!keep || !key) {
        el.remove()
        continue
      }
      const score = readStyleScore(String(el.getAttribute('style') || '').trim())
      const prev = mediaBestByKey.get(key)
      if (!prev || score > prev.score) {
        mediaBestByKey.set(key, { el, score })
      }
      try {
        el.setAttribute('data-node-id', nodeId)
      } catch {
        void 0
      }
    }
    for (let i = 0; i < mediaEls.length; i += 1) {
      const el = mediaEls[i] as Element
      if (!el || !el.isConnected) continue
      const nodeId = args.resolveOverlayNodeId(String(el.getAttribute('data-node-id') || '').trim())
      const key = nodeId ? `media:${nodeId}` : ''
      const keep = key ? mediaBestByKey.get(key) : null
      const keepEl = keep?.el || null
      if (!keepEl || keepEl !== el) {
        el.remove()
        continue
      }
      if ((keep?.score ?? 0) <= -100) el.remove()
    }
    const mdBestByKey = new Map<string, { el: Element; score: number }>()
    const mdEls = root.querySelectorAll('article[data-md-id]')
    for (let i = 0; i < mdEls.length; i += 1) {
      const el = mdEls[i] as Element
      const idRaw = readMarkdownOverlayIdFromElement(el)
      const anchorRaw = readMarkdownOverlayAnchorNodeIdFromElement(el)
      const idNorm = args.resolveOverlayNodeId(idRaw)
      const anchorNorm = args.resolveOverlayNodeId(anchorRaw)
      const key = buildMarkdownOverlayKey({ idRaw, idNorm, anchorRaw, anchorNorm })
      const keep = args.shouldKeepOverlayLinkedToGraph({ nodeId: idNorm || idRaw, anchorNodeId: anchorNorm || anchorRaw })
      if (!keep || !key) {
        el.remove()
        continue
      }
      const score = readStyleScore(String(el.getAttribute('style') || '').trim())
      const prev = mdBestByKey.get(key)
      if (!prev || score > prev.score) {
        mdBestByKey.set(key, { el, score })
      }
      canonicalizeMarkdownOverlayElement(el, { id: idNorm || idRaw, anchorNodeId: anchorNorm || anchorRaw })
    }
    for (let i = 0; i < mdEls.length; i += 1) {
      const el = mdEls[i] as Element
      if (!el || !el.isConnected) continue
      const idRaw = readMarkdownOverlayIdFromElement(el)
      const anchorRaw = readMarkdownOverlayAnchorNodeIdFromElement(el)
      const idNorm = args.resolveOverlayNodeId(idRaw)
      const anchorNorm = args.resolveOverlayNodeId(anchorRaw)
      const key = buildMarkdownOverlayKey({ idRaw, idNorm, anchorRaw, anchorNorm })
      const keep = key ? mdBestByKey.get(key) : null
      const keepEl = keep?.el || null
      if (!keepEl || keepEl !== el) {
        el.remove()
        continue
      }
      if ((keep?.score ?? 0) <= -100) el.remove()
    }
    return root.innerHTML
  } catch {
    return filterByRegex(raw)
  }
}

export function buildHtmlViewerOverlaySeeds(args: {
  graphData?: GraphData | null
  svgMarkup: string
  overlayHtml?: string
}) {
  const svgMarkupRaw = args.svgMarkup
  const overlayHtml = String(args.overlayHtml || '')
  const graphNodeIdentity = buildGraphNodeIdentity({ graph: args.graphData, svgMarkup: svgMarkupRaw })

  const resolveOverlayNodeId = (() => {
    return (raw: string): string => {
      return graphNodeIdentity.resolveNodeId(raw)
    }
  })()
  const shouldKeepOverlayLinkedToGraph = (args0: { nodeId?: string; anchorNodeId?: string }): boolean => {
    if (graphNodeIdentity.nodeIdSet.size === 0) return true
    const nodeId = resolveOverlayNodeId(String(args0.nodeId || '').trim())
    const anchorNodeId = resolveOverlayNodeId(String(args0.anchorNodeId || '').trim())
    const linkedToGraph =
      (nodeId && graphNodeIdentity.nodeIdSet.has(nodeId)) ||
      (anchorNodeId && graphNodeIdentity.nodeIdSet.has(anchorNodeId))
    if (!linkedToGraph) return false
    if (graphNodeIdentity.edgeLinkedNodeIdSet.size <= 0) return true
    return (
      (nodeId && graphNodeIdentity.edgeLinkedNodeIdSet.has(nodeId)) ||
      (anchorNodeId && graphNodeIdentity.edgeLinkedNodeIdSet.has(anchorNodeId))
    )
  }

  const overlayHtmlFilteredRaw = filterStandaloneOverlayHtml({
    overlayHtml,
    hasGraphNodeIdentity: graphNodeIdentity.nodeIdSet.size > 0,
    resolveOverlayNodeId,
    shouldKeepOverlayLinkedToGraph,
  })
  const overlayHtmlFiltered = normalizeSemanticHtmlContainers(overlayHtmlFilteredRaw)

  const overlaySeedsRaw = (() => {
    const mediaNodes: HtmlViewerMediaNode[] = []
    const markdownBlocks: HtmlViewerMarkdownSeed[] = []
    if (!overlayHtmlFiltered.trim()) return { mediaNodes, markdownBlocks }
    const parseByRegex = () => {
      const readAttr = (tag: string, name: string): string => {
        const s = String(tag || '')
        const key1 = `${name}="`
        const key2 = `${name}='`
        const i1 = s.indexOf(key1)
        if (i1 >= 0) {
          const start = i1 + key1.length
          const end = s.indexOf('"', start)
          return end > start ? s.slice(start, end).trim() : ''
        }
        const i2 = s.indexOf(key2)
        if (i2 >= 0) {
          const start = i2 + key2.length
          const end = s.indexOf("'", start)
          return end > start ? s.slice(start, end).trim() : ''
        }
        return ''
      }
      const mediaTagRe = /<article\b[^>]*data-kg-rich-media-panel=(?:"1"|'1')[^>]*>/gi
      let mm: RegExpExecArray | null = null
      while ((mm = mediaTagRe.exec(overlayHtmlFiltered))) {
        const tag = mm[0] || ''
        const id = resolveOverlayNodeId(readAttr(tag, 'data-node-id'))
        if (!id) continue
        const url = readAttr(tag, 'data-kg-url') || readAttr(tag, 'data-kg-open-url')
        if (!url) continue
        const kindRaw = readAttr(tag, 'data-kg-kind').toLowerCase()
        const kind = kindRaw === 'image' || kindRaw === 'svg' || kindRaw === 'video' || kindRaw === 'audio' || kindRaw === 'iframe'
          ? (kindRaw as HtmlViewerMediaNode['kind'])
          : inferMediaKind(url)
        mediaNodes.push({
          id,
          title: id,
          url,
          openUrl: readAttr(tag, 'data-kg-open-url') || url,
          interactive: true,
          kind,
        })
      }

      const mdTagRe = /<article\b[^>]*data-md-id[^>]*>/gi
      let mdm: RegExpExecArray | null = null
      while ((mdm = mdTagRe.exec(overlayHtmlFiltered))) {
        const tag = mdm[0] || ''
        const id = readAttr(tag, 'data-md-id')
        if (!id) continue
        const x = Number(readAttr(tag, 'data-kg-world-x'))
        const y = Number(readAttr(tag, 'data-kg-world-y'))
        const w = Number(readAttr(tag, 'data-kg-world-w'))
        const h = Number(readAttr(tag, 'data-kg-world-h'))
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h) || !(w > 0) || !(h > 0)) continue
        const anchorNodeId = resolveOverlayNodeId(readAttr(tag, 'data-kg-anchor-node-id'))
        markdownBlocks.push({
          id,
          anchorNodeId: anchorNodeId || undefined,
          title: id,
          summary: '',
          preview: { kind: 'other' },
          x,
          y,
          w,
          h,
        })
      }
    }
    try {
      if (typeof DOMParser === 'undefined') {
        parseByRegex()
        return { mediaNodes, markdownBlocks }
      }
      const doc = new DOMParser().parseFromString(
        `<!doctype html><html><body><section id="kg-overlay-seed">${overlayHtmlFiltered}</section></body></html>`,
        'text/html',
      )
      const root = doc.querySelector('#kg-overlay-seed')
      if (!root) {
        parseByRegex()
        return { mediaNodes, markdownBlocks }
      }

      const mediaEls = root.querySelectorAll('[data-kg-rich-media-panel="1"][data-kg-rich-media-render-surface="1"][data-node-id]')
      for (let i = 0; i < mediaEls.length; i += 1) {
        const el = mediaEls[i] as Element
        const idRaw = String(el.getAttribute('data-node-id') || '').trim()
        const id = resolveOverlayNodeId(idRaw)
        if (!id) continue
        const urlAttr = String(el.getAttribute('data-kg-url') || '').trim()
        const openUrlAttr = String(el.getAttribute('data-kg-open-url') || '').trim()
        const mediaEl = el.querySelector('iframe[src],img[src],video[src],audio[src],source[src]') as Element | null
        const srcUrl = mediaEl ? String(mediaEl.getAttribute('src') || '').trim() : ''
        const url = urlAttr || srcUrl || openUrlAttr
        if (!url) continue
        const kindAttr = String(el.getAttribute('data-kg-kind') || '').trim().toLowerCase()
        const kind = kindAttr === 'image' || kindAttr === 'svg' || kindAttr === 'video' || kindAttr === 'audio' || kindAttr === 'iframe'
          ? (kindAttr as HtmlViewerMediaNode['kind'])
          : inferMediaKind(url)
        const title = readRichMediaPanelTitle(el) || id
        mediaNodes.push({
          id,
          title,
          url,
          openUrl: openUrlAttr || url,
          interactive: true,
          kind,
        })
      }

      const mdEls = root.querySelectorAll('[data-md-id]')
      for (let i = 0; i < mdEls.length; i += 1) {
        const el = mdEls[i] as Element
        const id = String(el.getAttribute('data-md-id') || '').trim()
        if (!id) continue
        const x = readNumAttr(el, 'data-kg-world-x')
        const y = readNumAttr(el, 'data-kg-world-y')
        const w = readNumAttr(el, 'data-kg-world-w')
        const h = readNumAttr(el, 'data-kg-world-h')
        if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(w) || !isFiniteNum(h) || !(w > 0) || !(h > 0)) continue
        const anchorRaw = String(el.getAttribute('data-kg-anchor-node-id') || '').trim()
        const anchorNodeId = resolveOverlayNodeId(anchorRaw)
        const title =
          String((el.querySelector('.kg-mdTitle') as HTMLElement | null)?.textContent || '').trim() ||
          readRichMediaPanelTitle(el) ||
          id
        markdownBlocks.push({
          id,
          anchorNodeId: anchorNodeId || undefined,
          title,
          summary: '',
          preview: { kind: 'other' },
          x,
          y,
          w,
          h,
        })
      }
      if (mediaNodes.length === 0 && markdownBlocks.length === 0) parseByRegex()
    } catch {
      parseByRegex()
    }
    return { mediaNodes, markdownBlocks }
  })()
  const overlaySeeds = {
    mediaNodes: overlaySeedsRaw.mediaNodes.filter(n => shouldKeepOverlayLinkedToGraph({ nodeId: n.id })),
    markdownBlocks: overlaySeedsRaw.markdownBlocks.filter(b =>
      shouldKeepOverlayLinkedToGraph({ nodeId: b.id, anchorNodeId: b.anchorNodeId }),
    ),
  }
  return { graphNodeIdentity, resolveOverlayNodeId, shouldKeepOverlayLinkedToGraph, overlayHtmlFiltered, overlaySeeds }
}
