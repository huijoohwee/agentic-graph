import { getGraphDataForDisplay } from '@/components/GraphCanvas/displayFilter'
import {
  collapsedGroupNodeIdFor,
  deriveGraphDataWithGroupCollapse,
} from '@/components/GraphCanvas/viewDerivation'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { resolveStoryboardCanvasGraphDataAuthority } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCanvasGraphAuthority'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import type { GraphData } from '@/lib/graph/types'

const sortedNodeIds = (graphData: GraphData | null | undefined): string[] => (
  (graphData?.nodes || [])
    .map(node => String(node?.id || '').trim())
    .filter(Boolean)
    .sort()
)

const sortedStoryboardVisualNodeIds = (graphData: GraphData): string[] => {
  const board = buildStoryboardBoardModel({ graphData, graphRevision: 1 })
  const cardIds = board.lanes.flatMap(lane => lane.cards.map(card => card.id))
  const panelIds = (graphData.nodes || [])
    .filter(isRichMediaPanelNode)
    .map(node => String(node.id || '').trim())
    .filter(Boolean)
  return Array.from(new Set([...cardIds, ...panelIds])).sort()
}

const assertSameIds = (actual: string[], expected: string[], message: string): void => {
  if (actual.join('|') !== expected.join('|')) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

export function testStoryboardRendererPreservesD3DisplayNodeGranularity() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', label: 'Document Root', type: 'Document', properties: {} },
      {
        id: 'rich-a',
        label: 'First response',
        type: 'TextGeneration',
        properties: { summary: 'First substantive response.' },
      },
      { id: 'thin-entity', label: 'Evidence', type: 'Entity', properties: {} },
      {
        id: 'rich-b',
        label: 'Second response',
        type: 'TextGeneration',
        properties: { summary: 'Second substantive response.' },
      },
      {
        id: 'media-panel',
        label: 'Response media',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        properties: { videoUrl: 'https://example.com/response.mp4' },
      },
    ],
    edges: [
      { id: 'root-a', source: 'root', target: 'rich-a', label: 'contains', properties: {} },
      { id: 'a-thin', source: 'rich-a', target: 'thin-entity', label: 'supports', properties: {} },
      { id: 'thin-b', source: 'thin-entity', target: 'rich-b', label: 'supports', properties: {} },
      { id: 'b-panel', source: 'rich-b', target: 'media-panel', label: 'renders', properties: {} },
    ],
  }
  const d3DisplayGraph = getGraphDataForDisplay({ graphData })
  const storyboardVisualIds = sortedStoryboardVisualNodeIds(d3DisplayGraph)
  const d3NodeIds = sortedNodeIds(d3DisplayGraph)

  assertSameIds(
    storyboardVisualIds,
    d3NodeIds,
    'expected Storyboard cards plus Rich Media Panels to preserve D3 display-node granularity',
  )
  if (!storyboardVisualIds.includes('thin-entity') || !storyboardVisualIds.includes('root')) {
    throw new Error(`expected low-signal and structural display nodes to remain visible, got ${JSON.stringify(storyboardVisualIds)}`)
  }
  const board = buildStoryboardBoardModel({ graphData: d3DisplayGraph, graphRevision: 1 })
  const cardIds = board.lanes.flatMap(lane => lane.cards.map(card => card.id))
  if (cardIds.includes('media-panel')) {
    throw new Error('expected Rich Media Panel to remain a separate visual instead of a duplicate Storyboard card')
  }
}

export function testStoryboardRendererUsesCollapsedD3DisplayTopology() {
  const draftGraphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'member-a', label: 'Member A', type: 'Entity', properties: { 'visual:community': 0 } },
      { id: 'member-b', label: 'Member B', type: 'Entity', properties: { 'visual:community': 0 } },
      { id: 'outside', label: 'Outside', type: 'Entity', properties: { 'visual:community': 1 } },
    ],
    edges: [
      { id: 'a-outside', source: 'member-a', target: 'outside', label: 'relatesTo', properties: {} },
      { id: 'b-outside', source: 'member-b', target: 'outside', label: 'relatesTo', properties: {} },
    ],
  }
  const renderGraphData = deriveGraphDataWithGroupCollapse({
    graphData: draftGraphData,
    collapsedGroupIds: ['community:0'],
  })
  const resolved = resolveStoryboardCanvasGraphDataAuthority({
    baseGraphData: draftGraphData,
    draftGraphData,
    renderGraphData,
  })
  const collapsedNodeId = collapsedGroupNodeIdFor('community:0')
  const resolvedIds = sortedNodeIds(resolved)
  if (resolvedIds.includes('member-a') || resolvedIds.includes('member-b') || !resolvedIds.includes(collapsedNodeId)) {
    throw new Error(`expected Storyboard authority to preserve collapsed D3 topology, got ${JSON.stringify(resolvedIds)}`)
  }

  const d3DisplayGraph = getGraphDataForDisplay({ graphData: renderGraphData })
  assertSameIds(
    sortedStoryboardVisualNodeIds(resolved),
    sortedNodeIds(d3DisplayGraph),
    'expected collapsed Storyboard and D3 displays to retain the same semantic node ids',
  )
}
