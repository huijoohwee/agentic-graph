import {
  AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS,
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  type AgenticOsDocsMcpBridgeSuccess,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { getAgenticOsCommandInvocations } from '@/features/agentic-os/agenticOsDocInvocations'
import {
  registerAgenticOsRemoteGrammarCatalogEntries,
  resetAgenticOsRemoteGrammarCatalogForTests,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import {
  buildHeadlessResponseProviderPrompt,
  finalizeHeadlessResponseRun,
  HEADLESS_RESPONSE_RUN_SCHEMA,
  prepareHeadlessResponseRun,
  projectHeadlessResponseRunReceipt,
} from '@/features/chat/headlessResponseCoordinator'
import { projectHeadlessResponseRunToChatMessage } from '@/features/chat/headlessResponseChatProjection'
import { parseChatHistory } from '@/features/chat/floatingPanelChat/useFloatingPanelChatHistory'

const buildMcpResponse = (
  invocationTokens: string[],
): AgenticOsDocsMcpBridgeSuccess => ({
  ok: true,
  tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  mcpInvoked: true,
  invocations: invocationTokens.map(token => ({
    token,
    ok: true,
    kind: token.startsWith('/') ? 'command' : token.startsWith('#') ? 'semantic' : 'binding',
    label: token.slice(1),
    summary: `Resolved ${token}.`,
    sourcePath: `docs/${token.slice(1)}.md`,
  })),
})

export async function testHeadlessResponsePlainLanguageSkipsMcp() {
  let mcpCalls = 0
  const prepared = await prepareHeadlessResponseRun({
    runId: 'plain-run',
    source: { kind: 'chat', id: 'assistant-1' },
    requestText: 'Summarize the selected evidence in two sentences.',
    responseContract: 'plain',
    chatStorageTarget: 'chatHistory',
    provider: 'test-provider',
    model: 'test-model',
  }, {
    invokeDocsMcp: async request => {
      mcpCalls += 1
      return buildMcpResponse(request.invocationTokens)
    },
  })
  if (
    mcpCalls !== 0
    || prepared.invocation.tokens.length !== 0
    || buildHeadlessResponseProviderPrompt(prepared) !== 'Summarize the selected evidence in two sentences.'
    || !prepared.systemMessages[0]?.content.includes('pipeline AI assistant operating inside a graph workspace canvas')
  ) {
    throw new Error(`expected plain natural language to use one headless LLM preparation without MCP traffic, got ${JSON.stringify({ mcpCalls, prepared })}`)
  }
}

export async function testHeadlessResponseExplicitSigilsResolveOnce() {
  const calls: string[][] = []
  const prepared = await prepareHeadlessResponseRun({
    runId: 'invocation-run',
    source: { kind: 'widget', id: 'source-widget' },
    requestText: '/agenticgraph.probe-tree @agenticgraph.probe-tree #agenticgraph.probe-tree /agenticgraph.probe-tree Compare the options.',
    responseContract: 'plain',
    chatStorageTarget: 'chatHistory',
    provider: 'test-provider',
    model: 'test-model',
  }, {
    invokeDocsMcp: async request => {
      calls.push([...request.invocationTokens])
      return buildMcpResponse(request.invocationTokens)
    },
  })
  const expectedTokens = [
    '/agenticgraph.probe-tree',
    '@agenticgraph.probe-tree',
    '#agenticgraph.probe-tree',
  ]
  const evidencePrompt = prepared.systemMessages.map(message => message.content).join('\n')
  if (
    calls.length !== 1
    || calls[0]?.join(',') !== expectedTokens.join(',')
    || prepared.invocation.tokens.join(',') !== expectedTokens.join(',')
    || !evidencePrompt.includes('source-backed invocation metadata only')
    || !evidencePrompt.includes(AGENTIC_OS_DOCS_MCP_TOOL_NAME)
  ) {
    throw new Error(`expected mixed / @ # tokens to deduplicate into one bounded docs MCP resolution, got ${JSON.stringify({ calls, prepared })}`)
  }
}

export async function testHeadlessResponseUnresolvedInvocationFailsBeforeInference() {
  let errorMessage = ''
  try {
    await prepareHeadlessResponseRun({
      runId: 'failed-run',
      source: { kind: 'widget', id: 'source-widget' },
      requestText: '/agenticgraph.probe-tree Compare the options.',
      responseContract: 'plain',
      chatStorageTarget: 'chatHistory',
      provider: 'test-provider',
      model: 'test-model',
    }, {
      invokeDocsMcp: async request => ({
        ...buildMcpResponse(request.invocationTokens),
        invocations: request.invocationTokens.map(token => ({
          token,
          ok: false,
          error: 'Dictionary revision unavailable.',
        })),
      }),
    })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error || '')
  }
  if (errorMessage !== 'Dictionary revision unavailable.') {
    throw new Error(`expected unresolved source-backed invocation to fail before provider inference, got ${errorMessage}`)
  }
}

export async function testHeadlessResponseInvocationOverflowFailsBeforeInference() {
  try {
    resetAgenticOsRemoteGrammarCatalogForTests()
    registerAgenticOsRemoteGrammarCatalogEntries(Array.from(
      { length: AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS + 1 },
      (_, index) => ({
        token: `/test.runtime.${index + 1}`,
        kind: 'command',
        label: `Runtime contract ${index + 1}`,
        summary: 'Test-only source-backed runtime contract.',
        sourcePath: `DICTIONARY-COMMAND.md#test-runtime-${index + 1}`,
      }),
    ))
    const tokens = getAgenticOsCommandInvocations()
      .map(invocation => invocation.token)
      .filter(token => token.startsWith('/test.runtime.'))
    let mcpCalls = 0
    let errorMessage = ''
    try {
      await prepareHeadlessResponseRun({
        runId: 'overflow-run',
        source: { kind: 'chat', id: 'assistant-overflow' },
        requestText: `${tokens.join(' ')} Summarize all referenced contracts.`,
        responseContract: 'plain',
        chatStorageTarget: 'chatHistory',
        provider: 'test-provider',
        model: 'test-model',
      }, {
        invokeDocsMcp: async request => {
          mcpCalls += 1
          return buildMcpResponse(request.invocationTokens)
        },
      })
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error || '')
    }

    const prepared = await prepareHeadlessResponseRun({
      runId: 'legacy-receipt-run',
      source: { kind: 'chat', id: 'assistant-legacy-receipt' },
      requestText: 'Project a legacy result into a bounded receipt.',
      responseContract: 'plain',
      chatStorageTarget: 'chatHistory',
      provider: 'test-provider',
      model: 'test-model',
    })
    const legacyResult = finalizeHeadlessResponseRun({
      prepared,
      responseText: 'Legacy response.',
      modelId: 'test-model',
    })
    legacyResult.invocation.tokens = tokens
    const receipt = projectHeadlessResponseRunReceipt(legacyResult)
    if (
      tokens.length !== AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS + 1
      || mcpCalls !== 0
      || !errorMessage.includes(String(AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS))
      || receipt.invocation.tokens.length !== AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS
      || receipt.invocation.tokens.join(',') !== tokens.slice(0, AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS).join(',')
    ) {
      throw new Error(`expected overflow to fail before MCP/inference and legacy receipts to use the shared token bound, got ${JSON.stringify({ mcpCalls, errorMessage, receipt })}`)
    }
  } finally {
    resetAgenticOsRemoteGrammarCatalogForTests()
  }
}

