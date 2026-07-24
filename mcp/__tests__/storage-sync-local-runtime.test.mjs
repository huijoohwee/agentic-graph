import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildKnowgrphLocalMcpToolNameList } from '../../canvas/src/features/agent-ready/knowgrphLocalMcpToolNames.mjs'
import {
  KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES,
  parseKnowgrphFileSyncInvocation,
  parseKnowgrphGitInvocation,
} from '../../canvas/src/lib/storage/knowgrphStorageEngineMcpContract.mjs'
import {
  buildKnowgrphLocalMcpToolDefinitions,
  KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
} from '../local-tool-contract.js'
import { runStorageSyncLocalTool } from '../storage-sync-local-runtime.js'

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

test('local tool names and descriptors publish git then file sync in stable order', () => {
  const expected = [
    KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.gitRun,
    KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun,
  ]
  assert.deepEqual([
    KNOWGRPH_LOCAL_MCP_TOOL_NAMES.gitRun,
    KNOWGRPH_LOCAL_MCP_TOOL_NAMES.fileSyncRun,
  ], expected)
  const localToolNames = buildKnowgrphLocalMcpToolNameList()
  const gitNameIndex = localToolNames.indexOf(expected[0])
  assert.equal(localToolNames.indexOf(expected[1]), gitNameIndex + 1)
  assert.deepEqual(localToolNames.slice(gitNameIndex, gitNameIndex + expected.length), expected)

  const definitions = buildKnowgrphLocalMcpToolDefinitions()
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
    assert.equal(definition.outputSchema?.properties?.schema?.const, 'knowgrph-storage-stdio-handoff/v1')
    assert.equal(definition.outputSchema?.properties?.errorCode?.type, 'string')
  }
})

test('exact git and file-sync grammars normalize every sigil owner', () => {
  assert.deepEqual(parseKnowgrphGitInvocation(
    '/git.run @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=knowgrph%2Fdocs base-ref=refs%2Fheads%2Fmain',
  ), {
    operation: 'fetch',
    remoteId: 'origin',
    canonicalPathScope: 'knowgrph/docs',
    baseRef: 'refs/heads/main',
  })
  assert.deepEqual(parseKnowgrphFileSyncInvocation(
    '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull provider=google-drive prefix=docs%2Fresearch',
  ), {
    direction: 'pull',
    providerId: 'google-drive',
    prefix: 'docs/research',
  })
})

test('grammar rejects aliases, duplicate fields, traversal, and mixed input', () => {
  assert.throws(() => parseKnowgrphGitInvocation(
    '/git @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=docs base-ref=refs%2Fheads%2Fmain',
  ), /must be/)
  assert.throws(() => parseKnowgrphFileSyncInvocation(
    '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull direction=push provider=drive prefix=docs',
  ), /Duplicate/)
  assert.throws(() => parseKnowgrphFileSyncInvocation(
    '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull provider=drive prefix=docs%2F..%2Fsecret',
  ), /invalid/)
  const payload = runStorageSyncLocalTool(KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.gitRun, {
    invocation: '/git.run @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=docs base-ref=refs%2Fheads%2Fmain',
    operation: 'push',
  })
  assert.equal(payload.status, 'rejected')
  assert.equal(payload.errorCode, 'INVALID_INPUT')
})

test('local stdio returns a typed browser handoff with no credential field', () => {
  const payload = runStorageSyncLocalTool(KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.gitRun, {
    operation: 'push',
    remoteId: 'origin',
    canonicalPathScope: 'knowgrph/docs',
    baseRef: 'refs/heads/main',
  })
  assert.equal(payload.schema, 'knowgrph-storage-stdio-handoff/v1')
  assert.equal(payload.status, 'blocked')
  assert.equal(payload.errorCode, 'BROWSER_RUNTIME_REQUIRED')
  assert.equal(payload.requiredTool, 'knowgrph.control_local_git_repository')
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
    '../canvas/src/lib/storage/knowgrphStorageEngineMcpContract.mjs',
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
    const payload = runStorageSyncLocalTool(KNOWGRPH_STORAGE_LOCAL_TOOL_NAMES.fileSyncRun, {
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
