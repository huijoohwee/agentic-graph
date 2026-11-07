export const GAME_FPS_MISSION_ID = 'game-fps-mission-1'
export const GAME_FPS_FIXED_STEP_SECONDS = 1 / 60
export const GAME_FPS_MAX_FRAME_SECONDS = 0.25
export const GAME_FPS_NPC_DECISION_INTERVAL_TICKS = 12

export const GAME_FPS_NPC_ACTIONS = ['hold', 'alert', 'engage', 'flee'] as const
export type GameFpsNpcAction = (typeof GAME_FPS_NPC_ACTIONS)[number]
export const GAME_FPS_NPC_IDS = ['npc-scout', 'npc-west', 'npc-east', 'npc-guard'] as const
export type GameFpsNpcId = (typeof GAME_FPS_NPC_IDS)[number]
export const GAME_FPS_SHARED_XR_PROFILE_ID = 'xr-authored' as const

export const GAME_FPS_FIRE_RESULTS = [
  'idle',
  'hit',
  'eliminated',
  'miss',
  'empty',
  'cooldown',
  'reloaded',
  'reload-unavailable',
] as const
export type GameFpsFireResult = (typeof GAME_FPS_FIRE_RESULTS)[number]

export type GameFpsPhase = 'stopped' | 'playing' | 'won' | 'lost'

export type GameFpsDecisionRecord = Readonly<{
  decisionId: string
  decisionType: 'quest_flag' | 'world_tick_result'
  entityRef: string
  payload: Readonly<Record<string, unknown>>
  producedAt: string
}>

export type GameFpsPlayerSnapshot = Readonly<{
  x: number
  z: number
  yaw: number
  pitch: number
  health: number
}>

export type GameFpsNpcSnapshot = Readonly<{
  id: string
  x: number
  z: number
  health: number
  action: GameFpsNpcAction
}>

export type GameFpsCostLog = Readonly<{
  model: 'none'
  prompt_tokens: 0
  completion_tokens: 0
  cache_hits: 0
  estimated_cost_usd: 0
  incomplete: false
}>

export type GameFpsSnapshot = Readonly<{
  phase: GameFpsPhase
  player: GameFpsPlayerSnapshot
  npcs: readonly GameFpsNpcSnapshot[]
  ammo: number
  reserve: number
  enemiesAlive: number
  fireResult: GameFpsFireResult
  tick: number
  elapsedSeconds: number
  pendingDecisions: readonly GameFpsDecisionRecord[]
  lastCostLog: GameFpsCostLog
  runtimeError: string | null
  revision: number
}>

export type GameFpsInputPatch = Readonly<{
  forward?: number
  strafe?: number
  lookYawDelta?: number
  lookPitchDelta?: number
  sprint?: boolean
}>

export type GameFpsTickInput = Readonly<{
  forward: number
  strafe: number
  lookYawDelta: number
  lookPitchDelta: number
  sprint: boolean
  fire: boolean
  reload: boolean
}>

export type GameFpsBlocker = Readonly<{
  id: string
  centerX: number
  centerY: number
  centerZ: number
  halfWidth: number
  halfHeight: number
  halfDepth: number
}>

export type GameFpsWalkableSurface = Readonly<{
  id: string
  centerX: number
  centerZ: number
  halfWidth: number
  halfDepth: number
  topMeters: number
  kind: 'street' | 'path'
}>

export type GameFpsSpatialMap = Readonly<{
  centerX: number
  centerZ: number
  halfWidth: number
  halfDepth: number
  blockers: readonly GameFpsBlocker[]
  walkableSurfaces?: readonly GameFpsWalkableSurface[]
}>

export type GameFpsSpatialProfile = Readonly<{
  id: typeof GAME_FPS_SHARED_XR_PROFILE_ID
  map: GameFpsSpatialMap
  playerSpawn: Readonly<Omit<GameFpsPlayerSnapshot, 'health'>>
  npcSeeds: readonly Readonly<{ id: GameFpsNpcId; x: number; z: number }>[]
}>

function compareGameFpsSpatialIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function gameFpsSpatialProfileSignature(profile: GameFpsSpatialProfile): string {
  const blockers = [...profile.map.blockers].sort(compareGameFpsSpatialIds).map(blocker => [
    blocker.id,
    blocker.centerX,
    blocker.centerY,
    blocker.centerZ,
    blocker.halfWidth,
    blocker.halfHeight,
    blocker.halfDepth,
  ])
  const npcSeeds = [...profile.npcSeeds].sort(compareGameFpsSpatialIds).map(npc => [npc.id, npc.x, npc.z])
  const walkableSurfaces = [...(profile.map.walkableSurfaces || [])]
    .sort(compareGameFpsSpatialIds)
    .map(surface => [
      surface.id,
      surface.centerX,
      surface.centerZ,
      surface.halfWidth,
      surface.halfDepth,
      surface.topMeters,
      surface.kind,
    ])
  return JSON.stringify([
    profile.id,
    profile.map.centerX,
    profile.map.centerZ,
    profile.map.halfWidth,
    profile.map.halfDepth,
    blockers,
    walkableSurfaces,
    [profile.playerSpawn.x, profile.playerSpawn.z, profile.playerSpawn.yaw, profile.playerSpawn.pitch],
    npcSeeds,
  ])
}

export function gameFpsSpatialProfilesMatch(
  left: GameFpsSpatialProfile,
  right: GameFpsSpatialProfile,
): boolean {
  return gameFpsSpatialProfileSignature(left) === gameFpsSpatialProfileSignature(right)
}

export const GAME_FPS_NPC_HITBOX_HALF_EXTENTS = Object.freeze([0.72, 0.9, 0.72] as const)

export const GAME_FPS_WEAPON = Object.freeze({
  magazineCapacity: 8,
  initialReserve: 24,
  damage: 45,
  cooldownSeconds: 0.18,
  rangeMeters: 40,
})

export const GAME_FPS_ZERO_COST_LOG: GameFpsCostLog = Object.freeze({
  model: 'none',
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: false,
})

export function gameFpsNpcActionFromCode(code: number): GameFpsNpcAction {
  return GAME_FPS_NPC_ACTIONS[code] || 'hold'
}

export function gameFpsFireResultFromCode(code: number): GameFpsFireResult {
  return GAME_FPS_FIRE_RESULTS[code] || 'idle'
}

export function clampGameFpsUnit(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error('Game FPS input values must be finite numbers')
  return Math.max(-1, Math.min(1, numeric))
}

export function clampGameFpsLookDelta(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) throw new Error('Game FPS look deltas must be finite numbers')
  return Math.max(-Math.PI, Math.min(Math.PI, numeric))
}
