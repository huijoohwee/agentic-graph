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

test('browser transfer rejects foreign acknowledgments and strips phone credentials from its destination', async () => {
  const { flightDestination, isFlightReply, sendFlightPath, FLIGHT_HANDOFF } = await import('../features/python-learning/learningFlightTransfer')
  const url = flightDestination('https://game.test/gamexr/?secret=private#pair=private')
  assert.equal(url.href, 'https://game.test/gamexr/?drone=1')
  assert.throws(() => flightDestination('javascript:alert(1)'))
  assert.throws(() => flightDestination('https://user:password@game.test/'))
  const target = {} as Window, channel = 'a'.repeat(32), origin = 'https://game.test'
  const event = { source: target, origin, data: { protocol: FLIGHT_HANDOFF, channel, kind: 'accepted' } } as unknown as MessageEvent
  assert.equal(isFlightReply(event, target, origin, channel), true)
  for (const change of [{ source: {} }, { origin: 'https://evil.test' }, { data: { ...event.data, channel: 'b'.repeat(32) } },
    { data: { ...event.data, execute: true } }]) assert.equal(isFlightReply({ ...event, ...change } as MessageEvent, target, origin, channel), false)
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), oldLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const events = new EventTarget(), messages: { value: any; origin: string }[] = []
  let opened = '', prepareCount = 0
  const child = { postMessage: (value: unknown, destination: string) => messages.push({ value, origin: destination }) }
  const receive = (kind: string, messageChannel: string) => {
    const e = Object.assign(new Event('message'), { source: child, origin, data: { protocol: FLIGHT_HANDOFF, kind, channel: messageChannel } })
    events.dispatchEvent(e)
  }
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(events, { open: (url: string) => { opened = url; return child } }) })
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://graph.test' } })
    const controller = new AbortController()
    const promise = sendFlightPath(origin + '/gamexr/', async () => { prepareCount++; return 'review-data' }, controller.signal)
    const transfer = new URLSearchParams(new URL(opened).hash.slice(1)).get('flightChannel')!
    assert.equal(prepareCount, 1); assert.equal(messages.length, 0)
    receive('ready', 'wrong'); await Promise.resolve(); assert.equal(messages.length, 0)
    receive('ready', transfer); assert.equal(messages.length, 1); assert.equal(messages[0].origin, origin)
    receive('ready', transfer); assert.equal(messages.length, 1)
    receive('accepted', transfer); assert.match(await promise, /for review/)
    receive('ready', transfer); assert.equal(messages.length, 1)
    const cancelled = new AbortController()
    const pending = sendFlightPath(origin, async () => 'cancelled', cancelled.signal)
    cancelled.abort(); await assert.rejects(pending, /changed/)
  } finally {
    for (const [key, descriptor] of [['window', oldWindow], ['location', oldLocation]] as const)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
  }
})
