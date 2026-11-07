import { UI_FONT_SANS } from 'grph-shared/ui/typography'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { getNodeRenderRadius } from '@/lib/graph/schema'
import { getEdgeBaseStroke, getNodeBaseFill } from '@/lib/graph/visualStyles'
import { measureGraphElementCenterSet } from '@/lib/canvas/graph-elements/centroid'

const SVG_NS = 'http://www.w3.org/2000/svg'

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const clampFinite = (n: unknown, min: number, max: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : NaN
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

const escapeXml = (s: string): string => {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const readCssVar = (name: string, fallback: string): string => {
  try {
    if (typeof document === 'undefined') return fallback
    const el = document.documentElement
    const direct = String(el.style.getPropertyValue(name) || '').trim()
    if (direct) return direct
    const raw = String(getComputedStyle(el).getPropertyValue(name) || '').trim()
    return raw || fallback
  } catch {
    return fallback
  }
}

const resolveCssColor = (value: string, fallback: string): string => {
  let v = String(value || '').trim()
  if (!v) return fallback
  if (v.startsWith('--')) {
    v = readCssVar(v as `--${string}`, fallback || v)
  }
  for (let depth = 0; depth < 6; depth += 1) {
    const m = v.match(/^var\(\s*(--[^,\s\)]+)\s*(?:,\s*([^)]+)\s*)?\)$/i)
    if (!m) break
    const varName = String(m[1] || '').trim()
    const varFallback = String(m[2] || '').trim()
    const resolved = varName ? readCssVar(varName, varFallback || fallback || v) : ''
    const next = String(resolved || '').trim()
    if (!next || next === v) break
    v = next
  }
  if (v.startsWith('--')) {
    v = readCssVar(v as `--${string}`, fallback || v)
  }
  try {
    if (typeof document === 'undefined') return v
    const body = document.body
    if (!body) return v
    const el = document.createElement('span')
    el.style.color = v
    el.style.display = 'none'
    body.appendChild(el)
    const computed = String(getComputedStyle(el).color || '').trim()
    body.removeChild(el)
    return computed || v
  } catch {
    return v
  }
}

const estimateLabelWidthPx = (label: string, fontSizePx: number) => {
  const len = Math.max(0, String(label || '').length)
  return Math.max(0, Math.round(len * fontSizePx * 0.56))
}

const computeSeededPositions = (nodes: GraphNode[]): Record<string, { x: number; y: number }> => {
  const out: Record<string, { x: number; y: number }> = {}
  const n = nodes.length
  if (n <= 0) return out
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  const rows = Math.max(1, Math.ceil(n / cols))
  const spacing = 140
  const totalW = (cols - 1) * spacing
  const totalH = (rows - 1) * spacing
  const originX = -totalW / 2
  const originY = -totalH / 2
  for (let i = 0; i < n; i += 1) {
    const node = nodes[i]!
    const id = String(node.id || '').trim()
    if (!id) continue
    const c = i % cols
    const r = Math.floor(i / cols)
    out[id] = { x: originX + c * spacing, y: originY + r * spacing }
  }
  return out
}

const computeCenteredViewBoxForAspect = (args: {
  cx: number
  cy: number
  halfW: number
  halfH: number
  outAspect: number
  padding: number
}): { x: number; y: number; w: number; h: number } => {
  const padding = Math.max(0, args.padding)
  const baseHalfW = Math.max(1, args.halfW + padding)
  const baseHalfH = Math.max(1, args.halfH + padding)

  const outAspect = Number.isFinite(args.outAspect) && args.outAspect > 0 ? args.outAspect : 16 / 9
  let halfW = baseHalfW
  let halfH = baseHalfH
  const boxAspect = halfW / halfH
  if (boxAspect < outAspect) {
    halfW = halfH * outAspect
  } else if (boxAspect > outAspect) {
    halfH = halfW / outAspect
  }
  const w = halfW * 2
  const h = halfH * 2
  return { x: args.cx - halfW, y: args.cy - halfH, w, h }
}