export async function testHeadlessResponseFinalizationUsesSharedStructuredProjector() {
  const prepared = await prepareHeadlessResponseRun({
    runId: 'structured-run',
    source: { kind: 'chat', id: 'assistant-structured' },
    requestText: 'Create one reusable result panel.',
    responseContract: 'plain',
    chatStorageTarget: 'chatHistory',
    provider: 'test-provider',
    model: 'test-model',
  })
  const responseText = [
    'Created the requested result.',
    '',
    '```yaml',
    'response:',
    '  structuredContent:',
    '    panels:',
    '      - id: result-panel',
    '        label: Result',
    '        kind: text',
    '        output: Ready',
    '```',
  ].join('\n')
  const result = finalizeHeadlessResponseRun({
    prepared,
    responseText,
    modelId: 'test-model',
    artifactPath: '/chats/result.md',
  })
  if (
    result.schema !== HEADLESS_RESPONSE_RUN_SCHEMA
    || result.responseText !== responseText
    || result.structuredSurface?.nodes.length !== 1
    || result.structuredSurface.nodes[0]?.properties.output !== 'Ready'
    || result.output.artifactPath !== '/chats/result.md'
  ) {
    throw new Error(`expected finalization to preserve one canonical response and reuse the structured projector, got ${JSON.stringify(result)}`)
  }
}

