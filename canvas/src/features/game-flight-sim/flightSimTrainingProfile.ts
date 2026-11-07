import { FLIGHT_SIM_CONTROL_OPERATIONS } from './flightSimMcpContract.mjs'

export const FLIGHT_SIM_TRAINING_PROFILE_SCHEMA = 'flight-training-profile/v1'

export type FlightSimTrainingEffect =
  | Readonly<{ kind: 'none' | 'airspeed-unreliable' }>
  | Readonly<{ kind: 'throttle-limit'; maxThrottle: number; throttleDelta: number }>
  | Readonly<{ kind: 'input-bias'; roll: number; yaw: number }>
export type FlightSimTrainingMission = Readonly<{
  id: string
  label: string
  objective: string
  terrain: string
  night: boolean
  targetSpeedMetersPerSecond: readonly [number, number]
  defaultFailureId: string
  systemsChecklist: readonly string[]
}>
export type FlightSimTrainingFailure = Readonly<{
  id: string
  label: string
  effect: FlightSimTrainingEffect
  coachingCue?: string
}>
export type FlightSimTrainingSelection = Readonly<{ kind: 'mission' | 'failure'; id: string }>
export type FlightSimTrainingProfile = Readonly<{
  schema: typeof FLIGHT_SIM_TRAINING_PROFILE_SCHEMA
  defaultMissionId: string
  failureWindow: Readonly<{ startTick: number; endTickExclusive: number }>
  recoveryThrottleMinimum: number
  missions: readonly FlightSimTrainingMission[]
  failures: readonly FlightSimTrainingFailure[]
  controlAliases: Readonly<Record<string, FlightSimTrainingSelection>>
}>

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/
const ALIAS = /^[a-z][a-z0-9-]{0,95}$/
const RESERVED_OPERATIONS = new Set<string>(FLIGHT_SIM_CONTROL_OPERATIONS)
function fail(path: string, reason: string): never {
  throw new TypeError(`Flight training profile ${path}: ${reason}`)
}
function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object.')
  const result = value as Record<string, unknown>
  const unknown = Object.keys(result).find(key => !keys.includes(key))
  if (unknown) fail(`${path}.${unknown}`, 'is unsupported.')
  return result
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) {
    fail(path, 'must be a non-empty string of at most 512 characters.')
  }
  return value
}
function id(value: unknown, path: string): string {
  const result = text(value, path)
  if (!ID.test(result)) fail(path, 'must be a bounded identifier without whitespace or sigils.')
  return result
}
function number(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `must be finite from ${minimum} through ${maximum}.`)
  }
  return value
}
function list(value: unknown, path: string, limit: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > limit) {
    fail(path, `must contain from 1 through ${limit} entries.`)
  }
  return value
}
function effect(value: unknown, path: string): FlightSimTrainingEffect {
  const raw = record(value, path, ['kind', 'maxThrottle', 'throttleDelta', 'roll', 'yaw'])
  if (raw.kind === 'none' || raw.kind === 'airspeed-unreliable') {
    record(raw, path, ['kind'])
    return Object.freeze({ kind: raw.kind })
  }
  if (raw.kind === 'throttle-limit') {
    record(raw, path, ['kind', 'maxThrottle', 'throttleDelta'])
    return Object.freeze({
      kind: raw.kind,
      maxThrottle: number(raw.maxThrottle, `${path}.maxThrottle`, 0, 1),
      throttleDelta: number(raw.throttleDelta, `${path}.throttleDelta`, -1, 0),
    })
  }
  if (raw.kind === 'input-bias') {
    record(raw, path, ['kind', 'roll', 'yaw'])
    return Object.freeze({
      kind: raw.kind,
      roll: number(raw.roll, `${path}.roll`, -1, 1),
      yaw: number(raw.yaw, `${path}.yaw`, -1, 1),
    })
  }
  return fail(`${path}.kind`, 'is an unsupported generic effect.')
}

