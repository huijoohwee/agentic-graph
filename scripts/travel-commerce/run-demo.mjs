import { spawn } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  DEMO_EVIDENCE_URL_PATTERN,
  evidenceFileName,
  readDemoReport,
} from './demo-evidence.mjs'

if (!process.argv.includes('--local-demo')) {
  throw new Error('Refusing to start deterministic service doubles without explicit --local-demo.')
}
const browserProof = process.argv.includes('--browser')
const presenter = process.argv.includes('--present')
if (browserProof && presenter) throw new Error('Choose either --browser proof or --present, not both.')

const output = await run('npm', [
  'run', 'travel-commerce:test', '--',
  '--disableConsoleIntercept',
  'cloudflare/workers/knowgrph-travel-commerce/test/evidence/demo-runner.test.ts',
], { capture: true })
const report = readDemoReport(output)

if (browserProof || presenter) {
  await run('npm', ['-C', 'canvas', 'run', 'prepare:linked-packages'])
  const evidenceName = evidenceFileName()
  const evidenceUrl = `/${evidenceName}`
  const evidencePath = new URL(`../../canvas/public/${evidenceName}`, import.meta.url)
  await writeFile(evidencePath, `${JSON.stringify(report)}\n`, { flag: 'wx' })
  try {
    if (browserProof) {
      await run(process.execPath, ['scripts/travel-commerce/verify-demo-browser.mjs', '--local-demo'], {
        env: { ...process.env, KG_TRAVEL_COMMERCE_DEMO_EVIDENCE_URL: evidenceUrl },
      })
    } else {
      await present(evidenceUrl)
    }
  } finally {
    await unlink(evidencePath).catch(() => undefined)
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const capture = options.capture === true
    const chunks = []
    const child = spawn(command, args, {
      cwd: new URL('../../', import.meta.url),
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: options.env ?? process.env,
    })
    if (capture) {
      child.stdout.on('data', chunk => {
        chunks.push(String(chunk))
        process.stdout.write(chunk)
      })
      child.stderr.on('data', chunk => {
        chunks.push(String(chunk))
        process.stderr.write(chunk)
      })
    }
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(chunks.join(''))
      else reject(new Error(`${command} exited ${code ?? signal ?? 'unknown'}`))
    })
  })
}

async function present(evidenceUrl) {
  if (!DEMO_EVIDENCE_URL_PATTERN.test(evidenceUrl)) throw new Error('Presenter evidence URL is outside the bounded demo namespace.')
  const port = Number(process.env.KG_TRAVEL_COMMERCE_DEMO_PORT || 5197)
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) throw new Error('Presenter port must be an integer from 1024 through 65535.')
  const baseUrl = process.env.KG_TRAVEL_COMMERCE_DEMO_URL || `http://127.0.0.1:${port}/__demo__/travel-commerce`
  const demoUrl = withEvidenceUrl(baseUrl, evidenceUrl)
  if (!isLoopback(demoUrl)) throw new Error('Travel-commerce presenter accepts loopback URLs only.')

  const output = []
  let server = null
  let browser = null
  let context = null
  try {
    if (!process.env.KG_TRAVEL_COMMERCE_DEMO_URL) {
      server = spawn(process.execPath, [
        '../node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--port', String(port), '--strictPort',
      ], {
        cwd: new URL('../../canvas/', import.meta.url),
        env: { ...process.env, BROWSER: 'none' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })
      server.stdout.on('data', chunk => output.push(String(chunk)))
      server.stderr.on('data', chunk => output.push(String(chunk)))
    }
    await waitForReady(demoUrl, server, output)
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ headless: false })
    context = await browser.newContext({ viewport: { width: 320, height: 800 }, serviceWorkers: 'allow' })
    const page = await context.newPage()
    await page.goto(demoUrl, { waitUntil: 'networkidle' })
    await page.locator('[data-kg-travel-commerce-runtime-evidence="passed"]').waitFor()
    const rehearsal = await rehearsePresenter(page, context, demoUrl)
    console.info(`TRAVEL_COMMERCE_DEMO_PRESENTER_REHEARSAL ${JSON.stringify(rehearsal)}`)
    console.info(`TRAVEL_COMMERCE_DEMO_PRESENTER_URL ${demoUrl}`)
    console.info('Presenter is ready. Close the presenter tab/window or press q, Enter, or Ctrl+C here to exit; evidence and the local server remain available until then.')
    await waitForPresenterExit(page, browser)
  } finally {
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    await stopServer(server)
  }
}

