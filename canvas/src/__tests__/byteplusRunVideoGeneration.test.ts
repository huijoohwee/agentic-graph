import { withBoundedTestTimeouts } from './helpers/withBoundedTestTimeouts'
import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_PROVIDER_BYTEPLUS,
} from '@/lib/chatEndpoint'
import {
  generateRunVideoWithBytePlus,
  resolveBytePlusVideoModelPreview,
} from '@/features/chat/byteplusRunGeneration'

export async function testGenerateRunVideoWithBytePlusPollsTaskAndDownloadsBlob() {
  return withBoundedTestTimeouts(10000, async pollDelays => {
  const originalFetch = globalThis.fetch
  try {
    let statusCalls = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-5-pro-251215' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Freference.png') return new Response(new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' }), { status: 200 })
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks' && String(init?.method || 'GET').toUpperCase() === 'POST') {
        const body = JSON.parse(String(init?.body || '{}')) as {
          content?: Array<{ type?: string; image_url?: { url?: string } }>
          ratio?: string
          duration?: number
          generate_audio?: boolean
          draft?: boolean
        }
        if (body.ratio !== '9:16' || body.duration !== 6 || body.generate_audio !== true || body.draft !== true) {
          throw new Error(`expected video generation options to map onto the BytePlus task request: ${JSON.stringify(body)}`)
        }
        const imageRef = Array.isArray(body.content) ? body.content.find(item => item && item.type === 'image_url') : null
        if (imageRef?.image_url?.url !== 'data:image/png;base64,AQID') throw new Error('expected reference image to be materialized as a provider-readable Base64 data URL')
        return new Response(JSON.stringify({ id: 'task-123' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks/task-123') {
        statusCalls += 1
        return new Response(JSON.stringify(statusCalls < 2
              ? { status: 'running' }
              : { status: 'succeeded', content: { video_url: 'https://example.com/generated.mp4' } }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4') {
        return new Response(new Blob([Uint8Array.from([0, 1, 2, 3])], { type: 'video/mp4' }), { status: 200 })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const result = await generateRunVideoWithBytePlus({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      prompt: 'Generate video',
      options: {
        model: 'seedance-1-5-pro-251215',
        contentJson: JSON.stringify([{ type: 'text', text: 'Widget-local content override' }]),
        ratio: '9:16',
        duration: 6,
        generateAudio: true,
        referenceImageUrl: 'https://example.com/reference.png',
      },
    })
    if (statusCalls !== 2 || pollDelays.length !== 1 || pollDelays[0] !== 10000) throw new Error('Expected two status reads separated by the native 10-second retry request')
    if (!result || result.blob.type !== 'video/mp4' || result.blob.size === 0) {
      throw new Error('expected BytePlus video generation helper to poll the task and download the final MP4 blob')
    }
    if (result.renderUrl !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fgenerated.mp4') {
      throw new Error(`expected video render URL to use shared asset proxy, got ${String(result.renderUrl)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
  })
}

export async function testGenerateRunVideoWithBytePlusPrefersWidgetContentJsonOverride() {
  const originalFetch = globalThis.fetch
  try {
    let createRequestCount = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks' && String(init?.method || 'GET').toUpperCase() === 'POST') {
        createRequestCount += 1
        const body = JSON.parse(String(init?.body || '{}')) as {
          content?: Array<{ type?: string; text?: string }>
        }
        const firstContent = Array.isArray(body.content) ? body.content[0] : null
        if (firstContent?.text !== 'Widget-local content override') {
          throw new Error(`expected widget-local content_json override to win over generated/default content, got ${JSON.stringify(body.content)}`)
        }
        return new Response(JSON.stringify({ id: 'task-widget-content' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks/task-widget-content') {
        return new Response(JSON.stringify({ status: 'succeeded', data: { video_url: 'https://example.com/widget-content.mp4' } }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fwidget-content.mp4') {
        return new Response(new Blob([Uint8Array.from([0, 1, 2, 3])], { type: 'video/mp4' }), { status: 200 })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const result = await generateRunVideoWithBytePlus({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      prompt: 'Generated prompt fallback',
      options: {
        contentJson: JSON.stringify([{ type: 'text', text: 'Widget-local content override' }]),
      },
    })
    if (!result || result.blob.type !== 'video/mp4') {
      throw new Error('expected BytePlus video generation helper to complete when using widget-local content_json override')
    }
    if (createRequestCount !== 1) {
      throw new Error(`expected one task creation request, got ${String(createRequestCount)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunVideoWithBytePlusResolvesCanonicalVideoAliasToAvailableModelId() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-5-pro-250918' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks' && String(init?.method || 'GET').toUpperCase() === 'POST') {
        const body = JSON.parse(String(init?.body || '{}')) as { model?: string }
        if (body.model !== 'seedance-1-5-pro-250918') {
          throw new Error(`expected canonical ByteDance alias to resolve to available endpoint model id, got ${String(body.model)}`)
        }
        return new Response(JSON.stringify({ id: 'task-alias-resolve' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks/task-alias-resolve') {
        return new Response(JSON.stringify({ status: 'succeeded', data: { video_url: 'https://example.com/alias-resolve.mp4' } }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Falias-resolve.mp4') {
        return new Response(new Blob([Uint8Array.from([0, 1, 2, 3])], { type: 'video/mp4' }), { status: 200 })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const result = await generateRunVideoWithBytePlus({
      config: {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      prompt: 'Generate video',
      options: {
        model: 'ByteDance-Seedance-1.5-pro',
      },
    })
    if (!result || result.blob.type !== 'video/mp4') {
      throw new Error('expected BytePlus video generation helper to complete when canonical alias resolves to an available model id')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testResolveBytePlusVideoModelPreviewExposesResolvedCandidate() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-0-pro-fast-250601' }, { id: 'seedance-1-5-pro-250918' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const preview = await resolveBytePlusVideoModelPreview(
      {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      'ByteDance-Seedance-1.5-pro',
    )
    if (preview.preferredModel !== 'ByteDance-Seedance-1.5-pro') {
      throw new Error(`expected preview to preserve preferred canonical model label, got ${String(preview.preferredModel)}`)
    }
    if (preview.resolvedModel !== 'seedance-1-5-pro-250918') {
      throw new Error(`expected preview to expose resolved /models candidate, got ${String(preview.resolvedModel)}`)
    }
    if (preview.matchedAvailableModel !== true) {
      throw new Error('expected preview to report that the resolved model came from BytePlus /models')
    }
    if (preview.availableCount !== 2) {
      throw new Error(`expected preview to report available model count, got ${String(preview.availableCount)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testResolveBytePlusVideoModelPreviewDoesNotFalseMatchDateSuffixVariant() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-0-pro-fast-251015' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    const preview = await resolveBytePlusVideoModelPreview(
      {
        provider: CHAT_PROVIDER_BYTEPLUS,
        endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
        apiKey: 'byteplus-key',
      },
      'ByteDance-Seedance-1.5-pro',
    )
    if (preview.resolvedModel !== 'ByteDance-Seedance-1.5-pro') {
      throw new Error(`expected resolver to avoid false 1.5 -> 1.0-fast date-suffix match, got ${String(preview.resolvedModel)}`)
    }
    if (preview.matchedAvailableModel !== false) {
      throw new Error('expected resolver to report no accessible family match when only a wrong date-suffixed variant is returned')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunVideoWithBytePlusCreateFailureIncludesActionableFixDetail() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-5-pro-250918' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks') {
        return new Response(JSON.stringify({ error: { message: 'The model or endpoint seedance-1-5-pro-250918 does not exist or you do not have access to it.' } }), { status: 400, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    let errorText = ''
    try {
      await generateRunVideoWithBytePlus({
        config: {
          provider: CHAT_PROVIDER_BYTEPLUS,
          endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
          apiKey: 'byteplus-key',
        },
        prompt: 'Generate video',
        options: {
          model: 'ByteDance-Seedance-1.5-pro',
        },
      })
    } catch (error) {
      errorText =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : String(error || '')
    }
    if (!errorText.includes('BytePlus video run failed:')) {
      throw new Error(`expected actionable BytePlus failure prefix, got ${JSON.stringify(errorText)}`)
    }
    if (!errorText.includes('Selected video model: ByteDance-Seedance-1.5-pro')) {
      throw new Error(`expected selected video model detail in failure message, got ${JSON.stringify(errorText)}`)
    }
    if (!errorText.includes('Resolved /models candidate: seedance-1-5-pro-250918')) {
      throw new Error(`expected resolved candidate detail in failure message, got ${JSON.stringify(errorText)}`)
    }
    if (!errorText.includes('Fix:')) {
      throw new Error(`expected actionable fix guidance in failure message, got ${JSON.stringify(errorText)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGenerateRunVideoWithBytePlusTaskFailureIncludesActionableFixDetail() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-5-pro-250918' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks' && String(init?.method || 'GET').toUpperCase() === 'POST') {
        return new Response(JSON.stringify({ id: 'task-failed-detail' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks/task-failed-detail') {
        return new Response(JSON.stringify({
            status: 'failed',
            error: { message: 'Content moderation blocked this prompt.' },
          }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch request: ${url}`)
    }) as typeof fetch

    let errorText = ''
    try {
      await generateRunVideoWithBytePlus({
        config: {
          provider: CHAT_PROVIDER_BYTEPLUS,
          endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
          apiKey: 'byteplus-key',
        },
        prompt: 'Generate video',
        options: {
          model: 'ByteDance-Seedance-1.5-pro',
        },
      })
    } catch (error) {
      errorText =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : String(error || '')
    }
    if (!errorText.includes('Content moderation blocked this prompt.')) {
      throw new Error(`expected task failure reason to survive into the actionable log detail, got ${JSON.stringify(errorText)}`)
    }
    if (!errorText.includes('Selected video model: ByteDance-Seedance-1.5-pro')) {
      throw new Error(`expected selected model context in task failure detail, got ${JSON.stringify(errorText)}`)
    }
    if (!errorText.includes('Fix:')) {
      throw new Error(`expected actionable fix guidance for task failure detail, got ${JSON.stringify(errorText)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
