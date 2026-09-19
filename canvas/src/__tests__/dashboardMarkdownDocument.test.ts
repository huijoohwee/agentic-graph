import { agentMissionDashboardEvent } from '@/features/agent-ready/agentMissionDashboardDocument'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'
import { defaultSchema } from '@/lib/graph/schema'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolveSiblingFixturePath } from '@/tests/lib/repoTestData'
import { DASHBOARD_TEMPLATE_SOURCE, DASHBOARD_TEMPLATE_PATH, DASHBOARD_TEMPLATE_URL, fetchDashboardTemplate, readDashboardTemplate } from '@/components/DashboardCanvas/dashboardTemplateSource'
import { DASHBOARD_EVENT_SCHEMA, projectDashboardMarkdown, readDashboardSnapshot, updateDashboardSnapshotConfiguration } from '../components/DashboardCanvas/dashboardMarkdownDocument'
import { readDashboardSnapshotStream } from '../components/DashboardCanvas/dashboardSnapshotStream'

const cases: { name: string; run: () => unknown }[] = []
const test = (name: string, run: () => unknown) => { cases.push({ name, run }) }
export async function testDashboardMarkdownPipeline() {
  await loadTemplateFixture()
  for (const item of cases) { try { await item.run() } catch (error) { throw new Error(`${item.name}: ${(error as Error).message}`, { cause: error }) } }
}

