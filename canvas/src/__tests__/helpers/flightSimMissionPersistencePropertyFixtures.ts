import fc from 'fast-check'
import { FLIGHT_SIM_SAVE_PATH } from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  FLIGHT_SIM_MISSION_ENTITY_REF,
  FLIGHT_SIM_MISSION_ID,
  flightSimDecisionId,
  flightSimDecisionProducedAt,
  type FlightSimDecisionRecord,
  type FlightSimSnapshot,
  type FlightSimSpatialProfile,
} from '@/features/game-flight-sim/flightSimModel'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import type {
  WorkspaceDecisionStoreSnapshot,
} from '@/features/workspace-fs/workspaceDecisionStore'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'

export const FLIGHT_SIM_PROPERTY_PRIOR_SAVE = [
  '---',
  'title: "Property-authored Flight Decisions"',
  'schema: "kgc-computing-flow/v1"',
  'authored_meta: "preserve-exactly"',
  'flow:',
  '  nodes: []',
  '  edges: []',
  '---',
  '',
  '# Authored bytes',
  '',
].join('\n')

export const flightSimPropertyIdentifierArbitrary =
  fc.stringMatching(/^[a-z][a-z0-9-]{0,16}$/)
export const flightSimPropertyAuthoredBytesArbitrary =
  fc.string({ minLength: 0, maxLength: 64 })
export const flightSimPropertyOffsetArbitrary =
  fc.integer({ min: -20, max: 20 })

function workspaceEntries(saveText?: string, extraFile?: WorkspaceEntry): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [{
    path: '/',
    parentPath: null,
    kind: 'folder',
    name: '',
    updatedAtMs: 0,
  }]
  if (saveText !== undefined) {
    entries.push({
      path: '/game-flight-sim',
      parentPath: '/',
      kind: 'folder',
      name: 'game-flight-sim',
      updatedAtMs: 0,
    }, {
      path: FLIGHT_SIM_SAVE_PATH,
      parentPath: '/game-flight-sim',
      kind: 'file',
      name: 'mission-1-decisions.md',
      text: saveText,
      updatedAtMs: 0,
    })
  }
  if (extraFile) entries.push(extraFile)
  return entries
}

export function createFlightSimPropertyWorkspace(
  saveText?: string,
  extraFile?: WorkspaceEntry,
): WorkspaceFs {
  return createMemoryWorkspaceFs({
    initialEntries: workspaceEntries(saveText, extraFile),
  })
}

export function createFlightSimPropertyProfile(
  offset = 0,
  terminal = false,
): FlightSimSpatialProfile {
  const spawnPosition = Object.freeze([offset, 10, offset] as const)
  const objective = (id: string, distance: number) => Object.freeze({
    id,
    position: terminal
      ? spawnPosition
      : Object.freeze([offset, 10, offset - distance] as const),
    radiusMeters: FLIGHT_SIM_MIN_CAPTURE_RADIUS_METERS,
  })
  return Object.freeze({
    id: `flight-sim:property:${offset}:${terminal ? 'terminal' : 'route'}`,
    sourceKey: `property:${offset}:${terminal ? 'terminal' : 'route'}`,
    aircraftHalfSize: Object.freeze([0.4, 0.4, 0.4] as const),
    spawn: Object.freeze({
      position: spawnPosition,
      velocity: Object.freeze([0, 0, -8] as const),
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.5,
    }),
    blockers: Object.freeze([]),
    waypoints: Object.freeze([
      objective('route-1', 200),
      objective('route-2', 400),
      objective('route-3', 600),
    ]),
    landingPad: objective('landing-pad', 800),
  })
}

