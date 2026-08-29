import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../../../mcp/agentic-canvas-os-docs-contract.mjs'
import { installSourceCatalogFetchMock } from './knowledgeGraphSkillsCommandsLaunch.test'
import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agenticgraphAgentReadyToolContract.mjs'
import { IMPORT_URL_AGENT_READY_MCP_TOOL_NAME } from '@/features/agent-ready/importUrlAgentReadyContract.mjs'
import { executeAgenticOsInvocation } from '@/features/agentic-os/agenticOsInvocationExecutor'
import { FloatingPanelSkillsCommandsView } from '@/features/toolbar/FloatingPanelSkillsCommandsView'
import { getAgenticGraphWebMcpToolRegistry } from '@/features/agent-ready/webMcpRuntime'
import { createWebMcpToolRegistry } from '@/features/agent-ready/webMcpToolRegistry'
import {
  executeSkillsCommandsMcpTarget,
  targetSkillsCommandsCommandInvocation,
} from '@/features/agentic-os/skillsCommandsMcpTarget'
import { resetAgenticOsRemoteGrammarCatalogForTests } from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import type { AgenticOsCommandInvocationResolution } from '@/features/agentic-os/agenticOsMcpInvocationResolver'
import type { WebMcpTool, WebMcpToolInput } from '@/features/agent-ready/webMcpRuntimeTypes'
import { AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID } from '@/lib/storage/agenticgraphStorageSyncContract'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForTasks } from '@/tests/lib/reactRootHarness'

const SOURCE_REVISION = 'a'.repeat(40)
const CATALOG_DIGEST = 'b'.repeat(64)
const ROUTING_DIGEST = 'c'.repeat(64)
const COMMAND = '/ingest-url'
const TOOL = IMPORT_URL_AGENT_READY_MCP_TOOL_NAME
const IMPORT_URL_INPUT_SCHEMA = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  includeBrowserOnlyTools: true,
}).find(contract => contract.webName === IMPORT_URL_AGENT_READY_MCP_TOOL_NAME)?.inputSchema

if (!IMPORT_URL_INPUT_SCHEMA) throw new Error('Missing canonical Import URL input schema.')

const buildResolution = ({
  tool = TOOL,
  declaredTools = [TOOL],
  semantics = ['#runtime'],
  bindings = ['@workspace'],
  sourceRevision = SOURCE_REVISION,
}: Readonly<{
  tool?: string
  declaredTools?: readonly string[]
  semantics?: readonly string[]
  bindings?: readonly string[]
  sourceRevision?: string
}> = {}): AgenticOsCommandInvocationResolution => Object.freeze({
  command: COMMAND,
  sourceRevision,
  catalogDigest: CATALOG_DIGEST,
  invocation: Object.freeze({
    schema: 'agenticgraph-knowledge-graph-invocation/v1',
    tool: COMMAND,
    action: COMMAND,
    semantics: Object.freeze([...semantics]),
    bindings: Object.freeze([...bindings]),
    sourceRevision,
    catalogDigest: CATALOG_DIGEST,
    routingSchema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
    routingDigest: ROUTING_DIGEST,
  }),
  entries: Object.freeze([
    {
      id: 'command:inspect-runtime',
      kind: 'command' as const,
      token: COMMAND,
      label: 'Inspect runtime',
      summary: 'Inspect the current runtime.',
      group: 'Agentic OS command dictionary',
      sourcePath: `https://example.invalid/${SOURCE_REVISION}/DICTIONARY-COMMAND.md`,
      keywords: [],
      mcpTool: tool,
      mcpTools: [...declaredTools],
    },
    ...semantics.map(token => ({
      id: `semantic:${token.slice(1)}`,
      kind: 'semantic' as const,
      token,
      label: token,
      summary: 'Runtime semantic.',
      group: 'Agentic OS semantic dictionary',
      sourcePath: `https://example.invalid/${SOURCE_REVISION}/DICTIONARY-SEMANTIC.md`,
      keywords: [],
    })),
    ...bindings.map(token => ({
      id: `binding:${token.slice(1)}`,
      kind: 'binding' as const,
      token,
      label: token,
      summary: 'Workspace binding.',
      group: 'Agentic OS binding dictionary',
      sourcePath: `https://example.invalid/${SOURCE_REVISION}/DICTIONARY-BINDING.md`,
      keywords: [],
    })),
  ]),
})

