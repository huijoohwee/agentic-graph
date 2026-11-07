import type { WidgetRegistryEntry, WidgetRegistryField, WidgetRegistryPort } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS,
  FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  IMAGE_TO_THREEJS_SKILL_NODE_LABEL, IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID,
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_LABEL,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
  FLOW_SWARM_PREDICTION_NODE_LABEL,
  FLOW_SWARM_PREDICTION_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_FORM_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_LABEL,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_WIDGET_TYPE_ID,
  FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID,
  FLOW_OPENAI_VIDEO_SCRIPT_WIDGET_LABEL,
  FLOW_VIDEO_SCRIPT_FORM_ID,
  FLOW_VIDEO_SCRIPT_WIDGET_LABEL,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { getGrabMapsDiscoveryWidgetLabel, isGrabMapsDiscoveryWidgetEntry } from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import { buildRichMediaPanelRegistryDraft } from '@/features/storyboard-widget-manager/richMediaPanelRegistryDraft'; import { buildSwarmPredictionRegistryDraft } from '@/features/swarm-prediction/swarmPredictionWidget'
import { buildStoryboardElementRegistryDraft } from '@/features/storyboard-widget-manager/storyboardElementRegistryDraft'
export { buildStoryboardElementRegistryDraft } from '@/features/storyboard-widget-manager/storyboardElementRegistryDraft'
import { buildShowrunnerRegistryDraft, FLOW_SHOWRUNNER_NODE_TYPE_ID } from '@/features/ai-showrunner/showrunnerFlowNode'
import { buildHtmlVideoRendererRegistryDraft } from '@/features/html-video-renderer/htmlVideoWidget'; import { buildImageToThreeJsSkillRegistryDraft } from '@/features/image-to-threejs/imageToThreeJsWidget'
import {
  buildBytePlusTextGenerationFields,
  getBytePlusSharedTextApiDocRowByRowKey,
  resolveBytePlusTextWidgetSharedTextApiRowKey,
} from '@/features/integrations/byteplusChatApiSsot'
import {
  buildBytePlusImageGenerationFields,
  getBytePlusImageGenerationApiRowAnchorId,
  getBytePlusImageApiDocRowByRowKey,
  resolveBytePlusImageWidgetApiRowKey,
} from '@/features/integrations/byteplusImageGenerationSsot'
import {
  buildBytePlusVideoGenerationFields,
  getBytePlusVideoGenerationApiRowAnchorId,
  getBytePlusVideoApiDocRowByRowKey,
  resolveBytePlusVideoWidgetApiRowKey,
} from '@/features/integrations/byteplusVideoGenerationSsot'
import {
  getMapsApiDocRowByRowKey,
  getMapsApiRowAnchorId,
  resolveGrabMapsDiscoveryWidgetApiRowKey,
} from '@/features/integrations/grabMapsSsot'
import {
  buildOpenAiCompatibleTextGenerationFields,
  getOpenAiApiDocRowByRowKey,
  resolveOpenAiTextWidgetChatApiRowKey,
} from '@/features/integrations/openaiResponsesSsot'
import {
  getAgnesApiRowAnchorId,
  getBytePlusSharedTextApiRowAnchorId,
  getGoogleCloudApiRowAnchorId,
  getMiroMindApiRowAnchorId,
  getOpenAiChatApiRowAnchorId,
  getQwenApiRowAnchorId,
  getSealionApiRowAnchorId,
} from '@/features/panels/views/chatApiDocAnchors'
import {
  inferTextGenerationProviderFamily,
  normalizeTextGenerationProviderFamily,
  type TextGenerationProviderFamily,
} from '@/features/storyboard-widget-manager/textGenerationProviderFamily'
export {
  normalizeTextGenerationWidgetPropertiesForProviderFamily,
  resolveEffectiveTextGenerationWidgetProperties,
  resolveTextGenerationGlobalDefaultsForProviderFamily,
} from '@/features/storyboard-widget-manager/textGenerationProviderProperties'
export type WidgetRegistryApiDocRef = {
  rowKey: string
  apiKey: string
}
export type WidgetRegistryMainPanelLink = {
  tab: 'integrations' | 'maps'
  searchQuery: string
  anchorId: string
}

