import { withBoundedTestTimeouts } from './helpers/withBoundedTestTimeouts'
import {
  BYTEPLUS_VIDEO_POLL_BOUNDED_WINDOW_MS,
  BYTEPLUS_VIDEO_POLL_MAX_ATTEMPTS,
  generateRunVideoWithBytePlus,
} from '@/features/chat/byteplusRunGeneration'
import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_PROVIDER_BYTEPLUS,
} from '@/lib/chatEndpoint'

export async function testGenerateRunVideoWithBytePlusCompletesAfterExtendedPollingWindow() {
  if (BYTEPLUS_VIDEO_POLL_MAX_ATTEMPTS !== 60 || BYTEPLUS_VIDEO_POLL_BOUNDED_WINDOW_MS !== 590000) {
    throw new Error(`expected 60 attempts across a 590-second bounded polling window, got ${String(BYTEPLUS_VIDEO_POLL_MAX_ATTEMPTS)} attempts and ${String(BYTEPLUS_VIDEO_POLL_BOUNDED_WINDOW_MS)}ms`)
  }
  return withBoundedTestTimeouts(10000, async pollDelays => {
  const originalFetch = globalThis.fetch
  try {
    let statusCalls = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'seedance-1-5-pro-251215' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks' && String(init?.method || 'GET').toUpperCase() === 'POST') {
        return new Response(JSON.stringify({ id: 'task-extended-window' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_proxy/api/v3/contents/generations/tasks/task-extended-window') {
        statusCalls += 1
        return new Response(JSON.stringify(statusCalls < 30
            ? { status: 'running', updated_at: 1765510559 + statusCalls }
            : { status: 'succeeded', content: { video_url: 'https://example.com/extended-window.mp4' }, updated_at: 1765510600 }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fextended-window.mp4') {
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
      prompt: 'Generate longer video',
      options: { model: 'ByteDance-Seedance-1.5-pro' },
    })
    if (!result || result.renderUrl !== '/__chat_asset_proxy?url=https%3A%2F%2Fexample.com%2Fextended-window.mp4') {
      throw new Error('expected BytePlus video helper to keep polling long enough to complete a legitimate longer-running task')
    }
    if (statusCalls !== 30) {
      throw new Error(`expected extended polling window to reach the later succeeded response, got ${String(statusCalls)} status calls`)
    }
    if (pollDelays.length !== 29 || pollDelays.some(delayMs => delayMs !== 10000)) {
      throw new Error(`expected every pending retry to use the documented 10-second interval, got ${JSON.stringify(pollDelays)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
  })
}

export async function testBoundedTestTimeoutsRestoreAndCancel() {
  const nativeTimeout = globalThis.setTimeout
  let fired = 0, synchronous = true
  const sentinel = new Error('fixture failure')
  try {
    await withBoundedTestTimeouts(10000, async delays => {
      const unrelated = setTimeout(() => { fired += 100 }, 1000)
      clearTimeout(unrelated)
      const cancelled = setTimeout(() => { fired += 100 }, 10000)
      clearTimeout(cancelled)
      const first = new Promise<void>(resolve => setTimeout(() => { if (synchronous) fired += 100; fired++; resolve() }, 10000))
      synchronous = false
      await first
      for (let i = 0; i < 62; i++) setTimeout(() => { fired += 100 }, 10000)
      let bounded = false
      try { setTimeout(() => {}, 10000) } catch { bounded = true }
      if (!bounded || delays.length !== 64 || delays.some(delay => delay !== 10000)) throw new Error('Expected bounded native timeout requests')
      throw sentinel
    })
    throw new Error('Expected fixture failure to propagate')
  } catch (error) { if (error !== sentinel) throw error }
  if (globalThis.setTimeout !== nativeTimeout) throw new Error('Native timer was not restored after failure')
  await new Promise<void>(resolve => nativeTimeout(resolve, 0))
  if (fired !== 1) throw new Error('Test callbacks ran synchronously or escaped cancellation/teardown')
}
