import { normalized as normalizeText } from '@/features/panels/utils/json'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { GRABMAPS_MCP_REQUEST_DOC_ENTRIES, getGrabMapsMcpApiRowAnchorId } from './grabmapsMcpApiDocs'
import {
  API_NATIVE_BROWSER_MCP_AGENT_CONFIG_KEY,
  API_NATIVE_BROWSER_MCP_BRIDGE_CONFIG_KEY,
  API_NATIVE_BROWSER_MCP_DOC_AREA,
  API_NATIVE_BROWSER_MCP_DOC_ENTRIES,
  buildApiNativeBrowserMcpAgentConfigJson,
  buildBrowserBridgeMcpConfigJson,
  getApiNativeBrowserMcpApiRowAnchorId,
} from './apiNativeBrowserMcpApiDocs'
import {
  EXTERNAL_MCP_TOOL_SERVER_DOC_AREA,
  EXTERNAL_MCP_TOOL_SERVER_DOC_ENTRIES,
  EXTERNAL_MCP_TOOL_SERVER_HTTP_CONFIG_KEY,
  EXTERNAL_MCP_TOOL_SERVER_STDIO_CONFIG_KEY,
  buildExternalMcpStdioConfigJson,
  buildExternalMcpStreamableHttpConfigJson,
  getExternalMcpToolServerRowAnchorId,
} from './externalMcpToolServerDocs'
import {
  AGENTIC_OS_TOOL_SERVER_DOC_AREA,
  AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES,
  AGENTIC_OS_TOOL_SERVER_LOCAL_CONFIG_KEY,
  AGENTIC_OS_TOOL_SERVER_PAGES_CONFIG_KEY,
  buildAgenticGraphToolServerLocalStdioConfigJson,
  buildAgenticGraphToolServerPagesHttpConfigJson,
  getAgenticGraphToolServerRowAnchorId,
} from './agentic-graph-tool-server-docs'
import {
  CRAWLER_ACCESS_MCP_DOC_AREA,
  CRAWLER_ACCESS_MCP_DOC_ENTRIES,
  getCrawlerAccessMcpApiRowAnchorId,
} from './crawlerAccessMcpApiDocs'
import {
  CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA,
  CLOUDFLARE_AI_GATEWAY_MCP_DOC_ENTRIES,
  CLOUDFLARE_AI_GATEWAY_MCP_REMOTE_CONFIG_KEY,
  buildCloudflareAiGatewayMcpRemoteConfigJson,
  getCloudflareAiGatewayMcpApiRowAnchorId,
} from './cloudflareAiGatewayMcpApiDocs'
import {
  BYTEPLUS_MODELARK_MCP_DOC_AREA,
  BYTEPLUS_MODELARK_MCP_DOC_ENTRIES,
  BYTEPLUS_MODELARK_MCP_CODEX_CONFIG_KEY,
  BYTEPLUS_MODELARK_MCP_MEDIA_PROFILE_KEY,
  BYTEPLUS_MODELARK_MCP_RESPONSES_TOOL_CONFIG_KEY,
  buildBytePlusModelArkMcpCodexAddCommand,
  buildBytePlusModelArkMcpMediaProfileJson,
  buildBytePlusModelArkMcpResponsesToolConfigJson,
  getBytePlusModelArkMcpApiRowAnchorId,
} from './byteplusModelArkMcpApiDocs'
import {
  OPENAI_MCP_CHATGPT_APP_CONFIG_KEY,
  OPENAI_MCP_DOC_AREA,
  OPENAI_MCP_DOC_ENTRIES,
  OPENAI_MCP_RESPONSES_REQUEST_KEY,
  OPENAI_MCP_RESPONSES_TOOL_CONFIG_KEY,
  buildOpenAiMcpChatGptAppConnectionJson,
  buildOpenAiMcpResponsesRequestJson,
  buildOpenAiMcpResponsesToolConfigJson,
  getOpenAiMcpApiRowAnchorId,
} from './openaiMcpApiDocs'
import {
  EXA_MCP_CODEX_CONFIG_KEY,
  EXA_MCP_DOC_AREA,
  EXA_MCP_DOC_ENTRIES,
  EXA_MCP_REMOTE_CONFIG_KEY,
  buildExaCodexMcpAddCommand,
  buildExaRemoteMcpConfigJson,
  getExaMcpApiRowAnchorId,
} from './exaMcpApiDocs'
import {
  FEISHU_BASE_MCP_DOC_AREA,
  FEISHU_BASE_MCP_DOC_ENTRIES,
  getFeishuBaseMcpApiRowAnchorId,
} from './feishuBaseMcpApiDocs'
import {
  LARK_APP_MCP_DOC_AREA,
  LARK_APP_MCP_DOC_ENTRIES,
  LARK_APP_MCP_REMOTE_CONFIG_KEY,
  buildLarkAppRemoteMcpConfigJson,
  getLarkAppMcpApiRowAnchorId,
} from './larkAppMcpApiDocs'
import {
  STRIPE_MCP_DOC_AREA,
  STRIPE_MCP_DOC_ENTRIES,
  STRIPE_MCP_LOCAL_CONFIG_KEY,
  STRIPE_MCP_REMOTE_CONFIG_KEY,
  buildStripeLocalMcpConfigJson,
  buildStripeRemoteMcpConfigJson,
  getStripeMcpApiRowAnchorId,
} from './stripeMcpApiDocs'
import {
  MIROMIND_MCP_DOC_AREA,
  MIROMIND_MCP_DOC_ENTRIES,
  getMiroMindMcpApiRowAnchorId,
} from './miromindMcpApiDocs'
import {
  SEALION_MCP_DOC_AREA,
  SEALION_MCP_DOC_ENTRIES,
  SEALION_MCP_REMOTE_CONFIG_KEY,
  buildSealionMcpRemoteConfigJson,
  getSealionMcpApiRowAnchorId,
} from './sealionMcpApiDocs'
import {
  AGENTIC_OS_VDEOXPLN_DOC_AREA,
  AGENTIC_OS_VDEOXPLN_DOC_ENTRIES,
  getAgenticGraphVdeoxplnRowAnchorId,
} from './vdeoxplnMcpApiDocs'
import {
  OPERATOR_DEPLOY_MCP_DOC_AREA,
  OPERATOR_DEPLOY_MCP_DOC_ENTRIES,
  getOperatorDeployMcpApiRowAnchorId,
} from './operatorDeployMcpApiDocs'
import {
  VIDEODB_MCP_CLAUDE_CODE_COMMAND_KEY,
  VIDEODB_MCP_DOC_AREA,
  VIDEODB_MCP_DOC_ENTRIES,
  VIDEODB_MCP_PIPX_CONFIG_KEY,
  VIDEODB_MCP_UVX_CONFIG_KEY,
  buildVideodbClaudeCodeMcpCommand,
  buildVideodbPipxMcpConfigJson,
  buildVideodbUvxMcpConfigJson,
  getVideodbMcpApiRowAnchorId,
} from './videodbMcpApiDocs'
import {
  buildDocMappedEntry,
  isMcpOwnedSetting,
  normalizeSettingsAreaLabel,
  type SettingsEntry,
} from './useSettingsView.helpers'

