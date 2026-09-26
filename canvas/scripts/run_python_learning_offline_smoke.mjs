import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'
import { chromium } from 'playwright'
import { expect } from 'playwright/test'
import { tsImport } from 'tsx/esm/api'
import { dismissVisibleFloatingPanel } from './lib/panel-close-helpers.mjs'

const canvas = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(canvas, '..')
const checkoutRevision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const { resolveViteRuntimeIdentity } = await tsImport('../viteChatProxyEnv.ts', import.meta.url)
const { sourceRevision: revision } = resolveViteRuntimeIdentity(root)
const sourceState = () => execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' })
const before = sourceState(), output = resolve(process.env.PYTHON_LEARNING_PROOF_DIR || join(tmpdir(), `python-learning-offline-${revision.slice(0, 12)}`))
const port = Number(process.env.PYTHON_LEARNING_PROOF_PORT || 4198)
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, 'offline proof port must be 1024..65535')
if (process.argv.includes('--build')) execFileSync('npm', ['run', 'pages:build'], { cwd: root, stdio: 'inherit', timeout: 240000 })
const { LEARNING_LESSONS: lessons } = await tsImport('../src/features/python-learning/learningLessons.ts', import.meta.url)
const { LEARNING_LESSON_FILES: lessonFiles } = await tsImport('../src/features/python-learning/learningLessonFiles.ts', { parentURL: import.meta.url, tsconfig: join(canvas, 'tsconfig.json') })
const manifest = JSON.parse(await readFile(join(canvas, 'dist', `learning-offline-manifest-${revision}.json`), 'utf8'))
for (const file of manifest.files) {
  const bytes = await readFile(join(canvas, 'dist', file.path))
  assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
}
let server, browser, page, evidenceWritten = false
const consoleWarnings = []
try {
  await mkdir(output, { recursive: true })
  server = await preview({ root: canvas, configFile: join(canvas, 'vite.config.ts'), configLoader: 'runner', base: '/agentic-graph/', preview: { host: '127.0.0.1', port, strictPort: true } })
  const origin = `http://127.0.0.1:${port}`, base = origin + '/agentic-graph/'
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true })
  // Controlled browser-host surface; production registers its actual validated lazy tools.
  // This proves application registration, not an experimental browser vendor API.
  await context.addInitScript(() => {
    const tools = new Map()
    window.__registeredLearningTools = tools
    Object.defineProperty(navigator, 'modelContext', { configurable: true, value: {
      registerTool(tool, { signal } = {}) {
        if (tools.has(tool.name)) throw new Error('Duplicate tool registration: ' + tool.name)
        if (!signal || signal.aborted) throw new Error('Live registration signal required')
        tools.set(tool.name, tool)
        signal.addEventListener('abort', () => tools.delete(tool.name), { once: true })
      },
    } })
  })
  const errors = [], remote = [], failedRequests = []
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin || !['http:', 'https:'].includes(url.protocol)) return route.continue()
    remote.push(url.origin + url.pathname); return route.abort()
  })
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleWarnings.push(message.text()) })
  page.on('requestfailed', request => failedRequests.push(new URL(request.url()).pathname))
  await page.goto(base + '?openEditorWorkspace=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('navigation', { name: 'Source files', exact: true }).waitFor({ timeout: 60000 })
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 60000 })
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some(editor => editor.value.trim().length > 0), undefined, { timeout: 60000 })
  // Exercise the actual Source Files owner before the separate offline lesson proof.
  await page.setViewportSize({ width: 1280, height: 900 })
  await dismissVisibleFloatingPanel(page)
  const folder = page.getByRole('button', { name: 'Folder python-lessons', exact: true })
  const docsFolder = page.getByRole('button', { name: 'Folder docs', exact: true })
  await docsFolder.waitFor()
  if (await docsFolder.locator('svg.lucide-chevron-right').count()) await docsFolder.click()
  await folder.waitFor({ timeout: 30000 })
  const firstFile = page.getByRole('button', { name: `File ${lessonFiles[0].name}`, exact: true })
  if (!await firstFile.isVisible()) await folder.click()
  const nativePane = page.getByRole('region', { name: 'Python learning workspace', exact: true })
  for (const file of lessonFiles) {
    const row = page.getByRole('button', { name: `File ${file.name}`, exact: true })
    assert.equal(await row.count(), 1, 'one native row per lesson')
    assert.equal(await row.getAttribute('title'), file.path)
    console.log('Opening native lesson:', file.path)
    await row.click(); await nativePane.waitFor()
    await page.waitForFunction(id => document.querySelector('select[aria-label="Python lesson"]')?.value === id, file.id)
    assert.equal(await nativePane.getAttribute('data-learning-state'), 'idle', 'opening a source file never runs it')
    await page.getByRole('button', { name: `Local saved copy: ${file.name}. Sign in to sync this file.`, exact: true }).waitFor()
  }
  await nativePane.getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('.python-learning[data-learning-state="completed"]').waitFor({ timeout: 15000 })
  await nativePane.getByText(/Goal reached · 4\/4 checks/).waitFor()
  const editedFile = lessonFiles[1], editedSource = '# Saved learner code 保留\nprint(42)\n'
  await page.getByRole('button', { name: `File ${editedFile.name}`, exact: true }).click()
  const nativeEditor = nativePane.getByRole('textbox', { name: 'Python source text', exact: true })
  await page.waitForFunction(text => document.querySelector('textarea[aria-label="Python source text"]')?.value === text,
    '# agentic-graph lesson: route\n' + lessons[1].solution)
  await nativeEditor.fill(editedSource)
  await nativePane.getByRole('button', { name: 'Save source', exact: true }).click()
  // Save and indexing share a transient toast. Exact committed bytes own completion.
  const awaitNativeStoredSource = () => expect.poll(() => page.evaluate(async ({ path, text }) => {
    const name = (await indexedDB.databases()).find(database => database.name?.includes('kg:workspace-fs:indexeddb:v1'))?.name
    if (!name) return false
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(name); opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result, request = db.transaction('records', 'readonly').objectStore('records').getAll()
        request.onerror = () => { db.close(); reject(request.error) }
        request.onsuccess = () => { db.close(); resolve(request.result.some(record => record.key === 'entries\u0000' + path && record.id === path && record.collection === 'entries' && record.value.path === path && record.value.text === text)) }
      }
    })
  }, { path: editedFile.path, text: editedSource }), { timeout: 15000 }).toBe(true)
  await awaitNativeStoredSource()
  assert.equal(await page.evaluate(path => JSON.parse(localStorage.getItem('kg:ui:markdown:workspace:sourcesByPath') || '{}')[path]?.kind, editedFile.path), 'local')
  await page.reload({ waitUntil: 'domcontentloaded' }); await nativePane.waitFor({ timeout: 60000 })
  await dismissVisibleFloatingPanel(page)
  assert.equal(await page.evaluate(path => JSON.parse(localStorage.getItem('kg:ui:markdown:workspace:sourcesByPath') || '{}')[path]?.kind, editedFile.path), 'local')
  await awaitNativeStoredSource()
  await page.waitForFunction(text => document.querySelector('textarea[aria-label="Python source text"]')?.value === text, editedSource, { timeout: 30000 })
  assert.equal(await nativeEditor.inputValue(), editedSource, 'native lesson save survives reload without replacing learner code')
  assert.equal(await nativePane.getByLabel('Python lesson', { exact: true }).inputValue(), editedFile.id, 'markerless source keeps its file lesson')
  await page.screenshot({ path: join(output, 'native-lesson-files.png'), fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.locator('input[type="file"][accept*=".py"]').setInputFiles({ name: 'learning.py', mimeType: 'text/plain', buffer: Buffer.from(lessons[0].solution) })
  const pane = page.getByRole('region', { name: 'Python learning workspace', exact: true })
  await pane.waitFor({ timeout: 60000 })
  const invoke = (name, input = {}) => page.evaluate(async ({ name, input }) => {
    const tool = window.__registeredLearningTools.get('agentic-graph.' + name)
    if (!tool) throw new Error('Missing registered tool: ' + name)
    return tool.execute(input)
  }, { name, input })
  const inspect = () => invoke('inspect_local_python_learning')
  const control = input => invoke('control_local_python_learning', input)
  const selectPython = async () => {
    await page.waitForFunction(() => window.__registeredLearningTools.has('agentic-graph.select_local_tool_scope'))
    await invoke('select_local_tool_scope', { scope: 'pythonLearning' })
    assert.equal(await page.locator('html').getAttribute('data-kg-webmcp-scope'), 'pythonLearning')
  }
  // A restored floating panel keeps its own discovery priority; agents select the requested group.
  await selectPython()
  await dismissVisibleFloatingPanel(page)
  const discovery = await page.evaluate(() => ({ scope: document.documentElement.dataset.kgWebmcpScope,
    names: [...window.__registeredLearningTools.keys()], bytes: Number(document.documentElement.dataset.kgWebmcpBytes) }))
  assert.equal(discovery.names.length, 8); assert.ok(discovery.bytes <= 32 * 1024)
  const initial = await inspect()
  await assert.rejects(() => control({ operation: 'run', requestId: 'missing-binding' }))
  await assert.rejects(() => control({ ...initial.binding, operation: 'run', requestId: 'unknown-field', extra: true }))
  await assert.rejects(() => control({ ...initial.binding, documentId: '/stale.py', operation: 'run', requestId: 'stale-binding' }), /stale-input/)
  const hint = { ...initial.binding, operation: 'hint', requestId: 'registered-hint' }
  await control(hint); await control(hint)
  assert.equal((await inspect()).hintStage, 1, 'request replay must not apply another hint')
  if (await page.getByLabel('Show Explorer pane', { exact: true }).isChecked()) await page.getByLabel('Show Explorer pane', { exact: true }).uncheck()
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle', 'native import never executes')
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 60000 })
  await dismissVisibleFloatingPanel(page)
  await pane.getByRole('button', { name: 'Results', exact: true }).click()
  await pane.getByText('Offline lessons', { exact: true }).click()
  const installStart = performance.now()
  await pane.getByRole('button', { name: 'Install offline lessons', exact: true }).click()
  await pane.getByText(/^Verified \d+ files/).waitFor({ timeout: 190000 })
  const installMs = Math.round(performance.now() - installStart)
  await Promise.all([
    page.waitForURL(url => url.searchParams.get('python-learning-offline') === revision, { waitUntil: 'load', timeout: 60000 }),
    pane.getByRole('button', { name: 'Open verified offline workspace', exact: true }).click(),
  ])
  await pane.waitFor({ timeout: 60000 })
  await page.waitForFunction(() => document.readyState === 'complete' && !!navigator.serviceWorker.controller, undefined, { timeout: 60000 })
  await context.setOffline(true)
  const reloadStart = performance.now()
  const offlineResponse = await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  assert.equal(offlineResponse?.status(), 200, 'verified offline navigation must return the cached application document')
  await pane.waitFor({ timeout: 60000 })
  await selectPython()
  await dismissVisibleFloatingPanel(page)
  const reloadMs = Math.round(performance.now() - reloadStart)
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  const editor = pane.getByRole('textbox', { name: 'Python source text', exact: true })
  const awaitSource = expected => page.waitForFunction(value => document.querySelector('textarea[aria-label="Python source text"]')?.value === value, expected, { timeout: 30000 })
  const awaitStoredSource = expected => expect.poll(() => page.evaluate(async value => {
    const name = (await indexedDB.databases()).find(database => database.name?.includes('kg:workspace-fs:indexeddb:v1'))?.name
    if (!name) return false
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(name); opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result, transaction = db.transaction('records', 'readonly'), request = transaction.objectStore('records').getAll()
        request.onerror = () => { db.close(); reject(request.error) }
        request.onsuccess = () => { db.close(); resolve(request.result.some(record => record.collection === 'entries' && record.value.path?.endsWith('/learning.py') && record.value.text === value)) }
      }
    })
  }, expected), { timeout: 15000 }).toBe(true)
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  await awaitSource(lessons[0].solution)
  assert.equal(await editor.inputValue(), lessons[0].solution)
  const outcomes = []
  for (const lesson of lessons) {
    await pane.getByLabel('Python lesson', { exact: true }).selectOption(lesson.id)
    await pane.getByRole('button', { name: 'Code', exact: true }).click()
    if (await editor.inputValue() !== lesson.solution) {
      const saved = page.getByText('Saved', { exact: true })
      await saved.waitFor({ state: 'hidden', timeout: 15000 })
      await editor.fill(lesson.solution)
      await pane.getByRole('button', { name: 'Save source', exact: true }).click()
      await awaitStoredSource(lesson.solution)
    }
    let registeredRun
    if (lesson.id === lessons[0].id) {
      registeredRun = { ...(await inspect()).binding, operation: 'run', requestId: 'offline-registered-run' }
      const started = performance.now(); await control(registeredRun)
      assert.ok(performance.now() - started < 2000, 'registered Run must acknowledge within two seconds')
    } else await pane.getByRole('button', { name: 'Run', exact: true }).click()
    await page.locator('.python-learning[data-learning-state="completed"]').waitFor({ timeout: 15000 })
    const observed = await inspect()
    assert.equal(observed.result.grade.passed, true); assert.equal(observed.costLog.model, 'none')
    assert.equal(observed.costLog.prompt_tokens + observed.costLog.completion_tokens, 0)
    if (registeredRun) {
      await control(registeredRun)
      assert.equal((await inspect()).binding.expectedRunId, observed.binding.expectedRunId, 'replay cannot allocate another run')
      const saved = await control({ ...observed.binding, operation: 'save', requestId: 'offline-registered-save' })
      assert.equal(saved.status, 'saved')
    }
    await pane.getByRole('button', { name: 'Results', exact: true }).click()
    await pane.getByText('Lesson passed', { exact: false }).waitFor()
    await pane.getByRole('button', { name: 'Save debrief', exact: true }).click()
    await pane.getByText('Saved locally:', { exact: false }).waitFor()
    outcomes.push({ lesson: lesson.id, passed: true })
  }
  const lessonCanvas = page.getByRole('region', { name: 'Canvas viewport', exact: true })
  const sharedCanvas = lessonCanvas.locator('[data-kg-three-canvas-owner="1"]')
  assert.equal(await pane.locator('canvas').count(), 0, 'Editor must not host the lesson renderer')
  const beforeCanvasSwitch = await inspect()
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  await editor.press('ControlOrMeta+A'); await editor.press('ArrowLeft')
  for (let offset = 0; offset < 7; offset++) await editor.press('ArrowRight')
  assert.equal(await editor.evaluate(element => element.selectionStart), 7)
  await pane.getByRole('button', { name: 'View Canvas', exact: true }).click()
  await sharedCanvas.waitFor()
  assert.equal(await pane.isVisible(), false, 'mobile scene uses the full Canvas view')
  assert.equal(await lessonCanvas.locator('[data-learning-run-id]').getAttribute('data-learning-run-id'), beforeCanvasSwitch.binding.expectedRunId)
  assert.equal(await page.locator('[data-kg-three-canvas-owner="1"]').count(), 1, 'lesson uses the existing Canvas owner once')
  assert.equal(await page.locator('figure.python-learning-scene').count(), 0, 'no competing lesson viewport')
  assert.equal(await lessonCanvas.locator('[data-kg-three-viewport-gestures]').getAttribute('data-kg-three-viewport-gestures'), 'orbit-pan-cursor-zoom', 'lesson uses shared Canvas gestures')
  await page.waitForFunction(() => {
    const owner = document.querySelector('[data-kg-three-canvas-owner="1"]')
    const canvas = owner?.querySelector('canvas')
    return owner && owner.getBoundingClientRect().width >= 350 && canvas && canvas.width > 0
  })
  await page.screenshot({ path: join(output, 'offline-mobile-canvas.png'), fullPage: true })
  await page.getByRole('navigation', { name: 'Main Toolbar', exact: true }).getByRole('button', { name: 'Edit Python code', exact: true }).click()
  await pane.waitFor(); await selectPython()
  await dismissVisibleFloatingPanel(page)
  assert.equal((await inspect()).binding.expectedRunId, beforeCanvasSwitch.binding.expectedRunId, 'view switching must preserve the run')
  assert.equal(await editor.inputValue(), lessons.at(-1).solution, 'view switching must preserve source')
  assert.equal(await editor.evaluate(element => element.selectionStart), 7, 'view switching must preserve the editor cursor')
  assert.equal(await pane.getByLabel('Python lesson', { exact: true }).inputValue(), lessons.at(-1).id)
  await pane.getByRole('button', { name: 'Results', exact: true }).click()
  await page.locator('.python-learning-result').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: join(output, 'offline-mobile.png'), fullPage: true })
  await writeFile(join(output, 'accessible-workspace.txt'), await pane.ariaSnapshot())
  assert.ok(await pane.locator('button:visible,select:visible,summary:visible').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 44)))
  await pane.getByRole('button', { name: 'Hint', exact: true }).focus(); await page.keyboard.press('Enter')
  await pane.getByLabel('Progressive hints', { exact: true }).waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  // Debrief save and the editor's debounced source autosave are separate native receipts.
  await awaitStoredSource(lessons.at(-1).solution)
  await page.reload({ waitUntil: 'domcontentloaded' }); await pane.waitFor({ timeout: 60000 })
  await dismissVisibleFloatingPanel(page)
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  await awaitSource(lessons.at(-1).solution)
  assert.equal(await editor.inputValue(), lessons.at(-1).solution, 'native autosave survives offline reload')
  await pane.getByRole('button', { name: 'Results', exact: true }).click()
  await pane.getByRole('button', { name: 'Load saved debriefs', exact: true }).click()
  await pane.getByText(`${lessons.length} matching debriefs`, { exact: false }).waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  const paneWidth = (await pane.boundingBox()).width
  assert.ok(paneWidth < 768, 'native desktop Editor must exercise a narrow pane')
  assert.ok(await pane.getByRole('group', { name: 'Python workspace view', exact: true }).isVisible(), 'compact views must follow pane width on desktop')
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  assert.ok((await pane.getByRole('region', { name: 'Python source', exact: true }).boundingBox()).width >= paneWidth - 20, 'source must use the narrow pane width')
  const richEditor = pane.getByRole('button', { name: 'Load rich editor', exact: true })
  if (await richEditor.isVisible()) await richEditor.click()
  await pane.locator('.monaco-editor .view-lines').waitFor({ timeout: 30000 })
  assert.ok(await pane.locator('.monaco-editor .view-lines').evaluate(element => new Set([...element.querySelectorAll('span')].map(span => span.className).filter(name => /^mtk/.test(name))).size > 1), 'offline Python highlighting must load')
  await pane.getByLabel('Python lesson', { exact: true }).selectOption(lessons[0].id)
  const editRichSource = async source => {
    await pane.locator('.monaco-editor .view-line').first().click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(source)
    assert.equal((await inspect()).binding.sourceDigest, createHash('sha256').update(source).digest('hex'), 'Monaco edit must bind exact source to runtime')
  }
  await editRichSource(lessons[0].starter)
  await pane.getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('.python-learning[data-learning-state="completed"]').waitFor()
  let richRun = await inspect()
  assert.ok(Math.abs(richRun.result.scene.x - 1) < 1e-6, 'starter edit must move the native Canvas scene one metre')
  assert.equal(richRun.result.grade.passed, false)
  await pane.getByText(/Goal not reached · 3\/4 checks · position \(1\.00, 0\.00\) m · output: False/).waitFor()
  await editRichSource(lessons[0].solution)
  await pane.getByRole('button', { name: 'Run', exact: true }).click()
  await page.locator('.python-learning[data-learning-state="completed"]').waitFor()
  richRun = await inspect()
  assert.ok(Math.abs(richRun.result.scene.x - 4) < 1e-6, 'revised Monaco source must update the native Canvas scene')
  assert.equal(richRun.result.grade.passed, true)
  await pane.getByText(/Goal reached · 4\/4 checks · position \(4\.00, 0\.00\) m · output: True/).waitFor()
  await pane.getByRole('button', { name: 'Save source', exact: true }).click()
  await awaitStoredSource(lessons[0].solution)
  await page.screenshot({ path: join(output, 'offline-desktop.png'), fullPage: true })
  await pane.getByRole('button', { name: 'Results', exact: true }).click()
  await pane.locator('.python-learning-result').evaluate(element => { element.scrollTop = 0 })
  await page.waitForFunction(() => {
    const editor = document.querySelector('.python-learning')?.getBoundingClientRect(), scene = document.querySelector('[data-kg-three-canvas-owner="1"]')?.getBoundingClientRect()
    return editor && scene && scene.left <= editor.left + 1 && scene.width >= innerWidth - 2
  })
  await page.screenshot({ path: join(output, 'offline-desktop-scene.png'), fullPage: true })
  const beforeResize = await sharedCanvas.boundingBox()
  const resizeHandle = page.getByRole('separator', { name: 'Resize canvas', exact: true })
  const handle = await resizeHandle.boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + handle.height / 2, { steps: 5 })
  await page.mouse.up()
  const afterResize = await sharedCanvas.boundingBox()
  assert.equal(afterResize.x, beforeResize.x, 'Editor resize must not move the Canvas viewport')
  assert.equal(afterResize.width, beforeResize.width, 'Editor resize must not resize the Canvas viewport')
  await page.setViewportSize({ width: 375, height: 812 })
  // A missing admitted worker must block offline navigation even if another runtime cache has it.
  const missing = await page.evaluate(async () => {
    const stateCache = await caches.open('kg-python-learning-v1-' + encodeURIComponent('/agentic-graph/') + '-state')
    const pointer = await (await stateCache.match(new URL('__learning_state__', location.href).href)).json()
    const cache = await caches.open(pointer.active.cache), key = (await cache.keys()).find(request => request.url.includes('/pythonWorker-'))
    if (!key) throw new Error('No admitted Python worker')
    const response = await cache.match(key), bytes = [...new Uint8Array(await response.arrayBuffer())], type = response.headers.get('content-type')
    await cache.delete(key); return { name: pointer.active.cache, url: key.url, bytes, type }
  })
  const rejected = await page.reload({ waitUntil: 'domcontentloaded' }); assert.equal(rejected.status(), 503)
  await page.getByText('Offline asset', { exact: false }).waitFor()
  await page.evaluate(async value => (await caches.open(value.name)).put(value.url, new Response(new Uint8Array(value.bytes), { headers: { 'content-type': value.type } })), missing)
  await page.reload({ waitUntil: 'domcontentloaded' }); await pane.waitFor({ timeout: 60000 })
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  await awaitSource(lessons[0].solution)
  assert.equal(await editor.inputValue(), lessons[0].solution)
  assert.deepEqual(errors, [])
  assert.equal(sourceState(), before, 'source must stay frozen throughout the proof')
  const evidence = { revision, checkoutRevision, sourceState: before, kind: 'native-production-build-local-browser', offlineReloadProven: true,
    nativeLessonFilesProven: true, nativeLessonSaveReloadProven: true, toolRegistrationProven: true, narrowDesktopPaneProven: true, mainCanvasSceneProven: true, monacoEditorRoundTripProven: true, viewSwitchPreservesRun: true, toolHost: 'controlled-registerTool-browser-host', discovery,
    installMs, reloadMs, closureBytes: manifest.bytes, closureFiles: manifest.files.length, outcomes, corruptionBlocked: true,
    pageErrors: errors, remoteRequestsBlocked: [...new Set(remote)], failedBackgroundRequests: [...new Set(failedRequests)], productionDeploymentProven: false, learnerSessionProven: false }
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  evidenceWritten = true
  console.log(JSON.stringify({ status: 'passed', output, ...evidence }, null, 2))
} catch (error) {
  console.error('Browser warnings:', consoleWarnings)
  if (page) { console.error('Page state:', await page.evaluate(() => ({ url: location.href, readyState: document.readyState, serviceWorker: Boolean(navigator.serviceWorker?.controller) })).catch(() => ({}))); console.error('Visible failure:', (await page.locator('body').innerText()).slice(-12000)); console.error('Editor values:', await page.locator('textarea').evaluateAll(elements => elements.map(element => ({ label: element.getAttribute('aria-label'), value: element.value.slice(0, 2000) })))); await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {}) }
  throw error
} finally { await browser?.close(); await new Promise(resolve => server?.httpServer.close(resolve) || resolve()) }

assert.ok(evidenceWritten, 'full offline acceptance must write its evidence before success')
