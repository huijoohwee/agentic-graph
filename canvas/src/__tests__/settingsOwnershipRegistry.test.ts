import {
  isIntegrationsOwnedSetting,
  isMapsOwnedSetting,
  isMcpOwnedSetting,
  isPaymentsOwnedSetting,
  normalizeSettingsAreaLabel,
} from '@/features/panels/views/useSettingsView.helpers'
import { BYTEPLUS_SHARED_TEXT_API_DOC_AREA } from '@/features/panels/views/byteplusSharedTextApiDocs'
import { OPENAI_CHAT_API_DOC_AREA } from '@/features/panels/views/openaiChatApiDocs'
import { OPENAI_IMAGES_API_DOC_AREA } from '@/features/panels/views/openaiImagesApiDocs'
import { MIROMIND_API_DOC_AREA } from '@/features/panels/views/miromindApiDocs'
import { AGNES_API_DOC_AREA } from '@/features/panels/views/agnesApiDocs'
import { SEALION_API_DOC_AREA } from '@/features/panels/views/sealionApiDocs'
import { QWEN_API_DOC_AREA } from '@/features/panels/views/qwenApiDocs'
import { Z_AI_API_DOC_AREA } from '@/features/panels/views/zAiApiDocs'
import { GOOGLE_CLOUD_API_DOC_AREA } from '@/features/panels/views/googleCloudApiDocs'
import { STRIPE_PAYMENT_API_DOC_AREA } from '@/features/panels/views/stripePaymentApiDocs'
import { TRAVEL_AGENCY_PAYMENT_API_DOC_AREA } from '@/features/panels/views/travelAgencyPaymentApiDocs'
import { BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA } from '@/features/panels/views/byteplusImageGenerationApiDocs'
import { BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA } from '@/features/panels/views/byteplusVideoGenerationApiDocs'
import { GEMINI_VIDEO_GENERATION_API_DOC_AREA } from '@/features/panels/views/geminiVideoGenerationApiDocs'
import { MAPS_GRABMAPS_DOC_AREA, MAPS_GEO_DOC_AREA, MAPS_MAPLIBRE_DOC_AREA } from '@/features/panels/views/mapsApiDocs'
import { MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA } from '@/features/panels/views/grabmapsDirectionsApiDocs'
import { MAPS_GRABMAPS_MCP_DOC_AREA } from '@/features/panels/views/grabmapsMcpApiDocs'
import { API_NATIVE_BROWSER_MCP_DOC_AREA } from '@/features/panels/views/apiNativeBrowserMcpApiDocs'
import { AGENTIC_OS_TOOL_SERVER_DOC_AREA } from '@/features/panels/views/agentic-graph-tool-server-docs'
import { TRADING_RUNTIME_GATEWAY_DOC_AREA } from '@/features/panels/views/tradingRuntimeGatewayDocs'
import { EXTERNAL_MCP_TOOL_SERVER_DOC_AREA } from '@/features/panels/views/externalMcpToolServerDocs'
import { CRAWLER_ACCESS_MCP_DOC_AREA } from '@/features/panels/views/crawlerAccessMcpApiDocs'
import { CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA } from '@/features/panels/views/cloudflareAiGatewayMcpApiDocs'
import { BYTEPLUS_MODELARK_MCP_DOC_AREA } from '@/features/panels/views/byteplusModelArkMcpApiDocs'
import { OPENAI_MCP_DOC_AREA } from '@/features/panels/views/openaiMcpApiDocs'
import { EXA_MCP_DOC_AREA } from '@/features/panels/views/exaMcpApiDocs'
import { MOOMOO_MARKET_MCP_DOC_AREA } from '@/features/panels/views/moomooMarketMcpApiDocs'
import { EXA_SEARCH_API_DOC_AREA } from '@/features/panels/views/exaSearchApiDocs'
import { FEISHU_BASE_MCP_DOC_AREA } from '@/features/panels/views/feishuBaseMcpApiDocs'
import { LARK_APP_MCP_DOC_AREA } from '@/features/panels/views/larkAppMcpApiDocs'
import { STRIPE_MCP_DOC_AREA } from '@/features/panels/views/stripeMcpApiDocs'
import { MIROMIND_MCP_DOC_AREA } from '@/features/panels/views/miromindMcpApiDocs'
import { SEALION_MCP_DOC_AREA } from '@/features/panels/views/sealionMcpApiDocs'
import { AGENTIC_OS_VDEOXPLN_DOC_AREA } from '@/features/panels/views/vdeoxplnMcpApiDocs'
import { VIDEODB_MCP_DOC_AREA } from '@/features/panels/views/videodbMcpApiDocs'
import { OPERATOR_DEPLOY_MCP_DOC_AREA } from '@/features/settings/operatorDeploySsot'
import { VIDEODB_API_DOC_AREA } from '@/features/integrations/videodbSsot'
import { SENSENOVA_API_DOC_AREA } from '@/features/integrations/sensenovaSsot'

