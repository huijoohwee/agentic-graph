import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const script = fileURLToPath(import.meta.url), canvasRoot = resolve(dirname(script), '..')
const repositoryRoot = resolve(canvasRoot, '..')
const git = (...args) => execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' }).trim()
const output = join(repositoryRoot, 'data/outputs/design-browser-smoke')

async function verify() {
  const browser = await chromium.launch({ headless: true,
    executablePath: findLocalChromiumExecutable('', chromium.executablePath()) || undefined })
  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true,
    reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true })
  const page = await context.newPage(), errors = [], externalRequests = []
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()) })
  const base = process.env.AG_DESIGN_SMOKE_BASE_URL
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (!['data:', 'blob:'].includes(url.protocol) && url.origin !== base) {
      externalRequests.push(url.origin + url.pathname); await route.abort(); return
    }
    await route.continue()
  })
  await page.route('**/api/agent-swarm/workspace-source', route => route.fulfill({ contentType: 'application/json',
    headers: { 'cache-control': 'no-store' }, body: '{"code":"workspace_source_unselected"}' }))
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^Canvas View Mode:/ }).first().waitFor({ timeout: 120000 })
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      useGraphStore.setState({ workspaceViewMode: 'canvas', canvasRenderMode: '2d', canvas2dRenderer: 'd3',
        markdownDocumentName: 'design-review.md', markdownDocumentText: '---\ndesign:\n  intent: Clear local review\n---\n# Design review',
        graphData: { type: 'Graph', metadata: { kind: 'markdown', source: 'markdown:design-review.md' },
          nodes: [{ id: 'design-card', label: 'Design card', type: 'Frame', properties: {
            fill: '#ffffff', color: '#777777', backgroundColor: '#ffffff', opacity: 1,
            designTokens: { fill: 'canvas-accent' },
          } }], edges: [] }, graphDataRevision: 100 })
    })
    const inspect = () => page.evaluate(async () => {
      const { getAgenticGraphWebMcpToolRegistry } = await import('/src/features/agent-ready/webMcpToolRegistry.ts')
      return getAgenticGraphWebMcpToolRegistry().execute('agentic-graph.inspect_local_canvas_topology', {})
    })
    assert.equal((await inspect()).design.status, 'inactive')
    await page.getByRole('button', { name: /^Canvas View Mode:/ }).first().click()
    await page.getByRole('button', { name: '2D Renderer: Design', exact: true }).click()
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      useGraphStore.getState().setFloatingPanelView('design')
      useGraphStore.getState().setFloatingPanelOpen(true)
    })
    const panel = page.getByRole('region', { name: 'Design panel', exact: true })
    await panel.getByRole('button', { name: 'Open Tokens', exact: true }).click()
    const review = panel.getByRole('region', { name: 'Design Tokens', exact: true })
    await review.getByRole('heading', { name: 'Design token review' }).waitFor()
    const geometry = () => page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts'), state = useGraphStore.getState()
      return { positions: state.designFramePosById, sizes: state.designFrameSizeById, history: state.designHistoryByGraphMetaKey }
    })
    const initialGeometry = await geometry()
    const receipts = []
    for (const [width, theme] of [[360, 'light'], [360, 'dark'], [1280, 'light'], [1280, 'dark']]) {
      await page.setViewportSize({ width, height: 800 })
      await page.evaluate(theme => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.dataset.theme = theme
      }, theme)
      await review.getByText(new RegExp('^' + theme + ' ·')).waitFor()
      const projection = (await inspect()).design
      assert.equal(projection.status, 'ready'); assert.equal(projection.theme, theme)
      assert.equal(await review.getAttribute('data-design-context-key'), projection.semanticKey)
      assert.ok(projection.audit.findings.some(f => f.nodeId === 'design-card'))
      const dimensions = await review.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))
      assert.ok(dimensions.scroll <= dimensions.client + 1, 'Design review must not overflow horizontally')
      const format = review.getByRole('combobox', { name: 'Export format' })
      await format.selectOption('context-json')
      const button = review.getByRole('button', { name: 'Export locally' })
      const box = await button.boundingBox(); assert.ok(box && box.height >= 44 && box.width >= 44)
      await button.focus()
      assert.equal(await button.evaluate(el => el === document.activeElement), true)
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab')
      assert.equal(await button.evaluate(el => el.matches(':focus-visible')), true)
      const downloadPromise = page.waitForEvent('download')
      await page.keyboard.press('Enter')
      const download = await downloadPromise
      assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), projection)
      await download.delete()
      receipts.push({ width, theme, context: projection.semanticKey, overflow: false, keyboardExport: true })
    }
    assert.deepEqual(await geometry(), initialGeometry, 'Readback and export must preserve geometry and history')
    const beforeRevision = (await inspect()).design.semanticKey
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      useGraphStore.setState({ markdownDocumentText: '---\ndesign: []\n---', graphDataRevision: 101 })
    })
    await review.getByRole('alert').waitFor()
    assert.equal((await inspect()).design.status, 'invalid')
    assert.equal(await review.getByRole('button', { name: 'Export locally' }).count(), 0)
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      useGraphStore.setState({ markdownDocumentText: '---\ndesign:\n  intent: Updated local review\n---', graphDataRevision: 102 })
    })
    await review.getByRole('heading', { name: 'Design token review' }).waitFor()
    assert.notEqual((await inspect()).design.semanticKey, beforeRevision)
    await page.setViewportSize({ width: 360, height: 800 })
    // Modules are now cached. No server or provider is available during these interactions.
    await context.setOffline(true)
    const source = review.getByRole('button', { name: 'Inspect finding source' }).first()
    await source.tap()
    assert.equal(await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().selectedNodeId), 'design-card')
    await review.getByRole('combobox', { name: 'Export format' }).selectOption('tokens-css')
    const offlineDownload = page.waitForEvent('download')
    await review.getByRole('button', { name: 'Export locally' }).tap()
    const download = await offlineDownload, css = await readFile(await download.path(), 'utf8')
    assert.match(css, /--kg-canvas-accent:/); await download.delete()
    await page.evaluate(async () => {
      const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
      useGraphStore.getState().commitDesignFramePosHistory({ label: 'Design smoke move', patch: { 'design-card': { x: 96, y: 64 } } })
    })
    assert.deepEqual((await geometry()).positions['design-card'], { x: 96, y: 64 })
    await panel.getByRole('button', { name: 'Undo', exact: true }).tap()
    assert.deepEqual((await geometry()).positions, initialGeometry.positions)
    await panel.getByRole('button', { name: 'Redo', exact: true }).tap()
    assert.deepEqual((await geometry()).positions['design-card'], { x: 96, y: 64 })
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
    await mkdir(output, { recursive: true })
    await page.screenshot({ path: join(output, 'design-mobile-dark.png') })
    assert.deepEqual(errors, [], 'No browser runtime errors')
    assert.deepEqual(externalRequests, [], 'Design review must make zero external requests')
    await writeFile(join(output, 'receipt.json'), JSON.stringify({ head: process.env.AG_DESIGN_EXPECTED_HEAD,
      receipts, invalidInput: true, revisionInvalidation: true, cachedOffline: true, touchSelection: true, undoRedo: true, reducedMotion: true,
      externalRequests, runtimeErrors: errors, scope: 'local candidate; no production or complete accessibility claim' }, null, 2) + '\n')
    console.log('Design browser smoke passed:', output)
  } finally { await context.close(); await browser.close() }
}

