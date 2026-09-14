import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { XrNativeControllerDemoHud } from '@/features/three/XrNativeControllerDemoHud'
import { developAndRunXrNativeControllerDemo, exitXrNativeControllerDemo, readXrNativeControllerDemo,
  readSharedXrNativeControllerDemoFrame, stepSharedXrNativeControllerDemo } from '@/features/three/xrNativeControllerDemoRuntime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

export async function testXrNativeControllerDemoHudPreservesPausedReset() {
  const env = initJsdomHarness('<!doctype html><body><div id="root"></div></body>')
  const container = env.dom.window.document.getElementById('root')!
  const root = createRoot(container)
  try {
    developAndRunXrNativeControllerDemo()
    await mountReactRoot(root, <XrNativeControllerDemoHud />)
    const objective = container.querySelector('output')!
    assert.match(objective.textContent!, /Find the key/)
    assert.equal(objective.className.includes('opacity-0'), false)
    const pause = container.querySelector<HTMLButtonElement>('[data-kg-xr-playground-pause]')!
    stepSharedXrNativeControllerDemo(1 / 30)
    await act(async () => { pause.click() })
    assert.equal(readXrNativeControllerDemo().phase, 'paused')
    const frame = readSharedXrNativeControllerDemoFrame()
    stepSharedXrNativeControllerDemo(1)
    assert.equal(readSharedXrNativeControllerDemoFrame().stepCount, frame.stepCount)
    assert.equal(pause.textContent, 'Resume')
    await act(async () => { container.querySelector<HTMLButtonElement>('[data-kg-xr-playground-reset]')!.click() })
    assert.equal(readXrNativeControllerDemo().phase, 'paused')
    assert.equal(readSharedXrNativeControllerDemoFrame().stepCount, 0)
    assert.equal(readXrNativeControllerDemo().objective, 'find-key')
    await act(async () => { pause.click() })
    assert.equal(readXrNativeControllerDemo().phase, 'running')
  } finally {
    await unmountReactRoot(root)
    exitXrNativeControllerDemo()
    env.restore()
  }
}
