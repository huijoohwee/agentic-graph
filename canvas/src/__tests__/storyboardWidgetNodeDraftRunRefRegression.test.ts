import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveStoryboardWidgetAutoRunNodeIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetAutoRunTargets'
import { resolveStoryboardWidgetNodeMutationTarget } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetNodeDraftActions'
import { IMAGE_TO_THREEJS_COMMAND_TOKEN } from '@/features/image-to-threejs/imageToThreeJsContract'
import type { GraphData } from '@/lib/graph/types'
import {
  commitOpenCardInlineTextEditors,
  registerOpenCardInlineTextEditor,
} from '@/lib/cards/CardInlineTextEditorSupport'

export function testStoryboardWidgetNodeDraftUpdatesRefBeforeRunStoreWriteback() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetNodeDraftActions.ts'), 'utf8')
  const draftWrite = 'args.draftGraphDataRef.current = nextDraft'
  const storeWrite = 'args.updateNode(storeNodeId || id, patch)'
  const draftStateWrite = 'if (nextDraft) args.setDraftGraphData(nextDraft)'

  if (!text.includes('const updateNodeById = React.useCallback((nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => {')
    || !text.includes(draftWrite)
    || !text.includes('const readDraftMutationRevisionFloor = React.useCallback((): number => {')
    || !text.includes('{ revisionFloor: readDraftMutationRevisionFloor() },')
    || !text.includes(storeWrite)
    || !text.includes(draftStateWrite)
    || text.indexOf(draftWrite) > text.indexOf(storeWrite)) {
    throw new Error('expected Storyboard Widget node property commits to update the live draft graph ref before store writeback so Run All cannot read stale KTV values')
  }
  if (text.indexOf(draftStateWrite) < text.indexOf(storeWrite)) {
    throw new Error('expected Storyboard Widget draft state publication after canonical store writeback so the base subscription cannot overwrite it in the same batch')
  }
}

export function testStoryboardWidgetPropertyPatchesPreferLiveDraftBeforeStoreGraph() {
  const liveDraft = { nodes: [{ id: 'target' }, { id: 'untouched-sibling' }], edges: [] } as GraphData
  const staleRendererSnapshot = { nodes: [{ id: 'target' }], edges: [] } as GraphData
  const resolved = resolveStoryboardWidgetNodeMutationTarget({
    baseGraphData: staleRendererSnapshot,
    draftGraphData: liveDraft,
    latestDraftGraphData: liveDraft,
    nodeId: 'target',
    sourceGraphData: staleRendererSnapshot,
    storeGraphData: staleRendererSnapshot,
  })
  if (resolved?.graphData !== liveDraft || resolved.graphData.nodes?.some(node => node.id === 'untouched-sibling') !== true) {
    throw new Error('expected Storyboard Widget node mutations to preserve the live draft and untouched siblings instead of rebuilding from a stale renderer snapshot')
  }
}

export function testStoryboardWidgetCommittedNodePropertiesPersistBeforeDocumentSwitch() {
  const actionsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetNodeDraftActions.ts'), 'utf8')
  const runtimeText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const callbackProp = 'persistCommittedNodeProperties?: (graphData: GraphData) => void'
  const patchPublish = 'if (nextDraft && changedPropertyKeys.length > 0) args.persistCommittedNodeProperties?.(nextDraft)'
  const runtimeBinding = 'persistCommittedNodeProperties: persistPublishedStoryboardCardMediaGraphForSurface'

  if (!actionsText.includes(callbackProp) || actionsText.split(patchPublish).length !== 3 || !runtimeText.includes(runtimeBinding)) {
    throw new Error('expected committed Storyboard Widget property edits to persist their revisioned draft to the semantic markdown source before a document switch can discard local draft state')
  }
}

