import { describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

const MODEL = 'qwen3:0.6b'
const MODEL_DIGEST = '7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435'

describe('Ollama overflow Worker', () => {
  it('fails readiness closed when configuration or the container is unavailable', async () => {
    const missing = envWith(async () => Response.json({ models: [] }))
    missing.ALLOWED_MODELS_JSON = '[]'
    expect((await fetch('/readyz', missing)).status).toBe(503)

    const unavailable = envWith(async () => new Response(null, { status: 503 }))
    const response = await fetch('/readyz', unavailable)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ ok: false, dependency: 'container-status-503' })

    const shortToken = envWith(async () => Response.json({ models: [{ model: MODEL, digest: MODEL_DIGEST }] }))
    shortToken.INFERENCE_OVERFLOW_TOKEN = 'too-short'
    expect((await fetch('/readyz', shortToken)).status).toBe(503)

    const wrongDigest = envWith(async () => Response.json({ models: [{ model: MODEL, digest: '0'.repeat(64) }] }))
    await expect((await fetch('/readyz', wrongDigest)).json()).resolves.toMatchObject({
      ok: false,
      dependency: 'model-digest-mismatch',
    })
  })

  it('probes the configured container before reporting ready', async () => {
    const containerFetch = vi.fn(async (_request: Request) => Response.json({ models: [{ model: MODEL, digest: MODEL_DIGEST }] }))
    const response = await fetch('/readyz', envWith(containerFetch))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, dependency: 'container-ready-pinned' })
    expect(containerFetch).toHaveBeenCalledOnce()
    expect(new URL(containerFetch.mock.calls[0][0].url).pathname).toBe('/api/tags')
  })

  it('requires authentication and forwards only bounded allowlisted inference', async () => {
    const containerFetch = vi.fn(async (request: Request) => {
      expect(request.signal).toBeInstanceOf(AbortSignal)
      expect(request.signal.aborted).toBe(false)
      const input = await request.json() as Record<string, unknown>
      expect(new URL(request.url).pathname).toBe('/api/generate')
      expect(input).toMatchObject({ model: MODEL, prompt: 'hello', stream: false })
      return Response.json({ response: 'world', prompt_eval_count: 2, eval_count: 3 })
    })
    const environment = envWith(containerFetch)
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
    expect(containerFetch).toHaveBeenCalledOnce()
  })

  it('cancels an oversized request stream without relying on Content-Length', async () => {
    const containerFetch = vi.fn(async () => Response.json({ response: 'must-not-run' }))
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

    const response = await worker.fetch(request, envWith(containerFetch))
    expect(response.status).toBe(400)
    expect(containerFetch).not.toHaveBeenCalled()
    expect(pulls).toBeLessThan(totalChunks)
  })

  it('cancels an oversized container response before proxying it', async () => {
    let pulls = 0
    let emitted = 0
    const totalChunks = 128
    const containerFetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (emitted >= totalChunks) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(1_024).fill(120))
        emitted += 1
      },
    }), { headers: { 'content-type': 'application/json' } }))
    const environment = envWith(containerFetch)
    const response = await fetch('/v1/inference', environment, {
      method: 'POST',
      headers: { authorization: `Bearer ${'t'.repeat(32)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: MODEL, input: { prompt: 'hello' } }),
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ reason: 'ollama-response-malformed' })
    expect(pulls).toBeLessThan(totalChunks)
  })
})

function envWith(containerFetch: (request: Request) => Promise<Response>): OllamaOverflowEnv {
  return {
    ALLOWED_MODELS_JSON: JSON.stringify([MODEL]),
    MODEL_MANIFEST_DIGESTS_JSON: JSON.stringify({ [MODEL]: MODEL_DIGEST }),
    INFERENCE_OVERFLOW_TOKEN: 't'.repeat(32),
    OLLAMA_CONTAINER: {
      getByName: () => ({ fetch: containerFetch }),
    } as unknown as OllamaOverflowEnv['OLLAMA_CONTAINER'],
  }
}

function fetch(path: string, env: OllamaOverflowEnv, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://overflow.test${path}`, init), env)
}
