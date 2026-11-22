import React from 'react'
import { createRoot } from 'react-dom/client'
import McpHubView from '@/features/panels/views/McpHubView'
import {
  buildMoomooMarketCodexMcpAddCommand,
  buildMoomooMarketMcpRemoteUrlFromValues,
  buildMoomooMarketRemoteMcpConfigJson,
  resolveMoomooMarketMcpEnabledTools,
} from '@/features/panels/views/moomooMarketMcpApiDocs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { assertMcpHubSurfacesMoomooMarketMcpConfig } from '@/__tests__/helpers/mainPanelMcpExpectations'
import {
  MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
  MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES,
  MOOMOO_MARKET_MCP_PROFILE_TOOL_NAMES,
  MOOMOO_MARKET_MCP_REMOTE_URL,
  MOOMOO_MARKET_MCP_TOOL_PROFILES,
  MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES,
  normalizeMoomooMarketMcpToolNames,
  resolveMoomooMarketMcpProfileTools,
} from 'grph-shared/search/moomooMarketMcpSsot'

const withRenderedMcpHub = async (assertions: (container: Element) => void): Promise<void> => {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(McpHubView), { window: dom.window, frames: 4 })

    assertions(container)
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

const assertNoSecretMaterial = (text: string): void => {
  ;[
    'YOUR_MOOMOO_API_KEY',
    'your_api_key',
    'access_token=',
    'refresh_token=',
    'Bearer ey',
    'moomooApiKey=',
    'sk_test_',
    'sk_live_',
  ].forEach(token => {
    if (text.includes(token)) {
      throw new Error(`expected generated Moomoo Market MCP config to omit secret token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

const assertNoWriteTools = (text: string): void => {
  MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES.forEach(tool => {
    if (text.includes(tool)) {
      throw new Error(`expected generated Moomoo Market MCP config to exclude write tool ${JSON.stringify(tool)}, got ${JSON.stringify(text)}`)
    }
  })
}

export async function testMcpHubSurfacesMoomooMarketMcpConfig() {
  await withRenderedMcpHub(assertMcpHubSurfacesMoomooMarketMcpConfig)
}

export function testMoomooMarketMcpDefaultGeneratedConfigIsNonSecretAndHosted() {
  const codexCommand = buildMoomooMarketCodexMcpAddCommand({})
  const configText = buildMoomooMarketRemoteMcpConfigJson({})
  const parsed = JSON.parse(configText) as { mcpServers?: Record<string, { url?: string }> }

  if (parsed.mcpServers?.[MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY]?.url !== MOOMOO_MARKET_MCP_REMOTE_URL) {
    throw new Error(`expected default Moomoo Market MCP URL ${MOOMOO_MARKET_MCP_REMOTE_URL}, got ${JSON.stringify(parsed)}`)
  }
  if (codexCommand !== `codex mcp add ${MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY} --url '${MOOMOO_MARKET_MCP_REMOTE_URL}'`) {
    throw new Error(`expected Codex command to use default hosted Moomoo Market MCP URL, got ${JSON.stringify(codexCommand)}`)
  }
  if (buildMoomooMarketMcpRemoteUrlFromValues({}) !== MOOMOO_MARKET_MCP_REMOTE_URL) {
    throw new Error('expected Moomoo Market MCP remote URL to stay the fixed hosted origin')
  }
  if (configText.includes('?') || codexCommand.includes('?tools=')) {
    throw new Error(`expected Moomoo Market MCP config to avoid an unverified tools query parameter, got ${JSON.stringify(configText)}`)
  }
  const combined = `${codexCommand}\n${configText}`
  assertNoSecretMaterial(combined)
  assertNoWriteTools(combined)
}

export function testMoomooMarketMcpProfilesStayReadOnlyAndBounded() {
  MOOMOO_MARKET_MCP_TOOL_PROFILES.forEach(profile => {
    const tools = resolveMoomooMarketMcpProfileTools(profile)
    const expected = [...MOOMOO_MARKET_MCP_PROFILE_TOOL_NAMES[profile]]
    if (JSON.stringify(tools) !== JSON.stringify(expected)) {
      throw new Error(`expected Moomoo Market MCP profile ${JSON.stringify(profile)} to resolve its shared read-only tools, got ${JSON.stringify(tools)}`)
    }
    if (tools.length > 50) {
      throw new Error(`expected Moomoo Market MCP profile ${JSON.stringify(profile)} to stay within the 50-tool external-profile cap, got ${tools.length}`)
    }
    MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES.forEach(writeTool => {
      if (tools.includes(writeTool)) {
        throw new Error(`expected Moomoo Market MCP profile ${JSON.stringify(profile)} to exclude write tool ${JSON.stringify(writeTool)}`)
      }
    })
  })
}

export function testMoomooMarketMcpEnabledToolsFilterWriteAndUnsupportedTools() {
  const requested = [
    'trading_order_place',
    'unsupported_moomoo_tool',
    'quote_stock_quote',
    'quote_cur_kline',
    'quote_stock_quote',
    'sim_trade_input_order',
    'unknown_moomoo_tool',
  ]
  const values = {
    'search.moomooMarket.mcp.toolProfile': 'market',
    'search.moomooMarket.mcp.enabledTools': JSON.stringify(requested),
  }
  const enabled = resolveMoomooMarketMcpEnabledTools(values)
  const normalized = normalizeMoomooMarketMcpToolNames(requested)

  if (JSON.stringify(enabled) !== JSON.stringify(normalized)) {
    throw new Error(`expected write and unsupported Moomoo tools to be filtered from the enabled allowlist, got ${JSON.stringify(enabled)}`)
  }
  if (JSON.stringify(enabled) !== JSON.stringify(['quote_stock_quote', 'quote_cur_kline'])) {
    throw new Error(`expected only admitted read-only Moomoo tools to remain, got ${JSON.stringify(enabled)}`)
  }
  MOOMOO_MARKET_MCP_WRITE_TOOL_NAMES.forEach(writeTool => {
    if (enabled.includes(writeTool)) {
      throw new Error(`expected enabled Moomoo tools to exclude write tool ${JSON.stringify(writeTool)}`)
    }
  })
  const configText = buildMoomooMarketRemoteMcpConfigJson(values)
  if (buildMoomooMarketMcpRemoteUrlFromValues(values) !== MOOMOO_MARKET_MCP_REMOTE_URL) {
    throw new Error('expected Moomoo Market MCP remote URL to remain the fixed hosted origin regardless of profile')
  }
  assertNoSecretMaterial(configText)
  assertNoWriteTools(configText)
}

export function testMoomooMarketMcpEmptyAllowlistFallsBackToMarketProfile() {
  const enabled = normalizeMoomooMarketMcpToolNames(['trading_order_place', 'unsupported_moomoo_tool'])
  if (JSON.stringify(enabled) !== JSON.stringify([...MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES])) {
    throw new Error(`expected an empty admitted allowlist to fall back to the read-only market profile, got ${JSON.stringify(enabled)}`)
  }
}