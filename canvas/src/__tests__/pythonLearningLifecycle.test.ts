import test from 'node:test'
import './pythonLearningFlightPath.test'
import assert from 'node:assert/strict'
import { LearningRuntime, digestLearningSource, type LearningWorkerPort } from '../features/python-learning/learningRuntime'
import { createPythonWorkerHost, type LearningPlayback } from '../features/python-learning/pythonWorker'
import { validLearningSnapshot, type LearningWorkerSnapshot } from '../features/python-learning/learningProtocol'
import { LEARNING_LESSONS } from '../features/python-learning/learningLessons'
import { PythonLearningError, pythonError } from '../features/python-learning/pythonModel'
import { resolveWebMcpToolScope } from '../features/agent-ready/webMcpToolExposure.mjs'
import { LearningSimulation } from '../features/python-learning/learningSimulation'
import { inspectDroneBenchLog, DRONE_BENCH_LOG_BYTES } from '../features/python-learning/learningDroneBenchLog'
import { LEARNING_LESSON_FILES, LEARNING_LESSON_FOLDER, ensureLearningLessonFiles, sourceLearningLesson } from '../features/python-learning/learningLessonFiles'
import { learningCanvasReplayTick } from '../features/python-learning/learningCanvasReplay'

test('Canvas replay retains a valid pose when its first frame precedes the effect clock', () => {
  assert.equal(learningCanvasReplayTick(100, 99, 0, 540), 0)
  assert.equal(learningCanvasReplayTick(100, 99, 120, 540), 120)
  assert.equal(learningCanvasReplayTick(100, 100, 0, 540), 0)
  assert.equal(learningCanvasReplayTick(100, 1100, 120, 540), 180)
  assert.equal(learningCanvasReplayTick(100, 10000, 0, 540), 540)
})

test('native lesson folder preserves edits, migrated roots and deletions across reload', async () => {
  const { createMemoryWorkspaceFs } = await import('../features/workspace-fs/workspaceFsMemory')
  const { resolveSourceFileCloudWorkspaceTarget } = await import('../features/source-files/sourceFileCanonicalCloudSync')
  const { loadWorkspaceSourceIndex } = await import('../features/workspace-fs/sourceIndex')
  const { buildWorkspaceDocsMirrorSourceOwnedPathSet } = await import('../features/workspace-fs/workspaceDocsMirrorSourceOwnership')
  const fs = createMemoryWorkspaceFs()
  const previous = '# My own code 保留\nprint(42)\n'
  await fs.createFile({ parentPath: '/', name: LEARNING_LESSON_FILES[1].name, text: previous })
  const [first, concurrent] = await Promise.all([ensureLearningLessonFiles(fs), ensureLearningLessonFiles(fs)])
  assert.deepEqual(first, concurrent)
  const ownedPaths = buildWorkspaceDocsMirrorSourceOwnedPathSet(loadWorkspaceSourceIndex())
  assert.ok(ownedPaths.has(LEARNING_LESSON_FOLDER), 'normal docs reconciliation preserves the lesson folder')
  assert.deepEqual(LEARNING_LESSON_FILES.map(file => file.id), LEARNING_LESSONS.map(lesson => lesson.id))
  for (const file of LEARNING_LESSON_FILES) {
    assert.equal(first.find(entry => entry.path === file.path)?.parentPath, LEARNING_LESSON_FOLDER)
    assert.ok(ownedPaths.has(file.path), 'normal source ownership prevents seed reconciliation from replacing learner files')
    const source = await fs.readFileText(file.path)
    assert.equal(source, file.id === 'route' ? previous : `# agentic-graph lesson: ${file.id}\n` + LEARNING_LESSONS.find(lesson => lesson.id === file.id)!.solution)
    assert.equal(sourceLearningLesson(source!, file.path), file.id)
    assert.equal(sourceLearningLesson('# agentic-graph lesson: route', file.path.slice(1)), file.id, 'path wins while prior source is still loading')
    assert.equal(resolveSourceFileCloudWorkspaceTarget(file.path)?.documentKind, 'python')
  }
  await fs.writeFileText(first[0].path, '')
  await fs.deleteEntry(first[3].path)
  const reopened = createMemoryWorkspaceFs({ initialEntries: await fs.listEntries() })
  assert.equal((await ensureLearningLessonFiles(reopened)).length, 3, 'deleted or renamed examples are not recreated')
  assert.equal(await reopened.readFileText(first[0].path), '')
  assert.equal(await reopened.readFileText('/' + LEARNING_LESSON_FILES[1].name), previous)
  assert.equal(sourceLearningLesson('# agentic-graph lesson: unknown\nprint(1)', '/other.py'), 'travel')
  assert.equal(sourceLearningLesson('# agentic-graph lesson: route\nprint(1)', '/renamed.py'), 'route')
})

