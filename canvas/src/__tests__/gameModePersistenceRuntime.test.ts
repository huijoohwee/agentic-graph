import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { GameFpsHud } from '@/features/game-fps/GameFpsHud'
import {
  advanceGameFpsBy,
  hasGameFpsMission,
  publishRuntimeFailure,
  readGameFpsRunId,
  readGameFpsSnapshot,
  resetGameFpsRuntimeForTests,
  restartGameFpsMission,
} from '@/features/game-fps/gameFpsRuntime'
import type { WorkspaceFs } from '@/features/workspace-fs/types'
import {
  buildGameModeInvocation,
  controlLocalGameMode,
  inspectLocalGameMode,
} from '@/features/game-fps/gameModeMcpRuntime'
import {
  armGameModeSimulation,
  persistGameModePendingDecisions,
  readGameModeSnapshot,
  resetGameModeRuntimeForTests,
  restartGameMode,
  startGameMode,
} from '@/features/game-fps/gameModeRuntime'
import {
  GAME_FPS_SAVE_PATH,
  persistPendingGameFpsDecisions,
  queueGameFpsDecisions,
  readGameFpsDecisionStore,
  reportGameFpsDecisionLoadFailure,
  resetGameFpsDecisionStoreForTests,
  resetGameFpsLocalSave,
} from '@/features/game-fps/gameFpsDecisionStore'
import { GAME_FPS_FIXED_STEP_SECONDS } from '@/features/game-fps/gameFpsModel'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { mergeDecisionsIntoAgenticOsMarkdown } from '../../../ecs/decisionDocument.js'
import { installGameModeRuntimeTestLifecycle } from './helpers/gameModeRuntimeTestLifecycle'

installGameModeRuntimeTestLifecycle('game-mode-persistence-runtime')

async function withRenderedHud(assertHud: (container: HTMLElement, hud: HTMLElement) => void): Promise<void> {
  const { dom, restore } = initJsdomHarness(
    '<!doctype html><html><body><section id="game-fps-hud-root"></section></body></html>',
  )
  const container = dom.window.document.getElementById('game-fps-hud-root')
  if (!container) throw new Error('missing Game FPS HUD test root')
  const root = createRoot(container)
  try {
    await mountReactRoot(root, React.createElement(GameFpsHud), {
      window: dom.window as unknown as Window,
      frames: 1,
    })
    const hud = container.querySelector<HTMLElement>('[data-kg-game-fps-hud="1"]')
    assert.ok(hud)
    assertHud(container, hud)
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restore()
  }
}

async function assertRenderedHudError(error: RegExp): Promise<void> {
  await withRenderedHud((container, hud) => {
    assert.match(hud.dataset.kgGameFpsSaveError || '', error)
    assert.ok([...container.querySelectorAll('[role="alert"]')].some(alert => error.test(alert.textContent || '')))
    assert.ok(container.querySelector('[data-kg-game-fps-action="reset-save"]'))
  })
}

test('Game Mode uses one strict native invocation tuple and browser WebMCP pair', async () => {
  assert.equal(buildGameModeInvocation('start'), '/game.mode @canvas #gameplay operation=start')
  assert.equal((await controlLocalGameMode({ invocation: buildGameModeInvocation('stop') })).ok, false)
  assert.equal((await controlLocalGameMode({ invocation: buildGameModeInvocation('exit') })).ok, false)
  assert.equal((await controlLocalGameMode({ invocation: buildGameModeInvocation('open') })).ok, true)
  assert.equal((await controlLocalGameMode({ invocation: '/game.mode @canvas @canvas #gameplay operation=open' })).ok, false)
  assert.equal((await controlLocalGameMode({ invocation: '/game.mode @canvas #gameplay #pose operation=open' })).ok, false)
  assert.equal((await controlLocalGameMode({ invocation: '/game.mode @canvas #gameplay operation=open operation=start' })).ok, false)
  assert.equal((await controlLocalGameMode({ invocation: buildGameModeInvocation('start'), operation: 'start' })).ok, false)
  assert.equal((await controlLocalGameMode({ operation: 'unknown' as 'open' })).ok, false)

  const inspection = inspectLocalGameMode()
  assert.equal(inspection.schema, 'agentic-graph-game-mode-mcp/v1')
  assert.equal(inspection.webMcpTools.inspect, 'agentic-graph.inspect_local_game_mode')
  assert.equal(inspection.webMcpTools.control, 'agentic-graph.control_local_game_mode')
  assert.deepEqual(inspection.runtime.npcActions, ['hold', 'alert', 'engage', 'flee'])
  assert.equal(inspection.runtime.hitscan, 'normalized-slab-aabb')

  const contracts = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true })
  assert.ok(contracts.some(contract => contract.name === 'inspect_local_game_mode'))
  assert.ok(contracts.some(contract => contract.name === 'control_local_game_mode'))
})

