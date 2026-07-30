import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { validateCostLog } from '../../../contracts/cost-log.schema.js'
import {
  ECS_DECISION_NODE_TYPE,
  readKgcNodeState,
} from '../../../ecs/kgcNodeContract.js'
import { snapshotWorld } from '../../../ecs/world.js'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import {
  FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES,
  FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
  loadFlightSimAssets,
  readBundledFlightSimCommittedLocalAsset,
} from '@/features/game-flight-sim/assetSpec/flightSimAssetLoader'
import {
  FLIGHT_SIM_SAVE_PATH,
  loadFlightSimSavedDecisions,
  persistPendingFlightSimDecisions,
  queueFlightSimDecisions,
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  blockFlightSimGameplayNetworkAttempt,
  FlightSimExternalCallBlockedError,
} from '@/features/game-flight-sim/flightSimExternalCallGuard'
import {
  captureFlightSimMission,
  createFlightSimMission,
  disposeFlightSimMission,
  tickFlightSimMission,
  type FlightSimMission,
} from '@/features/game-flight-sim/flightSimMission'
import {
  FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG,
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_NEUTRAL_INPUT,
  FLIGHT_SIM_ZERO_COST_LOG,
  type FlightSimTickInput,
} from '@/features/game-flight-sim/flightSimModel'
import { createFlightSimRuntime } from '@/features/game-flight-sim/flightSimRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  createFlightSimPropertyProfile,
  createFlightSimPropertyWorkspace,
  flightSimPropertyIdentifierArbitrary,
  flightSimPropertyOffsetArbitrary,
} from './helpers/flightSimMissionPersistencePropertyFixtures'

const unitArbitrary = fc.integer({ min: -1_000, max: 1_000 })
  .map(value => value / 1_000)
const normalizedInputArbitrary = fc.record({
  pitch: unitArbitrary,
  roll: unitArbitrary,
  yaw: unitArbitrary,
  throttleDelta: unitArbitrary,
}).map(value => Object.freeze(value) as FlightSimTickInput)
const activeInputArbitrary = fc.record({
  pitch: unitArbitrary,
  roll: unitArbitrary,
  yaw: unitArbitrary,
  throttleDelta: fc.constantFrom(-1, -0.5, 0.5, 1),
}).map(value => Object.freeze(value) as FlightSimTickInput)

type CoreAction =
  | Readonly<{ kind: 'input'; input: FlightSimTickInput }>
  | Readonly<{ kind: 'advance'; steps: number }>
  | Readonly<{ kind: 'asset' }>
  | Readonly<{ kind: 'open' }>
  | Readonly<{ kind: 'start' }>
  | Readonly<{ kind: 'stop' }>
  | Readonly<{ kind: 'restart' }>
  | Readonly<{ kind: 'exit' }>

const coreActionArbitrary: fc.Arbitrary<CoreAction> = fc.oneof(
  normalizedInputArbitrary.map(input => Object.freeze({ kind: 'input', input })),
  fc.integer({ min: 1, max: 5 }).map(steps => Object.freeze({ kind: 'advance', steps })),
  fc.constant(Object.freeze({ kind: 'asset' })),
  fc.constant(Object.freeze({ kind: 'open' })),
  fc.constant(Object.freeze({ kind: 'start' })),
  fc.constant(Object.freeze({ kind: 'stop' })),
  fc.constant(Object.freeze({ kind: 'restart' })),
  fc.constant(Object.freeze({ kind: 'exit' })),
)

type ExternalCallKind = 'network' | 'inference' | 'imageToThreeJs' | 'cloudflare'
type ExternalCallCounts = Record<ExternalCallKind, number>

function externalCallProbe(): Readonly<{
  counts: ExternalCallCounts
  executor: (kind: ExternalCallKind) => () => never
}> {
  const counts: ExternalCallCounts = {
    network: 0,
    inference: 0,
    imageToThreeJs: 0,
    cloudflare: 0,
  }
  return Object.freeze({
    counts,
    executor: kind => () => {
      counts[kind] += 1
      throw new Error(`forbidden ${kind} executor was invoked`)
    },
  })
}

function missionBytes(mission: FlightSimMission): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    capture: captureFlightSimMission(mission),
    world: snapshotWorld(mission.world),
  }))
}

type WorkspaceMutation = Readonly<{
  method: 'createFolder' | 'createFile' | 'writeFileText' | 'deleteEntry'
  path: string
  text?: string
}>

