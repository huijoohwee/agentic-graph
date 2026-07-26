import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { computeFlowGroupAabb, type FlowNativeScene } from '@/components/FlowCanvas/nativeRuntime'
import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  collectSelectedNodeIds,
  createSelectionGroupLabel,
  findSelectedUserSubgraph,
} from '@/lib/canvas/selectionGrouping'
import { subgraphGroupId } from '@/lib/graph/subgraphs'

export function testSelectionGroupingInteractionContract() {
  const store = useGraphStore.getState()
  const previousSchema = store.schema
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'Node', label: 'N1', x: 10, y: 20, properties: {}, metadata: {} },
      { id: 'n2', type: 'Node', label: 'N2', x: 100, y: 80, properties: {}, metadata: {} },
    ],
    edges: [],
    metadata: {},
  } as never)
  store.setSchema({
    ...previousSchema,
    behavior: { ...previousSchema.behavior, selectMode: 'single' },
  })

  try {
    store.selectNode(null)
    store.selectNode('n1')
    store.toggleNodeSelectionAdditive('n2')
    const selected = collectSelectedNodeIds(
      useGraphStore.getState().selectedNodeId,
      useGraphStore.getState().selectedNodeIds,
    )
    if (selected.length !== 2 || !selected.includes('n1') || !selected.includes('n2')) {
      throw new Error(`expected Shift-style additive selection in single mode, got ${selected.join(',')}`)
    }

    const created = store.createUserSubgraph({
      label: createSelectionGroupLabel(useGraphStore.getState().graphData),
      memberNodeIds: selected,
    })
    if (created.ok === false) throw new Error(created.message)
    const groupId = subgraphGroupId(created.id)
    const selectedSubgraph = findSelectedUserSubgraph(useGraphStore.getState().graphData, groupId)
    if (!selectedSubgraph || selectedSubgraph.label !== 'Group 1') {
      throw new Error('expected the selected nodes to resolve to a newly named user group')
    }

    const nodeById = new Map([
      ['n1', { id: 'n1', x: 10, y: 20, width: 40, height: 30 }],
      ['n2', { id: 'n2', x: 100, y: 80, width: 50, height: 40 }],
    ])
    const scene: FlowNativeScene = {
      nodes: Array.from(nodeById.values()) as never,
      edges: [],
      nodeById: nodeById as never,
      groups: [],
      groupIdsByNodeId: new Map(),
    }
    const graphGroup = {
      id: groupId,
      label: selectedSubgraph.label,
      source: 'userSubgraph' as const,
      depth: 0,
      memberNodeIds: selectedSubgraph.memberNodeIds,
      style: {},
    }
    const beforeMove = computeFlowGroupAabb({ scene, group: graphGroup, paddingPx: 10, labelTopExtraPx: 0 })
    nodeById.get('n2')!.x = 180
    const afterMove = computeFlowGroupAabb({ scene, group: graphGroup, paddingPx: 10, labelTopExtraPx: 0 })
    if (!beforeMove || !afterMove || beforeMove.maxX !== 160 || afterMove.maxX !== 240) {
      throw new Error('expected group bounds to adjust from current child positions')
    }

    const groupMarkup = renderToStaticMarkup(createElement(CanvasArrangeActionBar, {
      active: true,
      selectedCount: 2,
      canGroupNodes: true,
      onGroupNodes: () => undefined,
      onArrange: () => undefined,
    }))
    const ungroupMarkup = renderToStaticMarkup(createElement(CanvasArrangeActionBar, {
      active: true,
      selectedCount: 0,
      canUngroup: true,
      onUngroup: () => undefined,
      onArrange: () => undefined,
    }))
    if (!groupMarkup.includes('data-kg-selection-action="group-nodes"') || !groupMarkup.includes('Group Nodes')) {
      throw new Error('expected the multi-selection toolbar to expose Group Nodes')
    }
    if (!ungroupMarkup.includes('data-kg-selection-action="ungroup"') || !ungroupMarkup.includes('Ungroup')) {
      throw new Error('expected a selected user group to expose Ungroup')
    }

    store.selectGroup(groupId)
    store.removeUserSubgraph(created.id)
    if (findSelectedUserSubgraph(useGraphStore.getState().graphData, groupId)) {
      throw new Error('expected ungrouping to detach the group metadata from its child nodes')
    }
  } finally {
    useGraphStore.getState().setSchema(previousSchema)
    useGraphStore.getState().clearGraphData()
  }
}
