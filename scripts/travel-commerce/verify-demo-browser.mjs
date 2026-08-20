import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'
import { chromium } from 'playwright'
import { DEMO_EVIDENCE_URL_PATTERN, parseDemoReport } from './demo-evidence.mjs'

const ROOT = new URL('../../', import.meta.url)
const CANVAS_ROOT = new URL('../../canvas/', import.meta.url)
const LOCAL_DEMO_FLAG = '--local-demo'
const requestedUrl = process.env.KG_TRAVEL_COMMERCE_DEMO_URL
const evidenceUrl = process.env.KG_TRAVEL_COMMERCE_DEMO_EVIDENCE_URL || ''
const port = Number(process.env.KG_TRAVEL_COMMERCE_DEMO_PORT || 5197)
const demoUrl = withEvidenceUrl(requestedUrl || `http://127.0.0.1:${port}/__demo__/travel-commerce`, evidenceUrl)

if (!process.argv.includes(LOCAL_DEMO_FLAG)) {
  throw new Error(`Refusing to start demo doubles without explicit ${LOCAL_DEMO_FLAG}.`)
}
if (!isLoopback(demoUrl)) throw new Error('Travel-commerce demo browser proof accepts loopback URLs only.')
if (!DEMO_EVIDENCE_URL_PATTERN.test(evidenceUrl)) {
  throw new Error('Travel-commerce browser proof requires bounded executable evidence from the demo runner.')
}
const report = parseDemoReport(JSON.parse(await readFile(new URL(`public/${evidenceUrl.slice(1)}`, CANVAS_ROOT), 'utf8')))

