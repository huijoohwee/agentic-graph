import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildAgenticGraphLocalMcpToolNameList } from '../../canvas/src/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs'
import {
  AGENTIC_OS_STORAGE_LOCAL_TOOL_NAMES,
  parseAgenticGraphFileSyncInvocation,
  parseAgenticGraphGitInvocation,
} from '../../canvas/src/lib/storage/agentic-graph-storage-engine-mcp-contract.mjs'
import {
  buildAgenticGraphLocalMcpToolDefinitions,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES,
} from '../local-tool-contract.js'
import { runStorageSyncLocalTool } from '../storage-sync-local-runtime.js'

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

test('local tool names and descriptors publish git then file sync in stable order', () => {
  const expected = [
    AGENTIC_OS_STORAGE_LOCAL_TOOL_NAMES.gitRun,
    AGENTIC_OS_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun,
  ]
  assert.deepEqual([
    AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.gitRun,
    AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.fileSyncRun,
  ], expected)
  const localToolNames = buildAgenticGraphLocalMcpToolNameList()
  const gitNameIndex = localToolNames.indexOf(expected[0])
  assert.equal(localToolNames.indexOf(expected[1]), gitNameIndex + 1)
  assert.deepEqual(localToolNames.slice(gitNameIndex, gitNameIndex + expected.length), expected)

  const definitions = buildAgenticGraphLocalMcpToolDefinitions()
  const gitDefinitionIndex = definitions.findIndex(tool => tool.name === expected[0])
  const storageDefinitions = definitions.slice(
    gitDefinitionIndex,
    gitDefinitionIndex + expected.length,
  )
  assert.deepEqual(storageDefinitions.map(tool => tool.name), expected)
  for (const definition of storageDefinitions) {
    assert.equal(definition.inputSchema?.type, 'object')
    assert.deepEqual(definition.annotations, {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: false,
    })
    assert.equal(definition.outputSchema?.properties?.schema?.const, 'agentic-graph-storage-stdio-handoff/v1')
    assert.equal(definition.outputSchema?.properties?.errorCode?.type, 'string')
  }
})

test('exact git and file-sync grammars normalize every sigil owner', () => {
  assert.deepEqual(parseAgenticGraphGitInvocation(
    '/git.run @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=agentic-graph%2Fdocs base-ref=refs%2Fheads%2Fmain',
  ), {
    operation: 'fetch',
    remoteId: 'origin',
    canonicalPathScope: 'agentic-graph/docs',
    baseRef: 'refs/heads/main',
  })
  assert.deepEqual(parseAgenticGraphFileSyncInvocation(
    '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull provider=google-drive prefix=docs%2Fresearch',
  ), {
    direction: 'pull',
    providerId: 'google-drive',
    prefix: 'docs/research',
  })
})

test('grammar rejects aliases, duplicate fields, traversal, and mixed input', () => {
  assert.throws(() => parseAgenticGraphGitInvocation(
    '/git @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=docs base-ref=refs%2Fheads%2Fmain',
  ), /must be/)
  assert.throws(() => parseAgenticGraphFileSyncInvocation(
    '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull direction=push provider=drive prefix=docs',
  ), /Duplicate/)
  assert.throws(() => parseAgenticGraphFileSyncInvocation(
    '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull provider=drive prefix=docs%2F..%2Fsecret',
  ), /invalid/)
  const payload = runStorageSyncLocalTool(AGENTIC_OS_STORAGE_LOCAL_TOOL_NAMES.gitRun, {
    invocation: '/git.run @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=docs base-ref=refs%2Fheads%2Fmain',
    operation: 'push',
  })
  assert.equal(payload.status, 'rejected')
  assert.equal(payload.errorCode, 'INVALID_INPUT')
})

test('local stdio returns a typed browser handoff with no credential field', () => {
  const payload = runStorageSyncLocalTool(AGENTIC_OS_STORAGE_LOCAL_TOOL_NAMES.gitRun, {
    operation: 'push',
    remoteId: 'origin',
    canonicalPathScope: 'agentic-graph/docs',
    baseRef: 'refs/heads/main',
  })
  assert.equal(payload.schema, 'agentic-graph-storage-stdio-handoff/v1')
  assert.equal(payload.status, 'blocked')
  assert.equal(payload.errorCode, 'BROWSER_RUNTIME_REQUIRED')
  assert.equal(payload.requiredTool, 'agentic-graph.control_local_git_repository')
  assert.equal(JSON.stringify(payload).includes('token'), false)
  assert.equal(JSON.stringify(payload).includes('secret'), false)
  assert.equal(JSON.stringify(payload).includes('key='), false)
})

test('local handoff runtime has no filesystem, browser, or network capability', () => {
  const runtimePath = path.resolve(TEST_DIRECTORY, '..', 'storage-sync-local-runtime.js')
  const runtimeSource = fs.readFileSync(runtimePath, 'utf8')
  const importSpecifiers = [...runtimeSource.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)]
    .map(match => match[1])
  assert.deepEqual(importSpecifiers, [
    '../canvas/src/lib/storage/agentic-graph-storage-engine-mcp-contract.mjs',
  ])
  assert.doesNotMatch(
    runtimeSource,
    /\b(?:fetch|XMLHttpRequest)\s*\(|\bindexedDB\s*[.(]|['"]node:(?:fs|http|https|net|tls|child_process)['"]/,
  )

  const originalFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = () => {
    networkCalls += 1
    throw new Error('storage stdio must not make network calls')
  }
  try {
    const payload = runStorageSyncLocalTool(AGENTIC_OS_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun, {
      direction: 'pull',
      providerId: 'google-drive',
      prefix: 'docs/research',
    })
    assert.equal(payload.errorCode, 'BROWSER_RUNTIME_REQUIRED')
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(networkCalls, 0)
})
