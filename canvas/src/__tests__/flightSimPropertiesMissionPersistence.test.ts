import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { mergeDecisionsIntoKgcMarkdown } from '../../../ecs/decisionDocument.js'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  FLIGHT_SIM_SAVE_PATH,
  loadFlightSimSavedDecisions,
  persistPendingFlightSimDecisions,
  queueFlightSimDecisions,
  readFlightSimDecisionStore,
  resolveFlightSimEffectiveSaveStatus,
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import { validateFlightSimMissionDecisions } from '@/features/game-flight-sim/flightSimDecisionAdmission'
import { projectFlightSimHud } from '@/features/game-flight-sim/flightSimHudProjection'
import {
  captureFlightSimMission,
  type FlightSimMissionCapture,
} from '@/features/game-flight-sim/flightSimMission'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_ZERO_COST_LOG,
  type FlightSimDecisionRecord,
  type FlightSimSnapshot,
} from '@/features/game-flight-sim/flightSimModel'
import {
  createFlightSimRuntime,
  exitFlightSimSurface,
  resetFlightSimLocalPersistence,
  resetFlightSimRuntimeForTests,
  restartFlightSim,
  startFlightSim,
} from '@/features/game-flight-sim/flightSimRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  FLIGHT_SIM_PROPERTY_PRIOR_SAVE as PRIOR_SAVE,
  createFlightSimPropertyDecisionBatch as canonicalDecisionBatch,
  createFlightSimPropertyPendingDecisions as pendingDialogueDecisions,
  createFlightSimPropertyProfile as missionProfile,
  createFlightSimPropertyStateDecision as flightStateDecision,
  createFlightSimPropertyWorkspace as memoryWorkspace,
  expectedFlightSimPropertyObjective as expectedObjective,
  flightSimPropertyAuthoredBytesArbitrary as authoredBytesArbitrary,
  flightSimPropertyDecisionBatchArbitrary as decisionBatchArbitrary,
  flightSimPropertyHudScenarioArbitrary as hudScenarioArbitrary,
  flightSimPropertyHydratedProgressArbitrary as hydratedProgressArbitrary,
  flightSimPropertyIdentifierArbitrary as identifierArbitrary,
  flightSimPropertyOffsetArbitrary as offsetArbitrary,
  flightSimPropertySaveScenarioArbitrary as saveScenarioArbitrary,
} from './helpers/flightSimMissionPersistencePropertyFixtures'

// Feature: knowgrph-game-flight-sim, Property 30 - Terminal results are pending until explicit successful Save
test('Feature: knowgrph-game-flight-sim, Property 30 - Terminal results are pending until explicit successful Save', async () => {
  await fc.assert(
    fc.asyncProperty(offsetArbitrary, fc.boolean(), async (offset, failSave) => {
      resetFlightSimDecisionStoreForTests()
      const runtime = createFlightSimRuntime({ profile: missionProfile(offset, true) })
      const baseWorkspace = memoryWorkspace(PRIOR_SAVE)
      const workspace: WorkspaceFs = failSave
        ? {
            ...baseWorkspace,
            writeFileText: async () => {
              throw new Error('property write denied')
            },
          }
        : baseWorkspace
      try {
        runtime.start()
        runtime.setInput({ throttleDelta: 0.1 })
        const terminal = await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * 5)
        assert.equal(terminal.phase, 'completed')
        assert.ok(terminal.pendingDecisions.some(
          decision => decision.payload.event === 'mission_completed',
        ))
        const pendingIds = terminal.pendingDecisions.map(decision => decision.decisionId)
        const beforeSave = await baseWorkspace.readFileText(FLIGHT_SIM_SAVE_PATH)
        assert.equal(readFlightSimDecisionStore().retainedCount, 0)
        assert.equal(await baseWorkspace.readFileText(FLIGHT_SIM_SAVE_PATH), beforeSave)
        queueFlightSimDecisions(terminal.pendingDecisions)
        const saved = await persistPendingFlightSimDecisions({ workspace })
        if (failSave) {
          assert.equal(saved.status, 'error')
          assert.equal(saved.errorKind, 'write')
          assert.equal(saved.retainedCount, pendingIds.length)
          assert.equal(resolveFlightSimEffectiveSaveStatus(
            saved.status,
            runtime.read().pendingDecisions.length,
          ), 'error')
          assert.deepEqual(
            runtime.read().pendingDecisions.map(decision => decision.decisionId),
            pendingIds,
          )
          assert.equal(await baseWorkspace.readFileText(FLIGHT_SIM_SAVE_PATH), beforeSave)
        } else {
          assert.equal(saved.status, 'saved')
          assert.equal(saved.retainedCount, 0)
          assert.deepEqual(
            runtime.acknowledgeDecisions(pendingIds).pendingDecisions,
            [],
          )
        }
      } finally {
        runtime.exit()
        resetFlightSimDecisionStoreForTests()
      }
    }),
    flightSimPropertyParameters(30),
  )
})

