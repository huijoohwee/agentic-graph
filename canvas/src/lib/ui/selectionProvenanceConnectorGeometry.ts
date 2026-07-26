import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'

export type SelectionProvenanceConnectorGeometry = {
  edgeId: string
  path: string
  sourceX: number
  sourceY: number
}

export const resolveSelectionProvenanceOutputHandle = (args: {
  root: HTMLElement
  sourceNodeId: unknown
  sourcePortKey: unknown
}): HTMLElement | null => {
  const sourceNodeId = String(args.sourceNodeId || '').trim()
  const sourcePortKey = String(args.sourcePortKey || '').trim()
  if (!sourceNodeId) return null
  const handles = Array.from(
    args.root.ownerDocument.querySelectorAll<HTMLElement>(
      '[data-kg-port-handle="1"][data-kg-port-dir="out"]',
    ),
  ).filter(handle => (
    isCanonicalNodeIdEqual(handle.dataset.kgPortNodeId, sourceNodeId)
  ))
  return handles.find(handle => handle.dataset.kgPortKey === sourcePortKey)
    || handles[0]
    || null
}

export const buildSelectionProvenanceConnectorPath = (args: {
  source: { x: number; y: number }
  target: { x: number; y: number }
}): string => {
  const direction = args.target.x >= args.source.x ? 1 : -1
  const bend = Math.max(18, Math.abs(args.target.x - args.source.x) * 0.42)
  return [
    `M ${args.source.x.toFixed(2)} ${args.source.y.toFixed(2)}`,
    `C ${(args.source.x + direction * bend).toFixed(2)} ${args.source.y.toFixed(2)}`,
    `${(args.target.x - direction * bend).toFixed(2)} ${args.target.y.toFixed(2)}`,
    `${args.target.x.toFixed(2)} ${args.target.y.toFixed(2)}`,
  ].join(' ')
}
