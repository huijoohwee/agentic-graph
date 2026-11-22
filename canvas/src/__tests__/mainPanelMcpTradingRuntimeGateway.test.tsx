import React from 'react'
import { createRoot } from 'react-dom/client'
import McpHubView from '@/features/panels/views/McpHubView'
import {
  TRADING_RUNTIME_GATEWAY_DOC_ENTRIES,
  TRADING_RUNTIME_GATEWAY_HTTP_CONFIG_KEY,
  TRADING_RUNTIME_GATEWAY_LOCAL_ORIGIN,
  TRADING_RUNTIME_GATEWAY_PLACEHOLDER_ENV,
  buildTradingRuntimeGatewayLocalHttpConfigJson,
  getTradingRuntimeGatewayRowAnchorId,
} from '@/features/panels/views/tradingRuntimeGatewayDocs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'

const withRenderedMcpHub = async (assertions: (container: Element) => void): Promise<void> => {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    useGraphStore.getState().resetAll()

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(McpHubView, { searchQuery: 'tradingRuntimeGateway' } as never),
      { window: dom.window, frames: 6 },
    )

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

const assertNoSecretOrProviderMaterial = (text: string): void => {
  ;[
    'sk-',
    'Bearer ey',
    'access_token=',
    'refresh_token=',
    'audience_token=',
    'moomoo',
    'futu',
    'tiger brokers',
    'longbridge',
    'ibkr',
    'interactive brokers',
  ].forEach(token => {
    if (text.toLowerCase().includes(token.toLowerCase())) {
      throw new Error(`expected trading runtime gateway surface to omit secret/provider token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

export async function testMcpHubSurfacesTradingRuntimeGatewayRows() {
  await withRenderedMcpHub(container => {
    const text = container.textContent || ''
    ;[
      'Trading Runtime Gateway',
      'tradingRuntimeGateway.gateway.role',
      'tradingRuntimeGateway.transport.local_http_mcp',
      'tradingRuntimeGateway.operations.read_only',
      'tradingRuntimeGateway.admission.signed_grant',
      'tradingRuntimeGateway.budget.zero_cap',
      'tradingRuntimeGateway.config.local_http_readonly',
      'tradingRuntimeGateway.copy.boundary',
      TRADING_RUNTIME_GATEWAY_PLACEHOLDER_ENV,
    ].forEach(token => {
      if (!text.includes(token)) throw new Error(`expected trading runtime gateway hub row ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    })
    if (!getTradingRuntimeGatewayRowAnchorId('tradingRuntimeGateway.config.local_http_readonly').startsWith('mcp-row-trading-runtime-gateway-')) {
      throw new Error('trading runtime gateway anchors must use the trading runtime gateway namespace')
    }
  })
}

export function testTradingRuntimeGatewayConfigTemplateStaysGenericAndNonSecret() {
  const configText = buildTradingRuntimeGatewayLocalHttpConfigJson()
  const parsed = JSON.parse(configText) as { mcpServers?: Record<string, { type?: string; url?: string; headers?: Record<string, string> }> }
  const server = parsed.mcpServers?.['<server-key>']

  if (server?.type !== 'streamable-http') {
    throw new Error(`expected streamable-http template, got ${JSON.stringify(parsed)}`)
  }
  if (server?.url !== `${TRADING_RUNTIME_GATEWAY_LOCAL_ORIGIN}/mcp`) {
    throw new Error(`expected local read-only gateway origin placeholder, got ${JSON.stringify(parsed)}`)
  }
  if (server?.headers?.Authorization !== `Bearer \${${TRADING_RUNTIME_GATEWAY_PLACEHOLDER_ENV}}`) {
    throw new Error(`expected Authorization env placeholder, got ${JSON.stringify(parsed)}`)
  }
  assertNoSecretOrProviderMaterial(configText)
}

export function testTradingRuntimeGatewaySsotRowsCoverAdmissionAndBoundaries() {
  const keys = new Set(TRADING_RUNTIME_GATEWAY_DOC_ENTRIES.map(entry => entry.meta.key))
  for (const key of [
    'tradingRuntimeGateway.gateway.role',
    'tradingRuntimeGateway.discovery.capabilities',
    'tradingRuntimeGateway.operations.read_only',
    'tradingRuntimeGateway.admission.signed_grant',
    'tradingRuntimeGateway.admission.mapping_digest',
    'tradingRuntimeGateway.budget.zero_cap',
    'tradingRuntimeGateway.isolation.provider',
    'tradingRuntimeGateway.refusal.typed_codes',
    'tradingRuntimeGateway.request.semantic_schema',
    'tradingRuntimeGateway.secrets.boundary',
    TRADING_RUNTIME_GATEWAY_HTTP_CONFIG_KEY,
    'tradingRuntimeGateway.copy.boundary',
  ]) {
    if (!keys.has(key)) throw new Error(`missing trading runtime gateway SSOT row ${key}`)
  }

  const combined = TRADING_RUNTIME_GATEWAY_DOC_ENTRIES
    .map(entry => `${entry.value || ''}\n${entry.details.responsibility || ''}\n${entry.details.notes || ''}`)
    .join('\n')
  assertNoSecretOrProviderMaterial(combined)
  if (!combined.includes('provider-neutral')) {
    throw new Error('expected trading runtime gateway rows to stay provider-neutral')
  }
}