// Feature: knowgrph-game-flight-sim, Property 31 - Decisions-only idempotent byte-preserving Save
test('Feature: knowgrph-game-flight-sim, Property 31 - Decisions-only idempotent byte-preserving Save', async () => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      authoredBytesArbitrary,
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 1_000 }),
      async (identifier, authoredBytes, runId, tick) => {
        resetFlightSimDecisionStoreForTests()
        const initial = `${PRIOR_SAVE}${authoredBytes}`
        const workspace = memoryWorkspace(initial)
        const decisions = canonicalDecisionBatch(identifier, runId, tick)
        const unsupported = {
          ...decisions[0],
          decisionId: `${decisions[0].decisionId}:unsupported`,
          decisionType: 'tool_choice',
        }
        assert.throws(
          () => queueFlightSimDecisions([unsupported as unknown as FlightSimDecisionRecord]),
          /unsupported/i,
        )
        assert.equal(readFlightSimDecisionStore().retainedCount, 0)
        assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), initial)
        queueFlightSimDecisions(decisions)
        const expected = mergeDecisionsIntoKgcMarkdown(initial, decisions).markdown
        const first = await persistPendingFlightSimDecisions({ workspace })
        const firstBytes = await workspace.readFileText(FLIGHT_SIM_SAVE_PATH)
        assert.equal(first.status, 'saved')
        assert.equal(firstBytes, expected)
        assert.ok(firstBytes?.includes('authored_meta: "preserve-exactly"'))
        assert.ok(firstBytes?.endsWith(authoredBytes))
        const loaded = await loadFlightSimSavedDecisions({ workspace })
        assert.deepEqual(
          loaded.map(decision => decision.decisionType).sort(),
          ['dialogue_outcome', 'quest_flag', 'world_tick_result'],
        )
        queueFlightSimDecisions(decisions)
        const second = await persistPendingFlightSimDecisions({ workspace })
        assert.equal(second.status, 'saved')
        assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), firstBytes)
        assert.equal(second.savedCount, decisions.length)
        resetFlightSimDecisionStoreForTests()
      },
    ),
    flightSimPropertyParameters(31),
  )
})

