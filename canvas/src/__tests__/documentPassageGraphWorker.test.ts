import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzePassagesInWorker } from '@/lib/parsers/documentPassageGraphWorker'
import { deriveDocumentPassageGraph } from '@/lib/parsers/documentPassageGraph'

const input = { documentId: 'worker-source', text: 'Copper lamps glow.' }
function fakeWorker() {
  return { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null as (() => void) | null, onmessageerror: null as (() => void) | null, terminated: 0, sent: 0, terminate() { this.terminated++ }, postMessage() { this.sent++ } }
}
test('completion disposes the worker and abort prevents late results', async () => {
  const worker = fakeWorker(), controller = new AbortController()
  const run = analyzePassagesInWorker(input, controller.signal, () => worker as unknown as Worker)
  const result = deriveDocumentPassageGraph(input)
  worker.onmessage!({ data: { ok: true, result } } as MessageEvent)
  assert.equal(await run, result); assert.equal(worker.terminated, 1)
  const second = fakeWorker(), stop = new AbortController()
  const cancelled = analyzePassagesInWorker(input, stop.signal, () => second as unknown as Worker)
  stop.abort()
  second.onmessage!({ data: { ok: true, result } } as MessageEvent)
  await assert.rejects(cancelled, /cancelled/); assert.equal(second.terminated, 1)
})
test('timeout terminates computation and never starts a synchronous fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const worker = fakeWorker()
    const run = analyzePassagesInWorker(input, new AbortController().signal, () => worker as unknown as Worker)
    const rejected = assert.rejects(run, /10 seconds/)
    t.mock.timers.tick(10_000)
    await rejected
    assert.equal(worker.terminated, 1); assert.equal(worker.sent, 1)
  } finally { t.mock.timers.reset() }
})
test('pre-abort, worker errors and malformed responses fail explicitly', async () => {
  const stop = new AbortController(); stop.abort()
  await assert.rejects(analyzePassagesInWorker(input, stop.signal, () => { throw new Error('must not create') }), /cancelled/)
  for (const type of ['error', 'messageerror', 'bad-reply']) {
    const worker = fakeWorker()
    const run = analyzePassagesInWorker(input, new AbortController().signal, () => worker as unknown as Worker)
    if (type === 'error') worker.onerror!()
    else if (type === 'messageerror') worker.onmessageerror!()
    else worker.onmessage!({ data: null } as MessageEvent)
    await assert.rejects(run); assert.equal(worker.terminated, 1)
  }
})