export function createFlightSimPropertyStateDecision(args: Readonly<{
  runId: number
  tick: number
  position?: readonly [number, number, number]
  velocity?: readonly [number, number, number]
  pitch?: number
  roll?: number
  yaw?: number
  throttle?: number
}>): FlightSimDecisionRecord {
  return Object.freeze({
    decisionId: flightSimDecisionId(args.runId, args.tick, 'flight_state', 'mission'),
    decisionType: 'world_tick_result',
    entityRef: FLIGHT_SIM_MISSION_ENTITY_REF,
    payload: Object.freeze({
      event: 'flight_state',
      missionId: FLIGHT_SIM_MISSION_ID,
      runId: args.runId,
      tick: args.tick,
      position: args.position || [0, 10, 0],
      velocity: args.velocity || [0, 0, -8],
      pitch: args.pitch ?? 0,
      roll: args.roll ?? 0,
      yaw: args.yaw ?? 0,
      throttle: args.throttle ?? 0.5,
      waypointIndex: 0,
      phase: 'flying',
    }),
    producedAt: flightSimDecisionProducedAt(args.tick, 'flight_state'),
  })
}

export function createFlightSimPropertyDecisionBatch(
  identifier: string,
  runId: number,
  tick: number,
): readonly FlightSimDecisionRecord[] {
  return Object.freeze([
    Object.freeze({
      decisionId: `flight-sim:dialogue:${identifier}:${runId}:${tick}`,
      decisionType: 'dialogue_outcome',
      entityRef: FLIGHT_SIM_MISSION_ENTITY_REF,
      payload: Object.freeze({ outcome: identifier, accepted: true }),
      producedAt: flightSimDecisionProducedAt(tick, 'flight_state'),
    }),
    createFlightSimPropertyStateDecision({ runId, tick }),
    Object.freeze({
      decisionId: flightSimDecisionId(runId, tick + 1, 'mission_completed', 'mission'),
      decisionType: 'quest_flag',
      entityRef: FLIGHT_SIM_MISSION_ENTITY_REF,
      payload: Object.freeze({
        event: 'mission_completed',
        missionId: FLIGHT_SIM_MISSION_ID,
        runId,
        tick: tick + 1,
        status: 'completed',
        landingPadId: 'landing-pad',
      }),
      producedAt: flightSimDecisionProducedAt(tick + 1, 'mission_completed'),
    }),
  ])
}

export const flightSimPropertyDecisionBatchArbitrary = fc.record({
  identifier: flightSimPropertyIdentifierArbitrary,
  runId: fc.integer({ min: 1, max: 100 }),
  tick: fc.integer({ min: 1, max: 1_000 }),
  count: fc.integer({ min: 1, max: 3 }),
}).map(value => createFlightSimPropertyDecisionBatch(
  value.identifier,
  value.runId,
  value.tick,
).slice(0, value.count))

export type FlightSimPropertyHudScenario = Readonly<{
  phase: FlightSimSnapshot['phase']
  waypointIndex: number
  collisionId: string | null
}>
export const flightSimPropertyHudScenarioArbitrary = fc.oneof(
  fc.integer({ min: 0, max: 2 }).map(waypointIndex => ({
    phase: 'flying',
    waypointIndex,
    collisionId: null,
  }) as FlightSimPropertyHudScenario),
  fc.constant({
    phase: 'flying',
    waypointIndex: 3,
    collisionId: null,
  } as FlightSimPropertyHudScenario),
  fc.constant({
    phase: 'ready',
    waypointIndex: 0,
    collisionId: null,
  } as FlightSimPropertyHudScenario),
  fc.constant({
    phase: 'completed',
    waypointIndex: 3,
    collisionId: null,
  } as FlightSimPropertyHudScenario),
  flightSimPropertyIdentifierArbitrary.map(id => ({
    phase: 'crashed',
    waypointIndex: 1,
    collisionId: `collider-${id}`,
  }) as FlightSimPropertyHudScenario),
)