export function testStoryboardCanvasWorkflowRunPublishesBeforeSingleDurableSourceWrite() {
  const storyboardCanvasText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardCanvas.tsx'), 'utf8')
  const sourceSyncText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardCardMediaGraphSource.ts'), 'utf8')
  const sharedCommitText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardCardMediaGraphCommit.ts'), 'utf8')
  const runtimeText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const synchronizedPublish = 'publishedSynchronizationsRef.current.set(nextDraft, synchronization)'
  const synchronizedPersist = 'persistStoryboardCardMediaGraphSourceSynchronization(synchronization, persistenceOptions)'
  const publishStart = storyboardCanvasText.indexOf('const commitStoryboardPublishedGraphData = React.useCallback((nextGraphData: GraphData) => {')
  const publishEnd = storyboardCanvasText.indexOf('  const materializeStoryboardProbeTree', publishStart)
  const storyboardPublishBlock = storyboardCanvasText.slice(publishStart, publishEnd)

  if (publishStart < 0
    || publishEnd < publishStart
    || storyboardPublishBlock.includes('persistStoryboardCardMediaGraphSource(')
    || !storyboardPublishBlock.includes('synchronizeStoryboardCardMediaGraphSource(committedGraphData, {')
    || !storyboardPublishBlock.includes('setGraphDataPreservingLayout(committedGraphData)')
    || storyboardPublishBlock.indexOf('synchronizeStoryboardCardMediaGraphSource(committedGraphData, {') > storyboardPublishBlock.indexOf('setGraphDataPreservingLayout(committedGraphData)')
    || !storyboardCanvasText.includes('persistDraftGraphData: async (nextGraphData, options) => { await persistStoryboardCardMediaGraphSource(nextGraphData,')) {
    throw new Error('expected Storyboard workflow publications to synchronize the source revision before publishing the graph, then perform one awaited durable source write after the run completes')
  }
  if (!sourceSyncText.includes('export function synchronizeStoryboardCardMediaGraphSource(')
    || !sourceSyncText.includes('const synchronized = synchronizeStoryboardCardMediaGraphSource(graphData, options)')) {
    throw new Error('expected Storyboard source synchronization to be a shared upstream primitive used by both publish and persistence paths')
  }
  if (!sharedCommitText.includes('synchronizeStoryboardCardMediaGraphSource(nextDraft, { sourceOwner })')
    || sharedCommitText.indexOf('synchronizeStoryboardCardMediaGraphSource(nextDraft, { sourceOwner })') > sharedCommitText.indexOf('setGraphDataPreservingLayout(nextDraft)')) {
    throw new Error('expected every Storyboard Widget surface to synchronize its Markdown source before publishing a graph projection')
  }
  if (!sourceSyncText.includes('export async function persistStoryboardCardMediaGraphSourceSynchronization(')
    || !sharedCommitText.includes(synchronizedPublish)
    || !sharedCommitText.includes(synchronizedPersist)) {
    throw new Error('expected published Storyboard graphs to persist their original source synchronization rather than serialize a second source snapshot')
  }
  if (!runtimeText.includes('commitPublishedGraphData: publishStoryboardCardMediaGraph,')
    || !runtimeText.includes('persistDraftGraphData: commitStoryboardCardMediaGraph,')) {
    throw new Error('expected Storyboard Canvas to use the same publish-then-persist workflow contract as the Widget surface')
  }
}

