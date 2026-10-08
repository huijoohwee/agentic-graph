import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function createSmokeDiagnostics(page) {
  const startedAt = Date.now(), pending = new Map(), settled = [], milestones = []
  const requests = { total: 0, completed: 0, failed: 0, pendingDetailsDropped: 0, settledDetailsDropped: 0 }
  const mark = label => { if (milestones.length < 64) milestones.push({ label, elapsedMs: Date.now() - startedAt }) }
  page.on('request', request => {
    requests.total++
    if (pending.size >= 64) { requests.pendingDetailsDropped++; return }
    const url = new URL(request.url())
    pending.set(request, { path: (/^https?:$/.test(url.protocol) ? url.origin + url.pathname : url.protocol).slice(0, 240), type: request.resourceType(), method: request.method(), startedAt: Date.now() })
  })
  page.on('response', response => { const entry = pending.get(response.request()); if (entry) entry.status = response.status() })
  const finish = (request, failed) => {
    requests[failed ? 'failed' : 'completed']++
    const entry = pending.get(request)
    if (!entry) return
    pending.delete(request)
    settled.push({ ...entry, durationMs: Date.now() - entry.startedAt, failed })
    if (settled.length > 64) { settled.shift(); requests.settledDetailsDropped++ }
  }
  page.on('requestfinished', request => finish(request, false))
  page.on('requestfailed', request => finish(request, true))
  return { mark, snapshot: () => ({ startedAt, milestones: [...milestones], requests: { ...requests,
    pending: requests.total - requests.completed - requests.failed,
    oldestPending: [...pending.values()].map(entry => ({ ...entry, ageMs: Date.now() - entry.startedAt })), settled: [...settled] } }) }
}

export async function collectSmokeDiagnostics(page, collector, { revision, tree }, error) {
  let timer
  const snapshot = { schema: 'agentic-graph.spatial-smoke-diagnostics/v1', revision, tree, viewport: page.viewportSize(), ...collector.snapshot(), artifactEntriesDropped: 0 }
  if (error !== undefined) snapshot.error = { name: String(error?.name || 'Error').slice(0, 60), message: String(error?.message ?? error).split('\n')[0].slice(0, 240) }
  try {
    snapshot.browser = await Promise.race([page.evaluate(() => {
      const trace = Array.isArray(window.__AG_RUNTIME_TRACE__) ? window.__AG_RUNTIME_TRACE__ : []
      return { ...window.__AG_SPATIAL_SMOKE_DIAGNOSTICS__, readyState: document.readyState, online: navigator.onLine,
        runtimeTraceDropped: Math.max(0, trace.length - 128), runtimeTrace: trace.slice(-128).map(entry => Object.fromEntries(
          ['ts', 'scope', 'runId', 'hypothesisId', 'traceId', 'location'].flatMap(key => {
            const value = entry?.[key]
            return typeof value === 'string' ? [[key, value.slice(0, 160)]] : typeof value === 'number' || typeof value === 'boolean' ? [[key, value]] : []
          }))) }
    }), new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: 'Browser snapshot exceeded 3000 ms' }), 3000) })])
  } catch { snapshot.browser = { unavailable: 'Browser snapshot failed' } }
  finally { clearTimeout(timer) }
  const rings = [snapshot.browser.uiEvents, snapshot.browser.runtimeTrace, snapshot.requests.settled, snapshot.requests.oldestPending, snapshot.browser.longTasks, snapshot.milestones]
  while (Buffer.byteLength(JSON.stringify(snapshot)) + 1 > 128 * 1024) {
    const ring = rings.find(value => value?.length)
    if (!ring) return { schema: snapshot.schema, revision, tree, unavailable: 'Diagnostic byte limit exceeded' }
    ring.shift(); snapshot.artifactEntriesDropped++
  }
  return snapshot
}

export function installSmokeDiagnostics(context) {
  return context.addInitScript(() => {
    if (window !== window.top) return
    const state = window.__AG_SPATIAL_SMOKE_DIAGNOSTICS__ = { documentEpochMs: performance.timeOrigin,
      uiEvents: [], uiEventsDropped: 0, longTasks: [], longTasksDropped: 0, longTaskCount: 0, longTaskTotalMs: 0, longTaskMaxMs: 0 }
    const retain = (key, value, limit) => { state[key].push(value); if (state[key].length > limit) { state[key].shift(); state[`${key}Dropped`]++ } }
    let previous = ''
    const sample = () => {
      const review = document.querySelector('[data-kg-spatial-review]'), fieldset = review?.querySelector('fieldset')
      const current = { toast: (document.querySelector('[data-kg-toast-message="markdown-workspace-status"]')?.textContent || '').slice(0, 240),
        reviewPresent: !!review, fieldsetDisabled: fieldset ? fieldset.disabled : null,
        reviewStatus: [...(review?.querySelectorAll('[role="status"]') || [])].slice(0, 2).map(node => (node.textContent || '').slice(0, 160)) }
      const signature = JSON.stringify(current)
      if (signature !== previous) { previous = signature; retain('uiEvents', { elapsedMs: performance.now(), ...current }, 128) }
    }
    const observedUi = '[data-kg-toast-id="markdown-workspace-status"],[data-kg-spatial-review]'
    new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement
        return target?.closest(observedUi) || [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches(observedUi) || node.querySelector(observedUi)))
      })) sample()
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled'] })
    sample()
    try {
      state.longTasksSupported = PerformanceObserver.supportedEntryTypes.includes('longtask')
      if (state.longTasksSupported) new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          state.longTaskCount++; state.longTaskTotalMs += entry.duration; state.longTaskMaxMs = Math.max(state.longTaskMaxMs, entry.duration)
          retain('longTasks', { elapsedMs: entry.startTime, durationMs: entry.duration }, 32)
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch { state.longTasksSupported = false }
  })
}

export async function captureLegacySmokeFailure({ page, output, revision, tree, diagnostics, storedSource }, error) {
  let legacyCaptureTimer
  try {
    await Promise.race([(async () => {
      if (page && !page.isClosed()) {
        await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }).catch(() => {})
        const failure = (error.stack || String(error)) + '\nSaved source:\n' + await storedSource(page).catch(() => 'Unavailable') + '\nBody:\n' + await page.locator('body').innerText().catch(() => 'Unavailable')
        await writeFile(join(output, 'failure.txt'), failure)
        // Retained stage logs must explain a disabled form even when runner screenshots are unavailable.
        console.error(JSON.stringify({ revision, tree, viewport: page.viewportSize(), output }))
        console.error(JSON.stringify(diagnostics))
        console.error(JSON.stringify(await page.evaluate(() => ({ readyState: document.readyState, online: navigator.onLine,
          worker: navigator.serviceWorker?.controller?.scriptURL, scripts: [...document.scripts].map(script => script.src), html: document.documentElement.outerHTML.slice(0, 4000) })).catch(() => ({ unavailable: true }))))
        console.error(failure.slice(0, 50000))
      }
    })(), new Promise(resolve => { legacyCaptureTimer = setTimeout(resolve, 3000) })])
  } catch { console.error('Legacy smoke failure capture was unavailable') }
  finally { clearTimeout(legacyCaptureTimer) }
}