test('local docs reads preserve saved edits, cleared bytes and deletion over stale display copies', async () => {
  const { createMemoryWorkspaceFs } = await import('../features/workspace-fs/workspaceFsMemory')
  const { setWorkspaceEntrySource } = await import('../features/workspace-fs/sourceIndex')
  const { readWorkspaceActiveDocumentObservedText, readWorkspaceActiveDocumentResolvedText, readWorkspaceActiveEntrySnapshot, resolveActiveWorkspaceEntriesSnapshot, readActiveWorkspaceSourceFileFallbackText } = await import('../features/source-files/sourceFilesRuntimeActive')
  const fs = createMemoryWorkspaceFs(), activePath = await fs.createFile({ parentPath: '/docs', name: 'local-reader.py', text: '' })
  setWorkspaceEntrySource(activePath, { kind: 'local' }, { persist: 'sync' })
  const staleEntries = (await fs.listEntries()).filter(entry => entry.path === activePath).map(entry => ({ ...entry, text: 'stale copy' }))
  try {
    for (const text of ['# Saved edit 保留\nprint(42)\n', '']) {
      await fs.writeFileText(activePath, text)
      assert.equal(await readWorkspaceActiveDocumentResolvedText({ activePath, fs, currentText: 'stale copy', preferCanonicalPathText: true }), text)
      const observed = await readWorkspaceActiveDocumentObservedText({ activePath, fs, fallbackText: 'stale copy', preferCanonicalPathText: true })
      assert.equal(observed.text, text); assert.equal(observed.observedWorkspaceText, text)
      assert.equal(await readWorkspaceActiveDocumentResolvedText({ activePath, fs, currentText: 'stale copy' }), text)
      assert.equal((await readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: staleEntries }))[0]?.text, text)
      assert.equal((await resolveActiveWorkspaceEntriesSnapshot({ activePath, fs, activeWorkspaceEntriesSnapshot: staleEntries }))[0]?.text, text)
      assert.equal(await readActiveWorkspaceSourceFileFallbackText({ activePath, fs, activeWorkspaceEntriesSnapshot: staleEntries }), text)
    }
    await fs.deleteEntry(activePath)
    assert.deepEqual(await readWorkspaceActiveEntrySnapshot({ activePath, fs, workspaceEntries: staleEntries }), [])
    assert.deepEqual(await resolveActiveWorkspaceEntriesSnapshot({ activePath, fs, activeWorkspaceEntriesSnapshot: staleEntries }), [])
    assert.equal(await readWorkspaceActiveDocumentResolvedText({ activePath, fs, currentText: 'stale copy', preferCanonicalPathText: true, preserveMissing: true }), null)
  } finally { setWorkspaceEntrySource(activePath, null) }
})

test('lesson initialization fails loudly on collisions and resumes a partial save safely', async () => {
  const { createMemoryWorkspaceFs } = await import('../features/workspace-fs/workspaceFsMemory')
  const blocked = createMemoryWorkspaceFs()
  await blocked.createFile({ parentPath: '/', name: 'docs', text: 'preserve' })
  await assert.rejects(ensureLearningLessonFiles(blocked), /occupied by a file/)
  assert.equal(await blocked.readFileText('/docs'), 'preserve')
  const fs = createMemoryWorkspaceFs()
  let writes = 0
  const flaky = { ...fs, createFile: async (args: Parameters<typeof fs.createFile>[0]) => {
    if (++writes === 2) throw new Error('QuotaExceededError')
    return fs.createFile(args)
  } }
  await assert.rejects(ensureLearningLessonFiles(flaky), /QuotaExceededError/)
  assert.equal((await ensureLearningLessonFiles(flaky)).length, 4)
  assert.equal((await fs.listEntries()).filter(entry => entry.kind === 'file').length, 4)
  await fs.deleteEntry(LEARNING_LESSON_FILES[0].path)
  await fs.createFolder({ parentPath: LEARNING_LESSON_FOLDER, name: LEARNING_LESSON_FILES[0].name })
  await assert.rejects(ensureLearningLessonFiles(fs, true), /folder occupies/)
})

test('Python selection settles without retrying Markdown Canvas application over learner edits', async () => {
  const { isWorkspaceDocumentSwitchApplySettled, shouldForceWorkspaceDocumentSwitchGraphApply, shouldApplyStableWorkspaceSelectionToCanvas } = await import('../lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitchApply')
  const path = '/docs/python-lessons/02-repeat-a-route.PY'
  const state = { activeDocumentKey: path, text: 'print(42)', markdownDocumentName: '/notes.md', markdownDocumentText: 'Other Canvas', graphDataSource: 'markdown:/notes.md' }
  assert.equal(isWorkspaceDocumentSwitchApplySettled(state), true)
  assert.equal(shouldForceWorkspaceDocumentSwitchGraphApply({ activeDocumentKey: path, pendingSwitchPath: path }), false)
  assert.equal(shouldApplyStableWorkspaceSelectionToCanvas({ ...state, activePath: path, activeEntryKind: 'file', nextText: state.text }), false)
  assert.equal(isWorkspaceDocumentSwitchApplySettled({ ...state, activeDocumentKey: '/new.md' }), false)
  assert.equal(shouldForceWorkspaceDocumentSwitchGraphApply({ activeDocumentKey: '/new.md', pendingSwitchPath: '/new.md' }), true)
})

