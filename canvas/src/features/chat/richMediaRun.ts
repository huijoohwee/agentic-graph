import { getObjectPath } from '@/lib/data/objectPath'
import type { GraphNode } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import {
  FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID,
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { isImageToThreeJsSkillNode } from '@/features/image-to-threejs/imageToThreeJsContract'
import { FLOW_WIDGET_FORM_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { downloadBlob, saveBlobWithPicker } from '@/lib/graph/save'
import type { GeneratedBinaryAsset, RunGenerationConfig } from './byteplusRunGeneration'
import { CHAT_PROVIDER_GEMINI, normalizeChatProviderId } from '@/lib/chatEndpoint'
import { generateRunImageWithBytePlus, generateRunVideoWithBytePlus } from './byteplusRunGeneration'
import { generateRunVideoWithGemini } from './geminiRunGeneration'
import { resolveWorkspaceSiblingArtifactPath, writeWorkspaceBlobArtifactAtPath, writeWorkspaceTextArtifactAtPath } from './chatHistoryWorkspace.output'
import { buildTextWidgetOutputSrcDoc } from '@/lib/render/widgetOutputSrcDoc'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import { buildGeneratedMediaManifestMarkdown, buildGeneratedMediaWorkspaceEntries, publishGeneratedTextToStorage, uploadRichMediaBinaryToStorage } from './richMediaRunStorage'
import { hasMediaAudioTrack } from './mediaAudioTrackProbe'
export type RichMediaWidgetKind = 'image' | 'video' | 'annotation'

export type RichMediaWidgetRunRequest = {
  kind: RichMediaWidgetKind
  prompt: string
  model?: string
  contentJson?: string
  size?: string
  outputFormat?: string
  responseFormat?: string
  optimizePromptOptions?: string
  stream?: boolean
  seed?: number
  guidanceScale?: number
  aspectRatio?: string | number
  ratio?: string
  resolution?: string
  duration?: number
  generateAudio?: boolean
  draft?: boolean
  cameraFixed?: boolean
  imageUrlUrl?: string
  watermark?: boolean
  referenceImageUrl?: string
  durationSeconds?: string
  personGeneration?: string
}

export type RichMediaWidgetRunResult = {
  kind: RichMediaWidgetKind
  asset: GeneratedBinaryAsset
  hasAudioTrack: boolean
  outputPath: string | null
  outputManifestPath: string | null
  outputStorageUrl?: string | null
}

const DEFAULT_IMAGE_PROMPT = 'Generate an image responsive to the active request.'
const DEFAULT_VIDEO_PROMPT = 'Generate a video responsive to the active request.'

const cleanString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

const cleanBool = (value: unknown): boolean | null => {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase()
    if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true
    if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false
  }
  return null
}

const cleanNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const sanitizeFileNameStem = (raw: string): string => {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const extractWorkspaceContext = (markdownText: string): string => {
  const raw = String(markdownText || '').replace(/^\uFEFF/, '')
  if (!raw.trim()) return ''
  const noFrontmatter = raw.trimStart().startsWith('---')
    ? raw.replace(/^\s*---[\s\S]*?\n---\s*/m, '')
    : raw
  const collapsed = noFrontmatter
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
  return collapsed.slice(0, 1200)
}

const readConnectedValue = (
  connectedValuesBySchemaPath: FlowConnectedValuesBySchemaPath | undefined,
  schemaPath: string,
): unknown => {
  if (!connectedValuesBySchemaPath) return undefined
  return connectedValuesBySchemaPath[schemaPath]?.value
}

const readNodeProperty = (node: GraphNode, schemaPath: string): unknown => {
  const root = {
    label: node.label,
    type: node.type,
    properties: (node.properties || {}) as Record<string, unknown>,
    metadata: (node.metadata || {}) as Record<string, unknown>,
  }
  return getObjectPath(root, schemaPath)
}
export const resolveRichMediaWidgetKind = (node: GraphNode | null | undefined): RichMediaWidgetKind | null => {
  if (!node) return null
  if (isImageToThreeJsSkillNode(node)) return 'image'
  const typeId = cleanString(node.type)
  if (typeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) return 'image'
  if (typeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) return 'video'
  if (typeId === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID) return 'video'
  if (typeId === FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID) return 'annotation'
  const formId = cleanString((node.properties || {})[FLOW_WIDGET_FORM_ID_KEY])
  if (formId === 'imageGeneration') return 'image'
  if (formId === 'videoGeneration') return 'video'
  return null
}
export const isRichMediaOutputTargetNode = (node: GraphNode | null | undefined): boolean => {
  if (!node) return false
  if (cleanString(node.type) === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return true
  return resolveRichMediaWidgetKind(node) === 'video'
}
export const clearRichMediaOutputProperties = (properties: Record<string, unknown> | null | undefined): Record<string, unknown> => {
  const next = { ...(properties || {}) }
  delete next.imageUrl
  delete next.videoUrl
  delete next.audioUrl
  delete next.image_url
  delete next.video_url
  delete next.audio_url
  delete next.image
  delete next.video
  delete next.audio
  delete next.mediaUrl
  delete next.media_url
  delete next.mediaKind
  delete next.media_kind
  delete next.outputPath
  delete next.outputManifestPath
  delete next.outputStorageUrl
  delete next.output
  delete next.outputMimeType
  delete next.outputModel
  delete next.outputSourceUrl
  delete next.outputSavedName
  delete next.mediaRenderMode
  delete next.imageThreeJsManifest
  delete next.imageThreeJsInvocation
  delete next.outputSrcDoc
  delete next.outputLoading
  delete next.outputLoadingKind; delete next.outputLoadingLabel; delete next.outputVersions; delete next.selectedOutputVersionId
  delete next.renderErrorCode
  delete next.renderErrorReason
  delete next.renderJobId
  delete next.lastRunAt
  return next
}

export const buildRichMediaWidgetOutputPatch = (args: {
  kind: RichMediaWidgetKind
  asset: GeneratedBinaryAsset
  hasAudioTrack?: boolean
  outputPath: string | null
  outputManifestPath?: string | null
}): Record<string, unknown> => {
  const isImage = args.kind === 'image'
  const isVideo = args.kind === 'video'
  return {
    imageUrl: isImage ? args.asset.renderUrl : undefined,
    videoUrl: isVideo ? args.asset.renderUrl : undefined,
    audioUrl: isVideo && args.hasAudioTrack === true ? args.asset.renderUrl : undefined,
    image_url: undefined,
    video_url: undefined,
    audio_url: undefined,
    image: undefined,
    video: undefined,
    audio: undefined,
    mediaUrl: undefined,
    media_url: undefined,
    mediaKind: undefined,
    media_kind: undefined,
    outputPath: args.outputPath || undefined,
    outputManifestPath: args.outputManifestPath || undefined,
    outputMimeType: cleanString(args.asset.blob.type) || undefined,
    outputModel: cleanString(args.asset.model) || undefined,
    outputSourceUrl: cleanString(args.asset.sourceUrl) || undefined,
    outputSavedName: args.outputPath ? args.outputPath.split('/').filter(Boolean).pop() || undefined : undefined,
    lastRunAt: new Date().toISOString(),
  }
}

export const buildTextWidgetOutputPatch = (args: {
  output: string
  title?: unknown
  model?: unknown
  outputPath?: string | null
  materializeSrcDoc?: boolean
}): Record<string, unknown> => {
  const output = String(args.output || '')
  const outputPath = cleanString(args.outputPath)
  return {
    output,
    outputPath: outputPath || undefined,
    outputMimeType: 'text/markdown; charset=utf-8',
    outputModel: cleanString(args.model) || undefined,
    outputSourceUrl: undefined,
    outputSavedName: outputPath ? outputPath.split('/').filter(Boolean).pop() || undefined : undefined,
    outputSrcDoc: args.materializeSrcDoc === true
      ? buildTextWidgetOutputSrcDoc({
        title: args.title,
        text: output,
      })
      : undefined,
    lastRunAt: new Date().toISOString(),
  }
}

export const buildRichMediaWidgetRunRequest = (args: {
  node: GraphNode
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  markdownDocumentText?: string | null
}): RichMediaWidgetRunRequest | null => {
  const kind = resolveRichMediaWidgetKind(args.node)
  if (!kind) return null
  const promptValue = cleanString(readNodeProperty(args.node, 'properties.prompt'))
    || cleanString(readConnectedValue(args.connectedValuesBySchemaPath, 'properties.prompt'))
  const contentJson = cleanString(readNodeProperty(args.node, 'properties.content_json'))
  const promptIsGeneric = promptValue === DEFAULT_IMAGE_PROMPT || promptValue === DEFAULT_VIDEO_PROMPT || !promptValue
  const workspaceContext = extractWorkspaceContext(String(args.markdownDocumentText || ''))
  const referenceImageUrl = cleanString(readNodeProperty(args.node, 'properties.reference_image'))
    || cleanString(readConnectedValue(args.connectedValuesBySchemaPath, 'properties.reference_image'))
  const size = cleanString(readNodeProperty(args.node, 'properties.size'))
  const outputFormat = cleanString(readNodeProperty(args.node, 'properties.output_format'))
  const responseFormat = cleanString(readNodeProperty(args.node, 'properties.response_format'))
  const optimizePromptOptions = cleanString(readNodeProperty(args.node, 'properties.optimize_prompt_options'))
  const stream = cleanBool(readNodeProperty(args.node, 'properties.stream'))
  const seed = cleanNumber(readNodeProperty(args.node, 'properties.seed'))
  const guidanceScale = cleanNumber(readNodeProperty(args.node, 'properties.guidance_scale'))
  const rawAspectRatio = readNodeProperty(args.node, 'properties.aspect_ratio')
  const aspectRatioNumber = cleanNumber(rawAspectRatio)
  const aspectRatio = typeof rawAspectRatio === 'string' ? cleanString(rawAspectRatio) : ''
  const ratio = cleanString(readNodeProperty(args.node, 'properties.ratio'))
  const resolution = cleanString(readNodeProperty(args.node, 'properties.resolution'))
  const model = cleanString(readNodeProperty(args.node, 'properties.model'))
  const duration = cleanNumber(readNodeProperty(args.node, 'properties.duration'))
  const generateAudio = cleanBool(readNodeProperty(args.node, 'properties.generate_audio'))
  const draft = cleanBool(readNodeProperty(args.node, 'properties.draft'))
  const cameraFixed = cleanBool(readNodeProperty(args.node, 'properties.camera_fixed'))
  const imageUrlUrl = cleanString(readNodeProperty(args.node, 'properties.image_url_url'))
  const watermark = cleanBool(readNodeProperty(args.node, 'properties.watermark'))
  const connectedContextLines = Object.entries(args.connectedValuesBySchemaPath || {})
    .filter(([schemaPath, rec]) => schemaPath !== 'properties.prompt' && schemaPath !== 'properties.reference_image' && rec)
    .slice(0, 8)
    .map(([schemaPath, rec]) => {
      const value = typeof rec.value === 'string' ? rec.value : JSON.stringify(rec.value)
      return `${schemaPath.replace(/^properties\./, '')}: ${String(value || '').slice(0, 240)}`
    })
  const promptSections = [
    `Create a single ${kind} deliverable that stays directly responsive to the current user request and connected workflow context.`,
    promptIsGeneric ? '' : `Primary request:\n${promptValue}`,
    workspaceContext ? `Workspace context:\n${workspaceContext}` : '',
    connectedContextLines.length ? `Connected inputs:\n- ${connectedContextLines.join('\n- ')}` : '',
    referenceImageUrl
      ? kind === 'video'
        ? `Use the connected reference image as the first-frame or style anchor: ${referenceImageUrl}`
        : `Use the connected reference image as a composition and style anchor: ${referenceImageUrl}`
      : '',
    kind === 'video'
      ? 'Keep motion coherent, visually specific, and production-ready. Avoid unrelated scene changes, decorative filler, or UI chrome unless requested.'
      : 'Keep the composition visually specific, presentation-ready, and free of unrelated decorative filler or UI chrome unless requested.',
  ].filter(Boolean)
  return {
    kind,
    prompt: promptSections.join('\n\n'),
    ...(model ? { model } : {}),
    ...(contentJson ? { contentJson } : {}),
    ...(size ? { size } : {}),
    ...(outputFormat ? { outputFormat } : {}),
    ...(responseFormat ? { responseFormat } : {}),
    ...(optimizePromptOptions ? { optimizePromptOptions } : {}),
    ...(stream != null ? { stream } : {}),
    ...(seed != null ? { seed } : {}),
    ...(guidanceScale != null ? { guidanceScale } : {}),
    ...(kind === 'image' && aspectRatioNumber != null ? { aspectRatio: aspectRatioNumber } : {}),
    ...(kind === 'image' && aspectRatio && aspectRatioNumber == null ? { aspectRatio } : {}),
    ...(kind === 'video' && ratio ? { ratio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(duration != null ? { duration } : {}),
    ...(generateAudio != null ? { generateAudio } : {}),
    ...(draft != null ? { draft } : {}),
    ...(cameraFixed != null ? { cameraFixed } : {}),
    ...(kind === 'video' && imageUrlUrl ? { imageUrlUrl } : {}),
    ...(watermark != null ? { watermark } : {}),
    ...(referenceImageUrl ? { referenceImageUrl } : {}),
  }
}

export const buildSuggestedArtifactFileName = (args: {
  workspacePath?: string | null
  node: GraphNode
  kind: string
  extension: string
  variant?: string | null
}): string => {
  const workspaceBase = cleanString(args.workspacePath).split('/').pop() || ''
  const workspaceStem = workspaceBase.replace(/\.[^.]+$/, '')
  const nodeStem = sanitizeFileNameStem(cleanString(args.node.label) || cleanString(args.node.id) || args.kind)
  const variantStem = sanitizeFileNameStem(cleanString(args.variant))
  const stem = sanitizeFileNameStem([workspaceStem, nodeStem, variantStem].filter(Boolean).join('-')) || `${args.kind}-asset`
  return `${stem}.${args.extension}`
}

const persistGeneratedAsset = async (args: {
  workspacePath?: string | null
  node: GraphNode
  kind: RichMediaWidgetKind
  extension: string
  asset: GeneratedBinaryAsset
}): Promise<string | null> => {
  const suggestedName = buildSuggestedArtifactFileName({
    workspacePath: args.workspacePath,
    node: args.node,
    kind: args.kind,
    extension: args.extension,
  })
  const siblingPath = resolveWorkspaceSiblingArtifactPath({
    workspacePath: args.workspacePath,
    fileName: suggestedName,
  })
  if (siblingPath) {
    return await writeWorkspaceBlobArtifactAtPath({
      absolutePath: siblingPath,
      blob: args.asset.blob,
    })
  }
  const assetMimeType = cleanString(args.asset.blob.type)
  const videoExtension = cleanString(args.extension).replace(/^\./, '') || 'mp4'
  const acceptMimeType = args.kind === 'video' ? (assetMimeType.startsWith('video/') ? assetMimeType : 'video/mp4') : args.kind === 'annotation' ? (assetMimeType || 'application/json') : 'image/png'
  const saved = await saveBlobWithPicker(args.asset.blob, suggestedName, {
    description: args.kind === 'video' ? 'Video Files' : args.kind === 'annotation' ? 'JSON Files' : 'Image Files',
    accept: args.kind === 'video' ? { [acceptMimeType]: [`.${videoExtension}`] } : args.kind === 'annotation' ? { [acceptMimeType]: ['.json'] } : { 'image/png': ['.png'] },
  })
  if (!saved) downloadBlob(args.asset.blob, suggestedName)
  return null
}

export const writeRichMediaWidgetRunOutputArtifact = async (args: {
  workspacePath?: string | null
  node: GraphNode
  kind: RichMediaWidgetKind
  extension: string
  asset: GeneratedBinaryAsset
  fs?: WorkspaceFs | null
  manifestMetadata?: ReadonlyArray<readonly [string, unknown]>
}): Promise<{ outputPath: string | null; outputManifestPath: string | null; outputStorageUrl?: string | null }> => {
  const outputPath = await persistGeneratedAsset({
    workspacePath: args.workspacePath,
    node: args.node,
    kind: args.kind,
    extension: args.extension,
    asset: args.asset,
  })
  if (!outputPath) return { outputPath, outputManifestPath: null }
  const storage = await uploadRichMediaBinaryToStorage({
    outputPath,
    blob: args.asset.blob,
  })
  const manifestName = buildSuggestedArtifactFileName({
    workspacePath: args.workspacePath,
    node: args.node,
    kind: 'media',
    extension: 'md',
    variant: `${args.kind}-output`,
  })
  const manifestPath = resolveWorkspaceSiblingArtifactPath({
    workspacePath: args.workspacePath,
    fileName: manifestName,
  })
  if (!manifestPath) return { outputPath, outputManifestPath: null }
  const manifestText = buildGeneratedMediaManifestMarkdown({
    node: args.node,
    kind: args.kind,
    outputPath,
    asset: args.asset,
    storage,
    manifestMetadata: args.manifestMetadata,
  })
  const outputManifestPath = await writeWorkspaceTextArtifactAtPath({
    absolutePath: manifestPath,
    text: manifestText,
    fs: args.fs,
  })
  if (!outputManifestPath) return { outputPath, outputManifestPath: null }
  if (storage) {
    await publishGeneratedTextToStorage({ outputPath: outputManifestPath, text: manifestText })
  }
  try {
    const fs = args.fs || await getWorkspaceFs()
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: [outputPath, outputManifestPath],
      opts: {
        applyToGraph: false,
        workspaceEntries: buildGeneratedMediaWorkspaceEntries({
          outputPath,
          outputManifestPath,
          manifestText,
        }),
      },
    })
  } catch {
    void 0
  }
  return { outputPath, outputManifestPath, outputStorageUrl: storage?.accessUrl || storage?.publicUrl || null }
}

export const writeTextWidgetRunOutputArtifact = async (args: {
  workspacePath?: string | null
  node: GraphNode
  output: string
  variant?: string | null
  fs?: WorkspaceFs | null
}): Promise<string | null> => {
  const output = String(args.output || '')
  if (!output.trim()) return null
  const suggestedName = buildSuggestedArtifactFileName({
    workspacePath: args.workspacePath,
    node: args.node,
    kind: 'text',
    extension: 'md',
    variant: args.variant || 'output',
  })
  const siblingPath = resolveWorkspaceSiblingArtifactPath({
    workspacePath: args.workspacePath,
    fileName: suggestedName,
  })
  if (!siblingPath) return null
  const outputPath = await writeWorkspaceTextArtifactAtPath({
    absolutePath: siblingPath,
    text: output,
    fs: args.fs,
  })
  if (!outputPath) return null
  try {
    const fs = args.fs || await getWorkspaceFs()
    await publishGeneratedTextToStorage({ outputPath, text: output })
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: [outputPath],
      opts: { applyToGraph: false },
    })
  } catch {
    void 0
  }
  return outputPath
}

export const runRichMediaWidgetGeneration = async (args: {
  node: GraphNode
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  markdownDocumentText?: string | null
  workspacePath?: string | null
  generationConfig: RunGenerationConfig
}): Promise<RichMediaWidgetRunResult | null> => {
  const request = buildRichMediaWidgetRunRequest(args)
  if (!request) return null
  const normalizedProvider = normalizeChatProviderId(args.generationConfig.provider)
  const asset = (() => {
    if (request.kind === 'image') {
      return generateRunImageWithBytePlus({
        config: args.generationConfig,
        prompt: request.prompt,
        options: {
          model: request.model,
          size: request.size,
          outputFormat: request.outputFormat,
          responseFormat: request.responseFormat,
          optimizePromptOptions: request.optimizePromptOptions,
          aspectRatio: request.aspectRatio,
          stream: request.stream,
          watermark: request.watermark,
          seed: request.seed,
          guidanceScale: request.guidanceScale,
          referenceImageUrl: request.referenceImageUrl,
        },
      })
    }
    if (normalizedProvider === CHAT_PROVIDER_GEMINI) {
      return generateRunVideoWithGemini({
        config: args.generationConfig,
        prompt: request.prompt,
        options: {
          model: request.model,
          ratio: request.aspectRatio,
          resolution: request.resolution,
          duration: request.durationSeconds,
          personGeneration: request.personGeneration,
        },
      })
    }
    return generateRunVideoWithBytePlus({
      config: args.generationConfig,
      prompt: request.prompt,
      options: {
        model: request.model,
        ratio: request.ratio,
        resolution: request.resolution,
        duration: request.duration,
        generateAudio: request.generateAudio,
        draft: request.draft,
        cameraFixed: request.cameraFixed,
        imageUrlUrl: request.imageUrlUrl,
        referenceImageUrl: request.referenceImageUrl,
      },
    })
  })()
  const resolvedAsset = await asset
  if (!resolvedAsset) return null
  const hasAudioTrack = request.kind === 'video' && request.generateAudio === true
    ? await hasMediaAudioTrack(resolvedAsset.blob)
    : false
  const outputArtifact = await writeRichMediaWidgetRunOutputArtifact({
    workspacePath: args.workspacePath,
    node: args.node,
    kind: request.kind,
    extension: request.kind === 'video' ? 'mp4' : 'png',
    asset: resolvedAsset,
  })
  return {
    kind: request.kind,
    hasAudioTrack,
    asset: outputArtifact.outputStorageUrl
      ? { ...resolvedAsset, renderUrl: outputArtifact.outputStorageUrl }
      : resolvedAsset,
    outputPath: outputArtifact.outputPath,
    outputManifestPath: outputArtifact.outputManifestPath,
    outputStorageUrl: outputArtifact.outputStorageUrl || null,
  }
}
