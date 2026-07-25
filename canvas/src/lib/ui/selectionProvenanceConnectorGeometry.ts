export type SelectionProvenanceConnectorGeometry = {
  edgeId: string
  path: string
  sourceX: number
  sourceY: number
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
