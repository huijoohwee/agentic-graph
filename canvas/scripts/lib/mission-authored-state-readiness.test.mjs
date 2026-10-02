import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { waitForAuthoredWorkspaceSource } from './mission-authored-state-readiness.mjs'

test('authored readiness stays pending until every synchronous prerequisite is true', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const modules = {
      '/src/features/source-files/sourceFilesBootstrapReadiness.ts':
        'export const readSourceFilesBootstrapReady = () => window.__fixture.bootstrap',
      '/src/lib/workspace/workspaceSeedSyncRuntime.ts':
        'export const readWorkspaceSeedSyncRuntimeSnapshot = () => ({ activeTaskCount: window.__fixture.tasks })',
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
      historyIndex: -1, path: null, sourceFiles: [] } })
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
    await page.evaluate(() => { window.__fixture.sourceFiles = [{ source: { path: 'workspace:/docs/owned.md' } }] })
    await pending
    assert.equal(settled, true)
  } finally { await browser.close() }
})
