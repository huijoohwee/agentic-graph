import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const VIEW_RENDERERS = ['Dashboard', 'Multi-dimensional Table', 'Kanban', 'Calendar']

export async function verifyDataViewsDev({ origin, releaseSha, manifestDigest, readinessPath, outputPath }) {
  const base = normalizeOrigin(origin)
  if (!isAllowedDevOrigin(base)) throw new Error('UI verification origin must be the dedicated agentic-graph-dev Pages deployment')
  if (!SHA_PATTERN.test(releaseSha) || !DIGEST_PATTERN.test(manifestDigest)) throw new Error('UI verification candidate identity is invalid')
  const markerBody = await readSameOrigin(base, '/.well-known/runtime-readiness.json')
  const marker = JSON.parse(markerBody)
  assert.equal(marker.source?.revision, releaseSha)
  assert.equal(marker.immutableManifest?.digest, manifestDigest)
  const expectedMarker = await fs.readFile(readinessPath, 'utf8')
  assert.equal(markerBody, expectedMarker, 'live readiness marker must match the exact static artifact bytes')

  const root = await fetch(new URL('/', base), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  assert.equal(root.status, 200, 'Dev Pages root must return 200 without redirecting to another owner')
  assert.equal(new URL(root.url).origin, base)
  const csp = root.headers.get('content-security-policy') || ''
  assert.match(csp, /connect-src\s+'self'/i, 'Dev CSP must restrict data connections to the Dev origin')
  assert.match(csp, /form-action\s+'self'/i, 'Dev CSP must restrict form posts to the Dev origin')

  const browserEnv = { ...process.env }
  delete browserEnv.CLOUDFLARE_API_TOKEN
  delete browserEnv.CLOUDFLARE_ACCOUNT_ID
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], env: browserEnv })
  const externalRequests = new Set()
  const pageErrors = []
  const verifiedViews = []
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1351, height: 952 } })
    await context.route('**/*', async route => {
      const requestUrl = route.request().url()
      if (/^https?:/i.test(requestUrl) && new URL(requestUrl).origin !== base) {
        externalRequests.add(new URL(requestUrl).origin)
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    })
    const page = await context.newPage()
    page.on('request', request => {
      const requestUrl = request.url()
      if (/^https?:/i.test(requestUrl) && new URL(requestUrl).origin !== base) externalRequests.add(new URL(requestUrl).origin)
    })
    page.on('pageerror', error => pageErrors.push(String(error.message || error).slice(0, 240)))
    const response = await page.goto(base + '/?kgPath=%2Fagentic-graph%2F', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    assert.equal(response?.status(), 200, 'Dev UI route must return 200')
    assert.equal(new URL(page.url()).origin, base, 'Dev UI must remain on the isolated Pages origin')
    const renderer = page.locator('button[aria-label^=\"Canvas View Mode: 2D Renderer:\"]')
    await renderer.waitFor({ state: 'visible', timeout: 45_000 })

    await renderer.click()
    for (const view of VIEW_RENDERERS) {
      const choice = page.locator(`button[aria-label="2D Renderer: ${view}"]`)
      await choice.waitFor({ state: 'visible', timeout: 10_000 })
      verifiedViews.push(view)
    }

    assert.deepEqual([...externalRequests], [], 'Dev browser must not request production or other cross-origin services')
    assert.deepEqual(pageErrors, [], 'Dev UI must not raise uncaught browser errors')
    const receipt = {
      schema: 'agentic-graph-dev-ui-verification-receipt/v1',
      origin: base,
      sourceRevision: releaseSha,
      immutableManifestDigest: manifestDigest,
      readinessMarkerDigest: createHash('sha256').update(markerBody).digest('hex'),
      csp,
      views: verifiedViews,
      externalOriginsRequested: [...externalRequests],
      pageErrors,
      verifiedAt: new Date().toISOString(),
    }
    await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true })
    await fs.writeFile(outputPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
    return receipt
  } finally {
    await browser.close()
  }
}

async function readSameOrigin(origin, pathname) {
  const response = await fetch(new URL(pathname, origin), {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.text()
  assert.equal(response.status, 200, pathname + ' must return 200 from the isolated Dev origin')
  assert.equal(new URL(response.url).origin, origin)
  return body
}

function normalizeOrigin(value) {
  const parsed = new URL(String(value || ''))
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('Dev UI verification requires HTTPS or a loopback origin')
  }
  parsed.pathname = '/'
  parsed.search = ''
  parsed.hash = ''
  return parsed.origin
}

function isAllowedDevOrigin(origin) {
  const hostname = new URL(origin).hostname
  return hostname === 'agentic-graph-dev.pages.dev' || hostname.endsWith('.agentic-graph-dev.pages.dev')
    || ['localhost', '127.0.0.1'].includes(hostname)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = await verifyDataViewsDev({
    origin: process.env.DEV_DEPLOYMENT_URL,
    releaseSha: process.env.RELEASE_SHA,
    manifestDigest: process.env.IMMUTABLE_MANIFEST_DIGEST,
    readinessPath: process.env.DEV_READINESS_MARKER,
    outputPath: process.env.DEV_UI_RECEIPT,
  })
  console.log('Verified isolated Dev UI at ' + receipt.origin + ': ' + receipt.views.join(', '))
}
