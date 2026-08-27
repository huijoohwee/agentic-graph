export const readBoundedJson = async (
  message: Request | Response,
  maxBytes: number,
): Promise<unknown | null> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be a positive integer')
  const contentType = message.headers.get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== 'application/json') {
    await cancelBody(message.body)
    return null
  }
  const contentLength = message.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared) || declared > maxBytes) {
      await cancelBody(message.body)
      return null
    }
  }
  if (!message.body) return null

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
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

const cancelBody = async (body: ReadableStream<Uint8Array> | null): Promise<void> => {
  if (!body) return
  try {
    await body.cancel()
  } catch {
    // The body may already be locked or cancelled by the runtime.
  }
}