export type FlightSimPropertySaveScenario = Readonly<{
  snapshot: WorkspaceDecisionStoreSnapshot
  pendingCount: number
  effectiveStatus: 'pending' | 'error' | 'saved'
}>
export const flightSimPropertySaveScenarioArbitrary = fc.oneof(
  fc.integer({ min: 1, max: 3 }).map(pendingCount => ({
    pendingCount,
    effectiveStatus: 'pending',
    snapshot: {
      status: 'idle',
      errorKind: null,
      hydrationBlocked: false,
      retainedCount: 0,
      savedCount: 0,
      error: null,
      revision: 1,
    },
  }) as FlightSimPropertySaveScenario),
  fc.integer({ min: 1, max: 3 }).map(retainedCount => ({
    pendingCount: retainedCount,
    effectiveStatus: 'error',
    snapshot: {
      status: 'error',
      errorKind: 'write',
      hydrationBlocked: false,
      retainedCount,
      savedCount: 0,
      error: `Did not persist ${FLIGHT_SIM_SAVE_PATH}`,
      revision: 2,
    },
  }) as FlightSimPropertySaveScenario),
  fc.constant({
    pendingCount: 0,
    effectiveStatus: 'saved',
    snapshot: {
      status: 'saved',
      errorKind: null,
      hydrationBlocked: false,
      retainedCount: 0,
      savedCount: 3,
      error: null,
      revision: 3,
    },
  } as FlightSimPropertySaveScenario),
  fc.constant({
    pendingCount: 0,
    effectiveStatus: 'error',
    snapshot: {
      status: 'error',
      errorKind: 'load',
      hydrationBlocked: true,
      retainedCount: 0,
      savedCount: 0,
      error: `Unreadable ${FLIGHT_SIM_SAVE_PATH}: malformed`,
      revision: 4,
    },
  } as FlightSimPropertySaveScenario),
)

export function createFlightSimPropertyPendingDecisions(
  count: number,
): readonly FlightSimDecisionRecord[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    decisionId: `flight-sim:hud-pending:${index}`,
    decisionType: 'dialogue_outcome' as const,
    entityRef: FLIGHT_SIM_MISSION_ENTITY_REF,
    payload: Object.freeze({ pending: true }),
    producedAt: '2026-01-01T00:00:00.000Z',
  })))
}

export function expectedFlightSimPropertyObjective(
  scenario: FlightSimPropertyHudScenario,
  hydrationPending: boolean,
): string {
  if (hydrationPending) return 'Loading local Decisions…'
  if (scenario.phase === 'completed') return 'Route complete'
  if (scenario.phase === 'crashed') {
    return `Aircraft stopped by ${scenario.collisionId || 'terrain'}`
  }
  if (scenario.phase === 'flying') {
    return scenario.waypointIndex >= 3
      ? 'Land on the marked landing pad'
      : `Waypoint ${scenario.waypointIndex + 1} of 3`
  }
  return scenario.phase === 'ready'
    ? 'Ready · apply flight input'
    : 'Flight Sim stopped'
}

export const flightSimPropertyHydratedProgressArbitrary = fc.record({
  runId: fc.integer({ min: 1, max: 100 }),
  tick: fc.integer({ min: 1, max: 5_000 }),
  position: fc.tuple(
    fc.integer({ min: -100, max: 100 }),
    fc.integer({ min: 1, max: 100 }),
    fc.integer({ min: -100, max: 100 }),
  ),
  velocity: fc.tuple(
    fc.integer({ min: -16, max: 16 }),
    fc.integer({ min: -16, max: 16 }),
    fc.integer({ min: -16, max: 16 }),
  ),
  pitch: fc.constantFrom(-0.5, -0.25, 0, 0.25, 0.5),
  roll: fc.constantFrom(-0.5, -0.25, 0, 0.25, 0.5),
  yaw: fc.constantFrom(-0.5, -0.25, 0, 0.25, 0.5),
  throttle: fc.constantFrom(0, 0.25, 0.5, 0.75, 1),
  offset: flightSimPropertyOffsetArbitrary,
})
