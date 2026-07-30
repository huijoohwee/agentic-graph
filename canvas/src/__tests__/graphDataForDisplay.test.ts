import { getGraphDataForDisplay } from '@/components/GraphCanvas/displayFilter'
import { getCachedStoryboardWidgetOverlayEdgeGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import type { GraphData } from '@/lib/graph/types'

const cell = (key: string, type: string, value: unknown) => ({ key, type, value })

export const testGraphDataForDisplayFiltersNodesAndEdgesTogether = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'test',
    metadata: {},
    nodes: [
      { id: 'h1', type: 'Section', label: 'H1', properties: { level: 1 }, metadata: {} },
      { id: 'a', type: 'Entity', label: 'A', properties: {}, metadata: {} },
    ],
    edges: [
      { id: 'e1', source: 'h1', target: 'a', label: 'contains', properties: {}, metadata: {} },
      { id: 'e2', source: 'a', target: 'a', label: 'self', properties: {}, metadata: {} },
    ],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  if (nodeIds.has('h1')) throw new Error('expected Section heading node to be filtered from display nodes')
  if (!nodeIds.has('a')) throw new Error('expected Entity node to remain in display nodes')
  const edgeIds = new Set((display.edges || []).map(e => String((e as { id?: unknown }).id)))
  if (edgeIds.has('e1')) throw new Error('expected edge with filtered endpoint to be removed')
  if (!edgeIds.has('e2')) throw new Error('expected edge between display endpoints to remain')
}

export const testGraphDataForDisplayKeepsFilteredEndpointsWhenAllEdgesWouldDisappear = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'test',
    metadata: {},
    nodes: [
      { id: 'h1', type: 'Section', label: 'H1', properties: { level: 1 }, metadata: {} },
      { id: 'p1', type: 'Paragraph', label: 'P1', properties: {}, metadata: {} },
    ],
    edges: [{ id: 'e1', source: 'h1', target: 'p1', label: 'hasSection', properties: {}, metadata: {} }],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  if (!nodeIds.has('h1')) throw new Error('expected filtered heading node to be restored when it carries all edges')
  if (!nodeIds.has('p1')) throw new Error('expected paragraph node to remain')
  const edgeIds = new Set((display.edges || []).map(e => String((e as { id?: unknown }).id)))
  if (!edgeIds.has('e1')) throw new Error('expected edge to be preserved when it would otherwise disappear')
}

export const testGraphDataForDisplayKeepsKeywordSourceWhenAllEdgesWouldDisappear = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'test',
    metadata: {},
    nodes: [
      { id: 'doc:a', type: 'KeywordSource', label: 'A', properties: {}, metadata: {} },
      { id: 'kw:x', type: 'Entity', label: 'X', properties: {}, metadata: {} },
    ],
    edges: [{ id: 'e1', source: 'doc:a', target: 'kw:x', label: 'mentions', properties: {}, metadata: {} }],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  if (!nodeIds.has('doc:a')) throw new Error('expected KeywordSource node to be restored when it carries all edges')
  if (!nodeIds.has('kw:x')) throw new Error('expected keyword node to remain')
  const edgeIds = new Set((display.edges || []).map(e => String((e as { id?: unknown }).id)))
  if (!edgeIds.has('e1')) throw new Error('expected mention edge to be preserved')
}

export const testGraphDataForDisplayFrontmatterSuppressesParagraphAndList = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'markdown',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [
      { id: 'm1', type: 'MermaidNode', label: 'M1', properties: { mermaidScope: 'frontmatter' }, metadata: {} },
      { id: 'p1', type: 'Paragraph', label: 'Paragraph 1', properties: {}, metadata: {} },
      { id: 'l1', type: 'List', label: 'List 1', properties: {}, metadata: {} },
    ],
    edges: [
      { id: 'e1', source: 'm1', target: 'p1', label: 'hasBlock', properties: {}, metadata: {} },
      { id: 'e2', source: 'p1', target: 'l1', label: 'next', properties: {}, metadata: {} },
    ],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  if (!nodeIds.has('m1')) throw new Error('expected frontmatter mermaid node to remain')
  if (nodeIds.has('p1')) throw new Error('expected Paragraph node to be suppressed in frontmatter display')
  if (nodeIds.has('l1')) throw new Error('expected List node to be suppressed in frontmatter display')
  if ((display.edges || []).length !== 0) throw new Error('expected edges connected only to suppressed nodes to be removed')
}

export const testGraphDataForDisplayKeepsRichMediaPanelWithoutLocalMediaSpec = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'test',
    metadata: {},
    nodes: [
      { id: 'widget-1', type: 'TextGeneration', label: 'OpenAI Text Widget', properties: { output: 'hello' }, metadata: {} },
      { id: 'panel-1', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label: 'Rich Media Panel', properties: {}, metadata: {} },
    ],
    edges: [
      { id: 'edge-1', source: 'widget-1', target: 'panel-1', label: 'linksTo', properties: {}, metadata: {} },
    ],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  if (!nodeIds.has('panel-1')) throw new Error('expected Rich Media Panel node to stay in display graph before connected values are rendered')
  const edgeIds = new Set((display.edges || []).map(e => String((e as { id?: unknown }).id)))
  if (!edgeIds.has('edge-1')) throw new Error('expected edge to Rich Media Panel to stay visible with the panel node')
}

