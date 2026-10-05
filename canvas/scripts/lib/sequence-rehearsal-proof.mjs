import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from 'playwright/test'
import { tsImport } from 'tsx/esm/api'
import { dismissVisibleFloatingPanel } from './panel-close-helpers.mjs'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repositoryRoot = resolve(canvasRoot, '..')
let sequenceOwnersPromise, frontmatterOwnerPromise
const sequenceOwners = () => sequenceOwnersPromise ||= tsImport('../../src/features/sequence/sequenceModel.ts', { parentURL: import.meta.url, tsconfig: join(canvasRoot, 'tsconfig.json') })
const frontmatterOwner = () => frontmatterOwnerPromise ||= tsImport('../../src/lib/markdown/frontmatter.ts', { parentURL: import.meta.url, tsconfig: join(canvasRoot, 'tsconfig.json') })
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// The acceptance document is supplied by the operator, never embedded in the app or test tree.
export async function readSequenceProofSource(sourcePath, { valid = true } = {}) {
  assert.equal(typeof sourcePath, 'string', 'An external Markdown source path is required')
  assert.ok(sourcePath.trim(), 'An external Markdown source path is required')
  const path = await realpath(sourcePath), relation = relative(await realpath(repositoryRoot), path)
  assert.ok(isAbsolute(relation) || relation === '..' || relation.startsWith(`..${sep}`), 'Sequence acceptance inputs must remain outside the repository')
  const bytes = await readFile(path)
  assert.ok(bytes.length > 0 && bytes.length <= 256 * 1024, 'External Markdown must fit the bounded import budget')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const { readYamlFrontmatterMermaidCode } = await frontmatterOwner()
  const fenced = markdown => [...markdown.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```\s*$/gm)].filter(match => /^\s*sequenceDiagram\b/.test(match[1]))
  const extract = markdown => {
    const header = readYamlFrontmatterMermaidCode(markdown)
    if (/^\s*sequenceDiagram\b/.test(header)) return header
    const blocks = fenced(markdown)
    assert.equal(blocks.length, 1, 'Acceptance source must contain one supported sequence')
    return blocks[0][1]
  }
  const { parseSequence, sequencePlaybackEvents } = await sequenceOwners(), code = extract(text), model = parseSequence(code)
  const diagnosticText = markdown => {
    const blocks = fenced(markdown)
    assert.equal(blocks.length, 1, 'Negative acceptance requires one fenced sequence')
    assert.equal(blocks[0][1], code, 'The negative authored sequence must remain unchanged')
    const offset = markdown.slice(0, blocks[0].index).split('\n').length
    return model.diagnostics.map(item => `Line ${item.line + offset}: ${item.message}`)
  }
  if (valid) {
    assert.deepEqual(model.diagnostics, [], 'The supplied sequence must pass the production grammar')
    assert.ok(model.events.length >= 2 && model.events.some(event => event.kind !== 'note'), 'Acceptance requires multiple events and a timed message')
  } else {
    assert.ok(model.diagnostics.length, 'Negative acceptance input must be rejected by the production grammar')
    assert.deepEqual(sequencePlaybackEvents(model), [], 'Invalid authored input must not be playable')
    diagnosticText(text)
  }
  return { path, name: basename(path), bytes: bytes.length, digest: sha256(bytes), code, model, extract, diagnosticText }
}

const invoke = async (page, name, input = {}) => {
  await page.waitForFunction(tool => window.__registeredLearningTools?.has('agentic-graph.' + tool), name)
  return page.evaluate(({ name, input }) => window.__registeredLearningTools.get('agentic-graph.' + name).execute(input), { name, input })
}
const eventName = event => `${event.kind === 'note' ? 'Note' : `Step ${event.ordinal}`}: ${event.label}`
const sequenceCanvas = page => page.locator('.sequence-canvas')
const timeline = page => page.getByRole('region', { name: 'Sequence Timeline', exact: true })
const currentTime = page => timeline(page).locator('.timeline-timecode-current')
const svgEvent = (page, event) => sequenceCanvas(page).getByRole('button', { name: eventName(event), exact: true })

async function dismissWorkspaceEditor(page) {
  const overlay = page.getByLabel('Workspace editor overlay shell', { exact: true })
  if (!(await overlay.isVisible())) return
  await dismissVisibleFloatingPanel(page)
  await overlay.getByLabel('Markdown toolbar row', { exact: true }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(overlay).toBeHidden()
}

async function ensureWorkspaceEditor(page) {
  await dismissVisibleFloatingPanel(page)
  const overlay = page.getByLabel('Workspace editor overlay shell', { exact: true })
  if (await overlay.isVisible()) return
  await page.getByRole('navigation', { name: 'Main Toolbar', exact: true }).getByRole('button', { name: 'Workspace View', exact: true }).click()
  if (!(await overlay.isVisible())) await page.getByRole('button', { name: 'Editor Workspace', exact: true }).click()
  await expect(overlay).toBeVisible()
}

async function importSource(page, source, { closeEditor = true } = {}) {
  await dismissVisibleFloatingPanel(page)
  const started = performance.now()
  await page.getByRole('button', { name: 'Launch', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import local files', exact: true }).click()
  await (await chooser).setFiles(source.path)
  await expect.poll(async () => (await inspectDocument(page)).canonicalPath?.endsWith(source.name), { timeout: 60000 }).toBe(true)
  await invoke(page, 'control_local_canvas_view', { optionId: 'surface:2d' })
  await invoke(page, 'control_local_canvas_view', { optionId: 'renderer:sequence' })
  await expect(sequenceCanvas(page).locator('[data-sequence-event]')).toHaveCount(source.model.events.length, { timeout: 60000 })
  for (const event of source.model.events) await expect(svgEvent(page, event)).toHaveCount(1)
  if (!(await timeline(page).isVisible())) await invoke(page, 'control_local_canvas_view', { optionId: 'control:timeline' })
  await expect(timeline(page)).toBeVisible()
  await expect(sequenceCanvas(page).getByRole('alert')).toHaveCount(0)
  if (closeEditor) await dismissWorkspaceEditor(page)
  return Math.round(performance.now() - started)
}

async function inspectDocument(page) {
  await invoke(page, 'select_local_tool_scope', { scope: 'editor' })
  const document = await invoke(page, 'inspect_local_workspace_document')
  assert.equal(document.available, true)
  assert.equal(document.sourceKind, 'browser-local-workspace')
  return document
}

async function storedSource(page, path) {
  return page.evaluate(async canonicalPath => {
    const name = (await indexedDB.databases()).find(database => database.name?.includes('kg:workspace-fs:indexeddb:v1'))?.name
    if (!name) return null
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open(name); opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const database = opening.result, request = database.transaction('records', 'readonly').objectStore('records').getAll()
        request.onerror = () => { database.close(); reject(request.error) }
        request.onsuccess = () => {
          database.close()
          const normalize = value => '/' + String(value || '').replace(/^\/+/, '')
          const matching = request.result.filter(record => record.collection === 'entries' && normalize(record.value?.path) === normalize(canonicalPath))
          resolve(matching.length === 1 && typeof matching[0].value.text === 'string' ? matching[0].value.text : null)
        }
      }
    })
  }, path)
}

async function saveAndReload(page, source) {
  const document = await inspectDocument(page), canonicalPath = document.canonicalPath
  assert.equal(typeof canonicalPath, 'string')
  assert.ok(canonicalPath.endsWith(source.name), 'The active source identity must name the imported file')
  await ensureWorkspaceEditor(page)
  await page.getByRole('button', { name: 'Launch', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => {
    const markdown = await storedSource(page, canonicalPath)
    if (markdown === null) return false
    try { return source.extract(markdown) === source.code } catch { return false }
  }, { timeout: 15000 }).toBe(true)
  const response = await page.reload({ waitUntil: 'domcontentloaded' })
  assert.equal(response?.status(), 200, 'Verified offline navigation must restore the saved workspace')
  await expect(sequenceCanvas(page).locator('[data-sequence-event]')).toHaveCount(source.model.events.length, { timeout: 60000 })
  const restored = await inspectDocument(page)
  assert.equal(restored.canonicalPath, canonicalPath)
  assert.equal(source.extract(await storedSource(page, canonicalPath)), source.code, 'Authored sequence bytes survive save and reload')
  for (const event of source.model.events) await expect(svgEvent(page, event)).toHaveCount(1)
  await dismissWorkspaceEditor(page)
  return { canonicalPath, sequenceDigest: sha256(source.code), savedAndReloaded: true }
}

async function ensureInspector(page) {
  const inspector = page.getByRole('region', { name: 'Sequence inspector', exact: true })
  if (!(await inspector.isVisible())) {
    // Create Node opens the existing property pane; it does not create a node until submission.
    if (!(await page.getByRole('navigation', { name: 'Floating panel views', exact: true }).isVisible())) {
      await page.getByRole('navigation', { name: 'Main Toolbar', exact: true }).getByRole('button', { name: 'Create Node', exact: true }).click()
    }
    await page.getByRole('navigation', { name: 'Floating panel views', exact: true }).getByRole('button', { name: 'Sequence Diagram', exact: true }).click()
  }
  await expect(inspector).toBeVisible()
  return inspector
}

async function assertSelection(page, event, requireInspector = true) {
  const target = svgEvent(page, event)
  await expect(target).toHaveAttribute('aria-pressed', 'true')
  await expect(sequenceCanvas(page).locator('[data-sequence-event][aria-pressed="true"]')).toHaveCount(1)
  const id = await target.getAttribute('data-sequence-event')
  assert.ok(id)
  const selectedMarks = await timeline(page).locator('[data-sequence-timeline-event][aria-pressed="true"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-sequence-timeline-event')))
  assert.ok(selectedMarks.length > 0 && selectedMarks.every(value => value === id), 'Canvas and Timeline must select the same source event')
  const inspector = page.getByRole('region', { name: 'Sequence inspector', exact: true })
  if (requireInspector) {
    await expect(inspector).toBeVisible()
    await expect(inspector.getByRole('status').first()).toContainText(`Selected step ${event.ordinal}: ${event.label}`)
    await expect(inspector.getByRole('button', { pressed: true })).toHaveCount(1)
    await expect(inspector.getByRole('button', { pressed: true }).locator('strong')).toHaveText(`${event.ordinal}. ${event.label}`)
  }
  return { eventId: id, ordinal: event.ordinal, time: await currentTime(page).textContent(), surfaces: requireInspector ? ['Canvas', 'Timeline', 'Inspector'] : ['Canvas', 'Timeline'] }
}

async function rendererProof(page, source) {
  await invoke(page, 'control_local_canvas_view', { optionId: 'renderer:sequence' })
  await expect(sequenceCanvas(page)).toHaveAttribute('aria-label', 'Sequence Diagram')
  await ensureInspector(page)
  const selected = source.model.events.filter(event => event.kind !== 'note')[Math.min(2, source.model.events.filter(event => event.kind !== 'note').length - 1)]
  await svgEvent(page, selected).press('Enter')
  const before = await assertSelection(page, selected), switches = []
  await assert.rejects(() => invoke(page, 'control_local_canvas_view', { optionId: 'renderer:unsupported-sequence' }), /Invalid input for agentic-graph\.control_local_canvas_view:/)
  assert.deepEqual(await assertSelection(page, selected), before, 'An unknown renderer must leave selection and playhead unchanged')
  await expect(sequenceCanvas(page)).toHaveAttribute('aria-label', 'Sequence Diagram')
  for (const renderer of ['sequenceMermaid', 'sequence']) {
    const started = performance.now()
    await invoke(page, 'control_local_canvas_view', { optionId: `renderer:${renderer}` })
    await expect(sequenceCanvas(page)).toHaveAttribute('aria-label', renderer === 'sequence' ? 'Sequence Diagram' : 'Sequence Diagram (Mermaid)')
    await expect(sequenceCanvas(page).locator('[data-sequence-event]')).toHaveCount(source.model.events.length, { timeout: 60000 })
    assert.deepEqual(await assertSelection(page, selected), before, 'Renderer changes preserve the exact source selection and playhead')
    switches.push({ renderer, readyMs: Math.round(performance.now() - started) })
  }
  await dismissVisibleFloatingPanel(page)
  for (const layout of ['Lifelines', 'Connections']) {
    await sequenceCanvas(page).getByRole('button', { name: layout, exact: true }).click()
    await expect(sequenceCanvas(page).getByRole('button', { name: layout, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(svgEvent(page, selected)).toHaveAttribute('aria-pressed', 'true')
  }
  await ensureInspector(page)
  assert.deepEqual(await assertSelection(page, selected), before)
  return { selection: before, switches, layouts: ['Lifelines', 'Connections'], unknownRendererRejected: true }
}

async function branchesProof(page, source) {
  await dismissVisibleFloatingPanel(page)
  const { sequencePlaybackEvents, sequenceTimedEvents } = await sequenceOwners()
  const groups = [...new Set(source.model.branches.map(branch => branch.groupId))], results = []
  const cases = groups.flatMap((group, index) => source.model.branches.filter(branch => branch.groupId === group).map((branch, option) => ({ group, index, branch, option })))
  if (!cases.length) cases.push({ group: null })
  for (const candidate of cases) {
    const choices = Object.fromEntries(groups.map(group => [group, source.model.branches.find(branch => branch.groupId === group).id]))
    if (candidate.branch) {
      const authored = source.model.events.find(event => event.branches.includes(candidate.branch.id))
      assert.ok(authored, 'Acceptance branch must contain an event whose parent outcomes can be selected')
      for (const id of authored.branches) { const branch = source.model.branches.find(item => item.id === id); choices[branch.groupId] = id }
    }
    for (let index = 0; index < groups.length; index++) {
      const options = source.model.branches.filter(branch => branch.groupId === groups[index])
      await timeline(page).getByLabel(`Sequence outcome ${index + 1}`, { exact: true }).selectOption({ index: options.findIndex(branch => branch.id === choices[groups[index]]) })
    }
    const events = sequenceTimedEvents(sequencePlaybackEvents(source.model, choices)), duration = events.reduce((max, event) => Math.max(max, event.startMs + event.durationMs), 0)
    if (candidate.branch) assert.ok(events.some(event => event.branches.includes(candidate.branch.id)), 'The exercised projection must actually contain this authored outcome')
    assert.ok(duration > 0, 'Each supplied branch case needs a playable message')
    await timeline(page).getByRole('button', { name: 'Reset sequence', exact: true }).click()
    await timeline(page).getByRole('button', { name: 'Start playback', exact: true }).click()
    await expect(timeline(page).getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
    await expect(timeline(page).getByRole('button', { name: 'Start playback', exact: true })).toBeVisible({ timeout: Math.ceil(duration / 1000) * 2000 + 10000 })
    await expect(currentTime(page)).toHaveText(`${(duration / 1000).toFixed(1)}s`)
    const last = events.at(-1)
    await expect(svgEvent(page, last)).toHaveAttribute('aria-pressed', 'true')
    await expect(sequenceCanvas(page).getByRole('status')).toContainText('Authored rehearsal')
    results.push({ group: candidate.index === undefined ? null : candidate.index + 1, option: candidate.option === undefined ? null : candidate.option + 1, authoredLabel: candidate.branch?.label || null, steps: events.length, durationMs: duration, finalOrdinal: last.ordinal })
  }
  return results
}

async function mobileMotionProof(page, source) {
  await page.setViewportSize({ width: 390, height: 844 })
  await dismissVisibleFloatingPanel(page)
  const first = source.model.events.find(event => event.kind !== 'note')
  await svgEvent(page, first).press('Enter'); await assertSelection(page, first, false)
  const lane = timeline(page).getByRole('button', { name: `Scrub ${source.model.participants[0].label} sequence lane`, exact: true })
  await lane.press('Home'); await expect(currentTime(page)).toHaveText('0.0s')
  await lane.press('ArrowRight'); await expect(currentTime(page)).toHaveText('1.0s')
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, canvas: document.querySelector('.sequence-canvas')?.getBoundingClientRect().width }))
  assert.ok(dimensions.page <= dimensions.viewport + 1, 'Narrow layout must not overflow the page')
  for (const control of await timeline(page).getByRole('combobox').all()) assert.ok((await control.boundingBox()).height >= 44, 'Branch controls retain a 44px touch target')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await timeline(page).getByRole('button', { name: 'Reset sequence', exact: true }).click()
  await timeline(page).getByRole('button', { name: 'Start playback', exact: true }).click()
  await expect(currentTime(page)).not.toHaveText('0.0s')
  await expect(timeline(page).getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
  await expect(sequenceCanvas(page).locator('[data-sequence-pulse]')).toHaveCount(0)
  await timeline(page).getByRole('button', { name: 'Pause playback', exact: true }).click()
  return { viewport: { width: 390, height: 844 }, dimensions, keyboardSeek: true, reducedMotionPlayback: true, physicalDeviceProven: false }
}

async function repeatedTransportProof(page, source) {
  const { sequencePlaybackEvents, sequenceTimedEvents } = await sequenceOwners()
  const events = sequenceTimedEvents(sequencePlaybackEvents(source.model)), selected = events.find(event => event.ordinal === 3)
  assert.ok(selected && selected.kind !== 'note', 'External stress event 3 must be a timed message')
  const repeated = events.filter(event => event.kind !== 'note' && event.from === selected.from && event.to === selected.to)
  assert.ok(repeated.length > 1, 'External stress event 3 must share its directed connection with another authored message')
  const index = events.findIndex(event => event.id === selected.id), previous = events[index - 1]
  assert.ok(previous, 'The selected repeated event must have a previous playback step')
  const expectedTime = event => `${(event.startMs / 1000).toFixed(1)}s`
  await ensureInspector(page)
  await svgEvent(page, selected).press('Enter')
  await expect(currentTime(page)).toHaveText(expectedTime(selected))
  const selection = await assertSelection(page, selected)
  await dismissVisibleFloatingPanel(page)
  await timeline(page).getByRole('button', { name: 'Previous step', exact: true }).click()
  await expect(currentTime(page)).toHaveText(expectedTime(previous))
  await ensureInspector(page)
  const previousSelection = await assertSelection(page, previous)
  await dismissVisibleFloatingPanel(page)
  await timeline(page).getByRole('button', { name: 'Next step', exact: true }).click()
  await expect(currentTime(page)).toHaveText(expectedTime(selected))
  await ensureInspector(page)
  const restoredSelection = await assertSelection(page, selected)
  assert.deepEqual(restoredSelection, selection, 'Previous/Next must restore the exact repeated event and shared position')
  await dismissVisibleFloatingPanel(page)
  await timeline(page).getByRole('button', { name: 'Start playback', exact: true }).click()
  await expect(currentTime(page)).not.toHaveText(expectedTime(selected))
  await timeline(page).getByRole('button', { name: 'Pause playback', exact: true }).click()
  await expect(timeline(page).getByRole('button', { name: 'Start playback', exact: true })).toBeVisible()
  const pausedTime = await currentTime(page).textContent(), started = performance.now()
  let samples = 0
  do {
    await page.waitForTimeout(100)
    await expect(currentTime(page)).toHaveText(pausedTime)
    await expect(timeline(page).getByRole('button', { name: 'Pause playback', exact: true })).toHaveCount(0)
    samples++
  } while (performance.now() - started < 600 || samples < 2)
  return { repeatedConnection: { from: selected.from, to: selected.to, occurrences: repeated.length, ordinals: repeated.map(event => event.ordinal) },
    selection, stepRoundTrip: { previous: previousSelection, restored: restoredSelection },
    pausedClock: { time: pausedTime, observedMs: Math.round(performance.now() - started), samples, stable: true } }
}

async function stressProof(page, source) {
  assert.equal(source.model.events.length, 200, 'External stress input must contain 200 events')
  assert.equal(source.model.participants.length, 20, 'External stress input must contain 20 participants')
  assert.equal(source.model.branches.length, 0, 'External stress input must offer one continuous workload')
  await page.setViewportSize({ width: 1280, height: 800 }); await page.emulateMedia({ reducedMotion: 'no-preference' })
  const readyMs = await importSource(page, source)
  const repeatedTransport = await repeatedTransportProof(page, source)
  await dismissVisibleFloatingPanel(page)
  const client = await page.context().newCDPSession(page), traceEvents = []
  const { frameTree } = await client.send('Page.getFrameTree'), frameId = frameTree.frame.id
  const categories = 'devtools.timeline,disabled-by-default-devtools.timeline.frame'
  let traceBytes = 0, overflow = false, tracing = false, traceWritten = false, completionTimer
  const completed = new Promise(resolve => client.once('Tracing.tracingComplete', resolve))
  client.on('Tracing.dataCollected', ({ value }) => {
    const bytes = Buffer.byteLength(JSON.stringify(value))
    if (traceBytes + bytes > 32 * 1024 * 1024 || traceEvents.length + value.length > 150000) { overflow = true; return }
    traceBytes += bytes; for (const event of value) traceEvents.push(event)
  })
  try {
    await timeline(page).getByRole('button', { name: 'Reset sequence', exact: true }).click()
    await client.send('Tracing.start', { categories, transferMode: 'ReportEvents', options: 'record-as-much-as-possible' }); tracing = true
    await timeline(page).getByRole('button', { name: 'Start playback', exact: true }).click()
    // This is a bounded measurement window, independent of UI readiness waits.
    await page.waitForTimeout(8000)
    await timeline(page).getByRole('button', { name: 'Pause playback', exact: true }).click()
    await client.send('Tracing.end'); tracing = false
    const completion = await Promise.race([completed, new Promise((_, reject) => { completionTimer = setTimeout(() => reject(new Error('Bounded sequence trace did not complete')), 10000) })])
    clearTimeout(completionTimer)
    const threads = new Set(traceEvents.filter(event => event.name === 'FireAnimationFrame' && event.args?.data?.frame === frameId).map(event => `${event.pid}:${event.tid}`))
    const starts = new Map(), durations = new Map()
    for (const event of traceEvents) {
      if (!threads.has(`${event.pid}:${event.tid}`) || !['AnimationFrame', 'AnimationFrame::Render', 'AnimationFrame::StyleAndLayout'].includes(event.name)) continue
      const key = `${event.pid}:${event.tid}:${event.name}:${JSON.stringify(event.id2 ?? event.id)}`
      if (event.ph === 'b') starts.set(key, event.ts)
      if (event.ph === 'e' && starts.has(key)) {
        const milliseconds = (event.ts - starts.get(key)) / 1000; starts.delete(key)
        if (milliseconds >= 0) { const values = durations.get(event.name) || []; values.push(milliseconds); durations.set(event.name, values) }
      }
    }
    const metrics = Object.fromEntries([...durations].map(([name, values]) => {
      values.sort((a, b) => a - b)
      return [name, { count: values.length, p95Ms: values[Math.ceil(values.length * .95) - 1], maxMs: values.at(-1) }]
    }))
    const tracePath = join(source.traceOutput, 'sequence-frame-trace.json')
    await writeFile(tracePath, JSON.stringify({ traceEvents, displayTimeUnit: 'ms', metadata: { frameId, categories, inputDigest: source.digest, bytes: traceBytes, events: traceEvents.length, overflow, dataLossOccurred: Boolean(completion.dataLossOccurred), metrics } }))
    traceWritten = true
    assert.equal(overflow, false, 'A complete trace must fit its 32MiB/150,000-event budget')
    assert.equal(Boolean(completion.dataLossOccurred), false, 'Trace buffer loss invalidates frame evidence')
    assert.equal(threads.size, 1, 'Trace must identify exactly one renderer thread for the measured page')
    assert.ok(metrics.AnimationFrame?.count >= 250, 'Trace must contain at least 250 complete page frames')
    assert.ok(metrics['AnimationFrame::Render']?.count >= 250, 'Trace must retain full render-work spans')
    return { inputDigest: source.digest, events: 200, participants: source.model.participants.length, readyMs, repeatedTransport, captureMs: 8000, metrics, traceFile: basename(tracePath), traceEvents: traceEvents.length, traceBytes, complete: true, metricScope: 'Chromium AnimationFrame and nested Render/StyleAndLayout async spans on the measured page renderer thread; complete raw trace retained' }
  } finally {
    clearTimeout(completionTimer)
    if (tracing) await client.send('Tracing.end').catch(() => {})
    if (!traceWritten) await writeFile(join(source.traceOutput, 'sequence-frame-trace.incomplete.json'), JSON.stringify({ traceEvents, metadata: { complete: false, overflow, frameId, categories, inputDigest: source.digest, bytes: traceBytes } }))
    await client.detach()
  }
}

async function sourceInvalidationProof(page, source, validSourceDigest) {
  const before = await inspectDocument(page)
  await timeline(page).getByRole('button', { name: 'Reset sequence', exact: true }).click()
  await timeline(page).getByRole('button', { name: 'Start playback', exact: true }).click()
  await expect(timeline(page).getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
  await expect(currentTime(page)).not.toHaveText('0.0s')
  await page.getByRole('button', { name: 'Launch', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import local files', exact: true }).click()
  const fileChooser = await chooser
  await expect(timeline(page).getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible()
  const playingTime = await currentTime(page).textContent()
  assert.ok(parseFloat(playingTime) > 0, 'The old source must still be playing immediately before import')
  await fileChooser.setFiles(source.path)
  await expect.poll(async () => (await inspectDocument(page)).canonicalPath?.endsWith(source.name), { timeout: 60000 }).toBe(true)
  const canonicalPath = (await inspectDocument(page)).canonicalPath
  let expectedDiagnostics
  const assertDiagnostics = async surface => {
    const alerts = surface.getByRole('alert')
    await expect(alerts).toHaveCount(source.model.diagnostics.length)
    for (const alert of await alerts.all()) await expect(alert).toBeVisible()
    const actual = await alerts.allTextContents()
    assert.ok(actual.every(text => /^Line [1-9]\d*: /.test(text)), 'Diagnostics must expose authored source locations')
    assert.deepEqual(actual.map(text => text.replace(/^Line [1-9]\d*: /, '')), source.model.diagnostics.map(item => item.message))
    if (expectedDiagnostics) assert.deepEqual(actual, expectedDiagnostics, 'Saved diagnostics must name the exact authored lines')
    return actual
  }
  const assertStopped = async () => {
    assert.equal((await inspectDocument(page)).canonicalPath, canonicalPath)
    await expect(sequenceCanvas(page).getByRole('status')).toHaveText('Sequence source needs correction')
    const diagnostics = await assertDiagnostics(sequenceCanvas(page)); await assertDiagnostics(timeline(page))
    await expect(sequenceCanvas(page).locator('[data-sequence-event], [data-sequence-pulse]')).toHaveCount(0)
    await expect(timeline(page).locator('[data-sequence-timeline-event]')).toHaveCount(0)
    await expect(timeline(page).getByRole('button', { name: 'Start playback', exact: true })).toBeDisabled()
    await expect(timeline(page).getByRole('button', { name: 'Pause playback', exact: true })).toHaveCount(0)
    for (const name of ['Reset sequence', 'Next step']) await expect(timeline(page).getByRole('button', { name, exact: true })).toBeDisabled()
    await expect(currentTime(page)).toHaveText('0.0s')
    return diagnostics
  }
  await expect(sequenceCanvas(page)).toBeVisible({ timeout: 60000 })
  const initialDiagnostics = await assertStopped(), started = performance.now()
  let samples = 0
  do { await page.waitForTimeout(100); await assertStopped(); samples++ } while (performance.now() - started < 2000 || samples < 2)
  const observedMs = Math.round(performance.now() - started)
  const inspector = await ensureInspector(page)
  await expect(inspector.getByRole('status').first()).toHaveText('No playable sequence')
  await assertDiagnostics(inspector); await expect(inspector.getByRole('button', { pressed: true })).toHaveCount(0)
  await ensureWorkspaceEditor(page)
  await page.getByRole('button', { name: 'Launch', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => {
    const markdown = await storedSource(page, canonicalPath)
    try { return markdown !== null && source.extract(markdown) === source.code } catch { return false }
  }, { timeout: 15000 }).toBe(true)
  // View settings may add frontmatter lines; source locations bind the actual saved document.
  expectedDiagnostics = source.diagnosticText(await storedSource(page, canonicalPath))
  assert.equal((await page.reload({ waitUntil: 'domcontentloaded' }))?.status(), 200)
  await expect(sequenceCanvas(page)).toBeVisible({ timeout: 60000 })
  const savedDiagnostics = await assertStopped()
  assert.equal(source.extract(await storedSource(page, canonicalPath)), source.code, 'Invalid authored bytes survive save and offline reload')
  return { source: { basename: source.name, sha256: source.digest, bytes: source.bytes },
    validBefore: { canonicalPath: before.canonicalPath, sourceSha256: validSourceDigest, playingTime }, canonicalPath,
    sequenceDigest: sha256(source.code), initialDiagnostics, savedDiagnostics, observedMs, samples,
    playbackStopped: true, playbackDisabled: true, staleSourceDidNotAdvance: true, inspectorInvalid: true, authoredBytesPreserved: true, savedAndReloaded: true }
}

export async function proveSequenceRehearsal({ page, sourcePath, output, stressPath, invalidPath, setNetworkPhase = () => {} }) {
  let source, phase = 'external-input'
  try {
    source = await readSequenceProofSource(sourcePath)
    assert.ok(!invalidPath || stressPath, 'Source invalidation proof requires the external continuous stress source')
    const invalid = invalidPath ? await readSequenceProofSource(invalidPath, { valid: false }) : null
    setNetworkPhase('sequence-offline'); phase = 'studio-offline-navigation'
    const url = new URL(page.url()), revision = url.searchParams.get('python-learning-offline') || url.searchParams.get('studio-offline')
    assert.match(revision || '', /^[0-9a-f]{40}$/, 'Sequence proof requires an existing verified installation route')
    url.searchParams.delete('python-learning-offline'); url.searchParams.set('studio-offline', revision)
    assert.equal((await page.goto(url.href, { waitUntil: 'domcontentloaded' }))?.status(), 200)
    await page.setViewportSize({ width: 1280, height: 800 }); phase = 'import-save-reload'
    const readyMs = await importSource(page, source, { closeEditor: false }), binding = await saveAndReload(page, source)
    phase = 'renderers'; const renderers = await rendererProof(page, source)
    phase = 'branches'; const branches = await branchesProof(page, source)
    phase = 'mobile-reduced-motion'; const mobile = await mobileMotionProof(page, source)
    await page.screenshot({ path: join(output, 'sequence-offline-mobile.png'), fullPage: true })
    phase = 'stress'; const performance = stressPath ? await stressProof(page, { ...await readSequenceProofSource(stressPath), traceOutput: output }) : null
    phase = 'source-invalidation'; const sourceInvalidation = invalid ? await sourceInvalidationProof(page, invalid, performance.inputDigest) : null
    await page.setViewportSize({ width: 1280, height: 800 }); await page.emulateMedia({ reducedMotion: 'no-preference' })
    if (stressPath) {
      phase = 'source-recovery'
      await importSource(page, source)
      if (sourceInvalidation) {
        const restored = await inspectDocument(page)
        assert.equal(source.extract(await storedSource(page, restored.canonicalPath)), source.code)
        sourceInvalidation.recovery = { canonicalPath: restored.canonicalPath, sourceSha256: source.digest, sequenceDigest: sha256(source.code), restored: true }
      }
    }
    await page.screenshot({ path: join(output, 'sequence-offline-desktop.png'), fullPage: true })
    const evidence = { source: { basename: source.name, sha256: source.digest, bytes: source.bytes }, offlineRoute: 'studio-offline', revision, binding, readyMs, events: source.model.events.length, participants: source.model.participants.length, renderers, branches, mobile, performance, sourceInvalidation, desktopViewport: { width: 1280, height: 800 }, productionBuildBrowser: true, physicalDeviceProven: false, productionDeploymentProven: false }
    await writeFile(join(output, 'sequence-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
    // Retain recovery observations even when timing fails; the overall gate stays strict.
    phase = 'performance-budget'
    if (performance) assert.ok(performance.metrics.AnimationFrame.p95Ms <= 16, `200-event full frame p95 ${performance.metrics.AnimationFrame.p95Ms.toFixed(3)}ms must remain within 16ms`)
    return evidence
  } catch (error) {
    await writeFile(join(output, 'sequence-failure.json'), JSON.stringify({ status: 'failed', phase, sourceDigest: source?.digest || null, url: page.url(), error: error instanceof Error ? error.message : String(error) }, null, 2) + '\n')
    await page.screenshot({ path: join(output, 'sequence-failure.png'), fullPage: true }).catch(() => {})
    throw error
  }
}
