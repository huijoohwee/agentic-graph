import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FLIGHT_SIM_NEUTRAL_INPUT,
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
} from '@/features/game-flight-sim/flightSimTrainingScenario'

const activeFlight = Object.freeze({
  active: true,
  phase: 'flying' as const,
  tick: 240,
  aircraft: Object.freeze({
    throttle: 0.8,
  }),
})

test.afterEach(() => resetFlightSimTrainingScenarioForTests())

test('training missions own deterministic terrain, lighting, and default failures', () => {
  selectFlightSimTrainingMission('night-circuit')
  assert.deepEqual(readFlightSimTrainingScenario(), {
    missionId: 'night-circuit',
    failureId: 'instrument-uncertainty',
    voiceEnabled: false,
    revision: 1,
  })
  assert.equal(resolveFlightSimTrainingMission().night, true)
  assert.match(resolveFlightSimTrainingMission().terrain, /night/i)

  selectFlightSimTrainingMission('systems-recovery')
  assert.equal(readFlightSimTrainingScenario().failureId, 'engine-power-loss')
  assert.match(resolveFlightSimTrainingMission().objective, /recover/i)
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
  assert.equal(outcome.payload.schema, 'knowgrph-flight-training-outcome/v1')
  assert.equal(outcome.payload.grade, 'B')
  assert.deepEqual(validateFlightSimDecisions([outcome]), [outcome])
})
