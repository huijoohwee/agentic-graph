import {
  CHAT_AGNES_ENDPOINT_URL,
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_COMPLETIONS_PATH,
  CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
  CHAT_MIROMIND_ENDPOINT_URL,
  CHAT_OPENAI_ENDPOINT_URL,
  CHAT_PROVIDER_AGNES,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_GOOGLE_CLOUD,
  CHAT_PROVIDER_LM_STUDIO,
  CHAT_PROVIDER_MIROMIND,
  CHAT_PROVIDER_OPENAI,
  CHAT_PROVIDER_QWEN,
  CHAT_PROVIDER_SEALION,
  CHAT_PROXY_PATH_PREFIX,
  CHAT_QWEN_ENDPOINT_URL,
  CHAT_SEALION_ENDPOINT_URL,
  getDefaultChatModelForProvider,
  normalizeChatProviderId,
  resolveChatModelIdForProvider,
} from '@/lib/chatEndpoint'
import {
  normalizeTextGenerationProviderFamily,
  type TextGenerationProviderFamily,
} from '@/features/storyboard-widget-manager/textGenerationProviderFamily'

type TextGenerationProviderProfile = {
  providerId: string
  defaultEndpointUrl: string
  defaultModel: string
}

const TEXT_GENERATION_PROVIDER_PROFILE_BY_FAMILY: Readonly<Record<TextGenerationProviderFamily, TextGenerationProviderProfile>> = {
  byteplus: {
    providerId: CHAT_PROVIDER_BYTEPLUS,
    defaultEndpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
    defaultModel: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  },
  'lmstudio-local': {
    providerId: CHAT_PROVIDER_LM_STUDIO,
    defaultEndpointUrl: `${CHAT_PROXY_PATH_PREFIX}${CHAT_COMPLETIONS_PATH}`,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_LM_STUDIO),
  },
  openai: {
    providerId: CHAT_PROVIDER_OPENAI,
    defaultEndpointUrl: CHAT_OPENAI_ENDPOINT_URL,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_OPENAI),
  },
  miromind: {
    providerId: CHAT_PROVIDER_MIROMIND,
    defaultEndpointUrl: CHAT_MIROMIND_ENDPOINT_URL,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_MIROMIND),
  },
  agnes: {
    providerId: CHAT_PROVIDER_AGNES,
    defaultEndpointUrl: CHAT_AGNES_ENDPOINT_URL,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_AGNES),
  },
  sealion: {
    providerId: CHAT_PROVIDER_SEALION,
    defaultEndpointUrl: CHAT_SEALION_ENDPOINT_URL,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_SEALION),
  },
  qwen: {
    providerId: CHAT_PROVIDER_QWEN,
    defaultEndpointUrl: CHAT_QWEN_ENDPOINT_URL,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_QWEN),
  },
  'google-cloud': {
    providerId: CHAT_PROVIDER_GOOGLE_CLOUD,
    defaultEndpointUrl: CHAT_GOOGLE_CLOUD_ENDPOINT_URL,
    defaultModel: getDefaultChatModelForProvider(CHAT_PROVIDER_GOOGLE_CLOUD),
  },
} as const

function hasTextGenerationOverrideValue(value: unknown): boolean {
  if (typeof value === 'undefined' || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return true
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function getTextGenerationProviderProfile(providerFamily?: TextGenerationProviderFamily): TextGenerationProviderProfile {
  return TEXT_GENERATION_PROVIDER_PROFILE_BY_FAMILY[normalizeTextGenerationProviderFamily(providerFamily)]
}

export function normalizeTextGenerationWidgetPropertiesForProviderFamily(args: {
  providerFamily?: TextGenerationProviderFamily
  properties?: Record<string, unknown>
}): Record<string, unknown> {
  const providerFamily = normalizeTextGenerationProviderFamily(args.providerFamily)
  const previous = { ...(args.properties || {}) }
  const profile = getTextGenerationProviderProfile(providerFamily)
  const rawProvider = String(previous.chatProvider || '').trim()
  const normalizedProvider = rawProvider ? normalizeChatProviderId(rawProvider) : profile.providerId
  const providerMatchesFamily = normalizedProvider === profile.providerId
  return {
    ...previous,
    chatProvider: profile.providerId,
    chatEndpointUrl:
      providerMatchesFamily && String(previous.chatEndpointUrl || '').trim()
        ? String(previous.chatEndpointUrl || '').trim()
        : profile.defaultEndpointUrl,
    chatModel:
      providerMatchesFamily && String(previous.chatModel || '').trim()
        ? resolveChatModelIdForProvider(previous.chatModel, profile.providerId, { preserveUnknownCustomModel: true })
        : profile.defaultModel,
  }
}

export function resolveTextGenerationGlobalDefaultsForProviderFamily(args: {
  providerFamily?: TextGenerationProviderFamily
  globalProperties?: Record<string, unknown>
}): Record<string, unknown> {
  return normalizeTextGenerationWidgetPropertiesForProviderFamily({
    providerFamily: args.providerFamily,
    properties: args.globalProperties,
  })
}

export function resolveEffectiveTextGenerationWidgetProperties(args: {
  providerFamily?: TextGenerationProviderFamily
  localProperties?: Record<string, unknown>
  globalProperties?: Record<string, unknown>
}): Record<string, unknown> {
  const providerFamily = normalizeTextGenerationProviderFamily(args.providerFamily)
  const base = resolveTextGenerationGlobalDefaultsForProviderFamily({
    providerFamily,
    globalProperties: args.globalProperties,
  })
  const local = { ...(args.localProperties || {}) }
  const normalizedLocalProviderFields = normalizeTextGenerationWidgetPropertiesForProviderFamily({
    providerFamily,
    properties: local,
  })
  const next: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(local)) {
    if (!hasTextGenerationOverrideValue(value)) continue
    if (key === 'chatProvider' || key === 'chatEndpointUrl' || key === 'chatModel') continue
    if (key === 'chatAuthMode' && String(value || '').trim() !== 'byok') continue
    next[key] = value
  }

  if (hasTextGenerationOverrideValue(local.chatProvider)) {
    next.chatProvider = normalizedLocalProviderFields.chatProvider
  } else if (Object.prototype.hasOwnProperty.call(base, 'chatProvider')) {
    next.chatProvider = base.chatProvider
  }

  if (hasTextGenerationOverrideValue(local.chatEndpointUrl) || hasTextGenerationOverrideValue(local.chatProvider)) {
    next.chatEndpointUrl = normalizedLocalProviderFields.chatEndpointUrl
  } else if (Object.prototype.hasOwnProperty.call(base, 'chatEndpointUrl')) {
    next.chatEndpointUrl = base.chatEndpointUrl
  }

  if (hasTextGenerationOverrideValue(local.chatModel) || hasTextGenerationOverrideValue(local.chatProvider)) {
    next.chatModel = normalizedLocalProviderFields.chatModel
  } else if (Object.prototype.hasOwnProperty.call(base, 'chatModel')) {
    next.chatModel = base.chatModel
  }

  return next
}