export async function testHeadlessResponseRunSurvivesLocalChatHistoryProjection() {
  const requestText = `Keep the run contract without duplicating ${'request-bulk-'.repeat(200)}`
  const prepared = await prepareHeadlessResponseRun({
    runId: 'durable-chat-run',
    source: { kind: 'chat', id: 'assistant-durable' },
    requestText,
    responseContract: 'plain',
    chatStorageTarget: 'chatHistory',
    provider: 'test-provider',
    model: 'test-model',
  })
  const responseText = `Durable response.\n\n${'response-bulk-'.repeat(300)}`
  const runResult = finalizeHeadlessResponseRun({
    prepared,
    responseText,
    modelId: 'test-model',
  })
  const projected = projectHeadlessResponseRunToChatMessage({
    message: { id: 'assistant-durable', role: 'assistant', content: '' },
    content: 'Durable response.',
    runResult,
    artifactPath: '/chats/history.md',
  })
  const serialized = JSON.stringify([projected])
  const hydrated = parseChatHistory(JSON.parse(serialized))
  const legacyHydrated = parseChatHistory(JSON.parse(JSON.stringify([{
    id: 'assistant-legacy',
    role: 'assistant',
    content: 'Legacy response.',
    headlessResponseRun: runResult,
  }])))
  const malformedHydrated = parseChatHistory([{
    id: 'assistant-malformed',
    role: 'assistant',
    content: 'Malformed legacy response.',
    headlessResponseRun: {
      schema: HEADLESS_RESPONSE_RUN_SCHEMA,
      runId: 'malformed-run',
      source: { kind: 'chat', id: 'assistant-malformed' },
      status: 'ok',
      responseContract: 'plain',
      output: { modelId: null, artifactPath: null },
    },
  }])
  const receiptRecord = hydrated?.[0]?.headlessResponseRun as unknown as Record<string, unknown> | undefined
  if (
    hydrated?.[0]?.content !== 'Durable response.'
    || hydrated[0].headlessResponseRun?.runId !== 'durable-chat-run'
    || hydrated[0].headlessResponseRun?.schema !== HEADLESS_RESPONSE_RUN_SCHEMA
    || hydrated[0].headlessResponseRun?.invocation.mcpInvoked !== false
    || hydrated[0].headlessResponseRun?.output.artifactPath !== '/chats/history.md'
    || 'requestText' in (receiptRecord || {})
    || 'providerText' in (receiptRecord || {})
    || 'responseText' in (receiptRecord || {})
    || 'structuredSurface' in (receiptRecord || {})
    || serialized.includes('request-bulk-')
    || serialized.includes('response-bulk-')
    || legacyHydrated?.[0]?.headlessResponseRun?.runId !== 'durable-chat-run'
    || 'responseText' in ((legacyHydrated?.[0]?.headlessResponseRun || {}) as unknown as Record<string, unknown>)
    || malformedHydrated?.[0]?.headlessResponseRun !== undefined
  ) {
    throw new Error(`expected a bounded, artifact-backed receipt to survive local Chat history persistence, migrate legacy full results, and reject malformed receipts, got ${JSON.stringify({ hydrated, legacyHydrated, malformedHydrated })}`)
  }
}