test('Python discovery follows the active editor document without capturing other workspace groups', () => {
  const state = { workspaceViewMode: 'editor', markdownDocumentName: '/workspace/lesson.PY' }
  assert.equal(resolveWebMcpToolScope(state), 'pythonLearning')
  assert.equal(resolveWebMcpToolScope({ ...state, markdownDocumentName: '/notes.md' }), 'editor')
  assert.equal(resolveWebMcpToolScope({ ...state, workspaceViewMode: 'canvas' }), 'graph')
  assert.equal(resolveWebMcpToolScope({ ...state, floatingPanelOpen: true, floatingPanelView: 'chat' }), 'chat')
  assert.equal(resolveWebMcpToolScope(state, true), 'mission')
})

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 1))
const droneLesson = LEARNING_LESSONS.find(lesson => lesson.id === 'drone')!
const droneSpan = { line: 1, column: 1 }
test('drone command bounds reject atomically and remain isolated from ground lessons', async () => {
  const drone = new LearningSimulation(droneLesson), ground = new LearningSimulation(LEARNING_LESSONS[0])
  try {
    await assert.rejects(ground.call('takeoff', [2n], droneSpan), /drone lesson/)
    for (const [name, args] of [['hover', [1n]], ['fly', [1n, 0n, 0n, 1n]], ['takeoff', [5n]], ['takeoff', []], ['drive', [1n, 1n]]] as const) {
      const before = drone.snapshot()
      await assert.rejects(drone.call(name, [...args], droneSpan))
      assert.deepEqual(drone.snapshot(), before)
    }
    await drone.call('takeoff', [2n], droneSpan)
    for (const [name, args] of [['takeoff', [2n]], ['fly', [3n, 3n, 0n, 60n]], ['fly', [0n, 0n, 3n, 60n]], ['fly', [0n, 0n, -3n, 60n]], ['hover', [3601n]]] as const) {
      const before = drone.snapshot()
      await assert.rejects(drone.call(name, [...args], droneSpan))
      assert.deepEqual(drone.snapshot(), before)
    }
    await drone.call('hover', [3600n], droneSpan)
    await assert.rejects(drone.call('hover', [3600n], droneSpan), /7,200/)
  } finally { drone.dispose(); ground.dispose() }
})
test('drone collisions, altitude sensing, body-relative yaw and blocked landing use native geometry', async () => {
  const drone = new LearningSimulation(droneLesson)
  try {
    await drone.call('takeoff', [{ kind: 'float', value: 0.5 }], droneSpan)
    assert.ok(drone.snapshot().distance < 2)
    await drone.call('fly', [1n, 0n, 0n, 180n], droneSpan)
    assert.ok(drone.snapshot().x < 1.5 && drone.snapshot().collisions > 0)
    assert.equal(drone.snapshot().atGoal, false)
  } finally { drone.dispose() }
  const high = new LearningSimulation(droneLesson)
  try {
    await high.call('takeoff', [2n], droneSpan)
    assert.ok(high.snapshot().distance > 7)
    await high.call('fly', [1n, 0n, 0n, 120n], droneSpan)
    await high.call('land', [], droneSpan)
    assert.ok(high.snapshot().altitude! > 0 && high.snapshot().collisions > 0)
    assert.equal(high.snapshot().landed, false)
    await high.call('turn', [90n], droneSpan)
    const before = high.snapshot()
    await high.call('fly', [1n, 0n, 0n, 60n], droneSpan)
    assert.ok(Math.abs(high.snapshot().x - before.x) < 1e-10)
    assert.ok(Math.abs(high.snapshot().z - before.z - 1) < 1e-10)
  } finally { high.dispose() }
})
test('drone worker evidence rejects forged altitude, landing, trace shape and grade', async () => {
  const f = fixture()
  try {
    f.bind(droneLesson.solution, droneLesson.id); await f.runtime.control('run')
    await until(() => f.runtime.read().state === 'completed')
    const result = f.runtime.read().result!
    assert.equal(result.scene.ticks, 540); assert.equal(result.scene.landed, true)
    assert.equal(result.scene.hoverTicks, 60); assert.equal(result.trace![0].length, 5)
    for (const scene of [{ ...result.scene, altitude: 5 }, { ...result.scene, landed: false },
      { ...result.scene, maxAltitude: -1 }, { ...result.scene, hoverTicks: 541 }]) {
      assert.equal(validLearningSnapshot({ ...result, scene }), false)
    }
    assert.equal(validLearningSnapshot({ ...result, trace: [[1, 0, 0, 0]] }), false)
    assert.equal(validLearningSnapshot({ ...result, trace: [[1, 0, 0, 0, -1]] }), false)
    assert.equal(validLearningSnapshot({ ...result, grade: { ...result.grade, score: 0 } }), false)
  } finally { f.runtime.dispose() }
})
test('GameXR bench export is inspected without confusing requests, reports and measured flight', () => {
  const profile = 'esp-drone-rpyt-bench/v1', axes = { roll: -0.2, pitch: 0.3, yaw: -0.1, throttle: 0.5 }
  const event = (event: string, value: unknown) => ({ at: '2026-09-25T15:00:00.000Z', event, value })
  const report = { kind: 'status', backend: 'simulated', connected: true, owned: true, enabled: true,
    telemetry: { source: 'simulated', profile, motorOutputs: false, batteryVolts: null, attitudeDegrees: null, setpoint: axes } }
  const log = { schema: 'gamexr-drone-bench-log/v1', profile, physicalAircraft: false, records: [
    event('sent', { kind: 'enable' }), event('sent', { kind: 'controls', profile, sequence: 1, axes }),
    event('status', report), event('inhibited', 'Focus lost'), event('sent', { kind: 'disable' }),
  ] }
  assert.deepEqual(inspectDroneBenchLog(JSON.stringify(log)), { records: 5, controlRequests: 1, receiverReports: 1, inhibitions: 1, lastSetpoint: axes, lastPathPose: null })
  assert.equal(inspectDroneBenchLog(JSON.stringify({ ...log, records: [log.records[1]] })).lastSetpoint, null)
  for (const invalid of [{ ...log, profile: 'unknown' }, { ...log, physicalAircraft: true },
    { ...log, records: Array(1001).fill(log.records[0]) },
    { ...log, records: [event('status', { ...report, telemetry: { ...report.telemetry, motorOutputs: true } })] },
    { ...log, records: [event('sent', { kind: 'controls', profile, sequence: 1, axes: { ...axes, throttle: -0.1 } })] },
    { ...log, records: [event('execute', 'takeoff(2)')] }]) assert.throws(() => inspectDroneBenchLog(JSON.stringify(invalid)), /Invalid GameXR/)
  assert.throws(() => inspectDroneBenchLog(' '.repeat(DRONE_BENCH_LOG_BYTES + 1)), /maximum/)
})
async function until(condition: () => boolean) {
  const deadline = performance.now() + 2500
  while (!condition()) { if (performance.now() > deadline) assert.fail('Runtime condition timed out.'); await tick() }
}
function fixture(digest = async (_source: string) => 'a'.repeat(64), now = () => performance.now(), playback?: LearningPlayback) {
  const messages: LearningWorkerSnapshot[] = [], ports: LearningWorkerPort[] = []
  let terminated = 0
  const runtime = new LearningRuntime(() => {
    const host = createPythonWorkerHost(data => {
      if (data.kind === 'snapshot') messages.push(structuredClone(data))
      port.onmessage?.({ data: structuredClone(data) })
    }, now, playback)
    const port: LearningWorkerPort = { onmessage: null, onerror: null, postMessage: host.receive, terminate: () => { terminated++; host.dispose() } }
    ports.push(port); return port
  }, digest)
  const bind = (source: string, lessonId = 'travel', documentId = '/learning.py') => runtime.bind({ workspaceId: 'workspace:test', documentId, lessonId, source })
  return { runtime, bind, messages, ports, terminated: () => terminated }
}