const OPENAI_COMPATIBLE_PROVIDER_ROW_PREFIX: Readonly<Record<'miromind' | 'agnes' | 'sealion' | 'qwen' | 'google-cloud', string>> = {
  miromind: 'miromindApi',
  agnes: 'agnesApi',
  sealion: 'sealionApi',
  qwen: 'qwenApi',
  'google-cloud': 'googleCloudApi',
}

const OPENAI_COMPATIBLE_PROVIDER_ROW_SUFFIX_BY_OPENAI_SUFFIX: Readonly<Record<string, string>> = {
  provider: 'provider',
  auth_mode: 'auth_mode',
  endpoint_url: 'endpoint_url',
  api_key: 'api_key',
  model: 'model',
  input: 'messages',
  stream: 'stream',
  max_output_tokens: 'max_tokens',
}

function isFrontmatterOwnedWidgetFormId(formId: unknown): boolean {
  return String(formId || '').trim().startsWith('fm:')
}

function mapOpenAiRowKeyToChatCompatibleProviderRowKey(
  rowKey: string,
  providerFamily: 'miromind' | 'agnes' | 'sealion' | 'qwen' | 'google-cloud',
): string | null {
  const normalized = String(rowKey || '').trim()
  if (!normalized.startsWith('openaiApi.')) return null
  const suffix = normalized.slice('openaiApi.'.length)
  const mappedSuffix = OPENAI_COMPATIBLE_PROVIDER_ROW_SUFFIX_BY_OPENAI_SUFFIX[suffix]
  if (!mappedSuffix) return null
  return `${OPENAI_COMPATIBLE_PROVIDER_ROW_PREFIX[providerFamily]}.${mappedSuffix}`
}

export function listVisibleWidgetRegistryPortsForPropsEditor(args: {
  registryEntry?: Pick<WidgetRegistryEntry, 'nodeTypeId' | 'widgetTypeId' | 'formId' | 'ports'> | null | undefined
  properties?: Record<string, unknown> | null | undefined
}): WidgetRegistryPort[] {
  const ports = Array.isArray(args.registryEntry?.ports) ? args.registryEntry!.ports : []
  if (ports.length === 0) return []
  const nodeTypeId = String(args.registryEntry?.nodeTypeId || '').trim()
  const formId = String(args.registryEntry?.formId || '').trim()
  const providerFamily = nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID && !isFrontmatterOwnedWidgetFormId(formId)
      ? inferTextGenerationProviderFamily({
        provider: args.properties?.chatProvider,
        endpointUrl: args.properties?.chatEndpointUrl,
        model: args.properties?.chatModel,
        widgetTypeId: args.registryEntry?.widgetTypeId,
        formId,
      })
    : null
  const out: WidgetRegistryPort[] = []
  for (let i = 0; i < ports.length; i += 1) {
    const port = ports[i]
    if (!port || port.isHidden === true) continue
    const portKey = String(port.portKey || '').trim()
    const direction = port.direction
    if (!portKey) continue
    if (direction !== 'input' && direction !== 'output') continue
    if (providerFamily === 'byteplus' && direction === 'input') continue
    out.push(port)
  }
  return out
}