function instrumentWorkspace(base: WorkspaceFs): Readonly<{
  workspace: WorkspaceFs
  mutations: WorkspaceMutation[]
}> {
  const mutations: WorkspaceMutation[] = []
  const workspace: WorkspaceFs = {
    ensureSeed: base.ensureSeed,
    listEntries: base.listEntries,
    readFileText: base.readFileText,
    writeFileText: async (path, text, options) => {
      mutations.push(Object.freeze({ method: 'writeFileText', path, text }))
      await base.writeFileText(path, text, options)
    },
    createFolder: async args => {
      const path = await base.createFolder(args)
      mutations.push(Object.freeze({ method: 'createFolder', path }))
      return path
    },
    createFile: async args => {
      const path = await base.createFile(args)
      mutations.push(Object.freeze({ method: 'createFile', path, text: args.text }))
      return path
    },
    deleteEntry: async (path, options) => {
      mutations.push(Object.freeze({ method: 'deleteEntry', path }))
      await base.deleteEntry(path, options)
    },
  }
  return Object.freeze({ workspace, mutations })
}

function collectKeys(value: unknown, target = new Set<string>()): ReadonlySet<string> {
  if (!value || typeof value !== 'object') return target
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, target)
    return target
  }
  for (const [key, item] of Object.entries(value)) {
    target.add(key.toLowerCase())
    collectKeys(item, target)
  }
  return target
}

const FORBIDDEN_PERSISTED_KEYS = Object.freeze([
  'components',
  'componentarrays',
  'entities',
  'world',
  'worldsnapshot',
  'costlog',
  'cost_log',
  'cost_logs',
  'model',
  'prompt_tokens',
  'completion_tokens',
  'cache_hits',
  'estimated_cost_usd',
  'incomplete',
  'credential',
  'credentials',
  'input',
  'inputframe',
  'controls',
  'rawinput',
  'rawinputs',
  'rawinputhistory',
  'inputhistory',
])

// Feature: knowgrph-game-flight-sim, Property 1 - Zero external calls during runtime
test('Feature: knowgrph-game-flight-sim, Property 1 - Zero external calls during runtime', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(coreActionArbitrary, { minLength: 1, maxLength: 8 }),
      flightSimPropertyOffsetArbitrary,
      flightSimPropertyIdentifierArbitrary,
      async (actions, offset, identifier) => {
        const probe = externalCallProbe()
        const profile = createFlightSimPropertyProfile(offset)
        const mission = createFlightSimMission({
          runId: 1,
          profile,
          inferenceExecutor: probe.executor('inference'),
        })
        const runtime = createFlightSimRuntime({ profile })
        let localAssetReadCount = 0
        let assetLoadCount = 0
        const loadCommittedAssets = () => {
          assetLoadCount += 1
          const report = loadFlightSimAssets(FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES, {
            readCommittedLocalAsset: path => {
              localAssetReadCount += 1
              return readBundledFlightSimCommittedLocalAsset(path)
            },
          })
          assert.deepEqual(report.errors, [])
          assert.equal(report.loaded.length, FLIGHT_SIM_DEFAULT_ASSET_CANDIDATES.length)
          const aircraft = report.loaded.find(
            asset => asset.subjectId === FLIGHT_SIM_REQUIRED_AIRCRAFT_SUBJECT_ID,
          )
          assert.equal(aircraft?.kind, 'asset-spec')
          if (aircraft?.kind === 'asset-spec') {
            assert.equal(aircraft.assetSpec.runtimeModelCalls, 0)
            assert.equal(aircraft.assetSpec.runtimeNetworkCalls, 0)
          }
        }
        try {
          runtime.start()
          const missionInputs: FlightSimTickInput[] = []
          for (const action of actions) {
            if (action.kind === 'input') {
              runtime.setInput(action.input)
              missionInputs.push(action.input)
            } else if (action.kind === 'advance') {
              await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS * action.steps)
            } else if (action.kind === 'asset') {
              loadCommittedAssets()
            } else if (action.kind === 'open') {
              runtime.open(true)
            } else if (action.kind === 'start') {
              runtime.start()
            } else if (action.kind === 'stop') {
              runtime.stop()
            } else if (action.kind === 'restart') {
              runtime.restart()
            } else {
              runtime.exit()
            }
          }
          loadCommittedAssets()
          for (const input of missionInputs.length > 0
            ? missionInputs
            : [FLIGHT_SIM_NEUTRAL_INPUT]) {
            await tickFlightSimMission(mission, input)
          }
          const guardedOperations = [
            [`fetch:gameplay:${identifier}`, probe.executor('network')],
            [`image-to-threejs:runtime:${identifier}`, probe.executor('imageToThreeJs')],
            [`cloudflare:service:${identifier}`, probe.executor('cloudflare')],
          ] as const
          for (const [operation, executor] of guardedOperations) {
            assert.throws(
              () => blockFlightSimGameplayNetworkAttempt(mission, operation, executor),
              error => (
                error instanceof FlightSimExternalCallBlockedError
                && error.operation === operation
                && error.synchronous
              ),
            )
          }
          assert.equal(localAssetReadCount, assetLoadCount)
          assert.deepEqual(probe.counts, {
            network: 0,
            inference: 0,
            imageToThreeJs: 0,
            cloudflare: 0,
          })
        } finally {
          runtime.exit()
          disposeFlightSimMission(mission)
        }
      },
    ),
    flightSimPropertyParameters(1),
  )
})

