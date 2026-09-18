import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { showMissionFace } from './mission-card-face.mjs'

/** Browser fixture exercises the real SSE reader/store/Editor/card path; native archive I/O is covered by bridge tests. */
export async function verifyWorkspaceObservation(page, openDashboard) {
  const close = page.getByRole('button', { name: 'Close run inspection', exact: true })
  if (await close.count()) await close.click()
  await page.clock.install({ time: new Date() })
  let generation = 1, reads = 0
  const manifest = () => JSON.stringify({ schema: 'agentic-os/workflow-observation-input/v1', id: 'workspace-fixture', generation })
  const digest = text => createHash('sha256').update(text).digest('hex')
  await page.route('**/api/agent-swarm/workspace-source', async route => {
    reads++; const manifestText = manifest(), manifestDigest = digest(manifestText)
    await route.fulfill({ contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify({
      schema: 'agentic-graph/workspace-observation-source/v1', authority: false, manifestText, manifestDigest,
      manifestPath: `.artifacts/workflows/${'a'.repeat(24)}/${manifestDigest}/manifest.json` }) })
  })
  await page.route('**/api/agent-swarm/workflow-trace', async route => {
    const { manifestText } = route.request().postDataJSON(), revision = JSON.parse(manifestText).generation
    const now = await page.evaluate(() => Date.now())
    const data = { schema: 'agent-toolkit-run/v1', authority: false, runId: 'workflow-workspace-fixture', status: 'running',
      manifestDigest: digest(manifestText), subjectDigest: digest(manifestText), observedAt: now, expiresAt: now + 60000,
      spans: [{ spanId: 'checks', kind: 'check', operation: `workspace-check-${revision}`, status: 'completed',
        timing: { startOffsetMs: 0, inclusiveMs: 12, scope: 'fixture' }, resources: { cpuMs: 3, peakMemoryBytes: 1024 } }],
      page: { offset: 0, total: 1, nextCursor: null }, coverage: { partial: true, sourcePartial: true, expectedSpans: 7 } }
    await route.fulfill({ contentType: 'text/event-stream', headers: { 'cache-control': 'no-store' }, body: `data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n` })
  })
  try {
    const preset = page.getByRole('combobox', { name: 'Prompt preset', exact: true })
    if (await preset.isVisible()) { await preset.selectOption('agent-observability'); await page.getByRole('button', { name: 'Open observability', exact: true }).click() }
    else await openDashboard()
    const mission = page.getByRole('region', { name: 'Agent Mission', exact: true })
    const tree = mission.getByRole('tree', { name: 'Span hierarchy' })
    await tree.getByRole('treeitem', { name: /workspace-check-1/ }).waitFor()
    const metric = mission.getByRole('group', { name: 'Span metric', exact: true })
    await metric.getByRole('button', { name: 'Show Tokens', exact: true }).click()
    await tree.locator('[data-span-metric="tokens"][data-span-metric-value="unknown"]').waitFor()
    assert.equal(await tree.locator('[data-span-metric] [aria-hidden="true"]').count(), 0, 'Unknown tokens have no fabricated bar')
    await metric.getByRole('button', { name: 'Show CPU', exact: true }).click()
    await tree.locator('[data-span-metric="cpuMs"][data-span-metric-value="3"]').waitFor()
    await metric.getByRole('button', { name: 'Show Cost', exact: true }).click()
    await tree.locator('[data-span-metric="costUsd"][data-span-metric-value="unknown"]').waitFor()
    await metric.getByRole('button', { name: 'Show Memory', exact: true }).click()
    await tree.locator('[data-span-metric="peakMemoryBytes"]').getByText('1 KiB', { exact: true }).waitFor()
    assert.equal(await mission.getByLabel('Import local file', { exact: true }).count(), 0, 'Run source belongs only to the back')
    const frame = mission.locator('[data-dashboard-widget="mission:tree"]'), before = await frame.boundingBox()
    await showMissionFace(mission, true)
    await mission.getByRole('region', { name: 'Run source', exact: true }).waitFor()
    const after = await frame.boundingBox()
    assert.equal(after.width, before.width); assert.equal(after.height, before.height)
    assert.equal(await mission.locator('form form').count(), 0, 'Source filters must not nest inside display configuration form')
    await showMissionFace(mission, false)
    await page.getByRole('button', { name: 'Show Editor Workspace', exact: true }).click()
    const editor = page.getByRole('region', { name: 'Markdown Workspace', exact: true })
    await editor.getByRole('checkbox', { name: 'Show Explorer pane', exact: true }).check()
    await editor.getByRole('button', { name: 'File agent-mission.manifest.json', exact: true }).click()
    await editor.getByRole('checkbox', { name: 'Show JSON editor pane', exact: true }).check()
    await page.waitForFunction(async () => (await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots()
      .some(model => model.language === 'json' && model.uri.startsWith('inmemory://agent-run/') && model.value.includes('workspace-check-1')))
    generation = 2
    await page.clock.fastForward(15000)
    await page.waitForFunction(async () => (await import('/src/features/monaco/monacoModelRegistry.ts')).readRegisteredTextModelSnapshots()
      .some(model => model.language === 'json' && model.uri.startsWith('inmemory://agent-run/') && model.value.includes('workspace-check-2')))
    await page.getByRole('region', { name: 'Markdown Workspace', exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
    await tree.getByRole('treeitem', { name: /workspace-check-2/ }).waitFor()
    assert.equal(await metric.getByRole('button', { name: 'Show Memory', exact: true }).getAttribute('aria-pressed'), 'true', 'Metric selection survives streamed updates and flips')
    await metric.getByRole('button', { name: 'Show Time', exact: true }).click()
    await tree.locator('[data-span-timing]').waitFor()
    assert.equal(reads, 2, 'One initial source read and one timed refresh')
    await showMissionFace(mission, true); await mission.getByRole('checkbox', { name: 'Live · ≥5 s' }).uncheck()
    await page.clock.fastForward(15000); assert.equal(reads, 2, 'Paused stream performs no reads')
    await showMissionFace(mission, false)
    console.log('Workspace SSE → shared manifest and Span tree; configuration back and fixed dimensions passed.')
  } finally {
    if (await close.count()) await close.click()
    await page.unroute('**/api/agent-swarm/workspace-source'); await page.unroute('**/api/agent-swarm/workflow-trace')
  }
}
