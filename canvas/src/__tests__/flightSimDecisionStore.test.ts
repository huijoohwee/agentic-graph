import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeDecisionsIntoKgcMarkdown } from '../../../ecs/decisionDocument.js'
import {
  FLIGHT_SIM_SAVE_PATH,
  loadFlightSimSavedDecisions,
  persistPendingFlightSimDecisions,
  queueFlightSimDecisions,
  readFlightSimDecisionStore,
  resolveFlightSimEffectiveSaveStatus,
  resetFlightSimDecisionStoreForTests,
  resetFlightSimLocalSave,
  subscribeFlightSimDecisionStore,
} from '../features/game-flight-sim/flightSimDecisionStore'
import type { FlightSimDecisionRecord } from '../features/game-flight-sim/flightSimModel'
import type { WorkspaceEntry, WorkspaceFs } from '../features/workspace-fs/types'

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

const PRIOR_SAVE = [
  '---',
  'flow:',
  '  nodes: []',
  '  edges: []',
  '---',
  '',
].join('\n')

test('a later run with pending Decisions cannot inherit an earlier saved HUD state', () => {
  assert.equal(resolveFlightSimEffectiveSaveStatus('saved', 2), 'pending')
  assert.equal(resolveFlightSimEffectiveSaveStatus('saving', 2), 'saving')
  assert.equal(resolveFlightSimEffectiveSaveStatus('error', 2), 'error')
  assert.equal(resolveFlightSimEffectiveSaveStatus('saved', 0), 'saved')
})

function testWorkspace(initialText?: string): WorkspaceFs {
  const entries = new Map<string, WorkspaceEntry>()
  entries.set('/', {
    path: '/',
    parentPath: null,
    kind: 'folder',
    name: '',
    updatedAtMs: 0,
  })
  if (initialText !== undefined) {
    entries.set('/game-flight-sim', {
      path: '/game-flight-sim',
      parentPath: '/',
      kind: 'folder',
      name: 'game-flight-sim',
      updatedAtMs: 0,
    })
    entries.set(FLIGHT_SIM_SAVE_PATH, {
      path: FLIGHT_SIM_SAVE_PATH,
      parentPath: '/game-flight-sim',
      kind: 'file',
      name: 'mission-1-decisions.md',
      text: initialText,
      updatedAtMs: 0,
    })
  }
  return {
    ensureSeed: async () => false,
    listEntries: async () => [...entries.values()],
    readFileText: async path => entries.get(path)?.text ?? null,
    writeFileText: async (path, text) => {
      const prior = entries.get(path)
      if (prior?.kind === 'file') entries.set(path, { ...prior, text })
    },
    createFolder: async ({ parentPath, name }) => {
      const path = `${parentPath === '/' ? '' : parentPath}/${name}`
      entries.set(path, {
        path,
        parentPath,
        kind: 'folder',
        name,
        updatedAtMs: 0,
      })
      return path
    },
    createFile: async ({ parentPath, name, text }) => {
      const path = `${parentPath === '/' ? '' : parentPath}/${name}`
      entries.set(path, {
        path,
        parentPath,
        kind: 'file',
        name,
        text,
        updatedAtMs: 0,
      })
      return path
    },
    deleteEntry: async path => {
      entries.delete(path)
    },
  }
}

test('Flight Sim Decision save uses its local path, verifies read-back, and is idempotent', async () => {
  resetFlightSimDecisionStoreForTests()
  assert.equal(FLIGHT_SIM_SAVE_PATH, '/game-flight-sim/mission-1-decisions.md')
  const workspace = testWorkspace()

  queueFlightSimDecisions([DECISION])
  const saved = await persistPendingFlightSimDecisions({ workspace })
  assert.equal(saved.status, 'saved')
  assert.equal(saved.retainedCount, 0)
  assert.equal(saved.savedCount, 1)
  assert.deepEqual(await loadFlightSimSavedDecisions({ workspace }), [DECISION])

  queueFlightSimDecisions([DECISION])
  const idempotent = await persistPendingFlightSimDecisions({ workspace })
  assert.equal(idempotent.status, 'saved')
  assert.equal(idempotent.retainedCount, 0)
  assert.equal(idempotent.savedCount, 1)
  assert.deepEqual(await loadFlightSimSavedDecisions({ workspace }), [DECISION])
})