export function resolveWidgetRegistryApiDocRef(args: {
  registryEntry?: Pick<WidgetRegistryEntry, 'nodeTypeId' | 'widgetTypeId' | 'formId'> | null | undefined
  properties?: Record<string, unknown> | null | undefined
  schemaPath?: unknown
  fieldKey?: unknown
  portKey?: unknown
}): WidgetRegistryApiDocRef | null {
  const nodeTypeId = String(args.registryEntry?.nodeTypeId || '').trim()
  if (isFrontmatterOwnedWidgetFormId(args.registryEntry?.formId)) return null
  const schemaPath = String(args.schemaPath || '').trim()
  const fieldKey = String(args.fieldKey || '').trim()
  const portKey = String(args.portKey || '').trim()
  if (!nodeTypeId || (!schemaPath && !fieldKey && !portKey)) return null

  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    const providerFamily = inferTextGenerationProviderFamily({
      provider: args.properties?.chatProvider,
      endpointUrl: args.properties?.chatEndpointUrl,
      model: args.properties?.chatModel,
      widgetTypeId: args.registryEntry?.widgetTypeId,
      formId: args.registryEntry?.formId,
    })
    const isOpenAiCompatibleProvider =
      providerFamily === 'lmstudio-local'
      || providerFamily === 'openai'
      || providerFamily === 'miromind'
      || providerFamily === 'agnes'
      || providerFamily === 'sealion'
      || providerFamily === 'qwen'
      || providerFamily === 'google-cloud'
    const rowKey = isOpenAiCompatibleProvider
      ? resolveOpenAiTextWidgetChatApiRowKey({ schemaPath, fieldKey, portKey })
      : resolveBytePlusTextWidgetSharedTextApiRowKey({ schemaPath, fieldKey, portKey })
    if (!rowKey) return null
    const normalizedRowKey =
      providerFamily === 'miromind' || providerFamily === 'agnes' || providerFamily === 'sealion' || providerFamily === 'qwen' || providerFamily === 'google-cloud'
          ? mapOpenAiRowKeyToChatCompatibleProviderRowKey(rowKey, providerFamily)
          : rowKey
    if (!normalizedRowKey) return null
    const row = isOpenAiCompatibleProvider
      ? getOpenAiApiDocRowByRowKey(rowKey)
      : getBytePlusSharedTextApiDocRowByRowKey(rowKey)
    const apiKey = providerFamily === 'miromind' || providerFamily === 'agnes' || providerFamily === 'sealion' || providerFamily === 'qwen' || providerFamily === 'google-cloud'
      ? normalizedRowKey
      : String(row?.key || '').trim()
    return apiKey ? { rowKey: normalizedRowKey, apiKey } : null
  }

  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
    const rowKey = resolveBytePlusImageWidgetApiRowKey({ schemaPath, fieldKey, portKey })
    if (!rowKey) return null
    const row = getBytePlusImageApiDocRowByRowKey(rowKey)
    const apiKey = String(row?.key || '').trim()
    return apiKey ? { rowKey, apiKey } : null
  }

  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
    const rowKey = resolveBytePlusVideoWidgetApiRowKey({ schemaPath, fieldKey, portKey })
    if (!rowKey) return null
    const row = getBytePlusVideoApiDocRowByRowKey(rowKey)
    const apiKey = String(row?.key || '').trim()
    return apiKey ? { rowKey, apiKey } : null
  }

  if (isGrabMapsDiscoveryWidgetEntry(args.registryEntry)) {
    const rowKey = resolveGrabMapsDiscoveryWidgetApiRowKey({ schemaPath, fieldKey, portKey })
    if (!rowKey) return null
    const row = getMapsApiDocRowByRowKey(rowKey)
    const apiKey = String(row?.key || '').trim()
    return apiKey ? { rowKey, apiKey } : null
  }

  return null
}

