import type { SettingMeta } from './types'
import { LS_KEYS } from '@/lib/config'
import {
  MOOMOO_MARKET_MCP_CONNECTION_MODES,
  MOOMOO_MARKET_MCP_DEFAULT_AUTH_BOUNDARY,
  MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE,
  MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON,
  MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS,
  MOOMOO_MARKET_MCP_DEFAULT_REQUIRE_TOOL_REVIEW,
  MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
  MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE,
  MOOMOO_MARKET_MCP_CONNECTED_STATUS,
  MOOMOO_MARKET_MCP_REMOTE_URL,
  MOOMOO_MARKET_MCP_TOOL_PROFILES,
} from 'grph-shared/search/moomooMarketMcpSsot'
import { localBooleanSetting, localJsonSetting, localNumberSetting, localStringSetting } from './registry-local-settings'

export const moomooMarketMcpSettingsRegistry: SettingMeta[] = [
  localStringSetting({
    key: 'search.moomooMarket.mcp.serverKey',
    storageKey: LS_KEYS.searchMoomooMarketMcpServerKey,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
    docKey: 'search.moomooMarket.mcp.serverKey',
  }),
  localStringSetting({
    key: 'search.moomooMarket.mcp.remoteUrl',
    storageKey: LS_KEYS.searchMoomooMarketMcpRemoteUrl,
    defaultValue: MOOMOO_MARKET_MCP_REMOTE_URL,
    docKey: 'search.moomooMarket.mcp.remoteUrl',
  }),
  localStringSetting({
    key: 'search.moomooMarket.mcp.toolProfile',
    storageKey: LS_KEYS.searchMoomooMarketMcpToolProfile,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE,
    options: [...MOOMOO_MARKET_MCP_TOOL_PROFILES],
    docKey: 'search.moomooMarket.mcp.toolProfile',
  }),
  localJsonSetting({
    key: 'search.moomooMarket.mcp.enabledTools',
    storageKey: LS_KEYS.searchMoomooMarketMcpEnabledToolsJson,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON,
    docKey: 'search.moomooMarket.mcp.enabledTools',
  }),
  localStringSetting({
    key: 'search.moomooMarket.mcp.connectionMode',
    storageKey: LS_KEYS.searchMoomooMarketMcpConnectionMode,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE,
    options: [...MOOMOO_MARKET_MCP_CONNECTION_MODES],
    docKey: 'search.moomooMarket.mcp.connectionMode',
  }),
  localNumberSetting({
    key: 'search.moomooMarket.mcp.startupTimeoutMs',
    storageKey: LS_KEYS.searchMoomooMarketMcpStartupTimeoutMs,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
    min: 1000,
    max: 300000,
    docKey: 'search.moomooMarket.mcp.startupTimeoutMs',
  }),
  localNumberSetting({
    key: 'search.moomooMarket.mcp.maxRows',
    storageKey: LS_KEYS.searchMoomooMarketMcpMaxRows,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS,
    min: 1,
    max: 600,
    docKey: 'search.moomooMarket.mcp.maxRows',
  }),
  localBooleanSetting({
    key: 'search.moomooMarket.mcp.requireToolReview',
    storageKey: LS_KEYS.searchMoomooMarketMcpRequireToolReview,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_REQUIRE_TOOL_REVIEW,
    docKey: 'search.moomooMarket.mcp.requireToolReview',
  }),
  localStringSetting({
    key: 'search.moomooMarket.mcp.authBoundary',
    storageKey: LS_KEYS.searchMoomooMarketMcpAuthBoundary,
    defaultValue: MOOMOO_MARKET_MCP_DEFAULT_AUTH_BOUNDARY,
    docKey: 'search.moomooMarket.mcp.authBoundary',
  }),
  localStringSetting({
    key: 'search.moomooMarket.mcp.connectedStatus',
    storageKey: LS_KEYS.searchMoomooMarketMcpConnectedStatus,
    defaultValue: MOOMOO_MARKET_MCP_CONNECTED_STATUS,
    docKey: 'search.moomooMarket.mcp.connectedStatus',
  }),
]