test('Flight Sim Decision persistence admits canonical generic dialogue_outcome records', async () => {
  resetFlightSimDecisionStoreForTests()
  const workspace = testWorkspace()
  const dialogue: FlightSimDecisionRecord = Object.freeze({
    decisionId: 'flight-sim:dialogue:operator-ack',
    decisionType: 'dialogue_outcome',
    entityRef: 'flight-sim:operator',
    payload: Object.freeze({
      accepted: true,
      outcome: 'acknowledged',
    }),
    producedAt: '2026-07-24T00:00:00.000Z',
  })
  queueFlightSimDecisions([dialogue])
  const saved = await persistPendingFlightSimDecisions({ workspace })
  assert.equal(saved.status, 'saved')
  assert.deepEqual(await loadFlightSimSavedDecisions({ workspace }), [dialogue])
})

test('Flight Sim queue rejects invalid feature Decisions before retaining or writing bytes', async () => {
  resetFlightSimDecisionStoreForTests()
  const workspace = testWorkspace(PRIOR_SAVE)
  const invalid = Object.freeze({
    decisionId: 'foreign:credential-bearing-decision',
    decisionType: 'quest_flag',
    entityRef: 'foreign:mission',
    payload: Object.freeze({
      event: 'not-a-flight-event',
      missionId: 'foreign-mission',
      credentials: 'must-not-persist',
    }),
    producedAt: '2026-07-24T00:00:00.000Z',
  }) as unknown as FlightSimDecisionRecord

  assert.throws(
    () => queueFlightSimDecisions([invalid]),
    /Unsupported Flight Sim Decision event/,
  )
  assert.equal(readFlightSimDecisionStore().retainedCount, 0)
  await persistPendingFlightSimDecisions({ workspace })
  assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), PRIOR_SAVE)
  assert.doesNotMatch(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH) || '', /must-not-persist/)
})

test('aborted Decision persistence restores source bytes and never publishes saved state', async () => {
  resetFlightSimDecisionStoreForTests()
  const base = testWorkspace(PRIOR_SAVE)
  let signalWriteStarted!: () => void
  let releaseWrite!: () => void
  const writeStarted = new Promise<void>(resolve => {
    signalWriteStarted = resolve
  })
  const writeAllowed = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const workspace: WorkspaceFs = {
    ...base,
    writeFileText: async (path, text) => {
      await base.writeFileText(path, text)
      signalWriteStarted()
      await writeAllowed
    },
  }
  const observedStatuses: string[] = []
  queueFlightSimDecisions([DECISION])
  const before = readFlightSimDecisionStore()
  const controller = new AbortController()
  const stopObserving = subscribeFlightSimDecisionStore(() => {
    observedStatuses.push(readFlightSimDecisionStore().status)
  })

  const saving = persistPendingFlightSimDecisions({
    workspace,
    signal: controller.signal,
  })
  await writeStarted
  controller.abort(new Error('synthetic Flight WebMCP deadline'))
  assert.deepEqual(readFlightSimDecisionStore(), before)
  releaseWrite()
  await assert.rejects(saving, /synthetic Flight WebMCP deadline/)
  stopObserving()

  assert.equal(await base.readFileText(FLIGHT_SIM_SAVE_PATH), PRIOR_SAVE)
  assert.deepEqual(readFlightSimDecisionStore(), before)
  assert.deepEqual(observedStatuses, ['saving', before.status])
})

test('Flight Sim Decision write failure retains pending state and source bytes', async () => {
  resetFlightSimDecisionStoreForTests()
  const base = testWorkspace(PRIOR_SAVE)
  const failing: WorkspaceFs = {
    ...base,
    writeFileText: async () => {
      throw new Error('write denied')
    },
    createFile: async () => {
      throw new Error('create denied')
    },
  }
  const before = await failing.readFileText(FLIGHT_SIM_SAVE_PATH)

  queueFlightSimDecisions([DECISION])
  const failed = await persistPendingFlightSimDecisions({ workspace: failing })
  assert.equal(failed.status, 'error')
  assert.equal(failed.errorKind, 'write')
  assert.equal(failed.retainedCount, 1)
  assert.match(failed.error || '', /denied/)
  assert.equal(await failing.readFileText(FLIGHT_SIM_SAVE_PATH), before)

  await loadFlightSimSavedDecisions({ workspace: base })
  const afterRestartValidation = readFlightSimDecisionStore()
  assert.equal(afterRestartValidation.status, 'error')
  assert.equal(afterRestartValidation.errorKind, 'write')
  assert.equal(afterRestartValidation.retainedCount, 1)
})

