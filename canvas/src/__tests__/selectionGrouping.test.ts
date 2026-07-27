import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { computeFlowGroupAabb, type FlowNativeScene } from '@/components/FlowCanvas/nativeRuntime'
import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  collectSelectedNodeIds,
  createSelectionGroupLabel,
  findSelectedUserSubgraph,
  reselectDetachedNodeIds,
} from '@/lib/canvas/selectionGrouping'
import { applySchemaGroupBoundsOverrides } from '@/lib/canvas/groupBoundsOverrides'
import { activateMultiNodeSelectModeForShift, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'
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
    if (
      resolveNodeSelectionGesture({ mode: 'single', shiftKey: true }) !== 'toggle' ||
      resolveNodeSelectionGesture({ mode: 'multi', metaKey: true }) !== 'toggle' ||
      resolveNodeSelectionGesture({ mode: 'single', metaKey: true }) !== 'replace'
    ) {
      throw new Error('expected renderer-independent modifier selection policy')
    }
    let activatedMode = ''
    const effectiveMode = activateMultiNodeSelectModeForShift({
      mode: 'single',
      shiftKey: true,
      setSelectMode: mode => {
        activatedMode = mode
      },
    })
    if (effectiveMode !== 'multi' || activatedMode !== 'multi') {
      throw new Error('expected Shift selection to activate Multi-select Mode')
    }

    const created = store.createUserSubgraph({
      label: createSelectionGroupLabel(useGraphStore.getState().graphData),
      memberNodeIds: selected,
      autoBounds: true,
    })
    if (created.ok === false) throw new Error(created.message)
    const groupId = subgraphGroupId(created.id)
    const selectedSubgraph = findSelectedUserSubgraph(useGraphStore.getState().graphData, groupId)
    if (!selectedSubgraph || selectedSubgraph.label !== 'Group 1') {
      throw new Error('expected the selected nodes to resolve to a newly named user group')
    }
    if (selectedSubgraph.autoBounds !== true) {
      throw new Error('expected selection-created groups to persist automatic bounds')
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
      autoBounds: selectedSubgraph.autoBounds,
      style: {},
    }
    const [groupWithIgnoredOverride] = applySchemaGroupBoundsOverrides(
      [graphGroup],
      { [groupId]: { x: 0, y: 0, width: 12, height: 12 } },
    )
    if (groupWithIgnoredOverride.bounds) {
      throw new Error('expected automatic groups to ignore stale manual bounds')
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
      offsetBelowWorkspaceToolbar: true,
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
    if (
      !groupMarkup.includes('data-kg-selection-action-bar="1"') ||
      !groupMarkup.includes('z-index:90') ||
      !groupMarkup.includes('top-14')
    ) {
      throw new Error('expected selection actions to render above storyboard overlays and below the workspace toolbar')
    }
    if (!ungroupMarkup.includes('data-kg-selection-action="ungroup"') || !ungroupMarkup.includes('Ungroup')) {
      throw new Error('expected a selected user group to expose Ungroup')
    }

    store.selectGroup(groupId)
    store.removeUserSubgraph(created.id)
    reselectDetachedNodeIds(selectedSubgraph.memberNodeIds, nodeId => store.toggleNodeSelectionAdditive(nodeId))
    if (findSelectedUserSubgraph(useGraphStore.getState().graphData, groupId)) {
      throw new Error('expected ungrouping to detach the group metadata from its child nodes')
    }
    const detachedSelection = collectSelectedNodeIds(
      useGraphStore.getState().selectedNodeId,
      useGraphStore.getState().selectedNodeIds,
    )
    if (detachedSelection.length !== 2 || !detachedSelection.includes('n1') || !detachedSelection.includes('n2')) {
      throw new Error('expected ungrouping to keep detached child nodes selected')
    }
  } finally {
    useGraphStore.getState().setSchema(previousSchema)
    useGraphStore.getState().clearGraphData()
  }
}
