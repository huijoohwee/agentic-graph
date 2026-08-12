import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { FlightSimFloatingPanelView } from '@/features/game-flight-sim/FlightSimFloatingPanelView'
import { resetFlightSimCameraForTests } from '@/features/game-flight-sim/flightSimCameraRuntime'
import { resetFlightSimDecisionStoreForTests } from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  advanceFlightSimByFixedStep,
  exitFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  setFlightSimInput,
} from '@/features/game-flight-sim/flightSimRuntime'
import { resetFlightSimTrainingRuntimeForTests } from '@/features/game-flight-sim/flightSimTrainingRuntime'
import { resetFlightSimTrainingScenarioForTests } from '@/features/game-flight-sim/flightSimTrainingScenario'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled,
} from '@/lib/gympgrph/api'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  mountReactRoot,
  unmountReactRoot,
} from '@/tests/lib/reactRootHarness'

function requireButton(container: Element, selector: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(selector)
  assert.ok(button, `missing Flight Sim control ${selector}`)
  return button
}

async function waitFor(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })
  }
  assert.fail(`${message}: ${JSON.stringify(readFlightSimSnapshot())}`)
}

test('Flight Sim panel opens Geo+XR and retains state through Start and Stop', {
  timeout: 15_000,
}, async () => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('main')
  const rendererCanvas = dom.window.document.createElement('canvas')
  rendererCanvas.dataset.engine = 'three.js r170'
  dom.window.document.body.append(container, rendererCanvas)
  const root = createRoot(container)
  const frameWindow = dom.window as unknown as {
    requestAnimationFrame?: typeof window.requestAnimationFrame
  }
  const originalRequestAnimationFrame = frameWindow.requestAnimationFrame
  const windowUrl = dom.window.URL as typeof URL & {
    createObjectURL?: (blob: Blob) => string
  }
  const originalCreateObjectUrl = windowUrl.createObjectURL
  windowUrl.createObjectURL = () => 'blob:flight-sim-panel-test'

  resetWorkspaceFsForTests()
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  resetFlightSimTrainingScenarioForTests()
  resetFlightSimTrainingRuntimeForTests()
  resetFlightSimCameraForTests()
  resetGraphStoreForTests()
  setGeospatialModeEnabled(true)
  useGraphStore.setState({
    canvasRenderMode: '2d',
    canvas3dMode: '3d',
    floatingPanelOpen: true,
    floatingPanelView: 'flightSim',
  } as never)

  try {
    await mountReactRoot(root, React.createElement(FlightSimFloatingPanelView))

    assert.equal(readFlightSimSnapshot().active, false)
    assert.equal(requireButton(container, '[data-kg-flight-sim-open="1"]').disabled, false)
    assert.equal(requireButton(container, '[data-kg-flight-sim-stop="1"]').disabled, true)

    // This component test does not mount CanvasViewport's MapLibre/HUD
    // presenters. Disable browser stage preparation while the real Open
    // control runs so success still proves the default entry selected Geo+XR.
    frameWindow.requestAnimationFrame = undefined
    assert.equal(typeof dom.window.requestAnimationFrame, 'undefined')
    await act(async () => {
      requireButton(container, '[data-kg-flight-sim-open="1"]').click()
    })
    await waitFor(
      () => {
        const start = container.querySelector<HTMLButtonElement>(
          '[data-kg-flight-sim-start="1"]',
        )
        return readFlightSimSnapshot().active && start?.disabled === false
      },
      'Flight Sim panel Open did not complete from plain Geo',
    )
    frameWindow.requestAnimationFrame = originalRequestAnimationFrame

    const opened = readFlightSimSnapshot()
    assert.equal(opened.active, true)
    assert.equal(opened.phase, 'stopped')
    assert.equal(opened.tick, 0)
    assert.equal(opened.runtimeError, null)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')
    assert.equal(
      container.querySelector('[data-kg-flight-sim-floating-panel="1"]')
        ?.getAttribute('data-kg-flight-sim-phase'),
      'stopped',
    )
    assert.equal(requireButton(container, '[data-kg-flight-sim-start="1"]').disabled, false)
    assert.equal(requireButton(container, '[data-kg-flight-sim-stop="1"]').disabled, true)

    await act(async () => {
      requireButton(container, '[data-kg-flight-sim-start="1"]').click()
    })
    await waitFor(
      () => readFlightSimSnapshot().phase === 'ready'
        && requireButton(container, '[data-kg-flight-sim-stop="1"]').disabled === false,
      'Flight Sim panel Start did not reach ready',
    )

    await act(async () => {
      setFlightSimInput({ pitch: 0.25 })
      await advanceFlightSimByFixedStep()
    })
    const beforeStop = readFlightSimSnapshot()
    assert.equal(beforeStop.phase, 'flying')
    assert.equal(beforeStop.tick, 1)

    await act(async () => {
      requireButton(container, '[data-kg-flight-sim-stop="1"]').click()
    })
    await waitFor(
      () => readFlightSimSnapshot().phase === 'stopped'
        && requireButton(container, '[data-kg-flight-sim-start="1"]').disabled === false,
      'Flight Sim panel Stop did not retain a resumable stopped state',
    )

    const stopped = readFlightSimSnapshot()
    assert.equal(stopped.active, true)
    assert.equal(stopped.phase, 'stopped')
    assert.equal(stopped.tick, beforeStop.tick)
    assert.deepEqual(stopped.aircraft, beforeStop.aircraft)
    assert.equal(requireButton(container, '[data-kg-flight-sim-start="1"]').disabled, false)
    assert.equal(requireButton(container, '[data-kg-flight-sim-stop="1"]').disabled, true)
  } finally {
    frameWindow.requestAnimationFrame = originalRequestAnimationFrame
    if (originalCreateObjectUrl) windowUrl.createObjectURL = originalCreateObjectUrl
    else delete windowUrl.createObjectURL
    if (readFlightSimSnapshot().active) {
      await act(async () => {
        exitFlightSimSurface({ restorePreviousSurface: false })
      })
    }
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    setGeospatialModeEnabled(false)
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
    resetFlightSimTrainingScenarioForTests()
    resetFlightSimTrainingRuntimeForTests()
    resetFlightSimCameraForTests()
    resetWorkspaceFsForTests()
    resetGraphStoreForTests()
    container.remove()
    rendererCanvas.remove()
    restore()
  }
})
