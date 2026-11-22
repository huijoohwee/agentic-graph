import { normalizeSettingsAreaLabel } from './useSettingsView.helpers'
import { BYTEPLUS_SHARED_TEXT_API_DOC_AREA } from './byteplusSharedTextApiDocs'
import { OPENAI_CHAT_API_DOC_AREA } from './openaiChatApiDocs'
import { OPENAI_IMAGES_API_DOC_AREA } from './openaiImagesApiDocs'
import { MIROMIND_API_DOC_AREA } from './miromindApiDocs'
import { AGNES_API_DOC_AREA } from './agnesApiDocs'
import { SEALION_API_DOC_AREA } from './sealionApiDocs'
import { QWEN_API_DOC_AREA } from './qwenApiDocs'
import { Z_AI_API_DOC_AREA } from './zAiApiDocs'
import { GOOGLE_CLOUD_API_DOC_AREA } from './googleCloudApiDocs'
import { STRIPE_PAYMENT_API_DOC_AREA } from './stripePaymentApiDocs'
import { TRAVEL_AGENCY_PAYMENT_API_DOC_AREA } from './travelAgencyPaymentApiDocs'
import { BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA } from './byteplusImageGenerationApiDocs'
import { BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA } from './byteplusVideoGenerationApiDocs'
import { GEMINI_VIDEO_GENERATION_API_DOC_AREA } from './geminiVideoGenerationApiDocs'
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
import { MIROMIND_MCP_DOC_AREA } from './miromindMcpApiDocs'
import { SEALION_MCP_DOC_AREA } from './sealionMcpApiDocs'
import { AGENTIC_OS_VDEOXPLN_DOC_AREA } from './vdeoxplnMcpApiDocs'
import { VIDEODB_MCP_DOC_AREA } from './videodbMcpApiDocs'
import { OPERATOR_DEPLOY_MCP_DOC_AREA } from '@/features/settings/operatorDeploySsot'
import { VIDEODB_API_DOC_AREA } from '@/features/integrations/videodbSsot'
import { SENSENOVA_API_DOC_AREA } from '@/features/integrations/sensenovaSsot'

export type SettingsOwnershipMode = 'integrations' | 'mcp' | 'maps' | 'payments'

type SettingsOwnershipRule = {
  readonly areas: ReadonlySet<string>
  readonly excludeKeySubstrings?: readonly string[]
  readonly keyExact?: readonly string[]
  readonly keyPrefixes?: readonly string[]
  readonly keySubstrings?: readonly string[]
}

export const SETTINGS_OWNERSHIP_RULES: Readonly<Record<SettingsOwnershipMode, SettingsOwnershipRule>> = {
  integrations: {
    areas: new Set([
      'Chat',
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
      BYTEPLUS_MODELARK_MCP_DOC_AREA,
      OPERATOR_DEPLOY_MCP_DOC_AREA,
    ]),
    keyExact: ['integrationConfigsJson'],
    keyPrefixes: ['chat'],
  },
  payments: {
    areas: new Set([STRIPE_PAYMENT_API_DOC_AREA, TRAVEL_AGENCY_PAYMENT_API_DOC_AREA]),
    keyPrefixes: ['payments.'],
  },
  maps: {
    areas: new Set([
      MAPS_GRABMAPS_DOC_AREA,
      MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA,
      MAPS_GEO_DOC_AREA,
      MAPS_MAPLIBRE_DOC_AREA,
    ]),
    excludeKeySubstrings: ['.mcp.'],
    keyExact: ['autoEnableGeospatialOnGeoImport'],
    keyPrefixes: ['maps.'],
  },
  mcp: {
    areas: new Set([
      MAPS_GRABMAPS_MCP_DOC_AREA,
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
      MIROMIND_MCP_DOC_AREA,
      SEALION_MCP_DOC_AREA,
      AGENTIC_OS_VDEOXPLN_DOC_AREA,
      OPERATOR_DEPLOY_MCP_DOC_AREA,
      VIDEODB_MCP_DOC_AREA,
    ]),
    keySubstrings: ['.mcp.'],
  },
}

export function ownsSetting(mode: SettingsOwnershipMode, key: string, areaRaw: string): boolean {
  const rule = SETTINGS_OWNERSHIP_RULES[mode]
  if (rule.excludeKeySubstrings?.some(fragment => key.includes(fragment))) return false
  const area = normalizeSettingsAreaLabel(areaRaw)
  if (rule.areas.has(area)) return true
  if (rule.keyExact?.includes(key)) return true
  if (rule.keyPrefixes?.some(prefix => key.startsWith(prefix))) return true
  if (rule.keySubstrings?.some(fragment => key.includes(fragment))) return true
  return false
}

export function isIntegrationsOwnedSetting(key: string, areaRaw: string): boolean {
  return ownsSetting('integrations', key, areaRaw)
}

export function isPaymentsOwnedSetting(key: string, areaRaw: string): boolean {
  return ownsSetting('payments', key, areaRaw)
}

export function isMapsOwnedSetting(key: string, areaRaw: string): boolean {
  return ownsSetting('maps', key, areaRaw)
}

export function isMcpOwnedSetting(key: string, areaRaw: string): boolean {
  return ownsSetting('mcp', key, areaRaw)
}