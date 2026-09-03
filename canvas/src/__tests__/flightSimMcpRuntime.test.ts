import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeDecisionsIntoAgenticOsMarkdown } from '../../../ecs/decisionDocument.js'

import {
  buildAgenticGraphAgentReadyToolContracts,
  AGENTIC_OS_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import {
  buildFlightSimWebMcpToolBuilders,
  FLIGHT_SIM_WEB_MCP_DEADLINE_MS,
} from '@/features/agent-ready/flightSimWebMcpTools'
import {
  FLIGHT_SIM_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/flightSimAgentReadyContract.mjs'
import {
  FLIGHT_SIM_INVOCATION_BINDINGS,
  FLIGHT_SIM_INVOCATION_COMMANDS,
  FLIGHT_SIM_INVOCATION_SEMANTICS,
  FLIGHT_SIM_MCP_SCHEMA,
  FLIGHT_SIM_CONTROL_OPERATIONS,
  FLIGHT_SIM_WEB_MCP_TOOL_IDS,
} from '@/features/game-flight-sim/flightSimMcpContract.mjs'
import {
  buildFlightSimInvocation,
  controlLocalFlightSim,
  diagnoseFlightSimControl,
  inspectLocalFlightSim,
  normalizeFlightSimControl,
  parseFlightSimInvocation,
} from '@/features/game-flight-sim/flightSimMcpRuntime'
import {
  advanceFlightSimByFixedStep,
  exitFlightSimSurface,
  isFlightSimHydrationPending,
  openFlightSimSurface,
  readFlightSimSnapshot,
  rejectFlightSimGameplayNetworkAttempt,
  resetFlightSimLocalPersistence,
  resetFlightSimRuntimeForTests,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  readFlightSimDecisionStore,
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  resetFlightSimTrainingScenarioForTests,
} from '@/features/game-flight-sim/flightSimTrainingScenario'
import { useGraphStore } from '@/hooks/useGraphStore'

const buildWebName = (name: string): string => `agentic-graph.${name}`
const readOnlyAnnotations = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
})
const mutationAnnotations = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: false,
})

test('Flight Sim keeps one canonical invocation tuple and two browser tool ids', () => {
  assert.deepEqual(FLIGHT_SIM_INVOCATION_COMMANDS, { control: '/flight.sim' })
  assert.deepEqual(FLIGHT_SIM_INVOCATION_BINDINGS, { canvas: '@canvas' })
  assert.deepEqual(FLIGHT_SIM_INVOCATION_SEMANTICS, { flight: '#flight' })
  assert.equal(FLIGHT_SIM_MCP_SCHEMA, 'agentic-graph-flight-sim-mcp/v1')
  assert.deepEqual(FLIGHT_SIM_WEB_MCP_TOOL_IDS, {
    inspect: 'inspect_local_flight_sim',
    control: 'control_local_flight_sim',
  })
  assert.deepEqual(FLIGHT_SIM_AGENT_READY_TOOL_IDS, {
    inspectLocalFlightSim: 'inspect_local_flight_sim',
    controlLocalFlightSim: 'control_local_flight_sim',
  })
  assert.deepEqual(FLIGHT_SIM_CONTROL_OPERATIONS, [
    'open', 'start', 'stop', 'restart', 'throttle',
    'mission-foundation', 'mission-night', 'mission-systems',
    'failure-none', 'failure-engine', 'failure-instruments', 'failure-controls',
    'voice-on', 'voice-off', 'coach',
    'save', 'exit',
  ])
})

test('Flight Sim builds and parses every canonical native operation', () => {
  for (const operation of FLIGHT_SIM_CONTROL_OPERATIONS) {
    const invocation = operation === 'throttle'
      ? buildFlightSimInvocation(operation, 0.75)
      : buildFlightSimInvocation(operation)
    assert.deepEqual(parseFlightSimInvocation(invocation), {
      invocation,
      operation,
      ...(operation === 'throttle' ? { throttle: 0.75 } : {}),
    })
  }
  assert.equal(
    buildFlightSimInvocation('open'),
    '/flight.sim @canvas #flight operation=open',
  )
  assert.equal(
    buildFlightSimInvocation('throttle', 0.75),
    '/flight.sim @canvas #flight operation=throttle throttle=0.75',
  )
  const smallThrottle = buildFlightSimInvocation('throttle', 1e-7)
  assert.equal(parseFlightSimInvocation(smallThrottle)?.throttle, 1e-7)
})