test('paced drone Run exposes intermediate motion for nine seconds without spending compute budget', async () => {
  let clock = 0
  const waits: number[] = [], paced = fixture(undefined, () => clock, { wait: async ms => { waits.push(ms); clock += ms } }), fast = fixture()
  try {
    paced.bind(droneLesson.solution, 'drone'); fast.bind(droneLesson.solution, 'drone')
    await paced.runtime.control('run'); await fast.runtime.control('run')
    await until(() => paced.runtime.read().state === 'completed' && fast.runtime.read().state === 'completed')
    assert.ok(Math.abs(clock - 9000) < 1e-5)
    assert.equal(waits.length, 270); assert.ok(waits.every(ms => ms > 0 && ms <= 1000 / 30 + 1e-8))
    assert.equal(paced.runtime.read().result!.computeMs, 0, 'display waits are not active evaluator compute')
    for (const key of ['scene', 'trace', 'grade', 'metrics', 'output']) assert.deepEqual(paced.runtime.read().result![key], fast.runtime.read().result![key])
    const scenes = paced.messages.filter(row => row.state === 'running').map(row => row.scene)
    assert.ok(scenes.some(scene => scene.altitude! > 0 && scene.altitude! < 1 && scene.x === 0))
    assert.ok(scenes.some(scene => scene.altitude! > 1.9 && scene.x > 0 && scene.x < 4))
    assert.ok(scenes.some(scene => scene.altitude! > 0 && scene.altitude! < 1 && scene.x > 3.9))
    assert.ok(paced.messages.every(validLearningSnapshot))
  } finally { paced.runtime.dispose(); fast.runtime.dispose() }
})