const buildRegistry = ({
  name = TOOL,
  inputSchema = { type: 'object' },
  annotations = { readOnlyHint: true, destructiveHint: false },
  execute,
}: Readonly<{
  name?: string
  inputSchema?: Record<string, unknown>
  annotations?: Record<string, unknown>
  execute: (input?: WebMcpToolInput) => Promise<unknown>
}>) => createWebMcpToolRegistry([{
  name,
  description: 'Test runtime inspection.',
  inputSchema,
  annotations,
  execute,
}])

const withSourceResolution = async <T>(
  run: (resolution: AgenticOsCommandInvocationResolution) => Promise<T>,
): Promise<T> => {
  const fetchMock = installSourceCatalogFetchMock()
  try {
    return await run(await targetSkillsCommandsCommandInvocation(COMMAND))
  } finally {
    fetchMock.restore()
  }
}

export async function testAgenticGraphWebMcpRegistryIsFrozenAndContractOrdered() {
  const registry = getAgenticGraphWebMcpToolRegistry()
  const expectedOrder = buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
    includeBrowserOnlyTools: true,
  }).map(contract => contract.webName)
  assert.ok(Object.isFrozen(registry))
  assert.ok(Object.isFrozen(registry.tools))
  assert.ok(registry.tools.every(tool => Object.isFrozen(tool)))
  assert.deepEqual(registry.tools.map(tool => tool.name), expectedOrder)
  const firstTool = registry.tools[0]
  assert.ok(firstTool)
  assert.equal(registry.get(firstTool.name), firstTool)
  assert.equal(registry.get(firstTool.name.toUpperCase()), null)

  const sourceSchema = {
    type: 'object',
    properties: { value: { type: 'string' } },
  }
  const probeRegistry = buildRegistry({ inputSchema: sourceSchema, execute: async () => ({ ok: true }) })
  const frozenSchema = probeRegistry.tools[0]?.inputSchema as {
    properties?: { value?: { type?: string } }
  }
  assert.notEqual(frozenSchema, sourceSchema)
  assert.ok(Object.isFrozen(frozenSchema))
  assert.ok(Object.isFrozen(frozenSchema.properties))
  assert.ok(Object.isFrozen(frozenSchema.properties?.value))
  assert.throws(() => {
    if (frozenSchema.properties?.value) frozenSchema.properties.value.type = 'number'
  }, TypeError)
  assert.equal(sourceSchema.properties.value.type, 'string')

  let originalCalls = 0
  let replacementCalls = 0
  const mutableSource: WebMcpTool = {
    name: 'agenticgraph.registry.immutable',
    description: 'Immutable execution probe.',
    inputSchema: { type: 'object' },
    execute: async () => {
      originalCalls += 1
      return 'original'
    },
  }
  const immutableRegistry = createWebMcpToolRegistry([mutableSource])
  mutableSource.name = 'agenticgraph.registry.replaced'
  mutableSource.execute = async () => {
    replacementCalls += 1
    return 'replacement'
  }
  assert.equal(await immutableRegistry.execute('agenticgraph.registry.immutable'), 'original')
  assert.equal(immutableRegistry.get('agenticgraph.registry.replaced'), null)
  assert.equal(originalCalls, 1)
  assert.equal(replacementCalls, 0)
}

export async function testSkillsCommandsCommandTargetExecutesTheCanonicalRegistryTool() {
  const fetchMock = installSourceCatalogFetchMock()
  const inputs: unknown[] = []
  const expectedResult = Object.freeze({ ok: true, imported: 1 })
  const registry = createWebMcpToolRegistry([{
    name: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
    description: 'Import one URL into the active workspace.',
    inputSchema: IMPORT_URL_INPUT_SCHEMA,
    execute: async input => {
      inputs.push(input)
      return expectedResult
    },
  }])
  try {
    const expectedResolution = await targetSkillsCommandsCommandInvocation('/ingest-url')
    const outcome = await executeSkillsCommandsMcpTarget({
      registry,
      input: { url: 'https://example.com/source' },
      online: true,
      expectedResolution,
    })
    assert.equal(outcome.status, 'completed')
    assert.equal(outcome.toolName, IMPORT_URL_AGENT_READY_MCP_TOOL_NAME)
    assert.equal(outcome.result, expectedResult)
    assert.deepEqual(inputs, [{ url: 'https://example.com/source' }])
  } finally {
    fetchMock.restore()
  }
}

