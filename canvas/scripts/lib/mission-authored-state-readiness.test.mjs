import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { waitForAuthoredWorkspaceSource } from './mission-authored-state-readiness.mjs'

test('authored readiness gates startup and selected sources while allowing unselected roots', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const modules = {
      '/src/features/source-files/sourceFilesBootstrapReadiness.ts':
        'export const readSourceFilesBootstrapReady = () => window.__fixture.bootstrap; export const readSourceFilesBootstrapSnapshot = () => window.__fixture.bootstrapSnapshot',
      '/src/lib/workspace/workspaceSeedSyncRuntime.ts':
        'export const readWorkspaceSeedSyncRuntimeSnapshot = () => ({ activeTaskCount: window.__fixture.tasks, suspensionCount: 2 })',
      '/src/hooks/useGraphStore.ts':
        'export const useGraphStore = { getState: () => { window.__fixture.reads++; return window.__fixture } }',
      '/src/features/markdown-explorer/store.ts':
        'export const useMarkdownExplorerStore = { getState: () => ({ activePath: window.__fixture.path }) }',
    }
    await page.route('http://mission-readiness.test/**', route => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ contentType: path === '/' ? 'text/html' : 'text/javascript',
        body: path === '/' ? '<!doctype html><title>Readiness regression</title>' : modules[path] || '' })
    })
    await page.goto('http://mission-readiness.test/')
    await page.evaluate(() => { window.__fixture = { reads: 0, tasks: 1, bootstrap: false,
      historyIndex: -1, path: '/docs/owned.md', sourceFiles: [] } })
    let settled = false
    const pending = waitForAuthoredWorkspaceSource(page, 10000).then(() => { settled = true })
    for (const patch of [{}, { tasks: 0 }, { bootstrap: true }, { historyIndex: 0 },
      { path: '/docs/owned.md', sourceFiles: [{ source: { path: 'workspace:/docs/other.md' } }] }]) {
      const reads = await page.evaluate(patch => {
        Object.assign(window.__fixture, patch)
        return window.__fixture.reads
      }, patch)
      await page.waitForFunction(reads => window.__fixture.reads >= reads + 2, reads, { timeout: 10000 })
      assert.equal(settled, false, 'A Promise or incomplete startup must never satisfy readiness')
    }
    await page.evaluate(() => { window.__fixture.sourceFiles = [{ source: { path: 'workspace:/docs/retained.md' } },
      { source: { path: 'workspace:/docs/owned.md' } }] })
    await pending
    assert.equal(settled, true)
    await page.evaluate(() => { window.__fixture = { reads: 0, tasks: 1, bootstrap: false,
      historyIndex: -1, path: null, sourceFiles: [] } })
    let emptySettled = false
    const emptyPending = waitForAuthoredWorkspaceSource(page, 10000).then(() => { emptySettled = true })
    for (const patch of [{}, { tasks: 0 }, { bootstrap: true }]) {
      const reads = await page.evaluate(patch => {
        Object.assign(window.__fixture, patch)
        return window.__fixture.reads
      }, patch)
      await page.waitForFunction(reads => window.__fixture.reads >= reads + 2, reads, { timeout: 10000 })
      assert.equal(emptySettled, false, 'An unselected root must still wait for complete startup')
    }
    await page.evaluate(() => { window.__fixture.historyIndex = 0 })
    await emptyPending
    assert.equal(emptySettled, true, 'A ready unselected root does not require a synthetic source')
    await page.evaluate(() => {
      Object.assign(window.__fixture, { tasks: 1, history: [], graphData: { nodes: [], edges: [] }, path: '/docs/owned.md',
        bootstrapSnapshot: { phase: 'error', basePhase: 'ready', documentIntentPhase: 'error', error: 'parser rejected PRIVATE_AUTHORED_BYTES' },
        sourceFiles: Array.from({ length: 10 }, (_, i) => ({ id: 'source-' + i, status: 'loading',
          text: 'PRIVATE_AUTHORED_BYTES', source: { path: 'workspace:/docs/owned.md' } })) })
    })
    const originalWait = page.waitForFunction.bind(page)
    let observedError, onWaitStarted = () => {}
    page.waitForFunction = async (...args) => {
      onWaitStarted()
      try { return await originalWait(...args) } catch (error) { observedError = error; throw error }
    }
    await assert.rejects(waitForAuthoredWorkspaceSource(page, 250), error => {
      assert.equal(error, observedError)
      assert.equal(error.name, 'TimeoutError')
      const value = error.readinessSnapshot
      assert.deepEqual([value.sync, value.history, value.graph], [{ activeTaskCount: 1, suspensionCount: 2 },
        { index: 0, length: 0 }, { present: true, nodes: 0, edges: 0 }])
      assert.deepEqual([value.bootstrap.phase, value.bootstrap.error.category, value.activePath], ['error', 'source-parse', '/docs/owned.md'])
      assert.deepEqual([value.matchingCount, value.matching.length, value.matching[0].status], [10, 8, 'loading'])
      assert.equal(JSON.stringify(value).includes('PRIVATE_AUTHORED_BYTES'), false)
      return true
    })
    const waiting = new Promise(resolve => { onWaitStarted = resolve })
    const closed = assert.rejects(waitForAuthoredWorkspaceSource(page, 10000), error => {
      assert.equal(error, observedError); assert.equal(error.readinessSnapshot, undefined); return true
    })
    await waiting; await page.close(); await closed
    const originalEvaluate = page.evaluate.bind(page)
    page.evaluate = async (...args) => {
      try { return await originalEvaluate(...args) } catch (error) { observedError = error; throw error }
    }
    await assert.rejects(waitForAuthoredWorkspaceSource(page), error => {
      assert.equal(error, observedError)
      assert.equal(error.readinessSnapshot, undefined); return true
    })
  } finally { await browser.close() }
})