export function buildMcpDocEntries(
  mapsAndMcpDocEntries: ReadonlyArray<VirtualSettingsEntry>,
): ReadonlyArray<VirtualSettingsEntry> {
  return [
    ...API_NATIVE_BROWSER_MCP_DOC_ENTRIES,
    ...AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES,
    ...EXTERNAL_MCP_TOOL_SERVER_DOC_ENTRIES,
    ...CRAWLER_ACCESS_MCP_DOC_ENTRIES,
    ...CLOUDFLARE_AI_GATEWAY_MCP_DOC_ENTRIES,
    ...BYTEPLUS_MODELARK_MCP_DOC_ENTRIES,
    ...OPENAI_MCP_DOC_ENTRIES,
    ...EXA_MCP_DOC_ENTRIES,
    ...FEISHU_BASE_MCP_DOC_ENTRIES,
    ...LARK_APP_MCP_DOC_ENTRIES,
    ...STRIPE_MCP_DOC_ENTRIES,
    ...MIROMIND_MCP_DOC_ENTRIES,
    ...SEALION_MCP_DOC_ENTRIES,
    ...AGENTIC_OS_VDEOXPLN_DOC_ENTRIES,
    ...OPERATOR_DEPLOY_MCP_DOC_ENTRIES,
    ...VIDEODB_MCP_DOC_ENTRIES,
    ...mapsAndMcpDocEntries.filter(entry => isMcpOwnedSetting(entry.meta.key, entry.details.area)),
    ...GRABMAPS_MCP_REQUEST_DOC_ENTRIES,
  ]
}

