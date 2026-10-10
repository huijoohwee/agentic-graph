import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const graphRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const canvasRoot = path.join(graphRoot, 'canvas')
const runtimeDemoLauncher = path.join(graphRoot, 'scripts/run-runtime-readiness-demo.mjs')
const canonicalRoot = path.dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: graphRoot, encoding: 'utf8',
}).trim())
const workspaceRoot = path.dirname(canonicalRoot)
const canonicalGraphPath = path.basename(canonicalRoot)
const viewport = { width: 390, height: 844 }
const observabilityPort = readPort('AG_OBSERVABILITY_E2E_PORT', 5175)
const readinessPort = readPort('AG_RUNTIME_READINESS_E2E_PORT', 5185)
const viteBin = path.join(graphRoot, 'node_modules/vite/bin/vite.js')
const browserErrors = []
const httpFailures = []
let phase = 'preflight'
let browser
let server
let currentPage
let tempRoot
const servers = []
const journeys = {}
const network = { crossOriginBlocked: [], requests: [] }

function readPort(name, fallback) {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') return fallback
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`${name} must be a valid TCP port`)
  return port
}

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function sourceState(root) {
  return git(root, 'status', '--porcelain', '--untracked-files=all')
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', error => {
      if (error.code === 'EADDRINUSE') reject(new Error(`Port 127.0.0.1:${port} is occupied; the E2E will not reuse an existing server.`))
      else reject(error)
    })
    probe.listen(port, '127.0.0.1', () => probe.close(resolve))
  })
}

function capture(child, target) {
  const append = chunk => {
    target.value = (target.value + chunk.toString()).slice(-12000)
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
}

function spawnServer(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = { value: '' }
  capture(child, logs)
  servers.push(child)
  return { child, logs }
}

async function waitForPage(url, child, logs, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before ${url} was ready.\n${logs.value}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(400)
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}\n${logs.value}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5000),
  ])
  if (child.exitCode === null) {
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(2000)])
  }
}

