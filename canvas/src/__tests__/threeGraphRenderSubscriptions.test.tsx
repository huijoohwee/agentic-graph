import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ThreeGraph from '@/lib/three/ThreeGraph.impl'
import { useGraphStore } from '@/hooks/useGraphStore'
import { defaultSchema } from '@/lib/graph/schema'
import { useCanvasGameplayOverlayState } from '@/features/canvas/useCanvasGameplayOverlayState'
import { flightSimDefaultRuntime } from '@/features/game-flight-sim/flightSimDefaultRuntime'
import { FLIGHT_SIM_FIXED_STEP_SECONDS } from '@/features/game-flight-sim/flightSimModel'
import { readGameModeSnapshot, reportGameModeSimulationFailure, resetGameModeRuntimeForTests } from '@/features/game-fps/gameModeRuntime'
import { publishCitySimSnapshot, publishCitySimSuccess, readCitySimSnapshot, resetCitySimSnapshotForTests } from '@/features/game-city-sim/citySimRuntimeState'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testThreeGraphIgnoresUnrelatedStoreUpdates() {
  const previous = useGraphStore.getState()
  const { dom, restore } = initJsdomHarness()
  const host = dom.window.document.body.appendChild(dom.window.document.createElement('main'))
  const originalGetContext = dom.window.HTMLCanvasElement.prototype.getContext
  const originalMutationObserver = globalThis.MutationObserver
  globalThis.MutationObserver = dom.window.MutationObserver
  // This tests the real host's subscriptions. Browser verification owns WebGL.
  dom.window.HTMLCanvasElement.prototype.getContext = () => null
  const root = createRoot(host)
  let commits = 0
  try {
    useGraphStore.setState({ canvasRenderMode: '3d', canvas3dMode: 'xr', graphData: null,
      markdownDocumentName: null, markdownDocumentText: null })
    await act(async () => { root.render(<React.Profiler id="three-host" onRender={() => { commits += 1 }}>
      <ThreeGraph mode="xr" />
    </React.Profiler>) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.ok(host.querySelector('[data-kg-xr-scene-authority]'), 'The actual shared host must be mounted')
    const before = commits
    for (let i = 0; i < 5; i += 1) {
      await act(async () => { useGraphStore.setState({ timelineTransportPosition: 100 + i,
        floatingPanelOpen: i % 2 === 0 }) })
    }
    assert.equal(commits - before, 0, 'Five unrelated timeline/panel writes must add zero shared-host commits')
    await act(async () => { useGraphStore.setState({ schema: { ...defaultSchema } }) })
    assert.ok(commits > before, 'A real scene schema change must still update the host')
    const beforeDocument = commits
    await act(async () => { useGraphStore.setState({ markdownDocumentName: '/render-subscription.md',
      markdownDocumentText: '# Render subscription fixture' }) })
    assert.ok(commits > beforeDocument, 'Document authority changes must remain reactive')
  } finally {
    await act(async () => { root.unmount() })
    dom.window.HTMLCanvasElement.prototype.getContext = originalGetContext
    if (originalMutationObserver) globalThis.MutationObserver = originalMutationObserver
    else delete globalThis.MutationObserver
    useGraphStore.setState(previous, true)
    restore()
  }
}

export async function testGameplaySurfaceIgnoresFramePublications() {
  const { dom, restore } = initJsdomHarness()
  const host = dom.window.document.body.appendChild(dom.window.document.createElement('main'))
  const root = createRoot(host)
  let commits = 0
  function Surface() {
    const state = useCanvasGameplayOverlayState()
    return <output>{JSON.stringify(state)}</output>
  }
  try {
    flightSimDefaultRuntime.exit()
    resetGameModeRuntimeForTests()
    resetCitySimSnapshotForTests(null, false)
    await act(async () => { root.render(<React.Profiler id="surface" onRender={() => { commits += 1 }}>
      <Surface />
    </React.Profiler>) })
    const beforeOpen = commits
    await act(async () => { flightSimDefaultRuntime.open(true) })
    assert.ok(commits > beforeOpen, 'Flight activation and WebGL admission must still update the surface')
    assert.equal(JSON.parse(host.textContent || '{}').flightSimActive, true)
    const beforeCapability = commits
    await act(async () => { flightSimDefaultRuntime.open(false) })
    assert.ok(commits > beforeCapability, 'WebGL capability changes must update an already-active surface')
    assert.equal(JSON.parse(host.textContent || '{}').flightSim.webglSupported, false)
    await act(async () => { flightSimDefaultRuntime.open(true) })
    await act(async () => { flightSimDefaultRuntime.start(); flightSimDefaultRuntime.setThrottle(1) })
    const beforeFrames = commits
    const initialFlight = flightSimDefaultRuntime.read()
    for (let i = 0; i < 5; i += 1) {
      await act(async () => { await flightSimDefaultRuntime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS) })
    }
    const advancedFlight = flightSimDefaultRuntime.read()
    assert.ok(advancedFlight.tick > initialFlight.tick, 'The real Flight simulation must advance')
    assert.ok(advancedFlight.revision > initialFlight.revision, 'The actual runtime must publish new snapshots')
    assert.notDeepEqual(advancedFlight.aircraft, initialFlight.aircraft, 'Aircraft motion must not be frozen')
    assert.equal(commits - beforeFrames, 0, 'Five real Flight advances must add zero surface commits')
    const beforeMetadata = commits
    const gameRevision = readGameModeSnapshot().revision
    await act(async () => { reportGameModeSimulationFailure(new Error('Render subscription fixture')) })
    assert.ok(readGameModeSnapshot().revision > gameRevision)
    const cityRevision = readCitySimSnapshot().revision
    await act(async () => { publishCitySimSnapshot({ message: 'Render subscription fixture' }) })
    assert.ok(readCitySimSnapshot().revision > cityRevision)
    assert.equal(commits, beforeMetadata, 'FPS failure metadata and City message changes do not change surface ownership')
    await act(async () => { publishCitySimSnapshot({ active: true }) })
    assert.ok(commits > beforeMetadata, 'City activation must remain reactive')
    const beforeCityOperation = commits
    await act(async () => { publishCitySimSuccess('exit', 'Exited fixture') })
    assert.ok(commits > beforeCityOperation, 'City source-intent exit authority must remain reactive')
    assert.equal(JSON.parse(host.textContent || '{}').citySim.lastResult.operation, 'exit')
    const afterCityOperation = commits
    await act(async () => { publishCitySimSuccess('exit', 'Repeated exit metadata') })
    assert.equal(commits, afterCityOperation, 'A new result object with the same operation must not rebuild the surface')
    const beforeExit = commits
    await act(async () => { flightSimDefaultRuntime.exit() })
    assert.ok(commits > beforeExit, 'Flight exit must still update the surface')
    assert.equal(JSON.parse(host.textContent || '{}').flightSimActive, false)
  } finally {
    await act(async () => { root.unmount() })
    flightSimDefaultRuntime.exit()
    resetGameModeRuntimeForTests()
    resetCitySimSnapshotForTests(null, false)
    restore()
  }
}
