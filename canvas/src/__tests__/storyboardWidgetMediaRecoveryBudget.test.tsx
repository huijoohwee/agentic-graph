import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import type { GraphData } from '@/lib/graph/types'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  x: left, y: top, left, top, right: left + width, bottom: top + height, width, height,
  toJSON: () => ({}),
})

async function runMediaRecoveryFixture(drift: boolean, drainFrames = false) {
  const windowEnv = initWindowHarness({ storage: new MemoryStorage() })
  const env = initJsdomHarness(`<!doctype html><html><body>
    <section data-kg-storyboard-widget-surface-root="media-budget">
      <section data-kg-widget="a" data-kg-storyboard-widget-mode="1" data-kg-storyboard-widget-surface="media-budget"></section>
      <section data-kg-widget="b" data-kg-storyboard-widget-mode="1" data-kg-storyboard-widget-surface="media-budget"></section>
    </section><section id="react-root"></section>
  </body></html>`)
  const originalObserver = globalThis.MutationObserver
  const NativeObserver = env.dom.window.MutationObserver as typeof MutationObserver
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  let observerCallbacks = 0
  globalThis.MutationObserver = class extends NativeObserver {
    constructor(callback: MutationCallback) {
      super((records, observer) => {
        observerCallbacks += 1
        callback(records, observer)
      })
    }
  }
  env.dom.window.requestAnimationFrame = callback => {
    frames.set(++frameId, callback)
    return frameId
  }
  env.dom.window.cancelAnimationFrame = id => { frames.delete(id) }
  globalThis.requestAnimationFrame = env.dom.window.requestAnimationFrame
  globalThis.cancelAnimationFrame = env.dom.window.cancelAnimationFrame
  const { useGraphStore: store } = await import('@/hooks/useGraphStore')
  const { useStoryboardWidgetRuntimeScene: useScene } = await import('@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRuntimeScene')
  const graph: GraphData = {
    type: 'Graph', nodes: [
      { id: 'a', label: 'A', type: 'Node', properties: {} },
      { id: 'b', label: 'B', type: 'Node', properties: {} },
    ], edges: [], metadata: {},
  }
  store.getState().resetAll()
  store.setState({
    graphData: graph, workspaceViewMode: 'canvas', workspaceCanvasPaneOpen: false,
    markdownWorkspaceIndexingInFlight: false,
    workspaceGraphMutationBlockUntilMs: 0, workspaceGraphMutationBlockKey: '',
    flowWidgetPinnedByNodeId: { a: true, b: true },
    flowWidgetPosByNodeId: { a: { left: 0, top: 0 }, b: { left: 240, top: 0 } },
    flowWidgetWorldPosByNodeId: { a: { x: 0, y: 0 }, b: { x: 240, y: 0 } },
    flowWidgetPinnedByNodeIdByGraphMetaKey: {}, flowWidgetPosByNodeIdByGraphMetaKey: {},
    flowWidgetWorldPosByNodeIdByGraphMetaKey: {},
  })
  const surface = document.querySelector<HTMLElement>('[data-kg-storyboard-widget-surface-root]')!
  surface.getBoundingClientRect = () => rect(0, 0, 1000, 800)
  let geometry = 0
  let worldWrites = 0
  let writesBeforeFirstTimer = 0
  let timerFired = false
  let firstTimer: ReturnType<typeof setTimeout> | null = null
  const mutationCap = drainFrames ? 512 : 64
  for (const [index, node] of Array.from(surface.children).entries()) {
    const element = node as HTMLElement
    element.getBoundingClientRect = () => rect(index * 240, 0, 100 + (drift ? geometry : 0), 200)
    element.getClientRects = () => [element.getBoundingClientRect()] as unknown as DOMRectList
  }
  const unsubscribe = store.subscribe(state => state.flowWidgetWorldPosByNodeId, () => {
    worldWrites += 1
    if (!timerFired) writesBeforeFirstTimer += 1
    if (worldWrites === 1) firstTimer = setTimeout(() => { timerFired = true }, 0)
    // Simulate competing media geometry, bounded even against the broken owner.
    if (worldWrites <= mutationCap) {
      geometry += 1
      surface.firstElementChild!.setAttribute('style', `width:${100 + geometry}px`)
    }
  })
  const zoomViewKeyRef = { current: null }
  const openWidgetNodeIds = ['a', 'b']
  function Probe() {
    useScene({
      active: true, storyboardWidgetSurfaceId: 'media-budget', openWidgetNodeIds,
      renderGraphDataOverride: graph, viewportW: 1000, viewportH: 800,
      schema: store.getState().schema, overlayNodeLayoutSignature: 'stable-topology', zoomViewKeyRef,
    })
    return null
  }
  const root = createRoot(document.getElementById('react-root')!)
  let drainedBatches = 0
  const flushFrameBatch = async () => {
    const pending = Array.from(frames.entries())
    frames.clear()
    await act(async () => {
      for (const [, callback] of pending) callback(drainedBatches * 16)
      await Promise.resolve()
    })
    drainedBatches += 1
  }
  try {
    await act(async () => {
      root.render(React.createElement(Probe))
      await tick()
    })
    await tick()
    const writesWithFramesHeld = worldWrites
    if (drainFrames) {
      while (frames.size > 0 && drainedBatches < 300) await flushFrameBatch()
    }
    const callbacksAfterDrain = observerCallbacks
    const writesAfterDrain = worldWrites
    surface.firstElementChild!.setAttribute('style', 'width:777px')
    await tick()
    const traceWindow = window as Window & {
      __storyboardWidgetRuntimeSceneDebug?: { history: Array<{ reason: string }> }
    }
    const exhaustionTraceCount = traceWindow.__storyboardWidgetRuntimeSceneDebug?.history
      .filter(entry => entry.reason === 'dom-collective-recovery-frame-budget-exhausted').length || 0
    return {
      worldWrites, writesBeforeFirstTimer, timerFired, writesWithFramesHeld,
      drainedBatches, remainingFrames: frames.size,
      callbacksAfterDrain, callbacksAfterLateMutation: observerCallbacks,
      writesAfterDrain, exhaustionTraceCount,
    }
  } finally {
    unsubscribe()
    await act(async () => root.unmount())
    // Flush the existing shared interaction-frame emitter after recovery cleanup.
    if (frames.size > 0) await flushFrameBatch()
    if (firstTimer != null) clearTimeout(firstTimer)
    globalThis.MutationObserver = originalObserver
    env.restore()
    windowEnv.restore()
  }
}