const ALL_AREAS: readonly string[] = [
  'Chat', 'Integrations', 'Workspace', 'Canvas', 'Rendering', 'Performance', 'Markdown',
  EXA_SEARCH_API_DOC_AREA, BYTEPLUS_SHARED_TEXT_API_DOC_AREA, BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA,
  BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA, GEMINI_VIDEO_GENERATION_API_DOC_AREA, SENSENOVA_API_DOC_AREA,
  VIDEODB_API_DOC_AREA, MIROMIND_API_DOC_AREA, AGNES_API_DOC_AREA, SEALION_API_DOC_AREA, QWEN_API_DOC_AREA,
  Z_AI_API_DOC_AREA, GOOGLE_CLOUD_API_DOC_AREA, OPENAI_CHAT_API_DOC_AREA, OPENAI_IMAGES_API_DOC_AREA,
  STRIPE_PAYMENT_API_DOC_AREA, TRAVEL_AGENCY_PAYMENT_API_DOC_AREA,
  MAPS_GRABMAPS_DOC_AREA, MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA, MAPS_GEO_DOC_AREA, MAPS_MAPLIBRE_DOC_AREA,
  MAPS_GRABMAPS_MCP_DOC_AREA, API_NATIVE_BROWSER_MCP_DOC_AREA, AGENTIC_OS_TOOL_SERVER_DOC_AREA,
  TRADING_RUNTIME_GATEWAY_DOC_AREA, EXTERNAL_MCP_TOOL_SERVER_DOC_AREA, CRAWLER_ACCESS_MCP_DOC_AREA,
  CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA, BYTEPLUS_MODELARK_MCP_DOC_AREA, OPENAI_MCP_DOC_AREA, EXA_MCP_DOC_AREA,
  MOOMOO_MARKET_MCP_DOC_AREA, FEISHU_BASE_MCP_DOC_AREA, LARK_APP_MCP_DOC_AREA, STRIPE_MCP_DOC_AREA,
  MIROMIND_MCP_DOC_AREA, SEALION_MCP_DOC_AREA, AGENTIC_OS_VDEOXPLN_DOC_AREA, OPERATOR_DEPLOY_MCP_DOC_AREA,
  VIDEODB_MCP_DOC_AREA,
]

const SAMPLE_KEYS: readonly string[] = [
  'chatContextScope', 'chat.provider', 'integrationConfigsJson',
  'payments.stripe.secretKey', 'payments.provider',
  'maps.grabMaps.apiKey', 'maps.geo.enabled', 'autoEnableGeospatialOnGeoImport',
  'maps.grabMaps.mcp.serverKey', 'search.moomooMarket.mcp.remoteUrl', 'agenticGraphToolServer.config.local_stdio',
  'tradingRuntimeGateway.config.local_http_readonly', 'externalMcp.gateway.role',
  'canvasRenderMode', 'wheelZoomCtrlMetaBoostMultiplier', 'some.unrelated.key', '',
]

function legacyIntegrations(key: string, areaRaw: string): boolean {
  const area = normalizeSettingsAreaLabel(areaRaw)
  if (
    area === 'Chat' || area === 'Integrations'
    || area === EXA_SEARCH_API_DOC_AREA || area === BYTEPLUS_SHARED_TEXT_API_DOC_AREA
    || area === BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA || area === BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA
    || area === GEMINI_VIDEO_GENERATION_API_DOC_AREA || area === SENSENOVA_API_DOC_AREA
    || area === VIDEODB_API_DOC_AREA || area === MIROMIND_API_DOC_AREA || area === AGNES_API_DOC_AREA
    || area === SEALION_API_DOC_AREA || area === QWEN_API_DOC_AREA || area === Z_AI_API_DOC_AREA
    || area === GOOGLE_CLOUD_API_DOC_AREA || area === OPENAI_CHAT_API_DOC_AREA || area === OPENAI_IMAGES_API_DOC_AREA
    || area === BYTEPLUS_MODELARK_MCP_DOC_AREA || area === OPERATOR_DEPLOY_MCP_DOC_AREA
  ) return true
  return key.startsWith('chat') || key === 'integrationConfigsJson'
}

function legacyPayments(key: string, areaRaw: string): boolean {
  const area = normalizeSettingsAreaLabel(areaRaw)
  if (area === STRIPE_PAYMENT_API_DOC_AREA || area === TRAVEL_AGENCY_PAYMENT_API_DOC_AREA) return true
  return key.startsWith('payments.')
}