test('Flight Sim native parsing rejects duplicate, unknown, and incomplete tokens', () => {
  const invalidInvocations = [
    '/flight.sim /flight.sim @canvas #flight operation=open',
    '/flight.sim @canvas @canvas #flight operation=open',
    '/flight.sim @canvas #flight #flight operation=open',
    '/flight.sim @wrong #flight operation=open',
    '/flight.sim @canvas #wrong operation=open',
    '/flight.wrong @canvas #flight operation=open',
    '/flight.sim @canvas #flight operation=open operation=start',
    '/flight.sim @canvas #flight operation=throttle throttle=0.5 throttle=0.75',
    '/flight.sim @canvas #flight operation=open throttle=0.5',
    '/flight.sim @canvas #flight operation=throttle',
    '/flight.sim @canvas #flight operation=throttle throttle=NaN',
    '/flight.sim @canvas #flight operation=throttle throttle=Infinity',
    '/flight.sim @canvas #flight operation=throttle throttle=-0.1',
    '/flight.sim @canvas #flight operation=throttle throttle=1.1',
    '/flight.sim @canvas #flight operation=throttle throttle=0x1',
    '/flight.sim @canvas #flight operation=open unknown=value',
    '/flight.sim @canvas #flight operation=unknown',
    '/flight.sim @canvas #flight',
  ]
  for (const invocation of invalidInvocations) {
    assert.equal(parseFlightSimInvocation(invocation), null, invocation)
  }
})

test('Flight Sim structured input rejects mixed, unknown, and invalid throttle fields', () => {
  assert.deepEqual(normalizeFlightSimControl({ operation: 'open' }), {
    invocation: '',
    operation: 'open',
  })
  assert.deepEqual(normalizeFlightSimControl({ operation: 'throttle', throttle: 0.25 }), {
    invocation: '',
    operation: 'throttle',
    throttle: 0.25,
  })
  assert.equal(normalizeFlightSimControl({
    invocation: buildFlightSimInvocation('open'),
    operation: 'open',
  }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'open', throttle: 0.25 }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'throttle' }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'throttle', throttle: Number.NaN }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'throttle', throttle: Number.POSITIVE_INFINITY }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'throttle', throttle: -0.1 }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'throttle', throttle: 1.1 }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'unknown' as 'open' }), null)
  assert.equal(normalizeFlightSimControl({ operation: 'open', unknown: true } as never), null)
})

test('Flight Sim diagnostics name each fail-closed invocation violation and retain state byte-identically', async () => {
  resetFlightSimRuntimeForTests()
  const cases = [
    {
      input: { invocation: '@canvas #flight operation=open' },
      errorCode: 'FLIGHT_SIM_INVOCATION_MISSING_COMMAND',
    },
    {
      input: { invocation: '/flight.sim #flight operation=open' },
      errorCode: 'FLIGHT_SIM_INVOCATION_MISSING_BINDING',
    },
    {
      input: { invocation: '/flight.sim @canvas #wrong operation=open' },
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
    {
      input: { invocation: '/flight.sim @canvas #flight operation' },
      errorCode: 'FLIGHT_SIM_INVOCATION_MALFORMED_PAIR',
    },
    {
      input: { invocation: '/flight.sim @canvas #flight operation=throttle throttle=NaN' },
      errorCode: 'FLIGHT_SIM_CONTROL_INVALID_THROTTLE',
    },
    {
      input: { invocation: '/flight.sim @canvas #flight operation=inspect' },
      errorCode: 'FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION',
    },
  ] as const

  for (const diagnosticCase of cases) {
    const before = JSON.stringify(readFlightSimSnapshot())
    const diagnostic = diagnoseFlightSimControl(diagnosticCase.input)
    assert.equal(diagnostic.ok, false)
    if (diagnostic.ok) throw new Error('expected a Flight Sim diagnostic failure')
    assert.equal(diagnostic.errorCode, diagnosticCase.errorCode)
    assert.ok(diagnostic.field || diagnostic.token)

    const result = await controlLocalFlightSim(diagnosticCase.input)
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, diagnostic.errorCode)
    assert.equal(result.message, diagnostic.message)
    assert.equal(JSON.stringify(readFlightSimSnapshot()), before)
  }
})

