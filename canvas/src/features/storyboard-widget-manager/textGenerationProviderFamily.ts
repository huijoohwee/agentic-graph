import {
  CHAT_DEFAULT_PROVIDER,
  CHAT_PROVIDER_AGNES,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_GOOGLE_CLOUD,
  CHAT_PROVIDER_LM_STUDIO,
  CHAT_PROVIDER_MIROMIND,
  CHAT_PROVIDER_OPENAI,
  CHAT_PROVIDER_QWEN,
  CHAT_PROVIDER_SEALION,
  normalizeChatProviderId,
  type ChatProviderId,
} from '@/lib/chatEndpoint'
import {
  inferChatProviderFromEndpointUrl,
  inferChatProviderFromModelId,
} from '@/lib/chatEndpointProviderInference'
import { FLOW_VIDEO_SCRIPT_FORM_ID } from '@/lib/config.storyboard-widget'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

export type TextGenerationProviderFamily =
  | 'byteplus'
  | 'lmstudio-local'
  | 'openai'
  | 'miromind'
  | 'agnes'
  | 'sealion'
  | 'qwen'
  | 'google-cloud'

const PROVIDER_FAMILY_BY_ID: Partial<Record<ChatProviderId, TextGenerationProviderFamily>> = {
  [CHAT_PROVIDER_BYTEPLUS]: 'byteplus',
  [CHAT_PROVIDER_LM_STUDIO]: 'lmstudio-local',
  [CHAT_PROVIDER_OPENAI]: 'openai',
  [CHAT_PROVIDER_MIROMIND]: 'miromind',
  [CHAT_PROVIDER_AGNES]: 'agnes',
  [CHAT_PROVIDER_SEALION]: 'sealion',
  [CHAT_PROVIDER_QWEN]: 'qwen',
  [CHAT_PROVIDER_GOOGLE_CLOUD]: 'google-cloud',
}

const providerFamilyFromConfiguredTuple = (args: {
  provider?: unknown
  endpointUrl?: unknown
  model?: unknown
}): TextGenerationProviderFamily | null => {
  const rawProvider = String(unwrapGraphCellValue(args.provider) || '').trim()
  const rawEndpointUrl = String(unwrapGraphCellValue(args.endpointUrl) || '').trim()
  const rawModel = String(unwrapGraphCellValue(args.model) || '').trim()
  if (!rawProvider && !rawEndpointUrl && !rawModel) return null

  const endpointProvider = rawEndpointUrl
    ? inferChatProviderFromEndpointUrl(rawEndpointUrl, rawProvider || CHAT_DEFAULT_PROVIDER)
    : null
  const fallbackProvider = rawProvider || endpointProvider || CHAT_DEFAULT_PROVIDER
  // The model selector is the last user-authored provider signal. When a
  // persisted endpoint/provider tuple disagrees with a known model family,
  // route the run with the model family instead of sending mismatched auth.
  const resolvedProvider = rawModel
    ? inferChatProviderFromModelId(rawModel, fallbackProvider)
    : endpointProvider || normalizeChatProviderId(fallbackProvider)
  return PROVIDER_FAMILY_BY_ID[normalizeChatProviderId(resolvedProvider)] || null
}

export const normalizeTextGenerationProviderFamily = (value: unknown): TextGenerationProviderFamily =>
  value === 'lmstudio-local'
  || value === 'openai'
  || value === 'miromind'
  || value === 'agnes'
  || value === 'sealion'
  || value === 'qwen'
  || value === 'google-cloud'
    ? value
    : 'byteplus'

export function inferTextGenerationProviderFamily(args: {
  provider?: unknown
  endpointUrl?: unknown
  model?: unknown
  widgetTypeId?: unknown
  formId?: unknown
}): TextGenerationProviderFamily {
  const configuredFamily = providerFamilyFromConfiguredTuple(args)
  if (configuredFamily) return configuredFamily

  const widgetTypeId = String(unwrapGraphCellValue(args.widgetTypeId) || '').trim().toLowerCase()
  const formId = String(unwrapGraphCellValue(args.formId) || '').trim().toLowerCase()
  if (widgetTypeId.includes('lmstudio') || widgetTypeId.includes('lm-studio') || formId.includes('lmstudio') || formId.includes('lm-studio')) return 'lmstudio-local'
  if (widgetTypeId.includes('miromind') || widgetTypeId.includes('miro-mind') || formId.includes('miromind') || formId.includes('miro-mind')) return 'miromind'
  if (widgetTypeId.includes('agnes') || formId.includes('agnes')) return 'agnes'
  if (widgetTypeId.includes('sealion') || widgetTypeId.includes('sea-lion') || formId.includes('sealion') || formId.includes('sea-lion')) return 'sealion'
  if (widgetTypeId.includes('qwen') || widgetTypeId.includes('dashscope') || formId.includes('qwen') || formId.includes('dashscope')) return 'qwen'
  if (widgetTypeId.includes('google-cloud') || widgetTypeId.includes('googlecloud') || widgetTypeId.includes('vertex') || formId.includes('google-cloud') || formId.includes('googlecloud') || formId.includes('vertex')) return 'google-cloud'
  if (widgetTypeId.includes('openai') || formId.includes('openai')) return 'openai'
  if (formId === FLOW_VIDEO_SCRIPT_FORM_ID.toLowerCase()) return 'byteplus'
  return 'byteplus'
}
