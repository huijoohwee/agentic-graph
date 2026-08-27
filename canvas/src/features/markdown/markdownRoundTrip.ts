export const AG_MARKDOWN_SOURCE_ATTR = 'data-kg-markdown-source'

export function encodeUtf8ToBase64(text: string): string {
  const raw = String(text ?? '')
  const anyGlobal = globalThis as unknown as { Buffer?: { from: (input: string, enc: string) => { toString: (enc: string) => string } } }
  if (anyGlobal.Buffer && typeof anyGlobal.Buffer.from === 'function') {
    return anyGlobal.Buffer.from(raw, 'utf8').toString('base64')
  }
  const encoder = new TextEncoder()
  const bytes = encoder.encode(raw)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk))
    binary += String.fromCharCode(...Array.from(slice))
  }
  return btoa(binary)
}

export function decodeBase64ToUtf8(base64: string): string {
  const b64 = String(base64 ?? '').trim()
  if (!b64) return ''
  const anyGlobal = globalThis as unknown as {
    Buffer?: { from: (input: string, enc: string) => { toString: (enc: string) => string } }
  }
  if (anyGlobal.Buffer && typeof anyGlobal.Buffer.from === 'function') {
    return anyGlobal.Buffer.from(b64, 'base64').toString('utf8')
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const decoder = new TextDecoder()
  return decoder.decode(bytes)
}

