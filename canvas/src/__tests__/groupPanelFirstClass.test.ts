import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { controlLocalGroupPanel } from '@/features/group-panel/groupPanelMcpRuntime'
import {
  buildGroupPanelAgentReadyToolContracts,
  GROUP_PANEL_AGENT_READY_TOOL_IDS,
  GROUP_PANEL_INVOCATION,
} from '@/features/group-panel/groupPanelContract.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  clampGroupPanelChildCenter,
  clampGroupPanelChildTopLeft,
  collectGroupPanelContainedNodeIds,
  isGroupPanelContainedNode,
} from '@/lib/storyboardWidget/groupPanelContainment'
import {
  resolveStoryboardWidgetOverlayProxyTarget,
  shouldUseCanvasOverlayBodyPan,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testGroupPanelFirstClassSurfaceAndInvocationContract() {
  const surfaceText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardGroupPanelLayer2d.tsx'), 'utf8')
  const surfaceRuntimeText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/StoryboardWidgetCanvasSurface.tsx'), 'utf8')
  const cardOverlayText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx'), 'utf8')
  const cardInteractionsText = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/storyboardCardOverlayInteractions2d.ts'), 'utf8')
  const richMediaOverlayText = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/FlowCanvasMediaOverlays.tsx'), 'utf8')
  for (const expected of [
    'getStoryboardWidgetPanelSurfaceChromeClassName',
    'StoryboardWidgetPanelChromeHeader',
    'buildFlowCanvasHeaderPinProps',
    'isFlowWidgetHeaderDragAllowedByPin',
    'startRichMediaPanelHeaderDrag',
    'createRafValueScheduler',
    'computeStoryboardWidgetOverlayScreenBox',
    'applyVectorPaintedOverlayBox',
    'data-kg-group-panel="1"',
    'data-kg-canvas-selectable-surface="group-panel"',
    "data-kg-group-panel-pinned={headerPinProps.headerPinned === true ? '1' : '0'}",
    'data-kg-overlay-pan-owner="canvas"',
    'data-kg-storyboard-widget-surface={props.storyboardWidgetSurfaceId}',
    "showPinToggle={selected && typeof headerPinProps.onHeaderTogglePinned === 'function'}",
    'onPinnedPointerDown={headerPinProps.onHeaderPinnedPointerDown}',
    'onTogglePinned={headerPinProps.onHeaderTogglePinned}',
    "addHistory('Group panel move')",
    'if (event.shiftKey || event.metaKey || event.ctrlKey)',
    'role="group"',
  ]) {
    if (!surfaceText.includes(expected)) throw new Error(`expected first-class Group Panel surface contract ${expected}`)
  }
  if (surfaceText.includes('ariaHidden')) {
    throw new Error('expected Group Panel wrapper to remain visible to accessibility and selection tooling')
  }
  if (
    !surfaceText.includes('props.onNodeChange(nodeId, {')
    || !surfaceText.includes('}, props.graphData)')
    || !surfaceRuntimeText.includes('onNodeChange={props.patchNodeById}')
  ) {
    throw new Error('expected Group Panel drag to write through the canonical Storyboard document mutation owner')
  }
  for (const [name, text, movementContract] of [
    ['Storyboard card', cardOverlayText, 'containedByGroupPanel || isFlowWidgetHeaderDragAllowedByPin'],
    ['Rich Media panel', richMediaOverlayText, 'containedByGroupPanel || richMediaPanelPinAllowsMovement'],
  ] as const) {
    if (
      !text.includes('collectGroupPanelContainedNodeIds')
      || !text.includes('isGroupPanelContainedNode')
      || !text.includes(movementContract)
    ) {
      throw new Error(`expected grouped ${name} movement to remain enabled within its Group Panel`)
    }
  }
  if (
    !cardInteractionsText.includes('clampGroupPanelChildCenter')
    || !richMediaOverlayText.includes('clampGroupPanelChildTopLeft')
  ) {
    throw new Error('expected grouped child movement to share Group Panel containment clamping')
  }
  if (
    !surfaceText.includes('props.fallbackNodePositions.get(nodeId)')
    || !surfaceRuntimeText.includes('fallbackNodePositions={stableStoryboardCardPlacements}')
  ) {
    throw new Error('expected Group Panel drag to initialize excluded fixed cards from stable Storyboard placements')
  }

  const containedNodeIds = collectGroupPanelContainedNodeIds({
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {
      'kg:subgraphs': [
        { id: 'g1', label: 'Group 1', memberNodeIds: ['n1', 'n2'] },
        { id: 'g2', label: 'Group 2', memberNodeIds: ['n3'], parentId: 'g1' },
      ],
    },
  } as never)
  if (
    !isGroupPanelContainedNode(containedNodeIds, 'n1')
    || !isGroupPanelContainedNode(containedNodeIds, 'n3')
    || isGroupPanelContainedNode(containedNodeIds, 'n4')
  ) {
    throw new Error('expected direct and nested Group Panel children to share containment movement ownership')
  }
  const containmentBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
  const clampedTopLeft = clampGroupPanelChildTopLeft({
    bounds: containmentBounds,
    point: { x: -100, y: -100 },
    size: { width: 20, height: 10 },
  })
  const clampedCenter = clampGroupPanelChildCenter({
    bounds: containmentBounds,
    center: { x: 1000, y: 1000 },
    size: { width: 20, height: 10 },
  })
  if (
    clampedTopLeft.x !== 8
    || clampedTopLeft.y !== 8
    || clampedCenter.x !== 82
    || clampedCenter.y !== 87
  ) {
    throw new Error('expected grouped child movement to remain inside the drag-start Group Panel bounds')
  }

  const { dom, restore } = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const canvas = dom.window.document.createElement('canvas')
    const groupPanel = dom.window.document.createElement('article')
    const panelBody = dom.window.document.createElement('p')
    canvas.setAttribute('data-kg-storyboard-widget-surface', 'storyboard')
    groupPanel.setAttribute('data-node-id', 'group:1')
    groupPanel.setAttribute('data-kg-storyboard-widget-surface', 'storyboard')
    groupPanel.setAttribute('data-kg-overlay-pan-owner', 'canvas')
    groupPanel.appendChild(panelBody)
    dom.window.document.body.append(canvas, groupPanel)

    const overlay = resolveStoryboardWidgetOverlayProxyTarget({
      target: panelBody,
      canvasEl: canvas,
      storyboardWidgetSurfaceId: 'storyboard',
    })
    if (overlay.kind !== 'overlay' || overlay.overlayRoot !== groupPanel) {
      throw new Error('expected Group Panel to resolve as a semantic canvas overlay')
    }
    if (!shouldUseCanvasOverlayBodyPan({ target: panelBody, overlayRoot: groupPanel })) {
      throw new Error('expected a Group Panel body to use the shared canvas-owned pan path')
    }
  } finally {
    restore()
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
