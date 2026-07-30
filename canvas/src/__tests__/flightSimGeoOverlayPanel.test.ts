import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  waitForFlightSimSurfaceRestoration,
} from '@/features/game-flight-sim/flightSimRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled,
} from '@/lib/gympgrph/api'

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

test('Geo+XR entry reasserts and restores the native Geo owner', async () => {
  setGeospatialModeEnabled(false)
  resetFlightSimRuntimeForTests()
  try {
    const opened = await openFlightSimSurface({
      geospatialComposite: true,
      openPanel: false,
      webglSupported: true,
    })
    assert.equal(opened.active, true)
    assert.equal(isGeospatialModeEnabled(), true)
    assert.equal(useGraphStore.getState().canvasRenderMode, '3d')
    assert.equal(useGraphStore.getState().canvas3dMode, 'xr')

    exitFlightSimSurface()
    await waitForFlightSimSurfaceRestoration()
    assert.equal(isGeospatialModeEnabled(), false)
  } finally {
    if (readFlightSimSnapshot().active) {
      exitFlightSimSurface({ restorePreviousSurface: false })
    }
    setGeospatialModeEnabled(false)
    resetFlightSimRuntimeForTests()
  }
})
