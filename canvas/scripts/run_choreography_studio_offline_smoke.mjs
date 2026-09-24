import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const canvas = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(canvas, '..')
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const desktop = process.argv.includes('--desktop')
const viewport = desktop ? { width: 1280, height: 800 } : { width: 375, height: 812 }
const output = resolve(process.env.STUDIO_OFFLINE_PROOF_DIR || join(tmpdir(), `studio-offline-${revision.slice(0, 12)}-${desktop ? 'desktop' : 'mobile'}`))
if (process.argv.includes('--build')) execFileSync('npm', ['run', 'pages:build'], { cwd: root, stdio: 'ignore', timeout: 240000 })

const seed = await readFile(join(root, 'docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'), 'utf8')
const sourcePlan = yaml.load(seed.split('---', 3)[1]).kgXrMotionReference
const authoredSource = [
  '---',
  'title: Local Studio',
  'kgCanvasSurfaceMode: 3d',
  'kgCanvasRenderMode: 3d',
  'kgCanvas3dMode: xr',
  'kgFloatingPanelOpen: true',
  'kgFloatingPanelView: motionControl',
  'kgBottomPanelOpen: true',
  'kgBottomPanelTab: timeline',
  'kgDocumentSemanticMode: document',
  'kgFrontmatterModeEnabled: true',
  'flow:',
  '  nodes:',
  '    - id: {key: id, type: string, value: "studio-document"}',
  '      type: {key: type, type: string, value: Document}',
  '      label: {key: label, type: string, value: "Local Studio"}',
  '  edges: []',
  yaml.dump({ kgXrMotionReference: sourcePlan }, { lineWidth: -1, noRefs: true }).trimEnd(),
  '---', '', '# Local Studio', '',
].join('\n')

async function readAuthoredSource(page) {
  return page.evaluate(async () => {
    const name = (await indexedDB.databases()).find(item => item.name?.includes('workspace-fs:indexeddb'))?.name
    if (!name) return null
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(name)
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result
        const request = db.transaction('records', 'readonly').objectStore('records').getAll()
        request.onerror = () => { db.close(); reject(request.error) }
        request.onsuccess = () => {
          db.close()
          resolve(request.result.find(item => item.collection === 'entries' && item.value?.path === '/notes/studio-local.md')?.value?.text || null)
        }
      }
    })
  })
}

async function selectSceneClip(page) {
  const bar = page.locator('[data-kg-gantt-timeline-track-row-key*="xr_stage_scene"] button.timeline-transport-track-clip-move').first()
  await bar.waitFor({ timeout: 60000 })
  await bar.click({ force: true })
  const save = page.locator('[data-kg-xr-motion-save]')
  await save.waitFor({ timeout: 15000 })
  return save
}

async function exportPackage(page) {
  const download = page.waitForEvent('download', { timeout: 15000 })
  await page.locator('[data-kg-xr-motion-export]').click()
  return JSON.parse(await readFile(await (await download).path(), 'utf8'))
}

