import { emitPropsPanelOpen, emitFloatingPanelOpen } from '@/features/canvas/utils'
import { openFloatingPanelChat } from '@/features/chat/floatingPanelChat/floatingPanelChatOpenSeed'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { FLOW_IMAGE_GENERATION_NODE_LABEL, FLOW_VIDEO_GENERATION_NODE_LABEL } from '@/lib/config.storyboard-widget'
import { settingsRegistry } from '@/features/settings/registry'
import { getGrabMapsDiscoveryWidgetLabel } from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import { BYTEPLUS_SHARED_TEXT_API_DOC_AREA } from './byteplusSharedTextApiDocs'
import { OPENAI_CHAT_API_DOC_AREA } from './openaiChatApiDocs'
import { OPENAI_IMAGES_API_DOC_AREA } from './openaiImagesApiDocs'
import { DEERFLOW_API_DOC_AREA } from './deerflowApiDocs'
import { MIROMIND_API_DOC_AREA, MIROMIND_API_DOCS_URL } from './miromindApiDocs'
import { AGNES_API_DOC_AREA, AGNES_API_DOCS_URL } from './agnesApiDocs'
import { QWEN_API_DOC_AREA, QWEN_API_DOCS_URL } from './qwenApiDocs'
import { Z_AI_API_DOC_AREA, Z_AI_API_DOCS_URL } from './zAiApiDocs'
import { GOOGLE_CLOUD_API_DOC_AREA, GOOGLE_CLOUD_API_DOCS_URL } from './googleCloudApiDocs'
import { BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA, BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL } from '@/features/integrations/byteplusImageGenerationSsot'
import { BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA, BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL } from '@/features/integrations/byteplusVideoGenerationSsot'
import { GEMINI_VIDEO_GENERATION_API_DOC_AREA, GEMINI_VIDEO_GENERATION_API_DOCS_URL } from '@/features/integrations/geminiVideoGenerationSsot'
import { MAPS_GEO_DOC_AREA, MAPS_MAPLIBRE_DOC_AREA, MAPS_GRABMAPS_DOC_AREA } from './mapsApiDocs'
import { MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA } from './grabmapsDirectionsApiDocs'
import { MAPS_GRABMAPS_MCP_DOC_AREA } from './grabmapsMcpApiDocs'
import { API_NATIVE_BROWSER_MCP_DOC_AREA } from './apiNativeBrowserMcpApiDocs'
import {
  CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA,
  CLOUDFLARE_AI_GATEWAY_MCP_DOCS_URL,
} from './cloudflareAiGatewayMcpApiDocs'
import { OPENAI_MCP_DOC_AREA, OPENAI_MCP_DOCS_URL } from './openaiMcpApiDocs'
import { OPERATOR_DEPLOY_MCP_DOC_AREA, OPERATOR_DEPLOY_MCP_DOCS_URL } from './operatorDeployMcpApiDocs'
import { OPERATOR_DEPLOY_SETTING_KEYS } from '@/features/settings/operatorDeploySsot'
import { EXA_MCP_DOC_AREA, EXA_MCP_DOCS_URL } from './exaMcpApiDocs'
import { EXA_SEARCH_API_DOC_AREA, EXA_SEARCH_API_DOCS_URL } from './exaSearchApiDocs'
import { FEISHU_BASE_MCP_DOC_AREA, FEISHU_BASE_MCP_DOCS_URL } from './feishuBaseMcpApiDocs'
import { LARK_APP_MCP_DOC_AREA, LARK_APP_MCP_DOCS_URL } from './larkAppMcpApiDocs'
import { STRIPE_MCP_DOC_AREA } from './stripeMcpApiDocs'
import { MIROMIND_MCP_DOC_AREA, MIROMIND_MCP_DOCS_URL } from './miromindMcpApiDocs'
import { AGENTIC_OS_VDEOXPLN_DOC_AREA } from './vdeoxplnMcpApiDocs'
import { VIDEODB_MCP_DOC_AREA, VIDEODB_MCP_DOCS_URL } from './videodbMcpApiDocs'
import { STRIPE_MCP_DOCS_URL } from 'grph-shared/payments/stripeMcpSsot'
import { KTV_DEFAULT_HEADER_LABELS, type KtvHeaderLabels } from 'grph-shared/ui/keyTypeValueRows'

