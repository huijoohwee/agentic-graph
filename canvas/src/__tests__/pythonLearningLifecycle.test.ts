import test from 'node:test'
import assert from 'node:assert/strict'
import { LearningRuntime, digestLearningSource, type LearningWorkerPort } from '../features/python-learning/learningRuntime'
import { createPythonWorkerHost } from '../features/python-learning/pythonWorker'
import { validLearningSnapshot, type LearningWorkerSnapshot } from '../features/python-learning/learningProtocol'
import { LEARNING_LESSONS } from '../features/python-learning/learningLessons'
import { PythonLearningError, pythonError } from '../features/python-learning/pythonModel'
import { resolveWebMcpToolScope } from '../features/agent-ready/webMcpToolExposure.mjs'

test('Python discovery follows the active editor document without capturing other workspace groups', () => {
  const state = { workspaceViewMode: 'editor', markdownDocumentName: '/workspace/lesson.PY' }
  assert.equal(resolveWebMcpToolScope(state), 'pythonLearning')
  assert.equal(resolveWebMcpToolScope({ ...state, markdownDocumentName: '/notes.md' }), 'editor')
  assert.equal(resolveWebMcpToolScope({ ...state, workspaceViewMode: 'canvas' }), 'graph')
  assert.equal(resolveWebMcpToolScope({ ...state, floatingPanelOpen: true, floatingPanelView: 'chat' }), 'chat')
  assert.equal(resolveWebMcpToolScope(state, true), 'mission')
})

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 1))
async function until(condition: () => boolean) {
  const deadline = performance.now() + 2500
  while (!condition()) { if (performance.now() > deadline) assert.fail('Runtime condition timed out.'); await tick() }
}
function fixture(digest = async (_source: string) => 'a'.repeat(64), now = () => performance.now()) {
  const messages: LearningWorkerSnapshot[] = [], ports: LearningWorkerPort[] = []
  let terminated = 0
  const runtime = new LearningRuntime(() => {
    const host = createPythonWorkerHost(data => {
      if (data.kind === 'snapshot') messages.push(structuredClone(data))
      port.onmessage?.({ data: structuredClone(data) })
    }, now)
    const port: LearningWorkerPort = { onmessage: null, onerror: null, postMessage: host.receive, terminate: () => { terminated++; host.dispose() } }
    ports.push(port); return port
  }, digest)
  const bind = (source: string, lessonId = 'travel', documentId = '/learning.py') => runtime.bind({ workspaceId: 'workspace:test', documentId, lessonId, source })
  return { runtime, bind, messages, ports, terminated: () => terminated }
}

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
