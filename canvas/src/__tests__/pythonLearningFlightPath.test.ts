import test from 'node:test'
import assert from 'node:assert/strict'
import { LearningRuntime, type LearningWorkerPort } from '../features/python-learning/learningRuntime'
import { createPythonWorkerHost } from '../features/python-learning/pythonWorker'
import { LEARNING_LESSONS } from '../features/python-learning/learningLessons'
import { createLearningFlightPath, learningFlightSourceUrl } from '../features/python-learning/learningFlightPath'
import type { LearningWorkerSnapshot } from '../features/python-learning/learningProtocol'
import { inspectDroneBenchLog } from '../features/python-learning/learningDroneBenchLog'

async function result(): Promise<LearningWorkerSnapshot> {
  const runtime = new LearningRuntime(() => {
    const host = createPythonWorkerHost(data => port.onmessage?.({ data }))
    const port: LearningWorkerPort = { onmessage: null, onerror: null, postMessage: host.receive, terminate: host.dispose }
    return port
  }, async () => 'a'.repeat(64))
  try {
    runtime.bind({ workspaceId: 'test', documentId: '/flight.py', lessonId: 'drone', source: LEARNING_LESSONS.find(l => l.id === 'drone')!.solution })
    await runtime.control('run')
    const deadline = performance.now() + 2500
    while (runtime.read().state === 'running' || runtime.read().state === 'ready') {
      assert.ok(performance.now() < deadline, 'bounded worker completion')
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    return structuredClone(runtime.read().result!)
  } finally { runtime.dispose() }
}

test('portable mission preserves the authored nine-second takeoff, route and landing', async () => {
  const completed = await result(), text = createLearningFlightPath(completed), path = JSON.parse(text)
  assert.equal(path.schema, 'agentic-drone-flight-path/v1'); assert.equal(path.physicalAircraft, false)
  assert.equal(path.samples.length, 541); assert.equal(path.tickRate, 60)
  assert.deepEqual(path.samples[0], [0, 0, 0, 0, 0])
  assert.deepEqual(path.samples.at(-1), [540, 4, 0, 0, 0])
  assert.equal(Math.max(...path.samples.map((row: number[]) => row[4])), 2)
  assert.ok(Buffer.byteLength(text) < 500000)
  assert.equal('source' in path, false); assert.equal('session' in path, false)
})

test('export rejects failed, interrupted, colliding and incomplete trajectories', async () => {
  const completed = await result()
  for (const change of [{ state: 'running' }, { state: 'failed' }, { trace: undefined },
    { scene: { ...completed.scene, collisions: 1 } }, { scene: { ...completed.scene, landed: false } },
    { trace: completed.trace!.slice(1) }, { identity: { ...completed.identity, lessonId: 'travel' } }])
    assert.throws(() => createLearningFlightPath({ ...completed, ...change } as LearningWorkerSnapshot))
  const changed = structuredClone(completed) as any
  changed.trace[10][0] = 1
  assert.throws(() => createLearningFlightPath(changed), /trace/)
  changed.trace[10] = [11, 7, 0, 0, 2]
  assert.throws(() => createLearningFlightPath(changed), /trace/)
})

test('GameXR path logs are bounded observations and never command replay', () => {
  const log = { schema: 'gamexr-drone-bench-log/v1', profile: 'esp-drone-rpyt-bench/v1', physicalAircraft: false,
    records: [{ at: '2026-09-26T00:00:00Z', event: 'sent', value: { kind: 'path', profile: 'simulated-drone-path/v1', sequence: 1, pose: [0, 0, 0, 0, 0] } }] }
  assert.equal(inspectDroneBenchLog(JSON.stringify(log)).controlRequests, 1)
  log.records[0].value.pose[4] = 99
  assert.throws(() => inspectDroneBenchLog(JSON.stringify(log)))
})


test('v2 links the native Graph file route without carrying page tokens', async () => {
  const completed = await result()
  const file = JSON.parse(createLearningFlightPath(completed, 'http://127.0.0.1:4198/?secret=private#pair=private'))
  assert.equal(file.schema, 'agentic-drone-flight-path/v2')
  assert.equal(file.sourceUrl, 'http://127.0.0.1:4198/?kgDoc=flight.py')
  assert.equal(learningFlightSourceUrl('https://example.test/graph/', '/a b/flight.py'), 'https://example.test/graph/?kgDoc=a+b%2Fflight.py')
  for (const [url, document] of [['javascript:alert(1)', '/flight.py'], ['https://user:password@example.test/', '/flight.py'],
    ['https://example.test/', '/../secret'], ['https://example.test/', '']]) assert.throws(() => learningFlightSourceUrl(url, document))
})

test('Canvas embed admits only bounded pose observations on its exact channel', async () => {
  const { readLearningCanvasPose, learningCanvasScene, LEARNING_CANVAS_PROTOCOL } = await import('../features/python-learning/learningCanvasEmbedProtocol')
  const channel = 'a'.repeat(32), message = { protocol: LEARNING_CANVAS_PROTOCOL, kind: 'pose', channel, pose: [60, 1, 0, 90, 2] }
  const pose = readLearningCanvasPose(message, channel)!
  assert.deepEqual(pose, message.pose)
  assert.equal(learningCanvasScene(pose).altitude, 2)
  for (const patch of [{ channel: 'b'.repeat(32) }, { kind: 'run' }, { source: 'takeoff(2)' },
    { pose: [1, NaN, 0, 0, 0] }, { pose: [7201, 0, 0, 0, 0] }, { pose: [1, 9, 0, 0, 0] },
    { pose: [1, 0, 0, 360, 0] }, { pose: [1, 0, 0, 0, 5] }]) assert.equal(readLearningCanvasPose({ ...message, ...patch }, channel), null)
})

test('native flight review link preserves exact export without window/opener APIs or destination credentials', async () => {
  const { createFlightReviewUrl, flightDestination } = await import('../features/python-learning/learningFlightTransfer')
  const { gunzipSync } = await import('node:zlib')
  const text = createLearningFlightPath(await result(), 'https://graph.test/?kgDoc=flight.py')
  for (const destination of ['https://game.test/gamexr/?secret=private#pair=private', 'http://127.0.0.1:54842/gamexr/']) {
    const url = new URL(await createFlightReviewUrl(text, destination, new AbortController().signal))
    assert.equal(url.origin, new URL(destination).origin)
    assert.equal(url.search, '?drone=1')
    const fields = new URLSearchParams(url.hash.slice(1))
    assert.deepEqual([...fields.keys()], ['flight'])
    const encoded = fields.get('flight')!
    assert.ok(encoded.length <= 16000)
    assert.equal(gunzipSync(Buffer.from(encoded, 'base64url')).toString('utf8'), text)
    assert.equal('window' in globalThis, false)
  }
  for (const value of ['javascript:alert(1)', 'https://user:password@game.test/', 'file:///tmp/flight', 'x'.repeat(4097)])
    assert.throws(() => flightDestination(value))
})

test('review link generation cancels before/during preparation and refuses oversized data', async () => {
  const { createFlightReviewUrl } = await import('../features/python-learning/learningFlightTransfer')
  const { createHash } = await import('node:crypto')
  const destination = 'https://game.test/gamexr/', controller = new AbortController()
  controller.abort()
  await assert.rejects(createFlightReviewUrl('{}', destination, controller.signal), { name: 'AbortError' })
  const active = new AbortController(), pending = createFlightReviewUrl('{}', destination, active.signal)
  active.abort(); await assert.rejects(pending, { name: 'AbortError' })
  await assert.rejects(createFlightReviewUrl('x'.repeat(500001), destination, new AbortController().signal), /500 kB/)
  const incompressible = Array.from({ length: 700 }, (_, i) => createHash('sha256').update(String(i)).digest('hex')).join('')
  await assert.rejects(createFlightReviewUrl(incompressible, destination, new AbortController().signal), /too large for a review link/)
})

test('shared Canvas replays a bounded snapshot without source, storage or receiver authority', async () => {
  const { createLearningCanvasShareUrl } = await import('../features/python-learning/learningCanvasShare')
  const { readLearningCanvasShare } = await import('../features/python-learning/learningCanvasEmbedProtocol')
  const text = createLearningFlightPath(await result()), signal = new AbortController().signal
  const url = new URL(await createLearningCanvasShareUrl(text, 'https://graph.test/agentic-graph/?secret=private#pair=private', signal))
  assert.equal(url.search, '?kgLearningCanvas=drone')
  assert.equal(url.pathname, '/agentic-graph/')
  const poses = await readLearningCanvasShare(url.hash, signal)
  assert.equal(poses.length, 541); assert.deepEqual(poses.at(-1), [540, 4, 0, 0, 0])
  for (const change of [{ physicalAircraft: true }, { tickRate: 120 }, { samples: [[0, 0, 0, 0, 0], [1, 8, 0, 0, 0]] },
    { samples: [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0.01]] }]) {
    const bad = new URL(await createLearningCanvasShareUrl(JSON.stringify({ ...JSON.parse(text), ...change }), url.href, signal))
    await assert.rejects(readLearningCanvasShare(bad.hash, signal))
  }
  await assert.rejects(readLearningCanvasShare(url.hash + '&flight=duplicate', signal))
  const { gzipSync } = await import('node:zlib')
  const bomb = '#flight=' + gzipSync('x'.repeat(500001)).toString('base64url')
  await assert.rejects(readLearningCanvasShare(bomb, signal), /500 kB/)
  const abort = new AbortController(); abort.abort()
  await assert.rejects(readLearningCanvasShare(url.hash, abort.signal), { name: 'AbortError' })
})
