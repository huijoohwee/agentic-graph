import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { buildNeutralKgcFixtureDocument } from '@/__tests__/helpers/neutralKgcFixture'
import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_PATH,
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import type { DurableChatHeadlessPreparationSeed } from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import { collectAgenticOsRuntimeInvocations } from '@/features/chat/chatRuntimeInvocationProfile'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'

export async function testChatKgcRetryReusesPreparedHeadlessInvocationContext() {
  const previousFetch = globalThis.fetch
  const requestText = '/knowgrph.probe-tree Generate a structured KGC response.'
  const assistantMessageId = 'assistant-headless-retry'
  const requestTimestampMs = Date.UTC(2026, 6, 29, 9, 0, 0)
  const expectedTokens = collectAgenticOsRuntimeInvocations(requestText)
    .map(invocation => invocation.token)
  const mcpRequests: string[][] = []
  const providerPayloads: Array<Array<{ role: string; content: string }>> = []
  const finalized: Parameters<ReturnType<typeof buildSubmitArgsFixture>['finalizeAssistantSuccess']>[0][] = []
  let durableSeed: DurableChatHeadlessPreparationSeed | null | undefined
  let senderFactoryCalls = 0
  let providerAttempts = 0

  try {
    globalThis.fetch = (async (url, init) => {
      if (url !== AGENTIC_OS_DOCS_MCP_BRIDGE_PATH || init?.method !== 'POST') {
        throw new Error(`unexpected request outside the docs MCP preparation lane: ${String(url)}`)
      }
      const body = JSON.parse(String(init.body || '{}')) as { invocationTokens?: string[] }
      const invocationTokens = Array.isArray(body.invocationTokens) ? body.invocationTokens : []
      mcpRequests.push([...invocationTokens])
      return new Response(JSON.stringify({
        ok: true,
        tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
        mcpInvoked: true,
        invocations: invocationTokens.map(token => ({
          token,
          ok: true,
          kind: 'command',
          label: token.slice(1),
          summary: `Resolved ${token}.`,
        })),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const canonicalKgc = buildNeutralKgcFixtureDocument({
      timestampMs: requestTimestampMs,
      workspacePath: '/workspace/chat/headless-retry/kgc.md',
      requestText,
      assistantText: 'Produce the corrected reusable KGC document after bounded validation feedback.',
      expectationLabel: 'headless Chat retry fixture',
    })
    const submitArgs = buildSubmitArgsFixture({
      chatStorageTarget: 'chatKnowgrph',
      chatContextScope: 'selection',
      finalizeAssistantSuccess: async payload => { finalized.push(payload) },
      abortRef: { current: null },
      streamDraftTextRef: { current: null },
      streamFollowRef: { current: null },
    })

    await executeFloatingPanelChatSubmitCoordinator({
      submitArgs,
      requestUrl: 'https://chat.example.test/v1/chat/completions',
      trimmedInput: requestText,
      assistantMessageId,
      nextMessages: [{ id: 'user-headless-retry', role: 'user', content: requestText }],
      requestTimestampMs,
      traceId: 'trace-headless-retry',
      bootstrapDraft: async () => '/workspace/chat/headless-retry/kgc.md',
      createRequestSender: senderArgs => {
        senderFactoryCalls += 1
        durableSeed = senderArgs.durableStream?.headlessPreparationSeed
        return async (_model, messages) => {
          providerAttempts += 1
          providerPayloads.push(messages.map(message => ({ ...message })))
          return new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
      },
      resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
      executeTransportAttempt: async attemptArgs => ({
        response: await attemptArgs.sendChat('model-a', 'max_completion_tokens'),
        effectiveModel: 'model-a',
        detail: null,
      }),
      createDraftWriter: () => async () => {},
      readAssistantResponse: async () => ({
        assistantText: providerAttempts === 1
          ? 'This first response is not valid KGC markdown.'
          : canonicalKgc,
        rawSseEvents: [],
        reasoningSteps: [],
        reasoningPreview: null,
        reasoningStepCount: 0,
        usageSummary: null,
        finishReason: 'stop',
        modelId: 'model-a',
      }),
      finalizeTerminal: () => {},
    })
  } finally {
    globalThis.fetch = previousFetch
  }

  const evidenceByAttempt = providerPayloads.map(messages =>
    messages
      .filter(message => message.content.includes('Agentic OS docs MCP resolution evidence:'))
      .map(message => message.content),
  )
  const runResult = finalized[0]?.runResult
  if (
    expectedTokens.length === 0
    || mcpRequests.length !== 1
    || mcpRequests[0]?.join(' ') !== expectedTokens.join(' ')
    || senderFactoryCalls !== 1
    || providerAttempts !== 2
    || evidenceByAttempt.some(evidence => evidence.length !== 1)
    || evidenceByAttempt[0]?.[0] !== evidenceByAttempt[1]?.[0]
    || durableSeed?.runId !== assistantMessageId
    || durableSeed.invocation.tokens.join(' ') !== expectedTokens.join(' ')
    || durableSeed.invocation.mcpInvoked !== true
    || durableSeed.invocation.tool !== AGENTIC_OS_DOCS_MCP_TOOL_NAME
    || finalized.length !== 1
    || runResult?.runId !== assistantMessageId
    || runResult.status !== 'ok'
    || runResult.invocation.mcpInvoked !== true
    || runResult.invocation.tokens.join(' ') !== expectedTokens.join(' ')
  ) {
    throw new Error(`expected one prepared MCP context across one sender lane and two bounded KGC attempts, got ${JSON.stringify({
      expectedTokens,
      mcpRequests,
      senderFactoryCalls,
      providerAttempts,
      evidenceCounts: evidenceByAttempt.map(evidence => evidence.length),
      evidenceReused: evidenceByAttempt[0]?.[0] === evidenceByAttempt[1]?.[0],
      durableSeed,
      finalized: finalized.length,
      runResult,
    })}`)
  }
}

export async function testChatProviderFailureProjectsPreparedHeadlessReceipt() {
  const previousFetch = globalThis.fetch
  const requestText = '/knowgrph.probe-tree Resolve this request before the provider fails.'
  const assistantMessageId = 'assistant-headless-provider-error'
  const expectedTokens = collectAgenticOsRuntimeInvocations(requestText)
    .map(invocation => invocation.token)
  const mcpRequests: string[][] = []
  let providerAttempts = 0
  let finalized = 0
  let messages: ChatMessage[] = [
    { id: 'user-headless-provider-error', role: 'user', content: requestText },
    { id: assistantMessageId, role: 'assistant', content: '' },
  ]

  try {
    globalThis.fetch = (async (url, init) => {
      if (url !== AGENTIC_OS_DOCS_MCP_BRIDGE_PATH || init?.method !== 'POST') {
        throw new Error(`unexpected request outside the docs MCP preparation lane: ${String(url)}`)
      }
      const body = JSON.parse(String(init.body || '{}')) as { invocationTokens?: string[] }
      const invocationTokens = Array.isArray(body.invocationTokens) ? body.invocationTokens : []
      mcpRequests.push([...invocationTokens])
      return new Response(JSON.stringify({
        ok: true,
        tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
        mcpInvoked: true,
        invocations: invocationTokens.map(token => ({
          token,
          ok: true,
          kind: 'command',
          label: token.slice(1),
          summary: `Resolved ${token}.`,
        })),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const submitArgs = buildSubmitArgsFixture({
      setMessages: update => {
        messages = typeof update === 'function' ? update(messages) : update
      },
      finalizeAssistantSuccess: async () => { finalized += 1 },
      abortRef: { current: null },
      streamDraftTextRef: { current: null },
      streamFollowRef: { current: null },
    })
    await executeFloatingPanelChatSubmitCoordinator({
      submitArgs,
      requestUrl: 'https://chat.example.test/v1/chat/completions',
      trimmedInput: requestText,
      assistantMessageId,
      nextMessages: messages,
      requestTimestampMs: Date.UTC(2026, 6, 29, 10, 0, 0),
      traceId: 'trace-headless-provider-error',
      bootstrapDraft: async () => null,
      createRequestSender: () => async () => {
        providerAttempts += 1
        return new Response(JSON.stringify({ error: 'provider unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      },
      resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
      executeTransportAttempt: async attemptArgs => ({
        response: await attemptArgs.sendChat('model-a', 'max_completion_tokens'),
        effectiveModel: 'model-a',
        detail: 'provider unavailable',
      }),
      finalizeTerminal: () => {},
    })
  } finally {
    globalThis.fetch = previousFetch
  }

  const assistant = messages.find(message => message.id === assistantMessageId)
  const receipt = assistant?.headlessResponseRun
  const receiptRecord = receipt as unknown as Record<string, unknown> | undefined
  if (
    expectedTokens.length === 0
    || mcpRequests.length !== 1
    || mcpRequests[0]?.join(' ') !== expectedTokens.join(' ')
    || providerAttempts !== 1
    || finalized !== 0
    || receipt?.status !== 'error'
    || receipt.invocation.mcpInvoked !== true
    || receipt.invocation.tool !== AGENTIC_OS_DOCS_MCP_TOOL_NAME
    || receipt.invocation.tokens.join(' ') !== expectedTokens.join(' ')
    || !assistant?.content.includes('provider unavailable')
    || 'requestText' in (receiptRecord || {})
    || 'responseText' in (receiptRecord || {})
  ) {
    throw new Error(`expected a non-OK provider response after one MCP preparation to project one bounded error receipt, got ${JSON.stringify({
      expectedTokens,
      mcpRequests,
      providerAttempts,
      finalized,
      assistant,
    })}`)
  }
}