// Feature: knowgrph-game-flight-sim, Property 32 - HUD projection reflects underlying state
test('Feature: knowgrph-game-flight-sim, Property 32 - HUD projection reflects underlying state', () => {
  fc.assert(
    fc.property(
      hudScenarioArbitrary,
      saveScenarioArbitrary,
      fc.tuple(
        fc.integer({ min: -32, max: 32 }),
        fc.integer({ min: -32, max: 32 }),
        fc.integer({ min: -32, max: 32 }),
      ),
      fc.integer({ min: 0, max: 20_000 }).map(value => value / 100),
      fc.integer({ min: -314, max: 314 }).map(value => value / 100),
      fc.integer({ min: -157, max: 157 }).map(value => value / 100),
      fc.integer({ min: -157, max: 157 }).map(value => value / 100),
      fc.integer({ min: 0, max: 100 }).map(value => value / 100),
      fc.boolean(),
      (scenario, saveScenario, velocity, altitude, yaw, pitch, roll, throttle, hydrationPending) => {
        const flight: FlightSimSnapshot = Object.freeze({
          active: true,
          surfaceMode: 'xr',
          webglSupported: true,
          phase: scenario.phase,
          runId: 1,
          aircraft: Object.freeze({
            position: Object.freeze([0, altitude, 0] as const),
            velocity: Object.freeze(velocity),
            pitch,
            roll,
            yaw,
            throttle,
          }),
          waypointIndex: scenario.waypointIndex,
          waypointCount: 3,
          currentWaypointId: scenario.waypointIndex < 3
            ? `route-${scenario.waypointIndex + 1}`
            : 'landing-pad',
          tick: 10,
          elapsedSeconds: 10 * FLIGHT_SIM_FIXED_STEP_SECONDS,
          collisionId: scenario.collisionId,
          pendingDecisions: pendingDialogueDecisions(saveScenario.pendingCount),
          lastCostLog: FLIGHT_SIM_ZERO_COST_LOG,
          runtimeError: null,
          revision: 1,
        })
        const projection = projectFlightSimHud({
          flight,
          save: saveScenario.snapshot,
          savePath: FLIGHT_SIM_SAVE_PATH,
          hydrationPending,
        })
        assert.equal(projection.airspeed, Math.hypot(...velocity))
        assert.equal(projection.altitude, altitude)
        assert.equal(
          projection.headingDegrees,
          ((-yaw * 180 / Math.PI) % 360 + 360) % 360,
        )
        assert.equal(projection.pitchRadians, pitch)
        assert.equal(projection.rollRadians, roll)
        assert.equal(projection.throttle, throttle)
        assert.ok(projection.throttle >= 0 && projection.throttle <= 1)
        assert.deepEqual(projection.waypoint, {
          index: scenario.waypointIndex,
          count: 3,
          currentId: flight.currentWaypointId,
          atLandingPad: scenario.waypointIndex >= 3,
        })
        assert.equal(projection.objective, expectedObjective(scenario, hydrationPending))
        assert.equal(projection.save.status, saveScenario.snapshot.status)
        assert.equal(projection.save.effectiveStatus, saveScenario.effectiveStatus)
        assert.equal(projection.save.pendingCount, saveScenario.pendingCount)
        assert.equal(projection.save.retainedCount, saveScenario.snapshot.retainedCount)
        assert.equal(projection.save.error, saveScenario.snapshot.error)
        if (saveScenario.snapshot.error) {
          assert.equal(projection.error?.message, saveScenario.snapshot.error)
          assert.equal(projection.error?.path, FLIGHT_SIM_SAVE_PATH)
        } else {
          assert.equal(projection.error, null)
        }
      },
    ),
    flightSimPropertyParameters(32),
  )
})