export const testGraphDataForDisplayKeepsEdgesBetweenTypedFrontmatterNodeIds = () => {
  const graphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [
      {
        id: cell('id', 'string', 'source-card'),
        type: cell('type', 'string', 'TextGeneration'),
        label: cell('label', 'string', 'Source Card'),
        properties: cell('properties', 'object', {}),
      },
      {
        id: cell('id', 'string', 'generated-card'),
        type: cell('type', 'string', 'TextGeneration'),
        label: cell('label', 'string', 'Generated Card'),
        properties: cell('properties', 'object', {}),
      },
      {
        id: cell('id', 'string', 'ledger'),
        type: cell('type', 'string', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID),
        label: cell('label', 'string', 'Generated outputs'),
        properties: cell('properties', 'object', {}),
      },
    ],
    edges: [{
      id: cell('id', 'string', 'generated-edge'),
      source: cell('source', 'string', 'source-card'),
      target: cell('target', 'string', 'generated-card'),
      label: cell('label', 'string', 'candidateOption'),
      properties: cell('properties', 'object', {
        workflowMaterializationProjectionSourceNodeId: 'ledger',
      }),
    }],
  } as unknown as GraphData

  const display = getGraphDataForDisplay({ graphData })
  const overlay = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData,
    graphRevision: 1,
    overlayNodeIds: ['source-card', 'generated-card', 'ledger'],
    preferCurrentGraphDataRefs: true,
  })
  if (
    display.nodes.length !== 3
    || display.edges.length !== 1
    || overlay?.edges.length !== 1
    || overlay.edges[0]?.source !== 'ledger'
    || overlay.edges[0]?.target !== 'generated-card'
  ) {
    throw new Error(`expected typed frontmatter endpoints to retain their visible edge, got ${JSON.stringify(display)}`)
  }
}

export const testGraphDataForDisplaySuppressesDocumentStructureScaffoldOutsideDocumentStructureMode = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'markdown',
    metadata: { 'kg:activeDocumentViewMode': 'keyword' },
    nodes: [
      { id: 'doc1', type: 'Document', label: 'Doc', properties: {}, metadata: {} },
      { id: 'sec1', type: 'Section', label: 'Section 1', properties: { level: 1 }, metadata: {} },
      { id: 'p1', type: 'Paragraph', label: 'Paragraph 1', properties: {}, metadata: {} },
      { id: 'l1', type: 'List', label: 'List 1', properties: {}, metadata: {} },
      { id: 'li1', type: 'ListItem', label: 'Item 1', properties: {}, metadata: {} },
      { id: 'a1', type: 'Anchor', label: 'Anchor 1', properties: { anchorId: 'phase-1' }, metadata: {} },
      { id: 'il1', type: 'InternalLink', label: 'Link 1', properties: {}, metadata: {} },
      { id: 'm1', type: 'MermaidNode', label: 'Flow 1', properties: { mermaidScope: 'frontmatter' }, metadata: {} },
      { id: 'entity1', type: 'Entity', label: 'Entity 1', properties: {}, metadata: {} },
    ],
    edges: [
      { id: 'e-doc-anchor', source: 'doc1', target: 'a1', label: 'hasAnchor', properties: {}, metadata: {} },
      { id: 'e-sec-block', source: 'sec1', target: 'p1', label: 'hasBlock', properties: {}, metadata: {} },
      { id: 'e-list-item', source: 'l1', target: 'li1', label: 'hasItem', properties: {}, metadata: {} },
      { id: 'e-link-anchor', source: 'il1', target: 'a1', label: 'pointsTo', properties: {}, metadata: {} },
      { id: 'e-flow-entity', source: 'm1', target: 'entity1', label: 'rel', properties: {}, metadata: {} },
    ],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  for (const id of ['doc1', 'sec1', 'p1', 'l1', 'li1', 'a1', 'il1']) {
    if (nodeIds.has(id)) throw new Error(`expected document-structure scaffold node ${id} to be suppressed outside document structure mode`)
  }
  for (const id of ['m1', 'entity1']) {
    if (!nodeIds.has(id)) throw new Error(`expected non-structure node ${id} to remain visible`)
  }
  const edgeIds = new Set((display.edges || []).map(e => String((e as { id?: unknown }).id)))
  for (const id of ['e-doc-anchor', 'e-sec-block', 'e-list-item', 'e-link-anchor']) {
    if (edgeIds.has(id)) throw new Error(`expected document-structure scaffold edge ${id} to be suppressed outside document structure mode`)
  }
  if (!edgeIds.has('e-flow-entity')) throw new Error('expected non-structure edge to remain visible')
}

export const testGraphDataForDisplayKeepsKeywordEdgesWithHiddenKeywordSourceEndpoint = () => {
  const graphData: GraphData = {
    type: 'Graph',
    context: 'keyword-view',
    metadata: { 'kg:activeDocumentViewMode': 'keyword' },
    nodes: [
      { id: 'src-1', type: 'KeywordSource', label: 'Source', properties: {}, metadata: {} },
      { id: 'kw-1', type: 'Entity', label: 'Keyword', properties: { 'keyword:kind': 'keyword' }, metadata: {} },
    ],
    edges: [
      { id: 'e-mentions', source: 'src-1', target: 'kw-1', label: 'mentions', properties: {}, metadata: {} },
    ],
  }

  const display = getGraphDataForDisplay({ graphData })
  const nodeIds = new Set((display.nodes || []).map(n => String((n as { id?: unknown }).id)))
  if (!nodeIds.has('src-1') || !nodeIds.has('kw-1')) {
    throw new Error('expected connected keyword helper endpoint and keyword entity to stay visible when preserving a valid visible edge')
  }
  const edgeIds = new Set((display.edges || []).map(e => String((e as { id?: unknown }).id)))
  if (!edgeIds.has('e-mentions')) {
    throw new Error('expected keyword mentions edge to remain visible outside document structure mode')
  }
}
