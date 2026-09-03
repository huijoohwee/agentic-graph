import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { computeViewportSafeInlineCenterShiftPx } from '@/lib/ui/viewportToolbarPlacement'
import {
  materializeProbeTreeBranchCards,
  invokeProbeTreeFromStoryboardToolbar,
  revealProbeTreeBranchCardsOnCanvas,
  resolveProbeTreeCardMaterializationRequestText,
} from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'

const assertProbeTreeRevealPreservesExplicitPinsAndViewport = (nodeIds: readonly string[]): void => {
  const [explicitlyUnpinnedNodeId, explicitlyPinnedNodeId, missingPinNodeId] = nodeIds
  if (!explicitlyUnpinnedNodeId || !explicitlyPinnedNodeId || !missingPinNodeId) {
    throw new Error(`expected three Probe-Tree output ids for reveal-state coverage, got ${JSON.stringify(nodeIds)}`)
  }
  const previousRevealState = useGraphStore.getState()
  const unchangedZoomRequest = { type: 'reset', at: 4242 } as const
  try {
    useGraphStore.setState({
      flowWidgetPinnedByNodeId: {
        [explicitlyUnpinnedNodeId]: false,
        [explicitlyPinnedNodeId]: true,
      },
      zoomRequest: unchangedZoomRequest,
    })
    revealProbeTreeBranchCardsOnCanvas(nodeIds)
    const revealedState = useGraphStore.getState()
    if (
      revealedState.flowWidgetPinnedByNodeId[explicitlyUnpinnedNodeId] !== false
      || revealedState.flowWidgetPinnedByNodeId[explicitlyPinnedNodeId] !== true
      || revealedState.flowWidgetPinnedByNodeId[missingPinNodeId] !== true
      || !revealedState.selectedNodeIds.includes(explicitlyUnpinnedNodeId)
      || revealedState.selectedNodeId !== explicitlyUnpinnedNodeId
      || revealedState.zoomRequest !== unchangedZoomRequest
    ) {
      throw new Error(`expected Probe-Tree reveal to preserve explicit pins, seed only missing pins, select output, and keep the viewport unchanged, got ${JSON.stringify({ pinned: revealedState.flowWidgetPinnedByNodeId, selected: revealedState.selectedNodeIds, active: revealedState.selectedNodeId, zoom: revealedState.zoomRequest })}`)
    }
  } finally {
    useGraphStore.setState({
      flowWidgetPinnedByNodeId: previousRevealState.flowWidgetPinnedByNodeId,
      flowWidgetPinnedByNodeIdByGraphMetaKey: previousRevealState.flowWidgetPinnedByNodeIdByGraphMetaKey,
      selectedNodeIds: previousRevealState.selectedNodeIds,
      selectedNodeId: previousRevealState.selectedNodeId,
      selectedEdgeIds: previousRevealState.selectedEdgeIds,
      selectedEdgeId: previousRevealState.selectedEdgeId,
      selectedGroupIds: previousRevealState.selectedGroupIds,
      selectedGroupId: previousRevealState.selectedGroupId,
      zoomRequest: previousRevealState.zoomRequest,
    })
  }
}

export function testStoryboardWidgetProbeTreeRevealPreservesExplicitPinsAndViewport() {
  assertProbeTreeRevealPreservesExplicitPinsAndViewport([
    'probe-tree:test:explicitly-unpinned',
    'probe-tree:test:explicitly-pinned',
    'probe-tree:test:missing-pin',
  ])
}