// Feature: knowgrph-game-flight-sim, Property 2 - Blocked gameplay/inference attempt fails closed and preserves state
test('Feature: knowgrph-game-flight-sim, Property 2 - Blocked gameplay/inference attempt fails closed and preserves state', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(normalizedInputArbitrary, { minLength: 0, maxLength: 5 }),
      flightSimPropertyOffsetArbitrary,
      flightSimPropertyIdentifierArbitrary,
      async (prelude, offset, identifier) => {
        const probe = externalCallProbe()
        const mission = createFlightSimMission({
          runId: 1,
          profile: createFlightSimPropertyProfile(offset),
          inferenceExecutor: probe.executor('inference'),
        })
        try {
          for (const input of prelude) await tickFlightSimMission(mission, input)
          const before = missionBytes(mission)
          const operation = `fetch:gameplay:${identifier}`
          assert.throws(
            () => blockFlightSimGameplayNetworkAttempt(
              mission,
              operation,
              probe.executor('network'),
            ),
            error => (
              error instanceof FlightSimExternalCallBlockedError
              && error.code === 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
              && error.operation === operation
              && error.synchronous
            ),
          )
          assert.deepEqual(missionBytes(mission), before)
          const blocked = await tickFlightSimMission(
            mission,
            FLIGHT_SIM_NEUTRAL_INPUT,
            null,
            { attemptInference: true },
          )
          assert.deepEqual(missionBytes(mission), before)
          assert.deepEqual(blocked.capture, captureFlightSimMission(mission))
          assert.deepEqual(blocked.decisions, [])
          const costLogs = Object.freeze([blocked.costLog])
          assert.equal(costLogs.length, 1)
          assert.deepEqual(costLogs[0], FLIGHT_SIM_BLOCKED_INFERENCE_COST_LOG)
          assert.equal(validateCostLog(costLogs[0]).valid, true)
          assert.equal(costLogs[0].model, 'none')
          assert.equal(costLogs[0].prompt_tokens, 'unknown')
          assert.equal(costLogs[0].completion_tokens, 'unknown')
          assert.equal(costLogs[0].cache_hits, 0)
          assert.equal(costLogs[0].estimated_cost_usd, 0)
          assert.equal(costLogs[0].incomplete, true)
          assert.equal(costLogs[0].error, 'blocked_inference')
          assert.deepEqual(probe.counts, {
            network: 0,
            inference: 0,
            imageToThreeJs: 0,
            cloudflare: 0,
          })
        } finally {
          disposeFlightSimMission(mission)
        }
      },
    ),
    flightSimPropertyParameters(2),
  )
})

