import assert from 'node:assert/strict'
import test from 'node:test'

import { useGraphStore } from '@/hooks/useGraphStore'
import {
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_NEUTRAL_INPUT,
  type FlightSimSpatialProfile,
} from '@/features/game-flight-sim/flightSimModel'
import {
  createFlightSimRuntime,
} from '@/features/game-flight-sim/flightSimRuntimeCore'
import {
  runFlightSimStageSimulationStep,
} from '@/features/game-flight-sim/flightSimSimulationClock'
import {
  FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE,
  readFlightSimSurfaceOwnershipStatus,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipStatus'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const PROFILE: FlightSimSpatialProfile = Object.freeze({
  id: 'flight-sim:production-seam-test',
  sourceKey: 'authored:production-seam-test',
  aircraftHalfSize: Object.freeze([0.5, 0.5, 0.5] as const),
  spawn: Object.freeze({
    position: Object.freeze([0, 20, 0] as const),
    velocity: Object.freeze([0, 0, -10] as const),
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0.6,
  }),
  blockers: Object.freeze([]),
  waypoints: Object.freeze([
    Object.freeze({
      id: 'waypoint-1',
      position: Object.freeze([0, 20, -200] as const),
      radiusMeters: 50,
    }),
    Object.freeze({
      id: 'waypoint-2',
      position: Object.freeze([0, 20, -400] as const),
      radiusMeters: 50,
    }),
    Object.freeze({
      id: 'waypoint-3',
      position: Object.freeze([0, 20, -600] as const),
      radiusMeters: 50,
    }),
  ]),
  landingPad: Object.freeze({
    id: 'landing-pad',
    position: Object.freeze([0, 0, -800] as const),
    radiusMeters: 50,
  }),
})

test('production stage commits ready to flying only on its first armed World_Tick', async () => {
  const runtime = createFlightSimRuntime({ profile: PROFILE })
  const ready = runtime.start()

  const held = await runFlightSimStageSimulationStep({
    input: FLIGHT_SIM_NEUTRAL_INPUT,
    stageInput: runtime.setInput,
    advanceFixedStep: () => runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS),
  })
  assert.equal(held, ready)
  assert.equal(held.phase, 'ready')
  assert.equal(held.tick, 0)

  let staged = ready
  const flying = await runFlightSimStageSimulationStep({
    input: Object.freeze({
      ...FLIGHT_SIM_NEUTRAL_INPUT,
      pitch: 0.4,
    }),
    stageInput: input => {
      staged = runtime.setInput(input)
      return staged
    },
    advanceFixedStep: () => runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS),
  })

  assert.equal(staged, ready)
  assert.equal(staged.phase, 'ready')
  assert.equal(staged.tick, 0)
  assert.deepEqual(staged.aircraft, ready.aircraft)
  assert.equal(flying.phase, 'flying')
  assert.equal(flying.tick, 1)
  assert.notDeepEqual(flying.aircraft, ready.aircraft)
})

test('aborted entry reports a fail-closed diagnostic when prior surface restoration fails', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  useGraphStore.setState({
    canvasRenderMode: '2d',
    canvas3dMode: '3d',
    documentStructureBaselineLock: false,
    documentSemanticMode: 'document',
    floatingPanelOpen: false,
    floatingPanelView: 'motionControl',
  } as never)

  const controller = new AbortController()
  const originalSetCanvas3dMode = useGraphStore.getState().setCanvas3dMode
  const originalSetFloatingPanelView =
    useGraphStore.getState().setFloatingPanelView
  useGraphStore.setState({
    setCanvas3dMode: mode => {
      if (controller.signal.aborted) {
        throw new Error('aborted entry restoration sentinel')
      }
      originalSetCanvas3dMode(mode)
    },
    setFloatingPanelView: view => {
      originalSetFloatingPanelView(view)
      if (view === 'flightSim') {
        controller.abort(new Error('synthetic Flight WebMCP deadline'))
      }
    },
  } as never)

  try {
    const failed = await openFlightSimSurface({
      signal: controller.signal,
      webglSupported: true,
      workspace: {
        readFileText: async () => null,
      } as unknown as WorkspaceFs,
    })
    const ownershipFailure = readFlightSimSurfaceOwnershipStatus().failure

    assert.equal(failed.active, false)
    assert.equal(failed.phase, 'stopped')
    assert.match(
      failed.runtimeError || '',
      /surface restoration did not complete after aborted entry/i,
    )
    assert.match(failed.runtimeError || '', /aborted entry restoration sentinel/)
    assert.equal(
      ownershipFailure?.code,
      FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE,
    )
    assert.equal(ownershipFailure?.phase, 'restoration')
    assert.equal(readFlightSimSnapshot(), failed)
  } finally {
    useGraphStore.setState({
      setCanvas3dMode: originalSetCanvas3dMode,
      setFloatingPanelView: originalSetFloatingPanelView,
    } as never)
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
    useGraphStore.getState().resetAll()
  }
})
