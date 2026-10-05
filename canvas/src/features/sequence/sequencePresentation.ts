import type { SequenceModel, SequenceTimedEvent } from './sequenceModel'
import { defaultSchema, type GraphSchema } from '@/lib/graph/schema'
import type { GraphNode } from '@/lib/graph/types'
import { getNodeHalfExtents2d, getNodeRenderShape2d } from '@/components/GraphCanvas/nodeSizing2d'
import { buildNodeShapePathD } from '@/components/GraphCanvas/shapePaths2d'
import { getPortHandlePosition, getNearestCardinalSide, getPortHandlesConfig, listPortHandlesForNodes, readNodePortHandleVisualMetrics } from '@/components/GraphCanvas/portHandles'

export const sequenceSvgEscape = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)
export const sequenceParticipantLabel = (model: SequenceModel, id: string) => model.participants.find(person => person.id === id)?.label || id

/** Canvas and Timeline derive state from the same half-open transport interval. */
export function sequenceEventState(event: SequenceTimedEvent | undefined, position: number) {
  return !event ? 'skipped' : position < event.startMs ? 'pending' : position >= event.startMs + event.durationMs ? 'complete' : 'active'
}

/** A presentation-only node delegates shape, dimensions and ports to the canvas owners. */
export function sequenceParticipantNode(id: string, point: { x: number; y: number }, card: { width: number; height: number }): GraphNode {
  return { id, type: 'MermaidNode', label: id, ...point, properties: {
    'visual:width': card.width, 'visual:height': card.height, 'visual:radius': Math.max(card.width, card.height) / 2,
  } }
}

export function sequenceParticipantSize(card: { width: number; height: number }, schema: GraphSchema = defaultSchema) {
  const { halfW, halfH } = getNodeHalfExtents2d(sequenceParticipantNode('', { x: 0, y: 0 }, card), schema)
  return { width: halfW * 2, height: halfH * 2 }
}

const portConfig = (card: { width: number; height: number }, schema: GraphSchema) => {
  const config = getPortHandlesConfig(schema)
  const metrics = readNodePortHandleVisualMetrics({ schema, nodeWidth: card.width, nodeHeight: card.height })
  return { ...config, offset: config.enabled ? metrics.offsetPx : 0, size: metrics.sizePx, strokeWidth: metrics.strokeWidthPx }
}

/** Outward painted extent beyond the participant body, using the rendered port metrics. */
export function sequenceParticipantPortPadding(card: { width: number; height: number }, schema: GraphSchema = defaultSchema): number {
  const cfg = portConfig(card, schema)
  return cfg.enabled ? cfg.offset + cfg.size + cfg.strokeWidth / 2 : 0
}

export function sequenceParticipantAnchor(node: GraphNode, target: { x: number; y: number }, card: { width: number; height: number }, schema: GraphSchema = defaultSchema) {
  const side = getNearestCardinalSide(node, { ...node, ...target })
  return getPortHandlePosition({ node, datum: { nodeId: node.id, side }, schema, cfg: portConfig(card, schema) })
}

export function sequenceParticipantSvg(person: SequenceModel['participants'][number], point: { x: number; y: number }, card: { width: number; height: number }, name: string, schema: GraphSchema = defaultSchema): string {
  const node = sequenceParticipantNode(person.id, point, card), shape = getNodeRenderShape2d(node, schema)
  const attributes = `class="sequence-participant" data-kg-node-shape="${shape}"`
  const body = shape === 'circle'
    ? `<circle cx="${point.x}" cy="${point.y}" r="${card.width / 2}" ${attributes}/>`
    : shape === 'rect'
      ? `<rect x="${point.x - card.width / 2}" y="${point.y - card.height / 2}" width="${card.width}" height="${card.height}" rx="10" ${attributes}/>`
      : `<path transform="translate(${point.x},${point.y})" d="${buildNodeShapePathD({ shape, ...card })}" ${attributes}/>`
  const cfg = portConfig(card, schema)
  const ports = !cfg.enabled ? '' : listPortHandlesForNodes([node]).map(datum => {
    const position = getPortHandlePosition({ node, datum, schema, cfg })
    return `<circle data-kg-port-handle="${datum.side}" cx="${position.x}" cy="${position.y}" r="${cfg.size}" fill="${sequenceSvgEscape(cfg.fill)}" stroke="${sequenceSvgEscape(cfg.stroke)}" stroke-width="${cfg.strokeWidth}" aria-hidden="true" pointer-events="none"/>`
  }).join('')
  return `${body}${ports}<text x="${point.x}" y="${point.y - 12}" font-size="10" class="sequence-participant-type">${person.actor ? 'ACTOR' : 'PARTICIPANT'}</text><text x="${point.x}" y="${point.y + 14}" font-size="14" class="sequence-participant-name">${sequenceSvgEscape(name)}</text>`
}