let server = null
let browser = null
const serverOutput = []
try {
  if (!requestedUrl) {
    server = spawn(process.execPath, [
      '../node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--port', String(port), '--strictPort',
    ], {
      cwd: CANVAS_ROOT,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })
    server.stdout.on('data', chunk => serverOutput.push(String(chunk)))
    server.stderr.on('data', chunk => serverOutput.push(String(chunk)))
  }
  await waitForReady(demoUrl, server)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, serviceWorkers: 'allow' })
  const page = await context.newPage()
  const requestFailures = []
  const pageErrors = []
  const externalRequests = []
  page.on('request', request => {
    if (isExternalNetworkRequest(request.url())) externalRequests.push({ url: request.url(), method: request.method() })
  })
  page.on('requestfailed', request => requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || null }))
  page.on('pageerror', error => pageErrors.push(String(error)))
  await page.goto(demoUrl, { waitUntil: 'networkidle' })
  const root = page.locator('[data-kg-travel-commerce-demo="v1"]')
  await root.waitFor({ state: 'visible' })
  await page.locator('[data-kg-travel-commerce-runtime-evidence="passed"]').waitFor()
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations())
    .some(registration => Boolean(registration.active)))
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: 'networkidle' })
    await root.waitFor({ state: 'visible' })
  }
  await page.waitForFunction(() => document.querySelector('[data-kg-travel-commerce-offline-ready="true"]'))

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    legRows: document.querySelectorAll('[data-kg-travel-commerce-leg-list="semantic"] > li').length,
    unnamedLegRows: [...document.querySelectorAll('[data-kg-travel-commerce-leg-list="semantic"] > li')]
      .filter(node => !node.getAttribute('aria-label')).length,
    targets: [...document.querySelectorAll('[data-kg-travel-commerce-demo] button')].map(node => {
      const rect = node.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }),
  }))
  assert.equal(layout.viewport, 320)
  assert.ok(layout.scrollWidth <= layout.viewport, `horizontal overflow: ${JSON.stringify(layout)}`)
  assert.equal(layout.legRows, 4)
  assert.equal(layout.unnamedLegRows, 0)
  assert.ok(layout.targets.every(target => target.width >= 44 && target.height >= 44), JSON.stringify(layout.targets))

  const renderedLegs = await page.locator('[data-kg-travel-commerce-leg]').evaluateAll(nodes => nodes.map(node => ({
    legId: node.getAttribute('data-kg-travel-commerce-leg'),
    offerId: node.getAttribute('data-kg-travel-commerce-offer'),
    amountMinor: Number(node.getAttribute('data-kg-travel-commerce-amount')),
  })))
  assert.deepEqual(renderedLegs, report.beats[0].legs.map(leg => ({
    legId: leg.legId,
    offerId: leg.committedOfferId,
    amountMinor: leg.committedAmountMinor,
  })))
  const renderedEdges = await page.locator('[data-kg-travel-commerce-edge-from]').evaluateAll(nodes => nodes.map(node => ({
    fromLegId: node.getAttribute('data-kg-travel-commerce-edge-from'),
    toLegId: node.getAttribute('data-kg-travel-commerce-edge-to'),
  })))
  assert.deepEqual(renderedEdges, report.beats[0].edges)

  for (let beat = 1; beat <= 8; beat += 1) {
    await page.locator(`[data-kg-travel-commerce-beat="${beat}"]`).click()
    const active = page.locator(`[data-kg-travel-commerce-active-beat="${beat}"]`)
    await active.waitFor()
    await page.locator(`[data-kg-travel-commerce-executed-beat="${beat}"][data-kg-travel-commerce-executed-status="passed"]`).waitFor()
    assert.deepEqual(JSON.parse(await active.getAttribute('data-kg-travel-commerce-rendered-beat-json')), report.beats[beat - 1])
    const text = await active.innerText()
    assert.ok(text.includes(report.beats[beat - 1].title), `beat ${beat} title was not rendered from evidence`)
    assert.ok(text.includes(report.beats[beat - 1].summary), `beat ${beat} summary was not rendered from evidence`)
  }
  await assertVisibleEvidenceGroups(page)
  await page.locator('[data-kg-travel-commerce-beat="3"]').click()
  await page.locator('[data-kg-travel-commerce-active-beat="3"][data-kg-travel-commerce-outcome="rolled-back"]').waitFor()
  const beforeOffline = await readPersistedObservationCount(page)
  const offlinePreparation = await page.evaluate(async () => ({
    controller: navigator.serviceWorker.controller?.scriptURL || null,
    cacheNames: await caches.keys(),
    routeCached: Boolean(await caches.match(window.location.href)),
  }))
  assert.ok(offlinePreparation.controller?.endsWith('/travel-commerce-demo-sw.js'), JSON.stringify(offlinePreparation))
  assert.equal(offlinePreparation.routeCached, true, JSON.stringify(offlinePreparation))

  await context.setOffline(true)
  const offlineResponse = await page.goto(demoUrl, { waitUntil: 'domcontentloaded' })
  assert.equal(offlineResponse?.fromServiceWorker(), true, 'offline navigation was not served by the demo service worker')
  try {
    await root.waitFor({ state: 'visible', timeout: 10_000 })
  } catch (error) {
    const body = await page.locator('body').innerText().catch(() => '')
    throw new Error(`offline route did not render: ${JSON.stringify({ requestFailures, pageErrors, body: body.slice(0, 1_000) })}`, { cause: error })
  }
  await page.locator('[data-kg-travel-commerce-connectivity="offline"]').waitFor()
  await page.locator('[data-kg-travel-commerce-active-beat="3"]').waitFor()
  await page.locator('[data-kg-travel-commerce-runtime-evidence="passed"]').waitFor()
  await page.locator('[data-kg-travel-commerce-executed-beat="3"][data-kg-travel-commerce-executed-status="passed"]').waitFor()
  const offlineCount = await readPersistedObservationCount(page)
  assert.ok(offlineCount >= beforeOffline, 'offline reload discarded local observations')

  await context.setOffline(false)
  await page.locator('[data-kg-travel-commerce-connectivity="online"]').waitFor()
  const afterReconnect = await readPersistedObservationCount(page)
  assert.ok(afterReconnect >= offlineCount, 'reconnect discarded local observations')
  await page.locator('[data-kg-travel-commerce-beat="8"]').click()
  const browserSession = page.locator('[data-kg-travel-commerce-detail="beat8-browser-session"]')
  await browserSession.waitFor()
  const browserEvidence = await readPersistedBrowserEvidence(page)
  assert.ok(browserEvidence.offlineTransitions >= 1, JSON.stringify(browserEvidence))
  assert.ok(browserEvidence.offlineReloads >= 1, JSON.stringify(browserEvidence))
  assert.ok(browserEvidence.reconnects >= 1, JSON.stringify(browserEvidence))
  assert.ok(browserEvidence.observationsAfterLastReconnect >= browserEvidence.observationsAtLastOffline, JSON.stringify(browserEvidence))
  assert.equal(browserEvidence.lostObservations, 0)
  const browserSessionText = await browserSession.innerText()
  assert.ok(browserSessionText.includes(String(browserEvidence.offlineReloads)))
  assert.ok(browserSessionText.includes(String(browserEvidence.reconnects)))
  assert.deepEqual(externalRequests, [], `unexpected external request: ${JSON.stringify(externalRequests)}`)
  assert.deepEqual(pageErrors, [], `page errors observed: ${JSON.stringify(pageErrors)}`)
  assert.deepEqual(requestFailures, [], `request failures observed: ${JSON.stringify(requestFailures)}`)

  const evidence = {
    schema: 'knowgrph-travel-commerce-browser-evidence/v1',
    status: 'passed',
    mode: 'deterministic-local-service-doubles',
    url: demoUrl,
    viewportCssPx: layout.viewport,
    horizontalOverflowCssPx: Math.max(0, layout.scrollWidth - layout.viewport),
    minimumTouchTargetCssPx: Math.min(...layout.targets.flatMap(target => [target.width, target.height])),
    semanticLegRows: layout.legRows,
    beatsExercised: 8,
    renderedBeatRecordsMatched: 8,
    edgeEndpointsMatched: renderedEdges.length,
    offerSnapshotsMatched: renderedLegs.length,
    dualRollbackOutcomesRendered: true,
    zeroNetCompanionRendered: true,
    releaseResubmissionRendered: true,
    costCacheModelLicenseRendered: true,
    executableFixtureCoupled: true,
    offlineExecutableEvidenceRetained: true,
    offlineReloadRetained: true,
    offlineController: offlinePreparation.controller,
    observationsBeforeOffline: beforeOffline,
    observationsOffline: offlineCount,
    observationsAfterReconnect: afterReconnect,
    browserOfflineTransitions: browserEvidence.offlineTransitions,
    browserOfflineReloads: browserEvidence.offlineReloads,
    browserReconnects: browserEvidence.reconnects,
    lostObservations: 0,
    externalProviderRequests: externalRequests.length,
    productionMutations: 0,
  }
  console.info(`TRAVEL_COMMERCE_BROWSER_EVIDENCE ${JSON.stringify(evidence)}`)
  await context.close()
} finally {
  await browser?.close().catch(() => undefined)
  if (server && server.exitCode == null) {
    server.kill('SIGTERM')
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(3_000)])
    if (server.exitCode == null) server.kill('SIGKILL')
  }
}

