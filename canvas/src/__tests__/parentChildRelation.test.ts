import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  absoluteToParentRelative,
  findNodeParentSubgraph,
  parentRelativeToAbsolute,
  preserveAbsolutePositionForParent,
  selectParentDropTarget,
} from '@/lib/canvas/parentChildRelation'
import { readSubgraphs } from '@/lib/graph/subgraphs'

export function testParentChildRelationInteractionContract() {
  const absolute = { x: -42.5, y: 311.25 }
  const parentOrigin = { x: -180, y: 90 }
  const relative = absoluteToParentRelative(absolute, parentOrigin)
  const restored = parentRelativeToAbsolute(relative, parentOrigin)
  if (relative.x !== 137.5 || relative.y !== 221.25 || restored.x !== absolute.x || restored.y !== absolute.y) {
    throw new Error('expected absolute and parent-relative coordinates to round trip without drift')
  }
  const preserved = preserveAbsolutePositionForParent(absolute, {
    minX: parentOrigin.x,
    minY: parentOrigin.y,
    maxX: 240,
    maxY: 460,
  })
  if (!preserved || preserved.absolute.x !== absolute.x || preserved.absolute.y !== absolute.y) {
    throw new Error('expected attaching to preserve the rendered canvas position')
  }

  const target = selectParentDropTarget({
    nodeId: 'moving',
    nodeBounds: { minX: 30, minY: 30, maxX: 70, maxY: 70 },
    candidates: [
      {
        groupId: 'subgraph:outer',
        subgraphId: 'outer',
        depth: 0,
        memberNodeIds: ['anchor-outer'],
        bounds: { minX: 0, minY: 0, maxX: 300, maxY: 300 },
      },
      {
        groupId: 'subgraph:inner',
        subgraphId: 'inner',
        depth: 1,
        memberNodeIds: ['anchor-inner'],
        bounds: { minX: 20, minY: 20, maxX: 100, maxY: 100 },
      },
    ],
  })
  if (target?.subgraphId !== 'inner') {
    throw new Error('expected the deepest containing user group to win an overlapping drop')
  }
  const existingMemberTarget = selectParentDropTarget({
    nodeId: 'moving',
    nodeBounds: { minX: 30, minY: 30, maxX: 70, maxY: 70 },
    candidates: [{
      groupId: 'subgraph:inner',
      subgraphId: 'inner',
      depth: 1,
      memberNodeIds: ['moving'],
      bounds: { minX: 20, minY: 20, maxX: 100, maxY: 100 },
    }],
  })
  if (existingMemberTarget) {
    throw new Error('expected an existing child to be excluded from attach drop targets')
  }

  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [
      { id: 'anchor-a', type: 'Node', label: 'A', x: 0, y: 0, properties: {}, metadata: {} },
      { id: 'anchor-b', type: 'Node', label: 'B', x: 200, y: 0, properties: {}, metadata: {} },
      { id: 'moving', type: 'Node', label: 'Moving', x: 80, y: 60, properties: {}, metadata: {} },
    ],
    edges: [],
    metadata: {},
  } as never)

  try {
    const groupA = store.createUserSubgraph({ label: 'A', memberNodeIds: ['anchor-a'] })
    const groupB = store.createUserSubgraph({ label: 'B', memberNodeIds: ['anchor-b'] })
    if (groupA.ok === false) throw new Error(groupA.message)
    if (groupB.ok === false) throw new Error(groupB.message)

    const attachedA = useGraphStore.getState().attachNodeToUserSubgraph(groupA.id, 'moving')
    if (attachedA.ok === false) throw new Error(attachedA.message)
    if (findNodeParentSubgraph(useGraphStore.getState().graphData, 'moving')?.id !== groupA.id) {
      throw new Error('expected a dropped node to become a direct child of the target group')
    }

    const attachedB = useGraphStore.getState().attachNodeToUserSubgraph(groupB.id, 'moving')
    if (attachedB.ok === false) throw new Error(attachedB.message)
    const containing = readSubgraphs(useGraphStore.getState().graphData)
      .filter(subgraph => subgraph.memberNodeIds.includes('moving'))
    if (containing.length !== 1 || containing[0]?.id !== groupB.id) {
      throw new Error('expected reparenting to atomically leave exactly one direct parent')
    }

    const detachMarkup = renderToStaticMarkup(createElement(CanvasArrangeActionBar, {
      active: true,
      selectedCount: 1,
      canDetach: true,
      onDetach: () => undefined,
      onArrange: () => undefined,
    }))
    if (!detachMarkup.includes('data-kg-selection-action="detach"') || !detachMarkup.includes('Detach')) {
      throw new Error('expected an attached selected child to expose the Detach action')
    }

    const detached = useGraphStore.getState().detachNodeFromUserSubgraph(groupB.id, 'moving')
    if (detached.ok === false) throw new Error(detached.message)
    if (findNodeParentSubgraph(useGraphStore.getState().graphData, 'moving')) {
      throw new Error('expected detaching to remove the parent relationship')
    }
    const movingNode = useGraphStore.getState().graphData?.nodes.find(node => node.id === 'moving')
    if (movingNode?.x !== 80 || movingNode?.y !== 60) {
      throw new Error('expected detaching to preserve the node absolute canvas position')
    }
  } finally {
    useGraphStore.getState().clearGraphData()
  }
}
