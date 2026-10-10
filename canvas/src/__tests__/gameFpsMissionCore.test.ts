import assert from 'node:assert/strict'
import test from 'node:test'

import {
  gameFpsRayAabbDistance,
  hasGameFpsLineOfSight,
  selectGameFpsRayAabbHit,
} from '../features/game-fps/gameFpsGeometry'
import {
  captureGameFpsAuthoredMission,
  createGameFpsAuthoredMission,
  tickGameFpsAuthoredMission,
} from '../features/game-fps/gameFpsMission'
import {
  scoreGameFpsNpcActions,
  selectGameFpsNpcAction,
  GAME_FPS_NPC_ENGAGE_DISTANCE_METERS,
} from '../features/game-fps/gameFpsNpcPolicy'
import {
  acknowledgeGameFpsDecisions,
  advanceGameFpsBy,
  queueGameFpsFire,
  readGameFpsSpatialProfile,
  readGameFpsSnapshot,
  reloadGameFpsWeapon,
  resetGameFpsRuntimeForTests,
  setGameFpsInput,
  startGameFpsMission,
} from '../features/game-fps/gameFpsRuntime'
import {
  GAME_FPS_FIXED_STEP_SECONDS,
  GAME_FPS_MISSION_ID,
  GAME_FPS_NPC_ACTIONS,
  GAME_FPS_NPC_DECISION_INTERVAL_TICKS,
  GAME_FPS_ZERO_COST_LOG,
  gameFpsSpatialProfilesMatch,
  type GameFpsSnapshot,
  type GameFpsSpatialProfile,
  type GameFpsTickInput,
} from '../features/game-fps/gameFpsModel'
import {
  gameFpsInputPatchFromHeldTouches,
  gameFpsInputPatchFromPressedCodes,
  releaseGameFpsHeldTouch,
  type GameFpsTouchAction,
  updateGameFpsPressedCode,
} from '../features/game-fps/gameFpsInput'
import { readWebglSupport } from '../lib/three/webglSupport'

function gameplayProjection(snapshot: GameFpsSnapshot) {
  return {
    phase: snapshot.phase,
    player: snapshot.player,
    npcs: snapshot.npcs,
    ammo: snapshot.ammo,
    reserve: snapshot.reserve,
    enemiesAlive: snapshot.enemiesAlive,
    fireResult: snapshot.fireResult,
    tick: snapshot.tick,
    elapsedSeconds: snapshot.elapsedSeconds,
    pendingDecisions: snapshot.pendingDecisions,
    lastCostLog: snapshot.lastCostLog,
    runtimeError: snapshot.runtimeError,
  }
}

function hudProjection(snapshot: GameFpsSnapshot) {
  return {
    phase: snapshot.phase,
    health: snapshot.player.health,
    ammo: snapshot.ammo,
    reserve: snapshot.reserve,
    enemiesAlive: snapshot.enemiesAlive,
    fireResult: snapshot.fireResult,
    tick: snapshot.tick,
    runtimeError: snapshot.runtimeError,
  }
}

function canonicalSerialization(value: unknown): string {
  return JSON.stringify(value)
}

function visibleTarget(snapshot: GameFpsSnapshot) {
  const spatialMap = readGameFpsSpatialProfile().map
  return snapshot.npcs.filter(npc => (
    npc.health > 0 && hasGameFpsLineOfSight(snapshot.player, npc, spatialMap)
  ))
    .sort((left, right) => {
      const leftDistance = Math.hypot(left.x - snapshot.player.x, left.z - snapshot.player.z)
      const rightDistance = Math.hypot(right.x - snapshot.player.x, right.z - snapshot.player.z)
      return leftDistance - rightDistance || left.id.localeCompare(right.id)
    })[0]
}

async function aimAndFireAtVisibleTarget(): Promise<GameFpsSnapshot> {
  let before = readGameFpsSnapshot()
  if (before.ammo === 0) {
    reloadGameFpsWeapon()
    before = await advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS)
    assert.equal(before.fireResult, 'reloaded')
  }
  const target = visibleTarget(before)
  assert.ok(target, 'the authored mission must always expose a reachable target')
  const deltaX = target.x - before.player.x
  const deltaZ = target.z - before.player.z
  const horizontalDistance = Math.hypot(deltaX, deltaZ)
  const desiredYaw = Math.atan2(-deltaX, -deltaZ)
  const desiredPitch = Math.atan2(1.1 - 1.6, horizontalDistance)
  setGameFpsInput({
    lookYawDelta: desiredYaw - before.player.yaw,
    lookPitchDelta: desiredPitch - before.player.pitch,
  })
  queueGameFpsFire()
  const after = await advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS)
  assert.equal(after.tick, before.tick + 1, 'queued fire must resolve in one fixed World_Tick')
  assert.ok(['hit', 'eliminated'].includes(after.fireResult), `unexpected fire result: ${after.fireResult}`)
  return after
}