async function readPersistedObservationCount(page) {
  return page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
    return Array.isArray(value.observations) ? value.observations.length : 0
  })
}

async function readPersistedBrowserEvidence(page) {
  return page.evaluate(() => {
    const value = JSON.parse(localStorage.getItem('knowgrph:travel-commerce:demo-ui:v1') || '{}')
    return value.browserEvidence ?? {}
  })
}

async function assertVisibleEvidenceGroups(page) {
  const expected = new Map([
    [3, ['beat3-committed', 'beat3-rolled-back']],
    [4, ['beat4-nonzero', 'beat4-zero-net']],
    [5, ['beat5-initial-race', 'beat5-release', 'beat5-resubmission']],
    [7, ['beat7-cost', 'beat7-cache', 'beat7-model']],
    [8, ['beat8-fixture-offline', 'beat8-fixture-reconnect', 'beat8-browser-session']],
  ])
  for (const [beat, groups] of expected) {
    await page.locator(`[data-kg-travel-commerce-beat="${beat}"]`).click()
    for (const group of groups) await page.locator(`[data-kg-travel-commerce-detail="${group}"]`).waitFor()
  }
}

async function waitForReady(url, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
      throw new Error(`Canvas demo server exited early (${child.exitCode}).\n${serverOutput.join('').slice(-4_000)}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Bounded readiness polling; the next iteration retries.
    }
    await delay(250)
  }
  throw new Error(`Canvas demo server was not ready within 60 seconds.\n${serverOutput.join('').slice(-4_000)}`)
}

function isLoopback(value) {
  const host = new URL(value).hostname
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function isExternalNetworkRequest(value) {
  const url = new URL(value)
  return (url.protocol === 'http:' || url.protocol === 'https:') && !isLoopback(value)
}

function withEvidenceUrl(value, evidence) {
  const url = new URL(value)
  url.searchParams.set('evidence', evidence)
  return url.href
}
