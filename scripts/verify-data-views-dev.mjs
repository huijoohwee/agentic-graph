import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const APPLICATION_PATH = '/agentic-graph/'
const FIXTURE_TITLE = 'Agentic Base view smoke'
const BASE_LAYOUTS = [
  { id: 'Table', label: 'Table View' },
  { id: 'Multi-dimensional Table', label: 'Multi-dimensional Table' },
  { id: 'Kanban', label: 'Kanban View' },
  { id: 'Calendar', label: 'Calendar View' },
]

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

  const application = await fetch(new URL(APPLICATION_PATH, base), { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  assert.equal(application.status, 200, 'Dev application route must return 200 without redirecting to another owner')
  assert.equal(new URL(application.url).origin, base)
  const csp = application.headers.get('content-security-policy') || ''
  assert.match(csp, /connect-src\s+'self'/i, 'Dev CSP must restrict data connections to the Dev origin')
  assert.match(csp, /form-action\s+'self'/i, 'Dev CSP must restrict form posts to the Dev origin')

  const fixturePath = path.join(os.tmpdir(), 'agentic-graph-base-view-' + randomUUID() + '.md')
  await fs.writeFile(fixturePath, buildViewFixture(), { flag: 'wx', mode: 0o600 })
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
    const response = await page.goto(new URL(APPLICATION_PATH, base).href, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    assert.equal(response?.status(), 200, 'Dev UI route must return 200')
    assert.equal(new URL(page.url()).origin, base, 'Dev UI must remain on the isolated Pages origin')

    await ensureTwoDimensionalSurface(page)
    await selectRenderer(page, 'Multi-dimensional Table')
    await importViewFixture(page, fixturePath)
    await selectRenderer(page, 'Multi-dimensional Table')
    await page.locator('section[aria-label="Workspace data view"]').waitFor({ state: 'visible', timeout: 20_000 })
    const importedTable = page.locator('section[aria-label="Workspace data view"] table[aria-label="Table view"]')
    await importedTable.waitFor({ state: 'visible', timeout: 20_000 })
    // Browser storage is scoped by the mounted app path; the rendered, semantic table rows are the import contract.
    await importedTable.getByText('Alpha', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })
    await importedTable.getByText('Beta', { exact: true }).waitFor({ state: 'visible', timeout: 20_000 })

    const workspace = page.locator('section[aria-label="Workspace data view"]')
    const settingsToggle = workspace.locator('button[aria-label="View settings"]')
    await settingsToggle.waitFor({ state: 'visible', timeout: 15_000 })
    const settings = page.locator('[aria-label="View settings panel"]')
    if (!(await settings.isVisible())) {
      await settingsToggle.focus()
      await settingsToggle.press('Enter')
    }
    await settings.waitFor({ state: 'visible', timeout: 10_000 })
    const layoutSection = settings.getByRole('button', { name: /Layout/ }).first()
    if (await layoutSection.getAttribute('aria-expanded') === 'false') await layoutSection.click()

    for (const layout of BASE_LAYOUTS) {
      if (await layoutSection.getAttribute('aria-expanded') === 'false') await layoutSection.click()
      const option = settings.locator('button').filter({ hasText: layout.label }).first()
      await option.waitFor({ state: 'visible', timeout: 10_000 })
      await option.click()
      await verifyBaseLayout(page, layout.id)
      verifiedViews.push(layout.id)
    }

    if (await settings.isVisible()) {
      await settingsToggle.focus()
      await settingsToggle.press('Enter')
    }
    await selectRenderer(page, 'Dashboard')
    const dashboardCards = page.locator('.agentic-base-dashboard-card[aria-label^="Dashboard"]')
    await dashboardCards.first().waitFor({ state: 'visible', timeout: 20_000 })
    assert.ok(await dashboardCards.count() > 0, 'Dashboard must render Base-owned dashboard cards')
    verifiedViews.push('Dashboard')

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
      fixture: { title: FIXTURE_TITLE, importedFromLocalFile: true, removedAfterRun: true },
      externalOriginsRequested: [...externalRequests],
      pageErrors,
      verifiedAt: new Date().toISOString(),
    }
    await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true })
    await fs.writeFile(outputPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
    await context.close()
    return receipt
  } finally {
    await browser.close()
    await fs.rm(fixturePath, { force: true })
  }
}

async function ensureTwoDimensionalSurface(page) {
  const mode = page.locator('button[aria-label^="Canvas View Mode:"]')
  await mode.waitFor({ state: 'visible', timeout: 45_000 })
  const label = await mode.getAttribute('aria-label') || ''
  if (label.includes('2D Renderer:')) return
  await mode.click()
  await page.getByRole('button', { name: 'Surface Mode', exact: true }).click()
  await page.getByRole('button', { name: '2D Mode', exact: true }).click()
  await page.locator('button[aria-label^="Canvas View Mode: 2D Renderer:"]').waitFor({ state: 'visible', timeout: 15_000 })
}

async function importViewFixture(page, fixturePath) {
  const input = page.locator('input[type="file"][accept*=".md"]').first()
  await input.waitFor({ state: 'attached', timeout: 45_000 })
  await input.setInputFiles(fixturePath)
}

async function selectRenderer(page, view) {
  const mode = page.locator('button[aria-label^="Canvas View Mode:"]')
  const label = await mode.getAttribute('aria-label') || ''
  if (label.endsWith('2D Renderer: ' + view)) return
  await mode.click()
  await page.getByRole('button', { name: '2D Renderer: ' + view, exact: true }).click()
  await page.locator('button[aria-label="Canvas View Mode: 2D Renderer: ' + view + '"]').waitFor({ state: 'visible', timeout: 15_000 })
}

async function verifyBaseLayout(page, layout) {
  const workspace = page.locator('section[aria-label="Workspace data view"]')
  if (layout === 'Table' || layout === 'Multi-dimensional Table') {
    const table = workspace.locator('table[aria-label="Table view"]')
    await table.waitFor({ state: 'visible', timeout: 15_000 })
    await table.getByText('Alpha', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    await table.getByText('Beta', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    return
  }
  if (layout === 'Kanban') {
    const groups = workspace.locator('[aria-label="Kanban groups"]')
    await groups.waitFor({ state: 'visible', timeout: 15_000 })
    assert.ok(await groups.locator('[aria-label="Group: Todo"]').count() > 0, 'Kanban must render the Todo group')
    assert.ok(await groups.locator('[aria-label="Group: Done"]').count() > 0, 'Kanban must render the Done group')
    assert.ok(await groups.locator('[aria-label="Card: Alpha"]').count() > 0, 'Kanban must render the Alpha card')
    return
  }
  const calendar = workspace.locator('[aria-label="Calendar view"]')
  await calendar.waitFor({ state: 'visible', timeout: 15_000 })
  const grid = calendar.locator('table[aria-label^="Calendar "]')
  await grid.waitFor({ state: 'visible', timeout: 10_000 })
  assert.ok(await grid.locator('button[data-calendar-date]').count() >= 28, 'Calendar must render its month grid')
}

function buildViewFixture() {
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86_400_000)
  const date = value => value.toISOString().slice(0, 10)
  return [
    '---',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "multiDimTable"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    'kgMultiDimTableModeEnabled: true',
    '---',
    '',
    '# ' + FIXTURE_TITLE,
    '',
    '| Name | Status | Date |',
    '| --- | --- | --- |',
    '| Alpha | Todo | ' + date(today) + ' |',
    '| Beta | Done | ' + date(tomorrow) + ' |',
    '',
  ].join('\n')
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
