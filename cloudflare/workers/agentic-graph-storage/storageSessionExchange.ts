const MAX_FORM_BYTES = 4096
const HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export const storageSessionExchangeForm = (returnTo: string): Response => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to Agentic Graph</title><style>
body{font:1rem system-ui;background:#111827;color:#f3f4f6;margin:0;padding:1.5rem}
main{max-width:28rem;margin:10vh auto}h1{font-size:1.8rem}label{display:block;margin-top:2rem}
input,button{box-sizing:border-box;font:inherit;width:100%;padding:.85rem;margin-top:.7rem;border-radius:.5rem}
button{background:#d1fae5;color:#064e3b;border:0;font-weight:600;cursor:pointer}p{line-height:1.6}
</style></head><body><main><h1>Sign in to Agentic Graph</h1>
<p>Enter your workspace access key to continue.</p>
<form method="post" action="/api/storage/auth/login?return_to=${escapeHtml(encodeURIComponent(returnTo))}">
<label for="access-key">Access key</label><input id="access-key" name="access_key" type="password"
 autocomplete="current-password" autocapitalize="none" spellcheck="false" required maxlength="512">
<button type="submit">Sign in</button></form></main></body></html>`, {
  headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8' },
})

const rejected = (status: number, message: string) => ({ ok: false as const,
  response: new Response(message, { status, headers: { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' } }),
})

/** Only a bounded same-origin form can exchange an existing bearer credential. */
export const readStorageSessionExchangeCredential = async (request: Request): Promise<
  { ok: true; token: string } | ReturnType<typeof rejected>
> => {
  const reject = async (status: number, message: string) => {
    try { await request.body?.cancel() } catch { /* Already consumed or closed. */ }
    return rejected(status, message)
  }
  const url = new URL(request.url)
  if (request.method !== 'POST') return reject(405, 'Sign in requires POST.')
  if (url.protocol !== 'https:' || request.headers.get('origin') !== url.origin
    || request.headers.get('sec-fetch-site') === 'cross-site') return reject(403, 'Sign in requires the same origin.')
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    return reject(415, 'Sign in requires an encoded form.')
  }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    return reject(400, 'Invalid form length.')
  }
  if (declared !== null && Number(declared) > MAX_FORM_BYTES) return reject(413, 'Form is too large.')
  if (!request.body) return reject(400, 'Access key is required.')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_FORM_BYTES) {
        await reader.cancel()
        return rejected(413, 'Form is too large.')
      }
      chunks.push(value)
    }
  } catch { return rejected(400, 'Form could not be read.') }
  finally { reader.releaseLock() }
  if (declared !== null && Number(declared) !== length) return rejected(400, 'Form length differs.')
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    const token = form.get('access_key') || ''
    if ([...form.keys()].length !== 1 || !/^[A-Za-z0-9._~-]{32,512}$/.test(token)) {
      return rejected(400, 'A valid access key is required.')
    }
    return { ok: true, token }
  } catch { return rejected(400, 'Form could not be decoded.') }
}
