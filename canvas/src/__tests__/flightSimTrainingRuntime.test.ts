import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { flightSimDefaultRuntime } from '@/features/game-flight-sim/flightSimDefaultRuntime'
import { controlLocalFlightSim } from '@/features/game-flight-sim/flightSimMcpRuntime'
import { resetFlightSimRuntimeForTests, openFlightSimSurface, readFlightSimSnapshot, startFlightSim } from '@/features/game-flight-sim/flightSimRuntime'
import { useGraphStore } from '@/hooks/useGraphStore'
import { validateFlightSimTrainingProfile } from '@/features/game-flight-sim/flightSimTrainingProfile'
import { captureFlightSimTrainingSource, admitCapturedFlightSimTrainingSource } from '@/features/game-flight-sim/flightSimTrainingSource'
import { admitFlightSimTrainingProfile } from '@/features/game-flight-sim/flightSimTrainingScenario'
import { buildFlightSimTrainingOutcomeDecision, resetFlightSimTrainingRuntimeForTests } from '@/features/game-flight-sim/flightSimTrainingRuntime'
import {
  FLIGHT_SIM_NEUTRAL_INPUT,
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  validateFlightSimDecisions,
} from '@/features/game-flight-sim/flightSimModel'
import {
  createFlightSimTrainingOutcomeDecision,
  readFlightSimTrainingSnapshot,
} from '@/features/game-flight-sim/flightSimTrainingRuntime'
import {
  applyFlightSimTrainingTickModifiers,
  isFlightSimTrainingAirspeedReliable,
  readFlightSimTrainingScenario,
  resetFlightSimTrainingScenarioForTests,
  resolveFlightSimTrainingMission,
  selectFlightSimTrainingFailure,
  selectFlightSimTrainingMission,
  subscribeFlightSimTrainingScenario,
} from '@/features/game-flight-sim/flightSimTrainingScenario'

const seedSource = readFileSync(new URL('../../../docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md', import.meta.url), 'utf8')
const seedProfile = parseMarkdownFrontmatter(splitMarkdownLines(seedSource)).meta.flight_training_profile
const profile = validateFlightSimTrainingProfile(seedProfile)
test.beforeEach(() => {
  resetFlightSimTrainingScenarioForTests()
  resetFlightSimTrainingRuntimeForTests()
  admitFlightSimTrainingProfile(profile, 'authored-test-source', 'stopped')
})

const activeFlight = Object.freeze({
  active: true,
  phase: 'flying' as const,
  tick: 240,
  aircraft: Object.freeze({
    throttle: 0.8,
  }),
})

test.afterEach(() => resetFlightSimTrainingScenarioForTests())

test('geography is admitted from the exact source; absent geography preserves only the local kernel', async () => {
  const previous = useGraphStore.getState()
  const name = '/imports/geographic-reference.md'
  const setSource = (text: string, revision = 1) => useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: text, sourceFiles: [{ id: 'geo-source', name, text, enabled: true, status: 'parsed', parsedGraphRevision: revision, source: { kind: 'local', path: name } }] } as never)
  let reads = 0
  const workspace = { readFileText: async () => { reads += 1; return null } } as never
  try {
    resetFlightSimRuntimeForTests()
    setSource('# Local kernel without geographic projection')
    const absent = captureFlightSimTrainingSource()
    assert.equal(absent.geographicReference, null)
    const denied = await openFlightSimSurface({ webglSupported: true, geospatialComposite: true, workspace })
    assert.equal(denied.active, false)
    assert.match(denied.runtimeError || '', /authored geographic reference/)
    assert.equal(reads, 0)
    resetFlightSimRuntimeForTests()
    const local = await openFlightSimSurface({ webglSupported: true, workspace })
    assert.equal(local.active, true)
    assert.equal(readFlightSimTrainingScenario().geographicReference, null)
    resetFlightSimRuntimeForTests()
    setSource(seedSource)
    const capture = captureFlightSimTrainingSource()
    admitCapturedFlightSimTrainingSource(capture, 'stopped')
    assert.deepEqual(readFlightSimTrainingScenario().geographicReference, capture.geographicReference)
    assert.ok(Object.isFrozen(capture.geographicReference))
    const before = readFlightSimTrainingScenario()
    assert.throws(() => admitCapturedFlightSimTrainingSource({ ...capture, geographicReference: null }, 'ready'), /active run/)
    assert.equal(readFlightSimTrainingScenario(), before)
    const invalidGeographySource = seedSource.replace(/anchor:\s*\[[^\]]+\]/u, 'anchor: [0, 90]')
    assert.notEqual(invalidGeographySource, seedSource)
    setSource(invalidGeographySource, 2)
    reads = 0
    const malformed = await openFlightSimSurface({ webglSupported: true, geospatialComposite: true, workspace })
    assert.equal(malformed.active, false)
    assert.equal(reads, 0)
    assert.equal(readFlightSimTrainingScenario(), before)
    setSource(seedSource, 3)
    assert.throws(() => admitCapturedFlightSimTrainingSource(capture, 'stopped'), /source changed before admission/)
    assert.equal(readFlightSimTrainingScenario(), before)
  } finally {
    resetFlightSimRuntimeForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})

