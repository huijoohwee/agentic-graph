import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'
import { readStorageWorker } from '../src/__tests__/helpers/fake-agentic-graph-storage-worker-fetch.ts'
import { createFixture, syncMigrations } from '../src/__tests__/helpers/native-agentic-graph-storage-fixture.ts'
import { handleAgenticGraphStorageBrowserSessionRoute } from '../../cloudflare/workers/agentic-graph-storage/storageBrowserSession.ts'

const viteOrigin = new URL(process.env.AG_STORAGE_AUTH_BASE_URL).origin
let origin = viteOrigin, providerOrigin = ''
const proofPath = '/__storage_auth_browser_proof'
const root = resolve(process.cwd(), '..')
const observedPaths = [
  'cloudflare/workers/agentic-graph-storage/storageOAuthSignup.ts',
  'cloudflare/workers/agentic-graph-storage/storageOAuthFlow.ts',
  'cloudflare/workers/agentic-graph-storage/storageOAuthState.ts',
  'cloudflare/workers/agentic-graph-storage/storageOAuthPages.ts',
  'cloudflare/workers/agentic-graph-storage/storageBrowserSession.ts',
  'canvas/src/features/panels/views/preview-panel/ui/PreviewOverlay.tsx',
  'canvas/src/lib/storage/StorageAuthLightbox.tsx',
  'canvas/src/lib/storage/agentic-graph-storage-browser-session.ts',
  'canvas/src/lib/storage/agentic-graph-storage-workspace-selection.ts',
  'canvas/scripts/run_storage_auth_browser_smoke.mjs',
  'canvas/scripts/verify_storage_auth_browser_smoke.mjs',
]
const observe = () => ({
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  files: observedPaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') })),
})
const before = observe(), f = await createFixture([...syncMigrations, '0016_storage_browser_identity.sql', '0021_storage_oauth_budget.sql'], { origin })
const env = { ...f.env, AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE: 'oauth',
  AGENTIC_OS_STORAGE_OAUTH_ORIGINS: JSON.stringify([origin]),
  AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_ID: 'Iv1.fixtureclient', AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_SECRET: 'fixture-secret-only',
  AGENTIC_OS_STORAGE_GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', AGENTIC_OS_STORAGE_GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
}
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'browser-proof', alg: 'RS256', use: 'sig' }
let googleNonce = '', profileId = 123456, providerFailure = false, metadataFailure = false
const requests = [], failures = [], results = []
const oauthFetch = async input => {
  const url = String(input)
  if (providerFailure) return Response.json({ error: 'fixture outage' }, { status: 503 })
  if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'ghu_' + 'a'.repeat(40), token_type: 'bearer', scope: '' })
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
  if (url === 'https://oauth2.googleapis.com/token') {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const content = encode({ alg: 'RS256', kid: 'browser-proof' }) + '.' + encode({ iss: 'https://accounts.google.com', aud: env.AGENTIC_OS_STORAGE_GOOGLE_CLIENT_ID, sub: 'google-browser-owner', nonce: googleNonce, iat: now, exp: now + 300 })
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(content))
    return Response.json({ id_token: content + '.' + Buffer.from(signature).toString('base64url') })
  }
  assert.equal(url, 'https://api.github.com/user')
  return Response.json({ id: profileId })
}
// Only the provider exchange is simulated. Real Worker handlers, SQL, cookies and browser fetch run below.
const server = createServer(async (incoming, outgoing) => {
  try {
    const parts = []
    for await (const part of incoming) { parts.push(part); assert.ok(parts.reduce((size, chunk) => size + chunk.length, 0) < 256000) }
    const url = new URL(incoming.url, origin)
    const method = incoming.method
    const headers = new Headers()
    for (let index = 0; index < incoming.rawHeaders.length; index += 2) headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1])
    const init = { method, headers, ...(['GET', 'HEAD'].includes(method) ? {} : { body: Buffer.concat(parts) }) }
    if (url.pathname.startsWith('/api/storage/')) requests.push({ path: url.pathname, method })
    let response
    if (url.pathname === '/__oauth_provider') {
      const callback = new URL('/api/storage/auth/callback', origin)
      callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('code', 'fixture-code')
      response = new Response(null, { status: 303, headers: { location: callback.href } })
    } else if (url.pathname === proofPath) response = new Response(html, { headers: { 'content-type': 'text/html' } })
    else if (!url.pathname.startsWith('/api/storage/')) response = await fetch(viteOrigin + url.pathname + url.search, { redirect: 'error', signal: AbortSignal.timeout(5000) })
    else if (metadataFailure && url.searchParams.get('format') === 'json') response = new Response('Unavailable', { status: 503 })
    else if (url.pathname.startsWith('/api/storage/auth/')) response = await handleAgenticGraphStorageBrowserSessionRoute({
      request: new Request(url, init), db: f.d1, env, dependencies: { oauthFetch },
    })
    else response = await readStorageWorker().fetch(new Request(url, init), f.env)
    // Redirect the real authorize response to a local provider stub; never contact a real identity provider.
    if (response.status === 303 && ['https://github.com/login/oauth/authorize', 'https://accounts.google.com/o/oauth2/v2/auth'].some(prefix => response.headers.get('location')?.startsWith(prefix + '?'))) {
      const authorize = new URL(response.headers.get('location'))
      googleNonce = authorize.searchParams.get('nonce') || ''
      assert.equal(authorize.searchParams.get('redirect_uri'), origin + '/api/storage/auth/callback')
      response.headers.set('location', providerOrigin + '/__oauth_provider?state=' + encodeURIComponent(authorize.searchParams.get('state')))
    }
    // The provider stub has a separate loopback origin. Preserve the production policy's
    // configured-provider allowlist while mapping those origins to the owned stub.
    const policy = response.headers.get('content-security-policy')
    if (policy) response.headers.set('content-security-policy', policy.replaceAll('https://github.com', providerOrigin).replaceAll('https://accounts.google.com', providerOrigin))
    outgoing.statusCode = response.status
    for (const [name, value] of response.headers) if (!['set-cookie', 'content-length', 'content-encoding'].includes(name)) outgoing.setHeader(name, value)
    const cookies = response.headers.getSetCookie()
    if (cookies.length) outgoing.setHeader('set-cookie', cookies)
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) { failures.push(String(error)); outgoing.statusCode = 500; outgoing.end('Fixture error') }
})
await new Promise(accept => server.listen(0, '127.0.0.1', accept))
origin = 'http://127.0.0.1:' + server.address().port
providerOrigin = origin.replace('127.0.0.1', 'localhost')
env.AGENTIC_OS_STORAGE_OAUTH_ORIGINS = JSON.stringify([origin])
const executablePath = findLocalChromiumExecutable('', chromium.executablePath())
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })
const deadline = setTimeout(() => { void context.close(); server.closeAllConnections() }, 120_000)
const page = await context.newPage()
page.on('pageerror', error => failures.push(error.message))
const html = `<!doctype html><html><body><button id="open">Sync files</button><button id="behind">Background action</button>
<main><h1>Source Files</h1><p>Your local workspace stays open.</p></main><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/src/index.css');
const session = await import('/src/lib/storage/agentic-graph-storage-browser-session.ts');
document.getElementById('open').onclick = () => session.beginAgenticGraphStorageBrowserSignIn();
document.body.dataset.ready = '1';
</script></body></html>`
await context.route(url => url.origin !== origin && url.origin !== providerOrigin, async route => {
  failures.push('Unexpected external request: ' + new URL(route.request().url()).origin)
  await route.abort()
})
const open = async () => { await page.locator('#open').click(); await page.getByRole('dialog', { name: 'Airvio account' }).waitFor() }
const ready = async () => page.locator('body[data-ready="1"]').waitFor()
const screenshot = async name => {
  if (!process.env.AG_STORAGE_AUTH_SCREENSHOT_DIR) return
  mkdirSync(process.env.AG_STORAGE_AUTH_SCREENSHOT_DIR, { recursive: true })
  await page.screenshot({ path: resolve(process.env.AG_STORAGE_AUTH_SCREENSHOT_DIR, name + '.png') })
}
try {
  await page.goto(origin + proofPath); await ready()
  await open(); await page.getByRole('link', { name: 'Continue with GitHub', exact: true }).waitFor()
  assert.equal(await page.locator('dialog').evaluate(node => node.matches(':modal')), true)
  await page.getByRole('heading', { name: 'Sign in to Airvio' }).click()
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON')
  for (let count = 0; count < 12; count++) {
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true)
  }
  await screenshot('desktop-light')
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'open')
  await page.setViewportSize({ width: 320, height: 740 }); await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark')
  await open(); await page.getByRole('link', { name: 'Continue with GitHub', exact: true }).waitFor()
  const bounds = await page.locator('[data-kg-storage-auth-lightbox]').boundingBox()
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await screenshot('mobile-dark')
  await page.getByRole('button', { name: 'Continue locally', exact: true }).click()
  assert.equal(await page.evaluate(async () => (await import('/src/lib/workspace/workspaceStoreSyncSettings.ts')).readWorkspaceCloudSyncEnabledSetting()), false)
  results.push('native dialog focus trap, Escape restores focus, mobile dark layout, local continuation')
  await page.setViewportSize({ width: 1280, height: 900 }); await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => document.documentElement.dataset.theme = 'light')
  await open(); await page.getByRole('button', { name: 'New to Airvio? Create an account' }).click()
  await page.getByRole('heading', { name: 'Create your Airvio account' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Continue with GitHub' }).evaluate(button => button.closest('form').method), 'post')
  await screenshot('signup')
  await page.getByRole('button', { name: 'Continue with GitHub' }).click()
  await page.getByRole('heading', { name: 'Your cloud workspace' }).waitFor()
  const workspaceId = await page.getByLabel('Cloud workspace', { exact: true }).inputValue()
  assert.match(workspaceId, /^kgws:personal:/)
  assert.equal(await page.evaluate(() => document.cookie.includes('kg_storage_session')), false)
  const sessionCookie = (await context.cookies()).find(cookie => cookie.name.includes('session'))
  assert.ok(sessionCookie?.httpOnly)
  await page.getByRole('button', { name: 'Continue to workspace' }).click(); await ready()
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  assert.equal(new URL(page.url()).searchParams.has('kgAuth'), false)
  assert.equal(await page.evaluate(async () => (await import('/src/lib/storage/agentic-graph-storage-workspace-selection.ts')).readAgenticGraphStorageWorkspaceOverride()), workspaceId)
  results.push('explicit signup POST, provider return, HttpOnly cookie, authorized private workspace selection')
  const text = '# Browser private draft\nOffline bytes 中文'
  const syncResult = await page.evaluate(async ({ workspaceId, text }) => {
    const db = await (await import('/src/lib/storage/agentic-graph-storage-db.ts')).getAgenticGraphStorageDb()
    if (db.persistence.getState().mode !== 'indexeddb') throw new Error('Native IndexedDB required')
    const { hashAgenticGraphStorageContent: hash } = await import('/src/lib/storage/agentic-graph-storage-sync-contract.ts')
    const { queueAgenticGraphStorageMutation, syncAgenticGraphStorageNow } = await import('/src/lib/storage/agentic-graph-storage-client-sync.ts')
    const record = { id: 'browser-private-draft', workspaceId, canonicalPath: 'browser-draft.md', title: null, docType: null, lang: null,
      graphId: null, sourceKind: 'markdown', contentMd: text, contentHash: hash(text), parserVersion: 'browser-v1', revision: 1, deleted: false, updatedAtMs: Date.now() }
    await queueAgenticGraphStorageMutation({ dbState: db, workspaceId, deviceId: 'auth-browser', entity: 'document', op: 'upsert', record, baseRevision: null })
    return syncAgenticGraphStorageNow({ dbState: db, workspaceId, deviceId: 'auth-browser', maxRetryCount: 1 })
  }, { workspaceId, text })
  assert.equal(syncResult.transportStatus, 'synced'); assert.equal(syncResult.appliedCount, 1)
  assert.equal(f.sql.prepare('SELECT content_md FROM documents WHERE id=?').get('browser-private-draft').content_md, text)
  await page.reload(); await ready()
  const retained = await page.evaluate(async () => {
    const db = await (await import('/src/lib/storage/agentic-graph-storage-db.ts')).getAgenticGraphStorageDb()
    return (await db.collections.documents.findOne('browser-private-draft').exec())?.toJSON().contentMd
  })
  assert.equal(retained, text)
  const read = await page.evaluate(async workspaceId => {
    const response = await fetch('/api/storage/doc/' + encodeURIComponent(workspaceId) + '/browser-draft.md')
    return { status: response.status, text: await response.text() }
  }, workspaceId)
  assert.deepEqual(read, { status: 200, text })
  await open(); await page.getByText('Connect another sign-in method', { exact: true }).click()
  await page.getByRole('button', { name: 'Connect Google to this account', exact: true }).click()
  await page.getByRole('heading', { name: 'Your cloud workspace' }).waitFor()
  assert.equal(await page.getByLabel('Cloud workspace', { exact: true }).inputValue(), workspaceId)
  assert.equal(f.sql.prepare("SELECT count(*) n FROM auth_identities WHERE provider='google'").get().n, 1)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in to Airvio' }).waitFor()
  assert.equal(await page.evaluate(async () => (await fetch('/api/storage/auth/session')).status), 401)
  assert.equal(await page.evaluate(async () => (await import('/src/lib/storage/agentic-graph-storage-workspace-selection.ts')).readAgenticGraphStorageWorkspaceOverride()), '')
  await page.getByRole('button', { name: 'Continue locally', exact: true }).click()
  await open(); await page.getByRole('link', { name: 'Continue with Google', exact: true }).click()
  await page.getByRole('heading', { name: 'Your cloud workspace' }).waitFor()
  assert.equal(await page.getByLabel('Cloud workspace', { exact: true }).inputValue(), workspaceId)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in to Airvio' }).waitFor()
  await page.getByRole('button', { name: 'Continue locally', exact: true }).click()
  results.push('Google OpenID signature verification, explicit linking and sign-in preserve workspace ownership')
  results.push('real IndexedDB outbox to Worker SQL push/pull, reload/readback, logout denies access and clears selection')
  profileId = 123457
  await page.goto(origin + '/api/storage/auth/login?intent=signup&return_to=' + encodeURIComponent(proofPath + '?kgAuth=complete'))
  await page.getByRole('heading', { name: 'Create your Airvio account' }).waitFor()
  await page.getByRole('button', { name: 'Continue with GitHub', exact: true }).click()
  await page.getByRole('heading', { name: 'Your cloud workspace' }).waitFor()
  assert.notEqual(await page.getByLabel('Cloud workspace', { exact: true }).inputValue(), workspaceId)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in to Airvio' }).waitFor()
  await page.getByRole('button', { name: 'Continue locally', exact: true }).click()
  results.push('fallback signup form permits only the configured provider redirect across origins')
  providerFailure = true
  await open(); await page.getByRole('link', { name: 'Continue with GitHub', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign-in was not completed' }).waitFor()
  assert.ok(!await page.locator('body').innerText().then(text => text.includes('ghu_' + 'a'.repeat(40))))
  await page.getByRole('link', { name: 'Return to local workspace', exact: true }).click(); await ready()
  providerFailure = false; metadataFailure = true
  await open(); await page.getByRole('alert').waitFor()
  await page.getByRole('link', { name: 'Open sign-in page' }).waitFor()
  await page.getByRole('button', { name: 'Continue locally', exact: true }).click()
  results.push('provider failure has native recovery links; unavailable metadata retains local escape')
  assert.deepEqual(failures, [])
  assert.deepEqual(observe(), before, 'observed source changed during browser proof')
  const receipt = { schema: 'agentic-graph/storage-auth-browser-proof/v1', authority: false, provider: 'simulated',
    database: 'native SQLite with repository migrations', storage: 'native browser IndexedDB', source: before, results, requests: requests.length }
  if (process.env.AG_STORAGE_AUTH_RESULT_PATH) writeFileSync(process.env.AG_STORAGE_AUTH_RESULT_PATH, JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt))
} catch (error) {
  console.error(JSON.stringify({ path: new URL(page.url()).pathname, body: (await page.locator('body').innerText()).slice(0, 2000), failures, requests }))
  throw error
} finally {
  clearTimeout(deadline)
  await context.close(); await browser.close(); server.closeAllConnections()
  await new Promise(accept => server.close(accept)); await f.close()
}
