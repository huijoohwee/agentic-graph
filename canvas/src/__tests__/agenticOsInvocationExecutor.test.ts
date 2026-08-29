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
import type { WebMcpToolInput } from '@/features/agent-ready/webMcpRuntimeTypes'
import { AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID } from '@/lib/storage/agenticgraphStorageSyncContract'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForTasks } from '@/tests/lib/reactRootHarness'

const SOURCE_REVISION = 'a'.repeat(40)
const CATALOG_DIGEST = 'b'.repeat(64)
const ROUTING_DIGEST = 'c'.repeat(64)
const COMMAND = '/inspect-runtime'
const TOOL = 'agenticgraph.runtime.inspect'
const IMPORT_URL_INPUT_SCHEMA = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  includeBrowserOnlyTools: true,
}).find(contract => contract.webName === IMPORT_URL_AGENT_READY_MCP_TOOL_NAME)?.inputSchema

if (!IMPORT_URL_INPUT_SCHEMA) throw new Error('Missing canonical Import URL input schema.')

const EXPECTED_PROOF = Object.freeze({
  sourceRevision: SOURCE_REVISION,
  catalogDigest: CATALOG_DIGEST,
  routingSchema: AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  routingDigest: ROUTING_DIGEST,
})

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
  execute,
}: Readonly<{
  name?: string
  inputSchema?: Record<string, unknown>
  execute: (input?: WebMcpToolInput) => Promise<unknown>
}>) => createWebMcpToolRegistry([{
  name,
  description: 'Test runtime inspection.',
  inputSchema,
  execute,
}])

