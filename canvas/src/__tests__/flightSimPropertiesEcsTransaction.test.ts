import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import {
  allocateEntity,
  createWorld,
  registerComponent,
  worldTick,
} from '../../../ecs/index.js'
import { stableStringifyJson } from '../../../ecs/kgcNodeContract.js'
import {
  disposeWorld,
  snapshotWorld,
} from '../../../ecs/world.js'
import {
  FLIGHT_SIM_AIRCRAFT_ENTITY_REF,
  FLIGHT_SIM_MISSION_ENTITY_REF,
} from '../features/game-flight-sim/flightSimModel'
import {
  captureFlightSimMission,
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
  FlightSimWorldTickError,
} from '../features/game-flight-sim/flightSimMission'
import { FLIGHT_SIM_SYSTEM_NAMES } from '../features/game-flight-sim/flightSimSystems'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  flightSimActiveInputArbitrary,
  flightSimNormalizedInputArbitrary,
  flightSimPropertyProfile,
  flightSimSeedArbitrary,
} from './helpers/flightSimSimulationPropertyFixtures'

type BoundaryContext = Readonly<{
  write: (
    entityId: number,
    componentName: string,
    fieldName: string,
    value: number,
  ) => void
}>

type RawWorldSnapshot = Readonly<{
  entities: readonly Readonly<{
    entityRef: string
    components: Readonly<Record<string, Readonly<Record<string, number>>>>
  }>[]
}>

function worldEntity(
  snapshot: RawWorldSnapshot,
  entityRef: string,
): RawWorldSnapshot['entities'][number] {
  const entity = snapshot.entities.find(candidate => candidate.entityRef === entityRef)
  assert.ok(entity)
  return entity
}

// Feature: knowgrph-game-flight-sim, Property 5 - Transactional boundary is enforced
test('Feature: knowgrph-game-flight-sim, Property 5 - Transactional boundary is enforced', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      fc.integer({ min: -1_000_000, max: 1_000_000 }),
      async (initialValue, attemptedValue) => {
        let retainedContext: BoundaryContext | null = null
        const captureContext = (context: BoundaryContext) => {
          retainedContext = context
        }
        Object.defineProperty(captureContext, 'systemName', {
          value: 'TransactionalBoundaryProbeSystem',
        })
        const world = createWorld({ systems: [captureContext] })
        try {
          registerComponent(world, 'BoundaryProbe', { value: 'i32' })
          allocateEntity(world, {
            entityRef: 'flight-sim:transaction-boundary-probe',
            components: { BoundaryProbe: { value: initialValue } },
          })
          const tick = await worldTick(world, {})
          assert.equal(tick.ok, true)
          assert.ok(retainedContext)
          const before = stableStringifyJson(snapshotWorld(world))
          let rejection: unknown
          try {
            retainedContext.write(
              0,
              'BoundaryProbe',
              'value',
              attemptedValue,
            )
          } catch (error) {
            rejection = error
          }
          assert.ok(rejection instanceof Error)
          assert.equal(rejection.name, 'EcsError')
          assert.equal(
            (rejection as Error & { code?: string }).code,
            'ECS_INACTIVE_SYSTEM_CONTEXT',
          )
          assert.match(rejection.message, /no longer active/)
          assert.equal(stableStringifyJson(snapshotWorld(world)), before)
        } finally {
          disposeWorld(world)
        }
      },
    ),
    flightSimPropertyParameters(5),
  )
})

