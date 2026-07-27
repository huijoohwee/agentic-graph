import assert from 'node:assert/strict'
import test from 'node:test'

import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  motionControlCaptureSurfaceIsOpen,
} from '@/features/three/motionControlSurfaceRuntime'
import { activateXrSceneSurface } from '@/features/three/xrSceneSurfaceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

test('active Flight and Motion Control preserve each other across their panel handoff', async () => {
  resetFlightSimRuntimeForTests()
  const previousPanel = useGraphStore.getState()
  const previousPanelState = {
    bottomSurfaceCollapsed: previousPanel.bottomSurfaceCollapsed,
    bottomSurfaceTab: previousPanel.bottomSurfaceTab,
    canvas3dMode: previousPanel.canvas3dMode,
    canvasRenderMode: previousPanel.canvasRenderMode,
    floatingPanelOpen: previousPanel.floatingPanelOpen,
    floatingPanelView: previousPanel.floatingPanelView,
  }
  try {
    const opened = await openFlightSimSurface({ openPanel: true, webglSupported: true })
    assert.equal(opened.active, true)
    assert.equal((await startFlightSim()).phase, 'ready')
    const runId = readFlightSimSnapshot().runId

    assert.equal(activateXrSceneSurface({
      panelView: 'motionControl',
      openPanel: true,
      timeline: true,
    }), true)
    assert.equal(readFlightSimSnapshot().active, true)
    assert.equal(readFlightSimSnapshot().runId, runId)
    assert.equal(useGraphStore.getState().floatingPanelView, 'motionControl')

    assert.equal(activateXrSceneSurface({
      panelView: 'flightSim',
      openPanel: true,
      timeline: true,
    }), true)
    assert.equal(readFlightSimSnapshot().active, true)
    assert.equal(readFlightSimSnapshot().runId, runId)
    assert.equal(useGraphStore.getState().floatingPanelView, 'flightSim')
    assert.equal(motionControlCaptureSurfaceIsOpen({
      canvasRenderMode: '3d',
      canvas3dMode: 'xr',
      floatingPanelOpen: true,
      floatingPanelView: 'flightSim',
      mediaCatalogMode: 'media',
    }), true)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimRuntimeForTests()
    useGraphStore.setState(previousPanelState as never)
  }
})