test('Game FPS core serializes fixed World_Ticks with deterministic zero-cost output', async () => {
  resetGameFpsRuntimeForTests()
  const playerSpawn = readGameFpsSpatialProfile().playerSpawn
  startGameFpsMission()
  setGameFpsInput({ forward: 1, strafe: 0.25, lookYawDelta: 0.2 })
  await Promise.all([
    advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * 7),
    advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * (GAME_FPS_NPC_DECISION_INTERVAL_TICKS - 7)),
  ])
  const first = readGameFpsSnapshot()
  assert.equal(first.tick, GAME_FPS_NPC_DECISION_INTERVAL_TICKS)
  assert.ok(
    Math.hypot(first.player.x - playerSpawn.x, first.player.z - playerSpawn.z) > 0,
    'held movement input moves the player through the active spatial profile',
  )
  assert.ok(first.pendingDecisions.some(decision => decision.payload.event === 'npc_action'))
  assert.deepEqual(first.lastCostLog, GAME_FPS_ZERO_COST_LOG)
  assert.equal(first.lastCostLog.model, 'none')
  assert.equal(first.lastCostLog.prompt_tokens + first.lastCostLog.completion_tokens, 0)

  const expectedMission = canonicalSerialization(gameplayProjection(first))
  const expectedHud = canonicalSerialization(hudProjection(first))
  resetGameFpsRuntimeForTests()
  startGameFpsMission()
  setGameFpsInput({ forward: 1, strafe: 0.25, lookYawDelta: 0.2 })
  await Promise.all([
    advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * 7),
    advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * (GAME_FPS_NPC_DECISION_INTERVAL_TICKS - 7)),
  ])
  const replayed = readGameFpsSnapshot()
  assert.equal(canonicalSerialization(gameplayProjection(replayed)), expectedMission)
  assert.equal(canonicalSerialization(hudProjection(replayed)), expectedHud)
})

test('slab hitscan returns the AABB entry and resolves equal-distance targets by entityRef', () => {
  const origin = [0, 1, 0] as const
  const direction = [0, 0, -2] as const
  const halfExtents = [1, 0.5, 0.5] as const
  assert.equal(gameFpsRayAabbDistance({
    origin,
    direction,
    center: [0.8, 1, -5],
    halfExtents,
  }), 4.5)

  const selected = selectGameFpsRayAabbHit({
    origin,
    direction,
    maxDistance: 10,
    candidates: [
      { entityRef: 'npc-zeta', center: [0.8, 1, -5], halfExtents },
      { entityRef: 'npc-alpha', center: [-0.8, 1, -5], halfExtents },
    ],
  })
  assert.deepEqual(selected, { entityRef: 'npc-alpha', distance: 4.5 })
})

const FIRE_ONLY_INPUT: GameFpsTickInput = Object.freeze({
  forward: 0,
  strafe: 0,
  lookYawDelta: 0,
  lookPitchDelta: 0,
  sprint: false,
  fire: true,
  reload: false,
})

function hitscanProfile(blocker: GameFpsSpatialProfile['map']['blockers'][number]): GameFpsSpatialProfile {
  return Object.freeze({
    id: 'xr-authored',
    map: Object.freeze({
      centerX: 0,
      centerZ: 0,
      halfWidth: 10,
      halfDepth: 10,
      blockers: Object.freeze([Object.freeze(blocker)]),
    }),
    playerSpawn: Object.freeze({ x: 0, z: 0, yaw: 0, pitch: 0 }),
    npcSeeds: Object.freeze([
      Object.freeze({ id: 'npc-scout', x: 0, z: -5 }),
      Object.freeze({ id: 'npc-west', x: -8, z: -8 }),
      Object.freeze({ id: 'npc-east', x: 8, z: -8 }),
      Object.freeze({ id: 'npc-guard', x: 8, z: 8 }),
    ]),
  })
}

