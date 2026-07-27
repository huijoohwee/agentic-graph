import {
  exitFlightSim,
  openFlightSimSurface,
  persistFlightSimPendingDecisions,
  readFlightSimSnapshot,
  restartFlightSim,
  setFlightSimThrottle,
  startFlightSim,
  stopFlightSim,
  waitForFlightSimSurfaceRestoration,
} from './flightSimRuntime'
import {
  FLIGHT_SIM_SAVE_PATH,
  queueFlightSimDecisions,
  readFlightSimDecisionStore,
} from './flightSimDecisionStore'
import {
  buildFlightSimTrainingOutcomeDecision,
  enableFlightSimVoiceInstructor,
  readFlightSimTrainingSnapshot,
  speakFlightSimTrainingCue,
} from './flightSimTrainingRuntime'
import {
  selectFlightSimTrainingFailure,
  selectFlightSimTrainingMission,
  type FlightSimTrainingFailureId,
  type FlightSimTrainingMissionId,
} from './flightSimTrainingScenario'
import {
  FLIGHT_SIM_INVOCATION_BINDINGS,
  FLIGHT_SIM_INVOCATION_COMMANDS,
  FLIGHT_SIM_INVOCATION_SEMANTICS,
  FLIGHT_SIM_MCP_SCHEMA,
  FLIGHT_SIM_CONTROL_OPERATIONS,
  FLIGHT_SIM_WEB_MCP_TOOL_IDS,
} from './flightSimMcpContract.mjs'

export type FlightSimOperation =
  | 'open'
  | 'start'
  | 'stop'
  | 'restart'
  | 'throttle'
  | 'mission-foundation'
  | 'mission-night'
  | 'mission-systems'
  | 'failure-none'
  | 'failure-engine'
  | 'failure-instruments'
  | 'failure-controls'
  | 'voice-on'
  | 'voice-off'
  | 'coach'
  | 'save'
  | 'exit'

export type FlightSimControlInput = Readonly<{
  invocation?: string
  operation?: FlightSimOperation
  throttle?: number
}>

export type FlightSimControlExecutionFence = Readonly<{
  signal: AbortSignal
  generation: number
  isCurrent: () => boolean
}>

export type NormalizedFlightSimControl = Readonly<{
  invocation: string
  operation: FlightSimOperation
  throttle?: number
}>

export type FlightSimControlErrorCode =
  | 'FLIGHT_SIM_CONTROL_INVALID_INPUT'
  | 'FLIGHT_SIM_CONTROL_MIXED_INPUT'
  | 'FLIGHT_SIM_CONTROL_INVALID_THROTTLE'
  | 'FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION'
  | 'FLIGHT_SIM_INVOCATION_MISSING_COMMAND'
  | 'FLIGHT_SIM_INVOCATION_COMMAND_MISMATCH'
  | 'FLIGHT_SIM_INVOCATION_MISSING_BINDING'
  | 'FLIGHT_SIM_INVOCATION_BINDING_MISMATCH'
  | 'FLIGHT_SIM_INVOCATION_SEMANTIC_MISMATCH'
  | 'FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL'
  | 'FLIGHT_SIM_INVOCATION_DUPLICATE_KEY'
  | 'FLIGHT_SIM_INVOCATION_UNKNOWN_KEY'
  | 'FLIGHT_SIM_INVOCATION_MALFORMED_PAIR'

export type FlightSimControlDiagnostic =
  | Readonly<{ ok: true; value: NormalizedFlightSimControl }>
  | Readonly<{
    ok: false
    errorCode: FlightSimControlErrorCode
    message: string
    field?: string
    token?: string
  }>

type FlightSimControlFailure = Extract<FlightSimControlDiagnostic, { ok: false }>

const FLIGHT_SIM_OPERATION_SET = new Set<string>(FLIGHT_SIM_CONTROL_OPERATIONS)
const FLIGHT_SIM_INVOCATION_PREFIX = [
  FLIGHT_SIM_INVOCATION_COMMANDS.control,
  FLIGHT_SIM_INVOCATION_BINDINGS.canvas,
  FLIGHT_SIM_INVOCATION_SEMANTICS.flight,
].join(' ')
const NATIVE_THROTTLE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

