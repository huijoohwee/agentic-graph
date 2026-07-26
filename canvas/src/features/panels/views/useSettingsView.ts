import React from 'react'
import { settingsRegistry } from '@/features/settings/registry'
import { useGraphStore } from '@/hooks/useGraphStore'
import { loadSettingsCollapsedByArea, persistSettingsCollapsedByArea } from '@/features/panels/utils/settingsCollapsedStorage'
import { normalized as normalizeText } from '@/features/panels/utils/json'
import { getLocalStorage } from '@/lib/persistence'
import { FALLBACK_DETAILS } from './SettingsFallbackDetails'
import { renderSettingInput } from '@/features/settings/ui'
import { UI_ANCHORS } from '@/lib/config'
import {
  CHAT_AGNES_MODEL_OPTIONS,
  CHAT_DEERFLOW_MODEL_OPTIONS,
  CHAT_GOOGLE_CLOUD_ENDPOINT_OPTIONS,
  CHAT_GOOGLE_CLOUD_MODEL_OPTIONS,
  CHAT_MIROMIND_MODEL_OPTIONS,
  CHAT_SEALION_MODEL_OPTIONS,
  CHAT_QWEN_ENDPOINT_OPTIONS,
  CHAT_QWEN_MODEL_OPTIONS,
  CHAT_OPENAI_MODEL_OPTIONS,
  CHAT_PROVIDER_AGNES,
  CHAT_PROVIDER_DEERFLOW,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_GOOGLE_CLOUD,
  CHAT_PROVIDER_MIROMIND,
  CHAT_PROVIDER_SEALION,
  CHAT_PROVIDER_QWEN,
  buildChatProxyHeaders,
  getChatDefaultEndpointUrlForProvider,
  normalizeChatProviderId,
  resolveChatEndpointForHealth,
} from '@/lib/chatEndpoint'

const INTEGRATION_REASONING_EFFORT_OPTIONS = ['minimal', 'low', 'medium', 'high'] as const
const INTEGRATION_THINKING_TYPE_OPTIONS = ['disabled', 'enabled'] as const
const INTEGRATION_BYTEPLUS_IMAGE_MODEL_OPTIONS = ['seedream-4-0-250828', 'seedream-4-5-251128', 'seedream-5-0-260128'] as const
const INTEGRATION_BYTEPLUS_IMAGE_OPTIMIZE_OPTIONS = ['fast', 'standard'] as const
const INTEGRATION_BYTEPLUS_VIDEO_IMAGE_URL_KIND_OPTIONS = ['base64', 'url'] as const
const INTEGRATION_BYTEPLUS_IMAGE_OUTPUT_FORMAT_OPTIONS = ['jpeg', 'png'] as const
const INTEGRATION_BYTEPLUS_IMAGE_RESPONSE_FORMAT_OPTIONS = ['b64_json', 'url'] as const
const INTEGRATION_BYTEPLUS_VIDEO_RATIO_OPTIONS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'] as const
const INTEGRATION_BYTEPLUS_VIDEO_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const
const INTEGRATION_GRABMAPS_AUTH_MODE_OPTIONS = ['byok', 'serverManaged'] as const
const INTEGRATION_GRABMAPS_NEARBY_RANK_BY_OPTIONS = ['distance', 'popularity'] as const
const INTEGRATION_GEMINI_VIDEO_MODEL_OPTIONS = ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview', 'veo-3.0-generate-001', 'veo-2.0-generate-001'] as const
const INTEGRATION_GEMINI_VIDEO_ASPECT_RATIO_OPTIONS = ['16:9', '9:16'] as const
const INTEGRATION_GEMINI_VIDEO_RESOLUTION_OPTIONS = ['720p', '1080p', '4k'] as const
const INTEGRATION_GEMINI_VIDEO_DURATION_OPTIONS = ['4', '6', '8'] as const
const INTEGRATION_GEMINI_VIDEO_PERSON_GENERATION_OPTIONS = ['allow_all', 'allow_adult', 'dont_allow'] as const
import { normalizeTextGenerationWidgetPropertiesForProviderFamily } from '@/features/storyboard-widget-manager/registryTemplates'
import {
  BYTEPLUS_SHARED_TEXT_API_DOC_AREA,
  BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES,
  getBytePlusSharedTextApiRowAnchorId,
} from './byteplusSharedTextApiDocs'
import { BYTEPLUS_MODELARK_MCP_DOC_AREA } from './byteplusModelArkMcpApiDocs'
import {
  OPENAI_CHAT_API_DOC_AREA,
  OPENAI_CHAT_API_REQUEST_DOC_ENTRIES,
  getOpenAiChatApiRowAnchorId,
} from './openaiChatApiDocs'
import {
  OPENAI_IMAGES_API_DOC_AREA,
  OPENAI_IMAGES_API_REQUEST_DOC_ENTRIES,
  getOpenAiImagesApiRowAnchorId,
} from './openaiImagesApiDocs'
import {
  DEERFLOW_API_DOC_AREA,
  DEERFLOW_API_REQUEST_DOC_ENTRIES,
  getDeerFlowApiRowAnchorId,
} from './deerflowApiDocs'
import {
  MIROMIND_API_DOC_AREA,
  MIROMIND_API_DOC_ENTRIES,
  getMiroMindApiRowAnchorId,
} from './miromindApiDocs'
import {
  AGNES_API_DOC_AREA,
  AGNES_API_DOC_ENTRIES,
  getAgnesApiRowAnchorId,
} from './agnesApiDocs'
import {
  SEALION_API_DOC_AREA,
  SEALION_API_DOC_ENTRIES,
  getSealionApiRowAnchorId,
} from './sealionApiDocs'
import {
  QWEN_API_DOC_AREA,
  QWEN_API_DOC_ENTRIES,
  getQwenApiRowAnchorId,
} from './qwenApiDocs'
import {
  GOOGLE_CLOUD_API_DOC_AREA,
  GOOGLE_CLOUD_API_DOC_ENTRIES,
  getGoogleCloudApiRowAnchorId,
} from './googleCloudApiDocs'
import {
  STRIPE_PAYMENT_API_REQUEST_DOC_ENTRIES,
  getStripePaymentApiRowAnchorId,
} from './stripePaymentApiDocs'
import {
  BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
  BYTEPLUS_IMAGE_GENERATION_API_REQUEST_DOC_ENTRIES,
  BYTEPLUS_IMAGE_GENERATION_MAPPED_VALUE_KEYS,
  getBytePlusImageGenerationApiRowAnchorId,
} from './byteplusImageGenerationApiDocs'
import {
  BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA,
  BYTEPLUS_VIDEO_GENERATION_MAPPED_VALUE_KEYS,
  BYTEPLUS_VIDEO_GENERATION_API_REQUEST_DOC_ENTRIES,
  getBytePlusVideoGenerationApiRowAnchorId,
} from './byteplusVideoGenerationApiDocs'
import {
  GEMINI_VIDEO_GENERATION_API_DOC_AREA,
  GEMINI_VIDEO_GENERATION_MAPPED_VALUE_KEYS,
  GEMINI_VIDEO_GENERATION_API_DOC_ENTRIES,
  getGeminiVideoGenerationApiRowAnchorId,
} from './geminiVideoGenerationApiDocs'
import {
  VIDEODB_API_DOC_AREA,
  VIDEODB_API_DOC_ENTRIES,
  getVideodbApiRowAnchorId,
} from './videodbApiDocs'
import {
  SENSENOVA_API_DOC_AREA,
  SENSENOVA_API_DOC_ENTRIES,
  getSensenovaApiRowAnchorId,
} from './sensenovaApiDocs'
import {
  MAPS_API_DOC_ENTRIES,
  getMapsApiRowAnchorId,
} from './mapsApiDocs'
import { GRABMAPS_DIRECTIONS_REQUEST_DOC_ENTRIES } from './grabmapsDirectionsApiDocs'
import { buildMcpDocEntries, buildMcpVirtualEntry } from './settingsMcpDocEntries'
import { MIROMIND_MCP_DOC_AREA } from './miromindMcpApiDocs'
import { resolvePaymentsProviderSpec } from '@/features/payments/providers'
import { resolveBytePlusVideoModelPreview } from '@/features/chat/byteplusRunGeneration'
import { buildMainPanelVirtualSettingMeta } from '@/features/panels/mainPanelVirtualSettings'
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography'
import { buildGrabMapsProxyRequestHeadersFromAuth, normalizeGrabMapsAuthMode, sanitizeGrabMapsApiKey } from 'grph-shared/geospatial/grabMapsAuth'
import { toGrabMapsProxyUrl } from 'grph-shared/geospatial/grabMapsProxy'
import {
  buildDocMappedEntry,
  isIntegrationsOwnedSetting,
  isMapsOwnedSetting,
  isMcpOwnedSetting,
  isPaymentsOwnedSetting,
  normalizeSettingsAreaLabel,
  resolveDocMappedEntryMeta,
  settingsAreaSortWeight,
  SETTINGS_REGISTRY_BY_KEY,
  type SettingsEntry,
} from './useSettingsView.helpers'
import type { SettingsViewMode } from './settingsView.constants'
import { useSettingsFlowDetails } from './useSettingsFlowDetails'