// Feature: knowgrph-game-flight-sim, Property 33 - Fresh mission when no save exists
test('Feature: knowgrph-game-flight-sim, Property 33 - Fresh mission when no save exists', async () => {
  await fc.assert(
    fc.asyncProperty(
      identifierArbitrary,
      authoredBytesArbitrary,
      offsetArbitrary,
      async (identifier, authoredBytes, offset) => {
        resetFlightSimDecisionStoreForTests()
        const authoredPath = `/authored-${identifier}.md`
        const base = memoryWorkspace(undefined, {
          path: authoredPath,
          parentPath: '/',
          kind: 'file',
          name: `authored-${identifier}.md`,
          text: authoredBytes,
          updatedAtMs: 0,
        })
        let mutationCount = 0
        const workspace: WorkspaceFs = {
          ...base,
          writeFileText: async (...args) => {
            mutationCount += 1
            return base.writeFileText(...args)
          },
          createFile: async args => {
            mutationCount += 1
            return base.createFile(args)
          },
          createFolder: async args => {
            mutationCount += 1
            return base.createFolder(args)
          },
          deleteEntry: async (...args) => {
            mutationCount += 1
            return base.deleteEntry(...args)
          },
        }
        const decisions = await loadFlightSimSavedDecisions({ workspace })
        let missionCount = 0
        const runtime = createFlightSimRuntime({
          profile: missionProfile(offset),
          onMissionCreated: () => {
            missionCount += 1
          },
        })
        try {
          assert.deepEqual(decisions, [])
          assert.equal(runtime.hydrate(decisions).runtimeError, null)
          const fresh = runtime.start()
          assert.equal(fresh.phase, 'ready')
          assert.equal(fresh.tick, 0)
          assert.equal(fresh.runId, 1)
          assert.deepEqual(fresh.aircraft, missionProfile(offset).spawn)
          assert.equal(missionCount, 1)
          assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), null)
          assert.equal(await workspace.readFileText(authoredPath), authoredBytes)
          assert.equal(mutationCount, 0)
        } finally {
          runtime.exit()
          resetFlightSimDecisionStoreForTests()
        }
      },
    ),
    flightSimPropertyParameters(33),
  )
})

// Feature: knowgrph-game-flight-sim, Property 34 - Fail-closed hydration with reset gating
test('Feature: knowgrph-game-flight-sim, Property 34 - Fail-closed hydration with reset gating', async () => {
  await fc.assert(
    fc.asyncProperty(identifierArbitrary, offsetArbitrary, async (identifier, offset) => {
      resetFlightSimDecisionStoreForTests()
      resetFlightSimRuntimeForTests(missionProfile(offset))
      const malformed = `---\nflow:\n  nodes: [${identifier}\n---\n# original bytes\n`
      const workspace = memoryWorkspace(malformed)
      try {
        await assert.rejects(() => loadFlightSimSavedDecisions({ workspace }))
        const blocked = readFlightSimDecisionStore()
        assert.equal(blocked.hydrationBlocked, true)
        assert.equal(blocked.errorKind, 'load')
        assert.match(blocked.error || '', new RegExp(FLIGHT_SIM_SAVE_PATH))
        assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), malformed)
        const blockedStart = startFlightSim()
        const blockedRestart = restartFlightSim()
        assert.equal(blockedStart.runId, 0)
        assert.equal(blockedRestart.runId, 0)
        assert.match(blockedStart.runtimeError || '', /Unreadable|unreadable/)
        assert.match(blockedRestart.runtimeError || '', /Unreadable|unreadable/)
        assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), malformed)
        const reset = await resetFlightSimLocalPersistence({ workspace })
        assert.equal(reset.status, 'saved')
        assert.equal(reset.hydrationBlocked, false)
        assert.deepEqual(await loadFlightSimSavedDecisions({ workspace }), [])
        const started = await startFlightSim({
          workspace,
          webglSupported: true,
          openPanel: false,
        })
        assert.equal(started.runtimeError, null)
        assert.equal(started.phase, 'ready')
        assert.equal(started.runId, 1)
        assert.equal(restartFlightSim().runId, 2)
      } finally {
        exitFlightSimSurface({ restorePreviousSurface: false })
        resetFlightSimDecisionStoreForTests()
      }
    }),
    flightSimPropertyParameters(34),
  )
})

