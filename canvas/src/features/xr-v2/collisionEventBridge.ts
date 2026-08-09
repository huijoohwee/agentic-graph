import type { SpatialPhysicsEvent } from '../physics/spatialPhysicsTypes'
import type {
  BehaviorDispatchResult,
  BehaviorTrigger,
  ExactOnceBehaviorDispatcher,
} from './behaviorDispatcher'

export const XR_V2_COLLISION_BRIDGE_MAX_SEEN_EVENTS = 4_096
export const XR_V2_COLLISION_BRIDGE_DEFAULT_MAX_SEEN_EVENTS = XR_V2_COLLISION_BRIDGE_MAX_SEEN_EVENTS

export type XrV2ContactPairBinding = Readonly<{
  colliderIds: readonly [string, string]
  sourceEntityId: number
}>

export type XrV2CollisionBridgeDispatch = Readonly<{
  eventId: string
  kind: 'collision-begin' | 'collision-end'
  colliderIds: readonly [string, string]
  status: BehaviorDispatchResult['status'] | 'unbound' | 'capacity-exhausted'
  invokedActionIds: readonly string[]
}>

type RoutedContactKind = Readonly<{
  kind: XrV2CollisionBridgeDispatch['kind']
  trigger: BehaviorTrigger
}>

function stableColliderId(value: unknown): string {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new TypeError('collision collider ids must be non-empty, whitespace-stable strings')
  }
  return value
}

function normalizeColliderPair(
  values: readonly [string, string],
): readonly [string, string] {
  if (!Array.isArray(values) || values.length !== 2) {
    throw new TypeError('collision bindings require exactly two collider ids')
  }
  const first = stableColliderId(values[0])
  const second = stableColliderId(values[1])
  return Object.freeze(first <= second ? [first, second] : [second, first])
}

function pairKey(colliderIds: readonly [string, string]): string {
  return JSON.stringify(colliderIds)
}

type SeenContactEvent = Readonly<{
  eventId: string
  revision: number | null
}>

const PHYSICS_EVENT_KINDS = new Set<SpatialPhysicsEvent['kind']>([
  'collision-began', 'collision-ended', 'sensor-began', 'sensor-ended',
])

function routedContactKind(kind: SpatialPhysicsEvent['kind']): RoutedContactKind | null {
  switch (kind) {
    case 'collision-began': return { kind: 'collision-begin', trigger: 'collision-begin' }
    case 'collision-ended': return { kind: 'collision-end', trigger: 'collision-end' }
    case 'sensor-began':
    case 'sensor-ended': return null
  }
}

function rawContactEventIdentity(
  kind: XrV2CollisionBridgeDispatch['kind'],
  colliderIds: readonly [string, string],
  tick: number,
): string {
  return JSON.stringify([kind, tick, colliderIds])
}

