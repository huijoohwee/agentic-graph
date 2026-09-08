import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_PROVIDER_BYTEPLUS,
} from '@/lib/chatEndpoint'
import {
  generateRunImageWithBytePlus,
} from '@/features/chat/byteplusRunGeneration'

export async function testGenerateRunImageWithBytePlusDoesNotFallbackWhenModelExplicit() {
  const originalFetch = globalThis.fetch
  try {
    const calls: Array<{ url: string; body: string }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedream-5-0-260128' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      calls.push({ url, body: String(init?.body || '') })
      return new Response(JSON.stringify({
        message: 'Your account has not activated the model seedream-4-0-250828.',
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    let threw = false
    try {
      await generateRunImageWithBytePlus({
        config: {
          provider: CHAT_PROVIDER_BYTEPLUS,
          endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
          apiKey: 'byteplus-key',
          chatModel: '',
        },
        prompt: 'Generate image',
        options: {
          model: 'seedream-4-0-250828',
          responseFormat: 'url',
        },
      })
    } catch (e) {
      threw = true
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('Selected image model: seedream-4-0-250828')) {
        throw new Error(`expected error to preserve selected model, got ${msg}`)
      }
      if (msg.includes('Attempted resolved models:')) {
        throw new Error(`expected no fallback attempts for explicit model, got ${msg}`)
      }
    }
    if (!threw) throw new Error('expected image run to throw')
    if (calls.length !== 1) {
      throw new Error(`expected exactly one image request, got ${calls.length}`)
    }
    const parsed = JSON.parse(calls[0]?.body || '{}') as { model?: unknown; response_format?: unknown }
    if (parsed.model !== 'seedream-4-0-250828') {
      throw new Error(`expected request to use explicit model, got ${String(parsed.model)}`)
    }
    if (parsed.response_format !== 'url') {
      throw new Error(`expected request to pass response_format=url, got ${String(parsed.response_format)}`)
    }
    if ('output_format' in (parsed as Record<string, unknown>)) {
      throw new Error('expected output_format to be omitted for seedream-4-0-250828')
    }
    if ('optimize_prompt_options' in (parsed as Record<string, unknown>)) {
      throw new Error('expected default optimize_prompt_options to be omitted from request')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunImageWithBytePlusAcceptsBase64Payload() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedream-4-0-250828' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const body = JSON.parse(String(init?.body || '{}')) as {
        model?: string
        response_format?: string
        size?: string
        output_format?: string
        watermark?: boolean
        seed?: number
        guidance_scale?: number
        image?: string
      }
      if (url !== '/__chat_proxy/api/v3/images/generations') {
        throw new Error(`unexpected image endpoint: ${url}`)
      }
      if (
        body.model !== 'seedream-4-0-250828'
        || body.response_format !== 'b64_json'
        || body.size !== '4K'
        || ('output_format' in (body as Record<string, unknown>))
        || body.watermark !== true
        || body.seed !== 123
        || body.guidance_scale !== 6.5
        || body.image !== 'https://example.com/reference-image.png'
      ) {
        throw new Error(`unexpected image generation payload: ${JSON.stringify(body)}`)
      }
      return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const result = await generateRunImageWithBytePlus({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      prompt: 'Generate image',
      options: {
        size: '4K',
        outputFormat: 'png',
        watermark: true,
        seed: 123,
        guidanceScale: 6.5,
        referenceImageUrl: 'https://example.com/reference-image.png',
      },
    })
    if (!result || result.blob.type !== 'image/png' || result.blob.size === 0) {
      throw new Error('expected BytePlus image generation helper to decode a PNG blob from base64 payloads')
    }
    if (!String(result.renderUrl || '').startsWith('data:image/png;base64,')) {
      throw new Error('expected base64-backed image responses to expose a renderable data URL')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunImageWithBytePlusDownloadsUrlThroughAssetProxy() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedream-4-0-250828' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/images/generations') {
        return new Response(JSON.stringify({ data: [{ url: 'https://example.com/generated-image.png' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated-image.png') {
        if (String(init?.method || 'GET').toUpperCase() !== 'GET') {
          throw new Error('expected asset proxy download to use GET')
        }
        return new Response(new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' }), { status: 200 })
      }
      throw new Error(`unexpected image asset fetch request: ${url}`)
    }) as typeof fetch

    const result = await generateRunImageWithBytePlus({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      prompt: 'Generate image from URL payload',
    })
    if (!result || result.blob.type !== 'image/png' || result.blob.size === 0) {
      throw new Error('expected BytePlus image generation helper to download URL-based image payloads through the shared asset proxy')
    }
    if (result.renderUrl !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated-image.png') {
      throw new Error(`expected image render URL to use shared asset proxy, got ${String(result.renderUrl)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunImageWithBytePlusRetriesActivatedCuratedFallback() {
  const originalFetch = globalThis.fetch
  const attemptedModels: string[] = []
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({
            data: [
              { id: 'seedream-4-0-250828' },
              { id: 'seedream-4-5-251128' },
              { id: 'seedream-5-0-260128' },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url !== '/__chat_proxy/api/v3/images/generations') {
        throw new Error(`unexpected image endpoint: ${url}`)
      }
      const body = JSON.parse(String(init?.body || '{}')) as { model?: string; response_format?: string }
      attemptedModels.push(String(body.model || ''))
      if (body.model === 'seedream-4-0-250828') {
        return new Response(JSON.stringify({
          error: {
            message: 'Your account %!s(int64=3000548466) has not activated the model seedream-4-0-250828. Please activate the model service in the Ark Console.',
          },
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (body.model === 'seedream-4-5-251128') {
        return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fallback model attempt ${String(body.model)}`)
    }) as typeof fetch

    const result = await generateRunImageWithBytePlus({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      prompt: 'Generate image',
      options: {},
    })
    if (!result) {
      throw new Error('expected image generation to succeed after trying an activated curated fallback model')
    }
    if (result.model !== 'seedream-4-5-251128') {
      throw new Error(`expected image generation to return the activated fallback model id, got ${String(result.model)}`)
    }
    if (attemptedModels.join(' -> ') !== 'seedream-4-0-250828 -> seedream-4-5-251128') {
      throw new Error(`expected activation fallback attempts to retry the next curated model, got ${attemptedModels.join(' -> ')}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunImageWithBytePlusSkipsUnmatchedDisplayAliasFallback() {
  const originalFetch = globalThis.fetch
  const attemptedModels: string[] = []
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({
            data: [
              { id: 'seedream-4-0-250828' },
              { id: 'seedream-4-5-251128' },
            ],
          }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url !== '/__chat_proxy/api/v3/images/generations') {
        throw new Error(`unexpected image endpoint: ${url}`)
      }
      const body = JSON.parse(String(init?.body || '{}')) as { model?: string }
      attemptedModels.push(String(body.model || ''))
      if (body.model === 'seedream-4-0-250828' || body.model === 'seedream-4-5-251128') {
        return new Response(JSON.stringify({
          error: {
            message: `The model or endpoint ${String(body.model)} does not exist or you do not have access to it.`,
          },
        }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`runner should not send unresolved display alias fallback ${String(body.model)}`)
    }) as typeof fetch

    let errorText = ''
    try {
      await generateRunImageWithBytePlus({
        config: {
          provider: CHAT_PROVIDER_BYTEPLUS,
          endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
          apiKey: 'byteplus-key',
        },
        prompt: 'Generate image',
        options: {},
      })
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error || '')
    }

    if (!errorText.includes('Attempted resolved models: seedream-4-0-250828, seedream-4-5-251128')) {
      throw new Error(`expected failure to report only verified /models fallback attempts, got ${errorText}`)
    }
    if (errorText.includes('Dola-Seedream-5.0-lite')) {
      throw new Error(`expected unmatched display alias fallback to be skipped, got ${errorText}`)
    }
    if (attemptedModels.join(' -> ') !== 'seedream-4-0-250828 -> seedream-4-5-251128') {
      throw new Error(`expected only verified /models candidates to be attempted, got ${attemptedModels.join(' -> ')}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