/** Pure validation: this module contains no demo catalog, parser, store, or fallback. */
export function validateFlightSimTrainingProfile(value: unknown): FlightSimTrainingProfile {
  const raw = record(value, 'root', [
    'schema', 'defaultMissionId', 'failureWindow', 'recoveryThrottleMinimum',
    'missions', 'failures', 'controlAliases',
  ])
  if (raw.schema !== FLIGHT_SIM_TRAINING_PROFILE_SCHEMA) fail('schema', 'is unsupported.')
  const window = record(raw.failureWindow, 'failureWindow', ['startTick', 'endTickExclusive'])
  const startTick = number(window.startTick, 'failureWindow.startTick', 0, Number.MAX_SAFE_INTEGER)
  const endTickExclusive = number(window.endTickExclusive, 'failureWindow.endTickExclusive', 0, Number.MAX_SAFE_INTEGER)
  if (!Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTickExclusive) || endTickExclusive <= startTick) {
    fail('failureWindow', 'must be an increasing safe-integer tick interval.')
  }
  const failures = list(raw.failures, 'failures', 32).map((value, index) => {
    const path = `failures[${index}]`
    const failure = record(value, path, ['id', 'label', 'effect', 'coachingCue'])
    return Object.freeze({
      id: id(failure.id, `${path}.id`),
      label: text(failure.label, `${path}.label`),
      effect: effect(failure.effect, `${path}.effect`),
      ...(failure.coachingCue === undefined ? {} : { coachingCue: text(failure.coachingCue, `${path}.coachingCue`) }),
    })
  })
  const missions = list(raw.missions, 'missions', 32).map((value, index) => {
    const path = `missions[${index}]`
    const mission = record(value, path, [
      'id', 'label', 'objective', 'terrain', 'night', 'targetSpeedMetersPerSecond',
      'defaultFailureId', 'systemsChecklist',
    ])
    const speed = list(mission.targetSpeedMetersPerSecond, `${path}.targetSpeedMetersPerSecond`, 2)
    if (speed.length !== 2) fail(`${path}.targetSpeedMetersPerSecond`, 'must contain exactly two speeds.')
    const minimum = number(speed[0], `${path}.targetSpeedMetersPerSecond[0]`, 0, Number.MAX_VALUE)
    const maximum = number(speed[1], `${path}.targetSpeedMetersPerSecond[1]`, 0, Number.MAX_VALUE)
    if (maximum <= minimum) fail(`${path}.targetSpeedMetersPerSecond`, 'must be increasing.')
    if (typeof mission.night !== 'boolean') fail(`${path}.night`, 'must be boolean.')
    return Object.freeze({
      id: id(mission.id, `${path}.id`),
      label: text(mission.label, `${path}.label`),
      objective: text(mission.objective, `${path}.objective`),
      terrain: text(mission.terrain, `${path}.terrain`),
      night: mission.night,
      targetSpeedMetersPerSecond: Object.freeze([minimum, maximum]) as readonly [number, number],
      defaultFailureId: id(mission.defaultFailureId, `${path}.defaultFailureId`),
      systemsChecklist: Object.freeze(list(mission.systemsChecklist, `${path}.systemsChecklist`, 32)
        .map((entry, item) => text(entry, `${path}.systemsChecklist[${item}]`))),
    })
  })
  const failureIds = new Set(failures.map(item => item.id))
  const missionIds = new Set(missions.map(item => item.id))
  if (failureIds.size !== failures.length) fail('failures', 'contains duplicate identifiers.')
  if (missionIds.size !== missions.length) fail('missions', 'contains duplicate identifiers.')
  for (const mission of missions) {
    if (!failureIds.has(mission.defaultFailureId)) fail('missions.defaultFailureId', 'must reference an authored failure.')
  }
  const defaultMissionId = id(raw.defaultMissionId, 'defaultMissionId')
  if (!missionIds.has(defaultMissionId)) fail('defaultMissionId', 'must reference an authored mission.')
  const aliasInput = raw.controlAliases === undefined ? {} : raw.controlAliases
  const aliases = record(aliasInput, 'controlAliases', Object.keys((aliasInput || {}) as object))
  if (Object.keys(aliases).length > 64) fail('controlAliases', 'exceeds 64 entries.')
  const controlAliases: Record<string, FlightSimTrainingSelection> = Object.create(null)
  for (const [alias, value] of Object.entries(aliases)) {
    if (!ALIAS.test(alias) || RESERVED_OPERATIONS.has(alias)) fail(`controlAliases.${alias}`, 'must be a bounded non-reserved operation.')
    const selection = record(value, `controlAliases.${alias}`, ['kind', 'id'])
    if (selection.kind !== 'mission' && selection.kind !== 'failure') fail(`controlAliases.${alias}.kind`, 'must be mission or failure.')
    const selectedId = id(selection.id, `controlAliases.${alias}.id`)
    if (!(selection.kind === 'mission' ? missionIds : failureIds).has(selectedId)) fail(`controlAliases.${alias}.id`, 'must reference an authored selection.')
    controlAliases[alias] = Object.freeze({ kind: selection.kind, id: selectedId })
  }
  const profile: FlightSimTrainingProfile = Object.freeze({
    schema: FLIGHT_SIM_TRAINING_PROFILE_SCHEMA,
    defaultMissionId,
    failureWindow: Object.freeze({ startTick, endTickExclusive }),
    recoveryThrottleMinimum: number(raw.recoveryThrottleMinimum, 'recoveryThrottleMinimum', 0, 1),
    missions: Object.freeze(missions),
    failures: Object.freeze(failures),
    controlAliases: Object.freeze(controlAliases),
  })
  if (new TextEncoder().encode(JSON.stringify(profile)).byteLength > 25 * 1024) fail('root', 'exceeds 25 KiB.')
  return profile
}