export async function testStoryboardWidgetMediaRecoveryCoalescesMutationFeedback() {
  const control = await runMediaRecoveryFixture(false)
  const media = await runMediaRecoveryFixture(true)
  if (!control.timerFired || !media.timerFired) throw new Error('media recovery must yield to the timer task')
  if (control.writesWithFramesHeld > 3 || media.writesWithFramesHeld > 3) {
    throw new Error(`recovery wrote during observer microtasks: control=${control.writesWithFramesHeld}, media=${media.writesWithFramesHeld}`)
  }
  if (media.writesBeforeFirstTimer > 3) {
    throw new Error(`media geometry starved the first timer with ${media.writesBeforeFirstTimer} writes`)
  }
}

export async function testStoryboardWidgetMediaRecoveryStopsAtFrameBudget() {
  const media = await runMediaRecoveryFixture(true, true)
  if (media.drainedBatches >= 300 || media.remainingFrames !== 0 || media.worldWrites > 242) {
    throw new Error(`media recovery exceeded its finite frame budget: ${JSON.stringify(media)}`)
  }
  if (media.drainedBatches < 240) throw new Error('fixture did not exercise drifting geometry across the recovery frame budget')
  if (media.exhaustionTraceCount !== 1) throw new Error('frame budget exhaustion must produce one diagnostic trace')
  if (media.callbacksAfterLateMutation !== media.callbacksAfterDrain || media.worldWrites !== media.writesAfterDrain) {
    throw new Error('exhausted media recovery observer stayed active')
  }
}