export async function testSkillsCommandsCommandTargetRequiresCanonicalOneOfInput() {
  const fetchMock = installSourceCatalogFetchMock()
  let calls = 0
  const registry = createWebMcpToolRegistry([{
    name: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
    description: 'Import one URL into the active workspace.',
    inputSchema: IMPORT_URL_INPUT_SCHEMA,
    execute: async () => {
      calls += 1
      return { ok: true }
    },
  }])
  try {
    const expectedResolution = await targetSkillsCommandsCommandInvocation('/ingest-url')
    const outcome = await executeSkillsCommandsMcpTarget({ registry, input: {}, online: true, expectedResolution })
    assert.equal(outcome.status, 'requested-user-input')
    assert.deepEqual(outcome.missingFields, ['invocation', 'url'])
    assert.match(outcome.error, /must match exactly one schema in oneOf/)
    assert.equal(calls, 0)
  } finally {
    fetchMock.restore()
  }
}

export async function testSkillsCommandsCommandTargetRejectsStaleCurrentCatalog() {
  const fetchMock = installSourceCatalogFetchMock()
  let calls = 0
  const registry = createWebMcpToolRegistry([{
    name: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
    description: 'Import one URL into the active workspace.',
    inputSchema: IMPORT_URL_INPUT_SCHEMA,
    execute: async () => {
      calls += 1
      return { ok: true }
    },
  }])
  try {
    const expectedResolution = await targetSkillsCommandsCommandInvocation('/ingest-url')
    resetAgenticOsRemoteGrammarCatalogForTests()
    const outcome = await executeSkillsCommandsMcpTarget({
      registry,
      input: { url: 'https://example.com/source' },
      online: true,
      expectedResolution,
    })
    assert.equal(outcome.status, 'blocked')
    assert.match(outcome.error, /not fresh and routing-verified/)
    assert.equal(calls, 0)
  } finally {
    fetchMock.restore()
  }
}

export async function testSkillsCommandsPanelFencesStaleExecutionAndRedactsReceipts() {
  const fetchMock = installSourceCatalogFetchMock()
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const calls: Array<Record<string, unknown> | undefined> = []
  const confirmationChallenges: Array<string | undefined> = []
  const destructiveFingerprint = `sha256:${'d'.repeat(64)}`
  const destructiveChallenge = `confirm:${'e'.repeat(64)}`
  type Outcome = Awaited<ReturnType<typeof executeSkillsCommandsMcpTarget>>
  let resolveFirst: ((outcome: Outcome) => void) | null = null
  const executeTarget: typeof executeSkillsCommandsMcpTarget = (args = {}) => {
    calls.push(args?.input)
    confirmationChallenges.push(args?.confirmationChallenge)
    if (calls.length === 1) {
      return new Promise<Outcome>(resolve => { resolveFirst = resolve })
    }
    if (calls.length === 2) {
      return Promise.resolve(Object.freeze({
        status: 'confirmation-required',
        toolName: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
        missingFields: Object.freeze([]),
        confirmation: Object.freeze({
          challenge: destructiveChallenge,
          fingerprint: destructiveFingerprint,
          expiresAt: '2099-01-01T00:00:00.000Z',
          title: 'Import URL',
          description: 'Imports remote content into the active workspace.',
        }),
        result: null,
        error: 'Confirm the destructive command Import URL before execution.',
      }))
    }
    return Promise.resolve(Object.freeze({
      status: 'completed',
      toolName: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
      missingFields: Object.freeze([]),
      confirmation: null,
      result: Object.freeze({ authorization: 'new-secret', receiptId: 'visible-receipt' }),
      error: '',
    }))
  }
  try {
    await targetSkillsCommandsCommandInvocation('/ingest-url')
    await mountReactRoot(root, React.createElement(FloatingPanelSkillsCommandsView, { executeTarget }), {
      window: dom.window as unknown as Window,
      tasks: 1,
    })
    const textarea = container.querySelector('[data-agenticgraph-invocation-input="json"]') as HTMLTextAreaElement | null
    const executeButton = container.querySelector('[data-agenticgraph-invocation-execute="selected"]') as HTMLButtonElement | null
    const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')?.set
    assert.ok(textarea)
    assert.ok(executeButton)
    assert.ok(valueSetter)
    await act(async () => {
      valueSetter.call(textarea, '{"url":"https://example.com/source"}')
      Simulate.change(textarea)
      await waitForTasks(1)
    })
    await act(async () => {
      executeButton.click()
      executeButton.click()
      await waitForTasks(1)
    })
    assert.deepEqual(calls, [{ url: 'https://example.com/source' }])

    await act(async () => {
      const retarget = targetSkillsCommandsCommandInvocation('/crawler-agent')
      assert.ok(resolveFirst)
      resolveFirst(Object.freeze({
        status: 'partial',
        toolName: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
        missingFields: Object.freeze([]),
        confirmation: null,
        result: Object.freeze({ authorization: 'old-secret', receiptId: 'stale-receipt' }),
        error: '',
      }))
      await retarget
      await waitForTasks(1)
    })
    assert.match(container.textContent || '', /Source-backed invocation selected: \/crawler-agent/)
    assert.match(container.textContent || '', /stale-receipt/)
    assert.doesNotMatch(container.textContent || '', /old-secret/)
    assert.equal(textarea.value, '{}')

    const currentExecuteButton = container.querySelector('[data-agenticgraph-invocation-execute="selected"]') as HTMLButtonElement | null
    assert.ok(currentExecuteButton)
    await act(async () => {
      currentExecuteButton.click()
      await waitForTasks(1)
    })
    const confirmButton = container.querySelector('[data-agenticgraph-invocation-confirm="destructive"]') as HTMLButtonElement | null
    assert.ok(confirmButton)
    assert.match(container.textContent || '', /Import URL.*Imports remote content/s)
    await act(async () => {
      confirmButton.click()
      await waitForTasks(1)
    })
    assert.deepEqual(confirmationChallenges, [undefined, undefined, destructiveChallenge])
    const receipt = container.querySelector('[data-agenticgraph-invocation-receipt="sanitized"]')?.textContent || ''
    assert.match(receipt, /visible-receipt/)
    assert.match(receipt, /\[redacted\]/)
    assert.doesNotMatch(receipt, /new-secret/)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    container.remove()
    restore()
    fetchMock.restore()
  }
}