const getSettingsSearchHints = (key: string): string[] => {
  if (key === 'chatContextScope') {
    return ['chat ai assistant context scope selection workspace hybrid']
  }
  if (key === 'chatProvider' || key === 'chatAuthMode' || key === 'chatEndpointUrl' || key === 'chatApiKey' || key === 'chatModel') {
    return ['chat ai agnes byteplus dashscope google cloud gcp vertex ai gemini modelark model studio miromind openai qwen official provider endpoint api key byok server-managed auth mode model multi-modal multimodal run image video generation deep research reasoning']
  }
  if (key === 'byteplusVideoModel') {
    return ['byteplus video generation api model byteplusVideoApi.model bytedance dreamina seedance video widget integrations default']
  }
  if (key === 'byteplusImageModel') {
    return ['byteplus image generation api model byteplusImageApi.model bytedance dola seedream image widget integrations default']
  }
  if (key === 'maps.grabmaps.authMode' || key === 'maps.grabmaps.apiKey') {
    return ['grabmaps maps auth mode byok server-managed api key style directions proxy']
  }
  if (key === 'chatHistoryStorageMode' || key === 'chatHistoryWorkspacePath' || key === 'chatHistoryCloudUrl') {
    return ['chat history workspace file path markdown cloud url github']
  }
  if (key === 'chatStorageTarget' || key === 'chatLocalStorageRootPath' || key === 'chatKnowgrphStorageMode' || key === 'chatKnowgrphWorkspacePath' || key === 'chatKnowgrphCloudUrl') {
    return ['chat storage chatKnowgrph chatHistory local cloud markdown file path url']
  }
  if (key === 'integrationConfigsJson') {
    return ['integrations ai chat aiChat simulationCommands openTab commandPrefix provider']
  }
  return []
}

const INTEGRATION_API_DOC_ENTRIES = [
  ...BYTEPLUS_SHARED_TEXT_API_REQUEST_DOC_ENTRIES,
  ...BYTEPLUS_IMAGE_GENERATION_API_REQUEST_DOC_ENTRIES,
  ...BYTEPLUS_VIDEO_GENERATION_API_REQUEST_DOC_ENTRIES,
  ...GEMINI_VIDEO_GENERATION_API_DOC_ENTRIES,
  ...SENSENOVA_API_DOC_ENTRIES,
  ...VIDEODB_API_DOC_ENTRIES,
  ...MIROMIND_API_DOC_ENTRIES,
  ...AGNES_API_DOC_ENTRIES,
  ...SEALION_API_DOC_ENTRIES,
  ...QWEN_API_DOC_ENTRIES,
  ...GOOGLE_CLOUD_API_DOC_ENTRIES,
  ...OPENAI_CHAT_API_REQUEST_DOC_ENTRIES,
  ...OPENAI_IMAGES_API_REQUEST_DOC_ENTRIES,
  ...DEERFLOW_API_REQUEST_DOC_ENTRIES,
] as const

const INTEGRATION_JSON_OWNER_ROW_KEYS_BY_VALUE_KEY: Readonly<Record<string, ReadonlySet<string>>> = {
  chatMessagesJson: new Set(['byteplusApi.messages', 'openaiApi.input', 'deerflowApi.input']),
  chatThinkingJson: new Set(['byteplusApi.thinking']),
  chatResponseFormatJson: new Set(['byteplusApi.response_format', 'openaiApi.text', 'deerflowApi.text']),
  chatToolsJson: new Set(['byteplusApi.tools', 'openaiApi.tools', 'deerflowApi.tools']),
  chatToolChoiceJson: new Set(['byteplusApi.tool_choice', 'openaiApi.tool_choice', 'deerflowApi.tool_choice']),
  chatStreamOptionsJson: new Set(['byteplusApi.stream_options']),
}

const SHARED_BYTEPLUS_CREDENTIAL_VALUE_KEYS = [
  'chatAuthMode',
  'chatApiKey',
  'chatEndpointUrl',
] as const

