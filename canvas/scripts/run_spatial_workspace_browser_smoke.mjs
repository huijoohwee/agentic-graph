import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'
const script = fileURLToPath(import.meta.url)
process.chdir(resolve(dirname(script), '..'))
if (!process.argv.includes('--verify')) {
  await runLocalViteBrowserSmoke({ logLabel: 'spatial-workspace', devServerPort: process.env.AG_SPATIAL_PORT || '4207', devServerPath: '/agentic-graph/',
    baseUrlEnvName: 'AG_SPATIAL_BASE_URL', verifierCommand: process.execPath, verifierArgs: [script, '--verify'],
    verifierFailureLabel: 'Spatial workspace review', devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid' })
} else {
  const { chromium } = await import('playwright')
  const executablePath = findLocalChromiumExecutable(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, chromium.executablePath())
  const browser = await chromium.launch({ headless: true, executablePath })
  const watchdog = setTimeout(() => { console.error('Spatial browser verification exceeded 180 seconds'); void browser.close(); process.exitCode = 1 }, 180_000)
  try {
    const base = process.env.AG_SPATIAL_BASE_URL
    // Explicit peer artifact; no copied contract, network proxy or guessed sibling checkout.
    const canvasClient = process.env.AG_SPATIAL_CANVAS_CLIENT ? await readFile(process.env.AG_SPATIAL_CANVAS_CLIENT, 'utf8') : null
    const html = await (await fetch(`${base}/agentic-graph/`)).text()
    const fixture = html.replace(/<script\b[^>]*src=["'][^"']*\/src\/main\.tsx[^"']*["'][^>]*>\s*<\/script>/g, '').replace('id="root"', 'id="spatial-fixture"')
    assert.notEqual(fixture, html)
    for (const width of [1024, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.setDefaultTimeout(15_000)
      await page.route('**/__spatial_review_fixture__', route => route.fulfill({ contentType: 'text/html', body: fixture }))
      if (canvasClient) await page.route('**/__canvas_spatial_client__.mjs', route => route.fulfill({ contentType: 'text/javascript', body: canvasClient }))
      await page.goto(`${base}/__spatial_review_fixture__`)
      await page.evaluate(async () => {
        const dependency = async (source, token) => {
          const code = await (await fetch(`/src/${source}`)).text()
          const paths = [...code.matchAll(/from\s*["']([^"']+)["']/g)].map(match => match[1])
          const path = paths.find(candidate => candidate.includes(token))
          if (!path) throw new Error(`Missing installed ${token} dependency`)
          return import(path)
        }
        const React = (await dependency('features/three/SpatialWorkspaceReview.tsx', '/react.js')).default
        const dom = await dependency('main.tsx', 'react-dom_client')
        const { createRoot } = dom.default || dom
        await import('/src/index.css')
        const { SpatialWorkspaceReview } = await import('/src/features/three/SpatialWorkspaceReview.tsx')
        const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
        const { completeSourceFilesBootstrap } = await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')
        const { readXrMotionReferencePlan, serializeXrMotionReferencePlan } = await import('/src/features/three/xrMotionReferenceModel.ts')
        const { hydrateCanonicalXrMotionReferenceRuntime, hydrateCanonicalXrPhysicsRuntime } = await import('/src/features/three/XrMotionReferenceRuntimeBridge.tsx')
        const { getWorkspaceFs } = await import('/src/features/workspace-fs/workspaceFs.ts')
        const review = await import('/src/features/three/spatialWorkspaceRuntime.ts')
        const { tryParseMarkdownFrontmatterFlowGraph } = await import('/src/features/parsers/markdownFrontmatterFlowGraph.ts')
        const plan = readXrMotionReferencePlan({ stageId: 'neutral-volume', castSource: 'subjects-only', subjects: [{ id: 'box', assetId: 'prop-crate', label: 'Crate', position: [-3, 0, 0] }] })
        const metadata = { flow: { nodes: [{ id: 'scene', label: 'Scene' }], connections: [] }, kgXrMotionReference: serializeXrMotionReferencePlan(plan) }
        const yaml = (await dependency('features/three/spatialWorkspaceRuntime.ts', 'js-yaml')).default
        const path = '/spatial-browser-scene.md', text = `---\n${yaml.dump(metadata)}---\n\n# Authored scene\n`
        const fs = await getWorkspaceFs(); await fs.listEntries(); await fs.createFile({ parentPath: '/', name: path.slice(1), text, mirrorToHost: false })
        const { createWorkspacePersistedFs } = await import('/src/features/workspace-fs/workspaceFsPersisted.ts')
        const durable = createWorkspacePersistedFs()
        if (await durable.readFileText(path) !== text) throw new Error('Fixture is not durably stored: ' + JSON.stringify(useGraphStore.getState().uiToasts))
        const install = (text) => {
          const parsed = tryParseMarkdownFrontmatterFlowGraph(path, text)
          if (!parsed) throw new Error('Authored scene parser refused fixture')
          useGraphStore.setState({ markdownDocumentName: path, markdownDocumentText: text,
            sourceFiles: [{ id: path, name: path, text, enabled: true, status: 'parsed', source: { kind: 'local', path: `workspace:${path}` } }],
            graphData: parsed.graphData,
            workspaceViewMode: 'canvas', workspaceCanvasPaneOpen: true, markdownWorkspaceIndexingInFlight: false, workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationLayoutLockActive: false })
          completeSourceFilesBootstrap(); hydrateCanonicalXrMotionReferenceRuntime(); hydrateCanonicalXrPhysicsRuntime()
        }
        install(text)
        const root = createRoot(document.getElementById('spatial-fixture'))
        root.render(React.createElement(SpatialWorkspaceReview))
        window.spatialFixture = { initialText: text, review, store: useGraphStore, fs: durable, path, install, yaml }
      })
      await page.getByRole('button', { name: 'Preview change', exact: true }).waitFor()
      await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled)
      if (canvasClient) await page.evaluate(async () => {
        const { createSpatialWorkspaceClient } = await import('/__canvas_spatial_client__.mjs')
        const { getAgenticGraphWebMcpToolRegistry } = await import('/src/features/agent-ready/webMcpToolRegistry.ts')
        const { AGENTIC_OS_AGENT_READY_TOOL_IDS: ids, buildAgenticGraphWebMcpToolName: webName } = await import('/src/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs')
        const client = createSpatialWorkspaceClient({ registry: getAgenticGraphWebMcpToolRegistry(), toolNames: {
          inspect: webName(ids.inspectLocalXrSceneAssets), preview: webName(ids.controlLocalXrScene),
        } })
        window.spatialFixture.client = client
        window.spatialFixture.inspection = await client.inspect()
        if (!window.spatialFixture.inspection.ok) throw new Error(JSON.stringify(window.spatialFixture.inspection))
      })
      const started = Date.now()
      await context.setOffline(true)
      await page.getByRole('textbox', { name: 'Proposed position', exact: true }).fill('-2, 0, 0')
      await page.getByRole('button', { name: 'Preview change', exact: true }).click()
      await page.getByRole('button', { name: 'Apply reviewed change', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.spatialFixture.store.getState().markdownDocumentText), await page.evaluate(() => window.spatialFixture.initialText))
      await page.getByRole('button', { name: 'Apply reviewed change', exact: true }).click()
      await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(node => /applied|unverified|changed|refused|unavailable/.test(node.textContent || '')))
      const status = await page.locator('[role="status"]').allTextContents()
      assert.ok(status.includes('Change applied and verified in local storage.'), JSON.stringify({ status, diagnostic: await page.evaluate(async () => {
        const f = window.spatialFixture, expected = f.store.getState().markdownDocumentText, stored = await f.fs.readFileText(f.path)
        return { same: stored === expected, expectedLength: expected?.length, storedLength: stored?.length, document: f.store.getState().markdownDocumentName, receiptCount: f.store.getState().graphData?.metadata?.kgSpatialWorkspaceReview?.receipts?.length }
      }) }))
      const applyMs = Date.now() - started
      await page.getByRole('button', { name: 'Undo last reviewed change', exact: true }).click()
      await page.getByText('Change undone and verified in local storage.', { exact: true }).waitFor()
      if (canvasClient) {
        const result = await page.evaluate(async () => {
          const f = window.spatialFixture, edits = [{ subjectId: 'box', position: [-2, 0, 0] }]
          const stale = await f.client.preview({ inspection: f.inspection, edits })
          const inspection = await f.client.inspect()
          const before = f.store.getState().markdownDocumentText
          const preview = await f.client.preview({ inspection, edits })
          return { stale, preview, untouched: f.store.getState().markdownDocumentText === before }
        })
        assert.equal(result.stale.code, 'stale-source')
        assert.equal(result.preview.ok, true, JSON.stringify(result.preview))
        assert.equal(result.preview.proposal.actor, 'browser-agent')
        assert.equal(result.untouched, true)
        await page.getByRole('button', { name: 'Apply reviewed change', exact: true }).click()
        await page.getByText('Change applied and verified in local storage.', { exact: true }).waitFor()
        await page.getByRole('button', { name: 'Undo last reviewed change', exact: true }).click()
        await page.getByText('Change undone and verified in local storage.', { exact: true }).waitFor()
      }
      const readback = await page.evaluate(async () => {
        const { fs, path, yaml, install, review } = window.spatialFixture
        const text = await fs.readFileText(path), metadata = yaml.load(text.split('---')[1])
        // Rehydrate from persisted bytes, retaining the same existing document/storage owners.
        install(text)
        return { text, metadata, inspection: await review.inspectSpatialWorkspace() }
      })
      assert.equal(readback.metadata.kgSpatialWorkspaceReview.receipts.length, canvasClient ? 4 : 2)
      assert.deepEqual(readback.metadata.kgXrMotionReference.subjects[0].position, [-3, 0, 0])
      assert.equal(readback.inspection.ok, true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      await mkdir('/tmp/spatial-workspace-browser', { recursive: true })
      await page.screenshot({ path: `/tmp/spatial-workspace-browser/review-${width}.png`, fullPage: true })
      assert.deepEqual(errors, [])
      // A new page realm opens IndexedDB again; module loading is deliberately online.
      // This proves persisted bytes survive reload, not an offline full-app cold boot.
      await context.setOffline(false)
      await page.reload()
      const freshText = await page.evaluate(async () => {
        const { createWorkspacePersistedFs } = await import('/src/features/workspace-fs/workspaceFsPersisted.ts')
        return createWorkspacePersistedFs().readFileText('/spatial-browser-scene.md')
      })
      assert.equal(freshText, readback.text)
      assert.deepEqual(errors, [])
      assert.ok(applyMs <= 300_000)
      console.log(JSON.stringify({ schema: 'agentic-graph.spatial-review-browser/v1', width, canvasBrowserTransport: Boolean(canvasClient), offlineAfterLoad: true, applyActions: 3, applyMs, persistedReceipts: readback.metadata.kgSpatialWorkspaceReview.receipts.length, hydrationReadback: true, freshPageDurableReadback: true, fullAppColdReload: 'not-covered', pageErrors: errors }))
      await context.close()
    }
  } finally { clearTimeout(watchdog); await browser.close() }
}