export function testStoryboardWidgetToolbarRestoresTinyFloatingActionsWithRun() {
  const toolbarPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorActionsToolbar.tsx')
  const overlayImplementationPaths = [
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorInner.tsx'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorView.tsx'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'useWidgetPlacementRuntime.ts'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'widgetPlacementRuntimeProjection.ts'),
    resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'flowWidgetOverlayShared.ts'),
  ]
  const overlaySurfacePath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetOverlaySurface.tsx')
  const overlaySurfaceElementsPath = resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx')
  const probeTreeActionPath = resolve(process.cwd(), 'src', 'components', 'StoryboardCanvas', 'storyboardProbeTreeInvocationAction.ts')
  const openMappingHelperPath = resolve(process.cwd(), 'src', 'features', 'storyboard-widget-manager', 'openWorkflowManagerMappingForNode.ts')
  const copyPath = resolve(process.cwd(), 'src', 'lib', 'config-copy', 'uiCopy.ts')
  const metaPath = resolve(process.cwd(), 'src', 'lib', 'config-copy', 'uiMeta.ts')
  const toolbarText = readFileSync(toolbarPath, 'utf8')
  const overlayText = overlayImplementationPaths.map(path => readFileSync(path, 'utf8')).join('\n')
  const overlaySurfaceText = [overlaySurfacePath, overlaySurfaceElementsPath].map(path => readFileSync(path, 'utf8')).join('\n')
  const probeTreeActionText = readFileSync(probeTreeActionPath, 'utf8')
  const openMappingHelperText = readFileSync(openMappingHelperPath, 'utf8')
  const copyText = readFileSync(copyPath, 'utf8')
  const metaText = readFileSync(metaPath, 'utf8')

  const requiredToolbarSnippets = [
    'title={UI_LABELS.updateKvEntry}',
    'tooltipContent={UI_LABELS.updateKvEntry}',
    'flowWidgetOpenInSidepane',
    'flowWidgetEnableHandles',
    'flowWidgetProbeTree',
    'flowWidgetConvertToLoop',
    'flowWidgetDuplicate',
    'flowWidgetClearOutput',
    'flowWidgetHelp',
    'flowWidgetRemoveNode',
    'flowWidgetRun',
    'const WidgetToolbarActionButton = React.forwardRef<HTMLButtonElement, WidgetToolbarActionButtonProps>',
    'data-kg-toolbar-action={props.actionId}',
    'data-kg-toolbar-action-icon={props.actionId}',
    'aria-hidden={false}',
    'actionId="run"',
    'icon={Play}',
    'actionId="probe-tree"',
    'icon={GitBranch}',
    'onClick={handleRunClick}',
    'onClick={onProbeTree}',
  ]
  for (const snippet of requiredToolbarSnippets) {
    if (!toolbarText.includes(snippet)) {
      throw new Error(`expected restored widget toolbar snippet: ${snippet}`)
    }
  }
  if (!overlayText.includes('const [toolbarDock, setToolbarDock] = React.useState<\'above\' | \'below\'>(\'above\')')) {
    throw new Error('expected widget tiny floating toolbar to track adaptive above/below docking state')
  }
  if (!overlayText.includes('const nextToolbarDock = pos.top >= WIDGET_ACTIONS_TOOLBAR_CLEARANCE_PX ? \'above\' : \'below\'')) {
    throw new Error('expected widget tiny floating toolbar docking to derive from viewport-safe overlay position')
  }
  if (!overlayText.includes('absolute left-1/2 z-10 ${pointerPolicy.toolbarPointerEventsClassName}')) {
    throw new Error('expected widget tiny floating toolbar anchor to keep explicit stacking and pointer-event visibility')
  }
  if (overlayText.includes('toolbarSideClamp')) {
    throw new Error('expected widget tiny floating toolbar to remove stale Rich Media side-clamp state')
  }
  if (overlayText.includes('WIDGET_ACTIONS_TOOLBAR_SIDE_CLEARANCE_PX') || overlayText.includes('WIDGET_ACTIONS_TOOLBAR_SIDE_OFFSET_PX')) {
    throw new Error('expected widget tiny floating toolbar to remove stale Rich Media side placement constants')
  }
  if (overlayText.includes('translateY(-50%)') || overlayText.includes('left: toolbarSideClamp')) {
    throw new Error('expected widget tiny floating toolbar to remove stale side-docked Rich Media placement math')
  }
  if (!overlayText.includes('className={`absolute left-1/2 z-10 ${pointerPolicy.toolbarPointerEventsClassName}`}')) {
    throw new Error('expected Rich Media and default widgets to reuse the same above-center toolbar anchor')
  }
  if (!overlayText.includes('computeViewportSafeInlineCenterShiftPx')
    || !overlayText.includes('toolbarInlineShiftPx')
    || !overlayText.includes('toolbarMaxWidthPx')) {
    throw new Error('expected widget tiny floating toolbar placement to use the shared viewport-safe inline shift contract')
  }
  if (!toolbarText.includes('App-toolbar--touch-scroll') || !toolbarText.includes('maxWidthPx')) {
    throw new Error('expected widget tiny floating toolbar to reuse shared touch-scroll behavior and viewport max-width')
  }
  if (!overlayText.includes('visible={toolbarVisible}')) {
    throw new Error('expected widget tiny floating toolbar visibility to be driven by local click-open state without duplicate selected-node gating')
  }
  if (!overlaySurfaceText.includes('onRun={() => {')) {
    throw new Error('expected StoryboardWidget overlay widget to wire the Run action through the shared run handler')
  }
  if (!overlaySurfaceText.includes('void args.runWorkflowNode(actionNodeId)')) {
    throw new Error('expected StoryboardWidget Run action to reuse the existing workflow run callback through the resolved action identity')
  }
  const probeTreeToolbarIndex = toolbarText.indexOf('tooltipContent={UI_COPY.flowWidgetProbeTree}')
  const convertToLoopToolbarIndex = toolbarText.indexOf('tooltipContent={UI_COPY.flowWidgetConvertToLoop}')
  if (probeTreeToolbarIndex < 0 || convertToLoopToolbarIndex < 0 || probeTreeToolbarIndex > convertToLoopToolbarIndex) {
    throw new Error('expected Probe-Tree to render immediately before Convert to loop in the shared widget bubble toolbar')
  }
  const probeTreeCard = {
    id: 'care_source',
    title: 'Care Source',
    summary: 'check my hand, numb...',
    lane: 'Source',
    typeLabel: 'Input Widget',
    action: '',
    prompt: '',
    output: '',
    lanePropertyKey: 'lane',
    indexLabel: '',
    slugline: '',
    dialogue: '',
    style: '',
    tags: [],
    meta: [],
    invocationTokens: [],
    sourceModelLabel: '',
    sourcePromptLabel: '',
    href: '',
    media: null,
    references: [],
    order: 0,
    inputIndex: 0,
    candidateScore: 0,
    structural: false,
  } as Parameters<typeof resolveProbeTreeCardMaterializationRequestText>[0]
  const probeTreeInvocationText = resolveProbeTreeCardMaterializationRequestText(probeTreeCard)
  for (const expected of ['agentic-graph.probe.generate', 'Selected card id: care_source', 'response.structuredContent.cards']) {
    if (!probeTreeInvocationText.includes(expected)) throw new Error(`expected Probe-Tree toolbar invocation to include ${expected}`)
  }
  for (const forbidden of ['emitChatInputAppend', 'emitFloatingPanelOpen']) {
    if (probeTreeActionText.includes(forbidden)) {
      throw new Error(`expected Probe-Tree toolbar action to avoid FloatingPanel Chat route: ${forbidden}`)
    }
  }
  for (const expected of ['materializeProbeTreeBranchCards({ graphData: args.graphData, card: args.card })', 'args.commitGraphData(result.graphData)', 'revealProbeTreeBranchCardsOnCanvas(result.materializedNodeIds)']) {
    if (!probeTreeActionText.includes(expected)) {
      throw new Error(`expected Probe-Tree toolbar action to materialize selectable cards on canvas: ${expected}`)
    }
  }
  const probeTreeGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'care_source', label: 'Care Source', type: 'Node', properties: { title: 'Care Source' } }],
    edges: [],
  }
  const noModelBranches = materializeProbeTreeBranchCards({ graphData: probeTreeGraph, card: probeTreeCard })
  if (
    noModelBranches.changed
    || noModelBranches.kind !== 'warning'
    || noModelBranches.materializedNodeIds.length !== 0
    || !noModelBranches.message.includes('does not create hardcoded preview branches')
  ) throw new Error(`expected the Probe-Tree toolbar to fail closed without accepted model cards, got ${JSON.stringify(noModelBranches)}`)
  let toolbarCommittedGraph: GraphData | null = null
  const toolbarHistory: string[] = []
  const toolbarToasts: Array<{ kind?: string; message?: string }> = []
  const toolbarResult = invokeProbeTreeFromStoryboardToolbar({
    card: probeTreeCard,
    graphData: probeTreeGraph,
    commitGraphData: nextGraphData => { toolbarCommittedGraph = nextGraphData },
    addHistory: label => { toolbarHistory.push(label) },
    upsertUiToast: toast => { toolbarToasts.push(toast) },
  })
  if (
    toolbarResult.changed
    || toolbarCommittedGraph !== null
    || toolbarHistory.length !== 0
    || !toolbarToasts[0]?.message?.includes('does not create hardcoded preview branches')
  ) throw new Error(`expected Probe-Tree toolbar action to leave the graph unchanged before model-backed Run, got ${JSON.stringify({ toolbarResult, toolbarHistory, toolbarToasts })}`)

  const acceptedGraph: GraphData = {
    ...probeTreeGraph,
    nodes: [
      ...probeTreeGraph.nodes,
      ...['market-horizon', 'investment-evidence', 'regional-scope'].map((id, index) => ({
        id: `accepted-${id}`,
        type: 'TextGeneration',
        label: `Accepted ${id}`,
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          probeTreeResponseMode: 'llm-contract',
          parentNodeId: 'care_source',
          parentGraphNodeId: 'care_source',
          summary: `Accepted model question ${index + 1}`,
        },
      })),
    ],
    edges: ['market-horizon', 'investment-evidence', 'regional-scope'].map((id, index) => ({
      id: `accepted-edge-${index + 1}`,
      source: 'care_source',
      target: `accepted-${id}`,
      label: 'candidateOption',
      properties: {},
    })),
  }
  const materialized = materializeProbeTreeBranchCards({ graphData: acceptedGraph, card: probeTreeCard })
  if (
    materialized.changed
    || materialized.kind !== 'neutral'
    || materialized.materializedNodeIds.length !== 3
    || materialized.graphData !== acceptedGraph
  ) throw new Error(`expected Probe-Tree toolbar to reveal only accepted model-backed branch cards, got ${JSON.stringify(materialized)}`)
  assertProbeTreeRevealPreservesExplicitPinsAndViewport(materialized.materializedNodeIds)
  if (!toolbarText.includes('GRAPH_FIELDS_ENTRY_SHORTCUT_NODE_LABEL')) {
    throw new Error('expected Open sidepane to reuse the shared Graph Fields node entry label instead of a local literal')
  }
  if (!toolbarText.includes("workflowManagerEntryLabel: GRAPH_FIELDS_ENTRY_SHORTCUT_NODE_LABEL")) {
    throw new Error('expected Open sidepane to deep-link into the Workflow Manager node entry target')
  }
  if (toolbarText.includes("emitFloatingPanelOpen({ tab: 'node', open: true })")) {
    throw new Error('expected Open sidepane to stop using the ambiguous floating-panel node route')
  }
  if (!overlaySurfaceText.includes('openWorkflowManagerMappingForNode({')) {
    throw new Error('expected Update KV entry to reuse the shared mapping-open helper instead of inlining a local route')
  }
  for (const snippet of [
    'const resolvedWidgetRegistryEntry = resolveWidgetRegistryEntry({',
    'const widgetIdentity = resolveWidgetIdentity({',
    "workflowManagerTab: 'mapping' as const",
    '...(searchQuery ? { searchQuery } : {}),',
  ]) {
    if (!openMappingHelperText.includes(snippet)) {
      throw new Error(`expected shared mapping-open helper snippet: ${snippet}`)
    }
  }
  if (!copyText.includes("flowWidgetRun: 'Run'")) {
    throw new Error('expected shared UI copy to expose a Run label for the widget tiny floating toolbar')
  }
  for (const snippet of [
    "flowWidgetOpenInSidepane: 'Open sidepane'",
    "flowWidgetProbeTree: 'Probe-Tree'",
    "flowWidgetConvertToLoop: 'Convert to loop'",
    "flowWidgetDuplicate: 'Duplicate'",
    "flowWidgetClearOutput: 'Reset'",
    "flowWidgetRemoveNode: 'Remove'",
  ]) {
    if (!copyText.includes(snippet)) {
      throw new Error(`expected shared widget toolbar copy snippet: ${snippet}`)
    }
  }
  for (const snippet of [
    "updateKvEntry: 'Update KV entry'",
    "openInSidepane: 'Open sidepane'",
    "probeTree: 'Probe-Tree'",
    "convertToLoopNode: 'Convert to loop'",
    "clearOutput: 'Reset'",
    "removeNode: 'Remove'",
  ]) {
    if (!metaText.includes(snippet)) {
      throw new Error(`expected shared widget toolbar meta label snippet: ${snippet}`)
    }
  }
}