test('Flight Sim Decision verification failure rolls source bytes back', async () => {
  resetFlightSimDecisionStoreForTests()
  const base = testWorkspace(PRIOR_SAVE)
  let injectStaleReadBack = false
  let staleReadBackInjected = false
  const mismatchedReadBack: WorkspaceFs = {
    ...base,
    readFileText: async path => {
      if (
        path === FLIGHT_SIM_SAVE_PATH
        && injectStaleReadBack
        && !staleReadBackInjected
      ) {
        staleReadBackInjected = true
        return PRIOR_SAVE
      }
      return base.readFileText(path)
    },
    writeFileText: async (path, text) => {
      await base.writeFileText(path, text)
      injectStaleReadBack = true
    },
  }

  queueFlightSimDecisions([DECISION])
  const failed = await persistPendingFlightSimDecisions({
    workspace: mismatchedReadBack,
  })

  assert.equal(failed.status, 'error')
  assert.equal(failed.errorKind, 'write')
  assert.equal(failed.retainedCount, 1)
  assert.match(failed.error || '', /read-back did not contain/)
  assert.equal(await base.readFileText(FLIGHT_SIM_SAVE_PATH), PRIOR_SAVE)
})

test('Flight Sim malformed save fails closed until explicit reset', async () => {
  resetFlightSimDecisionStoreForTests()
  const malformed = '---\nflow:\n  nodes: [not valid\n---\n'
  const workspace = testWorkspace(malformed)

  await assert.rejects(() => loadFlightSimSavedDecisions({ workspace }))
  assert.equal(readFlightSimDecisionStore().status, 'error')
  assert.equal(readFlightSimDecisionStore().errorKind, 'load')
  assert.equal(readFlightSimDecisionStore().hydrationBlocked, true)
  assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), malformed)

  queueFlightSimDecisions([DECISION])
  const blockedSave = await persistPendingFlightSimDecisions({ workspace })
  assert.equal(blockedSave.status, 'error')
  assert.equal(blockedSave.hydrationBlocked, true)
  assert.equal(blockedSave.retainedCount, 1)
  assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), malformed)

  const reset = await resetFlightSimLocalSave({ workspace })
  assert.equal(reset.status, 'saved')
  assert.equal(reset.hydrationBlocked, false)
  assert.deepEqual(await loadFlightSimSavedDecisions({ workspace }), [])
})

test('Flight Sim canonical cross-domain save blocks hydration without changing bytes', async () => {
  resetFlightSimDecisionStoreForTests()
  const crossDomainDecision = {
    ...DECISION,
    decisionId: 'flight-sim:test:cross-domain',
    payload: {
      ...DECISION.payload,
      missionId: 'another-mission',
    },
  }
  const invalidSave = mergeDecisionsIntoKgcMarkdown(
    PRIOR_SAVE,
    [crossDomainDecision],
  ).markdown
  const workspace = testWorkspace(invalidSave)

  await assert.rejects(
    () => loadFlightSimSavedDecisions({ workspace }),
    /Unreadable \/game-flight-sim\/mission-1-decisions\.md: local Decision document is invalid\./,
  )
  const blocked = readFlightSimDecisionStore()
  assert.equal(blocked.status, 'error')
  assert.equal(blocked.errorKind, 'load')
  assert.equal(blocked.hydrationBlocked, true)
  assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), invalidSave)
})

test('Flight Sim save rejects forbidden payload fields without changing bytes', async () => {
  resetFlightSimDecisionStoreForTests()
  const invalidSave = mergeDecisionsIntoKgcMarkdown(PRIOR_SAVE, [{
    ...DECISION,
    decisionId: 'flight-sim:test:forbidden-payload',
    payload: {
      ...DECISION.payload,
      credentials: 'must-not-persist',
    },
  }]).markdown
  const workspace = testWorkspace(invalidSave)

  await assert.rejects(
    () => loadFlightSimSavedDecisions({ workspace }),
    /Unreadable \/game-flight-sim\/mission-1-decisions\.md: local Decision document is invalid\./,
  )
  assert.equal(readFlightSimDecisionStore().hydrationBlocked, true)
  assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), invalidSave)
})

