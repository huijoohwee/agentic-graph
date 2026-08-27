import { buildStorageChatRelayDecisionFixture, buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { createChatSubmitRequestSender } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'

export async function testCreateChatSubmitRequestSenderUsesOpenAiResponsesInputPayload() {
  let capturedBody: Record<string, unknown> | null = null
  const submitArgs = buildSubmitArgsFixture({
    chatProvider: 'openai',
    chatEndpointUrl: 'https://api.openai.com/v1/responses',
    chatModel: 'gpt-5-nano',
    chatMaxCompletionTokens: 512,
  })
  const sender = createChatSubmitRequestSender({
    submitArgs,
    requestUrl: '/__chat_proxy/v1/responses',
    controller: new AbortController(),
    fetchFn: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response('{}', { status: 200 })
    },
  })
  const userPrompt = 'Generate KGC for https://example.com/reference?id=123'
  await sender('gpt-5-nano', [
    { role: 'system', content: 'base-system' },
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: 'Previous answer' },
  ], 'max_completion_tokens')
  if (!capturedBody) throw new Error('Expected OpenAI Responses request sender to invoke fetch')
  if ('messages' in capturedBody || capturedBody.max_completion_tokens) {
    throw new Error(`Expected OpenAI Responses payload to omit Chat Completions fields, got ${JSON.stringify(capturedBody)}`)
  }
  if (capturedBody.max_output_tokens !== 512 || capturedBody.stream !== true) {
    throw new Error(`Expected OpenAI Responses payload to use max_output_tokens and streaming, got ${JSON.stringify(capturedBody)}`)
  }
  const input = Array.isArray(capturedBody.input) ? capturedBody.input as Array<Record<string, unknown>> : []
  const userContent = Array.isArray(input[1]?.content) ? input[1]?.content as Array<Record<string, unknown>> : []
  const assistantContent = Array.isArray(input[2]?.content) ? input[2]?.content as Array<Record<string, unknown>> : []
  if (input.length !== 3 || input[0]?.role !== 'system' || userContent[0]?.type !== 'input_text' || assistantContent[0]?.type !== 'output_text') {
    throw new Error(`Expected OpenAI Responses input messages with typed text parts, got ${JSON.stringify(capturedBody.input)}`)
  }
  if (userContent[0]?.text !== userPrompt) {
    throw new Error(`Expected OpenAI Responses input_text to preserve query text, got ${JSON.stringify(userContent[0])}`)
  }
}

export async function testCreateChatSubmitRequestSenderUsesOpenAiResponsesImageInputForLocalMedia() {
  let capturedBody: Record<string, unknown> | null = null
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/storage/media/')) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch
    const submitArgs = buildSubmitArgsFixture({
      chatProvider: 'openai',
      chatEndpointUrl: 'https://api.openai.com/v1/responses',
      chatModel: 'gpt-5-nano',
      chatMaxCompletionTokens: 512,
    })
    const sender = createChatSubmitRequestSender({
      submitArgs,
      requestUrl: '/__chat_proxy/v1/responses',
      controller: new AbortController(),
      fetchFn: async (_input, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
        return new Response('{}', { status: 200 })
      },
    })
    const localImagePrompt = "what's in ![Image: source](<http://localhost:5180/api/storage/media/airvio/runs/upload-demo/image/source image.png?kg_media_token=secret-token>)"
    await sender('gpt-5-nano', [
      { role: 'system', content: 'base-system' },
      { role: 'user', content: localImagePrompt },
    ], 'max_completion_tokens')
  } finally {
    globalThis.fetch = originalFetch
  }
  if (!capturedBody) throw new Error('Expected OpenAI Responses request sender to invoke fetch')
  const bodyText = JSON.stringify(capturedBody)
  for (const forbidden of ['kg_media_token', 'secret-token', 'localhost:5180', '/api/storage/media/', 'upload-demo']) {
    if (bodyText.includes(forbidden)) {
      throw new Error(`Expected OpenAI Responses payload to avoid local media detail ${forbidden}`)
    }
  }
  const input = Array.isArray(capturedBody.input) ? capturedBody.input as Array<Record<string, unknown>> : []
  const userContent = Array.isArray(input[1]?.content) ? input[1]?.content as Array<Record<string, unknown>> : []
  const textPart = userContent.find(part => part.type === 'input_text')
  const imagePart = userContent.find(part => part.type === 'input_image')
  if (!textPart || textPart.text !== "what's in [attached image]") {
    throw new Error(`Expected local image markdown to become neutral input_text, got ${JSON.stringify(userContent)}`)
  }
  if (!imagePart || typeof imagePart.image_url !== 'string' || !imagePart.image_url.startsWith('data:image/png;base64,')) {
    throw new Error(`Expected local image markdown to become input_image data URL, got ${JSON.stringify(userContent)}`)
  }
}