let template = '', referenceTemplate = ''
async function loadTemplateFixture() {
  if (template) return
  try { referenceTemplate = execFileSync('git', ['-C', resolveSiblingFixturePath('huijoohwee.github.io', '.'), 'show', `${DASHBOARD_TEMPLATE_SOURCE.revision}:${DASHBOARD_TEMPLATE_SOURCE.path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { referenceTemplate = await fetchDashboardTemplate() }
  assert.equal(await fetchDashboardTemplate(async () => new Response(referenceTemplate)), referenceTemplate)
  // Compatibility coverage consumes the immutable previous owner revision, not an authored copy.
  const previous = '3bc612b4e421484a6bf99883a0368073e369f5e4'
  try { template = execFileSync('git', ['-C', resolveSiblingFixturePath('huijoohwee.github.io', '.'), 'show', `${previous}:${DASHBOARD_TEMPLATE_SOURCE.path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
  catch { const result = await fetch(`https://raw.githubusercontent.com/${DASHBOARD_TEMPLATE_SOURCE.repository}/${previous}/${DASHBOARD_TEMPLATE_SOURCE.path}`, { signal: AbortSignal.timeout(8000) }); assert.ok(result.ok); template = await result.text() }
}
const event = { schema: DASHBOARD_EVENT_SCHEMA, sourceId: 'run-1', sequence: 1, observedAt: 1780000000000, complete: false,
  data: { run: { id: 'run-1', status: 'running', spanCount: 1 }, resources: [{ label: 'CPU', value: 0 }],
    spans: [{ operation: 'compile', status: 'running', durationMs: null, cpuMs: 0, peakMemoryBytes: null }] } }
const response = (events: unknown[]) => new Response(events.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })

function missionFixture() {
  const trace = readRunTrace({ schema: 'agent-toolkit-run/v1', authority: false, runId: 'run-1', status: 'completed',
    observedAt: 1780000000000, expiresAt: 1780000060000, profile: { workflow: { members: [{ id: 'worker-a' }] } },
    coverage: { partial: false, expectedSpans: 2 }, page: { total: 2 }, evaluation: { status: 'reported', score: 1, reasonCode: 'retained evidence' },
    spans: [{ spanId: 'root', kind: 'workflow', operation: 'Parent', status: 'completed', timing: { inclusiveMs: 42 } },
      { spanId: 'child', parentSpanId: 'root', kind: 'check', operation: 'Reused check', status: 'reused', timing: { inclusiveMs: 20, startOffsetMs: 3, scope: 'worker-a' },
        historicalResources: { cpuMs: 0, peakMemoryBytes: 1024, tokens: 3, costUsd: 0 }, links: [{ spanId: 'root', kind: 'observed' }],
        evaluation: { status: 'reported', reasonCode: 'source reason' } }] }, 'run-1')
  const manifest = { schema: 'agentic-os/workflow-group/v1', id: 'workflow-fixture', sequence: 9, boundary: 'end', unknownFutureField: { preserved: true } }
  trace.workflowManifest = { value: manifest, text: JSON.stringify(manifest, null, 2), digest: 'a'.repeat(64) }
  return { trace, schema: defaultSchema }
}

test('Mission v2 retains the complete reference and file associations through configuration edits', () => {
  const mission = missionFixture(), input = agentMissionDashboardEvent(mission.trace, mission)
  const files = { input: '/docs/dashboards/reference.input.json', template: DASHBOARD_TEMPLATE_PATH, output: '/docs/dashboards/reference.md' }
  const settings = { version: 1 as const, widgets: { 'mission:index-economics': { expanded: false }, 'mission:tree': { aspectRatio: 'custom' as const, width: 612, height: 411 } },
    boards: { mission: [['mission:tree', 'mission:codebase']] } }
  const markdown = projectDashboardMarkdown(referenceTemplate, input, settings, files), snapshot = readDashboardSnapshot(markdown)!
  assert.deepEqual(snapshot.mission?.trace, mission.trace)
  assert.deepEqual(snapshot.mission?.schema, JSON.parse(JSON.stringify(mission.schema)))
  assert.deepEqual(snapshot.files, files)
  assert.deepEqual(snapshot.configuration.boards?.mission, settings.boards.mission)
  assert.equal(snapshot.configuration.widgets['mission:index-economics'].expanded, false)
  assert.equal(snapshot.configuration.widgets['mission:tree'].width, 612)
  assert.match(markdown, /Reused check/)
  assert.match(markdown, /Indexing economics/)
  assert.match(markdown, /Numeric Fields/)
  const updated = updateDashboardSnapshotConfiguration(markdown, { ...snapshot.configuration, widgets: { ...snapshot.configuration.widgets, 'mission:tree': { ...snapshot.configuration.widgets['mission:tree'], title: 'Saved tree' } } })
  assert.deepEqual(readDashboardSnapshot(updated)!.mission, snapshot.mission)
  assert.deepEqual(readDashboardSnapshot(updated)!.files, files)
  assert.throws(() => projectDashboardMarkdown(referenceTemplate, { ...input, sourceId: 'another-run' }), /differs/)
  assert.throws(() => projectDashboardMarkdown(referenceTemplate, event), /Mission evidence/)
})

test('template produces a portable report with zero, unknown, coverage and exact layout', () => {
  const markdown = projectDashboardMarkdown(template, event), snapshot = readDashboardSnapshot(markdown)!
  assert.equal(snapshot.source.sequence, 1)
  assert.equal(snapshot.source.complete, false)
  assert.deepEqual(snapshot.values['graph:run-resources'].rows, [['CPU', 0]])
  assert.match(markdown, /\| compile \| running \| Unknown \| 0 \| Unknown \|/)
  assert.deepEqual(snapshot.configuration.boards?.['mission-report'], [['graph:run-status', 'graph:run-spans'], ['graph:run-resources', 'graph:run-span-table']])
  assert.equal(snapshot.configuration.widgets['graph:run-status'].aspectRatio, '16:9')
  assert.equal(readDashboardSnapshot('# An ordinary document'), null)
})

test('configuration round-trip preserves notes, unrelated frontmatter and source observations', () => {
  const markdown = projectDashboardMarkdown(template, event).replace('title: Agent Mission dashboard', 'custom_key: retained\ntitle: Agent Mission dashboard') + '\nAuthored **notes** stay byte-identical.\n'
  const before = readDashboardSnapshot(markdown)!, next = structuredClone(before.configuration)
  next.widgets['graph:run-resources'] = { ...next.widgets['graph:run-resources'], aspectRatio: 'custom', width: 612, height: 411, expanded: false }
  next.boards!['mission-report'] = [['graph:run-spans'], ['graph:run-status', 'graph:run-span-table', 'graph:run-resources']]
  const saved = updateDashboardSnapshotConfiguration(markdown, next), reopened = readDashboardSnapshot(saved)!
  assert.deepEqual(reopened.configuration, next)
  assert.deepEqual(reopened.values, before.values)
  assert.deepEqual(reopened.source, before.source)
  assert.match(saved, /custom_key: retained/)
  assert.ok(saved.endsWith('\nAuthored **notes** stay byte-identical.\n'))
  assert.throws(() => updateDashboardSnapshotConfiguration(markdown.replace('dashboard:generated:end', 'removed'), next), /boundaries/)
})

test('bound strings remain literal Markdown, HTML and invocation data', () => {
  const unsafe = '</script><img onerror=alert(1)> /canvas.widget @dashboard #widget {{run.status}} | **owned**'
  const input = structuredClone(event); input.data.run.id = unsafe; input.data.spans[0].operation = unsafe
  const markdown = projectDashboardMarkdown(template, input), body = markdown.slice(markdown.indexOf('\n---\n') + 5)
  assert.ok(!body.includes('<img'))
  assert.ok(!body.includes('/canvas.widget'))
  assert.ok(!body.includes('{{run.status}}'))
  assert.equal(readDashboardSnapshot(markdown)!.values['graph:run-span-table'].rows![0][0], unsafe)
})

test('shared SSE framing accepts split UTF-8, duplicate replay and latest full snapshot', async () => {
  const latest = { ...event, sequence: 2, data: { ...event.data, run: { ...event.data.run, status: '完了' } } }
  const bytes = new TextEncoder().encode([event, event, latest].map(value => `data: ${JSON.stringify(value)}\r\n\r\n`).join(''))
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close() } })
  const result = await readDashboardSnapshotStream(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }))
  assert.equal(result.sequence, 2)
  assert.equal((result.data.run as Record<string, unknown>).status, '完了')
  assert.deepEqual(await readDashboardSnapshotStream(new Response(JSON.stringify(event))), event)
})

