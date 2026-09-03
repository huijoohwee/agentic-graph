import path from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import McpHubView from '@/features/panels/views/McpHubView'
import {
  AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES,
  AGENTIC_OS_TOOL_SERVER_KEY,
  AGENTIC_OS_TOOL_SERVER_LIVE_PROOF_KEY,
  AGENTIC_OS_TOOL_SERVER_LOCAL_CONFIG_KEY,
  AGENTIC_OS_TOOL_SERVER_PAGES_CONFIG_KEY,
  buildAgenticGraphToolServerLocalStdioConfigJson,
  buildAgenticGraphToolServerLocalToolNamesText,
  buildAgenticGraphToolServerPagesHttpConfigJson,
  getAgenticGraphToolServerRowAnchorId,
} from '@/features/panels/views/agentic-graph-tool-server-docs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildAgenticGraphLocalMcpToolDefinitions,
} from '../../../mcp/local-tool-contract.js'

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
      React.createElement(McpHubView, { searchQuery: 'agenticGraphToolServer' } as never),
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

const assertNoSecretOrLiveDeployMaterial = (text: string): void => {
  ;[
    'YOUR_API_KEY',
    'your_api_key',
    'sk-',
    'ghp_',
    'airvio.co',
    'optional-mcps',
    '~/.hermes',
    'mcp_servers:',
  ].forEach(token => {
    if (text.toLowerCase().includes(token.toLowerCase())) {
      throw new Error(`expected agentic-graph tool-server config to omit secret/live/copy token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

export async function testMcpHubSurfacesAgenticGraphToolServerRows() {
  await withRenderedMcpHub(container => {
    const text = container.textContent || ''
    ;[
      'agentic-graph Tool Servers',
      'agenticGraphToolServer.server.role',
      'agenticGraphToolServer.surface.local_stdio',
      'agenticGraphToolServer.surface.pages_http_readonly',
      'agenticGraphToolServer.tool.names',
      AGENTIC_OS_TOOL_SERVER_LIVE_PROOF_KEY,
      'agenticGraphToolServer.config.local_stdio',
      'agenticGraphToolServer.config.pages_http_readonly',
      '<ABS_PATH_TO_agentic-graph>',
      '<agentic-graph-origin>',
      'AGENTIC_OS_ROOT',
      'AGENTIC_OS_PYTHON',
    ].forEach(token => {
      if (!text.includes(token)) throw new Error(`expected agentic-graph tool-server hub row ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    })
    if (!getAgenticGraphToolServerRowAnchorId('agenticGraphToolServer.config.local_stdio').startsWith('mcp-row-agentic-graph-tool-server-')) {
      throw new Error('agentic-graph tool-server anchors must use the agentic-graph tool-server namespace')
    }
    assertNoSecretOrLiveDeployMaterial(text)
  })
}

export function testAgenticGraphToolServerGeneratedConfigsStayPlaceholderOnly() {
  const localText = buildAgenticGraphToolServerLocalStdioConfigJson()
  const pagesText = buildAgenticGraphToolServerPagesHttpConfigJson()
  const local = JSON.parse(localText) as { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> }
  const pages = JSON.parse(pagesText) as { mcpServers?: Record<string, { type?: string; url?: string; tools?: { include?: string[] } }> }

  const localServer = local.mcpServers?.[AGENTIC_OS_TOOL_SERVER_KEY]
  if (localServer?.command !== 'node') {
    throw new Error(`expected local agentic-graph MCP to launch through node, got ${JSON.stringify(local)}`)
  }
  if (JSON.stringify(localServer?.args) !== JSON.stringify(['<ABS_PATH_TO_agentic-graph>/mcp/server.js'])) {
    throw new Error(`expected local agentic-graph MCP server path placeholder, got ${JSON.stringify(local)}`)
  }
  if (localServer?.env?.AGENTIC_OS_ROOT !== '<ABS_PATH_TO_agentic-graph>' || localServer?.env?.AGENTIC_OS_PYTHON !== '<ABS_PATH_TO_PYTHON>') {
    throw new Error(`expected local agentic-graph MCP env placeholders, got ${JSON.stringify(local)}`)
  }

  const pagesServer = pages.mcpServers?.[AGENTIC_OS_TOOL_SERVER_KEY]
  if (pagesServer?.type !== 'streamable-http' || pagesServer?.url !== 'https://<agentic-graph-origin>/agentic-graph/mcp') {
    throw new Error(`expected read-only Pages HTTP placeholder, got ${JSON.stringify(pages)}`)
  }
  if (JSON.stringify(pagesServer?.tools?.include) !== JSON.stringify(['search', 'fetch'])) {
    throw new Error(`expected Pages HTTP config to include only read-only source tools, got ${JSON.stringify(pages)}`)
  }

  assertNoSecretOrLiveDeployMaterial(`${localText}\n${pagesText}`)
}