test('Flight Sim builder rejects invalid programmatic invocation values', () => {
  assert.throws(
    () => buildFlightSimInvocation('throttle'),
    /finite value from 0 through 1/,
  )
  assert.throws(
    () => buildFlightSimInvocation('throttle', Number.NaN),
    /finite value from 0 through 1/,
  )
  assert.throws(
    () => buildFlightSimInvocation('open', 0.5),
    /forbids a throttle value/,
  )
  assert.throws(
    () => buildFlightSimInvocation('unknown' as 'open'),
    /Unsupported Flight Sim operation/,
  )
})

test('Flight Sim MCP controls training mission, failure, voice, and coaching state', async () => {
  resetFlightSimRuntimeForTests()
  resetFlightSimTrainingScenarioForTests()
  try {
    assert.equal((await controlLocalFlightSim({ operation: 'mission-night' })).ok, true)
    assert.equal(inspectLocalFlightSim().training.missionId, 'night-circuit')
    assert.equal(inspectLocalFlightSim().training.night, true)
    assert.equal(inspectLocalFlightSim().training.failureId, 'instrument-uncertainty')

    assert.equal((await controlLocalFlightSim({ operation: 'failure-controls' })).ok, true)
    assert.equal(inspectLocalFlightSim().training.failureId, 'control-bias')
    assert.equal((await controlLocalFlightSim({ operation: 'voice-on' })).ok, true)
    assert.equal(inspectLocalFlightSim().training.voiceEnabled, true)
    assert.match(
      (await controlLocalFlightSim({ operation: 'coach' })).message,
      /coaching cue/i,
    )

    await openFlightSimSurface({ openPanel: false, webglSupported: true })
    await controlLocalFlightSim({ operation: 'start' })
    assert.equal(
      (await controlLocalFlightSim({ operation: 'mission-foundation' })).ok,
      false,
    )
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimRuntimeForTests()
    resetFlightSimTrainingScenarioForTests()
  }
})

test('Flight Sim MCP enforces the active tick-zero lifecycle and resumable stop/start', async () => {
  resetFlightSimRuntimeForTests()
  const hostFetch = globalThis.fetch
  try {
    await openFlightSimSurface({ openPanel: false, webglSupported: true })
    assert.equal(globalThis.fetch, hostFetch)
    assert.equal(inspectLocalFlightSim().flightSim.active, true)
    assert.equal((await controlLocalFlightSim({ operation: 'inspect' })).errorCode, 'FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION')
    assert.equal((await controlLocalFlightSim({ operation: 'open' })).ok, false)

    assert.equal((await controlLocalFlightSim({ operation: 'start' })).ok, true)
    assert.equal(readFlightSimSnapshot().phase, 'ready')

    assert.equal((await controlLocalFlightSim({ operation: 'throttle', throttle: 0.75 })).ok, true)
    assert.equal(readFlightSimSnapshot().phase, 'ready')
    assert.notEqual(readFlightSimSnapshot().aircraft.throttle, 0.75)
    await advanceFlightSimByFixedStep()
    assert.equal(readFlightSimSnapshot().phase, 'flying')
    assert.equal(readFlightSimSnapshot().aircraft.throttle, Math.fround(0.75))

    assert.equal((await controlLocalFlightSim({ operation: 'stop' })).ok, true)
    assert.equal(readFlightSimSnapshot().phase, 'stopped')
    assert.equal((await controlLocalFlightSim({ operation: 'start' })).ok, true)
    assert.equal(readFlightSimSnapshot().phase, 'flying')

    assert.equal((await controlLocalFlightSim({ operation: 'restart' })).ok, true)
    assert.equal(readFlightSimSnapshot().phase, 'ready')
    assert.equal(readFlightSimSnapshot().tick, 0)
    assert.equal((await controlLocalFlightSim({ operation: 'save' })).ok, false)

    let gameplayTransportExecuted = false
    const rejected = rejectFlightSimGameplayNetworkAttempt(
      'fetch:GET:https://airvio.co/api/storage',
      () => {
        gameplayTransportExecuted = true
      },
    )
    assert.equal(gameplayTransportExecuted, false)
    assert.match(rejected.runtimeError || '', /blocked gameplay network operation/)
    assert.equal(globalThis.fetch, hostFetch)
    assert.equal((await controlLocalFlightSim({ operation: 'exit' })).ok, true)
    assert.equal(globalThis.fetch, hostFetch)
    assert.equal(readFlightSimSnapshot().active, false)
    assert.equal((await controlLocalFlightSim({ operation: 'exit' })).ok, false)
  } finally {
    if (readFlightSimSnapshot().active) await controlLocalFlightSim({ operation: 'exit' })
    assert.equal(globalThis.fetch, hostFetch)
  }
})