const isFlightSimOperation = (value: unknown): value is FlightSimOperation => (
  typeof value === 'string' && FLIGHT_SIM_OPERATION_SET.has(value)
)

const isThrottle = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
)

const diagnosticFailure = (
  errorCode: FlightSimControlErrorCode,
  message: string,
  location: Readonly<{ field?: string; token?: string }>,
): FlightSimControlFailure => Object.freeze({ ok: false, errorCode, message, ...location })

const diagnosticSuccess = (
  value: NormalizedFlightSimControl,
): FlightSimControlDiagnostic => Object.freeze({ ok: true, value })

export function buildFlightSimInvocation(
  operation: FlightSimOperation,
  throttle?: number,
): string {
  if (!isFlightSimOperation(operation)) {
    throw new TypeError(`Unsupported Flight Sim operation: ${String(operation)}`)
  }
  if (operation === 'throttle') {
    if (!isThrottle(throttle)) {
      throw new TypeError('Flight Sim throttle requires a finite value from 0 through 1.')
    }
    return `${FLIGHT_SIM_INVOCATION_PREFIX} operation=${operation} throttle=${throttle}`
  }
  if (throttle !== undefined) {
    throw new TypeError(`Flight Sim operation=${operation} forbids a throttle value.`)
  }
  return `${FLIGHT_SIM_INVOCATION_PREFIX} operation=${operation}`
}

const parseNativeThrottle = (value: string | undefined): number | null => {
  if (!value || !NATIVE_THROTTLE_PATTERN.test(value)) return null
  const parsed = Number(value)
  return isThrottle(parsed) ? parsed : null
}

export function parseFlightSimInvocation(value: unknown): NormalizedFlightSimControl | null {
  const diagnostic = diagnoseFlightSimInvocation(value)
  return diagnostic.ok ? diagnostic.value : null
}

