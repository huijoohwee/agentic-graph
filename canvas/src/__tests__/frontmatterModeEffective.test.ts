import type { GraphData } from '@/lib/graph/types'
import {
  computeEffectiveFrontmatterMode,
  isStoryboardWidgetFrontmatterDocumentModeRequested,
  isFrontmatterDocumentModeRequested,
  isFrontmatterFlowGraph,
  readFlowchartFrontmatterGraphSource,
} from '@/lib/graph/frontmatterMode'
import { filterGraphToFrontmatterMermaid } from '@/lib/graph/layerDerivation'

export function testFrontmatterModeEffectiveNoopWhenNoSeeds() {
  const graphData: GraphData = {
    type: 'graph',
    metadata: {},
    nodes: [{ id: 'n1', type: 'Entity', label: 'n1', properties: {} }],
    edges: [],
  }
  const effective = computeEffectiveFrontmatterMode({
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
    graphData,
  })
  if (effective !== false) throw new Error('expected frontmatter mode to be ineffective without seeds')

  const filtered = filterGraphToFrontmatterMermaid(graphData)
  if (filtered !== graphData) throw new Error('expected frontmatter filter to be a no-op without seeds')
}

export function testFrontmatterModeEffectiveWhenSeedsExist() {
  const graphData: GraphData = {
    type: 'graph',
    metadata: {},
    nodes: [
      { id: 'm1', type: 'MermaidNode', label: 'm1', properties: { mermaidScope: 'frontmatter' } },
      { id: 'n1', type: 'Entity', label: 'n1', properties: {} },
    ],
    edges: [{ id: 'e1', source: 'm1', target: 'n1', label: 'pointsTo', properties: {} }],
  }

  const effective = computeEffectiveFrontmatterMode({
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
    graphData,
  })
  if (effective !== true) throw new Error('expected frontmatter mode to be effective with seeds')

  const filtered = filterGraphToFrontmatterMermaid(graphData)
  if (filtered === graphData) throw new Error('expected filtered graph to be a new object when seeds exist')
  const nodeIds = new Set((filtered.nodes || []).map(n => String(n.id)))
  if (!nodeIds.has('m1') || !nodeIds.has('n1')) throw new Error('expected seed and reachable node to be included')
}

export function testFrontmatterModeEffectiveForFrontmatterFlowGraphWithoutMermaidSeeds() {
  const graphData: GraphData = {
    type: 'graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'n-flow', type: 'default', label: 'flow node', properties: {} }],
    edges: [],
  }
  const effective = computeEffectiveFrontmatterMode({
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
    graphData,
  })
  if (effective !== true) throw new Error('expected frontmatter mode to be effective for frontmatter-flow graph context')

  const composedGraphData: GraphData = {
    type: 'graph',
    context: 'agentic-os-semantic-markdown',
    metadata: { kind: 'agentic-os-semantic', graphKind: 'agentic-os-semantic', baseGraphKind: 'frontmatter-flow' },
    nodes: [{ id: 'n-composed-flow', type: 'default', label: 'composed flow node', properties: {} }],
    edges: [],
  }
  const composedEffective = computeEffectiveFrontmatterMode({
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
    graphData: composedGraphData,
  })
  if (composedEffective !== true) throw new Error('expected frontmatter mode to be effective for a composed graph with frontmatter-flow base kind')
  if (isFrontmatterFlowGraph(composedGraphData) !== true) {
    throw new Error('expected frontmatter-flow graph detection to honor the retained composed base graph kind')
  }
}

export function testFrontmatterFlowGraphDetectionDoesNotUseWidgetPropertyHeuristics() {
  const graphData: GraphData = {
    type: 'graph',
    metadata: {},
    nodes: [{ id: 'n1', type: 'Node', label: 'n1', properties: { 'flow:widgetFormId': 'fm:n1' } }],
    edges: [],
  }

  if (isFrontmatterFlowGraph(graphData) !== false) {
    throw new Error('expected frontmatter-flow detection to rely on graph identity metadata only')
  }
}

export function testFrontmatterFlowGraphDetectionReturnsFalseForNullGraphData() {
  if (isFrontmatterFlowGraph(null as unknown as GraphData) !== false) {
    throw new Error('expected frontmatter-flow detection to return false for null graphData during early document restore')
  }
}

export function testFlowchartFrontmatterGraphSourceSelectionRespectsMarkdownAndGraphSignals() {
  const mermaidGraph: GraphData = {
    type: 'graph',
    metadata: {},
    nodes: [
      { id: 'm1', type: 'MermaidNode', label: 'm1', properties: { mermaidScope: 'frontmatter' } },
      { id: 'n1', type: 'Entity', label: 'n1', properties: {} },
    ],
    edges: [{ id: 'e1', source: 'm1', target: 'n1', label: 'pointsTo', properties: {} }],
  }
  const markdownWithFrontmatterMermaid = [
    '---',
    'title: Test',
    'mermaid: true',
    '---',
    '',
    '# Hello',
  ].join('\n')
  if (readFlowchartFrontmatterGraphSource({ graphData: mermaidGraph, markdownText: markdownWithFrontmatterMermaid }) !== mermaidGraph) {
    throw new Error('expected flowchart frontmatter graph source helper to reuse the source graph when markdown and mermaid seeds both exist')
  }
  if (readFlowchartFrontmatterGraphSource({ graphData: mermaidGraph, markdownText: '# plain markdown' }) !== null) {
    throw new Error('expected flowchart frontmatter graph source helper to return null without frontmatter mermaid markdown')
  }

  const flowGraph: GraphData = {
    type: 'graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{ id: 'n-flow', type: 'default', label: 'flow node', properties: {} }],
    edges: [],
  }
  if (readFlowchartFrontmatterGraphSource({ graphData: flowGraph, markdownText: markdownWithFrontmatterMermaid }) !== flowGraph) {
    throw new Error('expected flowchart frontmatter graph source helper to preserve frontmatter-flow graphs directly')
  }
}

export function testFrontmatterSemanticRequestNormalizationKeepsExplicitAndImplicitContractsDistinct() {
  const graphData: GraphData = {
    type: 'graph',
    metadata: {},
    nodes: [{ id: 'm1', type: 'MermaidNode', label: 'm1', properties: { mermaidScope: 'frontmatter' } }],
    edges: [],
  }
  const effectiveImplicitDocument = computeEffectiveFrontmatterMode({
    frontmatterModeEnabled: true,
    documentSemanticMode: ' ',
    graphData,
  })
  if (effectiveImplicitDocument !== true) {
    throw new Error('expected effective frontmatter mode to treat blank semantic mode as document-compatible')
  }
  if (isFrontmatterDocumentModeRequested({ frontmatterModeEnabled: true, documentSemanticMode: ' ' }) !== false) {
    throw new Error('expected explicit frontmatter document-mode request helper to require an explicit document semantic mode')
  }
  if (isFrontmatterDocumentModeRequested({ frontmatterModeEnabled: true, documentSemanticMode: ' Document ' }) !== true) {
    throw new Error('expected frontmatter document-mode request helper to normalize whitespace and casing for document semantic mode')
  }
  if (
    isStoryboardWidgetFrontmatterDocumentModeRequested({
      canvas2dRenderer: 'storyboard',
      frontmatterModeEnabled: true,
      documentSemanticMode: ' Document ',
    }) !== true
  ) {
    throw new Error('expected storyboard widget frontmatter document-mode request helper to reuse the shared semantic normalization contract')
  }
}
