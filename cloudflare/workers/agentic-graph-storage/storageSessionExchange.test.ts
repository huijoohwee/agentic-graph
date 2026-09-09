import assert from 'node:assert/strict'
import test from 'node:test'
import { readStorageSessionExchangeCredential, storageSessionExchangeForm } from './storageSessionExchange'

const token = 'a'.repeat(64)
const request = (body = `access_key=${token}`, headers: Record<string, string> = {}) => new Request(
  'https://airvio.co/api/storage/auth/login', { method: 'POST', body,
    headers: { origin: 'https://airvio.co', 'content-type': 'application/x-www-form-urlencoded', ...headers } },
)

test('native login form keeps credentials out of URLs and refuses framing and caching', async () => {
  const response = storageSessionExchangeForm('/agentic-graph/?x="<script>')
  const html = await response.text()
  assert.match(html, /method="post"/)
  assert.match(html, /type="password"/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'none'/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
})

test('login rejects CSRF, malformed credentials, duplicate fields and oversized bodies', async () => {
  assert.deepEqual(await readStorageSessionExchangeCredential(request()), { ok: true, token })
  const cases: [Request, number][] = [
    [request(undefined, { origin: 'https://evil.example' }), 403],
    [request(undefined, { origin: '' }), 403],
    [request(undefined, { 'sec-fetch-site': 'cross-site' }), 403],
    [request(undefined, { 'content-type': 'application/json' }), 415],
    [request(undefined, { 'content-length': '4097' }), 413],
    [request(undefined, { 'content-length': '-1' }), 400],
    [request(undefined, { 'content-length': '12' }), 400],
    [request('access_key=' + 'a'.repeat(4096)), 413],
    [request('access_key=short'), 400],
    [request(`access_key=${token}&access_key=${token}`), 400],
    [request(`access_key=${token}&other=x`), 400],
    [request(`access_key=${token}%0A`), 400],
  ]
  for (const [input, status] of cases) {
    const result = await readStorageSessionExchangeCredential(input)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.response.status, status)
      assert.equal((await result.response.text()).includes(token), false)
    }
  }
})

test('login bounds an undeclared streaming body and cancels its source', async () => {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(2048)) },
    cancel() { cancelled = true },
  })
  const input = new Request('https://airvio.co/api/storage/auth/login', { method: 'POST',
    headers: { origin: 'https://airvio.co', 'content-type': 'application/x-www-form-urlencoded' },
    body, duplex: 'half',
  } as RequestInit)
  const result = await readStorageSessionExchangeCredential(input)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 413)
  assert.equal(cancelled, true)
})