export function diagnoseFlightSimInvocation(value: unknown): FlightSimControlDiagnostic {
  if (typeof value !== 'string') {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_MISSING_COMMAND',
      `Flight Sim invocation requires command token ${FLIGHT_SIM_INVOCATION_COMMANDS.control}.`,
      { token: FLIGHT_SIM_INVOCATION_COMMANDS.control },
    )
  }
  const invocation = value.trim()
  if (!invocation) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_MISSING_COMMAND',
      `Flight Sim invocation requires command token ${FLIGHT_SIM_INVOCATION_COMMANDS.control}.`,
      { token: FLIGHT_SIM_INVOCATION_COMMANDS.control },
    )
  }
  const tokens = invocation.split(/\s+/).filter(Boolean)
  const commandTokens = tokens.filter(token => token.startsWith('/'))
  const bindingTokens = tokens.filter(token => token.startsWith('@'))
  const semanticTokens = tokens.filter(token => token.startsWith('#'))
  if (commandTokens.length === 0) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_MISSING_COMMAND',
      `Flight Sim invocation requires command token ${FLIGHT_SIM_INVOCATION_COMMANDS.control}.`,
      { token: FLIGHT_SIM_INVOCATION_COMMANDS.control },
    )
  }
  if (commandTokens.length > 1) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL',
      'Flight Sim invocation permits exactly one command sigil.',
      { token: commandTokens[1] },
    )
  }
  if (tokens[0] !== FLIGHT_SIM_INVOCATION_COMMANDS.control) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_COMMAND_MISMATCH',
      `Flight Sim invocation command must be ${FLIGHT_SIM_INVOCATION_COMMANDS.control}.`,
      { token: commandTokens[0] || tokens[0] },
    )
  }
  if (bindingTokens.length === 0) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_MISSING_BINDING',
      `Flight Sim invocation requires binding token ${FLIGHT_SIM_INVOCATION_BINDINGS.canvas}.`,
      { token: FLIGHT_SIM_INVOCATION_BINDINGS.canvas },
    )
  }
  if (bindingTokens.length > 1) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL',
      'Flight Sim invocation permits exactly one binding sigil.',
      { token: bindingTokens[1] },
    )
  }
  if (bindingTokens[0] !== FLIGHT_SIM_INVOCATION_BINDINGS.canvas || tokens[1] !== FLIGHT_SIM_INVOCATION_BINDINGS.canvas) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_BINDING_MISMATCH',
      `Flight Sim invocation binding must be ${FLIGHT_SIM_INVOCATION_BINDINGS.canvas}.`,
      { token: bindingTokens[0] || tokens[1] },
    )
  }
  if (semanticTokens.length > 1) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_DUPLICATE_SIGIL',
      'Flight Sim invocation permits exactly one semantic sigil.',
      { token: semanticTokens[1] },
    )
  }
  if (semanticTokens.length !== 1
    || semanticTokens[0] !== FLIGHT_SIM_INVOCATION_SEMANTICS.flight
    || tokens[2] !== FLIGHT_SIM_INVOCATION_SEMANTICS.flight) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_SEMANTIC_MISMATCH',
      `Flight Sim invocation semantic must be ${FLIGHT_SIM_INVOCATION_SEMANTICS.flight}.`,
      { token: semanticTokens[0] || FLIGHT_SIM_INVOCATION_SEMANTICS.flight },
    )
  }

  const pairs: Record<string, string> = {}
  for (const token of tokens.slice(3)) {
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1 || separator !== token.lastIndexOf('=')) {
      return diagnosticFailure(
        'FLIGHT_SIM_INVOCATION_MALFORMED_PAIR',
        'Flight Sim invocation fields must use one non-empty key=value pair.',
        { token },
      )
    }
    const key = token.slice(0, separator)
    if (key !== 'operation' && key !== 'throttle') {
      return diagnosticFailure(
        'FLIGHT_SIM_INVOCATION_UNKNOWN_KEY',
        `Flight Sim invocation does not support key ${key}.`,
        { field: key, token },
      )
    }
    if (Object.hasOwn(pairs, key)) {
      return diagnosticFailure(
        'FLIGHT_SIM_INVOCATION_DUPLICATE_KEY',
        `Flight Sim invocation contains duplicate key ${key}.`,
        { field: key, token },
      )
    }
    pairs[key] = token.slice(separator + 1)
  }

  const operation = pairs.operation
  if (!isFlightSimOperation(operation)) {
    return diagnosticFailure(
      'FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION',
      `Flight Sim operation ${operation || '(missing)'} is unsupported.`,
      { field: 'operation', token: operation || 'operation' },
    )
  }
  if (operation !== 'throttle') {
    return Object.hasOwn(pairs, 'throttle')
      ? diagnosticFailure(
        'FLIGHT_SIM_CONTROL_INVALID_THROTTLE',
        `Flight Sim operation ${operation} forbids a throttle value.`,
        { field: 'throttle', token: `throttle=${pairs.throttle}` },
      )
      : diagnosticSuccess({ invocation, operation })
  }
  const throttle = parseNativeThrottle(pairs.throttle)
  return throttle === null
    ? diagnosticFailure(
      'FLIGHT_SIM_CONTROL_INVALID_THROTTLE',
      'Flight Sim throttle requires a finite decimal value from 0 through 1.',
      { field: 'throttle', token: pairs.throttle === undefined ? 'throttle' : `throttle=${pairs.throttle}` },
    )
    : diagnosticSuccess({ invocation, operation, throttle })
}

export function normalizeFlightSimControl(
  input: unknown,
): NormalizedFlightSimControl | null {
  const diagnostic = diagnoseFlightSimControl(input)
  return diagnostic.ok ? diagnostic.value : null
}

