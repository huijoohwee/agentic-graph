import type { Edge } from './bundle-types'

export type TopologyResult =
  | Readonly<{ ok: true; order: readonly string[] }>
  | Readonly<{ ok: false; reason: 'cyclic-dependency' | 'unknown-leg' }>

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

export function affectedSet(changedLegId: string, legIds: readonly string[], edges: readonly Edge[]): TopologyResult {
  if (!legIds.includes(changedLegId)) return { ok: false, reason: 'unknown-leg' }
  const topology = topologicalOrder(legIds, edges)
  if (!topology.ok) return topology
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.fromLegId) ?? []
    targets.push(edge.toLegId)
    outgoing.set(edge.fromLegId, targets)
  }
  const reachable = new Set<string>()
  const queue = [changedLegId]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const target of outgoing.get(queue[cursor]) ?? []) {
      if (target !== changedLegId && !reachable.has(target)) {
        reachable.add(target)
        queue.push(target)
      }
    }
  }
  return { ok: true, order: topology.order.filter((id) => reachable.has(id)) }
}

function insertSorted(values: string[], value: string): void {
  const index = values.findIndex((candidate) => candidate.localeCompare(value) > 0)
  if (index < 0) values.push(value)
  else values.splice(index, 0, value)
}