test('training missions own deterministic terrain, lighting, and default failures', () => {
  selectFlightSimTrainingMission('night-circuit')
  assert.equal(readFlightSimTrainingScenario().missionId, 'night-circuit')
  assert.equal(readFlightSimTrainingScenario().failureId, 'instrument-uncertainty')
  assert.equal(readFlightSimTrainingScenario().profile, profile)
  assert.equal(resolveFlightSimTrainingMission()!.night, true)
  assert.match(resolveFlightSimTrainingMission()!.terrain, /night/i)

  selectFlightSimTrainingMission('systems-recovery')
  assert.equal(readFlightSimTrainingScenario().failureId, 'engine-power-loss')
  assert.match(resolveFlightSimTrainingMission()!.objective, /recover/i)
})

test('practice failures are bounded and modify only the captured training tick', () => {
  selectFlightSimTrainingFailure('engine-power-loss')
  const engineLoss = applyFlightSimTrainingTickModifiers({
    flight: activeFlight,
    input: FLIGHT_SIM_NEUTRAL_INPUT,
    throttleSetpoint: 0.9,
  })
  assert.equal(engineLoss.throttleSetpoint, 0.28)
  assert.equal(engineLoss.input.throttleDelta, -0.7)
  const firstFailureTick = applyFlightSimTrainingTickModifiers({
    flight: { ...activeFlight, tick: 179 },
    input: FLIGHT_SIM_NEUTRAL_INPUT,
    throttleSetpoint: 0.9,
  })
  assert.equal(firstFailureTick.throttleSetpoint, 0.28)

  selectFlightSimTrainingFailure('control-bias')
  const biased = applyFlightSimTrainingTickModifiers({
    flight: activeFlight,
    input: FLIGHT_SIM_NEUTRAL_INPUT,
    throttleSetpoint: null,
  })
  assert.equal(biased.input.roll, 0.22)
  assert.equal(biased.input.yaw, -0.14)

  const afterWindow = applyFlightSimTrainingTickModifiers({
    flight: { ...activeFlight, tick: 419 },
    input: FLIGHT_SIM_NEUTRAL_INPUT,
    throttleSetpoint: 0.9,
  })
  assert.equal(afterWindow.throttleSetpoint, 0.9)
  assert.deepEqual(afterWindow.input, FLIGHT_SIM_NEUTRAL_INPUT)
})

test('instrument uncertainty marks airspeed unreliable only during the drill window', () => {
  selectFlightSimTrainingFailure('instrument-uncertainty')
  assert.equal(isFlightSimTrainingAirspeedReliable(activeFlight), false)
  assert.equal(
    isFlightSimTrainingAirspeedReliable({ ...activeFlight, tick: 179 }),
    true,
  )
  assert.equal(
    isFlightSimTrainingAirspeedReliable({ ...activeFlight, tick: 420 }),
    true,
  )
})

