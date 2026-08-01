import { JSDOM } from 'jsdom'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphEdge } from '@/lib/graph/types'
import {
  applyEdgeMarkerAttributes,
  ensureEdgeMarkerRegistry,
  readEdgeMarkerPresentation,
} from '@/lib/graph/edgeMarkers'

const edge = (
  properties: Record<string, unknown> = {},
  label = 'linksTo',
): GraphEdge => ({
  id: 'edge-1',
  source: 'source',
  target: 'target',
  label,
  properties,
}) as unknown as GraphEdge

const schema = (
  edgeStyles: GraphSchema['edgeStyles'],
): GraphSchema => ({ edgeStyles }) as unknown as GraphSchema

export function testEdgeMarkersPreserveLegacyAndKeywordDirectionContracts() {
  const legacy = readEdgeMarkerPresentation(edge(), schema({ linksTo: { arrow: true } }))
  if (legacy.start !== 'none' || legacy.end !== 'arrow' || legacy.size !== 'medium') {
    throw new Error(`expected legacy arrow to resolve as a medium end marker, got ${JSON.stringify(legacy)}`)
  }

  const keyword = readEdgeMarkerPresentation(
    edge({ 'keyword:kind': 'relationship', 'keyword:directed': true }, 'relatedTo'),
    schema({}),
  )
  if (keyword.end !== 'arrow') throw new Error('expected directed keyword edge to keep its end marker')

  const undirected = readEdgeMarkerPresentation(
    edge({ 'keyword:kind': 'relationship', 'keyword:directed': false }, 'relatedTo'),
    schema({}),
  )
  if (undirected.end !== 'none') throw new Error('expected undirected keyword edge to omit its end marker')
}

export function testEdgeMarkersResolveStartEndShapeAndSizeOverrides() {
  const styledSchema = schema({
    linksTo: {
      markerStart: 'circle',
      markerEnd: 'diamond',
      markerSize: 'small',
    },
  })
  const styled = readEdgeMarkerPresentation(edge(), styledSchema)
  if (styled.start !== 'circle' || styled.end !== 'diamond' || styled.size !== 'small') {
    throw new Error(`expected schema marker style, got ${JSON.stringify(styled)}`)
  }

  const overridden = readEdgeMarkerPresentation(edge({
    'visual:markerStart': 'bar',
    'visual:markerEnd': 'arrow-open',
    'visual:markerSize': 'large',
  }), styledSchema)
  if (overridden.start !== 'bar' || overridden.end !== 'arrow-open' || overridden.size !== 'large') {
    throw new Error(`expected edge marker overrides, got ${JSON.stringify(overridden)}`)
  }

  const suppressed = readEdgeMarkerPresentation(
    edge({ 'visual:markerEnd': 'none' }),
    schema({ linksTo: { arrow: true } }),
  )
  if (suppressed.end !== 'none') throw new Error('expected explicit none to suppress the legacy arrow')
}

export function testEdgeMarkerRegistryIsSvgScopedAndContextColored() {
  const dom = new JSDOM('<!doctype html><html><body><svg id="a"></svg><svg id="b"></svg></body></html>')
  const svgA = dom.window.document.querySelector<SVGSVGElement>('#a')
  const svgB = dom.window.document.querySelector<SVGSVGElement>('#b')
  if (!svgA || !svgB) throw new Error('expected SVG fixtures')

  const registryA = ensureEdgeMarkerRegistry(svgA)
  const registryAReplay = ensureEdgeMarkerRegistry(svgA)
  const registryB = ensureEdgeMarkerRegistry(svgB)
  if (registryA.namespace !== registryAReplay.namespace) throw new Error('expected stable per-SVG marker namespace')
  if (registryA.namespace === registryB.namespace) throw new Error('expected marker namespaces to avoid cross-SVG collisions')

  const markers = svgA.querySelectorAll('marker[data-kg-em-shape]')
  if (markers.length !== 15) throw new Error(`expected 5 shapes across 3 sizes, got ${markers.length}`)
  const contextColored = svgA.querySelectorAll('[fill="context-stroke"], [stroke="context-stroke"]')
  if (contextColored.length !== 15) {
    throw new Error(`expected every marker shape to inherit its edge stroke, got ${contextColored.length}`)
  }
}

export function testEdgeMarkerAttributesApplyAndClearBothEndpoints() {
  const dom = new JSDOM('<!doctype html><html><body><svg><path id="edge"></path></svg></body></html>')
  const svg = dom.window.document.querySelector<SVGSVGElement>('svg')
  const path = dom.window.document.querySelector<SVGPathElement>('#edge')
  if (!svg || !path) throw new Error('expected SVG marker fixture')
  const registry = ensureEdgeMarkerRegistry(svg)
  const styledSchema = schema({
    linksTo: { markerStart: 'circle', markerEnd: 'diamond', markerSize: 'large' },
  })

  applyEdgeMarkerAttributes(path, edge(), styledSchema, registry)
  if (!String(path.getAttribute('marker-start') || '').includes('-circle-large')) {
    throw new Error('expected start marker URL to use the resolved circle/large definition')
  }
  if (!String(path.getAttribute('marker-end') || '').includes('-diamond-large')) {
    throw new Error('expected end marker URL to use the resolved diamond/large definition')
  }

  applyEdgeMarkerAttributes(path, edge({
    'visual:markerStart': 'none',
    'visual:markerEnd': 'none',
  }), styledSchema, registry)
  if (path.hasAttribute('marker-start') || path.hasAttribute('marker-end')) {
    throw new Error('expected explicit none to clear both marker attributes')
  }
}
