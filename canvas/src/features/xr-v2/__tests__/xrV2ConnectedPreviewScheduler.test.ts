import assert from 'node:assert/strict'
import { test } from 'node:test'

import { scheduleXrV2ConnectedPreviewPaint } from '../xrV2ConnectedPreviewScheduler'

test('connected-preview paint retains a user-blocking fallback ahead of its hard deadline', async () => {
  const originalRequestFrame = globalThis.requestAnimationFrame
  const originalCancelFrame = globalThis.cancelAnimationFrame
  const originalScheduler = Object.getOwnPropertyDescriptor(globalThis, 'scheduler')
  let frameCallback: FrameRequestCallback | null = null
  let taskCallback: (() => void) | null = null
  let cancelledFrame: number | null = null
  let taskOptions: Readonly<{ priority: string; delay: number; signal: AbortSignal }> | null = null
  try {
    globalThis.requestAnimationFrame = callback => { frameCallback = callback; return 17 }
    globalThis.cancelAnimationFrame = handle => { cancelledFrame = handle }
    Object.defineProperty(globalThis, 'scheduler', {
      configurable: true,
      value: {
        postTask: (callback: () => void, options: typeof taskOptions) => {
          taskCallback = callback
          taskOptions = options
          return Promise.resolve()
        },
      },
    })
    let renderedAt: number | null = null
    scheduleXrV2ConnectedPreviewPaint(timestamp => { renderedAt = timestamp })
    assert.equal(typeof frameCallback, 'function')
    assert.equal(taskOptions?.priority, 'user-blocking')
    assert.equal(taskOptions?.delay, 0)
    taskCallback?.()
    assert.equal(typeof renderedAt, 'number')
    assert.equal(cancelledFrame, 17)
  } finally {
    globalThis.requestAnimationFrame = originalRequestFrame
    globalThis.cancelAnimationFrame = originalCancelFrame
    if (originalScheduler) Object.defineProperty(globalThis, 'scheduler', originalScheduler)
    else delete (globalThis as typeof globalThis & { scheduler?: unknown }).scheduler
  }
})
