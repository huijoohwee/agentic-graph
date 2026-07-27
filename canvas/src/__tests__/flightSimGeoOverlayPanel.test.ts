import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
} from '@/features/game-flight-sim/flightSimRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

test('Flight Sim headless entry preserves the visible Geo panel', async () => {
  resetFlightSimRuntimeForTests()
  const graphState = useGraphStore.getState()
  graphState.setFloatingPanelView('geo')
  graphState.setFloatingPanelOpen(true)
  try {
    const opened = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
    })
    assert.equal(opened.active, true)
    assert.equal(useGraphStore.getState().floatingPanelView, 'geo')
    assert.equal(useGraphStore.getState().floatingPanelOpen, true)
  } finally {
    if (readFlightSimSnapshot().active) {
      exitFlightSimSurface({ restorePreviousSurface: false })
    }
    resetFlightSimRuntimeForTests()
  }
})
