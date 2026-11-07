import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_PROVIDER_BYTEPLUS,
  buildChatProxyHeaders,
  getDefaultChatModelForProvider,
  getDefaultGenerationModelForProvider,
  resolveBinaryDownloadProxyUrl,
  resolveChatUpstreamBaseForProxy,
  resolveBytePlusContentEndpointForRequest,
} from '@/lib/chatEndpoint'
import {
  generateRunMarkdownWithProvider,
} from '@/features/chat/byteplusRunGeneration'

export {
  testGenerateRunImageWithBytePlusDoesNotFallbackWhenModelExplicit,
  testGenerateRunImageWithBytePlusAcceptsBase64Payload,
  testGenerateRunImageWithBytePlusDownloadsUrlThroughAssetProxy,
  testGenerateRunImageWithBytePlusRetriesActivatedCuratedFallback,
  testGenerateRunImageWithBytePlusSkipsUnmatchedDisplayAliasFallback,
} from './byteplusRunImageGeneration.test'

export {
  testGenerateRunVideoWithBytePlusPollsTaskAndDownloadsBlob,
  testGenerateRunVideoWithBytePlusPrefersWidgetContentJsonOverride,
  testGenerateRunVideoWithBytePlusResolvesCanonicalVideoAliasToAvailableModelId,
  testResolveBytePlusVideoModelPreviewExposesResolvedCandidate,
  testResolveBytePlusVideoModelPreviewDoesNotFalseMatchDateSuffixVariant,
  testGenerateRunVideoWithBytePlusCreateFailureIncludesActionableFixDetail,
  testGenerateRunVideoWithBytePlusTaskFailureIncludesActionableFixDetail,
} from './byteplusRunVideoGeneration.test'

export function testBytePlusDefaultCatalogExposesSeedTextImageVideoModels() {
  if (getDefaultChatModelForProvider(CHAT_PROVIDER_BYTEPLUS) !== CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT) {
    throw new Error('expected BytePlus chat provider default model to resolve to the Seed text model')
  }
  if (getDefaultGenerationModelForProvider(CHAT_PROVIDER_BYTEPLUS, 'image') !== CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT) {
    throw new Error('expected BytePlus image generation default model to resolve to seedream-4-0-250828')
  }
  if (getDefaultGenerationModelForProvider(CHAT_PROVIDER_BYTEPLUS, 'video') !== CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT) {
    throw new Error('expected BytePlus video generation default model to resolve to ByteDance-Seedance-1.0-pro-fast')
  }
  if (
    resolveBytePlusContentEndpointForRequest({
      endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
      path: '/api/v3/images/generations',
    }) !== '/__chat_proxy/api/v3/images/generations'
  ) {
    throw new Error('expected BytePlus content endpoints to resolve through the shared proxy path')
  }
  if (resolveBinaryDownloadProxyUrl('https://example.com/generated.mp4') !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4') {
    throw new Error('expected binary asset downloads to resolve through the shared asset proxy path')
  }
}

export function testBytePlusProxyUpstreamRejectsOpenAiBase() {
  const openAiUpstream = resolveChatUpstreamBaseForProxy('https://api.openai.com/v1/chat/completions', CHAT_PROVIDER_BYTEPLUS)
  if (openAiUpstream !== null) {
    throw new Error(`expected BytePlus upstream resolver to reject OpenAI base, got ${String(openAiUpstream)}`)
  }
  const endpoint = resolveBytePlusContentEndpointForRequest({
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    path: '/api/v3/contents/generations/tasks',
  })
  if (endpoint !== '/__chat_proxy/api/v3/contents/generations/tasks') {
    throw new Error(`expected BytePlus content endpoints to fall back to BytePlus upstream base, got ${String(endpoint)}`)
  }
  const headers = buildChatProxyHeaders({
    provider: CHAT_PROVIDER_BYTEPLUS,
    apiKey: 'byteplus-key',
    endpointUrl: 'https://api.openai.com/v1/chat/completions',
    clientRequestId: 'kg-test-upstream',
  })
  if ('X-KG-Chat-Upstream' in headers) {
    throw new Error('expected BytePlus proxy headers to omit upstream override when endpointUrl points to OpenAI')
  }
}

export async function testGenerateRunMarkdownWithProviderUsesChatProxyResponse() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT }] }), {
          headers: { 'content-type': 'application/json' },
        })
      }
      const body = JSON.parse(String(init?.body || '{}')) as {
        model?: string
        messages?: Array<{ role?: unknown; content?: unknown }>
      }
      if (url !== '/__chat_proxy/api/v3/chat/completions') {
        throw new Error(`unexpected chat endpoint: ${url}`)
      }
      if (body.model !== CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT) {
        throw new Error(`expected text generation to use the Seed text model, got ${String(body.model)}`)
      }
      const systemInstruction = body.messages?.[0]
      if (systemInstruction?.role !== 'system' || !String(systemInstruction.content || '').includes('Infer response-language intent semantically') || !String(systemInstruction.content || '').includes('ask one concise clarification')) {
        throw new Error(`expected chat-completions generation to carry multilingual response instructions, got ${JSON.stringify(body.messages)}`)
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '# Final Output\n\nSpecific answer.' } }] }), {
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const text = await generateRunMarkdownWithProvider({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
        chatModel: '',
      },
      prompt: 'Generate markdown',
    })
    if (text !== '# Final Output\n\nSpecific answer.') {
      throw new Error(`unexpected generated markdown: ${String(text)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunMarkdownWithProviderStreamsChatCompletionText() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const body = JSON.parse(String(init?.body || '{}')) as { stream?: unknown }
      if (url !== '/__chat_proxy/api/v3/chat/completions') {
        throw new Error(`unexpected chat endpoint: ${url}`)
      }
      if (body.stream !== true) {
        throw new Error('expected run markdown generation to request streaming text output')
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"# Final"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" Output\\n\\nSpecific answer."}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const chunks: string[] = []
    const text = await generateRunMarkdownWithProvider({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
        chatModel: '',
      },
      prompt: 'Generate markdown',
      options: {
        onText: next => chunks.push(next),
      },
    })
    if (text !== '# Final Output\n\nSpecific answer.') {
      throw new Error(`unexpected streamed markdown: ${String(text)}`)
    }
    if (chunks.join(' | ') !== '# Final | # Final Output\n\nSpecific answer.') {
      throw new Error(`unexpected streamed text snapshots: ${chunks.join(' | ')}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunMarkdownWithProviderStreamsOpenAiResponsesText() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url !== '/__chat_proxy/v1/responses') {
        throw new Error(`unexpected openai responses endpoint: ${url}`)
      }
      const body = JSON.parse(String(init?.body || '{}')) as { stream?: unknown }
      if (body.stream !== true) {
        throw new Error('expected openai responses run markdown generation to request streaming text output')
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"# Final"}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":" Output\\n\\nSpecific answer."}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const chunks: string[] = []
    const text = await generateRunMarkdownWithProvider({
      config: {
        provider: 'openai',
        endpointUrl: 'https://api.openai.com/v1/responses',
        apiKey: '',
        chatModel: 'gpt-5-nano',
      },
      prompt: 'Generate markdown',
      options: {
        onText: next => chunks.push(next),
      },
    })
    if (text !== '# Final Output\n\nSpecific answer.') {
      throw new Error(`unexpected streamed responses markdown: ${String(text)}`)
    }
    if (chunks.join(' | ') !== '# Final | # Final Output\n\nSpecific answer.') {
      throw new Error(`unexpected streamed responses snapshots: ${chunks.join(' | ')}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