test('Flight Sim MCP reports a failed Canvas restoration instead of a successful Exit', async () => {
  resetFlightSimRuntimeForTests()
  await openFlightSimSurface({ openPanel: false, webglSupported: true })
  const originalSetCanvas3dMode = useGraphStore.getState().setCanvas3dMode
  useGraphStore.setState({
    setCanvas3dMode: () => {
      throw new Error('MCP restoration failure')
    },
  } as never)
  try {
    const result = await controlLocalFlightSim({ operation: 'exit' })
    assert.equal(result.ok, false)
    assert.match(result.message, /restoration did not complete/i)
    assert.match(readFlightSimSnapshot().runtimeError || '', /MCP restoration failure/)
  } finally {
    useGraphStore.setState({ setCanvas3dMode: originalSetCanvas3dMode } as never)
    resetFlightSimRuntimeForTests()
  }
})

test('Flight Sim cannot create a World while local Decisions are still hydrating', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  let signalReadStarted!: () => void
  let releaseRead!: () => void
  const readStarted = new Promise<void>(resolve => {
    signalReadStarted = resolve
  })
  const readAllowed = new Promise<void>(resolve => {
    releaseRead = resolve
  })
  const workspace = {
    readFileText: async () => {
      signalReadStarted()
      await readAllowed
      return '---\nflow:\n  nodes: [not valid\n---\n'
    },
  } as unknown as WorkspaceFs

  try {
    const opening = openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    await readStarted
    assert.equal(isFlightSimHydrationPending(), true)
    const concurrentRetry = startFlightSim({
      openPanel: false,
      webglSupported: true,
      workspace: {
        readFileText: async () => null,
      } as unknown as WorkspaceFs,
    })
    const earlyStart = startFlightSim()
    assert.equal(earlyStart.runId, 0)
    assert.equal(earlyStart.phase, 'stopped')
    assert.match(earlyStart.runtimeError || '', /still loading/)

    releaseRead()
    const blocked = await opening
    assert.equal(isFlightSimHydrationPending(), false)
    assert.equal(blocked.runId, 0)
    assert.equal(blocked.phase, 'stopped')
    assert.match(blocked.runtimeError || '', /Unreadable/)
    const stillBlocked = await concurrentRetry
    assert.equal(stillBlocked.runId, 0)
    assert.equal(stillBlocked.phase, 'stopped')
    assert.match(stillBlocked.runtimeError || '', /Unreadable|blocked/)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
  }
})

test('Reset local save clears a prior mission hydration error before a fresh Start', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  let saveText = '---\nflow:\n  nodes: [not valid\n---\n'
  const workspace = {
    ensureSeed: async () => false,
    listEntries: async () => [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 },
      { path: '/game-flight-sim', parentPath: '/', kind: 'folder', name: 'game-flight-sim', updatedAtMs: 0 },
      { path: '/game-flight-sim/mission-1-decisions.md', parentPath: '/game-flight-sim', kind: 'file', name: 'mission-1-decisions.md', text: saveText, updatedAtMs: 0 },
    ],
    readFileText: async (path: string) => path.endsWith('mission-1-decisions.md') ? saveText : null,
    writeFileText: async (_path: string, text: string) => {
      saveText = text
    },
    createFile: async ({ text }: { text: string }) => {
      saveText = text
      return '/game-flight-sim/mission-1-decisions.md'
    },
    createFolder: async () => '/game-flight-sim',
    deleteEntry: async () => {
      saveText = ''
    },
  } as WorkspaceFs
  try {
    await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: { readFileText: async () => null } as unknown as WorkspaceFs,
    })
    assert.equal(startFlightSim().runId, 1)
    exitFlightSimSurface()
    const blocked = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    assert.match(blocked.runtimeError || '', /Unreadable/)

    const reset = await resetFlightSimLocalPersistence({ workspace })
    assert.equal(reset.status, 'saved')
    assert.equal(readFlightSimSnapshot().runtimeError, null)
    assert.equal(readFlightSimSnapshot().runId, 0)
    await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace,
    })
    const fresh = startFlightSim()
    assert.equal(fresh.phase, 'ready')
    assert.equal(fresh.runId, 1)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
  }
})