export function diagnoseFlightSimControl(input: unknown): FlightSimControlDiagnostic {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return diagnosticFailure(
      'FLIGHT_SIM_CONTROL_INVALID_INPUT',
      'Flight Sim control input must be an object.',
      { field: 'input' },
    )
  }
  const record = input as Readonly<Record<string, unknown>>
  const keys = Object.keys(record)
  if (Object.hasOwn(record, 'invocation')) {
    if (keys.length !== 1) {
      return diagnosticFailure(
        'FLIGHT_SIM_CONTROL_MIXED_INPUT',
        'Flight Sim control forbids mixing native invocation and structured fields.',
        { field: keys.find(key => key !== 'invocation') || 'invocation' },
      )
    }
    return diagnoseFlightSimInvocation(record.invocation)
  }
  const unknownKey = keys.find(key => key !== 'operation' && key !== 'throttle')
  if (unknownKey) {
    return diagnosticFailure(
      'FLIGHT_SIM_INVOCATION_UNKNOWN_KEY',
      `Flight Sim control does not support key ${unknownKey}.`,
      { field: unknownKey },
    )
  }
  if (!Object.hasOwn(record, 'operation') || !isFlightSimOperation(record.operation)) {
    return diagnosticFailure(
      'FLIGHT_SIM_CONTROL_UNSUPPORTED_OPERATION',
      `Flight Sim operation ${String(record.operation || '(missing)')} is unsupported.`,
      { field: 'operation', token: String(record.operation || 'operation') },
    )
  }
  if (record.operation === 'throttle') {
    if (keys.length !== 2 || !Object.hasOwn(record, 'throttle') || !isThrottle(record.throttle)) {
      return diagnosticFailure(
        'FLIGHT_SIM_CONTROL_INVALID_THROTTLE',
        'Flight Sim throttle requires a finite value from 0 through 1.',
        { field: 'throttle', token: String(record.throttle ?? 'throttle') },
      )
    }
    return diagnosticSuccess({ invocation: '', operation: record.operation, throttle: record.throttle })
  }
  return keys.length === 1
    ? diagnosticSuccess({ invocation: '', operation: record.operation })
    : diagnosticFailure(
      'FLIGHT_SIM_CONTROL_INVALID_THROTTLE',
      `Flight Sim operation ${record.operation} forbids a throttle value.`,
      { field: 'throttle', token: String(record.throttle ?? 'throttle') },
    )
}

const buildInvocationGrammar = (): Record<FlightSimOperation, string> => Object.fromEntries(
  FLIGHT_SIM_CONTROL_OPERATIONS.map(operation => [
    operation,
    buildFlightSimInvocation(operation as FlightSimOperation, operation === 'throttle' ? 0.5 : undefined),
  ]),
) as Record<FlightSimOperation, string>

export function inspectLocalFlightSim() {
  const flightSim = readFlightSimSnapshot()
  return {
    schema: FLIGHT_SIM_MCP_SCHEMA,
    webMcpTools: {
      inspect: `knowgrph.${FLIGHT_SIM_WEB_MCP_TOOL_IDS.inspect}`,
      control: `knowgrph.${FLIGHT_SIM_WEB_MCP_TOOL_IDS.control}`,
    },
    invocationGrammar: buildInvocationGrammar(),
    flightSim,
    training: readFlightSimTrainingSnapshot(),
    decisions: {
      ...readFlightSimDecisionStore(),
      path: FLIGHT_SIM_SAVE_PATH,
    },
    runtime: {
      webglSupported: flightSim.webglSupported,
      rendererOwner: 'existing-r3f-canvas',
      sceneOwner: 'authored-xr-terrain',
      simulationOwner: 'native-agentic-ecs',
      persistenceOwner: 'browser-local-workspace-fs',
      assetOwner: 'in-repo-typescript-json-spec',
      collision: 'authored-terrain-aabb',
      controls: ['desktop', 'pointer', 'touch', 'gamepad', 'motion-control', 'mcp'],
      runtimeNetworkCalls: 0,
      runtimeModelCalls: 0,
    },
  }
}