test('terminal training produces one admitted scored debrief Decision', () => {
  const training = Object.freeze({
    ...readFlightSimTrainingSnapshot(),
    phase: 'completed' as const,
    score: 86,
    grade: 'B' as const,
    routeProgress: 100,
    stabilityPercent: 88,
    energyPercent: 81,
  })
  const outcome = createFlightSimTrainingOutcomeDecision({
    runId: 7,
    phase: 'completed',
    tick: 240,
  }, training)
  assert.equal(outcome.payload.schema, 'agentic-graph-flight-training-outcome/v1')
  assert.equal(outcome.payload.grade, 'B')
  assert.deepEqual(validateFlightSimDecisions([outcome]), [outcome])
})

test('profile validator rejects malformed authored data without publishing any state', () => {
  const withoutAliases = structuredClone(seedProfile) as Record<string, unknown>
  delete withoutAliases.controlAliases
  const optionalAliases = validateFlightSimTrainingProfile(withoutAliases).controlAliases
  assert.deepEqual(Object.keys(optionalAliases), [])
  assert.ok(Object.isFrozen(optionalAliases))
  const invalid: Array<(copy: any) => void> = [
    copy => { copy.schema = 'unsupported' },
    copy => { copy.unknown = true },
    copy => { copy.defaultMissionId = 'missing' },
    copy => { copy.missions[0].label = '' },
    copy => { copy.missions[0].objective = 12 },
    copy => { copy.missions[0].terrain = '' },
    copy => { copy.missions[0].night = 'true' },
    copy => { copy.missions[0].systemsChecklist = [] },
    copy => { copy.missions[0].targetSpeedMetersPerSecond = [22, 8] },
    copy => { copy.missions[0].targetSpeedMetersPerSecond = [0, Infinity] },
    copy => { copy.missions[0].defaultFailureId = 'missing' },
    copy => { copy.missions[1].id = copy.missions[0].id },
    copy => { copy.failures[1].id = copy.failures[0].id },
    copy => { copy.failures[1].effect.kind = 'unknown' },
    copy => { copy.failures[1].effect.maxThrottle = 2 },
    copy => { copy.failures[2].effect.roll = 0.1 },
    copy => { copy.failures[3].effect.yaw = NaN },
    copy => { copy.failures[1].coachingCue = 42 },
    copy => { copy.failureWindow.endTickExclusive = copy.failureWindow.startTick },
    copy => { copy.failureWindow.startTick = 1.5 },
    copy => { copy.recoveryThrottleMinimum = -1 },
    copy => { copy.controlAliases = null },
    copy => { copy.controlAliases.open = { kind: 'mission', id: copy.defaultMissionId } },
    copy => { copy.controlAliases['authored-alias'] = { kind: 'mission', id: 'missing' } },
  ]
  const before = readFlightSimTrainingScenario()
  for (const mutate of invalid) {
    const copy = structuredClone(seedProfile)
    mutate(copy)
    assert.throws(() => validateFlightSimTrainingProfile(copy), /Flight training profile/)
    assert.equal(readFlightSimTrainingScenario(), before)
  }
})

test('training kernel consumes renamed authored IDs, parameters, and failure window', () => {
  const copy: any = structuredClone(seedProfile)
  copy.defaultMissionId = 'authored-a'
  copy.missions[0].id = 'authored-a'
  copy.missions[0].defaultFailureId = 'authored-f'
  copy.failures[1].id = 'authored-f'
  copy.missions[2].defaultFailureId = 'authored-f'
  copy.failureWindow = { startTick: 2, endTickExclusive: 4 }
  copy.failures[1].effect.maxThrottle = 0.4
  copy.controlAliases = { 'authored-choose': { kind: 'mission', id: 'authored-a' } }
  admitFlightSimTrainingProfile(validateFlightSimTrainingProfile(copy), 'renamed-source', 'stopped')
  assert.equal(readFlightSimTrainingScenario().missionId, 'authored-a')
  const outcome = createFlightSimTrainingOutcomeDecision({ runId: 8, phase: 'completed', tick: 5 }, { ...readFlightSimTrainingSnapshot(), phase: 'completed' })
  assert.equal(outcome.payload.missionId, 'authored-a')
  assert.deepEqual(validateFlightSimDecisions([outcome]), [outcome])
  const request = { flight: { ...activeFlight, tick: 1 }, input: FLIGHT_SIM_NEUTRAL_INPUT, throttleSetpoint: 0.9 }
  assert.equal(applyFlightSimTrainingTickModifiers(request).throttleSetpoint, 0.4)
  assert.equal(applyFlightSimTrainingTickModifiers({ ...request, flight: { ...activeFlight, tick: 3 } }).throttleSetpoint, 0.9)
})