function resolveIntegrationEntryMeta(entry: typeof INTEGRATION_API_DOC_ENTRIES[number]) {
  if (String(entry.meta.key || '').trim() === 'openaiApi.provider') {
    return {
      ...entry.meta,
      read: () => 'openai',
    }
  }
  if (String(entry.meta.key || '').trim() === 'openaiImageApi.provider') {
    return {
      ...entry.meta,
      read: () => 'openai',
    }
  }
  if (String(entry.meta.key || '').trim() === 'byteplusApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_BYTEPLUS,
    }
  }
  if (String(entry.meta.key || '').trim() === 'deerflowApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_DEERFLOW,
    }
  }
  if (String(entry.meta.key || '').trim() === 'miromindApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_MIROMIND,
    }
  }
  if (String(entry.meta.key || '').trim() === 'agnesApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_AGNES,
    }
  }
  if (String(entry.meta.key || '').trim() === 'sealionApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_SEALION,
    }
  }
  if (String(entry.meta.key || '').trim() === 'qwenApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_QWEN,
    }
  }
  if (String(entry.meta.key || '').trim() === 'googleCloudApi.provider') {
    return {
      ...entry.meta,
      read: () => CHAT_PROVIDER_GOOGLE_CLOUD,
    }
  }
  if (String(entry.meta.key || '').trim() === 'byteplusApi.model') {
    const mapped = SETTINGS_REGISTRY_BY_KEY.get('chatModel')
    if (mapped) return mapped
  }
  const mappedMeta = entry.valueKey ? SETTINGS_REGISTRY_BY_KEY.get(entry.valueKey) : undefined
  if (mappedMeta) {
    const rowKey = String(entry.meta.key || '').trim()
    if (rowKey === 'openaiApi.model') {
      return {
        ...mappedMeta,
        options: [...CHAT_OPENAI_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'deerflowApi.model') {
      return {
        ...mappedMeta,
        options: [...CHAT_DEERFLOW_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'miromindApi.model') {
      return {
        ...mappedMeta,
        options: [...CHAT_MIROMIND_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'agnesApi.model') {
      return {
        ...mappedMeta,
        options: [...CHAT_AGNES_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'sealionApi.model') {
      return {
        ...mappedMeta,
        options: [...CHAT_SEALION_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'qwenApi.model') {
      return {
        ...mappedMeta,
        read: () => CHAT_QWEN_MODEL_OPTIONS[0],
        options: [...CHAT_QWEN_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'qwenApi.endpoint_url') {
      return {
        ...mappedMeta,
        options: [...CHAT_QWEN_ENDPOINT_OPTIONS],
      }
    }
    if (rowKey === 'googleCloudApi.model') {
      return {
        ...mappedMeta,
        options: [...CHAT_GOOGLE_CLOUD_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'googleCloudApi.endpoint_url') {
      return {
        ...mappedMeta,
        options: [...CHAT_GOOGLE_CLOUD_ENDPOINT_OPTIONS],
      }
    }
    if (rowKey === 'openaiApi.reasoning_effort' || rowKey === 'deerflowApi.reasoning_effort') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_REASONING_EFFORT_OPTIONS],
      }
    }
    if (rowKey === 'byteplusApi.reasoning_effort') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_REASONING_EFFORT_OPTIONS],
      }
    }
    if (rowKey === 'byteplusApi.thinking.type') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_THINKING_TYPE_OPTIONS],
      }
    }
    if (rowKey === 'byteplusImageApi.model') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_IMAGE_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'byteplusImageApi.optimize_prompt_options') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_IMAGE_OPTIMIZE_OPTIONS],
      }
    }
    if (rowKey === 'byteplusVideoApi.content.image_url.url') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_VIDEO_IMAGE_URL_KIND_OPTIONS],
      }
    }
    if (rowKey === 'byteplusImageApi.output_format') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_IMAGE_OUTPUT_FORMAT_OPTIONS],
      }
    }
    if (rowKey === 'byteplusImageApi.response_format') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_IMAGE_RESPONSE_FORMAT_OPTIONS],
      }
    }
    if (rowKey === 'byteplusVideoApi.ratio') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_VIDEO_RATIO_OPTIONS],
      }
    }
    if (rowKey === 'byteplusVideoApi.resolution') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_BYTEPLUS_VIDEO_RESOLUTION_OPTIONS],
      }
    }
    if (rowKey === 'grabmaps.auth_mode') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GRABMAPS_AUTH_MODE_OPTIONS],
      }
    }
    if (rowKey === 'grabmaps.mcp.nearby_search.rank_by') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GRABMAPS_NEARBY_RANK_BY_OPTIONS],
      }
    }
    if (rowKey === 'geminiVideoApi.model') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GEMINI_VIDEO_MODEL_OPTIONS],
      }
    }
    if (rowKey === 'geminiVideoApi.aspectRatio') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GEMINI_VIDEO_ASPECT_RATIO_OPTIONS],
      }
    }
    if (rowKey === 'geminiVideoApi.resolution') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GEMINI_VIDEO_RESOLUTION_OPTIONS],
      }
    }
    if (rowKey === 'geminiVideoApi.durationSeconds') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GEMINI_VIDEO_DURATION_OPTIONS],
      }
    }
    if (rowKey === 'geminiVideoApi.personGeneration') {
      return {
        ...mappedMeta,
        options: [...INTEGRATION_GEMINI_VIDEO_PERSON_GENERATION_OPTIONS],
      }
    }
    if (mappedMeta.type !== 'json') return mappedMeta
    const ownerRowKeys = entry.valueKey ? INTEGRATION_JSON_OWNER_ROW_KEYS_BY_VALUE_KEY[entry.valueKey] : undefined
    if (!ownerRowKeys || ownerRowKeys.has(entry.meta.key)) return mappedMeta
  }
  const normalizedEntryKey = String(entry.meta.key || '').trim().toLowerCase()
  const isReferenceRow =
    normalizedEntryKey.endsWith('.docs_url')
    || normalizedEntryKey.endsWith('.endpoint')
    || normalizedEntryKey.endsWith('.polling_endpoint')
  return buildMainPanelVirtualSettingMeta({
    key: entry.meta.key,
    type: entry.meta.type,
    fallbackValue:
      typeof entry.tooltipDefaultValue !== 'undefined'
        ? entry.tooltipDefaultValue
        : entry.value,
    defaultValue: entry.tooltipDefaultValue,
    options: 'options' in entry.meta ? entry.meta.options : undefined,
    kind: isReferenceRow ? 'reference' : 'request',
  })
}

function resolveIntegrationEntryStateKey(entry: typeof INTEGRATION_API_DOC_ENTRIES[number]) {
  const resolvedMeta = resolveIntegrationEntryMeta(entry)
  const usesMappedDisplayValue = Boolean(
    entry.valueKey
    && SETTINGS_REGISTRY_BY_KEY.get(entry.valueKey)?.key === resolvedMeta.key,
  )
  return {
    resolvedMeta,
    stateKey: usesMappedDisplayValue && entry.valueKey ? entry.valueKey : resolvedMeta.key,
    usesMappedDisplayValue,
  }
}


const PAYMENTS_API_DOC_ENTRIES = [
  ...STRIPE_PAYMENT_API_REQUEST_DOC_ENTRIES,
] as const

type SettingsViewDocMappedEntry = {
  meta: SettingsEntry['meta']
  value?: string | number | boolean
  valueKey?: string
  tooltipDefaultValue?: string | number | boolean | null
}

function buildSettingsViewDocMappedEntries(): SettingsViewDocMappedEntry[] {
  const mapsAndMcpDocEntries = [...MAPS_API_DOC_ENTRIES, ...GRABMAPS_DIRECTIONS_REQUEST_DOC_ENTRIES]
  return [
    ...PAYMENTS_API_DOC_ENTRIES,
    ...mapsAndMcpDocEntries,
    ...buildMcpDocEntries(mapsAndMcpDocEntries),
  ]
}

function resolveDocMappedEntryStateKey(entry: SettingsViewDocMappedEntry) {
  const resolvedMeta = resolveDocMappedEntryMeta(entry)
  const usesMappedDisplayValue = Boolean(
    entry.valueKey
    && SETTINGS_REGISTRY_BY_KEY.get(entry.valueKey)?.key === resolvedMeta.key,
  )
  return {
    resolvedMeta,
    stateKey: usesMappedDisplayValue && entry.valueKey ? entry.valueKey : resolvedMeta.key,
  }
}