export function resolveWidgetRegistryMainPanelLink(args: {
  registryEntry?: Pick<WidgetRegistryEntry, 'nodeTypeId' | 'widgetTypeId' | 'formId'> | null | undefined
  properties?: Record<string, unknown> | null | undefined
  schemaPath?: unknown
  fieldKey?: unknown
  portKey?: unknown
}): WidgetRegistryMainPanelLink | null {
  const nodeTypeId = String(args.registryEntry?.nodeTypeId || '').trim()
  const apiDocRef = resolveWidgetRegistryApiDocRef(args)
  if (!nodeTypeId || !apiDocRef) return null

  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    const providerFamily = inferTextGenerationProviderFamily({
      provider: args.properties?.chatProvider,
      endpointUrl: args.properties?.chatEndpointUrl,
      model: args.properties?.chatModel,
      widgetTypeId: args.registryEntry?.widgetTypeId,
      formId: args.registryEntry?.formId,
    })
    return {
      tab: 'integrations',
      searchQuery: apiDocRef.rowKey,
      anchorId: providerFamily === 'openai' || providerFamily === 'lmstudio-local'
        ? getOpenAiChatApiRowAnchorId(apiDocRef.rowKey)
        : providerFamily === 'miromind'
            ? getMiroMindApiRowAnchorId(apiDocRef.rowKey)
            : providerFamily === 'agnes'
              ? getAgnesApiRowAnchorId(apiDocRef.rowKey)
              : providerFamily === 'sealion'
                ? getSealionApiRowAnchorId(apiDocRef.rowKey)
                : providerFamily === 'qwen'
                  ? getQwenApiRowAnchorId(apiDocRef.rowKey)
                  : providerFamily === 'google-cloud'
                    ? getGoogleCloudApiRowAnchorId(apiDocRef.rowKey)
                  : getBytePlusSharedTextApiRowAnchorId(apiDocRef.rowKey),
    }
  }

  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
    return {
      tab: 'integrations',
      searchQuery: apiDocRef.rowKey,
      anchorId: getBytePlusImageGenerationApiRowAnchorId(apiDocRef.rowKey),
    }
  }

  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
    return {
      tab: 'integrations',
      searchQuery: apiDocRef.rowKey,
      anchorId: getBytePlusVideoGenerationApiRowAnchorId(apiDocRef.rowKey),
    }
  }

  if (isGrabMapsDiscoveryWidgetEntry(args.registryEntry)) {
    return {
      tab: 'maps',
      searchQuery: apiDocRef.rowKey,
      anchorId: getMapsApiRowAnchorId(apiDocRef.rowKey),
    }
  }

  return null
}

export function getWidgetRegistryEntryLabel(args: {
  nodeTypeId?: unknown
  widgetTypeId?: unknown
  formId?: unknown
}): string {
  const nodeTypeId = String(args.nodeTypeId || '').trim()
  const formId = String(args.formId || '').trim()
  if (isFrontmatterOwnedWidgetFormId(formId)) return 'Widget'
  if (isGrabMapsDiscoveryWidgetEntry(args)) return getGrabMapsDiscoveryWidgetLabel()
  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    if (formId === FLOW_VIDEO_SCRIPT_FORM_ID) return FLOW_VIDEO_SCRIPT_WIDGET_LABEL
    if (formId === FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID) return FLOW_OPENAI_VIDEO_SCRIPT_WIDGET_LABEL
    // Provider-specific form IDs are compatibility aliases. The provider is
    // configuration of the canonical Widget Card, not a separate identity.
    return FLOW_TEXT_GENERATION_NODE_LABEL
  }
  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) return 'Image Widget'
  if (nodeTypeId === IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID) return IMAGE_TO_THREEJS_SKILL_NODE_LABEL
  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) return 'Video Widget'
  if (nodeTypeId === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID) return FLOW_HTML_VIDEO_RENDERER_NODE_LABEL
  if (nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return FLOW_RICH_MEDIA_PANEL_NODE_LABEL
  if (nodeTypeId === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID) return FLOW_STORYBOARD_ELEMENT_NODE_LABEL
  if (nodeTypeId === FLOW_SWARM_PREDICTION_NODE_TYPE_ID) return FLOW_SWARM_PREDICTION_NODE_LABEL; if (nodeTypeId === FLOW_SHOWRUNNER_NODE_TYPE_ID) return 'AI Showrunner'
  if (nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) return FLOW_VIDEO_TRANSCRIBER_NODE_LABEL
  return nodeTypeId || String(args.formId || '').trim() || String(args.widgetTypeId || '').trim() || FLOW_TEXT_GENERATION_NODE_LABEL
}

export function isPropsPanelWidgetPaletteEntry(entry: WidgetRegistryEntry | null | undefined): boolean {
  if (!entry || entry.isEnabled !== true) return false
  const nodeTypeId = String(entry.nodeTypeId || '').trim()
  const widgetTypeId = String(entry.widgetTypeId || '').trim()
  const formId = String(entry.formId || '').trim()
  if (!nodeTypeId || !widgetTypeId || !formId) return false
  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID || nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) return false
  if (nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID) return true
  if (widgetTypeId === 'default' && formId === 'textGeneration') return true
  return getWidgetRegistryEntryLabel(entry) !== FLOW_TEXT_GENERATION_NODE_LABEL
}