export const SETTINGS_REGISTRY_BY_KEY = new Map(settingsRegistry.map(setting => [setting.key, setting] as const))
export const ACTIVE_WORKSPACE_SYNC_MAX_ATTEMPTS = 8
export const ACTIVE_WORKSPACE_SYNC_RETRY_MS = 250

export type SettingsViewMode = 'all' | 'integrations' | 'payments' | 'maps' | 'mcp'

export type SettingsKtvHeaderLabels = KtvHeaderLabels

export type SettingsViewModeConfig = Readonly<{
  ktvHeaderLabels: SettingsKtvHeaderLabels
}>

export const SETTINGS_DEFAULT_KTV_HEADER_LABELS: SettingsKtvHeaderLabels = KTV_DEFAULT_HEADER_LABELS

export const SETTINGS_MCP_KTV_HEADER_LABELS: SettingsKtvHeaderLabels = {
  ...SETTINGS_DEFAULT_KTV_HEADER_LABELS,
  valueLabel: SETTINGS_DEFAULT_KTV_HEADER_LABELS.valueLabel,
}

export const SETTINGS_VIEW_MODE_CONFIG_BY_MODE: Readonly<Record<SettingsViewMode, SettingsViewModeConfig>> = {
  all: { ktvHeaderLabels: SETTINGS_DEFAULT_KTV_HEADER_LABELS },
  integrations: { ktvHeaderLabels: SETTINGS_DEFAULT_KTV_HEADER_LABELS },
  payments: { ktvHeaderLabels: SETTINGS_DEFAULT_KTV_HEADER_LABELS },
  maps: { ktvHeaderLabels: SETTINGS_DEFAULT_KTV_HEADER_LABELS },
  mcp: { ktvHeaderLabels: SETTINGS_MCP_KTV_HEADER_LABELS },
}

export function resolveSettingsKtvHeaderLabels(mode: SettingsViewMode): SettingsKtvHeaderLabels {
  return (
    SETTINGS_VIEW_MODE_CONFIG_BY_MODE[mode]
    || SETTINGS_VIEW_MODE_CONFIG_BY_MODE.all
  ).ktvHeaderLabels
}

export type SectionMeta = Readonly<{
  docsUrl?: string
  docsLabel?: string
  panelLabel: string
  openPanel: () => void
}>

export const CHAT_KTV_ROW_KEYS = {
  apiKey: 'chatApiKey',
  provider: 'chatProvider',
  contextScope: 'chatContextScope',
  routing: 'integrationConfigsJson',
  model: 'chatModel',
} as const