async function rehearsePresenter(page, context, demoUrl) {
  const timeoutMs = 15_000
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  const remaining = () => {
    const value = deadline - Date.now()
    if (value <= 0) throw new Error(`Presenter rehearsal exceeded its ${timeoutMs}ms deadline.`)
    return value
  }
  let offline = false
  try {
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations())
      .some(registration => Boolean(registration.active)), undefined, { timeout: remaining() })
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: 'networkidle', timeout: remaining() })
      await page.locator('[data-kg-travel-commerce-runtime-evidence="passed"]').waitFor({ timeout: remaining() })
    }
    await page.locator('[data-kg-travel-commerce-offline-ready="true"]').waitFor({ timeout: remaining() })
    const cachedInputs = await page.evaluate(async () => {
      const evidencePath = new URLSearchParams(window.location.search).get('evidence') || ''
      return {
        route: Boolean(await caches.match(window.location.href)),
        evidence: Boolean(evidencePath && await caches.match(new URL(evidencePath, window.location.origin).href)),
      }
    })
    if (!cachedInputs.route || !cachedInputs.evidence) {
      throw new Error(`Presenter rehearsal cache precondition failed: ${JSON.stringify(cachedInputs)}`)
    }
    const before = await readPresenterState(page)

    await context.setOffline(true)
    offline = true
    await page.locator('[data-kg-travel-commerce-connectivity="offline"]').waitFor({ timeout: remaining() })
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
      return state.browserEvidence?.offlineTransitions >= 1
    }, undefined, { timeout: remaining() })
    const offlineResponse = await page.goto(demoUrl, { waitUntil: 'domcontentloaded', timeout: remaining() })
    if (!offlineResponse?.fromServiceWorker()) throw new Error('Presenter rehearsal offline reload was not served by the demo service worker.')
    await page.locator('[data-kg-travel-commerce-runtime-evidence="passed"]').waitFor({ timeout: remaining() })
    await page.locator('[data-kg-travel-commerce-connectivity="offline"]').waitFor({ timeout: remaining() })
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
      return state.browserEvidence?.offlineReloads >= 1
    }, undefined, { timeout: remaining() })
    const duringOffline = await readPresenterState(page)

    await context.setOffline(false)
    offline = false
    await page.locator('[data-kg-travel-commerce-connectivity="online"]').waitFor({ timeout: remaining() })
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
      return state.browserEvidence?.reconnects >= 1
    }, undefined, { timeout: remaining() })
    const afterNetworkReconnect = await readPresenterState(page)
    await page.locator('[data-kg-travel-commerce-beat="8"]').click({ timeout: remaining() })
    await page.locator('[data-kg-travel-commerce-active-beat="8"]').waitFor({ timeout: remaining() })
    await page.locator('[data-kg-travel-commerce-detail="beat8-browser-session"]').waitFor({ timeout: remaining() })
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
      return state.selectedBeat === 8
    }, undefined, { timeout: remaining() })
    const ready = await readPresenterState(page)
    const evidence = ready.browserEvidence
    const renderedEvidence = await readRenderedPresenterEvidence(page)
    if (
      evidence.offlineTransitions < 1
      || evidence.offlineReloads < 1
      || evidence.reconnects < 1
      || evidence.lostObservations !== 0
      || evidence.observationsAfterLastReconnect < evidence.observationsAtLastOffline
      || afterNetworkReconnect.observations !== evidence.observationsAfterLastReconnect
      || ready.selectedBeat !== 8
      || renderedEvidence.offlineTransitions !== String(evidence.offlineTransitions)
      || renderedEvidence.offlineReloads !== String(evidence.offlineReloads)
      || renderedEvidence.reconnects !== String(evidence.reconnects)
      || renderedEvidence.observationsAtLastOffline !== String(evidence.observationsAtLastOffline)
      || renderedEvidence.observationsAfterLastReconnect !== String(evidence.observationsAfterLastReconnect)
      || renderedEvidence.lostObservations !== '0'
    ) throw new Error(`Presenter rehearsal evidence failed: ${JSON.stringify({ ready, renderedEvidence })}`)
    return {
      schema: 'knowgrph-travel-commerce-presenter-rehearsal/v1',
      status: 'passed',
      durationMs: Date.now() - startedAt,
      deadlineMs: timeoutMs,
      serviceWorkerReload: true,
      selectedBeat: ready.selectedBeat,
      observationsBeforeOffline: before.observations,
      observationsOffline: duringOffline.observations,
      observationsAfterReconnect: afterNetworkReconnect.observations,
      observationsAtPresenterReady: ready.observations,
      offlineTransitions: evidence.offlineTransitions,
      offlineReloads: evidence.offlineReloads,
      reconnects: evidence.reconnects,
      lostObservations: evidence.lostObservations,
      visibleEvidenceMatched: true,
    }
  } finally {
    if (offline) await context.setOffline(false).catch(() => undefined)
  }
}