test('profile-incompatible Decisions block hydration before a mission World is created', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  const invalidSave = mergeDecisionsIntoAgenticOsMarkdown('---\nflow:\n  nodes: []\n  edges: []\n---\n', [{
    decisionId: 'flight-sim:run-1:tick-1:mission_crashed:unknown-collider',
    decisionType: 'quest_flag',
    entityRef: 'flight-sim:mission:flight-sim-mission-1',
    payload: {
      event: 'mission_crashed',
      missionId: 'flight-sim-mission-1',
      runId: 1,
      tick: 1,
      status: 'crashed',
      colliderId: 'unknown-collider',
      impactSpeed: 0,
    },
    producedAt: '2026-01-01T00:00:00.023Z',
  }]).markdown
  try {
    const blocked = await openFlightSimSurface({
      openPanel: false,
      webglSupported: true,
      workspace: {
        readFileText: async () => invalidSave,
      } as unknown as WorkspaceFs,
    })
    assert.equal(blocked.runId, 0)
    assert.equal(blocked.phase, 'stopped')
    assert.equal(readFlightSimDecisionStore().hydrationBlocked, true)
    assert.match(
      blocked.runtimeError || '',
      /Unreadable \/game-flight-sim\/mission-1-decisions\.md: local Decision document is invalid\./,
    )
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
  }
})

test('Flight Sim publishes exactly two browser-only agent-ready contracts', () => {
  const browserContracts = buildAgenticGraphAgentReadyToolContracts({
    includeBrowserOnlyTools: true,
  })
  const publishedContracts = buildAgenticGraphAgentReadyToolContracts({
    includeBrowserOnlyTools: false,
  })
  const flightToolNames = Object.values(FLIGHT_SIM_AGENT_READY_TOOL_IDS)
  const browserFlightContracts = browserContracts.filter(contract => (
    flightToolNames.includes(contract.name)
  ))
  assert.deepEqual(
    browserFlightContracts.map(contract => contract.webName),
    ['agentic-graph.inspect_local_flight_sim', 'agentic-graph.control_local_flight_sim'],
  )
  assert.equal(
    publishedContracts.some(contract => flightToolNames.includes(contract.name)),
    false,
  )

  const inspectContract = browserFlightContracts[0]
  const controlContract = browserFlightContracts[1]
  assert.deepEqual(inspectContract.annotations, readOnlyAnnotations)
  assert.deepEqual(controlContract.annotations, mutationAnnotations)
  const variants = controlContract.inputSchema.oneOf as Array<{
    additionalProperties?: boolean
    required?: string[]
    properties?: {
      operation?: { const?: string }
      throttle?: { type?: string; minimum?: number; maximum?: number }
    }
  }>
  assert.equal(variants.length, FLIGHT_SIM_CONTROL_OPERATIONS.length + 1)
  const throttleVariant = variants.find(variant => variant.properties?.operation?.const === 'throttle')
  assert.deepEqual(throttleVariant?.required, ['operation', 'throttle'])
  assert.deepEqual(throttleVariant?.properties?.throttle, {
    type: 'number',
    minimum: 0,
    maximum: 1,
  })
  for (const variant of variants) assert.equal(variant.additionalProperties, false)
})

