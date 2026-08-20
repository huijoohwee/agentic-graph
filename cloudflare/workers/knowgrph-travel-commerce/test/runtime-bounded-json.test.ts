import { createExecutionContext, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { readBoundedJson } from '../../../../src/runtime/bounded-json'

describe('bounded JSON runtime boundary', () => {
  it('cancels an oversized response stream before consuming all chunks', async () => {
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
    const response = new Response(body, { headers: { 'content-type': 'application/json' } })
    expect(response.headers.get('content-length')).toBeNull()

    await expect(readBoundedJson(response, 16 * 1_024)).resolves.toBeNull()
    expect(pulls).toBeLessThan(totalChunks)
  })

  it('accepts valid UTF-8 JSON at the exact byte limit and rejects invalid declarations', async () => {
    const body = JSON.stringify({ ok: true })
    await expect(readBoundedJson(Response.json({ ok: true }), new TextEncoder().encode(body).byteLength))
      .resolves.toEqual({ ok: true })
    let cancelled = false
    const malformedDeclarationBody = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode(body)) },
      cancel() { cancelled = true },
    })
    await expect(readBoundedJson(new Response(malformedDeclarationBody, {
      headers: { 'content-type': 'application/json', 'content-length': '-1' },
    }), 1_024)).resolves.toBeNull()
    expect(cancelled).toBe(true)
  })

  it('cancels an oversized request without Content-Length before reading the full body', async () => {
    let pulls = 0
    let emitted = 0
    const totalChunks = 256
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (emitted >= totalChunks) {
          controller.close()
          return
        }
        controller.enqueue(new Uint8Array(1_024).fill(123))
        emitted += 1
      },
    })
    const handler = (await import('../src/index')).default
    const response = await handler.fetch(new Request('https://travel.internal/v1/inference', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-travel-token',
        'content-type': 'application/json',
      },
      body,
    }), env as unknown as TravelCommerceEnv, createExecutionContext())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'rejected' })
    expect(pulls).toBeLessThan(totalChunks)
  })
})