function readPresenterState(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
    return {
      selectedBeat: state.selectedBeat ?? null,
      observations: Array.isArray(state.observations) ? state.observations.length : 0,
      browserEvidence: state.browserEvidence ?? {},
    }
  })
}

async function readRenderedPresenterEvidence(page) {
  const rows = await page.locator('[data-kg-travel-commerce-detail="beat8-browser-session"] dl > div').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [
    node.querySelector('dt')?.textContent?.trim() || '',
    node.querySelector('dd')?.textContent?.trim() || '',
  ])))
  return {
    offlineTransitions: rows['Offline transitions'],
    offlineReloads: rows['Offline reloads'],
    reconnects: rows.Reconnects,
    observationsAtLastOffline: rows['Observations at last offline'],
    observationsAfterLastReconnect: rows['Observations after last reconnect'],
    lostObservations: rows['Lost observations'],
  }
}

function waitForPresenterExit(page, browser) {
  return new Promise(resolve => {
    let settled = false
    const stdin = process.stdin
    const restoreRawMode = stdin.isTTY && typeof stdin.setRawMode === 'function' ? Boolean(stdin.isRaw) : null
    const finish = reason => {
      if (settled) return
      settled = true
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
      stdin.off('data', onInput)
      if (restoreRawMode != null) stdin.setRawMode(restoreRawMode)
      stdin.pause()
      console.info(`TRAVEL_COMMERCE_DEMO_PRESENTER_EXIT ${reason}`)
      resolve()
    }
    const onSigint = () => finish('sigint')
    const onSigterm = () => finish('sigterm')
    const onInput = chunk => {
      const value = String(chunk)
      if (value.includes('\u0003')) finish('presenter-keyboard-sigint')
      else if (value.includes('q') || value.includes('Q') || value.includes('\r') || value.includes('\n') || value.includes('\u001b')) finish('presenter-keyboard-exit')
    }
    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)
    if (stdin.isTTY) {
      if (restoreRawMode != null) stdin.setRawMode(true)
      stdin.resume()
      stdin.on('data', onInput)
    }
    page.once('close', () => finish('presenter-tab-closed'))
    browser.once('disconnected', () => finish('presenter-window-closed'))
  })
}

async function waitForReady(url, child, output) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
      throw new Error(`Canvas demo server exited early (${child.exitCode}).\n${output.join('').slice(-4_000)}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Bounded readiness polling; the next iteration retries.
    }
    await delay(250)
  }
  throw new Error(`Canvas demo server was not ready within 60 seconds.\n${output.join('').slice(-4_000)}`)
}

async function stopServer(server) {
  if (!server || server.exitCode != null) return
  server.kill('SIGTERM')
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(3_000)])
  if (server.exitCode == null) server.kill('SIGKILL')
}

function isLoopback(value) {
  const host = new URL(value).hostname
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function withEvidenceUrl(value, evidence) {
  const url = new URL(value)
  url.searchParams.set('evidence', evidence)
  return url.href
}
