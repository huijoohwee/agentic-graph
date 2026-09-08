import { buildStorageChatRelayDecisionFixture, buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { buildChatSubmitPayloadMessages, buildChatSubmitRequestContext, createChatSubmitRequestSender, resolveChatSubmitTokenLimitKey, resolveInitialChatSubmitModel } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import { initializeChatSubmitOptimisticState, resolveChatSubmitRequestUrlOrSetError } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitPreflight'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'

export function testBuildChatSubmitPayloadMessagesPlacesCorrectionBetweenSystemAndConversation() {
  const payload = buildChatSubmitPayloadMessages({
    systemMessages: [{ role: 'system', content: 'base-system' }],
    conversationMessages: [{ role: 'user', content: 'user-message' }],
    correctionPrompt: 'correction-system',
  })
  if (payload.length !== 3) {
    throw new Error(`Expected payload builder to return three messages, got ${payload.length}`)
  }
  if (payload[1]?.role !== 'system' || payload[1]?.content !== 'correction-system') {
    throw new Error(`Expected correction prompt to be inserted after system messages, got: ${JSON.stringify(payload)}`)
  }
  if (payload[2]?.role !== 'user') {
    throw new Error(`Expected conversation message to remain after correction prompt, got: ${JSON.stringify(payload)}`)
  }
}

export function testResolveInitialChatSubmitModelFallsBackToProviderDefault() {
  const resolved = resolveInitialChatSubmitModel({
    chatProvider: 'openai',
    chatModel: 'nonexistent-model',
  })
  if (!resolved.providerModelOptions.includes(resolved.effectiveModel)) {
    throw new Error(`Expected initial submit model resolver to fall back to a provider-owned default, got: ${JSON.stringify(resolved)}`)
  }
}

export function testResolveChatSubmitTokenLimitKeyUsesOpenAiCompletionTokens() {
  const key = resolveChatSubmitTokenLimitKey('openai')
  if (key !== 'max_completion_tokens') {
    throw new Error(`Expected OpenAI submit token key to use max_completion_tokens, got: ${key}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorRejectsMissingModel() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: null,
    chatEndpointUrl: 'https://chat.example.test/v1/chat/completions',
    chatProvider: 'openai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== null) {
    throw new Error(`Expected preflight request-url helper to reject missing model, got: ${requestUrl}`)
  }
  if (!errors[0] || connectivity[0] !== 'unknown' || connectivityDetail[0] !== null) {
    throw new Error(`Expected missing-model preflight to write unknown connectivity and error text, got: ${JSON.stringify({ errors, connectivity, connectivityDetail })}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorRejectsMissingAgnesByokKey() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: 'agnes-2.0-flash',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'byok',
    chatApiKey: '',
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== null) {
    throw new Error(`Expected Agnes BYOK preflight to reject missing API key, got: ${requestUrl}`)
  }
  if (errors[0] !== 'Agnes AI API BYOK requires an API key in Settings.') {
    throw new Error(`Expected Agnes BYOK preflight error text, got: ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== errors[0]) {
    throw new Error(`Expected Agnes BYOK preflight to set error connectivity, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorPrefersStorageRelayWhenConfigured() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: 'agnes-2.0-flash',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
      kind: 'ready',
      providerId: 'agnes-ai',
    }),
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== 'https://storage.example.test/api/storage/chat/relay') {
    throw new Error(`Expected chat submit preflight to prefer configured storage relay URL, got ${String(requestUrl)}`)
  }
  if (errors.length > 0 || connectivity.length > 0 || connectivityDetail.length > 0) {
    throw new Error(`Expected relay preflight to succeed without mutating error/connectivity state, got ${JSON.stringify({ errors, connectivity, connectivityDetail })}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorBlocksStorageRelayWhenWorkspacePolicyDisallowsMode() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: 'agnes-2.0-flash',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
      kind: 'blocked',
      providerId: 'agnes-ai',
      authMode: 'serverManaged',
      detail: 'Agnes AI server-managed relay is not enabled for this workspace.',
    }),
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== null) {
    throw new Error(`Expected blocked storage relay preflight to stop submit, got ${String(requestUrl)}`)
  }
  if (errors[0] !== 'Agnes AI server-managed relay is not enabled for this workspace.') {
    throw new Error(`Expected blocked relay preflight to publish the policy error, got ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== errors[0]) {
    throw new Error(`Expected blocked relay preflight to set error connectivity, got ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
}

export function testInitializeChatSubmitOptimisticStateInsertsPendingAssistantAndCachesHistory() {
  const errorWrites: Array<string | null> = []
  const connectivityDetailWrites: Array<string | null> = []
  const streamingAssistantWrites: Array<{ id: string; text: string } | null> = []
  const messageWrites: ChatMessage[][] = []
  const inputWrites: string[] = []
  const loadingWrites: boolean[] = []
  const result = initializeChatSubmitOptimisticState({
    historyKey: 'history-key',
    trimmedInput: 'Generate AGENTIC_OS',
    messages: [{ id: 'm-0', role: 'assistant', content: 'Previous' }],
    setErrorText: value => { errorWrites.push(typeof value === 'function' ? null : value) },
    setConnectivityDetail: value => { connectivityDetailWrites.push(typeof value === 'function' ? null : value) },
    setStreamingAssistant: value => { streamingAssistantWrites.push(typeof value === 'function' ? null : value) },
    setMessages: value => { messageWrites.push(typeof value === 'function' ? [] : value) },
    setInput: value => { inputWrites.push(typeof value === 'function' ? '' : value) },
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
  })
  if (!result.assistantMessageId || !result.traceId.includes(result.assistantMessageId)) {
    throw new Error(`Expected optimistic submit setup to return assistant id and trace id, got: ${JSON.stringify(result)}`)
  }
  if (streamingAssistantWrites.length !== 1 || streamingAssistantWrites[0]?.id !== result.assistantMessageId) {
    throw new Error('Expected optimistic submit setup to create the streaming assistant placeholder')
  }
  if (messageWrites.length !== 1 || messageWrites[0]?.length !== 3) {
    throw new Error(`Expected optimistic submit setup to append user and assistant messages, got: ${JSON.stringify(messageWrites)}`)
  }
  if (errorWrites[0] !== null || connectivityDetailWrites[0] !== null) {
    throw new Error(`Expected optimistic submit setup to clear error text and connectivity detail, got: ${JSON.stringify({ errorWrites, connectivityDetailWrites })}`)
  }
  if (inputWrites[0] !== '' || loadingWrites[0] !== true) {
    throw new Error(`Expected optimistic submit setup to clear input and set loading true, got: ${JSON.stringify({ inputWrites, loadingWrites })}`)
  }
}

export async function testBuildChatSubmitRequestContextBuildsSelectionScopedSystemMessages() {
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatContextScope: 'selection',
    chatSystemPrompt: 'custom-system-prompt',
    markdownText: '---\ntitle: Example\n---\n# Title\nSelected body text',
    currentNode: {
      id: 'node-1',
      label: 'Node 1',
      type: 'text',
      x: 0,
      y: 0,
      properties: {},
      metadata: {},
    },
    graphData: {
      nodes: [],
      edges: [],
      metadata: {},
      type: 'graph',
    },
  })
  const context = await buildChatSubmitRequestContext({
    submitArgs,
    nextMessages: [
      { id: 'assistant-pending', role: 'assistant', content: '' },
      { id: 'user-1', role: 'user', content: 'Generate AGENTIC_OS' },
    ],
    assistantMessageId: 'assistant-pending',
  })
  if (!context.systemMessages.some(message => message.content === 'custom-system-prompt')) {
    throw new Error('Expected request context builder to include the custom system prompt')
  }
  if (!context.systemMessages.some(message => message.content.includes('selected_node'))) {
    throw new Error('Expected request context builder to include packed context system content')
  }
  if (context.conversationMessages.length !== 1 || context.conversationMessages[0]?.content !== 'Generate AGENTIC_OS') {
    throw new Error(`Expected request context builder to exclude the pending assistant placeholder, got: ${JSON.stringify(context.conversationMessages)}`)
  }
}

export async function testCreateChatSubmitRequestSenderBuildsAgenticGraphPayloadWithTokenFloor() {
  let captured: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatMaxCompletionTokens: 32,
  })
  const sender = createChatSubmitRequestSender({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    controller: new AbortController(),
    fetchFn: async (input, init) => {
      captured = {
        url: String(input),
        body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
        headers: (init?.headers || {}) as Record<string, string>,
      }
      return new Response('{}', { status: 200 })
    },
  })
  await sender('model-x', [{ role: 'system', content: 'base-system' }], 'max_completion_tokens')
  if (!captured) {
    throw new Error('Expected request sender helper to invoke fetch')
  }
  if (captured.url !== 'https://chat.example.test/v1/chat/completions') {
    throw new Error(`Expected request sender helper to preserve request URL, got: ${captured.url}`)
  }
  if (captured.body.max_completion_tokens !== 4000) {
    throw new Error(`Expected chatAgenticGraph request sender to raise completion token floor to 4000, got: ${String(captured.body.max_completion_tokens)}`)
  }
  if (captured.body.stream !== true) {
    throw new Error(`Expected request sender helper to force streaming payloads, got: ${String(captured.body.stream)}`)
  }
}

export async function testCreateChatSubmitRequestSenderUsesStorageRelayWhenSessionEnvIsPresent() {
  let capturedRelayRequest: {
    url: string
    method: string
    authorization: string
    requestId: string
    body: Record<string, unknown>
  } | null = null
  const submitArgs = buildSubmitArgsFixture({
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    chatStorageTarget: 'chatAgenticGraph',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatModel: 'agnes-2.0-flash',
    chatMaxCompletionTokens: 100,
    chatTopP: 0.5,
    storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
      kind: 'ready',
      providerId: 'agnes-ai',
      authMode: 'serverManaged',
    })
  })
  const sender = createChatSubmitRequestSender({
    submitArgs,
    requestUrl: 'https://storage.example.test/api/storage/chat/relay',
    controller: new AbortController(),
    fetchFn: async (input, init) => {
      capturedRelayRequest = {
        url: String(input),
        method: String(init?.method || ''),
        authorization: String(new Headers(init?.headers).get('authorization') || ''),
        requestId: String(new Headers(init?.headers).get('x-client-request-id') || ''),
        body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
      }
      return new Response(JSON.stringify({
        ok: true,
        apiVersion: '2026-05-04',
        workspaceId: 'kgws:test-chat',
        providerId: 'agnes-ai',
        authMode: 'serverManaged',
        upstreamStatus: 200,
        relayStatus: 'allowed',
        body: {
          choices: [{ message: { role: 'assistant', content: 'relay-ok' } }],
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    },
  })
  const response = await sender('agnes-2.0-flash', [{ role: 'user', content: 'ping' }], 'max_tokens')
  const responseJson = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  if (response.status !== 200 || responseJson.choices?.[0]?.message?.content !== 'relay-ok') {
    throw new Error(`Expected storage relay sender to unwrap upstream body into chat payload shape, got ${JSON.stringify({ status: response.status, responseJson })}`)
  }
  if (!capturedRelayRequest) {
    throw new Error('Expected storage relay sender to invoke storage relay URL')
  }
  if (capturedRelayRequest.url !== 'https://storage.example.test/api/storage/chat/relay') {
    throw new Error(`Expected storage relay sender to post to storage relay URL, got ${capturedRelayRequest.url}`)
  }
  if (capturedRelayRequest.method !== 'POST') {
    throw new Error(`Expected storage relay sender to use POST, got ${capturedRelayRequest.method}`)
  }
  if (capturedRelayRequest.authorization !== 'Bearer sess:test') {
    throw new Error(`Expected storage relay sender to forward bearer session token, got ${capturedRelayRequest.authorization}`)
  }
  if (!capturedRelayRequest.requestId.startsWith('kg-chat-')) {
    throw new Error(`Expected storage relay sender to emit a client request id, got ${capturedRelayRequest.requestId}`)
  }
  if (capturedRelayRequest.body.apiVersion !== '2026-05-04') {
    throw new Error(`Expected storage relay sender to use storage API version payload, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.workspaceId !== 'kgws:test-chat') {
    throw new Error(`Expected storage relay sender to pass workspace id from relay decision, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.providerId !== 'agnes-ai') {
    throw new Error(`Expected storage relay sender to pass provider id, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.authMode !== 'serverManaged') {
    throw new Error(`Expected storage relay sender to pass auth mode, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.stream !== false) {
    throw new Error(`Expected storage relay sender to force non-stream relay payload, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  const providerOptions = capturedRelayRequest.body.providerOptions as Record<string, unknown> | null
  if (!providerOptions || providerOptions.max_tokens !== 4000) {
    throw new Error(`Expected storage relay sender to preserve chatAgenticGraph token floor inside provider options, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
}
