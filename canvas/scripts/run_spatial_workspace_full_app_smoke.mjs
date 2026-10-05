import { browserProofSourceIdentity, verifyBrowserProofBuild } from '../../scripts/browser-proof-build.mjs'
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
import { runAviationEvidenceOfflineProof } from './lib/aviation-evidence-offline-proof.mjs'
import { importWorkspaceFile } from './lib/workspace-import-proof.mjs'
import { createSmokeDiagnostics, collectSmokeDiagnostics, installSmokeDiagnostics, captureLegacySmokeFailure } from './lib/spatial-smoke-diagnostics.mjs'

const canvas = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(canvas, '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const { revision, checkoutRevision, tree } = browserProofSourceIdentity(root)
assert.equal(git('status', '--porcelain'), '', 'Acceptance requires a clean, committed candidate')
const buildEnvironment = { ...process.env }
let verifiedBuild = null
if (process.argv.includes('--verified-build')) {
  assert.ok(!process.argv.includes('--build') && !process.argv.includes('--dev'), 'Verified build cannot be combined with build/dev flags')
  verifiedBuild = await verifyBrowserProofBuild(root, { environment: buildEnvironment })
}
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
async function visibleReviewWidth(review) {
  return review.evaluate(element => {
    const rect = element.getBoundingClientRect()
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right)
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX !== 'visible') {
        const bounds = parent.getBoundingClientRect()
        left = Math.max(left, bounds.left); right = Math.min(right, bounds.right)
      }
    }
    return { visible: Math.max(0, right - left), width: rect.width, overflow: element.scrollWidth > element.clientWidth + 1 }
  })
}
let server, browser, activePage, activeDiagnostics, activeCollector, failed = false
const results = []
try {
  await mkdir(output, { recursive: true })
  server = await preview({ root: canvas, configFile: join(canvas, 'vite.config.ts'), configLoader: 'runner', base: '/agentic-graph/', preview: { host: '127.0.0.1', port: 4209, strictPort: true } })
  const origin = 'http://127.0.0.1:4209'
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  for (const width of [1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390 })
    // Explicit absent browser capability: every action below uses the product's visible controls.
    await context.addInitScript(() => {
      // Keep both host surfaces unavailable even when the application attempts its fallback.
      for (const target of [navigator, document]) Object.defineProperty(target, 'modelContext', {
        configurable: false, get: () => undefined, set: () => {},
      })
    })
    await installSmokeDiagnostics(context)
    const page = activePage = await context.newPage(), errors = [], remote = [], dialogs = []
    const collector = activeCollector = createSmokeDiagnostics(page)
    const failedRequests = [], consoleErrors = []
    activeDiagnostics = { errors, failedRequests, consoleErrors }
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss() })
    page.on('requestfailed', request => { if (failedRequests.length < 30) { const url = new URL(request.url()); failedRequests.push({ path: url.origin + url.pathname, error: request.failure()?.errorText }) } })
    page.on('console', message => { if (message.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(message.text().slice(0, 2000)) })
    await createXrV2ExistingStorageFixture().installExistingStorageFixture(page)
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) return route.continue()
      remote.push(url.origin + url.pathname); return route.abort()
    })
    const start = performance.now(), actions = []
    const action = label => { actions.push(label); collector.mark(label) }
    collector.mark('Navigate:start')
    await page.goto(origin + '/agentic-graph/?openEditorWorkspace=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
    collector.mark('Navigate:domcontentloaded')
    // Boot readiness accepts multiple source roots; subsequent actions target their own named controls.
    await page.getByRole('navigation', { name: 'Source files', exact: true }).first().waitFor({ timeout: 60000 })
    collector.mark('Source files visible')
    await page.getByRole('button', { name: 'Launch', exact: true }).click(); action('Open Launch')
    const chooser = page.waitForEvent('filechooser')
    await page.getByText('Choose files', { exact: true }).click(); action('Choose files')
    collector.mark('Select local scene:start')
    await importWorkspaceFile({ page, fileChooser: await chooser, path: '/notes/spatial-pilot.md', source,
      file: { name: 'spatial-pilot.md', mimeType: 'text/markdown', buffer: Buffer.from(source) } })
    action('Local scene import complete; exact persisted source verified')
    const review = page.getByRole('region', { name: 'Spatial change review', exact: true })
    await review.getByRole('button', { name: 'Preview +1 m on X', exact: true }).waitFor()
    collector.mark('Review visible; awaiting enabled fieldset')
    await page.waitForFunction(() => { const fieldset = document.querySelector('[data-kg-spatial-review] fieldset'); return fieldset && !fieldset.disabled })
    collector.mark('Review enabled')
    const initialLayout = await visibleReviewWidth(review)
    assert.ok(initialLayout.visible >= Math.min(320, width - 48), JSON.stringify(initialLayout))
    assert.equal(initialLayout.overflow, false)
    if (width === 1024) await page.locator('[data-kg-xr-document-loaded="1"]').waitFor({ timeout: 60000 })
    else await page.getByRole('button', { name: 'Load 3D view', exact: true }).waitFor()
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
    const initial = await storedSource(page); assert.equal(initial, source)
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    await context.setOffline(true)
    const quickPreview = review.getByRole('button', { name: 'Preview +1 m on X', exact: true })
    const bounds = await quickPreview.boundingBox(); assert.ok(bounds.width >= 44 && bounds.height >= 44)
    await quickPreview.click(); action('Preview +1 m on X')
    await review.getByRole('button', { name: 'Apply reviewed change', exact: true }).waitFor()
    assert.equal(await storedSource(page), initial, 'preview cannot mutate the saved source')
    await review.getByRole('button', { name: 'Apply reviewed change', exact: true }).click(); action('Apply reviewed change')
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
    collector.mark('Install offline Studio:start')
    await review.getByRole('button', { name: 'Install offline Studio', exact: true }).click()
    const verified = review.getByRole('status').filter({ hasText: /^Verified \d+ files/ })
    await verified.waitFor({ timeout: 190000 })
    const installation = await verified.innerText(), installMs = Math.round(performance.now() - installStart)
    collector.mark('Install offline Studio:verified')
    await review.getByRole('button', { name: 'Open verified offline workspace', exact: true }).click()
    await page.waitForURL(url => url.searchParams.has('studio-offline'), { timeout: 60000 })
    await review.waitFor({ timeout: 60000 })
    await page.waitForFunction(() => document.readyState === 'complete' && !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
    await page.waitForLoadState('networkidle', { timeout: 30000 })
    assert.equal(await storedSource(page), undone, 'installed route must finish restoring the saved scene before disconnecting')
    await context.setOffline(true)
    collector.mark('Offline reload:start')
    const reloadStart = performance.now(), response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    assert.equal(response.status(), 200)
    await review.getByRole('button', { name: 'Preview +1 m on X', exact: true }).waitFor({ timeout: 60000 })
    assert.equal(await storedSource(page), undone, 'offline reload retains source and receipt bytes')
    // The spatial review controls belong to the restored Markdown workspace. Dismiss an
    // obstructing Timeline panel, but keep that workspace open for the offline review.
    const reloadNavigationActions = []
    const timelinePanel = page.getByRole('complementary', { name: 'Strybldr Timeline', exact: true })
    if (await timelinePanel.isVisible()) {
      await timelinePanel.getByRole('button', { name: 'Close', exact: true }).click()
      await timelinePanel.waitFor({ state: 'hidden', timeout: 30000 })
      reloadNavigationActions.push('Close restored Timeline overlay')
    }
    await page.waitForFunction(() => { const fieldset = document.querySelector('[data-kg-spatial-review] fieldset'); return fieldset && !fieldset.disabled })
    collector.mark('Offline review enabled')
    await quickPreview.click(); await review.getByRole('button', { name: 'Cancel proposal', exact: true }).click()
    const reloadMs = Math.round(performance.now() - reloadStart)
    assert.equal(await storedSource(page), undone)
    assert.equal(await page.evaluate(() => navigator.modelContext === undefined && document.modelContext === undefined), true, 'manual review works without either tool-host surface')
    assert.deepEqual(dialogs, []); assert.deepEqual(errors, [])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    assert.equal(overflow, false)
    const reopenedLayout = await visibleReviewWidth(review)
    assert.ok(reopenedLayout.visible >= Math.min(320, width - 48), JSON.stringify(reopenedLayout))
    assert.equal(reopenedLayout.overflow, false)
    await quickPreview.scrollIntoViewIfNeeded()
    const visibleControl = await quickPreview.boundingBox()
    assert.ok(visibleControl.x >= 0 && visibleControl.x + visibleControl.width <= width)
    await page.screenshot({ path: join(output, `review-${width}.png`), fullPage: true })
    collector.mark('Acceptance complete')
    const diagnostics = await collectSmokeDiagnostics(page, collector, { revision, tree })
    results.push({ width, actions, firstValueMs, installation, installMs, reloadMs, receipts: 2,
      noWebMcp: true, offlineReview: true, coldReload: true, reloadNavigationActions, importedLabelIsText: true, renderer: width === 390 ? 'touch-opt-in-deferred' : 'loaded',
      overflow, initialLayout, reopenedLayout, pageErrors: errors, blockedRemoteRequests: [...new Set(remote)], evidenceKind: 'automated-technical-rehearsal', diagnostics })
    console.log(JSON.stringify(results.at(-1)))
    await context.close()
  }
  activePage = null; activeCollector = null
  const aviationResults = await runAviationEvidenceOfflineProof({ browser, origin, root, output, revision, tree })
  assert.equal(git('status', '--porcelain'), '')
  assert.equal(git('rev-parse', 'HEAD'), checkoutRevision)
  if (verifiedBuild) assert.deepEqual(await verifyBrowserProofBuild(root, { environment: buildEnvironment }), verifiedBuild)
  await writeFile(join(output, 'acceptance.json'), JSON.stringify({ schema: 'agentic-graph.spatial-full-app-acceptance/v1', revision, checkoutRevision, tree,
    verifiedBuild, productionAuthority: false, humanParticipants: 0, modelTokens: 0, results, aviationResults }, null, 2) + '\n')
} catch (error) {
  failed = true
  if (activePage && activeCollector) {
    activeCollector.mark('Failure')
    try {
      const json = JSON.stringify(await collectSmokeDiagnostics(activePage, activeCollector, { revision, tree }, error))
      console.error(json)
      await writeFile(join(output, 'failure-diagnostics.json'), json + '\n')
    }
    catch { console.error('Could not write bounded smoke diagnostics') }
  }
  await captureLegacySmokeFailure({ page: activePage, output, revision, tree, diagnostics: activeDiagnostics, storedSource }, error)
  throw error
} finally {
  const cleanup = await Promise.allSettled([browser?.close(), server?.close()])
  const rejection = cleanup.find(result => result.status === 'rejected')
  if (!failed && rejection) throw rejection.reason
}
