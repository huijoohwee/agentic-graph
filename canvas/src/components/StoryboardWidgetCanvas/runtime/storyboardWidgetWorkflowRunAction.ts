import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { buildWorkspaceGraphMutationTransitionState } from '@/features/workspace-table/workspaceTableSsot'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { isKgcWorkspaceCompanionPath, toCanonicalKgcWorkspacePath } from '@/features/chat/chatHistoryWorkspace.paths'
import { emitKgcRunOutput } from '@/features/chat/kgcRunOutput'
import { trackWorkspaceSourceTextPublication } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import { ensureEditorCanvasLandingForDuration } from '@/lib/toolbar/workspaceLandingGuard'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { UI_COPY, FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import { resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { resolveRichMediaWidgetKind } from '@/features/chat/richMediaRun'
import { getCachedStoryboardWidgetWorkflowNodeResolutionContext, resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs, resolveStoryboardWidgetWorkflowRunTarget } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { buildStoryboardWidgetInlineComputeOutputPatch, resolveStoryboardWidgetWorkflowConnectedValuesInput } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunInputs'
import { isStoryboardWidgetWorkflowRunnableNode, resolveStoryboardWidgetWorkflowDownstreamRunTargetIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import { publishStoryboardWidgetSourceBackedRunOutput } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetSourceBackedRunOutput'
import { setStoryboardWidgetWorkflowRunLoadingStateForKnownNodeIds, updateStoryboardWidgetWorkflowOutputForKnownNodeIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowWriteback'
import { runStoryboardWidgetMediaWorkflowNode } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowMediaRunHandlers'
import { createStoryboardWidgetWorkflowRichMediaPublishers } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import { materializeStoryboardWidgetWorkflowOutputEdge } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowOutputEdgeMaterialization'
import { preserveStoryboardWidgetWorkflowInputTopology } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { runStoryboardWidgetProbeTreeTextGenerationInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun'
import { revealProbeTreeBranchCardsOnCanvas } from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { readFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { runStoryboardWidgetNativeImportUrlInvocation } from './storyboardWidgetWorkflowNativeImportUrlRun'
import { runStoryboardWidgetNativeCrawlerInvocation } from './storyboardWidgetWorkflowNativeCrawlerRun'
import { runStoryboardWidgetRichMediaDeliverables } from './storyboardWidgetWorkflowRichMediaDeliverablesRun'
import { generateStoryboardWidgetTextWithProvider } from './storyboardWidgetWorkflowTextGenerationProvider'
import { runStoryboardWidgetHeadlessTextResponse } from './storyboardWidgetHeadlessTextRun'
import { resolveStoryboardWidgetTextGenerationRunContext, type StoryboardWidgetTextGenerationRunContext } from './storyboardWidgetTextGenerationRunContext'
import { runStoryboardWidgetSpecializedWorkflowNode } from './storyboardWidgetWorkflowSpecializedRunHandlers'
import type { StoryboardWidgetWorkflowNodeRunner, StoryboardWidgetWorkflowNodeRunnerArgs } from './storyboardWidgetWorkflowRunTypes'
export { resolveStoryboardWidgetBaseGraphKind } from './storyboardWidgetWorkflowRunTypes'
export type { StoryboardWidgetWorkflowNodeRunner, StoryboardWidgetWorkflowNodeRunnerArgs } from './storyboardWidgetWorkflowRunTypes'
export function createStoryboardWidgetWorkflowNodeRunner(args: StoryboardWidgetWorkflowNodeRunnerArgs): StoryboardWidgetWorkflowNodeRunner {
  const inFlightNodeIds = new Set<string>()
  const scheduleWorkflowOutputEdgeRefresh = () => {
    const run = () => args.scheduleOverlayEdgeUpdate()
    if (typeof requestAnimationFrame === 'function') return void requestAnimationFrame(run)
    run()
  }
  let runWorkflowNode: StoryboardWidgetWorkflowNodeRunner
  const executeRunWorkflowNode: StoryboardWidgetWorkflowNodeRunner = async (nodeId, runOptions) => {
    let runAnchorNode: GraphNode | null = null
    let publishedRunGraphData: GraphData | null = null
    let suppressDraftPersistence = false
    const commitPublishedRunGraphData = args.commitPublishedGraphData
      ? (graphData: GraphData) => {
          publishedRunGraphData = graphData
          args.commitPublishedGraphData?.(graphData)
        }
      : undefined
    const executeWorkflowNode = async () => {
      const id = String(nodeId || '').trim()
      const allowCreateRichMediaPanel = runOptions?.allowCreateRichMediaPanel !== false
      const suppressLayoutMutation = runOptions?.suppressLayoutMutation === true
      const reportNodeRunFailure = (message: string, ttlMs = 2600) => {
        const failureMessage = String(message || '').trim() || UI_COPY.storyboardWidgetRunFailedToast
        if (runOptions?.propagateErrors) throw new Error(failureMessage)
        args.upsertUiToast({ id: `storyboard-widget-run-${id}`, kind: 'neutral', message: failureMessage, ttlMs })
      }
      const stampRunLayoutMutationGuard = () => {
        if (!suppressLayoutMutation) return
        const state = useGraphStore.getState()
        useGraphStore.setState(buildWorkspaceGraphMutationTransitionState({
          workspaceViewMode: state.workspaceViewMode,
          workspaceCanvasPaneOpen: state.workspaceCanvasPaneOpen,
          markdownWorkspaceIndexingInFlight: state.markdownWorkspaceIndexingInFlight,
          transitionSemanticKey: `storyboard-widget-run:${id}`,
        }))
      }
      const withRunLayoutMutationGuard = <T>(fn: () => T): T => {
        stampRunLayoutMutationGuard()
        try {
          return fn()
        } finally {
          stampRunLayoutMutationGuard()
        }
      }
      const scheduleRunOutputEdgeRefresh = suppressLayoutMutation ? () => void 0 : scheduleWorkflowOutputEdgeRefresh
      if (!id) return
      const visitedNodeIds = runOptions?.visitedNodeIds || new Set<string>()
      if (visitedNodeIds.has(id)) return
      visitedNodeIds.add(id)
      const activeWorkspacePath = typeof args.markdownDocumentName === 'string' ? args.markdownDocumentName.trim() : ''
      if (!suppressLayoutMutation && activeWorkspacePath && isKgcWorkspaceCompanionPath(activeWorkspacePath)) {
        const canonicalPath = toCanonicalKgcWorkspacePath(activeWorkspacePath)
        const fs = await getWorkspaceFs()
        await fs.ensureSeed()
        const canonicalText = String(await fs.readFileText(canonicalPath) || '')
        if (canonicalText.trim()) {
          useMarkdownExplorerStore.getState().setActivePath(canonicalPath)
          ensureEditorCanvasLandingForDuration(1500)
          const state = useGraphStore.getState()
          if (state.markdownDocumentName !== canonicalPath || state.markdownDocumentText !== canonicalText) {
            await state.setActiveMarkdownDocument({
              name: canonicalPath,
              text: canonicalText,
              normalizeMermaidMmd: false,
              autoEnableFrontmatter: false,
              sourceUrl: typeof args.markdownDocumentSourceUrl === 'string' ? args.markdownDocumentSourceUrl : null,
            })
          }
          const ok = await state.applyMarkdownDocumentToGraph(canonicalPath, canonicalText, { force: true })
          const outputResult = ok
            ? await emitKgcRunOutput({
                canonicalPath,
                canonicalText,
                generationConfig: {
                  provider: state.chatProvider,
                  endpointUrl: state.chatEndpointUrl,
                  apiKey: state.chatAuthMode === 'byok' ? state.chatApiKey : '',
                  chatModel: state.chatModel,
                },
                getStore: () => ({
                  captureCanvasPngSnapshot: () => useGraphStore.getState().captureCanvasPngSnapshot(),
                  captureCanvasSvgSnapshot: () => useGraphStore.getState().captureCanvasSvgSnapshot(),
                }),
              })
            : { path: null, kind: 'markdown' as const, degraded: false }
          const outputName = outputResult.path ? canonicalPath.split('/').pop() : ''
          const generatedName = outputResult.path ? outputResult.path.split('/').pop() : ''
          args.upsertUiToast({
            id: `storyboard-widget-run-${id}`,
            kind: 'neutral',
            message: ok
              ? generatedName
                ? outputResult.degraded
                  ? `Ran ${outputName || 'KGC document'} and generated ${generatedName} as a markdown fallback for video output.`
                  : `Ran ${outputName || 'KGC document'} and generated ${generatedName}.`
                : `Ran ${outputName || 'KGC document'}.`
              : `Opened ${canonicalPath.split('/').pop() || 'KGC document'}.`,
            ttlMs: 2200,
          })
          return
        }
      }

      const draft = args.readDraftGraphData()
      if (!draft) {
        args.upsertUiToast({ id: `storyboard-widget-run-${id}`, kind: 'neutral', message: UI_COPY.storyboardWidgetNoDraftGraphToast, ttlMs: 2400 })
        return
      }
      const store = useGraphStore.getState()
      const workflowNodeResolutionContext = getCachedStoryboardWidgetWorkflowNodeResolutionContext({
        draftGraph: draft,
        draftGraphRevision: readGraphDataRevision(draft),
        renderGraph: args.renderGraphDataOverride,
        renderGraphRevision: readGraphDataRevision(args.renderGraphDataOverride),
        baseGraph: args.baseGraphData,
        baseGraphRevision: readGraphDataRevision(args.baseGraphData),
        storeGraph: store.graphData as GraphData | null,
        storeGraphRevision: readGraphDataRevision(store.graphData as GraphData | null),
        preferCurrentGraphDataRefs: true,
      })
      const resolvedRunTarget = resolveStoryboardWidgetWorkflowRunTarget({
        context: workflowNodeResolutionContext,
        requestedNodeId: id,
      })
      const node = resolvedRunTarget?.node || null
      if (!node) {
        args.upsertUiToast({ id: `storyboard-widget-run-${id}`, kind: 'neutral', message: UI_COPY.storyboardWidgetNodeNotFoundToast(id), ttlMs: 2400 })
        return
      }
      runAnchorNode = node
      const graphForRun = resolvedRunTarget?.graphForRun || draft
      const resolvedNodeId = String(resolvedRunTarget?.resolvedNodeId || node.id || id)
      const writableNodeId = String(resolvedRunTarget?.writableNodeId || resolvedNodeId).trim() || resolvedNodeId
      const executionAnchor = args.captureExecutionAnchor?.(resolvedNodeId) || null

      const resolveNodeByIdAcrossGraphs = (candidateId: string): GraphNode | null =>
        resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs({
          context: workflowNodeResolutionContext,
          candidateNodeId: candidateId,
          graphForRun,
        })

      const workflowWritebackNodeIds = [writableNodeId, resolvedNodeId, id, node.id]
      const updateRunOutputForKnownNodeIds = (buildPatch: (nodeProps: Record<string, unknown>) => Record<string, unknown>) => {
        withRunLayoutMutationGuard(() => updateStoryboardWidgetWorkflowOutputForKnownNodeIds({
          nodeIds: workflowWritebackNodeIds,
          fallbackNode: node,
          fallbackWritableNodeId: writableNodeId,
          readLiveDraftGraphData: args.readDraftGraphData,
          resolveNodeByIdAcrossGraphs,
          commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
          updateNode: args.updateNode,
          scheduleWorkflowOutputEdgeRefresh: scheduleRunOutputEdgeRefresh,
          suppressStoreGraphWriteback: suppressLayoutMutation,
          buildPatch,
        }))
      }

      const setRunLoadingStateForKnownNodeIds = (loadingArgs: { loading: boolean; kind?: 'text' | 'image' | 'video' | 'audio' }) => {
        withRunLayoutMutationGuard(() => setStoryboardWidgetWorkflowRunLoadingStateForKnownNodeIds({
          nodeIds: workflowWritebackNodeIds,
          fallbackNode: node,
          fallbackWritableNodeId: writableNodeId,
          loading: loadingArgs.loading,
          kind: loadingArgs.kind,
          readLiveDraftGraphData: args.readDraftGraphData,
          resolveNodeByIdAcrossGraphs,
          commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
          updateNode: args.updateNode,
          scheduleWorkflowOutputEdgeRefresh: scheduleRunOutputEdgeRefresh,
          suppressStoreGraphWriteback: suppressLayoutMutation,
        }))
      }
      const rawNodeProperties = readGraphNodeProperties(node)
      if (readFlowComputeSource(node)) {
        const inlineRegistryEntry = resolveWidgetRegistryEntry({ node, registry: args.widgetRegistry, graphMetaKind: args.baseGraphKind })
        const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
          context: workflowNodeResolutionContext,
          graphForRun,
          writableNodeId,
          registry: args.widgetRegistry,
          preserveMaterializedOutputs: false,
        })
        const connectedValuesBySchemaPath = connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId) || null
        const nextInlinePatch = buildStoryboardWidgetInlineComputeOutputPatch({
          node,
          registryEntry: inlineRegistryEntry,
          connectedValuesBySchemaPath,
          currentProperties: rawNodeProperties,
        })
        if (!nextInlinePatch) {
          reportNodeRunFailure(UI_COPY.storyboardWidgetRunFailedToast)
          return
        }
        updateRunOutputForKnownNodeIds(nodeProps => buildStoryboardWidgetInlineComputeOutputPatch({
          node: { ...node, properties: nodeProps as never },
          registryEntry: inlineRegistryEntry,
          connectedValuesBySchemaPath,
          currentProperties: nodeProps,
        }) || nodeProps)
        args.upsertUiToast({ id: `storyboard-widget-run-${id}`, kind: 'neutral', message: 'Ran inline compute.', ttlMs: 2200 })
        return
      }

      const {
        publishTextRunOutputToRichMediaPanel,
        publishMediaRunOutputToRichMediaPanel,
        publishImageToThreeJsRunOutputToRichMediaPanel,
        publishImageToGlbRunOutputToRichMediaPanel,
        restoreImageToThreeJsInputProjection,
        resolveImageToThreeJsOwnedOutputPanelRunInput,
        publishAnnotationRunOutputToRichMediaPanel,
      } = createStoryboardWidgetWorkflowRichMediaPublishers({
        context: workflowNodeResolutionContext,
        graphForRun,
        allowCreateRichMediaPanel,
        withRunLayoutMutationGuard,
        scheduleWorkflowOutputEdgeRefresh: scheduleRunOutputEdgeRefresh,
        readLiveDraftGraphData: args.readDraftGraphData,
        appendDraftNode: args.appendDraftNode,
        commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
        updateNode: args.updateNode,
        appendWorkflowOutputEdge: materializeStoryboardWidgetWorkflowOutputEdge,
        commitPublishedGraphData: commitPublishedRunGraphData,
        resolveNodeByIdAcrossGraphs,
        executionAnchor,
      })

      if (await runStoryboardWidgetSpecializedWorkflowNode({
        id,
        node,
        rawNodeProperties,
        context: workflowNodeResolutionContext,
        graphForRun,
        writableNodeId,
        widgetRegistry: args.widgetRegistry,
        activeWorkspacePath,
        updateRunOutputForKnownNodeIds,
        setRunLoadingStateForKnownNodeIds,
        publishTextRunOutputToRichMediaPanel,
        reportNodeRunFailure,
        upsertUiToast: args.upsertUiToast,
      })) return

      const mediaNodeHandled = await runStoryboardWidgetMediaWorkflowNode({
        id,
        node,
        rawNodeProperties,
        context: workflowNodeResolutionContext,
        graphForRun,
        writableNodeId,
        widgetRegistry: args.widgetRegistry,
        activeWorkspacePath,
        generationRuntime: {
          chatProvider: store.chatProvider,
          chatAuthMode: store.chatAuthMode,
          chatApiKey: store.chatApiKey,
          chatEndpointUrl: store.chatEndpointUrl,
          chatModel: store.chatModel,
          markdownDocumentText: typeof store.markdownDocumentText === 'string' ? store.markdownDocumentText : '',
        },
        updateRunOutputForKnownNodeIds,
        setRunLoadingStateForKnownNodeIds,
        publishMediaRunOutputToRichMediaPanel,
        publishImageToThreeJsRunOutputToRichMediaPanel,
        publishImageToGlbRunOutputToRichMediaPanel,
        restoreImageToThreeJsInputProjection,
        resolveImageToThreeJsOwnedOutputPanelRunInput,
        publishAnnotationRunOutputToRichMediaPanel,
        upsertUiToast: args.upsertUiToast,
        propagateErrors: runOptions?.propagateErrors === true,
        requireDurableMediaPersistence: runOptions?.requireDurableMediaPersistence === true,
      })
      if (mediaNodeHandled) return

      const resolveTextGenerationRunContext = () => resolveStoryboardWidgetTextGenerationRunContext({
        node,
        rawNodeProperties,
        runtimeProperties: store as unknown as Record<string, unknown>,
        context: workflowNodeResolutionContext,
        graphForRun,
        writableNodeId,
        widgetRegistry: args.widgetRegistry,
        baseGraphKind: args.baseGraphKind,
      })
      const createTextGenerationProvider = (textGeneration: StoryboardWidgetTextGenerationRunContext) => (
        generationPrompt: string,
        onText?: (nextText: string) => void,
        systemMessages?: ReadonlyArray<{ role: 'system'; content: string }>,
        onReasoningText?: (nextText: string) => void,
      ) => generateStoryboardWidgetTextWithProvider({
        properties: textGeneration.properties,
        store,
        formId: textGeneration.formId,
        localProperties: rawNodeProperties,
        prompt: generationPrompt,
        onText,
        onReasoningText,
        systemMessages,
      })
      const runHeadlessTextGeneration = (
        textGeneration: StoryboardWidgetTextGenerationRunContext,
        generateText = createTextGenerationProvider(textGeneration),
      ) => runStoryboardWidgetHeadlessTextResponse({
        sourceNodeId: writableNodeId,
        node,
        authoredRequestText: textGeneration.authoredPrompt || textGeneration.prompt,
        providerPrompt: textGeneration.prompt,
        provider: String(textGeneration.properties.chatProvider || store.chatProvider || ''),
        model: String(textGeneration.properties.chatModel || store.chatModel || '').trim() || null,
        workspacePath: activeWorkspacePath || null,
        outputSourceProvenanceJson: textGeneration.outputSourceProvenanceJson,
        generateText,
        updateSource: updateRunOutputForKnownNodeIds,
        publishOutput: publishTextRunOutputToRichMediaPanel,
        setLoading: loading => setRunLoadingStateForKnownNodeIds(loading ? { loading: true, kind: 'text' } : { loading: false }),
        reportFailure: reportNodeRunFailure,
        reportSuccess: message => args.upsertUiToast({
          id: `storyboard-widget-run-${id}`,
          kind: 'neutral',
          message,
          ttlMs: 2400,
        }),
      })
      const runProbeTreeInvocation = async (textGeneration: StoryboardWidgetTextGenerationRunContext): Promise<boolean> => {
        const probeTreeOutput = await runStoryboardWidgetProbeTreeTextGenerationInvocation({
          graphForRun, nodeIds: [writableNodeId, resolvedNodeId, id, String(node.id || '')], requestedNodeId: id, fallbackNode: node, resolutionContext: workflowNodeResolutionContext,
          textGeneration: {
            prompt: textGeneration.prompt,
            formId: textGeneration.formId,
            localProperties: rawNodeProperties,
            resolvedProperties: textGeneration.properties,
            runtimeProperties: store,
          },
          onInvocationStart: () => disableAutoZoomModesForUserGesture(useGraphStore.getState()),
          onMaterialized: nodeIds => { revealProbeTreeBranchCardsOnCanvas(nodeIds); scheduleRunOutputEdgeRefresh() },
          publishOutput: publishTextRunOutputToRichMediaPanel,
          executionAnchor,
          setLoading: loading => setRunLoadingStateForKnownNodeIds(loading ? { loading: true, kind: 'text' } : { loading: false }),
        })
        if (!probeTreeOutput) return false
        publishedRunGraphData = probeTreeOutput.graphData
        args.upsertUiToast({ id: `storyboard-widget-run-${id}`, kind: probeTreeOutput.kind, message: probeTreeOutput.message, ttlMs: probeTreeOutput.kind === 'success' ? 3000 : 4200 })
        return true
      }
      const nodeType = String(unwrapGraphCellValue(node.type) || '').trim()
      const genericTextGeneration = nodeType === FLOW_TEXT_GENERATION_NODE_TYPE_ID
        ? null
        : resolveTextGenerationRunContext()
      if (genericTextGeneration && await runProbeTreeInvocation(genericTextGeneration)) return

      if (nodeType === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
        const textGeneration = resolveTextGenerationRunContext()
        const { properties, authoredPrompt, connectedPrompt, connectedSourceNodeId, prompt } = textGeneration
        const generateTextWithProvider = createTextGenerationProvider(textGeneration)
        const deliverablesRun = await runStoryboardWidgetRichMediaDeliverables({
          id,
          node,
          graphForRun,
          rawNodeProperties,
          authoredPrompt,
          connectedPrompt,
          connectedSourceNodeId,
          workspacePath: activeWorkspacePath || null, requireDurablePersistence: runOptions?.requireDurableMediaPersistence === true,
          model: properties.chatModel || store.chatModel,
          generateText: generateTextWithProvider,
          publishOutput: publishTextRunOutputToRichMediaPanel,
          readGraph: args.readDraftGraphData,
          setLoading: loading => setRunLoadingStateForKnownNodeIds(loading ? { loading: true, kind: 'text' } : { loading: false }),
          reportFailure: reportNodeRunFailure,
          upsertToast: args.upsertUiToast,
        })
        if (deliverablesRun.handled) return void (publishedRunGraphData = deliverablesRun.graphData || args.readDraftGraphData())
        if (await runProbeTreeInvocation(textGeneration)) return
        if (!prompt) {
          reportNodeRunFailure('Add a prompt before running the Widget Card.', 2400)
          return
        }
        if (await runStoryboardWidgetNativeImportUrlInvocation({
          id,
          prompt,
          node,
          updateOutput: updateRunOutputForKnownNodeIds,
          publishOutput: publishTextRunOutputToRichMediaPanel,
          upsertToast: args.upsertUiToast,
          reportFailure: reportNodeRunFailure,
          onCanvasAuthorityChanged: () => {
            suppressDraftPersistence = true
            publishedRunGraphData = null
          },
        })) return
        if (await runStoryboardWidgetNativeCrawlerInvocation({ id, prompt, node, nodeProperties: rawNodeProperties, workspacePath: args.markdownDocumentName, recoveryOnly: runOptions?.nativeCrawlerRecovery === true, updateOutput: updateRunOutputForKnownNodeIds, publishOutput: publishTextRunOutputToRichMediaPanel, upsertToast: args.upsertUiToast, reportFailure: reportNodeRunFailure })) return
        await runHeadlessTextGeneration(textGeneration, generateTextWithProvider)
        return
      }
      const downstreamRunTargetIds = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({
        node,
        graphData: graphForRun,
      }).filter(targetId => !visitedNodeIds.has(targetId))
      const downstreamRunnableTargetIds = downstreamRunTargetIds.filter(targetId => isStoryboardWidgetWorkflowRunnableNode({
        node: resolveNodeByIdAcrossGraphs(targetId),
        resolveRichMediaKind: resolveRichMediaWidgetKind,
      }))
      if (downstreamRunnableTargetIds.length > 0) {
        for (const targetId of downstreamRunnableTargetIds) {
          await runWorkflowNode(targetId, {
            ...runOptions, allowCreateRichMediaPanel, suppressLayoutMutation, visitedNodeIds,
          })
        }
        args.upsertUiToast({
          id: `storyboard-widget-run-${id}`,
          kind: 'neutral',
          message: `Ran ${downstreamRunnableTargetIds.length} downstream node${downstreamRunnableTargetIds.length === 1 ? '' : 's'}.`,
          ttlMs: 2200,
        })
        return
      }

      if (genericTextGeneration?.prompt) {
        await runHeadlessTextGeneration(genericTextGeneration)
        return
      }
      publishStoryboardWidgetSourceBackedRunOutput({ id, node, publishTextRunOutputToRichMediaPanel, updateRunOutputForKnownNodeIds, upsertUiToast: args.upsertUiToast })
    }
    const executeWorkflowNodeWithFailureReporting = async () => {
      try {
        await executeWorkflowNode()
      } catch (error) {
        if (runOptions?.propagateErrors) throw error
        const detail = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '').trim() : ''
        args.upsertUiToast({ id: `storyboard-widget-run-${String(nodeId || '')}`, kind: 'error', message: detail || UI_COPY.storyboardWidgetRunFailedToast, ttlMs: 4200 })
      }
    }
    let deferredError: { value: unknown } | null = null
    try {
      await executeWorkflowNodeWithFailureReporting()
    } catch (error) {
      deferredError = { value: error }
    }
    const currentDurableGraph = publishedRunGraphData || args.readDraftGraphData()
    const durableGraph = currentDurableGraph && runAnchorNode ? preserveStoryboardWidgetWorkflowInputTopology({ graphData: currentDurableGraph, anchorNode: runAnchorNode }) : currentDurableGraph
    try {
      if (durableGraph && !suppressDraftPersistence) {
        await args.persistDraftGraphData(durableGraph, runOptions?.sourcePersistence)
      }
    } catch (error) {
      const detail = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '').trim() : ''
      args.upsertUiToast({ id: `storyboard-widget-persistence-failed-${String(nodeId || '')}`, kind: 'error', message: detail || 'Generated output could not be persisted to the workspace.', ttlMs: 5200 })
      deferredError = { value: error }
    }
    if (!suppressDraftPersistence) scheduleWorkflowOutputEdgeRefresh()
    if (deferredError) throw deferredError.value
  }
  runWorkflowNode = (nodeId, runOptions) => trackWorkspaceSourceTextPublication(async () => {
    const id = String(nodeId || '').trim()
    if (!id || runOptions?.visitedNodeIds?.has(id)) return
    const runToastId = `storyboard-widget-run-${id}`
    const showRunToast = runOptions?.suppressLayoutMutation !== true
    if (inFlightNodeIds.has(id)) {
      if (showRunToast) {
        args.upsertUiToast({
          id: runToastId,
          kind: 'neutral',
          message: 'Generating response…',
          ttlMs: null,
          dismissible: false,
          busy: true,
          log: false,
        })
      }
      return
    }
    inFlightNodeIds.add(id)
    if (showRunToast) {
      args.upsertUiToast({
        id: runToastId,
        kind: 'neutral',
        message: 'Generating response…',
        ttlMs: null,
        dismissible: false,
        busy: true,
      })
    }
    try {
      await executeRunWorkflowNode(id, runOptions)
    } catch (error) {
      if (showRunToast) {
        const detail = error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || '').trim()
          : ''
        args.upsertUiToast({
          id: runToastId,
          kind: 'error',
          message: detail || UI_COPY.storyboardWidgetRunFailedToast,
          ttlMs: 4200,
          dismissible: true,
          busy: false,
        })
      }
      throw error
    } finally {
      inFlightNodeIds.delete(id)
    }
  })
  return runWorkflowNode
}