test('stream rejects conflicting, backward, changed-source, truncated and oversized input', async () => {
  await assert.rejects(readDashboardSnapshotStream(response([event, { ...event, complete: true }])), /reused/)
  await assert.rejects(readDashboardSnapshotStream(response([event, { ...event, sequence: 0 }])), /ordering/)
  await assert.rejects(readDashboardSnapshotStream(response([event, { ...event, sourceId: 'other' }])), /source/)
  await assert.rejects(readDashboardSnapshotStream(new Response(`data: ${JSON.stringify(event)}`, { headers: { 'content-type': 'text/event-stream' } })), /within a frame/)
  await assert.rejects(readDashboardSnapshotStream(response(Array(33).fill(event))), /32 snapshots/)
  await assert.rejects(readDashboardSnapshotStream(new Response(' '.repeat(1024 * 1024 + 1))), /1 MiB/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(readDashboardSnapshotStream(response([event]), controller.signal), { name: 'AbortError' })
})

test('invalid template bindings and unsupported values fail before output', () => {
  assert.throws(() => projectDashboardMarkdown(template.replace('run.status', '__proto__.status'), event), /binding path/)
  assert.throws(() => projectDashboardMarkdown(template.replace('template_version:', 'removed_version:'), event), /template identity/)
  assert.throws(() => projectDashboardMarkdown(template, { ...event, data: { ...event.data, resources: Array(2049).fill({ label: 'x', value: 1 }) } }), /2,048/)
  assert.throws(() => projectDashboardMarkdown(template, { ...event, observedAt: Number.MAX_SAFE_INTEGER }), /identity/)
  const repeated = template.replace('      - {label: Value, path: value}', Array(4).fill('      - {label: Value, path: value}').join('\n'))
  assert.throws(() => projectDashboardMarkdown(repeated, { ...event, data: { ...event.data,
    resources: Array(1000).fill({ label: 'Bounded input', value: 'x'.repeat(600) }) } }), /projection exceeds/)
})

export async function testDashboardMarkdownWorkspacePersistence() {
  await loadTemplateFixture()
  const { initJsdomHarness } = await import('@/tests/lib/jsdomHarness')
  const { restore } = initJsdomHarness()
  const { getWorkspaceFs } = await import('@/features/workspace-fs/workspaceFs')
  const { useMarkdownExplorerStore } = await import('@/features/markdown-explorer/store')
  const { controlDashboardWidget } = await import('@/components/DashboardCanvas/dashboardWidgetTools')
  const { DASHBOARD_WIDGETS_PATH, readDashboardWidgetConfiguration, mutateDashboardWidgets } = await import('@/components/DashboardCanvas/dashboardWidgetConfiguration')
  const fs = await getWorkspaceFs(), explorer = useMarkdownExplorerStore.getState(), path = `/dashboard-test-${crypto.randomUUID()}.md`
  const globalBefore = await fs.readFileText(DASHBOARD_WIDGETS_PATH), readFile = fs.readFileText.bind(fs)
  const templateBefore = await fs.readFileText(DASHBOARD_TEMPLATE_PATH)
  const original = projectDashboardMarkdown(template, event) + 'Authored **notes** survive.\n'
  try {
    await fs.deleteEntry(DASHBOARD_TEMPLATE_PATH, { mirrorToHost: false })
    let requests = 0
    const request: typeof fetch = async (url, init) => {
      requests++; assert.equal(url, DASHBOARD_TEMPLATE_URL); assert.equal(init?.credentials, 'omit')
      return new Response(referenceTemplate)
    }
    assert.equal(await readDashboardTemplate(fs, DASHBOARD_TEMPLATE_PATH, request), referenceTemplate)
    assert.equal(requests, 1)
    await fs.writeFileText(DASHBOARD_TEMPLATE_PATH, template, { mirrorToHost: false })
    assert.equal(await readDashboardTemplate(fs, DASHBOARD_TEMPLATE_PATH, request), referenceTemplate)
    assert.equal(await readDashboardTemplate(fs, DASHBOARD_TEMPLATE_PATH, async () => { throw Error('offline') }), referenceTemplate)
    await fs.writeFileText(DASHBOARD_TEMPLATE_PATH, referenceTemplate + '\nUser edit\n', { mirrorToHost: false })
    await assert.rejects(readDashboardTemplate(fs, DASHBOARD_TEMPLATE_PATH, request), /pinned source/)
    assert.ok((await fs.readFileText(DASHBOARD_TEMPLATE_PATH))!.endsWith('User edit\n'))
    await assert.rejects(fetchDashboardTemplate(async () => new Response('unexpected HTML')), /pinned source/)
    await assert.rejects(fetchDashboardTemplate(async () => new Response('x'.repeat(128 * 1024 + 1))), /exceeds 131072 bytes/)
    await fs.createFile({ parentPath: '/', name: path.slice(1), text: original, mirrorToHost: false })
    useMarkdownExplorerStore.getState().setActivePath(path)
    assert.equal((await controlDashboardWidget({ operation: 'inspect' })).path, path)
    await controlDashboardWidget({ operation: 'upsert', id: 'graph:run-status', settings: { title: 'Saved state', aspectRatio: 'custom', width: 612, height: 411 } })
    await controlDashboardWidget({ operation: 'collapse', id: 'graph:run-resources' })
    await controlDashboardWidget({ operation: 'layout', boardId: 'mission-report', columns: 1 })
    await controlDashboardWidget({ operation: 'upsert', id: 'graph:status-copy', settings: { template: 'metric', source: 'graph:run-status' } })
    const saved = (await fs.readFileText(path))!, snapshot = readDashboardSnapshot(saved)!
    assert.equal(snapshot.configuration.widgets['graph:run-status'].width, 612)
    assert.equal(snapshot.configuration.widgets['graph:run-resources'].expanded, false)
    assert.equal(snapshot.configuration.boards!['mission-report'].length, 4)
    assert.deepEqual(snapshot.values, readDashboardSnapshot(original)!.values)
    assert.ok(saved.endsWith('Authored **notes** survive.\n'))
    assert.match(saved, /## graph&#58;status-copy|## graph:status-copy/)
    assert.equal((await controlDashboardWidget({ operation: 'export' })).markdown, saved)
    assert.equal(await fs.readFileText(DASHBOARD_WIDGETS_PATH), globalBefore)

    const { ensureWorkspaceFolderTreeIfMissing } = await import('@/features/workspace-fs/ensureFolderTreeIfMissing')
    await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: '/docs/dashboards' })
    const linked = `/docs/dashboards/${crypto.randomUUID()}`
    const paths = { input: `${linked}.input.json`, output: `${linked}.md`, template: DASHBOARD_TEMPLATE_PATH }
    const mission = missionFixture(), full = projectDashboardMarkdown(referenceTemplate, agentMissionDashboardEvent(mission.trace, mission), undefined, paths)
    await fs.createFile({ parentPath: '/docs/dashboards', name: paths.output.split('/').pop()!, text: full, mirrorToHost: false })
    await fs.createFile({ parentPath: '/docs/dashboards', name: paths.input.split('/').pop()!, text: JSON.stringify({ dashboard_output: paths.output }), mirrorToHost: false })
    try {
      useMarkdownExplorerStore.getState().setActivePath(paths.input)
      assert.equal((await readDashboardWidgetConfiguration()).sourcePath, paths.output)
      await controlDashboardWidget({ operation: 'collapse', id: 'mission:index-economics' })
      assert.equal(readDashboardSnapshot((await fs.readFileText(paths.output))!)!.configuration.widgets['mission:index-economics'].expanded, false)
      assert.deepEqual(readDashboardSnapshot((await fs.readFileText(paths.output))!)!.mission?.trace, mission.trace)
    } finally { await fs.deleteEntry(paths.input, { mirrorToHost: false }); await fs.deleteEntry(paths.output, { mirrorToHost: false }); useMarkdownExplorerStore.getState().setActivePath(path); await readDashboardWidgetConfiguration() }

    // Source edits between read and write must survive instead of being replaced by stale Props.
    let reads = 0
    fs.readFileText = async (...args) => {
      const text = await readFile(...args)
      if (args[0] === path && ++reads === 2) await fs.writeFileText(path, text + '\nConcurrent notes\n', { mirrorToHost: false })
      return text
    }
    await assert.rejects(mutateDashboardWidgets(document => { document.widgets['graph:run-status'].title = 'Stale'; return document }), /configuration changed/)
    fs.readFileText = readFile
    assert.ok((await fs.readFileText(path))!.endsWith('\nConcurrent notes\n'))
    assert.equal(readDashboardSnapshot((await fs.readFileText(path))!)!.configuration.widgets['graph:run-status'].title, 'Saved state')
    useMarkdownExplorerStore.getState().setActivePath('')
    await readDashboardWidgetConfiguration()
    useMarkdownExplorerStore.getState().setActivePath(path)
    assert.equal((await readDashboardWidgetConfiguration()).document.widgets['graph:run-status'].width, 612)
  } finally {
    fs.readFileText = readFile
    if (templateBefore !== null) await fs.writeFileText(DASHBOARD_TEMPLATE_PATH, templateBefore, { mirrorToHost: false })
    else await fs.deleteEntry(DASHBOARD_TEMPLATE_PATH, { mirrorToHost: false })
    useMarkdownExplorerStore.getState().setActivePath(explorer.activePath)
    await fs.deleteEntry(path, { mirrorToHost: false })
    await readDashboardWidgetConfiguration()
    restore()
  }
}