async function createIsolatedPromptCatalog() {
  const configured = String(process.env.VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT || '').trim()
  const candidates = [
    configured && path.resolve(configured, 'PROMPT-PRESETS.md'),
    path.join(graphRoot, 'node_modules/agentic-os/runtime/agents/docs/PROMPT-PRESETS.md'),
    path.join(workspaceRoot, 'agentic-canvas-os/docs/PROMPT-PRESETS.md'),
  ].filter(Boolean)
  let source
  for (const candidate of candidates) {
    try {
      const contents = await readFile(candidate, 'utf8')
      if (!/id:\s*["']software-forensics["']/u.test(contents)) continue
      source = candidate
      break
    } catch {
      // Try the next installed, repository-owned catalog source.
    }
  }
  if (!source) throw new Error('No local shared or installed prompt catalog is available for the demo route.')
  const docsRoot = path.join(tempRoot, 'canvas-docs')
  const { mkdir } = await import('node:fs/promises')
  await mkdir(docsRoot, { recursive: true })
  await copyFile(source, path.join(docsRoot, 'PROMPT-PRESETS.md'))
  return { docsRoot, catalogSource: source }
}

function attachBrowserEvidence(page, origin, journey) {
  page.on('pageerror', error => browserErrors.push({ journey, kind: 'pageerror', message: error.message }))
  page.on('console', message => {
    if (message.type() === 'error') {
      const optionalReadme404 = message.text().includes('404')
        && httpFailures.some(failure => failure.journey === journey && failure.status === 404 && failure.path === '/docs/workspace-readme.md')
      if (!optionalReadme404) browserErrors.push({ journey, kind: 'console', message: message.text().slice(0, 500) })
    }
  })
  page.on('request', request => {
    try {
      const url = new URL(request.url())
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (url.origin !== origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__agentic_os_')) {
        network.requests.push({ journey, method: request.method(), origin: url.origin, path: url.pathname })
      }
    } catch {
      // Browser-internal URLs do not represent app network effects.
    }
  })
  page.on('response', response => {
    if (response.status() < 400) return
    try {
      const url = new URL(response.url())
      if (url.origin === origin) httpFailures.push({ journey, status: response.status(), path: url.pathname })
    } catch {
      // Browser-internal URLs are not server responses from this app.
    }
  })
  return page.context().route('**/*', route => {
    let url
    try { url = new URL(route.request().url()) } catch { return route.continue() }
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) {
      network.crossOriginBlocked.push({ journey, origin: url.origin, path: url.pathname })
      return route.abort()
    }
    return route.continue()
  })
}

async function mobileOverflow(page) {
  return page.evaluate(requestedWidth => {
    const actualWidth = window.visualViewport?.width || window.innerWidth
    const overflows = [...document.querySelectorAll('body *')].map(element => {
      const rect = element.getBoundingClientRect()
      return { tag: element.tagName.toLowerCase(), label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 60) || '',
        left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
    }).filter(element => element.right > actualWidth + 1 || element.left < -1)
      .sort((a, b) => b.right - a.right).slice(0, 8)
    return { requestedWidth, layoutWidth: window.innerWidth, visualWidth: actualWidth,
      documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, overflows }
  }, viewport.width)
}

async function verifyObservabilityJourney() {
  phase = 'observability-server'
  const manifestPath = path.join(tempRoot, 'observability-workspace.json')
  const manifest = {
    schema: 'agentic-canvas-os/observability-workspace/v1',
    title: 'Observability workspace',
    readOnly: true,
    repositories: [{ id: 'graph', label: 'Graph', path: canonicalGraphPath }],
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
  await assertPortAvailable(observabilityPort)
  const origin = `http://127.0.0.1:${observabilityPort}`
  const env = {
    ...process.env,
    AGENTIC_WORKSPACE_ROOT: workspaceRoot,
    VITE_OBSERVABILITY_WORKSPACE_MANIFEST: manifestPath,
  }
  server = spawnServer(process.execPath, [viteBin, '--configLoader', 'runner', '--config', path.join(canvasRoot, 'vite.observability.config.ts'),
    '--host', '127.0.0.1', '--port', String(observabilityPort), '--strictPort'], { cwd: canvasRoot, env })
  await waitForPage(`${origin}/observability/index.html`, server.child, server.logs)

  phase = 'observability-browser'
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true })
  currentPage = await context.newPage()
  await attachBrowserEvidence(currentPage, origin, 'observability')
  await currentPage.goto(`${origin}/observability/index.html`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await currentPage.getByRole('heading', { name: 'Observability workspace', exact: true }).waitFor({ timeout: 60000 })
  await currentPage.getByRole('button', { name: 'Repository', exact: true }).click()
  await currentPage.getByRole('menuitemradio', { name: 'Graph', exact: true }).click()
  await currentPage.getByLabel('Repository-relative scope').fill('src/runtime')
  await currentPage.getByRole('button', { name: 'Map scope', exact: true }).click()

  const sourceContext = currentPage.getByRole('region', { name: 'Exact-hash source context', exact: true })
  await currentPage.waitForFunction(() => document.querySelector('[aria-label="Exact-hash source context"]')?.textContent?.includes('Operation: map'), undefined, { timeout: 120000 })
  const mapText = await sourceContext.innerText()
  const revision = mapText.match(/Git revision:\s*([a-f0-9]{40})/u)?.[1]
  const scopeDigest = mapText.match(/scope digest:\s*([a-f0-9]{64})/u)?.[1]
  const rows = sourceContext.locator('ul li')
  const rowCount = await rows.count()
  assert.ok(revision, 'map result exposes a full Git revision')
  assert.ok(scopeDigest, 'map result exposes a scope SHA-256')
  assert.ok(rowCount > 0, 'map result lists at least one bounded source file')
  const firstRow = rows.first()
  const sourcePath = await firstRow.locator('code').nth(0).innerText()
  const sourceSha256 = await firstRow.locator('code').nth(1).innerText()
  assert.match(sourcePath, /^src\/runtime\//u)
  assert.match(sourceSha256, /^[a-f0-9]{64}$/u)
  await firstRow.getByRole('button', { name: 'Read exact hash', exact: true }).click()
  await currentPage.waitForFunction(() => document.querySelector('[aria-label="Exact-hash source context"]')?.textContent?.includes('Operation: read'), undefined, { timeout: 120000 })
  const excerpt = currentPage.getByRole('region', { name: 'Exact source excerpt', exact: true })
  await excerpt.locator('pre').waitFor({ timeout: 30000 })
  const readText = await excerpt.innerText()
  assert.ok(readText.includes(sourcePath), 'exact read identifies the mapped path')
  assert.ok(readText.includes(sourceSha256), 'exact read retains the mapped SHA-256')
  const excerptText = await excerpt.locator('pre').innerText()
  assert.ok(excerptText.trim().length > 0, 'exact-hash read returns source text')
  const overflow = await mobileOverflow(currentPage)
  assert.ok(overflow.documentWidth <= overflow.requestedWidth + 1, `Observability overflows mobile width: ${JSON.stringify(overflow)}`)
  journeys.observability = {
    route: '/observability/index.html',
    repository: 'Graph',
    scope: 'src/runtime',
    operation: 'map then exact-hash read',
    sourceRevision: revision,
    scopeSha256: scopeDigest,
    filesListed: rowCount,
    exactRead: { path: sourcePath, sha256: sourceSha256, excerptCharacters: excerptText.length },
    viewport,
    overflow,
  }
  await context.close()
  currentPage = undefined
  await stopServer(server.child)
  server = undefined
}

async function verifyReadinessDemoJourney(catalogRoot) {
  phase = 'readiness-server'
  await assertPortAvailable(readinessPort)
  const origin = `http://127.0.0.1:${readinessPort}`
  const env = {
    ...process.env,
    VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: catalogRoot,
    npm_config_ignore_scripts: 'true',
  }
  server = spawnServer(process.execPath, [runtimeDemoLauncher, '--host', '127.0.0.1', '--port', String(readinessPort), '--strictPort'], {
    cwd: graphRoot, env,
  })
  await waitForPage(`${origin}/81rv10/`, server.child, server.logs)

  phase = 'readiness-demo-browser'
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true })
  currentPage = await context.newPage()
  await attachBrowserEvidence(currentPage, origin, 'readiness-demo')
  await currentPage.goto(`${origin}/81rv10/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const preset = currentPage.getByRole('button', { name: 'Prompt preset', exact: true })
  await preset.waitFor({ timeout: 120000 })
  await preset.click()
  await currentPage.getByRole('menuitemradio', { name: 'Production Runtime Readiness · Demo only', exact: true }).click()
  await currentPage.waitForFunction(() => document.querySelector('button[aria-label="Prompt preset"]')?.textContent?.includes('Production Runtime Readiness'), undefined, { timeout: 30000 })

  const activationRequestIndex = network.requests.length
  await currentPage.getByRole('button', { name: 'Demo', exact: true }).click()
  const contentMarker = 'No model call or generated artifact.'
  await currentPage.waitForFunction(marker => {
    const editableText = [...document.querySelectorAll('textarea,input,[contenteditable="true"]')]
      .map(element => 'value' in element ? element.value : element.innerText || element.textContent || '')
      .join('\n')
    return document.body.innerText.includes(marker) || editableText.includes(marker)
  }, contentMarker, { timeout: 120000 })
  const bodyText = await currentPage.locator('body').innerText()
  const editableText = await currentPage.evaluate(() => [...document.querySelectorAll('textarea,input,[contenteditable="true"]')]
    .map(element => 'value' in element ? element.value : element.innerText || element.textContent || '').join('\n'))
  const documentText = `${bodyText}\n${editableText}`
  const activeSourceFile = currentPage.locator('nav[aria-label="Source files"] button[aria-current="page"]')
  await activeSourceFile.waitFor({ timeout: 30000 })
  const selectedDocumentPath = await activeSourceFile.getAttribute('title') || ''
  assert.match(selectedDocumentPath, /(?:^|\/)docs\/demos\/production-runtime-readiness\/[^/]+\/demo\.md$/u,
    'the generated readiness document is selected in Source Files')
  assert.match(documentText, /No model call or generated artifact/u)
  assert.match(documentText, /static local example/u)
  assert.match(documentText, /demo\.md/u)
  const activationRequests = network.requests.slice(activationRequestIndex)
  const modelLike = activationRequests.filter(request => request.method !== 'GET'
    && /(?:^|\/)(?:chat|completions?|responses?|generate|inference|provider|model|mcp)(?:\/|$)/iu.test(request.path))
  assert.deepEqual(modelLike, [], 'demo activation does not send a model/provider request')
  const overflow = await mobileOverflow(currentPage)
  assert.ok(overflow.documentWidth <= overflow.requestedWidth + 1, `Readiness demo overflows mobile width: ${JSON.stringify(overflow)}`)
  journeys.readinessDemo = {
    route: '/81rv10/',
    preset: 'Production Runtime Readiness · Demo only',
    localDocumentVisible: true,
    selectedDocumentPath,
    noModelRequestObserved: modelLike.length === 0,
    localDemoCopyVisible: true,
    requestsDuringActivation: activationRequests.map(({ method, path }) => `${method} ${path}`),
    viewport,
    overflow,
  }
  await context.close()
  currentPage = undefined
  await stopServer(server.child)
  server = undefined
}

let laneStateBefore
let canonicalStateBefore
try {
  if (observabilityPort === readinessPort) throw new Error('The two E2E server ports must differ.')
  phase = 'application-preparation'
  execFileSync('npm', ['run', 'predev:docs', '--workspace=@agentic-graph/canvas'], { cwd: graphRoot, stdio: 'inherit', timeout: 600000 })
  laneStateBefore = sourceState(graphRoot)
  canonicalStateBefore = sourceState(canonicalRoot)
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-graph-runtime-readiness-e2e-'))
  const { docsRoot, catalogSource } = await createIsolatedPromptCatalog()
  const executablePath = findLocalChromiumExecutable(process.env.AG_PRODUCTION_RUNTIME_E2E_CHROMIUM,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE)
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  await verifyObservabilityJourney()
  await verifyReadinessDemoJourney(docsRoot)
  const unexpectedHttpFailures = httpFailures.filter(failure => !(failure.journey === 'readiness-demo'
    && failure.status === 404 && failure.path === '/docs/workspace-readme.md'))
  assert.deepEqual(unexpectedHttpFailures, [], 'no unexpected local HTTP failures occur')
  assert.deepEqual(browserErrors, [], 'both local journeys have no browser or console errors')
  assert.deepEqual(network.crossOriginBlocked, [], 'both local journeys make no cross-origin HTTP(S) requests')
  assert.equal(sourceState(graphRoot), laneStateBefore, 'browser setup and demo leave the Graph worktree unchanged')
  assert.equal(sourceState(canonicalRoot), canonicalStateBefore, 'read-only source inspection leaves canonical Graph unchanged')
  const evidence = {
    schema: 'agentic-graph-production-runtime-readiness-local-e2e/v1',
    status: 'passed',
    source: { laneRevision: git(graphRoot, 'rev-parse', 'HEAD'), canonicalRevision: git(canonicalRoot, 'rev-parse', 'HEAD') },
    journeys,
    catalogSource,
    crossOriginRequestsBlocked: network.crossOriginBlocked.length,
    optionalWorkspaceReadme404s: httpFailures.length,
    browserErrors,
    productionRuntimeReady: false,
    deployedProductionVerified: false,
  }
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  const pageState = currentPage ? await currentPage.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(-5000),
  })).catch(() => null) : null
  console.error(JSON.stringify({
    status: 'failed', phase, error: error instanceof Error ? error.message : String(error),
    serverOutput: server?.logs.value || '', pageState, journeys, network, httpFailures, browserErrors,
  }, null, 2))
  throw error
} finally {
  await currentPage?.context().close().catch(() => {})
  await browser?.close().catch(() => {})
  for (const child of [...servers].reverse()) await stopServer(child).catch(() => {})
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
}