function legacyMaps(key: string, areaRaw: string): boolean {
  const area = normalizeSettingsAreaLabel(areaRaw)
  if (key.includes('.mcp.')) return false
  if (
    area === MAPS_GRABMAPS_DOC_AREA || area === MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA
    || area === MAPS_GEO_DOC_AREA || area === MAPS_MAPLIBRE_DOC_AREA
  ) return true
  if (key === 'autoEnableGeospatialOnGeoImport') return true
  return key.startsWith('maps.')
}

function legacyMcp(key: string, areaRaw: string): boolean {
  const area = normalizeSettingsAreaLabel(areaRaw)
  if (
    area === MAPS_GRABMAPS_MCP_DOC_AREA || area === API_NATIVE_BROWSER_MCP_DOC_AREA
    || area === AGENTIC_OS_TOOL_SERVER_DOC_AREA || area === TRADING_RUNTIME_GATEWAY_DOC_AREA
    || area === EXTERNAL_MCP_TOOL_SERVER_DOC_AREA || area === CRAWLER_ACCESS_MCP_DOC_AREA
    || area === CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA || area === BYTEPLUS_MODELARK_MCP_DOC_AREA
    || area === OPENAI_MCP_DOC_AREA || area === EXA_MCP_DOC_AREA || area === MOOMOO_MARKET_MCP_DOC_AREA
    || area === FEISHU_BASE_MCP_DOC_AREA || area === LARK_APP_MCP_DOC_AREA || area === STRIPE_MCP_DOC_AREA
    || area === MIROMIND_MCP_DOC_AREA || area === SEALION_MCP_DOC_AREA || area === AGENTIC_OS_VDEOXPLN_DOC_AREA
    || area === OPERATOR_DEPLOY_MCP_DOC_AREA || area === VIDEODB_MCP_DOC_AREA
  ) return true
  return key.includes('.mcp.')
}

export function testOwnershipRegistryMatchesLegacyPredicatesAcrossAreaKeyMatrix() {
  for (const area of ALL_AREAS) {
    for (const key of SAMPLE_KEYS) {
      const context = `key=${JSON.stringify(key)} area=${JSON.stringify(area)}`
      if (isIntegrationsOwnedSetting(key, area) !== legacyIntegrations(key, area)) {
        throw new Error(`integrations ownership drift at ${context}`)
      }
      if (isPaymentsOwnedSetting(key, area) !== legacyPayments(key, area)) {
        throw new Error(`payments ownership drift at ${context}`)
      }
      if (isMapsOwnedSetting(key, area) !== legacyMaps(key, area)) {
        throw new Error(`maps ownership drift at ${context}`)
      }
      if (isMcpOwnedSetting(key, area) !== legacyMcp(key, area)) {
        throw new Error(`mcp ownership drift at ${context}`)
      }
    }
  }
}

export function testOwnershipRegistryPreservesPrecedenceAndDualMembership() {
  if (isMapsOwnedSetting('maps.grabMaps.mcp.serverKey', MAPS_GRABMAPS_DOC_AREA)) {
    throw new Error('maps ownership must exclude .mcp. keys even inside a maps area')
  }
  if (!isMcpOwnedSetting('maps.grabMaps.mcp.serverKey', MAPS_GRABMAPS_DOC_AREA)) {
    throw new Error('mcp ownership must claim .mcp. keys regardless of area')
  }
  for (const area of [BYTEPLUS_MODELARK_MCP_DOC_AREA, OPERATOR_DEPLOY_MCP_DOC_AREA]) {
    if (!isIntegrationsOwnedSetting('any.key', area) || !isMcpOwnedSetting('any.key', area)) {
      throw new Error(`dual-membership area ${area} must be owned by both integrations and mcp`)
    }
  }
  if (!isMcpOwnedSetting('tradingRuntimeGateway.gateway.role', TRADING_RUNTIME_GATEWAY_DOC_AREA)) {
    throw new Error('trading runtime gateway area must be mcp-owned')
  }
  if (isIntegrationsOwnedSetting('tradingRuntimeGateway.gateway.role', TRADING_RUNTIME_GATEWAY_DOC_AREA)) {
    throw new Error('trading runtime gateway area must not leak into integrations ownership')
  }
}

export function testOwnershipRegistryNormalizesAreaLabels() {
  if (!isIntegrationsOwnedSetting('integrationConfigsJson', 'integrations')) {
    throw new Error('lowercase integrations area must normalize into integrations ownership')
  }
  if (!isMapsOwnedSetting('maps.geo.enabled', `  ${MAPS_GEO_DOC_AREA}  `)) {
    throw new Error('padded maps area must normalize into maps ownership')
  }
  if (isMcpOwnedSetting('plain.key', 'Workspace')) {
    throw new Error('unrelated workspace area must not become mcp-owned')
  }
}