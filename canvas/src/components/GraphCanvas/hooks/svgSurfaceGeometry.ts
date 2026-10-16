import * as d3 from 'd3'
import type { Canvas2dRendererId } from '@/lib/config.render'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export type SvgSurfaceBounds = {
  minX: number
  minY: number
  width: number
  height: number
}

export type SvgSurfaceRuntime = {
  revision: number
  bounds: SvgSurfaceBounds
  viewport: {
    width: number
    height: number
  }
}

export type SvgSurfaceFitMode = 'auto' | 'wideTimeline'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_SURFACE_WIDE_TIMELINE_ASPECT_MULTIPLIER = 2.4
const SVG_SURFACE_WIDE_TIMELINE_MIN_CONTENT_WIDTH_MULTIPLIER = 3
const SVG_SURFACE_WIDE_TIMELINE_TARGET_HEIGHT_RATIO = 0.42
const SVG_SURFACE_WIDE_TIMELINE_MAX_SCALE = 2
const SVG_SURFACE_WIDE_TIMELINE_PADDING_PX = 32
const SVG_SURFACE_OVERLAY_INSET_PX = 16

const parseFiniteNumber = (raw: unknown): number | null => {
  const value = typeof raw === 'number' ? raw : Number(String(raw || '').trim())
  return Number.isFinite(value) ? value : null
}

const parseViewBoxBounds = (raw: string | null): SvgSurfaceBounds | null => {
  const parts = String(raw || '')
    .trim()
    .split(/[\s,]+/)
    .map(parseFiniteNumber)
  if (parts.length < 4 || parts.some(value => value == null)) return null
  const minX = parts[0] as number
  const minY = parts[1] as number
  const width = Math.max(1, parts[2] as number)
  const height = Math.max(1, parts[3] as number)
  return { minX, minY, width, height }
}

const readSvgStoredIntrinsicBounds = (svgEl: SVGSVGElement): SvgSurfaceBounds | null => {
  const minX = parseFiniteNumber(svgEl.getAttribute('data-kg-svg-intrinsic-x'))
  const minY = parseFiniteNumber(svgEl.getAttribute('data-kg-svg-intrinsic-y'))
  const width = parseFiniteNumber(svgEl.getAttribute('data-kg-svg-intrinsic-w'))
  const height = parseFiniteNumber(svgEl.getAttribute('data-kg-svg-intrinsic-h'))
  if (minX == null || minY == null || width == null || height == null || width <= 1 || height <= 1) return null
  return { minX, minY, width, height }
}

const writeSvgStoredIntrinsicBounds = (svgEl: SVGSVGElement, bounds: SvgSurfaceBounds): void => {
  svgEl.setAttribute('data-kg-svg-intrinsic-x', String(bounds.minX))
  svgEl.setAttribute('data-kg-svg-intrinsic-y', String(bounds.minY))
  svgEl.setAttribute('data-kg-svg-intrinsic-w', String(bounds.width))
  svgEl.setAttribute('data-kg-svg-intrinsic-h', String(bounds.height))
}

const readSvgVisualBounds = (svgEl: SVGSVGElement): SvgSurfaceBounds => {
  const fromViewBox = parseViewBoxBounds(svgEl.getAttribute('viewBox'))
  if (fromViewBox) {
    writeSvgStoredIntrinsicBounds(svgEl, fromViewBox)
    return fromViewBox
  }
  const stored = readSvgStoredIntrinsicBounds(svgEl)
  if (stored) return stored
  const width = parseFiniteNumber(svgEl.getAttribute('width')) || svgEl.clientWidth || 960
  const height = parseFiniteNumber(svgEl.getAttribute('height')) || svgEl.clientHeight || 540
  return {
    minX: 0,
    minY: 0,
    width: Math.max(1, width),
    height: Math.max(1, height),
  }
}

const readSvgContentClientBounds = (svgEl: SVGSVGElement, group: SVGGElement): SvgSurfaceBounds | null => {
  const svgRect = svgEl.getBoundingClientRect()
  const groupRect = group.getBoundingClientRect()
  if (
    !Number.isFinite(svgRect.left) ||
    !Number.isFinite(svgRect.top) ||
    !Number.isFinite(groupRect.left) ||
    !Number.isFinite(groupRect.top) ||
    !Number.isFinite(groupRect.width) ||
    !Number.isFinite(groupRect.height) ||
    groupRect.width <= 1 ||
    groupRect.height <= 1
  ) {
    return null
  }
  return {
    minX: groupRect.left - svgRect.left,
    minY: groupRect.top - svgRect.top,
    width: Math.max(1, groupRect.width),
    height: Math.max(1, groupRect.height),
  }
}