export function testAgenticGraphWebMcpRegistryIsFrozenAndContractOrdered() {
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
    await targetSkillsCommandsCommandInvocation('/ingest-url')
    const outcome = await executeSkillsCommandsMcpTarget({
      registry,
      input: { url: 'https://example.com/source' },
      online: true,
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
    await targetSkillsCommandsCommandInvocation('/ingest-url')
    const outcome = await executeSkillsCommandsMcpTarget({ registry, input: {}, online: true })
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
    await targetSkillsCommandsCommandInvocation('/ingest-url')
    resetAgenticOsRemoteGrammarCatalogForTests()
    const outcome = await executeSkillsCommandsMcpTarget({
      registry,
      input: { url: 'https://example.com/source' },
      online: true,
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
  type Outcome = Awaited<ReturnType<typeof executeSkillsCommandsMcpTarget>>
  let resolveFirst: ((outcome: Outcome) => void) | null = null
  const executeTarget: typeof executeSkillsCommandsMcpTarget = args => {
    calls.push(args?.input)
    if (calls.length === 1) {
      return new Promise<Outcome>(resolve => { resolveFirst = resolve })
    }
    return Promise.resolve(Object.freeze({
      status: 'completed',
      toolName: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
      missingFields: Object.freeze([]),
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
      await waitForTasks(1)
    })
    assert.deepEqual(calls, [{ url: 'https://example.com/source' }])

    await act(async () => {
      await targetSkillsCommandsCommandInvocation('/crawler-agent')
      await waitForTasks(1)
    })
    assert.ok(resolveFirst)
    resolveFirst(Object.freeze({
      status: 'partial',
      toolName: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
      missingFields: Object.freeze([]),
      result: Object.freeze({ authorization: 'old-secret', receiptId: 'stale-receipt' }),
      error: '',
    }))
    await act(async () => { await waitForTasks(1) })
    assert.match(container.textContent || '', /Source-backed invocation selected: \/crawler-agent/)
    assert.doesNotMatch(container.textContent || '', /stale-receipt|old-secret/)

    const currentExecuteButton = container.querySelector('[data-agenticgraph-invocation-execute="selected"]') as HTMLButtonElement | null
    assert.ok(currentExecuteButton)
    await act(async () => {
      currentExecuteButton.click()
      await waitForTasks(1)
    })
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
  const expectedResult = Object.freeze({ ok: true, revision: 3 })
  const inputs: WebMcpToolInput[] = []
  const registry = buildRegistry({
    execute: async input => {
      inputs.push(input)
      return expectedResult
    },
  })

  const outcome = await executeAgenticOsInvocation({
    resolution: buildResolution(),
    expectedProof: EXPECTED_PROOF,
    registry,
    input: { workspaceId: 'local' },
  })

  assert.equal(outcome.status, 'completed')
  assert.equal(outcome.toolName, TOOL)
  assert.equal(outcome.result, expectedResult)
  assert.deepEqual(inputs, [{ workspaceId: 'local' }])
}

export async function testAgenticOsInvocationRequestsRequiredInputBeforeDispatch() {
  let calls = 0
  const registry = buildRegistry({
    inputSchema: { type: 'object', required: ['workspaceId', 'path'] },
    execute: async () => {
      calls += 1
      return { ok: true }
    },
  })

  const outcome = await executeAgenticOsInvocation({
    resolution: buildResolution(),
    expectedProof: EXPECTED_PROOF,
    registry,
    input: { workspaceId: 'local' },
  })

  assert.equal(outcome.status, 'requested-user-input')
  assert.deepEqual(outcome.missingFields, ['path'])
  assert.equal(calls, 0)
}

export async function testAgenticOsInvocationRejectsStaleProofBeforeDispatch() {
  let calls = 0
  const registry = buildRegistry({
    execute: async () => {
      calls += 1
      return { ok: true }
    },
  })

  const outcome = await executeAgenticOsInvocation({
    resolution: buildResolution({ sourceRevision: 'd'.repeat(40) }),
    expectedProof: EXPECTED_PROOF,
    registry,
  })

  assert.equal(outcome.status, 'blocked')
  assert.match(outcome.error, /proof is stale/)
  assert.equal(calls, 0)
}

export async function testAgenticOsInvocationRejectsAmbiguousToolOwnership() {
  let calls = 0
  const registry = buildRegistry({
    execute: async () => {
      calls += 1
      return { ok: true }
    },
  })

  const outcome = await executeAgenticOsInvocation({
    resolution: buildResolution({ declaredTools: [TOOL, 'agenticgraph.runtime.other'] }),
    expectedProof: EXPECTED_PROOF,
    registry,
  })

  assert.equal(outcome.status, 'blocked')
  assert.match(outcome.error, /exactly one executable MCP tool/)
  assert.equal(calls, 0)
}

export async function testAgenticOsInvocationPreservesDomainOwnedQueuedResult() {
  const queuedResult = Object.freeze({ status: 'queued', outboxId: 'domain-owned-17' })
  const registry = buildRegistry({ execute: async () => queuedResult })

  const outcome = await executeAgenticOsInvocation({
    resolution: buildResolution(),
    expectedProof: EXPECTED_PROOF,
    registry,
    online: false,
  })

  assert.equal(outcome.status, 'queued')
  assert.equal(outcome.result, queuedResult)
}

export async function testAgenticOsInvocationDoesNotRetryOrInventAnOfflineQueue() {
  let calls = 0
  const registry = buildRegistry({
    execute: async () => {
      calls += 1
      throw new Error('network unavailable')
    },
  })

  const outcome = await executeAgenticOsInvocation({
    resolution: buildResolution(),
    expectedProof: EXPECTED_PROOF,
    registry,
    online: false,
  })

  assert.equal(outcome.status, 'offline-unavailable')
  assert.equal(outcome.result, null)
  assert.equal(calls, 1)
}

export async function testAgenticOsInvocationUsesCaseSensitiveRegistryIdentity() {
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
      tool: 'agenticgraph.Runtime.inspect',
      declaredTools: ['agenticgraph.Runtime.inspect'],
    }),
    expectedProof: EXPECTED_PROOF,
    registry,
  })

  assert.equal(outcome.status, 'blocked')
  assert.match(outcome.error, /exact resolved tool is unavailable/)
  assert.equal(calls, 0)
}