export const INTEGRATIONS_SECTION_META: Readonly<Record<string, SectionMeta>> = {
  Chat: {
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [BYTEPLUS_SHARED_TEXT_API_DOC_AREA]: {
    docsUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1494384',
    docsLabel: 'Open BytePlus Text API Docs',
    panelLabel: 'Open FloatingPanel Props Panel Widget Card',
    openPanel: () => emitPropsPanelOpen(),
  },
  [EXA_SEARCH_API_DOC_AREA]: {
    docsUrl: EXA_SEARCH_API_DOCS_URL,
    docsLabel: 'Open Exa Search API Coding-Agent Guide',
    panelLabel: 'Open FloatingPanel Skills & Commands',
    openPanel: () => emitFloatingPanelOpen({ tab: 'skillsCommands', open: true }),
  },
  [OPENAI_CHAT_API_DOC_AREA]: {
    docsUrl: 'https://developers.openai.com/api/reference/resources/responses',
    docsLabel: 'Open OpenAI Chat API Docs',
    panelLabel: 'Open FloatingPanel Props Panel Widget Card',
    openPanel: () => emitPropsPanelOpen(),
  },
  [OPENAI_IMAGES_API_DOC_AREA]: {
    docsUrl: 'https://developers.openai.com/api/reference/resources/images',
    docsLabel: 'Open OpenAI Images API Docs',
    panelLabel: 'Open FloatingPanel Props Panel OpenAI Image Widget',
    openPanel: () => emitPropsPanelOpen(),
  },
  [DEERFLOW_API_DOC_AREA]: {
    docsUrl: 'https://github.com/bytedance/deer-flow',
    docsLabel: 'Open DeerFlow Docs',
    panelLabel: 'Open FloatingPanel Props Panel Widget Card',
    openPanel: () => emitPropsPanelOpen(),
  },
  [MIROMIND_API_DOC_AREA]: {
    docsUrl: MIROMIND_API_DOCS_URL,
    docsLabel: 'Open MiroMind Chat Completions Docs',
    panelLabel: 'Open FloatingPanel Chat UI (MiroMind)',
    openPanel: () => openFloatingPanelChat(),
  },
  [AGNES_API_DOC_AREA]: {
    docsUrl: AGNES_API_DOCS_URL,
    docsLabel: 'Open Agnes AI Chat Completions Docs',
    panelLabel: 'Open FloatingPanel Chat UI (Agnes)',
    openPanel: () => openFloatingPanelChat(),
  },
  [QWEN_API_DOC_AREA]: {
    docsUrl: QWEN_API_DOCS_URL,
    docsLabel: 'Open Qwen OpenAI-Compatible Chat Docs',
    panelLabel: 'Open FloatingPanel Chat UI (Qwen)',
    openPanel: () => openFloatingPanelChat(),
  },
  [Z_AI_API_DOC_AREA]: {
    docsUrl: Z_AI_API_DOCS_URL,
    docsLabel: 'Open Z.AI Quick Start',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [GOOGLE_CLOUD_API_DOC_AREA]: {
    docsUrl: GOOGLE_CLOUD_API_DOCS_URL,
    docsLabel: 'Open Google Cloud Vertex AI Chat Docs',
    panelLabel: 'Open FloatingPanel Chat UI (Google Cloud)',
    openPanel: () => openFloatingPanelChat(),
  },
  [BYTEPLUS_VIDEO_GENERATION_API_DOC_AREA]: {
    docsUrl: BYTEPLUS_VIDEO_GENERATION_API_DOCS_URL,
    docsLabel: 'Open BytePlus Video Generation API Docs',
    panelLabel: `Open FloatingPanel ${FLOW_VIDEO_GENERATION_NODE_LABEL}`,
    openPanel: () => emitPropsPanelOpen(),
  },
  [GEMINI_VIDEO_GENERATION_API_DOC_AREA]: {
    docsUrl: GEMINI_VIDEO_GENERATION_API_DOCS_URL,
    docsLabel: 'Open Gemini Veo Video Generation API Docs',
    panelLabel: `Open FloatingPanel ${FLOW_VIDEO_GENERATION_NODE_LABEL}`,
    openPanel: () => emitPropsPanelOpen(),
  },
  [BYTEPLUS_IMAGE_GENERATION_API_DOC_AREA]: {
    docsUrl: BYTEPLUS_IMAGE_GENERATION_API_DOCS_URL,
    docsLabel: 'Open BytePlus Image Generation API Docs',
    panelLabel: `Open FloatingPanel ${FLOW_IMAGE_GENERATION_NODE_LABEL}`,
    openPanel: () => emitPropsPanelOpen(),
  },
}

export const MCP_SECTION_META: Readonly<Record<string, SectionMeta>> = {
  [OPERATOR_DEPLOY_MCP_DOC_AREA]: {
    docsUrl: OPERATOR_DEPLOY_MCP_DOCS_URL,
    docsLabel: 'Open Operator Deploy Runbook',
    panelLabel: 'Open MainPanel MCP',
    openPanel: () => emitMainPanelOpen({ tab: 'mcp', searchQuery: OPERATOR_DEPLOY_SETTING_KEYS.mcpEndpoint }),
  },
  [API_NATIVE_BROWSER_MCP_DOC_AREA]: {
    docsUrl: 'https://github.com/unbrowse-ai/unbrowse',
    docsLabel: 'Open API-Native Browser MCP Reference',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA]: {
    docsUrl: CLOUDFLARE_AI_GATEWAY_MCP_DOCS_URL,
    docsLabel: 'Open Cloudflare AI Gateway Docs',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [OPENAI_MCP_DOC_AREA]: {
    docsUrl: OPENAI_MCP_DOCS_URL,
    docsLabel: 'Open OpenAI MCP Docs',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [EXA_MCP_DOC_AREA]: {
    docsUrl: EXA_MCP_DOCS_URL,
    docsLabel: 'Open Exa MCP Docs',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [FEISHU_BASE_MCP_DOC_AREA]: {
    docsUrl: FEISHU_BASE_MCP_DOCS_URL,
    docsLabel: 'Open Feishu Base Docs',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [LARK_APP_MCP_DOC_AREA]: {
    docsUrl: LARK_APP_MCP_DOCS_URL,
    docsLabel: 'Open Lark Platform Docs',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [STRIPE_MCP_DOC_AREA]: {
    docsUrl: STRIPE_MCP_DOCS_URL,
    docsLabel: 'Open Stripe MCP Docs',
    panelLabel: 'Open MainPanel Commerce',
    openPanel: () => emitMainPanelOpen({ tab: 'commerce', searchQuery: 'stripeApi.checkout' }),
  },
  [MIROMIND_MCP_DOC_AREA]: {
    docsUrl: MIROMIND_MCP_DOCS_URL,
    docsLabel: 'Open MiroMind MCP Docs',
    panelLabel: 'Open FloatingPanel Chat UI (MiroMind)',
    openPanel: () => openFloatingPanelChat(),
  },
  [AGENTIC_OS_VDEOXPLN_DOC_AREA]: {
    docsUrl: '/agentic-graph/.well-known/agent-skills/index.json',
    docsLabel: 'Open Agent Skills Index',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [VIDEODB_MCP_DOC_AREA]: {
    docsUrl: VIDEODB_MCP_DOCS_URL,
    docsLabel: 'Open VideoDB MCP Docs',
    panelLabel: 'Open FloatingPanel Chat UI',
    openPanel: () => openFloatingPanelChat(),
  },
  [MAPS_GRABMAPS_MCP_DOC_AREA]: {
    docsUrl: 'https://maps.grab.com/developer/documentation/mcp',
    docsLabel: 'Open GrabMaps MCP Docs',
    panelLabel: `Open FloatingPanel Props Panel ${getGrabMapsDiscoveryWidgetLabel()}`,
    openPanel: () => emitPropsPanelOpen(),
  }
}

export const MAPS_SECTION_META: Readonly<Record<string, SectionMeta>> = {
  [MAPS_GRABMAPS_DOC_AREA]: {
    docsUrl: 'https://maps.grab.com/developer/documentation',
    docsLabel: 'Open GrabMaps Docs',
    panelLabel: 'Open FloatingPanel Geo',
    openPanel: () => emitFloatingPanelOpen({ tab: 'geo', open: true }),
  },
  [MAPS_GRABMAPS_DIRECTIONS_REQUEST_DOC_AREA]: {
    docsUrl: 'https://maps.grab.com/developer/documentation/routes',
    docsLabel: 'Open GrabMaps Routes Docs',
    panelLabel: 'Open FloatingPanel Geo',
    openPanel: () => emitFloatingPanelOpen({ tab: 'geo', open: true }),
  },
  [MAPS_GEO_DOC_AREA]: {
    docsUrl: 'https://datatracker.ietf.org/doc/html/rfc7946',
    docsLabel: 'Open GeoJSON RFC 7946',
    panelLabel: 'Open FloatingPanel Geo',
    openPanel: () => emitFloatingPanelOpen({ tab: 'geo', open: true }),
  },
  [MAPS_MAPLIBRE_DOC_AREA]: {
    docsUrl: 'https://maplibre.org/maplibre-gl-js/docs/',
    docsLabel: 'Open MapLibre GL JS Docs',
    panelLabel: 'Open FloatingPanel Geo',
    openPanel: () => emitFloatingPanelOpen({ tab: 'geo', open: true }),
  },
}