const started = Date.now()
let server, browser
try {
  await mkdir(output, { recursive: true })
  server = await preview({ root: canvas, configFile: join(canvas, 'vite.config.ts'), configLoader: 'runner', base: '/agentic-graph/', preview: { host: '127.0.0.1', port: 4202, strictPort: true } })
  const origin = 'http://127.0.0.1:4202'
  const executablePath = findLocalChromiumExecutable('', chromium.executablePath())
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(executablePath ? { executablePath } : {}) })
  const context = await browser.newContext({ viewport, isMobile: !desktop, hasTouch: !desktop, acceptDownloads: true })
  const errors = [], remote = []
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) return route.continue()
    remote.push(url.origin + url.pathname)
    return route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + '/agentic-graph/?openEditorWorkspace=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const launch = page.locator('[aria-label="Launch"]')
  await launch.waitFor({ timeout: 60000 })
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 60000 })
  const launchRect = await launch.boundingBox()
  if (!desktop) assert.ok(launchRect.width >= 44 && launchRect.height >= 44, 'mobile Launch needs a visible 44 px touch target')
  await launch.click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('Choose files', { exact: true }).click()
  await (await chooser).setFiles({ name: 'studio-local.md', mimeType: 'text/markdown', buffer: Buffer.from(authoredSource) })
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases()
    return dbs.some(item => item.name?.includes('workspace-fs:indexeddb'))
  }, undefined, { timeout: 60000 })
  await page.waitForTimeout(5000)
  const save = await selectSceneClip(page)
  const saveRect = await save.boundingBox(), exportRect = await page.locator('[data-kg-xr-motion-export]').boundingBox()
  if (!desktop) assert.ok(saveRect.width >= 44 && saveRect.height >= 44 && exportRect.width >= 44 && exportRect.height >= 44)
  await page.locator('[data-kg-xr-motion-stage-select="scene-clip"]').selectOption('neutral-volume')
  await save.click()
  try {
    await page.getByText('Scene saved to this browser. Reopen this source to verify it.', { exact: true }).waitFor({ timeout: 15000 })
  } catch (error) {
    console.error('Save feedback:', (await page.locator('body').innerText()).split('\n').filter(row => /save|source|storage|authored/i.test(row)).slice(-20))
    throw error
  }
  const savedText = await readAuthoredSource(page)
  assert.equal(yaml.load(savedText.split('---', 3)[1]).kgXrMotionReference.stageId, 'neutral-volume')
  const exported = await exportPackage(page)
  assert.equal(exported.stage.id, 'neutral-volume')
  console.log(`Saved and exported authored source in ${Date.now() - started} ms`)

  await page.getByRole('button', { name: 'Workspace View', exact: true }).click()
  await page.getByRole('button', { name: 'Editor Workspace', exact: true }).first().click()
  await page.getByRole('navigation', { name: 'Source files', exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Animation', exact: true }).first().click()
  await page.getByText('Scene and rehearsal exercises', { exact: true }).click()
  const offlineStudio = page.getByText('Offline Studio', { exact: true })
  await offlineStudio.waitFor({ timeout: 15000 })
  await offlineStudio.click()
  await page.getByRole('button', { name: 'Install offline Studio' }).click()
  const verified = page.getByRole('status').filter({ hasText: /Verified \d+ files/ })
  await verified.waitFor({ timeout: 190000 })
  const installation = await verified.innerText()
  await page.getByRole('button', { name: 'Open verified offline workspace' }).click()
  await page.waitForURL(url => url.searchParams.has('studio-offline'), { timeout: 30000 })
  await context.setOffline(true)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await launch.waitFor({ timeout: 60000 })
  assert.equal(await readAuthoredSource(page), savedText, 'offline reload retains exact authored source bytes')
  console.log(`Offline route and authored source reopened in ${Date.now() - started} ms`)

  const sourceNavigation = page.getByRole('navigation', { name: 'Source files', exact: true })
  if (!await sourceNavigation.count()) {
    await page.getByRole('button', { name: 'Workspace View', exact: true }).click()
    await page.getByRole('button', { name: 'Editor Workspace', exact: true }).first().click()
  }
  await sourceNavigation.waitFor({ timeout: 60000 })
  const authoredFile = sourceNavigation.getByRole('button', { name: 'File studio-local.md' })
  const notesFolder = sourceNavigation.getByRole('button', { name: 'Folder notes' })
  await notesFolder.waitFor({ timeout: 60000 })
  if (!await authoredFile.count()) {
    await notesFolder.click()
  }
  await authoredFile.waitFor({ timeout: 60000 })
  await authoredFile.click()
  await page.waitForTimeout(3000)
  const closeEditor = page.locator('menu[aria-label="Actions"] button[title="Close"]')
  try {
    await closeEditor.click({ timeout: 10000 })
  } catch (error) {
    await page.screenshot({ path: join(output, 'reopen-editor.png') })
    console.error('Editor close controls:', await page.locator('button[title="Close"]').count(), (await page.locator('body').innerText()).slice(-1200))
    throw error
  }
  try {
    await selectSceneClip(page)
  } catch (error) {
    console.error('Reopened scene UI:', (await page.locator('body').innerText()).slice(-2500))
    throw error
  }
  assert.equal(await page.locator('[data-kg-xr-motion-stage-select="scene-clip"]').inputValue(), 'neutral-volume')
  const reopenedPackage = await exportPackage(page)
  assert.deepEqual(reopenedPackage.files, exported.files, 'offline reopened source exports identical reference files')
  assert.equal(reopenedPackage.source.motionFingerprint, exported.source.motionFingerprint)
  assert.deepEqual(errors, [])
  const evidence = { revision, browserVersion: browser.version(), viewport: desktop ? '1280x800 pointer' : '375x812 touch', sourcePath: '/notes/studio-local.md', sourceBytes: savedText.length,
    sourceStage: 'neutral-volume', runtimeStorageClearedBeforeReload: true, motionFingerprint: exported.source.motionFingerprint, installation,
    offlineRoute: page.url(), elapsedMs: Date.now() - started, pageErrors: errors, remoteRequestsBlocked: remote }
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'passed', output, ...evidence }, null, 2))
} finally {
  await browser?.close()
  await server?.close()
}