test('paced drone pause freezes motion, late timers do not cause catch-up, and Stop fences pending frames', async () => {
  let clock = 0
  const waits: Array<{ ms: number; release: () => void }> = []
  const f = fixture(undefined, () => clock, { wait: ms => new Promise<void>(release => waits.push({ ms, release })) })
  try {
    f.bind(droneLesson.solution, 'drone'); await f.runtime.control('run'); await until(() => waits.length === 1)
    f.runtime.setHidden(true)
    clock += waits[0].ms; waits.shift()!.release(); await until(() => f.runtime.read().state === 'paused')
    const frozen = f.runtime.read(); clock += 60_000
    f.runtime.setHidden(false); await tick(); assert.equal(f.runtime.read(), frozen)
    await f.runtime.control('run'); await until(() => waits.length === 1)
    assert.ok(waits[0].ms > 0 && waits[0].ms <= 1000 / 30 + 1e-8)
    clock += 2000; waits.shift()!.release(); await until(() => waits.length === 1)
    assert.ok(waits[0].ms > 0 && waits[0].ms <= 1000 / 30 + 1e-8)
    const messages = f.messages.length
    f.runtime.stop(); waits.shift()!.release(); await tick(); await tick()
    assert.equal(f.runtime.read().state, 'cancelled'); assert.equal(f.messages.length, messages)
  } finally { f.runtime.dispose() }
})

test('a backwards tick cannot refresh the paced worker watchdog', async () => {
  const f = fixture()
  try {
    f.bind('takeoff(2)', 'drone'); await f.runtime.control('validate')
    const ready = f.messages[0], handler = f.ports[0].onmessage!
    handler({ data: { ...ready, state: 'running', sequence: 2, scene: { ...ready.scene, ticks: 2 } } })
    assert.equal(f.runtime.read().state, 'running')
    handler({ data: { ...ready, state: 'running', sequence: 3, scene: { ...ready.scene, ticks: 1 } } })
    assert.equal(f.runtime.read().state, 'failed'); assert.match(f.runtime.read().error!.message, /backwards/)
    assert.equal(f.terminated(), 1)
  } finally { f.runtime.dispose() }
})

test('real worker host: Run and Step produce identical deterministic lesson evidence', async () => {
  for (const lesson of LEARNING_LESSONS) {
    const a = fixture(), b = fixture()
    try {
      a.bind(lesson.solution, lesson.id); b.bind(lesson.solution, lesson.id)
      await a.runtime.control('run'); await until(() => a.runtime.read().state === 'completed')
      for (let step = 0; step < 120 && b.runtime.read().state !== 'completed'; step++) {
        await b.runtime.control('step'); await until(() => ['paused', 'completed', 'failed'].includes(b.runtime.read().state))
        assert.notEqual(b.runtime.read().state, 'failed', JSON.stringify(b.runtime.read().error))
      }
      assert.equal(b.runtime.read().state, 'completed')
      const run = a.runtime.read().result!, stepped = b.runtime.read().result!
      for (const key of ['scene', 'trace', 'output', 'variables', 'grade', 'metrics']) assert.deepEqual(run[key], stepped[key], `${lesson.id}:${key}`)
      assert.equal(run.grade.passed, true); assert.ok(a.messages.every(validLearningSnapshot)); assert.ok(b.messages.every(validLearningSnapshot))
      assert.equal(a.terminated(), 1); assert.equal(b.terminated(), 1)
    } finally { a.runtime.dispose(); b.runtime.dispose() }
  }
})

test('validation allocates a paused run without executing; edits fence old messages and queued hashes', async () => {
  const f = fixture(); f.bind('print("old")')
  try {
    await f.runtime.control('validate'); assert.equal(f.runtime.read().state, 'ready'); assert.equal(f.runtime.read().result!.output, '')
    const old = f.messages.at(-1)!, oldHandler = f.ports[0].onmessage
    f.bind('print("new")'); oldHandler?.({ data: { ...old, state: 'completed', sequence: 2 } })
    assert.equal(f.runtime.read().state, 'idle'); assert.equal(f.runtime.read().stale, true)
    await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
    assert.equal(f.runtime.read().result!.output, 'new\n')
  } finally { f.runtime.dispose() }
  let resolve!: (digest: string) => void
  const pending = fixture(source => source.startsWith('{') ? Promise.resolve('b'.repeat(64)) : new Promise<string>(done => { resolve = done }))
  try {
    pending.bind('print(1)'); const start = pending.runtime.control('run')
    pending.bind('print(2)', 'travel', '/other.py'); resolve('b'.repeat(64)); await start
    assert.equal(pending.ports.length, 0); assert.equal(pending.runtime.read().state, 'idle')
  } finally { pending.runtime.dispose() }
})

test('stop, reset, read-only changes and malformed/replayed messages cannot publish success', async () => {
  const f = fixture(); f.bind('while True:\n    pass\n')
  try {
    await f.runtime.control('validate'); const event = f.messages[0], handler = f.ports[0].onmessage
    handler?.({ data: event }); assert.equal(f.runtime.read().state, 'failed')
    await f.runtime.control('validate'); const second = f.ports.at(-1)!.onmessage
    f.runtime.stop(); second?.({ data: event }); assert.equal(f.runtime.read().state, 'cancelled')
    await f.runtime.control('reset'); assert.equal(f.runtime.read().result, null)
    f.runtime.bind({ ...f.runtime.read().document!, readOnly: true })
    await assert.rejects(f.runtime.control('run'), /editable/)
    f.bind('import os'); await f.runtime.control('run'); assert.equal(f.runtime.read().state, 'failed')
    assert.ok(f.runtime.read().error?.span.line)
    f.bind('print(1)'); await f.runtime.control('validate')
    f.ports.at(-1)!.onmessage?.({ data: { ...f.messages.at(-1), sequence: 2, scene: { ...event.scene, x: NaN } } })
    assert.equal(f.runtime.read().state, 'failed')
  } finally { f.runtime.dispose() }
})