function stableContactHash(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    first = Math.imul(first ^ codeUnit, 0x01000193)
    second = Math.imul(second ^ codeUnit, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function compactContactEventId(rawIdentity: string): string {
  return `contact:${stableContactHash(rawIdentity)}`
}

function validateContactEvent(event: unknown): asserts event is SpatialPhysicsEvent {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('collision events must be objects')
  }
  const candidate = event as Partial<SpatialPhysicsEvent>
  if (!PHYSICS_EVENT_KINDS.has(candidate.kind as SpatialPhysicsEvent['kind'])) {
    throw new TypeError('collision event kind is invalid')
  }
  if (!Number.isSafeInteger(candidate.tick) || Number(candidate.tick) < 0) {
    throw new TypeError('collision event tick must be a non-negative safe integer')
  }
  normalizeColliderPair(candidate.colliderIds as readonly [string, string])
  if (!Array.isArray(candidate.bodyIds) || candidate.bodyIds.length !== 2
    || candidate.bodyIds.some(bodyId => bodyId !== null
      && (typeof bodyId !== 'string' || !bodyId || bodyId !== bodyId.trim()))) {
    throw new TypeError('collision event body ids must be stable strings or null')
  }
}

export function createXrV2CollisionEventBridge(input: Readonly<{
  dispatcher: ExactOnceBehaviorDispatcher
  bindings: readonly XrV2ContactPairBinding[]
  maxSeenEvents?: number
}>): Readonly<{
    route(events: readonly SpatialPhysicsEvent[]): readonly XrV2CollisionBridgeDispatch[]
    seenEventIds(): readonly string[]
  }> {
  if (!input?.dispatcher || typeof input.dispatcher.dispatch !== 'function'
    || typeof input.dispatcher.getRevision !== 'function' || !Array.isArray(input.bindings)) {
    throw new TypeError('collision bridge requires a dispatcher and bindings')
  }
  const maxSeenEvents = input.maxSeenEvents ?? XR_V2_COLLISION_BRIDGE_DEFAULT_MAX_SEEN_EVENTS
  if (!Number.isSafeInteger(maxSeenEvents) || maxSeenEvents < 1
    || maxSeenEvents > XR_V2_COLLISION_BRIDGE_MAX_SEEN_EVENTS) {
    throw new TypeError(`collision bridge maxSeenEvents must be between 1 and ${XR_V2_COLLISION_BRIDGE_MAX_SEEN_EVENTS}`)
  }

  const entityByPair = new Map<string, number>()
  for (const binding of input.bindings) {
    if (!binding || typeof binding !== 'object') throw new TypeError('collision bindings must be objects')
    const colliderIds = normalizeColliderPair(binding.colliderIds)
    if (!Number.isSafeInteger(binding.sourceEntityId) || binding.sourceEntityId < 0) {
      throw new TypeError('collision binding source entity must be a non-negative safe integer')
    }
    const key = pairKey(colliderIds)
    if (entityByPair.has(key)) throw new TypeError('collision contact pairs must have one binding')
    entityByPair.set(key, binding.sourceEntityId)
  }

  const seenByRawIdentity = new Map<string, SeenContactEvent>()
  const rawIdentityByEventId = new Map<string, string>()

  return Object.freeze({
    route(events): readonly XrV2CollisionBridgeDispatch[] {
      if (!Array.isArray(events)) throw new TypeError('collision events must be an array')
      for (const event of events) validateContactEvent(event)
      const dispatches: XrV2CollisionBridgeDispatch[] = []
      for (const event of events) {
        const routed = routedContactKind(event.kind)
        if (!routed) continue
        const colliderIds = normalizeColliderPair(event.colliderIds)
        const rawIdentity = rawContactEventIdentity(routed.kind, colliderIds, event.tick)
        const eventId = compactContactEventId(rawIdentity)
        const existingRawIdentity = rawIdentityByEventId.get(eventId)
        if (existingRawIdentity !== undefined && existingRawIdentity !== rawIdentity) {
          throw new TypeError('collision event identity hash collision')
        }
        const key = pairKey(colliderIds)
        const sourceEntityId = entityByPair.get(key)
        let seen = seenByRawIdentity.get(rawIdentity)

        if (!seen && seenByRawIdentity.size >= maxSeenEvents) {
          dispatches.push(Object.freeze({
            eventId,
            kind: routed.kind,
            colliderIds,
            status: 'capacity-exhausted' as const,
            invokedActionIds: Object.freeze([]) as readonly string[],
          }))
          continue
        }

        if (!seen) {
          seen = Object.freeze({
            eventId,
            revision: sourceEntityId === undefined ? null : input.dispatcher.getRevision() + 1,
          })
          seenByRawIdentity.set(rawIdentity, seen)
          rawIdentityByEventId.set(eventId, rawIdentity)
        }

        if (sourceEntityId === undefined || seen.revision === null) {
          dispatches.push(Object.freeze({
            eventId,
            kind: routed.kind,
            colliderIds,
            status: 'unbound' as const,
            invokedActionIds: Object.freeze([]) as readonly string[],
          }))
          continue
        }

        const result = input.dispatcher.dispatch({
          id: eventId,
          revision: seen.revision,
          trigger: routed.trigger,
          sourceEntityId,
        })
        dispatches.push(Object.freeze({
          eventId,
          kind: routed.kind,
          colliderIds,
          status: result.status,
          invokedActionIds: result.invokedActionIds,
        }))
      }
      return Object.freeze(dispatches)
    },
    seenEventIds: () => Object.freeze([...seenByRawIdentity.values()].map(event => event.eventId)),
  })
}
