import { Container } from '@cloudflare/containers'

const MAX_BODY_BYTES = 65_536
const MAX_PROMPT_CHARACTERS = 24_000
const MAX_OUTPUT_TOKENS = 2_048
const CONTAINER_INFERENCE_TIMEOUT_MS = 25_000

export class OllamaContainer extends Container<OllamaOverflowEnv> {
  defaultPort = 11_434
  sleepAfter = '1m'
  enableInternet = false
  pingEndpoint = 'localhost/api/tags'
}

export default {
  async fetch(request: Request, env: OllamaOverflowEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/livez') return json({ ok: true })
    if (request.method === 'GET' && url.pathname === '/readyz') {
      return readiness(env)
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/inference') return json({ ok: false }, 404)
    if (!await authorized(request, env.INFERENCE_OVERFLOW_TOKEN)) return json({ ok: false }, 401)

    const body = await boundedJson(request)
    if (!body) return json({ ok: false, reason: 'request-malformed' }, 400)
    const modelId = typeof body.modelId === 'string' ? body.modelId : ''
    if (!readAllowedModels(env.ALLOWED_MODELS_JSON).includes(modelId)) {
      return json({ ok: false, reason: 'model-not-allowed' }, 422)
    }
    const ollamaRequest = readOllamaRequest(modelId, body.input)
    if (!ollamaRequest) return json({ ok: false, reason: 'input-malformed' }, 400)

    try {
      const container = env.OLLAMA_CONTAINER.getByName(modelId)
      const response = await container.fetch(new Request(`http://ollama.internal${ollamaRequest.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ollamaRequest.body),
        signal: AbortSignal.timeout(CONTAINER_INFERENCE_TIMEOUT_MS),
      }))
      if (!response.ok) return json({ ok: false, reason: `ollama-${response.status}` }, 502)
      const output = await boundedJson(response)
      if (!output) return json({ ok: false, reason: 'ollama-response-malformed' }, 502)
      return json(normalizeOutput(output))
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'ollama overflow request failed',
        reason: error instanceof Error ? error.name : 'unknown-error',
      }))
      return json({ ok: false, reason: 'container-unavailable' }, 503)
    }
  },
} satisfies ExportedHandler<OllamaOverflowEnv>

async function readiness(env: OllamaOverflowEnv): Promise<Response> {
  const models = readAllowedModels(env.ALLOWED_MODELS_JSON)
  const manifestDigests = readModelDigests(env.MODEL_MANIFEST_DIGESTS_JSON, models)
  const tokenConfigured = typeof env.INFERENCE_OVERFLOW_TOKEN === 'string'
    && env.INFERENCE_OVERFLOW_TOKEN.length >= 32
  if (!manifestDigests || models.length === 0 || !tokenConfigured || typeof env.OLLAMA_CONTAINER?.getByName !== 'function') {
    return json({ ok: false, configuredModels: models.length, dependency: 'container-unconfigured' }, 503)
  }
  try {
    const response = await env.OLLAMA_CONTAINER.getByName(models[0]).fetch(new Request(
      'http://localhost/api/tags',
      { signal: AbortSignal.timeout(10_000) },
    ))
    const value = response.ok ? await boundedJson(response) : null
    const installed = value && typeof value === 'object' && !Array.isArray(value)
      && Array.isArray((value as Record<string, unknown>).models)
      ? (value as { models: unknown[] }).models
      : []
    const ok = response.ok && models.every((model) => installed.some((entry) => (
      entry != null
      && typeof entry === 'object'
      && !Array.isArray(entry)
      && ((entry as Record<string, unknown>).model === model || (entry as Record<string, unknown>).name === model)
      && (entry as Record<string, unknown>).digest === manifestDigests[model]
    )))
    return json({
      ok,
      configuredModels: models.length,
      dependency: ok ? 'container-ready-pinned' : response.ok ? 'model-digest-mismatch' : `container-status-${response.status}`,
    }, ok ? 200 : 503)
  } catch {
    return json({ ok: false, configuredModels: models.length, dependency: 'container-unavailable' }, 503)
  }
}

function readOllamaRequest(
  model: string,
  input: unknown,
): Readonly<{ path: '/api/chat' | '/api/generate'; body: Record<string, unknown> }> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const options = readOptions(record)
  if (Array.isArray(record.messages)) {
    const messages = record.messages.map(readMessage)
    if (messages.some((message) => message == null)) return null
    const characters = messages.reduce((sum, message) => sum + message!.content.length, 0)
    if (messages.length === 0 || characters > MAX_PROMPT_CHARACTERS) return null
    return Object.freeze({ path: '/api/chat', body: { model, messages, options, stream: false } })
  }
  if (typeof record.prompt !== 'string' || record.prompt.length === 0
    || record.prompt.length > MAX_PROMPT_CHARACTERS) return null
  return Object.freeze({ path: '/api/generate', body: { model, prompt: record.prompt, options, stream: false } })
}

function readMessage(value: unknown): Readonly<{ role: string; content: string }> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return (record.role === 'system' || record.role === 'user' || record.role === 'assistant')
    && typeof record.content === 'string' && record.content.length > 0
    ? Object.freeze({ role: record.role, content: record.content })
    : null
}

function readOptions(input: Record<string, unknown>): Record<string, number> {
  const requestedTokens = input.max_tokens
  const numPredict = typeof requestedTokens === 'number' && Number.isSafeInteger(requestedTokens)
    ? Math.max(1, Math.min(requestedTokens, MAX_OUTPUT_TOKENS))
    : 512
  const requestedTemperature = input.temperature
  const temperature = typeof requestedTemperature === 'number' && Number.isFinite(requestedTemperature)
    ? Math.max(0, Math.min(requestedTemperature, 2))
    : 0.2
  return { num_predict: numPredict, temperature }
}

function normalizeOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { output: value }
  const output = value as Record<string, unknown>
  const promptTokens = tokenCount(output.prompt_eval_count)
  const completionTokens = tokenCount(output.eval_count)
  return {
    ...output,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  }
}

async function boundedJson(message: Request | Response): Promise<Record<string, unknown> | null> {
  if (!message.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    await cancelBody(message.body)
    return null
  }
  const text = await readBoundedText(message, MAX_BODY_BYTES)
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return
  try {
    await body.cancel()
  } catch {
    // The body may already be locked or cancelled by the runtime.
  }
}

async function readBoundedText(message: Request | Response, maxBytes: number): Promise<string | null> {
  const contentLength = message.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared) || declared > maxBytes) {
      await cancelBody(message.body)
      return null
    }
  }
  if (!message.body) return ''

  const reader = message.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    try {
      await reader.cancel()
    } catch {
      // Preserve the closed parse result if the stream also rejects cancellation.
    }
    return null
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function readAllowedModels(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.length > 0
      && parsed.every((model) => typeof model === 'string' && model.length > 0)
      ? Object.freeze([...new Set(parsed)])
      : Object.freeze([])
  } catch {
    return Object.freeze([])
  }
}

function readModelDigests(value: string, models: readonly string[]): Readonly<Record<string, string>> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const entries = Object.entries(parsed as Record<string, unknown>)
    if (entries.length !== models.length || entries.some(([model, digest]) => (
      !models.includes(model) || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)
    ))) return null
    return Object.freeze(Object.fromEntries(entries) as Record<string, string>)
  } catch {
    return null
  }
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ') || !secret) return false
  const [candidate, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization.slice(7))),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  ])
  return digestEqual(candidate, expected)
}

function digestEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const leftBytes = new Uint8Array(left)
  const rightBytes = new Uint8Array(right)
  if (leftBytes.length !== rightBytes.length) return false
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })
}
