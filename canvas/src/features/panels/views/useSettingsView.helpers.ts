import type { FlowDetails } from '@/features/settings/types'
import { settingsRegistry } from '@/features/settings/registry'
import { normalized as normalizeText } from '@/features/panels/utils/json'
import { buildMainPanelVirtualSettingMeta } from '@/features/panels/mainPanelVirtualSettings'
import { BYTEPLUS_SHARED_TEXT_API_DOC_AREA } from './byteplusSharedTextApiDocs'
import { OPENAI_CHAT_API_DOC_AREA } from './openaiChatApiDocs'
import { OPENAI_IMAGES_API_DOC_AREA } from './openaiImagesApiDocs'
import { MIROMIND_API_DOC_AREA } from './miromindApiDocs'
import { AGNES_API_DOC_AREA } from './agnesApiDocs'
import { SEALION_API_DOC_AREA } from './sealionApiDocs'
import { QWEN_API_DOC_AREA } from './qwenApiDocs'
import { Z_AI_API_DOC_AREA } from './zAiApiDocs'
import { GOOGLE_CLOUD_API_DOC_AREA } from './googleCloudApiDocs'
import {
  BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
} from './byteplusImageGenerationApiDocs'
import {
  BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA,
} from './byteplusVideoGenerationApiDocs'
import {
  GEMINI_VIDEO_GENERATION_API_DOC_AREA,
} from './geminiVideoGenerationApiDocs'
import {
  MAPS_GRABMAPS_DOC_AREA,
  MAPS_GEO_DOC_AREA,
  MAPS_MAPLIBRE_DOC_AREA,
} from './mapsApiDocs'
import { MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA } from './grabmapsDirectionsApiDocs'
import { MAPS_GRABMAPS_MCP_DOC_AREA } from './grabmapsMcpApiDocs'
import { API_NATIVE_BROWSER_MCP_DOC_AREA } from './apiNativeBrowserMcpApiDocs'
import { AGENTIC_OS_TOOL_SERVER_DOC_AREA } from './agentic-graph-tool-server-docs'
import { TRADING_RUNTIME_GATEWAY_DOC_AREA } from './tradingRuntimeGatewayDocs'
import { EXTERNAL_MCP_TOOL_SERVER_DOC_AREA } from './externalMcpToolServerDocs'
import { CRAWLER_ACCESS_MCP_DOC_AREA } from './crawlerAccessMcpApiDocs'
import { CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA } from './cloudflareAiGatewayMcpApiDocs'
import { BYTEPLUS_MODELARK_MCP_DOC_AREA } from './byteplusModelArkMcpApiDocs'
import { OPENAI_MCP_DOC_AREA } from './openaiMcpApiDocs'
import { EXA_MCP_DOC_AREA } from './exaMcpApiDocs'
import { MOOMOO_MARKET_MCP_DOC_AREA } from './moomooMarketMcpApiDocs'
import { EXA_SEARCH_API_DOC_AREA } from './exaSearchApiDocs'
import { FEISHU_BASE_MCP_DOC_AREA } from './feishuBaseMcpApiDocs'
import { LARK_APP_MCP_DOC_AREA } from './larkAppMcpApiDocs'
import { STRIPE_MCP_DOC_AREA } from './stripeMcpApiDocs'
import { SEALION_MCP_DOC_AREA } from './sealionMcpApiDocs'
import { AGENTIC_OS_VDEOXPLN_DOC_AREA } from './vdeoxplnMcpApiDocs'
import { VIDEODB_MCP_DOC_AREA } from './videodbMcpApiDocs'
import { OPERATOR_DEPLOY_MCP_DOC_AREA } from '@/features/settings/operatorDeploySsot'
import { VIDEODB_API_DOC_AREA } from '@/features/integrations/videodbSsot'
import { SENSENOVA_API_DOC_AREA } from '@/features/integrations/sensenovaSsot'
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy'

export type SettingsEntry = {
  meta: {
    key: string
    type: string
    source: string
    read: () => string | number | boolean | null
    write?: (value: string | number | boolean) => void
    docKey?: string
    default?: () => string | number | boolean | null
    options?: string[]
  }
  details: FlowDetails
  writable: boolean
  index: string
  anchorId?: string
  typeLabel?: string
  valueKey?: string
  valueDisplayOverride?: string | number | boolean
  valueType?: string
  valueOptions?: string[]
  tooltipRole?: string
  tooltipActions?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  tooltipExpansionNote?: string
  tooltipContractionNote?: string
  tooltipImpact?: string
}

export const SETTINGS_REGISTRY_BY_KEY = new Map(settingsRegistry.map(setting => [setting.key, setting] as const))
export const SETTINGS_REGISTRY_BY_VALUE_KEY = SETTINGS_REGISTRY_BY_KEY