export function testStoryboardWidgetAutoRunSchedulesAfterWidgetPropertyCommit() {
  const actionsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetNodeDraftActions.ts'), 'utf8')
  const runtimeText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  const autoTargetsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetAutoRunTargets.ts'), 'utf8')
  const runModeRead = 'canvasRunMode, collapsedGroupIds'
  const callback = 'const handleNodePropertiesCommittedForAutoRun = React.useCallback((nodeId: string, changedPropertyKeys?: ReadonlyArray<string>) => {'
  const targetResolver = 'resolveStoryboardWidgetAutoRunNodeIds({'
  const downstreamResolver = 'resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({'
  const runnableFilter = 'isStoryboardWidgetWorkflowRunnableNode({'
  const sourcePortFilter = "const sourcePortKey = readFlowEdgePortKey(edge, 'source') || ''"
  const autoGate = "if (canvasRunMode !== 'auto') return"
  const callbackProp = 'onNodePropertiesCommittedForAutoRun?: (nodeId: string, changedPropertyKeys?: ReadonlyArray<string>) => void'
  const callbackPass = 'onNodePropertiesCommittedForAutoRun: handleNodePropertiesCommittedForAutoRun'

  for (const [source, snippet] of [
    [runtimeText, runModeRead],
    [runtimeText, callback],
    [runtimeText, autoGate],
    [runtimeText, targetResolver],
    [runtimeText, 'changedPropertyKeys,'],
    [runtimeText, callbackPass],
    [actionsText, callbackProp],
    [actionsText, 'args.onNodePropertiesCommittedForAutoRun?.(id, changedPropertyKeys)'],
    [autoTargetsText, downstreamResolver],
    [autoTargetsText, runnableFilter],
    [autoTargetsText, sourcePortFilter],
    [autoTargetsText, 'if (shouldScopeToChangedProperties) return downstreamTargetIds'],
  ] as const) {
    if (!source.includes(snippet)) {
      throw new Error(`expected Storyboard Widget Auto Run to schedule from shared widget property commits: ${snippet}`)
    }
  }
  if (!runtimeText.includes('for (const targetNodeId of targetNodeIds) {') || !runtimeText.includes('void runWorkflowNodeRef.current(targetNodeId)')) {
    throw new Error('expected Auto Run to execute resolved downstream runnable node ids, not only the edited source node')
  }
  const patchWrapperIndex = actionsText.indexOf('const patchNodePropertiesById = React.useCallback((nodeId: string, patch: Record<string, unknown>) => {')
  const setWrapperIndex = actionsText.indexOf('const setNodePropertiesById = React.useCallback((nodeId: string, properties: Record<string, unknown>) => {')
  const patchWrapperBlock = actionsText.slice(patchWrapperIndex, actionsText.indexOf('const patchSelectedNodeProperties'))
  const setWrapperBlock = actionsText.slice(setWrapperIndex, actionsText.indexOf('const validateNodeById'))
  if (patchWrapperBlock.indexOf('patchNodePropertiesById(nodeId, patch)') > patchWrapperBlock.indexOf('scheduleAutoRunNode(nodeId)')) {
    throw new Error('unexpected stale overlay-level Auto Run scheduler remains in patch wrapper')
  }
  if (patchWrapperBlock.indexOf('updateNodeById(id, { properties: nextProps as never })') > patchWrapperBlock.indexOf('args.onNodePropertiesCommittedForAutoRun?.(id, changedPropertyKeys)')) {
    throw new Error('expected property patch auto-run callback after live draft ref update')
  }
  if (setWrapperBlock.indexOf('updateNodeById(id, { properties: nextProps as never })') > setWrapperBlock.indexOf('args.onNodePropertiesCommittedForAutoRun?.(id, changedPropertyKeys)')) {
    throw new Error('expected property set auto-run callback after live draft ref update')
  }
}

