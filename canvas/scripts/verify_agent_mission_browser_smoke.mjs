import { configureMissionPage, verifyWorkspaceObservation } from './lib/verify-workspace-observation.mjs'
import { showMissionFace, sourceText, waitForMissionAsync, openEditorWorkspace } from './lib/mission-card-face.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { verifyAgentMissionSourceFiles, verifyDashboardWidgets, verifyFullCanvas } from './lib/verify-dashboard-widgets.mjs'
import { verifyCanvasContainerSizing } from './lib/verify-canvas-container-sizing.mjs'
import { createMissionPhaseObservation } from './lib/mission-phase-observation.mjs'
const phaseObservation = createMissionPhaseObservation()
const output = resolve(process.env.AG_MISSION_ARTIFACT_DIR || '../data/outputs/agent-mission-browser-smoke')
const browser = await chromium.launch({ headless: true })
let context = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' })
const errors = [], requests = [], streamed = [], pending = new Set()
let page, mission, selected, returnView, peak = 0
async function openPage() {
page = await context.newPage()
await configureMissionPage(page, errors)
page.on('request', request => {
  if (!request.url().includes('/api/agent-swarm/')) return
  requests.push({ operation: request.url().split('/').at(-1), at: Date.now() }); pending.add(request); peak = Math.max(peak, pending.size)
})
page.on('response', response => {
  if (response.url().includes('/api/agent-swarm/') && response.headers()['content-type']?.includes('text/event-stream'))
    streamed.push(response.url().split('/').at(-1))
})
for (const event of ['requestfinished', 'requestfailed']) page.on(event, request => pending.delete(request))
mission = page.getByRole('region', { name: 'Agent Mission', exact: true })
selected = page.getByRole('region', { name: 'Selected run evidence' })
}
await openPage()
const waitForAsync = predicate => waitForMissionAsync(page, predicate)
const openRunSource = (scope = mission) => showMissionFace(scope, true)
const showEvidence = (scope = mission) => showMissionFace(scope, false)
const waitText = async (locator, text) => {
  await locator.waitFor({ state: 'visible', timeout: 60000 })
  if (await locator.locator('[data-dashboard-widget="mission:tree"]').count()) await showMissionFace(locator, sourceText(text))
  await locator.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 })
}
const waitTopology = async scope => {
  await showEvidence(scope)
  const startedAt = Date.now()
  const detail = scope.getByRole('combobox', { name: 'Topology detail', exact: true })
  if (await detail.count()) await detail.selectOption('all')
  const panel = scope.locator('#agent-run-view-topology-panel')
  await panel.waitFor({ state: 'visible' })
  const loading = panel.getByText('Loading topology…', { exact: true })
  const cold = await loading.count() > 0
  await loading.waitFor({ state: 'hidden', timeout: 60000 })
  console.log('Mission topology module:', JSON.stringify({ cold, elapsedMs: Date.now() - startedAt }))
  await scope.locator('[data-renderer="d3"] svg[role="img"]').waitFor({ state: 'visible' })
  assert.ok(await panel.locator('svg [data-kg-layer="nodes"] [data-node-id]').count() > 0, 'Native D3 scene must render observed nodes')
}
const refreshMission = async () => {
  await openRunSource()
  const refresh = mission.locator('button:enabled').filter({ hasText: /^Refresh runs$/ })
  await refresh.click(); await refresh.waitFor({ state: 'visible' })
}
const choose = async id => {
  await refreshMission()
  const row = mission.locator('tr').filter({ hasText: id }); await row.focus(); await page.keyboard.press('Enter'); await showEvidence()
  await selected.getByRole('heading', { name: 'Run ' + id, exact: true }).waitFor({ state: 'visible' })
}
async function authoredSnapshot() {
  return page.evaluate(async () => {
    const { useGraphStore } = await import('/src/hooks/useGraphStore.ts'), state = useGraphStore.getState()
    const keys = ['schema', 'fitToScreenMode', 'zoomToSelectionMode', 'graphData', 'selectedNodeIds', 'selectedEdgeIds', 'selectedGroupIds', 'layoutPositionCacheByMode',
      'flowWidgetPosByNodeId', 'flowWidgetWorldPosByNodeId', 'openWidgetNodeIds', 'history', 'historyIndex', 'sourceFiles',
      'markdownDocumentName', 'markdownDocumentText', 'jsonSourceDocumentName', 'jsonSourceDocumentText', 'canvasRenderMode', 'canvas2dRenderer']
    if (keys.some(key => !(key in state))) throw Error('Authored-state observation is incomplete')
    return JSON.stringify(Object.fromEntries(keys.map(key => [key, state[key]])))
  })
}
function assertAuthored(actual, expected, message) {
  if (actual === expected) return
  const changes = []
  function walk(a, b, path) {
    if (changes.length >= 12 || a === b) return
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path + '.' + key)
    } else changes.push({ path, before: String(b).slice(0, 100), after: String(a).slice(0, 100) })
  }
  walk(JSON.parse(actual), JSON.parse(expected), 'authored')
  throw Error(message + ': ' + JSON.stringify(changes))
}
async function openDashboard(expectRuntime = true) {
  returnView = await page.evaluate(async () => { const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState(); return [s.workspaceViewMode, s.workspaceCanvasPaneOpen] })
  await page.getByRole('button', { name: /^Canvas View Mode:/ }).click()
  await page.getByRole('button', { name: '2D Renderer: Dashboard', exact: true }).click()
  if (expectRuntime) await waitText(mission, '2 retained matches')
  assert.equal(await page.locator('[data-renderer="dashboard"]').count(), 1)
  if (expectRuntime) assert.ok(await mission.locator('[aria-label="Agent runs"] table').count() === 1)
  assert.ok(await page.getByRole('region', { name: 'Dashboard metrics', exact: true }).locator('[data-kg-dashboard-metric]').count() > 0)
}
async function verifyWorkspace(label, revoke = false) {
  await waitForAsync(async () => (await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')).readSourceFilesBootstrapReady())
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const floatingPanel = page.locator('[data-kg-floating-panel-root="true"]')
  if (await floatingPanel.isVisible()) {
    await floatingPanel.getByRole('button', { name: 'Close', exact: true }).click()
    await floatingPanel.waitFor({ state: 'detached' })
  }
  await refreshMission() // Each cold workspace phase receives a fresh authorized minute.
  await showEvidence()
  const beforeWorkspace = await authoredSnapshot()
  const previousView = returnView
  await selected.getByPlaceholder('Search spans by name, kind or status').fill('draft')
  await selected.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology')
  await openEditorWorkspace(page)
  const editor = page.getByRole('region', { name: 'Markdown Workspace', exact: true })
  const canvas = page.getByRole('region', { name: 'Dashboard', exact: true })
  await editor.waitFor({ state: 'visible', timeout: 60000 }); await verifyFullCanvas(page)
  const explorer = editor.getByRole('checkbox', { name: 'Show Explorer pane', exact: true }); await explorer.check()
  await editor.getByRole('button', { name: 'File agent-mission.manifest.json', exact: true }).waitFor()
  if (page.viewportSize().width <= 768) await explorer.uncheck()
  await editor.getByRole('region', { name: 'Markdown Editor', exact: true }).locator('.view-lines').waitFor({ state: 'visible', timeout: 60000 })
  await editor.getByRole('checkbox', { name: 'Show JSON editor pane', exact: true }).check()
  await editor.getByRole('region', { name: 'JSON Editor', exact: true }).locator('.view-lines').waitFor({ state: 'visible' })
  await waitText(editor.getByRole('region', { name: 'JSON Editor', exact: true }), 'agent-run-inspection/v1')
  await editor.getByRole('checkbox', { name: 'Show Viewer preview pane', exact: true }).check()
  await editor.getByRole('region', { name: 'Viewer', exact: true }).getByRole('heading', { name: /Agent run/ }).waitFor({ state: 'visible' })
  assert.equal(await editor.getByRole('button', { name: 'Insert slash command trigger', exact: true }).count(), 0)
  assert.equal(await page.locator('[data-kg-floating-panel-root="true"]').count(), 0, 'Run handoff must leave inspection unobscured')
  await page.screenshot({ path: resolve(output, label + '-workspace.png') })
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await waitTopology(canvas)
  await canvas.getByRole('list', { name: 'Topology nodes' }).getByRole('button', { name: /attempt 2/ }).click()
  await waitText(canvas, 'Selected span: draft-2')
  const evidence = canvas.getByRole('region', { name: 'Agent Mission', exact: true })
  const countBeforeRefresh = requests.length
  await openRunSource(evidence); await evidence.getByRole('button', { name: 'Refresh runs', exact: true }).click()
  await evidence.getByRole('button', { name: 'Refresh runs', exact: true }).and(page.locator(':enabled')).waitFor()
  assert.ok(requests.length > countBeforeRefresh, 'Canvas refresh must use the authenticated native transport')
  await showEvidence(evidence)
  for (const [key, name] of [['table', 'Span table'], ['tree', 'Span tree'], ['source', 'Source links'],
    ['allocation', 'Allocation'], ['evidence', 'Evaluation'], ['comparison', 'Comparison'], ['topology', 'Topology']]) {
    await evidence.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption(key)
    await evidence.locator('#agent-run-view-' + key + '-panel').waitFor({ state: 'visible' })
    await waitText(evidence, 'Selected span: draft-2')
    if (key === 'table') assert.ok(await evidence.locator('tr').filter({ hasText: 'draft-2' }).isVisible())
    if (key === 'tree') {
      const tree = evidence.getByRole('tree', { name: 'Span hierarchy' })
      assert.ok(await tree.isVisible())
      assert.equal(await evidence.getByRole('tab', { name: 'Timing', exact: true }).count(), 0)
      assert.equal(await tree.locator('[data-span-timing]').count(), await tree.getByRole('treeitem').count())
      await waitText(tree, 'exclusive observed')
      const root = tree.getByRole('treeitem', { name: /^prepare-listing/ })
      const selectedSpan = tree.getByRole('treeitem', { name: /^draft · tool · completed/ })
      assert.equal(await selectedSpan.getAttribute('aria-selected'), 'true')
      assert.ok(await tree.locator('[data-span-guide]').count() > 0)
      await evidence.getByPlaceholder('Search spans by name, kind or status').fill('')
      const count = await tree.getByRole('treeitem').count()
      await root.focus(); await root.press('ArrowLeft')
      assert.equal(await tree.getByRole('treeitem').count(), 1)
      assert.equal(await root.getAttribute('aria-expanded'), 'false')
      await evidence.getByPlaceholder('Search spans by name, kind or status').fill('draft')
      assert.equal(await tree.getByRole('treeitem').count(), 3, 'Search reveals matches and ancestors through collapsed branches')
      await evidence.getByPlaceholder('Search spans by name, kind or status').fill('')
      await root.press('ArrowRight')
      assert.equal(await tree.getByRole('treeitem').count(), count)
      await root.press('ArrowDown'); await page.keyboard.press('Enter')
      await waitText(evidence, 'Selected span: draft-1')
      await selectedSpan.click(); await waitText(evidence, 'Selected span: draft-2')
      assert.equal(await selectedSpan.getAttribute('aria-level'), '2')
      await evidence.getByPlaceholder('Search spans by name, kind or status').fill('draft')
    }
    if (key === 'source') assert.ok((await evidence.locator('a').first().getAttribute('href')).includes(process.env.AG_MISSION_EXPECTED_HEAD))
    if (key === 'allocation') await waitText(evidence, 'Project allocation')
    if (key === 'evidence') {
      const evaluate = evidence.getByRole('button', { name: 'Evaluate selected subject', exact: true })
      if (await evaluate.isEnabled()) { await evaluate.click(); await waitText(evidence, 'Span draft-2 · reported') }
      assert.equal(await evaluate.isDisabled(), true)
    }
    if (key === 'comparison') assert.ok(await evidence.getByRole('button', { name: 'Use run as baseline' }).isVisible())
  }
  await page.evaluate(async () => {
    const { executeCanvasViewControl } = await import('/src/lib/canvas/canvasViewControlRuntime.ts')
    executeCanvasViewControl({ invocation: '/canvas.view.set #canvas-view @canvas-view option=agent-run:comparison' })
  })
  await evidence.locator('#agent-run-view-comparison-panel').waitFor()
  await evidence.getByRole('button', { name: 'Use run as baseline' }).click()
  await choose('baseline-run')
  await evidence.getByRole('heading', { name: 'Run baseline-run', exact: true }).waitFor()
  await evidence.getByRole('button', { name: 'Compare candidate' }).click()
  await waitText(evidence.getByLabel('Comparison evidence'), 'insufficient-evidence')
  await choose('candidate-run')
  await evidence.getByRole('heading', { name: 'Run candidate-run', exact: true }).waitFor()
  await evidence.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology')
  await evidence.getByRole('list', { name: 'Topology nodes' }).getByRole('button', { name: /attempt 2/ }).click()
  await waitText(evidence, 'Selected span: draft-2')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.screenshot({ path: resolve(output, label + '-canvas.png') })
  await openEditorWorkspace(page)
  await waitForAsync(async () => (await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.uri.startsWith('inmemory://agent-run/') && model.value.includes('Selected span: draft-2')))
  assertAuthored(await authoredSnapshot(), beforeWorkspace, 'Workspace/Canvas inspection must preserve authored graph and documents')
  const tokens = await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().markdownTokensPath)
  assert.ok(!String(tokens).includes('agent-run-'), 'Inspection must not publish authored Markdown tokens')
  const stored = await page.evaluate(() => Object.values(localStorage).some(value => String(value).includes('agent-run-inspection/v1')))
  assert.equal(stored, false, 'Run snapshot must not persist in browser storage')
  if (revoke) await page.evaluate(() => window.dispatchEvent(new Event('agentic-os:authority-change')))
  else { await editor.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Close run inspection', exact: true }).click() }
  await editor.getByRole('region', { name: 'JSON Editor', exact: true }).getByText('agent-run-inspection/v1', { exact: false }).waitFor({ state: 'detached' }); await canvas.waitFor({ state: 'detached' })
  assertAuthored(await authoredSnapshot(), beforeWorkspace, 'Closing or revoking inspection must restore authored work')
  assert.deepEqual(await page.evaluate(async () => { const state = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState(); return [state.workspaceViewMode, state.workspaceCanvasPaneOpen] }), previousView)
  await waitForAsync(async () => !(await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.uri.startsWith('inmemory://agent-run/')))
  phaseObservation.checkpoint('Mission browser: ' + label + ' workspace panes, Canvas selection, private model disposal and return passed')
}
async function verifyLocalTraceImport(label, fromApex = false) {
  const currentEditor = page.getByRole('region', { name: 'Markdown Workspace', exact: true })
  if (await currentEditor.isVisible()) await currentEditor.getByRole('button', { name: 'Close', exact: true }).click()
  const before = await authoredSnapshot(), beforeRequests = requests.length
  const payload = { schema: 'agent-toolkit-run/v1', authority: false, runId: 'imported-workflow', status: 'completed',
    observedAt: 1000, expiresAt: 2000, spans: [{ spanId: 'checks', parentSpanId: null, kind: 'tool', operation: 'checks', status: 'completed',
      timing: { startOffsetMs: 0, inclusiveMs: 1200, exclusiveObservedMs: null },
      resources: { cpuMs: 40, peakMemoryBytes: 1048576, tokens: null, costUsd: null } }],
    coverage: { retainedSpans: 1, expectedSpans: 1, droppedEvents: null, partial: false }, page: { total: 1, offset: 0, nextCursor: null } }
  const localFile = { name: 'workflow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) }
  if (fromApex) await page.getByLabel('Import local observation', { exact: true }).setInputFiles(localFile)
  else {
    await page.getByRole('button', { name: 'Launch', exact: true }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /Import local files/ }).click()
    await (await chooser).setFiles(localFile)
  }
  const editor = page.getByRole('region', { name: 'Markdown Workspace', exact: true })
  const canvas = page.getByRole('region', { name: 'Dashboard', exact: true })
  const evidence = canvas.getByRole('region', { name: 'Agent Mission', exact: true })
  if (fromApex) {
    await canvas.waitFor({ timeout: 60000 })
  } else {
    await editor.waitFor({ timeout: 60000 })
    await editor.getByRole('button', { name: 'Close', exact: true }).click()
  }
  await openRunSource(evidence); await waitText(evidence, 'Imported local trace: workflow.json')
  if (fromApex) assert.ok((await canvas.boundingBox()).width > page.viewportSize().width * .9, 'Apex import must open a full-width Canvas')
  assert.equal(await evidence.getByRole('button', { name: 'Refresh runs', exact: true }).isDisabled(), true)
  assert.equal(await evidence.getByRole('checkbox', { name: 'Live · ≥5 s', exact: true }).isDisabled(), true)
  await waitTopology(evidence)
  await evidence.getByRole('list', { name: 'Topology nodes' }).getByRole('button').click()
  await waitText(evidence, 'Selected span: checks')
  await evidence.locator('svg .node-label').click({ modifiers: ['Shift'] })
  assertAuthored(await authoredSnapshot(), before, 'Modifier selection must remain inside inspection')
  await evidence.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('evidence')
  assert.equal(await evidence.getByRole('button', { name: 'Evaluate selected subject', exact: true }).isDisabled(), true)
  await evidence.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology'); await waitTopology(evidence)
  await page.screenshot({ path: resolve(output, label + '-imported-d3.png') })
  await openEditorWorkspace(page)
  await waitForAsync(async () => (await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.uri.startsWith('inmemory://agent-run/') && model.value.includes('Selected span: checks')))
  assert.equal(requests.length, beforeRequests, 'Local file inspection must not use runtime sessions, polling or evaluation')
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Launch', exact: true }).click()
  const replacement = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Import local files/ }).click()
  await (await replacement).setFiles({ name: 'replacement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...payload, runId: 'replacement-workflow' })) })
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await openRunSource(evidence); await waitText(evidence, 'Imported local trace: replacement.json'); await showEvidence(evidence)
  await evidence.getByRole('heading', { name: 'Run replacement-workflow', exact: true }).waitFor()
  assert.equal(requests.length, beforeRequests, 'Replacing a mounted inspection must not reactivate the runtime')
  await page.getByRole('button', { name: 'Close run inspection', exact: true }).click()
  assertAuthored(await authoredSnapshot(), before, 'Trace file import must preserve authored documents and graph')
  phaseObservation.checkpoint('Mission browser: ' + label + ' local file import, native D3 and synchronized selection passed')
}
async function verifyApexActivation(width) {
  await context.close()
  context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
  await openPage()
  const beforeEntryRequests = requests.length, startedAt = Date.now()
  await page.goto(process.env.AG_MISSION_SMOKE_BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  const preset = page.getByRole('combobox', { name: 'Prompt preset', exact: true })
  await preset.waitFor({ state: 'visible', timeout: 120000 })
  await preset.selectOption('agent-observability')
  const activate = page.getByRole('button', { name: 'Open observability', exact: true })
  await activate.waitFor()
  const dashboard = page.getByRole('region', { name: 'Observation dashboard', exact: true })
  await dashboard.waitFor()
  const dashboardBounds = await page.getByRole('region', { name: 'Dashboard', exact: true }).boundingBox()
  const overlay = page.locator('[data-kg-live-canvas-hero-editorial="overlay"]')
  assert.equal(await overlay.evaluate(element => getComputedStyle(element).position), 'absolute', 'Catalog must reuse the existing translucent overlay')
  assert.ok(dashboardBounds.width > width * .9, 'Observability dashboard must use the full Canvas width')
  await page.locator('button[data-kg-live-canvas-hero-import-embed="true"]').waitFor()
  assert.equal(requests.length, beforeEntryRequests, 'Catalog selection must not read traces or execute work')
  await page.screenshot({ path: resolve(output, `apex-${width}-catalog-overlay.png`) })
  await waitForAsync(async () => (await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')).readSourceFilesBootstrapReady())
  await waitForAsync(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().historyIndex >= 0)
  await waitForAsync(async () => {
    const state = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState()
    const path = (await import('/src/features/markdown-explorer/store.ts')).useMarkdownExplorerStore.getState().activePath
    return !!path && state.sourceFiles[0]?.source?.path === `workspace:${path}`
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const before = await authoredSnapshot()
  await page.evaluate(async () => {
    window.__AG_ACTIVATION_CHANGES__ = []
    ;(await import('/src/hooks/useGraphStore.ts')).useGraphStore.subscribe((next, previous) => {
      if (next.sourceFiles === previous.sourceFiles && next.history === previous.history) return
      if (window.__AG_ACTIVATION_CHANGES__.length < 6) window.__AG_ACTIVATION_CHANGES__.push(new Error('Authored state changed during activation').stack)
    })
  })
  await activate.click()
  const canvas = page.getByRole('region', { name: 'Dashboard', exact: true })
  const evidence = canvas.getByRole('region', { name: 'Agent Mission', exact: true })
  await canvas.waitFor({ timeout: 60000 }); await page.locator('[data-agent-mission-mode="workspace"]').waitFor(); await waitText(evidence, '2 retained matches')
  assertAuthored(await authoredSnapshot(), before, 'Apex discovery must preserve authored work')
  await waitForAsync(async () => (await import('/src/features/toolbar/floatingPanelBridge.ts')).isFloatingPanelBridgeReady())
  await page.getByRole('button', { name: 'Create Node', exact: true }).click()
  const latePanel = page.locator('[data-kg-floating-panel-root="true"]')
  await latePanel.getByRole('region', { name: 'Props Panel', exact: true }).waitFor()
  await latePanel.locator('[data-kg-floating-panel-view-trigger="media"]').waitFor()
  await latePanel.getByRole('button', { name: 'Close', exact: true }).click()
  await openRunSource(evidence)
  const refresh = evidence.getByRole('button', { name: 'Refresh runs', exact: true })
  await evidence.getByLabel('Project', { exact: true }).fill('no-such-project')
  await evidence.getByRole('button', { name: 'Apply filters' }).click()
  await waitText(evidence, 'No runs in this authorized snapshot.')
  await evidence.getByLabel('Project', { exact: true }).fill('')
  await evidence.getByRole('button', { name: 'Apply filters' }).click()
  await waitText(evidence, '2 retained matches')
  await page.route('**/api/agent-swarm/query', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'run_forbidden' }) }))
  await refresh.click(); await evidence.getByRole('alert').waitFor()
  await waitText(evidence, 'Runtime unavailable')
  assert.equal(await evidence.getByText('No runs in this authorized snapshot.').count(), 0)
  await page.unroute('**/api/agent-swarm/query'); await refresh.click(); await waitText(evidence, '2 retained matches')
  await evidence.locator('tr').filter({ hasText: 'candidate-run' }).press('Enter'); await showEvidence(evidence)
  await evidence.locator('#agent-run-view-tree-panel').waitFor()
  await waitText(evidence, '32/34 retained spans')
  await openEditorWorkspace(page)
  const editor = page.getByRole('region', { name: 'Markdown Workspace', exact: true })
  await editor.waitFor({ timeout: 60000 })
  for (const name of ['Show JSON editor pane', 'Show Markdown editor pane', 'Show Viewer preview pane'])
    await editor.getByRole('checkbox', { name, exact: true }).check()
  await editor.getByRole('region', { name: 'Viewer', exact: true }).getByRole('heading', { name: /Agent run/ }).waitFor({ timeout: 60000 })
  await verifyCanvasContainerSizing(page)
  await page.screenshot({ path: resolve(output, `apex-${width}-inspection.png`) })
  await editor.getByRole('button', { name: 'Close', exact: true }).click()
  await canvas.waitFor({ state: 'visible' })
  const beforeLocalRequests = requests.length
  const observation = { schema: 'agentic-os/validation-observation/v1', authority: false, exportedAt: Date.now(),
    source: { repository: 'github.com/example/validation-fixture', revision: '1'.repeat(40), tree: '2'.repeat(40), dirty: false },
    executionOrder: 'sequential', runId: 'validation-fixture', status: 'passed', startedAt: 1000, finishedAt: 4300, elapsedMs: 3300,
    resources: { observedOutputBytes: 128000, emittedDiagnosticBytes: 400 },
    stages: Array.from({ length: 33 }, (_, i) => ({ id: 'check-' + i, status: 'passed', startedAt: 1000 + i * 100,
      finishedAt: 1100 + i * 100, elapsedMs: 100, observedOutputBytes: 200, outputTruncated: false })) }
  await openRunSource(evidence)
  await evidence.getByLabel('Import validation report', { exact: true }).setInputFiles({ name: 'validation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(observation)) })
  await openRunSource(evidence); await waitText(evidence, 'Local validation observation')
  assert.equal(await evidence.getByRole('button', { name: 'Refresh runs', exact: true }).isDisabled(), true)
  assert.equal(await evidence.getByRole('checkbox', { name: 'Live · ≥5 s' }).isDisabled(), true)
  await showEvidence(evidence); await evidence.locator('summary').filter({ hasText: /^Run measurements$/ }).click()
  await waitText(evidence.getByRole('region', { name: 'Validation economics' }), '128,000 bytes')
  await evidence.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('tree')
  const firstStage = evidence.getByRole('tree', { name: 'Span hierarchy' }).getByRole('treeitem').first()
  await firstStage.click()
  assert.equal(await firstStage.getByText('100 ms', { exact: true }).count(), 1, 'Each span shows its duration once')
  assert.equal(await firstStage.locator('[data-span-timing]').innerText(), '', 'The interval bar does not duplicate duration text')
  await page.screenshot({ path: resolve(output, `validation-${width}-span-tree.png`) })
  await waitText(evidence, 'Selected span: check-0')
  await evidence.getByRole('button', { name: 'Next stage page' }).click()
  await waitText(evidence, '1/33 retained spans')
  await evidence.getByRole('button', { name: 'Previous stage page' }).click()
  await evidence.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology'); await waitTopology(evidence)
  await page.screenshot({ path: resolve(output, `validation-${width}-topology.png`) })
  await openEditorWorkspace(page)
  await editor.waitFor({ state: 'visible' })
  await editor.getByRole('checkbox', { name: 'Show JSON editor pane', exact: true }).check()
  await waitText(editor.getByRole('region', { name: 'JSON Editor', exact: true }), 'validation-fixture')
  await editor.getByRole('checkbox', { name: 'Show Markdown editor pane', exact: true }).check()
  await waitText(editor.getByRole('region', { name: 'Markdown Editor', exact: true }).first(), 'Agent run')
  await waitForAsync(async () => (await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.language === 'markdown' && model.uri.startsWith('inmemory://agent-run/') && model.value.includes('check-0')))
  assert.equal(requests.length, beforeLocalRequests, 'Local validation inspection must never call the authenticated runtime')
  assertAuthored(await authoredSnapshot(), before, 'Apex activation must preserve authored work')
  assert.ok(requests.slice(beforeEntryRequests).every(item => ['workspace-source', 'query', 'trace'].includes(item.operation)), 'Activation may only read observations')
  await editor.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Close run inspection', exact: true }).click()
  await editor.getByRole('region', { name: 'JSON Editor', exact: true }).getByText('agent-run-inspection/v1', { exact: false }).waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().floatingPanelOpen), false)
  await page.getByRole('combobox', { name: 'Prompt preset', exact: true }).selectOption('agent-observability')
  await dashboard.waitFor()
  await verifyLocalTraceImport('apex-' + width, true)
  await waitForAsync(async () => !(await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.uri.startsWith('inmemory://agent-run/')))
  console.log('Mission Apex activation:', JSON.stringify({ width, elapsedMs: Date.now() - startedAt, source: 'pinned-catalog', status: 'passed' }))
}
async function switchPrincipal(id) {
  const path = process.env.AGENTIC_OS_DURABLE_RUN_HOST_CONFIG, config = JSON.parse(await readFile(path, 'utf8'))
  config.authorization = 'Bearer ' + createHash('sha256').update('private-browser-fixture-' + id).digest('hex')
  await writeFile(path, JSON.stringify(config), { mode: 0o600 })
}
try {
  await mkdir(output, { recursive: true })
  if (process.env.AG_MISSION_ACTIVATION_ONLY === '1') {
    await verifyApexActivation(360)
    await verifyApexActivation(1280)
    await verifyWorkspaceObservation(page, () => openDashboard(false))
    assert.deepEqual(errors, [])
    console.log('Focused Apex activation and workspace stream passed; full mission lifecycle remains a separate check.')
  } else {
  await page.clock.install({ time: new Date() })
  await page.goto(process.env.AG_MISSION_SMOKE_BASE_URL + '/?kgPath=%2Fagentic-graph%2F', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.__AG_MAIN_PANEL_OPEN_READY__ === true, null, { timeout: 120000 })
  await waitForAsync(async () => (await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')).readSourceFilesBootstrapReady())
  const initialPanelOpen = await page.evaluate(async () => {
    const { useGraphStore } = await import('/src/hooks/useGraphStore.ts')
    return useGraphStore.getState().floatingPanelOpen
  })
  let floating = page.locator('[data-kg-floating-panel-root="true"]')
  if (initialPanelOpen) {
    await floating.waitFor({ state: 'visible', timeout: 30000 })
    await floating.getByRole('button', { name: 'Close', exact: true }).click()
    await floating.waitFor({ state: 'detached' })
  }
  assert.equal(requests.length, 0, 'Dashboard must not load or poll before opening')
  await verifyAgentMissionSourceFiles(page, authoredSnapshot, assertAuthored)
  await openDashboard()
  await waitText(mission, '2 retained matches')
  await showEvidence(); await verifyDashboardWidgets(page)
  assert.equal(await mission.getByText('private-run', { exact: true }).count(), 0)
  await waitForAsync(async () => (await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')).readSourceFilesBootstrapReady())
  const before = await authoredSnapshot()
  await choose('baseline-run')
  assert.equal(await floating.count(), 0, 'Inspection must not open another panel')
  phaseObservation.checkpoint('Mission browser: authorized discovery and keyboard selection passed')
  await waitText(selected, '32/34 retained spans')
  await selected.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('source')
  assert.ok((await selected.locator('a').first().getAttribute('href')).includes(process.env.AG_MISSION_EXPECTED_HEAD))
  await selected.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('allocation'); await waitText(selected, 'Project allocation'); await selected.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('tree')
  const actualDraft = selected.getByRole('treeitem', { name: /draft · tool · completed/ })
  await actualDraft.click()
  phaseObservation.checkpoint('Mission browser: span selected')
  await waitText(selected, 'Selected span: draft-2')
  const search = selected.getByPlaceholder('Search spans by name, kind or status')
  await search.fill('draft-2')
  assert.equal(await selected.getByRole('tree', { name: 'Span hierarchy' }).getByRole('treeitem').count(), 2, 'Search retains the matching span and its known ancestor')
  await search.fill('')
  assert.equal(await selected.getByRole('treeitem', { selected: true }).count(), 1)
  await waitText(selected, 'exclusive observed')
  await page.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology')
  await waitTopology(selected)
  assert.equal(await selected.getByRole('list', { name: 'Topology nodes' }).getByRole('button', { pressed: true }).count(), 1)
  await choose('baseline-run') // Cold loading and interaction have separate authorization windows.
  await waitTopology(selected)
  await selected.getByRole('list', { name: 'Topology nodes' }).getByRole('button', { name: /attempt 2/ }).click()
  await selected.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await selected.getByRole('button', { name: 'Fit topology', exact: true }).click()
  await page.screenshot({ path: resolve(output, 'mobile-topology.png') })
  const canvas = selected.locator('svg[role="img"]')
  await canvas.scrollIntoViewIfNeeded()
  const point = await canvas.evaluate(element => {
    const box = element.getBoundingClientRect()
    const x = (Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2
    const y = (Math.max(0, box.top) + Math.min(innerHeight, box.bottom)) / 2
    if (!element.contains(document.elementFromPoint(x, y))) throw Error('Topology drag target is obscured')
    return { x, y }
  })
  await page.mouse.move(point.x, point.y); await page.mouse.down()
  await page.mouse.move(point.x + 20, point.y + 20); await page.mouse.up()
  await page.clock.fastForward(61000)
  await mission.waitFor({ state: 'detached' }); await page.clock.setSystemTime(new Date()); await openDashboard()
  await choose('baseline-run')
  await selected.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology'); await waitTopology(selected)
  await selected.getByRole('list', { name: 'Topology nodes' }).getByRole('button', { name: /attempt 2/ }).click()
  await page.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('evidence')
  await selected.getByRole('button', { name: 'Evaluate selected subject' }).click()
  await waitText(selected, 'Span draft-2 · reported')
  phaseObservation.checkpoint('Mission browser: views and subject evaluation passed')
  await refreshMission(); await showEvidence()
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
  assert.equal(metadata.authority, false); assert.equal(metadata.trace.runId, 'candidate-run')
  assert.equal(await authoredSnapshot(), before, 'Inspection must preserve authored graph, selection, layout, history and sources')
  const bounds = await mission.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
  assert.ok(bounds.width <= 360 && bounds.scroll <= bounds.width + 1, JSON.stringify(bounds))
  await refreshMission()
  const manualCount = requests.length; await page.waitForTimeout(5200)
  assert.equal(requests.length, manualCount, 'Manual mode must be idle')
  const liveStartedAt = await page.evaluate(() => Date.now())
  await Promise.all([
    page.waitForRequest(request => request.url().endsWith('/api/agent-swarm/query'), { timeout: 60000 }),
    mission.getByRole('checkbox', { name: /Live/ }).check(),
  ])
  assert.ok(await page.evaluate(() => Date.now()) - liveStartedAt >= 5000, 'Live refresh respects its minimum interval')
  await mission.locator('button:enabled').filter({ hasText: /^Refresh runs$/ }).waitFor()
  assert.ok(requests.length > manualCount)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitText(mission, 'Paused while hidden')
  const hiddenCount = requests.length; await page.waitForTimeout(5400); assert.equal(requests.length, hiddenCount)
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
  await context.setOffline(true); await waitText(mission, 'Offline')
  const offlineCount = requests.length; await page.waitForTimeout(5400); assert.equal(requests.length, offlineCount)
  await showEvidence()
  await page.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('tree')
  assert.ok(await selected.getByRole('tree', { name: 'Span hierarchy' }).isVisible())
  await context.setOffline(false)
  await openRunSource(); await mission.getByRole('checkbox', { name: /Live/ }).uncheck()
  await switchPrincipal('other'); await mission.getByRole('button', { name: 'Refresh runs' }).click()
  await mission.waitFor({ state: 'detached' }); await page.getByRole('button', { name: /^Canvas View Mode:/ }).click(); await page.getByRole('button', { name: '2D Renderer: Dashboard', exact: true }).click(); await waitText(mission, '1 retained matches'); assert.equal(await selected.count(), 0)
  assert.equal(await mission.getByText('baseline-run', { exact: true }).count(), 0)
  await choose('private-run')
  await switchPrincipal('denied'); await openRunSource(); await mission.getByRole('button', { name: 'Refresh runs' }).click()
  await mission.waitFor({ state: 'detached' }); assert.equal(await selected.count(), 0)
  await switchPrincipal('owner'); await openDashboard()
  await waitText(mission, '2 retained matches'); await choose('baseline-run')
  await page.clock.fastForward(61000)
  await mission.waitFor({ state: 'detached' }); await page.clock.setSystemTime(new Date()); await openDashboard(); assert.equal(await selected.count(), 0)
  assert.equal(await page.getByRole('region', { name: 'Selected run evidence' }).count(), 0)
  assert.equal(peak, 1, 'Only one observation request may be in flight')
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'mobile.png') })
  phaseObservation.checkpoint('Mission browser: mobile lifecycle, authority and expiry passed')
  await page.clock.setSystemTime(new Date())
  await openRunSource(); await mission.getByRole('button', { name: 'Refresh runs' }).click(); await waitText(mission, '2 retained matches'); await choose('candidate-run')
  await verifyWorkspace('mobile', true)
  await openDashboard()
  await waitText(mission, '2 retained matches'); await choose('candidate-run')
  await openEditorWorkspace(page)
  await page.getByRole('region', { name: 'Markdown Workspace', exact: true }).waitFor({ state: 'visible' })
  await context.setOffline(true); await page.clock.fastForward(61000)
  await waitForAsync(async () => !(await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.uri.startsWith('inmemory://agent-run/')))
  await page.getByRole('region', { name: 'Dashboard', exact: true }).waitFor({ state: 'detached' })
  await waitForAsync(async () => !(await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots().some(model => model.uri.startsWith('inmemory://agent-run/')))
  await context.setOffline(false)
  phaseObservation.checkpoint('Mission browser: mobile offline workspace expiry passed')
  await context.close()
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })
  await openPage()
  await page.goto(process.env.AG_MISSION_SMOKE_BASE_URL + '/?kgPath=%2Fagentic-graph%2F', { waitUntil: 'domcontentloaded', timeout: 120000 })
  floating = page.locator('[data-kg-floating-panel-root="true"]')
  await page.waitForFunction(() => window.__AG_MAIN_PANEL_OPEN_READY__ === true, null, { timeout: 120000 })
  await waitForAsync(async () => (await import('/src/features/source-files/sourceFilesBootstrapReadiness.ts')).readSourceFilesBootstrapReady())
  if (await page.evaluate(async () => (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState().floatingPanelOpen)) {
    await floating.waitFor({ state: 'visible' }); await floating.getByRole('button', { name: 'Close', exact: true }).click()
    await floating.waitFor({ state: 'detached' })
  }
  await page.locator('[data-kg-toolbar-action="settings:open"]:visible').click()
  returnView = await page.evaluate(async () => { const s = (await import('/src/hooks/useGraphStore.ts')).useGraphStore.getState(); return [s.workspaceViewMode, s.workspaceCanvasPaneOpen] }); await page.locator('#main-panel-dashboard-tab:visible').click({ noWaitAfter: true })
  await waitText(mission, '2 retained matches'); await choose('candidate-run')
  await page.getByRole('combobox', { name: 'Inspect run details', exact: true }).selectOption('topology')
  await waitTopology(selected)
  await selected.getByRole('button', { name: 'Fit topology', exact: true }).click()
  await page.screenshot({ path: resolve(output, 'desktop-topology.png') })
  await verifyWorkspace('desktop')
  await verifyApexActivation(360)
  await verifyApexActivation(1280)
  await verifyWorkspaceObservation(page, () => openDashboard(false))
  assert.deepEqual(errors, [])
  assert.ok(streamed.includes('query') && streamed.includes('trace'), 'Real authenticated bridge must serve SSE observations')
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify({ sourceRevision: process.env.AG_MISSION_EXPECTED_HEAD,
    status: 'passed', fixtureOnly: true, providerAuthority: false, viewport: { width: 360, height: 800 },
    assertions: ['apex-catalog-inert-selection', 'apex-explicit-activation', 'activation-empty-vs-denied', 'activation-preserves-requested-view', 'late-panel-isolation', 'desktop-default-panes', 'lazy-entry', 'authorized-discovery', 'keyboard-row', 'bounded-span-pages', 'shared-selection', 'native-topology', 'launch-trace-import', 'native-d3-scene', 'imported-observation-no-runtime',
      'subject-evaluation', 'phase-reauthorization', 'comparison-insufficiency', 'source-join', 'allocation', 'metadata-export', 'authored-state-preserved',
      'metadata-search-ancestors', 'mobile-fit', 'desktop-topology', 'manual-idle', 'live-bounded', 'hidden-event-pause',
      'offline-inspection', 'scope-change', 'denial-clears-cache', 'snapshot-expiry', 'workspace-json-markdown-viewer', 'workspace-canvas-selection',
      'workspace-authority-revocation', 'workspace-close-preserves-documents', 'workspace-no-persistence', 'workspace-offline-expiry', 'private-model-disposal', 'native-sse-observation', 'single-dashboard-span-card', 'canvas-view-command', 'canvas-evaluation-comparison', 'stream-to-editor-projection'], phaseObservation: phaseObservation.snapshot(), peak, streamed, requests }, null, 2))
  console.log('Agent mission browser smoke passed; fixture observations are not production proof.')
  }
} catch (error) {
  console.error(error.message)
  console.error('Completed mission checkpoints:', JSON.stringify(phaseObservation.snapshot()))
  console.error('Mission entry state:', await page.evaluate(() => ({
    ready: window.__AG_MAIN_PANEL_OPEN_READY__,
    dashboard: document.querySelector('#dashboard-surface-agentic-os-panel')?.textContent.slice(0, 4000),
    modules: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/src/')).slice(-12)
      .map(entry => ({ path: new URL(entry.name).pathname, duration: entry.duration })),
    tabs: [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map(node => node.id),
    panels: [...document.querySelectorAll('[aria-label="Main panel"]')].map(node => ({
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
    })),
    topology: [...document.querySelectorAll('#agent-run-view-topology-panel')].map(node => ({
      text: node.textContent.slice(0, 1000), html: node.innerHTML.slice(0, 2000),
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      visibility: getComputedStyle(node).visibility,
      canvas: [...node.querySelectorAll('svg[role="img"]')].map(canvas => ({
        width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height,
        visibility: getComputedStyle(canvas).visibility, hidden: Boolean(canvas.closest('[aria-hidden="true"], [inert]')),
      })),
    })),
    text: document.querySelector('[aria-label="Agent Mission"]')?.textContent.slice(0, 4000),
    authoredChanges: window.__AG_ACTIVATION_CHANGES__,
  })).catch(() => 'Document unavailable'))
  console.error('Mission transport state:', JSON.stringify({ errors, requests, streamed, pending: pending.size }))
  await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  throw error
} finally { await browser.close() }