export function buildMcpVirtualEntry(
  entry: VirtualSettingsEntry,
  values: Record<string, string | number | boolean>,
): SettingsEntry {
  const area = normalizeSettingsAreaLabel(entry.details.area)
  const anchorId =
    area === API_NATIVE_BROWSER_MCP_DOC_AREA
      ? getApiNativeBrowserMcpApiRowAnchorId(entry.meta.key)
      : area === AGENTIC_OS_TOOL_SERVER_DOC_AREA
        ? getAgenticGraphToolServerRowAnchorId(entry.meta.key)
      : area === EXTERNAL_MCP_TOOL_SERVER_DOC_AREA
        ? getExternalMcpToolServerRowAnchorId(entry.meta.key)
      : area === CRAWLER_ACCESS_MCP_DOC_AREA
        ? getCrawlerAccessMcpApiRowAnchorId(entry.meta.key)
      : area === CLOUDFLARE_AI_GATEWAY_MCP_DOC_AREA
        ? getCloudflareAiGatewayMcpApiRowAnchorId(entry.meta.key)
      : area === BYTEPLUS_MODELARK_MCP_DOC_AREA
        ? getBytePlusModelArkMcpApiRowAnchorId(entry.meta.key)
      : area === OPENAI_MCP_DOC_AREA
        ? getOpenAiMcpApiRowAnchorId(entry.meta.key)
      : area === EXA_MCP_DOC_AREA
        ? getExaMcpApiRowAnchorId(entry.meta.key)
      : area === FEISHU_BASE_MCP_DOC_AREA
        ? getFeishuBaseMcpApiRowAnchorId(entry.meta.key)
      : area === LARK_APP_MCP_DOC_AREA
        ? getLarkAppMcpApiRowAnchorId(entry.meta.key)
      : area === STRIPE_MCP_DOC_AREA
        ? getStripeMcpApiRowAnchorId(entry.meta.key)
      : area === MIROMIND_MCP_DOC_AREA
        ? getMiroMindMcpApiRowAnchorId(entry.meta.key)
      : area === SEALION_MCP_DOC_AREA
        ? getSealionMcpApiRowAnchorId(entry.meta.key)
      : area === AGENTIC_OS_VDEOXPLN_DOC_AREA
        ? getAgenticGraphVdeoxplnRowAnchorId(entry.meta.key)
      : area === OPERATOR_DEPLOY_MCP_DOC_AREA
        ? getOperatorDeployMcpApiRowAnchorId(entry.meta.key)
      : area === VIDEODB_MCP_DOC_AREA
        ? getVideodbMcpApiRowAnchorId(entry.meta.key)
        : getGrabMapsMcpApiRowAnchorId(entry.meta.key)
  const mappedEntry = buildDocMappedEntry(entry, values, anchorId)
  const configJson =
    entry.meta.key === API_NATIVE_BROWSER_MCP_AGENT_CONFIG_KEY
      ? buildApiNativeBrowserMcpAgentConfigJson(values)
      : entry.meta.key === API_NATIVE_BROWSER_MCP_BRIDGE_CONFIG_KEY
        ? buildBrowserBridgeMcpConfigJson(values)
        : entry.meta.key === EXTERNAL_MCP_TOOL_SERVER_STDIO_CONFIG_KEY
          ? buildExternalMcpStdioConfigJson()
          : entry.meta.key === EXTERNAL_MCP_TOOL_SERVER_HTTP_CONFIG_KEY
            ? buildExternalMcpStreamableHttpConfigJson()
            : entry.meta.key === AGENTIC_OS_TOOL_SERVER_LOCAL_CONFIG_KEY
              ? buildAgenticGraphToolServerLocalStdioConfigJson()
              : entry.meta.key === AGENTIC_OS_TOOL_SERVER_PAGES_CONFIG_KEY
                ? buildAgenticGraphToolServerPagesHttpConfigJson()
        : entry.meta.key === CLOUDFLARE_AI_GATEWAY_MCP_REMOTE_CONFIG_KEY
          ? buildCloudflareAiGatewayMcpRemoteConfigJson()
        : entry.meta.key === BYTEPLUS_MODELARK_MCP_RESPONSES_TOOL_CONFIG_KEY
          ? buildBytePlusModelArkMcpResponsesToolConfigJson()
          : entry.meta.key === BYTEPLUS_MODELARK_MCP_CODEX_CONFIG_KEY
            ? buildBytePlusModelArkMcpCodexAddCommand()
            : entry.meta.key === BYTEPLUS_MODELARK_MCP_MEDIA_PROFILE_KEY
              ? buildBytePlusModelArkMcpMediaProfileJson()
              : entry.meta.key === OPENAI_MCP_RESPONSES_TOOL_CONFIG_KEY
                ? buildOpenAiMcpResponsesToolConfigJson(values)
                : entry.meta.key === OPENAI_MCP_RESPONSES_REQUEST_KEY
                  ? buildOpenAiMcpResponsesRequestJson(values)
                  : entry.meta.key === OPENAI_MCP_CHATGPT_APP_CONFIG_KEY
                    ? buildOpenAiMcpChatGptAppConnectionJson(values)
        : entry.meta.key === STRIPE_MCP_REMOTE_CONFIG_KEY
          ? buildStripeRemoteMcpConfigJson(values)
          : entry.meta.key === STRIPE_MCP_LOCAL_CONFIG_KEY
            ? buildStripeLocalMcpConfigJson(values)
            : entry.meta.key === EXA_MCP_CODEX_CONFIG_KEY
              ? buildExaCodexMcpAddCommand(values)
              : entry.meta.key === EXA_MCP_REMOTE_CONFIG_KEY
                ? buildExaRemoteMcpConfigJson(values)
                : entry.meta.key === LARK_APP_MCP_REMOTE_CONFIG_KEY
                  ? buildLarkAppRemoteMcpConfigJson()
                : entry.meta.key === SEALION_MCP_REMOTE_CONFIG_KEY
                    ? buildSealionMcpRemoteConfigJson()
                  : entry.meta.key === VIDEODB_MCP_UVX_CONFIG_KEY
                    ? buildVideodbUvxMcpConfigJson(values)
                    : entry.meta.key === VIDEODB_MCP_PIPX_CONFIG_KEY
                      ? buildVideodbPipxMcpConfigJson(values)
                      : entry.meta.key === VIDEODB_MCP_CLAUDE_CODE_COMMAND_KEY
                        ? buildVideodbClaudeCodeMcpCommand(values)
                  : ''
  if (!configJson) return mappedEntry
  return {
    ...mappedEntry,
    index: normalizeText([mappedEntry.index, configJson].join(' ')),
    valueDisplayOverride: configJson,
  }
}
