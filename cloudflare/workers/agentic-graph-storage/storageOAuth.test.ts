import assert from 'node:assert/strict'
import test from 'node:test'
import { createFixture, migrations, syncMigrations } from '../../../canvas/src/__tests__/helpers/native-agentic-graph-storage-fixture'
import { readAgenticGraphStorageBrowserSessionConfiguration, handleAgenticGraphStorageBrowserSessionRoute as route } from './storageBrowserSession'
import { readOAuthConfiguration, exchangeOAuthIdentity, OAuthFailure } from './storageOAuthProviders'
import { oauthRandom, openOAuthState, sealOAuthState, OAUTH_COOKIE, safeOAuthReturnTo } from './storageOAuthState'
import { admitOAuthRequest, OAUTH_DAILY_REQUESTS } from './storageOAuthQuota'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS, AGENTIC_OS_STORAGE_SYNC_API_VERSION, hashAgenticGraphStorageContent } from './contract'
import { resetAccessJwksCacheForTest } from '../agentic-graph-travel-operator-gateway/access-jwt'
import { registerOAuthPersonalWorkspace, OAUTH_SIGNUP_ACCOUNT_LIMIT } from './storageOAuthSignup'

const origin = 'https://storage.example.test', now = Date.now(), secret = 'test-secret-'.repeat(4)
const env = { DB: null, AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE: 'oauth', AGENTIC_OS_STORAGE_SIGNING_SECRET: secret,
  AGENTIC_OS_STORAGE_OAUTH_ORIGINS: JSON.stringify([origin, 'http://127.0.0.1:4188']),
  AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_ID: 'Iv1.testclient', AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_SECRET: 'test-client-secret',
  AGENTIC_OS_STORAGE_GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', AGENTIC_OS_STORAGE_GOOGLE_CLIENT_SECRET: 'test-google-secret' }
const fixture = () => createFixture([...syncMigrations, '0016_storage_browser_identity.sql', '0021_storage_oauth_budget.sql'], { origin })
const cookieOf = (r: Response) => r.headers.get('set-cookie')!.split(';')[0]
const profileFetch = (calls: string[], id = 8945812) => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input); calls.push(url)
  assert.equal(init?.redirect, 'error'); assert.ok(init?.signal)
  if (url === 'https://github.com/login/oauth/access_token') {
    const form = init!.body as URLSearchParams
    assert.equal(form.get('client_id'), env.AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_ID)
    assert.match(form.get('code_verifier')!, /^[\w-]{43}$/)
    return Response.json({ access_token: 'ghu_' + 'a'.repeat(40), token_type: 'bearer', scope: '' })
  }
  assert.equal(url, 'https://api.github.com/user')
  return Response.json({ id })
}) as typeof fetch
const invoke = (f: Awaited<ReturnType<typeof fixture>>, path: string, init: RequestInit = {}, calls: string[] = []) => route({
  request: new Request(origin + path, init), db: f.d1, env: { ...env, DB: f.d1 },
  dependencies: { now: () => new Date(now), oauthFetch: profileFetch(calls) },
})
const start = async (f: Awaited<ReturnType<typeof fixture>>, provider = 'github', extra = '') => {
  const response = await invoke(f, `/api/storage/auth/login?provider=${provider}&return_to=%2Feditor${extra}`)
  assert.equal(response.status, 303)
  const url = new URL(response.headers.get('location')!)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.ok(!url.searchParams.has('client_secret'))
  return { cookie: cookieOf(response), callback: `/api/storage/auth/callback?state=${url.searchParams.get('state')}&code=valid-code` }
}
const provision = (f: Awaited<ReturnType<typeof fixture>>, provider = 'github', subject = '8945812') => {
  const user = f.sql.prepare('SELECT id FROM users LIMIT 1').get()!.id
  f.sql.prepare('INSERT INTO auth_identities VALUES (?, ?, ?, ?, ?, ?, ?)').run('id:' + subject, user,
    provider, provider === 'github' ? 'https://github.com' : 'https://accounts.google.com', subject, new Date(now).toISOString(), new Date(now).toISOString())
}