// Feature: knowgrph-game-flight-sim, Property 3 - Successful model-free tick emits exactly one canonical zero Cost_Log
test('Feature: knowgrph-game-flight-sim, Property 3 - Successful model-free tick emits exactly one canonical zero Cost_Log', async () => {
  await fc.assert(
    fc.asyncProperty(
      normalizedInputArbitrary,
      fc.option(fc.integer({ min: 0, max: 100 }).map(value => value / 100), { nil: null }),
      flightSimPropertyOffsetArbitrary,
      async (input, throttleSetpoint, offset) => {
        let inferenceCallCount = 0
        const mission = createFlightSimMission({
          runId: 1,
          profile: createFlightSimPropertyProfile(offset),
          inferenceExecutor: () => {
            inferenceCallCount += 1
            throw new Error('model-free tick invoked inference')
          },
        })
        try {
          const result = await tickFlightSimMission(mission, input, throttleSetpoint)
          const costLogs = Object.freeze([result.costLog])
          assert.equal(costLogs.length, 1)
          assert.deepEqual(costLogs[0], FLIGHT_SIM_ZERO_COST_LOG)
          assert.deepEqual(
            Object.keys(costLogs[0]).sort(),
            [
              'cache_hits',
              'completion_tokens',
              'estimated_cost_usd',
              'incomplete',
              'model',
              'prompt_tokens',
            ],
          )
          assert.equal(validateCostLog(costLogs[0]).valid, true)
          assert.equal(costLogs[0].model, 'none')
          assert.equal(costLogs[0].prompt_tokens, 0)
          assert.equal(costLogs[0].completion_tokens, 0)
          assert.equal(costLogs[0].cache_hits, 0)
          assert.equal(costLogs[0].estimated_cost_usd, 0)
          assert.equal(costLogs[0].incomplete, false)
          assert.equal(inferenceCallCount, 0)
        } finally {
          disposeFlightSimMission(mission)
        }
      },
    ),
    flightSimPropertyParameters(3),
  )
})

// Feature: knowgrph-game-flight-sim, Property 4 - Decisions-only persistence path
test('Feature: knowgrph-game-flight-sim, Property 4 - Decisions-only persistence path', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(activeInputArbitrary, { minLength: 1, maxLength: 5 }),
      flightSimPropertyOffsetArbitrary,
      async (inputs, offset) => {
        resetFlightSimDecisionStoreForTests()
        const runtime = createFlightSimRuntime({
          profile: createFlightSimPropertyProfile(offset),
        })
        const instrumented = instrumentWorkspace(createFlightSimPropertyWorkspace())
        try {
          runtime.start()
          for (const input of inputs) {
            runtime.setInput(input)
            await runtime.advanceBy(FLIGHT_SIM_FIXED_STEP_SECONDS)
          }
          const decisions = runtime.read().pendingDecisions
          assert.ok(decisions.length > 0)
          queueFlightSimDecisions(decisions)
          const saved = await persistPendingFlightSimDecisions({
            workspace: instrumented.workspace,
          })
          assert.equal(saved.status, 'saved')
          assert.equal(saved.retainedCount, 0)
          const persistedText = await instrumented.workspace.readFileText(FLIGHT_SIM_SAVE_PATH)
          assert.ok(persistedText)
          const { nodes } = readKgcNodeState(persistedText)
          assert.equal(nodes.length, decisions.length)
          assert.ok(nodes.every((node: { type?: unknown }) => (
            node.type === ECS_DECISION_NODE_TYPE
          )))
          const persisted = await loadFlightSimSavedDecisions({
            workspace: instrumented.workspace,
          })
          assert.deepEqual(
            persisted.map(decision => decision.decisionId).sort(),
            decisions.map(decision => decision.decisionId).sort(),
          )
          assert.ok(persisted.every(decision => (
            decision.decisionType === 'dialogue_outcome'
            || decision.decisionType === 'quest_flag'
            || decision.decisionType === 'world_tick_result'
          )))
          const persistedKeys = collectKeys(nodes)
          for (const forbiddenKey of FORBIDDEN_PERSISTED_KEYS) {
            assert.equal(
              persistedKeys.has(forbiddenKey),
              false,
              `Decision save contained forbidden durable key ${forbiddenKey}`,
            )
          }
          const fileMutations = instrumented.mutations.filter(
            mutation => mutation.method === 'createFile' || mutation.method === 'writeFileText',
          )
          assert.equal(fileMutations.length, 1)
          assert.equal(fileMutations[0]?.path, FLIGHT_SIM_SAVE_PATH)
          assert.equal(fileMutations[0]?.text, persistedText)
          assert.ok(instrumented.mutations.every(mutation => (
            mutation.path === '/game-flight-sim'
            || mutation.path === FLIGHT_SIM_SAVE_PATH
          )))
          assert.equal(
            instrumented.mutations.some(mutation => mutation.method === 'deleteEntry'),
            false,
          )
        } finally {
          runtime.exit()
          resetFlightSimDecisionStoreForTests()
        }
      },
    ),
    flightSimPropertyParameters(4),
  )
})