export function useSettingsView({
  searchQuery,
  onRegisterActions,
  mode = 'all',
  paymentsProviderId,
}: {
  searchQuery: string
  onRegisterActions?: (a: {
    apply: () => void
    reset: () => void
    globalReset?: () => void
    collapseAll?: () => void
    expandAll?: () => void
    allCollapsed?: boolean
  }) => void
  mode?: SettingsViewMode
  paymentsProviderId?: string
}) {
  const shouldHideSetting = React.useCallback((key: string, area?: string) => {
    if (key === 'infiniteCanvasInteractionMode') return false
    if (key === 'canvasWorkspaceSyncMode') return false
    if (key === 'wheelZoomCtrlMetaBoostMultiplier') return false
    if (key.startsWith('flowWheelZoom')) return false
    if (key === 'canvas3dMode') return false
    if (key === 'canvasRenderMode') return true
    if (key === 'multiDimTableModeEnabled') return true
    if (key === 'import.json.workspaceTarget') return true
    if (key === 'three.graph.edgeRenderer') return true
    if (key === 'three.preset.presentation3d') return true
    if (key === 'integrationConfigsJson') return false
    if (key.startsWith('graph.behavior.')) return true
    const a = String(area || '')
    if (
      a === 'Canvas Rendering'
      || a === 'Canvas Interaction'
      || a === '3D Presets'
    ) {
      return true
    }
    return false
  }, [])

  const flowDetailsRuntime = useSettingsFlowDetails()
  const { flow } = flowDetailsRuntime
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [values, setValues] = React.useState<Record<string, string | number | boolean>>(() => {
    const v: Record<string, string | number | boolean> = {}
    settingsRegistry.forEach(s => {
      const r = s.read()
      if (r !== null) v[s.key] = r
    })
    INTEGRATION_API_DOC_ENTRIES.forEach(entry => {
      const { resolvedMeta, stateKey } = resolveIntegrationEntryStateKey(entry)
      if (typeof v[stateKey] !== 'undefined') return
      const current = resolvedMeta.read()
      if (current !== null) v[stateKey] = current
    })
    buildSettingsViewDocMappedEntries().forEach(entry => {
      const { resolvedMeta, stateKey } = resolveDocMappedEntryStateKey(entry)
      if (typeof v[stateKey] !== 'undefined') return
      const current = resolvedMeta.read()
      if (current !== null) v[stateKey] = current
    })
    return v
  })
  const dirtyRef = React.useRef<Set<string>>(new Set())
  const schema = useGraphStore(s => s.schema)
  const setSchema = useGraphStore(s => s.setSchema)
  const uiPanelKeyValueInputClass = useGraphStore(
    s =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass,
  )
  const uiPanelMonospaceTextClass = useGraphStore(s => s.uiPanelMonospaceTextClass || 'font-mono text-xs')
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME)

  const applyAll = React.useCallback(() => {
    const dirty = Array.from(dirtyRef.current)
    dirty.forEach((key) => {
      const meta = SETTINGS_REGISTRY_BY_KEY.get(key)
      const virtualMeta =
        (() => {
          const integrationEntry = INTEGRATION_API_DOC_ENTRIES.find(entry => {
            const resolvedMeta = resolveIntegrationEntryMeta(entry)
            return resolvedMeta.key === key
          })
          return integrationEntry ? resolveIntegrationEntryMeta(integrationEntry) : undefined
        })()
        || (() => {
          const docEntry = buildSettingsViewDocMappedEntries().find(entry => {
            const { resolvedMeta, stateKey } = resolveDocMappedEntryStateKey(entry)
            return resolvedMeta.key === key || stateKey === key
          })
          return docEntry ? resolveDocMappedEntryMeta(docEntry) : undefined
        })()
      const writeTarget = meta || virtualMeta
      if (!writeTarget || !writeTarget.write) return
      const desired = values[key]
      const current = writeTarget.read()
      if (desired !== current) writeTarget.write(desired)
    })
    const next: Record<string, string | number | boolean> = { ...values }
    settingsRegistry.forEach(s => {
      if (dirtyRef.current.has(s.key)) {
        const current = s.read()
        if (current !== null) next[s.key] = current
      }
    })
    INTEGRATION_API_DOC_ENTRIES.forEach(entry => {
      const resolvedMeta = resolveIntegrationEntryMeta(entry)
      if (!dirtyRef.current.has(resolvedMeta.key)) return
      const current = resolvedMeta.read()
      if (current !== null) next[resolvedMeta.key] = current
    })
    buildSettingsViewDocMappedEntries().forEach(entry => {
      const { resolvedMeta, stateKey } = resolveDocMappedEntryStateKey(entry)
      if (!dirtyRef.current.has(resolvedMeta.key) && !dirtyRef.current.has(stateKey)) return
      const current = resolvedMeta.read()
      if (current !== null) next[stateKey] = current
    })
    setValues(next)
    dirtyRef.current.clear()
  }, [values])

  const resetToDefaults = React.useCallback(() => {
    settingsRegistry.forEach(s => {
      if (!s.write || !s.default) return
      const def = s.default()
      if (def !== null) s.write(def)
    })
    INTEGRATION_API_DOC_ENTRIES.forEach(entry => {
      const resolvedMeta = resolveIntegrationEntryMeta(entry)
      if (SETTINGS_REGISTRY_BY_KEY.has(resolvedMeta.key)) return
      if (!resolvedMeta.write || !resolvedMeta.default) return
      const def = resolvedMeta.default()
      if (def !== null) resolvedMeta.write(def)
    })
    buildSettingsViewDocMappedEntries().forEach(entry => {
      const resolvedMeta = resolveDocMappedEntryMeta(entry)
      if (SETTINGS_REGISTRY_BY_KEY.has(resolvedMeta.key)) return
      if (!resolvedMeta.write || !resolvedMeta.default) return
      const def = resolvedMeta.default()
      if (def !== null) resolvedMeta.write(def)
    })
    const next: Record<string, string | number | boolean> = {}
    settingsRegistry.forEach(s => {
      const r = s.read()
      if (r !== null) next[s.key] = r
    })
    INTEGRATION_API_DOC_ENTRIES.forEach(entry => {
      const { resolvedMeta, stateKey } = resolveIntegrationEntryStateKey(entry)
      if (typeof next[stateKey] !== 'undefined') return
      const current = resolvedMeta.read()
      if (current !== null) next[stateKey] = current
    })
    buildSettingsViewDocMappedEntries().forEach(entry => {
      const { resolvedMeta, stateKey } = resolveDocMappedEntryStateKey(entry)
      if (typeof next[stateKey] !== 'undefined') return
      const current = resolvedMeta.read()
      if (current !== null) next[stateKey] = current
    })
    setValues(next)
    dirtyRef.current.clear()
  }, [])

  const [chatHealthOk, setChatHealthOk] = React.useState<boolean | null>(null)
  const [chatHealthDetails, setChatHealthDetails] = React.useState<string | null>(null)
  const [isCheckingHealth, setIsCheckingHealth] = React.useState(false)

  const [bytePlusHealthOk, setBytePlusHealthOk] = React.useState<boolean | null>(null)
  const [bytePlusHealthDetails, setBytePlusHealthDetails] = React.useState<string | null>(null)
  const [isCheckingBytePlusHealth, setIsCheckingBytePlusHealth] = React.useState(false)
  const [grabMapsHealthOk, setGrabMapsHealthOk] = React.useState<boolean | null>(null)
  const [grabMapsHealthDetails, setGrabMapsHealthDetails] = React.useState<string | null>(null)
  const [isCheckingGrabMapsHealth, setIsCheckingGrabMapsHealth] = React.useState(false)
  const [deerFlowHealthOk, setDeerFlowHealthOk] = React.useState<boolean | null>(null)
  const [deerFlowHealthDetails, setDeerFlowHealthDetails] = React.useState<string | null>(null)
  const [isCheckingDeerFlowHealth, setIsCheckingDeerFlowHealth] = React.useState(false)
  const [bytePlusVideoModelPreviewText, setBytePlusVideoModelPreviewText] = React.useState<string | null>(null)
  const [isCheckingBytePlusVideoModelPreview, setIsCheckingBytePlusVideoModelPreview] = React.useState(false)
  const bytePlusVideoPreviewRequestRef = React.useRef(0)

  const checkChatHealth = React.useCallback(async () => {
    const url = values.chatEndpointUrl
    const healthUrl = resolveChatEndpointForHealth(url)
    if (!healthUrl) {
      setChatHealthOk(false)
      setChatHealthDetails('Endpoint URL is not configured.')
      return
    }
    setIsCheckingHealth(true)
    setChatHealthOk(null)
    setChatHealthDetails(null)
    try {
      const authMode = String(values.chatAuthMode || '').trim() === 'byok' ? 'byok' : 'serverManaged'
      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: buildChatProxyHeaders({
          provider: values.chatProvider,
          apiKey: authMode === 'byok' ? values.chatApiKey : null,
          endpointUrl: values.chatEndpointUrl,
          clientRequestId: `kg-chat-health-${Date.now().toString(36)}`,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        setChatHealthOk(true)
        const detail = data ? `OK: ${JSON.stringify(data)}` : 'OK'
        setChatHealthDetails(detail)
      } else {
        setChatHealthOk(false)
        setChatHealthDetails(`Error: ${res.status} ${res.statusText}`)
      }
    } catch (err: unknown) {
      setChatHealthOk(false)
      setChatHealthDetails(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCheckingHealth(false)
    }
  }, [values.chatAuthMode, values.chatApiKey, values.chatEndpointUrl, values.chatProvider])

  const checkBytePlusHealth = React.useCallback(async () => {
    const baseUrl = getChatDefaultEndpointUrlForProvider(CHAT_PROVIDER_BYTEPLUS)
    const healthUrl = resolveChatEndpointForHealth(baseUrl)
    if (!healthUrl) {
      setBytePlusHealthOk(false)
      setBytePlusHealthDetails('BytePlus endpoint is not configured.')
      return
    }
    setIsCheckingBytePlusHealth(true)
    setBytePlusHealthOk(null)
    setBytePlusHealthDetails(null)
    try {
      const authMode = String(values.chatAuthMode || '').trim() === 'byok' ? 'byok' : 'serverManaged'
      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: buildChatProxyHeaders({
          provider: CHAT_PROVIDER_BYTEPLUS,
          apiKey: authMode === 'byok' ? values.chatApiKey : null,
          endpointUrl: baseUrl,
          clientRequestId: `kg-byteplus-health-${Date.now().toString(36)}`,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        setBytePlusHealthOk(true)
        const detail = data ? `OK: ${JSON.stringify(data)}` : 'OK'
        setBytePlusHealthDetails(detail)
      } else {
        setBytePlusHealthOk(false)
        setBytePlusHealthDetails(`Error: ${res.status} ${res.statusText}`)
      }
    } catch (err: unknown) {
      setBytePlusHealthOk(false)
      setBytePlusHealthDetails(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCheckingBytePlusHealth(false)
    }
  }, [values.chatAuthMode, values.chatApiKey])

  const checkGrabMapsHealth = React.useCallback(async () => {
    const styleUrlRaw = String(values['maps.grabmaps.basemap.styleUrl'] || '').trim()
    if (!styleUrlRaw) {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails('GrabMaps style URL is not configured.')
      return
    }
    let target: URL
    try {
      target = new URL(styleUrlRaw)
    } catch {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails('GrabMaps style URL is invalid.')
      return
    }
    if (target.hostname.toLowerCase() !== 'maps.grab.com') {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails('GrabMaps health check requires a maps.grab.com style URL.')
      return
    }
    if (typeof window === 'undefined' || !window.location?.origin) {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails('Browser origin is unavailable.')
      return
    }
    const authMode = normalizeGrabMapsAuthMode(values['maps.grabmaps.authMode'])
    const apiKey = authMode === 'byok' ? sanitizeGrabMapsApiKey(values['maps.grabmaps.apiKey']) : ''
    if (authMode === 'byok' && !apiKey) {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails('GrabMaps BYOK API key is not configured.')
      return
    }
    const proxyUrl = toGrabMapsProxyUrl(target.toString())
    if (!proxyUrl) {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails('GrabMaps proxy URL could not be constructed.')
      return
    }
    const headers = buildGrabMapsProxyRequestHeadersFromAuth({ authMode, apiKey })
    setIsCheckingGrabMapsHealth(true)
    setGrabMapsHealthOk(null)
    setGrabMapsHealthDetails(null)
    try {
      const res = await fetch(proxyUrl, { method: 'GET', headers })
      if (res.ok) {
        setGrabMapsHealthOk(true)
        setGrabMapsHealthDetails(`OK: ${target.pathname}${target.search || ''}`)
      } else {
        setGrabMapsHealthOk(false)
        setGrabMapsHealthDetails(`Error: ${res.status} ${res.statusText}`)
      }
    } catch (err: unknown) {
      setGrabMapsHealthOk(false)
      setGrabMapsHealthDetails(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCheckingGrabMapsHealth(false)
    }
  }, [values])

  const checkDeerFlowHealth = React.useCallback(async () => {
    const baseUrl = getChatDefaultEndpointUrlForProvider(CHAT_PROVIDER_DEERFLOW)
    const healthUrl = resolveChatEndpointForHealth(baseUrl)
    if (!healthUrl) {
      setDeerFlowHealthOk(false)
      setDeerFlowHealthDetails('DeerFlow endpoint is not configured.')
      return
    }
    setIsCheckingDeerFlowHealth(true)
    setDeerFlowHealthOk(null)
    setDeerFlowHealthDetails(null)
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        headers: buildChatProxyHeaders({
          provider: CHAT_PROVIDER_DEERFLOW,
          apiKey: null,
          endpointUrl: baseUrl,
          clientRequestId: `kg-deerflow-health-${Date.now().toString(36)}`,
        }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        setDeerFlowHealthOk(true)
        const detail = data ? `OK: ${JSON.stringify(data)}` : 'OK'
        setDeerFlowHealthDetails(detail)
      } else {
        setDeerFlowHealthOk(false)
        setDeerFlowHealthDetails(`Error: ${res.status} ${res.statusText}`)
      }
    } catch (err: unknown) {
      setDeerFlowHealthOk(false)
      setDeerFlowHealthDetails(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsCheckingDeerFlowHealth(false)
    }
  }, [])

  const checkBytePlusVideoModelPreview = React.useCallback(async () => {
    const authMode = String(values.chatAuthMode || '').trim() === 'byok' ? 'byok' : 'serverManaged'
    const apiKey = authMode === 'byok' ? String(values.chatApiKey || '').trim() : ''
    if (authMode === 'byok' && !apiKey) {
      setBytePlusVideoModelPreviewText('Resolved /models candidate: enter BytePlus BYOK API key to preview the exact accessible model id.')
      setIsCheckingBytePlusVideoModelPreview(false)
      return
    }
    const requestId = bytePlusVideoPreviewRequestRef.current + 1
    bytePlusVideoPreviewRequestRef.current = requestId
    setIsCheckingBytePlusVideoModelPreview(true)
    try {
      const preview = await resolveBytePlusVideoModelPreview(
        {
          provider: CHAT_PROVIDER_BYTEPLUS,
          endpointUrl: getChatDefaultEndpointUrlForProvider(CHAT_PROVIDER_BYTEPLUS),
          apiKey: authMode === 'byok' ? apiKey : null,
        },
        values.byteplusVideoModel,
      )
      if (bytePlusVideoPreviewRequestRef.current !== requestId) return
      const selected = String(preview.preferredModel || '').trim()
      const resolved = String(preview.resolvedModel || '').trim()
      const selectedLabel = selected || 'BytePlus video default'
      const resolutionDetail = preview.matchedAvailableModel
        ? `Resolved /models candidate: ${resolved}`
        : `Resolved /models candidate: ${resolved} (no exact accessible /models match returned; using configured selection)`
      const selectedDetail = resolved && resolved !== selectedLabel
        ? `Selected video model: ${selectedLabel}`
        : `Selected video model: ${selectedLabel}`
      const availableDetail = preview.availableCount > 0
        ? `BytePlus /models entries checked: ${String(preview.availableCount)}`
        : 'BytePlus /models entries checked: unavailable'
      setBytePlusVideoModelPreviewText(`${resolutionDetail} | ${selectedDetail} | ${availableDetail}`)
    } catch (err: unknown) {
      if (bytePlusVideoPreviewRequestRef.current !== requestId) return
      setBytePlusVideoModelPreviewText(`Resolved /models candidate: unavailable (${err instanceof Error ? err.message : String(err)})`)
    } finally {
      if (bytePlusVideoPreviewRequestRef.current === requestId) {
        setIsCheckingBytePlusVideoModelPreview(false)
      }
    }
  }, [values.byteplusVideoModel, values.chatApiKey, values.chatAuthMode])

  const didAutoCheckHealthRef = React.useRef(false)
  React.useEffect(() => {
    if (mode !== 'integrations') return
    if (didAutoCheckHealthRef.current) return
    const isTestRun = (() => {
      try {
        const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
        return env?.KG_TEST_QUIET === '1'
      } catch {
        return false
      }
    })()
    if (isTestRun) return
    didAutoCheckHealthRef.current = true
    void checkChatHealth()
    const normalizedProvider = normalizeChatProviderId(values.chatProvider)
    if (normalizedProvider !== CHAT_PROVIDER_BYTEPLUS) {
      void checkBytePlusHealth()
    }
    if (normalizedProvider === CHAT_PROVIDER_DEERFLOW) {
      void checkDeerFlowHealth()
    }
    void checkBytePlusVideoModelPreview()
  }, [checkBytePlusVideoModelPreview, checkChatHealth, checkBytePlusHealth, checkDeerFlowHealth, mode, values.chatProvider])

  const didAutoCheckGrabMapsHealthRef = React.useRef(false)
  React.useEffect(() => {
    if (mode !== 'maps') return
    if (didAutoCheckGrabMapsHealthRef.current) return
    const isTestRun = (() => {
      try {
        const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
        return env?.KG_TEST_QUIET === '1'
      } catch {
        return false
      }
    })()
    if (isTestRun) return
    didAutoCheckGrabMapsHealthRef.current = true
    void checkGrabMapsHealth()
  }, [checkGrabMapsHealth, mode])

  React.useEffect(() => {
    if (mode !== 'integrations') return
    const timer = globalThis.setTimeout(() => {
      void checkBytePlusVideoModelPreview()
    }, 300)
    return () => {
      globalThis.clearTimeout(timer)
    }
  }, [checkBytePlusVideoModelPreview, mode])

  const onGlobalReset = React.useCallback(() => {
    try {
      const ok = typeof window !== 'undefined' ? window.confirm('Confirm reset: reset all settings and data') : true
      if (!ok) return
      resetToDefaults()
      useGraphStore.getState().resetAll()
    } catch { void 0 }
  }, [resetToDefaults])

  const normalizedProviderValuesByArea = React.useMemo(() => {
    const properties = values as Record<string, unknown>
    return new Map<string, Record<string, unknown>>([
      [BYTEPLUS_SHARED_TEXT_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'byteplus', properties })],
      [OPENAI_CHAT_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'openai', properties })],
      [DEERFLOW_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'deerflow', properties })],
      [MIROMIND_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'miromind', properties })],
      [AGNES_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'agnes', properties })],
      [SEALION_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'sealion', properties })],
      [QWEN_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'qwen', properties })],
      [GOOGLE_CLOUD_API_DOC_AREA, normalizeTextGenerationWidgetPropertiesForProviderFamily({ providerFamily: 'google-cloud', properties })],
    ])
  }, [values])

  const renderInput = (
    key: string,
    type: string,
    writable: boolean,
    options?: string[],
    displayValueOverride?: string | number | boolean,
  ) => renderSettingInput(key, type, writable, values, setValues, dirtyRef, options, displayValueOverride)

  const entries = React.useMemo(() => {
    const concreteEntries: SettingsEntry[] = settingsRegistry.map((s) => {
      const source = flow[s.key] || (s.docKey ? flow[s.docKey] : undefined)
      const details = {
        area: source?.area || FALLBACK_DETAILS[s.key]?.area || '—',
        modules: source?.modules || [],
        classes: source?.classes || [],
        functions: source?.functions || [],
        responsibility: source?.responsibility || FALLBACK_DETAILS[s.key]?.responsibility || '—',
        imports: source?.imports || [],
        notes: source?.notes || FALLBACK_DETAILS[s.key]?.notes || '',
      }
      const searchHints = getSettingsSearchHints(s.key)
      const index = normalizeText(
        [
          details.area,
          s.key,
          s.type,
          details.responsibility,
          ...(details.modules || []),
          ...(details.classes || []),
          ...(details.functions || []),
          ...(details.imports || []),
          details.notes || '',
          ...searchHints,
        ].join(' '),
      )
      const anchorId =
        s.key === 'uiIconScale'
          ? UI_ANCHORS.settingsUiIconScale
          : (s.key === 'chatApiKey' ? UI_ANCHORS.settingsChatApiKey : undefined)
      return { meta: s, details, writable: !!s.write, index, anchorId }
    })
    const virtualEntries: SettingsEntry[] = INTEGRATION_API_DOC_ENTRIES.map(entry => {
      const { resolvedMeta, stateKey: displayKey, usesMappedDisplayValue } = resolveIntegrationEntryStateKey(entry)
      const area = normalizeSettingsAreaLabel(entry.details.area)
      const normalizedDisplayValues = normalizedProviderValuesByArea.get(area) || values
      const anchorId =
        area === BYTEPLUS_SHARED_TEXT_API_DOC_AREA
          ? getBytePlusSharedTextApiRowAnchorId(entry.meta.key)
          : area === BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA
            ? getBytePlusImageGenerationApiRowAnchorId(entry.meta.key)
          : area === BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA
            ? getBytePlusVideoGenerationApiRowAnchorId(entry.meta.key)
          : area === GEMINI_VIDEO_GENERATION_API_DOC_AREA
            ? getGeminiVideoGenerationApiRowAnchorId(entry.meta.key)
          : area === SENSENOVA_API_DOC_AREA
            ? getSensenovaApiRowAnchorId(entry.meta.key)
          : area === VIDEODB_API_DOC_AREA
            ? getVideodbApiRowAnchorId(entry.meta.key)
          : area === MIROMIND_API_DOC_AREA
            ? getMiroMindApiRowAnchorId(entry.meta.key)
          : area === AGNES_API_DOC_AREA
            ? getAgnesApiRowAnchorId(entry.meta.key)
          : area === SEALION_API_DOC_AREA
            ? getSealionApiRowAnchorId(entry.meta.key)
          : area === QWEN_API_DOC_AREA
            ? getQwenApiRowAnchorId(entry.meta.key)
          : area === GOOGLE_CLOUD_API_DOC_AREA
            ? getGoogleCloudApiRowAnchorId(entry.meta.key)
          : area === OPENAI_CHAT_API_DOC_AREA
            ? getOpenAiChatApiRowAnchorId(entry.meta.key)
            : area === OPENAI_IMAGES_API_DOC_AREA
              ? getOpenAiImagesApiRowAnchorId(entry.meta.key)
            : area === DEERFLOW_API_DOC_AREA
              ? getDeerFlowApiRowAnchorId(entry.meta.key)
            : undefined
      const displayValue =
        usesMappedDisplayValue && entry.valueKey && Object.prototype.hasOwnProperty.call(normalizedDisplayValues, entry.valueKey)
          ? (normalizedDisplayValues[entry.valueKey] as string | number | boolean | undefined)
          : Object.prototype.hasOwnProperty.call(values, displayKey)
            ? (values[displayKey] as string | number | boolean | undefined)
            : undefined
      return {
        meta: entry.meta,
        details: entry.details,
        writable: Boolean(resolvedMeta.write),
        index: normalizeText(
          [
            entry.details.area,
            entry.meta.key,
            entry.valueKey,
            displayKey,
            entry.typeLabel,
            typeof displayValue !== 'undefined' ? String(displayValue) : entry.value,
            entry.details.responsibility,
            ...(entry.searchHints || []),
          ].join(' '),
        ),
        typeLabel: entry.typeLabel,
        valueKey: displayKey,
        valueDisplayOverride: displayValue,
        valueType: resolvedMeta.type,
        valueOptions: resolvedMeta.options,
        tooltipRole: entry.tooltipRole,
        tooltipActions: entry.tooltipActions,
        tooltipDefaultValue: entry.tooltipDefaultValue,
        tooltipMin: entry.tooltipMin,
        tooltipMax: entry.tooltipMax,
        tooltipInterval: entry.tooltipInterval,
        tooltipExpansionNote: entry.tooltipExpansionNote,
        tooltipContractionNote: entry.tooltipContractionNote,
        tooltipImpact: entry.tooltipImpact,
        anchorId,
      }
    })
    const paymentsVirtualEntries: SettingsEntry[] = PAYMENTS_API_DOC_ENTRIES.map(entry => (
      buildDocMappedEntry(entry, values, getStripePaymentApiRowAnchorId(entry.meta.key))
    ))

    const mapsAndMcpDocEntries = [...MAPS_API_DOC_ENTRIES, ...GRABMAPS_DIRECTIONS_REQUEST_DOC_ENTRIES]
    const mapsDocEntries = mapsAndMcpDocEntries.filter(entry => !isMcpOwnedSetting(entry.meta.key, entry.details.area))
    const mcpDocEntries = buildMcpDocEntries(mapsAndMcpDocEntries)
    const mapsVirtualEntries: SettingsEntry[] = mapsDocEntries.map(entry => (
      buildDocMappedEntry(entry, values, getMapsApiRowAnchorId(entry.meta.key))
    ))
    const mcpVirtualEntries: SettingsEntry[] = mcpDocEntries.map(entry => buildMcpVirtualEntry(entry, values))

    const hiddenConcreteIntegrationKeys = mode === 'integrations'
      ? new Set<string>([
          ...SHARED_BYTEPLUS_CREDENTIAL_VALUE_KEYS,
          ...BYTEPLUS_IMAGE_GENERATION_MAPPED_VALUE_KEYS,
          ...BYTEPLUS_VIDEO_GENERATION_MAPPED_VALUE_KEYS,
          ...GEMINI_VIDEO_GENERATION_MAPPED_VALUE_KEYS,
        ])
      : null
    const hiddenConcreteMapsKeys = new Set<string>(
      mapsDocEntries
        .map(entry => entry.valueKey)
        .filter((valueKey): valueKey is string => typeof valueKey === 'string' && valueKey.trim().length > 0),
    )
    const hiddenConcreteMcpKeys = new Set<string>(
      mcpDocEntries
        .map(entry => entry.valueKey)
        .filter((valueKey): valueKey is string => typeof valueKey === 'string' && valueKey.trim().length > 0),
    )
    const allEntries = [
      ...concreteEntries.filter(entry => {
        if (!entry.writable) return false
        if (hiddenConcreteIntegrationKeys && hiddenConcreteIntegrationKeys.has(entry.meta.key)) return false
        if (hiddenConcreteMapsKeys.has(entry.meta.key)) return false
        if (hiddenConcreteMcpKeys.has(entry.meta.key)) return false
        return true
      }),
      ...virtualEntries,
      ...paymentsVirtualEntries,
      ...mapsVirtualEntries,
      ...mcpVirtualEntries,
    ]
    const filteredByMode = allEntries
      .filter(entry => !shouldHideSetting(entry.meta.key, entry.details.area))
      .filter(entry => {
        const isIntegrationsOwned = isIntegrationsOwnedSetting(entry.meta.key, entry.details.area)
        const isPaymentsOwned = isPaymentsOwnedSetting(entry.meta.key, entry.details.area)
        const isMapsOwned = isMapsOwnedSetting(entry.meta.key, entry.details.area)
        const isMcpOwned = isMcpOwnedSetting(entry.meta.key, entry.details.area)
        if (mode === 'integrations') return isIntegrationsOwned
        if (mode === 'maps') return isMapsOwned
        if (mode === 'mcp') return isMcpOwned
        if (mode === 'payments') {
          if (!isPaymentsOwned) return false
          return !entry.meta.key.startsWith('payments.')
        }
        return !isIntegrationsOwned && !isPaymentsOwned && !isMapsOwned && !isMcpOwned
      })
    if (mode !== 'payments') return filteredByMode

    const providerArea = resolvePaymentsProviderSpec(paymentsProviderId).areaLabel
    return filteredByMode.filter(entry => normalizeSettingsAreaLabel(entry.details.area) === providerArea)
  }, [flow, mode, normalizedProviderValuesByArea, paymentsProviderId, shouldHideSetting, values])

  const normalizedQuery = React.useMemo(() => normalizeText(searchQuery).trim(), [searchQuery])
  const filtered = React.useMemo(
    () => (normalizedQuery ? entries.filter(e => e.index.includes(normalizedQuery)) : entries),
    [entries, normalizedQuery],
  )

  const [collapsedByArea, setCollapsedByArea] = React.useState<Record<string, boolean>>(() => {
    const storage = getLocalStorage()
    return loadSettingsCollapsedByArea(storage)
  })
  const saveCollapsed = React.useCallback((next: Record<string, boolean>) => {
    const storage = getLocalStorage()
    persistSettingsCollapsedByArea(storage, next)
  }, [])
  const groupByArea = React.useMemo(() => {
    const sortEntries = (entriesByArea: SettingsEntry[]) =>
      [...entriesByArea].sort((a, b) =>
        String(a.meta.key || '').localeCompare(String(b.meta.key || ''), undefined, { sensitivity: 'base' }),
      )
    if (mode === 'integrations') {
      const sectionSpecs: ReadonlyArray<{
        title: string
        searchIndex: string
        match: (entry: SettingsEntry) => boolean
      }> = [
        {
          title: 'Chat',
          searchIndex: normalizeText('Chat FloatingPanel Chat UI chatContextScope integrationConfigsJson'),
          match: (entry) => {
            const area = normalizeSettingsAreaLabel(entry.details.area)
            return area === 'Chat' || area === 'Integrations'
          },
        },
        {
          title: BYTEPLUS_SHARED_TEXT_API_DOC_AREA,
          searchIndex: normalizeText('BytePlus Shared + Text API BytePlus Chat API ModelArk FloatingPanel Props Panel Widget Card text generation shared auth api key endpoint'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === BYTEPLUS_SHARED_TEXT_API_DOC_AREA,
        },
        {
          title: BYTEPLUS_MODELARK_MCP_DOC_AREA,
          searchIndex: normalizeText('BytePlus ModelArk Remote MCP cloud-deployed MCP Responses API server_label server_url Streamable HTTP ARK_API_KEY beta header'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === BYTEPLUS_MODELARK_MCP_DOC_AREA,
        },
        {
          title: MIROMIND_API_DOC_AREA,
          searchIndex: normalizeText('MiroMind API deep research chat completions reasoning steps mcp_servers floatingpanel chat markdown frontmatter'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === MIROMIND_API_DOC_AREA,
        },
        {
          title: AGNES_API_DOC_AREA,
          searchIndex: normalizeText('Agnes AI API agnes-2.0-flash shared chat completions sse json chunks floatingpanel chat markdown yaml frontmatter source files storyboard widget storyboard animatic'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === AGNES_API_DOC_AREA,
        },
        {
          title: SEALION_API_DOC_AREA,
          searchIndex: normalizeText('AI Singapore SEA-LION API sea-lion sealion aisingapore Southeast Asian multilingual localization safety MCP sidecar Ollama Workers AI OpenAI-compatible chat completions'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === SEALION_API_DOC_AREA,
        },
        {
          title: QWEN_API_DOC_AREA,
          searchIndex: normalizeText('Qwen API Alibaba Cloud Model Studio DashScope OpenAI-compatible chat completions qwen-plus qwen3-max qwen-flash floatingpanel chat markdown yaml frontmatter source files storyboard widget'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === QWEN_API_DOC_AREA,
        },
        {
          title: GOOGLE_CLOUD_API_DOC_AREA,
          searchIndex: normalizeText('Google Cloud Vertex AI API GCP Gemini OpenAI-compatible chat completions endpoints openapi google/gemini floatingpanel chat markdown yaml frontmatter source files storyboard widget'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === GOOGLE_CLOUD_API_DOC_AREA,
        },
        {
          title: OPENAI_CHAT_API_DOC_AREA,
          searchIndex: normalizeText('OpenAI Chat API Responses FloatingPanel Props Panel Widget Card text generation'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === OPENAI_CHAT_API_DOC_AREA,
        },
        {
          title: OPENAI_IMAGES_API_DOC_AREA,
          searchIndex: normalizeText('OpenAI Images API FloatingPanel Props Panel OpenAI Image Widget image generation openaiImageApi model prompt size output_format'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === OPENAI_IMAGES_API_DOC_AREA,
        },
        {
          title: DEERFLOW_API_DOC_AREA,
          searchIndex: normalizeText('DeerFlow Gateway API OpenAI-compatible gateway local llm proxy cloudflare tunnel dev prod floatingpanel props panel text widget'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === DEERFLOW_API_DOC_AREA,
        },
        {
          title: BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA,
          searchIndex: normalizeText('BytePlus Video Generation API ModelArk FloatingPanel BytePlus Video Widget byteplusVideoApi.model byteplusVideoModel'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA,
        },
        {
          title: GEMINI_VIDEO_GENERATION_API_DOC_AREA,
          searchIndex: normalizeText('Gemini Veo Video Generation API Google FloatingPanel Gemini Video Widget geminiVideoApi.model geminiVideoModel'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === GEMINI_VIDEO_GENERATION_API_DOC_AREA,
        },
        {
          title: SENSENOVA_API_DOC_AREA,
          searchIndex: normalizeText('SenseNova API SenseTime text image video SenseChat artist-xl SenseAnim HMAC-SHA256 JWT MainPanel Integrations Strybldr VideoDB E2E'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === SENSENOVA_API_DOC_AREA,
        },
        {
          title: VIDEODB_API_DOC_AREA,
          searchIndex: normalizeText('VideoDB API upload index search stream async response collection video transcription scene x-access-token videodb'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === VIDEODB_API_DOC_AREA,
        },
        {
          title: BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
          searchIndex: normalizeText('BytePlus Image Generation API ModelArk FloatingPanel BytePlus Image Widget'),
          match: entry => normalizeSettingsAreaLabel(entry.details.area) === BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
        },
      ]
      return sectionSpecs.flatMap(({ title, searchIndex, match }) => {
        const entriesBySection = filtered.filter(match)
        const shouldInclude = entriesBySection.length > 0 || !normalizedQuery || searchIndex.includes(normalizedQuery)
        if (!shouldInclude) return []
        return [[title, sortEntries(entriesBySection)] as const]
      })
    }
    const map = new Map<string, typeof filtered>()
    filtered.forEach(entry => {
      const area = normalizeSettingsAreaLabel(entry.details.area)
      const normalizedEntry = area === entry.details.area
        ? entry
        : {
            ...entry,
            details: {
              ...entry.details,
              area,
            },
          }
      const list = map.get(area) || []
      list.push(normalizedEntry)
      map.set(area, list)
    })
    const grouped = Array.from(map.entries()).map(([area, entriesByArea]) => {
      const sortedEntries = sortEntries(entriesByArea)
      return [area, sortedEntries] as const
    })
    grouped.sort((a, b) => {
      const aw = settingsAreaSortWeight(a[0])
      const bw = settingsAreaSortWeight(b[0])
      if (aw !== bw) return aw - bw
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
    })
    return grouped
  }, [filtered, mode, normalizedQuery])
  const allCollapsed = React.useMemo(
    () => {
      if (groupByArea.length === 0) return true
      return groupByArea.every(([area]) => {
        const value = collapsedByArea[area]
        if (value === undefined) return true
        return value
      })
    },
    [groupByArea, collapsedByArea],
  )
  const collapseAll = React.useCallback(() => {
    const next: Record<string, boolean> = {}
    groupByArea.forEach(([area]) => { next[area] = true })
    setCollapsedByArea(next)
    saveCollapsed(next)
  }, [groupByArea, saveCollapsed])
  const expandAll = React.useCallback(() => {
    const next: Record<string, boolean> = {}
    groupByArea.forEach(([area]) => { next[area] = false })
    setCollapsedByArea(next)
    saveCollapsed(next)
  }, [groupByArea, saveCollapsed])
  const toggleArea = React.useCallback((area: string, next: boolean) => {
    setCollapsedByArea(prev => {
      const merged = { ...prev, [area]: next }
      saveCollapsed(merged)
      return merged
    })
  }, [saveCollapsed])

  React.useEffect(() => {
    if (onRegisterActions) {
      onRegisterActions({
        apply: applyAll,
        reset: resetToDefaults,
        globalReset: onGlobalReset,
        collapseAll,
        expandAll,
        allCollapsed,
      })
    }
  }, [onRegisterActions, applyAll, resetToDefaults, onGlobalReset, collapseAll, expandAll, allCollapsed])

  return {
    flowDetailsRuntime,
    expanded,
    setExpanded,
    values,
    setValues,
    dirtyRef,
    schema,
    setSchema,
    uiPanelKeyValueInputClass,
    uiPanelMonospaceTextClass,
    uiPanelKeyValueTextSizeClass,
    chatHealthOk,
    chatHealthDetails,
    isCheckingHealth,
    checkChatHealth,
    bytePlusHealthOk,
    bytePlusHealthDetails,
    isCheckingBytePlusHealth,
    checkBytePlusHealth,
    grabMapsHealthOk,
    grabMapsHealthDetails,
    isCheckingGrabMapsHealth,
    checkGrabMapsHealth,
    deerFlowHealthOk,
    deerFlowHealthDetails,
    isCheckingDeerFlowHealth,
    checkDeerFlowHealth,
    bytePlusVideoModelPreviewText,
    isCheckingBytePlusVideoModelPreview,
    checkBytePlusVideoModelPreview,
    onGlobalReset,
    renderInput,
    entries,
    normalizedQuery,
    filtered,
    collapsedByArea,
    setCollapsedByArea,
    saveCollapsed,
    groupByArea,
    allCollapsed,
    collapseAll,
    expandAll,
    toggleArea,
  }
}