const controlResult = (
  ok: boolean,
  message: string,
  operation?: FlightSimOperation,
  failure?: FlightSimControlFailure,
) => ({
  ok,
  message,
  ...(operation ? { operation } : {}),
  ...(!ok
    ? {
      errorCode: failure?.errorCode || 'FLIGHT_SIM_OPERATION_REJECTED',
      ...(failure?.field ? { field: failure.field } : {}),
      ...(failure?.token ? { token: failure.token } : {}),
    }
    : {}),
  flight: inspectLocalFlightSim(),
})

const runtimeFailureMessage = (
  snapshot: ReturnType<typeof readFlightSimSnapshot>,
  fallback: string,
): string => String(snapshot.runtimeError || fallback)

const isFlightSimControlCurrent = (
  fence?: FlightSimControlExecutionFence,
): boolean => !fence || (!fence.signal.aborted && fence.isCurrent())

export async function controlLocalFlightSim(
  input: unknown,
  fence?: FlightSimControlExecutionFence,
) {
  const diagnostic = diagnoseFlightSimControl(input)
  if (diagnostic.ok === false) {
    return controlResult(
      false,
      diagnostic.message,
      undefined,
      diagnostic,
    )
  }
  const control = diagnostic.value
  const cancelled = () => controlResult(
    false,
    'Flight Sim control was cancelled before its mutation could commit.',
    control.operation,
  )
  if (!isFlightSimControlCurrent(fence)) return cancelled()

  const before = readFlightSimSnapshot()
  if (control.operation === 'open') {
    if (before.active) {
      return controlResult(false, 'Open requires an inactive Flight Sim surface.', control.operation)
    }
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const opened = await openFlightSimSurface(fence ? { signal: fence.signal } : {})
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const ok = opened.active && opened.phase === 'stopped' && opened.webglSupported && !opened.runtimeError
    return controlResult(
      ok,
      ok ? 'Flight Sim opened on the authored XR surface.' : runtimeFailureMessage(opened, 'Flight Sim could not open.'),
      control.operation,
    )
  }
  if (control.operation === 'start') {
    if (!before.active || before.phase !== 'stopped') {
      return controlResult(false, 'Start requires an open, stopped Flight Sim.', control.operation)
    }
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const started = startFlightSim()
    const ok = (started.phase === 'ready' || started.phase === 'flying') && !started.runtimeError
    let message = 'Flight Sim resumed its retained in-memory flight.'
    if (!ok) message = runtimeFailureMessage(started, 'Flight Sim could not start.')
    else if (started.phase === 'ready') {
      message = 'Flight Sim is ready at its retained in-memory tick and waiting for input.'
    }
    return controlResult(
      ok,
      message,
      control.operation,
    )
  }
  if (control.operation === 'stop') {
    if (!before.active || (before.phase !== 'ready' && before.phase !== 'flying')) {
      return controlResult(false, 'Stop requires a ready or flying Flight Sim mission.', control.operation)
    }
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const stopped = stopFlightSim()
    const ok = stopped.active && stopped.phase === 'stopped' && !stopped.runtimeError
    return controlResult(
      ok,
      ok ? 'Flight Sim stopped with its in-memory state retained.' : runtimeFailureMessage(stopped, 'Flight Sim could not stop.'),
      control.operation,
    )
  }
  if (control.operation === 'restart') {
    if (!before.active) {
      return controlResult(false, 'Restart requires an open Flight Sim surface.', control.operation)
    }
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const restarted = restartFlightSim()
    const ok = restarted.phase === 'ready' && !restarted.runtimeError
    return controlResult(
      ok,
      ok ? 'Flight Sim restarted at a fresh tick-zero state.' : runtimeFailureMessage(restarted, 'Flight Sim could not restart.'),
      control.operation,
    )
  }
  if (control.operation === 'throttle') {
    if (!before.active || (before.phase !== 'ready' && before.phase !== 'flying') || control.throttle === undefined) {
      return controlResult(false, 'Throttle requires a ready or flying Flight Sim mission and a finite value from 0 through 1.', control.operation)
    }
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const throttled = setFlightSimThrottle(control.throttle)
    const ok = (throttled.phase === 'ready' || throttled.phase === 'flying') && !throttled.runtimeError
    return controlResult(
      ok,
      ok ? `Flight Sim throttle target set to ${control.throttle}.` : runtimeFailureMessage(throttled, 'Flight Sim throttle was rejected.'),
      control.operation,
    )
  }
  const missionSelection: Partial<Record<FlightSimOperation, FlightSimTrainingMissionId>> = {
    'mission-foundation': 'circuit-foundation',
    'mission-night': 'night-circuit',
    'mission-systems': 'systems-recovery',
  }
  const selectedMission = missionSelection[control.operation]
  if (selectedMission) {
    if (before.phase === 'ready' || before.phase === 'flying') {
      return controlResult(
        false,
        'Training mission selection requires a stopped or inactive Flight Sim.',
        control.operation,
      )
    }
    selectFlightSimTrainingMission(selectedMission)
    return controlResult(true, `Flight training mission selected: ${selectedMission}.`, control.operation)
  }
  const failureSelection: Partial<Record<FlightSimOperation, FlightSimTrainingFailureId>> = {
    'failure-none': 'none',
    'failure-engine': 'engine-power-loss',
    'failure-instruments': 'instrument-uncertainty',
    'failure-controls': 'control-bias',
  }
  const selectedFailure = failureSelection[control.operation]
  if (selectedFailure) {
    if (before.phase === 'ready' || before.phase === 'flying') {
      return controlResult(
        false,
        'Practice failure selection requires a stopped or inactive Flight Sim.',
        control.operation,
      )
    }
    selectFlightSimTrainingFailure(selectedFailure)
    return controlResult(true, `Flight training failure selected: ${selectedFailure}.`, control.operation)
  }
  if (control.operation === 'voice-on' || control.operation === 'voice-off') {
    const enabled = control.operation === 'voice-on'
    const spoken = enableFlightSimVoiceInstructor(enabled)
    return controlResult(
      true,
      enabled && !spoken
        ? 'Voice instructor enabled with text coaching fallback on this browser.'
        : `Voice instructor ${enabled ? 'enabled' : 'disabled'}.`,
      control.operation,
    )
  }
  if (control.operation === 'coach') {
    const spoken = speakFlightSimTrainingCue()
    return controlResult(
      true,
      spoken
        ? 'Current Flight training coaching cue spoken.'
        : `Current Flight training coaching cue: ${readFlightSimTrainingSnapshot().coachingCue}`,
      control.operation,
    )
  }
  if (control.operation === 'save') {
    if (before.phase !== 'completed' && before.phase !== 'crashed') {
      return controlResult(false, 'Save requires a completed or crashed Flight Sim mission.', control.operation)
    }
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const outcome = buildFlightSimTrainingOutcomeDecision(before)
    if (outcome) queueFlightSimDecisions([outcome])
    const saved = await persistFlightSimPendingDecisions(
      fence ? { signal: fence.signal } : {},
    )
    if (!isFlightSimControlCurrent(fence)) return cancelled()
    const ok = saved.status === 'saved'
    return controlResult(
      ok,
      ok ? 'Validated Flight Sim Decisions saved locally.' : saved.error || 'Flight Sim Decision save failed.',
      control.operation,
    )
  }
  if (!before.active) {
    return controlResult(false, 'Exit requires an open Flight Sim surface.', control.operation)
  }
  if (!isFlightSimControlCurrent(fence)) return cancelled()
  exitFlightSim()
  const exited = await waitForFlightSimSurfaceRestoration()
  if (!isFlightSimControlCurrent(fence)) return cancelled()
  const ok = !exited.active && exited.phase === 'stopped'
  return controlResult(
    ok,
    ok ? 'Flight Sim exited and restored the previous Canvas surface.' : runtimeFailureMessage(exited, 'Flight Sim could not exit.'),
    control.operation,
  )
}