test('MCP Start fails closed when the existing mission has a runtime error', async () => {
  const { dom, restore } = initJsdomHarness()
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      getExtension: (name: string) => name === 'WEBGL_lose_context'
        ? { loseContext: () => void 0 }
        : null,
    }),
  })
  try {
    await startGameMode({ decisions: [], webglSupported: true })
    publishRuntimeFailure(new Error('authored scene tick failed'))
    const result = await controlLocalGameMode({ operation: 'start' })
    assert.equal(result.ok, false)
    assert.match(result.message, /authored scene tick failed.*Restart Game Mode/i)
    assert.equal(readGameModeSnapshot().launchStatus, 'error')
    assert.equal(readGameModeSnapshot().simulationStatus, 'idle')
    assert.match(readGameFpsSnapshot().runtimeError || '', /authored scene tick failed/)
  } finally {
    restore()
  }
})

test('direct duplicate Decision input fails before creating an ECS World', async () => {
  const decision = {
    decisionId: 'game-fps:direct-input:duplicate',
    decisionType: 'world_tick_result' as const,
    entityRef: 'npc-scout',
    payload: {
      event: 'npc_action', missionId: 'game-fps-mission-1', runId: 1, tick: 1, action: 'hold',
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
  const result = await startGameMode({ decisions: [decision, decision], webglSupported: true })
  assert.equal(result.launchStatus, 'error')
  assert.match(result.message, /occurs more than once|duplicate/i)
  assert.equal(hasGameFpsMission(), false)
  assert.equal(readGameFpsRunId(), 0)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
})

test('Game Mode Restart validates fresh Decisions and advances beyond persisted run ids', async () => {
  const persistedDecision = {
    decisionId: 'game-fps:run-7:tick-1:decision-0',
    decisionType: 'world_tick_result',
    entityRef: 'npc-scout',
    payload: {
      event: 'npc_action', missionId: 'game-fps-mission-1', runId: 7, tick: 1, action: 'hold',
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
  const persistedText = mergeDecisionsIntoAgenticOsMarkdown([
    '---', 'flow:', '  nodes: []', '  edges: []', '---', '',
  ].join('\n'), [persistedDecision]).markdown
  const workspace = { readFileText: async () => persistedText } as unknown as WorkspaceFs
  const restarted = await restartGameMode({ webglSupported: true, workspace })
  assert.equal(restarted.launchStatus, 'ready')
  assert.equal(readGameFpsSnapshot().phase, 'playing')
  assert.equal(readGameFpsRunId(), 8)
})

test('Decision hydration rejects exhausted run and tick identifiers before creating an ECS World', async () => {
  const invalidBoundaries = [
    {
      label: 'run identifier', runId: Number.MAX_SAFE_INTEGER, tick: 1,
      error: /runId must be a bounded positive safe integer/,
    },
    {
      label: 'tick identifier', runId: 1, tick: 0xffff_ffff,
      error: /Decision tick must be an integer from 0 to 4294967294/,
    },
  ] as const

  for (const boundary of invalidBoundaries) {
    resetGameModeRuntimeForTests()
    resetGameFpsRuntimeForTests()
    resetGameFpsDecisionStoreForTests()
    const decision = {
      decisionId: `game-fps:boundary:${boundary.label.replace(' ', '-')}`,
      decisionType: 'world_tick_result' as const,
      entityRef: 'npc-scout',
      payload: {
        event: 'npc_action', missionId: 'game-fps-mission-1',
        runId: boundary.runId, tick: boundary.tick, action: 'hold',
      },
      producedAt: '2026-01-01T00:00:00.000Z',
    }
    const persistedText = mergeDecisionsIntoAgenticOsMarkdown([
      '---', 'flow:', '  nodes: []', '  edges: []', '---', '',
    ].join('\n'), [decision]).markdown
    const workspace = { readFileText: async () => persistedText } as unknown as WorkspaceFs
    const restarted = await restartGameMode({ webglSupported: true, workspace })
    assert.equal(restarted.launchStatus, 'error', boundary.label)
    assert.match(restarted.message, boundary.error, boundary.label)
    assert.equal(readGameFpsDecisionStore().hydrationBlocked, true, boundary.label)
    assert.equal(readGameFpsRunId(), 0, boundary.label)
    assert.equal(hasGameFpsMission(), false, boundary.label)
    assert.equal(readGameFpsSnapshot().phase, 'stopped', boundary.label)
  }
})

test('the Game FPS runtime refuses to allocate a next run after the known safe range is exhausted', () => {
  const exhaustedDecision = {
    decisionId: 'game-fps:run-boundary:exhausted',
    decisionType: 'world_tick_result' as const,
    entityRef: 'npc-scout',
    payload: {
      event: 'npc_action', missionId: 'game-fps-mission-1',
      runId: Number.MAX_SAFE_INTEGER - 1, tick: 0, action: 'hold',
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
  assert.throws(
    () => restartGameFpsMission({ persistedDecisions: [exhaustedDecision] }),
    /exhausted its bounded run identifier range/,
  )
  assert.equal(readGameFpsRunId(), 0)
  assert.equal(hasGameFpsMission(), false)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
})

test('foreign-mission Decisions cannot exhaust the local Game FPS run range', () => {
  const foreignDecision = {
    decisionId: 'foreign-game:run-boundary',
    decisionType: 'world_tick_result' as const,
    entityRef: 'foreign-npc',
    payload: {
      event: 'npc_action', missionId: 'foreign-mission',
      runId: Number.MAX_SAFE_INTEGER, tick: 0xffff_ffff, action: 'hold',
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
  const mission = restartGameFpsMission({ persistedDecisions: [foreignDecision] })
  assert.equal(mission.phase, 'playing')
  assert.equal(mission.tick, 0)
  assert.equal(readGameFpsRunId(), 1)
  assert.equal(hasGameFpsMission(), true)
})

test('Game Mode Restart blocks a generic-valid Decision outside the Game domain and exposes Reset', async () => {
  const invalidGameDecision = {
    decisionId: 'game-fps:run-3:tick-2:unsupported',
    decisionType: 'quest_flag',
    entityRef: 'game-fps:mission:game-fps-mission-1',
    payload: {
      event: 'mission_paused', missionId: 'game-fps-mission-1', runId: 3, tick: 2,
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
  const persistedText = mergeDecisionsIntoAgenticOsMarkdown([
    '---', 'flow:', '  nodes: []', '  edges: []', '---', '',
  ].join('\n'), [invalidGameDecision]).markdown
  const workspace = { readFileText: async () => persistedText } as unknown as WorkspaceFs
  const restarted = await restartGameMode({ webglSupported: true, workspace })
  assert.equal(restarted.launchStatus, 'error')
  assert.match(restarted.message, /Unsupported Game FPS Decision event: quest_flag:mission_paused/)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  assert.equal(readGameFpsDecisionStore().hydrationBlocked, true)
  await assertRenderedHudError(/Unsupported Game FPS Decision event: quest_flag:mission_paused/)
})

test('Decision Reset followed by the HUD Restart sequence preserves visible saved status', async () => {
  const malformed = '---\nflow:\n  nodes: [not valid\n---\n'
  const workspace = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/game-fps', parentPath: '/', kind: 'folder', name: 'game-fps', updatedAtMs: 1 },
      {
        path: GAME_FPS_SAVE_PATH,
        parentPath: '/game-fps',
        kind: 'file',
        name: 'mission-1-decisions.md',
        text: malformed,
        updatedAtMs: 1,
      },
    ],
  })
  const blocked = await restartGameMode({ webglSupported: true, workspace })
  assert.equal(blocked.launchStatus, 'error')
  assert.equal(readGameFpsDecisionStore().hydrationBlocked, true)
  const reset = await resetGameFpsLocalSave({ workspace })
  assert.equal(reset.status, 'saved')
  assert.equal(reset.hydrationBlocked, false)
  const restarted = await restartGameMode({ webglSupported: true, workspace })
  assert.equal(restarted.launchStatus, 'ready')
  assert.equal(readGameFpsSnapshot().phase, 'playing')
  assert.equal(readGameFpsDecisionStore().status, 'saved')
  assert.equal(readGameFpsDecisionStore().savedCount, 0)
  await withRenderedHud((_container, hud) => {
    assert.equal(hud.dataset.kgGameFpsSaveStatus, 'saved')
    assert.match(hud.textContent || '', /Decisions saved locally/)
  })
})

test('Decision Reset waits for an underway Save before replacing its document', async () => {
  const memory = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    ],
  })
  let savePathReadCount = 0
  let signalSaveReadBackStarted!: () => void
  let releaseSaveReadBack!: () => void
  const saveReadBackStarted = new Promise<void>(resolve => { signalSaveReadBackStarted = resolve })
  const saveReadBackAllowed = new Promise<void>(resolve => { releaseSaveReadBack = resolve })
  const workspace = {
    ...memory,
    readFileText: async (path: Parameters<WorkspaceFs['readFileText']>[0]) => {
      if (path === GAME_FPS_SAVE_PATH) {
        savePathReadCount += 1
        if (savePathReadCount === 3) {
          signalSaveReadBackStarted()
          await saveReadBackAllowed
        }
      }
      return memory.readFileText(path)
    },
  } as WorkspaceFs
  const decision = {
    decisionId: 'game-fps:reset-race:mission-completed',
    decisionType: 'quest_flag' as const,
    entityRef: 'game-fps:mission:game-fps-mission-1',
    payload: {
      event: 'mission_completed', missionId: 'game-fps-mission-1', runId: 1, status: 'won', tick: 42,
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }

  queueGameFpsDecisions([decision])
  const saving = persistPendingGameFpsDecisions({ workspace })
  await saveReadBackStarted
  let resetSettledWhileSaveBlocked = false
  const resetting = resetGameFpsLocalSave({ workspace }).then(result => {
    resetSettledWhileSaveBlocked = true
    return result
  })
  await Promise.resolve()
  await Promise.resolve()
  const resetSettledBeforeRelease = resetSettledWhileSaveBlocked
  releaseSaveReadBack()

  const [saved, reset] = await Promise.all([saving, resetting])
  assert.equal(resetSettledBeforeRelease, false)
  assert.equal(saved.status, 'saved')
  assert.equal(saved.savedCount, 1)
  assert.equal(reset.status, 'saved')
  assert.equal(reset.savedCount, 0)
  assert.equal(reset.retainedCount, 0)
  const resetDocument = await memory.readFileText(GAME_FPS_SAVE_PATH)
  assert.ok(resetDocument)
  assert.match(resetDocument, /  nodes: \[\]/)
  assert.doesNotMatch(resetDocument, /game-fps:reset-race:mission-completed/)
})

test('Decision Save acknowledgement survives Restart and an underway resumed tick', async () => {
  const memory = createMemoryWorkspaceFs({
    initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    ],
  })
  let savePathReadCount = 0
  let signalReadBackStarted!: () => void
  let releaseReadBack!: () => void
  const readBackStarted = new Promise<void>(resolve => { signalReadBackStarted = resolve })
  const readBackAllowed = new Promise<void>(resolve => { releaseReadBack = resolve })
  const workspace = {
    ...memory,
    readFileText: async (path: Parameters<WorkspaceFs['readFileText']>[0]) => {
      if (path === GAME_FPS_SAVE_PATH) {
        savePathReadCount += 1
        if (savePathReadCount === 3) {
          signalReadBackStarted()
          await readBackAllowed
        }
      }
      return memory.readFileText(path)
    },
  } as WorkspaceFs

  await startGameMode({ decisions: [], webglSupported: true })
  armGameModeSimulation()
  await advanceGameFpsBy(0.25)
  const decisions = [...readGameFpsSnapshot().pendingDecisions]
  assert.ok(decisions.length > 0, 'the NPC decision interval must provide a Save fixture')

  const saving = persistGameModePendingDecisions({ workspace })
  await readBackStarted
  let advancing!: Promise<ReturnType<typeof readGameFpsSnapshot>>
  let afterRestartDecisionIds: readonly string[] = []
  try {
    const restarted = await restartGameMode({ webglSupported: true, workspace })
    assert.equal(restarted.launchStatus, 'ready')
    const restartedRunId = readGameFpsRunId()
    armGameModeSimulation()
    const afterRestartEmission = await advanceGameFpsBy(0.25)
    const afterRestartDecisions = afterRestartEmission.pendingDecisions.filter(decision => (
      decision.payload.runId === restartedRunId
    ))
    assert.ok(afterRestartDecisions.length > 0, 'the restarted run must emit Decisions before Save acknowledgment')
    afterRestartDecisionIds = afterRestartDecisions.map(decision => decision.decisionId)
    advancing = advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * 2)
    await Promise.resolve()
    await Promise.resolve()
  } finally {
    releaseReadBack()
  }

  const saved = await saving
  assert.equal(saved.status, 'saved')
  assert.ok(decisions.every(decision => (
    !readGameFpsSnapshot().pendingDecisions.some(candidate => candidate.decisionId === decision.decisionId)
  )))
  const settled = await advancing
  assert.ok(afterRestartDecisionIds.length > 0)
  assert.ok(afterRestartDecisionIds.every(decisionId => (
    settled.pendingDecisions.some(decision => decision.decisionId === decisionId)
  )), 'the older Save must not acknowledge Decisions emitted by the restarted run')
  assert.equal(settled.runtimeError, null)
})

test('Game Mode Restart rejects duplicate persisted decisionId nodes before mission launch', async () => {
  const persistedDecision = {
    decisionId: 'game-fps:run-4:tick-1:duplicate',
    decisionType: 'world_tick_result',
    entityRef: 'npc-scout',
    payload: {
      event: 'npc_action', missionId: 'game-fps-mission-1', runId: 4, tick: 1, action: 'hold',
    },
    producedAt: '2026-01-01T00:00:00.000Z',
  }
  const singleNodeText = mergeDecisionsIntoAgenticOsMarkdown([
    '---', 'flow:', '  nodes: []', '  edges: []', '---', '',
  ].join('\n'), [persistedDecision]).markdown
  const nodeBlock = singleNodeText.match(/    - id:.*\n(?:      .*\n)+/)?.[0]
  assert.ok(nodeBlock)
  const duplicateNodeText = singleNodeText.replace(
    '  edges: []',
    `${nodeBlock.replace('ecs-decision:game-fps:run-4:tick-1:duplicate', 'ecs-decision:duplicate-node-copy')}  edges: []`,
  )
  const workspace = { readFileText: async () => duplicateNodeText } as unknown as WorkspaceFs
  const restarted = await restartGameMode({ webglSupported: true, workspace })
  assert.equal(restarted.launchStatus, 'error')
  assert.match(restarted.message, /duplicate|occurs more than once/i)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  assert.equal(readGameFpsDecisionStore().hydrationBlocked, true)
  await assertRenderedHudError(/duplicate|occurs more than once/i)
})

test('Game Mode fails closed for unreadable Decisions and unavailable WebGL', async () => {
  const malformedWorkspace = {
    readFileText: async () => '---\nflow:\n  nodes: [not valid\n---\n',
  } as unknown as WorkspaceFs
  const freshBlockedRestart = await restartGameMode({ webglSupported: true, workspace: malformedWorkspace })
  assert.equal(freshBlockedRestart.launchStatus, 'error')
  assert.match(freshBlockedRestart.message, /Unreadable .*mission-1-decisions\.md/)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')

  resetGameFpsDecisionStoreForTests()
  reportGameFpsDecisionLoadFailure(new Error('malformed local save'))
  queueGameFpsDecisions([{
    decisionId: 'game-fps:test:blocked-restart',
    decisionType: 'quest_flag',
    entityRef: 'game-fps:mission:game-fps-mission-1',
    payload: { event: 'mission_completed', missionId: 'game-fps-mission-1', status: 'won', tick: 1 },
    producedAt: '2026-01-01T00:00:00.000Z',
  }])
  const blockedRestart = await restartGameMode({ webglSupported: true })
  assert.equal(blockedRestart.launchStatus, 'error')
  assert.match(blockedRestart.message, /Unreadable .*malformed local save/)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')

  resetGameFpsDecisionStoreForTests()
  const unsupported = await startGameMode({ decisions: [], webglSupported: false })
  assert.equal(unsupported.launchStatus, 'error')
  assert.match(unsupported.message, /WebGL is unavailable/)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  assert.equal(inspectLocalGameMode().gameMode.webglSupported, false)
  assert.equal(inspectLocalGameMode().runtime.webglSupported, false)
  assert.equal((await controlLocalGameMode({ operation: 'start' })).ok, false)
})
