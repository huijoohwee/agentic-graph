import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'
import { chromium } from 'playwright'
import { tsImport } from 'tsx/esm/api'
import { dismissVisibleFloatingPanel } from './lib/panel-close-helpers.mjs'

const canvas = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(canvas, '..')
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const { resolveViteRuntimeIdentity } = await tsImport('../viteChatProxyEnv.ts', import.meta.url)
const { sourceRevision } = resolveViteRuntimeIdentity(root)
const dev = process.argv.includes('--dev')
const output = resolve(process.env.BLOCK_EDITOR_PROOF_DIR || join(tmpdir(), `block-editor-browser-${revision.slice(0, 12)}`))
if (process.argv.includes('--build')) execFileSync('npm', ['run', 'pages:build'], { cwd: root, stdio: 'inherit', timeout: 240000 })
let server, browser, page
try {
  await mkdir(output, { recursive: true })
  if (!dev) server = await preview({ root: canvas, configFile: join(canvas, 'vite.config.ts'), configLoader: 'runner', base: '/agentic-graph/', preview: { host: '127.0.0.1', port: 4199, strictPort: true } })
  const origin = dev ? 'http://127.0.0.1:5175' : 'http://127.0.0.1:4199'
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const errors = [], remote = []
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) return route.continue()
    remote.push(url.origin + url.pathname)
    return route.abort()
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + (dev ? '/' : '/agentic-graph/') + '?openEditorWorkspace=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('navigation', { name: 'Source files', exact: true }).waitFor({ timeout: 60000 })
  const source = 'score = 2\nprint(score)\n'
  await page.locator('input[type="file"][accept*=".py"]').setInputFiles({ name: 'block-check.py', mimeType: 'text/plain', buffer: Buffer.from(source) })
  const python = page.getByRole('region', { name: 'Python learning workspace', exact: true })
  await python.waitFor({ timeout: 60000 })
  await dismissVisibleFloatingPanel(page)
  const awaitStoredSource = expected => page.waitForFunction(async value => {
    const name = (await indexedDB.databases()).find(database => database.name?.includes('kg:workspace-fs:indexeddb:v1'))?.name
    if (!name) return false
    return new Promise(resolve => {
      const opening = indexedDB.open(name)
      opening.onerror = () => resolve(false)
      opening.onsuccess = () => {
        const db = opening.result, transaction = db.transaction('records', 'readonly'), request = transaction.objectStore('records').getAll()
        request.onerror = () => { db.close(); resolve(false) }
        request.onsuccess = () => { db.close(); resolve(request.result.some(record => record.collection === 'entries' && record.value.path?.endsWith('/block-check.py') && record.value.text === value)) }
      }
    })
  }, expected, { timeout: 15000 })
  await python.getByRole('button', { name: 'Save source', exact: true }).click()
  await awaitStoredSource(source)
  const explorer = page.getByLabel('Show Explorer pane', { exact: true })
  if (await explorer.isChecked()) await explorer.uncheck()
  const blockToggle = page.getByLabel('Show Block editor pane', { exact: true })
  await blockToggle.check()
  const block = page.getByRole('region', { name: 'Block editor', exact: true })
  await block.getByRole('tree', { name: 'Program hierarchy' }).waitFor({ timeout: 60000 })
  assert.equal(await page.locator('[data-kg-block-canvas="true"]').count(), 1)
  const viewport = block.getByLabel('Block infinite canvas', { exact: true })
  const zoom = block.getByRole('button', { name: 'Reset Block canvas view', exact: true })
  const beforeZoom = await zoom.innerText()
  const box = await viewport.boundingBox()
  assert(box && box.width > 100 && box.height > 100, 'mobile canvas has usable area')
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const cdp = await context.newCDPSession(page)
  const points = distance => [
    { x: Math.round(center.x - distance), y: Math.round(center.y), id: 1 },
    { x: Math.round(center.x + distance), y: Math.round(center.y), id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(25) })
  for (const distance of [32, 40, 50, 60]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(old => document.querySelector('button[aria-label="Reset Block canvas view"]')?.textContent !== old, beforeZoom, { timeout: 10000 })
  const afterZoom = await zoom.innerText()
  assert.notEqual(afterZoom, beforeZoom, 'two-finger gesture changes embedded canvas scale')
  await zoom.click()
  assert.equal(await zoom.innerText(), '100%')
  await block.getByRole('treeitem', { name: /assign score/i }).tap()
  assert.equal(await block.getByRole('button', { name: 'Edit', exact: true }).isEnabled(), true, 'touch selection still works after pinch')
  await page.screenshot({ path: join(output, 'mobile-block.png'), fullPage: true })
  if (!dev) {
  await blockToggle.uncheck()
  await python.getByRole('button', { name: 'Results', exact: true }).click()
  await python.getByText('Offline lessons', { exact: true }).click()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 60000 })
  await python.getByRole('button', { name: 'Install offline lessons', exact: true }).click()
  await python.getByText(/^Verified \d+ files/).waitFor({ timeout: 190000 })
  await Promise.all([
    page.waitForURL(url => url.searchParams.get('python-learning-offline') === sourceRevision, { waitUntil: 'load', timeout: 60000 }),
    python.getByRole('button', { name: 'Open verified offline workspace', exact: true }).click(),
  ])
  await python.waitFor({ timeout: 60000 })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 60000 })
  await context.setOffline(true)
  const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  assert.equal(response?.status(), 200)
  await python.waitFor({ timeout: 60000 })
  await dismissVisibleFloatingPanel(page)
  if (await explorer.isChecked()) await explorer.uncheck()
  await blockToggle.check()
  await block.getByRole('tree', { name: 'Program hierarchy' }).waitFor({ timeout: 60000 })
  assert.equal(await page.locator('[data-kg-block-canvas="true"]').count(), 1)
  await block.getByText('assign score', { exact: true }).waitFor({ timeout: 30000 })
  assert.match(await block.innerText(), /assign score/)
  await block.getByRole('treeitem', { name: /assign score/i }).tap()
  await block.getByRole('button', { name: 'Edit', exact: true }).click()
  await block.getByRole('textbox', { name: 'Selected block source' }).fill('score = 3')
  await block.getByRole('button', { name: 'Apply block edit' }).click()
  await python.getByRole('button', { name: 'Save source', exact: true }).click()
  const changed = 'score = 3\nprint(score)\n'
  await awaitStoredSource(changed)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await python.waitFor({ timeout: 60000 })
  await dismissVisibleFloatingPanel(page)
  if (await explorer.isChecked()) await explorer.uncheck()
  await blockToggle.check()
  await block.getByText('3', { exact: true }).waitFor({ timeout: 30000 })
  await awaitStoredSource(changed)
  await page.screenshot({ path: join(output, 'offline-mobile-block.png'), fullPage: true })
  }
  assert.deepEqual(errors, [])
  const evidence = { revision, sourceRevision, mobileWidth: 375, pinch: `${beforeZoom}→${afterZoom}`, offlineReopen: !dev,
    offlineEditSavedAndReloaded: !dev, duplicateCanvasCount: 1, pageErrors: errors,
    remoteRequestsBlockedCount: new Set(remote).size, productionDeploymentProven: false }
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'passed', output, ...evidence }, null, 2))
} catch (error) {
  if (page) {
    console.error('Page state:', await page.evaluate(() => ({ url: location.href, readyState: document.readyState })).catch(() => ({})))
    console.error('Visible failure:', (await page.locator('body').innerText()).slice(-6000))
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
  }
  throw error
} finally {
  await browser?.close()
  await new Promise(done => server?.httpServer.close(done) || done())
}