async function run() {
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Browser proof requires a clean candidate')
  const head = git('rev-parse', 'HEAD'), root = await mkdtemp(join(tmpdir(), 'design-browser-smoke-'))
  try {
    for (const [key, suffix] of Object.entries({ VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: 'docs',
      VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: 'canvas-docs',
      VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: 'seeds', VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT: 'chat' })) {
      process.env[key] = join(root, suffix); await mkdir(process.env[key])
    }
    Object.assign(process.env, { VITE_BASE_PATH: '/', VITE_APEX_ROOT_ALIAS: '1',
      VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: '0', VITE_WORKSPACE_SEED_SYNC_ENABLED: '0',
      VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED: '0', VITE_AGENTIC_OS_GITHUB_WRITE_BASE_URL: '',
      VITE_AGENTIC_OS_STORAGE_BASE_URL: '', VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: '', VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN: '',
      AGENTIC_OS_SOURCE_REVISION: head, AG_DESIGN_EXPECTED_HEAD: head })
    process.chdir(canvasRoot)
    await runLocalViteBrowserSmoke({ logLabel: 'design-browser-smoke', devServerPort: '4193',
      baseUrlEnvName: 'AG_DESIGN_SMOKE_BASE_URL', verifierCommand: process.execPath, verifierArgs: [script, '--verify'],
      prepareBeforeStart: false, devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid' })
    assert.equal(git('rev-parse', 'HEAD'), head)
    assert.equal(git('status', '--porcelain', '--untracked-files=all'), '')
  } finally { await rm(root, { recursive: true, force: true }) }
}
(process.argv.includes('--verify') ? verify() : run()).catch(error => { console.error(error); process.exitCode = 1 })
