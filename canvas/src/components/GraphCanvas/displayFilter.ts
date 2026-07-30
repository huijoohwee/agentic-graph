import { getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { DOCUMENT_CONTAINMENT_EDGE_LABELS } from '@/lib/graph/documentContainmentEdgeLabels'
import { readGraphActiveDocumentViewMode } from '@/lib/graph/documentViewMode'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { hashScopedStringArraySignature } from '@/lib/hash/signature'

const readDisplayNodeId = (node: GraphNode | null | undefined): string => (
  String(unwrapGraphCellValue(node?.id) ?? '').trim()
)

const isFrontmatterDisplayGraph = (graphData: GraphData): boolean => {
  if (String(graphData.context || '') === 'frontmatter-flow') return true
  const meta = (graphData.metadata || {}) as Record<string, unknown>
  if (String(meta.kind || '') === 'frontmatter-flow') return true
  const nodes = Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : []
  for (let i = 0; i < nodes.length; i += 1) {
    const props = (nodes[i]?.properties || {}) as Record<string, unknown>
    if (props.isMermaidFrontmatter === true) return true
    if (String(props.mermaidScope || '') === 'frontmatter') return true
  }
  return false
}

const isParagraphOrListNode = (n: GraphNode): boolean => {
  const t = String(n.type || '')
  return t === 'Paragraph' || t === 'List'
}

const DOCUMENT_STRUCTURE_SCAFFOLD_NODE_TYPES = new Set<string>([
  'Document',
  'Section',
  'Paragraph',
  'List',
  'ListItem',
  'Anchor',
  'InternalLink',
])

const NON_STRUCTURE_HIDDEN_EDGE_LABELS = new Set<string>([
  ...DOCUMENT_CONTAINMENT_EDGE_LABELS,
  'hasAnchor',
])

const isDocumentStructureScaffoldNode = (n: GraphNode | null | undefined): boolean => {
  if (!n) return false
  return DOCUMENT_STRUCTURE_SCAFFOLD_NODE_TYPES.has(String(n.type || '').trim())
}

export const isDisplayNode = (n: GraphNode): boolean => {
  if (getNodeMediaSpec(n)) return true
  if (String(n.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return true
  if (String(n.type || '') === 'MermaidSubgraph') return false
  if (String(n.type || '') === 'KeywordSource') return false
  const props = (n.properties || {}) as Record<string, unknown>
  const isHeadingSection = String(n.type || '') === 'Section' && typeof props.level === 'number'
  return !isHeadingSection
}

export const getDisplayNodes = (graphData: GraphData): GraphNode[] => {
  const nodes = Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : []
  const preferred = nodes.filter(isDisplayNode)
  return preferred.length > 0 ? preferred : nodes
}

export const getDisplayEdges = (args: { edges: GraphEdge[]; displayNodeIdSet: Set<string> }): GraphEdge[] => {
  const edges = Array.isArray(args.edges) ? args.edges : []
  const base = edges.filter(e => {
    const { src, tgt } = readGraphEdgeEndpoints(e)
    if (!src || !tgt) return false
    if (!args.displayNodeIdSet.has(src) || !args.displayNodeIdSet.has(tgt)) return false
    return true
  })

  const preferred = base.filter(e => {
    if (e.label === 'hasMermaidNode' || e.label === 'hasMermaidSubgraph' || e.label === 'hasMermaid') return false
    return true
  })
  return preferred.length > 0 ? preferred : base
}

export const getGraphDataForDisplay = (args: { graphData: GraphData; edges?: GraphEdge[] | null }): GraphData => {
  const graphData = args.graphData
  const frontmatterMode = isFrontmatterDisplayGraph(graphData)
  const activeDocumentViewMode = readGraphActiveDocumentViewMode(graphData)
  const hideDocumentStructureScaffold = activeDocumentViewMode != null && activeDocumentViewMode !== 'documentStructure'

  const allNodes = Array.isArray(graphData.nodes) ? (graphData.nodes as GraphNode[]) : []
  const edgesSource = Array.isArray(args.edges)
    ? args.edges
    : Array.isArray(graphData.edges)
      ? (graphData.edges as GraphEdge[])
      : []
  const nodeLookupKey = hashScopedStringArraySignature(
    'graph-canvas-display-filter-nodes',
    allNodes.map(node => `${String(node?.id || '').trim()}:${String(node?.type || '').trim()}`),
  )
  const nodeLookup = getCachedGraphLookup({
    cacheScope: 'graph-canvas-display-filter',
    graphData,
    graphSemanticKey: nodeLookupKey,
  })
  const nodeById = nodeLookup?.nodeById || new Map<string, GraphNode>()

  const preferredNodes = allNodes.filter(n => {
    if (frontmatterMode && isParagraphOrListNode(n)) return false
    if (hideDocumentStructureScaffold && isDocumentStructureScaffoldNode(n)) return false
    return isDisplayNode(n)
  })
  const baseNodes = preferredNodes.length > 0 ? preferredNodes : allNodes
  const baseNodeIdSet = new Set<string>(baseNodes.map(readDisplayNodeId).filter(Boolean))
  const filteredEdgesSource = hideDocumentStructureScaffold
    ? edgesSource.filter(e => {
        const label = String(e.label || '').trim()
        if (NON_STRUCTURE_HIDDEN_EDGE_LABELS.has(label)) return false
        const { src: srcId, tgt: tgtId } = readGraphEdgeEndpoints(e)
        if (!srcId || !tgtId) return false
        if (label === 'pointsTo') {
          if (isDocumentStructureScaffoldNode(nodeById.get(srcId)) || isDocumentStructureScaffoldNode(nodeById.get(tgtId))) return false
        }
        return true
      })
    : edgesSource
  const edgesForBase = getDisplayEdges({ edges: filteredEdgesSource, displayNodeIdSet: baseNodeIdSet })

  if (preferredNodes.length > 0 && filteredEdgesSource.length > 0 && edgesForBase.length === 0) {
    const required = new Set<string>(baseNodeIdSet)
    for (let i = 0; i < filteredEdgesSource.length; i += 1) {
      const e = filteredEdgesSource[i]
      const { src, tgt } = readGraphEdgeEndpoints(e)
      if (src) required.add(src)
      if (tgt) required.add(tgt)
    }
    const connectedNodes = allNodes.filter(n => {
      const id = String(n.id)
      if (!required.has(id)) return false
      if (hideDocumentStructureScaffold && isDocumentStructureScaffoldNode(n)) return false
      if (frontmatterMode && isParagraphOrListNode(n)) return false
      return true
    })
    const connectedNodeIdSet = new Set<string>(connectedNodes.map(readDisplayNodeId).filter(Boolean))
    const edgesForConnected = getDisplayEdges({ edges: filteredEdgesSource, displayNodeIdSet: connectedNodeIdSet })
    return { ...graphData, nodes: connectedNodes, edges: edgesForConnected }
  }

  return { ...graphData, nodes: baseNodes, edges: edgesForBase }
}