test('exact source admission rejects a changed SourceFile and an active replacement atomically', () => {
  const previous = useGraphStore.getState()
  const name = '/imports/authored-training.md'
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: seedSource, sourceFiles: [{ id: 'profile-source', name, text: seedSource, enabled: true, status: 'parsed', parsedGraphRevision: 1, source: { kind: 'local', path: name } }] } as never)
  try {
    const capture = captureFlightSimTrainingSource()
    const before = readFlightSimTrainingScenario()
    useGraphStore.setState(state => ({ sourceFiles: state.sourceFiles.map(file => ({ ...file, parsedGraphRevision: 2 })) }))
    assert.throws(() => admitCapturedFlightSimTrainingSource(capture, 'stopped'), /source changed before admission/)
    assert.equal(readFlightSimTrainingScenario(), before)
    const current = captureFlightSimTrainingSource()
    for (const phase of ['ready', 'flying', 'completed', 'crashed'] as const) {
      assert.throws(() => admitCapturedFlightSimTrainingSource(current, phase), /active run/)
      assert.equal(readFlightSimTrainingScenario(), before)
    }
    useGraphStore.setState({ sourceFiles: [] })
    assert.throws(() => captureFlightSimTrainingSource(), /exact enabled, parsed active SourceFile/)
    assert.equal(readFlightSimTrainingScenario(), before)
  } finally {
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})

test('absent profile is explicitly unavailable and injects or saves no training data', () => {
  resetFlightSimTrainingScenarioForTests()
  const training = readFlightSimTrainingSnapshot()
  assert.equal(training.available, false)
  assert.equal(training.missionId, '')
  assert.equal(training.failureId, '')
  assert.equal(training.score, 0)
  assert.equal(training.envelope.targetSpeedMetersPerSecond, null)
  assert.match(training.coachingCue, /unavailable/i)
  assert.throws(() => selectFlightSimTrainingMission('missing'), /unavailable or unsupported/)
  assert.deepEqual(applyFlightSimTrainingTickModifiers({ flight: activeFlight, input: FLIGHT_SIM_NEUTRAL_INPUT, throttleSetpoint: 0.9 }), { input: FLIGHT_SIM_NEUTRAL_INPUT, throttleSetpoint: 0.9 })
  assert.equal(buildFlightSimTrainingOutcomeDecision(), null)
})

test('same mission ID on another admitted profile resets measured outcomes', async () => {
  resetFlightSimRuntimeForTests()
  const first: any = structuredClone(seedProfile)
  first.missions[0].targetSpeedMetersPerSecond = [100, 200]
  admitFlightSimTrainingProfile(validateFlightSimTrainingProfile(first), 'first-profile', 'stopped')
  flightSimDefaultRuntime.open(true)
  flightSimDefaultRuntime.start()
  readFlightSimTrainingSnapshot()
  flightSimDefaultRuntime.setInput({ pitch: 0.05 })
  await flightSimDefaultRuntime.advanceBy(1 / 60)
  assert.equal(readFlightSimTrainingSnapshot().energyPercent, 0)
  flightSimDefaultRuntime.stop()
  const second: any = structuredClone(seedProfile)
  second.missions[0].targetSpeedMetersPerSecond = [0, 500]
  admitFlightSimTrainingProfile(validateFlightSimTrainingProfile(second), 'second-profile', 'stopped')
  const reset = readFlightSimTrainingSnapshot()
  assert.equal(reset.missionId, first.defaultMissionId)
  assert.equal(reset.energyPercent, 100)
  assert.equal(reset.failureRecovered, false)
  resetFlightSimRuntimeForTests()
})

