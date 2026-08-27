import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildAgenticGraphAgentReadyToolContracts,
  AGENTICGRAPH_AGENT_READY_DEFAULT_WORKSPACE_ID,
} from '@/features/agent-ready/agenticgraphAgentReadyToolContract.mjs'
import {
  AGENTICGRAPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
  AGENTICGRAPH_STORAGE_BROWSER_TOOL_IDS,
  AGENTICGRAPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
  normalizeAgenticGraphFileSyncControlInput,
  normalizeAgenticGraphGitControlInput,
} from '@/lib/storage/agenticgraphStorageEngineMcpContract.mjs'
import {
  controlLocalFileSync,
  controlLocalGitRepository,
} from '@/lib/storage/agenticgraphStorageBrowserRuntime'

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const webName = (toolId: string): string => `agenticgraph.${toolId}`
const CONTROL_CODE_POINTS = [...Array.from({ length: 32 }, (_value, index) => index), 127]

const assertRejects = (
  operation: () => unknown,
  message: string,
): void => {
  let rejected = false
  try {
    operation()
  } catch {
    rejected = true
  }
  assert(rejected, message)
}

const readInputPattern = (
  schema: unknown,
  field: 'canonicalPathScope' | 'prefix' | 'invocation',
): RegExp => {
  const record = schema as {
    oneOf?: Array<{ properties?: Record<string, { pattern?: unknown }> }>
  }
  const pattern = record.oneOf?.find(branch => branch.properties?.[field])
    ?.properties?.[field]?.pattern
  assert(typeof pattern === 'string', `missing ${field} JSON Schema pattern`)
  return new RegExp(pattern)
}

export function testStorageEngineWebMcpContractsAreBrowserOnlyAndAnnotated() {
  const published = buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: AGENTICGRAPH_AGENT_READY_DEFAULT_WORKSPACE_ID,
    includeBrowserOnlyTools: false,
  })
  const browser = buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: AGENTICGRAPH_AGENT_READY_DEFAULT_WORKSPACE_ID,
    includeBrowserOnlyTools: true,
  })
  const storageToolIds = Object.values(
    AGENTICGRAPH_STORAGE_BROWSER_TOOL_IDS,
  ) as string[]
  assert(
    storageToolIds.every(toolId => !published.some(tool => tool.name === toolId)),
    'storage mutation tools leaked into the published/default catalog',
  )
  for (const toolId of storageToolIds) {
    const tool = browser.find(candidate => candidate.name === toolId)
    assert(tool?.webName === webName(toolId), `missing browser WebMCP tool ${toolId}`)
    const isInspect = toolId.startsWith('inspect_')
    const annotations = tool?.annotations as Record<string, unknown> | undefined
    assert(annotations?.readOnlyHint === isInspect, `${toolId} readOnly annotation drifted`)
    assert(annotations?.destructiveHint === !isInspect, `${toolId} destructive annotation drifted`)
    assert(annotations?.openWorldHint === !isInspect, `${toolId} openWorld annotation drifted`)
  }
}

export function testStorageEngineInvocationAndStructuredInputsStayEquivalent() {
  const gitInvocation = normalizeAgenticGraphGitControlInput({
    invocation: '/git.run @local-git-repository @git-remote #git-remote operation=commit remote=origin path=agenticgraph%2Fdocs base-ref=refs%2Fheads%2Fmain message=storage%20sync',
  })
  const gitStructured = normalizeAgenticGraphGitControlInput({
    operation: 'commit',
    remoteId: 'origin',
    canonicalPathScope: 'agenticgraph/docs',
    baseRef: 'refs/heads/main',
    message: 'storage sync',
  })
  assert(JSON.stringify(gitInvocation) === JSON.stringify(gitStructured), 'Git invocation parity drifted')

  const fileInvocation = normalizeAgenticGraphFileSyncControlInput({
    invocation: '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=push provider=one-drive prefix=docs%2Fresearch',
  })
  const fileStructured = normalizeAgenticGraphFileSyncControlInput({
    direction: 'push',
    providerId: 'one-drive',
    prefix: 'docs/research',
  })
  assert(JSON.stringify(fileInvocation) === JSON.stringify(fileStructured), 'file-sync invocation parity drifted')
}

