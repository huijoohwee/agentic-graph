import { parseSequence } from './sequenceModel'
import type { MermaidParserContext } from '@/features/parsers/markdownJsonLdMermaidParser'

/** Projects explicit authored order; temporal order is never inferred from topology. */
export function projectSequenceGraph(code: string, ctx: MermaidParserContext): void {
  const scope = ctx.diagramId || `${ctx.docId}:${ctx.diagramScope || 'block'}:${ctx.startIndex}`
  const model = parseSequence(code, scope)
  if (model.diagnostics.length) return
  const nodeId = (id: string) => `sequence:${ctx.gid}:${scope}:participant:${id}`
  for (const p of model.participants) {
    ctx.ensureNode({ '@id': nodeId(p.id), '@type': 'MermaidNode', labels: ['MermaidNode'], name: p.label,
      properties: { nodeName: p.id, label: p.label, mermaidDiagramId: ctx.diagramId, mermaidScope: ctx.diagramScope || 'block', sequenceParticipant: true, 'visual:shape': 'rect' },
      metadata: ctx.mkMeta(ctx.startIndex + p.line - 1, ctx.startIndex + p.line - 1) })
    ctx.addRel(ctx.docId, 'hasMermaidNode', nodeId(p.id))
  }
  for (const event of model.events) ctx.addRel(nodeId(event.from), 'pointsTo', nodeId(event.to), {
    sequenceEventId: event.id, sequenceOrdinal: event.ordinal, label: event.label, sequenceArrow: event.arrow,
    sequenceBranches: event.branches, mermaidDiagramId: ctx.diagramId,
    sequenceKind: event.kind, sequenceProtocol: event.protocol,
    sourceLine: ctx.startIndex + event.line - 1,
  })
}
