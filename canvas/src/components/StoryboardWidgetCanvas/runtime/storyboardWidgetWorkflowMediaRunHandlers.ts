import { unwrapKeyTypeValue } from '@/lib/graph/keyTypeValue'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { getChatDefaultEndpointUrlForProvider, normalizeChatProviderId } from '@/lib/chatEndpoint'
import { UI_COPY, FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID, FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID } from '@/lib/config'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { buildRichMediaWidgetOutputPatch, clearRichMediaOutputProperties, resolveRichMediaWidgetKind, runRichMediaWidgetGeneration } from '@/features/chat/richMediaRun'
import { createHtmlVideoEngineRegistryFromRuntimeConfig } from '@/features/html-video-renderer/htmlVideoEngineRegistry'
import { buildHtmlVideoPreviewSrcDocFromNode, runHtmlVideoFlowNode } from '@/features/html-video-renderer/htmlVideoFlowNode'
import { runAnnotationFlowNode, toAnnotationPreviewSrcDoc } from '@/features/visual-annotation-engine'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import {
  buildImageToThreeJsConversion,
  resolveImageToThreeJsRunInput,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import { resolveImageToGlbRunInput } from '@/features/image-to-glb/imageToGlbContract'
import { hasProceduralAssetRunInvocation, resolveProceduralAssetRunInput } from '@/features/image-to-glb/proceduralAssetWorkflowContract'
import { runProceduralAssetWorkflow, type ProceduralAssetWorkflowContext } from '@/features/image-to-glb/proceduralAssetWorkflow'
import type { ProceduralAssetOutputPublisher } from '@/features/image-to-glb/proceduralAssetPanelPublication'
import {
  generateReviewedImageToGlbScene,
  type ReviewedImageToGlbScene,
} from '@/features/image-to-glb/imageToGlbSceneFactory'
import {
  blobToDataUrl,
  persistImageToGlbArtifacts,
} from '@/features/image-to-glb/imageToGlbArtifactPipeline'
import { exportImageToGlbRuntimeArtifacts } from '@/features/image-to-glb/imageToGlbRuntimeExport'
import { resolveStoryboardWidgetWorkflowConnectedValuesInput } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunInputs'
import {
  stabilizeHtmlVideoPreviewPatchForExistingProps,
  type StoryboardWidgetAnnotationRunOutputPublisher,
  type StoryboardWidgetImageToThreeJsInputRecovery,
  type StoryboardWidgetImageToThreeJsOutputInputResolver,
  type StoryboardWidgetImageToThreeJsRunOutputPublisher,
  type StoryboardWidgetImageToGlbRunOutputPublisher,
  type StoryboardWidgetMediaRunOutputPublisher,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'

const readWorkflowString = (value: unknown): string => {
  const scalar = unwrapKeyTypeValue(value)
  return typeof scalar === 'string' ? scalar.trim() : ''
}

type WorkflowOutputUpdater = (buildPatch: (nodeProps: Record<string, unknown>) => Record<string, unknown>) => void

type WorkflowLoadingStateSetter = (args: {
  loading: boolean
  kind?: 'text' | 'image' | 'video' | 'audio'
}) => void

type WorkflowToastPublisher = (args: {
  id: string
  kind: 'neutral' | 'warning' | 'success' | 'error'
  message: string
  ttlMs?: number
}) => void

export async function runStoryboardWidgetMediaWorkflowNode(args: {
  id: string
  node: GraphNode
  rawNodeProperties: Record<string, unknown>
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData
  writableNodeId: string
  widgetRegistry: WidgetRegistryEntry[]
  activeWorkspacePath: string
  generationRuntime: {
    chatProvider: string
    chatAuthMode: string
    chatApiKey: string
    chatEndpointUrl: string
    chatModel: string
    markdownDocumentText: string
  }
  updateRunOutputForKnownNodeIds: WorkflowOutputUpdater
  setRunLoadingStateForKnownNodeIds: WorkflowLoadingStateSetter
  publishMediaRunOutputToRichMediaPanel: StoryboardWidgetMediaRunOutputPublisher
  publishImageToThreeJsRunOutputToRichMediaPanel: StoryboardWidgetImageToThreeJsRunOutputPublisher
  publishImageToGlbRunOutputToRichMediaPanel?: StoryboardWidgetImageToGlbRunOutputPublisher
  publishProceduralAssetRunOutputToRichMediaPanel?: ProceduralAssetOutputPublisher
  proceduralContext?: ProceduralAssetWorkflowContext
  generateImageToGlbScene?: (args: { sourceUrl: string }) => Promise<ReviewedImageToGlbScene>
  restoreImageToThreeJsInputProjection?: StoryboardWidgetImageToThreeJsInputRecovery
  resolveImageToThreeJsOwnedOutputPanelRunInput?: StoryboardWidgetImageToThreeJsOutputInputResolver
  publishAnnotationRunOutputToRichMediaPanel: StoryboardWidgetAnnotationRunOutputPublisher
  upsertUiToast: WorkflowToastPublisher
  propagateErrors?: boolean
  requireDurableMediaPersistence?: boolean
}): Promise<boolean> {
  if (String(args.node.type || '').trim() === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID) {
    try {
      const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
        context: args.context,
        graphForRun: args.graphForRun,
        writableNodeId: args.writableNodeId,
        registry: args.widgetRegistry,
      })
      const connectedValuesBySchemaPath = connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId)
      const readConnectedHtmlVideoProperty = (schemaPath: string, propertyKey: string): unknown => {
        const connected = connectedValuesBySchemaPath?.[schemaPath]?.value
        return typeof connected === 'undefined' || connected === null ? args.rawNodeProperties[propertyKey] : connected
      }
      const htmlVideoNode = {
        ...args.node,
        properties: {
          ...args.rawNodeProperties,
          html: readConnectedHtmlVideoProperty('properties.html', 'html'),
          css: readConnectedHtmlVideoProperty('properties.css', 'css'),
          data_json: readConnectedHtmlVideoProperty('properties.data_json', 'data_json'),
          duration_ms: readConnectedHtmlVideoProperty('properties.duration_ms', 'duration_ms'),
          fps: readConnectedHtmlVideoProperty('properties.fps', 'fps'),
          width: readConnectedHtmlVideoProperty('properties.width', 'width'),
          height: readConnectedHtmlVideoProperty('properties.height', 'height'),
          engine_hint: readConnectedHtmlVideoProperty('properties.engine_hint', 'engine_hint'),
        } as never,
      }
      const result = await runHtmlVideoFlowNode({
        node: htmlVideoNode,
        registry: createHtmlVideoEngineRegistryFromRuntimeConfig(),
        workspacePath: args.activeWorkspacePath || null,
        fs: await getWorkspaceFs(),
      })
      if (result.ok === false) {
        const outputSrcDoc = buildHtmlVideoPreviewSrcDocFromNode(htmlVideoNode)
        if (outputSrcDoc.trim()) {
          const previewPatch = {
            output: result.reason || 'HTML video encoder unavailable; rendered inline HTML preview.',
            outputSrcDoc,
            outputMimeType: 'text/html; charset=utf-8',
            outputModel: String(result.engineId || args.rawNodeProperties.engine_hint || 'html-video-preview').trim(),
            renderErrorCode: result.errorCode,
            renderErrorReason: result.reason,
            richMediaActiveTab: 'auto',
            lastRunAt: new Date().toISOString(),
          }
          args.updateRunOutputForKnownNodeIds(nodeProps => ({
            ...clearRichMediaOutputProperties(nodeProps),
            ...stabilizeHtmlVideoPreviewPatchForExistingProps(nodeProps, previewPatch),
          }))
          args.publishMediaRunOutputToRichMediaPanel({ anchorNode: args.node, patch: previewPatch })
        }
        args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'warning', message: result.reason || UI_COPY.storyboardWidgetRunFailedToast, ttlMs: 3200 })
        return true
      }
      const renderUrl = result.outputStorageUrl || (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(result.blob) : '')
      const outputSrcDoc = buildHtmlVideoPreviewSrcDocFromNode(htmlVideoNode)
      const outputPatch = {
        ...buildRichMediaWidgetOutputPatch({
          kind: 'video',
          asset: {
            blob: result.blob,
            renderUrl,
            model: result.engineId,
          },
          outputPath: result.outputPath,
          outputManifestPath: result.outputManifestPath,
        }),
        ...(outputSrcDoc.trim() ? { outputSrcDoc } : null),
        renderJobId: result.renderJobId,
        engineId: result.engineId,
        richMediaActiveTab: 'video',
      }
      args.updateRunOutputForKnownNodeIds(nodeProps => ({
        ...clearRichMediaOutputProperties(nodeProps),
        ...outputPatch,
      }))
      args.publishMediaRunOutputToRichMediaPanel({ anchorNode: args.node, patch: outputPatch })
      const generatedName = result.outputPath ? result.outputPath.split('/').pop() : 'HTML video output'
      args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'neutral', message: `Generated ${generatedName}.`, ttlMs: 2400 })
    } finally {
      args.setRunLoadingStateForKnownNodeIds({ loading: false })
    }
    return true
  }

  if (readWorkflowString(args.node.type) === FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID) {
    args.setRunLoadingStateForKnownNodeIds({ loading: true, kind: 'text' })
    try {
      const result = await runAnnotationFlowNode({
        node: args.node,
        workspacePath: args.activeWorkspacePath || null,
        fs: await getWorkspaceFs(),
      })
      args.publishAnnotationRunOutputToRichMediaPanel({ anchorNode: args.node, result })
      if (result.ok === true) {
        const annotationJson = JSON.stringify(result, null, 2)
        args.updateRunOutputForKnownNodeIds(nodeProps => ({
          ...nodeProps,
          annotationId: result.annotationId,
          annotationSchemaVersion: result.schemaVersion,
          annotation_json: annotationJson,
          outputPath: result.outputPath || undefined,
          outputManifestPath: result.outputManifestPath || undefined,
          output: annotationJson,
          outputSrcDoc: toAnnotationPreviewSrcDoc(result),
          lastRunAt: new Date().toISOString(),
        }))
        args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'neutral', message: 'Generated annotation JSON.', ttlMs: 2400 })
      } else {
        args.updateRunOutputForKnownNodeIds(nodeProps => ({
          ...nodeProps,
          renderErrorCode: result.errorCode,
          renderErrorReason: result.reason,
          output: JSON.stringify(result, null, 2),
          lastRunAt: new Date().toISOString(),
        }))
        args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'warning', message: result.reason || result.errorCode, ttlMs: 3200 })
      }
    } finally {
      args.setRunLoadingStateForKnownNodeIds({ loading: false })
    }
    return true
  }

  const imageToThreeJsNode = {
    ...args.node,
    properties: args.rawNodeProperties as GraphNode['properties'],
  }
  const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
    context: args.context,
    graphForRun: args.graphForRun,
    writableNodeId: args.writableNodeId,
    registry: args.widgetRegistry,
  })
  if (hasProceduralAssetRunInvocation(args.rawNodeProperties)) {
    try {
      const input = resolveProceduralAssetRunInput({ node: imageToThreeJsNode, connectedValuesBySchemaPath: connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId) })!
      const publish = args.publishProceduralAssetRunOutputToRichMediaPanel
      const context = args.proceduralContext
      if (!context || !publish) throw new Error('Procedural asset creation requires the active source document and output publisher')
      await runProceduralAssetWorkflow({ node: args.node, input, fs: await getWorkspaceFs(), context, publish })
      args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'success', message: 'Created an editable native asset. Open its properties to adjust geometry and export.', ttlMs: 3200 })
    } catch (error) {
      if (args.propagateErrors) throw error
      args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'error', message: error instanceof Error ? error.message : 'Procedural asset creation failed.', ttlMs: 4200 })
    }
    return true
  }
  const imageToGlbRunInput = resolveImageToGlbRunInput({
    node: imageToThreeJsNode,
    connectedValuesBySchemaPath: connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId),
  })
  if (imageToGlbRunInput) {
    if (!imageToGlbRunInput.sourceUrl) {
      args.upsertUiToast({
        id: `storyboard-widget-run-${args.id}`,
        kind: 'warning',
        message: 'Image to GLB requires a PNG, JPG, or SVG source URL.',
        ttlMs: 3200,
      })
      return true
    }
    try {
      const publishImageToGlbOutput = args.publishImageToGlbRunOutputToRichMediaPanel
      if (!publishImageToGlbOutput) {
        throw new Error('Image to GLB output publication is unavailable in this canvas runtime.')
      }
      const reconstruction = await (args.generateImageToGlbScene || generateReviewedImageToGlbScene)({
        sourceUrl: imageToGlbRunInput.sourceUrl,
      })
      const { analysis, job, scene } = reconstruction
      const artifacts = await exportImageToGlbRuntimeArtifacts({
        job,
        scene,
        artifactStem: `${args.node.label || args.node.id || 'image-to-glb'}-procedural`,
      })
      const glbDataUrl = await blobToDataUrl(artifacts.glb.blob)
      const paths = await persistImageToGlbArtifacts({
        artifactStem: artifacts.glb.fileName.replace(/\.glb$/i, ''),
        artifacts,
        workspacePath: args.activeWorkspacePath || null,
      })
      const outputPatch = {
        media_kind: 'model',
        mediaKind: 'model',
        media_url: glbDataUrl,
        mediaUrl: glbDataUrl,
        media: glbDataUrl,
        model: glbDataUrl,
        modelUrl: glbDataUrl,
        media_interactive: true,
        imageGlbDataUrl: glbDataUrl,
        imageGlbJob: job,
        imageGlbProceduralProgram: job.program,
        imageGlbVisionReviewPasses: job.visionReviewPasses,
        imageGlbReferenceAnalysis: analysis,
        imageGlbGlbInspection: artifacts.glb.inspection,
        imageGlbEditableGltfInspection: artifacts.gltf.inspection,
        imageGlbEditableGltf: artifacts.gltf.text,
        imageGlbExternalBufferCount: artifacts.gltf.externalBuffers.length,
        imageGlbInvocation: {
          kind: imageToGlbRunInput.invocation,
          tokens: imageToGlbRunInput.invocationTokens,
        },
        output: JSON.stringify({
          schema: job.schema,
          source: job.source,
          proceduralProgramPath: paths.proceduralProgramPath,
          reviewLedgerPath: paths.reviewLedgerPath,
          gltfPath: paths.gltfPath,
          externalBufferPaths: paths.externalBufferPaths,
        }, null, 2),
        outputMimeType: artifacts.glb.mimeType,
        outputModel: 'native-procedural-threejs',
        outputSourceUrl: job.source.url,
        outputPath: paths.glbPath,
        outputManifestPath: paths.manifestPath,
        outputGltfPath: paths.gltfPath,
        outputExternalBufferPaths: paths.externalBufferPaths,
        richMediaActiveTab: 'model',
        lastRunAt: new Date().toISOString(),
      }
      publishImageToGlbOutput({ anchorNode: args.node, patch: outputPatch })
      args.upsertUiToast({
        id: `storyboard-widget-run-${args.id}`,
        kind: 'success',
        message: `Generated procedural GLB and editable external-buffer glTF from ${job.source.kind} input.`,
        ttlMs: 3000,
      })
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Image to GLB could not export the native procedural scene.'
      args.upsertUiToast({
        id: `storyboard-widget-run-${args.id}`,
        kind: 'error',
        message,
        ttlMs: 4200,
      })
    }
    return true
  }
  const imageToThreeJsRunInput = resolveImageToThreeJsRunInput({
    node: imageToThreeJsNode,
    connectedValuesBySchemaPath: connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId),
  }) || args.resolveImageToThreeJsOwnedOutputPanelRunInput?.(args.node)
  if (imageToThreeJsRunInput) {
    args.restoreImageToThreeJsInputProjection?.(args.node)
    const result = buildImageToThreeJsConversion(imageToThreeJsRunInput.sourceUrl)
    if (result.ok === false) {
      args.upsertUiToast({
        id: `storyboard-widget-run-${args.id}`,
        kind: 'warning',
        message: result.reason,
        ttlMs: 3200,
      })
      return true
    }
    const outputPatch = {
      ...result.patch,
      imageThreeJsInvocation: {
        kind: imageToThreeJsRunInput.invocation,
        tokens: imageToThreeJsRunInput.invocationTokens,
      },
    }
    args.publishImageToThreeJsRunOutputToRichMediaPanel({ anchorNode: args.node, patch: outputPatch })
    args.upsertUiToast({
      id: `storyboard-widget-run-${args.id}`,
      kind: 'success',
      message: `${imageToThreeJsRunInput.invocation === 'inline-command' ? 'Ran inline image.to-threejs:' : 'Converted'} ${result.manifest.source.extension.toUpperCase()} to a Three.js ${result.manifest.render.primitive}.`,
      ttlMs: 2600,
    })
    return true
  }

  const richMediaKind = resolveRichMediaWidgetKind(args.node)
  if (!richMediaKind || richMediaKind === 'annotation') return false
  args.setRunLoadingStateForKnownNodeIds({ loading: true, kind: richMediaKind })
  try {
    const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
      context: args.context,
      graphForRun: args.graphForRun,
      writableNodeId: args.writableNodeId,
      registry: args.widgetRegistry,
    })
    const normalizedProvider = normalizeChatProviderId(args.generationRuntime.chatProvider)
    const runProvider = normalizedProvider || args.generationRuntime.chatProvider
    const runAuthMode = args.generationRuntime.chatAuthMode === 'byok' ? 'byok' : 'serverManaged'
    const runApiKey = runAuthMode === 'byok' ? args.generationRuntime.chatApiKey : ''
    const runEndpointUrl = args.generationRuntime.chatEndpointUrl.trim() || getChatDefaultEndpointUrlForProvider(runProvider)
    const richMediaResult = await runRichMediaWidgetGeneration({
      node: args.node,
      connectedValuesBySchemaPath: connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId),
      markdownDocumentText: args.generationRuntime.markdownDocumentText,
      workspacePath: args.activeWorkspacePath || null,
      generationConfig: { provider: runProvider, endpointUrl: runEndpointUrl, apiKey: runApiKey, chatModel: args.generationRuntime.chatModel },
    })
    if (!richMediaResult) {
      if (args.propagateErrors) throw new Error(UI_COPY.storyboardWidgetRunFailedToast)
      args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'neutral', message: UI_COPY.storyboardWidgetRunFailedToast, ttlMs: 2600 })
      return true
    }
    if (args.requireDurableMediaPersistence && !richMediaResult.outputStorageUrl) {
      throw new Error(`Generated ${richMediaResult.kind} output, but durable Media registration did not confirm R2/D1 persistence.`)
    }
    const outputPatch = buildRichMediaWidgetOutputPatch({ kind: richMediaResult.kind, asset: richMediaResult.asset, hasAudioTrack: richMediaResult.hasAudioTrack, outputPath: richMediaResult.outputPath, outputManifestPath: richMediaResult.outputManifestPath })
    args.updateRunOutputForKnownNodeIds(nodeProps => ({ ...clearRichMediaOutputProperties(nodeProps), ...outputPatch }))
    args.publishMediaRunOutputToRichMediaPanel({ anchorNode: args.node, patch: outputPatch })
    const generatedName = richMediaResult.outputPath ? richMediaResult.outputPath.split('/').pop() : richMediaResult.kind === 'video' ? 'video output' : 'image output'
    args.upsertUiToast({ id: `storyboard-widget-run-${args.id}`, kind: 'neutral', message: `Generated ${generatedName}.`, ttlMs: 2400 })
  } finally {
    args.setRunLoadingStateForKnownNodeIds({ loading: false })
  }
  return true
}
