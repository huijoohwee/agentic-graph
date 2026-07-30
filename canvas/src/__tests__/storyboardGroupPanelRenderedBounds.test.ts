import { writeSubgraphs, type UserSubgraph } from '@/lib/graph/subgraphs'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  collectStoryboardGroupPanelMemberNodeIds,
  computeStoryboardGroupPanelRenderedBox,
} from '@/lib/storyboardWidget/renderedGroupPanelBounds'

export function testGeneratedOutputGroupUsesRenderedCollectiveBounds() {
  const source: GraphNode = { id: 'source', type: 'TextGeneration', label: 'Source', properties: {} }
  const panel: GraphNode = { id: 'panel', type: 'RichMediaPanel', label: 'Panel', properties: {} }
  const childA: GraphNode = {
    id: 'child-a',
    type: 'TextGeneration',
    label: 'Child A',
    properties: { workflowMaterializationParentNodeId: panel.id },
  }
  const childB: GraphNode = {
    id: 'child-b',
    type: 'TextGeneration',
    label: 'Child B',
    properties: { workflowMaterializationParentNodeId: childA.id },
  }
  const group: UserSubgraph = {
    id: 'generated',
    label: 'Generated outputs',
    memberNodeIds: [panel.id],
    parentId: null,
    kind: 'subgraph',
    autoBounds: true,
  }
  const graphData: GraphData = writeSubgraphs({
    type: 'Graph',
    nodes: [source, panel, childA, childB],
    edges: [],
  }, [group])
  const memberNodeIds = collectStoryboardGroupPanelMemberNodeIds({
    graphData,
    groupId: group.id,
    groups: [group],
  })
  const box = computeStoryboardGroupPanelRenderedBox({
    surfaceRect: { left: 100, top: 50 },
    memberRects: [
      { left: 400, top: 200, right: 760, bottom: 400 },
      { left: 120, top: 80, right: 480, bottom: 280 },
      { left: 700, top: 500, right: 1060, bottom: 700 },
    ],
    padding: 24,
  })

  if (
    memberNodeIds.join(',') !== ['child-a', 'child-b', 'panel'].join(',')
    || memberNodeIds.includes(source.id)
    || !box
    || box.left !== -4
    || box.top !== 6
    || box.width !== 988
    || box.height !== 668
  ) {
    throw new Error(`expected a rendered collective group around only generated outputs, got ${JSON.stringify({ memberNodeIds, box })}`)
  }
}