test('mission construction enforces the bounded positive-safe run identifier contract', () => {
  const spatialProfile = hitscanProfile(Object.freeze({
    id: 'run-id-boundary-blocker',
    centerX: 8,
    centerY: 0.25,
    centerZ: 8,
    halfWidth: 0.25,
    halfHeight: 0.25,
    halfDepth: 0.25,
  }))

  for (const runId of [0, Number.MAX_SAFE_INTEGER]) {
    assert.throws(
      () => createGameFpsAuthoredMission({ runId, spatialProfile }),
      /runId must be a bounded positive safe integer/,
    )
  }
  assert.doesNotThrow(() => createGameFpsAuthoredMission({
    runId: Number.MAX_SAFE_INTEGER - 1,
    spatialProfile,
  }))
})

test('authored 3D blocker slabs let the eye ray clear low cover and stop at nearer eye-height cover', async () => {
  const lowCover = Object.freeze({
    id: 'low-cover',
    centerX: 0,
    centerY: 0.25,
    centerZ: -2.5,
    halfWidth: 1,
    halfHeight: 0.25,
    halfDepth: 0.5,
  })
  const lowCoverMission = createGameFpsAuthoredMission({
    runId: 1,
    spatialProfile: hitscanProfile(lowCover),
  })
  const lowCoverShot = await tickGameFpsAuthoredMission(lowCoverMission, FIRE_ONLY_INPUT)
  assert.equal(lowCoverShot.capture.fireResult, 'hit')
  assert.equal(
    lowCoverShot.decisions.some(decision => decision.payload.event === 'weapon_hit' && decision.payload.targetRef === 'npc-scout'),
    true,
    'cover below the player eye ray must not shield the authored NPC slab',
  )

  const eyeHeightCover = Object.freeze({
    ...lowCover,
    id: 'eye-height-cover',
    centerY: 1.6,
    halfHeight: 0.5,
  })
  const eyeHeightMission = createGameFpsAuthoredMission({
    runId: 2,
    spatialProfile: hitscanProfile(eyeHeightCover),
  })
  const blockedShot = await tickGameFpsAuthoredMission(eyeHeightMission, FIRE_ONLY_INPUT)
  assert.equal(blockedShot.capture.fireResult, 'miss')
  assert.equal(
    blockedShot.decisions.some(decision => decision.payload.event === 'weapon_hit'),
    false,
    'the nearest authored blocker slab must win before the NPC slab',
  )
})

test('spatial profile identity changes when an authored collider moves vertically', () => {
  const profile = hitscanProfile(Object.freeze({
    id: 'vertical-profile-collider',
    centerX: 0,
    centerY: 1,
    centerZ: -2,
    halfWidth: 1,
    halfHeight: 1,
    halfDepth: 1,
  }))
  const movedVertically = Object.freeze({
    ...profile,
    map: Object.freeze({
      ...profile.map,
      blockers: Object.freeze([
        Object.freeze({ ...profile.map.blockers[0]!, centerY: 1.5 }),
      ]),
    }),
  })
  const resizedVertically = Object.freeze({
    ...profile,
    map: Object.freeze({
      ...profile.map,
      blockers: Object.freeze([
        Object.freeze({ ...profile.map.blockers[0]!, halfHeight: 1.5 }),
      ]),
    }),
  })

  assert.equal(gameFpsSpatialProfilesMatch(profile, profile), true)
  assert.equal(gameFpsSpatialProfilesMatch(profile, movedVertically), false)
  assert.equal(gameFpsSpatialProfilesMatch(profile, resizedVertically), false)
})

test('the ECS clock fails before its u32 tick can overflow', async () => {
  const maximumTick = 0xffff_fffe
  const mission = createGameFpsAuthoredMission({
    runId: 1,
    decisions: [{
      decisionId: 'game-fps:run-1:tick-max:npc-action',
      decisionType: 'world_tick_result',
      entityRef: 'npc-scout',
      payload: {
        event: 'npc_action',
        missionId: GAME_FPS_MISSION_ID,
        runId: 1,
        tick: maximumTick,
        action: 'hold',
      },
      producedAt: '2026-01-01T00:00:00.000Z',
    }],
    spatialProfile: hitscanProfile(Object.freeze({
      id: 'clock-boundary-cover',
      centerX: 5,
      centerY: 1,
      centerZ: 5,
      halfWidth: 1,
      halfHeight: 1,
      halfDepth: 1,
    })),
  })
  assert.equal(captureGameFpsAuthoredMission(mission).tick, maximumTick)

  await assert.rejects(
    () => tickGameFpsAuthoredMission(mission, { ...FIRE_ONLY_INPUT, fire: false }),
    /exhausted its bounded tick range/,
  )
  assert.equal(captureGameFpsAuthoredMission(mission).tick, maximumTick)
})

