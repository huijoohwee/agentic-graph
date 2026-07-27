import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { controlLocalGroupPanel } from '@/features/group-panel/groupPanelMcpRuntime'
import {
  buildGroupPanelAgentReadyToolContracts,
  GROUP_PANEL_AGENT_READY_TOOL_IDS,
  GROUP_PANEL_INVOCATION,
} from '@/features/group-panel/groupPanelContract.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testGroupPanelFirstClassSurfaceAndInvocationContract() {
  const surfaceText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardGroupPanelLayer2d.tsx'), 'utf8')
  for (const expected of [
    'getStoryboardWidgetPanelSurfaceChromeClassName',
    'StoryboardWidgetPanelChromeHeader',
    'data-kg-group-panel="1"',
    'data-kg-canvas-selectable-surface="group-panel"',
    'role="group"',
  ]) {
    if (!surfaceText.includes(expected)) throw new Error(`expected first-class Group Panel surface contract ${expected}`)
  }
  if (surfaceText.includes('ariaHidden')) {
    throw new Error('expected Group Panel wrapper to remain visible to accessibility and selection tooling')
  }

  const [contract] = buildGroupPanelAgentReadyToolContracts({
    buildWebName: (name: string) => `knowgrph.${name}`,
    mutationAnnotations: { readOnlyHint: false },
  })
  if (
    contract.name !== GROUP_PANEL_AGENT_READY_TOOL_IDS.controlLocalGroupPanel
    || contract.webName !== 'knowgrph.control_local_group_panel'
    || !contract.description.includes(GROUP_PANEL_INVOCATION.command)
    || !contract.description.includes(GROUP_PANEL_INVOCATION.semantic)
    || !contract.description.includes(GROUP_PANEL_INVOCATION.binding)
  ) {
    throw new Error('expected Group Panel WebMCP contract and canonical /, #, @ invocation tuple')
  }

  const store = useGraphStore.getState()
  const previousSchema = store.schema
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'Node', label: 'One', properties: {}, metadata: {} },
      { id: 'n2', type: 'Node', label: 'Two', properties: {}, metadata: {} },
      { id: 'n3', type: 'Node', label: 'Three', properties: {}, metadata: {} },
    ],
    edges: [],
    metadata: {},
  } as never)
  store.setSelectMode('multi')
  store.selectNodesExpanded({ nodeIds: ['n1', 'n2'] })
  try {
    const grouped = await controlLocalGroupPanel({ operation: 'group' })
    if (!grouped.ok || grouped.groups.length !== 1 || !grouped.selection.canUngroup) {
      throw new Error('expected browser-local MCP grouping to select the created Group Panel')
    }
    store.toggleNodeSelectionAdditive('n3')
    const mixedSelection = useGraphStore.getState()
    if (mixedSelection.selectedGroupIds.length !== 1 || !mixedSelection.selectedNodeIds.includes('n3')) {
      throw new Error('expected Shift-style node selection to preserve a selected Group Panel')
    }
    const nested = await controlLocalGroupPanel({ operation: 'group' })
    if (!nested.ok || nested.groups.length !== 2 || !nested.groups.some(group => group.parentId != null)) {
      throw new Error('expected MCP grouping to nest a Group Panel with another selected card')
    }
    const ungrouped = await controlLocalGroupPanel({ invocation: `${GROUP_PANEL_INVOCATION.command} ${GROUP_PANEL_INVOCATION.semantic} ${GROUP_PANEL_INVOCATION.binding} ungroup` })
    if (!ungrouped.ok || ungrouped.groups.length !== 1 || ungrouped.selection.nodeIds[0] !== 'n3' || ungrouped.selection.groupIds.length !== 1) {
      throw new Error('expected browser-local MCP ungrouping to restore nested Group Panels and direct child nodes')
    }
  } finally {
    useGraphStore.getState().setSchema(previousSchema)
    useGraphStore.getState().clearGraphData()
  }
}
