import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashText } from '@/features/parsers/hash'

type FrontmatterFlowSubgraphKeyInput = {
  id: string
  label: string
  memberNodeIds: string[]
  parentId?: string | null
  kind?: 'subgraph' | 'cluster'
  autoBounds?: boolean
}

const asString = (v: unknown): string => typeof v === 'string' ? v.trim() : ''

export function buildFrontmatterFlowSourceLayerHash(args: {
  stableId: string
  nodes: ReadonlyArray<GraphNode>
  edges: ReadonlyArray<GraphEdge>
  subgraphs?: ReadonlyArray<FrontmatterFlowSubgraphKeyInput>
}): string {
  const stableId = String(args.stableId || '').trim()
  const nodeSig = (Array.isArray(args.nodes) ? args.nodes : [])
    .map(node => {
      const id = asString(node?.id)
      const x = typeof node?.x === 'number' && Number.isFinite(node.x) ? Math.round(node.x) : 'na'
      const y = typeof node?.y === 'number' && Number.isFinite(node.y) ? Math.round(node.y) : 'na'
      return `${id}|${x}|${y}`
    })
    .filter(Boolean)
    .sort()
    .join(';')
  const edgeSig = (Array.isArray(args.edges) ? args.edges : [])
    .map(edge => `${asString(edge?.id)}|${asString(edge?.source)}|${asString(edge?.target)}`)
    .filter(Boolean)
    .sort()
    .join(';')
  const subgraphSig = (Array.isArray(args.subgraphs) ? args.subgraphs : [])
    .map(row => {
      const memberSig = (Array.isArray(row?.memberNodeIds) ? row.memberNodeIds : [])
        .map(memberId => asString(memberId))
        .filter(Boolean)
        .sort()
        .join(',')
      return `${asString(row?.id)}|${asString(row?.label)}|${asString(row?.kind)}|autoBounds:${row?.autoBounds === true ? 'true' : 'false'}|${asString(row?.parentId)}|${memberSig}`
    })
    .filter(Boolean)
    .sort()
    .join(';')
  return buildScopedGraphSemanticKey('frontmatter-flow-source-layer', {
    graphSemanticKey: `frontmatter-flow|${stableId}|nodes:${nodeSig}|edges:${edgeSig}|subgraphs:${subgraphSig}`,
  }) || hashText(`frontmatter-flow|${stableId}|nodes:${nodeSig}|edges:${edgeSig}|subgraphs:${subgraphSig}`)
}