test('WebGL support resolves synchronously and releases its probe context', () => {
  let released = false
  const supportedDocument = {
    createElement: () => ({
      getContext: () => ({
        getExtension: () => ({ loseContext: () => { released = true } }),
      }),
    }),
  } as unknown as Document
  const unsupportedDocument = {
    createElement: () => ({ getContext: () => null }),
  } as unknown as Document

  assert.equal(readWebglSupport(null), false)
  assert.equal(readWebglSupport(unsupportedDocument), false)
  assert.equal(readWebglSupport(supportedDocument), true)
  assert.equal(released, true)
})

test('desktop movement key release neutralizes input without invalidating the next W cycle', () => {
  const pressedCodes = new Set<string>()

  assert.equal(updateGameFpsPressedCode(pressedCodes, 'KeyW', true), true)
  assert.equal(gameFpsInputPatchFromPressedCodes(pressedCodes).forward, 1)
  assert.equal(updateGameFpsPressedCode(pressedCodes, 'KeyW', false), true)
  assert.equal(gameFpsInputPatchFromPressedCodes(pressedCodes).forward, 0)

  assert.equal(updateGameFpsPressedCode(pressedCodes, 'KeyW', true), true)
  assert.equal(gameFpsInputPatchFromPressedCodes(pressedCodes).forward, 1)
  assert.equal(updateGameFpsPressedCode(pressedCodes, 'KeyW', false), true)
  assert.equal(gameFpsInputPatchFromPressedCodes(pressedCodes).forward, 0)

  assert.deepEqual(
    gameFpsInputPatchFromPressedCodes(new Set(['KeyW', 'KeyD', 'ShiftLeft'])),
    { forward: 1, strafe: 1, sprint: true },
  )
  assert.deepEqual(
    gameFpsInputPatchFromPressedCodes(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD'])),
    { forward: 0, strafe: 0, sprint: false },
  )
})

test('mobile pointer release preserves movement held by another touch', () => {
  const heldTouches = new Map<number, GameFpsTouchAction>([
    [41, 'forward'],
    [42, 'right'],
  ])
  assert.deepEqual(gameFpsInputPatchFromHeldTouches(heldTouches), { forward: 1, strafe: 1 })

  const pointerUp = Object.assign(new Event('pointerup'), { pointerId: 41 })
  releaseGameFpsHeldTouch(heldTouches, pointerUp)
  assert.deepEqual([...heldTouches], [[42, 'right']])
  assert.deepEqual(gameFpsInputPatchFromHeldTouches(heldTouches), { forward: 0, strafe: 1 })

  releaseGameFpsHeldTouch(heldTouches, new Event('blur'))
  assert.equal(heldTouches.size, 0)
})

test('NPC scoring uses the closed stable priority only when its decision interval fires', async () => {
  const tiedScores = scoreGameFpsNpcActions({ health: 100, playerDistance: 17, lineOfSight: false })
  assert.deepEqual(Object.keys(tiedScores), [...GAME_FPS_NPC_ACTIONS])
  assert.equal(tiedScores.hold, tiedScores.alert)
  assert.equal(selectGameFpsNpcAction(tiedScores), 'hold')

  resetGameFpsRuntimeForTests()
  startGameFpsMission()
  await advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * (GAME_FPS_NPC_DECISION_INTERVAL_TICKS - 1))
  const beforeInterval = readGameFpsSnapshot()
  assert.ok(beforeInterval.npcs.every(npc => npc.action === 'hold'))
  assert.ok(beforeInterval.pendingDecisions.every(decision => decision.payload.event !== 'npc_action'))

  await advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS)
  const afterInterval = readGameFpsSnapshot()
  const actionDecisions = afterInterval.pendingDecisions.filter(decision => decision.payload.event === 'npc_action')
  assert.ok(actionDecisions.length > 0)
  assert.ok(actionDecisions.every(decision => decision.payload.tick === GAME_FPS_NPC_DECISION_INTERVAL_TICKS))

  await advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS * GAME_FPS_NPC_DECISION_INTERVAL_TICKS)
  assert.equal(
    readGameFpsSnapshot().pendingDecisions.filter(decision => decision.payload.event === 'npc_action').length,
    actionDecisions.length,
    'unchanged utility winners must not emit duplicate transition Decisions',
  )
})