// Feature: knowgrph-game-flight-sim, Property 6 - Ephemeral in-memory state with no durable World writes
test('Feature: knowgrph-game-flight-sim, Property 6 - Ephemeral in-memory state with no durable World writes', async () => {
  await fc.assert(
    fc.asyncProperty(
      flightSimSeedArbitrary,
      fc.array(flightSimNormalizedInputArbitrary, {
        minLength: 1,
        maxLength: 6,
      }),
      async (seed, inputs) => {
        const profile = flightSimPropertyProfile()
        const mission = createFlightSimMission({ runId: 1, profile, seed })
        const decisions = []
        let hydratedMission: ReturnType<typeof createFlightSimMission> | null = null
        let freshMission: ReturnType<typeof createFlightSimMission> | null = null
        try {
          assert.equal(Object.isFrozen(mission.world), true)
          assert.deepEqual(Object.keys(mission.world), [])
          assert.equal(JSON.stringify(mission.world), '{}')
          for (const input of inputs) {
            const tick = await tickFlightSimMission(mission, input)
            decisions.push(...tick.decisions)
          }
          const committed = captureFlightSimMission(mission)
          assert.equal(committed.tick, inputs.length)

          hydratedMission = createFlightSimMission({
            runId: 1,
            profile,
            seed,
            decisions,
          })
          assert.equal(
            stableStringifyJson(captureFlightSimMission(hydratedMission)),
            stableStringifyJson(committed),
          )

          freshMission = createFlightSimMission({ runId: 1, profile, seed })
          assert.notDeepEqual(captureFlightSimMission(freshMission), committed)

          assert.equal(disposeFlightSimMission(mission), true)
          assert.equal(disposeFlightSimMission(mission), false)
          assert.throws(
            () => captureFlightSimMission(mission),
            (error: Error & { code?: string }) => (
              error.name === 'EcsError' && error.code === 'ECS_INVALID_WORLD'
            ),
          )
        } finally {
          disposeFlightSimMission(mission)
          if (hydratedMission) disposeFlightSimMission(hydratedMission)
          if (freshMission) disposeFlightSimMission(freshMission)
        }
      },
    ),
    flightSimPropertyParameters(6),
  )
})

const failureCauseArbitrary = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
  { minLength: 1, maxLength: 12 },
).map(characters => `property-${characters.join('')}`)

// Feature: knowgrph-game-flight-sim, Property 7 - Per-system rollback preserves prior commits
test('Feature: knowgrph-game-flight-sim, Property 7 - Per-system rollback preserves prior commits', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: FLIGHT_SIM_SYSTEM_NAMES.length - 1 }),
      flightSimActiveInputArbitrary,
      failureCauseArbitrary,
      async (failingSystemIndex, input, failureCause) => {
        const failingSystemName = FLIGHT_SIM_SYSTEM_NAMES[failingSystemIndex]!
        const mission = createFlightSimMission({
          runId: 1,
          profile: flightSimPropertyProfile(true),
          failureInjection: {
            systemName: failingSystemName,
            errorCode: 'FLIGHT_SIM_PROPERTY_SYSTEM_FAILURE',
            message: failureCause,
          },
        })
        try {
          const before = captureFlightSimMission(mission)
          const beforeWorld = stableStringifyJson(snapshotWorld(mission.world))
          let failure: unknown
          try {
            await tickFlightSimMission(mission, input)
          } catch (error) {
            failure = error
          }
          assert.ok(failure instanceof FlightSimWorldTickError)
          assert.equal(failure.ecsErrorCode, 'FLIGHT_SIM_PROPERTY_SYSTEM_FAILURE')
          assert.equal(failure.failingSystemIndex, failingSystemIndex)
          assert.equal(failure.failingSystemName, failingSystemName)
          assert.equal(failure.systemCause, failureCause)

          const after = captureFlightSimMission(mission)
          const world = snapshotWorld(mission.world) as RawWorldSnapshot
          const aircraft = worldEntity(world, FLIGHT_SIM_AIRCRAFT_ENTITY_REF)
          const missionEntity = worldEntity(world, FLIGHT_SIM_MISSION_ENTITY_REF)
          assert.equal(after.phase, 'ready')
          assert.equal(after.waypointIndex, 0)
          assert.equal(after.tick, failingSystemIndex === 0 ? 0 : 1)
          assert.equal(
            missionEntity.components.Mission!.phase,
            1,
          )
          if (failingSystemIndex === 0) {
            assert.equal(stableStringifyJson(world), beforeWorld)
          } else {
            assert.equal(
              aircraft.components.InputFrame!.pitch,
              Math.fround(input.pitch),
            )
          }
          if (failingSystemIndex <= 1) {
            assert.deepEqual(after.aircraft, before.aircraft)
          } else {
            assert.notDeepEqual(after.aircraft, before.aircraft)
          }
          assert.equal(
            aircraft.components.TickCollision!.blockerIndex,
            failingSystemIndex === 3 ? 1 : 0,
          )
        } finally {
          disposeFlightSimMission(mission)
        }
      },
    ),
    flightSimPropertyParameters(7),
  )
})
