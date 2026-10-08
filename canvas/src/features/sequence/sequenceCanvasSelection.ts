import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { sequenceSourceKey, type SequenceModel } from './sequenceModel'

export type SequenceGraphBinding = {
  participants: Map<string, GraphNode>
  events: Map<string, GraphEdge>
}

/** Scopes differ between parser and view. Join one complete diagram by source,
 * participant aliases and exact event occurrences, never by a displayed label. */
export function bindSequenceGraph(model: SequenceModel, graph: GraphData | null): SequenceGraphBinding | null {
  if (!graph || model.diagnostics.length || !model.participants.length) return null
  const source = sequenceSourceKey(model.code.trim())
  const groups = new Map<string, GraphNode[]>()
  for (const node of graph.nodes) {
    const p = node.properties
    if (p.sequenceParticipant !== true || p.sequenceSource !== source || typeof p.sequenceDiagram !== 'string') continue
    const nodes = groups.get(p.sequenceDiagram) || []
    nodes.push(node); groups.set(p.sequenceDiagram, nodes)
  }
  const bindings: SequenceGraphBinding[] = []
  for (const [diagram, nodes] of groups) {
    if (nodes.length !== model.participants.length) continue
    const participants = new Map<string, GraphNode>()
    for (const person of model.participants) {
      const matches = nodes.filter(node => node.properties.nodeName === person.id && node.properties.label === person.label)
      if (matches.length === 1) participants.set(person.id, matches[0]!)
    }
    if (participants.size !== model.participants.length) continue
    const edges = graph.edges.filter(edge => edge.properties.sequenceSource === source && edge.properties.sequenceDiagram === diagram)
    if (edges.length !== model.events.length) continue
    const events = new Map<string, GraphEdge>()
    for (const event of model.events) {
      const matches = edges.filter(edge => edge.properties.sequenceOrdinal === event.ordinal
        && edge.source === participants.get(event.from)?.id && edge.target === participants.get(event.to)?.id
        && edge.properties.label === event.label && edge.properties.sequenceArrow === event.arrow
        && edge.properties.sequenceKind === event.kind && edge.properties.sequenceProtocol === event.protocol)
      if (matches.length === 1) events.set(event.id, matches[0]!)
    }
    if (events.size === model.events.length) bindings.push({ participants, events })
  }
  return bindings.length === 1 ? bindings[0]! : null
}

/** Measure in the shared zoom-content coordinate space, removing viewport pan/zoom.
 * The graph is presentation-only; authored and simulation coordinates stay intact. */
export function measureSequenceGraph(svg: SVGSVGElement, model: SequenceModel, graph: GraphData | null): GraphData | null {
  const binding = bindSequenceGraph(model, graph)
  if (!binding) return null
  const content = svg.querySelector<SVGGraphicsElement>('[data-kg-svg-zoom-content="1"]') || svg
  const matrix = content.getScreenCTM?.()
  if (!matrix) return null
  const inverse = matrix.inverse()
  const parts = [...svg.querySelectorAll<SVGGraphicsElement>('[data-sequence-participant]')]
  const nodes: GraphNode[] = []
  for (const [id, node] of binding.participants) {
    const points: { x: number; y: number }[] = []
    for (const element of parts.filter(part => part.getAttribute('data-sequence-participant') === id)) {
      if (!element.getBBox || !element.getScreenCTM) return null
      const box = element.getBBox(), ctm = element.getScreenCTM()
      if (!ctm) return null
      const transform = inverse.multiply(ctm)
      for (const x of [box.x, box.x + box.width]) for (const y of [box.y, box.y + box.height]) {
        points.push({ x: transform.a * x + transform.c * y + transform.e, y: transform.b * x + transform.d * y + transform.f })
      }
    }
    if (!points.length || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
    const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x))
    const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y))
    nodes.push({ ...node, x: (left + right) / 2, y: (top + bottom) / 2, properties: {
      ...node.properties, 'visual:width': Math.max(1, right - left), 'visual:height': Math.max(1, bottom - top), 'visual:shape': 'rect',
    } })
  }
  return { ...graph!, nodes, edges: [...binding.events.values()] }
}