const isSvgViewportMetadataElement = (node: ChildNode): boolean => {
  if (!(node instanceof SVGElement)) return false
  const tag = node.tagName.toLowerCase()
  return tag === 'defs' || tag === 'style' || tag === 'title' || tag === 'desc' || tag === 'metadata'
}

const ensureSvgZoomContentGroup = (svgEl: SVGSVGElement): SVGGElement => {
  const existing = Array.from(svgEl.children).find(child => child.tagName.toLowerCase() === 'g' && child.getAttribute('data-kg-svg-zoom-content') === '1')
  if (existing instanceof SVGGElement) return existing

  const hitbox = document.createElementNS(SVG_NS, 'rect')
  hitbox.setAttribute('data-kg-svg-viewport-hitbox', '1')
  hitbox.setAttribute('x', '0')
  hitbox.setAttribute('y', '0')
  hitbox.setAttribute('width', '100%')
  hitbox.setAttribute('height', '100%')
  hitbox.setAttribute('fill', 'transparent')
  hitbox.setAttribute('pointer-events', 'all')

  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('data-kg-svg-zoom-content', '1')

  const children = Array.from(svgEl.childNodes)
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    if (isSvgViewportMetadataElement(child)) continue
    group.appendChild(child)
  }

  svgEl.insertBefore(hitbox, svgEl.firstChild)
  svgEl.appendChild(group)
  return group
}

const readSvgViewportRect = (svgEl: SVGSVGElement): { width: number; height: number } => {
  const rect = svgEl.getBoundingClientRect()
  return {
    width: Math.max(1, Number.isFinite(rect.width) && rect.width > 0 ? rect.width : svgEl.clientWidth || 1),
    height: Math.max(1, Number.isFinite(rect.height) && rect.height > 0 ? rect.height : svgEl.clientHeight || 1),
  }
}

export const readSvgSurfaceFitViewportRect = (
  svgEl: SVGSVGElement,
  fitMode: SvgSurfaceFitMode,
  fallback: { width: number; height: number },
): { width: number; height: number } => {
  if (fitMode !== 'wideTimeline' || typeof document === 'undefined') return fallback
  const svgRect = svgEl.getBoundingClientRect()
  if (
    !Number.isFinite(svgRect.left) ||
    !Number.isFinite(svgRect.top) ||
    !Number.isFinite(svgRect.right) ||
    !Number.isFinite(svgRect.bottom) ||
    svgRect.width <= 1 ||
    svgRect.height <= 1
  ) {
    return fallback
  }
  let width = fallback.width
  let height = fallback.height
  const selectors = [
    '[data-kg-floating-panel-root="true"]',
    '[data-kg-strybldr-bottom-timeline-panel="1"]',
  ].join(',')
  for (const overlay of Array.from(document.querySelectorAll(selectors))) {
    const rect = overlay.getBoundingClientRect()
    if (
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.right) ||
      !Number.isFinite(rect.bottom) ||
      rect.width <= 1 ||
      rect.height <= 1
    ) {
      continue
    }
    const overlapsY = rect.bottom > svgRect.top && rect.top < svgRect.bottom
    const overlapsX = rect.right > svgRect.left && rect.left < svgRect.right
    if (overlapsY && rect.left > svgRect.left + 80 && rect.left < svgRect.right) {
      width = Math.min(width, Math.max(1, rect.left - svgRect.left - SVG_SURFACE_OVERLAY_INSET_PX))
    }
    if (overlapsX && rect.top > svgRect.top + 80 && rect.top < svgRect.bottom) {
      height = Math.min(height, Math.max(1, rect.top - svgRect.top - SVG_SURFACE_OVERLAY_INSET_PX))
    }
  }
  return { width, height }
}

export const prepareSvgForInteractiveViewport = (args: {
  svgEl: SVGSVGElement
  fitMode: SvgSurfaceFitMode
}): {
  group: SVGGElement
  bounds: SvgSurfaceBounds
  viewport: { width: number; height: number }
} => {
  const { svgEl } = args
  const fallbackBounds = readSvgVisualBounds(svgEl)
  svgEl.setAttribute('data-kg-svg-surface-root', '1')
  svgEl.setAttribute('width', '100%')
  svgEl.setAttribute('height', '100%')
  svgEl.removeAttribute('viewBox')
  svgEl.style.display = 'block'
  svgEl.style.width = '100%'
  svgEl.style.height = '100%'
  svgEl.style.maxWidth = 'none'
  svgEl.style.overflow = 'hidden'
  svgEl.style.touchAction = 'none'
  const group = ensureSvgZoomContentGroup(svgEl)
  group.removeAttribute('transform')
  const contentBounds = readSvgContentClientBounds(svgEl, group)
  const useIntrinsicBounds = args.fitMode === 'wideTimeline'
  const bounds = useIntrinsicBounds ? fallbackBounds : (contentBounds || fallbackBounds)
  svgEl.setAttribute('data-kg-svg-fit-source', useIntrinsicBounds ? 'intrinsic' : contentBounds ? 'content' : 'root')
  svgEl.setAttribute('data-kg-svg-fit-x', String(bounds.minX))
  svgEl.setAttribute('data-kg-svg-fit-y', String(bounds.minY))
  svgEl.setAttribute('data-kg-svg-fit-w', String(bounds.width))
  svgEl.setAttribute('data-kg-svg-fit-h', String(bounds.height))
  return { group, bounds, viewport: readSvgViewportRect(svgEl) }
}

