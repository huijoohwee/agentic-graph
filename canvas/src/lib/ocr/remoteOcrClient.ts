import { createHash } from 'node:crypto'

export type RemoteOcrInferRequest = {
  filename: string
  prompt: string
  imageBase64: string
}

export type RemoteOcrInferResponse = { ok: true; markdown: string } | { ok: false; error: string }

const OCR_CACHE = new Map<string, { atMs: number; res: RemoteOcrInferResponse }>()
const OCR_INFLIGHT = new Map<string, Promise<RemoteOcrInferResponse>>()

function readNumberEnv(key: string, fallback: number): number {
  const raw = String(process.env[key] || '').trim()
  const n = raw ? Number(raw) : NaN
  if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  return fallback
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function sha256TextHex(text: string): string {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex')
}

export async function inferImageToMarkdownViaRemoteOcr(args: {
  endpoint: string
  imageBytes: Buffer
  filename: string
  prompt?: string
  timeoutMs?: number
}): Promise<RemoteOcrInferResponse> {
  const endpoint = String(args.endpoint || '').trim()
  if (!endpoint) return { ok: false, error: 'Missing OCR endpoint' }

  type RemoteOcrInferJson = {
    ok?: unknown
    error?: unknown
    markdown?: unknown
  }

  const prompt = String(args.prompt || '').trim() || 'Convert the document image to markdown.'
  const timeoutMs = (() => {
    const n = args.timeoutMs
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 60_000
    return Math.max(2_000, Math.min(5 * 60_000, Math.floor(n)))
  })()

  const cacheMax = readNumberEnv('AGENTIC_OS_OCR_CACHE_MAX', 128)
  const ttlOkMs = readNumberEnv('AGENTIC_OS_OCR_CACHE_TTL_OK_MS', 30 * 60_000)
  const ttlErrMs = readNumberEnv('AGENTIC_OS_OCR_CACHE_TTL_ERR_MS', 15_000)
  const maxCachedMarkdownChars = readNumberEnv('AGENTIC_OS_OCR_CACHE_MAX_MARKDOWN_CHARS', 200_000)

  const key = `ocr:v1:${endpoint}:${sha256TextHex(prompt)}:${sha256Hex(args.imageBytes)}`
  const cached = OCR_CACHE.get(key)
  if (cached) {
    const ttl = cached.res.ok ? ttlOkMs : ttlErrMs
    if (ttl <= 0 || Date.now() - cached.atMs <= ttl) return cached.res
    OCR_CACHE.delete(key)
  }

  const inflight = OCR_INFLIGHT.get(key)
  if (inflight) return await inflight

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const p = (async (): Promise<RemoteOcrInferResponse> => {
      const req: RemoteOcrInferRequest = {
        filename: String(args.filename || '').trim() || 'image.png',
        prompt,
        imageBase64: args.imageBytes.toString('base64'),
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      })

      const json = (await res.json().catch(() => null)) as unknown
      if (!res.ok) {
        const obj: RemoteOcrInferJson | null = json && typeof json === 'object' ? (json as RemoteOcrInferJson) : null
        const msg = obj && 'error' in obj ? String(obj.error || '') : ''
        return { ok: false, error: msg || `OCR request failed (${res.status})` }
      }
      if (!json || typeof json !== 'object') return { ok: false, error: 'OCR response not JSON' }
      const obj: RemoteOcrInferJson = json as RemoteOcrInferJson
      if (obj.ok === false) return { ok: false, error: String(obj.error || 'OCR failed') }
      const md = typeof obj.markdown === 'string' ? obj.markdown : obj.markdown != null ? String(obj.markdown) : ''
      if (!md.trim()) return { ok: false, error: 'OCR returned empty markdown' }
      return { ok: true, markdown: md }
    })()

    OCR_INFLIGHT.set(key, p)
    const out = await p
    if (cacheMax > 0) {
      if (out.ok) {
        if (out.markdown.length <= maxCachedMarkdownChars) OCR_CACHE.set(key, { atMs: Date.now(), res: out })
      } else {
        OCR_CACHE.set(key, { atMs: Date.now(), res: out })
      }
      while (OCR_CACHE.size > cacheMax) {
        const oldest = OCR_CACHE.keys().next().value as string | undefined
        if (!oldest) break
        OCR_CACHE.delete(oldest)
      }
    }
    return out
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    return { ok: false, error: msg || 'OCR request failed' }
  } finally {
    OCR_INFLIGHT.delete(key)
    clearTimeout(t)
  }
}