export async function testCreateChatSubmitRequestSenderUsesStorageRelayResponsesImageInputForLocalMedia() {
  let capturedRelayBody: Record<string, unknown> | null = null
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/storage/media/')) {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch
    const submitArgs = buildSubmitArgsFixture({
      chatProvider: 'openai',
      chatAuthMode: 'serverManaged',
      chatStorageTarget: 'chatAgenticGraph',
      chatEndpointUrl: 'https://api.openai.com/v1/responses',
      chatModel: 'gpt-5-nano',
      chatMaxCompletionTokens: 512,
      storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
        kind: 'ready',
        providerId: 'openai',
        authMode: 'serverManaged',
      }),
    })
    const sender = createChatSubmitRequestSender({
      submitArgs,
      requestUrl: 'https://storage.example.test/api/storage/chat/relay',
      controller: new AbortController(),
      fetchFn: async (_input, init) => {
        capturedRelayBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
        return new Response(JSON.stringify({
          ok: true,
          apiVersion: '2026-05-04',
          workspaceId: 'kgws:test-chat',
          providerId: 'openai',
          authMode: 'serverManaged',
          upstreamStatus: 200,
          relayStatus: 'allowed',
          body: { output_text: 'relay-ok' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })
    const localImagePrompt = "what's in ![Image: source](<http://localhost:5180/api/storage/media/airvio/runs/upload-demo/image/source image.png?kg_media_token=secret-token>)"
    await sender('gpt-5-nano', [
      { role: 'system', content: 'base-system' },
      { role: 'user', content: localImagePrompt },
    ], 'max_completion_tokens')
  } finally {
    globalThis.fetch = originalFetch
  }
  if (!capturedRelayBody) throw new Error('Expected OpenAI Responses storage relay sender to invoke fetch')
  const bodyText = JSON.stringify(capturedRelayBody)
  for (const forbidden of ['kg_media_token', 'secret-token', 'localhost:5180', '/api/storage/media/', 'upload-demo', 'source image']) {
    if (bodyText.includes(forbidden)) {
      throw new Error(`Expected relay Responses payload to avoid local media detail ${forbidden}`)
    }
  }
  if (capturedRelayBody.requestSurface !== 'responses') {
    throw new Error(`Expected relay payload to declare Responses surface, got ${JSON.stringify(capturedRelayBody)}`)
  }
  if (capturedRelayBody.aiGatewayRoute !== null || capturedRelayBody.aiGatewayCacheTtlSeconds !== null) {
    throw new Error(`Expected browser relay payload to omit default AI Gateway route and cache policy so the authenticated storage relay can derive them, got ${JSON.stringify({
      aiGatewayRoute: capturedRelayBody.aiGatewayRoute,
      aiGatewayCacheTtlSeconds: capturedRelayBody.aiGatewayCacheTtlSeconds,
    })}`)
  }
  const relayMessages = Array.isArray(capturedRelayBody.messages) ? capturedRelayBody.messages as Array<Record<string, unknown>> : []
  if (relayMessages[1]?.content !== "what's in [attached image]") {
    throw new Error(`Expected relay metadata messages to be sanitized, got ${JSON.stringify(relayMessages)}`)
  }
  const input = Array.isArray(capturedRelayBody.input) ? capturedRelayBody.input as Array<Record<string, unknown>> : []
  const userContent = Array.isArray(input[1]?.content) ? input[1]?.content as Array<Record<string, unknown>> : []
  const textPart = userContent.find(part => part.type === 'input_text')
  const imagePart = userContent.find(part => part.type === 'input_image')
  if (!textPart || textPart.text !== "what's in [attached image]") {
    throw new Error(`Expected relay input_text to stay query-responsive, got ${JSON.stringify(userContent)}`)
  }
  if (!imagePart || typeof imagePart.image_url !== 'string' || !imagePart.image_url.startsWith('data:image/png;base64,')) {
    throw new Error(`Expected relay input_image data URL, got ${JSON.stringify(userContent)}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorAvoidsDuplicateEndpointConnectivityDetail() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  let messages: ChatMessage[] = [{ id: 'assistant-pending', role: 'assistant', content: '' }]
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatHistory',
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })
  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: '/__chat_proxy/v1/responses',
    trimmedInput: 'Generate KGC',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate KGC' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 1, 0),
    traceId: 'trace-endpoint-400',
    bootstrapDraft: async () => null,
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Generate KGC' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 400 }),
    resolveInitialModel: () => ({ providerModelOptions: ['gpt-5-nano'], effectiveModel: 'gpt-5-nano' }),
    executeTransportAttempt: async () => ({
      response: new Response('{}', { status: 400 }),
      effectiveModel: 'gpt-5-nano',
      detail: "Unsupported parameter: 'messages'. In the Responses API, this parameter has moved to 'input'.",
    }),
  })
  if (!errors[0]?.includes("Unsupported parameter: 'messages'")) {
    throw new Error(`Expected coordinator to keep the endpoint detail in the primary error text, got ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== null) {
    throw new Error(`Expected endpoint status failure to avoid a duplicate connectivity detail, got ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
  if (!messages.find(message => message.id === 'assistant-pending')?.content.includes("Unsupported parameter: 'messages'")) {
    throw new Error(`Expected endpoint status failure to persist the terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
}