// Feature: knowgrph-game-flight-sim, Property 35 - Write failure retains pending Decisions and supports retry
test('Feature: knowgrph-game-flight-sim, Property 35 - Write failure retains pending Decisions and supports retry', async () => {
  await fc.assert(
    fc.asyncProperty(
      decisionBatchArbitrary,
      authoredBytesArbitrary,
      async (decisions, authoredBytes) => {
        resetFlightSimDecisionStoreForTests()
        const initial = `${PRIOR_SAVE}${authoredBytes}`
        const base = memoryWorkspace(initial)
        let failWrites = true
        const attemptedWrites: string[] = []
        const workspace: WorkspaceFs = {
          ...base,
          writeFileText: async (path, text, options) => {
            attemptedWrites.push(text)
            if (failWrites) throw new Error('did not persist: property write denied')
            await base.writeFileText(path, text, options)
          },
        }
        queueFlightSimDecisions(decisions)
        const failed = await persistPendingFlightSimDecisions({ workspace })
        assert.equal(failed.status, 'error')
        assert.equal(failed.errorKind, 'write')
        assert.equal(failed.retainedCount, decisions.length)
        assert.match(failed.error || '', /did not persist/)
        assert.equal(await base.readFileText(FLIGHT_SIM_SAVE_PATH), initial)
        failWrites = false
        const retried = await persistPendingFlightSimDecisions({ workspace })
        assert.equal(retried.status, 'saved')
        assert.equal(retried.retainedCount, 0)
        assert.equal(attemptedWrites.length, 2)
        assert.equal(attemptedWrites[0], attemptedWrites[1])
        const loaded = await loadFlightSimSavedDecisions({ workspace })
        assert.deepEqual(
          loaded.map(decision => decision.decisionId).sort(),
          decisions.map(decision => decision.decisionId).sort(),
        )
        resetFlightSimDecisionStoreForTests()
      },
    ),
    flightSimPropertyParameters(35),
  )
})

// Feature: knowgrph-game-flight-sim, Property 36 - Hydration reconstructs saved progress before first tick
test('Feature: knowgrph-game-flight-sim, Property 36 - Hydration reconstructs saved progress before first tick', async () => {
  await fc.assert(
    fc.asyncProperty(hydratedProgressArbitrary, async progress => {
      resetFlightSimDecisionStoreForTests()
      const decision = flightStateDecision(progress)
      const document = mergeDecisionsIntoKgcMarkdown(PRIOR_SAVE, [decision]).markdown
      const workspace = memoryWorkspace(document)
      const profile = missionProfile(progress.offset)
      const loaded = await loadFlightSimSavedDecisions({ workspace })
      assert.deepEqual(validateFlightSimMissionDecisions(profile, loaded), loaded)
      let createdCapture: FlightSimMissionCapture | null = null
      const runtime = createFlightSimRuntime({
        profile,
        onMissionCreated: mission => {
          createdCapture = captureFlightSimMission(mission)
        },
      })
      try {
        const beforeHydration = runtime.read()
        assert.equal(beforeHydration.tick, 0)
        assert.equal(createdCapture, null)
        assert.equal(runtime.hydrate(loaded).runtimeError, null)
        assert.equal(runtime.read().tick, 0)
        assert.equal(createdCapture, null)
        const reconstructed = runtime.start()
        assert.ok(createdCapture)
        assert.equal(createdCapture.tick, progress.tick)
        assert.equal(createdCapture.phase, 'flying')
        assert.deepEqual(createdCapture.aircraft.position, progress.position)
        assert.deepEqual(createdCapture.aircraft.velocity, progress.velocity)
        assert.equal(createdCapture.aircraft.pitch, progress.pitch)
        assert.equal(createdCapture.aircraft.roll, progress.roll)
        assert.equal(createdCapture.aircraft.yaw, progress.yaw)
        assert.equal(createdCapture.aircraft.throttle, progress.throttle)
        assert.equal(reconstructed.tick, progress.tick)
        assert.equal(reconstructed.phase, 'flying')
        assert.equal(reconstructed.runId, progress.runId)
        assert.equal(reconstructed.currentWaypointId, 'route-1')
      } finally {
        runtime.exit()
        resetFlightSimDecisionStoreForTests()
      }
    }),
    flightSimPropertyParameters(36),
  )
})
