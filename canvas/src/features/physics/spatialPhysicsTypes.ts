export type SpatialVector = readonly [number, number, number]

export type SpatialBodyMotion = 'static' | 'dynamic' | 'kinematic'

export type SpatialBodySpec = Readonly<{
  id: string
  motion: SpatialBodyMotion
  position: SpatialVector
  linearVelocity?: SpatialVector
  mass?: number
  linearDamping?: number
}>

type SpatialShapePlacement = Readonly<{
  offset?: SpatialVector
}>

export type SpatialSphereShape = SpatialShapePlacement & Readonly<{
  kind: 'sphere'
  radius: number
}>

export type SpatialCuboidShape = SpatialShapePlacement & Readonly<{
  kind: 'cuboid'
  halfSize: SpatialVector
}>

export type SpatialColliderShape = SpatialSphereShape | SpatialCuboidShape

export type SpatialMaterial = Readonly<{
  friction?: number
  restitution?: number
}>

export type SpatialColliderSpec = SpatialMaterial & Readonly<{
  id: string
  bodyId: string
  shape: SpatialColliderShape
  sensor?: boolean
  collisionLayer?: number
  collisionMask?: number
}>

export type SpatialGroundSpec = SpatialMaterial & Readonly<{
  id?: string
  enabled: boolean
  height: number
  collisionLayer?: number
  collisionMask?: number
}>

export type SpatialPhysicsOptions = Readonly<{
  fixedStepSeconds: number
  maxSubSteps: number
  gravity: SpatialVector
  ground?: SpatialGroundSpec
  bodies?: readonly SpatialBodySpec[]
  colliders?: readonly SpatialColliderSpec[]
}>

export type SpatialBodyState = Readonly<{
  id: string
  motion: SpatialBodyMotion
  position: SpatialVector
  linearVelocity: SpatialVector
  grounded: boolean
  contactIds: readonly string[]
}>

export type SpatialPhysicsEventKind =
  | 'collision-began'
  | 'collision-ended'
  | 'sensor-began'
  | 'sensor-ended'

export type SpatialPhysicsEvent = Readonly<{
  kind: SpatialPhysicsEventKind
  tick: number
  colliderIds: readonly [string, string]
  bodyIds: readonly [string | null, string | null]
}>

export type SpatialAdvanceResult = Readonly<{
  steps: number
  tick: number
  remainderSeconds: number
}>

export type SpatialQueryFilter = Readonly<{
  collisionLayer?: number
  collisionMask?: number
  includeSensors?: boolean
  excludeColliderIds?: readonly string[]
}>

export type SpatialQueryHit = Readonly<{
  colliderId: string
  bodyId: string | null
}>

export type SpatialOverlapQuery = Readonly<{
  position: SpatialVector
  shape: SpatialColliderShape
  filter?: SpatialQueryFilter
}>

export type SpatialRayQuery = Readonly<{
  origin: SpatialVector
  direction: SpatialVector
  maxDistance: number
  filter?: SpatialQueryFilter
}>

export type SpatialRayHit = SpatialQueryHit & Readonly<{
  distance: number
  point: SpatialVector
}>

export type SpatialBodySnapshot = Readonly<{
  id: string
  motion: SpatialBodyMotion
  position: SpatialVector
  linearVelocity: SpatialVector
  mass: number
  linearDamping: number
  grounded: boolean
  contactIds: readonly string[]
  pendingSweepStartPosition: SpatialVector | null
}>

export type SpatialColliderSnapshot = Readonly<{
  id: string
  bodyId: string
  shape: SpatialColliderShape
  sensor: boolean
  collisionLayer: number
  collisionMask: number
  friction: number
  restitution: number
}>

export type SpatialGroundSnapshot = Readonly<{
  id: string
  enabled: boolean
  height: number
  collisionLayer: number
  collisionMask: number
  friction: number
  restitution: number
}>

export type SpatialInteractionSnapshot = Readonly<{
  colliderIds: readonly [string, string]
  bodyIds: readonly [string | null, string | null]
  sensor: boolean
}>

export const SPATIAL_PHYSICS_SNAPSHOT_FORMAT = 'agentic-graph.spatial-physics-world' as const
export const SPATIAL_PHYSICS_SNAPSHOT_VERSION = 1 as const

export type SpatialPhysicsSnapshot = Readonly<{
  format: typeof SPATIAL_PHYSICS_SNAPSHOT_FORMAT
  version: typeof SPATIAL_PHYSICS_SNAPSHOT_VERSION
  dimension: '3d'
  settings: Readonly<{
    fixedStepSeconds: number
    maxSubSteps: number
    gravity: SpatialVector
    ground: SpatialGroundSnapshot | null
  }>
  tick: number
  remainderSeconds: number
  bodies: readonly SpatialBodySnapshot[]
  colliders: readonly SpatialColliderSnapshot[]
  activeInteractions: readonly SpatialInteractionSnapshot[]
  pendingEvents: readonly SpatialPhysicsEvent[]
}>
