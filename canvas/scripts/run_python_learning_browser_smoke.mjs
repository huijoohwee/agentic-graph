import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const canvas = resolve(dirname(fileURLToPath(import.meta.url)), '..'), root = resolve(canvas, '..')
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const output = resolve(process.env.PYTHON_LEARNING_PROOF_DIR || join(tmpdir(), `python-learning-proof-${revision.slice(0, 12)}`))
const scratch = await mkdtemp(join(tmpdir(), 'python-learning-browser-'))
let server, browser
try {
  await mkdir(output, { recursive: true })
  await symlink(join(root, 'node_modules'), join(scratch, 'node_modules'), 'dir')
  await writeFile(join(scratch, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/proof-entry.jsx"></script></body></html>')
  await writeFile(join(scratch, 'proof-entry.jsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import Page from '/@fs/${canvas}/src/features/testing/PythonLearningSmokePage.tsx';import '/@fs/${canvas}/src/index.css';createRoot(document.getElementById('root')).render(<Page/>);`)
  const proofPath = '/__python_learning_smoke'
  server = await createServer({ configFile: join(canvas, 'vite.config.ts'), configLoader: 'runner', root: canvas, cacheDir: join(scratch, 'vite-cache'),
    plugins: [{ name: 'python-learning-smoke-entry', configureServer(owner) {
      owner.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== proofPath) return next()
        const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/@fs/' + join(scratch, 'proof-entry.jsx') + '"></script></body></html>'
        response.setHeader('Content-Type', 'text/html'); response.end(await owner.transformIndexHtml(proofPath, html))
      })
    } }], server: { host: '127.0.0.1', port: 4197, strictPort: true, fs: { allow: [root, scratch, await realpath(scratch), dirname(await realpath(join(root, 'node_modules')))] } },
  })
  await server.listen(); const address = server.httpServer.address(), origin = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(process.env.PYTHON_LEARNING_BROWSER_CHANNEL ? { channel: process.env.PYTHON_LEARNING_BROWSER_CHANNEL } : {}), args: ['--enable-unsafe-swiftshader'] })
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  const page = await context.newPage(), errors = [], remote = []
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser page error:', error.message) })
  page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text().slice(0, 700)) })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === origin) return route.continue()
    remote.push(url.origin + url.pathname); return route.abort()
  })
  const started = performance.now()
  await page.goto(origin + proofPath, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const pane = page.getByRole('region', { name: 'Python learning workspace', exact: true })
  await pane.waitFor({ timeout: 60000 })
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  const labels = await page.getByRole('group', { name: 'Workspace panes', exact: true }).locator('label').allTextContents()
  assert.equal(labels[labels.findIndex(label => label.trim() === 'bin') + 1].trim(), 'Python')
  const editor = page.getByRole('textbox', { name: 'Python source text', exact: true })
  const lessons = await page.evaluate(() => window.__pythonLearningProof.lessons)
  const outcomes = [], flightFrames = []
  try {
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    const notice = page.getByText('Execution is paused while this tab is hidden.', { exact: false })
    assert.equal(await notice.isVisible(), true, 'hidden-tab denial is visible in mobile Code view')
    assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  } finally {
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
  }
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle', 'returning visible cannot auto-run')
  for (const lesson of lessons) {
    await page.getByLabel('Python lesson', { exact: true }).selectOption(lesson.id)
    await page.getByRole('button', { name: 'Code', exact: true }).click()
    if (lesson.id === 'drone') {
      await page.getByRole('button', { name: 'Load flight example', exact: true }).click()
      assert.equal(await editor.inputValue(), lesson.solution)
      assert.equal(await pane.getAttribute('data-learning-state'), 'idle', 'loading the example cannot execute it')
      await page.setViewportSize({ width: 1280, height: 900 })
    } else await editor.fill(lesson.solution)
    const runStarted = performance.now()
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    if (lesson.id === 'drone') {
      const phases = [
        { name: 'takeoff', xMin: -0.1, xMax: 0.1, low: 0.2, high: 1.8 },
        { name: 'flight', xMin: 0.5, xMax: 3.5, low: 1.9, high: 2.1 },
        { name: 'landing', xMin: 3.9, xMax: 4.1, low: 0.2, high: 1.8 },
      ]
      for (const phase of phases) {
        await page.waitForFunction(phase => {
          const state = window.__pythonLearningProof.read(), scene = state.result?.scene
          return state.state === 'running' && scene.x > phase.xMin && scene.x < phase.xMax && scene.altitude > phase.low && scene.altitude < phase.high
        }, phase)
        flightFrames.push({ phase: phase.name, elapsedMs: performance.now() - runStarted, scene: await page.evaluate(() => window.__pythonLearningProof.read().result.scene) })
        await page.screenshot({ path: join(output, `drone-${phase.name}.png`), fullPage: true })
        if (phase.name === 'flight') {
          await page.getByRole('button', { name: 'Pause', exact: true }).click()
          await page.waitForFunction(() => window.__pythonLearningProof.read().state === 'paused')
          const paused = await page.evaluate(() => JSON.stringify(window.__pythonLearningProof.read().result.scene))
          await page.waitForTimeout(250)
          assert.equal(await page.evaluate(() => JSON.stringify(window.__pythonLearningProof.read().result.scene)), paused)
          await page.getByRole('button', { name: 'Run', exact: true }).click()
        }
      }
    }
    await page.waitForFunction(() => window.__pythonLearningProof.read().state === 'completed')
    if (lesson.id === 'drone') assert.ok(performance.now() - runStarted >= 8500, 'flight must be visibly paced, including beyond the five-second compute limit')
    const state = await page.evaluate(() => window.__pythonLearningProof.read())
    assert.equal(state.result.grade.passed, true)
    outcomes.push({ lesson: lesson.id, ticks: state.result.scene.ticks, computeMs: state.result.computeMs, passed: true })
    await page.getByRole('button', { name: 'Results', exact: true }).click()
    await page.getByRole('button', { name: 'Save debrief', exact: true }).click()
    await page.getByText('Saved locally:', { exact: false }).waitFor()
  }
  await page.setViewportSize({ width: 375, height: 812 })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export debrief', exact: true }).click()
  const portable = await readFile(await (await downloaded).path())
  assert.equal(JSON.parse(portable.toString()).source, lessons.at(-1).solution)
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByLabel('Import learning debrief', { exact: true }).setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: portable })
  await page.getByText('Imported for inspection.', { exact: false }).waitFor()
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  await page.getByLabel('Import learning debrief', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
  await page.getByText('Invalid or oversized learning debrief.', { exact: true }).waitFor()
  await page.getByText('GameXR drone bench log', { exact: true }).click()
  const benchLog = { schema: 'gamexr-drone-bench-log/v1', profile: 'esp-drone-rpyt-bench/v1', physicalAircraft: false,
    records: [{ at: '2026-09-25T15:00:00.000Z', event: 'inhibited', value: 'Pilot disabled bench control' }] }
  const beforeBenchImport = await page.evaluate(() => JSON.stringify(window.__pythonLearningProof.read()))
  await page.getByLabel('Import GameXR drone bench log', { exact: true }).setInputFiles({ name: 'bench.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(benchLog)) })
  await page.getByText('GameXR log imported for inspection.', { exact: false }).waitFor()
  assert.match(await page.getByLabel('GameXR bench log summary').innerText(), /1 events · 0 control requests · 0 receiver reports · 1 inhibitions/)
  assert.equal(await page.evaluate(() => JSON.stringify(window.__pythonLearningProof.read())), beforeBenchImport, 'bench inspection cannot mutate the lesson or execute commands')
  await page.getByLabel('Import GameXR drone bench log', { exact: true }).setInputFiles({ name: 'physical.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...benchLog, physicalAircraft: true })) })
  await page.getByText('Invalid GameXR simulated bench log', { exact: false }).waitFor()
  assert.equal(await page.getByLabel('GameXR bench log summary').count(), 0, 'failed import clears the previous observation')
  await page.locator('.python-learning-result').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '375px page must not overflow horizontally')
  await page.evaluate(() => window.__pythonLearningProof.flush())
  await page.reload({ waitUntil: 'domcontentloaded' }); await pane.waitFor({ timeout: 60000 })
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle', 'reopening source never executes')
  assert.equal(await editor.inputValue(), lessons.at(-1).solution)
  await page.getByRole('button', { name: 'Results', exact: true }).click()
  await page.getByRole('button', { name: 'Load saved debriefs', exact: true }).click()
  await page.getByText(`${lessons.length} matching debriefs`, { exact: false }).waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  await page.getByRole('button', { name: 'Load rich editor', exact: true }).click()
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.getByLabel('Python lesson', { exact: true }).selectOption(lessons.at(-1).id)
  await page.locator('.monaco-editor').first().click({ position: { x: 120, y: 40 } })
  await page.keyboard.press('ControlOrMeta+A')
  const desktopSource = lessons.at(-1).solution + '# Unicode 保留 🧭\n'
  await page.keyboard.insertText(desktopSource)
  await page.waitForFunction(source => window.__pythonLearningProof.read().document.source === source, desktopSource)
  assert.equal(await pane.getAttribute('data-learning-state'), 'idle')
  const tokenKinds = await page.locator('.monaco-editor .view-lines').evaluate(element => new Set([...element.querySelectorAll('span')].map(span => span.className).filter(name => /^mtk/.test(name))).size)
  assert.ok(tokenKinds > 1, 'Python language tokens must be loaded in the native rich editor')
  const acknowledgement = await page.evaluate(async () => {
    const tools = window.__pythonLearningProof.tools, inspection = await tools.inspect()
    return tools.execute({ ...inspection.binding, operation: 'run', requestId: 'browser-rich-run' })
  })
  assert.ok(acknowledgement.runId, 'Run acknowledges the controller-issued identity before completion')
  await page.waitForFunction(() => window.__pythonLearningProof.read().state === 'completed')
  assert.equal(await page.evaluate(() => window.__pythonLearningProof.read().result.grade.passed), true)
  await pane.getByRole('button', { name: 'Results', exact: true }).click()
  await page.getByText('Lesson passed', { exact: false }).waitFor()
  await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true })
  // Execution and a position label alone do not establish a mounted 3D scene.
  const sharedCanvas = page.locator('[data-kg-three-canvas-owner="1"] canvas')
  await sharedCanvas.waitFor({ state: 'visible', timeout: 30000 })
  assert.ok(await sharedCanvas.evaluate(canvas => canvas.width > 100 && canvas.height > 100), 'native scene must have a nonzero render target')
  await pane.getByRole('button', { name: 'Code', exact: true }).click()
  await page.locator('.monaco-editor').first().click({ position: { x: 120, y: 40 } })
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('takeoff(2)\nhover(60)\n')
  await page.waitForFunction(() => window.__pythonLearningProof.read().document.source === 'takeoff(2)\nhover(60)\n')
  await pane.getByRole('button', { name: 'Run', exact: true }).click()
  await page.waitForFunction(() => window.__pythonLearningProof.read().state === 'completed')
  const airborne = await page.evaluate(() => window.__pythonLearningProof.read().result.scene)
  assert.ok(airborne.altitude > 1.9 && airborne.landed === false && airborne.hoverTicks === 60)
  await pane.getByRole('button', { name: 'View Canvas', exact: true }).click()
  assert.match(await page.getByLabel('Python lesson position', { exact: true }).innerText(), /airborne/)
  await page.screenshot({ path: join(output, 'drone-airborne.png'), fullPage: true })
  await page.evaluate(() => window.__pythonLearningProof.flush())
  assert.deepEqual(errors, [])
  const evidence = { revision, sourceState: execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }),
    kind: 'native-component-development-smoke', offlineReloadProven: false, toolRegistrationProven: false, mainCanvasMounted: true, droneAirborne: airborne,
    simulatedHiddenTabDenied: true, visibleReturnDoesNotRun: true, physicalBackgroundProven: false,
    elapsedMs: Math.round(performance.now() - started), outcomes, flightFrames, pageErrors: errors, remoteRequestsBlocked: remote }
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'passed', output, ...evidence }, null, 2))
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0]
  if (failedPage) console.error('Visible failure context:', (await failedPage.locator('body').innerText()).slice(-5000))
  throw error
} finally { await browser?.close(); await server?.close(); await rm(scratch, { recursive: true, force: true }) }
