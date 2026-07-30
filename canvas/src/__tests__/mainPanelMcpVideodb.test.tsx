import React from 'react'
import { createRoot } from 'react-dom/client'
import McpHubView from '@/features/panels/views/McpHubView'
import {
  VIDEODB_MCP_AI_TOOLS,
  VIDEODB_MCP_ALL_TOOLS,
  VIDEODB_MCP_ASYNC_TOOLS,
  VIDEODB_MCP_CLAUDE_CODE_COMMAND_KEY,
  VIDEODB_MCP_CREDENTIAL_ENV,
  VIDEODB_MCP_CREDENTIAL_PLACEHOLDER,
  VIDEODB_MCP_DOC_ENTRIES,
  VIDEODB_MCP_PACKAGE,
  VIDEODB_MCP_PIPX_CONFIG_KEY,
  VIDEODB_MCP_POLL_INTERVAL_MS,
  VIDEODB_MCP_POLL_MAX_ITERATIONS,
  VIDEODB_MCP_SERVER_KEY,
  VIDEODB_MCP_UVX_CONFIG_KEY,
  buildVideodbClaudeCodeMcpCommand,
  buildVideodbPipxMcpConfigJson,
  buildVideodbUvxMcpConfigJson,
  getVideodbMcpApiRowAnchorId,
} from '@/features/panels/views/videodbMcpApiDocs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { assertMcpHubSurfacesVideodbMcpConfig } from '@/__tests__/helpers/mainPanelMcpExpectations'

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

