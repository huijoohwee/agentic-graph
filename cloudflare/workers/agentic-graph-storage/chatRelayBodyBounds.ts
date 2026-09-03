export const AGENTIC_OS_CHAT_RELAY_MAX_REQUEST_BYTES = 1 * 1_024 * 1_024
export const AGENTIC_OS_CHAT_RELAY_MAX_RESPONSE_BYTES = 8 * 1_024 * 1_024

type BoundedTextResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; status: number; error: string; bytes: number }
export type BoundedJsonResult =
  | { ok: true; value: unknown; bytes: number }
  | { ok: false; status: number; error: string; bytes: number }

export const cancelChatRelayBody = async (
  body: ReadableStream<Uint8Array> | null,
  reason: string,
): Promise<void> => {
  try { await body?.cancel(reason) } catch { /* already locked */ }
}

const readBoundedUtf8Text = async (args: {
  body: ReadableStream<Uint8Array> | null
  headers: Headers
  maxBytes: number
  label: string
  invalidStatus: number
}): Promise<BoundedTextResult> => {
  const declaredText = args.headers.get('content-length')
  if (declaredText !== null) {
    if (!/^\d+$/.test(declaredText) || !Number.isSafeInteger(Number(declaredText))) {
      await cancelChatRelayBody(args.body, `${args.label} has invalid content-length`)
      return { ok: false, status: args.invalidStatus, error: `${args.label} has invalid content-length`, bytes: 0 }
    }
    if (Number(declaredText) > args.maxBytes) {
      await cancelChatRelayBody(args.body, `${args.label} exceeds the byte limit`)
      return { ok: false, status: args.invalidStatus, error: `${args.label} exceeds ${args.maxBytes} bytes`, bytes: 0 }
    }
  }
  if (!args.body) return { ok: true, text: '', bytes: 0 }
  const reader = args.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > args.maxBytes) {
        await reader.cancel(`${args.label} exceeds the byte limit`)
        return { ok: false, status: args.invalidStatus, error: `${args.label} exceeds ${args.maxBytes} bytes`, bytes }
      }
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
    return { ok: true, text, bytes }
  } catch {
    try { await reader.cancel(`${args.label} is unreadable`) } catch { /* already closed */ }
    return { ok: false, status: args.invalidStatus, error: `${args.label} must be valid UTF-8`, bytes }
  } finally {
    try { reader.releaseLock() } catch { /* already released */ }
  }
}

const isJsonMediaType = (headers: Headers): boolean => {
  const mediaType = String(headers.get('content-type') || '').split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

export const readBoundedChatRelayRequestJson = async (request: Request): Promise<BoundedJsonResult> => {
  if (!isJsonMediaType(request.headers)) {
    await cancelChatRelayBody(request.body, 'chat relay request requires JSON')
    return { ok: false, status: 400, error: 'chat relay request requires application/json', bytes: 0 }
  }
  const result = await readBoundedUtf8Text({
    body: request.body,
    headers: request.headers,
    maxBytes: AGENTIC_OS_CHAT_RELAY_MAX_REQUEST_BYTES,
    label: 'chat relay request',
    invalidStatus: 413,
  })
  if (result.ok === false) return result
  try {
    return { ok: true, value: JSON.parse(result.text) as unknown, bytes: result.bytes }
  } catch {
    return { ok: false, status: 400, error: 'chat relay request must contain valid JSON', bytes: result.bytes }
  }
}

export const readBoundedChatRelayResponseJson = async (response: Response): Promise<BoundedJsonResult> => {
  if (!isJsonMediaType(response.headers)) {
    await cancelChatRelayBody(response.body, 'chat relay proxy response requires JSON')
    return { ok: false, status: 502, error: 'chat relay proxy response must be application/json', bytes: 0 }
  }
  const result = await readBoundedUtf8Text({
    body: response.body,
    headers: response.headers,
    maxBytes: AGENTIC_OS_CHAT_RELAY_MAX_RESPONSE_BYTES,
    label: 'chat relay proxy response',
    invalidStatus: 502,
  })
  if (result.ok === false) return result
  try {
    return { ok: true, value: JSON.parse(result.text) as unknown, bytes: result.bytes }
  } catch {
    return { ok: false, status: 502, error: 'chat relay proxy response must contain valid JSON', bytes: result.bytes }
  }
}