export function testStoryboardWidgetRunTargetResolverPrefersDownstreamRunnableTargets() {
  const graphData: GraphData = {
    type: 'flow',
    nodes: [
      {
        id: 'source_input',
        type: 'templateInput',
        label: 'Source Input',
        x: 0,
        y: 0,
        properties: {},
      },
      {
        id: 'compute_summary',
        type: 'templateNode',
        label: 'Compute Summary',
        x: 220,
        y: 0,
        properties: {
          'flow:compute': 'inputs => ({ output: String(inputs?.input_metric_target || "") })',
        },
      },
    ],
    edges: [
      {
        id: 'source_to_compute',
        label: '',
        source: 'source_input',
        target: 'compute_summary',
        properties: {
          'flow:sourcePortKey': 'input_metric_target',
          'flow:targetPortKey': 'input_metric_target',
        },
      },
    ],
  }

  const targetIds = resolveStoryboardWidgetAutoRunNodeIds({ graphData, nodeId: 'source_input' })
  if (targetIds.length !== 1 || targetIds[0] !== 'compute_summary') {
    throw new Error(`expected Widget Run resolver to target downstream runnable compute node, got ${JSON.stringify(targetIds)}`)
  }
  const changedDataTargetIds = resolveStoryboardWidgetAutoRunNodeIds({
    graphData,
    nodeId: 'source_input',
    changedPropertyKeys: ['input_metric_target'],
  })
  if (changedDataTargetIds.length !== 1 || changedDataTargetIds[0] !== 'compute_summary') {
    throw new Error(`expected Auto Run resolver to target connected downstream runnable compute node for changed data port, got ${JSON.stringify(changedDataTargetIds)}`)
  }
  const changedWidgetMetadataTargetIds = resolveStoryboardWidgetAutoRunNodeIds({
    graphData,
    nodeId: 'source_input',
    changedPropertyKeys: ['canvas:widgetCard'],
  })
  if (changedWidgetMetadataTargetIds.length !== 0) {
    throw new Error(`expected Auto Run resolver to ignore widget metadata property commits, got ${JSON.stringify(changedWidgetMetadataTargetIds)}`)
  }
  const noChangeTargetIds = resolveStoryboardWidgetAutoRunNodeIds({
    graphData,
    nodeId: 'source_input',
    changedPropertyKeys: [],
  })
  if (noChangeTargetIds.length !== 0) {
    throw new Error(`expected Auto Run resolver to ignore no-op property commits, got ${JSON.stringify(noChangeTargetIds)}`)
  }

  const imageToThreeGraph: GraphData = {
    type: 'flow',
    nodes: [
      {
        id: 'image_to_three_card',
        type: 'TextGeneration',
        label: 'Widget Card',
        x: 0,
        y: 0,
        properties: { prompt: `Generate ${IMAGE_TO_THREEJS_COMMAND_TOKEN} from the attached image.` },
      },
      {
        id: 'input_image_panel',
        type: 'RichMediaPanel',
        label: 'Rich Media Panel',
        x: 240,
        y: 0,
        properties: { imageUrl: 'workspace:/media/input.jpg' },
      },
    ],
    edges: [{
      id: 'card_to_input_panel',
      label: '',
      source: 'image_to_three_card',
      target: 'input_image_panel',
      properties: {},
    }],
  }
  const imageToThreeTargetIds = resolveStoryboardWidgetAutoRunNodeIds({
    graphData: imageToThreeGraph,
    nodeId: 'image_to_three_card',
    resolveRichMediaKind: () => 'image',
  })
  if (imageToThreeTargetIds.length !== 1 || imageToThreeTargetIds[0] !== 'image_to_three_card') {
    throw new Error(`expected inline image-to-threejs Card Run to execute its source card, got ${JSON.stringify(imageToThreeTargetIds)}`)
  }
}