export async function testAgenticOsInvocationExecutesTheExactRegistryToolOnce() {
  await withSourceResolution(async resolution => {
    const expectedResult = Object.freeze({ ok: true, revision: 3 })
    const inputs: WebMcpToolInput[] = []
    const registry = buildRegistry({
      execute: async input => {
        inputs.push(input)
        return expectedResult
      },
    })
    const outcome = await executeAgenticOsInvocation({
      resolution,
      registry,
      input: { workspaceId: 'local' },
    })
    assert.equal(outcome.status, 'completed')
    assert.equal(outcome.toolName, TOOL)
    assert.equal(outcome.result, expectedResult)
    assert.deepEqual(inputs, [{ workspaceId: 'local' }])
  })
}

export async function testAgenticOsInvocationRequestsRequiredInputBeforeDispatch() {
  await withSourceResolution(async resolution => {
    let calls = 0
    const registry = buildRegistry({
      inputSchema: { type: 'object', required: ['workspaceId', 'path'] },
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const outcome = await executeAgenticOsInvocation({
      resolution,
      registry,
      input: { workspaceId: 'local' },
    })
    assert.equal(outcome.status, 'requested-user-input')
    assert.deepEqual(outcome.missingFields, ['path'])
    assert.equal(calls, 0)
  })
}

export async function testAgenticOsInvocationRejectsStaleProofBeforeDispatch() {
  await withSourceResolution(async () => {
    let calls = 0
    const registry = buildRegistry({
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const outcome = await executeAgenticOsInvocation({
      resolution: buildResolution({ sourceRevision: 'd'.repeat(40) }),
      registry,
    })
    assert.equal(outcome.status, 'blocked')
    assert.match(outcome.error, /not an unchanged resolver-attested local capability/)
    assert.equal(calls, 0)
  })
}

export async function testAgenticOsInvocationRejectsAmbiguousToolOwnership() {
  await withSourceResolution(async () => {
    let calls = 0
    const registry = buildRegistry({
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const outcome = await executeAgenticOsInvocation({
      resolution: buildResolution({ declaredTools: [TOOL, 'agenticgraph.runtime.other'] }),
      registry,
    })
    assert.equal(outcome.status, 'blocked')
    assert.match(outcome.error, /not an unchanged resolver-attested local capability/)
    assert.equal(calls, 0)
  })
}

export async function testAgenticOsInvocationPreservesDomainOwnedQueuedResult() {
  await withSourceResolution(async resolution => {
    const queuedResult = Object.freeze({ status: 'queued', outboxId: 'domain-owned-17' })
    const registry = buildRegistry({ execute: async () => queuedResult })
    globalThis.fetch = (async () => { throw new Error('offline fetch forbidden') }) as typeof fetch
    const outcome = await executeAgenticOsInvocation({ resolution, registry, online: false })
    assert.equal(outcome.status, 'queued')
    assert.equal(outcome.result, queuedResult)
  })
}

export async function testAgenticOsInvocationDoesNotRetryOrInventAnOfflineQueue() {
  await withSourceResolution(async resolution => {
    let calls = 0
    const registry = buildRegistry({
      execute: async () => {
        calls += 1
        throw new Error('network unavailable')
      },
    })
    globalThis.fetch = (async () => { throw new Error('offline fetch forbidden') }) as typeof fetch
    const outcome = await executeAgenticOsInvocation({ resolution, registry, online: false })
    assert.equal(outcome.status, 'offline-unavailable')
    assert.equal(outcome.result, null)
    assert.equal(calls, 1)
  })
}

export async function testAgenticOsInvocationUsesCaseSensitiveRegistryIdentity() {
  await withSourceResolution(async () => {
    let calls = 0
    const registry = buildRegistry({
      name: TOOL,
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const outcome = await executeAgenticOsInvocation({
      resolution: buildResolution({
        tool: 'agenticgraph.Import.url',
        declaredTools: ['agenticgraph.Import.url'],
      }),
      registry,
    })
    assert.equal(outcome.status, 'blocked')
    assert.match(outcome.error, /not an unchanged resolver-attested local capability/)
    assert.equal(calls, 0)
  })
}

export async function testAgenticOsInvocationRequiresFingerprintBoundDestructiveConfirmation() {
  await withSourceResolution(async resolution => {
    let calls = 0
    const registry = buildRegistry({
      annotations: { readOnlyHint: false, destructiveHint: true },
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const input = { url: 'https://example.com/source' }
    const guessed = await executeAgenticOsInvocation({
      resolution,
      registry,
      input,
      confirmationChallenge: `confirm:${'0'.repeat(64)}`,
    })
    assert.equal(guessed.status, 'blocked')
    assert.equal(calls, 0)

    const first = await executeAgenticOsInvocation({ resolution, registry, input })
    assert.equal(first.status, 'confirmation-required')
    assert.match(first.confirmation?.fingerprint || '', /^sha256:[0-9a-f]{64}$/)
    assert.match(first.confirmation?.challenge || '', /^confirm:[0-9a-f]{64}$/)
    assert.equal(calls, 0)

    const confirmed = await executeAgenticOsInvocation({
      resolution,
      registry,
      input,
      confirmationChallenge: first.confirmation?.challenge,
    })
    assert.equal(confirmed.status, 'completed')
    assert.equal(calls, 1)

    const replayed = await executeAgenticOsInvocation({
      resolution,
      registry,
      input,
      confirmationChallenge: first.confirmation?.challenge,
    })
    assert.equal(replayed.status, 'blocked')
    assert.equal(calls, 1)
  })
}

export async function testAgenticOsInvocationFencesSelectionDriftBeforeDispatch() {
  await withSourceResolution(async resolution => {
    let calls = 0
    let current = true
    const registry = buildRegistry({
      execute: async () => {
        calls += 1
        return { ok: true }
      },
    })
    const pending = executeAgenticOsInvocation({
      resolution,
      registry,
      selectionIsCurrent: () => current,
    })
    current = false
    const outcome = await pending
    assert.equal(outcome.status, 'blocked')
    assert.match(outcome.error, /selection changed/)
    assert.equal(calls, 0)
  })
}

export async function testAgenticOsInvocationFencesCatalogDriftBeforeDispatch() {
  await withSourceResolution(async resolution => {
    let calls = 0
    const registry = buildRegistry({ execute: async () => { calls += 1; return { ok: true } } })
    const pending = executeAgenticOsInvocation({ resolution, registry })
    resetAgenticOsRemoteGrammarCatalogForTests()
    const outcome = await pending
    assert.equal(outcome.status, 'blocked')
    assert.match(outcome.error, /catalog proof changed during execution preparation/)
    assert.equal(calls, 0)
  })
}