export async function testAgenticGraphToolServerLocalStdioLiveReadinessListsSourceOwnedTools() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const expectedToolNames = buildAgenticGraphLocalMcpToolDefinitions().map(tool => tool.name)
  const client = new Client({
    name: 'agentic-graph-mainpanel-mcp-live-readiness',
    version: '0.0.0',
  })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(repoRoot, 'mcp/server.js')],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ''),
      HOME: String(process.env.HOME || ''),
      NODE_ENV: 'test',
      AGENTIC_OS_ROOT: repoRoot,
      AGENTIC_OS_PYTHON: String(process.env.AGENTIC_OS_PYTHON || 'python3'),
      AGENTIC_OS_MCP_TIMEOUT_MS: '600000',
    },
    stderr: 'pipe',
  })
  let stderrText = ''
  transport.stderr?.on('data', chunk => {
    stderrText += String(chunk)
  })

  try {
    await client.connect(transport, { timeout: 10_000 })
    const capabilities = client.getServerCapabilities()
    if (!capabilities?.tools) {
      throw new Error(`expected local stdio server initialize to advertise tools, got ${JSON.stringify(capabilities)}`)
    }
    const listed = await client.listTools(undefined, { timeout: 10_000 })
    const actualToolNames = listed.tools.map(tool => tool.name)
    if (JSON.stringify(actualToolNames) !== JSON.stringify(expectedToolNames)) {
      throw new Error(`expected stdio tools/list to match source-owned tool definitions, got ${JSON.stringify({ actualToolNames, expectedToolNames, stderrText })}`)
    }
  } finally {
    await client.close().catch(() => undefined)
  }
}

export function testAgenticGraphToolServerSsotRowsCoverInternalToolsAndBoundaries() {
  const keys = new Set(AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES.map(entry => entry.meta.key))
  for (const key of [
    'agenticGraphToolServer.server.role',
    'agenticGraphToolServer.surface.local_stdio',
    'agenticGraphToolServer.surface.pages_http_readonly',
    'agenticGraphToolServer.tool.names',
    AGENTIC_OS_TOOL_SERVER_LIVE_PROOF_KEY,
    'agenticGraphToolServer.selection.policy',
    'agenticGraphToolServer.approval.boundary',
    'agenticGraphToolServer.secrets.boundary',
    AGENTIC_OS_TOOL_SERVER_LOCAL_CONFIG_KEY,
    AGENTIC_OS_TOOL_SERVER_PAGES_CONFIG_KEY,
    'agenticGraphToolServer.copy.boundary',
  ]) {
    if (!keys.has(key)) throw new Error(`missing agentic-graph tool-server SSOT row ${key}`)
  }

  const namesEntry = AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES.find(entry => entry.meta.key === 'agenticGraphToolServer.tool.names')
  const liveEntry = AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES.find(entry => entry.meta.key === AGENTIC_OS_TOOL_SERVER_LIVE_PROOF_KEY)
  const copyEntry = AGENTIC_OS_TOOL_SERVER_DOC_ENTRIES.find(entry => entry.meta.key === 'agenticGraphToolServer.copy.boundary')
  const combined = `${namesEntry?.value || ''}\n${namesEntry?.details.responsibility || ''}\n${liveEntry?.value || ''}\n${copyEntry?.value || ''}\n${copyEntry?.details.responsibility || ''}`
  ;[
    'search',
    'fetch',
    'agentic-graph.memory.search',
    'agentic-graph.probe.generate',
    'agentic-graph.os.status',
    'client.listTools',
    'do not copy Hermes code',
  ].forEach(token => {
    if (!combined.includes(token)) throw new Error(`expected agentic-graph tool-server contract to include ${JSON.stringify(token)}, got ${JSON.stringify(combined)}`)
  })
  if (namesEntry?.value !== buildAgenticGraphToolServerLocalToolNamesText()) {
    throw new Error('expected MainPanel agentic-graph tool names to be projected from the shared local MCP registry')
  }
}
