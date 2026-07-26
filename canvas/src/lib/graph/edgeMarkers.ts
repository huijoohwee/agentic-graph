import type { GraphSchema } from '@/lib/graph/schema'
import type { EdgeMarkerShape, EdgeMarkerSize } from '@/lib/graph/schemaTypes'
import type { GraphEdge } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'

const SVG_NS = 'http://www.w3.org/2000/svg'
const EDGE_MARKER_NAMESPACE_ATTR = 'data-kg-edge-marker-namespace'
const EDGE_MARKER_DEFS_ATTR = 'data-kg-edge-marker-defs'

export const EDGE_MARKER_SHAPES: readonly EdgeMarkerShape[] = [
  'none',
  'arrow',
  'arrow-open',
  'circle',
  'diamond',
  'bar',
]

export const EDGE_MARKER_SIZES: readonly EdgeMarkerSize[] = ['small', 'medium', 'large']

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

const isEdgeMarkerShape = (value: unknown): value is EdgeMarkerShape =>
  typeof value === 'string' && EDGE_MARKER_SHAPES.includes(value.trim() as EdgeMarkerShape)

const isEdgeMarkerSize = (value: unknown): value is EdgeMarkerSize =>
  typeof value === 'string' && EDGE_MARKER_SIZES.includes(value.trim() as EdgeMarkerSize)

const readMarkerShape = (value: unknown): EdgeMarkerShape | null =>
  isEdgeMarkerShape(value) ? value.trim() as EdgeMarkerShape : null

const readMarkerSize = (value: unknown): EdgeMarkerSize | null =>
  isEdgeMarkerSize(value) ? value.trim() as EdgeMarkerSize : null

const readEdgeProperties = (edge: GraphEdge): Record<string, unknown> =>
  isPlainObject(edge?.properties) ? edge.properties as Record<string, unknown> : {}

const shouldUseLegacyDirectedMarker = (
  edge: GraphEdge,
  schema: GraphSchema,
  properties: Record<string, unknown>,
): boolean => {
  const label = String(edge?.label || '')
  if (schema.edgeStyles?.[label]?.arrow === true) return true
  const keywordKind = typeof properties['keyword:kind'] === 'string'
    ? properties['keyword:kind'].trim()
    : ''
  if (!keywordKind) return false
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

export const edgeHasDirectionalMarker = (edge: GraphEdge, schema: GraphSchema): boolean => {
  const marker = readEdgeMarkerPresentation(edge, schema)
  return marker.start !== 'none' || marker.end !== 'none'
}

export const edgeUsesAuthoredArrowPath = (edge: GraphEdge): boolean => {
  const raw = readEdgeProperties(edge)['visual:arrowD']
  return typeof raw === 'string' && raw.trim().length > 0
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

const markerDimensionBySize: Record<EdgeMarkerSize, string> = {
  small: '5.5',
  medium: '7',
  large: '9',
}

const markerRefXByShape: Record<Exclude<EdgeMarkerShape, 'none'>, string> = {
  arrow: '11',
  'arrow-open': '11',
  circle: '6',
  diamond: '6',
  bar: '6',
}

const markerId = (
  namespace: string,
  shape: Exclude<EdgeMarkerShape, 'none'>,
  size: EdgeMarkerSize,
): string => `${namespace}-${shape}-${size}`

const appendMarkerDefinition = (
  defs: SVGDefsElement,
  namespace: string,
  shape: Exclude<EdgeMarkerShape, 'none'>,
  size: EdgeMarkerSize,
) => {
  const marker = defs.ownerDocument.createElementNS(SVG_NS, 'marker')
  marker.setAttribute('id', markerId(namespace, shape, size))
  marker.setAttribute('viewBox', '0 0 12 12')
  marker.setAttribute('refX', markerRefXByShape[shape])
  marker.setAttribute('refY', '6')
  marker.setAttribute('markerWidth', markerDimensionBySize[size])
  marker.setAttribute('markerHeight', markerDimensionBySize[size])
  marker.setAttribute('markerUnits', 'strokeWidth')
  marker.setAttribute('orient', 'auto-start-reverse')
  marker.setAttribute('overflow', 'visible')
  marker.setAttribute('data-kg-edge-marker-shape', shape)
  marker.setAttribute('data-kg-edge-marker-size', size)
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
    for (const shape of EDGE_MARKER_SHAPES) {
      if (shape === 'none') continue
      for (const size of EDGE_MARKER_SIZES) appendMarkerDefinition(defs, namespace, shape, size)
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
