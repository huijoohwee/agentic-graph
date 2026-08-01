import type { GraphSchema } from '@/lib/graph/schema'
import type { EdgeMarkerShape, EdgeMarkerSize } from '@/lib/graph/schemaTypes'
import type { GraphEdge } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'

const SVG_NS = 'http://www.w3.org/2000/svg'
const EDGE_MARKER_NAMESPACE_ATTR = 'data-kg-em-ns'
const EDGE_MARKER_DEFS_ATTR = 'data-kg-em-defs'
const EDGE_MARKER_RENDER_SHAPES: ReadonlyArray<Exclude<EdgeMarkerShape, 'none'>> = ['arrow', 'arrow-open', 'circle', 'diamond', 'bar']
const EDGE_MARKER_RENDER_SIZES: ReadonlyArray<EdgeMarkerSize> = ['small', 'medium', 'large']

export type EdgeMarkerPresentation = {
  start: EdgeMarkerShape
  end: EdgeMarkerShape
  size: EdgeMarkerSize
}

export type EdgeMarkerRegistry = {
  namespace: string
  urlFor: (shape: Exclude<EdgeMarkerShape, 'none'>, size: EdgeMarkerSize) => string
}

let edgeMarkerNamespaceCounter = 0

const readMarkerShape = (value: unknown): EdgeMarkerShape | null => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  switch (normalized) {
    case 'none':
    case 'arrow':
    case 'arrow-open':
    case 'circle':
    case 'diamond':
    case 'bar':
      return normalized
    default:
      return null
  }
}

const readMarkerSize = (value: unknown): EdgeMarkerSize | null => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  switch (normalized) {
    case 'small':
    case 'medium':
    case 'large':
      return normalized
    default:
      return null
  }
}

const readEdgeProperties = (edge: GraphEdge): Record<string, unknown> =>
  isPlainObject(edge?.properties) ? edge.properties as Record<string, unknown> : {}

const shouldUseLegacyDirectedMarker = (
  edge: GraphEdge,
  schema: GraphSchema,
  properties: Record<string, unknown>,
): boolean => {
  const label = String(edge?.label || '')
  if (schema.edgeStyles?.[label]?.arrow === true) return true
  if (typeof properties['keyword:kind'] !== 'string' || !properties['keyword:kind'].trim()) return false
  const directed = properties['keyword:directed']
  return typeof directed === 'boolean' ? directed : true
}

export const readEdgeMarkerPresentation = (
  edge: GraphEdge,
  schema: GraphSchema,
): EdgeMarkerPresentation => {
  const properties = readEdgeProperties(edge)
  const style = schema.edgeStyles?.[String(edge?.label || '')] || {}
  const start = readMarkerShape(properties['visual:markerStart'])
    ?? readMarkerShape(style.markerStart)
    ?? 'none'
  const end = readMarkerShape(properties['visual:markerEnd'])
    ?? readMarkerShape(style.markerEnd)
    ?? (shouldUseLegacyDirectedMarker(edge, schema, properties) ? 'arrow' : 'none')
  const size = readMarkerSize(properties['visual:markerSize'])
    ?? readMarkerSize(style.markerSize)
    ?? 'medium'
  return { start, end, size }
}

const appendMarkerGeometry = (
  marker: SVGMarkerElement,
  shape: Exclude<EdgeMarkerShape, 'none'>,
) => {
  const doc = marker.ownerDocument
  if (shape === 'circle') {
    const circle = doc.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', '6')
    circle.setAttribute('cy', '6')
    circle.setAttribute('r', '3.5')
    circle.setAttribute('fill', 'context-stroke')
    marker.appendChild(circle)
    return
  }

  const path = doc.createElementNS(SVG_NS, 'path')
  if (shape === 'arrow') {
    path.setAttribute('d', 'M1 1 L11 6 L1 11 Z')
    path.setAttribute('fill', 'context-stroke')
  } else if (shape === 'arrow-open') {
    path.setAttribute('d', 'M2 1 L11 6 L2 11')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'context-stroke')
    path.setAttribute('stroke-width', '1.8')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
  } else if (shape === 'diamond') {
    path.setAttribute('d', 'M6 1 L11 6 L6 11 L1 6 Z')
    path.setAttribute('fill', 'context-stroke')
  } else {
    path.setAttribute('d', 'M6 1 L6 11')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'context-stroke')
    path.setAttribute('stroke-width', '2')
    path.setAttribute('stroke-linecap', 'round')
  }
  marker.appendChild(path)
}

const markerId = (namespace: string, shape: Exclude<EdgeMarkerShape, 'none'>, size: EdgeMarkerSize): string =>
  `${namespace}-${shape}-${size}`

const appendMarkerDefinition = (
  defs: SVGDefsElement,
  namespace: string,
  shape: Exclude<EdgeMarkerShape, 'none'>,
  size: EdgeMarkerSize,
) => {
  const marker = defs.ownerDocument.createElementNS(SVG_NS, 'marker')
  marker.setAttribute('id', markerId(namespace, shape, size))
  marker.setAttribute('viewBox', '0 0 12 12')
  marker.setAttribute('refX', shape === 'arrow' || shape === 'arrow-open' ? '11' : '6')
  marker.setAttribute('refY', '6')
  const markerDimension = size === 'small' ? '5.5' : size === 'large' ? '9' : '7'
  marker.setAttribute('markerWidth', markerDimension)
  marker.setAttribute('markerHeight', markerDimension)
  marker.setAttribute('markerUnits', 'strokeWidth')
  marker.setAttribute('orient', 'auto-start-reverse')
  marker.setAttribute('overflow', 'visible')
  marker.setAttribute('data-kg-em-shape', shape)
  appendMarkerGeometry(marker, shape)
  defs.appendChild(marker)
}

export const ensureEdgeMarkerRegistry = (svg: SVGSVGElement): EdgeMarkerRegistry => {
  let namespace = String(svg.getAttribute(EDGE_MARKER_NAMESPACE_ATTR) || '').trim()
  if (!namespace) {
    edgeMarkerNamespaceCounter += 1
    namespace = `kg-edge-markers-${edgeMarkerNamespaceCounter}`
    svg.setAttribute(EDGE_MARKER_NAMESPACE_ATTR, namespace)
  }

  let defs = svg.querySelector<SVGDefsElement>(`defs[${EDGE_MARKER_DEFS_ATTR}="${namespace}"]`)
  if (!defs) {
    defs = svg.ownerDocument.createElementNS(SVG_NS, 'defs')
    defs.setAttribute(EDGE_MARKER_DEFS_ATTR, namespace)
    for (const shape of EDGE_MARKER_RENDER_SHAPES) {
      for (const size of EDGE_MARKER_RENDER_SIZES) appendMarkerDefinition(defs, namespace, shape, size)
    }
    svg.insertBefore(defs, svg.firstChild)
  }

  return {
    namespace,
    urlFor: (shape, size) => `url(#${markerId(namespace, shape, size)})`,
  }
}

export const applyEdgeMarkerAttributes = (
  element: SVGElement,
  edge: GraphEdge,
  schema: GraphSchema,
  registry: EdgeMarkerRegistry,
  options?: { suppressEnd?: boolean },
): EdgeMarkerPresentation => {
  const presentation = readEdgeMarkerPresentation(edge, schema)
  if (presentation.start === 'none') element.removeAttribute('marker-start')
  else element.setAttribute('marker-start', registry.urlFor(presentation.start, presentation.size))

  if (options?.suppressEnd || presentation.end === 'none') element.removeAttribute('marker-end')
  else element.setAttribute('marker-end', registry.urlFor(presentation.end, presentation.size))
  return presentation
}