test('Pause and hidden-tab signals during hashing prevent execution until explicit visible resume', async () => {
  for (const pause of ['manual', 'hidden'] as const) {
    const pending: Array<(value: string) => void> = []
    const f = fixture(() => new Promise<string>(resolve => pending.push(resolve)))
    try {
      f.bind('print("resumed")'); const start = f.runtime.control('run')
      assert.equal(f.runtime.read().state, 'validating')
      if (pause === 'hidden') f.runtime.setHidden(true)
      else await f.runtime.control('pause')
      pending.forEach(resolve => resolve('a'.repeat(64))); await start
      assert.equal(f.runtime.read().state, 'ready'); assert.equal(f.runtime.read().result!.output, '')
      assert.equal(f.runtime.read().result!.scene.ticks, 0)
      if (pause === 'hidden') {
        await assert.rejects(f.runtime.control('run'), /tab is hidden/)
        await assert.rejects(f.runtime.control('step'), /tab is hidden/)
        const state = f.runtime.read(); f.runtime.setHidden(false); await tick()
        assert.equal(f.runtime.read(), state, 'visibility restoration cannot resume execution')
      }
      await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
      assert.equal(f.runtime.read().result!.output, 'resumed\n'); assert.equal(f.ports.length, 1)
    } finally { f.runtime.dispose() }
  }
})

test('manual and hidden pauses freeze unfinished motion until explicit resume without consuming paused compute', async () => {
  const source = 'drive(1, 3600)\nprint("after pause")', baseline = fixture()
  try {
    baseline.bind(source); await baseline.runtime.control('run'); await until(() => baseline.runtime.read().state === 'completed')
    for (const pause of ['manual', 'hidden'] as const) {
      let clock = 0
      const f = fixture(undefined, () => clock); f.bind(source)
      try {
        if (pause === 'hidden') {
          f.runtime.setHidden(true)
          await assert.rejects(f.runtime.start('run'), /tab is hidden/)
          await assert.rejects(f.runtime.control('step'), /tab is hidden/)
          assert.equal(f.ports.length, 0); assert.equal(f.runtime.read().state, 'idle')
          f.runtime.setHidden(false)
        }
        await f.runtime.control('run')
        if (pause === 'hidden') f.runtime.setHidden(true)
        else await f.runtime.control('pause')
        await until(() => f.runtime.read().state === 'paused')
        const frozen = f.runtime.read(), count = f.messages.length
        assert.ok(frozen.result!.scene.ticks > 0 && frozen.result!.scene.ticks < 3600, 'Pause must suspend inside drive.')
        assert.equal(frozen.result!.output, '')
        clock += 6000; await tick(); await tick()
        assert.equal(f.runtime.read(), frozen); assert.equal(f.messages.length, count)
        if (pause === 'hidden') {
          await assert.rejects(f.runtime.control('run'), /tab is hidden/)
          await assert.rejects(f.runtime.control('step'), /tab is hidden/)
          f.runtime.setHidden(false); await tick(); assert.equal(f.runtime.read(), frozen)
        }
        await f.runtime.control('step')
        await until(() => f.runtime.read().state === 'paused' && f.runtime.read().result!.scene.ticks === 3600)
        assert.equal(f.runtime.read().result!.output, '', 'Step finishes the retained statement only.')
        await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
        assert.equal(f.ports.length, 1)
        for (const key of ['scene', 'trace', 'output', 'variables', 'grade', 'metrics'] as const) {
          assert.deepEqual(f.runtime.read().result![key], baseline.runtime.read().result![key], `${pause}:${key}`)
        }
      } finally { f.runtime.dispose() }
    }
  } finally { baseline.runtime.dispose() }
})

test('stopping, switching document or disposing a suspended motion fences its retained continuation', async () => {
  for (const operation of ['stop', 'bind', 'dispose'] as const) {
    const f = fixture(undefined, () => 0); f.bind('drive(1, 3600)\nprint("stale")')
    try {
      await f.runtime.control('run'); await f.runtime.control('pause')
      await until(() => f.runtime.read().state === 'paused')
      const count = f.messages.length
      if (operation === 'bind') f.bind('print("current")', 'travel', '/current.py')
      else f.runtime[operation]()
      const stopped = f.runtime.read(); await tick(); await tick()
      assert.equal(f.runtime.read(), stopped); assert.equal(f.messages.length, count)
      assert.equal(f.terminated(), 1)
      if (operation === 'bind') {
        await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
        assert.equal(f.runtime.read().result!.output, 'current\n')
      }
    } finally { f.runtime.dispose() }
  }
})