export async function testStorageEngineInputsRejectCredentialAndRuntimeOverrides() {
  for (const input of [
    {
      operation: 'push',
      remoteId: 'origin',
      canonicalPathScope: 'agenticgraph/docs',
      baseRef: 'refs/heads/main',
      token: 'forbidden',
    },
    {
      direction: 'pull',
      providerId: 'google-drive',
      prefix: 'docs',
      timeoutMs: 1,
    },
    {
      invocation: '/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=pull provider=google-drive prefix=docs',
      providerId: 'mixed',
    },
  ]) {
    let rejected = false
    try {
      if ('operation' in input || ('invocation' in input && 'providerId' in input)) {
        normalizeAgenticGraphGitControlInput(input)
      } else {
        normalizeAgenticGraphFileSyncControlInput(input)
      }
    } catch {
      rejected = true
    }
    assert(rejected, `storage input accepted forbidden fields: ${JSON.stringify(input)}`)
  }

  const gitPathPattern = readInputPattern(
    AGENTICGRAPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
    'canonicalPathScope',
  )
  const filePrefixPattern = readInputPattern(
    AGENTICGRAPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
    'prefix',
  )
  const gitInvocationPattern = readInputPattern(
    AGENTICGRAPH_STORAGE_GIT_CONTROL_INPUT_SCHEMA,
    'invocation',
  )
  const fileInvocationPattern = readInputPattern(
    AGENTICGRAPH_FILE_SYNC_CONTROL_INPUT_SCHEMA,
    'invocation',
  )
  for (const codePoint of CONTROL_CODE_POINTS) {
    const character = String.fromCodePoint(codePoint)
    const encoded = encodeURIComponent(character)
    const label = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
    const gitPath = `agenticgraph/docs${character}blocked`
    const filePrefix = `docs${character}blocked`
    assert(!gitPathPattern.test(gitPath), `Git JSON Schema accepted ${label}`)
    assert(!filePrefixPattern.test(filePrefix), `file-sync JSON Schema accepted ${label}`)
    assert(
      !gitInvocationPattern.test(`/git.run ${character}blocked`),
      `Git invocation JSON Schema accepted ${label}`,
    )
    assert(
      !fileInvocationPattern.test(`/file.sync ${character}blocked`),
      `file-sync invocation JSON Schema accepted ${label}`,
    )
    assertRejects(
      () => normalizeAgenticGraphGitControlInput({
        operation: 'fetch',
        remoteId: 'origin',
        canonicalPathScope: gitPath,
        baseRef: 'refs/heads/main',
      }),
      `structured Git input accepted ${label}`,
    )
    assertRejects(
      () => normalizeAgenticGraphGitControlInput({
        invocation: `/git.run @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=agenticgraph%2Fdocs${encoded}blocked base-ref=refs%2Fheads%2Fmain`,
      }),
      `Git invocation accepted ${label}`,
    )
    assertRejects(
      () => normalizeAgenticGraphFileSyncControlInput({
        direction: 'push',
        providerId: 'google-drive',
        prefix: filePrefix,
      }),
      `structured file-sync input accepted ${label}`,
    )
    assertRejects(
      () => normalizeAgenticGraphFileSyncControlInput({
        invocation: `/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=push provider=google-drive prefix=docs${encoded}blocked`,
      }),
      `file-sync invocation accepted ${label}`,
    )
    assertRejects(
      () => normalizeAgenticGraphGitControlInput({
        operation: 'fetch',
        remoteId: 'origin',
        canonicalPathScope: `agenticgraph/docs${character}`,
        baseRef: 'refs/heads/main',
      }),
      `structured Git input trimmed terminal ${label}`,
    )
    assertRejects(
      () => normalizeAgenticGraphFileSyncControlInput({
        direction: 'push',
        providerId: 'google-drive',
        prefix: `docs${character}`,
      }),
      `structured file-sync input trimmed terminal ${label}`,
    )
  }

  const envKeys = [
    'VITE_AGENTICGRAPH_STORAGE_BASE_URL',
    'VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID',
    'VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN',
  ] as const
  const priorEnv = new Map(envKeys.map(key => [key, process.env[key]]))
  const priorFetch = globalThis.fetch
  let networkCalls = 0
  process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = 'http://127.0.0.1:8787'
  process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = 'kgws:mcp-control-character-test'
  process.env.VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN = 'mcp-control-character-session'
  globalThis.fetch = (async () => {
    networkCalls += 1
    throw new Error('control-character input must not reach the relay')
  }) as typeof fetch
  const assertInvalidControl = async (
    result: Promise<Record<string, unknown>>,
    label: string,
  ): Promise<void> => {
    const value = await result
    assert(value.status === 'invalid-input', `${label} reached the browser runtime`)
  }
  try {
    for (const codePoint of CONTROL_CODE_POINTS) {
      const character = String.fromCodePoint(codePoint)
      const encoded = encodeURIComponent(character)
      const label = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`
      await assertInvalidControl(controlLocalGitRepository({
        operation: 'fetch',
        remoteId: 'origin',
        canonicalPathScope: `agenticgraph/docs${character}blocked`,
        baseRef: 'refs/heads/main',
      }), `structured Git ${label}`)
      await assertInvalidControl(controlLocalGitRepository({
        invocation: `/git.run @local-git-repository @git-remote #git-remote operation=fetch remote=origin path=agenticgraph%2Fdocs${encoded}blocked base-ref=refs%2Fheads%2Fmain`,
      }), `Git invocation ${label}`)
      await assertInvalidControl(controlLocalFileSync({
        direction: 'push',
        providerId: 'google-drive',
        prefix: `docs${character}blocked`,
      }), `structured file sync ${label}`)
      await assertInvalidControl(controlLocalFileSync({
        invocation: `/file.sync @persisted-cache @file-sync-provider #multi-provider-file-sync direction=push provider=google-drive prefix=docs${encoded}blocked`,
      }), `file-sync invocation ${label}`)
    }
    assert(networkCalls === 0, 'control-character input reached the relay network')
  } finally {
    globalThis.fetch = priorFetch
    for (const key of envKeys) {
      const value = priorEnv.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

export function testStorageEngineNoExternalRuntimeDependencies() {
  const repositoryRoot = path.resolve(process.cwd(), '..')
  const packagePaths = [
    'package.json',
    'canvas/package.json',
    'grph-shared/package.json',
    'gympgrph/package.json',
  ]
  const banned = new Set([
    'isomorphic-git',
    'rclone',
    'simple-git',
    'nodegit',
    'dugite',
    'git-js',
  ])
  for (const packagePath of packagePaths) {
    const manifest = JSON.parse(readFileSync(path.join(repositoryRoot, packagePath), 'utf8')) as Record<string, unknown>
    const dependencyNames = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
      .flatMap(field => Object.keys(manifest[field] as Record<string, unknown> || {}))
    assert(
      dependencyNames.every(name => !banned.has(name) && !name.startsWith('@isomorphic-git/')),
      `${packagePath} adds a forbidden external Git or file-sync runtime`,
    )
  }
}
