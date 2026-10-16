import { useGraphStore } from '@/hooks/useGraphStore'
import { isXrPhysicsRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { readXrMotionReferenceRuntime } from '@/features/three/xrMotionReferenceRuntime'
import {
  resolveXrCanonicalSceneProjection,
  resolveXrCanonicalSceneSpatialSource,
} from '@/features/three/xrCanonicalSceneSpatialSource'
import { isGameFpsPositionValid, type GameFpsPoint } from './gameFpsGeometry'
import {
  GAME_FPS_SHARED_XR_PROFILE_ID,
  type GameFpsBlocker,
  type GameFpsSpatialMap,
  type GameFpsSpatialProfile,
} from './gameFpsModel'

const BOUNDARY_COLLIDER_IDS = new Set([
  'native-island-west',
  'native-island-east',
  'native-island-north',
  'native-island-south',
])
const SPAWN_CLEARANCE_METERS = 0.45
const SPAWN_GRID_STEP_METERS = 0.5
const MINIMUM_SPAWN_SEPARATION_METERS = 1.2

function readSpatialSourceSelection() {
  const state = useGraphStore.getState()
  const motion = readXrMotionReferenceRuntime()
  const projection = resolveXrCanonicalSceneProjection({
    physicsRunReady: isXrPhysicsRunReadyDemoActive(
      state.markdownDocumentName,
      state.markdownDocumentText,
    ),
  })
  return Object.freeze({ projection, stageId: motion.plan.stageId })
}

export function readGameModeXrSpatialSourceKey(): string {
  const selection = readSpatialSourceSelection()
  return `${selection.projection}:${selection.stageId}`
}

function isBoundaryCollider(id: string): boolean {
  return BOUNDARY_COLLIDER_IDS.has(id) || /^terrain:[^:]+:(?:west|east|north|south)$/.test(id)
}

function spawnCandidates(preferred: GameFpsPoint, map: GameFpsSpatialMap): readonly GameFpsPoint[] {
  const maximumXStep = Math.floor((map.halfWidth - SPAWN_CLEARANCE_METERS) / SPAWN_GRID_STEP_METERS)
  const maximumZStep = Math.floor((map.halfDepth - SPAWN_CLEARANCE_METERS) / SPAWN_GRID_STEP_METERS)
  const candidates: GameFpsPoint[] = [preferred]
  for (let zStep = -maximumZStep; zStep <= maximumZStep; zStep += 1) {
    for (let xStep = -maximumXStep; xStep <= maximumXStep; xStep += 1) {
      candidates.push({
        x: map.centerX + xStep * SPAWN_GRID_STEP_METERS,
        z: map.centerZ + zStep * SPAWN_GRID_STEP_METERS,
      })
    }
  }
  return candidates.sort((left, right) => {
    const leftDistance = (left.x - preferred.x) ** 2 + (left.z - preferred.z) ** 2
    const rightDistance = (right.x - preferred.x) ** 2 + (right.z - preferred.z) ** 2
    return leftDistance - rightDistance || left.z - right.z || left.x - right.x
  })
}

function resolveSpawn(
  preferred: GameFpsPoint,
  map: GameFpsSpatialMap,
  occupied: readonly GameFpsPoint[],
): GameFpsPoint {
  const minimumSeparationSquared = MINIMUM_SPAWN_SEPARATION_METERS ** 2
  const spawn = spawnCandidates(preferred, map).find(candidate => (
    isGameFpsPositionValid(candidate, SPAWN_CLEARANCE_METERS, map)
    && occupied.every(point => (candidate.x - point.x) ** 2 + (candidate.z - point.z) ** 2 >= minimumSeparationSquared)
  ))
  if (!spawn) throw new Error('Authored XR terrain has no valid deterministic Game Mode spawn.')
  return Object.freeze(spawn)
}

export function readGameModeXrSpatialProfile(): GameFpsSpatialProfile {
  const selection = readSpatialSourceSelection()
  const spatialSource = resolveXrCanonicalSceneSpatialSource({
    projection: selection.projection,
    stageId: selection.stageId,
  })
  const { perimeter } = spatialSource
  const blockers = spatialSource.staticColliders
    .filter(collider => !isBoundaryCollider(collider.id))
    .map<GameFpsBlocker>(collider => Object.freeze({
      id: collider.id,
      centerX: collider.center[0],
      centerY: collider.center[1],
      centerZ: collider.center[2],
      halfWidth: collider.sizeMeters[0] / 2,
      halfHeight: collider.sizeMeters[1] / 2,
      halfDepth: collider.sizeMeters[2] / 2,
    }))
  const halfWidth = perimeter.halfWidthMeters
  const halfDepth = perimeter.halfDepthMeters
  const [centerX, centerZ] = perimeter.centerMeters
  const walkableSurfaces = Object.freeze((spatialSource.stage.walkableSurfaces || []).map(surface => Object.freeze({
    id: `stage:${surface.id}`,
    centerX: surface.centerMeters[0],
    centerZ: surface.centerMeters[1],
    halfWidth: surface.sizeMeters[0] / 2,
    halfDepth: surface.sizeMeters[1] / 2,
    topMeters: surface.topMeters,
    kind: surface.kind,
  })))
  const map = Object.freeze({
    centerX,
    centerZ,
    halfWidth,
    halfDepth,
    blockers: Object.freeze(blockers),
    walkableSurfaces,
  })
  const playerPosition = resolveSpawn({ x: centerX, z: centerZ + halfDepth * 0.42 }, map, [])
  const npcPreferences = [
    { id: 'npc-scout' as const, x: centerX, z: centerZ - halfDepth * 0.24 },
    { id: 'npc-west' as const, x: centerX - halfWidth * 0.44, z: centerZ - halfDepth * 0.08 },
    { id: 'npc-east' as const, x: centerX + halfWidth * 0.44, z: centerZ - halfDepth * 0.08 },
    { id: 'npc-guard' as const, x: centerX - halfWidth * 0.2, z: centerZ - halfDepth * 0.66 },
  ]
  const occupied: GameFpsPoint[] = [playerPosition]
  const npcSeeds = npcPreferences.map(preference => {
    const position = resolveSpawn(preference, map, occupied)
    occupied.push(position)
    return Object.freeze({ id: preference.id, ...position })
  })
  return Object.freeze({
    id: GAME_FPS_SHARED_XR_PROFILE_ID,
    map,
    playerSpawn: Object.freeze({ ...playerPosition, yaw: 0, pitch: 0 }),
    npcSeeds: Object.freeze(npcSeeds),
  })
}