test('worker diagnostics retain typed errors while stripping non-serializable AST data from spans', () => {
  const span = { line: 2, column: 8, kind: 'binary', left: { kind: 'literal', value: 1n }, right: { kind: 'literal', value: 2n } }
  const error = pythonError(new PythonLearningError('limit-exceeded', 'AST depth limit.', span))
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    code: 'limit-exceeded', message: 'AST depth limit.', span: { line: 2, column: 8 },
  })
})

test('excessive AST depth fails before the worker can publish an allocated scene', async () => {
  const f = fixture(); f.bind('drive(1, 1)\nvalue = ' + Array(40).fill('1').join(' + '))
  try {
    await f.runtime.control('run')
    assert.equal(f.runtime.read().state, 'failed')
    assert.equal(f.runtime.read().error?.code, 'limit-exceeded')
    assert.match(f.runtime.read().error!.message, /AST depth limit/)
    assert.deepEqual(Object.keys(f.runtime.read().error!.span).sort(), ['column', 'line'])
    assert.equal(f.messages.length, 0)
    assert.equal(f.runtime.read().result, null)
  } finally { f.runtime.dispose() }
})

test('pause and resume use the same worker; terminating while a native simulation yields is fenced', async () => {
  const f = fixture(); f.bind('drive(1, 3600)')
  try {
    await f.runtime.control('step'); await until(() => f.runtime.read().state === 'paused')
    assert.equal(f.runtime.read().result!.scene.ticks, 3600)
    await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
    assert.equal(f.ports.length, 1)
    f.bind('drive(1, 3600)\ndrive(1, 3600)'); await f.runtime.control('run'); f.runtime.stop()
    const state = f.runtime.read(); await tick(); assert.equal(f.runtime.read(), state)
  } finally { f.runtime.dispose() }
})

test('agent operations share UI evidence and reject stale scope and replayed request identifiers', async () => {
  const { createLearningToolExecutor } = await import('../features/python-learning/learningWebMcp')
  const f = fixture(digestLearningSource), tools = createLearningToolExecutor(f.runtime)
  f.bind(LEARNING_LESSONS[0].solution)
  try {
    const first = await tools.inspect()
    await assert.rejects(tools.execute({ ...first.binding, documentId: '/other.py', requestId: 'wrong', operation: 'run' }), /stale-input/)
    const input = { ...first.binding, requestId: 'one', operation: 'run' }
    await tools.execute(input); await until(() => f.runtime.read().state === 'completed')
    const inspection = await tools.inspect()
    assert.deepEqual(inspection.result?.grade, f.runtime.read().result!.grade)
    await tools.execute(input); assert.equal(f.ports.length, 1, 'same request does not run twice')
    await assert.rejects(tools.execute({ ...input, operation: 'reset' }), /requestId/)
    f.bind('print(0)')
    await assert.rejects(tools.execute({ ...inspection.binding, requestId: 'stale', operation: 'stop' }), /stale-input/)
  } finally { f.runtime.dispose() }
})

test('a timed-out agent start cannot execute after its source hash finishes late', async () => {
  const { createLearningToolExecutor } = await import('../features/python-learning/learningWebMcp')
  const pending: Array<(value: string) => void> = []
  const f = fixture(() => new Promise<string>(resolve => pending.push(resolve))), tools = createLearningToolExecutor(f.runtime)
  f.bind('print(1)')
  try {
    const inspected = await tools.inspect()
    await assert.rejects(tools.execute({ ...inspected.binding, requestId: 'timeout', operation: 'run' }), /two seconds/)
    assert.equal(f.runtime.read().state, 'cancelled')
    pending.forEach(resolve => resolve('a'.repeat(64))); await tick()
    assert.equal(f.ports.length, 0); assert.equal(f.runtime.readIdentity(), null)
  } finally { f.runtime.dispose() }
})

test('inspection has a two-second deadline without cancelling or mutating the active run', async () => {
  const { createLearningToolExecutor } = await import('../features/python-learning/learningWebMcp')
  const pending: Array<(value: string) => void> = [], f = fixture()
  const tools = createLearningToolExecutor(f.runtime, () => new Promise<string>(resolve => pending.push(resolve)))
  try {
    f.bind('print(1)'); await f.runtime.control('validate')
    const state = f.runtime.read(), identity = f.runtime.readIdentity(), started = performance.now()
    const inspection = tools.inspect()
    await assert.rejects(inspection, /two seconds/)
    assert.ok(performance.now() - started < 2500, 'inspection must reject within its bounded acknowledgement window')
    assert.equal(f.runtime.read(), state); assert.equal(f.runtime.readIdentity(), identity); assert.equal(f.terminated(), 0)
    pending.forEach(resolve => resolve('a'.repeat(64))); await tick()
    await assert.rejects(inspection, /two seconds/)
    assert.equal(f.runtime.read(), state); assert.equal(f.ports.length, 1)
    await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
    assert.equal(f.runtime.read().result!.output, '1\n')
  } finally { f.runtime.dispose() }
})