test('a source change during async entry or synchronous publication leaves admission unchanged', async () => {
  resetFlightSimRuntimeForTests()
  const previous = useGraphStore.getState()
  const name = '/imports/race-profile.md'
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: seedSource, sourceFiles: [{ id: 'race-source', name, text: seedSource, enabled: true, status: 'parsed', parsedGraphRevision: 1, source: { kind: 'local', path: name } }] } as never)
  let releaseRead!: () => void
  let signalStarted!: () => void
  const started = new Promise<void>(resolve => { signalStarted = resolve })
  const allowed = new Promise<void>(resolve => { releaseRead = resolve })
  const before = readFlightSimTrainingScenario()
  try {
    const opening = openFlightSimSurface({ webglSupported: true, workspace: { readFileText: async () => { signalStarted(); await allowed; return null } } as never })
    await started
    useGraphStore.setState(state => ({ sourceFiles: state.sourceFiles.map(file => ({ ...file, parsedGraphRevision: 2 })) }))
    releaseRead()
    const rejected = await opening
    assert.equal(rejected.active, false)
    assert.equal(rejected.runId, 0)
    assert.match(rejected.runtimeError || '', /source changed before admission/)
    assert.equal(readFlightSimTrainingScenario(), before)
    const capture = captureFlightSimTrainingSource()
    let changed = false
    const unsubscribe = subscribeFlightSimTrainingScenario(() => {
      if (!changed) { changed = true; useGraphStore.setState(state => ({ sourceFiles: state.sourceFiles.map(file => ({ ...file, parsedGraphRevision: 3 })) })) }
    })
    try {
      assert.throws(() => admitCapturedFlightSimTrainingSource(capture, 'stopped'), /admission is no longer current during profile publication/)
      assert.equal(readFlightSimTrainingScenario(), before)
      assert.equal(readFlightSimSnapshot().runId, 0)
    } finally { unsubscribe() }
  } finally {
    releaseRead()
    resetFlightSimRuntimeForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})

test('a control fence cancelled by a subscriber rolls back profile admission and selection', async () => {
  resetFlightSimRuntimeForTests()
  const previous = useGraphStore.getState()
  const name = '/imports/cancel-profile.md'
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: seedSource, sourceFiles: [{ id: 'cancel-source', name, text: seedSource, enabled: true, status: 'parsed', parsedGraphRevision: 1, source: { kind: 'local', path: name } }] } as never)
  try {
    for (const initiallyConfigured of [false, true]) {
      resetFlightSimTrainingScenarioForTests()
      if (initiallyConfigured) admitFlightSimTrainingProfile(profile, 'retained-profile', 'stopped')
      const before = readFlightSimTrainingScenario()
      const controller = new AbortController()
      const unsubscribe = subscribeFlightSimTrainingScenario(() => { controller.abort() })
      try {
        const result = await controlLocalFlightSim({ operation: 'mission', missionId: profile.missions[1].id }, { signal: controller.signal, generation: 1, isCurrent: () => !controller.signal.aborted })
        assert.equal(result.ok, false)
        assert.equal(controller.signal.aborted, true)
        assert.equal(readFlightSimTrainingScenario(), before)
        assert.equal(readFlightSimSnapshot().runId, 0)
      } finally { unsubscribe() }
    }
  } finally {
    resetFlightSimRuntimeForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})