export function testStoryboardWidgetRunCommitsActiveSharedInlineEditorBeforeRun() {
  const toolbarText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidget', 'WidgetEditorActionsToolbar.tsx'), 'utf8')
  const overlayElementsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetOverlaySurfaceElements.tsx'), 'utf8')
  const renderGraphText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetRenderGraph.ts'), 'utf8')
  const cardInlineText = ['CardInlineTextEditor.tsx', 'CardInlineTextEditorSupport.ts'].map(fileName => readFileSync(resolve(process.cwd(), 'src', 'lib', 'cards', fileName), 'utf8')).join('\n')
  const plainTextInput = readFileSync(resolve(process.cwd(), 'src', 'components', 'ui', 'PlainTextInputEditor.tsx'), 'utf8')
  const runActionText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const sourceBackedRunText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetSourceBackedRunOutput.ts'), 'utf8')

  for (const snippet of [
    'export function commitActiveCardInlineTextEditor(ownerDocument?: Document | null): boolean {',
    "const CARD_INLINE_TEXT_EDITOR_INPUT_ATTRIBUTE = 'data-kg-card-inline-edit-input'",
    'active.blur()',
    "[CARD_INLINE_TEXT_EDITOR_INPUT_ATTRIBUTE]: '1'",
  ]) {
    if (!cardInlineText.includes(snippet)) {
      throw new Error(`expected shared CardInlineTextEditor to expose active-editor commit contract: ${snippet}`)
    }
  }
  if (!plainTextInput.includes('dataAttributes?: Record<`data-${string}`, string | number | boolean | undefined>') || !plainTextInput.includes('{...dataAttributes}')) {
    throw new Error('expected PlainTextInputEditor to preserve generic data attributes for shared inline editor commit markers')
  }
  const runCaptureIndex = toolbarText.indexOf('if (event.button === 0 && runButton) {')
  const capturedCommitIndex = toolbarText.indexOf('commitActiveCardInlineTextEditor()', runCaptureIndex)
  const capturedRunIndex = toolbarText.indexOf('onRun()', capturedCommitIndex)
  if (!toolbarText.includes("import { commitActiveCardInlineTextEditor } from '@/lib/cards/CardInlineTextEditor'")
    || !toolbarText.includes('onPointerDownCapture={handleToolbarPointerDownCapture}')
    || runCaptureIndex < 0
    || capturedCommitIndex < runCaptureIndex
    || capturedRunIndex < capturedCommitIndex) {
    throw new Error('expected Storyboard Widget Run action to commit the active shared inline editor before invoking Run')
  }
  const runCallbackIndex = overlayElementsText.indexOf('onRun={() => {')
  const liveRunGraphIndex = overlayElementsText.indexOf('const graphDataForRunResolution = args.draftGraphDataRef?.current')
  const targetResolutionIndex = overlayElementsText.indexOf('const targetNodeIds = resolveStoryboardWidgetAutoRunNodeIds({')
  if (runCallbackIndex < 0
    || liveRunGraphIndex < runCallbackIndex
    || targetResolutionIndex < liveRunGraphIndex
    || !overlayElementsText.includes('const targetNodeIds = resolveStoryboardWidgetAutoRunNodeIds({')
    || !overlayElementsText.includes('nodeId: actionNodeId')
    || !overlayElementsText.includes('for (const targetNodeId of targetNodeIds) {')
    || !overlayElementsText.includes('void args.runWorkflowNode(targetNodeId)')) {
    throw new Error('expected Widget Run to read the live draft graph inside the callback after committing the active KTV edit')
  }
  if (!overlayElementsText.includes('draftGraphDataRef?: React.MutableRefObject<GraphData | null>')) {
    throw new Error('expected Widget Run to resolve downstream runnable targets from the live draft graph after KTV edits')
  }
  for (const snippet of [
    'const inFlightNodeIds = new Set<string>()',
    "message: 'Generating response…'",
    'ttlMs: null',
    'dismissible: false',
    'busy: true',
  ]) {
    if (!runActionText.includes(snippet)) {
      throw new Error(`expected first Widget Run press to expose immediate busy Toast feedback: ${snippet}`)
    }
  }
  if (!sourceBackedRunText.includes('id: `storyboard-widget-run-${args.id}`')) {
    throw new Error('expected source-backed completion to settle the same Widget Run progress Toast')
  }
  let committedValue = ''
  const unregister = registerOpenCardInlineTextEditor(
    'run-first-press',
    nextValue => { committedValue = String(nextValue || '') },
    () => 'first press draft',
  )
  try {
    if (!commitOpenCardInlineTextEditors() || committedValue !== 'first press draft') {
      throw new Error('expected first Widget Run pointer activation to synchronously commit the registered inline draft before run resolution')
    }
  } finally {
    unregister()
  }
  for (const snippet of [
    "String(draftLookup?.revision ?? args.draftGraphRevision ?? '')",
    "String(renderLookup?.revision ?? args.renderGraphRevision ?? '')",
  ]) {
    if (!renderGraphText.includes(snippet)) {
      throw new Error(`expected workflow run-target resolution cache to include graph revisions so KTV edits cannot reuse stale run graphs: ${snippet}`)
    }
  }
}