export function testStoryboardWidgetToolbarViewportShiftKeepsActionsReachable() {
  const centered = computeViewportSafeInlineCenterShiftPx({
    anchorCenterPx: 160,
    elementWidthPx: 240,
    viewportWidthPx: 320,
    marginPx: 8,
  })
  if (centered !== 0) {
    throw new Error(`expected centered toolbar to avoid unnecessary shift, got ${centered}`)
  }

  const left = computeViewportSafeInlineCenterShiftPx({
    anchorCenterPx: 24,
    elementWidthPx: 260,
    viewportWidthPx: 320,
    marginPx: 8,
  })
  if (!(left > 0) || Math.abs(24 + left - 138) > 0.001) {
    throw new Error(`expected left-edge toolbar to shift into the viewport, got ${left}`)
  }

  const right = computeViewportSafeInlineCenterShiftPx({
    anchorCenterPx: 300,
    elementWidthPx: 260,
    viewportWidthPx: 320,
    marginPx: 8,
  })
  if (!(right < 0) || Math.abs(300 + right - 182) > 0.001) {
    throw new Error(`expected right-edge toolbar to shift into the viewport, got ${right}`)
  }

  const oversized = computeViewportSafeInlineCenterShiftPx({
    anchorCenterPx: 24,
    elementWidthPx: 640,
    viewportWidthPx: 320,
    marginPx: 8,
  })
  if (Math.abs(24 + oversized - 160) > 0.001) {
    throw new Error(`expected oversized toolbar to center within the available viewport, got ${oversized}`)
  }
}
