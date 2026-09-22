import assert from 'node:assert/strict'
import { closeFloatingPanel } from './panel-close-helpers.mjs'
import { waitForMissionAsync } from './mission-card-face.mjs'

const SETTINGS_BODY_CONTROL = '#main-panel-settings-panel button[aria-label="Expand all sections"], #main-panel-settings-panel button[aria-label="Collapse all sections"]'

async function installEntryObservation(page) {
  await page.evaluate(() => {
    const startedAt = performance.now(), entries = []
    const snapshot = () => ({
      settingsSelected: document.querySelector('#main-panel-settings-tab')?.getAttribute('aria-selected'),
      settingsBodyMounted: !!document.querySelector('#main-panel-settings-panel button[aria-label="Expand all sections"], #main-panel-settings-panel button[aria-label="Collapse all sections"]'),
      dashboardSelected: document.querySelector('#main-panel-dashboard-tab')?.getAttribute('aria-selected'),
      mainPanels: document.querySelectorAll('[aria-label="Main panel"]').length,
      dashboards: document.querySelectorAll('[data-renderer="dashboard"]').length,
      missions: document.querySelectorAll('[role="region"][aria-label="Agent Mission"]').length,
    })
    const record = (phase, event) => {
      if (entries.length >= 32) return
      entries.push({ phase, elapsedMs: Math.round(performance.now() - startedAt), ...snapshot(),
        ...(event ? { type: event.type, trusted: event.isTrusted, pointerType: event.pointerType, button: event.button } : {}) })
    }
    const capture = event => {
      const target = event.target instanceof Element ? event.target.closest('#main-panel-settings-tab, #main-panel-dashboard-tab, [data-kg-toolbar-action="settings:open"]') : null
      if (target) record(target.id || 'settings:open', event)
    }
    const types = ['pointerdown', 'pointerup', 'click']
    for (const type of types) document.addEventListener(type, capture, true)
    window.__AG_MISSION_DASHBOARD_ENTRY__ = { entries, record, snapshot,
      dispose: () => { for (const type of types) document.removeEventListener(type, capture, true) } }
    record('observation-installed')
  })
}

async function finishEntryObservation(page, status) {
  let timer
  try {
    // A stalled input dispatch must not leave an unbounded diagnostic read behind it.
    return await Promise.race([
      page.evaluate(result => {
        const observation = window.__AG_MISSION_DASHBOARD_ENTRY__
        if (!observation) return { status: result, unavailable: true }
        observation.record(result)
        observation.dispose()
        delete window.__AG_MISSION_DASHBOARD_ENTRY__
        return { status: result, authority: false, scope: 'dashboard-pointer-entry', entries: observation.entries, final: observation.snapshot() }
      }, status).catch(error => ({ status, unavailable: true, error: error.message })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ status, unavailable: true, diagnosticDeadlineElapsed: true }), 2000) }),
    ])
  } finally { clearTimeout(timer) }
}

/** Keep the real Settings → Dashboard pointer path separate from lazy mount readiness. */
export async function verifyMissionDashboardEntry(page, { baseUrl, authoredSnapshot, assertAuthored, waitForMission }) {
  await page.goto(baseUrl + '/?kgPath=%2Fagentic-graph%2F', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.__AG_MAIN_PANEL_OPEN_READY__ === true, null, { timeout: 120000 })
  await waitForMissionAsync(page, async () => (await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')).readSourceFilesBootstrapReady())
  if (await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().floatingPanelOpen)) {
    await closeFloatingPanel(page, page.locator('[data-kg-floating-panel-root="true"]'))
  }
  const before = await authoredSnapshot()
  await installEntryObservation(page)
  let status = 'failed'
  try {
    await page.locator('[data-kg-toolbar-action="settings:open"]:visible').click()
    // The global ready flag only registers an event listener. The tab and lazy body
    // must both be mounted before testing the following pointer transition.
    await page.locator('#main-panel-settings-tab[aria-selected="true"]').waitFor({ state: 'visible' })
    await page.locator(SETTINGS_BODY_CONTROL).waitFor({ state: 'visible', timeout: 60000 })
    await page.evaluate(() => window.__AG_MISSION_DASHBOARD_ENTRY__.record('settings-body-ready'))
    const returnView = await page.evaluate(async () => {
      const state = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState()
      return [state.workspaceViewMode, state.workspaceCanvasPaneOpen]
    })
    await page.locator('#main-panel-dashboard-tab:visible').click({ noWaitAfter: true, timeout: 15000 })
    await page.evaluate(() => window.__AG_MISSION_DASHBOARD_ENTRY__.record('dashboard-pointer-returned'))
    await waitForMission()
    await page.locator('#main-panel-dashboard-tab').waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-renderer="dashboard"]').count(), 1, 'Settings opens one native Dashboard')
    assert.equal(await page.getByRole('region', { name: 'Agent Mission', exact: true }).count(), 1, 'Settings opens one Mission')
    assert.equal(await page.locator('[aria-label="Main panel"]').count(), 0, 'Dashboard entry closes MainPanel')
    assertAuthored(await authoredSnapshot(), before, 'Settings Dashboard entry preserves authored state')
    status = 'passed'
    return returnView
  } finally {
    console.log('Mission Dashboard pointer entry:', JSON.stringify(await finishEntryObservation(page, status)))
  }
}
