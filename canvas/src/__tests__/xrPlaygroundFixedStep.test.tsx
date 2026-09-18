import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrNativeControllerDemoHud } from '@/features/three/XrNativeControllerDemoHud'
import {
  createXrNativeControllerDemoRuntime, developAndRunXrNativeControllerDemo,
  exitXrNativeControllerDemo, pauseXrNativeControllerDemo, readSharedXrNativeControllerDemoFrame,
  readXrNativeControllerDemo, readXrNativeControllerDemoRuntimeFrame,
  resetSharedXrNativeControllerDemo, resumeXrNativeControllerDemo, selectXrNativeControllerDemoMode,
  setSharedXrNativeControllerDemoInput, stepPausedXrNativeControllerDemo,
  stepSharedXrNativeControllerDemo, stepXrNativeControllerDemoRuntimeTicks,
  subscribeXrNativeControllerDemo, setSharedXrNativeControllerDemoTerrain,
} from '@/features/three/xrNativeControllerDemoRuntime'
import { XR_MOTION_REFERENCE_DEFAULT_STAGE_ID } from '@/features/three/xrSceneLibrary'
import { createXrNativeControllerInput } from '@/features/three/xrNativeControllerInput'
import { normalizeXrPhysicsControl, parseXrInteractiveInvocation } from '@/features/three/xrSceneInteractiveInvocation'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testXrPlaygroundFixedStep() {
  const priorTerrain = readXrNativeControllerDemo().terrainId
  setSharedXrNativeControllerDemoTerrain(XR_MOTION_REFERENCE_DEFAULT_STAGE_ID)
  exitXrNativeControllerDemo()
  assert.equal(stepPausedXrNativeControllerDemo(), 0)
  resetSharedXrNativeControllerDemo()
  assert.equal(stepPausedXrNativeControllerDemo(), 0, 'ready is not paused')
  developAndRunXrNativeControllerDemo()
  assert.equal(stepPausedXrNativeControllerDemo(), 0, 'running must have only its animation-loop writer')
  assert.equal(stepSharedXrNativeControllerDemo(1 / 240), 0)
  pauseXrNativeControllerDemo()
  let notifications = 0
  const unsubscribe = subscribeXrNativeControllerDemo(() => { notifications += 1 })
  const initial = JSON.stringify(readSharedXrNativeControllerDemoFrame())
  try {
    for (const ticks of [0, -1, 241, 1.5, NaN, Infinity, '1', null]) {
      assert.equal(stepPausedXrNativeControllerDemo(ticks as number), 0)
      assert.equal(JSON.stringify(readSharedXrNativeControllerDemoFrame()), initial)
      assert.equal(normalizeXrPhysicsControl({ scope: 'controller', operation: 'step', ticks }), null)
    }
    assert.equal(notifications, 0, 'rejected operations must not publish')
    assert.equal(parseXrInteractiveInvocation('/xr.physics @canvas #controller operation=step ticks=2')?.action, 'physics')
    for (const invocation of [
      '/xr.physics @canvas #controller operation=step ticks=241',
      '/xr.physics @canvas #controller operation=step ticks=1 ticks=2',
      '/xr.physics @canvas #controller operation=pause ticks=1',
      '/xr.physics @canvas #controller operation=step mode=rocket',
      '/xr.physics @canvas #body operation=step ticks=1',
    ]) assert.equal(parseXrInteractiveInvocation(invocation), null)
    assert.equal(stepPausedXrNativeControllerDemo(), 1)
    assert.equal(notifications, 1)
    assert.equal(stepSharedXrNativeControllerDemo(1), 0, 'render frames must not advance a paused simulation')
    const reference = createXrNativeControllerDemoRuntime()
    reference.phase = 'paused'
    stepXrNativeControllerDemoRuntimeTicks(reference, 1)
    assert.deepEqual(readSharedXrNativeControllerDemoFrame(), readXrNativeControllerDemoRuntimeFrame(reference))
    assert.equal(stepPausedXrNativeControllerDemo(240), 240)
    stepXrNativeControllerDemoRuntimeTicks(reference, 240)
    assert.deepEqual(readSharedXrNativeControllerDemoFrame(), readXrNativeControllerDemoRuntimeFrame(reference))
    assert.equal(readXrNativeControllerDemo().phase, 'paused')
    resumeXrNativeControllerDemo()
    assert.equal(stepSharedXrNativeControllerDemo(1 / 240), 1, 'manual steps must preserve the fractional wall-clock remainder')
    assert.equal(readSharedXrNativeControllerDemoFrame().stepCount, 242)
    pauseXrNativeControllerDemo()
    resetSharedXrNativeControllerDemo()
    assert.equal(readSharedXrNativeControllerDemoFrame().stepCount, 0)
    assert.equal(readXrNativeControllerDemo().phase, 'paused')
    selectXrNativeControllerDemoMode('rocket')
    setSharedXrNativeControllerDemoInput(createXrNativeControllerInput({ primary: true }))
    assert.equal(stepPausedXrNativeControllerDemo(2), 2)
    assert.equal(readSharedXrNativeControllerDemoFrame().mode, 'rocket')
    assert(readSharedXrNativeControllerDemoFrame().player.velocity[1] > 0, 'paused steps still evaluate controller input')
  } finally {
    unsubscribe()
    exitXrNativeControllerDemo()
  }

  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    selectXrNativeControllerDemoMode('ball')
    developAndRunXrNativeControllerDemo()
    await mountReactRoot(root, <XrNativeControllerDemoHud />)
    const button = (action: string) => container.querySelector<HTMLButtonElement>(`[data-kg-xr-playground-${action}="1"]`)!
    assert.equal(button('step').disabled, true)
    await act(async () => { button('pause').click() })
    assert.equal(button('step').disabled, false)
    assert.match(container.textContent!, /Tick 0 · 120 Hz/)
    await act(async () => { button('step').click() })
    assert.equal(readSharedXrNativeControllerDemoFrame().stepCount, 1)
    assert.match(container.textContent!, /Tick 1 · 120 Hz/)
    await act(async () => { button('reset').click() })
    assert.match(container.textContent!, /Tick 0 · 120 Hz/)
    await act(async () => { button('pause').click() })
    assert.equal(button('step').disabled, true)
    assert.equal(container.querySelector('[aria-label="Paused physics tick"]'), null)
  } finally {
    await unmountReactRoot(root)
    exitXrNativeControllerDemo()
    setSharedXrNativeControllerDemoTerrain(priorTerrain)
    env.restore()
  }
}