const assertNoSecretOrFabricatedRuntimeValues = (text: string): void => {
  ;[
    'YOUR_VIDEODB_API_KEY',
    'your_api_key',
    'vdb_live_',
    'vdb_test_',
    'stream.videodb.io',
    'job-upload-',
    'job-index-',
    'job-generation-',
  ].forEach(token => {
    if (text.includes(token)) {
      throw new Error(`expected VideoDB MCP config to omit secret or fabricated runtime token ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}

export async function testMcpHubSurfacesVideodbMcpConfig() {
  await withRenderedMcpHub(assertMcpHubSurfacesVideodbMcpConfig)
}

export function testVideodbMcpGeneratedConfigsUseCredentialPlaceholderOnly() {
  const uvxConfigText = buildVideodbUvxMcpConfigJson({})
  const pipxConfigText = buildVideodbPipxMcpConfigJson({})
  const claudeCommand = buildVideodbClaudeCodeMcpCommand({})
  const uvxConfig = JSON.parse(uvxConfigText) as { mcpServers?: Record<string, { command?: string; args?: string[] }> }
  const pipxConfig = JSON.parse(pipxConfigText) as { mcpServers?: Record<string, { command?: string; args?: string[] }> }

  const uvxServer = uvxConfig.mcpServers?.[VIDEODB_MCP_SERVER_KEY]
  if (uvxServer?.command !== 'uvx') {
    throw new Error(`expected uvx command, got ${JSON.stringify(uvxConfig)}`)
  }
  if (JSON.stringify(uvxServer?.args) !== JSON.stringify([VIDEODB_MCP_PACKAGE, `--api-key=${VIDEODB_MCP_CREDENTIAL_PLACEHOLDER}`])) {
    throw new Error(`expected uvx placeholder args, got ${JSON.stringify(uvxConfig)}`)
  }

  const pipxServer = pipxConfig.mcpServers?.[VIDEODB_MCP_SERVER_KEY]
  if (pipxServer?.command !== 'pipx') {
    throw new Error(`expected pipx command, got ${JSON.stringify(pipxConfig)}`)
  }
  if (JSON.stringify(pipxServer?.args) !== JSON.stringify(['run', VIDEODB_MCP_PACKAGE, `--api-key=${VIDEODB_MCP_CREDENTIAL_PLACEHOLDER}`])) {
    throw new Error(`expected pipx placeholder args, got ${JSON.stringify(pipxConfig)}`)
  }

  const combined = `${uvxConfigText}\n${pipxConfigText}\n${claudeCommand}`
  if (!combined.includes(VIDEODB_MCP_CREDENTIAL_ENV) || !combined.includes(VIDEODB_MCP_CREDENTIAL_PLACEHOLDER)) {
    throw new Error(`expected generated config to include env name and placeholder, got ${JSON.stringify(combined)}`)
  }
  assertNoSecretOrFabricatedRuntimeValues(combined)
}

export function testVideodbMcpSsotRowsCoverAsyncAndConfirmationContract() {
  if (VIDEODB_MCP_ALL_TOOLS.length !== 18 || new Set(VIDEODB_MCP_ALL_TOOLS).size !== 18) {
    throw new Error(`expected 18 unique VideoDB MCP tools, got ${JSON.stringify(VIDEODB_MCP_ALL_TOOLS)}`)
  }
  if (VIDEODB_MCP_ASYNC_TOOLS.length !== 8 || new Set(VIDEODB_MCP_ASYNC_TOOLS).size !== 8) {
    throw new Error(`expected 8 unique VideoDB MCP async tools, got ${JSON.stringify(VIDEODB_MCP_ASYNC_TOOLS)}`)
  }
  const keys = new Set(VIDEODB_MCP_DOC_ENTRIES.map(entry => entry.meta.key))
  for (const key of [
    'videodb.mcp.server_key',
    'videodb.mcp.uvx.command',
    'videodb.mcp.config.uvx',
    'videodb.mcp.config.pipx',
    'videodb.mcp.command.claude_code',
    'videodb.mcp.tool.ai_generation',
    'videodb.mcp.tool.async',
    'videodb.mcp.async.circuit_breaker',
    'videodb.mcp.tool.confirmation_required',
    'videodb.mcp.publish.packet_schema',
  ]) {
    if (!keys.has(key)) throw new Error(`missing VideoDB MCP SSOT row ${key}`)
  }

  for (const configKey of [VIDEODB_MCP_UVX_CONFIG_KEY, VIDEODB_MCP_PIPX_CONFIG_KEY, VIDEODB_MCP_CLAUDE_CODE_COMMAND_KEY]) {
    if (!keys.has(configKey)) throw new Error(`missing generated config key ${configKey}`)
  }

  const aiEntry = VIDEODB_MCP_DOC_ENTRIES.find(entry => entry.meta.key === 'videodb.mcp.tool.ai_generation')
  const asyncEntry = VIDEODB_MCP_DOC_ENTRIES.find(entry => entry.meta.key === 'videodb.mcp.async.circuit_breaker')
  const confirmationEntry = VIDEODB_MCP_DOC_ENTRIES.find(entry => entry.meta.key === 'videodb.mcp.tool.confirmation_required')
  const aiText = `${aiEntry?.value || ''}\n${aiEntry?.details.notes || ''}\n${aiEntry?.details.responsibility || ''}`
  for (const tool of VIDEODB_MCP_AI_TOOLS) {
    if (!aiText.includes(tool)) throw new Error(`AI-generation row missing ${tool}`)
  }
  if (!String(asyncEntry?.value || '').includes(String(VIDEODB_MCP_POLL_MAX_ITERATIONS))) {
    throw new Error(`async circuit-breaker row missing poll max ${VIDEODB_MCP_POLL_MAX_ITERATIONS}`)
  }
  if (!String(asyncEntry?.value || '').includes(String(VIDEODB_MCP_POLL_INTERVAL_MS))) {
    throw new Error(`async circuit-breaker row missing poll interval ${VIDEODB_MCP_POLL_INTERVAL_MS}`)
  }
  if (confirmationEntry?.tooltipDefaultValue !== true) {
    throw new Error('VideoDB MCP AI-generation tools must require human confirmation by default')
  }
  if (!getVideodbMcpApiRowAnchorId('videodb.mcp.config.uvx').startsWith('mcp-row-videodb-')) {
    throw new Error('VideoDB MCP anchors must use the MCP VideoDB namespace')
  }
}