export const buildSvgSurfaceGraphData = (args: {
  bounds: SvgSurfaceBounds | null
  graphData: GraphData | null
  rendererId: Canvas2dRendererId
  renderGraphData?: GraphData | null
}): GraphData | null => {
  const bounds = args.bounds
  if (!bounds) return null
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const node: GraphNode = {
    id: `svg-surface:${args.rendererId}:bounds`,
    label: 'SVG Surface Bounds',
    type: 'SvgSurfaceBounds',
    x: bounds.minX + width / 2,
    y: bounds.minY + height / 2,
    properties: {
      'visual:width': width,
      'visual:height': height,
      'visual:shape': 'rect',
    },
  }
  const rendered = args.renderGraphData
  if (rendered?.nodes.some(candidate => candidate.id === node.id)) {
    throw new Error(`Renderer graph uses reserved SVG bounds ID: ${node.id}`)
  }
  return {
    ...rendered,
    type: 'Graph',
    context: 'svg-surface',
    nodes: [...(rendered?.nodes || []), node],
    edges: rendered?.edges || [],
    metadata: {
      ...rendered?.metadata,
      kind: 'svg-surface',
      rendererId: args.rendererId,
      sourceGraphKind: String(((args.graphData?.metadata || {}) as Record<string, unknown>).kind || ''),
    },
  }
}

export const svgSurfaceGraphLayoutSignature = (graph: GraphData | null): string => JSON.stringify([
  graph?.nodes.map(node => [node.id, node.x, node.y, node.properties?.['visual:width'], node.properties?.['visual:height']]),
  graph?.edges.map(edge => [edge.id, edge.source, edge.target]),
])

export const computeSvgSurfaceWideTimelineFitTransform = (args: {
  bounds: SvgSurfaceBounds
  viewportWidth: number
  viewportHeight: number
}): d3.ZoomTransform | null => {
  const bounds = args.bounds
  const viewportWidth = Math.max(1, Number.isFinite(args.viewportWidth) ? args.viewportWidth : 1)
  const viewportHeight = Math.max(1, Number.isFinite(args.viewportHeight) ? args.viewportHeight : 1)
  const contentWidth = Math.max(1, bounds.width)
  const contentHeight = Math.max(1, bounds.height)
  const viewportAspect = viewportWidth / viewportHeight
  const contentAspect = contentWidth / contentHeight
  const isHorizontallyWide =
    contentAspect > viewportAspect * SVG_SURFACE_WIDE_TIMELINE_ASPECT_MULTIPLIER &&
    contentWidth > viewportWidth * SVG_SURFACE_WIDE_TIMELINE_MIN_CONTENT_WIDTH_MULTIPLIER

  const maxScaleForViewportHeight = Math.max(0.001, (viewportHeight - SVG_SURFACE_WIDE_TIMELINE_PADDING_PX * 2) / contentHeight)
  const targetScaleForReadableHeight = Math.max(0.001, (viewportHeight * SVG_SURFACE_WIDE_TIMELINE_TARGET_HEIGHT_RATIO) / contentHeight)
  const scaleForVisibleWidth = Math.max(0.001, (viewportWidth - SVG_SURFACE_WIDE_TIMELINE_PADDING_PX * 2) / contentWidth)
  const k = isHorizontallyWide
    ? Math.max(
        0.001,
        Math.min(SVG_SURFACE_WIDE_TIMELINE_MAX_SCALE, maxScaleForViewportHeight, Math.max(1, targetScaleForReadableHeight)),
      )
    : Math.max(0.001, Math.min(SVG_SURFACE_WIDE_TIMELINE_MAX_SCALE, maxScaleForViewportHeight, scaleForVisibleWidth))
  const x = SVG_SURFACE_WIDE_TIMELINE_PADDING_PX - bounds.minX * k
  const y = viewportHeight / 2 - (bounds.minY + contentHeight / 2) * k
  return d3.zoomIdentity.translate(x, y).scale(k)
}
