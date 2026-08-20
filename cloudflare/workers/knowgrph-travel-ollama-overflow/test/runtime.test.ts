import { describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

const MODEL = '@cf/openai/gpt-oss-20b'

describe('Workers AI Free overflow Worker', () => {
  it('fails readiness closed on missing configuration and never spends quota for readiness', async () => {
    const unavailable = envWith()
    unavailable.ALLOWED_MODELS_JSON = '[]'
    expect((await fetch('/readyz', unavailable)).status).toBe(503)

    const shortToken = envWith()
    shortToken.INFERENCE_OVERFLOW_TOKEN = 'too-short'
    expect((await fetch('/readyz', shortToken)).status).toBe(503)

    const aiRun = vi.fn(async () => ({ response: 'must-not-run' }))
    const response = await fetch('/readyz', envWith(aiRun))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      dependency: 'workers-ai-free-configured',
      freeDailyNeuronLimit: 10_000,
    })
    expect(aiRun).not.toHaveBeenCalled()
  })

  it('requires authentication and forwards bounded allowlisted inference to Workers AI', async () => {
    const aiRun = vi.fn(async (modelId: string, input: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
      expect(modelId).toBe(MODEL)
      expect(input).toEqual({ prompt: 'hello', max_tokens: 2_048, temperature: 0.2, stream: false })
      expect(options?.signal).toBeInstanceOf(AbortSignal)
      expect(options?.signal?.aborted).toBe(false)
      return { response: 'world', usage: { prompt_tokens: 2, completion_tokens: 3 } }
    })
    const environment = envWith(aiRun)
    expect((await fetch('/v1/inference', environment, { method: 'POST' })).status).toBe(401)

    const response = await fetch('/v1/inference', environment, {
      method: 'POST',
      headers: { authorization: `Bearer ${'t'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: MODEL, input: { prompt: 'hello', max_tokens: 99_999 } }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      response: 'world',
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    })
    expect(aiRun).toHaveBeenCalledOnce()
  })

  it('accepts structured messages and fails closed when Workers AI is unavailable', async () => {
    const aiRun = vi.fn(async () => { throw new Error('quota exhausted') })
    const response = await fetch('/v1/inference', envWith(aiRun), {
      method: 'POST',
      headers: { authorization: `Bearer ${'t'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: MODEL,
        input: { messages: [{ role: 'system', content: 'be concise' }, { role: 'user', content: 'hello' }] },
      }),
    })
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ ok: false, reason: 'workers-ai-unavailable' })
    expect(aiRun).toHaveBeenCalledOnce()
  })

  it('cancels an oversized request stream without relying on Content-Length', async () => {
    const aiRun = vi.fn(async () => ({ response: 'must-not-run' }))
    let pulls = 0
    let emitted = 0
    const totalChunks = 128
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (emitted >= totalChunks) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(1_024).fill(120))
        emitted += 1
      },
    })
    const request = new Request('https://overflow.test/v1/inference', {
      method: 'POST',
      headers: { authorization: `Bearer ${'t'.repeat(32)}`, 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect(request.headers.get('content-length')).toBeNull()

    const response = await worker.fetch(request, envWith(aiRun))
    expect(response.status).toBe(400)
    expect(aiRun).not.toHaveBeenCalled()
    expect(pulls).toBeLessThan(totalChunks)
  })

  it('fails closed rather than serializing an oversized Workers AI response', async () => {
    const response = await fetch('/v1/inference', envWith(async () => ({ response: 'x'.repeat(300_000) })), {
      method: 'POST',
      headers: { authorization: `Bearer ${'t'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: MODEL, input: { prompt: 'hello' } }),
    })
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ ok: false, reason: 'response-too-large' })
  })
})

function envWith(run: (modelId: string, input: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown> = async () => ({ response: 'ok' })): WorkersAiOverflowEnv {
  return {
    ALLOWED_MODELS_JSON: JSON.stringify([MODEL]),
    INFERENCE_OVERFLOW_TOKEN: 't'.repeat(32),
    AI: { run } as unknown as Ai,
  }
}

function fetch(path: string, env: WorkersAiOverflowEnv, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://overflow.test${path}`, init), env)
}
