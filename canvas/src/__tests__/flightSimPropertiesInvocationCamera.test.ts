import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  buildFlightSimWebMcpToolBuilders,
} from '@/features/agent-ready/flightSimWebMcpTools'
import { KNOWGRPH_AGENT_READY_TOOL_IDS } from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import {
  buildFlightSimInvocation,
  controlLocalFlightSim,
  diagnoseFlightSimControl,
  type FlightSimOperation,
} from '@/features/game-flight-sim/flightSimMcpRuntime'
import {
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  controlLocalCamera,
} from '@/features/strybldr/cameraMcpRuntime'
import {
  inspectLocalCameraSource,
} from '@/features/strybldr/cameraSourceMcpRuntime'
import {
  XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  XR_NATIVE_CONTROLLER_CAMERA_MODES,
  type XrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'
import {
  hydrateXrMotionReferenceRuntime,
  readXrMotionReferenceRuntime,
  restoreXrMotionReferenceRuntimeSnapshot,
} from '@/features/three/xrMotionReferenceRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'

const SUPPORTED_OPERATIONS: readonly FlightSimOperation[] = Object.freeze([
  'open',
  'start',
  'stop',
  'restart',
  'throttle',
  'save',
  'exit',
])

const cameraModeArbitrary = fc.constantFrom<XrNativeControllerCameraMode>(
  ...XR_NATIVE_CONTROLLER_CAMERA_MODES,
)

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/)

const unsupportedOperationArbitrary = identifierArbitrary.filter(
  value => !SUPPORTED_OPERATIONS.includes(value as FlightSimOperation),
)

const invalidCameraValueArbitrary = identifierArbitrary.filter(
  value => !XR_NATIVE_CONTROLLER_CAMERA_MODES.includes(value as XrNativeControllerCameraMode),
)

const findFlightSimContract = (name: string) => ({
  webName: `knowgrph.${name}`,
  title: name,
  description: name,
  inputSchema: { type: 'object' },
})

const saveCameraStoreFields = () => {
  const state = useGraphStore.getState()
  return {
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    graphData: state.graphData,
    selectedNodeId: state.selectedNodeId,
    timelineTransportPlaying: state.timelineTransportPlaying,
  }
}

const restoreCameraStoreFields = (
  fields: ReturnType<typeof saveCameraStoreFields>,
) => {
  useGraphStore.setState(fields as never)
}

// Feature: knowgrph-game-flight-sim, Property 23 - Invocation grammar strictness
test('Feature: knowgrph-game-flight-sim, Property 23 - Invocation grammar strictness', async () => {
  const violationArbitrary = fc.constantFrom(
    {
      input: { invocation: '@canvas #flight operation=open' },
      errorCode: 'FLIGHT_SIM_INVOCATION_MISSING_COMMAND',
    },
    {
      input: { invocation: '/flight.sim #flight operation=open' },
      errorCode: 'FLIGHT_SIM_INVOCATION_MISSING_BINDING',
    },
    {
      input: { invocation: '/flight.sim @canvas operation=open' },
      errorCode: 'FLIGHT_SIM_INVOCATION_SEMANTIC_MISMATCH',
    },
    {
      input: { invocation: '/flight.sim /flight.sim @canvas #flight operation=open' },
      errorCode: 'FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL',
    },
    {
      input: { invocation: '/flight.sim @canvas #flight operation=open operation=start' },
      errorCode: 'FLIGHT_SIM_INVOCATION_DUPLICATE_KEY',
    },
    {
      input: { invocation: '/flight.sim @canvas #flight operation=open unknown=value' },
      errorCode: 'FLIGHT_SIM_INVOCATION_UNKNOWN_KEY',
    },
    {
      input: {
        invocation: '/flight.sim @canvas #flight operation=open',
        operation: 'open',
      },
      errorCode: 'FLIGHT_SIM_CONTROL_MIXED_INPUT',
    },
  )

  await fc.assert(
    fc.asyncProperty(violationArbitrary, async violation => {
      resetFlightSimRuntimeForTests()
      const before = JSON.stringify(readFlightSimSnapshot())
      const result = await controlLocalFlightSim(violation.input)
      assert.equal(result.ok, false)
      assert.equal(result.errorCode, violation.errorCode)
      assert.ok(result.field || result.token)
      assert.equal(JSON.stringify(readFlightSimSnapshot()), before)
    }),
    flightSimPropertyParameters(23),
  )
})

