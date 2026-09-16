import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const output = resolve('../data/outputs/agent-mission-browser-smoke')
const browser = await chromium.launch({ executablePath: findLocalChromiumExecutable() || undefined, headless: true })
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })
const page = await context.newPage(), errors = [], requests = [], pending = new Set()
page.setDefaultTimeout(15000)
let peak = 0
page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (!request.url().includes('/api/agent-swarm/')) return
  requests.push({ operation: request.url().split('/').at(-1), at: Date.now() }); pending.add(request); peak = Math.max(peak, pending.size)
})
for (const event of ['requestfinished', 'requestfailed']) page.on(event, request => pending.delete(request))
const mission = page.getByRole('region', { name: 'Agentic OS mission control', exact: true })
const selected = page.getByRole('region', { name: 'Selected run evidence' })
const waitText = async (locator, text) => {
  await locator.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 })
}
const choose = async id => {
  const row = mission.locator('tr').filter({ hasText: id }); await row.focus(); await page.keyboard.press('Enter')
  await selected.getByRole('heading', { name: 'Run ' + id, exact: true }).waitFor({ state: 'visible' })
}
async function authoredSnapshot() {
  return page.evaluate(async () => {
    const { useGraphStore } = await import('/src/hooks/useGraphStore.ts'), state = useGraphStore.getState()
    return JSON.stringify(Object.fromEntries(['graphData', 'selectedNodeIds', 'selectedEdgeIds', 'nodePositions', 'history', 'historyIndex', 'sourceFiles'].map(key => [key, state[key]])))
  })
}
async function switchPrincipal(id) {
  const path = process.env.AGENTIC_OS_DURABLE_RUN_HOST_CONFIG, config = JSON.parse(await readFile(path, 'utf8'))
  config.authorization = 'Bearer ' + createHash('sha256').update('private-browser-fixture-' + id).digest('hex')
  await writeFile(path, JSON.stringify(config), { mode: 0o600 })
}
try {
  await mkdir(output, { recursive: true })
  await page.goto(process.env.AG_MISSION_SMOKE_BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.__AG_MAIN_PANEL_OPEN_READY__ === true, null, { timeout: 120000 })
  const floating = page.locator('[data-kg-floating-panel-root="true"]')
  if (await floating.count()) await floating.getByRole('button', { name: 'Close', exact: true }).click()
  assert.equal(requests.length, 0, 'Dashboard must not load or poll before opening')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('kg:mainPanelOpen', { detail: { tab: 'dashboard' } })))
  await waitText(mission, '2 retained matches')
  assert.equal(await mission.getByText('private-run', { exact: true }).count(), 0)
  const before = await authoredSnapshot()
  await choose('baseline-run')
  assert.equal(await floating.count(), 0, 'Row keyboard selection must not open another panel')
  console.log('Mission browser: authorized discovery and keyboard selection passed')
  await waitText(selected, '32/34 retained spans')
  await selected.getByText('Source ownership', { exact: true }).click()
  assert.ok((await selected.locator('a').first().getAttribute('href')).includes(process.env.AG_MISSION_EXPECTED_HEAD))
  await waitText(selected, 'Project allocation')
  const draft = selected.getByRole('button', { name: /draft · draft · attempt 2/ })
  // The native span label includes task and attempt identity; one selection follows all views.
  const actualDraft = await draft.count() ? draft : selected.getByRole('button').filter({ hasText: /draft.*attempt 2/ }).first()
  await actualDraft.click()
  console.log('Mission browser: span selected')
  await waitText(selected, 'Span draft-2')
  await page.locator('#agent-run-view-timing-tab').click()
  assert.equal(await selected.getByRole('button', { pressed: true }).count(), 1)
  await waitText(selected, 'exclusive observed')
  await page.locator('#agent-run-view-topology-tab').click()
  await selected.getByRole('img', { name: /Observed spans and causal links/ }).waitFor()
  assert.equal(await selected.getByRole('list', { name: 'Topology nodes' }).getByRole('button', { pressed: true }).count(), 1)
  await selected.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await selected.getByRole('button', { name: 'Fit topology', exact: true }).click()
  const canvas = await selected.locator('canvas').boundingBox()
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + 100); await page.mouse.down()
  await page.mouse.move(canvas.x + canvas.width / 2 + 20, canvas.y + 120); await page.mouse.up()
  await page.locator('#agent-run-view-evidence-tab').click()
  await selected.getByRole('button', { name: 'Evaluate selected subject' }).click()
  await waitText(selected, 'Span draft-2 · reported')
  console.log('Mission browser: views and subject evaluation passed')
  await selected.getByRole('button', { name: 'Next span page' }).click()
  await waitText(selected, '2/34 retained spans')
  assert.equal(await selected.getByRole('button', { name: 'Evaluate selected subject' }).isDisabled(), true)
  await selected.getByRole('button', { name: 'First span page' }).click()
  await waitText(selected, '32/34 retained spans')
  await selected.getByRole('button', { name: 'Select whole run' }).click()
  await selected.getByRole('button', { name: 'Use run as baseline' }).click()
  await choose('candidate-run')
  await selected.getByRole('button', { name: 'Compare candidate' }).click()
  await selected.getByLabel('Comparison evidence').waitFor()
  await waitText(selected, 'insufficient-evidence')
  const download = page.waitForEvent('download')
  await selected.getByRole('button', { name: 'Export metadata' }).click()
  const saved = await download; await saved.saveAs(resolve(output, 'metadata.json'))
  const metadata = JSON.parse(await readFile(resolve(output, 'metadata.json'), 'utf8'))
  assert.equal(metadata.authority, false); assert.equal(metadata.runId, 'candidate-run')
  assert.equal(await authoredSnapshot(), before, 'Inspection must preserve authored graph, selection, layout, history and sources')
  const bounds = await mission.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
  assert.ok(bounds.width <= 360 && bounds.scroll <= bounds.width + 1, JSON.stringify(bounds))
  const manualCount = requests.length; await page.waitForTimeout(5200)
  assert.equal(requests.length, manualCount, 'Manual mode must be idle')
  await mission.getByRole('checkbox', { name: /Live/ }).check()
  await page.waitForTimeout(5400); assert.ok(requests.length > manualCount)
  await context.setOffline(true); await waitText(mission, 'Offline')
  const offlineCount = requests.length; await page.waitForTimeout(5400); assert.equal(requests.length, offlineCount)
  await page.locator('#agent-run-view-tree-tab').click()
  assert.ok(await selected.getByRole('list', { name: 'Span hierarchy' }).isVisible())
  await context.setOffline(false)
  await mission.getByRole('checkbox', { name: /Live/ }).uncheck()
  await switchPrincipal('other'); await mission.getByRole('button', { name: 'Refresh runs' }).click()
  await waitText(mission, '1 retained matches'); assert.equal(await selected.count(), 0)
  assert.equal(await mission.getByText('baseline-run', { exact: true }).count(), 0)
  await choose('private-run')
  await switchPrincipal('denied'); await mission.getByRole('button', { name: 'Refresh runs' }).click()
  await waitText(mission, 'principal_expired'); assert.equal(await selected.count(), 0)
  assert.equal(await mission.locator('tbody tr').count(), 0)
  assert.equal(peak, 1, 'Only one observation request may be in flight')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'mobile.png') })
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify({ sourceRevision: process.env.AG_MISSION_EXPECTED_HEAD,
    status: 'passed', fixtureOnly: true, providerAuthority: false, viewport: { width: 360, height: 800 },
    assertions: ['lazy-entry', 'authorized-discovery', 'keyboard-row', 'bounded-span-pages', 'shared-selection', 'native-topology',
      'subject-evaluation', 'comparison-insufficiency', 'source-join', 'allocation', 'metadata-export', 'authored-state-preserved',
      'mobile-fit', 'manual-idle', 'live-bounded', 'offline-inspection', 'scope-change', 'denial-clears-cache'], peak, requests }, null, 2))
  console.log('Agent mission browser smoke passed; fixture observations are not production proof.')
} catch (error) {
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  console.error((await mission.textContent().catch(() => 'Mission panel unavailable')).slice(0, 5000)); throw error
} finally { await browser.close() }
