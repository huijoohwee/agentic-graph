const MAX_BODY_BYTES = 65_536
const MAX_RESPONSE_BYTES = 262_144
const MAX_PROMPT_CHARACTERS = 24_000
const MAX_OUTPUT_TOKENS = 2_048
const INFERENCE_TIMEOUT_MS = 25_000

export default {
  async fetch(request: Request, env: WorkersAiOverflowEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/livez') return json({ ok: true })
    if (request.method === 'GET' && url.pathname === '/readyz') return readiness(env)
    if (request.method !== 'POST' || url.pathname !== '/v1/inference') return json({ ok: false }, 404)
    if (!await authorized(request, env.INFERENCE_OVERFLOW_TOKEN)) return json({ ok: false }, 401)

    const body = await boundedJson(request)
    if (!body) return json({ ok: false, reason: 'request-malformed' }, 400)
    const modelId = typeof body.modelId === 'string' ? body.modelId : ''
    if (!readAllowedModels(env.ALLOWED_MODELS_JSON).includes(modelId)) {
      return json({ ok: false, reason: 'model-not-allowed' }, 422)
    }
    const input = readWorkersAiInput(body.input)
    if (!input) return json({ ok: false, reason: 'input-malformed' }, 400)

    try {
      const output = await env.AI.run(modelId, input, { signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS) })
      return json(normalizeOutput(output))
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Workers AI overflow request failed',
        reason: error instanceof Error ? error.name : 'unknown-error',
      }))
      return json({ ok: false, reason: 'workers-ai-unavailable' }, 503)
    }
  },
} satisfies ExportedHandler<WorkersAiOverflowEnv>

function readiness(env: WorkersAiOverflowEnv): Response {
  const models = readAllowedModels(env.ALLOWED_MODELS_JSON)
  const tokenConfigured = typeof env.INFERENCE_OVERFLOW_TOKEN === 'string'
    && env.INFERENCE_OVERFLOW_TOKEN.length >= 32
  const configured = tokenConfigured && models.length > 0 && typeof env.AI?.run === 'function'
  return json({
    ok: configured,
    configuredModels: models.length,
    dependency: configured ? 'workers-ai-free-configured' : 'workers-ai-unconfigured',
    freeDailyNeuronLimit: 10_000,
  }, configured ? 200 : 503)
}

function readWorkersAiInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const options = readOptions(record)
  if (Array.isArray(record.messages)) {
    const messages = record.messages.map(readMessage)
    if (messages.some((message) => message === null)) return null
    const characters = messages.reduce((sum, message) => sum + message!.content.length, 0)
    if (messages.length === 0 || characters > MAX_PROMPT_CHARACTERS) return null
    return { messages, ...options, stream: false }
  }
  if (typeof record.prompt !== 'string' || record.prompt.length === 0 || record.prompt.length > MAX_PROMPT_CHARACTERS) {
    return null
  }
  return { prompt: record.prompt, ...options, stream: false }
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
  const maxTokens = typeof requestedTokens === 'number' && Number.isSafeInteger(requestedTokens)
    ? Math.max(1, Math.min(requestedTokens, MAX_OUTPUT_TOKENS))
    : 512
  const requestedTemperature = input.temperature
  const temperature = typeof requestedTemperature === 'number' && Number.isFinite(requestedTemperature)
    ? Math.max(0, Math.min(requestedTemperature, 2))
    : 0.2
  return { max_tokens: maxTokens, temperature }
}

function normalizeOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { output: value }
  const output = value as Record<string, unknown>
  const usage = readUsage(output)
  return usage ? {
    ...output,
    usage: {
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.promptTokens + usage.completionTokens,
    },
  } : { ...output }
}

function readUsage(output: Record<string, unknown>): Readonly<{ promptTokens: number; completionTokens: number }> | null {
  const usage = output.usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null
  const record = usage as Record<string, unknown>
  const promptTokens = record.prompt_tokens ?? record.input_tokens
  const completionTokens = record.completion_tokens ?? record.output_tokens
  return isTokenCount(promptTokens) && isTokenCount(completionTokens)
    ? Object.freeze({ promptTokens, completionTokens })
    : null
}

async function boundedJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    await cancelBody(request.body)
    return null
  }
  const text = await readBoundedText(request, MAX_BODY_BYTES)
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

async function readBoundedText(request: Request, maxBytes: number): Promise<string | null> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared) || declared > maxBytes) {
      await cancelBody(request.body)
      return null
    }
  }
  if (!request.body) return ''

  const reader = request.body.getReader()
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
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index]
  return difference === 0
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function json(value: unknown, status = 200): Response {
  let body: string
  try {
    body = JSON.stringify(value)
  } catch {
    body = JSON.stringify({ ok: false, reason: 'response-serialization-failed' })
    status = 502
  }
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    body = JSON.stringify({ ok: false, reason: 'response-too-large' })
    status = 502
  }
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    },
  })
}
