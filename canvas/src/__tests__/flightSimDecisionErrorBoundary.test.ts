import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FLIGHT_SIM_SAVE_PATH,
  loadFlightSimSavedDecisions,
  persistPendingFlightSimDecisions,
  queueFlightSimDecisions,
  readFlightSimDecisionStore,
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import { projectFlightSimHud } from '@/features/game-flight-sim/flightSimHudProjection'
import type { FlightSimDecisionRecord } from '@/features/game-flight-sim/flightSimModel'
import { controlLocalFlightSim } from '@/features/game-flight-sim/flightSimMcpRuntime'
import {
  exitFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
} from '@/features/game-flight-sim/flightSimRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const SENSITIVE_SENTINEL = 'SECRET_SENTINEL_CREDENTIAL_PROMPT_REF'
const PUBLIC_ERROR =
  `Unreadable ${FLIGHT_SIM_SAVE_PATH}: local Decision document is invalid.`
const VALID_EMPTY_SAVE = [
  '---',
  'flow:',
  '  nodes: []',
  '  edges: []',
  '---',
  '',
].join('\n')
const MALFORMED_SAVE = [
  '---',
  'flow:',
  `  nodes: [${SENSITIVE_SENTINEL}: credential prompt entityRef`,
  '---',
  '',
].join('\n')
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

function mutableWorkspace(initialText: string): Readonly<{
  workspace: WorkspaceFs
  readText: () => string
  replaceText: (text: string) => void
}> {
  let sourceText = initialText
  return {
    workspace: {
      ensureSeed: async () => false,
      listEntries: async () => [],
      readFileText: async path => (
        path === FLIGHT_SIM_SAVE_PATH ? sourceText : null
      ),
      writeFileText: async (path, text) => {
        if (path === FLIGHT_SIM_SAVE_PATH) sourceText = text
      },
      createFolder: async () => '/game-flight-sim',
      createFile: async ({ text }) => {
        sourceText = text
        return FLIGHT_SIM_SAVE_PATH
      },
      deleteEntry: async path => {
        if (path === FLIGHT_SIM_SAVE_PATH) sourceText = ''
      },
    },
    readText: () => sourceText,
    replaceText: text => {
      sourceText = text
    },
  }
}

function assertSentinelRedacted(value: unknown): void {
  assert.doesNotMatch(JSON.stringify(value), new RegExp(SENSITIVE_SENTINEL))
}

test('Flight Sim load and browser control boundaries redact malformed local Decision source', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  const { workspace } = mutableWorkspace(MALFORMED_SAVE)
  let thrownMessage = ''

  try {
    await assert.rejects(
      () => loadFlightSimSavedDecisions({ workspace }),
      (error: Error) => {
        thrownMessage = error.message
        return true
      },
    )
    assert.equal(thrownMessage, PUBLIC_ERROR)
    assert.doesNotMatch(thrownMessage, new RegExp(SENSITIVE_SENTINEL))

    const store = readFlightSimDecisionStore()
    assert.equal(store.error, PUBLIC_ERROR)
    assert.equal(store.hydrationBlocked, true)
    assertSentinelRedacted(store)

    const failedControl = await controlLocalFlightSim({ operation: 'start' })
    assert.equal(failedControl.ok, false)
    assert.equal(failedControl.flight.decisions.path, FLIGHT_SIM_SAVE_PATH)
    assert.equal(failedControl.flight.decisions.error, PUBLIC_ERROR)
    assertSentinelRedacted(failedControl)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
  }
})

test('persist blocks a concurrently corrupted Decision document without leaking or changing it', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  const source = mutableWorkspace(VALID_EMPTY_SAVE)

  try {
    assert.deepEqual(
      await loadFlightSimSavedDecisions({ workspace: source.workspace }),
      [],
    )
    queueFlightSimDecisions([DECISION])
    source.replaceText(MALFORMED_SAVE)

    const failed = await persistPendingFlightSimDecisions({
      workspace: source.workspace,
    })
    assert.equal(failed.status, 'error')
    assert.equal(failed.errorKind, 'load')
    assert.equal(failed.hydrationBlocked, true)
    assert.equal(failed.retainedCount, 1)
    assert.equal(failed.savedCount, 0)
    assert.equal(failed.error, PUBLIC_ERROR)
    assert.equal(source.readText(), MALFORMED_SAVE)
    assertSentinelRedacted(failed)

    const store = readFlightSimDecisionStore()
    assert.deepEqual(store, failed)
    assertSentinelRedacted(store)

    const hud = projectFlightSimHud({
      flight: readFlightSimSnapshot(),
      save: store,
      savePath: FLIGHT_SIM_SAVE_PATH,
      hydrationPending: false,
    })
    assert.equal(hud.save.path, FLIGHT_SIM_SAVE_PATH)
    assert.equal(hud.save.error, PUBLIC_ERROR)
    assert.equal(hud.error?.path, FLIGHT_SIM_SAVE_PATH)
    assertSentinelRedacted(hud)

    const failedControl = await controlLocalFlightSim({ operation: 'start' })
    assert.equal(failedControl.ok, false)
    assert.equal(failedControl.flight.decisions.path, FLIGHT_SIM_SAVE_PATH)
    assert.equal(failedControl.flight.decisions.error, PUBLIC_ERROR)
    assertSentinelRedacted(failedControl)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
  }
})

test('persist treats a corrupted read-back as a redacted load failure and restores prior bytes', async () => {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  const source = mutableWorkspace(VALID_EMPTY_SAVE)

  try {
    await loadFlightSimSavedDecisions({ workspace: source.workspace })
    queueFlightSimDecisions([DECISION])
    let savePathReadCount = 0
    const corruptedReadBackWorkspace: WorkspaceFs = {
      ...source.workspace,
      readFileText: async path => {
        if (path === FLIGHT_SIM_SAVE_PATH) {
          savePathReadCount += 1
          if (savePathReadCount === 3) return MALFORMED_SAVE
        }
        return source.workspace.readFileText(path)
      },
    }

    const failed = await persistPendingFlightSimDecisions({
      workspace: corruptedReadBackWorkspace,
    })
    assert.equal(failed.status, 'error')
    assert.equal(failed.errorKind, 'load')
    assert.equal(failed.hydrationBlocked, true)
    assert.equal(failed.retainedCount, 1)
    assert.equal(failed.error, PUBLIC_ERROR)
    assert.equal(source.readText(), VALID_EMPTY_SAVE)
    assertSentinelRedacted(failed)
  } finally {
    if (readFlightSimSnapshot().active) exitFlightSimSurface()
    resetFlightSimDecisionStoreForTests()
    resetFlightSimRuntimeForTests()
  }
})