test('source indexing preserves saved non-Markdown files against restored Markdown display text', async () => {
  const { resolveMarkdownWorkspaceIndexingFreshText: resolveText } = await import('../lib/markdown-workspace-runtime/markdownWorkspaceIndexingFreshText')
  for (const path of ['/docs/python-lessons/02-repeat-a-route.py', '/docs/local.json', '/docs/local.csv']) {
    for (const nextText of ['# Saved learner code 保留\nprint(42)\n', '']) {
      const loaded = { path, text: 'old display' }
      assert.equal(resolveText({ path, nextText, scheduledLastLoaded: loaded, liveLoaded: loaded,
        liveMarkdownDocumentName: path, liveMarkdownDocumentText: 'old display' }), nextText)
    }
  }
  const path = '/docs/local.md', loaded = { path, text: 'old file' }
  assert.equal(resolveText({ path, nextText: 'old file', scheduledLastLoaded: loaded, liveLoaded: loaded,
    liveMarkdownDocumentName: path, liveMarkdownDocumentText: 'new Canvas edit' }), 'new Canvas edit')
  assert.equal(resolveText({ path: '/docs/local.py', nextText: 'old file', scheduledLastLoaded: null,
    liveLoaded: { path: '/docs/local.py', text: 'newer loaded edit' },
    liveMarkdownDocumentName: '/docs/local.py', liveMarkdownDocumentText: 'old display' }), 'newer loaded edit')
})

test('native Decision storage reopens exact source and rejects quota failures, corruption and cancelled writes', async () => {
  const storage = await import('../features/python-learning/learningPersistence')
  const { withDurableBrowserStorage } = await import('./helpers/durable-browser-storage')
  const { createWorkspaceFsDb } = await import('../features/workspace-fs/workspaceFsIndexedDb')
  const { createWorkspacePersistedFs } = await import('../features/workspace-fs/workspaceFsPersisted')
  const { initWindowHarness } = await import('../tests/lib/windowHarness')
  const { MemoryStorage } = await import('../tests/lib/memoryStorage')
  const { IndexedCollectionDexie } = await import('../lib/storage/indexedDbCollectionSchema')
  const f = fixture(digestLearningSource); f.bind(LEARNING_LESSONS[0].solution + '# 保留 🧭\r\n')
  try {
    await f.runtime.control('run'); await until(() => f.runtime.read().state === 'completed')
    const record = await storage.captureLearningDebrief(f.runtime.read()), signal = new AbortController().signal
    await assert.rejects(storage.parseLearningDebrief(JSON.stringify({ ...record, source: 'print(99)' })), /digest/)
    await withDurableBrowserStorage(async () => {
      const { restore } = initWindowHarness({ storage: new MemoryStorage() })
      const databaseName = `python-learning-test:${crypto.randomUUID()}`
      let db = await createWorkspaceFsDb({ databaseName })
      assert.equal(db.persistence.getState().mode, 'indexeddb')
      let fs = storage.asLearningLocalWorkspace(createWorkspacePersistedFs(() => Promise.resolve(db)))
      try {
        const path = await storage.saveLearningDebrief(record, signal, fs), before = await fs.readFileText(path)
        await db.db.close(); db = await createWorkspaceFsDb({ databaseName })
        fs = storage.asLearningLocalWorkspace(createWorkspacePersistedFs(() => Promise.resolve(db)))
        const loaded = await storage.loadLearningDebriefs('/learning.py', signal, fs)
        assert.equal(loaded.length, 1, JSON.stringify((await fs.listEntries()).map(e => ({ path: e.path, parentPath: e.parentPath, kind: e.kind }))))
        assert.deepEqual(loaded[0], record)
        assert.equal(await storage.saveLearningDebrief(await storage.captureLearningDebrief(f.runtime.read()), signal, fs), path,
          'tool and UI saves of the same run reuse the durable record after reopening')
        assert.equal(await fs.readFileText(path), before, 'repeat save preserves the first immutable debrief bytes')
        await assert.rejects(storage.saveLearningDebrief({ ...record, result: { ...record.result, output: 'different output' } }, signal, fs), /different debrief/)
        await assert.rejects(storage.saveLearningDebrief({ ...record, source: 'print(99)' }, signal, fs), /different debrief/)
        assert.equal(await fs.readFileText(path), before, 'a run-id collision cannot replace the original source or result')
        const rejected = { ...record, result: { ...record.result, identity: { ...record.result.identity, runId: crypto.randomUUID() } } }
        await assert.rejects(storage.saveLearningDebrief(rejected, signal, { ...fs, createFile: async () => { throw new Error('QuotaExceededError') } }), /QuotaExceededError/)
        assert.equal(await fs.readFileText(path), before)
        const cancelled = new AbortController(); cancelled.abort()
        await assert.rejects(storage.saveLearningDebrief(rejected, cancelled.signal, fs), /cancelled/)
        await fs.writeFileText(path, 'broken document')
        await assert.rejects(storage.loadLearningDebriefs('/learning.py', signal, fs), /invalid|Unreadable/)
        assert.equal(await fs.readFileText(path), 'broken document', 'corruption is preserved for recovery')
      } finally { await db.db.close(); await new IndexedCollectionDexie(databaseName).delete(); restore() }
    })
  } finally { f.runtime.dispose() }
})