test('already-admitted mission and failure selections roll back cancellation, drift, and subscriber errors', async () => {
  resetFlightSimRuntimeForTests()
  const previous = useGraphStore.getState()
  const name = '/imports/selection-race.md'
  const setSource = () => useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: seedSource, sourceFiles: [{ id: 'selection-source', name, text: seedSource, enabled: true, status: 'parsed', parsedGraphRevision: 1, source: { kind: 'local', path: name } }] } as never)
  try {
    setSource()
    admitCapturedFlightSimTrainingSource(captureFlightSimTrainingSource(), 'stopped')
    flightSimDefaultRuntime.open(true)
    await startFlightSim()
    flightSimDefaultRuntime.stop()
    assert.ok(readFlightSimTrainingScenario().runBinding)
    for (const operation of ['mission', 'failure'] as const) {
      for (const fault of ['abort', 'drift', 'throw'] as const) {
        setSource()
        const before = readFlightSimTrainingScenario()
        const controller = new AbortController()
        const notifications: unknown[] = []
        const unsubscribe = subscribeFlightSimTrainingScenario(() => {
          const current = readFlightSimTrainingScenario()
          notifications.push(current)
          if (current === before) return
          if (fault === 'abort') controller.abort()
          else if (fault === 'throw') throw new Error('selection subscriber failed')
          else useGraphStore.setState(state => ({ sourceFiles: state.sourceFiles.map(file => ({ ...file, parsedGraphRevision: 2 })) }))
        })
        try {
          const input = operation === 'mission' ? { operation, missionId: profile.missions[1].id } : { operation, failureId: profile.failures[1].id }
          const result = await controlLocalFlightSim(input, { signal: controller.signal, generation: 1, isCurrent: () => !controller.signal.aborted })
          assert.equal(result.ok, false)
          assert.match(result.message, fault === 'throw' ? /selection subscriber failed/ : /no longer current during selection publication/)
          assert.equal(readFlightSimTrainingScenario(), before)
          assert.equal(readFlightSimTrainingScenario().runBinding, before.runBinding)
          assert.equal(readFlightSimTrainingScenario().geographicReference, before.geographicReference)
          assert.equal(readFlightSimTrainingScenario().sourceKey, before.sourceKey)
          assert.equal(readFlightSimTrainingScenario().revision, before.revision)
          assert.equal(notifications.length, 2)
          assert.equal(notifications[1], before)
        } finally { unsubscribe() }
      }
    }
    setSource()
    let notifications = 0
    const unsubscribe = subscribeFlightSimTrainingScenario(() => { notifications += 1 })
    try {
      selectFlightSimTrainingMission(profile.missions[1].id)
      selectFlightSimTrainingFailure(profile.failures[2].id)
      assert.equal(notifications, 2, 'ordinary selection without an execution guard publishes once per change')
      assert.equal(readFlightSimTrainingScenario().missionId, profile.missions[1].id)
      assert.equal(readFlightSimTrainingScenario().failureId, profile.failures[2].id)
    } finally { unsubscribe() }
  } finally {
    resetFlightSimRuntimeForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})

