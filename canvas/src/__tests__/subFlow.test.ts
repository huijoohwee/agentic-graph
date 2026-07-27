import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { computeFlowGroupAabb, type FlowNativeScene } from '@/components/FlowCanvas/nativeRuntime'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  clampDelta,
  computeDeltaClampForRectWithinRect,
} from '@/lib/canvas/groupContainment'
import { buildDynamicGroupRectById } from '@/lib/canvas/groupExplicitBounds'
import {
  findUserSubgraphParent,
  selectSubFlowParentDropTarget,
} from '@/lib/canvas/subFlow'
import { readSubgraphs, subgraphGroupId } from '@/lib/graph/subgraphs'

export function testSubFlowInteractionContract() {
  const nestedClamp = computeDeltaClampForRectWithinRect({
    subject: { x: 60, y: 60, width: 80, height: 60 },
    container: { x: 0, y: 0, width: 240, height: 200 },
    inset: 10,
  })
  const clamped = clampDelta({ clamp: nestedClamp, dx: 500, dy: -500 })
  if (
    nestedClamp.minDx !== -50 ||
    nestedClamp.maxDx !== 90 ||
    nestedClamp.minDy !== -50 ||
    nestedClamp.maxDy !== 70 ||
    clamped.dx !== 90 ||
    clamped.dy !== -50
  ) {
    throw new Error('expected a nested group drag to stay within the parent interior')
  }

  const dropTarget = selectSubFlowParentDropTarget({
    groupId: 'subgraph:moving',
    groupBounds: { minX: 80, minY: 80, maxX: 160, maxY: 160 },
    candidates: [
      {
        groupId: 'subgraph:outer',
        subgraphId: 'outer',
        depth: 0,
        bounds: { minX: 0, minY: 0, maxX: 400, maxY: 400 },
      },
      {
        groupId: 'subgraph:inner',
        subgraphId: 'inner',
        parentGroupId: 'subgraph:outer',
        depth: 1,
        bounds: { minX: 50, minY: 50, maxX: 250, maxY: 250 },
      },
      {
        groupId: 'subgraph:descendant',
        subgraphId: 'descendant',
        parentGroupId: 'subgraph:moving',
        depth: 2,
        bounds: { minX: 70, minY: 70, maxX: 180, maxY: 180 },
      },
    ],
  })
  if (dropTarget?.subgraphId !== 'inner') {
    throw new Error('expected the deepest valid containing group to become the parent')
  }

  const store = useGraphStore.getState()
  const previousSchema = store.schema
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [
      { id: 'outer-node', type: 'Node', label: 'Outer', x: 0, y: 0, properties: {}, metadata: {} },
      { id: 'inner-a', type: 'Node', label: 'Inner A', x: 80, y: 70, properties: {}, metadata: {} },
      { id: 'inner-b', type: 'Node', label: 'Inner B', x: 160, y: 110, properties: {}, metadata: {} },
    ],
    edges: [],
    metadata: {},
  } as never)

  try {
    const outer = store.createUserSubgraph({ label: 'Outer group', memberNodeIds: ['outer-node'] })
    const inner = store.createUserSubgraph({ label: 'Inner group', memberNodeIds: ['inner-a', 'inner-b'] })
    if (outer.ok === false) throw new Error(outer.message)
    if (inner.ok === false) throw new Error(inner.message)

    const attached = useGraphStore.getState().updateUserSubgraph(inner.id, { parentId: outer.id })
    if (attached.ok === false) throw new Error(attached.message)

    const graphData = useGraphStore.getState().graphData
    const groups = deriveGraphGroups(graphData, { themeMode: 'light' })
    const outerGroup = groups.find(group => group.id === subgraphGroupId(outer.id))
    const innerGroup = groups.find(group => group.id === subgraphGroupId(inner.id))
    if (!outerGroup || !innerGroup) throw new Error('expected both user groups to render')
    if (innerGroup.parentGroupId !== outerGroup.id || innerGroup.depth !== 1) {
      throw new Error('expected the child group to retain its nested render relationship')
    }
    if (!outerGroup.memberNodeIds.includes('inner-a') || !outerGroup.memberNodeIds.includes('inner-b')) {
      throw new Error('expected parent bounds to include descendant child nodes')
    }
    if (
      outerGroup.containChildren !== true ||
      innerGroup.containChildren !== true ||
      outerGroup.connectable !== false ||
      innerGroup.connectable !== false
    ) {
      throw new Error('expected groups to contain children without exposing connection handles')
    }
    if (findUserSubgraphParent(graphData, innerGroup.id)?.parent.id !== outer.id) {
      throw new Error('expected the selected nested group to resolve its parent')
    }

    const flowNodeById = new Map([
      ['inner-a', { id: 'inner-a', x: 60, y: 50, width: 50, height: 40 }],
      ['inner-b', { id: 'inner-b', x: 150, y: 90, width: 50, height: 40 }],
    ])
    const scene: FlowNativeScene = {
      nodes: Array.from(flowNodeById.values()) as never,
      edges: [],
      nodeById: flowNodeById as never,
      groups: [outerGroup, innerGroup],
      groupIdsByNodeId: new Map([
        ['inner-a', [innerGroup.id]],
        ['inner-b', [innerGroup.id]],
      ]),
    }
    const outerFlowBounds = computeFlowGroupAabb({
      scene,
      group: outerGroup,
      paddingPx: 12,
      labelTopExtraPx: 0,
    })
    const beforeFlowBounds = computeFlowGroupAabb({
      scene,
      group: innerGroup,
      paddingPx: 12,
      labelTopExtraPx: 0,
    })
    if (
      !outerFlowBounds ||
      !beforeFlowBounds ||
      !(outerFlowBounds.minX < beforeFlowBounds.minX && outerFlowBounds.maxX > beforeFlowBounds.maxX)
    ) {
      throw new Error('expected an outer group to wrap its nested child group with visible padding')
    }
    flowNodeById.get('inner-b')!.x = 280
    const afterFlowBounds = computeFlowGroupAabb({
      scene,
      group: innerGroup,
      paddingPx: 12,
      labelTopExtraPx: 0,
    })
    if (!beforeFlowBounds || !afterFlowBounds || afterFlowBounds.maxX <= beforeFlowBounds.maxX) {
      throw new Error('expected Flow group dimensions to follow current child positions')
    }

    const beforeD3Bounds = buildDynamicGroupRectById({
      groups: [innerGroup],
      graphNodes: graphData.nodes,
      schema: previousSchema,
    }).get(innerGroup.id)
    const innerB = graphData.nodes.find(node => node.id === 'inner-b')
    if (innerB) innerB.x = 320
    const afterD3Bounds = buildDynamicGroupRectById({
      groups: [innerGroup],
      graphNodes: graphData.nodes,
      schema: previousSchema,
    }).get(innerGroup.id)
    if (!beforeD3Bounds || !afterD3Bounds || afterD3Bounds.width <= beforeD3Bounds.width) {
      throw new Error('expected SVG group dimensions to follow current child positions')
    }

    const detachMarkup = renderToStaticMarkup(createElement(CanvasArrangeActionBar, {
      active: true,
      selectedCount: 0,
      canDetach: true,
      onDetach: () => undefined,
      onArrange: () => undefined,
    }))
    if (!detachMarkup.includes('data-kg-selection-action="detach"') || !detachMarkup.includes('Detach')) {
      throw new Error('expected a selected nested group to expose Detach')
    }

    const positionsBeforeDetach = graphData.nodes.map(node => [node.id, node.x, node.y])
    const detached = useGraphStore.getState().updateUserSubgraph(inner.id, { parentId: null })
    if (detached.ok === false) throw new Error(detached.message)
    const detachedGraph = useGraphStore.getState().graphData
    if (findUserSubgraphParent(detachedGraph, innerGroup.id)) {
      throw new Error('expected Detach to remove only the nested parent relation')
    }
    const positionsAfterDetach = detachedGraph.nodes.map(node => [node.id, node.x, node.y])
    if (JSON.stringify(positionsAfterDetach) !== JSON.stringify(positionsBeforeDetach)) {
      throw new Error('expected Detach to preserve every child absolute canvas position')
    }

    const reattached = useGraphStore.getState().updateUserSubgraph(inner.id, { parentId: outer.id })
    if (reattached.ok === false) throw new Error(reattached.message)
    const cycle = useGraphStore.getState().updateUserSubgraph(outer.id, { parentId: inner.id })
    if (cycle.ok !== false) {
      throw new Error('expected cyclic group nesting to fail closed')
    }
    const stored = readSubgraphs(useGraphStore.getState().graphData)
    if (stored.find(subgraph => subgraph.id === outer.id)?.parentId) {
      throw new Error('expected a rejected cycle to leave the parent metadata unchanged')
    }
  } finally {
    useGraphStore.getState().setSchema(previousSchema)
    useGraphStore.getState().clearGraphData()
  }
}