test('Flight Sim WebMCP builders bind the exact two shared contracts', async () => {
  const contracts = buildAgenticGraphAgentReadyToolContracts({
    includeBrowserOnlyTools: true,
  })
  const findContract = (name: string) => {
    const contract = contracts.find(candidate => candidate.name === name)
    assert.ok(contract, name)
    return contract
  }
  resetFlightSimRuntimeForTests()
  try {
    const builders = buildFlightSimWebMcpToolBuilders(findContract)
    assert.deepEqual(Object.keys(builders), [
      AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalFlightSim,
      AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalFlightSim,
    ])

    const inspectTool = builders[AGENTIC_OS_AGENT_READY_TOOL_IDS.inspectLocalFlightSim]()
    const controlTool = builders[AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalFlightSim]()
    assert.equal(inspectTool.name, 'agentic-graph.inspect_local_flight_sim')
    assert.equal(controlTool.name, 'agentic-graph.control_local_flight_sim')

    const inactiveBefore = JSON.stringify(readFlightSimSnapshot())
    const unavailable = await inspectTool.execute()
    assert.deepEqual(unavailable, {
      ok: false,
      errorCode: 'FLIGHT_SIM_STATE_UNAVAILABLE',
      message: 'Flight Sim state is unavailable while the surface is inactive.',
      operation: 'inspect',
    })
    assert.equal(JSON.stringify(readFlightSimSnapshot()), inactiveBefore)

    await openFlightSimSurface({ openPanel: false, webglSupported: true })
    const inspection = await inspectTool.execute()
    assert.equal((inspection as { schema?: unknown }).schema, FLIGHT_SIM_MCP_SCHEMA)
    const invalid = await controlTool.execute({
      invocation: '/flight.sim @canvas @canvas #flight operation=open',
    })
    assert.equal((invalid as { ok?: unknown }).ok, false)
    assert.equal(
      (invalid as { errorCode?: unknown }).errorCode,
      'FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL',
    )
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimRuntimeForTests()
  }
})

test('Flight Sim WebMCP deadline returns a deterministic structured timeout envelope', async () => {
  const contracts = buildAgenticGraphAgentReadyToolContracts({
    includeBrowserOnlyTools: true,
  })
  const findContract = (name: string) => {
    const contract = contracts.find(candidate => candidate.name === name)
    assert.ok(contract, name)
    return contract
  }
  let observedDeadlineMs = 0
  let cancelled = false
  let releaseControl: (() => void) | undefined
  let resolveControlSettled: (() => void) | undefined
  let observedFence: Parameters<typeof controlLocalFlightSim>[1]
  const controlSettled = new Promise<void>(resolve => {
    resolveControlSettled = resolve
  })
  resetFlightSimRuntimeForTests()
  const builders = buildFlightSimWebMcpToolBuilders(findContract, {
    control: async (input, fence) => {
      observedFence = fence
      await new Promise<void>(resolve => {
        releaseControl = resolve
      })
      const result = await controlLocalFlightSim(input, fence)
      resolveControlSettled?.()
      return result
    },
    createDeadline: deadlineMs => {
      observedDeadlineMs = deadlineMs
      return {
        expired: Promise.resolve(),
        cancel: () => {
          cancelled = true
        },
      }
    },
  })
  const controlTool = builders[AGENTIC_OS_AGENT_READY_TOOL_IDS.controlLocalFlightSim]()
  const before = JSON.stringify(readFlightSimSnapshot())
  const timeout = await controlTool.execute({ operation: 'open' }) as {
    ok?: unknown
    errorCode?: unknown
    message?: unknown
    operation?: unknown
    deadlineMs?: unknown
  }
  assert.equal(timeout.ok, false)
  assert.equal(timeout.errorCode, 'FLIGHT_SIM_WEB_MCP_TIMEOUT')
  assert.equal(timeout.operation, 'control')
  assert.equal(timeout.deadlineMs, FLIGHT_SIM_WEB_MCP_DEADLINE_MS)
  assert.match(String(timeout.message), /2000 milliseconds/)
  assert.equal(observedDeadlineMs, FLIGHT_SIM_WEB_MCP_DEADLINE_MS)
  assert.equal(cancelled, true)
  assert.equal(JSON.stringify(readFlightSimSnapshot()), before)
  assert.equal(observedFence?.signal.aborted, true)
  assert.equal(observedFence?.isCurrent(), false)

  assert.ok(releaseControl)
  releaseControl()
  await controlSettled
  assert.equal(
    JSON.stringify(readFlightSimSnapshot()),
    before,
    'a timed-out delayed control must not mutate after its timeout envelope settles',
  )
  resetFlightSimRuntimeForTests()
})