export function exportGraphAsCenteredSvgMarkup(args: {
  graphData: GraphData
  schema: GraphSchema
  widthPx?: number
  heightPx?: number
  paddingPx?: number
  includeXmlDeclaration?: boolean
  animated?: boolean
}): string | null {
  try {
    const graph = args.graphData
    const schema = args.schema
    const nodesRaw = Array.isArray(graph.nodes) ? (graph.nodes as GraphNode[]) : []
    const edgesRaw = Array.isArray(graph.edges) ? (graph.edges as GraphEdge[]) : []
    const nodes: GraphNode[] = nodesRaw.filter(n => n && String(n.id || '').trim())
    const edges: GraphEdge[] = edgesRaw.filter(e => e && String(e.source || '').trim() && String(e.target || '').trim())
    if (nodes.length === 0) return null

    const widthPx = Math.max(1, Math.floor(clampFinite(args.widthPx, 1, 16384) || 1280))
    const heightPx = Math.max(1, Math.floor(clampFinite(args.heightPx, 1, 16384) || 720))
    const paddingPx = clampFinite(args.paddingPx, 0, 2000) || 80
    const includeXmlDeclaration = args.includeXmlDeclaration !== false
    const animated = args.animated === true

    const canvasBg = resolveCssColor(readCssVar('--kg-canvas-bg', 'white'), 'white')
    const labelFill = resolveCssColor(
      readCssVar('--kg-canvas-label-fill', readCssVar('--kg-text-primary', 'rgba(0,0,0,0.86)')),
      'rgba(0,0,0,0.86)',
    )
    const nodeStroke = resolveCssColor(
      readCssVar('--kg-canvas-node-stroke', readCssVar('--kg-border', 'rgba(0,0,0,0.45)')),
      'rgba(0,0,0,0.45)',
    )

    const seeded = computeSeededPositions(nodes)
    const posById = new Map<string, { x: number; y: number }>()
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!
      const id = String(n.id || '').trim()
      const x = isFiniteNum(n.x) ? n.x : seeded[id]?.x
      const y = isFiniteNum(n.y) ? n.y : seeded[id]?.y
      if (!id || !isFiniteNum(x) || !isFiniteNum(y)) continue
      posById.set(id, { x, y })
    }
    if (posById.size === 0) return null

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const centeredPoints: Array<{ x: number; y: number }> = []

    const fontSizePx = 12
    const labelPadY = 8

    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!
      const id = String(n.id || '').trim()
      const p = posById.get(id)
      if (!p) continue
      const r = Math.max(4, getNodeRenderRadius(n, schema) || 10)
      const label = String(n.label || id)
      const labelW = estimateLabelWidthPx(label, fontSizePx)
      const left = p.x - Math.max(r, labelW / 2)
      const right = p.x + Math.max(r, labelW / 2)
      const top = p.y - r - (fontSizePx + labelPadY)
      const bottom = p.y + r
      if (left < minX) minX = left
      if (right > maxX) maxX = right
      if (top < minY) minY = top
      if (bottom > maxY) maxY = bottom
      centeredPoints.push(p)
    }

    const centroidMetrics = measureGraphElementCenterSet(centeredPoints)
    if (!centroidMetrics || !Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null

    const cx = centroidMetrics.centroidX
    const cy = centroidMetrics.centroidY
    const halfW = Math.max(1, Math.max(Math.abs(minX - cx), Math.abs(maxX - cx)))
    const halfH = Math.max(1, Math.max(Math.abs(minY - cy), Math.abs(maxY - cy)))
    const vb = computeCenteredViewBoxForAspect({ cx, cy, halfW, halfH, outAspect: widthPx / heightPx, padding: paddingPx })

    const edgeParts: string[] = []
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]!
      const eid = String(e.id || '').trim() || `e-${i}`
      const s = String(e.source || '').trim()
      const t = String(e.target || '').trim()
      const ps = posById.get(s)
      const pt = posById.get(t)
      if (!ps || !pt) continue
      const strokeRaw = getEdgeBaseStroke(e, schema)
      const stroke = escapeXml(resolveCssColor(strokeRaw, strokeRaw))
      const dx = pt.x - ps.x
      const dy = pt.y - ps.y
      const len = Math.max(1, Math.hypot(dx, dy))
      const begin = ((i % 13) * 0.12).toFixed(2)
      edgeParts.push(
        animated
          ? `<line data-edge-id="${escapeXml(eid)}" data-source="${escapeXml(s)}" data-target="${escapeXml(t)}" x1="${ps.x}" y1="${ps.y}" x2="${pt.x}" y2="${pt.y}" stroke="${stroke}" stroke-width="1.6" stroke-opacity="0.85" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len}">` +
              `<animate attributeName="stroke-dashoffset" values="${len};0" dur="1.8s" repeatCount="indefinite" begin="${begin}s"/>` +
            `</line>`
          : `<line data-edge-id="${escapeXml(eid)}" data-source="${escapeXml(s)}" data-target="${escapeXml(t)}" x1="${ps.x}" y1="${ps.y}" x2="${pt.x}" y2="${pt.y}" stroke="${stroke}" stroke-width="1.6" stroke-opacity="0.85" stroke-linecap="round"/>`,
      )
    }

    const nodeParts: string[] = []
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!
      const id = String(n.id || '').trim()
      const p = posById.get(id)
      if (!p) continue
      const r = Math.max(4, getNodeRenderRadius(n, schema) || 10)
      const fillRaw = getNodeBaseFill(n, schema)
      const fill = escapeXml(resolveCssColor(fillRaw, fillRaw))
      const label = escapeXml(String(n.label || id))
      const begin = ((i % 17) * 0.08).toFixed(2)
      const floatDy = (2 + (i % 3)).toFixed(0)
      const pulseR = (r * 1.06).toFixed(2)
      nodeParts.push(
        animated
          ? `<g data-node-id="${escapeXml(id)}">` +
              `<animateTransform attributeName="transform" type="translate" values="0 0;0 -${floatDy};0 0" dur="2.4s" repeatCount="indefinite" begin="${begin}s"/>` +
              `<circle data-role="node-circle" cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${escapeXml(nodeStroke)}" stroke-width="1">` +
                `<animate attributeName="r" values="${r};${pulseR};${r}" dur="1.6s" repeatCount="indefinite" begin="${begin}s"/>` +
              `</circle>` +
              `<text data-role="node-label" x="${p.x}" y="${p.y - r - labelPadY}" font-size="${fontSizePx}" font-family="${UI_FONT_SANS}" text-anchor="middle" fill="${escapeXml(labelFill)}">${label}</text>` +
            `</g>`
          : `<g data-node-id="${escapeXml(id)}">` +
              `<circle data-role="node-circle" cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${escapeXml(nodeStroke)}" stroke-width="1"/>` +
              `<text data-role="node-label" x="${p.x}" y="${p.y - r - labelPadY}" font-size="${fontSizePx}" font-family="${UI_FONT_SANS}" text-anchor="middle" fill="${escapeXml(labelFill)}">${label}</text>` +
            `</g>`,
      )
    }

    const svg =
      `<svg xmlns="${SVG_NS}" width="${widthPx}" height="${heightPx}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">` +
      `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${escapeXml(canvasBg)}"/>` +
      `<g data-layer="edges">${edgeParts.join('')}</g>` +
      `<g data-layer="nodes">${nodeParts.join('')}</g>` +
      `</svg>`

    return includeXmlDeclaration ? `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n` : svg
  } catch {
    return null
  }
}
