import { buildTextWidgetOutputPatch, clearRichMediaOutputProperties, isRichMediaOutputTargetNode } from '@/features/chat/richMediaRun'
import {
  clearLegacyImageToThreeJsDerivedOutputProperties,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  isImageToThreeJsOutputPanel,
  isLegacyImageToThreeJsDerivedOutput,
  resolveImageToThreeJsOutputPanelRunInput,
  resolveLegacyImageToThreeJsRunInput,
  type ImageToThreeJsRunInput,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import {
  buildImageToThreeJsPromptPreset,
  isImageToThreeJsPromptPreset,
} from '@/features/image-to-threejs/imageToThreeJsPromptPreset'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { resolveStoryboardWidgetWorkflowDownstreamRunTargetIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import {
  applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch,
  ensureStoryboardWidgetImageToGlbOutputEdge,
  ensureStoryboardWidgetImageToGlbOutputPanelNodeId,
  ensureStoryboardWidgetImageToThreeJsOutputEdge,
  ensureStoryboardWidgetImageToThreeJsOutputPanelNodeId,
  ensureStoryboardWidgetWorkflowRichMediaPanelNodeId,
  ensureStoryboardWidgetWorkflowOutputEdge,
  mergeStoryboardWidgetWorkflowPropertyPatch,
  normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement,
  WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
  WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { createStoryboardWidgetWorkflowPublicationTransaction } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowPublicationTransaction'
import { areStoryboardWidgetWorkflowRecordValuesEqual } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowWriteback'
import { buildStoryboardWidgetTextPublicationGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextPublicationGraph'
import { resolveStoryboardWidgetTextProjectionTargets } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextProjectionTargets'
import {
  buildRichMediaTextOutputBaselinePatch,
  buildRichMediaTextOutputVersionPatch,
} from '@/lib/render/richMediaOutputVersions'
import type { StoryboardWidgetTextRunOutputPublisher } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextRunOutputPublisher'
import {
  buildStoryboardWidgetRunMaterializationLayoutProperties,
  type StoryboardWidgetRunExecutionAnchorSnapshot,
} from './storyboardWidgetRunExecutionAnchor'
import {
  applyWorkflowMaterializationGroupPanel,
  applyWorkflowMaterializationProjectionParent,
} from '@/lib/storyboardWidget/runMaterializationProjection'
import {
  createStoryboardWidgetRunMaterializationPositionResolver,
  readStoryboardWidgetWorkflowPublicationString as readWorkflowString,
  resolveMediaPatchActiveTab,
  type StoryboardWidgetAnnotationRunOutputPublisher,
  type StoryboardWidgetImageToGlbRunOutputPublisher,
  type StoryboardWidgetImageToThreeJsInputRecovery,
  type StoryboardWidgetImageToThreeJsOutputInputResolver,
  type StoryboardWidgetImageToThreeJsRunOutputPublisher,
  type StoryboardWidgetMediaRunOutputPublisher,
} from './storyboardWidgetWorkflowPublicationContract'
import {
  createStoryboardWidgetAnnotationRunOutputPublisher,
} from './storyboardWidgetWorkflowAnnotationPublication'

export type { StoryboardWidgetTextRunOutputPublisher } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextRunOutputPublisher'
export {
  resolveMediaPatchActiveTab,
} from './storyboardWidgetWorkflowPublicationContract'
export type {
  StoryboardWidgetAnnotationRunOutputPublisher,
  StoryboardWidgetImageToGlbRunOutputPublisher,
  StoryboardWidgetImageToThreeJsInputRecovery,
  StoryboardWidgetImageToThreeJsOutputInputResolver,
  StoryboardWidgetImageToThreeJsRunOutputPublisher,
  StoryboardWidgetMediaRunOutputPublisher,
} from './storyboardWidgetWorkflowPublicationContract'

const HTML_VIDEO_PREVIEW_STABILITY_KEYS = [
  'output',
  'outputSrcDoc',
  'outputMimeType',
  'outputModel',
  'renderErrorCode',
  'renderErrorReason',
  'richMediaActiveTab',
] as const

export function stabilizeHtmlVideoPreviewPatchForExistingProps(
  currentProps: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const outputSrcDoc = typeof patch.outputSrcDoc === 'string' ? patch.outputSrcDoc : ''
  if (!outputSrcDoc || currentProps.outputSrcDoc !== outputSrcDoc) return patch
  for (const key of HTML_VIDEO_PREVIEW_STABILITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    if (!Object.is(currentProps[key], patch[key])) return patch
  }
  return {
    ...patch,
    lastRunAt: currentProps.lastRunAt,
  }
}

export function createStoryboardWidgetWorkflowRichMediaPublishers(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData
  allowCreateRichMediaPanel: boolean
  withRunLayoutMutationGuard: <T>(run: () => T) => T
  scheduleWorkflowOutputEdgeRefresh: () => void
  readLiveDraftGraphData: () => GraphData | null
  appendDraftNode: (args: {
    id?: string | null
    type: string
    label?: string | null
    x: number
    y: number
    properties?: Record<string, unknown>
  }) => string
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  appendWorkflowOutputEdge?: (edge: GraphEdge) => void
  commitPublishedGraphData?: (graphData: GraphData) => void
  resolveNodeByIdAcrossGraphs: (candidateId: string) => GraphNode | null
  executionAnchor?: StoryboardWidgetRunExecutionAnchorSnapshot | null
}): {
  publishTextRunOutputToRichMediaPanel: StoryboardWidgetTextRunOutputPublisher
  publishMediaRunOutputToRichMediaPanel: StoryboardWidgetMediaRunOutputPublisher
  publishImageToThreeJsRunOutputToRichMediaPanel: StoryboardWidgetImageToThreeJsRunOutputPublisher
  publishImageToGlbRunOutputToRichMediaPanel: StoryboardWidgetImageToGlbRunOutputPublisher
  restoreImageToThreeJsInputProjection: StoryboardWidgetImageToThreeJsInputRecovery
  resolveImageToThreeJsOwnedOutputPanelRunInput: StoryboardWidgetImageToThreeJsOutputInputResolver
  publishAnnotationRunOutputToRichMediaPanel: StoryboardWidgetAnnotationRunOutputPublisher
} {
  const resolveMaterializationPosition =
    createStoryboardWidgetRunMaterializationPositionResolver(args.executionAnchor)
  const readPanelProperties = (panelNodeId: string): Record<string, unknown> => {
    const liveDraft = args.readLiveDraftGraphData()
    const panel = Array.isArray(liveDraft?.nodes)
      ? liveDraft!.nodes.find(existing => String(existing?.id || '').trim() === panelNodeId) || args.resolveNodeByIdAcrossGraphs(panelNodeId)
      : args.resolveNodeByIdAcrossGraphs(panelNodeId)
    return (panel?.properties || {}) as Record<string, unknown>
  }

  const applyPublishedPanelPatch = (panelNodeId: string, patch: Record<string, unknown>, existingPanelProps = readPanelProperties(panelNodeId)) => {
    applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch({
      panelNodeId,
      patch,
      readLiveDraftGraphData: args.readLiveDraftGraphData,
      commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
      scheduleWorkflowOutputEdgeRefresh: args.scheduleWorkflowOutputEdgeRefresh,
    })
    const nextPanelProps = mergeStoryboardWidgetWorkflowPropertyPatch(existingPanelProps, patch)
    if (!areStoryboardWidgetWorkflowRecordValuesEqual(existingPanelProps, nextPanelProps)) {
      args.updateNode(panelNodeId, { properties: nextPanelProps as never })
    }
  }

  const resolveLiveNode = (nodeId: string): GraphNode | null => {
    const id = String(nodeId || '').trim()
    if (!id) return null
    const liveDraft = args.readLiveDraftGraphData()
    const liveNode = Array.isArray(liveDraft?.nodes)
      ? liveDraft!.nodes.find(node => String(node?.id || '').trim() === id) || null
      : null
    return liveNode || args.resolveNodeByIdAcrossGraphs(id)
  }

  const shouldRestoreLegacyImageToThreeJsPrompt = (properties: Record<string, unknown>): boolean => {
    const prompt = readWorkflowString(properties.prompt)
    if (!prompt) return true
    if (isImageToThreeJsPromptPreset(prompt)) return false
    if (prompt.includes('knowgrph-image-to-threejs/v1')) return true
    return /^generate (?:a )?(?:text )?response for the active request\.?$/i.test(prompt)
  }

  const restoreLegacyImageToThreeJsOutput = (argsForRestore: {
    nodeId: string
    forceImageTab: boolean
    ownedOutputRunInput?: ImageToThreeJsRunInput | null
  }): void => {
    const nodeId = String(argsForRestore.nodeId || '').trim()
    const liveNode = resolveLiveNode(nodeId)
    const currentProps = (liveNode?.properties || {}) as Record<string, unknown>
    const hasLegacyDerivedOutput = isLegacyImageToThreeJsDerivedOutput(currentProps)
    const legacyRunInput = hasLegacyDerivedOutput ? resolveLegacyImageToThreeJsRunInput(currentProps) : null
    const recoveryRunInput = legacyRunInput || argsForRestore.ownedOutputRunInput || null
    if (!liveNode || isImageToThreeJsOutputPanel(currentProps) || !recoveryRunInput) return
    const nextProps = hasLegacyDerivedOutput
      ? clearLegacyImageToThreeJsDerivedOutputProperties(currentProps)
      : { ...currentProps }
    if (!argsForRestore.forceImageTab && recoveryRunInput && shouldRestoreLegacyImageToThreeJsPrompt(currentProps)) {
      nextProps.prompt = buildImageToThreeJsPromptPreset()
    }
    if (argsForRestore.forceImageTab) nextProps.richMediaActiveTab = 'image'
    if (areStoryboardWidgetWorkflowRecordValuesEqual(currentProps, nextProps)) return

    const currentDraft = args.readLiveDraftGraphData()
    if (currentDraft && Array.isArray(currentDraft.nodes)) {
      const nextNodes = currentDraft.nodes.map(node => (
        String(node?.id || '').trim() === nodeId
          ? { ...node, properties: nextProps as never }
          : node
      ))
      args.commitDraftGraphDataUpdate(currentDraft, bumpStoryboardWidgetDraftGraphDataRevision({ ...currentDraft, nodes: nextNodes }))
    }
    args.updateNode(nodeId, { properties: nextProps as never })
    args.scheduleWorkflowOutputEdgeRefresh()
  }

  const restoreLegacyImageToThreeJsInputProjection = (anchorNode: GraphNode): void => {
    const anchorNodeId = String(anchorNode.id || '').trim()
    if (!anchorNodeId) return
    const ownedOutputRunInput = resolveImageToThreeJsOwnedOutputPanelRunInput(anchorNode)
    restoreLegacyImageToThreeJsOutput({ nodeId: anchorNodeId, forceImageTab: false, ownedOutputRunInput })

    const connectedNodeIds = new Set<string>()
    const graphCandidates = [args.graphForRun, args.readLiveDraftGraphData()]
    for (const graphData of graphCandidates) {
      for (const edge of graphData?.edges || []) {
        const endpoints = readGraphEdgeEndpoints(edge)
        if (endpoints.src === anchorNodeId && endpoints.tgt) connectedNodeIds.add(endpoints.tgt)
        if (endpoints.tgt === anchorNodeId && endpoints.src) connectedNodeIds.add(endpoints.src)
      }
    }
    for (const connectedNodeId of connectedNodeIds) {
      const connectedNode = resolveLiveNode(connectedNodeId)
      if (String(connectedNode?.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) continue
      const properties = (connectedNode?.properties || {}) as Record<string, unknown>
      if (isImageToThreeJsOutputPanel(properties)) continue
      restoreLegacyImageToThreeJsOutput({ nodeId: connectedNodeId, forceImageTab: true })
    }
  }

  const resolveImageToThreeJsOwnedOutputPanelRunInput: StoryboardWidgetImageToThreeJsOutputInputResolver = anchorNode => {
    const anchorNodeId = String(anchorNode.id || '').trim()
    if (!anchorNodeId) return null
    const graphs = [args.readLiveDraftGraphData(), args.graphForRun]
    const visitedNodeIds = new Set<string>()
    for (const graph of graphs) {
      for (const node of graph?.nodes || []) {
        const nodeId = String(node?.id || '').trim()
        if (!nodeId || visitedNodeIds.has(nodeId)) continue
        visitedNodeIds.add(nodeId)
        if (String(node?.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) continue
        const properties = (node.properties || {}) as Record<string, unknown>
        if (!isImageToThreeJsOutputPanel(properties)) continue
        if (readWorkflowString(properties[IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY]) !== anchorNodeId) continue
        const runInput = resolveImageToThreeJsOutputPanelRunInput(properties)
        if (runInput) return runInput
      }
    }
    return null
  }

  const publishTextRunOutputToRichMediaPanel: StoryboardWidgetTextRunOutputPublisher = panelArgs => {
    return args.withRunLayoutMutationGuard(() => {
      const outputKey = panelArgs.outputKey?.trim() || 'output'
      const outputIndex = typeof panelArgs.outputIndex === 'number' && Number.isFinite(panelArgs.outputIndex)
        ? Math.max(0, Math.floor(panelArgs.outputIndex))
        : 0
      const outputCount = typeof panelArgs.outputCount === 'number' && Number.isFinite(panelArgs.outputCount)
        ? Math.max(outputIndex + 1, Math.floor(panelArgs.outputCount))
        : outputIndex + 1
      const plannedMaterializationPosition = resolveMaterializationPosition(
        outputIndex,
        outputCount,
        panelArgs.materializationPosition,
      )
      const liveDraftGraphData = args.readLiveDraftGraphData()
      const baseGraphData = panelArgs.baseGraphData || liveDraftGraphData
      const publicationGraphData = buildStoryboardWidgetTextPublicationGraph({
        context: args.context,
        baseGraphData,
        liveDraftGraphData,
        anchorNodeId: readWorkflowString(panelArgs.anchorNode.id),
        outputKey,
        outputThreadRootId: panelArgs.outputThreadRootId,
      })
      const transaction = createStoryboardWidgetWorkflowPublicationTransaction({
        readLiveDraftGraphData: () => publicationGraphData,
        commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
        commitPublishedGraphData: args.commitPublishedGraphData,
        updateNode: args.updateNode,
        appendWorkflowOutputEdge: args.appendWorkflowOutputEdge,
        scheduleWorkflowOutputEdgeRefresh: args.scheduleWorkflowOutputEdgeRefresh,
      })
      if (!transaction) return null
      const projectionTargets = resolveStoryboardWidgetTextProjectionTargets({
        anchorNode: panelArgs.anchorNode,
        graphData: publicationGraphData,
        resolveNodeById: args.resolveNodeByIdAcrossGraphs,
      })
      const explicitPanelNodeIds = panelArgs.ownedOutputOnly === true
        ? []
        : projectionTargets.explicitPanelNodeIds
      const suppressOwnedOutputFallback = panelArgs.suppressOwnedOutputFallback === true
        || (panelArgs.ownedOutputOnly !== true && projectionTargets.hasExplicitWidgetTarget)
      const createdPanelNodeId = explicitPanelNodeIds.length > 0 ? null : ensureStoryboardWidgetWorkflowRichMediaPanelNodeId({
        context: args.context, graphForRun: args.graphForRun,
        allowCreateRichMediaPanel: !suppressOwnedOutputFallback
          && (args.allowCreateRichMediaPanel || panelArgs.allowCreateStandaloneOutput === true),
        anchorNode: panelArgs.anchorNode, readLiveDraftGraphData: transaction.readDraftGraphData, outputKey,
        outputGroupId: panelArgs.outputGroupId, outputThreadRootId: panelArgs.outputThreadRootId,
        outputLabel: panelArgs.panelLabel, outputIndex: panelArgs.outputIndex,
        materializationPosition: plannedMaterializationPosition,
        appendDraftNode: transaction.appendDraftNode,
      })
      const panelNodeIds = explicitPanelNodeIds.length > 0 ? explicitPanelNodeIds : createdPanelNodeId ? [createdPanelNodeId] : []
      if (panelNodeIds.length === 0) return null
      if (explicitPanelNodeIds.length === 0) {
        for (const panelNodeId of panelNodeIds) {
          normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement({
            anchorNode: panelArgs.anchorNode,
            panelNodeId,
            outputIndex: panelArgs.outputIndex,
            anchorPositionOverride: args.executionAnchor?.world,
            panelPositionOverride: plannedMaterializationPosition,
            forcePanelPosition: panelArgs.materializationPosition != null,
            readLiveDraftGraphData: transaction.readDraftGraphData,
            commitDraftGraphDataUpdate: transaction.commitDraftGraphDataUpdate,
          })
        }
      }
      const textOutputPatch = buildTextWidgetOutputPatch({
        output: String(panelArgs.outputText || ''),
        title: panelArgs.title,
        model: panelArgs.model,
        outputPath: panelArgs.outputPath,
        materializeSrcDoc: false,
      })
      const basePatch: Record<string, unknown> = {
        ...(explicitPanelNodeIds.length === 0 && !panelArgs.srcDoc
          ? { markdownWorkspaceViewerSurface: true }
          : {}),
        ...(panelArgs.panelProperties || {}),
        ...(panelArgs.materializationPosition
          ? buildStoryboardWidgetRunMaterializationLayoutProperties()
          : {}),
        ...clearRichMediaOutputProperties({}),
        ...textOutputPatch,
        outputSrcDoc: panelArgs.srcDoc ? panelArgs.srcDoc : undefined,
        richMediaActiveTab: panelArgs.srcDoc ? 'auto' : 'text',
        selectedOutputVersionId: undefined,
        outputLoading: panelArgs.loading === true ? true : undefined,
        outputLoadingKind: panelArgs.loading === true ? 'text' : undefined,
        outputLoadingLabel: panelArgs.loading === true && panelArgs.loadingLabel?.trim() ? panelArgs.loadingLabel.trim() : undefined,
        lastRunAt: panelArgs.loading === true ? new Date().toISOString() : undefined,
        outputSourceUrl: typeof panelArgs.sourceUrl === 'string' && panelArgs.sourceUrl.trim() ? panelArgs.sourceUrl.trim() : undefined,
        ...(explicitPanelNodeIds.length > 0 ? {
          workflowOutputAnchorNodeId: undefined, workflowOutputKey: undefined,
          workflowOutputGroupId: undefined, [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: undefined,
        } : {
          workflowOutputAnchorNodeId: readWorkflowString(panelArgs.anchorNode.id), workflowOutputKey: outputKey,
          ...(panelArgs.outputGroupId?.trim() ? { workflowOutputGroupId: panelArgs.outputGroupId.trim() } : {}),
          [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: panelArgs.connectCreatedOutputToAnchor === true
            ? undefined
            : WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
        }),
      }
      for (const panelNodeId of panelNodeIds) {
        const existingPanelProps = readPanelProperties(panelNodeId)
        const streamVersionId = panelArgs.loading === true ? panelArgs.versionId?.trim() : ''
        const patch = panelArgs.loading === true && !streamVersionId
          ? { ...basePatch, ...buildRichMediaTextOutputBaselinePatch(existingPanelProps) }
          : {
              ...basePatch,
              ...buildRichMediaTextOutputVersionPatch({
                properties: existingPanelProps,
                output: String(panelArgs.outputText || ''),
                outputMimeType: textOutputPatch.outputMimeType,
                outputModel: textOutputPatch.outputModel,
                outputPath: textOutputPatch.outputPath,
                versionId: panelArgs.versionId,
                createdAt: panelArgs.versionCreatedAt || readWorkflowString(textOutputPatch.lastRunAt),
              }),
            }
        applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch({
          panelNodeId, patch, readLiveDraftGraphData: transaction.readDraftGraphData,
          commitDraftGraphDataUpdate: transaction.commitDraftGraphDataUpdate, scheduleWorkflowOutputEdgeRefresh: () => undefined,
        })
      }
      if (explicitPanelNodeIds.length === 0 && panelArgs.connectCreatedOutputToAnchor === true) {
        for (const panelNodeId of panelNodeIds) ensureStoryboardWidgetWorkflowOutputEdge({
          anchorNodeId: readWorkflowString(panelArgs.anchorNode.id),
          panelNodeId,
          outputKey,
          readLiveDraftGraphData: transaction.readDraftGraphData,
          commitDraftGraphDataUpdate: transaction.commitDraftGraphDataUpdate,
          scheduleWorkflowOutputEdgeRefresh: () => undefined,
        })
      }
      const materializationChildNodeIds = Array.from(new Set(
        (panelArgs.materializationChildNodeIds || [])
          .map(nodeId => readWorkflowString(nodeId))
          .filter(Boolean),
      ))
      if (panelNodeIds.length === 1 && materializationChildNodeIds.length > 0) {
        const currentDraft = transaction.readDraftGraphData()
        let nextDraft = applyWorkflowMaterializationProjectionParent({
          graphData: currentDraft,
          semanticParentNodeId: readWorkflowString(panelArgs.anchorNode.id),
          projectionParentNodeId: panelNodeIds[0]!,
          childNodeIds: materializationChildNodeIds,
        })
        if (createdPanelNodeId) {
          nextDraft = applyWorkflowMaterializationGroupPanel({
            graphData: nextDraft,
            projectionParentNodeId: createdPanelNodeId,
            childNodeIds: materializationChildNodeIds,
            outputGroupId: panelArgs.outputGroupId,
            groupLabel: `${panelArgs.panelLabel?.trim() || panelArgs.title?.trim() || 'Generated'} outputs`,
          })
        }
        if (nextDraft !== currentDraft) {
          transaction.commitDraftGraphDataUpdate(currentDraft, nextDraft)
        }
      }
      const finished = transaction.finish({
        preferPublishedGraphCommit: panelArgs.deferPublishedGraphCommit !== true
          && panelArgs.loading !== true,
        updatedNodeIds: [...panelNodeIds, ...materializationChildNodeIds],
      })
      return finished ? transaction.readDraftGraphData() : null
    })
  }

  const publishMediaRunOutputToRichMediaPanel: StoryboardWidgetMediaRunOutputPublisher = panelArgs => {
    args.withRunLayoutMutationGuard(() => {
      const downstreamPanelTargetIds = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({
        node: panelArgs.anchorNode,
        graphData: args.graphForRun,
      }).filter(targetId => isRichMediaOutputTargetNode(args.resolveNodeByIdAcrossGraphs(targetId)))
      const panelNodeIds = downstreamPanelTargetIds.length > 0
        ? downstreamPanelTargetIds
        : [ensureStoryboardWidgetWorkflowRichMediaPanelNodeId({
          context: args.context,
          graphForRun: args.graphForRun,
          allowCreateRichMediaPanel: args.allowCreateRichMediaPanel,
          anchorNode: panelArgs.anchorNode,
          readLiveDraftGraphData: args.readLiveDraftGraphData,
          materializationPosition: resolveMaterializationPosition(),
          appendDraftNode: args.appendDraftNode,
        })].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      for (const panelNodeId of panelNodeIds) {
        ensureStoryboardWidgetWorkflowOutputEdge({
          anchorNodeId: readWorkflowString(panelArgs.anchorNode.id),
          panelNodeId,
          readLiveDraftGraphData: args.readLiveDraftGraphData,
          commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
          scheduleWorkflowOutputEdgeRefresh: args.scheduleWorkflowOutputEdgeRefresh,
        })
        const existingPanelBeforePatchProps = readPanelProperties(panelNodeId)
        const rawPatch = {
          ...panelArgs.patch,
          richMediaActiveTab: resolveMediaPatchActiveTab({
            existingActiveTab: existingPanelBeforePatchProps.richMediaActiveTab,
            patch: panelArgs.patch,
          }),
        }
        const patch = stabilizeHtmlVideoPreviewPatchForExistingProps(existingPanelBeforePatchProps, rawPatch)
        applyPublishedPanelPatch(panelNodeId, patch, existingPanelBeforePatchProps)
      }
    })
  }

  const publishImageDerivedOutputToRichMediaPanel = (params: {
    panelArgs: { anchorNode: GraphNode; patch: Record<string, unknown> }
    ensureOutputEdge: (edgeArgs: {
      anchorNode: GraphNode
      outputPanelNodeId: string
      readLiveDraftGraphData: () => GraphData | null
      commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
      scheduleWorkflowOutputEdgeRefresh: () => void
    }) => GraphEdge | null
    ensureOutputPanelNodeId: (panelArgs: {
      context: StoryboardWidgetWorkflowNodeResolutionContext
      graphForRun: GraphData | null
      allowCreateRichMediaPanel: boolean
      anchorNode: GraphNode
      readLiveDraftGraphData: () => GraphData | null
      appendDraftNode: (nodeArgs: {
        id?: string | null
        type: string
        label?: string | null
        x: number
        y: number
        properties?: Record<string, unknown>
      }) => string
    }) => string | null
    onPublished?: (anchorNode: GraphNode) => void
  }): void => {
    args.withRunLayoutMutationGuard(() => {
      const transaction = createStoryboardWidgetWorkflowPublicationTransaction({
        readLiveDraftGraphData: args.readLiveDraftGraphData,
        commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
        commitPublishedGraphData: args.commitPublishedGraphData,
        updateNode: args.updateNode,
        appendWorkflowOutputEdge: args.appendWorkflowOutputEdge,
        scheduleWorkflowOutputEdgeRefresh: args.scheduleWorkflowOutputEdgeRefresh,
      })
      if (!transaction) return
      const panelNodeId = params.ensureOutputPanelNodeId({
        context: args.context,
        graphForRun: args.graphForRun,
        allowCreateRichMediaPanel: args.allowCreateRichMediaPanel,
        anchorNode: params.panelArgs.anchorNode,
        readLiveDraftGraphData: transaction.readDraftGraphData,
        appendDraftNode: transaction.appendDraftNode,
      })
      if (!panelNodeId) return
      const existingPanelBeforePatch = transaction.readDraftGraphData().nodes.find(node => String(node?.id || '').trim() === panelNodeId) || null
      const existingPanelBeforePatchProps = (existingPanelBeforePatch?.properties || {}) as Record<string, unknown>
      const rawPatch = {
        ...params.panelArgs.patch,
        richMediaActiveTab: resolveMediaPatchActiveTab({
          existingActiveTab: existingPanelBeforePatchProps.richMediaActiveTab,
          patch: params.panelArgs.patch,
        }),
      }
      const patch = stabilizeHtmlVideoPreviewPatchForExistingProps(existingPanelBeforePatchProps, rawPatch)
      applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch({
        panelNodeId,
        patch,
        readLiveDraftGraphData: transaction.readDraftGraphData,
        commitDraftGraphDataUpdate: transaction.commitDraftGraphDataUpdate,
        scheduleWorkflowOutputEdgeRefresh: () => undefined,
      })
      const outputEdge = params.ensureOutputEdge({
        anchorNode: params.panelArgs.anchorNode,
        outputPanelNodeId: panelNodeId,
        readLiveDraftGraphData: transaction.readDraftGraphData,
        commitDraftGraphDataUpdate: transaction.commitDraftGraphDataUpdate,
        scheduleWorkflowOutputEdgeRefresh: () => undefined,
      })
      transaction.finish({
        preferPublishedGraphCommit: true,
        updatedNodeIds: [panelNodeId],
        appendedEdges: outputEdge ? [outputEdge] : [],
      })
      params.onPublished?.(params.panelArgs.anchorNode)
    })
  }

  const publishImageToThreeJsRunOutputToRichMediaPanel: StoryboardWidgetImageToThreeJsRunOutputPublisher = panelArgs => {
    publishImageDerivedOutputToRichMediaPanel({
      panelArgs,
      ensureOutputPanelNodeId: ensureStoryboardWidgetImageToThreeJsOutputPanelNodeId,
      ensureOutputEdge: ensureStoryboardWidgetImageToThreeJsOutputEdge,
      onPublished: restoreLegacyImageToThreeJsInputProjection,
    })
  }

  const publishImageToGlbRunOutputToRichMediaPanel: StoryboardWidgetImageToGlbRunOutputPublisher = panelArgs => {
    publishImageDerivedOutputToRichMediaPanel({
      panelArgs,
      ensureOutputPanelNodeId: ensureStoryboardWidgetImageToGlbOutputPanelNodeId,
      ensureOutputEdge: ensureStoryboardWidgetImageToGlbOutputEdge,
    })
  }

  const publishAnnotationRunOutputToRichMediaPanel: StoryboardWidgetAnnotationRunOutputPublisher =
    createStoryboardWidgetAnnotationRunOutputPublisher({
      context: args.context,
      graphForRun: args.graphForRun,
      allowCreateRichMediaPanel: args.allowCreateRichMediaPanel,
      withRunLayoutMutationGuard: args.withRunLayoutMutationGuard,
      readLiveDraftGraphData: args.readLiveDraftGraphData,
      appendDraftNode: args.appendDraftNode,
      commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
      scheduleWorkflowOutputEdgeRefresh: args.scheduleWorkflowOutputEdgeRefresh,
      resolveNodeByIdAcrossGraphs: args.resolveNodeByIdAcrossGraphs,
      resolveMaterializationPosition,
      applyPublishedPanelPatch,
    })

  return {
    publishTextRunOutputToRichMediaPanel,
    publishMediaRunOutputToRichMediaPanel,
    publishImageToThreeJsRunOutputToRichMediaPanel,
    publishImageToGlbRunOutputToRichMediaPanel,
    restoreImageToThreeJsInputProjection: restoreLegacyImageToThreeJsInputProjection,
    resolveImageToThreeJsOwnedOutputPanelRunInput,
    publishAnnotationRunOutputToRichMediaPanel,
  }
}
