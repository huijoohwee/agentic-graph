import { resolveChatAgenticGraphAttempt } from '@/features/chat/floatingPanelChat/floatingPanelChatKgcAttempt'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'

const buildLiteralMcpStructuredChatResponse = (): string => JSON.stringify({
  jsonrpc: '2.0',
  id: 'chat-mcp-structured-response',
  result: {
    content: [
      {
        type: 'text',
        text: 'MCP structured response with renderable widgets, rich media panels, cards, and dataflow edges.',
      },
    ],
    structuredContent: {
      widgets: [
        {
          id: 'runner',
          label: 'Inline Runner',
          kind: 'text',
          prompt: 'Compute the response summary.',
          output: 'RUNNER OUTPUT',
        },
      ],
      panels: [
        {
          id: 'panel',
          label: 'Response Panel',
          kind: 'text',
          output: 'PANEL OUTPUT',
        },
      ],
      cards: [
        {
          id: 'card',
          label: 'Response Card',
          kind: 'text',
          output: 'CARD OUTPUT',
        },
      ],
      media: [
        {
          id: 'image',
          label: 'Response Image',
          kind: 'image',
          imageUrl: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E',
        },
        {
          id: 'audio',
          label: 'Response Audio',
          kind: 'audio',
          audioUrl: 'data:audio/wav;base64,UklGRg==',
        },
        {
          id: 'video',
          label: 'Response Video',
          kind: 'video',
          videoUrl: 'data:video/mp4;base64,AAAA',
        },
      ],
      edges: [
        {
          source: 'runner',
          sourceHandle: 'text_out',
          target: 'panel',
          targetHandle: 'output',
          label: 'runner to panel',
        },
        {
          source: 'panel',
          sourceHandle: 'output',
          target: 'card',
          targetHandle: 'output',
          label: 'panel to card',
        },
      ],
    },
  },
}, null, 2)

export async function testExecuteFloatingPanelChatSubmitCoordinatorFinalizesMcpStructuredContentWithoutKgcRetry() {
  const assistantText = buildLiteralMcpStructuredChatResponse()
  const finalized: Array<{
    rawAssistantText: string
    validatedKgc?: string | null
    status?: 'ok' | 'error'
  }> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const terminalResets: string[] = []
  let transportAttempts = 0
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatLocalStorageRootPath: '/workspace/chat',
    chatAgenticGraphWorkspacePath: '/workspace/chat/mcp-response.md',
    finalizeAssistantSuccess: async payload => {
      finalized.push({
        rawAssistantText: payload.rawAssistantText,
        validatedKgc: payload.validatedKgc,
        status: payload.status,
      })
    },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })

  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Render an MCP response',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Render an MCP response' }],
    requestTimestampMs: Date.UTC(2026, 5, 4, 10, 0, 0),
    traceId: 'trace-mcp-structured-submit',
    bootstrapDraft: async () => '/workspace/chat/mcp-response.md',
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Render an MCP response' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
    executeTransportAttempt: async () => {
      transportAttempts += 1
      return {
        response: new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
        effectiveModel: 'model-a',
        detail: null,
      }
    },
    createDraftWriter: () => async () => {},
    readAssistantResponse: async () => ({
      assistantText,
      rawSseEvents: [],
      reasoningSteps: [],
      reasoningPreview: null,
      reasoningStepCount: 0,
      usageSummary: null,
      finishReason: 'stop',
      modelId: 'model-a',
    }),
    finalizeTerminal: () => { terminalResets.push('done') },
  })

  if (transportAttempts !== 1) {
    throw new Error(`Expected literal MCP structuredContent response to finalize without validation retry, got ${transportAttempts} transport attempts`)
  }
  if (finalized.length !== 1 || finalized[0]?.rawAssistantText !== assistantText || finalized[0]?.validatedKgc !== null || finalized[0]?.status !== 'ok') {
    throw new Error(`Expected coordinator to finalize raw MCP structured response without synthetic KGC, got ${JSON.stringify(finalized)}`)
  }
  if (connectivity[0] !== 'ok' || connectivityDetail[0] !== null || terminalResets.length !== 1) {
    throw new Error(`Expected coordinator to finish cleanly after MCP structured response, got ${JSON.stringify({ connectivity, connectivityDetail, terminalResets })}`)
  }
}

export function testResolveChatAgenticGraphAttemptFinalizesLiteralMcpStructuredContentWithoutRetry() {
  const assistantText = buildLiteralMcpStructuredChatResponse()
  const result = resolveChatAgenticGraphAttempt({
    assistantText,
    packedFrontmatter: null,
    attempt: 1,
    maxValidationAttempts: 3,
  })
  if (result.kind !== 'final') {
    throw new Error(`Expected literal MCP structuredContent attempt to finalize without retry, got ${result.kind}`)
  }
  if (result.finalAssistantText !== assistantText || result.validatedKgc !== null || result.status !== 'ok') {
    throw new Error(`Expected literal MCP structuredContent attempt to preserve raw response with no synthetic KGC, got ${JSON.stringify(result)}`)
  }
  if (
    result.validation.stage !== 'validated' ||
    result.validation.hasStructuredResponseSurface !== true ||
    result.validation.hasStructuredKgc !== false ||
    result.validation.hasYamlFrontmatter !== false ||
    result.validation.validatedKgcLength !== 0
  ) {
    throw new Error(`Expected literal MCP structuredContent validation snapshot to report a structured response surface, got ${JSON.stringify(result.validation)}`)
  }
}