test('Flight Sim hydration blocks exhausted run ids and flying state at the terminal tick', async () => {
  const flyingState = {
    ...DECISION,
    decisionId: 'flight-sim:test:terminal-tick-flying',
    decisionType: 'world_tick_result' as const,
    payload: {
      event: 'flight_state',
      missionId: 'flight-sim-mission-1',
      runId: 1,
      tick: 60 * 90,
      position: [0, 8, 0],
      velocity: [0, 0, -8],
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0.6,
      waypointIndex: 0,
      phase: 'flying',
    },
  }
  const invalidDecisions = [
    {
      ...DECISION,
      decisionId: 'flight-sim:test:exhausted-run',
      payload: {
        ...DECISION.payload,
        runId: Number.MAX_SAFE_INTEGER - 1,
      },
    },
    flyingState,
    {
      ...flyingState,
      decisionId: 'flight-sim:test:finite-out-of-range',
      payload: {
        ...flyingState.payload,
        tick: 1,
        position: [1e40, 8, 0],
      },
    },
    {
      ...DECISION,
      decisionId: 'flight-sim:run-2:tick-42:mission_completed:mission',
    },
    {
      ...DECISION,
      producedAt: '2026-01-01T00:00:00.843Z',
    },
  ]
  for (const invalidDecision of invalidDecisions) {
    resetFlightSimDecisionStoreForTests()
    const invalidSave = mergeDecisionsIntoKgcMarkdown(PRIOR_SAVE, [invalidDecision]).markdown
    const workspace = testWorkspace(invalidSave)
    await assert.rejects(() => loadFlightSimSavedDecisions({ workspace }))
    assert.equal(readFlightSimDecisionStore().hydrationBlocked, true)
    assert.equal(await workspace.readFileText(FLIGHT_SIM_SAVE_PATH), invalidSave)
  }
})

test('Flight Sim Reset waits for an underway Save before replacing its document', async () => {
  resetFlightSimDecisionStoreForTests()
  const base = testWorkspace()
  let savePathReadCount = 0
  let signalSaveReadBackStarted!: () => void
  let releaseSaveReadBack!: () => void
  const saveReadBackStarted = new Promise<void>(resolve => {
    signalSaveReadBackStarted = resolve
  })
  const saveReadBackAllowed = new Promise<void>(resolve => {
    releaseSaveReadBack = resolve
  })
  const workspace: WorkspaceFs = {
    ...base,
    readFileText: async path => {
      if (path === FLIGHT_SIM_SAVE_PATH) {
        savePathReadCount += 1
        if (savePathReadCount === 3) {
          signalSaveReadBackStarted()
          await saveReadBackAllowed
        }
      }
      return base.readFileText(path)
    },
  }

  queueFlightSimDecisions([DECISION])
  const saving = persistPendingFlightSimDecisions({ workspace })
  await saveReadBackStarted
  let resetSettledWhileSaveBlocked = false
  const resetting = resetFlightSimLocalSave({ workspace }).then(result => {
    resetSettledWhileSaveBlocked = true
    return result
  })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(resetSettledWhileSaveBlocked, false)
  releaseSaveReadBack()

  const [saved, reset] = await Promise.all([saving, resetting])
  assert.equal(saved.status, 'saved')
  assert.equal(saved.savedCount, 1)
  assert.equal(reset.status, 'saved')
  assert.equal(reset.savedCount, 0)
  assert.equal(reset.retainedCount, 0)
  const resetDocument = await base.readFileText(FLIGHT_SIM_SAVE_PATH)
  assert.ok(resetDocument)
  assert.match(resetDocument, /title: "Knowgrph Flight Sim Mission 1 Decisions"/)
  assert.match(resetDocument, / {2}nodes: \[\]/)
  assert.doesNotMatch(resetDocument, /flight-sim:test:mission-completed/)
})