// Feature: knowgrph-game-flight-sim, Property 24 - Supported lifecycle operation is applied exactly once
test('Feature: knowgrph-game-flight-sim, Property 24 - Supported lifecycle operation is applied exactly once', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom<FlightSimOperation>(...SUPPORTED_OPERATIONS),
      fc.boolean(),
      fc.integer({ min: 0, max: 1_000 }),
      async (operation, useNativeInvocation, throttlePermille) => {
        const executions: FlightSimOperation[] = []
        const builders = buildFlightSimWebMcpToolBuilders(findFlightSimContract, {
          control: input => {
            const diagnostic = diagnoseFlightSimControl(input)
            if (diagnostic.ok === false) {
              assert.fail(`Expected supported control, got ${diagnostic.errorCode}`)
            }
            executions.push(diagnostic.value.operation)
            return {
              ok: true,
              message: `Applied ${diagnostic.value.operation}.`,
              operation: diagnostic.value.operation,
            }
          },
        })
        const controlTool = builders[KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalFlightSim]()
        const throttle = throttlePermille / 1_000
        const input = useNativeInvocation
          ? {
            invocation: buildFlightSimInvocation(
              operation,
              operation === 'throttle' ? throttle : undefined,
            ),
          }
          : {
            operation,
            ...(operation === 'throttle' ? { throttle } : {}),
          }
        const result = await controlTool.execute(input) as {
          ok?: unknown
          operation?: unknown
        }
        assert.equal(result.ok, true)
        assert.equal(result.operation, operation)
        assert.deepEqual(executions, [operation])
      },
    ),
    flightSimPropertyParameters(24),
  )
})

// Feature: knowgrph-game-flight-sim, Property 25 - Unsupported operation is rejected without state change
test('Feature: knowgrph-game-flight-sim, Property 25 - Unsupported operation is rejected without state change', async () => {
  await fc.assert(
    fc.asyncProperty(
      unsupportedOperationArbitrary,
      fc.boolean(),
      async (operation, useNativeInvocation) => {
        resetFlightSimRuntimeForTests()
        const before = JSON.stringify(readFlightSimSnapshot())
        const input = useNativeInvocation
          ? { invocation: `/flight.sim @canvas #flight operation=${operation}` }
          : { operation }
        const result = await controlLocalFlightSim(input)
        assert.equal(result.ok, false)
        assert.equal(result.errorCode, 'FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION')
        assert.match(result.message, new RegExp(operation))
        assert.equal(JSON.stringify(readFlightSimSnapshot()), before)
      },
    ),
    flightSimPropertyParameters(25),
  )
})

// Feature: knowgrph-game-flight-sim, Property 26 - Inspect is read-only
test('Feature: knowgrph-game-flight-sim, Property 26 - Inspect is read-only', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.boolean(),
      fc.constantFrom('stopped', 'ready', 'flying', 'completed', 'crashed'),
      fc.nat({ max: 100_000 }),
      async (active, phase, tick) => {
        const inspection = {
          schema: 'property-inspection',
          flightSim: { active, phase, tick },
        }
        const inspectionBefore = JSON.stringify(inspection)
        const runtimeBefore = JSON.stringify(readFlightSimSnapshot())
        let inspectCalls = 0
        const builders = buildFlightSimWebMcpToolBuilders(findFlightSimContract, {
          inspect: () => {
            inspectCalls += 1
            return inspection
          },
        })
        const inspectTool = builders[KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalFlightSim]()
        const result = await inspectTool.execute() as Record<string, unknown>
        assert.equal(inspectCalls, 1)
        if (active) {
          assert.deepEqual(result, inspection)
        } else {
          assert.equal(result.ok, false)
          assert.equal(result.errorCode, 'FLIGHT_SIM_STATE_UNAVAILABLE')
        }
        assert.equal(JSON.stringify(inspection), inspectionBefore)
        assert.equal(JSON.stringify(readFlightSimSnapshot()), runtimeBefore)
      },
    ),
    flightSimPropertyParameters(26),
  )
})