test('OAuth configuration fails closed and rejects open redirects', () => {
  assert.equal(readAgenticGraphStorageBrowserSessionConfiguration(env).ok, true)
  for (const origins of ['[]', '["http://evil.test"]', '["https://good.test/path"]', '["https://good.test@evil.test"]']) {
    assert.equal(readOAuthConfiguration({ ...env, AGENTIC_OS_STORAGE_OAUTH_ORIGINS: origins }), null)
  }
  assert.equal(readOAuthConfiguration({ ...env, AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_SECRET: '' }), null)
  for (const path of ['//evil.test', '/\\evil.test', '/\nsecret', 'https://evil.test']) assert.equal(safeOAuthReturnTo(path), null)
})
test('sealed state rejects tampering, expiry and future timestamps', async () => {
  const state = { provider: 'github' as const, origin, returnTo: '/', clientId: 'client',
    state: oauthRandom(), verifier: oauthRandom(), nonce: oauthRandom(), issuedAt: now }
  const sealed = await sealOAuthState(state, secret)
  assert.deepEqual(await openOAuthState(sealed, secret, now), state)
  assert.equal(await openOAuthState(sealed + 'a', secret, now), null)
  assert.equal(await openOAuthState(sealed, secret, now + 300000), null)
  assert.equal(await openOAuthState(sealed, secret, now - 1), null)
})
test('public privacy page works without storage credentials and login does not ask for an access key', async () => {
  const request = (method: string) => route({ request: new Request(origin + AGENTIC_OS_STORAGE_ROUTE_PATHS.browserPrivacy, { method }), db: null, env })
  const page = await request('GET')
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-security-policy')!, /frame-ancestors 'none'/)
  assert.match(await page.text(), /Provider tokens are not saved/)
  assert.equal(await (await request('HEAD')).text(), '')
  assert.equal((await request('POST')).status, 405)
  const f = await fixture()
  try {
    const login = await invoke(f, AGENTIC_OS_STORAGE_ROUTE_PATHS.browserLogin)
    assert.equal(login.status, 200)
    assert.match(login.headers.get('content-security-policy')!, /form-action 'self' https:\/\/github.com https:\/\/accounts.google.com;/)
    assert.equal(login.headers.get('referrer-policy'), 'same-origin')
    const githubOnly = await route({ request: new Request(origin + AGENTIC_OS_STORAGE_ROUTE_PATHS.browserLogin), db: f.d1,
      env: { ...env, DB: f.d1, AGENTIC_OS_STORAGE_GOOGLE_CLIENT_ID: '', AGENTIC_OS_STORAGE_GOOGLE_CLIENT_SECRET: '' } })
    assert.doesNotMatch(githubOnly.headers.get('content-security-policy')!, /accounts.google.com|\*/)
    const body = await login.text()
    assert.match(body, /Continue with GitHub/); assert.match(body, /Continue with Google/)
    assert.match(body, /Privacy and storage/); assert.doesNotMatch(body, /access_key/)
  } finally { await f.close() }
})
test('OAuth mode preserves the bounded operator exchange used by protected release probes', async () => {
  const f = await fixture()
  try {
    const expiresAt = new Date(now + 60000).toISOString()
    f.sql.prepare('UPDATE auth_sessions SET expires_at=?').run(expiresAt)
    const request = { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_key: f.auth.sessionToken }) }
    const login = await invoke(f, '/api/storage/auth/login?return_to=%2Feditor', request)
    assert.equal(login.status, 303); assert.equal(login.headers.get('location'), '/editor')
    assert.match(login.headers.get('set-cookie')!, /Max-Age=60;/)
    assert.doesNotMatch(login.headers.get('set-cookie')!, /oauth/)
    const session = await invoke(f, '/api/storage/auth/session?workspace_id=' + encodeURIComponent(f.workspaceId),
      { headers: { cookie: cookieOf(login) } })
    assert.equal(session.status, 200)
    assert.equal((await session.json()).session.expiresAt, expiresAt)
    assert.equal((await invoke(f, '/api/storage/auth/login', { ...request, headers: { ...request.headers, origin: 'https://evil.test' } })).status, 403)
  } finally { await f.close() }
})
test('GitHub App callback issues existing storage cookie once; mapping and membership remain authoritative', async () => {
  const f = await fixture()
  try {
    provision(f)
    const attempt = await start(f), calls: string[] = []
    const result = await invoke(f, attempt.callback, { headers: { cookie: attempt.cookie } }, calls)
    assert.equal(result.status, 303); assert.equal(result.headers.get('location'), '/editor')
    assert.match(result.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/)
    assert.equal(calls.length, 2)
    const replay = await invoke(f, attempt.callback, { headers: { cookie: attempt.cookie } }, calls)
    assert.equal(replay.status, 401); assert.equal(calls.length, 2)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM users').get()!.n), 1)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM workspace_memberships').get()!.n), 1)
    const next = await start(f)
    f.sql.exec("UPDATE workspace_memberships SET status='revoked'")
    assert.equal((await invoke(f, next.callback, { headers: { cookie: next.cookie } })).status, 403)
  } finally { await f.close() }
})
test('unmapped identities, bad state and wrong browser cannot create sessions', async () => {
  const f = await fixture()
  try {
    const a = await start(f), calls: string[] = []
    assert.equal((await invoke(f, a.callback, {}, calls)).status, 401)
    assert.equal((await invoke(f, a.callback.replace('state=', 'state=wrong'), { headers: { cookie: a.cookie } }, calls)).status, 401)
    assert.equal((await invoke(f, a.callback, { headers: { cookie: `${a.cookie}; ${a.cookie}` } }, calls)).status, 401)
    assert.equal(calls.length, 0)
    assert.equal((await invoke(f, a.callback, { headers: { cookie: a.cookie } }, calls)).status, 403)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM auth_sessions').get()!.n), 1)
    assert.equal((await invoke(f, '/api/storage/auth/login?provider=github&return_origin=https://evil.test')).status, 400)
  } finally { await f.close() }
})
test('quota is atomic under concurrency, bounded in rows, and resets without allowing clock rollback', async () => {
  const f = await fixture()
  try {
    const req = new Request(origin, { headers: { 'cf-connecting-ip': '192.0.2.1' } })
    const admitted = await Promise.all(Array.from({ length: 40 }, () => admitOAuthRequest(f.d1, req, secret, now)))
    assert.equal(admitted.filter(Boolean).length, 20)
    f.sql.prepare("UPDATE storage_oauth_budget SET used=? WHERE bucket='global'").run(OAUTH_DAILY_REQUESTS - 1)
    const last = await Promise.all(Array.from({ length: 5 }, () => admitOAuthRequest(f.d1, req, secret, now + 60000)))
    assert.equal(last.filter(Boolean).length, 1)
    assert.equal(await admitOAuthRequest(f.d1, req, secret, now + 86400000), true)
    assert.equal(await admitOAuthRequest(f.d1, req, secret, now), false)
    assert.ok(Number(f.sql.prepare('SELECT count(*) AS n FROM storage_oauth_budget').get()!.n) <= 65)
  } finally { await f.close() }
})
test('provider failures and oversized responses do not retry or expose tokens', async () => {
  const config = readOAuthConfiguration(env)!
  const state = { provider: 'github' as const, origin, returnTo: '/', clientId: config.clients.github!.id,
    state: oauthRandom(), verifier: oauthRandom(), nonce: oauthRandom(), issuedAt: now }
  for (const response of [new Response('limited', { status: 429 }), Response.json({}, { headers: { 'x-ratelimit-remaining': '0' } }),
    new Response('x'.repeat(65537)), Response.json({ access_token: 'ghp_' + 'a'.repeat(40), token_type: 'bearer', scope: '' })]) {
    let calls = 0
    await assert.rejects(exchangeOAuthIdentity(state, 'code', config, (async () => { calls++; return response }) as typeof fetch, now))
    assert.equal(calls, 1)
  }
})
test('Google token rejection distinguishes owner configuration from fresh authorization without reflecting provider data', async () => {
  const config = readOAuthConfiguration(env)!
  const state = { provider: 'google' as const, origin, returnTo: '/', clientId: config.clients.google!.id,
    state: oauthRandom(), verifier: oauthRandom(), nonce: oauthRandom(), issuedAt: now }
  const sensitive = 'fixture-code-secret-token-description'
  for (const [error, expectedStatus, message] of [
    ['invalid_client', 503, /client ID or secret/], ['redirect_uri_mismatch', 503, /callback address/],
    ['unauthorized_client', 503, /not enabled/], ['deleted_client', 503, /not enabled/],
    ['invalid_grant', 401, /fresh authorization/], ['invalid_request', 502, /request format/],
    ['unsupported_grant_type', 502, /request format/], ['temporarily_unavailable', 503, /temporarily/],
    [sensitive, 401, /not accepted/],
  ] as const) {
    let calls = 0
    await assert.rejects(exchangeOAuthIdentity(state, sensitive, config, (async (input, init) => {
      calls++
      assert.equal(String(input), 'https://oauth2.googleapis.com/token')
      const form = new URLSearchParams(await new Request(String(input), init).text())
      assert.equal(form.get('grant_type'), 'authorization_code')
      assert.equal(form.get('redirect_uri'), origin + '/api/storage/auth/callback')
      assert.equal(form.get('code_verifier'), state.verifier)
      assert.equal(form.get('client_id'), config.clients.google!.id)
      assert.equal(form.get('client_secret'), config.clients.google!.secret)
      return Response.json({ error, error_description: sensitive, access_token: sensitive }, { status: 400 })
    }) as typeof fetch, now), failure => {
      assert.ok(failure instanceof OAuthFailure)
      assert.equal(failure.status, expectedStatus); assert.match(failure.message, message)
      assert.doesNotMatch(failure.message, new RegExp(sensitive)); return true
    })
    assert.equal(calls, 1)
  }
  let cancelled = false
  const large = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(65537)) }, cancel() { cancelled = true } }), { status: 400 })
  await assert.rejects(exchangeOAuthIdentity(state, 'code', config, (async () => large) as typeof fetch, now), /response too large/)
  assert.equal(cancelled, true)
})
test('Google callback renders a safe owner action, consumes its challenge once and creates no session on rejection', async () => {
  const f = await fixture()
  try {
    const a = await start(f, 'google', '&return_origin=http%3A%2F%2F127.0.0.1%3A4188')
    const before = Number(f.sql.prepare('SELECT count(*) AS n FROM auth_sessions').get()!.n)
    let calls = 0
    const oauthFetch = (async () => {
      calls++; return Response.json({ error: 'invalid_client', error_description: '<script>private-provider-data</script>' }, { status: 401 })
    }) as typeof fetch
    const callback = () => route({ request: new Request(origin + a.callback, { headers: { cookie: a.cookie } }),
      db: f.d1, env: { ...env, DB: f.d1 }, dependencies: { now: () => new Date(now), oauthFetch } })
    const result = await callback()
    assert.equal(result.status, 503)
    const page = await result.text()
    assert.match(page, /Google rejected the configured client ID or secret/)
    assert.match(page, /return_origin=http%3A%2F%2F127.0.0.1%3A4188/)
    assert.doesNotMatch(page, /private-provider-data|valid-code/)
    assert.match(result.headers.get('set-cookie')!, /Max-Age=0/)
    assert.equal((await callback()).status, 401)
    assert.equal(calls, 1)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM auth_sessions').get()!.n), before)
  } finally { await f.close() }
})
test('Google verifies the signature, audience, nonce and issuance time using fixed JWKS', async () => {
  resetAccessJwksCacheForTest()
  const config = readOAuthConfiguration(env)!, clientId = config.clients.google!.id
  const state = { provider: 'google' as const, origin, returnTo: '/', clientId,
    state: oauthRandom(), verifier: oauthRandom(), nonce: oauthRandom(), issuedAt: now }
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-google', alg: 'RS256', use: 'sig' }
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const signed = async (claims: Record<string, unknown>) => {
    const unsigned = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode(claims)}`
    return unsigned + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned))).toString('base64url')
  }
  const base = { iss: 'https://accounts.google.com', sub: '12345678', aud: clientId, nonce: state.nonce,
    iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 300 }
  for (const [claims, valid] of [[base, true], [{ ...base, nonce: 'wrong' }, false], [{ ...base, aud: 'wrong' }, false], [{ ...base, iat: base.iat - 100 }, false]] as const) {
    const token = await signed(claims)
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input) === 'https://oauth2.googleapis.com/token') return Response.json({ id_token: token })
      assert.equal(String(input), 'https://www.googleapis.com/oauth2/v3/certs')
      return Response.json({ keys: [jwk] })
    }) as typeof fetch
    if (valid) assert.equal(await exchangeOAuthIdentity(state, 'code', config, fetcher, now), '12345678')
    else await assert.rejects(exchangeOAuthIdentity(state, 'code', config, fetcher, now))
  }
})
test('account linking requires same-origin active session and refuses an identity owned by someone else', async () => {
  const f = await fixture()
  try {
    const path = '/api/storage/auth/login?provider=github&intent=link'
    assert.equal((await invoke(f, path)).status, 403)
    assert.equal((await invoke(f, path, { method: 'POST', headers: { cookie: f.auth.cookie, origin: 'https://evil.test' } })).status, 403)
    const response = await invoke(f, path, { method: 'POST', headers: { cookie: f.auth.cookie, origin } })
    assert.equal(response.status, 303)
    const state = new URL(response.headers.get('location')!).searchParams.get('state')
    const callback = `/api/storage/auth/callback?state=${state}&code=valid-code`
    const result = await invoke(f, callback, { headers: { cookie: cookieOf(response) } })
    assert.equal(result.status, 303)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM auth_identities').get()!.n), 1)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM auth_sessions').get()!.n), 1, 'linking does not issue another session')
    f.sql.exec("INSERT INTO users VALUES ('other', 'other@example.test', 'Other', 'active', '2026', '2026'); UPDATE auth_identities SET user_id='other'")
    const second = await invoke(f, path, { method: 'POST', headers: { cookie: f.auth.cookie, origin } })
    const secondState = new URL(second.headers.get('location')!).searchParams.get('state')
    const collision = await invoke(f, `/api/storage/auth/callback?state=${secondState}&code=valid-code`, { headers: { cookie: cookieOf(second) } })
    assert.equal(collision.status, 409)
    assert.equal(f.sql.prepare('SELECT user_id FROM auth_identities').get()!.user_id, 'other')
    const third = await invoke(f, path, { method: 'POST', headers: { cookie: f.auth.cookie, origin } })
    const thirdState = new URL(third.headers.get('location')!).searchParams.get('state')
    f.sql.exec("UPDATE auth_sessions SET revoked_at='2026'")
    assert.equal((await invoke(f, `/api/storage/auth/callback?state=${thirdState}&code=valid-code`, { headers: { cookie: cookieOf(third) } })).status, 403)
  } finally { await f.close() }
})


test('OAuth cookie completes private Markdown upload/readback and logout denies further writes', async () => {
  const f = await fixture()
  try {
    provision(f)
    const a = await start(f)
    const login = await invoke(f, a.callback, { headers: { cookie: a.cookie } })
    const cookie = cookieOf(login)
    const record = { id: 'oauth-roundtrip', workspaceId: f.workspaceId, canonicalPath: 'oauth-roundtrip.md',
      title: null, docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: '# OAuth roundtrip\n',
      contentHash: hashAgenticGraphStorageContent('# OAuth roundtrip\n'), parserVersion: 'fixture-v1',
      revision: 1, deleted: false, updatedAtMs: now }
    const request = { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId: f.workspaceId, deviceId: 'oauth:test',
        mutations: [{ mutationId: 'oauth:upload', workspaceId: f.workspaceId, entity: 'document', op: 'upsert',
          recordId: record.id, baseRevision: null, record }] }) }
    const pushed = await f.request(AGENTIC_OS_STORAGE_ROUTE_PATHS.push, request)
    assert.equal(pushed.status, 200, await pushed.clone().text())
    assert.equal((await pushed.json()).acknowledgements[0].status, 'applied')
    const read = await f.read('oauth-roundtrip', { cookie })
    assert.equal(read.status, 200)
    assert.equal(await read.text(), record.contentMd)
    assert.equal((await invoke(f, '/api/storage/auth/logout', { method: 'POST', headers: { cookie, origin } })).status, 204)
    assert.equal((await f.request(AGENTIC_OS_STORAGE_ROUTE_PATHS.push, request)).status, 401)
  } finally { await f.close() }
})

test('revocation during account linking is checked atomically before identity insertion', async () => {
  const f = await fixture()
  try {
    const response = await invoke(f, '/api/storage/auth/login?provider=github&intent=link',
      { method: 'POST', headers: { cookie: f.auth.cookie, origin } })
    const state = new URL(response.headers.get('location')!).searchParams.get('state')
    f.beforeRead(query => {
      if (query.startsWith('INSERT INTO auth_identities')) f.sql.exec("UPDATE auth_sessions SET revoked_at='2026'")
    })
    const result = await invoke(f, `/api/storage/auth/callback?state=${state}&code=valid-code`,
      { headers: { cookie: cookieOf(response) } })
    assert.equal(result.status, 403)
    assert.equal(Number(f.sql.prepare('SELECT count(*) AS n FROM auth_identities').get()!.n), 0)
  } finally { await f.close() }
})

test('login metadata exposes only configured same-origin actions; signup requires an explicit same-origin POST', async () => {
  const f = await fixture()
  try {
    const response = await invoke(f, '/api/storage/auth/login?format=json')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const metadata = await response.json()
    assert.equal(metadata.schema, 'agentic-graph/storage-login-options/v1')
    assert.deepEqual(metadata.providers.map((p: { id: string; method: string }) => [p.id, p.method]), [['github', 'GET'], ['google', 'GET']])
    assert.doesNotMatch(JSON.stringify(metadata), /test-client-secret|test-google-secret|test-secret|clientId|linkHref/)
    const signupMetadata = await (await invoke(f, '/api/storage/auth/login?format=json&intent=signup')).json()
    assert.ok(signupMetadata.providers.every((p: { method: string }) => p.method === 'POST'))
    const path = '/api/storage/auth/login?provider=github&intent=signup'
    assert.equal((await invoke(f, path)).status, 403)
    assert.equal((await invoke(f, path, { method: 'POST', headers: { origin: 'https://foreign.test' } })).status, 403)
    assert.equal((await invoke(f, path, { method: 'POST' })).status, 403)
    assert.equal(Number(f.sql.prepare('SELECT count(*) n FROM auth_identities').get()!.n), 0)
  } finally { await f.close() }
})

test('explicit signup completes private upload/readback while foreign workspace access and replay are denied', async () => {
  const f = await fixture()
  try {
    const begin = await invoke(f, '/api/storage/auth/login?provider=github&intent=signup&return_to=%2Feditor',
      { method: 'POST', headers: { origin } })
    assert.equal(begin.status, 303)
    const state = new URL(begin.headers.get('location')!).searchParams.get('state')
    const callback = '/api/storage/auth/callback?state=' + state + '&code=valid-code'
    const login = await invoke(f, callback, { headers: { cookie: cookieOf(begin) } })
    assert.equal(login.status, 303, await login.clone().text())
    assert.equal(login.headers.get('location'), '/editor')
    const cookie = cookieOf(login)
    const account = await (await invoke(f, '/api/storage/auth/session', { headers: { cookie } })).json()
    assert.equal(account.authenticated, true); assert.equal(account.workspaces.length, 1)
    const workspaceId = account.workspaces[0].id
    assert.match(workspaceId, /^kgws:personal:/)
    assert.notEqual(workspaceId, f.workspaceId)
    assert.equal(f.sql.prepare('SELECT visibility FROM workspaces WHERE id=?').get(workspaceId)!.visibility, 'private')
    assert.equal((await invoke(f, '/api/storage/auth/session?workspace_id=' + f.workspaceId, { headers: { cookie } })).status, 403)
    const content = '# Private signup draft\n'
    const record = { id: 'signup-document', workspaceId, canonicalPath: 'draft.md', title: null, docType: null,
      lang: null, graphId: null, sourceKind: 'markdown', contentMd: content, contentHash: hashAgenticGraphStorageContent(content),
      parserVersion: 'fixture-v1', revision: 1, deleted: false, updatedAtMs: now }
    const request = { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_SYNC_API_VERSION, workspaceId, deviceId: 'signup:test',
        mutations: [{ mutationId: 'signup:upload', workspaceId, entity: 'document', op: 'upsert',
          recordId: record.id, baseRevision: null, record }] }) }
    const pushed = await f.request(AGENTIC_OS_STORAGE_ROUTE_PATHS.push, request)
    assert.equal(pushed.status, 200, await pushed.clone().text())
    assert.equal((await pushed.json()).acknowledgements[0].status, 'applied')
    const read = await f.request('/api/storage/doc/' + encodeURIComponent(workspaceId) + '/draft.md', { headers: { cookie } })
    assert.equal(read.status, 200); assert.equal(await read.text(), content)
    assert.equal((await invoke(f, callback, { headers: { cookie: cookieOf(begin) } })).status, 401)
    assert.equal((await invoke(f, '/api/storage/auth/logout', { method: 'POST', headers: { cookie, origin } })).status, 204)
    assert.equal((await f.request(AGENTIC_OS_STORAGE_ROUTE_PATHS.push, request)).status, 401)
  } finally { await f.close() }
})

test('concurrent signup is idempotent and cannot revive a revoked user or membership', async () => {
  const f = await fixture()
  try {
    const register = () => registerOAuthPersonalWorkspace({ db: f.d1, provider: 'github', subject: 'new-user', now })
    const users = await Promise.all([register(), register()])
    assert.equal(users[0], users[1])
    assert.equal(Number(f.sql.prepare('SELECT count(*) n FROM users').get()!.n), 2)
    assert.equal(Number(f.sql.prepare('SELECT count(*) n FROM workspace_memberships').get()!.n), 2)
    f.sql.prepare("UPDATE workspace_memberships SET status='revoked' WHERE user_id=?").run(users[0])
    await register()
    assert.equal(f.sql.prepare('SELECT status FROM workspace_memberships WHERE user_id=?').get(users[0])!.status, 'revoked')
    f.sql.prepare("UPDATE users SET status='disabled' WHERE id=?").run(users[0])
    await assert.rejects(register, /account is unavailable/)
    assert.equal(f.sql.prepare('SELECT status FROM users WHERE id=?').get(users[0])!.status, 'disabled')
  } finally { await f.close() }
})

test('signup capacity never rolls over and failed D1 batches leave no partial account', async () => {
  const f = await fixture()
  try {
    f.sql.prepare("INSERT INTO storage_oauth_budget VALUES ('signup-total',0,?)").run(OAUTH_SIGNUP_ACCOUNT_LIMIT - 1)
    const outcomes = await Promise.allSettled(['one', 'two'].map(subject =>
      registerOAuthPersonalWorkspace({ db: f.d1, provider: 'github', subject, now })))
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1)
    await assert.rejects(registerOAuthPersonalWorkspace({ db: f.d1, provider: 'github', subject: 'later', now: now + 86400000 }), /capacity is full/)
    assert.equal(Number(f.sql.prepare("SELECT used FROM storage_oauth_budget WHERE bucket='signup-total'").get()!.used), OAUTH_SIGNUP_ACCOUNT_LIMIT)
    f.sql.prepare("DELETE FROM storage_oauth_budget WHERE bucket='signup-total'").run()
    const counts = () => ['users', 'workspaces', 'auth_identities', 'workspace_memberships'].map(table => f.sql.prepare('SELECT count(*) n FROM ' + table).get()!.n)
    const before = counts()
    f.sql.exec("CREATE TRIGGER fail_signup BEFORE INSERT ON workspaces BEGIN SELECT RAISE(ABORT, 'fixture batch failure'); END")
    await assert.rejects(registerOAuthPersonalWorkspace({ db: f.d1, provider: 'google', subject: 'batch-fails', now }), /fixture batch failure/)
    assert.deepEqual(counts(), before)
    assert.equal(Number(f.sql.prepare("SELECT used FROM storage_oauth_budget WHERE bucket='signup-total'").get()!.used), 1)
  } finally { await f.close() }
})
