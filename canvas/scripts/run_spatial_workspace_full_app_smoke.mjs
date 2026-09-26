import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { createXrV2ExistingStorageFixture } from './lib/xr-v2-existing-storage-fixture.mjs'

const canvas = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(canvas, '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const revision = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}')
assert.equal(git('status', '--porcelain'), '', 'Acceptance requires a clean, committed candidate')
if (process.argv.includes('--build')) execFileSync('npm', ['run', 'pages:build'], { cwd: root, stdio: 'inherit', timeout: 300000 })
const output = resolve(process.env.SPATIAL_FULL_APP_PROOF_DIR || join(tmpdir(), `spatial-full-app-${revision.slice(0, 12)}`))
const source = `---
title: Local spatial walkthrough
kgCanvasSurfaceMode: 3d
kgCanvasRenderMode: 3d
kgCanvas3dMode: xr
kgFloatingPanelOpen: false
kgBottomPanelOpen: true
kgBottomPanelTab: timeline
kgDocumentSemanticMode: document
kgFrontmatterModeEnabled: true
flow:
  nodes:
    - id: {key: id, type: string, value: scene}
      type: {key: type, type: string, value: Document}
      label: {key: label, type: string, value: Scene}
  edges: []
kgXrMotionReference:
  schema: agentic-graph-xr-motion-reference/v1
  durationSeconds: 6
  fps: 12
  stageId: neutral-volume
  castSource: subjects-only
  subjects: [{id: box, assetId: prop-crate, label: '<img src=x onerror=alert(1)>', position: [-3, 0, 0]}]
---
# Local scene
`
async function storedSource(page) {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).find(item => item.name?.includes('workspace-fs:indexeddb'))?.name
    if (!name) return null
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(name); opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result, request = db.transaction('records', 'readonly').objectStore('records').getAll()
        request.onerror = () => { db.close(); reject(request.error) }
        request.onsuccess = () => { db.close(); resolve(request.result.find(item => item.collection === 'entries' && item.value?.path === '/notes/spatial-pilot.md')?.value?.text || null) }
      }
    })
  })
}
let server, browser, activePage
const results = []
try {
  await mkdir(output, { recursive: true })
  server = await preview({ root: canvas, configFile: join(canvas, 'vite.config.ts'), configLoader: 'runner', base: '/agentic-graph/', preview: { host: '127.0.0.1', port: 4209, strictPort: true } })
  const origin = 'http://127.0.0.1:4209'
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  for (const width of [1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 })
    // Explicit absent browser capability: every action below uses the product's visible controls.
    await context.addInitScript(() => Object.defineProperty(navigator, 'modelContext', { configurable: true, value: undefined }))
    const page = activePage = await context.newPage(), errors = [], remote = [], dialogs = []
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss() })
    await createXrV2ExistingStorageFixture().installExistingStorageFixture(page)
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) return route.continue()
      remote.push(url.origin + url.pathname); return route.abort()
    })
    const start = performance.now(), actions = []
    await page.goto(origin + '/agentic-graph/?openEditorWorkspace=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.getByRole('navigation', { name: 'Source files', exact: true }).waitFor({ timeout: 60000 })
    await page.getByRole('button', { name: 'Launch', exact: true }).click(); actions.push('Open Launch')
    const chooser = page.waitForEvent('filechooser')
    await page.getByText('Choose files', { exact: true }).click(); actions.push('Choose files')
    await (await chooser).setFiles({ name: 'spatial-pilot.md', mimeType: 'text/markdown', buffer: Buffer.from(source) }); actions.push('Select local scene')
    const review = page.getByRole('region', { name: 'Spatial change review', exact: true })
    await review.getByRole('button', { name: 'Preview +1 m on X', exact: true }).waitFor()
    await page.waitForFunction(() => { const fieldset = document.querySelector('[data-kg-spatial-review] fieldset'); return fieldset && !fieldset.disabled })
    await page.locator('[data-kg-xr-document-loaded="1"]').waitFor({ timeout: 60000 })
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
    const initial = await storedSource(page); assert.ok(initial)
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    await context.setOffline(true)
    const quickPreview = review.getByRole('button', { name: 'Preview +1 m on X', exact: true })
    const bounds = await quickPreview.boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44)
    await quickPreview.click(); actions.push('Preview +1 m on X')
    await review.getByRole('button', { name: 'Apply reviewed change', exact: true }).waitFor()
    assert.equal(await storedSource(page), initial, 'preview cannot mutate the saved source')
    await review.getByRole('button', { name: 'Apply reviewed change', exact: true }).click(); actions.push('Apply reviewed change')
    await review.getByText('Change applied and verified in local storage.', { exact: true }).waitFor()
    const firstValueMs = Math.round(performance.now() - start), applied = await storedSource(page)
    const metadata = yaml.load(applied.split('---', 3)[1])
    assert.equal(actions.length, 5); assert.ok(firstValueMs <= 300000)
    assert.deepEqual(metadata.kgXrMotionReference.subjects[0].position, [-2, 0, 0])
    assert.equal(metadata.kgSpatialWorkspaceReview.receipts.length, 1)
    assert.equal(metadata.kgSpatialWorkspaceReview.receipts[0].provenance.correspondence, 'unknown')
    await quickPreview.click(); await review.getByRole('button', { name: 'Cancel proposal', exact: true }).click()
    assert.equal(await storedSource(page), applied, 'cancellation preserves exact bytes')
    await review.getByRole('button', { name: 'Undo last reviewed change', exact: true }).click()
    await review.getByText('Change undone and verified in local storage.', { exact: true }).waitFor()
    const undone = await storedSource(page)
    assert.deepEqual(yaml.load(undone.split('---', 3)[1]).kgXrMotionReference.subjects[0].position, [-3, 0, 0])
    assert.equal(yaml.load(undone.split('---', 3)[1]).kgSpatialWorkspaceReview.receipts.length, 2)
    await context.setOffline(false)
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
    await review.getByText('Offline Studio', { exact: true }).click()
    const installStart = performance.now()
    await review.getByRole('button', { name: 'Install offline Studio', exact: true }).click()
    const verified = review.getByRole('status').filter({ hasText: /^Verified \d+ files/ })
    await verified.waitFor({ timeout: 190000 })
    const installation = await verified.innerText(), installMs = Math.round(performance.now() - installStart)
    await review.getByRole('button', { name: 'Open verified offline workspace', exact: true }).click()
    await page.waitForURL(url => url.searchParams.has('studio-offline'), { timeout: 60000 })
    await review.waitFor({ timeout: 60000 })
    await context.setOffline(true)
    const reloadStart = performance.now(), response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    assert.equal(response.status(), 200)
    await review.getByRole('button', { name: 'Preview +1 m on X', exact: true }).waitFor({ timeout: 60000 })
    assert.equal(await storedSource(page), undone, 'offline reload retains source and receipt bytes')
    await page.waitForFunction(() => { const fieldset = document.querySelector('[data-kg-spatial-review] fieldset'); return fieldset && !fieldset.disabled })
    await quickPreview.click(); await review.getByRole('button', { name: 'Cancel proposal', exact: true }).click()
    const reloadMs = Math.round(performance.now() - reloadStart)
    assert.equal(await storedSource(page), undone)
    assert.equal(await page.evaluate(() => navigator.modelContext === undefined), true)
    assert.deepEqual(dialogs, []); assert.deepEqual(errors, [])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false)
    await review.screenshot({ path: join(output, `review-${width}.png`) })
    results.push({ width, actions, firstValueMs, installation, installMs, reloadMs, receipts: 2,
      noWebMcp: true, offlineReview: true, coldReload: true, importedLabelIsText: true,
      overflow, pageErrors: errors, blockedRemoteRequests: [...new Set(remote)], evidenceKind: 'automated-technical-rehearsal' })
    console.log(JSON.stringify(results.at(-1)))
    await context.close()
  }
  assert.equal(git('status', '--porcelain'), '')
  assert.equal(git('rev-parse', 'HEAD'), revision)
  await writeFile(join(output, 'acceptance.json'), JSON.stringify({ schema: 'agentic-graph.spatial-full-app-acceptance/v1', revision, tree,
    productionAuthority: false, humanParticipants: 0, modelTokens: 0, results }, null, 2) + '\n')
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
    await writeFile(join(output, 'failure.txt'), String(error) + '\n' + await activePage.locator('body').innerText().catch(() => 'Unavailable'))
  }
  throw error
} finally { await browser?.close(); await server?.close() }