const SETTINGS_AREA_ORDER: readonly string[] = [
  'Chat',
  'UI Density: Panels',
  'UI Density: Icons',
  MAPS_GRABMAPS_DOC_AREA,
  API_NATIVE_BROWSER_MCP_DOC_AREA,
  AGENTIC_OS_TOOL_SERVER_DOC_AREA,
  TRADING_RUNTIME_GATEWAY_DOC_AREA,
  EXTERNAL_MCP_TOOL_SERVER_DOC_AREA,
  CRAWLER_ACCESS_MCP_DOC_AREA,
  CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA,
  BYTEPLUS_MODELARK_MCP_DOC_AREA,
  OPENAI_MCP_DOC_AREA,
  EXA_MCP_DOC_AREA,
  MOOMOO_MARKET_MCP_DOC_AREA,
  FEISHU_BASE_MCP_DOC_AREA,
  LARK_APP_MCP_DOC_AREA,
  STRIPE_MCP_DOC_AREA,
  SEALION_MCP_DOC_AREA,
  AGENTIC_OS_VDEOXPLN_DOC_AREA,
  OPERATOR_DEPLOY_MCP_DOC_AREA,
  VIDEODB_MCP_DOC_AREA,
  MAPS_GRABMAPS_MCP_DOC_AREA,
  MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA,
  MAPS_GEO_DOC_AREA,
  MAPS_MAPLIBRE_DOC_AREA,
  'Workspace',
  'Source File Management',
  'Markdown',
  'Storyboard Widget',
  'Canvas',
  'Rendering',
  'Performance',
  MARKDOWN_DATA_VIEW_COPY.titleDefault,
  'Import / Export',
  'Integrations',
  EXA_SEARCH_API_DOC_AREA,
  BYTEPLUS_SHARED_TEXT_API_DOC_AREA,
  BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
  BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA,
  GEMINI_VIDEO_GENERATION_API_DOC_AREA,
  SENSENOVA_API_DOC_AREA,
  VIDEODB_API_DOC_AREA,
  MIROMIND_API_DOC_AREA,
  AGNES_API_DOC_AREA,
  SEALION_API_DOC_AREA,
  QWEN_API_DOC_AREA,
  Z_AI_API_DOC_AREA,
  GOOGLE_CLOUD_API_DOC_AREA,
  OPENAI_CHAT_API_DOC_AREA,
  OPENAI_IMAGES_API_DOC_AREA,
]

const SETTINGS_AREA_CANONICAL: Readonly<Record<string, string>> = {
  'ui density panels': 'UI Density: Panels',
  'ui density panel': 'UI Density: Panels',
  'ui density icons': 'UI Density: Icons',
  'multi dimensional table': MARKDOWN_DATA_VIEW_COPY.titleDefault,
  'multi-dimensional table': MARKDOWN_DATA_VIEW_COPY.titleDefault,
  'import export': 'Import / Export',
  'source file management': 'Source File Management',
  'source files management': 'Source File Management',
  integrations: 'Integrations',
}

export function normalizeSettingsAreaLabel(areaRaw: string): string {
  const area = String(areaRaw || '').trim()
  if (!area) return '—'
  const key = area.toLowerCase().replace(/[/:]+/g, ' ').replace(/\s+/g, ' ').trim()
  return SETTINGS_AREA_CANONICAL[key] || area
}

export function settingsAreaSortWeight(area: string): number {
  const idx = SETTINGS_AREA_ORDER.indexOf(area)
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER
}

export {
  isIntegrationsOwnedSetting,
  isMapsOwnedSetting,
  isMcpOwnedSetting,
  isPaymentsOwnedSetting,
} from './settingsOwnershipRegistry'

export function buildDocMappedEntry(
  entry: {
    meta: SettingsEntry['meta']
    details: FlowDetails
    typeLabel?: string
    value?: string | number | boolean
    valueKey?: string
    searchHints?: readonly string[]
    tooltipRole?: string
    tooltipActions?: string[]
    tooltipDefaultValue?: string | number | boolean | null
    tooltipMin?: string | number
    tooltipMax?: string | number
    tooltipInterval?: string | number
    tooltipExpansionNote?: string
    tooltipContractionNote?: string
    tooltipImpact?: string
  },
  values: Record<string, string | number | boolean>,
  anchorId: string | undefined,
): SettingsEntry {
  const resolvedMeta = resolveDocMappedEntryMeta(entry)
  const hasRegistryValueKey = Boolean(entry.valueKey && SETTINGS_REGISTRY_BY_VALUE_KEY.has(entry.valueKey))
  const stateKey = hasRegistryValueKey
    ? entry.valueKey
    : resolvedMeta.key
  const rawDisplayValue = Object.prototype.hasOwnProperty.call(values, stateKey)
    ? (values[stateKey] as string | number | boolean | undefined)
    : undefined
  const hasDisplayValue =
    typeof rawDisplayValue === 'boolean'
    || typeof rawDisplayValue === 'number'
    || (typeof rawDisplayValue === 'string' && rawDisplayValue.trim().length > 0)
  const valueDisplayOverride = hasDisplayValue ? rawDisplayValue : entry.value
  return {
    meta: entry.meta,
    details: entry.details,
    writable: Boolean(resolvedMeta.write),
    index: normalizeText(
      [
        entry.details.area,
        entry.meta.key,
        entry.typeLabel,
        typeof valueDisplayOverride === 'undefined' ? '' : String(valueDisplayOverride),
        entry.details.responsibility,
        ...(entry.searchHints || []),
      ].join(' '),
    ),
    typeLabel: entry.typeLabel,
    valueKey: stateKey,
    valueDisplayOverride,
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
}

export function resolveDocMappedEntryMeta(entry: {
  meta: SettingsEntry['meta']
  value?: string | number | boolean
  valueKey?: string
  tooltipDefaultValue?: string | number | boolean | null
}): SettingsEntry['meta'] {
  const mappedMeta = entry.valueKey
    ? SETTINGS_REGISTRY_BY_VALUE_KEY.get(entry.valueKey)
    : undefined
  if (mappedMeta) return mappedMeta
  return buildMainPanelVirtualSettingMeta({
    key: entry.meta.key,
    type: entry.meta.type,
    fallbackValue: entry.value,
    defaultValue:
      typeof entry.tooltipDefaultValue !== 'undefined'
        ? entry.tooltipDefaultValue
        : entry.value,
    options: 'options' in entry.meta ? entry.meta.options : undefined,
    kind: entry.valueKey ? 'request' : 'reference',
  })
}
