export const BEHAVIOR_GRAPH_SCHEMA = 'knowgrph-xr-behavior-graph/v1' as const
export const BEHAVIOR_DISPATCH_MAX_ACTIONS_PER_EVENT = 128

export type BehaviorTrigger =
  | 'select'
  | 'hover-enter'
  | 'hover-exit'
  | 'proximity-enter'
  | 'proximity-exit'
  | 'timeline-marker'

export type AuthoringBehaviorAction = Readonly<{
  id: string
  kind: string
  targetEntityId: number
  parameters?: Readonly<Record<string, unknown>>
}>

export type AuthoringBehavior = Readonly<{
  id: string
  trigger: BehaviorTrigger
  sourceEntityId: number
  actionIds: readonly string[]
}>

export type AuthoringBehaviorGraph = Readonly<{
  schema: typeof BEHAVIOR_GRAPH_SCHEMA
  actions: readonly AuthoringBehaviorAction[]
  behaviors: readonly AuthoringBehavior[]
}>

export type BehaviorDispatchEvent = Readonly<{
  id: string
  revision: number
  trigger: BehaviorTrigger
  sourceEntityId: number
}>

export type BehaviorActionInvocation = Readonly<{
  action: AuthoringBehaviorAction
  event: BehaviorDispatchEvent
}>

export type BehaviorDispatchResult = Readonly<{
  status: 'dispatched' | 'dispatched-with-errors' | 'stale' | 'out-of-order' | 'reentrant'
  revision: number
  invokedActionIds: readonly string[]
  errors: readonly Readonly<{ actionId: string; message: string }>[]
}>

export type ExactOnceBehaviorDispatcher = Readonly<{
  dispatch(event: BehaviorDispatchEvent): BehaviorDispatchResult
  getRevision(): number
}>

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const TRIGGERS = new Set<BehaviorTrigger>([
  'select',
  'hover-enter',
  'hover-exit',
  'proximity-enter',
  'proximity-exit',
  'timeline-marker',
])

function validateGraph(graph: AuthoringBehaviorGraph): void {
  if (!graph || graph.schema !== BEHAVIOR_GRAPH_SCHEMA) throw new TypeError('invalid behavior graph schema')
  if (!Array.isArray(graph.actions) || !Array.isArray(graph.behaviors)) throw new TypeError('invalid behavior graph')

  const actionIds = new Set<string>()
  for (const action of graph.actions) {
    if (!SAFE_ID.test(action.id) || actionIds.has(action.id)) throw new TypeError('behavior action ids must be unique and safe')
    if (!SAFE_ID.test(action.kind)) throw new TypeError('behavior action kind must be safe')
    if (!Number.isSafeInteger(action.targetEntityId) || action.targetEntityId < 1) throw new TypeError('invalid action entity')
    actionIds.add(action.id)
  }

  const behaviorIds = new Set<string>()
  for (const behavior of graph.behaviors) {
    if (!SAFE_ID.test(behavior.id) || behaviorIds.has(behavior.id)) throw new TypeError('behavior ids must be unique and safe')
    if (!TRIGGERS.has(behavior.trigger)) throw new TypeError('invalid behavior trigger')
    if (!Number.isSafeInteger(behavior.sourceEntityId) || behavior.sourceEntityId < 1) throw new TypeError('invalid source entity')
    if (behavior.actionIds.length > BEHAVIOR_DISPATCH_MAX_ACTIONS_PER_EVENT) throw new TypeError('behavior action list exceeds limit')
    for (const actionId of behavior.actionIds) {
      if (!actionIds.has(actionId)) throw new TypeError(`unknown behavior action: ${actionId}`)
    }
    behaviorIds.add(behavior.id)
  }
}

/**
 * Provides process-local exact-once invocation through a monotonic revision.
 * Accepted revisions are committed before callbacks and can never be replayed.
 */
export function createExactOnceBehaviorDispatcher(
  graph: AuthoringBehaviorGraph,
  invoke: (invocation: BehaviorActionInvocation) => void,
  initialRevision = 0,
): ExactOnceBehaviorDispatcher {
  validateGraph(graph)
  if (!Number.isSafeInteger(initialRevision) || initialRevision < 0) throw new TypeError('invalid initial behavior revision')

  const actions = new Map(graph.actions.map(action => [action.id, Object.freeze({ ...action })]))
  let revision = initialRevision
  let dispatching = false

  return Object.freeze({
    getRevision: () => revision,
    dispatch(event): BehaviorDispatchResult {
      if (dispatching) {
        return { status: 'reentrant', revision, invokedActionIds: [], errors: [] }
      }
      if (!Number.isSafeInteger(event.revision) || event.revision <= revision) {
        return { status: 'stale', revision, invokedActionIds: [], errors: [] }
      }
      if (event.revision !== revision + 1) {
        return { status: 'out-of-order', revision, invokedActionIds: [], errors: [] }
      }
      if (!SAFE_ID.test(event.id) || !TRIGGERS.has(event.trigger)
        || !Number.isSafeInteger(event.sourceEntityId) || event.sourceEntityId < 1) {
        return { status: 'out-of-order', revision, invokedActionIds: [], errors: [] }
      }

      const actionIds: string[] = []
      const seen = new Set<string>()
      for (const behavior of graph.behaviors) {
        if (behavior.trigger !== event.trigger || behavior.sourceEntityId !== event.sourceEntityId) continue
        for (const actionId of behavior.actionIds) {
          if (seen.has(actionId)) continue
          seen.add(actionId)
          actionIds.push(actionId)
          if (actionIds.length >= BEHAVIOR_DISPATCH_MAX_ACTIONS_PER_EVENT) break
        }
        if (actionIds.length >= BEHAVIOR_DISPATCH_MAX_ACTIONS_PER_EVENT) break
      }

      revision = event.revision
      dispatching = true
      const invokedActionIds: string[] = []
      const errors: Array<{ actionId: string; message: string }> = []
      try {
        for (const actionId of actionIds) {
          const action = actions.get(actionId)
          if (!action) continue
          invokedActionIds.push(actionId)
          try {
            invoke(Object.freeze({ action, event: Object.freeze({ ...event }) }))
          } catch (error) {
            errors.push({
              actionId,
              message: error instanceof Error ? error.message : 'behavior action failed',
            })
          }
        }
      } finally {
        dispatching = false
      }

      return Object.freeze({
        status: errors.length === 0 ? 'dispatched' : 'dispatched-with-errors',
        revision,
        invokedActionIds: Object.freeze(invokedActionIds),
        errors: Object.freeze(errors.map(error => Object.freeze(error))),
      })
    },
  })
}