// Feature: knowgrph-game-flight-sim, Property 41 - Valid framing selection applied independently of aircraft
test('Feature: knowgrph-game-flight-sim, Property 41 - Valid framing selection applied independently of aircraft', () => {
  const priorStore = saveCameraStoreFields()
  const priorCameraMode = readXrNativeControllerCamera().mode
  try {
    fc.assert(
      fc.property(
        cameraModeArbitrary,
        fc.option(identifierArbitrary, { nil: null }),
        fc.boolean(),
        (mode, aircraftId, useNativeInvocation) => {
          const selectedNodeId = aircraftId ? `aircraft-${aircraftId}` : null
          useGraphStore.setState({
            canvasRenderMode: '3d',
            canvas3dMode: 'xr',
            graphData: {
              type: 'Graph',
              nodes: selectedNodeId
                ? [{ id: selectedNodeId, type: 'Aircraft', label: selectedNodeId, properties: {} }]
                : [],
              edges: [],
              metadata: {},
            },
            selectedNodeId,
            timelineTransportPlaying: false,
          } as never)
          const result = useNativeInvocation
            ? controlLocalCamera({
              invocation: `/camera.select @camera #camera camera=${mode}`,
            })
            : controlLocalCamera({ action: 'select', cameraId: mode })
          assert.equal(result.ok, true)
          assert.equal(result.action, 'select')
          assert.equal(inspectLocalCameraSource().selected, mode)
          assert.equal(useGraphStore.getState().selectedNodeId, selectedNodeId)
          assert.ok(typeof result.elapsedMs === 'number' && result.elapsedMs <= 1_000)
        },
      ),
      flightSimPropertyParameters(41),
    )
  } finally {
    selectXrNativeControllerCameraMode(priorCameraMode)
    restoreCameraStoreFields(priorStore)
  }
})

// Feature: knowgrph-game-flight-sim, Property 42 - Timeline camera-mark framing ownership round-trip
test('Feature: knowgrph-game-flight-sim, Property 42 - Timeline camera-mark framing ownership round-trip', () => {
  const priorStore = saveCameraStoreFields()
  const priorCameraMode = readXrNativeControllerCamera().mode
  const priorMotion = readXrMotionReferenceRuntime()
  let sceneSequence = 0
  try {
    fc.assert(
      fc.property(
        fc.option(cameraModeArbitrary, { nil: null }),
        operatorMode => {
          const expectedMode = operatorMode || XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE
          selectXrNativeControllerCameraMode(expectedMode)
          sceneSequence += 1
          hydrateXrMotionReferenceRuntime({
            sceneKey: `flight-property-42-${sceneSequence}`,
            nodes: [],
            persistedValue: {
              durationSeconds: 2,
              camera: [{
                timeSeconds: 0,
                anchorId: 'canvas-camera',
                settings: {
                  angle: 'front',
                  level: 'eye-level',
                  shot: 'medium',
                  note: '',
                  orbitX: 0,
                  orbitY: 0,
                },
              }],
            },
          })
          useGraphStore.setState({
            canvasRenderMode: '3d',
            canvas3dMode: 'xr',
            timelineTransportPlaying: true,
          } as never)
          const duringPlayback = inspectLocalCameraSource()
          useGraphStore.setState({ timelineTransportPlaying: false } as never)
          const afterPlayback = inspectLocalCameraSource()
          assert.equal(duringPlayback.selected, expectedMode)
          assert.equal(duringPlayback.effectiveOwner, 'timeline-playback')
          assert.equal(afterPlayback.selected, expectedMode)
          assert.equal(afterPlayback.effectiveOwner, expectedMode)
        },
      ),
      flightSimPropertyParameters(42),
    )
  } finally {
    restoreXrMotionReferenceRuntimeSnapshot(priorMotion)
    selectXrNativeControllerCameraMode(priorCameraMode)
    restoreCameraStoreFields(priorStore)
  }
})

// Feature: knowgrph-game-flight-sim, Property 43 - Invalid camera value is rejected
test('Feature: knowgrph-game-flight-sim, Property 43 - Invalid camera value is rejected', () => {
  const priorCameraMode = readXrNativeControllerCamera().mode
  try {
    fc.assert(
      fc.property(
        cameraModeArbitrary,
        invalidCameraValueArbitrary,
        (activeMode, invalidValue) => {
          selectXrNativeControllerCameraMode(activeMode)
          const before = JSON.stringify(readXrNativeControllerCamera())
          const result = controlLocalCamera({
            invocation: `/camera.select @camera #camera camera=${invalidValue}`,
          })
          assert.equal(result.ok, false)
          assert.equal(result.errorCode, 'CAMERA_SOURCE_INVALID_VALUE')
          assert.equal(result.invalidValue, invalidValue)
          assert.match(result.message, new RegExp(invalidValue))
          assert.equal(JSON.stringify(readXrNativeControllerCamera()), before)
        },
      ),
      flightSimPropertyParameters(43),
    )
  } finally {
    selectXrNativeControllerCameraMode(priorCameraMode)
  }
})
