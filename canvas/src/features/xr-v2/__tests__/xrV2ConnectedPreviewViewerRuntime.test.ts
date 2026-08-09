import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createXrV2ConnectedPreviewCanvasSession } from '../xrV2ConnectedPreviewViewerRuntime'

function harness() {
  const draws: Array<readonly [number, number, number, number]> = []
  const dataset: Record<string, string> = {}
  let contextRequests = 0
  let callback: FrameRequestCallback | null = null
  let cancelled = false
  const context = {
    fillStyle: '',
    fillRect: (x: number, y: number, width: number, height: number) => {
      draws.push([x, y, width, height])
    },
    getImageData: () => ({
      data: context.fillStyle === '#38bdf8'
        ? new Uint8ClampedArray([56, 189, 248, 255])
        : new Uint8ClampedArray([9, 17, 31, 255]),
    }),
  }
  const canvas = {
    width: 96,
    height: 64,
    isConnected: true,
    dataset,
    getContext: () => { contextRequests += 1; return context },
  } as unknown as HTMLCanvasElement
  const session = createXrV2ConnectedPreviewCanvasSession(canvas, {
    requestFrame: next => { callback = next; return 7 },
    cancelFrame: () => { cancelled = true },
    now: () => 42,
  })
  return {
    canvas,
    dataset,
    draws,
    session,
    frame: () => {
      const next = callback
      callback = null
      if (!next) throw new Error('no connected-preview frame was queued')
      next(42)
    },
    cancelled: () => cancelled,
    contextRequests: () => contextRequests,
  }
}

function trackedSignal() {
  const listeners = new Set<EventListenerOrEventListenerObject>()
  return Object.freeze({
    signal: {
      aborted: false,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'abort') listeners.add(listener)
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'abort') listeners.delete(listener)
      },
    } as unknown as AbortSignal,
    listenerCount: () => listeners.size,
  })
}

const EDIT = Object.freeze({
  entityRef: 'scene.hero',
  visible: true,
  sourceDigest: 'fnv1a32:12345678',
  graphDataRevision: 3,
  authoringEditRevision: 1,
  authorRenderedAtMs: 9,
})

test('viewer acknowledges only after the authored visibility is painted on its attached canvas', async () => {
  const view = harness()
  assert.equal(view.contextRequests(), 1, 'mounted viewer context must be ready before the edit clock starts')
  let settled = false
  const rendered = view.session.applyEdit(EDIT, 1, new AbortController().signal)
    .then(value => { settled = true; return value })
  await Promise.resolve()
  assert.equal(settled, false)
  assert.deepEqual(view.draws, [])
  view.frame()
  const snapshot = await rendered
  assert.equal(snapshot.attached, true)
  assert.equal(snapshot.visible, true)
  assert.equal(snapshot.revision, 1)
  assert.equal(snapshot.renderedAtMs, 42)
  assert.equal(view.dataset.kgXrV2PreviewRevision, '1')
  assert.equal(view.dataset.kgXrV2PreviewVisible, 'true')
  assert.equal(view.draws.length, 2)
  assert.equal(view.contextRequests(), 1, 'measured edit must reuse the mounted viewer context')
  assert.deepEqual(view.session.snapshot(), snapshot)
  view.session.dispose()
  assert.equal(view.session.snapshot(), null)
  assert.equal(view.dataset.kgXrV2PreviewRevision, undefined)
  assert.equal(view.dataset.kgXrV2PreviewVisible, undefined)
})

test('detachment, cancellation, and disposal fail closed without a render acknowledgement', async t => {
  await t.test('detached surface', async () => {
    const view = harness()
    const rendered = view.session.applyEdit(EDIT, 1, new AbortController().signal)
    Object.assign(view.canvas, { isConnected: false })
    view.frame()
    await assert.rejects(rendered, /detached before render/)
    assert.equal(view.session.snapshot(), null)
  })
  await t.test('aborted frame', async () => {
    const view = harness()
    const abort = new AbortController()
    const rendered = view.session.applyEdit(EDIT, 1, abort.signal)
    abort.abort()
    await assert.rejects(rendered, /cancelled/)
    assert.equal(view.cancelled(), true)
    assert.equal(view.session.snapshot(), null)
  })
  await t.test('disposed frame', async () => {
    const view = harness()
    const tracked = trackedSignal()
    const rendered = view.session.applyEdit(EDIT, 1, tracked.signal)
    assert.equal(tracked.listenerCount(), 1)
    view.session.dispose()
    await assert.rejects(rendered, /disposed/)
    assert.equal(view.cancelled(), true)
    assert.equal(view.session.snapshot(), null)
    assert.equal(tracked.listenerCount(), 0)
  })
})
