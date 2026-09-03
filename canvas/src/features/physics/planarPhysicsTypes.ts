export type PlanarVector = readonly [number, number]

export type PlanarBodyMotion = 'static' | 'dynamic' | 'kinematic'

export type PlanarBodySpec = Readonly<{
  id: string
  motion: PlanarBodyMotion
  position: PlanarVector
  rotationRadians?: number
  linearVelocity?: PlanarVector
  angularVelocity?: number
  mass?: number
  rotationalMass?: number
  restitution?: number
}>

type PlanarShapePlacement = Readonly<{
  offset?: PlanarVector
  rotationRadians?: number
}>

export type PlanarCircleShape = PlanarShapePlacement & Readonly<{
  kind: 'circle'
  radius: number
}>

export type PlanarBoxShape = PlanarShapePlacement & Readonly<{
  kind: 'box'
  halfSize: PlanarVector
}>

export type PlanarColliderShape = PlanarCircleShape | PlanarBoxShape

export type PlanarColliderSpec = Readonly<{
  id: string
  bodyId: string
  shape: PlanarColliderShape
  sensor?: boolean
  collisionLayer?: number
  collisionMask?: number
}>

export type PlanarPhysicsOptions = Readonly<{
  fixedStepSeconds: number
  maxSubSteps: number
  gravity: PlanarVector
  bodies?: readonly PlanarBodySpec[]
  colliders?: readonly PlanarColliderSpec[]
}>

export type PlanarBodyState = Readonly<{
  id: string
  motion: PlanarBodyMotion
  position: PlanarVector
  rotationRadians: number
  linearVelocity: PlanarVector
  angularVelocity: number
}>

export type PlanarPhysicsEventKind =
  | 'collision-began'
  | 'collision-ended'
  | 'sensor-began'
  | 'sensor-ended'

export type PlanarPhysicsEvent = Readonly<{
  kind: PlanarPhysicsEventKind
  tick: number
  colliderIds: readonly [string, string]
  bodyIds: readonly [string, string]
}>

export type PlanarAdvanceResult = Readonly<{
  steps: number
  tick: number
  remainderSeconds: number
}>

export type PlanarQueryFilter = Readonly<{
  collisionLayer?: number
  collisionMask?: number
  includeSensors?: boolean
  excludeColliderIds?: readonly string[]
}>

export type PlanarOverlapQuery = Readonly<{
  position: PlanarVector
  rotationRadians?: number
  shape: PlanarColliderShape
  filter?: PlanarQueryFilter
}>

export type PlanarRayQuery = Readonly<{
  origin: PlanarVector
  direction: PlanarVector
  maxDistance: number
  filter?: PlanarQueryFilter
}>

export type PlanarRayHit = Readonly<{
  colliderId: string
  bodyId: string
  distance: number
  point: PlanarVector
}>

export type PlanarBodySnapshot = Readonly<{
  id: string
  motion: PlanarBodyMotion
  position: PlanarVector
  rotationRadians: number
  linearVelocity: PlanarVector
  angularVelocity: number
  mass: number
  rotationalMass: number
  restitution: number
}>

export type PlanarColliderSnapshot = Readonly<{
  id: string
  bodyId: string
  shape: PlanarColliderShape
  sensor: boolean
  collisionLayer: number
  collisionMask: number
}>

export type PlanarInteractionSnapshot = Readonly<{
  colliderIds: readonly [string, string]
  bodyIds: readonly [string, string]
  sensor: boolean
}>

export const PLANAR_PHYSICS_SNAPSHOT_FORMAT = 'agentic-graph.planar-physics-world' as const
export const PLANAR_PHYSICS_SNAPSHOT_VERSION = 1 as const

export type PlanarPhysicsSnapshot = Readonly<{
  format: typeof PLANAR_PHYSICS_SNAPSHOT_FORMAT
  version: typeof PLANAR_PHYSICS_SNAPSHOT_VERSION
  dimension: '2d'
  settings: Readonly<{
    fixedStepSeconds: number
    maxSubSteps: number
    gravity: PlanarVector
  }>
  tick: number
  remainderSeconds: number
  bodies: readonly PlanarBodySnapshot[]
  colliders: readonly PlanarColliderSnapshot[]
  activeInteractions: readonly PlanarInteractionSnapshot[]
  pendingEvents: readonly PlanarPhysicsEvent[]
}>