function buildCommonTextGenerationPorts(): WidgetRegistryEntry['ports'] {
  return [
    { portKey: 'prompt_in', direction: 'input', schemaPath: 'properties.prompt' },
    { portKey: 'text_out', direction: 'output', schemaPath: 'properties.output' },
    { portKey: 'outputSrcDoc', direction: 'output', schemaPath: 'properties.outputSrcDoc' },
  ]
}

export function buildWidgetDraftFromSmartFields(args: {
  nodeTypeId: string
  mode?: 'image' | 'video'
}): Omit<WidgetRegistryEntry, 'updatedAt'> {
  const nodeTypeId = String(args.nodeTypeId || '').trim()
  const mode = args.mode === 'image' ? 'image' : args.mode === 'video' ? 'video' : null
  return {
    id: '',
    isEnabled: true,
    nodeTypeId,
    widgetTypeId: 'default',
    formId: mode === 'image' ? 'imageGeneration' : mode === 'video' ? 'videoGeneration' : 'widget',
    fields: [
      ...(mode === 'image'
        ? buildBytePlusImageGenerationFields()
        : mode === 'video'
          ? buildBytePlusVideoGenerationFields()
          : ([
            {
              fieldKey: 'model',
              fieldType: 'select',
              schemaPath: 'properties.model',
              required: true,
              label: 'Model',
              options: [...STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS],
            },
            { fieldKey: 'prompt', fieldType: 'textarea', schemaPath: 'properties.prompt', required: true, label: 'Prompt' },
          ] satisfies WidgetRegistryField[])),
    ],
    ports: [
      { portKey: 'prompt_in', direction: 'input', schemaPath: 'properties.prompt' },
      { portKey: 'reference_image', direction: 'input', schemaPath: 'properties.reference_image' },
      {
        portKey: mode === 'image' ? 'imageUrl' : mode === 'video' ? 'videoUrl' : 'output',
        direction: 'output',
        schemaPath: mode === 'image' ? 'properties.imageUrl' : mode === 'video' ? 'properties.videoUrl' : 'properties.output',
      },
    ],
    schemaMappings: [],
  }
}

export function buildCanonicalWidgetRegistryDraft(args: {
  nodeTypeId: string
  providerFamily?: TextGenerationProviderFamily
  widgetTypeId?: string
  formId?: string
}): Omit<WidgetRegistryEntry, 'updatedAt'> | null {
  const nodeTypeId = String(args.nodeTypeId || '').trim()
  const widgetTypeId = String(args.widgetTypeId || '').trim()
  const formId = String(args.formId || '').trim()
  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    return buildTextGenerationRegistryDraft({
      providerFamily: args.providerFamily,
      widgetTypeId: widgetTypeId || 'default',
      formId,
    })
  }
  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
    return {
      ...buildWidgetDraftFromSmartFields({ nodeTypeId, mode: 'image' }),
      widgetTypeId: widgetTypeId || 'default',
      formId: formId || 'imageGeneration',
    }
  }
  if (nodeTypeId === IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID) { const draft = buildImageToThreeJsSkillRegistryDraft(); return { ...draft, widgetTypeId: widgetTypeId || draft.widgetTypeId, formId: formId || draft.formId } }
  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
    return {
      ...buildWidgetDraftFromSmartFields({ nodeTypeId, mode: 'video' }),
      widgetTypeId: widgetTypeId || 'default',
      formId: formId || 'videoGeneration',
    }
  }
  if (nodeTypeId === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID) {
    const draft = buildHtmlVideoRendererRegistryDraft()
    return {
      ...draft,
      widgetTypeId: widgetTypeId || draft.widgetTypeId,
      formId: formId || draft.formId,
    }
  }
  if (nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
    return {
      ...buildRichMediaPanelRegistryDraft(),
      widgetTypeId: widgetTypeId || FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      formId: formId || FLOW_RICH_MEDIA_PANEL_FORM_ID,
    }
  }
  if (nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) {
    return {
      ...buildVideoTranscriberRegistryDraft(),
      widgetTypeId: widgetTypeId || FLOW_VIDEO_TRANSCRIBER_WIDGET_TYPE_ID,
      formId: formId || FLOW_VIDEO_TRANSCRIBER_FORM_ID,
    }
  }
  if (nodeTypeId === FLOW_SWARM_PREDICTION_NODE_TYPE_ID) {
    const draft = buildSwarmPredictionRegistryDraft()
    return {
      ...draft,
      widgetTypeId: widgetTypeId || draft.widgetTypeId,
      formId: formId || draft.formId,
    }
  }
  if (nodeTypeId === FLOW_SHOWRUNNER_NODE_TYPE_ID) { const draft = buildShowrunnerRegistryDraft(); return { ...draft, widgetTypeId: widgetTypeId || draft.widgetTypeId, formId: formId || draft.formId } }
  if (nodeTypeId === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID) {
    return {
      ...buildStoryboardElementRegistryDraft(),
      widgetTypeId: widgetTypeId || FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
      formId: formId || FLOW_STORYBOARD_ELEMENT_FORM_ID,
    }
  }
  return null
}