test('NPCs approach before engaging so movement input has room to respond', () => {
  const outsideEngageRange = scoreGameFpsNpcActions({
    health: 100,
    playerDistance: GAME_FPS_NPC_ENGAGE_DISTANCE_METERS + 0.1,
    lineOfSight: true,
  })
  const insideEngageRange = scoreGameFpsNpcActions({
    health: 100,
    playerDistance: GAME_FPS_NPC_ENGAGE_DISTANCE_METERS,
    lineOfSight: true,
  })
  assert.equal(selectGameFpsNpcAction(outsideEngageRange), 'alert')
  assert.equal(selectGameFpsNpcAction(insideEngageRange), 'engage')
  assert.equal(
    scoreGameFpsNpcActions({
      health: 100,
      playerDistance: 1,
      lineOfSight: false,
    }).engage,
    0,
    'occluded NPCs do not engage even inside the approach radius',
  )
})

test('one weapon, reload, NPC approach, and mission completion stay local', async () => {
  resetGameFpsRuntimeForTests()
  const initial = startGameFpsMission()
  assert.equal(initial.npcs.length, 4)
  assert.ok(initial.npcs.every(npc => npc.action === 'hold'))
  await advanceGameFpsBy(GAME_FPS_FIXED_STEP_SECONDS)

  let reloadObserved = false
  while (readGameFpsSnapshot().phase === 'playing') {
    const before = readGameFpsSnapshot()
    const after = await aimAndFireAtVisibleTarget()
    if (before.ammo === 0) reloadObserved = true
    if (after.phase === 'playing') await advanceGameFpsBy(0.2)
  }

  const completed = readGameFpsSnapshot()
  assert.equal(completed.phase, 'won')
  assert.equal(completed.enemiesAlive, 0)
  assert.equal(reloadObserved, true)
  assert.deepEqual(completed.lastCostLog, GAME_FPS_ZERO_COST_LOG)
  const events = completed.pendingDecisions.map(decision => decision.payload.event)
  assert.ok(events.includes('weapon_hit'))
  assert.ok(events.includes('mission_completed'))
  const actionEvents = new Set(completed.pendingDecisions
    .filter(decision => decision.payload.event === 'npc_action')
    .map(decision => decision.payload.action))
  assert.ok(actionEvents.has('alert'))
  assert.ok(actionEvents.has('flee'))
  assert.ok(Object.isFrozen(completed) && Object.isFrozen(completed.pendingDecisions))
})

test('validated Decisions replay terminal state and remain pending until acknowledged', async () => {
  const completed = readGameFpsSnapshot()
  const savedDecisions = completed.pendingDecisions
  assert.ok(savedDecisions.length > 0)
  assert.ok(savedDecisions.every(decision => decision.payload.missionId === GAME_FPS_MISSION_ID))

  const ids = savedDecisions.map(decision => decision.decisionId)
  acknowledgeGameFpsDecisions(ids)
  assert.equal(readGameFpsSnapshot().pendingDecisions.length, 0)

  resetGameFpsRuntimeForTests()
  const restored = startGameFpsMission({ decisions: savedDecisions })
  assert.equal(restored.phase, 'won')
  assert.equal(restored.enemiesAlive, 0)
  assert.equal(restored.pendingDecisions.length, 0, 'already-persisted Decisions must not be re-queued')

  const weaponHit = savedDecisions.find(decision => decision.payload.event === 'weapon_hit')!
  const malformed = {
    ...weaponHit,
    payload: { ...weaponHit.payload, remainingHealth: -1 },
  }
  const beforeRejectedRestore = readGameFpsSnapshot()
  assert.throws(
    () => startGameFpsMission({ decisions: [malformed] }),
    /remainingHealth must be a finite number from 0 to 100/,
  )
  assert.equal(readGameFpsSnapshot(), beforeRejectedRestore, 'malformed restore must not replace the active mission')
})
