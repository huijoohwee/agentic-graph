import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildFlightSimWebMcpToolBuilders,
} from '@/features/agent-ready/flightSimWebMcpTools'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import {
  FLIGHT_SIM_SAVE_PATH,
  persistPendingFlightSimDecisions,
  queueFlightSimDecisions,
  readFlightSimDecisionStore,
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import type { FlightSimDecisionRecord } from '@/features/game-flight-sim/flightSimModel'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const PRIOR_SAVE = '---\nflow:\n  nodes: []\n  edges: []\n---\n'
const DECISION: FlightSimDecisionRecord = Object.freeze({
  decisionId: 'flight-sim:run-1:tick-42:mission_completed:mission',
  decisionType: 'quest_flag',
  entityRef: 'flight-sim:mission:flight-sim-mission-1',
  payload: Object.freeze({
    event: 'mission_completed',
    missionId: 'flight-sim-mission-1',
    runId: 1,
    status: 'completed',
    tick: 42,
    landingPadId: 'landing-pad',
  }),
  producedAt: '2026-01-01T00:00:00.842Z',
})

test('a timed-out Flight WebMCP save restores bytes and cannot publish late saved state', async () => {
  resetFlightSimDecisionStoreForTests()
  let saveText: string | null = PRIOR_SAVE
  let signalWriteStarted!: () => void
  let releaseWrite!: () => void
  const writeStarted = new Promise<void>(resolve => {
    signalWriteStarted = resolve
  })
  const writeAllowed = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const workspace: WorkspaceFs = {
    ensureSeed: async () => false,
    listEntries: async () => [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 },
      {
        path: '/game-flight-sim',
        parentPath: '/',
        kind: 'folder',
        name: 'game-flight-sim',
        updatedAtMs: 0,
      },
      {
        path: FLIGHT_SIM_SAVE_PATH,
        parentPath: '/game-flight-sim',
        kind: 'file',
        name: 'mission-1-decisions.md',
        text: saveText || '',
        updatedAtMs: 0,
      },
    ],
    readFileText: async path => path === FLIGHT_SIM_SAVE_PATH ? saveText : null,
    writeFileText: async (_path, text) => {
      saveText = text
      signalWriteStarted()
      await writeAllowed
    },
    createFolder: async () => '/game-flight-sim',
    createFile: async ({ text }) => {
      saveText = text
      return FLIGHT_SIM_SAVE_PATH
    },
    deleteEntry: async () => {
      saveText = null
    },
  }
  const contracts = buildKnowgrphAgentReadyToolContracts({
    includeBrowserOnlyTools: true,
  })
  const findContract = (name: string) => {
    const contract = contracts.find(candidate => candidate.name === name)
    assert.ok(contract, name)
    return contract
  }
  let expireDeadline!: () => void
  let resolveControlSettled!: () => void
  const controlSettled = new Promise<void>(resolve => {
    resolveControlSettled = resolve
  })
  queueFlightSimDecisions([DECISION])
  const before = readFlightSimDecisionStore()
  const builders = buildFlightSimWebMcpToolBuilders(findContract, {
    control: async (_input, fence) => {
      try {
        return await persistPendingFlightSimDecisions({
          workspace,
          signal: fence.signal,
        })
      } finally {
        resolveControlSettled()
      }
    },
    createDeadline: () => ({
      expired: new Promise<void>(resolve => {
        expireDeadline = resolve
      }),
      cancel: () => {},
    }),
  })
  const control = builders[
    KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalFlightSim
  ]()
  const execution = control.execute({ operation: 'save' })
  await writeStarted

  expireDeadline()
  const timeout = await execution as { errorCode?: unknown }
  assert.equal(timeout.errorCode, 'FLIGHT_SIM_WEB_MCP_TIMEOUT')
  assert.deepEqual(readFlightSimDecisionStore(), before)

  releaseWrite()
  await controlSettled
  assert.equal(saveText, PRIOR_SAVE)
  assert.deepEqual(readFlightSimDecisionStore(), before)
  resetFlightSimDecisionStoreForTests()
})