export function buildVideoTranscriberRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> {
  return {
    id: '',
    isEnabled: true,
    nodeTypeId: FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
    widgetTypeId: FLOW_VIDEO_TRANSCRIBER_WIDGET_TYPE_ID,
    formId: FLOW_VIDEO_TRANSCRIBER_FORM_ID,
    fields: [
      { fieldKey: 'sourceUrl', fieldType: 'text', schemaPath: 'properties.sourceUrl', required: true, label: 'Video URL' },
      { fieldKey: 'languageHint', fieldType: 'text', schemaPath: 'properties.languageHint', required: false, label: 'Language hint (optional)' },
      { fieldKey: 'output', fieldType: 'textarea', schemaPath: 'properties.output', label: 'Output' },
    ],
    ports: [
      { portKey: 'sourceUrl_in', direction: 'input', schemaPath: 'properties.sourceUrl' },
      { portKey: 'text_out', direction: 'output', schemaPath: 'properties.output' },
    ],
    schemaMappings: [],
  }
}

export function buildGenerateImageRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> { return buildCanonicalWidgetRegistryDraft({ nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID })! }

export function buildTextGenerationRegistryDraft(args?: {
  providerFamily?: TextGenerationProviderFamily
  widgetTypeId?: string
  formId?: string
}): Omit<WidgetRegistryEntry, 'updatedAt'> {
  const providerFamily = normalizeTextGenerationProviderFamily(args?.providerFamily)
  return {
    id: '',
    isEnabled: true,
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    widgetTypeId: String(args?.widgetTypeId || '').trim() || 'default',
    formId: String(args?.formId || '').trim() || (providerFamily === 'byteplus' ? 'textGeneration' : `textGeneration.${providerFamily}`),
    fields: providerFamily === 'byteplus'
      ? buildBytePlusTextGenerationFields()
      : buildOpenAiCompatibleTextGenerationFields(),
    ports: buildCommonTextGenerationPorts(),
    schemaMappings: [],
  }
}

export function buildBytePlusVideoScriptRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> {
  return buildTextGenerationRegistryDraft({
    providerFamily: 'byteplus',
    widgetTypeId: 'default',
    formId: FLOW_VIDEO_SCRIPT_FORM_ID,
  })
}

export function buildOpenAiVideoScriptRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> {
  return buildTextGenerationRegistryDraft({
    providerFamily: 'openai',
    widgetTypeId: 'default',
    formId: FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID,
  })
}

export function buildGenerateTextRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> {
  return buildCanonicalWidgetRegistryDraft({
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    providerFamily: 'byteplus',
  })!
}

export function buildGenerateVideoRegistryDraft(): Omit<WidgetRegistryEntry, 'updatedAt'> {
  return buildCanonicalWidgetRegistryDraft({ nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID })!
}

export function getRichMediaPanelWidgetLabel(): string {
  return FLOW_RICH_MEDIA_PANEL_NODE_LABEL
}
