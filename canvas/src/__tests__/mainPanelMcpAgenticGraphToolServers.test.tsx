import path from 'node:path'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import McpHubView from '@/features/panels/views/McpHubView'
import {
  KNOWGRPH_TOOL_SERVER_DOC_ENTRIES,
  KNOWGRPH_TOOL_SERVER_KEY,
  KNOWGRPH_TOOL_SERVER_LIVE_PROOF_KEY,
  KNOWGRPH_TOOL_SERVER_LOCAL_CONFIG_KEY,
  KNOWGRPH_TOOL_SERVER_PAGES_CONFIG_KEY,
  buildKnowgrphToolServerLocalStdioConfigJson,
  buildKnowgrphToolServerLocalToolNamesText,
  buildKnowgrphToolServerPagesHttpConfigJson,
  getKnowgrphToolServerRowAnchorId,
} from '@/features/panels/views/knowgrphToolServerDocs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  buildKnowgrphLocalMcpToolDefinitions,
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
      React.createElement(McpHubView, { searchQuery: 'knowgrphToolServer' } as never),
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
      throw new Error(`expected Knowgrph tool-server config to omit secret/live/copy token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

export async function testMcpHubSurfacesKnowgrphToolServerRows() {
  await withRenderedMcpHub(container => {
    const text = container.textContent || ''
    ;[
      'Knowgrph Tool Servers',
      'knowgrphToolServer.server.role',
      'knowgrphToolServer.surface.local_stdio',
      'knowgrphToolServer.surface.pages_http_readonly',
      'knowgrphToolServer.tool.names',
      KNOWGRPH_TOOL_SERVER_LIVE_PROOF_KEY,
      'knowgrphToolServer.config.local_stdio',
      'knowgrphToolServer.config.pages_http_readonly',
      '<ABS_PATH_TO_KNOWGRPH>',
      '<knowgrph-origin>',
      'KNOWGRPH_ROOT',
      'KNOWGRPH_PYTHON',
    ].forEach(token => {
      if (!text.includes(token)) throw new Error(`expected Knowgrph tool-server hub row ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    })
    if (!getKnowgrphToolServerRowAnchorId('knowgrphToolServer.config.local_stdio').startsWith('mcp-row-knowgrph-tool-server-')) {
      throw new Error('Knowgrph tool-server anchors must use the Knowgrph tool-server namespace')
    }
    assertNoSecretOrLiveDeployMaterial(text)
  })
}

export function testKnowgrphToolServerGeneratedConfigsStayPlaceholderOnly() {
  const localText = buildKnowgrphToolServerLocalStdioConfigJson()
  const pagesText = buildKnowgrphToolServerPagesHttpConfigJson()
  const local = JSON.parse(localText) as { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> }
  const pages = JSON.parse(pagesText) as { mcpServers?: Record<string, { type?: string; url?: string; tools?: { include?: string[] } }> }

  const localServer = local.mcpServers?.[KNOWGRPH_TOOL_SERVER_KEY]
  if (localServer?.command !== 'node') {
    throw new Error(`expected local Knowgrph MCP to launch through node, got ${JSON.stringify(local)}`)
  }
  if (JSON.stringify(localServer?.args) !== JSON.stringify(['<ABS_PATH_TO_KNOWGRPH>/mcp/server.js'])) {
    throw new Error(`expected local Knowgrph MCP server path placeholder, got ${JSON.stringify(local)}`)
  }
  if (localServer?.env?.KNOWGRPH_ROOT !== '<ABS_PATH_TO_KNOWGRPH>' || localServer?.env?.KNOWGRPH_PYTHON !== '<ABS_PATH_TO_PYTHON>') {
    throw new Error(`expected local Knowgrph MCP env placeholders, got ${JSON.stringify(local)}`)
  }

  const pagesServer = pages.mcpServers?.[KNOWGRPH_TOOL_SERVER_KEY]
  if (pagesServer?.type !== 'streamable-http' || pagesServer?.url !== 'https://<knowgrph-origin>/knowgrph/mcp') {
    throw new Error(`expected read-only Pages HTTP placeholder, got ${JSON.stringify(pages)}`)
  }
  if (JSON.stringify(pagesServer?.tools?.include) !== JSON.stringify(['search', 'fetch'])) {
    throw new Error(`expected Pages HTTP config to include only read-only source tools, got ${JSON.stringify(pages)}`)
  }

  assertNoSecretOrLiveDeployMaterial(`${localText}\n${pagesText}`)
}

export async function testKnowgrphToolServerLocalStdioLiveReadinessListsSourceOwnedTools() {
  const repoRoot = path.resolve(process.cwd(), '..')
  const expectedToolNames = buildKnowgrphLocalMcpToolDefinitions().map(tool => tool.name)
  const client = new Client({
    name: 'knowgrph-mainpanel-mcp-live-readiness',
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
      KNOWGRPH_ROOT: repoRoot,
      KNOWGRPH_PYTHON: String(process.env.KNOWGRPH_PYTHON || 'python3'),
      KNOWGRPH_MCP_TIMEOUT_MS: '600000',
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

export function testKnowgrphToolServerSsotRowsCoverInternalToolsAndBoundaries() {
  const keys = new Set(KNOWGRPH_TOOL_SERVER_DOC_ENTRIES.map(entry => entry.meta.key))
  for (const key of [
    'knowgrphToolServer.server.role',
    'knowgrphToolServer.surface.local_stdio',
    'knowgrphToolServer.surface.pages_http_readonly',
    'knowgrphToolServer.tool.names',
    KNOWGRPH_TOOL_SERVER_LIVE_PROOF_KEY,
    'knowgrphToolServer.selection.policy',
    'knowgrphToolServer.approval.boundary',
    'knowgrphToolServer.secrets.boundary',
    KNOWGRPH_TOOL_SERVER_LOCAL_CONFIG_KEY,
    KNOWGRPH_TOOL_SERVER_PAGES_CONFIG_KEY,
    'knowgrphToolServer.copy.boundary',
  ]) {
    if (!keys.has(key)) throw new Error(`missing Knowgrph tool-server SSOT row ${key}`)
  }

  const namesEntry = KNOWGRPH_TOOL_SERVER_DOC_ENTRIES.find(entry => entry.meta.key === 'knowgrphToolServer.tool.names')
  const liveEntry = KNOWGRPH_TOOL_SERVER_DOC_ENTRIES.find(entry => entry.meta.key === KNOWGRPH_TOOL_SERVER_LIVE_PROOF_KEY)
  const copyEntry = KNOWGRPH_TOOL_SERVER_DOC_ENTRIES.find(entry => entry.meta.key === 'knowgrphToolServer.copy.boundary')
  const combined = `${namesEntry?.value || ''}\n${namesEntry?.details.responsibility || ''}\n${liveEntry?.value || ''}\n${copyEntry?.value || ''}\n${copyEntry?.details.responsibility || ''}`
  ;[
    'search',
    'fetch',
    'knowgrph.memory.search',
    'knowgrph.probe.generate',
    'knowgrph.os.status',
    'client.listTools',
    'do not copy Hermes code',
  ].forEach(token => {
    if (!combined.includes(token)) throw new Error(`expected Knowgrph tool-server contract to include ${JSON.stringify(token)}, got ${JSON.stringify(combined)}`)
  })
  if (namesEntry?.value !== buildKnowgrphToolServerLocalToolNamesText()) {
    throw new Error('expected MainPanel Knowgrph tool names to be projected from the shared local MCP registry')
  }
}