test('terminal controls retain the governing profile and selection until explicit Restart', async () => {
  const previous = useGraphStore.getState()
  const name = '/imports/terminal-profile.md'
  const setSource = (text: string, revision: number) => useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: text, sourceFiles: [{ id: 'terminal-source', name, text, enabled: true, status: 'parsed', parsedGraphRevision: revision, source: { kind: 'local', path: name } }] } as never)
  try {
    for (const phase of ['completed', 'crashed'] as const) {
      resetFlightSimRuntimeForTests()
      setSource(seedSource, 1)
      admitCapturedFlightSimTrainingSource(captureFlightSimTrainingSource(), 'stopped')
      const spatial = flightSimDefaultRuntime.profile()
      const objective = (id: string) => Object.freeze({ id, position: spatial.spawn.position, radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS })
      flightSimDefaultRuntime.setProfile(Object.freeze({ ...spatial, sourceKey: `terminal-${phase}`, blockers: phase === 'crashed' ? [Object.freeze({ id: 'terminal-collision', center: spatial.spawn.position, halfSize: [10, 10, 10] as const })] : [], waypoints: spatial.waypoints.map(point => objective(point.id)), landingPad: objective(spatial.landingPad.id) }))
      flightSimDefaultRuntime.open(true)
      await startFlightSim()
      flightSimDefaultRuntime.setInput({ pitch: 0.05 })
      const terminal = await flightSimDefaultRuntime.advanceBy(4 / 60)
      assert.equal(terminal.phase, phase)
      const before = readFlightSimTrainingScenario()
      for (const input of [{ operation: 'mission', missionId: profile.missions[1].id }, { operation: 'failure', failureId: profile.failures[1].id }]) {
        assert.equal((await controlLocalFlightSim(input)).ok, false)
        assert.equal(readFlightSimTrainingScenario(), before)
      }
      flightSimDefaultRuntime.stop()
      assert.equal((await controlLocalFlightSim({ operation: 'failure', failureId: profile.failures[1].id })).ok, true)
      assert.equal((await controlLocalFlightSim({ operation: 'start' })).ok, false)
      assert.match(readFlightSimSnapshot().runtimeError || '', /Restart is required/)
      assert.equal(readFlightSimSnapshot().runId, terminal.runId)
      await controlLocalFlightSim({ operation: 'restart' })
      const retained = readFlightSimTrainingScenario()
      const currentRunId = readFlightSimSnapshot().runId
      // Return the fresh run to a terminal phase before testing changed-source reopen.
      flightSimDefaultRuntime.setInput({ pitch: 0.05 })
      await flightSimDefaultRuntime.advanceBy(4 / 60)
      setSource(seedSource.replace('targetSpeedMetersPerSecond: [8, 22]', 'targetSpeedMetersPerSecond: [0, 80]'), 2)
      const blocked = await openFlightSimSurface({ webglSupported: true })
      assert.match(blocked.runtimeError || '', /active run/)
      assert.equal(blocked.runId, currentRunId)
      assert.equal(readFlightSimTrainingScenario(), retained)
      assert.equal((await controlLocalFlightSim({ operation: 'restart' })).ok, true)
      assert.ok(readFlightSimSnapshot().runId > terminal.runId)
      assert.deepEqual(readFlightSimTrainingScenario().profile!.missions[0].targetSpeedMetersPerSecond, [0, 80])
    }
  } finally {
    resetFlightSimRuntimeForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})


test('paused runs resume unchanged and changed mission or failure requires Restart', async () => {
  resetFlightSimRuntimeForTests()
  const previous = useGraphStore.getState()
  const name = '/imports/paused-profile.md'
  useGraphStore.setState({ markdownDocumentName: name, markdownDocumentText: seedSource, sourceFiles: [{ id: 'paused-source', name, text: seedSource, enabled: true, status: 'parsed', parsedGraphRevision: 1, source: { kind: 'local', path: name } }] } as never)
  try {
    await openFlightSimSurface({ webglSupported: true })
    assert.equal((await controlLocalFlightSim({ operation: 'start' })).ok, true)
    const firstRunId = readFlightSimSnapshot().runId
    assert.equal((await controlLocalFlightSim({ operation: 'stop' })).ok, true)
    assert.equal((await controlLocalFlightSim({ operation: 'start' })).ok, true)
    assert.equal(readFlightSimSnapshot().runId, firstRunId)
    for (const input of [{ operation: 'mission', missionId: profile.missions[1].id }, { operation: 'failure', failureId: profile.failures[1].id }]) {
      assert.equal((await controlLocalFlightSim({ operation: 'stop' })).ok, true)
      const runId = readFlightSimSnapshot().runId
      assert.equal((await controlLocalFlightSim(input)).ok, true)
      assert.equal((await controlLocalFlightSim({ operation: 'start' })).ok, false)
      assert.match(readFlightSimSnapshot().runtimeError || '', /Restart is required/)
      assert.equal(readFlightSimSnapshot().runId, runId)
      assert.equal((await controlLocalFlightSim({ operation: 'restart' })).ok, true)
      assert.ok(readFlightSimSnapshot().runId > runId)
      assert.equal(readFlightSimTrainingScenario().runBinding!.runId, readFlightSimSnapshot().runId)
    }
  } finally {
    resetFlightSimRuntimeForTests()
    useGraphStore.setState({ markdownDocumentName: previous.markdownDocumentName, markdownDocumentText: previous.markdownDocumentText, sourceFiles: previous.sourceFiles })
  }
})
