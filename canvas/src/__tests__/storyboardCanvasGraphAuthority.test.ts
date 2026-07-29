import {
  applyStoryboardCanvasGraphPropertyAuthority,
  resolveStoryboardCanvasGraphDataAuthority,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardCanvasGraphAuthority'
import { readSubgraphs, writeSubgraphs } from '@/lib/graph/subgraphs'
import type { GraphData } from '@/lib/graph/types'

const graph = (id: string, nodeIds: string[] = [id]): GraphData => ({
  type: 'Graph',
  nodes: nodeIds.map(nodeId => ({ id: nodeId, label: nodeId, type: 'Node', properties: {} })),
  edges: [],
})

export function testStoryboardCanvasGraphAuthorityPrefersLiveNonEmptyDraft() {
  const resolved = resolveStoryboardCanvasGraphDataAuthority({
    baseGraphData: graph('base'),
    draftGraphData: graph('draft'),
    renderGraphData: graph('render'),
  })
  if (resolved.nodes?.[0]?.id !== 'draft') throw new Error('expected a live non-empty draft to own Storyboard display')
}

export function testStoryboardCanvasGraphAuthorityRejectsEmptyTransientDraft() {
  const resolved = resolveStoryboardCanvasGraphDataAuthority({
    baseGraphData: graph('base'),
    draftGraphData: { type: 'Graph', nodes: [], edges: [] },
    renderGraphData: graph('render'),
  })
  if (resolved.nodes?.[0]?.id !== 'render') throw new Error('expected an empty transient draft to preserve the stable Storyboard render graph')
}

export function testStoryboardCanvasGraphAuthorityHonorsPendingEmptyMarkdownDraft() {
  const pendingMarkdownGraph: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: { pending: true, source: 'markdown:/docs/note.md' },
  }
  const resolved = resolveStoryboardCanvasGraphDataAuthority({
    baseGraphData: graph('base'),
    draftGraphData: pendingMarkdownGraph,
    renderGraphData: graph('render'),
  })
  if (resolved !== pendingMarkdownGraph || resolved.nodes?.length !== 0) {
    throw new Error('expected a pending blank markdown document to clear the Storyboard instead of reusing stale cards')
  }
}

export function testStoryboardCanvasGraphAuthorityProjectsCanonicalSubgraphs() {
  const renderGraph = graph('render', ['card-a', 'panel-b'])
  const canonicalGraph = writeSubgraphs(graph('canonical', ['card-a', 'panel-b']), [{
    id: 'overlay-group',
    label: 'Overlay group',
    memberNodeIds: ['card-a', 'panel-b'],
    kind: 'subgraph',
    parentId: null,
    autoBounds: true,
  }])

  const projected = applyStoryboardCanvasGraphPropertyAuthority({
    graphData: renderGraph,
    propertyAuthorityGraphData: canonicalGraph,
  })
  const subgraphs = readSubgraphs(projected)
  if (subgraphs.length !== 1 || subgraphs[0]?.id !== 'overlay-group') {
    throw new Error('expected canonical grouping mutations to reach the Storyboard render projection')
  }
  if (subgraphs[0]?.memberNodeIds.join('|') !== 'card-a|panel-b' || subgraphs[0]?.autoBounds !== true) {
    throw new Error('expected Storyboard group membership and automatic bounds behavior to remain intact')
  }
}

export function testStoryboardCanvasGraphAuthorityClearsCanonicalSubgraphs() {
  const renderGraph = writeSubgraphs(graph('render', ['card-a']), [{
    id: 'stale-group',
    label: 'Stale group',
    memberNodeIds: ['card-a'],
  }])
  const canonicalGraph = writeSubgraphs(graph('canonical', ['card-a']), [])
  const projected = applyStoryboardCanvasGraphPropertyAuthority({
    graphData: renderGraph,
    propertyAuthorityGraphData: canonicalGraph,
  })
  if (readSubgraphs(projected).length !== 0) {
    throw new Error('expected canonical Ungroup to clear stale Storyboard projection groups')
  }
}
