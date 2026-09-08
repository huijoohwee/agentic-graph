import {
  CHAT_DEERFLOW_ENDPOINT_URL,
  CHAT_PROVIDER_DEERFLOW,
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
import {
  generateRunImageWithDeerFlow,
  generateRunVideoWithDeerFlow,
} from '@/features/chat/deerflowRunGeneration'

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

export async function testGenerateRunImageWithDeerFlowStreamsArtifactFromThreadPath() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/__chat_proxy/api/runs/stream') {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"event":"run.started","thread_id":"thread-1"}\n\n'))
            controller.enqueue(new TextEncoder().encode('data: {"event":"run.artifact","thread_id":"thread-1","artifact_path":"scene.jpg","model":"seedream-4-0-250828"}\n\n'))
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          },
        })
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }
      if (url === '/__chat_proxy/api/threads/thread-1/artifacts/scene.jpg') {
        return new Response(Uint8Array.from([0, 1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const result = await generateRunImageWithDeerFlow({
      config: {
        provider: CHAT_PROVIDER_DEERFLOW,
        endpointUrl: CHAT_DEERFLOW_ENDPOINT_URL,
        apiKey: '',
      },
      prompt: 'Generate image',
      options: {
        model: 'seedream-4-0-250828',
      },
    })
    if (!result || result.blob.type !== 'image/jpeg' || result.blob.size === 0) {
      throw new Error('expected DeerFlow image helper to stream and resolve a thread artifact blob')
    }
    if (result.renderUrl !== '/__chat_proxy/api/threads/thread-1/artifacts/scene.jpg') {
      throw new Error(`expected DeerFlow image render URL to stay on proxied thread artifact path, got ${String(result.renderUrl)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunVideoWithDeerFlowDownloadsDirectArtifactUrlViaAssetProxy() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/__chat_proxy/api/runs/stream') {
        return new Response(JSON.stringify({
          artifact_url: 'https://example.com/deerflow/video.mp4',
          model: 'seedance-1-0-pro-fast-251015',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fdeerflow%2Fvideo.mp4') {
        return new Response(Uint8Array.from([0, 1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const result = await generateRunVideoWithDeerFlow({
      config: {
        provider: CHAT_PROVIDER_DEERFLOW,
        endpointUrl: CHAT_DEERFLOW_ENDPOINT_URL,
        apiKey: '',
      },
      prompt: 'Generate video',
      options: {
        model: 'seedance-1-0-pro-fast-251015',
      },
    })
    if (!result || result.blob.type !== 'video/mp4' || result.blob.size === 0) {
      throw new Error('expected DeerFlow video helper to fetch video artifacts through shared asset proxy')
    }
    if (result.renderUrl !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fdeerflow%2Fvideo.mp4') {
      throw new Error(`expected DeerFlow video render URL to use shared asset proxy, got ${String(result.renderUrl)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
