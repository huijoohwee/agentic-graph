import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from '../local-tool-contract.js'

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, '..', '..')
const SERVER_PATH = path.resolve(REPOSITORY_ROOT, 'mcp', 'server.js')

const createLocalMcpClient = () => {
  const client = new Client({
    name: 'agenticgraph-storage-sync-stdio-e2e',
    version: '0.0.0',
  })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: String(process.env.PATH || ''),
      HOME: String(process.env.HOME || ''),
      NODE_ENV: 'test',
      AGENTICGRAPH_ROOT: REPOSITORY_ROOT,
      AGENTICGRAPH_MCP_TIMEOUT_MS: '10000',
    },
    stderr: 'pipe',
  })
  let stderrText = ''
  transport.stderr?.on('data', chunk => {
    stderrText += String(chunk)
  })
  return { client, transport, readStderr: () => stderrText }
}

test('local stdio lists and calls browser-only storage tools as typed handoffs', async () => {
  const { client, transport, readStderr } = createLocalMcpClient()

  try {
    await client.connect(transport, { timeout: 10_000 })
    const listed = await client.listTools(undefined, { timeout: 10_000 })
    const expectedNames = [
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.gitRun,
      AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.fileSyncRun,
    ]
    const listedStorageTools = listed.tools.filter(tool => expectedNames.includes(tool.name))

    assert.deepEqual(
      listedStorageTools.map(tool => tool.name),
      expectedNames,
      `expected storage tools/list order, stderr=${JSON.stringify(readStderr())}`,
    )
    assert.equal(listedStorageTools[0].inputSchema.oneOf.length, 5)
    assert.equal(listedStorageTools[1].inputSchema.oneOf.length, 2)

    const gitResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.gitRun,
      arguments: {
        operation: 'fetch',
        remoteId: 'origin',
        canonicalPathScope: 'agenticgraph/docs',
        baseRef: 'refs/heads/main',
      },
    }, undefined, { timeout: 10_000 })
    assert.equal(gitResult.isError, true)
    assert.deepEqual(gitResult.structuredContent, {
      schema: 'agenticgraph-storage-stdio-handoff/v1',
      ok: false,
      status: 'blocked',
      errorCode: 'BROWSER_RUNTIME_REQUIRED',
      surface: 'local-stdio',
      executableSurface: 'browser-webmcp',
      requiredTool: 'agenticgraph.control_local_git_repository',
      invocation: {
        operation: 'fetch',
        remoteId: 'origin',
        canonicalPathScope: 'agenticgraph/docs',
        baseRef: 'refs/heads/main',
      },
      message: 'Local stdio cannot access the active browser IndexedDB-backed Persisted_Cache. Invoke the required browser WebMCP tool in the open AgenticGraph task.',
    })

    const fileSyncResult = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.fileSyncRun,
      arguments: {
        invocation: '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull provider=google-drive prefix=docs%2Fresearch',
      },
    }, undefined, { timeout: 10_000 })
    assert.equal(fileSyncResult.isError, true)
    assert.equal(fileSyncResult.structuredContent?.errorCode, 'BROWSER_RUNTIME_REQUIRED')
    assert.equal(fileSyncResult.structuredContent?.requiredTool, 'agenticgraph.control_local_file_sync')
    assert.deepEqual(fileSyncResult.structuredContent?.invocation, {
      direction: 'pull',
      providerId: 'google-drive',
      prefix: 'docs/research',
    })
  } finally {
    await client.close().catch(() => undefined)
  }
})
