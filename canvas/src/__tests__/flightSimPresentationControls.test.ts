import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FlightSimFloatingPanelView } from '@/features/game-flight-sim/FlightSimFloatingPanelView'
import { FlightSimHud } from '@/features/game-flight-sim/FlightSimHud'
import { flightSimDefaultRuntime } from '@/features/game-flight-sim/flightSimDefaultRuntime'
import {
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
} from '@/features/game-flight-sim/flightSimRuntime'
import { resetFlightSimDecisionStoreForTests } from '@/features/game-flight-sim/flightSimDecisionStore'
import { resetFlightSimCameraForTests } from '@/features/game-flight-sim/flightSimCameraRuntime'
import { resetFlightSimTrainingRuntimeForTests } from '@/features/game-flight-sim/flightSimTrainingRuntime'
import { resetFlightSimTrainingScenarioForTests } from '@/features/game-flight-sim/flightSimTrainingScenario'
import {
  readFlightSimPresentationSettings,
  resetFlightSimPresentationSettings,
} from '@/features/game-flight-sim/flightSimPresentationSettings'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'

test('Flight panel and HUD share display and pace controls without mutating flight state', async () => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('main')
  dom.window.document.body.append(container)
  const root = createRoot(container)
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  resetFlightSimTrainingScenarioForTests()
  resetFlightSimTrainingRuntimeForTests()
  resetFlightSimCameraForTests()
  resetFlightSimPresentationSettings()
  resetGraphStoreForTests()
  useGraphStore.setState({ floatingPanelOpen: true, floatingPanelView: 'flightSim' } as never)
  flightSimDefaultRuntime.open(true)
  flightSimDefaultRuntime.start()

  const control = (surface: 'hud' | 'panel', selector: string) => {
    const button = container.querySelector<HTMLButtonElement>(
      `[data-kg-flight-sim-presentation-controls="${surface}"] ${selector}`,
    )
    assert.ok(button, `missing ${surface} control ${selector}`)
    return button
  }
  try {
    await mountReactRoot(root, React.createElement(React.Fragment, null,
      React.createElement(FlightSimHud),
      React.createElement(FlightSimFloatingPanelView),
    ))
    const initialFlight = readFlightSimSnapshot()
    assert.equal(initialFlight.phase, 'ready')
    const unavailableMission = container.querySelector<HTMLSelectElement>('[data-kg-flight-training-mission-select]')
    assert.equal(unavailableMission?.disabled, true)
    assert.match(unavailableMission?.textContent || '', /Training unavailable/)
    assert.equal(container.querySelector('[aria-label="Flight training outcomes"]'), null)
    assert.equal(container.querySelector('[data-kg-flight-training-score]'), null)
    assert.equal(container.querySelectorAll('[data-kg-flight-sim-navigation]').length, 2)
    assert.ok(container.querySelector('[aria-label="Flight HUD instruments"]'))
    for (const surface of ['hud', 'panel'] as const) {
      assert.equal(control(surface, '[data-kg-flight-sim-speed-option="1"]').getAttribute('aria-pressed'), 'true')
      assert.equal(control(surface, '[data-kg-flight-sim-overlays-toggle]').getAttribute('aria-pressed'), 'true')
    }

    await act(async () => { control('panel', '[data-kg-flight-sim-overlays-toggle]').click() })
    assert.equal(readFlightSimPresentationSettings().overlaysVisible, false)
    assert.equal(control('hud', '[data-kg-flight-sim-overlays-toggle]').getAttribute('aria-pressed'), 'false')
    assert.equal(container.querySelector('[aria-label="Flight HUD instruments"]'), null)
    assert.equal(container.querySelector('[data-kg-flight-sim-course-director="hud"]'), null)
    assert.ok(container.querySelector('[aria-label="Flight envelope director"]'))
    assert.ok(container.querySelector('[aria-label="Touch flight controls"]'))
    assert.ok(container.querySelector('[aria-label="Capture flight pointer"]'))
    assert.ok(container.querySelector('[data-kg-flight-sim-stop="1"]'))
    assert.ok(container.querySelector('[aria-live="polite"]'))

    await act(async () => { control('hud', '[data-kg-flight-sim-navigation-toggle]').click() })
    assert.equal(container.querySelectorAll('[data-kg-flight-sim-navigation]').length, 0)
    assert.equal(control('panel', '[data-kg-flight-sim-navigation-toggle]').getAttribute('aria-pressed'), 'false')
    await act(async () => { control('panel', '[data-kg-flight-sim-navigation-toggle]').click() })
    assert.equal(container.querySelectorAll('[data-kg-flight-sim-navigation]').length, 2)
    assert.equal(readFlightSimPresentationSettings().overlaysVisible, false)

    await act(async () => { control('hud', '[data-kg-flight-sim-speed-option="2"]').click() })
    assert.equal(readFlightSimPresentationSettings().simulationSpeed, 2)
    assert.equal(control('panel', '[data-kg-flight-sim-speed-option="2"]').getAttribute('aria-pressed'), 'true')
    assert.equal(control('panel', '[data-kg-flight-sim-speed-option="1"]').getAttribute('aria-pressed'), 'false')
    await act(async () => { control('panel', '[data-kg-flight-sim-speed-option="0.5"]').click() })
    assert.equal(control('hud', '[data-kg-flight-sim-speed-option="0.5"]').getAttribute('aria-pressed'), 'true')
    assert.strictEqual(readFlightSimSnapshot(), initialFlight)

    await act(async () => { flightSimDefaultRuntime.fail(new Error('Local presentation test error')) })
    assert.ok(container.querySelector('[role="alert"]')?.textContent
      ?.includes('Local presentation test error'))
    assert.ok(container.querySelector('[aria-label="Touch flight controls"]'))
    assert.ok(control('hud', '[data-kg-flight-sim-overlays-toggle]'))
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    resetFlightSimPresentationSettings()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
    resetFlightSimTrainingScenarioForTests()
    resetFlightSimTrainingRuntimeForTests()
    resetFlightSimCameraForTests()
    resetGraphStoreForTests()
    container.remove()
    restore()
  }
})
