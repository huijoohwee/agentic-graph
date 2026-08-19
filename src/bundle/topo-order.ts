import type { Edge } from './bundle-types'

export type TopologyResult =
  | Readonly<{ ok: true; order: readonly string[] }>
  | Readonly<{ ok: false; reason: 'cyclic-dependency' | 'unknown-leg' }>

export type TraversalObserver = (legId: string) => void

export function topologicalOrder(legIds: readonly string[], edges: readonly Edge[]): TopologyResult {
  const ids = new Set(legIds)
  const indegree = new Map(legIds.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!ids.has(edge.fromLegId) || !ids.has(edge.toLegId)) return { ok: false, reason: 'unknown-leg' }
    const targets = outgoing.get(edge.fromLegId) ?? []
    if (!targets.includes(edge.toLegId)) {
      targets.push(edge.toLegId)
      targets.sort()
      outgoing.set(edge.fromLegId, targets)
      indegree.set(edge.toLegId, (indegree.get(edge.toLegId) ?? 0) + 1)
    }
  }
  const ready = legIds.filter((id) => indegree.get(id) === 0).sort()
  const order: string[] = []
  while (ready.length > 0) {
    const current = ready.shift()!
    order.push(current)
    for (const target of outgoing.get(current) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) insertSorted(ready, target)
    }
  }
  return order.length === legIds.length ? { ok: true, order } : { ok: false, reason: 'cyclic-dependency' }
}

export function affectedSet(
  changedLegId: string,
  legIds: readonly string[],
  edges: readonly Edge[],
  observer?: TraversalObserver,
): TopologyResult {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.fromLegId) ?? []
    if (!targets.includes(edge.toLegId)) insertSorted(targets, edge.toLegId)
    outgoing.set(edge.fromLegId, targets)
  }
  return affectedSetFromOutgoing(changedLegId, legIds, outgoing, observer)
}

export function affectedSetFromOutgoing(
  changedLegId: string,
  legIds: readonly string[],
  outgoing: ReadonlyMap<string, readonly string[]>,
  observer?: TraversalObserver,
): TopologyResult {
  const ids = new Set(legIds)
  if (!ids.has(changedLegId)) return { ok: false, reason: 'unknown-leg' }
  for (const [source, targets] of outgoing) {
    if (!ids.has(source) || targets.some((target) => !ids.has(target))) {
      return { ok: false, reason: 'unknown-leg' }
    }
  }
  const discovered = new Set([changedLegId])
  const queue = [changedLegId]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    observer?.(queue[cursor])
    for (const target of outgoing.get(queue[cursor]) ?? []) {
      if (!discovered.has(target)) {
        discovered.add(target)
        queue.push(target)
      }
    }
  }
  if (containsCycle(changedLegId, discovered, outgoing)) {
    return { ok: false, reason: 'cyclic-dependency' }
  }
  return { ok: true, order: Object.freeze(queue.slice(1)) }
}

function insertSorted(values: string[], value: string): void {
  const index = values.findIndex((candidate) => candidate.localeCompare(value) > 0)
  if (index < 0) values.push(value)
  else values.splice(index, 0, value)
}

function containsCycle(
  start: string,
  reachable: ReadonlySet<string>,
  outgoing: ReadonlyMap<string, readonly string[]>,
): boolean {
  const state = new Map<string, 'active' | 'complete'>()
  const visit = (current: string): boolean => {
    const currentState = state.get(current)
    if (currentState === 'active') return true
    if (currentState === 'complete') return false
    state.set(current, 'active')
    for (const target of outgoing.get(current) ?? []) {
      if (reachable.has(target) && visit(target)) return true
    }
    state.set(current, 'complete')
    return false
  }
  return visit(start)
}
